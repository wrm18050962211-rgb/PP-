import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const { Client } = pg;

const REQUIRED_DATABASE_NAME = 'pp_platform_migration_ci';
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const DOMAIN_TABLES = ['merchants', 'merchant_offerings', 'photographer_merchant_links', 'order_items'];
const BASELINE_TABLES = ['users', 'companions', 'activity_pricings', 'orders', 'settlements'];
class SafetyRefusalError extends Error {}

const migrationPath = resolve(
  import.meta.dirname,
  '..',
  '..',
  'database',
  'migrations',
  '20260820_add_composite_order_domain.sql',
);

try {
  await runMigrationAudit();
} catch (error) {
  const rawUrl = process.env.MIGRATION_TEST_DATABASE_URL || '';
  console.error(
    JSON.stringify(
      {
        ok: false,
        skipped: error instanceof SafetyRefusalError,
        reason: sanitizeError(error, rawUrl),
      },
      null,
      2,
    ),
  );
  process.exitCode = 1;
}

async function runMigrationAudit() {
  const connectionConfig = readMigrationTestConnectionConfig(process.env);
  const migrationSql = await readFile(migrationPath, 'utf8');
  const client = new Client({
    ...connectionConfig,
    application_name: 'still-composite-order-migration-audit',
    connectionTimeoutMillis: 5000,
    query_timeout: 60000,
    statement_timeout: 60000,
  });
  const checks = [];
  let connected = false;
  let inTransaction = false;

  try {
    await client.connect();
    connected = true;
    await client.query(`set statement_timeout = '60s'`);
    await client.query(`set lock_timeout = '5s'`);

    const health = await client.query(
      `select current_database() as database_name,
              current_schema() as schema_name,
              current_setting('server_version_num')::integer as server_version_num`,
    );
    const healthRow = health.rows[0] || {};
    assert(healthRow.database_name === REQUIRED_DATABASE_NAME, 'connected database name changed after URL validation');
    assert(healthRow.schema_name === 'public', 'migration audit requires the isolated database public schema');
    assert(
      healthRow.server_version_num >= 160000 && healthRow.server_version_num < 170000,
      'migration audit requires PostgreSQL 16.x',
    );
    checks.push('isolated-local-database', 'postgresql-16');

    await assertBaselineShape(client);
    checks.push('pre-merchant-baseline');

    const beforeOrders = await snapshotOrders(client);
    assert(beforeOrders.rows.length > 0, 'baseline seed must contain at least one historical order');

    await applyMigration(client, migrationSql, 'first');
    const afterFirstMigration = await snapshotOrders(client);
    assert(
      afterFirstMigration.serialized === beforeOrders.serialized,
      'first migration changed historical order amount or status fields',
    );
    checks.push('first-migration', 'first-migration-orders-unchanged');

    await assertLegacyPhotographyItems(client, beforeOrders.rows.length);
    checks.push('legacy-photography-backfill');

    await applyMigration(client, migrationSql, 'second');
    const afterSecondMigration = await snapshotOrders(client);
    assert(
      afterSecondMigration.serialized === beforeOrders.serialized,
      'second migration changed historical order amount or status fields',
    );
    await assertLegacyPhotographyItems(client, beforeOrders.rows.length);
    checks.push('repeat-migration', 'repeat-migration-orders-unchanged');

    const repeatedBackfillCount = await readRolledBackBackfillCount(client, (value) => {
      inTransaction = value;
    });
    assert(repeatedBackfillCount === 0, `repeat backfill inserted ${repeatedBackfillCount} unexpected item(s)`);
    checks.push('repeat-backfill-zero');

    await assertCatalogConstraints(client);
    checks.push(
      'composite-foreign-keys',
      'unique-indexes',
      'payable-check-constraints',
      'deferred-amount-triggers',
    );

    const beforeNegativeTests = await snapshotDomainCounts(client);
    const invalidContext = await readInvalidTestContext(client);
    const setTransactionState = (value) => {
      inTransaction = value;
    };
    await assertInvalidMerchantOfferingRejected(client, invalidContext, setTransactionState);
    await assertInvalidOrderPhotographerRejected(client, invalidContext, setTransactionState);
    await assertInvalidActivityPricingRejected(client, invalidContext, setTransactionState);
    await assertFinalServiceItemDeletionRejected(client, invalidContext, setTransactionState);
    await assertUserPayableFormulaRejected(client, invalidContext, setTransactionState);
    await assertAmountMismatchRejected(client, invalidContext, setTransactionState);
    const afterNegativeTests = await snapshotDomainCounts(client);
    assert(
      afterNegativeTests === beforeNegativeTests,
      'rolled-back negative checks left merchant or order-item rows behind',
    );
    const afterAllChecks = await snapshotOrders(client);
    assert(afterAllChecks.serialized === beforeOrders.serialized, 'negative checks changed historical orders');
    checks.push(
      'invalid-merchant-offering-rejected',
      'invalid-order-photographer-rejected',
      'invalid-activity-pricing-rejected',
      'final-service-item-delete-rejected',
      'user-payable-formula-rejected',
      'amount-mismatch-rejected',
      'negative-tests-rolled-back',
    );

    console.log(
      JSON.stringify(
        {
          ok: true,
          database: REQUIRED_DATABASE_NAME,
          postgresMajor: 16,
          historicalOrderCount: beforeOrders.rows.length,
          checks,
        },
        null,
        2,
      ),
    );
  } finally {
    if (connected && inTransaction) {
      await client.query('rollback').catch(() => {});
    }
    if (connected) {
      await client.end().catch(() => {});
    }
  }
}

function readMigrationTestConnectionConfig(env) {
  if (env.ALLOW_DESTRUCTIVE_MIGRATION_TEST !== '1') {
    throw new SafetyRefusalError('ALLOW_DESTRUCTIVE_MIGRATION_TEST=1 is required; migration audit was not run');
  }

  const rawUrl = String(env.MIGRATION_TEST_DATABASE_URL || '').trim();
  if (!rawUrl) {
    throw new SafetyRefusalError('MIGRATION_TEST_DATABASE_URL is required; DATABASE_URL is intentionally ignored');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SafetyRefusalError('MIGRATION_TEST_DATABASE_URL must be a valid PostgreSQL URL');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new SafetyRefusalError('MIGRATION_TEST_DATABASE_URL must use the postgres or postgresql protocol');
  }
  if (parsed.search || parsed.hash) {
    throw new SafetyRefusalError('MIGRATION_TEST_DATABASE_URL must not include query parameters or a fragment');
  }

  const normalizedHost = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!ALLOWED_HOSTS.has(normalizedHost)) {
    throw new SafetyRefusalError('migration audit only accepts localhost, 127.0.0.1, or ::1');
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (databaseName !== REQUIRED_DATABASE_NAME) {
    throw new SafetyRefusalError(`migration audit only accepts database ${REQUIRED_DATABASE_NAME}`);
  }

  const port = parsed.port ? Number(parsed.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new SafetyRefusalError('MIGRATION_TEST_DATABASE_URL contains an invalid port');
  }

  return {
    host: normalizedHost,
    port,
    database: databaseName,
    user: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
  };
}

async function assertBaselineShape(client) {
  const baselineRelations = await readRelations(client, BASELINE_TABLES);
  const missingBaselineTables = BASELINE_TABLES.filter((name) => !baselineRelations.get(name));
  assert(missingBaselineTables.length === 0, `baseline is missing table(s): ${missingBaselineTables.join(', ')}`);

  const domainRelations = await readRelations(client, DOMAIN_TABLES);
  const existingDomainTables = DOMAIN_TABLES.filter((name) => domainRelations.get(name));
  assert(
    existingDomainTables.length === 0,
    `merchant domain table(s) already exist: ${existingDomainTables.join(', ')}; refusing a non-baseline database`,
  );
}

async function readRelations(client, tableNames) {
  const result = await client.query(
    `select candidate.name,
            to_regclass(format('%I.%I', 'public', candidate.name))::text as relation_name
     from unnest($1::text[]) as candidate(name)
     order by candidate.name`,
    [tableNames],
  );
  return new Map(result.rows.map((row) => [row.name, row.relation_name || null]));
}

async function snapshotOrders(client) {
  const result = await client.query(
    `select id::text as id,
            order_no,
            base_amount_cents,
            extra_amount_cents,
            total_amount_cents,
            platform_fee_cents,
            companion_income_cents,
            status::text as status,
            paid_at::text as paid_at,
            confirmed_at::text as confirmed_at,
            service_started_at::text as service_started_at,
            completed_at::text as completed_at,
            cancelled_at::text as cancelled_at,
            updated_at::text as updated_at
     from orders
     order by id`,
  );
  return { rows: result.rows, serialized: JSON.stringify(result.rows) };
}

async function applyMigration(client, migrationSql, attemptLabel) {
  try {
    await client.query(migrationSql);
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw new Error(`${attemptLabel} composite-order migration failed: ${databaseErrorSummary(error)}`);
  }
}

async function assertLegacyPhotographyItems(client, expectedOrderCount) {
  const result = await client.query(
    `select o.id::text as order_id
     from orders o
     left join order_items oi on oi.order_id = o.id
     group by o.id, o.total_amount_cents
     having count(oi.id) <> 1
        or count(oi.id) filter (
             where oi.service_type = 'photography'
               and oi.provider_type = 'companion'
               and oi.source = 'legacy_backfill'
           ) <> 1
        or max(oi.total_amount_cents) <> o.total_amount_cents
        or max(oi.user_payable_cents) <> o.total_amount_cents
        or max(oi.platform_subsidy_cents) <> 0`,
  );
  assert(result.rows.length === 0, `${result.rows.length} historical order(s) have an invalid legacy photography item`);

  const countResult = await client.query(`select count(*)::integer as item_count from order_items`);
  assert(countResult.rows[0]?.item_count === expectedOrderCount, 'legacy migration did not create exactly one item per order');
}

async function readRolledBackBackfillCount(client, setTransactionState) {
  await client.query('begin');
  setTransactionState(true);
  try {
    const result = await client.query(
      `select backfill_missing_photography_order_items()::integer as inserted_count`,
    );
    const insertedCount = Number(result.rows[0]?.inserted_count || 0);
    await client.query('rollback');
    setTransactionState(false);
    return insertedCount;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    setTransactionState(false);
    throw error;
  }
}

async function assertCatalogConstraints(client) {
  const expectedConstraints = new Map([
    ['fk_order_items_order_companion', { type: 'f', table: 'order_items' }],
    ['fk_order_items_activity_pricing_identity', { type: 'f', table: 'order_items' }],
    ['fk_order_items_merchant_offering_identity', { type: 'f', table: 'order_items' }],
    ['uq_activity_pricing_identity', { type: 'u', table: 'activity_pricings' }],
    ['ck_order_items_platform_subsidy_bounds', { type: 'c', table: 'order_items' }],
    ['ck_order_items_user_payable_formula', { type: 'c', table: 'order_items' }],
    ['ck_order_items_refund_payable_bounds', { type: 'c', table: 'order_items' }],
  ]);
  const constraints = await client.query(
    `select con.conname,
            con.contype,
            cls.relname as table_name
     from pg_constraint con
     join pg_class cls on cls.oid = con.conrelid
     join pg_namespace ns on ns.oid = cls.relnamespace
     where ns.nspname = 'public'
       and con.conname = any($1::text[])`,
    [[...expectedConstraints.keys()]],
  );
  const constraintByName = new Map(constraints.rows.map((row) => [row.conname, row]));
  for (const [name, expected] of expectedConstraints) {
    const actual = constraintByName.get(name);
    assert(actual, `missing constraint ${name}`);
    assert(actual.contype === expected.type && actual.table_name === expected.table, `constraint ${name} has an unexpected shape`);
  }

  const expectedIndexes = [
    'uq_merchant_offering_identity',
    'uq_photographer_primary_merchant',
    'uq_orders_id_companion',
  ];
  const indexes = await client.query(
    `select indexname, indexdef
     from pg_indexes
     where schemaname = 'public'
       and indexname = any($1::text[])`,
    [expectedIndexes],
  );
  const indexByName = new Map(indexes.rows.map((row) => [row.indexname, row.indexdef]));
  for (const indexName of expectedIndexes) {
    assert(indexByName.has(indexName), `missing unique index ${indexName}`);
    assert(/^create unique index/i.test(indexByName.get(indexName)), `index ${indexName} is not unique`);
  }

  const triggers = await client.query(
    `select cls.relname as table_name,
            trg.tgname,
            trg.tgdeferrable,
            trg.tginitdeferred
     from pg_trigger trg
     join pg_class cls on cls.oid = trg.tgrelid
     join pg_namespace ns on ns.oid = cls.relnamespace
     where ns.nspname = 'public'
       and trg.tgname = any($1::text[])`,
    [['trg_order_items_amount_conservation', 'trg_orders_amount_conservation']],
  );
  const triggerByName = new Map(triggers.rows.map((row) => [row.tgname, row]));
  for (const [triggerName, tableName] of [
    ['trg_order_items_amount_conservation', 'order_items'],
    ['trg_orders_amount_conservation', 'orders'],
  ]) {
    const trigger = triggerByName.get(triggerName);
    assert(trigger, `missing trigger ${triggerName}`);
    assert(trigger.table_name === tableName, `trigger ${triggerName} is attached to the wrong table`);
    assert(trigger.tgdeferrable === true && trigger.tginitdeferred === true, `trigger ${triggerName} is not initially deferred`);
  }
}

async function readInvalidTestContext(client) {
  const result = await client.query(
    `select o.id::text as order_id,
            o.companion_id::text as companion_id,
            oi.id::text as item_id,
            oi.activity_pricing_id::text as activity_pricing_id,
            o.start_at,
            o.end_at,
            oi.item_no,
            alternative.companion_id::text as alternative_companion_id,
            alternative.activity_pricing_id::text as alternative_activity_pricing_id
     from orders o
     join order_items oi
       on oi.order_id = o.id
      and oi.service_type = 'photography'
     join lateral (
       select ap.companion_id,
              ap.id as activity_pricing_id
       from activity_pricings ap
       where ap.companion_id <> o.companion_id
       order by ap.id
       limit 1
     ) alternative on true
     order by o.id
     limit 1`,
  );
  assert(result.rows.length === 1, 'negative checks require one order and another photographer pricing row');
  return { ...result.rows[0], nextItemNo: Number(result.rows[0].item_no) + 1 };
}

async function assertInvalidMerchantOfferingRejected(client, context, setTransactionState) {
  const merchantA = randomUUID();
  const merchantB = randomUUID();
  const offeringId = randomUUID();
  await expectDatabaseRejection(
    client,
    'merchant offering/provider identity mismatch',
    { code: '23503', constraint: 'fk_order_items_merchant_offering_identity' },
    async () => {
      await client.query(
        `insert into merchants (id, name, city, contact_phone, service_enabled)
         values ($1, 'Migration Audit Merchant A', 'Test', '10000000001', false),
                ($2, 'Migration Audit Merchant B', 'Test', '10000000002', false)`,
        [merchantA, merchantB],
      );
      await client.query(
        `insert into merchant_offerings (
           id, merchant_id, offering_code, version, service_type, name,
           duration_minutes, fixed_price_cents, enabled
         ) values ($1, $2, 'migration-audit', 1, 'makeup', 'Migration Audit Makeup', 60, 10000, false)`,
        [offeringId, merchantA],
      );
      await client.query(
        `insert into order_items (
           order_id, item_no, service_type, provider_type, provider_merchant_id,
           merchant_offering_id, offering_version, service_name_snapshot,
           duration_minutes, start_at, end_at
         ) values ($1, $2, 'makeup', 'merchant', $3, $4, 1, 'Invalid merchant identity', 60, $5, $6)`,
        [context.order_id, context.nextItemNo, merchantB, offeringId, context.start_at, context.end_at],
      );
    },
    setTransactionState,
  );
}

async function assertInvalidOrderPhotographerRejected(client, context, setTransactionState) {
  await expectDatabaseRejection(
    client,
    'order/photographer identity mismatch',
    { code: '23503', constraint: 'fk_order_items_order_companion' },
    () =>
      insertPhotographyItem(client, context, {
        providerCompanionId: context.alternative_companion_id,
        activityPricingId: context.alternative_activity_pricing_id,
        name: 'Invalid order photographer identity',
      }),
    setTransactionState,
  );
}

async function assertInvalidActivityPricingRejected(client, context, setTransactionState) {
  await expectDatabaseRejection(
    client,
    'photographer/activity pricing identity mismatch',
    { code: '23503', constraint: 'fk_order_items_activity_pricing_identity' },
    () =>
      insertPhotographyItem(client, context, {
        providerCompanionId: context.companion_id,
        activityPricingId: context.alternative_activity_pricing_id,
        name: 'Invalid activity pricing identity',
      }),
    setTransactionState,
  );
}

async function insertPhotographyItem(client, context, { providerCompanionId, activityPricingId, name }) {
  await client.query(
    `insert into order_items (
       order_id, item_no, service_type, provider_type, provider_companion_id,
       activity_pricing_id, service_name_snapshot, duration_minutes, start_at, end_at
     ) values ($1, $2, 'photography', 'companion', $3, $4, $5, 60, $6, $7)`,
    [
      context.order_id,
      context.nextItemNo,
      providerCompanionId,
      activityPricingId,
      name,
      context.start_at,
      context.end_at,
    ],
  );
}

async function assertFinalServiceItemDeletionRejected(client, context, setTransactionState) {
  await expectDatabaseRejection(
    client,
    'final service item deletion',
    { code: '23514', messageIncludes: 'cannot remove its final service item' },
    () => client.query(`delete from order_items where order_id = $1`, [context.order_id]),
    setTransactionState,
  );
}

async function assertAmountMismatchRejected(client, context, setTransactionState) {
  await expectDatabaseRejection(
    client,
    'aggregate amount mismatch',
    { code: '23514', messageIncludes: 'does not match order' },
    () =>
      client.query(
        `update order_items
         set base_amount_cents = base_amount_cents + 1,
             total_amount_cents = total_amount_cents + 1,
             user_payable_cents = user_payable_cents + 1,
             updated_at = now()
         where id = $1`,
        [context.item_id],
      ),
    setTransactionState,
  );
}

async function assertUserPayableFormulaRejected(client, context, setTransactionState) {
  await expectDatabaseRejection(
    client,
    'user payable formula mismatch',
    { code: '23514', constraint: 'ck_order_items_user_payable_formula' },
    () =>
      client.query(
        `update order_items
         set user_payable_cents = user_payable_cents + 1,
             updated_at = now()
         where id = $1`,
        [context.item_id],
      ),
    setTransactionState,
  );
}

async function expectDatabaseRejection(client, label, expected, operation, setTransactionState) {
  let rejection = null;
  await client.query('begin');
  setTransactionState(true);
  try {
    await operation();
    await client.query('set constraints all immediate');
  } catch (error) {
    rejection = error;
  } finally {
    await client.query('rollback').catch(() => {});
    setTransactionState(false);
  }

  assert(rejection, `${label} was unexpectedly accepted`);
  assert(rejection.code === expected.code, `${label} returned SQLSTATE ${rejection.code || 'unknown'}`);
  if (expected.constraint) {
    assert(rejection.constraint === expected.constraint, `${label} was rejected by ${rejection.constraint || 'an unknown constraint'}`);
  }
  if (expected.messageIncludes) {
    assert(String(rejection.message || '').includes(expected.messageIncludes), `${label} returned an unexpected error message`);
  }
}

async function snapshotDomainCounts(client) {
  const result = await client.query(
    `select (select count(*)::integer from merchants) as merchants,
            (select count(*)::integer from merchant_offerings) as merchant_offerings,
            (select count(*)::integer from photographer_merchant_links) as photographer_merchant_links,
            (select count(*)::integer from order_items) as order_items`,
  );
  return JSON.stringify(result.rows[0] || {});
}

function databaseErrorSummary(error) {
  const parts = [error?.code, error?.constraint, error?.message].filter(Boolean);
  return parts.join(' | ') || 'unknown PostgreSQL error';
}

function sanitizeError(error, rawUrl) {
  let message = String(error?.message || error || 'unknown migration audit failure');
  if (rawUrl) message = message.replaceAll(rawUrl, '[REDACTED_MIGRATION_TEST_DATABASE_URL]');
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]');
}

function assert(condition, message) {
  if (!condition) throw new Error(`Composite-order migration audit failed: ${message}`);
}
