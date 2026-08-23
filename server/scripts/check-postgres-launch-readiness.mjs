import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

const files = {
  schema: 'database/schema.sql',
  seed: 'database/seed_mvp.sql',
  runbook: 'database/POSTGRES_CLOUD_RUNBOOK.md',
  databaseReadme: 'database/README.md',
  serverPackage: 'server/package.json',
  serverEnvExample: 'server/.env.example',
  postgresStore: 'server/store/postgresStore.mjs',
  liveCheck: 'server/scripts/check-postgres-live.mjs',
  liveNodeCheck: 'server/scripts/check-postgres-live-node.mjs',
  orderReadLiveCheck: 'server/scripts/check-postgres-order-read-live.mjs',
  storeLiteBookingLiveCheck: 'server/scripts/check-postgres-store-lite-booking-live.mjs',
  storeLiteComplianceLiveCheck: 'server/scripts/check-postgres-store-lite-compliance-live.mjs',
  migrationLiveCheck: 'server/scripts/check-composite-order-migration-live.mjs',
  ciWorkflow: '.github/workflows/ci.yml',
};

const requiredTables = [
  'users',
  'user_sessions',
  'phone_verification_challenges',
  'admin_users',
  'admin_action_logs',
  'audit_logs',
  'security_events',
  'idempotency_keys',
  'companions',
  'service_areas',
  'availability_slots',
  'posts',
  'post_images',
  'orders',
  'booking_requests',
  'booking_request_status_logs',
  'user_requests',
  'user_request_status_logs',
  'user_companion_blocks',
  'payments',
  'provider_callback_events',
  'conversations',
  'messages',
  'message_risk_events',
  'reports',
  'audit_cases',
  'refunds',
  'settlements',
  'ledger_entries',
];

const requiredEnvNames = [
  'APP_ENV',
  'RELEASE_PROFILE',
  'PUBLIC_API_ORIGIN',
  'CORS_ALLOWED_ORIGINS',
  'STORE_DRIVER',
  'DATABASE_URL',
  'ADMIN_SESSION_TTL_HOURS',
  'ADMIN_PASSWORD_PEPPER',
  'ENABLE_STORE_LITE_BOOKINGS',
  'ENABLE_STORE_LITE_COMPLIANCE',
  'STORE_LITE_SUPPORT_CHANNEL_KEYS',
  'COS_BUCKET',
  'COS_REGION',
  'COS_PUBLIC_BASE_URL',
  'TENCENT_CLOUD_SECRET_ID',
  'TENCENT_CLOUD_SECRET_KEY',
  'PHONE_SMS_PROVIDER',
  'PHONE_OTP_PEPPER',
  'TENCENT_SMS_SDK_APP_ID',
  'TENCENT_SMS_SIGN_NAME',
  'TENCENT_SMS_TEMPLATE_ID',
  'WECHAT_PAY_MODE',
  'WECHAT_PAY_NOTIFY_URL',
];

const checks = [];

for (const [name, path] of Object.entries(files)) {
  assert(existsSync(abs(path)), `${name} exists at ${path}`);
  checks.push(`${name}-exists`);
}

const schema = read(files.schema);
for (const tableName of requiredTables) {
  assert(new RegExp(`create\\s+table\\s+${escapeRegExp(tableName)}\\s*\\(`, 'i').test(schema), `schema creates ${tableName}`);
}
checks.push('schema-required-tables');

const seed = read(files.seed);
assert(/insert\s+into\s+users/i.test(seed), 'seed inserts users');
assert(/insert\s+into\s+companions/i.test(seed), 'seed inserts companions');
assert(/insert\s+into\s+posts/i.test(seed), 'seed inserts posts');
checks.push('seed-core-demo-data');

const serverPackage = JSON.parse(read(files.serverPackage));
const scripts = serverPackage.scripts || {};
assert(scripts['check:postgres-launch-readiness'] === 'node scripts/check-postgres-launch-readiness.mjs', 'server package exposes launch readiness check');
assert(scripts['check:postgres-live'] === 'node scripts/check-postgres-live.mjs', 'server package exposes live PostgreSQL check');
assert(
  scripts['check:postgres-order-read-live'] === 'node scripts/check-postgres-order-read-live.mjs',
  'server package exposes isolated order-read PostgreSQL audit',
);
assert(
  scripts['check:postgres-store-lite-booking-live'] === 'node scripts/check-postgres-store-lite-booking-live.mjs',
  'server package exposes isolated Store Lite booking PostgreSQL audit',
);
assert(
  scripts['check:postgres-store-lite-compliance-live'] === 'node scripts/check-postgres-store-lite-compliance-live.mjs',
  'server package exposes isolated Store Lite compliance PostgreSQL audit',
);
assert(
  scripts['check:composite-order-migration-live'] === 'node scripts/check-composite-order-migration-live.mjs',
  'server package exposes isolated composite-order migration audit',
);
assert(scripts['job:maintenance'] === 'node scripts/run-maintenance-jobs.mjs', 'server package exposes maintenance job');
assert(scripts['db:export-seed'] === 'node ../database/scripts/export-store-to-seed.mjs', 'server package exposes store seed export');
checks.push('server-package-scripts');

const envExample = read(files.serverEnvExample);
for (const envName of requiredEnvNames) {
  assert(new RegExp(`^${escapeRegExp(envName)}=`, 'm').test(envExample), `server .env.example includes ${envName}`);
}
checks.push('server-env-template');

const postgresStore = read(files.postgresStore);
assert(postgresStore.includes("import('pg')"), 'postgres store loads pg runtime dependency lazily');
assert(/writes:\s*false/.test(postgresStore), 'postgres store still protects broad save writes');
assert(/orderWrites:\s*\{/.test(postgresStore), 'postgres store exposes order write gateway');
assert(/messageWrites:\s*\{/.test(postgresStore), 'postgres store exposes message write gateway');
assert(/moderationWrites:\s*\{/.test(postgresStore), 'postgres store exposes moderation write gateway');
assert(/sessionWrites:\s*\{/.test(postgresStore), 'postgres store exposes session write gateway');
assert(/phoneVerificationWrites:\s*\{/.test(postgresStore), 'postgres store exposes phone verification write gateway');
assert(/providerCallbackWrites:\s*\{/.test(postgresStore), 'postgres store exposes provider callback write gateway');
checks.push('postgres-store-gateways');

const liveCheck = read(files.liveCheck);
for (const tableName of ['user_sessions', 'audit_logs', 'admin_action_logs', 'security_events', 'provider_callback_events']) {
  assert(liveCheck.includes(`'${tableName}'`), `live check covers ${tableName}`);
}
assert(liveCheck.includes('for update skip locked'), 'live check verifies queue/slot locking syntax');
checks.push('live-check-coverage');

const liveNodeCheck = read(files.liveNodeCheck);
assert(liveNodeCheck.includes('connectionTimeoutMillis: 5000'), 'Node live check bounds connection attempts');
assert(liveNodeCheck.includes('query_timeout: 5000'), 'Node live check bounds query attempts');
assert(liveNodeCheck.includes('let connected = false'), 'Node live check tracks successful connection state');
assert(liveNodeCheck.includes('let inTransaction = false'), 'Node live check tracks transaction state');
assert(liveNodeCheck.includes('if (connected && inTransaction)'), 'Node live check only rolls back an active connected transaction');
assert(liveNodeCheck.includes('if (connected)'), 'Node live check only closes a connected client');
checks.push('live-node-failure-boundary');

const orderReadLiveCheck = read(files.orderReadLiveCheck);
assert(orderReadLiveCheck.includes('process.env.ORDER_READ_TEST_DATABASE_URL'), 'order-read audit uses its dedicated database URL');
assert(!orderReadLiveCheck.includes('process.env.DATABASE_URL'), 'order-read audit ignores the application database URL');
assert(orderReadLiveCheck.includes("ALLOW_ORDER_READ_LIVE_TEST !== '1'"), 'order-read audit requires explicit opt-in');
assert(orderReadLiveCheck.includes("const REQUIRED_DATABASE_NAME = 'pp_platform_ci'"), 'order-read audit pins the CI database name');
for (const hostname of ['localhost', '127.0.0.1', '::1']) {
  assert(orderReadLiveCheck.includes(`'${hostname}'`), `order-read audit permits the local host ${hostname}`);
}
assert(/server_version_num\s*>?=\s*160000[\s\S]+server_version_num\s*<\s*170000/.test(orderReadLiveCheck), 'order-read audit pins PostgreSQL 16');
assert(orderReadLiveCheck.includes('connectionTimeoutMillis: 5000'), 'order-read audit bounds connection attempts');
assert(orderReadLiveCheck.includes('idle_in_transaction_session_timeout: 30000'), 'order-read audit bounds idle fixture transactions');
assert(orderReadLiveCheck.includes("await client.query('begin')"), 'order-read audit opens one fixture transaction');
assert(orderReadLiveCheck.includes("await client.query('rollback')"), 'order-read audit rolls back its fixture transaction');
assert(orderReadLiveCheck.includes('if (connected && inTransaction)'), 'order-read audit only rolls back an active connected transaction');
assert(orderReadLiveCheck.includes('jsonb_to_recordset($1::jsonb)'), 'order-read audit parameterizes fixture payloads');
const orderReadFixtureTables = ['users', 'companions', 'user_sessions', 'orders', 'order_extras', 'order_status_logs'];
for (const tableName of orderReadFixtureTables) {
  assert(new RegExp(`insert\\s+into\\s+${escapeRegExp(tableName)}\\b`, 'i').test(orderReadLiveCheck), `order-read audit inserts ${tableName} fixture rows`);
}
const orderReadInsertTables = [...orderReadLiveCheck.matchAll(/\binsert\s+into\s+([a-z_]+)\b/gi)].map((match) => match[1].toLowerCase());
assert(orderReadInsertTables.length === orderReadFixtureTables.length, 'order-read audit has exactly one insert per fixture table');
assert(orderReadInsertTables.every((tableName) => orderReadFixtureTables.includes(tableName)), 'order-read audit inserts only approved fixture tables');
assert((orderReadLiveCheck.match(/jsonb_to_recordset\(\$1::jsonb\)/g) || []).length === orderReadFixtureTables.length, 'every order-read fixture insert uses one parameterized JSON payload');
assert(!/\b(?:create|alter|truncate|drop|grant|revoke|comment|vacuum|reindex|delete|update|commit|savepoint)\b/i.test(orderReadLiveCheck), 'order-read audit contains no DDL, destructive, or persistent SQL verb');
for (const gateway of ['sessionWrites.create', 'sessionWrites.touchToken', 'sessionWrites.revokeToken', 'orderWrites.']) {
  assert(!orderReadLiveCheck.includes(gateway), `order-read audit does not call transactional gateway ${gateway}`);
}
assert(orderReadLiveCheck.includes('const ORDER_COUNT = 240'), 'order-read audit covers more than the legacy 100-row ceiling');
assert(orderReadLiveCheck.includes("['000900', '000100', '000800', '000200']"), 'order-read audit includes distinct PostgreSQL microseconds inside one millisecond');
assert(orderReadLiveCheck.includes('assertMicrosecondCursorParameters(orderReadQueryTrace)'), 'order-read audit verifies microsecond cursor SQL parameters');
assert(orderReadLiveCheck.includes('featureFlags: { domainEnabled: false }'), 'order-read audit cannot activate composite service-item reads');
assert(orderReadLiveCheck.includes('hashSessionToken(token)'), 'order-read audit stores only hashed session tokens');
assert(orderReadLiveCheck.includes('await assertFixtureAbsent(client, fixture)'), 'order-read audit verifies fixture absence after rollback');
assert(orderReadLiveCheck.includes('store.sessionWrites.findByToken'), 'order-read audit recovers actors through the PostgreSQL session gateway');
assert(orderReadLiveCheck.includes('store.orderReads.listOrders'), 'order-read audit exercises the PostgreSQL order list gateway');
assert(orderReadLiveCheck.includes('store.orderReads.getOrder'), 'order-read audit exercises the PostgreSQL order detail gateway');
assert(orderReadLiveCheck.includes('process.exitCode = 1'), 'order-read audit cannot report a safety refusal as a pass');
checks.push('isolated-order-read-audit-safety');

const storeLiteBookingLiveCheck = read(files.storeLiteBookingLiveCheck);
assert(storeLiteBookingLiveCheck.includes('process.env.STORE_LITE_TEST_DATABASE_URL'), 'Store Lite booking audit uses its dedicated database URL');
assert(!storeLiteBookingLiveCheck.includes('process.env.DATABASE_URL'), 'Store Lite booking audit ignores the application database URL');
assert(storeLiteBookingLiveCheck.includes("ALLOW_STORE_LITE_LIVE_TEST !== '1'"), 'Store Lite booking audit requires explicit opt-in');
assert(storeLiteBookingLiveCheck.includes('if (parsed.search || parsed.hash)'), 'Store Lite booking audit refuses URL query parameters and fragments');
assert(storeLiteBookingLiveCheck.includes("const REQUIRED_DATABASE_NAME = 'pp_platform_store_lite_ci'"), 'Store Lite booking audit pins the isolated database name');
for (const hostname of ['localhost', '127.0.0.1', '::1']) {
  assert(storeLiteBookingLiveCheck.includes(`'${hostname}'`), `Store Lite booking audit permits the local host ${hostname}`);
}
assert(/server_version_num\s*>?=\s*160000[\s\S]+server_version_num\s*<\s*170000/.test(storeLiteBookingLiveCheck), 'Store Lite booking audit pins PostgreSQL 16');
assert(storeLiteBookingLiveCheck.includes('connectionTimeoutMillis: 5000'), 'Store Lite booking audit bounds connection attempts');
assert(storeLiteBookingLiveCheck.includes("row.schema_name === 'public'"), 'Store Lite booking audit pins the public schema after connecting');
assert(storeLiteBookingLiveCheck.includes('const PAGINATION_BOOKING_COUNT = 112'), 'Store Lite booking audit covers more than 100 requests');
assert(storeLiteBookingLiveCheck.includes('await assertCreateIdempotencyAndIsolation'), 'Store Lite booking audit covers idempotency and owner isolation');
assert(storeLiteBookingLiveCheck.includes('await assertPagination'), 'Store Lite booking audit covers real keyset pagination');
assert(storeLiteBookingLiveCheck.includes('await assertAdminContactBoundary'), 'Store Lite booking audit covers contact privacy boundaries');
assert(storeLiteBookingLiveCheck.includes('await assertConcurrentConfirm'), 'Store Lite booking audit covers concurrent confirmation');
assert(storeLiteBookingLiveCheck.includes('await assertAdminAuditRollback'), 'Store Lite booking audit covers transaction rollback');
assert(storeLiteBookingLiveCheck.includes('await cleanupFixture(control, fixture)'), 'Store Lite booking audit cleans exact fixtures');
assert(storeLiteBookingLiveCheck.includes('await assertFixtureAbsent(control, fixture)'), 'Store Lite booking audit verifies cleanup');
assert(!/\b(?:create|alter|truncate|drop|grant|revoke|vacuum|reindex)\b\s+(?:table|type|index|schema|database)\b/i.test(storeLiteBookingLiveCheck), 'Store Lite booking audit contains no DDL');
assert(storeLiteBookingLiveCheck.includes('process.exitCode = 1'), 'Store Lite booking audit cannot report a safety refusal as a pass');
checks.push('isolated-store-lite-booking-audit-safety');

const storeLiteComplianceLiveCheck = read(files.storeLiteComplianceLiveCheck);
assert(storeLiteComplianceLiveCheck.includes('process.env.STORE_LITE_COMPLIANCE_TEST_DATABASE_URL'), 'Store Lite compliance audit uses its dedicated database URL');
assert(!storeLiteComplianceLiveCheck.includes('process.env.DATABASE_URL'), 'Store Lite compliance audit ignores the application database URL');
assert(storeLiteComplianceLiveCheck.includes("ALLOW_STORE_LITE_COMPLIANCE_LIVE_TEST !== '1'"), 'Store Lite compliance audit requires explicit opt-in');
assert(storeLiteComplianceLiveCheck.includes('if (parsed.search || parsed.hash)'), 'Store Lite compliance audit refuses URL query parameters and fragments');
assert(storeLiteComplianceLiveCheck.includes("const REQUIRED_DATABASE_NAME = 'pp_platform_ci'"), 'Store Lite compliance audit pins the CI database name');
for (const hostname of ['localhost', '127.0.0.1', '::1']) {
  assert(storeLiteComplianceLiveCheck.includes(`'${hostname}'`), `Store Lite compliance audit permits the local host ${hostname}`);
}
assert(/server_version_num\s*>?=\s*160000[\s\S]+server_version_num\s*<\s*170000/.test(storeLiteComplianceLiveCheck), 'Store Lite compliance audit pins PostgreSQL 16');
assert(storeLiteComplianceLiveCheck.includes('connectionTimeoutMillis: 5000'), 'Store Lite compliance audit bounds connection attempts');
assert(storeLiteComplianceLiveCheck.includes("row.schema_name === 'public'"), 'Store Lite compliance audit pins the public schema after connecting');
assert(storeLiteComplianceLiveCheck.includes("await control.query('begin')"), 'Store Lite compliance audit opens one outer fixture transaction');
assert(storeLiteComplianceLiveCheck.includes("await control.query('rollback')"), 'Store Lite compliance audit rolls back its fixture transaction');
assert(storeLiteComplianceLiveCheck.includes('createSavepointPool(control)'), 'Store Lite compliance audit maps nested gateway transactions to savepoints');
assert(storeLiteComplianceLiveCheck.includes('await assertFixtureAbsent(control, fixture)'), 'Store Lite compliance audit verifies fixture absence after rollback');
assert(storeLiteComplianceLiveCheck.includes('await assertUserRequestFlows'), 'Store Lite compliance audit covers user request workflows');
assert(storeLiteComplianceLiveCheck.includes('await assertContentReportFlows'), 'Store Lite compliance audit covers content report workflows');
assert(storeLiteComplianceLiveCheck.includes('await assertBlockAndContentFiltering'), 'Store Lite compliance audit covers block filtering');
assert(!/\b(?:create|alter|truncate|drop|grant|revoke|vacuum|reindex)\b\s+(?:table|type|index|schema|database)\b/i.test(storeLiteComplianceLiveCheck), 'Store Lite compliance audit contains no DDL');
assert(storeLiteComplianceLiveCheck.includes('process.exitCode = 1'), 'Store Lite compliance audit cannot report a safety refusal as a pass');
checks.push('isolated-store-lite-compliance-audit-safety');

const migrationLiveCheck = read(files.migrationLiveCheck);
assert(migrationLiveCheck.includes('process.env.MIGRATION_TEST_DATABASE_URL'), 'migration audit uses its dedicated database URL');
assert(!migrationLiveCheck.includes('process.env.DATABASE_URL'), 'migration audit ignores the application database URL');
assert(migrationLiveCheck.includes("ALLOW_DESTRUCTIVE_MIGRATION_TEST !== '1'"), 'migration audit requires explicit destructive-test opt-in');
assert(migrationLiveCheck.includes("const REQUIRED_DATABASE_NAME = 'pp_platform_migration_ci'"), 'migration audit pins the isolated database name');
for (const hostname of ['localhost', '127.0.0.1', '::1']) {
  assert(migrationLiveCheck.includes(`'${hostname}'`), `migration audit permits the local host ${hostname}`);
}
assert(/server_version_num\s*>?=\s*160000[\s\S]+server_version_num\s*<\s*170000/.test(migrationLiveCheck), 'migration audit pins PostgreSQL 16');
assert(migrationLiveCheck.includes('merchant domain table(s) already exist'), 'migration audit refuses a database that already has merchant tables');
assert(migrationLiveCheck.includes("await applyMigration(client, migrationSql, 'first')"), 'migration audit runs the first migration');
assert(migrationLiveCheck.includes("await applyMigration(client, migrationSql, 'second')"), 'migration audit runs the repeat migration');
assert(migrationLiveCheck.includes('repeat backfill inserted'), 'migration audit verifies repeat backfill count is zero');
assert(migrationLiveCheck.includes("await client.query('rollback')"), 'migration audit rolls back negative probes');
assert(migrationLiveCheck.includes('connectionTimeoutMillis: 5000'), 'migration audit bounds connection attempts');
assert(migrationLiveCheck.includes('let connected = false'), 'migration audit tracks successful connection state');
assert(migrationLiveCheck.includes('let inTransaction = false'), 'migration audit tracks transaction state');
assert(migrationLiveCheck.includes('if (connected && inTransaction)'), 'migration audit only rolls back an active connected transaction');
assert(migrationLiveCheck.includes('if (connected)'), 'migration audit only closes a connected client');
assert(migrationLiveCheck.includes('process.exitCode = 1'), 'migration audit cannot report a safety refusal as a pass');
checks.push('isolated-migration-audit-safety');

const ciWorkflow = read(files.ciWorkflow);
assert(/postgres:\s*\n\s*image:\s*postgres:16/.test(ciWorkflow), 'CI uses PostgreSQL 16 service');
assert(
  ciWorkflow.includes('psql "$DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --file database/schema.sql'),
  'CI loads schema through fail-fast psql',
);
assert(ciWorkflow.includes('npm run check:postgres-live'), 'CI runs live PostgreSQL check');
assert(ciWorkflow.includes('npm run check:postgres-order-read-live'), 'CI runs isolated order-read PostgreSQL audit');
assert(ciWorkflow.includes('npm run check:postgres-store-lite-booking-live'), 'CI runs isolated Store Lite booking PostgreSQL audit');
assert(ciWorkflow.includes('npm run check:postgres-store-lite-compliance-live'), 'CI runs isolated Store Lite compliance PostgreSQL audit');
assert(ciWorkflow.includes('fetch-depth: 0'), 'CI fetches the fixed baseline commit');
assert(ciWorkflow.includes('createdb --host=localhost --port=5432 --username=postgres pp_platform_migration_ci'), 'CI creates a dedicated migration database');
assert(ciWorkflow.includes('createdb --host=localhost --port=5432 --username=postgres pp_platform_store_lite_ci'), 'CI creates a dedicated Store Lite booking database');
assert(ciWorkflow.includes('MIGRATION_TEST_DATABASE_URL: postgres://postgres:postgres@localhost:5432/pp_platform_migration_ci'), 'CI exports the dedicated migration URL');
assert(ciWorkflow.includes('ALLOW_DESTRUCTIVE_MIGRATION_TEST: "1"'), 'CI opts into the destructive migration audit');
const ciServerJob = ciWorkflow.match(/\n  server-check:[\s\S]*?(?=\r?\n  frontend-check:)/)?.[0] || '';
assert(ciServerJob, 'CI defines the server-check job');
const ciServerStepsIndex = ciServerJob.search(/\r?\n    steps:/);
assert(ciServerStepsIndex > 0, 'CI server-check job defines steps');
const ciServerJobEnvironment = ciServerJob.slice(0, ciServerStepsIndex);
assert(!ciServerJobEnvironment.includes('ALLOW_DESTRUCTIVE_MIGRATION_TEST'), 'CI does not enable destructive migration audit job-wide');
assert(!ciServerJobEnvironment.includes('ALLOW_ORDER_READ_LIVE_TEST'), 'CI does not enable order-read fixture audit job-wide');
assert(!ciServerJobEnvironment.includes('ORDER_READ_TEST_DATABASE_URL'), 'CI does not export the order-read test URL job-wide');
assert(!ciServerJobEnvironment.includes('ALLOW_STORE_LITE_LIVE_TEST'), 'CI does not enable Store Lite booking fixture audit job-wide');
assert(!ciServerJobEnvironment.includes('STORE_LITE_TEST_DATABASE_URL'), 'CI does not export the Store Lite booking test URL job-wide');
assert(!ciServerJobEnvironment.includes('ALLOW_STORE_LITE_COMPLIANCE_LIVE_TEST'), 'CI does not enable Store Lite compliance fixture audit job-wide');
assert(!ciServerJobEnvironment.includes('STORE_LITE_COMPLIANCE_TEST_DATABASE_URL'), 'CI does not export the Store Lite compliance test URL job-wide');
assert(
  /name:\s*Run isolated order-read PostgreSQL audit[\s\S]*?env:\s*\n\s*ORDER_READ_TEST_DATABASE_URL:\s*postgres:\/\/postgres:postgres@localhost:5432\/pp_platform_ci\s*\n\s*ALLOW_ORDER_READ_LIVE_TEST:\s*"1"[\s\S]*?run:\s*npm run check:postgres-order-read-live/.test(ciWorkflow),
  'CI scopes the order-read database URL and opt-in to its audit step',
);
const storeLiteAuditStep = workflowStep(ciWorkflow, 'Run isolated Store Lite booking PostgreSQL audit');
assert(storeLiteAuditStep, 'CI defines the isolated Store Lite booking audit step');
assert(
  /env:\s*\n\s*STORE_LITE_TEST_DATABASE_URL:\s*postgres:\/\/postgres:postgres@localhost:5432\/pp_platform_store_lite_ci\s*\n\s*ALLOW_STORE_LITE_LIVE_TEST:\s*"1"/.test(storeLiteAuditStep)
    && /run:\s*npm run check:postgres-store-lite-booking-live/.test(storeLiteAuditStep),
  'CI contains the Store Lite booking URL, opt-in, and command in one audit step',
);
assert((ciWorkflow.match(/STORE_LITE_TEST_DATABASE_URL/g) || []).length === 1, 'CI exports the Store Lite booking test URL exactly once');
assert((ciWorkflow.match(/ALLOW_STORE_LITE_LIVE_TEST/g) || []).length === 1, 'CI enables the Store Lite booking audit exactly once');
const storeLiteComplianceAuditStep = workflowStep(ciWorkflow, 'Run isolated Store Lite compliance PostgreSQL audit');
assert(storeLiteComplianceAuditStep, 'CI defines the isolated Store Lite compliance audit step');
assert(
  /env:\s*\n\s*STORE_LITE_COMPLIANCE_TEST_DATABASE_URL:\s*postgres:\/\/postgres:postgres@localhost:5432\/pp_platform_ci\s*\n\s*ALLOW_STORE_LITE_COMPLIANCE_LIVE_TEST:\s*"1"/.test(storeLiteComplianceAuditStep)
    && /run:\s*npm run check:postgres-store-lite-compliance-live/.test(storeLiteComplianceAuditStep),
  'CI contains the Store Lite compliance URL, opt-in, and command in one audit step',
);
assert((ciWorkflow.match(/STORE_LITE_COMPLIANCE_TEST_DATABASE_URL/g) || []).length === 1, 'CI exports the Store Lite compliance test URL exactly once');
assert((ciWorkflow.match(/ALLOW_STORE_LITE_COMPLIANCE_LIVE_TEST/g) || []).length === 1, 'CI enables the Store Lite compliance audit exactly once');
assert(
  /name:\s*Run isolated composite-order migration audit[\s\S]*?env:\s*\n\s*ALLOW_DESTRUCTIVE_MIGRATION_TEST:\s*"1"[\s\S]*?run:\s*npm run check:composite-order-migration-live/.test(ciWorkflow),
  'CI scopes destructive migration opt-in to the audit step',
);
for (const baselineFile of ['database/schema.sql', 'database/seed_mvp.sql']) {
  assert(
    ciWorkflow.includes(`git show cac663d0fa9772b1d1420ac2c899f95c2a4d4ba6:${baselineFile}`),
    `CI loads ${baselineFile} from the fixed baseline commit`,
  );
}
assert(ciWorkflow.includes('npm run check:composite-order-migration-live'), 'CI runs isolated composite-order migration audit');
checks.push('ci-postgres-service', 'ci-isolated-migration-database');

const runbook = read(files.runbook);
assert(runbook.includes('TencentDB for PostgreSQL'), 'runbook mentions TencentDB for PostgreSQL');
assert(runbook.includes('阿里云 RDS PostgreSQL'), 'runbook mentions Alibaba Cloud RDS PostgreSQL');
assert(
  runbook.includes('psql "$env:DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --file database/schema.sql'),
  'runbook documents a fail-fast schema import command',
);
assert(!/psql[^\r\n]*\s-f\s/.test(runbook), 'runbook contains no non-fail-fast short-form psql imports');
assert(runbook.includes('npm.cmd run check:postgres-live'), 'runbook documents live check command');
assert(runbook.includes('对象存储'), 'runbook separates media object storage from database');
checks.push('cloud-runbook');

const databaseReadme = read(files.databaseReadme);
assert(databaseReadme.includes('POSTGRES_CLOUD_RUNBOOK.md'), 'database README links cloud runbook');
assert(databaseReadme.includes('check:postgres-launch-readiness'), 'database README documents launch readiness check');
checks.push('database-readme');

console.log(
  JSON.stringify(
    {
      ok: true,
      staticConfigurationReady: true,
      cloudDatabaseTrialReady: false,
      liveVerificationRequired: ['postgresql-16-migration-audit', 'store-lite-booking-live-ci', 'store-lite-compliance-live-ci', 'cloud-connectivity', 'backup-restore'],
      storeLiteStillRequires: ['cloud-postgresql', 'admin-deployment-isolation', 'monitoring-and-backups'],
      commercialLaterRequires: ['object-storage-write-path', 'live-payment-provider'],
      checks,
    },
    null,
    2,
  ),
);

function read(relativePath) {
  return readFileSync(abs(relativePath), 'utf8');
}

function abs(relativePath) {
  return resolve(repoRoot, relativePath);
}

function assert(condition, message) {
  if (!condition) throw new Error(`PostgreSQL launch readiness check failed: ${message}`);
}

function workflowStep(source, name) {
  const marker = `      - name: ${name}`;
  const start = source.indexOf(marker);
  if (start < 0) return '';
  const next = source.indexOf('\n      - ', start + marker.length);
  return source.slice(start, next < 0 ? source.length : next);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
