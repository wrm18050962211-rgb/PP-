import { createHash, randomUUID } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;
const CURSOR_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const SUPPORT_CHANNEL_PATTERN = /^[a-z0-9][a-z0-9._-]{0,79}$/;
const PUBLIC_CONTACT_OR_PAYMENT_PATTERNS = Object.freeze([
  /1[3-9]\d{9}/,
  /(?:https?:\/\/|www\.|二维码|扫码|收款码)/i,
  /(?:微信|微\s*信|wechat|\bwx\b|\bvx\b|支付宝|alipay|paypal)/i,
  /(?:支付|付款|转账|定金|押金|红包|收款|银行卡|线下交易|私下交易)/i,
]);
const BOOKING_STATUSES = new Set(['submitted', 'confirmed', 'declined', 'cancelled']);
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

// Keep names and limits centralized while the schema is still an isolated
// Store Lite slice. Route/store integration must use this contract verbatim.
export const BOOKING_REQUEST_SCHEMA = Object.freeze({
  requestTable: 'booking_requests',
  statusLogTable: 'booking_request_status_logs',
  adminActionLogTable: 'admin_action_logs',
  statuses: Object.freeze(['submitted', 'confirmed', 'declined', 'cancelled']),
  maxLimit: MAX_LIMIT,
  maxClientRequestId: 120,
  maxCity: 80,
  maxAddressText: 500,
  maxRequirements: 2000,
  maxReasonCode: 80,
  maxReason: 1000,
});

export class BookingRequestGatewayError extends Error {
  constructor(code, message, status, options = {}) {
    super(message, options);
    this.name = 'BookingRequestGatewayError';
    this.code = code;
    this.status = status;
  }
}

export async function createBookingRequestForConsumer(client, input = {}) {
  assertClient(client);
  const draft = parseCreateInput(input);
  const fingerprint = bookingFingerprint(draft);

  return inTransaction(client, async () => {
    const prior = await findIdempotentBooking(client, draft.userId, draft.clientRequestId);
    if (prior) {
      assertMatchingFingerprint(prior, fingerprint);
      return loadConsumerDetail(client, prior.id, draft.userId);
    }

    const target = await client.query(
      `select c.id
       from companions c
       where c.id = $1::uuid
         and c.status = 'approved'
         and c.service_enabled = true
       limit 1`,
      [draft.companionId],
    );
    if (!target.rows?.[0]) {
      throw gatewayError('BOOKING_TARGET_UNAVAILABLE', 'The selected photographer is unavailable', 404);
    }

    const inserted = await client.query(
      `insert into booking_requests (
         id, user_id, companion_id, client_request_id, request_fingerprint,
         requested_start_at, requested_end_at, timezone, city, address_text,
         requirements, status, created_at, updated_at
       ) values (
         $1::uuid, $2::uuid, $3::uuid, $4, $5,
         $6::timestamptz, $7::timestamptz, $8, $9, $10,
         $11, 'submitted', now(), now()
       )
       on conflict (user_id, client_request_id) do nothing
       returning id`,
      [
        draft.bookingRequestId,
        draft.userId,
        draft.companionId,
        draft.clientRequestId,
        fingerprint,
        draft.requestedStartAt,
        draft.requestedEndAt,
        draft.timezone,
        draft.city,
        draft.addressText,
        draft.requirements,
      ],
    );

    let bookingRequestId = inserted.rows?.[0]?.id;
    if (!bookingRequestId) {
      const row = await findIdempotentBooking(client, draft.userId, draft.clientRequestId);
      if (!row) throw new Error('Idempotent booking row disappeared');
      assertMatchingFingerprint(row, fingerprint);
      bookingRequestId = row.id;
    } else {
      await insertStatusLog(client, {
        id: draft.statusLogId,
        bookingRequestId,
        fromStatus: null,
        toStatus: 'submitted',
        actorType: 'user',
        actorUserId: draft.userId,
        reasonCode: 'user_submitted',
        reason: null,
      });
    }

    return loadConsumerDetail(client, bookingRequestId, draft.userId);
  });
}

async function findIdempotentBooking(client, userId, clientRequestId) {
  const result = await client.query(
    `select id, request_fingerprint
     from booking_requests
     where user_id = $1::uuid
       and client_request_id = $2
     limit 1`,
    [userId, clientRequestId],
  );
  return result.rows?.[0] || null;
}

function assertMatchingFingerprint(row, fingerprint) {
  if (String(row.request_fingerprint || '') !== fingerprint) {
    throw gatewayError(
      'BOOKING_IDEMPOTENCY_CONFLICT',
      'clientRequestId was already used with a different booking request',
      409,
    );
  }
}

export async function listBookingRequestsForConsumer(client, options = {}) {
  assertClient(client);
  const userId = requireUuid(options.userId, 'userId');
  return listBookingRequests(client, {
    actor: { type: 'consumer', id: userId },
    status: parseStatus(options.status),
    limit: parseLimit(options.limit),
    cursor: options.cursor,
    ownerUserId: userId,
    admin: false,
  });
}

export async function getBookingRequestDetailForConsumer(client, options = {}) {
  assertClient(client);
  const userId = requireUuid(options.userId, 'userId');
  const bookingRequestId = requireUuid(options.bookingRequestId, 'bookingRequestId');
  try {
    return await loadConsumerDetail(client, bookingRequestId, userId);
  } catch (error) {
    throw normalizeFailure(error);
  }
}

export async function cancelBookingRequestForConsumer(client, input = {}) {
  assertClient(client);
  const actor = {
    type: 'user',
    userId: requireUuid(input.userId, 'userId'),
  };
  return transitionBookingRequest(client, {
    actor,
    bookingRequestId: requireUuid(input.bookingRequestId, 'bookingRequestId'),
    targetStatus: 'cancelled',
    reasonCode: optionalText(input.reasonCode, BOOKING_REQUEST_SCHEMA.maxReasonCode, 'reasonCode'),
    publicMessage: optionalText(input.reason, BOOKING_REQUEST_SCHEMA.maxReason, 'reason'),
    statusLogId: optionalUuid(input.statusLogId, 'statusLogId') || randomUUID(),
  });
}

export async function listBookingRequestsForAdmin(client, options = {}) {
  assertClient(client);
  const adminId = requireUuid(options.adminId, 'adminId');
  return listBookingRequests(client, {
    actor: { type: 'admin', id: adminId },
    status: parseStatus(options.status),
    limit: parseLimit(options.limit),
    cursor: options.cursor,
    ownerUserId: null,
    admin: true,
  });
}

export async function getBookingRequestDetailForAdmin(client, options = {}) {
  assertClient(client);
  requireUuid(options.adminId, 'adminId');
  const bookingRequestId = requireUuid(options.bookingRequestId, 'bookingRequestId');
  try {
    return await loadAdminDetail(client, bookingRequestId, options.includeContact === true);
  } catch (error) {
    throw normalizeFailure(error);
  }
}

export async function confirmBookingRequestForAdmin(client, input = {}) {
  assertClient(client);
  const confirmation = parseConfirmation(input);
  return transitionBookingRequest(client, {
    actor: parseAdminActor(input),
    bookingRequestId: requireUuid(input.bookingRequestId, 'bookingRequestId'),
    targetStatus: 'confirmed',
    reasonCode: 'confirmed_by_operations',
    publicMessage: optionalPublicBookingText(input.publicMessage, BOOKING_REQUEST_SCHEMA.maxReason, 'publicMessage'),
    internalNote: optionalText(input.internalNote, BOOKING_REQUEST_SCHEMA.maxReason, 'internalNote'),
    statusLogId: optionalUuid(input.statusLogId, 'statusLogId') || randomUUID(),
    adminActionLogId: optionalUuid(input.adminActionLogId, 'adminActionLogId') || randomUUID(),
    confirmation,
  });
}

export async function declineBookingRequestForAdmin(client, input = {}) {
  assertClient(client);
  return transitionBookingRequest(client, {
    actor: parseAdminActor(input),
    bookingRequestId: requireUuid(input.bookingRequestId, 'bookingRequestId'),
    targetStatus: 'declined',
    reasonCode: requireText(input.reasonCode, 1, BOOKING_REQUEST_SCHEMA.maxReasonCode, 'reasonCode'),
    publicMessage: requirePublicBookingText(input.publicMessage, 1, BOOKING_REQUEST_SCHEMA.maxReason, 'publicMessage'),
    internalNote: optionalText(input.internalNote, BOOKING_REQUEST_SCHEMA.maxReason, 'internalNote'),
    statusLogId: optionalUuid(input.statusLogId, 'statusLogId') || randomUUID(),
    adminActionLogId: optionalUuid(input.adminActionLogId, 'adminActionLogId') || randomUUID(),
  });
}

export async function cancelBookingRequestForAdmin(client, input = {}) {
  assertClient(client);
  return transitionBookingRequest(client, {
    actor: parseAdminActor(input),
    bookingRequestId: requireUuid(input.bookingRequestId, 'bookingRequestId'),
    targetStatus: 'cancelled',
    reasonCode: requireText(input.reasonCode, 1, BOOKING_REQUEST_SCHEMA.maxReasonCode, 'reasonCode'),
    publicMessage: requirePublicBookingText(input.publicMessage, 1, BOOKING_REQUEST_SCHEMA.maxReason, 'publicMessage'),
    internalNote: optionalText(input.internalNote, BOOKING_REQUEST_SCHEMA.maxReason, 'internalNote'),
    statusLogId: optionalUuid(input.statusLogId, 'statusLogId') || randomUUID(),
    adminActionLogId: optionalUuid(input.adminActionLogId, 'adminActionLogId') || randomUUID(),
  });
}

async function listBookingRequests(client, options) {
  const cursor = parseCursor(options.cursor, options.actor, options.status);
  const ownerPredicate = options.admin ? '' : 'and b.user_id = $1::uuid';
  const params = options.admin
    ? [options.status, cursor?.createdAt ?? null, cursor?.id ?? null, options.limit + 1]
    : [options.ownerUserId, options.status, cursor?.createdAt ?? null, cursor?.id ?? null, options.limit + 1];
  const offset = options.admin ? 0 : 1;

  try {
    const result = await client.query(
      `${bookingSelect({ includePhone: options.admin })}
       where ($${offset + 1}::booking_request_status is null or b.status = $${offset + 1}::booking_request_status)
         ${ownerPredicate}
         and (
           $${offset + 2}::timestamptz is null
           or (b.created_at, b.id) < ($${offset + 2}::timestamptz, $${offset + 3}::uuid)
         )
       order by b.created_at desc, b.id desc
       limit $${offset + 4}`,
      params,
    );
    const rows = result.rows || [];
    const pageRows = rows.slice(0, options.limit);
    const hasMore = rows.length > options.limit;
    const lastRow = hasMore ? pageRows.at(-1) : null;
    return {
      items: pageRows.map(options.admin ? mapAdminSummary : mapConsumerSummary),
      nextCursor: lastRow
        ? encodeCursor(lastRow.created_at_cursor, lastRow.id, options.actor, options.status)
        : null,
      hasMore,
    };
  } catch (error) {
    throw normalizeFailure(error);
  }
}

async function transitionBookingRequest(client, command) {
  return inTransaction(client, async () => {
    const ownerPredicate = command.actor.type === 'user' ? 'and b.user_id = $2::uuid' : '';
    const lockParams = command.actor.type === 'user'
      ? [command.bookingRequestId, command.actor.userId]
      : [command.bookingRequestId];
    const locked = await client.query(
      `select b.*
       from booking_requests b
       where b.id = $1::uuid
         ${ownerPredicate}
       limit 1
       for update`,
      lockParams,
    );
    const before = locked.rows?.[0];
    if (!before) throw gatewayError('BOOKING_REQUEST_NOT_FOUND', 'Booking request not found', 404);

    if (String(before.status) === command.targetStatus) {
      return command.actor.type === 'admin'
        ? loadAdminDetail(client, command.bookingRequestId, true)
        : loadConsumerDetail(client, command.bookingRequestId, command.actor.userId);
    }
    assertTransitionAllowed(before.status, command.targetStatus, command.actor.type);

    const updated = await updateForTransition(client, before, command);
    if (!updated) {
      throw gatewayError('BOOKING_STATUS_CONFLICT', 'Booking request status changed; refresh and retry', 409);
    }

    await insertStatusLog(client, {
      id: command.statusLogId,
      bookingRequestId: command.bookingRequestId,
      fromStatus: before.status,
      toStatus: command.targetStatus,
      actorType: command.actor.type,
      actorUserId: command.actor.userId || null,
      actorAdminId: command.actor.adminId || null,
      reasonCode: command.reasonCode || null,
      reason: command.publicMessage || null,
    });

    if (command.actor.type === 'admin') {
      await insertAdminActionLog(client, before, command);
    }

    return command.actor.type === 'admin'
      ? loadAdminDetail(client, command.bookingRequestId, true)
      : loadConsumerDetail(client, command.bookingRequestId, command.actor.userId);
  });
}

async function updateForTransition(client, before, command) {
  if (command.targetStatus === 'confirmed') {
    const value = command.confirmation;
    const result = await client.query(
      `update booking_requests
       set status = 'confirmed',
           confirmed_start_at = $3::timestamptz,
           confirmed_end_at = $4::timestamptz,
           confirmed_city = $5,
           confirmed_address_text = $6,
           arrival_instructions = $7,
           support_channel_key = $8,
           confirmed_at = now(),
           updated_at = now()
       where id = $1::uuid
         and status = $2::booking_request_status
       returning *`,
      [
        command.bookingRequestId,
        before.status,
        value.confirmedStartAt,
        value.confirmedEndAt,
        value.confirmedCity,
        value.confirmedAddressText,
        value.arrivalInstructions,
        value.supportChannelKey,
      ],
    );
    return result.rows?.[0] || null;
  }

  const timestampColumn = command.targetStatus === 'declined' ? 'declined_at' : 'cancelled_at';
  const result = await client.query(
    `update booking_requests
     set status = $3::booking_request_status,
         ${timestampColumn} = now(),
         updated_at = now()
     where id = $1::uuid
       and status = $2::booking_request_status
     returning *`,
    [command.bookingRequestId, before.status, command.targetStatus],
  );
  return result.rows?.[0] || null;
}

async function insertStatusLog(client, entry) {
  await client.query(
    `insert into booking_request_status_logs (
       id, booking_request_id, from_status, to_status, actor_type,
       actor_user_id, actor_admin_id, reason_code, reason, created_at
     ) values (
       $1::uuid, $2::uuid, $3::booking_request_status,
       $4::booking_request_status, $5::booking_request_actor_type,
       $6::uuid, $7::uuid, $8, $9, now()
     )`,
    [
      entry.id,
      entry.bookingRequestId,
      entry.fromStatus,
      entry.toStatus,
      entry.actorType,
      entry.actorUserId || null,
      entry.actorAdminId || null,
      entry.reasonCode || null,
      entry.reason || null,
    ],
  );
}

async function insertAdminActionLog(client, before, command) {
  const beforeData = { status: String(before.status) };
  const afterData = {
    status: command.targetStatus,
    reasonCode: command.reasonCode || null,
    publicMessage: command.publicMessage || null,
    internalNote: command.internalNote || null,
  };
  if (command.confirmation) afterData.confirmation = command.confirmation;
  await client.query(
    `insert into admin_action_logs (
       id, admin_id, action, target_type, target_id,
       before_data, after_data, ip, user_agent, created_at
     ) values (
       $1::uuid, $2::uuid, $3, 'booking_request', $4::uuid,
       $5::jsonb, $6::jsonb, $7, $8, now()
     )`,
    [
      command.adminActionLogId,
      command.actor.adminId,
      `booking_request.${command.targetStatus}`,
      command.bookingRequestId,
      JSON.stringify(beforeData),
      JSON.stringify(afterData),
      command.actor.ip,
      command.actor.userAgent,
    ],
  );
}

async function loadConsumerDetail(client, bookingRequestId, userId) {
  const result = await client.query(
    `${bookingSelect({ includePhone: false })}
     where b.id = $1::uuid
       and b.user_id = $2::uuid
     limit 1`,
    [bookingRequestId, userId],
  );
  const row = result.rows?.[0];
  if (!row) throw gatewayError('BOOKING_REQUEST_NOT_FOUND', 'Booking request not found', 404);
  const statusLogs = await loadStatusLogs(client, bookingRequestId);
  return mapConsumerDetail(row, statusLogs);
}

async function loadAdminDetail(client, bookingRequestId, includeContact = false) {
  const result = await client.query(
    `${bookingSelect({ includePhone: includeContact })}
     where b.id = $1::uuid
     limit 1`,
    [bookingRequestId],
  );
  const row = result.rows?.[0];
  if (!row) throw gatewayError('BOOKING_REQUEST_NOT_FOUND', 'Booking request not found', 404);
  const statusLogs = await loadStatusLogs(client, bookingRequestId);
  return mapAdminDetail(row, statusLogs);
}

async function loadStatusLogs(client, bookingRequestId) {
  const result = await client.query(
    `select id, from_status, to_status, actor_type, reason_code, reason, created_at
     from booking_request_status_logs
     where booking_request_id = $1::uuid
     order by created_at, id`,
    [bookingRequestId],
  );
  return result.rows || [];
}

function bookingSelect({ includePhone }) {
  return `select
            b.id,
            b.user_id,
            b.companion_id,
            b.requested_start_at,
            b.requested_end_at,
            b.timezone,
            b.city,
            b.address_text,
            b.requirements,
            b.status,
            b.confirmed_start_at,
            b.confirmed_end_at,
            b.confirmed_city,
            b.confirmed_address_text,
            b.arrival_instructions,
            b.support_channel_key,
            b.confirmed_at,
            b.declined_at,
            b.cancelled_at,
            b.created_at,
            to_char(b.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at_cursor,
            b.updated_at,
            c.display_name as companion_name,
            c.real_photo_url as companion_avatar_url,
            u.nickname as consumer_name${includePhone ? ',\n            u.phone as consumer_phone,\n            companion_user.phone as companion_phone' : ''}
          from booking_requests b
          join companions c on c.id = b.companion_id
          join users u on u.id = b.user_id${includePhone ? '\n          join users companion_user on companion_user.id = c.user_id' : ''}`;
}

function mapConsumerSummary(row) {
  return {
    id: stringValue(row.id),
    status: stringValue(row.status),
    photographer: mapPhotographer(row),
    requestedSchedule: mapRequestedSchedule(row),
    confirmation: mapConfirmation(row),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapConsumerDetail(row, statusLogs) {
  return {
    ...mapConsumerSummary(row),
    requirements: stringValue(row.requirements),
    statusLogs: statusLogs.map(mapConsumerStatusLog),
  };
}

function mapAdminSummary(row) {
  return {
    ...mapConsumerSummary(row),
    consumer: {
      id: stringValue(row.user_id),
      name: stringValue(row.consumer_name),
      phoneMasked: maskPhone(row.consumer_phone),
    },
    companionPhoneMasked: maskPhone(row.companion_phone),
    requirementsPreview: truncate(stringValue(row.requirements), 120),
  };
}

function mapAdminDetail(row, statusLogs) {
  return {
    ...mapConsumerDetail(row, []),
    consumer: {
      id: stringValue(row.user_id),
      name: stringValue(row.consumer_name),
      phone: optionalString(row.consumer_phone),
    },
    companionPhone: optionalString(row.companion_phone),
    statusLogs: statusLogs.map(mapAdminStatusLog),
  };
}

function mapPhotographer(row) {
  return {
    id: stringValue(row.companion_id),
    name: stringValue(row.companion_name),
    avatarUrl: optionalString(row.companion_avatar_url),
  };
}

function mapRequestedSchedule(row) {
  return {
    startAt: toIso(row.requested_start_at),
    endAt: toIso(row.requested_end_at),
    timezone: stringValue(row.timezone),
    city: stringValue(row.city),
    addressText: stringValue(row.address_text),
  };
}

function mapConfirmation(row) {
  if (!row.confirmed_at) return null;
  return {
    startAt: toIso(row.confirmed_start_at),
    endAt: toIso(row.confirmed_end_at),
    city: stringValue(row.confirmed_city),
    addressText: stringValue(row.confirmed_address_text),
    arrivalInstructions: stringValue(row.arrival_instructions),
    supportChannel: stringValue(row.support_channel_key),
    confirmedAt: toIso(row.confirmed_at),
  };
}

function mapConsumerStatusLog(row) {
  return {
    id: stringValue(row.id),
    fromStatus: optionalString(row.from_status) || null,
    toStatus: stringValue(row.to_status),
    message: truncate(optionalString(row.reason) || defaultStatusMessage(row.to_status), 300),
    createdAt: toIso(row.created_at),
  };
}

function mapAdminStatusLog(row) {
  return {
    ...mapConsumerStatusLog(row),
    actorType: stringValue(row.actor_type),
    reasonCode: optionalString(row.reason_code),
  };
}

function parseCreateInput(input) {
  const requestedStartAt = requireTimestamp(input.requestedStartAt, 'requestedStartAt');
  const requestedEndAt = requireTimestamp(input.requestedEndAt, 'requestedEndAt');
  if (Date.parse(requestedEndAt) <= Date.parse(requestedStartAt)) {
    throw gatewayError('BOOKING_REQUEST_INVALID', 'requestedEndAt must be after requestedStartAt', 400);
  }
  return {
    bookingRequestId: optionalUuid(input.bookingRequestId, 'bookingRequestId') || randomUUID(),
    statusLogId: optionalUuid(input.statusLogId, 'statusLogId') || randomUUID(),
    userId: requireUuid(input.userId, 'userId'),
    companionId: requireUuid(input.companionId, 'companionId'),
    clientRequestId: requireText(
      input.clientRequestId,
      8,
      BOOKING_REQUEST_SCHEMA.maxClientRequestId,
      'clientRequestId',
    ),
    requestedStartAt,
    requestedEndAt,
    timezone: optionalText(input.timezone, 80, 'timezone') || 'Asia/Shanghai',
    city: requireText(input.city, 1, BOOKING_REQUEST_SCHEMA.maxCity, 'city'),
    addressText: requireText(input.addressText, 1, BOOKING_REQUEST_SCHEMA.maxAddressText, 'addressText'),
    requirements: requirePublicBookingText(
      input.requirements,
      1,
      BOOKING_REQUEST_SCHEMA.maxRequirements,
      'requirements',
    ),
  };
}

function parseConfirmation(input) {
  const confirmedStartAt = requireTimestamp(input.confirmedStartAt, 'confirmedStartAt');
  const confirmedEndAt = requireTimestamp(input.confirmedEndAt, 'confirmedEndAt');
  if (Date.parse(confirmedEndAt) <= Date.parse(confirmedStartAt)) {
    throw gatewayError('BOOKING_REQUEST_INVALID', 'confirmedEndAt must be after confirmedStartAt', 400);
  }
  const supportChannelKey = requireText(input.supportChannelKey, 1, 80, 'supportChannelKey');
  if (!SUPPORT_CHANNEL_PATTERN.test(supportChannelKey)) {
    throw gatewayError('BOOKING_REQUEST_INVALID', 'supportChannelKey is invalid', 400);
  }
  return {
    confirmedStartAt,
    confirmedEndAt,
    confirmedCity: requireText(input.confirmedCity, 1, 80, 'confirmedCity'),
    confirmedAddressText: requireText(input.confirmedAddressText, 1, 500, 'confirmedAddressText'),
    arrivalInstructions: requirePublicBookingText(input.arrivalInstructions, 1, 1000, 'arrivalInstructions'),
    supportChannelKey,
  };
}

function parseAdminActor(input) {
  return {
    type: 'admin',
    adminId: requireUuid(input.adminId, 'adminId'),
    ip: optionalText(input.ip, 64, 'ip') || null,
    userAgent: optionalText(input.userAgent, 2000, 'userAgent') || null,
  };
}

function requirePublicBookingText(value, minimum, maximum, field) {
  return assertPublicBookingTextSafe(requireText(value, minimum, maximum, field), field);
}

function optionalPublicBookingText(value, maximum, field) {
  const text = optionalText(value, maximum, field);
  return text ? assertPublicBookingTextSafe(text, field) : null;
}

function assertPublicBookingTextSafe(value, field) {
  if (PUBLIC_CONTACT_OR_PAYMENT_PATTERNS.some((pattern) => pattern.test(value))) {
    throw gatewayError(
      'BOOKING_PUBLIC_TEXT_UNSAFE',
      `${field} must not contain contact details, links, or payment instructions`,
      400,
    );
  }
  return value;
}

function bookingFingerprint(draft) {
  const canonical = JSON.stringify({
    version: 1,
    companionId: draft.companionId,
    requestedStartAt: draft.requestedStartAt,
    requestedEndAt: draft.requestedEndAt,
    timezone: draft.timezone,
    city: draft.city,
    addressText: draft.addressText,
    requirements: draft.requirements,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

function assertTransitionAllowed(fromStatus, toStatus, actorType) {
  const from = String(fromStatus || '');
  const allowed =
    actorType === 'admin'
      ? (toStatus === 'confirmed' || toStatus === 'declined')
        ? from === 'submitted'
        : toStatus === 'cancelled' && (from === 'submitted' || from === 'confirmed')
      : toStatus === 'cancelled' && (from === 'submitted' || from === 'confirmed');
  if (!allowed) {
    throw gatewayError('BOOKING_STATUS_CONFLICT', `Cannot change booking request from ${from} to ${toStatus}`, 409);
  }
}

function parseStatus(value) {
  if (value === undefined || value === null || value === '') return null;
  const status = String(value).trim();
  if (!BOOKING_STATUSES.has(status)) {
    throw gatewayError('BOOKING_STATUS_INVALID', 'Unknown booking request status', 400);
  }
  return status;
}

function parseLimit(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_LIMIT;
  if (!/^[1-9]\d*$/.test(String(value))) {
    throw gatewayError('BOOKING_LIMIT_INVALID', `limit must be an integer between 1 and ${MAX_LIMIT}`, 400);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    throw gatewayError('BOOKING_LIMIT_INVALID', `limit must be an integer between 1 and ${MAX_LIMIT}`, 400);
  }
  return parsed;
}

function parseCursor(value, actor, status) {
  if (value === undefined || value === null || value === '') return null;
  const cursor = String(value).trim();
  if (!cursor || cursor.length > 512 || !CURSOR_PATTERN.test(cursor)) throw invalidCursor();
  try {
    const decodedBytes = Buffer.from(cursor, 'base64url');
    if (decodedBytes.toString('base64url') !== cursor) throw invalidCursor();
    const decoded = JSON.parse(decodedBytes.toString('utf8'));
    if (
      decoded?.v !== 1 ||
      decoded.actorType !== actor.type ||
      decoded.actorId !== actor.id ||
      (decoded.status ?? null) !== status ||
      !UUID_PATTERN.test(String(decoded.id || ''))
    ) {
      throw invalidCursor();
    }
    return { createdAt: exactCursorTimestamp(decoded.createdAt), id: String(decoded.id) };
  } catch (error) {
    if (error?.code === 'BOOKING_CURSOR_INVALID') throw error;
    throw invalidCursor();
  }
}

function encodeCursor(createdAt, id, actor, status) {
  const payload = {
    v: 1,
    actorType: actor.type,
    actorId: actor.id,
    status,
    createdAt: exactCursorTimestamp(createdAt),
    id: requireUuid(id, 'cursor id'),
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function exactCursorTimestamp(value) {
  const timestamp = String(value || '');
  if (!CURSOR_TIMESTAMP_PATTERN.test(timestamp)) throw invalidCursor();
  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== `${timestamp.slice(0, 23)}Z`) throw invalidCursor();
  return timestamp;
}

function invalidCursor() {
  return gatewayError('BOOKING_CURSOR_INVALID', 'Booking request cursor is invalid', 400);
}

async function inTransaction(client, operation) {
  let began = false;
  try {
    await client.query('begin');
    began = true;
    const result = await operation();
    await client.query('commit');
    began = false;
    return result;
  } catch (error) {
    if (began) {
      try {
        await client.query('rollback');
      } catch {
        // Preserve the original domain/database error.
      }
    }
    throw normalizeFailure(error);
  }
}

function normalizeFailure(error) {
  if (error instanceof BookingRequestGatewayError) return error;
  const wrapped = gatewayError(
    'BOOKING_STORE_UNAVAILABLE',
    'Booking request data is temporarily unavailable',
    503,
  );
  wrapped.cause = error;
  return wrapped;
}

function gatewayError(code, message, status) {
  return new BookingRequestGatewayError(code, message, status);
}

function requireUuid(value, field) {
  const id = String(value || '').trim();
  if (!UUID_PATTERN.test(id)) throw gatewayError('BOOKING_REQUEST_INVALID', `${field} must be a UUID`, 400);
  return id;
}

function optionalUuid(value, field) {
  if (value === undefined || value === null || value === '') return null;
  return requireUuid(value, field);
}

function requireText(value, min, max, field) {
  const text = String(value ?? '').trim();
  if (text.length < min || text.length > max) {
    throw gatewayError('BOOKING_REQUEST_INVALID', `${field} must contain between ${min} and ${max} characters`, 400);
  }
  return text;
}

function optionalText(value, max, field) {
  if (value === undefined || value === null || value === '') return null;
  return requireText(value, 1, max, field);
}

function requireTimestamp(value, field) {
  const timestamp = String(value || '').trim();
  if (!timestamp || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) {
    throw gatewayError('BOOKING_REQUEST_INVALID', `${field} must be an ISO 8601 timestamp with timezone`, 400);
  }
  return new Date(timestamp).toISOString();
}

function maskPhone(value) {
  const phone = String(value || '').trim();
  if (!phone) return null;
  if (phone.length <= 4) return '*'.repeat(phone.length);
  if (phone.length <= 7) return `${phone.slice(0, 2)}${'*'.repeat(phone.length - 4)}${phone.slice(-2)}`;
  return `${phone.slice(0, 3)}${'*'.repeat(phone.length - 7)}${phone.slice(-4)}`;
}

function defaultStatusMessage(status) {
  return {
    submitted: '预约申请已提交',
    confirmed: '预约申请已确认',
    declined: '预约申请未能确认',
    cancelled: '预约申请已取消',
  }[String(status || '')] || '预约申请状态已更新';
}

function truncate(value, max) {
  const text = String(value || '');
  return text.length > max ? text.slice(0, max) : text;
}

function toIso(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error('Booking request timestamp is invalid');
  return parsed.toISOString();
}

function optionalString(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function stringValue(value) {
  return String(value ?? '').trim();
}

function assertClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new TypeError('PostgreSQL client with query(sql, params) is required');
  }
}
