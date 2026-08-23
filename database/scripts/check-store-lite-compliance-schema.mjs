import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sql = await readFile(resolve(root, 'schema.sql'), 'utf8');
const prisma = await readFile(resolve(root, 'prisma/schema.prisma'), 'utf8');
const migration = await readFile(
  resolve(root, 'migrations/20260823_add_store_lite_compliance_requests.sql'),
  'utf8',
);

const reportSql = sqlTableBlock(sql, 'reports');
const requestSql = sqlTableBlock(sql, 'user_requests');
const requestLogSql = sqlTableBlock(sql, 'user_request_status_logs');
const blockSql = sqlTableBlock(sql, 'user_companion_blocks');
const migrationRequestSql = sqlTableBlock(migration, 'user_requests');
const migrationRequestLogSql = sqlTableBlock(migration, 'user_request_status_logs');
const migrationBlockSql = sqlTableBlock(migration, 'user_companion_blocks');
const reportPrisma = prismaModelBlock(prisma, 'Report');
const requestPrisma = prismaModelBlock(prisma, 'UserRequest');
const requestLogPrisma = prismaModelBlock(prisma, 'UserRequestStatusLog');
const blockPrisma = prismaModelBlock(prisma, 'UserCompanionBlock');

assert(normalizeSql(requestSql) === normalizeSql(migrationRequestSql), 'canonical and migration user-request tables match');
assert(normalizeSql(requestLogSql) === normalizeSql(migrationRequestLogSql), 'canonical and migration request-status tables match');
assert(normalizeSql(blockSql) === normalizeSql(migrationBlockSql), 'canonical and migration companion-block tables match');

for (const source of [sql, migration]) {
  assertEnumValues(source, 'report_context', ['order', 'store_lite_content']);
  assertEnumValues(source, 'user_request_type', ['support', 'data_access', 'data_copy', 'account_deletion']);
  assertEnumValues(source, 'user_request_status', ['submitted', 'processing', 'completed', 'declined', 'cancelled']);
  assertEnumValues(source, 'user_request_actor_type', ['user', 'admin', 'system']);
}
assertPrismaEnumValues(prisma, 'ReportContext', ['order', 'store_lite_content']);
assertPrismaEnumValues(prisma, 'UserRequestType', ['support', 'data_access', 'data_copy', 'account_deletion']);
assertPrismaEnumValues(prisma, 'UserRequestStatus', ['submitted', 'processing', 'completed', 'declined', 'cancelled']);
assertPrismaEnumValues(prisma, 'UserRequestActorType', ['user', 'admin', 'system']);

for (const source of [reportSql, migration]) {
  assert(/report_context\s+report_context\s+not null\s+default 'order'/i.test(source), 'legacy reports default to order context');
  assert(/client_request_id\s+varchar\(160\)/i.test(source), 'content reports have a table-local create key');
  assert(/request_fingerprint\s+varchar\(128\)/i.test(source), 'content reports have a request fingerprint');
  assert(/ck_reports_request_idempotency_pair/i.test(source), 'report idempotency fields are paired');
  assert(/report_context\s*<>\s*'store_lite_content'[\s\S]*target_type in \('post', 'companion'\)/i.test(source), 'Store Lite reports only target posts or companions');
  assert(/reported_user_id is not null[\s\S]*reported_user_id <> reporter_id/i.test(source), 'Store Lite reports resolve a distinct reported user');
  assert(/order_id is null[\s\S]*conversation_id is null/i.test(source), 'Store Lite reports do not attach commercial conversations');
  assert(/evidence_files\s*=\s*'\[\]'::jsonb/i.test(source), 'Store Lite reports cannot attach uploaded evidence');
  assert(/content_violation[\s\S]*safety[\s\S]*fraud[\s\S]*privacy_or_rights[\s\S]*other/i.test(source), 'Store Lite report categories are bounded');
}

for (const source of [requestSql, migrationRequestSql]) {
  assert(/client_request_id\s+varchar\(160\)\s+not null/i.test(source), 'user request create key is required');
  assert(/request_fingerprint\s+varchar\(128\)\s+not null/i.test(source), 'user request fingerprint is required');
  assert(/unique\s*\(user_id,\s*client_request_id\)/i.test(source), 'user request create key is unique per user');
  assert(/unique\s*\(id,\s*user_id\)/i.test(source), 'user request exposes composite owner identity');
  assert(/foreign key\s*\(booking_request_id,\s*user_id\)[\s\S]*references booking_requests\s*\(id,\s*user_id\)/i.test(source), 'linked booking request must have the same owner');
  assert(/request_type = 'support'[\s\S]*booking[\s\S]*safety[\s\S]*account[\s\S]*privacy[\s\S]*other/i.test(source), 'support categories are first-review only');
  assert(/request_type <> 'support'[\s\S]*support_category is null[\s\S]*booking_request_id is null/i.test(source), 'non-support requests cannot carry support or booking fields');
  assert(/ck_user_requests_status_outcome/i.test(source), 'request status is tied to outcome timestamps');
}

for (const source of [requestLogSql, migrationRequestLogSql]) {
  assert(/foreign key\s*\(user_request_id,\s*actor_user_id\)[\s\S]*references user_requests\s*\(id,\s*user_id\)/i.test(source), 'user status actor must own the request');
  assert(/actor_type = 'user'[\s\S]*actor_user_id is not null[\s\S]*actor_admin_id is null/i.test(source), 'user actor columns are exclusive');
  assert(/actor_type = 'admin'[\s\S]*actor_user_id is null[\s\S]*actor_admin_id is not null/i.test(source), 'admin actor columns are exclusive');
  assert(/actor_type = 'system'[\s\S]*actor_user_id is null[\s\S]*actor_admin_id is null/i.test(source), 'system actor carries no principal id');
  assert(/from_status is null[\s\S]*to_status = 'submitted'[\s\S]*actor_type = 'user'/i.test(source), 'only a user submits a request');
  assert(/from_status = 'submitted'[\s\S]*to_status = 'processing'[\s\S]*actor_type = 'admin'/i.test(source), 'only an admin starts processing');
  assert(/from_status in \('submitted', 'processing'\)[\s\S]*to_status = 'declined'[\s\S]*actor_type = 'admin'/i.test(source), 'only an admin declines an active request');
  assert(/from_status in \('submitted', 'processing'\)[\s\S]*to_status = 'cancelled'[\s\S]*actor_type = 'user'/i.test(source), 'only the user cancels an active request');
  assert(/from_status = 'processing'[\s\S]*to_status = 'completed'[\s\S]*actor_type in \('admin', 'system'\)/i.test(source), 'completion requires processing and an operational actor');
  assert(/to_status <> 'declined'[\s\S]*reason_code is not null[\s\S]*public_message is not null/i.test(source), 'decline requires a public audited reason');
}

for (const source of [blockSql, migrationBlockSql]) {
  assert(/user_id\s+uuid\s+not null\s+references users\(id\)\s+on delete cascade/i.test(source), 'block owner is a user');
  assert(/companion_id\s+uuid\s+not null\s+references companions\(id\)\s+on delete cascade/i.test(source), 'block target is a companion');
  assert(/unique\s*\(user_id,\s*companion_id\)/i.test(source), 'companion block is idempotent per user');
}

for (const index of [
  'uq_reports_store_lite_reporter_client',
  'idx_reports_store_lite_reporter_created',
  'idx_reports_store_lite_operator_queue',
  'idx_user_companion_blocks_user_created',
  'idx_user_requests_user_created',
  'idx_user_requests_user_type_status_created',
  'idx_user_requests_operator_queue',
  'uq_user_requests_active_account_deletion',
  'idx_user_request_status_logs_request',
  'idx_user_request_status_logs_admin',
]) {
  assert(new RegExp(`create\\s+(?:unique\\s+)?index\\s+${index}\\b`, 'i').test(sql), `canonical SQL includes ${index}`);
  assert(new RegExp(`create\\s+(?:unique\\s+)?index\\s+if\\s+not\\s+exists\\s+${index}\\b`, 'i').test(migration), `migration idempotently includes ${index}`);
}
assert(/where\s+request_type = 'account_deletion'[\s\S]*status in \('submitted', 'processing'\)/i.test(sql), 'only one active account-deletion request is allowed');
assert(/where\s+report_context = 'store_lite_content'/i.test(sql), 'report idempotency uniqueness is scoped to Store Lite');

assert(/reportContext\s+ReportContext\s+@default\(order\)\s+@map\("report_context"\)/.test(reportPrisma), 'Prisma maps report context');
assert(/clientRequestId\s+String\?[\s\S]*requestFingerprint\s+String\?/m.test(reportPrisma), 'Prisma maps optional legacy-safe report idempotency fields');
assert(/bookingRequest\s+BookingRequest\?[\s\S]*fields:\s*\[bookingRequestId, userId\][\s\S]*references:\s*\[id, userId\]/m.test(requestPrisma), 'Prisma maps booking owner snapshot relation');
assert(/@@unique\(\[userId, clientRequestId\], map: "uq_user_requests_user_client"\)/.test(requestPrisma), 'Prisma maps user-request idempotency');
assert(/actorUser\s+User\?[\s\S]*actorAdmin\s+AdminUser\?/m.test(requestLogPrisma), 'Prisma maps both request status principals');
assert(/@@unique\(\[userId, companionId\], map: "uq_user_companion_blocks_user_companion"\)/.test(blockPrisma), 'Prisma maps idempotent companion block');
assert(/userRequests\s+UserRequest\[\]/.test(prisma), 'Prisma adds user-request reverse relations');
assert(/userRequestActions\s+UserRequestStatusLog\[\]/.test(prisma), 'Prisma adds request status actor reverse relations');
assert(/companionBlocks\s+UserCompanionBlock\[\]/.test(prisma), 'Prisma adds block owner reverse relation');
assert(/blockedByUsers\s+UserCompanionBlock\[\]/.test(prisma), 'Prisma adds block target reverse relation');

assert(/^begin;/i.test(migration.trim()), 'migration starts a transaction');
assert(/commit;\s*$/i.test(migration), 'migration commits its transaction');
assert((migration.match(/exception when duplicate_object then null/gi) || []).length === 6, 'migration creates four enums and two report constraints repeatably');
for (const table of ['user_requests', 'user_request_status_logs', 'user_companion_blocks']) {
  assert(new RegExp(`create\\s+table\\s+if\\s+not\\s+exists\\s+${table}\\b`, 'i').test(migration), `migration creates ${table} repeatably`);
}
for (const column of ['report_context', 'client_request_id', 'request_fingerprint']) {
  assert(new RegExp(`add\\s+column\\s+if\\s+not\\s+exists\\s+${column}\\b`, 'i').test(migration), `migration adds report ${column} repeatably`);
}
const alteredTables = [...migration.matchAll(/alter\s+table\s+([a-z_][a-z0-9_]*)/gi)].map((match) => match[1]);
assert(alteredTables.length > 0 && alteredTables.every((table) => table === 'reports'), 'migration only alters the existing reports table');
assert(
  !/^\s*(?:drop\b|truncate\b|delete\s+from\b|update\s+[a-z_][a-z0-9_]*\b|insert\s+into\b)/im.test(migration),
  'migration contains no destructive or data-rewrite statement',
);

for (const source of [requestSql, requestLogSql, blockSql, migrationRequestSql, migrationRequestLogSql, migrationBlockSql]) {
  assertNoForbiddenDomainColumns(source);
  assert(!/references\s+(orders|payments|refunds|conversations|messages|media_assets|merchants)\b/i.test(source), 'new compliance tables have no excluded-domain FK');
}

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'exact-enums',
        'canonical-migration-table-parity',
        'user-request-local-idempotency',
        'request-owner-and-booking-owner-fks',
        'request-status-actor-xor',
        'request-transition-whitelist',
        'active-account-deletion-uniqueness',
        'store-lite-report-shape',
        'legacy-report-compatibility',
        'content-report-local-idempotency',
        'companion-block-idempotency',
        'repeatable-additive-migration',
        'prisma-relations',
        'excluded-domain-boundary',
      ],
    },
    null,
    2,
  ),
);

function sqlTableBlock(source, table) {
  const match = source.match(
    new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${table}\\s*\\(([\\s\\S]*?)\\n\\);`, 'i'),
  );
  assert(match, `cannot extract SQL table ${table}`);
  return match[1];
}

function prismaModelBlock(source, model) {
  const match = source.match(new RegExp(`model\\s+${model}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  assert(match, `cannot extract Prisma model ${model}`);
  return match[1];
}

function assertEnumValues(source, name, expected) {
  const match = source.match(new RegExp(`create\\s+type\\s+${name}\\s+as\\s+enum\\s*\\(([^)]*)\\)`, 'i'));
  assert(match, `cannot extract SQL enum ${name}`);
  const actual = [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${name} has exact values`);
}

function assertPrismaEnumValues(source, name, expected) {
  const match = source.match(new RegExp(`enum\\s+${name}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  assert(match, `cannot extract Prisma enum ${name}`);
  const actual = match[1]
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  assert(JSON.stringify(actual) === JSON.stringify(expected), `${name} has exact values`);
}

function assertNoForbiddenDomainColumns(source) {
  for (const column of [
    'phone',
    'contact_phone',
    'order_id',
    'payment_id',
    'refund_id',
    'conversation_id',
    'message_id',
    'media_id',
    'media_asset_id',
    'merchant_id',
    'amount_cents',
    'price_cents',
    'payment_status',
    'refund_status',
    'settlement_status',
  ]) {
    assert(!new RegExp(`\\b${column}\\b`, 'i').test(source), `new compliance table excludes ${column}`);
  }
}

function normalizeSql(source) {
  return source.replace(/\s+/g, ' ').trim().toLowerCase();
}

function assert(condition, message) {
  if (!condition) throw new Error(`Store Lite compliance schema check failed: ${message}`);
}
