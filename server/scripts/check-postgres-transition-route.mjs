import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

assert(/async function transitionOrder/.test(source), 'transitionOrder can await order gateway writes');
assert(/dataStore\.kind !== 'json' && dataStore\.orderWrites\?\.transitionOrder/.test(source), 'postgres transition route uses order transition gateway');
assert(/async function transitionPostgresOrder/.test(source), 'postgres transition route has isolated helper');
assert(/dataStore\.orderWrites\.transitionOrder/.test(source), 'postgres helper calls transition transaction');
assert(/draft\.settlementId = id\('settlement'\)/.test(source), 'complete transition carries settlement id');
assert(/draft\.refundId = id\('refund'\)/.test(source), 'refunding cancel carries refund id');
assert(/return json\(nextOrder, 200, false\)/.test(source), 'postgres transition route avoids json save');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['transition-route-gateway', 'complete-settlement-draft', 'cancel-refund-draft', 'no-json-save'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres transition route check failed: ${message}`);
}
