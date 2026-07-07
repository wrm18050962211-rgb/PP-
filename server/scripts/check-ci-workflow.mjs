import { readFileSync } from 'node:fs';

const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');

assert(/name:\s*Still CI/.test(workflow), 'workflow has Still CI name');
assert(/image:\s*postgres:16/.test(workflow), 'workflow starts PostgreSQL 16 service');
assert(/DATABASE_URL:\s*postgres:\/\/postgres:postgres@localhost:5432\/pp_platform_ci/.test(workflow), 'workflow sets CI database url');
assert(/psql "\$DATABASE_URL" -f database\/schema\.sql/.test(workflow), 'workflow loads database schema');
assert(/npm run check:mvp/.test(workflow), 'workflow runs server MVP checks');
assert(/npm run check:postgres-live/.test(workflow), 'workflow runs live PostgreSQL checks');
assert(/cache-dependency-path:\s*pp-app\/package-lock\.json/.test(workflow), 'workflow caches frontend dependencies by lockfile');
assert(/npm ci/.test(workflow), 'workflow installs frontend dependencies reproducibly');
assert(/npm run check:production-guards/.test(workflow), 'workflow runs frontend production guard');
assert(/npm run build:mobile/.test(workflow), 'workflow builds mobile bundle');
assert(/npm run build:admin/.test(workflow), 'workflow builds admin bundle');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['postgres-service', 'schema-load', 'server-mvp', 'live-postgres', 'frontend-guards', 'mobile-build', 'admin-build'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`CI workflow check failed: ${message}`);
}
