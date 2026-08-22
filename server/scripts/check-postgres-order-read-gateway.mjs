import {
  getOrderDetailForActor,
  getOrderDetailForAdmin,
  listOrdersForActor,
} from '../store/postgresOrderReads.mjs';
import { createPostgresStore } from '../store/postgresStore.mjs';

const ids = {
  user: '00000000-0000-4000-8000-000000000101',
  otherUser: '00000000-0000-4000-8000-000000000102',
  companion: '00000000-0000-4000-8000-000000000201',
  otherCompanion: '00000000-0000-4000-8000-000000000202',
  order1: '00000000-0000-4000-8000-000000000301',
  order2: '00000000-0000-4000-8000-000000000302',
  order3: '00000000-0000-4000-8000-000000000303',
  post: '00000000-0000-4000-8000-000000000401',
  pricing: '00000000-0000-4000-8000-000000000402',
  slot: '00000000-0000-4000-8000-000000000403',
  extra: '00000000-0000-4000-8000-000000000501',
  extraDefinition: '00000000-0000-4000-8000-000000000502',
  statusLog: '00000000-0000-4000-8000-000000000601',
  item: '00000000-0000-4000-8000-000000000701',
  merchant: '00000000-0000-4000-8000-000000000801',
  offering: '00000000-0000-4000-8000-000000000802',
};

const orderRows = [
  orderRow(ids.order1, '2026-08-23T10:00:00.000Z'),
  orderRow(ids.order2, '2026-08-23T09:00:00.000Z', { status: 'confirmed' }),
  orderRow(ids.order3, '2026-08-23T08:00:00.000Z', { status: 'completed' }),
];

const consumerClient = mockClient((sql, params) => {
  if (!/from orders o/i.test(sql)) throw new Error(`Unexpected consumer query: ${sql}`);
  return { rows: params[2] ? [orderRows[2]] : orderRows };
});

const firstPage = await listOrdersForActor(consumerClient, {
  role: 'consumer',
  userId: ids.user,
  limit: 2,
});

assert(firstPage.items.length === 2, 'consumer page respects requested limit');
assert(firstPage.hasMore === true && typeof firstPage.nextCursor === 'string', 'consumer page returns an opaque next cursor');
assert(/^[A-Za-z0-9_-]+$/.test(firstPage.nextCursor), 'cursor is URL-safe opaque data');
assert(firstPage.items.every((order) => !('creatorId' in order)), 'consumer summary omits creator identity fields');
assert(firstPage.items[0].locationSnapshot.address === '上海市徐汇区武康路', 'summary restores legacy address snapshot');
assert(firstPage.items[0].locationSnapshot.lat === 31.211 && firstPage.items[0].locationSnapshot.lng === 121.438, 'summary restores numeric coordinates');
assert(!('placeName' in firstPage.items[0]) && !('placeLat' in firstPage.items[0]), 'summary uses the exact locationSnapshot public shape');
assert(firstPage.items[0].dateLabel === '2026-08-24', 'summary date label uses the Shanghai service timezone');
assert(firstPage.items[0].timeLabel === '17:00-19:00', 'summary time label converts UTC instants to Shanghai wall time');
assertNoSensitiveFields(firstPage, 'consumer order page');

const midnightClient = mockClient(() => ({
  rows: [
    orderRow(ids.order1, '2026-08-23T10:00:00.000Z', {
      start_at: '2026-08-24T16:30:00.000Z',
      end_at: '2026-08-24T18:00:00.000Z',
    }),
  ],
}));
const midnightPage = await listOrdersForActor(midnightClient, { role: 'consumer', userId: ids.user });
assert(midnightPage.items[0].dateLabel === '2026-08-25', 'Shanghai conversion keeps the correct date across UTC midnight');
assert(midnightPage.items[0].timeLabel === '00:30-02:00', 'Shanghai conversion keeps the correct time across UTC midnight');

const partialCoordinateClient = mockClient(() => ({
  rows: [orderRow(ids.order1, '2026-08-23T10:00:00.000Z', { place_lat: '31.2110000', place_lng: null })],
}));
const partialCoordinatePage = await listOrdersForActor(partialCoordinateClient, { role: 'consumer', userId: ids.user });
assert(
  partialCoordinatePage.items[0].locationSnapshot.lat === null && partialCoordinatePage.items[0].locationSnapshot.lng === null,
  'partial legacy coordinates are returned as a null pair',
);

const invalidCoordinateClient = mockClient(() => ({
  rows: [orderRow(ids.order1, '2026-08-23T10:00:00.000Z', { place_lat: '91.0000000', place_lng: '121.4380000' })],
}));
const invalidCoordinatePage = await listOrdersForActor(invalidCoordinateClient, { role: 'consumer', userId: ids.user });
assert(
  invalidCoordinatePage.items[0].locationSnapshot.lat === null && invalidCoordinatePage.items[0].locationSnapshot.lng === null,
  'out-of-range persisted coordinates fail closed as a null pair',
);

const firstListCall = consumerClient.calls[0];
assert(/o\.user_id = \$1::uuid/i.test(firstListCall.sql), 'consumer ownership is enforced in SQL');
assert(/\(o\.created_at, o\.id\) < \(\$3::timestamptz, \$4::uuid\)/i.test(firstListCall.sql), 'list uses composite keyset pagination');
assert(/order by o\.created_at desc, o\.id desc/i.test(firstListCall.sql), 'list has deterministic keyset ordering');
assert(/limit \$5/i.test(firstListCall.sql), 'page limit is parameterized');
assert(firstListCall.params[0] === ids.user && firstListCall.params[4] === 3, 'consumer owner and limit+1 are query parameters');
assert(!firstListCall.sql.includes(ids.user), 'consumer owner id is never interpolated into SQL');
assert(!/select\s+\*/i.test(firstListCall.sql), 'order list never selects every database column');
assertNoSensitiveSql(firstListCall.sql, 'consumer list SQL');

const secondPage = await listOrdersForActor(consumerClient, {
  role: 'consumer',
  userId: ids.user,
  limit: 2,
  cursor: firstPage.nextCursor,
});
assert(secondPage.items.length === 1 && secondPage.items[0].id === ids.order3, 'cursor can continue the page');
assert(secondPage.nextCursor === null && secondPage.hasMore === false, 'last page closes pagination');
const secondListCall = consumerClient.calls[1];
assert(secondListCall.params[2] === '2026-08-23T09:00:00.000000Z', 'cursor timestamp preserves PostgreSQL microsecond precision');
assert(secondListCall.params[3] === ids.order2, 'cursor id is decoded into a query parameter');
assert(!consumerClient.calls.some((call) => /from order_items oi/i.test(call.sql)), 'service item table is not queried while the feature is disabled');

const microsecondRows = [
  orderRow(ids.order1, new Date('2026-08-23T10:00:00.000Z'), { created_at_cursor: '2026-08-23T10:00:00.000900Z' }),
  orderRow(ids.order2, new Date('2026-08-23T10:00:00.000Z'), { created_at_cursor: '2026-08-23T10:00:00.000100Z' }),
];
const microsecondClient = mockClient((_sql, params) => ({ rows: params[2] ? [microsecondRows[1]] : microsecondRows }));
const microsecondFirstPage = await listOrdersForActor(microsecondClient, {
  role: 'consumer',
  userId: ids.user,
  limit: 1,
});
const microsecondSecondPage = await listOrdersForActor(microsecondClient, {
  role: 'consumer',
  userId: ids.user,
  limit: 1,
  cursor: microsecondFirstPage.nextCursor,
});
assert(microsecondClient.calls[1].params[2] === '2026-08-23T10:00:00.000900Z', 'same-millisecond cursor keeps non-zero microseconds');
assert(microsecondSecondPage.items[0].id === ids.order2, 'same-millisecond continuation does not skip the next order');
await assertRejectsCode(
  () => listOrdersForActor(consumerClient, { role: 'consumer', userId: ids.otherUser, limit: 2, cursor: firstPage.nextCursor }),
  'ORDER_CURSOR_INVALID',
  400,
  'cursor cannot be reused for another actor',
);
await assertRejectsCode(
  () => listOrdersForActor(consumerClient, { role: 'consumer', userId: ids.user, status: 'confirmed', limit: 2, cursor: firstPage.nextCursor }),
  'ORDER_CURSOR_INVALID',
  400,
  'cursor cannot be reused with another status filter',
);

const companionClient = mockClient((sql) => {
  if (!/from orders o/i.test(sql)) throw new Error(`Unexpected companion query: ${sql}`);
  return { rows: [orderRows[0]] };
});
const companionPage = await listOrdersForActor(companionClient, {
  role: 'companion',
  userId: ids.otherUser,
  companionId: ids.companion,
  status: 'paid_pending_confirm',
  limit: 5,
});
assert(/o\.companion_id = \$1::uuid/i.test(companionClient.calls[0].sql), 'companion ownership is enforced in SQL');
assert(companionClient.calls[0].params[0] === ids.companion, 'companion query uses session companion id rather than user id');
assert(companionClient.calls[0].params[1] === 'paid_pending_confirm', 'status is a parameterized enum filter');
assert(companionPage.items[0].creatorId === ids.user, 'companion summary exposes the order creator id');
assert(companionPage.items[0].creatorName === 'Alice', 'companion summary exposes the creator display name');
assertNoSensitiveFields(companionPage, 'companion order page');

const detailRow = orderRow(ids.order1, '2026-08-23T10:00:00.000Z', {
  base_amount_cents: 39900,
  extra_amount_cents: 9000,
  total_amount_cents: 48900,
  user_note: '想拍自然一点',
  companion_note: '摄影师内部准备事项',
  cancel_reason: null,
  paid_at: '2026-08-23T10:05:00.000Z',
  confirmed_at: null,
  service_started_at: null,
  completed_at: null,
  cancelled_at: null,
  extras: [
    {
      id: ids.extra,
      extraId: ids.extraDefinition,
      name: '精修',
      quantity: 3,
      unitPriceCents: 3000,
      amountCents: 9000,
      createdAt: '2026-08-23T10:00:00.000Z',
      providerIncomeCents: 9000,
    },
  ],
  status_logs: [
    {
      id: ids.statusLog,
      fromStatus: null,
      toStatus: 'pending_payment',
      operatorId: ids.user,
      message: `${'Order created and slot locked. '.repeat(30)}private tail`,
      createdAt: '2026-08-23T10:00:00.000Z',
    },
  ],
  platform_fee_cents: 3912,
  companion_income_cents: 44988,
  creator_phone: '13800138000',
});

const consumerDetailClient = mockClient((sql) => {
  if (!/from orders o/i.test(sql)) throw new Error(`Unexpected consumer detail query: ${sql}`);
  return { rows: [detailRow] };
});
const consumerDetail = await getOrderDetailForActor(consumerDetailClient, {
  orderId: ids.order1,
  role: 'consumer',
  userId: ids.user,
});
assert(consumerDetail.addOns.length === 1 && consumerDetail.addOns[0].amountCents === 9000, 'detail maps snapshotted extras');
assert(consumerDetail.statusLogs.length === 1 && consumerDetail.statusLogs[0].toStatus === 'pending_payment', 'detail maps public status logs');
assert(consumerDetail.statusLogs[0].statusText === '待支付', 'detail maps localized public status text');
assert(consumerDetail.statusLogs[0].message === '订单已创建，等待支付', 'detail derives a safe public status message');
assert(!consumerDetail.statusLogs[0].message.includes('private tail'), 'detail never echoes a raw private status reason');
assert(!('operatorType' in consumerDetail.statusLogs[0]) && !('reason' in consumerDetail.statusLogs[0]), 'status logs omit operator metadata and raw reason');
assert(consumerDetail.userNote === '想拍自然一点', 'detail restores the consumer request note');
assert(!('companionNote' in consumerDetail), 'consumer detail omits the photographer private note');
assert(!('creatorId' in consumerDetail), 'consumer detail omits redundant creator identity');
assertNoSensitiveFields(consumerDetail, 'consumer order detail');
const consumerDetailCall = consumerDetailClient.calls[0];
assert(/o\.id = \$1::uuid[\s\S]*o\.user_id = \$2::uuid/i.test(consumerDetailCall.sql), 'consumer detail scopes id and owner in one query');
assert(consumerDetailCall.params[0] === ids.order1 && consumerDetailCall.params[1] === ids.user, 'consumer detail identifiers are parameters');
assert(/from order_extras oe/i.test(consumerDetailCall.sql), 'detail reads extras in the owned order statement');
assert(/from order_status_logs osl/i.test(consumerDetailCall.sql), 'detail reads status logs in the owned order statement');
assert(!/operator_id/i.test(consumerDetailCall.sql), 'detail does not select status-log operator ids');
assert(!/osl\.reason/i.test(consumerDetailCall.sql), 'detail does not select raw status-log reasons');
assertNoSensitiveSql(consumerDetailCall.sql, 'consumer detail SQL');
assert(consumerDetailClient.calls.length === 1, 'feature-off detail does not require order_items');

const serviceItemRow = {
  id: ids.item,
  order_id: ids.order1,
  item_no: 2,
  service_type: 'makeup',
  provider_type: 'merchant',
  provider_companion_id: null,
  provider_merchant_id: ids.merchant,
  activity_pricing_id: null,
  merchant_offering_id: ids.offering,
  offering_version: 3,
  service_name_snapshot: '妆造套餐',
  service_description_snapshot: '基础妆发',
  duration_minutes: 90,
  start_at: '2026-08-23T08:00:00.000Z',
  end_at: '2026-08-23T09:30:00.000Z',
  timezone: 'Asia/Shanghai',
  base_amount_cents: 29900,
  extra_amount_cents: 0,
  discount_amount_cents: 0,
  total_amount_cents: 29900,
  platform_subsidy_cents: 1000,
  user_payable_cents: 28900,
  platform_fee_cents: 2392,
  provider_income_cents: 27508,
  pricing_snapshot: { internal: true },
  currency: 'CNY',
  acceptance_status: 'accepted',
  acceptance_deadline_at: null,
  accepted_at: '2026-08-23T07:00:00.000Z',
  declined_at: null,
  decline_reason: null,
  fulfillment_status: 'not_started',
  service_started_at: null,
  completed_at: null,
  cancelled_at: null,
  refund_status: 'not_requested',
  refunded_amount_cents: 0,
  settlement_status: 'not_ready',
  source: 'composite',
  created_at: '2026-08-23T07:00:00.000Z',
  updated_at: '2026-08-23T07:00:00.000Z',
  provider_companion_name: null,
  provider_merchant_name: '春日造型馆',
  contact_phone: '021-12345678',
};

const serviceItemClient = mockClient((sql) => {
  if (/from order_items oi/i.test(sql)) return { rows: [serviceItemRow] };
  if (/from orders o/i.test(sql)) return { rows: [detailRow] };
  throw new Error(`Unexpected service item query: ${sql}`);
});
const companionDetail = await getOrderDetailForActor(serviceItemClient, {
  orderId: ids.order1,
  role: 'companion',
  companionId: ids.companion,
  includeServiceItems: true,
});
assert(companionDetail.creatorId === ids.user && companionDetail.creatorName === 'Alice', 'companion detail includes creator identity');
assert(companionDetail.companionNote === '摄影师内部准备事项', 'companion detail can restore its private note');
assert(companionDetail.serviceItems.length === 1, 'feature-on detail hydrates service items');
assert(companionDetail.serviceItems[0].provider.name === '春日造型馆', 'service item exposes safe provider identity');
assert(companionDetail.serviceItems[0].pricing.userPayableCents === 28900, 'service item exposes user-facing payable amount');
assert(!('declineReason' in companionDetail.serviceItems[0].acceptance), 'service item omits the internal decline reason');
assertNoSensitiveFields(companionDetail, 'feature-on companion detail');
const serviceItemCall = serviceItemClient.calls.find((call) => /from order_items oi/i.test(call.sql));
assert(serviceItemCall && serviceItemCall.params[0][0] === ids.order1, 'service items are queried only for the owned order id');
assertNoSensitiveSql(serviceItemCall.sql, 'public service item SQL');

const notFoundClient = mockClient(() => ({ rows: [] }));
await assertRejectsCode(
  () => getOrderDetailForActor(notFoundClient, { orderId: ids.order1, role: 'consumer', userId: ids.otherUser }),
  'ORDER_NOT_FOUND',
  404,
  'cross-owner and missing details share a non-enumerating error',
);
assert(notFoundClient.calls.length === 1 && /o\.user_id = \$2::uuid/i.test(notFoundClient.calls[0].sql), 'not-found lookup still includes ownership in SQL');

const adminClient = mockClient(() => ({ rows: [detailRow] }));
const adminDetail = await getOrderDetailForAdmin(adminClient, { orderId: ids.order1 });
assert(adminDetail.id === ids.order1 && adminDetail.creatorId === ids.user, 'admin lookup returns the safe full order detail');
assert(adminClient.calls[0].params.length === 1 && adminClient.calls[0].params[0] === ids.order1, 'admin lookup queries one exact order id');
assert(!/o\.(user_id|companion_id) = \$2::uuid/i.test(adminClient.calls[0].sql), 'admin lookup does not depend on a public owner predicate');
assertNoSensitiveFields(adminDetail, 'admin order detail');

const invalidClient = mockClient(() => {
  throw new Error('invalid input must fail before querying PostgreSQL');
});
await assertRejectsCode(
  () => listOrdersForActor(invalidClient, { role: 'admin', userId: ids.user }),
  'ORDER_ROLE_INVALID',
  400,
  'admin is not a public order-read role',
);
await assertRejectsCode(
  () => listOrdersForActor(invalidClient, { role: 'consumer', userId: 'not-a-uuid' }),
  'ORDER_OWNER_INVALID',
  400,
  'consumer owner id is validated',
);
await assertRejectsCode(
  () => listOrdersForActor(invalidClient, { role: 'companion', companionId: '' }),
  'ORDER_OWNER_INVALID',
  400,
  'companion owner id is required',
);
await assertRejectsCode(
  () => listOrdersForActor(invalidClient, { role: 'consumer', userId: ids.user, status: 'unknown' }),
  'ORDER_STATUS_INVALID',
  400,
  'status is validated',
);
for (const invalidLimit of ['', 0, 51, 1.5, '20.0', '2e1', 'many']) {
  await assertRejectsCode(
    () => listOrdersForActor(invalidClient, { role: 'consumer', userId: ids.user, limit: invalidLimit }),
    'ORDER_LIMIT_INVALID',
    400,
    `limit ${JSON.stringify(invalidLimit)} is rejected`,
  );
}
for (const invalidCursor of ['', 'not_base64', 'e30']) {
  await assertRejectsCode(
    () => listOrdersForActor(invalidClient, { role: 'consumer', userId: ids.user, cursor: invalidCursor }),
    'ORDER_CURSOR_INVALID',
    400,
    `cursor ${JSON.stringify(invalidCursor)} is rejected`,
  );
}
await assertRejectsCode(
  () => listOrdersForActor(invalidClient, { role: 'consumer', userId: ids.user, cursor: 'a'.repeat(513) }),
  'ORDER_CURSOR_INVALID',
  400,
  'cursor length is bounded consistently with request security',
);
await assertRejectsCode(
  () => listOrdersForActor(invalidClient, { role: 'consumer', userId: ids.user, includeServiceItems: 'true' }),
  'ORDER_SERVICE_ITEMS_OPTION_INVALID',
  400,
  'service item feature option must be boolean',
);
await assertRejectsCode(
  () => getOrderDetailForActor(invalidClient, { orderId: 'local-order', role: 'consumer', userId: ids.user }),
  'ORDER_NOT_FOUND',
  404,
  'invalid and missing order ids share the non-enumerating response',
);
assert(invalidClient.calls.length === 0, 'invalid inputs never reach PostgreSQL');

const databaseFailure = Object.assign(new Error('database unavailable'), { code: 'ECONNRESET' });
const failingClient = mockClient(() => {
  throw databaseFailure;
});
try {
  await listOrdersForActor(failingClient, { role: 'consumer', userId: ids.user });
  throw new Error('database failure should reject');
} catch (error) {
  assert(error?.code === 'ORDER_READ_FAILED' && error?.status === 503, 'database failures use a stable unavailable error');
  assert(error?.cause === databaseFailure, 'stable database error preserves its private cause for server logging');
}

const invalidTimestampClient = mockClient(() => ({ rows: [orderRow(ids.order1, 'not-a-date')] }));
await assertRejectsCode(
  () => listOrdersForActor(invalidTimestampClient, { role: 'consumer', userId: ids.user }),
  'ORDER_READ_FAILED',
  503,
  'invalid persisted timestamps fail closed instead of becoming a fake epoch date',
);

const disabledStorePool = mockPool((sql) => {
  if (/from orders o/i.test(sql)) return { rows: [orderRows[0]] };
  throw new Error(`Unexpected disabled store query: ${sql}`);
});
const disabledStore = createPostgresStore({
  databaseUrl: 'postgres://user:pass@127.0.0.1:5432/pp',
  poolFactory: () => disabledStorePool,
  featureFlags: { domainEnabled: false },
});
await disabledStore.orderReads.listOrders({
  role: 'consumer',
  userId: ids.user,
  includeServiceItems: true,
});
assert(disabledStore.capabilities.orderReads === true, 'postgres store advertises authoritative order reads');
assert(!disabledStorePool.clients[0].calls.some((call) => /from order_items oi/i.test(call.sql)), 'disabled store flag cannot be overridden by a caller');
assert(disabledStorePool.clients[0].released === true, 'store order read releases its PostgreSQL client');

const enabledStorePool = mockPool((sql) => {
  if (/from order_items oi/i.test(sql)) return { rows: [serviceItemRow] };
  if (/from orders o/i.test(sql)) return { rows: [detailRow] };
  throw new Error(`Unexpected enabled store query: ${sql}`);
});
const enabledStore = createPostgresStore({
  databaseUrl: 'postgres://user:pass@127.0.0.1:5432/pp',
  poolFactory: () => enabledStorePool,
  featureFlags: { domainEnabled: true },
});
const enabledStoreDetail = await enabledStore.orderReads.getOrder({
  orderId: ids.order1,
  role: 'consumer',
  userId: ids.user,
  includeServiceItems: false,
});
assert(enabledStoreDetail.serviceItems?.length === 1, 'enabled store flag cannot be disabled by a caller');
assert(enabledStorePool.clients[0].released === true, 'enabled store detail releases its PostgreSQL client');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'consumer-owner-scope',
        'companion-owner-scope',
        'parameterized-keyset-pagination',
        'microsecond-keyset-cursor',
        'opaque-cursor-continuation',
        'legacy-location-snapshot',
        'shanghai-display-timezone',
        'detail-extras-and-status-logs',
        'role-aware-public-dto',
        'feature-gated-service-items',
        'sensitive-field-redaction',
        'non-enumerating-not-found',
        'admin-exact-order-lookup',
        'stable-input-errors',
        'database-error-propagation',
        'store-capability-and-client-release',
        'store-owned-service-item-feature-flag',
      ],
      queryCount: consumerClient.calls.length + companionClient.calls.length + consumerDetailClient.calls.length + serviceItemClient.calls.length,
    },
    null,
    2,
  ),
);

function orderRow(id, createdAt, patch = {}) {
  return {
    id,
    order_no: `PP-${id.slice(-3)}`,
    status: 'paid_pending_confirm',
    city: '上海',
    place_name: '武康路',
    place_address: '上海市徐汇区武康路',
    place_lat: '31.2110000',
    place_lng: '121.4380000',
    activity_name: 'Citywalk',
    duration_minutes: 120,
    start_at: '2026-08-24T09:00:00.000Z',
    end_at: '2026-08-24T11:00:00.000Z',
    total_amount_cents: 39900,
    companion_id: ids.companion,
    creator_id: ids.user,
    post_id: ids.post,
    activity_pricing_id: ids.pricing,
    availability_slot_id: ids.slot,
    created_at: createdAt,
    created_at_cursor: String(createdAt).replace(/\.(\d{3})Z$/, (_match, milliseconds) => `.${milliseconds}000Z`),
    updated_at: createdAt,
    companion_name: 'Mori',
    companion_avatar_url: 'https://cdn.example.com/mori.jpg',
    creator_name: 'Alice',
    creator_avatar_url: 'https://cdn.example.com/alice.jpg',
    ...patch,
  };
}

function mockClient(responder) {
  return {
    calls: [],
    async query(sql, params = []) {
      const normalized = String(sql).trim().replace(/\s+/g, ' ');
      this.calls.push({ sql: normalized, params });
      return responder(normalized, params, this.calls.length - 1);
    },
  };
}

function mockPool(responder) {
  return {
    clients: [],
    async connect() {
      const client = mockClient(responder);
      client.released = false;
      client.release = () => {
        client.released = true;
      };
      this.clients.push(client);
      return client;
    },
  };
}

function assertNoSensitiveFields(value, label) {
  const forbiddenKeys = new Set([
    'userId',
    'phone',
    'creatorPhone',
    'companionPhone',
    'contactPhone',
    'platformFeeCents',
    'companionIncomeCents',
    'providerIncomeCents',
    'pricingSnapshot',
    'settlementStatus',
    'operatorId',
    'operatorType',
    'reason',
    'rawCallback',
  ]);
  walk(value, (key) => assert(!forbiddenKeys.has(key), `${label} omits sensitive field ${key}`));
}

function assertNoSensitiveSql(sql, label) {
  for (const field of [
    'platform_fee_cents',
    'companion_income_cents',
    'provider_income_cents',
    'pricing_snapshot',
    'settlement_status',
    'contact_phone',
    'raw_callback',
    'decline_reason',
  ]) {
    assert(!sql.toLowerCase().includes(field), `${label} does not select ${field}`);
  }
}

function walk(value, visitor) {
  if (Array.isArray(value)) {
    value.forEach((item) => walk(item, visitor));
    return;
  }
  if (!value || typeof value !== 'object') return;
  for (const [key, entry] of Object.entries(value)) {
    visitor(key, entry);
    walk(entry, visitor);
  }
}

async function assertRejectsCode(fn, code, status, label) {
  try {
    await fn();
  } catch (error) {
    assert(error?.code === code, `${label}: expected ${code}, received ${error?.code || error}`);
    assert(error?.status === status, `${label}: expected status ${status}, received ${error?.status}`);
    return;
  }
  throw new Error(`Postgres order read gateway check failed: ${label}: expected rejection`);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres order read gateway check failed: ${message}`);
}
