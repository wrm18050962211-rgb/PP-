import { createPostgresStore } from '../store/postgresStore.mjs';

const defaultPool = createMockPool();
const defaultStore = createPostgresStore({
  databaseUrl: 'postgres://user:pass@127.0.0.1:5432/pp',
  poolFactory: () => defaultPool,
});
const defaultResult = await defaultStore.load();

assert(defaultStore.capabilities.compositeOrderDomain === false, 'composite domain capability defaults off');
assert(defaultStore.capabilities.compositeOrderPayments === false, 'composite payments capability is always off in this slice');
assert(!defaultPool.calls.some((call) => /from merchants/i.test(call.sql)), 'disabled domain does not query merchants');
assert(!defaultPool.calls.some((call) => /from order_items/i.test(call.sql)), 'disabled domain does not query order items');
assert(defaultResult.store.orders[0]?.serviceItems === undefined, 'legacy order shape is unchanged while disabled');

const enabledPool = createMockPool();
const enabledStore = createPostgresStore({
  databaseUrl: 'postgres://user:pass@127.0.0.1:5432/pp',
  poolFactory: () => enabledPool,
  featureFlags: { domainEnabled: true, compositePaymentsEnabled: false },
});
const enabledResult = await enabledStore.load();
const loadedStore = enabledResult.store;
const order = loadedStore.orders[0];
const merchant = loadedStore.merchants[0];

assert(enabledResult.changed === false, 'composite read model remains read-only');
assert(enabledStore.capabilities.compositeOrderDomain === true, 'composite domain capability reflects explicit flag');
assert(enabledStore.capabilities.compositeOrderPayments === false, 'enabling reads does not enable payments');
assert(enabledPool.calls.some((call) => /from merchants/i.test(call.sql)), 'enabled domain queries merchants');
assert(enabledPool.calls.some((call) => /from merchant_offerings/i.test(call.sql)), 'enabled domain queries merchant offerings');
assert(enabledPool.calls.some((call) => /from photographer_merchant_links/i.test(call.sql)), 'enabled domain queries photographer links');
assert(enabledPool.calls.some((call) => /from order_items/i.test(call.sql)), 'enabled domain queries order items');
assert(
  enabledPool.calls.some((call) => /from order_items oi[\s\S]*where oi\.order_id = any\(\$1::uuid\[\]\)/i.test(call.sql)),
  'order items are scoped to the loaded order ids',
);
assert(enabledPool.calls.some((call) => /from merchants[\s\S]*where id = any\(\$1::uuid\[\]\)/i.test(call.sql)), 'merchant rows are fetched by referenced ids');
assert(enabledPool.calls.some((call) => /from merchant_offerings[\s\S]*id = any\(\$1::uuid\[\]\)/i.test(call.sql)), 'offering rows are fetched by referenced ids');
assert(merchant.hasContactPhone === true, 'merchant read model keeps phone availability');
assert(!Object.hasOwn(merchant, 'contactPhone'), 'merchant read model omits the phone value');
assert(!Object.hasOwn(merchant, 'ownerUserId') && !Object.hasOwn(merchant, 'legalName'), 'public merchant read model omits owner and legal identity');
assert(!JSON.stringify(merchant).includes('13800138000'), 'merchant phone cannot leak through mapped data');
assert(loadedStore.merchantOfferings[0]?.fixedPriceCents === 29900, 'fixed offering price maps');
assert(loadedStore.photographerMerchantLinks[0]?.isPrimary === true, 'confirmed primary link maps');
assert(order?.serviceItems?.length === 2, 'photography and makeup items attach to one aggregate order');
assert(order.serviceItems[0]?.provider.type === 'photographer', 'photography provider maps to photographer contract');
assert(order.serviceItems[1]?.provider.name === '云裳造型', 'merchant provider name maps');
assert(order.serviceItems[1]?.pricing.totalAmountCents === 29900, 'order item uses locked price snapshot');
assert(order.serviceItems[1]?.pricing.userPayableCents === 27900, 'order item maps final user payable');
assert(!Object.hasOwn(order.serviceItems[1].pricing, 'platformFeeCents'), 'public order item omits internal platform fee');
assert(!Object.hasOwn(order.serviceItems[1].pricing, 'providerIncomeCents'), 'public order item omits internal provider income');
assert(!Object.hasOwn(order.serviceItems[1].pricing, 'snapshot'), 'public order item omits internal snapshot');
assert(!Object.hasOwn(order.serviceItems[1], 'settlementStatus'), 'public order item omits settlement status');
assert(loadedStore.orderItems[1]?.pricing.platformFeeCents === 2392, 'internal item retains platform fee');
assert(loadedStore.orderItems[1]?.settlementStatus === 'not_ready', 'internal item retains settlement status');
assert(order.amountCents === 67800, 'aggregate order total remains database authoritative');

const missingItemPool = createMockPool({ omitOrderItems: true });
const guardedStore = createPostgresStore({
  databaseUrl: 'postgres://user:pass@127.0.0.1:5432/pp',
  poolFactory: () => missingItemPool,
  featureFlags: { domainEnabled: true, compositePaymentsEnabled: false },
});
await assertRejects(
  () => guardedStore.load(),
  'COMPOSITE_ORDER_BACKFILL_REQUIRED',
  'enabled domain refuses an incomplete photography-item backfill',
);

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'feature-default-off',
        'no-disabled-domain-queries',
        'domain-read-capability',
        'scoped-order-item-query',
        'merchant-phone-redaction',
        'offering-and-link-mapping',
        'aggregate-service-item-assembly',
        'public-item-redaction',
        'activation-backfill-guard',
        'composite-payment-disabled',
      ],
      enabledQueryCount: enabledPool.calls.length,
      serviceItemCount: order.serviceItems.length,
    },
    null,
    2,
  ),
);

function createMockPool({ omitOrderItems = false } = {}) {
  return {
    calls: [],
    async query(sql, params = []) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      this.calls.push({ sql: normalized, params });

      if (/from order_items oi/i.test(normalized)) {
        if (omitOrderItems) return { rows: [] };
        return {
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000a01',
              order_id: '00000000-0000-4000-8000-000000000901',
              item_no: 1,
              service_type: 'photography',
              provider_type: 'companion',
              provider_companion_id: '00000000-0000-4000-8000-000000000902',
              provider_merchant_id: null,
              activity_pricing_id: '00000000-0000-4000-8000-000000000905',
              merchant_offering_id: null,
              offering_version: null,
              service_name_snapshot: 'Citywalk',
              service_description_snapshot: null,
              duration_minutes: 120,
              start_at: '2026-08-20T07:00:00.000Z',
              end_at: '2026-08-20T09:00:00.000Z',
              timezone: 'Asia/Shanghai',
              base_amount_cents: 39900,
              extra_amount_cents: 0,
              discount_amount_cents: 0,
              total_amount_cents: 39900,
              platform_subsidy_cents: 0,
              user_payable_cents: 39900,
              platform_fee_cents: 3192,
              provider_income_cents: 36708,
              currency: 'CNY',
              pricing_snapshot: { activityPricingId: '00000000-0000-4000-8000-000000000905' },
              acceptance_status: 'accepted',
              accepted_at: '2026-08-19T09:00:00.000Z',
              fulfillment_status: 'not_started',
              refund_status: 'not_requested',
              refunded_amount_cents: 0,
              settlement_status: 'not_ready',
              source: 'composite',
              created_at: '2026-08-19T08:00:00.000Z',
              updated_at: '2026-08-19T09:00:00.000Z',
            },
            {
              id: '00000000-0000-4000-8000-000000000a02',
              order_id: '00000000-0000-4000-8000-000000000901',
              item_no: 2,
              service_type: 'makeup',
              provider_type: 'merchant',
              provider_companion_id: null,
              provider_merchant_id: '00000000-0000-4000-8000-000000000a10',
              activity_pricing_id: null,
              merchant_offering_id: '00000000-0000-4000-8000-000000000a11',
              offering_version: 1,
              service_name_snapshot: '基础妆发',
              service_description_snapshot: '一次完整妆发',
              duration_minutes: 90,
              start_at: '2026-08-20T04:30:00.000Z',
              end_at: '2026-08-20T06:00:00.000Z',
              timezone: 'Asia/Shanghai',
              base_amount_cents: 29900,
              extra_amount_cents: 0,
              discount_amount_cents: 0,
              total_amount_cents: 29900,
              platform_subsidy_cents: 2000,
              user_payable_cents: 27900,
              platform_fee_cents: 2392,
              provider_income_cents: 27508,
              currency: 'CNY',
              pricing_snapshot: { offeringCode: 'basic-makeup', offeringVersion: 1, fixedPriceCents: 29900 },
              acceptance_status: 'accepted',
              accepted_at: '2026-08-19T09:10:00.000Z',
              fulfillment_status: 'not_started',
              refund_status: 'not_requested',
              refunded_amount_cents: 0,
              settlement_status: 'not_ready',
              source: 'composite',
              created_at: '2026-08-19T08:00:00.000Z',
              updated_at: '2026-08-19T09:10:00.000Z',
            },
          ],
        };
      }

      if (/from merchant_offerings/i.test(normalized)) {
        return {
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000a11',
              merchant_id: '00000000-0000-4000-8000-000000000a10',
              offering_code: 'basic-makeup',
              version: 1,
              service_type: 'makeup',
              name: '基础妆发',
              description: '一次完整妆发',
              duration_minutes: 90,
              fixed_price_cents: 29900,
              currency: 'CNY',
              inclusions: ['基础妆面', '发型'],
              enabled: true,
              published_at: '2026-08-01T00:00:00.000Z',
              retired_at: null,
              created_at: '2026-08-01T00:00:00.000Z',
              updated_at: '2026-08-01T00:00:00.000Z',
            },
          ],
        };
      }

      if (/from photographer_merchant_links/i.test(normalized)) {
        return {
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000a12',
              companion_id: '00000000-0000-4000-8000-000000000902',
              merchant_id: '00000000-0000-4000-8000-000000000a10',
              status: 'confirmed',
              relationship_label: '可搭配云裳妆造与服装',
              photographer_confirmed_at: '2026-08-02T00:00:00.000Z',
              merchant_confirmed_at: '2026-08-02T01:00:00.000Z',
              is_primary: true,
              rejected_at: null,
              ended_at: null,
              created_at: '2026-08-02T00:00:00.000Z',
              updated_at: '2026-08-02T01:00:00.000Z',
            },
          ],
        };
      }

      if (/from merchants/i.test(normalized)) {
        return {
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000a10',
              owner_user_id: null,
              name: '云裳造型',
              legal_name: '上海云裳造型工作室',
              status: 'active',
              city: '上海',
              address: '静安区示例路 1 号',
              timezone: 'Asia/Shanghai',
              business_hours: { monday: [['10:00', '20:00']] },
              has_contact_phone: true,
              contact_phone_visibility: 'confirmed_order_only',
              // Even a malicious/over-broad DB adapter result must be dropped.
              contact_phone: '13800138000',
              service_enabled: true,
              created_at: '2026-08-01T00:00:00.000Z',
              updated_at: '2026-08-01T00:00:00.000Z',
            },
          ],
        };
      }

      if (/from companions/i.test(normalized)) {
        return {
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000902',
              user_id: '00000000-0000-4000-8000-000000000903',
              display_name: 'Mori',
              base_city: '上海',
              gender: 'female',
              status: 'approved',
              service_enabled: true,
              rating_avg: '4.9',
              rating_count: 12,
              created_at: '2026-08-01T00:00:00.000Z',
              updated_at: '2026-08-01T00:00:00.000Z',
            },
          ],
        };
      }

      if (/from orders/i.test(normalized)) {
        return {
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000901',
              order_no: 'ST2608200001',
              user_id: '00000000-0000-4000-8000-000000000904',
              companion_id: '00000000-0000-4000-8000-000000000902',
              post_id: null,
              activity_pricing_id: '00000000-0000-4000-8000-000000000905',
              availability_slot_id: null,
              city: '上海',
              place_name: '武康路',
              activity_name: 'Citywalk',
              duration_minutes: 120,
              start_at: '2026-08-20T07:00:00.000Z',
              end_at: '2026-08-20T09:00:00.000Z',
              total_amount_cents: 67800,
              status: 'confirmed',
              created_at: '2026-08-19T08:00:00.000Z',
              updated_at: '2026-08-19T09:10:00.000Z',
            },
          ],
        };
      }

      return { rows: [] };
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres composite order read-model check failed: ${message}`);
}

async function assertRejects(fn, expectedCode, message) {
  try {
    await fn();
  } catch (error) {
    assert(error?.code === expectedCode, message);
    return;
  }
  throw new Error(`Postgres composite order read-model check failed: ${message}`);
}
