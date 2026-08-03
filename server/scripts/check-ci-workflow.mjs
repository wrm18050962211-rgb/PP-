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
assert(/node deploy\/create-release-manifest\.mjs admin pp-app\/dist-admin\/release\.json/.test(workflow), 'workflow records Admin release metadata');
assert(/node deploy\/create-release-manifest\.mjs website dist-website\/release\.json/.test(workflow), 'workflow records website release metadata');
assert(/name:\s*still-admin-\$\{\{ github\.sha \}\}/.test(workflow), 'workflow names Admin artifact with the full commit SHA');
assert(/name:\s*still-website-\$\{\{ github\.sha \}\}/.test(workflow), 'workflow names website artifact with the full commit SHA');
assert((workflow.match(/uses:\s*actions\/upload-artifact@v4/g) || []).length === 2, 'workflow uploads both static artifacts');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['postgres-service', 'schema-load', 'server-mvp', 'live-postgres', 'frontend-guards', 'mobile-build', 'admin-build', 'immutable-static-artifacts'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`CI workflow check failed: ${message}`);
}
