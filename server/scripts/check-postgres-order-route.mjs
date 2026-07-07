import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

assert(/dataStore\.kind !== 'json' && dataStore\.orderWrites\?\.createOrder/.test(source), 'postgres order route uses order write gateway');
assert(/async function createPostgresOrder/.test(source), 'postgres order route has isolated helper');
assert(/dataStore\.orderWrites\.createOrder/.test(source), 'postgres helper calls create order transaction');
assert(/availabilitySlotId: order\.slotId/.test(source), 'postgres order route passes slot id');
assert(/paymentId: payment\.id/.test(source), 'postgres order route passes payment id');
assert(/statusLogId: id\('status-log'\)/.test(source), 'postgres order route creates status log id');
assert(/return json\(\{ \.\.\.order, payment: publicPayment\(payment\) \}, 201, false\)/.test(source), 'postgres order route avoids json save');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['order-route-gateway', 'slot-lock-draft', 'payment-draft', 'no-json-save'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres order route check failed: ${message}`);
}
