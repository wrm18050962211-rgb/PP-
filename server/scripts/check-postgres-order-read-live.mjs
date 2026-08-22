import { randomUUID } from 'node:crypto';
import pg from 'pg';

import { createPostgresStore } from '../store/postgresStore.mjs';
import { hashSessionToken } from '../store/sessionTokenHash.mjs';

const { Client } = pg;

const REQUIRED_DATABASE_NAME = 'pp_platform_ci';
const ALLOWED_HOSTS = new Set(['localhost', '127.0.0.1', '::1']);
const ORDER_COUNT = 240;
const PAGE_LIMIT = 23;
const FILTERED_STATUS = 'confirmed';
const PRIVATE_STATUS_MARKER = `order-read-private-${randomUUID()}`;
const REQUIRED_TABLES = ['users', 'companions', 'user_sessions', 'orders', 'order_extras', 'order_status_logs'];
const FORBIDDEN_PUBLIC_KEYS = new Set([
  'phone',
  'platformFeeCents',
  'companionIncomeCents',
  'providerIncomeCents',
  'settlementStatus',
  'pricingSnapshot',
  'operatorId',
  'operatorType',
  'reason',
  'rawCallback',
]);

class SafetyRefusalError extends Error {}

try {
  await runOrderReadAudit();
} catch (error) {
  const rawUrl = String(process.env.ORDER_READ_TEST_DATABASE_URL || '').trim();
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

async function runOrderReadAudit() {
  const connectionConfig = readOrderReadConnectionConfig(process.env);
  const client = new Client({
    ...connectionConfig,
    application_name: 'still-order-read-live-audit',
    connectionTimeoutMillis: 5000,
    query_timeout: 30000,
    statement_timeout: 30000,
    idle_in_transaction_session_timeout: 30000,
  });
  const fixture = buildFixture();
  const orderReadQueryTrace = [];
  const checks = [];
  let connected = false;
  let inTransaction = false;
  let auditError = null;
  let cleanupError = null;

  try {
    await client.connect();
    connected = true;

    const health = await client.query(
      `select current_database() as database_name,
              current_schema() as schema_name,
              current_setting('server_version_num')::integer as server_version_num`,
    );
    const healthRow = health.rows[0] || {};
    assert(healthRow.database_name === REQUIRED_DATABASE_NAME, 'connected database name changed after URL validation');
    assert(healthRow.schema_name === 'public', 'order-read audit requires the public schema');
    assert(
      healthRow.server_version_num >= 160000 && healthRow.server_version_num < 170000,
      'order-read audit requires PostgreSQL 16.x',
    );
    await assertRequiredTables(client);
    checks.push('isolated-local-database', 'postgresql-16', 'required-schema');

    await client.query('begin');
    inTransaction = true;
    await client.query(`set local statement_timeout = '30s'`);
    await client.query(`set local lock_timeout = '5s'`);
    await insertFixture(client, fixture);
    checks.push('parameterized-transaction-fixture', '240-interleaved-orders');

    const store = createPostgresStore({
      databaseUrl: 'postgresql://order-read-live-audit/pp_platform_ci',
      poolFactory: () => transactionPool(client, orderReadQueryTrace),
      featureFlags: { domainEnabled: false },
    });
    assert(store.capabilities.orderReads === true, 'PostgreSQL store must advertise authoritative order reads');

    const sessions = await recoverSessions(store, fixture);
    assert(sessions.userAFirst.id !== sessions.userASecond.id, 'user A sessions must remain independently persisted');
    const actors = [
      actorFromSession(sessions.userAFirst),
      actorFromSession(sessions.userB),
      actorFromSession(sessions.companionA),
      actorFromSession(sessions.companionB),
    ];
    assert(new Set(actors.map(actorKey)).size === 4, 'four independently scoped actors must be recovered');
    checks.push('real-session-recovery', 'two-user-a-sessions', 'four-actor-principals');

    for (const actor of actors) {
      await assertActorPagination(client, store, actor, null);
      await assertActorPagination(client, store, actor, FILTERED_STATUS);
    }
    assertMicrosecondCursorParameters(orderReadQueryTrace);
    checks.push(
      'stable-keyset-pagination',
      'microsecond-cursor-preservation',
      'consumer-owner-scope',
      'companion-owner-scope',
      'status-filter-pagination',
    );

    await assertSessionConsistency(store, sessions);
    await assertCursorAndInputBinding(store, actors);
    checks.push('cross-device-consistency', 'strict-input-validation', 'cursor-owner-and-filter-binding');

    await assertDetails(store, sessions, fixture);
    checks.push('owned-detail', 'non-enumerating-detail', 'extras-and-status-logs', 'sensitive-field-redaction');
  } catch (error) {
    auditError = error;
  } finally {
    if (connected && inTransaction) {
      try {
        await client.query('rollback');
        inTransaction = false;
        await assertFixtureAbsent(client, fixture);
        checks.push('transaction-rolled-back', 'fixture-absence-verified');
      } catch (error) {
        cleanupError = error;
      }
    }
    if (connected) {
      try {
        await client.end();
      } catch (error) {
        cleanupError ||= error;
      }
    }
  }

  if (auditError) {
    if (cleanupError) {
      auditError.message = `${auditError.message}; cleanup failure: ${databaseErrorSummary(cleanupError)}`;
    }
    throw auditError;
  }
  if (cleanupError) throw cleanupError;

  console.log(
    JSON.stringify(
      {
        ok: true,
        database: REQUIRED_DATABASE_NAME,
        postgresMajor: 16,
        orderCount: ORDER_COUNT,
        ordersPerActor: ORDER_COUNT / 2,
        actorCount: 4,
        checks,
      },
      null,
      2,
    ),
  );
}

function readOrderReadConnectionConfig(env) {
  if (env.ALLOW_ORDER_READ_LIVE_TEST !== '1') {
    throw new SafetyRefusalError('ALLOW_ORDER_READ_LIVE_TEST=1 is required; order-read audit was not run');
  }

  const rawUrl = String(env.ORDER_READ_TEST_DATABASE_URL || '').trim();
  if (!rawUrl) {
    throw new SafetyRefusalError('ORDER_READ_TEST_DATABASE_URL is required; the application database URL is intentionally ignored');
  }

  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new SafetyRefusalError('ORDER_READ_TEST_DATABASE_URL must be a valid PostgreSQL URL');
  }

  if (!['postgres:', 'postgresql:'].includes(parsed.protocol)) {
    throw new SafetyRefusalError('ORDER_READ_TEST_DATABASE_URL must use the postgres or postgresql protocol');
  }
  if (parsed.search || parsed.hash) {
    throw new SafetyRefusalError('ORDER_READ_TEST_DATABASE_URL must not include query parameters or a fragment');
  }

  const normalizedHost = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!ALLOWED_HOSTS.has(normalizedHost)) {
    throw new SafetyRefusalError('order-read audit only accepts localhost, 127.0.0.1, or ::1');
  }

  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ''));
  if (databaseName !== REQUIRED_DATABASE_NAME) {
    throw new SafetyRefusalError(`order-read audit only accepts database ${REQUIRED_DATABASE_NAME}`);
  }

  const port = parsed.port ? Number(parsed.port) : 5432;
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new SafetyRefusalError('ORDER_READ_TEST_DATABASE_URL contains an invalid port');
  }

  return {
    host: normalizedHost,
    port,
    database: databaseName,
    user: parsed.username ? decodeURIComponent(parsed.username) : undefined,
    password: parsed.password ? decodeURIComponent(parsed.password) : undefined,
  };
}

async function assertRequiredTables(client) {
  const result = await client.query(
    `select candidate.name,
            to_regclass(format('%I.%I', 'public', candidate.name))::text as relation_name
     from unnest($1::text[]) as candidate(name)
     order by candidate.name`,
    [REQUIRED_TABLES],
  );
  const missing = result.rows.filter((row) => !row.relation_name).map((row) => row.name);
  assert(missing.length === 0, `required table(s) missing: ${missing.join(', ')}`);
}

function buildFixture() {
  const users = {
    userA: fixtureUser('Consumer A', false),
    userB: fixtureUser('Consumer B', false),
    companionOwnerA: fixtureUser('Photographer A Owner', true),
    companionOwnerB: fixtureUser('Photographer B Owner', true),
  };
  const companions = {
    companionA: fixtureCompanion(users.companionOwnerA.id, 'Photographer A'),
    companionB: fixtureCompanion(users.companionOwnerB.id, 'Photographer B'),
  };
  const sessions = {
    userAFirst: fixtureSession(users.userA.id, null, 'consumer'),
    userASecond: fixtureSession(users.userA.id, null, 'consumer'),
    userB: fixtureSession(users.userB.id, null, 'consumer'),
    companionA: fixtureSession(users.companionOwnerA.id, companions.companionA.id, 'companion'),
    companionB: fixtureSession(users.companionOwnerB.id, companions.companionB.id, 'companion'),
  };
  const auditLabel = randomUUID().replaceAll('-', '').slice(0, 12);
  const createdBase = Date.parse('2030-01-01T00:00:00.000Z');
  const microsecondsWithinMillisecond = ['000900', '000100', '000800', '000200'];
  const serviceBase = Date.parse('2030-02-01T02:00:00.000Z');
  const statuses = ['confirmed', 'paid_pending_confirm', 'completed', 'pending_payment'];
  const orders = Array.from({ length: ORDER_COUNT }, (_, index) => {
    const user = index % 2 === 0 ? users.userA : users.userB;
    const companion = Math.floor(index / 2) % 2 === 0 ? companions.companionA : companions.companionB;
    const createdAt = microsecondTimestamp(
      createdBase + Math.floor(index / 4) * 1000,
      microsecondsWithinMillisecond[index % microsecondsWithinMillisecond.length],
    );
    const startAt = new Date(serviceBase + index * 3_600_000).toISOString();
    const endAt = new Date(serviceBase + index * 3_600_000 + 7_200_000).toISOString();
    const baseAmountCents = 30000 + (index % 10) * 100;
    const extraAmountCents = index % 3 === 0 ? 3000 : 0;
    const totalAmountCents = baseAmountCents + extraAmountCents;
    const platformFeeCents = Math.floor(totalAmountCents * 0.08);
    return {
      id: randomUUID(),
      orderNo: `ORL-${auditLabel}-${String(index).padStart(3, '0')}`,
      userId: user.id,
      companionId: companion.id,
      city: '上海',
      placeName: `Live Audit Place ${index % 7}`,
      placeAddress: `Live audit address ${index}`,
      placeLat: 31.2 + (index % 10) / 1000,
      placeLng: 121.4 + (index % 10) / 1000,
      activityName: `Live audit session ${index}`,
      durationMinutes: 120,
      startAt,
      endAt,
      baseAmountCents,
      extraAmountCents,
      totalAmountCents,
      platformFeeCents,
      companionIncomeCents: totalAmountCents - platformFeeCents,
      status: statuses[Math.floor(index / 4) % statuses.length],
      userNote: index === 0 ? 'Consumer-visible request' : null,
      companionNote: index === 0 ? 'Photographer-private preparation note' : null,
      createdAt,
      updatedAt: createdAt,
    };
  });
  const detailOrder = orders.find(
    (order) => order.userId === users.userA.id && order.companionId === companions.companionA.id,
  );
  assert(detailOrder, 'detail fixture order must exist');
  const extras = [
    {
      id: randomUUID(),
      orderId: detailOrder.id,
      name: 'Three retouched photos',
      quantity: 3,
      unitPriceCents: 1000,
      amountCents: 3000,
      createdAt: detailOrder.createdAt,
    },
  ];
  const statusLogs = [
    {
      id: randomUUID(),
      orderId: detailOrder.id,
      fromStatus: null,
      toStatus: 'pending_payment',
      operatorType: 'user',
      operatorId: users.userA.id,
      reason: PRIVATE_STATUS_MARKER,
      createdAt: detailOrder.createdAt,
    },
    {
      id: randomUUID(),
      orderId: detailOrder.id,
      fromStatus: 'pending_payment',
      toStatus: detailOrder.status,
      operatorType: 'system',
      operatorId: null,
      reason: `${PRIVATE_STATUS_MARKER}-second`,
      createdAt: new Date(Date.parse(detailOrder.createdAt) + 500).toISOString(),
    },
  ];
  return { users, companions, sessions, orders, detailOrder, extras, statusLogs };
}

function fixtureUser(nickname, isCompanion) {
  return {
    id: randomUUID(),
    phone: `audit-${randomUUID().replaceAll('-', '').slice(0, 24)}`,
    nickname,
    avatarUrl: 'https://audit.invalid/avatar.jpg',
    city: '上海',
    isCompanion,
    createdAt: '2030-01-01T00:00:00.000Z',
  };
}

function microsecondTimestamp(epochMilliseconds, fraction) {
  const millisecondIso = new Date(epochMilliseconds).toISOString();
  assert(millisecondIso.endsWith('.000Z'), 'microsecond fixture base must align to a whole second');
  assert(/^\d{6}$/.test(fraction), 'microsecond fixture fraction must contain six digits');
  return `${millisecondIso.slice(0, -5)}.${fraction}Z`;
}

function fixtureCompanion(userId, displayName) {
  return {
    id: randomUUID(),
    userId,
    displayName,
    baseCity: '上海',
    realPhotoUrl: 'https://audit.invalid/photographer.jpg',
    createdAt: '2030-01-01T00:00:00.000Z',
  };
}

function fixtureSession(userId, companionId, role) {
  const token = `order-read-live-${randomUUID()}-${randomUUID()}`;
  return {
    id: randomUUID(),
    token,
    tokenHash: hashSessionToken(token),
    userId,
    companionId,
    role,
    deviceId: randomUUID(),
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    createdAt: new Date().toISOString(),
  };
}

async function insertFixture(client, fixture) {
  const userRows = Object.values(fixture.users);
  await client.query(
    `insert into users (
       id, phone, nickname, avatar_url, city, status, is_companion, created_at, updated_at
     )
     select x.id::uuid,
            x.phone,
            x.nickname,
            x.avatar_url,
            x.city,
            'active'::user_status,
            x.is_companion,
            x.created_at::timestamptz,
            x.created_at::timestamptz
     from jsonb_to_recordset($1::jsonb) as x(
       id text, phone text, nickname text, avatar_url text, city text,
       is_companion boolean, created_at text
     )`,
    [JSON.stringify(userRows.map(toDatabaseKeys))],
  );

  const companionRows = Object.values(fixture.companions);
  await client.query(
    `insert into companions (
       id, user_id, display_name, base_city, real_photo_url,
       status, service_enabled, created_at, updated_at
     )
     select x.id::uuid,
            x.user_id::uuid,
            x.display_name,
            x.base_city,
            x.real_photo_url,
            'approved'::companion_status,
            true,
            x.created_at::timestamptz,
            x.created_at::timestamptz
     from jsonb_to_recordset($1::jsonb) as x(
       id text, user_id text, display_name text, base_city text,
       real_photo_url text, created_at text
     )`,
    [JSON.stringify(companionRows.map(toDatabaseKeys))],
  );

  const sessionRows = Object.values(fixture.sessions).map(({ token: _token, ...session }) => session);
  await client.query(
    `insert into user_sessions (
       id, token_hash, session_scope, user_id, companion_id, role, provider,
       device_id, metadata, login_at, last_seen_at, expires_at, created_at, updated_at
     )
     select x.id::uuid,
            x.token_hash,
            'user',
            x.user_id::uuid,
            x.companion_id::uuid,
            x.role,
            'live-audit',
            x.device_id,
            '{}'::jsonb,
            x.created_at::timestamptz,
            x.created_at::timestamptz,
            x.expires_at::timestamptz,
            x.created_at::timestamptz,
            x.created_at::timestamptz
     from jsonb_to_recordset($1::jsonb) as x(
       id text, token_hash text, user_id text, companion_id text,
       role text, device_id text, expires_at text, created_at text
     )`,
    [JSON.stringify(sessionRows.map(toDatabaseKeys))],
  );

  await client.query(
    `insert into orders (
       id, order_no, user_id, companion_id, city, place_name, place_address,
       place_lat, place_lng, activity_name, duration_minutes, start_at, end_at,
       base_amount_cents, extra_amount_cents, total_amount_cents,
       platform_fee_cents, companion_income_cents, status, user_note, companion_note,
       created_at, updated_at
     )
     select x.id::uuid,
            x.order_no,
            x.user_id::uuid,
            x.companion_id::uuid,
            x.city,
            x.place_name,
            x.place_address,
            x.place_lat,
            x.place_lng,
            x.activity_name,
            x.duration_minutes,
            x.start_at::timestamptz,
            x.end_at::timestamptz,
            x.base_amount_cents,
            x.extra_amount_cents,
            x.total_amount_cents,
            x.platform_fee_cents,
            x.companion_income_cents,
            x.status::order_status,
            x.user_note,
            x.companion_note,
            x.created_at::timestamptz,
            x.updated_at::timestamptz
     from jsonb_to_recordset($1::jsonb) as x(
       id text, order_no text, user_id text, companion_id text, city text,
       place_name text, place_address text, place_lat numeric, place_lng numeric,
       activity_name text, duration_minutes integer, start_at text, end_at text,
       base_amount_cents integer, extra_amount_cents integer, total_amount_cents integer,
       platform_fee_cents integer, companion_income_cents integer, status text,
       user_note text, companion_note text, created_at text, updated_at text
     )`,
    [JSON.stringify(fixture.orders.map(toDatabaseKeys))],
  );

  await client.query(
    `insert into order_extras (
       id, order_id, name, quantity, unit_price_cents, amount_cents, created_at
     )
     select x.id::uuid,
            x.order_id::uuid,
            x.name,
            x.quantity,
            x.unit_price_cents,
            x.amount_cents,
            x.created_at::timestamptz
     from jsonb_to_recordset($1::jsonb) as x(
       id text, order_id text, name text, quantity integer,
       unit_price_cents integer, amount_cents integer, created_at text
     )`,
    [JSON.stringify(fixture.extras.map(toDatabaseKeys))],
  );

  await client.query(
    `insert into order_status_logs (
       id, order_id, from_status, to_status, operator_type, operator_id, reason, created_at
     )
     select x.id::uuid,
            x.order_id::uuid,
            x.from_status::order_status,
            x.to_status::order_status,
            x.operator_type,
            x.operator_id::uuid,
            x.reason,
            x.created_at::timestamptz
     from jsonb_to_recordset($1::jsonb) as x(
       id text, order_id text, from_status text, to_status text,
       operator_type text, operator_id text, reason text, created_at text
     )`,
    [JSON.stringify(fixture.statusLogs.map(toDatabaseKeys))],
  );
}

function toDatabaseKeys(value) {
  return Object.fromEntries(
    Object.entries(value).map(([key, item]) => [key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`), item]),
  );
}

function transactionPool(client, orderReadQueryTrace) {
  return {
    async connect() {
      return {
        query(sql, params = []) {
          if (/from\s+orders\s+o/i.test(String(sql)) && /\(o\.created_at,\s*o\.id\)\s*</i.test(String(sql))) {
            orderReadQueryTrace.push({ cursorTimestamp: params[2] ?? null });
          }
          return client.query(sql, params);
        },
        release() {},
      };
    },
  };
}

function assertMicrosecondCursorParameters(orderReadQueryTrace) {
  const cursorTimestamps = orderReadQueryTrace
    .map((entry) => entry.cursorTimestamp)
    .filter((value) => value !== null && value !== undefined)
    .map(String);
  assert(cursorTimestamps.length > 0, 'pagination must send at least one continuation timestamp to PostgreSQL');
  const parsedFractions = cursorTimestamps.map((value) => {
    const match = value.match(/\.(\d{6})(?:Z|\+00(?::?00)?)$/);
    assert(match, `cursor timestamp must preserve six fractional digits: ${value}`);
    return match[1];
  });
  assert(
    parsedFractions.some((fraction) => fraction.slice(3) !== '000'),
    'cursor timestamp must preserve PostgreSQL microseconds beyond JavaScript millisecond precision',
  );
}

async function recoverSessions(store, fixture) {
  const entries = [];
  for (const [name, expected] of Object.entries(fixture.sessions)) {
    const recovered = await store.sessionWrites.findByToken(expected.token);
    assert(recovered, `${name} session must be recovered from PostgreSQL`);
    assert(recovered.id === expected.id, `${name} must recover the matching session id`);
    assert(recovered.user?.id === expected.userId, `${name} must recover its stored user principal`);
    assert(recovered.role === expected.role, `${name} must recover its stored role`);
    if (expected.role === 'companion') {
      assert(recovered.companionId === expected.companionId, `${name} must recover its approved companion principal`);
    }
    entries.push([name, recovered]);
  }
  return Object.fromEntries(entries);
}

function actorFromSession(session) {
  if (session.role === 'companion') {
    return { role: 'companion', companionId: session.companionId };
  }
  return { role: 'consumer', userId: session.user.id };
}

function actorKey(actor) {
  return `${actor.role}:${actor.role === 'consumer' ? actor.userId : actor.companionId}`;
}

async function assertActorPagination(client, store, actor, status) {
  const actual = await collectPages(store, actor, status);
  const expected = await canonicalOrderIds(client, actor, status);
  const expectedCount = status === null ? ORDER_COUNT / 2 : ORDER_COUNT / 8;
  assert(expected.length === expectedCount, `${actorKey(actor)} ${status || 'all'} canonical count must be ${expectedCount}`);
  assert(actual.length === expected.length, `${actorKey(actor)} ${status || 'all'} page count must match canonical SQL`);
  assert(actual.every((id, index) => id === expected[index]), `${actorKey(actor)} ${status || 'all'} page order must be stable`);
}

async function collectPages(store, actor, status) {
  const ids = [];
  const seen = new Set();
  let cursor = null;
  let pageCount = 0;
  do {
    const page = await store.orderReads.listOrders({
      ...actor,
      status: status || undefined,
      limit: PAGE_LIMIT,
      cursor: cursor || undefined,
    });
    assert(page.items.length <= PAGE_LIMIT, 'order page must respect the requested limit');
    assert(page.hasMore === Boolean(page.nextCursor), 'hasMore and nextCursor must stay aligned');
    for (const order of page.items) {
      assert(!seen.has(order.id), `pagination returned duplicate order ${order.id}`);
      if (status) assert(order.status === status, 'status-filtered page returned a different status');
      seen.add(order.id);
      ids.push(order.id);
      assertNoSensitiveFields(order, 'order summary');
    }
    cursor = page.nextCursor;
    pageCount += 1;
    assert(pageCount <= 20, 'pagination exceeded the bounded page count');
  } while (cursor);
  return ids;
}

async function canonicalOrderIds(client, actor, status) {
  const ownerColumn = actor.role === 'consumer' ? 'user_id' : 'companion_id';
  const ownerId = actor.role === 'consumer' ? actor.userId : actor.companionId;
  const result = await client.query(
    `select id::text as id
     from orders
     where ${ownerColumn} = $1::uuid
       and ($2::order_status is null or status = $2::order_status)
     order by created_at desc, id desc`,
    [ownerId, status],
  );
  return result.rows.map((row) => row.id);
}

async function assertSessionConsistency(store, sessions) {
  const firstActor = actorFromSession(sessions.userAFirst);
  const secondActor = actorFromSession(sessions.userASecond);
  const firstPage = await store.orderReads.listOrders({ ...firstActor, limit: 17 });
  const secondPage = await store.orderReads.listOrders({ ...secondActor, limit: 17 });
  assert(
    JSON.stringify(firstPage.items.map((order) => order.id)) === JSON.stringify(secondPage.items.map((order) => order.id)),
    'two sessions for user A must see the same first page',
  );
  assert(firstPage.nextCursor === secondPage.nextCursor, 'two sessions for user A must receive the same continuation cursor');
}

async function assertCursorAndInputBinding(store, actors) {
  const [userA, userB, companionA, companionB] = actors;
  const userPage = await store.orderReads.listOrders({ ...userA, limit: 7 });
  const companionPage = await store.orderReads.listOrders({ ...companionA, limit: 7 });
  assert(userPage.nextCursor && companionPage.nextCursor, 'binding probes require continuation cursors');

  await assertRejects(
    () => store.orderReads.listOrders({ ...userB, limit: 7, cursor: userPage.nextCursor }),
    'ORDER_CURSOR_INVALID',
    400,
    'consumer cursor cannot cross owner scope',
  );
  await assertRejects(
    () => store.orderReads.listOrders({ ...companionB, limit: 7, cursor: companionPage.nextCursor }),
    'ORDER_CURSOR_INVALID',
    400,
    'companion cursor cannot cross owner scope',
  );
  await assertRejects(
    () => store.orderReads.listOrders({ ...companionA, limit: 7, cursor: userPage.nextCursor }),
    'ORDER_CURSOR_INVALID',
    400,
    'cursor cannot cross public role',
  );
  await assertRejects(
    () => store.orderReads.listOrders({ ...userA, status: FILTERED_STATUS, limit: 7, cursor: userPage.nextCursor }),
    'ORDER_CURSOR_INVALID',
    400,
    'cursor cannot cross status filter',
  );
  await assertRejects(
    () => store.orderReads.listOrders({ role: 'admin', userId: userA.userId }),
    'ORDER_ROLE_INVALID',
    400,
    'unsupported public role is rejected',
  );
  await assertRejects(
    () => store.orderReads.listOrders({ ...userA, status: 'unknown' }),
    'ORDER_STATUS_INVALID',
    400,
    'unknown status is rejected',
  );
  for (const limit of [0, 51, '2e1']) {
    await assertRejects(
      () => store.orderReads.listOrders({ ...userA, limit }),
      'ORDER_LIMIT_INVALID',
      400,
      `invalid limit ${limit} is rejected`,
    );
  }
  for (const cursor of ['not_base64', 'a'.repeat(513)]) {
    await assertRejects(
      () => store.orderReads.listOrders({ ...userA, cursor }),
      'ORDER_CURSOR_INVALID',
      400,
      'malformed cursor is rejected',
    );
  }
}

async function assertDetails(store, sessions, fixture) {
  const userAActor = actorFromSession(sessions.userAFirst);
  const userASecondActor = actorFromSession(sessions.userASecond);
  const userBActor = actorFromSession(sessions.userB);
  const companionAActor = actorFromSession(sessions.companionA);
  const companionBActor = actorFromSession(sessions.companionB);
  const orderId = fixture.detailOrder.id;

  const consumerDetail = await store.orderReads.getOrder({ ...userAActor, orderId });
  const secondSessionDetail = await store.orderReads.getOrder({ ...userASecondActor, orderId });
  const companionDetail = await store.orderReads.getOrder({ ...companionAActor, orderId });
  assert(JSON.stringify(consumerDetail) === JSON.stringify(secondSessionDetail), 'two user A sessions must receive identical detail');
  assert(consumerDetail.addOns.length === 1, 'owned detail must include the snapshotted extra');
  assert(consumerDetail.statusLogs.length === 2, 'owned detail must include public status history');
  assert(consumerDetail.locationSnapshot.address === fixture.detailOrder.placeAddress, 'detail must expose the location snapshot');
  assert(consumerDetail.locationSnapshot.lat === fixture.detailOrder.placeLat, 'detail must expose numeric latitude');
  assert(consumerDetail.locationSnapshot.lng === fixture.detailOrder.placeLng, 'detail must expose numeric longitude');
  assert(!('companionNote' in consumerDetail), 'consumer detail must omit the photographer-private note');
  assert(companionDetail.companionNote === fixture.detailOrder.companionNote, 'photographer detail may expose its own note');
  assert(companionDetail.creatorId === fixture.users.userA.id, 'photographer detail must identify its order creator');
  for (const detail of [consumerDetail, secondSessionDetail, companionDetail]) {
    assertNoSensitiveFields(detail, 'order detail');
    assert(!JSON.stringify(detail).includes(PRIVATE_STATUS_MARKER), 'raw status reason must never enter a public detail');
    for (const user of Object.values(fixture.users)) {
      assert(!JSON.stringify(detail).includes(user.phone), 'stored user phone must never enter a public detail');
    }
    assert(
      detail.statusLogs.every((log) => log.message && !String(log.message).includes(PRIVATE_STATUS_MARKER)),
      'status log messages must be derived public text',
    );
  }

  await assertRejects(
    () => store.orderReads.getOrder({ ...userBActor, orderId }),
    'ORDER_NOT_FOUND',
    404,
    'another consumer cannot enumerate order detail',
  );
  await assertRejects(
    () => store.orderReads.getOrder({ ...companionBActor, orderId }),
    'ORDER_NOT_FOUND',
    404,
    'another photographer cannot enumerate order detail',
  );
  await assertRejects(
    () => store.orderReads.getOrder({ ...userAActor, orderId: randomUUID() }),
    'ORDER_NOT_FOUND',
    404,
    'missing detail shares the cross-owner response',
  );
}

function assertNoSensitiveFields(value, label) {
  visit(value);

  function visit(current) {
    if (Array.isArray(current)) {
      for (const item of current) visit(item);
      return;
    }
    if (!current || typeof current !== 'object') return;
    for (const [key, item] of Object.entries(current)) {
      assert(!FORBIDDEN_PUBLIC_KEYS.has(key), `${label} exposed forbidden key ${key}`);
      visit(item);
    }
  }
}

async function assertRejects(action, expectedCode, expectedStatus, message) {
  try {
    await action();
  } catch (error) {
    assert(error?.code === expectedCode, `${message}: expected ${expectedCode}, received ${error?.code || 'no code'}`);
    assert(error?.status === expectedStatus, `${message}: expected HTTP ${expectedStatus}, received ${error?.status || 'no status'}`);
    return;
  }
  throw new Error(`PostgreSQL order-read live audit failed: ${message}: expected rejection`);
}

async function assertFixtureAbsent(client, fixture) {
  const result = await client.query(
    `select
       (select count(*) from users where id = any($1::uuid[]))::integer as users,
       (select count(*) from companions where id = any($2::uuid[]))::integer as companions,
       (select count(*) from user_sessions where id = any($3::uuid[]))::integer as sessions,
       (select count(*) from orders where id = any($4::uuid[]))::integer as orders,
       (select count(*) from order_extras where id = any($5::uuid[]))::integer as extras,
       (select count(*) from order_status_logs where id = any($6::uuid[]))::integer as status_logs`,
    [
      Object.values(fixture.users).map((row) => row.id),
      Object.values(fixture.companions).map((row) => row.id),
      Object.values(fixture.sessions).map((row) => row.id),
      fixture.orders.map((row) => row.id),
      fixture.extras.map((row) => row.id),
      fixture.statusLogs.map((row) => row.id),
    ],
  );
  const remaining = Object.entries(result.rows[0] || {}).filter(([, count]) => Number(count) !== 0);
  assert(remaining.length === 0, `rolled-back fixture rows remain: ${remaining.map(([name]) => name).join(', ')}`);
}

function sanitizeError(error, rawUrl) {
  let message = String(error?.message || error || 'unknown order-read audit failure');
  if (rawUrl) message = message.replaceAll(rawUrl, '[REDACTED_ORDER_READ_TEST_DATABASE_URL]');
  return message.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]');
}

function databaseErrorSummary(error) {
  return [error?.code, error?.constraint, error?.message].filter(Boolean).join(': ');
}

function assert(condition, message) {
  if (!condition) throw new Error(`PostgreSQL order-read live audit failed: ${message}`);
}
