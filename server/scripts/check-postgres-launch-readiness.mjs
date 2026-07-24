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
  'PUBLIC_API_ORIGIN',
  'CORS_ALLOWED_ORIGINS',
  'STORE_DRIVER',
  'DATABASE_URL',
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

const ciWorkflow = read(files.ciWorkflow);
assert(/postgres:\s*\n\s*image:\s*postgres:16/.test(ciWorkflow), 'CI uses PostgreSQL 16 service');
assert(ciWorkflow.includes('psql "$DATABASE_URL" -f database/schema.sql'), 'CI loads schema through psql');
assert(ciWorkflow.includes('npm run check:postgres-live'), 'CI runs live PostgreSQL check');
checks.push('ci-postgres-service');

const runbook = read(files.runbook);
assert(runbook.includes('TencentDB for PostgreSQL'), 'runbook mentions TencentDB for PostgreSQL');
assert(runbook.includes('阿里云 RDS PostgreSQL'), 'runbook mentions Alibaba Cloud RDS PostgreSQL');
assert(runbook.includes('psql "$env:DATABASE_URL" -f database/schema.sql'), 'runbook documents schema import command');
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
      cloudDatabaseTrialReady: true,
      productionStillRequires: ['object-storage', 'live-payment-provider', 'admin-deployment-isolation', 'monitoring-and-backups'],
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

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
