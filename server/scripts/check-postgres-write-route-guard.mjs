import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

assert(/dataStore\.kind === 'json'\s*\?\s*expirePendingPaymentOrders\(store\)\s*:\s*false/.test(source), 'postgres mode skips JSON cleanup mutation');
assert(source.includes('POSTGRES_WRITE_ROUTE_NOT_CONNECTED'), 'postgres write route guard returns explicit error code');
assert(/dataStore\.kind !== 'json'[\s\S]*result\.changed/.test(source), 'postgres mode blocks unconnected changed routes before save');
assert(/if \(storeChanged \|\| cleanupChanged \|\| result\.changed\) await dataStore\.save\(store\)/.test(source), 'json mode still persists changed routes');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['skip-json-cleanup-in-postgres', 'postgres-write-route-guard', 'json-save-preserved'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres write route guard check failed: ${message}`);
}
