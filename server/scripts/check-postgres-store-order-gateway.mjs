import { createPostgresStore } from '../store/postgresStore.mjs';

const pool = createMockPool();
const store = createPostgresStore({
  databaseUrl: 'postgres://user:pass@127.0.0.1:5432/pp',
  poolFactory: () => pool,
});

assert(store.capabilities.orderWrites === true, 'postgres store advertises order writes');

const result = await store.orderWrites.createOrder({
  orderId: '00000000-0000-4000-8000-000000000821',
  orderNo: 'ST2607080001',
  userId: '00000000-0000-4000-8000-000000000822',
  companionId: '00000000-0000-4000-8000-000000000823',
  postId: '00000000-0000-4000-8000-000000000824',
  activityPricingId: '00000000-0000-4000-8000-000000000825',
  availabilitySlotId: '00000000-0000-4000-8000-000000000826',
  city: 'Shanghai',
  placeName: 'Wukang Road',
  placeAddress: 'Wukang Road',
  activityName: 'Citywalk',
  durationMinutes: 120,
  startAt: '2026-07-08T09:00:00.000Z',
  endAt: '2026-07-08T11:00:00.000Z',
  baseAmountCents: 39900,
  extraAmountCents: 3000,
  totalAmountCents: 42900,
  platformFeeCents: 3432,
  companionIncomeCents: 39468,
  userNote: 'first booking',
  paymentId: '00000000-0000-4000-8000-000000000827',
  paymentNo: 'PAY2607080001',
  paymentChannel: 'wechat_pay',
  lockedUntil: '2026-07-08T09:15:00.000Z',
  statusLogId: '00000000-0000-4000-8000-000000000828',
  extras: [
    {
      id: '00000000-0000-4000-8000-000000000829',
      extraId: '00000000-0000-4000-8000-000000000830',
      name: 'retouch',
      quantity: 1,
      unitPriceCents: 3000,
      amountCents: 3000,
    },
  ],
});

const client = pool.clients[0];
assert(result.order?.id === '00000000-0000-4000-8000-000000000821', 'order gateway returns inserted order');
assert(result.payment?.id === '00000000-0000-4000-8000-000000000827', 'order gateway returns inserted payment');
assert(client.calls.some((call) => /from availability_slots/i.test(call.sql) && /for update/i.test(call.sql)), 'order gateway locks slot');
assert(client.calls.some((call) => /insert into orders/i.test(call.sql)), 'order gateway inserts order');
assert(client.calls.some((call) => /insert into payments/i.test(call.sql)), 'order gateway inserts payment');
assert(client.calls.some((call) => /update availability_slots/i.test(call.sql)), 'order gateway updates slot');
assert(client.calls.some((call) => /^commit$/i.test(call.sql)), 'order gateway commits transaction');
assert(client.released === true, 'order gateway releases client');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['order-write-capability', 'create-order-gateway', 'client-release'],
      queryCount: client.calls.length,
    },
    null,
    2,
  ),
);

function createMockPool() {
  const clients = [];
  return {
    clients,
    async connect() {
      const client = createMockClient();
      clients.push(client);
      return client;
    },
  };
}

function createMockClient() {
  return {
    calls: [],
    released: false,
    async query(sql, params = []) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      this.calls.push({ sql: normalized, params });
      if (/from availability_slots/i.test(normalized)) return { rows: [{ id: params[0], status: 'available' }] };
      if (/insert into orders/i.test(normalized)) return { rows: [{ id: params[0], order_no: params[1] }] };
      if (/insert into payments/i.test(normalized)) return { rows: [{ id: params[0], status: 'pending' }] };
      return { rows: [] };
    },
    release() {
      this.released = true;
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres store order gateway check failed: ${message}`);
}
