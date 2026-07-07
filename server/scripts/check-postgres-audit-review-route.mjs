import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

assert(/async function reviewAuditCase/.test(source), 'audit review route can await postgres writes');
assert(/dataStore\.kind !== 'json' && dataStore\.moderationWrites\?\.reviewAuditCase/.test(source), 'audit review route uses postgres gateway');
assert(/async function reviewPostgresAuditCase/.test(source), 'audit review has isolated postgres helper');
assert(/dataStore\.moderationWrites\.reviewAuditCase/.test(source), 'audit review helper calls transaction');
assert(/auditLogId: id\('audit-log'\)/.test(source), 'audit review creates audit log id');
assert(/adminActionLogId: id\('admin-action'\)/.test(source), 'audit review creates admin action id');
assert(/return json\(\{ ok: true, auditCase: reviewedCase \}, 200, false\)/.test(source), 'audit review avoids json save in postgres mode');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['audit-review-route-gateway', 'audit-log-id', 'admin-action-id', 'no-json-save'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres audit review route check failed: ${message}`);
}
