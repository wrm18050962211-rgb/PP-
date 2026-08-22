import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
const migrationCheck = readFileSync(
  new URL('./check-composite-order-migration-live.mjs', import.meta.url),
  'utf8',
);
const serverPackage = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const baselineCommit = 'cac663d0fa9772b1d1420ac2c899f95c2a4d4ba6';

assert(/name:\s*Still CI/.test(workflow), 'workflow has Still CI name');
assert(/image:\s*postgres:16/.test(workflow), 'workflow starts PostgreSQL 16 service');
assert(/DATABASE_URL:\s*postgres:\/\/postgres:postgres@localhost:5432\/pp_platform_ci/.test(workflow), 'workflow sets CI database url');
assert(
  /MIGRATION_TEST_DATABASE_URL:\s*postgres:\/\/postgres:postgres@localhost:5432\/pp_platform_migration_ci/.test(workflow),
  'workflow sets an isolated migration database url',
);
assert(/ALLOW_DESTRUCTIVE_MIGRATION_TEST:\s*["']?1["']?/.test(workflow), 'workflow explicitly enables destructive migration audit');
const serverJob = workflow.match(/\n  server-check:[\s\S]*?(?=\r?\n  frontend-check:)/)?.[0] || '';
assert(serverJob, 'workflow defines a server-check job');
const serverStepsIndex = serverJob.search(/\r?\n    steps:/);
assert(serverStepsIndex > 0, 'server-check job defines steps');
const serverJobEnvironment = serverJob.slice(0, serverStepsIndex);
assert(!serverJobEnvironment.includes('ALLOW_DESTRUCTIVE_MIGRATION_TEST'), 'destructive migration opt-in is not job-wide');
assert(
  /name:\s*Run isolated composite-order migration audit[\s\S]*?env:\s*\n\s*ALLOW_DESTRUCTIVE_MIGRATION_TEST:\s*["']?1["']?[\s\S]*?run:\s*npm run check:composite-order-migration-live/.test(workflow),
  'destructive migration opt-in is scoped to the audit step',
);
assert(
  workflow.includes('psql "$DATABASE_URL" --no-psqlrc --set ON_ERROR_STOP=1 --file database/schema.sql'),
  'workflow loads the canonical schema with fail-fast psql settings',
);
assert(/createdb[^\n]+pp_platform_migration_ci/.test(workflow), 'workflow creates the dedicated migration database');
assert(
  workflow.includes(`git show ${baselineCommit}:database/schema.sql`)
    && workflow.includes(`git show ${baselineCommit}:database/seed_mvp.sql`),
  'workflow loads schema and seed from the fixed pre-merchant commit',
);
assert(/set -o pipefail/.test(workflow), 'workflow fails when a fixed-baseline git show pipe fails');
assert(
  (workflow.match(/--no-psqlrc --set ON_ERROR_STOP=1/g)?.length || 0) >= 3,
  'canonical and baseline imports use fail-fast psql settings',
);
assert(/npm run check:mvp/.test(workflow), 'workflow runs server MVP checks');
assert(/npm run check:postgres-live/.test(workflow), 'workflow runs live PostgreSQL checks');
assert(/npm run check:composite-order-migration-live/.test(workflow), 'workflow runs isolated composite-order migration audit');
assert(/cache-dependency-path:\s*pp-app\/package-lock\.json/.test(workflow), 'workflow caches frontend dependencies by lockfile');
assert(/npm ci/.test(workflow), 'workflow installs frontend dependencies reproducibly');
assert(/npm run check:production-guards/.test(workflow), 'workflow runs frontend production guard');
assert(/npm run build:mobile/.test(workflow), 'workflow builds mobile bundle');
assert(/npm run build:admin/.test(workflow), 'workflow builds admin bundle');

const checkoutCount = workflow.match(/uses:\s*actions\/checkout@v4/g)?.length || 0;
const fullHistoryCheckoutCount = workflow.match(/fetch-depth:\s*0/g)?.length || 0;
assert(checkoutCount >= 2 && fullHistoryCheckoutCount === 1, 'only the migration-bearing server checkout fetches full Git history');

assert(
  serverPackage.scripts?.['check:composite-order-migration-live']
    === 'node scripts/check-composite-order-migration-live.mjs',
  'server package exposes isolated composite-order migration audit',
);
assert(migrationCheck.includes('process.env.MIGRATION_TEST_DATABASE_URL'), 'migration audit reads only its dedicated URL');
assert(!migrationCheck.includes('process.env.DATABASE_URL'), 'migration audit never reads the application database URL');
assert(migrationCheck.includes("ALLOW_DESTRUCTIVE_MIGRATION_TEST !== '1'"), 'migration audit requires an explicit destructive-test flag');
assert(migrationCheck.includes("const REQUIRED_DATABASE_NAME = 'pp_platform_migration_ci'"), 'migration audit pins the database name');
for (const hostname of ['localhost', '127.0.0.1', '::1']) {
  assert(migrationCheck.includes(`'${hostname}'`), `migration audit allows ${hostname}`);
}
assert(/server_version_num\s*>?=\s*160000[\s\S]+server_version_num\s*<\s*170000/.test(migrationCheck), 'migration audit requires PostgreSQL 16');
assert(migrationCheck.includes("await applyMigration(client, migrationSql, 'first')"), 'migration audit applies the migration once');
assert(migrationCheck.includes("await applyMigration(client, migrationSql, 'second')"), 'migration audit reapplies the migration');
for (const checkName of [
  'assertInvalidMerchantOfferingRejected',
  'assertInvalidOrderPhotographerRejected',
  'assertInvalidActivityPricingRejected',
  'assertFinalServiceItemDeletionRejected',
  'assertUserPayableFormulaRejected',
  'assertAmountMismatchRejected',
]) {
  assert(migrationCheck.includes(checkName), `migration audit includes ${checkName}`);
}
assert(migrationCheck.includes("await client.query('rollback')"), 'migration audit rolls back mutation probes');
assert(migrationCheck.includes('connectionTimeoutMillis: 5000'), 'migration audit bounds connection attempts');
assert(migrationCheck.includes('let connected = false'), 'migration audit tracks successful connection state');
assert(migrationCheck.includes('if (connected && inTransaction)'), 'migration audit only rolls back an active connected transaction');
assert(migrationCheck.includes('if (connected)'), 'migration audit only closes a connected client');
assert(migrationCheck.includes('process.exitCode = 1'), 'a skipped migration audit exits unsuccessfully');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'postgres-service',
        'schema-load',
        'server-mvp',
        'live-postgres',
        'isolated-migration-database',
        'fixed-baseline-load',
        'migration-audit-safety-guards',
        'composite-order-migration-live',
        'full-git-history',
        'frontend-guards',
        'mobile-build',
        'admin-build',
      ],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`CI workflow check failed: ${message}`);
}
