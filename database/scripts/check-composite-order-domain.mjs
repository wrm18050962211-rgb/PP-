import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { readCompositeOrderFeatureFlags } from '../../server/services/compositeOrderFeature.mjs';

const root = resolve(import.meta.dirname, '..');
const sql = await readFile(resolve(root, 'schema.sql'), 'utf8');
const prisma = await readFile(resolve(root, 'prisma/schema.prisma'), 'utf8');
const migration = await readFile(resolve(root, 'migrations/20260820_add_composite_order_domain.sql'), 'utf8');
const apiTypes = await readFile(resolve(root, '../pp-app/src/types/api.ts'), 'utf8');
const apiContract = await readFile(resolve(root, 'API_CONTRACT.md'), 'utf8');
const postgresStore = await readFile(resolve(root, '../server/store/postgresStore.mjs'), 'utf8');
const orderWrites = await readFile(resolve(root, '../server/store/postgresOrderWrites.mjs'), 'utf8');
const postgresMappers = await readFile(resolve(root, '../server/store/postgresMappers.mjs'), 'utf8');

const merchantSql = sqlTableBlock(sql, 'merchants');
const offeringSql = sqlTableBlock(sql, 'merchant_offerings');
const linkSql = sqlTableBlock(sql, 'photographer_merchant_links');
const itemSql = sqlTableBlock(sql, 'order_items');
const merchantPrisma = prismaModelBlock(prisma, 'Merchant');
const offeringPrisma = prismaModelBlock(prisma, 'MerchantOffering');
const linkPrisma = prismaModelBlock(prisma, 'PhotographerMerchantLink');
const itemPrisma = prismaModelBlock(prisma, 'OrderItem');

for (const table of ['merchants', 'merchant_offerings', 'photographer_merchant_links', 'order_items']) {
  assert(new RegExp(`create\\s+table\\s+${table}\\b`, 'i').test(sql), `SQL defines ${table}`);
  assert(new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+${table}\\b`, 'i').test(migration), `migration defines ${table}`);
  assert(new RegExp(`@@map\\("${table}"\\)`).test(prisma), `Prisma maps ${table}`);
}

assert(/contact_phone\s+varchar\(32\)\s+not null/i.test(merchantSql), 'merchant stores a contact phone');
assert(/contact_phone_visibility[\s\S]*confirmed_order_only/i.test(merchantSql), 'merchant phone is confirmed-order only');
assert(/contactPhone\s+String\s+@map\("contact_phone"\)/.test(merchantPrisma), 'Prisma stores merchant contact phone');

assert(/offering_code[\s\S]*version[\s\S]*duration_minutes[\s\S]*fixed_price_cents/i.test(offeringSql), 'offering stores versioned fixed price and duration');
assert(/unique\(merchant_id, offering_code, version\)/i.test(offeringSql), 'offering versions are unique per merchant and code');
assert(/fixedPriceCents\s+Int\s+@map\("fixed_price_cents"\)/.test(offeringPrisma), 'Prisma maps fixed offering price');
assert(/@@unique\(\[merchantId, offeringCode, version\]\)/.test(offeringPrisma), 'Prisma maps offering version uniqueness');
assert(/uq_merchant_offering_identity/.test(sql) && /uq_merchant_offering_identity/.test(offeringPrisma), 'SQL and Prisma map the offering identity used by order items');

assert(/photographer_confirmed_at/i.test(linkSql) && /merchant_confirmed_at/i.test(linkSql), 'link stores both confirmations');
assert(/status\s*=\s*'confirmed'[\s\S]*photographer_confirmed_at is not null[\s\S]*merchant_confirmed_at is not null/i.test(linkSql), 'confirmed link requires both confirmations');
assert(/uq_photographer_primary_merchant[\s\S]*where is_primary = true and status = 'confirmed'/i.test(sql), 'one confirmed primary merchant per photographer');
assert(/photographerConfirmedAt/.test(linkPrisma) && /merchantConfirmedAt/.test(linkPrisma) && /isPrimary/.test(linkPrisma), 'Prisma maps link confirmation fields');

for (const field of [
  'provider_type',
  'provider_companion_id',
  'provider_merchant_id',
  'service_name_snapshot',
  'duration_minutes',
  'start_at',
  'end_at',
  'pricing_snapshot',
  'platform_subsidy_cents',
  'user_payable_cents',
  'acceptance_status',
  'fulfillment_status',
  'refund_status',
  'settlement_status',
]) {
  assert(new RegExp(`\\b${field}\\b`, 'i').test(itemSql), `order_items includes ${field}`);
}

assert(/provider_type = 'companion'[\s\S]*provider_companion_id is not null[\s\S]*provider_merchant_id is null/i.test(itemSql), 'companion provider is exclusive');
assert(/provider_type = 'merchant'[\s\S]*provider_merchant_id is not null[\s\S]*provider_companion_id is null/i.test(itemSql), 'merchant provider is exclusive');
assert(/total_amount_cents = base_amount_cents \+ extra_amount_cents - discount_amount_cents/i.test(itemSql), 'item total is constrained to its snapshot lines');
assert(/user_payable_cents = total_amount_cents - platform_subsidy_cents/i.test(itemSql), 'user payable subtracts only the platform subsidy');
assert(/refunded_amount_cents >= 0 and refunded_amount_cents <= user_payable_cents/i.test(itemSql), 'item refund amount is bounded by user payment');
assert(/merchant_offering_id is not null and offering_version is not null and offering_version > 0/i.test(itemSql), 'merchant item requires a versioned offering');
assert(/foreign key \(merchant_offering_id, provider_merchant_id, offering_version, service_type\)[\s\S]*references merchant_offerings\(id, merchant_id, version, service_type\)/i.test(itemSql), 'merchant item identity matches its provider, version, and service type');
assert(/foreign key \(order_id, provider_companion_id\)[\s\S]*references orders\(id, companion_id\)/i.test(itemSql), 'photography item provider matches the aggregate photographer');
assert(/foreign key \(provider_companion_id, activity_pricing_id\)[\s\S]*references activity_pricings\(companion_id, id\)/i.test(itemSql), 'photography item pricing belongs to its provider');
assert(/serviceNameSnapshot/.test(itemPrisma) && /pricingSnapshot/.test(itemPrisma), 'Prisma maps immutable item snapshots');
assert(/platformSubsidyCents/.test(itemPrisma) && /userPayableCents/.test(itemPrisma), 'Prisma maps subsidy and user payable amounts');
assert(/acceptanceStatus/.test(itemPrisma) && /fulfillmentStatus/.test(itemPrisma) && /refundStatus/.test(itemPrisma) && /settlementStatus/.test(itemPrisma), 'Prisma maps item lifecycle states');
assert(/create constraint trigger trg_order_items_amount_conservation[\s\S]*deferrable initially deferred/i.test(sql), 'SQL defers aggregate amount conservation until transaction end');

assert(/^begin;/i.test(migration.trim()), 'migration starts a transaction');
assert(/commit;\s*$/i.test(migration), 'migration commits its transaction');
assert(/insert into order_items/i.test(migration), 'migration backfills service items');
assert(/create or replace function backfill_missing_photography_order_items\(\)/i.test(sql), 'canonical SQL exposes a repeatable activation backfill');
assert(/create or replace function backfill_missing_photography_order_items\(\)/i.test(migration), 'migration exposes a repeatable activation backfill');
assert(/'photography'::order_item_service_type/i.test(migration), 'legacy backfill creates photography items');
assert(/from orders o[\s\S]*where not exists[\s\S]*from order_items oi[\s\S]*oi\.order_id = o\.id/i.test(migration), 'legacy backfill is idempotent per order');
assert(/select max\(existing_item\.item_no\) \+ 1[\s\S]*existing_item\.order_id = o\.id/i.test(migration), 'legacy backfill allocates a collision-free item number');
assert(/create constraint trigger trg_order_items_amount_conservation[\s\S]*deferrable initially deferred/i.test(migration), 'migration installs deferred amount conservation');
assert(/require_service_items boolean[\s\S]*cannot remove its final service item/i.test(migration), 'service-item writes cannot delete the final item');
assert(/compositeOrderDomainEnabled[\s\S]*insert into order_items/i.test(orderWrites), 'enabled domain writes a photography item in the existing order transaction');
assert(/syncPrimaryPhotographyItemState[\s\S]*update order_items[\s\S]*acceptance_status[\s\S]*fulfillment_status[\s\S]*refund_status[\s\S]*settlement_status/i.test(orderWrites), 'enabled domain synchronizes the photography item lifecycle');
assert(/photographyItemId: compositeOrderDomainEnabled \? randomUUID\(\) : undefined/.test(postgresStore), 'disabled domain does not request a photography item write');
assert(/markPaymentPaidTransaction\(client, draft, compositeOrderDomainOptions\)/.test(postgresStore), 'store propagates the domain flag to lifecycle writes');
assert(/where oi\.order_id = any\(\$1::uuid\[\]\)/i.test(postgresStore), 'order items are loaded by the selected order ids');
assert(/from merchants[\s\S]*where id = any\(\$1::uuid\[\]\)/i.test(postgresStore), 'merchants are loaded by referenced ids');
assert(/COMPOSITE_ORDER_BACKFILL_REQUIRED/.test(postgresStore), 'enabled read model refuses an incomplete activation backfill');

const defaultFlags = readCompositeOrderFeatureFlags({});
const domainOnlyFlags = readCompositeOrderFeatureFlags({ ENABLE_COMPOSITE_ORDER_DOMAIN: 'true' });
assert(defaultFlags.domainEnabled === false, 'composite domain feature defaults off');
assert(defaultFlags.compositePaymentsEnabled === false, 'composite payments default off');
assert(domainOnlyFlags.domainEnabled === true, 'domain read flag can be enabled explicitly');
assert(domainOnlyFlags.compositePaymentsEnabled === false, 'domain flag cannot enable composite payments');

const merchantSummaryType = typeBlock(apiTypes, 'MerchantSummary');
const merchantContactType = typeBlock(apiTypes, 'MerchantOrderContact');
const publicOrderItemType = typeBlock(apiTypes, 'OrderServiceItem');
assert(/hasContactPhone:\s*boolean/.test(merchantSummaryType), 'public merchant summary exposes only phone availability');
assert(!/\bcontactPhone:\s*string/.test(merchantSummaryType), 'public merchant summary excludes phone value');
assert(!/ownerUserId|legalName/.test(merchantSummaryType), 'public merchant summary excludes internal ownership and legal identity');
assert(/contactPhone:\s*string/.test(merchantContactType), 'protected order contact has an explicit phone contract');
assert(/platformSubsidyCents:\s*number/.test(publicOrderItemType) && /userPayableCents:\s*number/.test(publicOrderItemType), 'public order item exposes subsidy and final payable amounts');
assert(!/platformFeeCents|providerIncomeCents|snapshot:|settlementStatus|currentOfferingVersion/.test(publicOrderItemType), 'public order item excludes internal ledger and mutable offering fields');
assert(/function toPublicOrderServiceItem/.test(postgresMappers), 'order attachment uses an explicit public DTO mapper');
assert(/serviceItems\?:\s*OrderServiceItem\[\]/.test(apiTypes), 'AppOrder supports optional service items');
assert(/不增加用户入口、不开放商家 API，也不启用真实组合支付/.test(apiContract), 'API contract records the disabled first-slice boundary');
assert(/discount_amount_cents.*服务方承担[\s\S]*user_payable_cents = total_amount_cents - platform_subsidy_cents/.test(apiContract), 'API contract fixes discount and subsidy semantics');
assert(/select backfill_missing_photography_order_items\(\)/.test(apiContract), 'API contract records the activation backfill gate');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'domain-tables',
        'phone-visibility-boundary',
        'versioned-fixed-offerings',
        'bilateral-primary-links',
        'provider-exclusivity',
        'provider-offering-identity',
        'photography-pricing-identity',
        'subsidy-user-payable',
        'deferred-amount-conservation',
        'price-time-lifecycle-snapshots',
        'idempotent-legacy-backfill',
        'collision-free-backfill',
        'activation-backfill-gate',
        'photography-item-lifecycle-sync',
        'feature-default-off',
        'public-dto-redaction',
        'api-contract-boundary',
      ],
    },
    null,
    2,
  ),
);

function sqlTableBlock(source, table) {
  const match = source.match(new RegExp(`create\\s+table\\s+${table}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i'));
  assert(match, `cannot extract SQL table ${table}`);
  return match[1];
}

function prismaModelBlock(source, model) {
  const match = source.match(new RegExp(`model\\s+${model}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  assert(match, `cannot extract Prisma model ${model}`);
  return match[1];
}

function typeBlock(source, name) {
  const match = source.match(new RegExp(`export\\s+type\\s+${name}\\s*=\\s*\\{([\\s\\S]*?)\\n\\};`, 'm'));
  assert(match, `cannot extract API type ${name}`);
  return match[1];
}

function assert(condition, message) {
  if (!condition) throw new Error(`Composite order domain check failed: ${message}`);
}
