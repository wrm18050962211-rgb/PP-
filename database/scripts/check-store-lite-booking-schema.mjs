import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const sql = await readFile(resolve(root, 'schema.sql'), 'utf8');
const prisma = await readFile(resolve(root, 'prisma/schema.prisma'), 'utf8');
const migration = await readFile(
  resolve(root, 'migrations/20260823_add_store_lite_booking_requests.sql'),
  'utf8',
);

const bookingSql = sqlTableBlock(sql, 'booking_requests');
const logSql = sqlTableBlock(sql, 'booking_request_status_logs');
const migrationBookingSql = sqlTableBlock(migration, 'booking_requests');
const migrationLogSql = sqlTableBlock(migration, 'booking_request_status_logs');
const bookingPrisma = prismaModelBlock(prisma, 'BookingRequest');
const logPrisma = prismaModelBlock(prisma, 'BookingRequestStatusLog');

assert(normalizeSql(bookingSql) === normalizeSql(migrationBookingSql), 'canonical and migration booking tables match');
assert(normalizeSql(logSql) === normalizeSql(migrationLogSql), 'canonical and migration status-log tables match');

assertEnumValues(sql, 'booking_request_status', ['submitted', 'confirmed', 'declined', 'cancelled']);
assertEnumValues(sql, 'booking_request_actor_type', ['user', 'admin']);
assertEnumValues(migration, 'booking_request_status', ['submitted', 'confirmed', 'declined', 'cancelled']);
assertEnumValues(migration, 'booking_request_actor_type', ['user', 'admin']);
assertPrismaEnumValues(prisma, 'BookingRequestStatus', ['submitted', 'confirmed', 'declined', 'cancelled']);
assertPrismaEnumValues(prisma, 'BookingRequestActorType', ['user', 'admin']);

for (const source of [bookingSql, migrationBookingSql]) {
  assert(/client_request_id\s+varchar\(160\)\s+not null/i.test(source), 'booking create key is required');
  assert(/request_fingerprint\s+varchar\(128\)\s+not null/i.test(source), 'booking request fingerprint is required');
  assert(/unique\s*\(user_id,\s*client_request_id\)/i.test(source), 'booking create key is unique per user');
  assert(/requested_end_at\s*>\s*requested_start_at/i.test(source), 'requested time range must be positive');
  assert(/confirmed_end_at\s*>\s*confirmed_start_at/i.test(source), 'confirmed time range must be positive');
  assert(/ck_booking_requests_confirmation_snapshot/i.test(source), 'confirmation snapshot is all-or-none');
  assert(/confirmed_city[\s\S]*confirmed_address_text[\s\S]*arrival_instructions[\s\S]*support_channel_key/i.test(source), 'confirmation stores approved user-visible snapshot');
  assert(/ck_booking_requests_status_outcome/i.test(source), 'booking status is tied to outcome timestamps');
  assert(/unique\s*\(id,\s*user_id\)/i.test(source), 'booking exposes composite owner identity');
}

for (const source of [logSql, migrationLogSql]) {
  assert(/foreign key\s*\(booking_request_id,\s*actor_user_id\)[\s\S]*references booking_requests\s*\(id,\s*user_id\)/i.test(source), 'user status actor must own the booking');
  assert(/actor_type\s*=\s*'user'[\s\S]*actor_user_id is not null[\s\S]*actor_admin_id is null/i.test(source), 'user actor columns are exclusive');
  assert(/actor_type\s*=\s*'admin'[\s\S]*actor_user_id is null[\s\S]*actor_admin_id is not null/i.test(source), 'admin actor columns are exclusive');
  assert(/from_status is null[\s\S]*to_status = 'submitted'[\s\S]*actor_type = 'user'/i.test(source), 'only a user creates the submitted log');
  assert(/from_status = 'submitted'[\s\S]*to_status in \('confirmed', 'declined'\)[\s\S]*actor_type = 'admin'/i.test(source), 'only an admin confirms or declines');
  assert(/from_status in \('submitted', 'confirmed'\)[\s\S]*to_status = 'cancelled'[\s\S]*actor_type in \('user', 'admin'\)/i.test(source), 'user or admin may cancel an active request');
  assert(/to_status = 'cancelled' and actor_type = 'admin'[\s\S]*reason_code is not null[\s\S]*reason is not null/i.test(source), 'admin cancellation requires an auditable reason');
}

for (const index of [
  'idx_booking_requests_user_created',
  'idx_booking_requests_user_status_created',
  'idx_booking_requests_operator_queue',
  'idx_booking_requests_companion_time',
  'idx_booking_request_status_logs_request',
  'idx_booking_request_status_logs_admin',
]) {
  assert(new RegExp(`create\\s+index\\s+${index}\\b`, 'i').test(sql), `canonical SQL includes ${index}`);
  assert(new RegExp(`create\\s+index\\s+if\\s+not\\s+exists\\s+${index}\\b`, 'i').test(migration), `migration idempotently includes ${index}`);
}

assert(/^begin;/i.test(migration.trim()), 'migration starts a transaction');
assert(/commit;\s*$/i.test(migration), 'migration commits its transaction');
assert((migration.match(/exception when duplicate_object then null/gi) || []).length === 2, 'migration creates both enums repeatably');
assert(/create table if not exists booking_requests/i.test(migration), 'migration creates booking_requests repeatably');
assert(/create table if not exists booking_request_status_logs/i.test(migration), 'migration creates booking_request_status_logs repeatably');
assert(!/\balter\s+table\b/i.test(migration), 'migration does not alter an existing table');

assert(/clientRequestId\s+String\s+@map\("client_request_id"\)\s+@db\.VarChar\(160\)/.test(bookingPrisma), 'Prisma maps client request id');
assert(/requestFingerprint\s+String\s+@map\("request_fingerprint"\)\s+@db\.VarChar\(128\)/.test(bookingPrisma), 'Prisma maps request fingerprint');
assert(/@@unique\(\[userId, clientRequestId\], map: "uq_booking_requests_user_client"\)/.test(bookingPrisma), 'Prisma maps create idempotency uniqueness');
assert(/statusLogs\s+BookingRequestStatusLog\[\]/.test(bookingPrisma), 'Prisma maps booking status logs');
assert(/actorUser\s+User\?[\s\S]*actorAdmin\s+AdminUser\?/m.test(logPrisma), 'Prisma maps both status actors');
assert(/bookingRequests\s+BookingRequest\[\]/.test(prisma), 'Prisma adds booking reverse relations');
assert(/bookingStatusActions\s+BookingRequestStatusLog\[\]/.test(prisma), 'Prisma adds status actor reverse relations');

for (const source of [bookingSql, logSql, migrationBookingSql, migrationLogSql]) {
  assertNoForbiddenDomainColumns(source);
  assert(!/references\s+(orders|payments|refunds|conversations|messages|media_assets|merchants)\b/i.test(source), 'booking domain has no excluded-domain FK');
}

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'exact-enums',
        'canonical-migration-table-parity',
        'table-local-create-idempotency',
        'complete-confirmation-snapshot',
        'status-outcome-consistency',
        'actor-xor',
        'owner-composite-fk',
        'admin-only-decision',
        'bilateral-cancellation',
        'admin-cancellation-reason',
        'stable-indexes',
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
    assert(!new RegExp(`\\b${column}\\b`, 'i').test(source), `booking table excludes ${column}`);
  }
}

function normalizeSql(source) {
  return source.replace(/\s+/g, ' ').trim().toLowerCase();
}

function assert(condition, message) {
  if (!condition) throw new Error(`Store Lite booking schema check failed: ${message}`);
}
