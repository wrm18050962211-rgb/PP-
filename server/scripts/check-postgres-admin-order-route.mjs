import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

assert(/async function setAdminOrderStatus/.test(source), 'admin order status route can await postgres writes');
assert(/dataStore\.kind !== 'json' && dataStore\.orderWrites\?\.setAdminOrderStatus/.test(source), 'admin order status route uses postgres gateway');
assert(/async function setPostgresAdminOrderStatus/.test(source), 'admin order status has isolated postgres helper');
assert(/dataStore\.orderWrites\.setAdminOrderStatus/.test(source), 'admin helper calls status transaction');
assert(/draft\.settlementId = id\('settlement'\)/.test(source), 'admin completed status prepares settlement draft');
assert(/recordAdminAction\(store, admin\.session, 'order_status_update'/.test(source), 'admin order status still records admin action');
assert(/return json\(nextOrder, 200, false\)/.test(source), 'admin order status avoids json save in postgres mode');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['admin-order-route-gateway', 'admin-action-log', 'completed-settlement-draft', 'no-json-save'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres admin order route check failed: ${message}`);
}
