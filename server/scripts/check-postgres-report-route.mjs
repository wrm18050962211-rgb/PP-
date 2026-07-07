import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

assert(/async function createReport/.test(source), 'createReport can await moderation gateway writes');
assert(/dataStore\.kind !== 'json' && dataStore\.moderationWrites\?\.createReport/.test(source), 'postgres report route uses moderation write gateway');
assert(/async function createPostgresReport/.test(source), 'postgres report route has isolated helper');
assert(/dataStore\.moderationWrites\.createReport/.test(source), 'postgres helper calls createReport transaction');
assert(/auditCaseId: id\('audit-case'\)/.test(source), 'postgres report route creates linked audit case id');
assert(/return json\(report, 201, false\)/.test(source), 'postgres report route avoids json save');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['report-route-gateway', 'audit-case-link', 'no-json-save'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres report route check failed: ${message}`);
}
