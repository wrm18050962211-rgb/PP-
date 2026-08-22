import { buildStoreFromPostgresRows } from '../store/postgresMappers.mjs';

const legacyStore = buildStoreFromPostgresRows({
  companions: [],
  orders: [legacyOrderRow()],
});

assert(Array.isArray(legacyStore.merchants) && legacyStore.merchants.length === 0, 'missing merchant rows map to an empty list');
assert(Array.isArray(legacyStore.orderItems) && legacyStore.orderItems.length === 0, 'missing item rows map to an empty list');
assert(legacyStore.orders[0]?.serviceItems === undefined, 'legacy order shape stays unchanged without item rows');

const rows = {
  companions: [
    {
      id: 'photographer-1',
      user_id: 'user-photographer-1',
      display_name: 'Mori',
      base_city: '上海',
      status: 'approved',
      service_enabled: true,
    },
  ],
  merchants: [
    {
      id: 'merchant-1',
      owner_user_id: 'merchant-owner-1',
      name: '云裳造型',
      legal_name: '上海云裳造型工作室',
      status: 'active',
      city: '上海',
      timezone: 'Asia/Shanghai',
      business_hours: {},
      has_contact_phone: true,
      contact_phone_visibility: 'confirmed_order_only',
      contact_phone: '13800138000',
      service_enabled: true,
      created_at: '2026-08-01T00:00:00.000Z',
    },
  ],
  merchantOfferings: [
    {
      id: 'offering-1',
      merchant_id: 'merchant-1',
      offering_code: 'basic-makeup',
      version: 1,
      service_type: 'makeup',
      name: '基础妆发',
      duration_minutes: 90,
      fixed_price_cents: 29900,
      currency: 'CNY',
      inclusions: ['基础妆面', '发型'],
      enabled: true,
      created_at: '2026-08-01T00:00:00.000Z',
    },
  ],
  photographerMerchantLinks: [
    {
      id: 'link-1',
      companion_id: 'photographer-1',
      merchant_id: 'merchant-1',
      status: 'confirmed',
      photographer_confirmed_at: '2026-08-02T00:00:00.000Z',
      merchant_confirmed_at: '2026-08-02T01:00:00.000Z',
      is_primary: true,
      created_at: '2026-08-02T00:00:00.000Z',
    },
  ],
  orders: [
    {
      ...legacyOrderRow(),
      total_amount_cents: 67800,
    },
  ],
  // Reverse input order proves stable item_no ordering in the mapped contract.
  orderItems: [
    orderItemRow({
      id: 'item-makeup-1',
      item_no: 2,
      service_type: 'makeup',
      provider_type: 'merchant',
      provider_companion_id: null,
      provider_merchant_id: 'merchant-1',
      merchant_offering_id: 'offering-1',
      offering_version: 1,
      service_name_snapshot: '基础妆发（下单快照）',
      duration_minutes: 90,
      start_at: '2026-08-20T04:30:00.000Z',
      end_at: '2026-08-20T06:00:00.000Z',
      base_amount_cents: 29900,
      total_amount_cents: 29900,
      platform_subsidy_cents: 2000,
      user_payable_cents: 27900,
      platform_fee_cents: 2392,
      provider_income_cents: 27508,
      pricing_snapshot: { fixedPriceCents: 29900, offeringVersion: 1 },
    }),
    orderItemRow({
      id: 'item-photography-1',
      item_no: 1,
      service_type: 'photography',
      provider_type: 'companion',
      provider_companion_id: 'photographer-1',
      provider_merchant_id: null,
      merchant_offering_id: null,
      offering_version: null,
      service_name_snapshot: 'Citywalk 摄影',
      duration_minutes: 120,
      start_at: '2026-08-20T07:00:00.000Z',
      end_at: '2026-08-20T09:00:00.000Z',
      base_amount_cents: 39900,
      total_amount_cents: 39900,
      platform_fee_cents: 3192,
      provider_income_cents: 36708,
      pricing_snapshot: { activityPricingId: 'activity-1' },
    }),
  ],
};

const store = buildStoreFromPostgresRows(rows);
const order = store.orders[0];

assert(store.merchants[0]?.name === '云裳造型', 'merchant summary maps');
assert(store.merchants[0]?.hasContactPhone === true, 'merchant phone availability maps');
assert(!Object.hasOwn(store.merchants[0], 'contactPhone'), 'merchant phone value is excluded');
assert(!Object.hasOwn(store.merchants[0], 'ownerUserId'), 'public merchant summary excludes owner user id');
assert(!Object.hasOwn(store.merchants[0], 'legalName'), 'public merchant summary excludes legal name');
assert(!JSON.stringify(store.merchants).includes('13800138000'), 'over-broad row cannot leak merchant phone');
assert(store.merchantOfferings[0]?.fixedPriceCents === 29900, 'offering fixed price maps');
assert(store.merchantOfferings[0]?.durationMinutes === 90, 'offering duration maps');
assert(store.photographerMerchantLinks[0]?.photographerName === 'Mori', 'link resolves photographer name');
assert(store.photographerMerchantLinks[0]?.merchantName === '云裳造型', 'link resolves merchant name');
assert(order.serviceItems?.length === 2, 'aggregate order receives both service items');
assert(order.serviceItems[0]?.itemNo === 1 && order.serviceItems[1]?.itemNo === 2, 'service items sort by item number');
assert(order.serviceItems[0]?.provider.type === 'photographer', 'companion provider maps to photographer API role');
assert(order.serviceItems[1]?.provider.type === 'merchant', 'merchant provider maps');
assert(order.serviceItems[1]?.serviceName === '基础妆发（下单快照）', 'service name comes from the order snapshot');
assert(order.serviceItems[1]?.pricing.totalAmountCents === 29900, 'item amount comes from the order snapshot');
assert(order.serviceItems[1]?.pricing.platformSubsidyCents === 2000, 'public item exposes platform-funded subsidy');
assert(order.serviceItems[1]?.pricing.userPayableCents === 27900, 'public item exposes final user payable');
assert(!Object.hasOwn(order.serviceItems[1].pricing, 'platformFeeCents'), 'public item excludes platform fee');
assert(!Object.hasOwn(order.serviceItems[1].pricing, 'providerIncomeCents'), 'public item excludes provider income');
assert(!Object.hasOwn(order.serviceItems[1].pricing, 'snapshot'), 'public item excludes raw pricing snapshot');
assert(!Object.hasOwn(order.serviceItems[1], 'settlementStatus'), 'public item excludes settlement state');
assert(store.orderItems[1]?.pricing.platformFeeCents === 2392, 'internal item keeps platform fee');
assert(store.orderItems[1]?.pricing.providerIncomeCents === 27508, 'internal item keeps provider income');
assert(store.orderItems[1]?.pricing.snapshot.offeringVersion === 1, 'internal item keeps raw pricing snapshot');
assert(store.orderItems[1]?.settlementStatus === 'not_ready', 'internal item keeps settlement state');
assert(order.amountCents === 67800, 'parent total is not recomputed by the mapper');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'legacy-input-compatibility',
        'merchant-phone-redaction',
        'fixed-offering-map',
        'bilateral-link-map',
        'service-item-provider-map',
        'snapshot-map',
        'public-item-redaction',
        'internal-ledger-retention',
        'subsidy-user-payable-map',
        'stable-item-order',
        'parent-total-authority',
      ],
    },
    null,
    2,
  ),
);

function legacyOrderRow() {
  return {
    id: 'order-1',
    order_no: 'ST2608200001',
    user_id: 'user-1',
    companion_id: 'photographer-1',
    city: '上海',
    place_name: '武康路',
    activity_name: 'Citywalk',
    duration_minutes: 120,
    start_at: '2026-08-20T07:00:00.000Z',
    end_at: '2026-08-20T09:00:00.000Z',
    total_amount_cents: 39900,
    status: 'confirmed',
    created_at: '2026-08-19T08:00:00.000Z',
    updated_at: '2026-08-19T09:00:00.000Z',
  };
}

function orderItemRow(overrides) {
  const row = {
    order_id: 'order-1',
    service_description_snapshot: null,
    activity_pricing_id: null,
    timezone: 'Asia/Shanghai',
    extra_amount_cents: 0,
    discount_amount_cents: 0,
    currency: 'CNY',
    acceptance_status: 'accepted',
    accepted_at: '2026-08-19T09:00:00.000Z',
    fulfillment_status: 'not_started',
    refund_status: 'not_requested',
    refunded_amount_cents: 0,
    settlement_status: 'not_ready',
    source: 'composite',
    created_at: '2026-08-19T08:00:00.000Z',
    updated_at: '2026-08-19T09:00:00.000Z',
    ...overrides,
  };
  row.platform_subsidy_cents ??= 0;
  row.user_payable_cents ??= row.total_amount_cents - row.platform_subsidy_cents;
  return row;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Composite order mapper check failed: ${message}`);
}
