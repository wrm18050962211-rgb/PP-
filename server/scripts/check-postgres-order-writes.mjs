import { createOrderTransaction } from '../store/postgresOrderWrites.mjs';

const draft = {
  orderId: '00000000-0000-4000-8000-000000000001',
  orderNo: 'PP2606110001',
  userId: '00000000-0000-4000-8000-000000000002',
  companionId: '00000000-0000-4000-8000-000000000003',
  postId: '00000000-0000-4000-8000-000000000004',
  activityPricingId: '00000000-0000-4000-8000-000000000005',
  availabilitySlotId: '00000000-0000-4000-8000-000000000006',
  city: 'Shanghai',
  placeName: 'Wukang Road',
  placeAddress: 'Wukang Road, Xuhui District, Shanghai',
  activityName: 'Citywalk',
  durationMinutes: 120,
  startAt: '2026-06-12T06:00:00.000Z',
  endAt: '2026-06-12T08:00:00.000Z',
  baseAmountCents: 39900,
  extraAmountCents: 3900,
  totalAmountCents: 43800,
  platformFeeCents: 3504,
  companionIncomeCents: 40296,
  userNote: 'demo',
  paymentId: '00000000-0000-4000-8000-000000000007',
  paymentNo: 'PAY2606110001',
  paymentChannel: 'wechat_pay',
  statusLogId: '00000000-0000-4000-8000-000000000008',
  lockedUntil: '2026-06-11T12:10:00.000Z',
  extras: [
    {
      id: '00000000-0000-4000-8000-000000000009',
      extraId: '00000000-0000-4000-8000-000000000010',
      name: 'Retouched photos',
      quantity: 1,
      unitPriceCents: 3900,
      amountCents: 3900,
    },
  ],
};

const successClient = createMockClient([{ id: draft.availabilitySlotId, status: 'available' }]);
const result = await createOrderTransaction(successClient, draft);
const successSql = successClient.calls.map((call) => call.sql);

assert(result.order?.id === draft.orderId, 'returns inserted order');
assert(result.payment?.id === draft.paymentId, 'returns inserted payment');
assert(successSql[0] === 'begin', 'transaction begins first');
assert(successSql.some((sql) => /for update/i.test(sql)), 'locks availability slot for update');
assert(successSql.some((sql) => /insert into orders/i.test(sql)), 'inserts order');
assert(successSql.some((sql) => /insert into order_extras/i.test(sql)), 'inserts order extras');
assert(successSql.some((sql) => /insert into payments/i.test(sql)), 'inserts payment');
assert(successSql.some((sql) => /update availability_slots/i.test(sql) && /locked_order_id/i.test(sql)), 'locks slot to order');
assert(successSql.some((sql) => /insert into order_status_logs/i.test(sql)), 'inserts status log');
assert(successSql.at(-1) === 'commit', 'transaction commits last');

const unavailableClient = createMockClient([{ id: draft.availabilitySlotId, status: 'booked' }]);
await assertRejects(() => createOrderTransaction(unavailableClient, draft), 'Slot is not available', 'unavailable slot rejects');
assert(unavailableClient.calls.at(-1).sql === 'rollback', 'unavailable slot rolls back');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['begin', 'slot-for-update', 'insert-order', 'insert-extras', 'insert-payment', 'lock-slot', 'status-log', 'commit', 'rollback'],
      successQueryCount: successClient.calls.length,
    },
    null,
    2,
  ),
);

function createMockClient(slotRows) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      calls.push({ sql: normalized, params });
      if (/select id, status from availability_slots/i.test(normalized)) return { rows: slotRows };
      if (/insert into orders/i.test(normalized)) return { rows: [{ id: draft.orderId, status: 'pending_payment' }] };
      if (/insert into payments/i.test(normalized)) return { rows: [{ id: draft.paymentId, status: 'pending' }] };
      return { rows: [] };
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres order write check failed: ${message}`);
}

async function assertRejects(fn, messagePart, label) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(messagePart), label);
    return;
  }
  throw new Error(`Postgres order write check failed: ${label}`);
}
