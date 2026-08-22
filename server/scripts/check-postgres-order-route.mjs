import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

assert(/dataStore\.kind !== 'json' && dataStore\.orderWrites\?\.createOrder/.test(source), 'postgres order route uses order write gateway');
assert(/dataStore\.kind !== 'json' && idempotencyKey && dataStore\.idempotencyWrites\?\.beginRequest/.test(source), 'postgres order route starts idempotency request');
assert(/async function createPostgresOrder/.test(source), 'postgres order route has isolated helper');
assert(/async function beginPostgresOrderIdempotency/.test(source), 'postgres order route has idempotency begin helper');
assert(/async function completePostgresOrderIdempotency/.test(source), 'postgres order route has idempotency complete helper');
assert(/dataStore\.idempotencyWrites\.beginRequest/.test(source), 'postgres order route calls idempotency begin gateway');
assert(/dataStore\.idempotencyWrites\.completeRequest/.test(source), 'postgres order route calls idempotency complete gateway');
assert(/IDEMPOTENCY_IN_PROGRESS/.test(source), 'postgres order route handles duplicate in-progress request');
assert(/dataStore\.orderWrites\.createOrder/.test(source), 'postgres helper calls create order transaction');
assert(/const orderId = dataStore\.kind !== 'json' \? postgresId\(\) : id\('order'\)/.test(source), 'postgres order route uses uuid order id');
assert(/const paymentId = dataStore\.kind !== 'json' \? postgresId\(\) : id\('payment'\)/.test(source), 'postgres order route uses uuid payment id');
assert(/idempotencyId: postgresId\(\)/.test(source), 'postgres order route uses uuid idempotency id');
assert(/availabilitySlotId: order\.slotId/.test(source), 'postgres order route passes slot id');
assert(/placeLat: order\.placeLat/.test(source) && /placeLng: order\.placeLng/.test(source), 'postgres order route passes legacy coordinates');
assert(/paymentId: payment\.id/.test(source), 'postgres order route passes payment id');
assert(/statusLogId: postgresId\(\)/.test(source), 'postgres order route creates uuid status log id');
assert(/id: postgresId\(\),[\s\S]*extraId: extra\.extraId/.test(source), 'postgres order route creates uuid extra row ids');
assert(/const responseBody = \{ \.\.\.order, payment: publicPayment\(payment\) \}/.test(source), 'postgres order route builds response body');
assert(/return json\(responseBody, 201, false\)/.test(source), 'postgres order route avoids json save');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['order-route-gateway', 'order-idempotency-begin', 'order-idempotency-complete', 'uuid-route-ids', 'slot-lock-draft', 'legacy-coordinate-draft', 'payment-draft', 'no-json-save'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres order route check failed: ${message}`);
}
