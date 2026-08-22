import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

assert(/async function setAdminOrderStatus/.test(source), 'admin order status route can await postgres writes');
assert((source.match(/return setAdminOrderStatus\(store, path, body\.status\)/g) || []).length === 2, 'both admin status route aliases use one authoritative handler');
assert(/\^\\\/api\\\/orders\\\/\[\^\/\]\+\\\/\(confirm\|complete\|cancel\|status\)\$/.test(source), 'legacy admin status alias uses the request-scoped store');
assert(/\^\\\/api\\\/admin\\\/orders\\\/\[\^\/\]\+\\\/status\$/.test(source), 'admin status route uses the request-scoped store');
assert(/dataStore\.orderReads\.getOrderForAdmin\(\{ orderId \}\)/.test(source), 'admin status resolves an exact order outside the latest-100 snapshot');
assert(/dataStore\.kind !== 'json' && dataStore\.orderWrites\?\.setAdminOrderStatus/.test(source), 'admin order status route uses postgres gateway');
assert(/async function setPostgresAdminOrderStatus/.test(source), 'admin order status has isolated postgres helper');
assert(/dataStore\.orderWrites\.setAdminOrderStatus/.test(source), 'admin helper calls status transaction');
assert(/statusLogId: postgresId\(\)/.test(source), 'admin order status uses uuid status log id');
assert(/draft\.settlementId = postgresId\(\)/.test(source), 'admin completed status prepares uuid settlement draft');
assert(/draft\.ledgerEntryId = postgresId\(\)/.test(source), 'admin completed status prepares uuid ledger draft');
assert(/recordAdminAction\(store, admin\.session, 'order_status_update'/.test(source), 'admin order status still records admin action');
assert(/return json\(nextOrder, 200, false\)/.test(source), 'admin order status avoids json save in postgres mode');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'admin-order-route-gateway',
        'request-scoped-admin-order-lookup',
        'legacy-admin-route-alias',
        'admin-action-log',
        'uuid-side-effect-ids',
        'completed-settlement-draft',
        'no-json-save',
      ],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres admin order route check failed: ${message}`);
}
