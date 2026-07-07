import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

assert(/function runtimeSecurityChanged\(\) \{\s*return dataStore\.kind === 'json';\s*\}/.test(source), 'security changed helper is json scoped');
assert(!/Admin session cannot access public app API', true\)/.test(source), 'public app admin denial is not hard-coded changed');
assert(!/adminRequired\(true\)/.test(source), 'admin denial is not hard-coded changed');
assert(!/companionRequired\(reason, true\)/.test(source), 'companion denial is not hard-coded changed');
assert(!/error\(403, 'FORBIDDEN', forbiddenMessage, true\)/.test(source), 'order read denial is not hard-coded changed');
assert(!/error\(403, 'FORBIDDEN', 'Order action is not allowed for current role', true\)/.test(source), 'order mutation denial is not hard-coded changed');
assert((source.match(/runtimeSecurityChanged\(\)/g) || []).length >= 6, 'security denials use json-scoped changed helper');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['json-scoped-security-events', 'postgres-denial-no-save'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres security boundary check failed: ${message}`);
}
