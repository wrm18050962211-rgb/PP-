import { createHash, randomUUID } from 'node:crypto';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;
const CURSOR_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const USER_REQUEST_TYPES = new Set(['support', 'data_access', 'data_copy', 'account_deletion']);
const USER_REQUEST_STATUSES = new Set(['submitted', 'processing', 'completed', 'declined', 'cancelled']);
const SUPPORT_CATEGORIES = new Set(['booking', 'safety', 'account', 'privacy', 'other']);
const REPORT_TARGET_TYPES = new Set(['post', 'companion']);
const REPORT_CATEGORIES = new Set(['content_violation', 'safety', 'fraud', 'privacy_or_rights', 'other']);
const REPORT_STATUSES = new Set(['pending', 'investigating', 'resolved', 'rejected']);
const REPORT_RESOLUTION_ACTIONS = new Set(['no_action', 'remove_post', 'suspend_companion']);
const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;

export const STORE_LITE_COMPLIANCE_SCHEMA = Object.freeze({
  userRequestTable: 'user_requests',
  userRequestStatusLogTable: 'user_request_status_logs',
  reportTable: 'reports',
  companionBlockTable: 'user_companion_blocks',
  adminActionLogTable: 'admin_action_logs',
  userRequestTypes: Object.freeze([...USER_REQUEST_TYPES]),
  userRequestStatuses: Object.freeze([...USER_REQUEST_STATUSES]),
  reportTargetTypes: Object.freeze([...REPORT_TARGET_TYPES]),
  reportCategories: Object.freeze([...REPORT_CATEGORIES]),
  reportStatuses: Object.freeze([...REPORT_STATUSES]),
  maxLimit: MAX_LIMIT,
  maxClientRequestId: 160,
  maxDescription: 2000,
  maxReasonCode: 80,
  maxPublicMessage: 1000,
  maxInternalNote: 1000,
});

export class StoreLiteComplianceGatewayError extends Error {
  constructor(code, message, status, options = {}) {
    super(message, options);
    this.name = 'StoreLiteComplianceGatewayError';
    this.code = code;
    this.status = status;
  }
}

export async function createUserRequestForConsumer(client, input = {}) {
  assertClient(client);
  const draft = parseUserRequestCreate(input);
  const fingerprint = fingerprintOf({
    version: 1,
    requestType: draft.requestType,
    supportCategory: draft.supportCategory,
    bookingRequestId: draft.bookingRequestId,
    description: draft.description,
  });

  return inTransaction(client, async () => {
    const prior = await findIdempotentUserRequest(client, draft.userId, draft.clientRequestId);
    if (prior) {
      assertFingerprint(prior, fingerprint, 'USER_REQUEST_IDEMPOTENCY_CONFLICT', 'clientRequestId was already used with a different user request');
      return loadUserRequestConsumerDetail(client, prior.id, draft.userId);
    }

    if (draft.bookingRequestId) {
      const booking = await client.query(
        `select id
         from booking_requests
         where id = $1::uuid
           and user_id = $2::uuid
         limit 1
         for share`,
        [draft.bookingRequestId, draft.userId],
      );
      if (!booking.rows?.[0]) {
        throw complianceError('USER_REQUEST_BOOKING_NOT_FOUND', 'Booking request not found', 404);
      }
    }

    if (draft.requestType === 'account_deletion') {
      const active = await findActiveAccountDeletion(client, draft.userId);
      if (active) {
        throw complianceError('USER_REQUEST_STATUS_CONFLICT', 'An active account deletion request already exists', 409);
      }
    }

    const inserted = await client.query(
      `insert into user_requests (
         id, user_id, request_type, support_category, booking_request_id,
         description, client_request_id, request_fingerprint, status,
         created_at, updated_at
       ) values (
         $1::uuid, $2::uuid, $3::user_request_type, $4, $5::uuid,
         $6, $7, $8, 'submitted', now(), now()
       )
       on conflict do nothing
       returning id`,
      [
        draft.userRequestId,
        draft.userId,
        draft.requestType,
        draft.supportCategory,
        draft.bookingRequestId,
        draft.description,
        draft.clientRequestId,
        fingerprint,
      ],
    );

    let userRequestId = inserted.rows?.[0]?.id;
    if (!userRequestId) {
      const racedPrior = await findIdempotentUserRequest(client, draft.userId, draft.clientRequestId);
      if (racedPrior) {
        assertFingerprint(racedPrior, fingerprint, 'USER_REQUEST_IDEMPOTENCY_CONFLICT', 'clientRequestId was already used with a different user request');
        userRequestId = racedPrior.id;
      } else if (draft.requestType === 'account_deletion' && (await findActiveAccountDeletion(client, draft.userId))) {
        throw complianceError('USER_REQUEST_STATUS_CONFLICT', 'An active account deletion request already exists', 409);
      } else {
        throw new Error('User request insert conflict could not be resolved');
      }
    } else {
      await insertUserRequestStatusLog(client, {
        id: draft.statusLogId,
        userRequestId,
        fromStatus: null,
        toStatus: 'submitted',
        actorType: 'user',
        actorUserId: draft.userId,
        actorAdminId: null,
        reasonCode: 'user_submitted',
        publicMessage: null,
      });
    }

    return loadUserRequestConsumerDetail(client, userRequestId, draft.userId);
  });
}

export async function listUserRequestsForConsumer(client, options = {}) {
  assertClient(client);
  const userId = requireUuid(options.userId, 'userId', 'USER_REQUEST_INVALID');
  return listUserRequests(client, {
    actor: { type: 'consumer', id: userId },
    ownerUserId: userId,
    admin: false,
    requestType: parseOptionalEnum(options.requestType, USER_REQUEST_TYPES, 'USER_REQUEST_QUERY_INVALID', 'Unknown user request type'),
    status: parseOptionalEnum(options.status, USER_REQUEST_STATUSES, 'USER_REQUEST_QUERY_INVALID', 'Unknown user request status'),
    limit: parseLimit(options.limit, 'USER_REQUEST_QUERY_INVALID'),
    cursor: options.cursor,
  });
}

export async function getUserRequestDetailForConsumer(client, options = {}) {
  assertClient(client);
  const userId = requireUuid(options.userId, 'userId', 'USER_REQUEST_INVALID');
  const userRequestId = requireUuid(options.userRequestId, 'userRequestId', 'USER_REQUEST_INVALID');
  try {
    return await loadUserRequestConsumerDetail(client, userRequestId, userId);
  } catch (error) {
    throw normalizeFailure(error);
  }
}

export async function cancelUserRequestForConsumer(client, input = {}) {
  assertClient(client);
  return transitionUserRequest(client, {
    actor: {
      type: 'user',
      userId: requireUuid(input.userId, 'userId', 'USER_REQUEST_INVALID'),
    },
    userRequestId: requireUuid(input.userRequestId, 'userRequestId', 'USER_REQUEST_INVALID'),
    targetStatus: 'cancelled',
    reasonCode: optionalText(input.reasonCode, STORE_LITE_COMPLIANCE_SCHEMA.maxReasonCode, 'reasonCode', 'USER_REQUEST_INVALID'),
    publicMessage: optionalText(input.reason ?? input.publicMessage, STORE_LITE_COMPLIANCE_SCHEMA.maxPublicMessage, 'reason', 'USER_REQUEST_INVALID'),
    statusLogId: optionalUuid(input.statusLogId, 'statusLogId', 'USER_REQUEST_INVALID') || randomUUID(),
  });
}

export async function listUserRequestsForAdmin(client, options = {}) {
  assertClient(client);
  const adminId = requireUuid(options.adminId, 'adminId', 'USER_REQUEST_INVALID');
  return listUserRequests(client, {
    actor: { type: 'admin', id: adminId },
    ownerUserId: null,
    admin: true,
    requestType: parseOptionalEnum(options.requestType, USER_REQUEST_TYPES, 'USER_REQUEST_QUERY_INVALID', 'Unknown user request type'),
    status: parseOptionalEnum(options.status, USER_REQUEST_STATUSES, 'USER_REQUEST_QUERY_INVALID', 'Unknown user request status'),
    limit: parseLimit(options.limit, 'USER_REQUEST_QUERY_INVALID'),
    cursor: options.cursor,
  });
}

export async function getUserRequestDetailForAdmin(client, options = {}) {
  assertClient(client);
  requireUuid(options.adminId, 'adminId', 'USER_REQUEST_INVALID');
  const userRequestId = requireUuid(options.userRequestId, 'userRequestId', 'USER_REQUEST_INVALID');
  try {
    return await loadUserRequestAdminDetail(client, userRequestId);
  } catch (error) {
    throw normalizeFailure(error);
  }
}

export async function startUserRequestForAdmin(client, input = {}) {
  assertClient(client);
  return transitionUserRequest(client, {
    actor: parseAdminActor(input, 'USER_REQUEST_INVALID'),
    userRequestId: requireUuid(input.userRequestId, 'userRequestId', 'USER_REQUEST_INVALID'),
    targetStatus: 'processing',
    reasonCode: 'operations_started',
    publicMessage: optionalText(input.publicMessage, STORE_LITE_COMPLIANCE_SCHEMA.maxPublicMessage, 'publicMessage', 'USER_REQUEST_INVALID'),
    internalNote: optionalText(input.internalNote, STORE_LITE_COMPLIANCE_SCHEMA.maxInternalNote, 'internalNote', 'USER_REQUEST_INVALID'),
    statusLogId: optionalUuid(input.statusLogId, 'statusLogId', 'USER_REQUEST_INVALID') || randomUUID(),
    adminActionLogId: optionalUuid(input.adminActionLogId, 'adminActionLogId', 'USER_REQUEST_INVALID') || randomUUID(),
  });
}

export async function completeUserRequestForAdmin(client, input = {}) {
  assertClient(client);
  return transitionUserRequest(client, {
    actor: parseAdminActor(input, 'USER_REQUEST_INVALID'),
    userRequestId: requireUuid(input.userRequestId, 'userRequestId', 'USER_REQUEST_INVALID'),
    targetStatus: 'completed',
    reasonCode: 'operations_completed',
    publicMessage: requireText(input.publicMessage, 1, STORE_LITE_COMPLIANCE_SCHEMA.maxPublicMessage, 'publicMessage', 'USER_REQUEST_INVALID'),
    internalNote: optionalText(input.internalNote, STORE_LITE_COMPLIANCE_SCHEMA.maxInternalNote, 'internalNote', 'USER_REQUEST_INVALID'),
    statusLogId: optionalUuid(input.statusLogId, 'statusLogId', 'USER_REQUEST_INVALID') || randomUUID(),
    adminActionLogId: optionalUuid(input.adminActionLogId, 'adminActionLogId', 'USER_REQUEST_INVALID') || randomUUID(),
  });
}

export async function declineUserRequestForAdmin(client, input = {}) {
  assertClient(client);
  return transitionUserRequest(client, {
    actor: parseAdminActor(input, 'USER_REQUEST_INVALID'),
    userRequestId: requireUuid(input.userRequestId, 'userRequestId', 'USER_REQUEST_INVALID'),
    targetStatus: 'declined',
    reasonCode: requireText(input.reasonCode, 1, STORE_LITE_COMPLIANCE_SCHEMA.maxReasonCode, 'reasonCode', 'USER_REQUEST_INVALID'),
    publicMessage: requireText(input.publicMessage, 1, STORE_LITE_COMPLIANCE_SCHEMA.maxPublicMessage, 'publicMessage', 'USER_REQUEST_INVALID'),
    internalNote: optionalText(input.internalNote, STORE_LITE_COMPLIANCE_SCHEMA.maxInternalNote, 'internalNote', 'USER_REQUEST_INVALID'),
    statusLogId: optionalUuid(input.statusLogId, 'statusLogId', 'USER_REQUEST_INVALID') || randomUUID(),
    adminActionLogId: optionalUuid(input.adminActionLogId, 'adminActionLogId', 'USER_REQUEST_INVALID') || randomUUID(),
  });
}

async function findIdempotentUserRequest(client, userId, clientRequestId) {
  const result = await client.query(
    `select id, request_fingerprint
     from user_requests
     where user_id = $1::uuid
       and client_request_id = $2
     limit 1`,
    [userId, clientRequestId],
  );
  return result.rows?.[0] || null;
}

async function findActiveAccountDeletion(client, userId) {
  const result = await client.query(
    `select id
     from user_requests
     where user_id = $1::uuid
       and request_type = 'account_deletion'
       and status in ('submitted', 'processing')
     order by created_at desc, id desc
     limit 1`,
    [userId],
  );
  return result.rows?.[0] || null;
}

async function listUserRequests(client, options) {
  const filters = { requestType: options.requestType, status: options.status };
  const cursor = parseCursor(options.cursor, {
    resource: 'user_requests',
    actor: options.actor,
    filters,
    code: 'USER_REQUEST_CURSOR_INVALID',
    message: 'User request cursor is invalid',
  });
  const ownerPredicate = options.admin ? '' : 'and r.user_id = $1::uuid';
  const params = options.admin
    ? [options.requestType, options.status, cursor?.createdAt ?? null, cursor?.id ?? null, options.limit + 1]
    : [options.ownerUserId, options.requestType, options.status, cursor?.createdAt ?? null, cursor?.id ?? null, options.limit + 1];
  const offset = options.admin ? 0 : 1;

  try {
    const result = await client.query(
      `${userRequestSelect()}
       where ($${offset + 1}::user_request_type is null or r.request_type = $${offset + 1}::user_request_type)
         and ($${offset + 2}::user_request_status is null or r.status = $${offset + 2}::user_request_status)
         ${ownerPredicate}
         and (
           $${offset + 3}::timestamptz is null
           or (r.created_at, r.id) < ($${offset + 3}::timestamptz, $${offset + 4}::uuid)
         )
       order by r.created_at desc, r.id desc
       limit $${offset + 5}`,
      params,
    );
    return pageResult(result.rows || [], options.limit, options.actor, 'user_requests', filters, options.admin ? mapUserRequestAdminSummary : mapUserRequestConsumerSummary);
  } catch (error) {
    throw normalizeFailure(error);
  }
}

async function transitionUserRequest(client, command) {
  return inTransaction(client, async () => {
    const ownerPredicate = command.actor.type === 'user' ? 'and r.user_id = $2::uuid' : '';
    const params = command.actor.type === 'user'
      ? [command.userRequestId, command.actor.userId]
      : [command.userRequestId];
    const locked = await client.query(
      `select r.*
       from user_requests r
       where r.id = $1::uuid
         ${ownerPredicate}
       limit 1
       for update`,
      params,
    );
    const before = locked.rows?.[0];
    if (!before) throw complianceError('USER_REQUEST_NOT_FOUND', 'User request not found', 404);
    if (command.actor.type === 'admin' && command.targetStatus === 'completed' && before.request_type === 'account_deletion') {
      throw complianceError(
        'USER_REQUEST_STATUS_CONFLICT',
        'Account deletion can only be completed by the deletion executor',
        409,
      );
    }
    if (String(before.status) === command.targetStatus) {
      return command.actor.type === 'admin'
        ? loadUserRequestAdminDetail(client, command.userRequestId)
        : loadUserRequestConsumerDetail(client, command.userRequestId, command.actor.userId);
    }
    assertUserRequestTransition(before.status, command.targetStatus, command.actor.type);

    const timestampColumn = {
      processing: 'processing_at',
      completed: 'completed_at',
      declined: 'declined_at',
      cancelled: 'cancelled_at',
    }[command.targetStatus];
    const updated = await client.query(
      `update user_requests
       set status = $3::user_request_status,
           ${timestampColumn} = now(),
           updated_at = now()
       where id = $1::uuid
         and status = $2::user_request_status
       returning *`,
      [command.userRequestId, before.status, command.targetStatus],
    );
    if (!updated.rows?.[0]) {
      throw complianceError('USER_REQUEST_STATUS_CONFLICT', 'User request status changed; refresh and retry', 409);
    }

    await insertUserRequestStatusLog(client, {
      id: command.statusLogId,
      userRequestId: command.userRequestId,
      fromStatus: before.status,
      toStatus: command.targetStatus,
      actorType: command.actor.type,
      actorUserId: command.actor.userId || null,
      actorAdminId: command.actor.adminId || null,
      reasonCode: command.reasonCode || null,
      publicMessage: command.publicMessage || null,
    });
    if (command.actor.type === 'admin') {
      await insertAdminActionLog(client, {
        id: command.adminActionLogId,
        adminId: command.actor.adminId,
        action: `user_request.${command.targetStatus}`,
        targetType: 'user_request',
        targetId: command.userRequestId,
        beforeData: { status: String(before.status), requestType: String(before.request_type) },
        afterData: {
          status: command.targetStatus,
          reasonCode: command.reasonCode || null,
          publicMessage: command.publicMessage || null,
          internalNote: command.internalNote || null,
        },
        ip: command.actor.ip,
        userAgent: command.actor.userAgent,
      });
    }

    return command.actor.type === 'admin'
      ? loadUserRequestAdminDetail(client, command.userRequestId)
      : loadUserRequestConsumerDetail(client, command.userRequestId, command.actor.userId);
  });
}

async function insertUserRequestStatusLog(client, entry) {
  await client.query(
    `insert into user_request_status_logs (
       id, user_request_id, from_status, to_status, actor_type,
       actor_user_id, actor_admin_id, reason_code, public_message, created_at
     ) values (
       $1::uuid, $2::uuid, $3::user_request_status,
       $4::user_request_status, $5::user_request_actor_type,
       $6::uuid, $7::uuid, $8, $9, now()
     )`,
    [
      entry.id,
      entry.userRequestId,
      entry.fromStatus,
      entry.toStatus,
      entry.actorType,
      entry.actorUserId,
      entry.actorAdminId,
      entry.reasonCode,
      entry.publicMessage,
    ],
  );
}

async function loadUserRequestConsumerDetail(client, userRequestId, userId) {
  const result = await client.query(
    `${userRequestSelect()}
     where r.id = $1::uuid
       and r.user_id = $2::uuid
     limit 1`,
    [userRequestId, userId],
  );
  const row = result.rows?.[0];
  if (!row) throw complianceError('USER_REQUEST_NOT_FOUND', 'User request not found', 404);
  return mapUserRequestConsumerDetail(row, await loadUserRequestStatusLogs(client, userRequestId));
}

async function loadUserRequestAdminDetail(client, userRequestId) {
  const result = await client.query(
    `${userRequestSelect()}
     where r.id = $1::uuid
     limit 1`,
    [userRequestId],
  );
  const row = result.rows?.[0];
  if (!row) throw complianceError('USER_REQUEST_NOT_FOUND', 'User request not found', 404);
  return mapUserRequestAdminDetail(row, await loadUserRequestStatusLogs(client, userRequestId));
}

async function loadUserRequestStatusLogs(client, userRequestId) {
  const result = await client.query(
    `select id, from_status, to_status, actor_type, reason_code, public_message, created_at
     from user_request_status_logs
     where user_request_id = $1::uuid
     order by created_at, id`,
    [userRequestId],
  );
  return result.rows || [];
}

function userRequestSelect() {
  return `select
            r.id,
            r.user_id,
            r.request_type,
            r.support_category,
            r.booking_request_id,
            r.description,
            r.status,
            r.processing_at,
            r.completed_at,
            r.declined_at,
            r.cancelled_at,
            r.created_at,
            to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at_cursor,
            r.updated_at,
            u.nickname as consumer_name
          from user_requests r
          join users u on u.id = r.user_id`;
}

function mapUserRequestConsumerSummary(row) {
  return {
    id: stringValue(row.id),
    requestType: stringValue(row.request_type),
    supportCategory: optionalString(row.support_category),
    bookingRequestId: optionalString(row.booking_request_id),
    description: optionalString(row.description),
    status: stringValue(row.status),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapUserRequestConsumerDetail(row, statusLogs) {
  return {
    ...mapUserRequestConsumerSummary(row),
    statusLogs: statusLogs.map(mapUserRequestStatusLog),
  };
}

function mapUserRequestAdminSummary(row) {
  return {
    ...mapUserRequestConsumerSummary(row),
    user: {
      id: stringValue(row.user_id),
      nickname: stringValue(row.consumer_name),
    },
  };
}

function mapUserRequestAdminDetail(row, statusLogs) {
  return {
    ...mapUserRequestAdminSummary(row),
    statusLogs: statusLogs.map(mapUserRequestStatusLog),
  };
}

function mapUserRequestStatusLog(row) {
  return {
    id: stringValue(row.id),
    fromStatus: optionalString(row.from_status),
    toStatus: stringValue(row.to_status),
    actorType: stringValue(row.actor_type),
    reasonCode: optionalString(row.reason_code),
    publicMessage: optionalString(row.public_message),
    createdAt: toIso(row.created_at),
  };
}

function parseUserRequestCreate(input) {
  const requestType = parseRequiredEnum(input.requestType, USER_REQUEST_TYPES, 'USER_REQUEST_INVALID', 'Unknown user request type');
  const supportCategory = optionalText(input.supportCategory, 80, 'supportCategory', 'USER_REQUEST_INVALID');
  const bookingRequestId = optionalUuid(input.bookingRequestId, 'bookingRequestId', 'USER_REQUEST_INVALID');
  if (requestType === 'support') {
    if (supportCategory && !SUPPORT_CATEGORIES.has(supportCategory)) {
      throw complianceError('USER_REQUEST_INVALID', 'Unknown supportCategory', 400);
    }
  } else if (supportCategory || bookingRequestId) {
    throw complianceError('USER_REQUEST_INVALID', 'Only support requests may include supportCategory or bookingRequestId', 400);
  }
  return {
    userRequestId: optionalUuid(input.userRequestId, 'userRequestId', 'USER_REQUEST_INVALID') || randomUUID(),
    statusLogId: optionalUuid(input.statusLogId, 'statusLogId', 'USER_REQUEST_INVALID') || randomUUID(),
    userId: requireUuid(input.userId, 'userId', 'USER_REQUEST_INVALID'),
    requestType,
    supportCategory,
    bookingRequestId,
    description: optionalText(input.description, STORE_LITE_COMPLIANCE_SCHEMA.maxDescription, 'description', 'USER_REQUEST_INVALID'),
    clientRequestId: requireText(input.clientRequestId, 8, STORE_LITE_COMPLIANCE_SCHEMA.maxClientRequestId, 'clientRequestId', 'USER_REQUEST_INVALID'),
  };
}

function assertUserRequestTransition(fromStatus, toStatus, actorType) {
  const from = String(fromStatus || '');
  const allowed = actorType === 'admin'
    ? (toStatus === 'processing' && from === 'submitted')
      || (toStatus === 'declined' && (from === 'submitted' || from === 'processing'))
      || (toStatus === 'completed' && from === 'processing')
    : toStatus === 'cancelled' && (from === 'submitted' || from === 'processing');
  if (!allowed) {
    throw complianceError('USER_REQUEST_STATUS_CONFLICT', `Cannot change user request from ${from} to ${toStatus}`, 409);
  }
}

export async function createContentReportForConsumer(client, input = {}) {
  assertClient(client);
  const draft = parseContentReportCreate(input);
  const fingerprint = fingerprintOf({
    version: 1,
    targetType: draft.targetType,
    targetId: draft.targetId,
    category: draft.category,
    description: draft.description,
  });

  return inTransaction(client, async () => {
    const prior = await findIdempotentContentReport(client, draft.userId, draft.clientRequestId);
    if (prior) {
      assertFingerprint(prior, fingerprint, 'CONTENT_REPORT_IDEMPOTENCY_CONFLICT', 'clientRequestId was already used with a different content report');
      return loadContentReportConsumerDetail(client, prior.id, draft.userId);
    }

    const target = await resolveReportTarget(client, draft.targetType, draft.targetId);
    if (!target) throw complianceError('CONTENT_REPORT_TARGET_NOT_FOUND', 'Report target not found', 404);
    if (String(target.reported_user_id) === draft.userId) {
      throw complianceError('CONTENT_REPORT_INVALID', 'Users cannot report their own photographer profile or post', 400);
    }

    const inserted = await client.query(
      `insert into reports (
         id, reporter_id, reported_user_id, report_context,
         order_id, conversation_id, target_type, target_id,
         category, description, evidence_files, client_request_id,
         request_fingerprint, status, created_at, updated_at
       ) values (
         $1::uuid, $2::uuid, $3::uuid, 'store_lite_content',
         null, null, $4, $5::uuid,
         $6, $7, '[]'::jsonb, $8,
         $9, 'pending', now(), now()
       )
       on conflict (reporter_id, client_request_id)
       where report_context = 'store_lite_content'
       do nothing
       returning id`,
      [
        draft.reportId,
        draft.userId,
        target.reported_user_id,
        draft.targetType,
        draft.targetId,
        draft.category,
        draft.description,
        draft.clientRequestId,
        fingerprint,
      ],
    );
    let reportId = inserted.rows?.[0]?.id;
    if (!reportId) {
      const racedPrior = await findIdempotentContentReport(client, draft.userId, draft.clientRequestId);
      if (!racedPrior) throw new Error('Content report insert conflict could not be resolved');
      assertFingerprint(racedPrior, fingerprint, 'CONTENT_REPORT_IDEMPOTENCY_CONFLICT', 'clientRequestId was already used with a different content report');
      reportId = racedPrior.id;
    }
    return loadContentReportConsumerDetail(client, reportId, draft.userId);
  });
}

export async function listContentReportsForConsumer(client, options = {}) {
  assertClient(client);
  const userId = requireUuid(options.userId, 'userId', 'CONTENT_REPORT_INVALID');
  return listContentReports(client, {
    actor: { type: 'consumer', id: userId },
    ownerUserId: userId,
    admin: false,
    status: parseOptionalEnum(options.status, REPORT_STATUSES, 'CONTENT_REPORT_QUERY_INVALID', 'Unknown content report status'),
    targetType: parseOptionalEnum(options.targetType, REPORT_TARGET_TYPES, 'CONTENT_REPORT_QUERY_INVALID', 'Unknown content report target type'),
    category: null,
    limit: parseLimit(options.limit, 'CONTENT_REPORT_QUERY_INVALID'),
    cursor: options.cursor,
  });
}

export async function getContentReportDetailForConsumer(client, options = {}) {
  assertClient(client);
  const userId = requireUuid(options.userId, 'userId', 'CONTENT_REPORT_INVALID');
  const reportId = requireUuid(options.reportId, 'reportId', 'CONTENT_REPORT_INVALID');
  try {
    return await loadContentReportConsumerDetail(client, reportId, userId);
  } catch (error) {
    throw normalizeFailure(error);
  }
}

export async function listContentReportsForAdmin(client, options = {}) {
  assertClient(client);
  const adminId = requireUuid(options.adminId, 'adminId', 'CONTENT_REPORT_INVALID');
  return listContentReports(client, {
    actor: { type: 'admin', id: adminId },
    ownerUserId: null,
    admin: true,
    status: parseOptionalEnum(options.status, REPORT_STATUSES, 'CONTENT_REPORT_QUERY_INVALID', 'Unknown content report status'),
    targetType: parseOptionalEnum(options.targetType, REPORT_TARGET_TYPES, 'CONTENT_REPORT_QUERY_INVALID', 'Unknown content report target type'),
    category: parseOptionalEnum(options.category, REPORT_CATEGORIES, 'CONTENT_REPORT_QUERY_INVALID', 'Unknown content report category'),
    limit: parseLimit(options.limit, 'CONTENT_REPORT_QUERY_INVALID'),
    cursor: options.cursor,
  });
}

export async function getContentReportDetailForAdmin(client, options = {}) {
  assertClient(client);
  requireUuid(options.adminId, 'adminId', 'CONTENT_REPORT_INVALID');
  const reportId = requireUuid(options.reportId, 'reportId', 'CONTENT_REPORT_INVALID');
  try {
    return await loadContentReportAdminDetail(client, reportId);
  } catch (error) {
    throw normalizeFailure(error);
  }
}

export async function investigateContentReportForAdmin(client, input = {}) {
  assertClient(client);
  return transitionContentReport(client, {
    actor: parseAdminActor(input, 'CONTENT_REPORT_INVALID'),
    reportId: requireUuid(input.reportId, 'reportId', 'CONTENT_REPORT_INVALID'),
    targetStatus: 'investigating',
    resolutionAction: null,
    publicMessage: null,
    internalNote: optionalText(input.internalNote, STORE_LITE_COMPLIANCE_SCHEMA.maxInternalNote, 'internalNote', 'CONTENT_REPORT_INVALID'),
    adminActionLogId: optionalUuid(input.adminActionLogId, 'adminActionLogId', 'CONTENT_REPORT_INVALID') || randomUUID(),
  });
}

export async function resolveContentReportForAdmin(client, input = {}) {
  assertClient(client);
  const resolutionAction = parseRequiredEnum(
    input.resolutionAction,
    REPORT_RESOLUTION_ACTIONS,
    'CONTENT_REPORT_RESOLUTION_INVALID',
    'Unknown content report resolution action',
  );
  return transitionContentReport(client, {
    actor: parseAdminActor(input, 'CONTENT_REPORT_INVALID'),
    reportId: requireUuid(input.reportId, 'reportId', 'CONTENT_REPORT_INVALID'),
    targetStatus: 'resolved',
    resolutionAction,
    publicMessage: requireText(input.publicMessage, 1, STORE_LITE_COMPLIANCE_SCHEMA.maxPublicMessage, 'publicMessage', 'CONTENT_REPORT_INVALID'),
    internalNote: optionalText(input.internalNote, STORE_LITE_COMPLIANCE_SCHEMA.maxInternalNote, 'internalNote', 'CONTENT_REPORT_INVALID'),
    adminActionLogId: optionalUuid(input.adminActionLogId, 'adminActionLogId', 'CONTENT_REPORT_INVALID') || randomUUID(),
  });
}

export async function rejectContentReportForAdmin(client, input = {}) {
  assertClient(client);
  return transitionContentReport(client, {
    actor: parseAdminActor(input, 'CONTENT_REPORT_INVALID'),
    reportId: requireUuid(input.reportId, 'reportId', 'CONTENT_REPORT_INVALID'),
    targetStatus: 'rejected',
    resolutionAction: 'no_action',
    publicMessage: requireText(input.publicMessage, 1, STORE_LITE_COMPLIANCE_SCHEMA.maxPublicMessage, 'publicMessage', 'CONTENT_REPORT_INVALID'),
    internalNote: optionalText(input.internalNote, STORE_LITE_COMPLIANCE_SCHEMA.maxInternalNote, 'internalNote', 'CONTENT_REPORT_INVALID'),
    adminActionLogId: optionalUuid(input.adminActionLogId, 'adminActionLogId', 'CONTENT_REPORT_INVALID') || randomUUID(),
  });
}

async function findIdempotentContentReport(client, userId, clientRequestId) {
  const result = await client.query(
    `select id, request_fingerprint
     from reports
     where report_context = 'store_lite_content'
       and reporter_id = $1::uuid
       and client_request_id = $2
     limit 1`,
    [userId, clientRequestId],
  );
  return result.rows?.[0] || null;
}

async function resolveReportTarget(client, targetType, targetId) {
  const result = targetType === 'post'
    ? await client.query(
        `select p.id as target_id,
                c.id as companion_id,
                c.user_id as reported_user_id
         from posts p
         join companions c on c.id = p.companion_id
         where p.id = $1::uuid
           and p.status = 'approved'
           and p.is_feed_visible = true
           and c.status = 'approved'
           and c.service_enabled = true
         limit 1
         for share`,
        [targetId],
      )
    : await client.query(
        `select c.id as target_id,
                c.id as companion_id,
                c.user_id as reported_user_id
         from companions c
         where c.id = $1::uuid
           and c.status = 'approved'
           and c.service_enabled = true
         limit 1
         for share`,
        [targetId],
      );
  return result.rows?.[0] || null;
}

async function listContentReports(client, options) {
  const filters = { status: options.status, targetType: options.targetType, category: options.category };
  const cursor = parseCursor(options.cursor, {
    resource: 'content_reports',
    actor: options.actor,
    filters,
    code: 'CONTENT_REPORT_CURSOR_INVALID',
    message: 'Content report cursor is invalid',
  });
  const ownerPredicate = options.admin ? '' : 'and r.reporter_id = $1::uuid';
  const params = options.admin
    ? [options.status, options.targetType, options.category, cursor?.createdAt ?? null, cursor?.id ?? null, options.limit + 1]
    : [options.ownerUserId, options.status, options.targetType, cursor?.createdAt ?? null, cursor?.id ?? null, options.limit + 1];
  const offset = options.admin ? 0 : 1;
  const categoryPredicate = options.admin
    ? `and ($${offset + 3}::text is null or r.category = $${offset + 3})`
    : '';
  const cursorOffset = options.admin ? offset + 4 : offset + 3;
  const limitOffset = cursorOffset + 2;

  try {
    const result = await client.query(
      `${contentReportSelect({ admin: options.admin })}
       where r.report_context = 'store_lite_content'
         and ($${offset + 1}::report_status is null or r.status = $${offset + 1}::report_status)
         and ($${offset + 2}::text is null or r.target_type = $${offset + 2})
         ${categoryPredicate}
         ${ownerPredicate}
         and (
           $${cursorOffset}::timestamptz is null
           or (r.created_at, r.id) < ($${cursorOffset}::timestamptz, $${cursorOffset + 1}::uuid)
         )
       order by r.created_at desc, r.id desc
       limit $${limitOffset}`,
      params,
    );
    return pageResult(result.rows || [], options.limit, options.actor, 'content_reports', filters, options.admin ? mapContentReportAdminSummary : mapContentReportConsumerSummary);
  } catch (error) {
    throw normalizeFailure(error);
  }
}

async function transitionContentReport(client, command) {
  return inTransaction(client, async () => {
    const locked = await client.query(
      `select r.id, r.status, r.target_type, r.target_id
       from reports r
       where r.id = $1::uuid
         and r.report_context = 'store_lite_content'
       limit 1
       for update`,
      [command.reportId],
    );
    const before = locked.rows?.[0];
    if (!before) throw complianceError('CONTENT_REPORT_NOT_FOUND', 'Content report not found', 404);
    assertResolutionMatchesTarget(command.resolutionAction, before.target_type, command.targetStatus);
    if (String(before.status) === command.targetStatus) {
      return loadContentReportAdminDetail(client, command.reportId);
    }
    assertContentReportTransition(before.status, command.targetStatus);

    if (command.targetStatus === 'resolved') {
      await applyContentResolution(client, command.resolutionAction, before);
    }

    const publicResult = command.targetStatus === 'investigating'
      ? null
      : JSON.stringify({
          resolutionAction: command.resolutionAction,
          publicMessage: command.publicMessage,
        });
    const result = await client.query(
      `update reports
       set status = $3::report_status,
           handled_by = $4::uuid,
           handled_at = case when $3::report_status = 'investigating' then handled_at else now() end,
           result = case when $3::report_status = 'investigating' then result else $5 end,
           updated_at = now()
       where id = $1::uuid
         and status = $2::report_status
         and report_context = 'store_lite_content'
       returning id`,
      [command.reportId, before.status, command.targetStatus, command.actor.adminId, publicResult],
    );
    if (!result.rows?.[0]) {
      throw complianceError('CONTENT_REPORT_STATUS_CONFLICT', 'Content report status changed; refresh and retry', 409);
    }

    await insertAdminActionLog(client, {
      id: command.adminActionLogId,
      adminId: command.actor.adminId,
      action: `content_report.${command.targetStatus}`,
      targetType: 'content_report',
      targetId: command.reportId,
      beforeData: { status: String(before.status), targetType: String(before.target_type) },
      afterData: {
        status: command.targetStatus,
        resolutionAction: command.resolutionAction,
        publicMessage: command.publicMessage,
        internalNote: command.internalNote,
      },
      ip: command.actor.ip,
      userAgent: command.actor.userAgent,
    });
    return loadContentReportAdminDetail(client, command.reportId);
  });
}

async function applyContentResolution(client, action, report) {
  if (action === 'no_action') return;
  const result = action === 'remove_post'
    ? await client.query(
        `update posts
         set status = 'removed',
             is_feed_visible = false,
             updated_at = now()
         where id = $1::uuid
         returning id`,
        [report.target_id],
      )
    : await client.query(
        `update companions
         set status = 'suspended',
             service_enabled = false,
             updated_at = now()
         where id = $1::uuid
         returning id`,
        [report.target_id],
      );
  if (!result.rows?.[0]) {
    throw complianceError('CONTENT_REPORT_TARGET_NOT_FOUND', 'Report target no longer exists', 409);
  }
}

async function loadContentReportConsumerDetail(client, reportId, userId) {
  const result = await client.query(
    `${contentReportSelect({ admin: false })}
     where r.id = $1::uuid
       and r.report_context = 'store_lite_content'
       and r.reporter_id = $2::uuid
     limit 1`,
    [reportId, userId],
  );
  const row = result.rows?.[0];
  if (!row) throw complianceError('CONTENT_REPORT_NOT_FOUND', 'Content report not found', 404);
  return mapContentReportConsumerSummary(row);
}

async function loadContentReportAdminDetail(client, reportId) {
  const result = await client.query(
    `${contentReportSelect({ admin: true })}
     where r.id = $1::uuid
       and r.report_context = 'store_lite_content'
     limit 1`,
    [reportId],
  );
  const row = result.rows?.[0];
  if (!row) throw complianceError('CONTENT_REPORT_NOT_FOUND', 'Content report not found', 404);
  return mapContentReportAdminSummary(row);
}

function contentReportSelect({ admin }) {
  const adminColumns = admin
    ? `,
            r.handled_by,
            r.handled_at,
            case
              when r.target_type = 'post'
                then coalesce(nullif(btrim(p.caption), ''), p.location_name, '已下架作品')
              else coalesce(target_companion.display_name, '已暂停摄影师')
            end as target_display_name,
            case
              when r.target_type = 'post' then post_cover.file_url
              else target_companion.real_photo_url
            end as target_image_url,
            reporter.id as reporter_id,
            reporter.nickname as reporter_name`
    : '';
  const adminJoins = admin
    ? `
          left join posts p
            on r.target_type = 'post'
           and p.id = r.target_id
           and p.status = 'approved'
           and p.is_feed_visible = true
          left join lateral (
            select pi.file_url
            from post_images pi
            where pi.post_id = p.id
              and pi.audit_status = 'approved'
            order by pi.sort_order, pi.created_at, pi.id
            limit 1
          ) post_cover on true
          left join companions target_companion
            on r.target_type = 'companion'
           and target_companion.id = r.target_id
           and target_companion.status = 'approved'
           and target_companion.service_enabled = true
          join users reporter on reporter.id = r.reporter_id`
    : '';
  return `select
            r.id,
            r.target_type,
            r.target_id,
            r.category,
            r.description,
            r.status,
            r.result,
            r.created_at,
            to_char(r.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at_cursor,
            r.updated_at${adminColumns}
          from reports r${adminJoins}`;
}

function mapContentReportConsumerSummary(row) {
  return {
    id: stringValue(row.id),
    targetType: stringValue(row.target_type),
    targetId: stringValue(row.target_id),
    category: stringValue(row.category),
    description: optionalString(row.description),
    status: stringValue(row.status),
    result: mapContentReportPublicResult(row),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function mapContentReportAdminSummary(row) {
  return {
    ...mapContentReportConsumerSummary(row),
    reporter: {
      id: stringValue(row.reporter_id),
      nickname: stringValue(row.reporter_name),
    },
    target: {
      targetType: stringValue(row.target_type),
      id: stringValue(row.target_id),
      displayName: truncate(stringValue(row.target_display_name), 160),
      imageUrl: optionalString(row.target_image_url),
    },
    handledAt: row.handled_at ? toIso(row.handled_at) : null,
    handledByAdminId: optionalString(row.handled_by),
  };
}

function mapContentReportPublicResult(row) {
  if (row.status !== 'resolved' && row.status !== 'rejected') return null;
  const raw = optionalString(row.result);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (
    !parsed
    || !REPORT_RESOLUTION_ACTIONS.has(String(parsed.resolutionAction || ''))
    || typeof parsed.publicMessage !== 'string'
    || !parsed.publicMessage.trim()
    || parsed.publicMessage.length > STORE_LITE_COMPLIANCE_SCHEMA.maxPublicMessage
  ) {
    throw new Error('Content report public result is invalid');
  }
  return {
    resolutionAction: String(parsed.resolutionAction),
    publicMessage: parsed.publicMessage,
  };
}

function parseContentReportCreate(input) {
  return {
    reportId: optionalUuid(input.reportId, 'reportId', 'CONTENT_REPORT_INVALID') || randomUUID(),
    userId: requireUuid(input.userId, 'userId', 'CONTENT_REPORT_INVALID'),
    targetType: parseRequiredEnum(input.targetType, REPORT_TARGET_TYPES, 'CONTENT_REPORT_INVALID', 'Unknown content report target type'),
    targetId: requireUuid(input.targetId, 'targetId', 'CONTENT_REPORT_INVALID'),
    category: parseRequiredEnum(input.category, REPORT_CATEGORIES, 'CONTENT_REPORT_INVALID', 'Unknown content report category'),
    description: optionalText(input.description, STORE_LITE_COMPLIANCE_SCHEMA.maxDescription, 'description', 'CONTENT_REPORT_INVALID'),
    clientRequestId: requireText(input.clientRequestId, 8, STORE_LITE_COMPLIANCE_SCHEMA.maxClientRequestId, 'clientRequestId', 'CONTENT_REPORT_INVALID'),
  };
}

function assertContentReportTransition(fromStatus, toStatus) {
  const from = String(fromStatus || '');
  const allowed = toStatus === 'investigating'
    ? from === 'pending'
    : (toStatus === 'resolved' || toStatus === 'rejected')
      && (from === 'pending' || from === 'investigating');
  if (!allowed) {
    throw complianceError('CONTENT_REPORT_STATUS_CONFLICT', `Cannot change content report from ${from} to ${toStatus}`, 409);
  }
}

function assertResolutionMatchesTarget(action, targetType, targetStatus) {
  if (targetStatus !== 'resolved') return;
  const valid = action === 'no_action'
    || (action === 'remove_post' && targetType === 'post')
    || (action === 'suspend_companion' && targetType === 'companion');
  if (!valid) {
    throw complianceError('CONTENT_REPORT_RESOLUTION_INVALID', 'Resolution action does not match the report target', 400);
  }
}

export async function listBlockedCompanionsForConsumer(client, options = {}) {
  assertClient(client);
  const userId = requireUuid(options.userId, 'userId', 'COMPANION_BLOCK_QUERY_INVALID');
  const limit = parseLimit(options.limit, 'COMPANION_BLOCK_QUERY_INVALID');
  const actor = { type: 'consumer', id: userId };
  const filters = {};
  const cursor = parseCursor(options.cursor, {
    resource: 'blocked_companions',
    actor,
    filters,
    code: 'COMPANION_BLOCK_CURSOR_INVALID',
    message: 'Blocked companion cursor is invalid',
  });
  try {
    const result = await client.query(
      `${companionBlockSelect()}
       where b.user_id = $1::uuid
         and (
           $2::timestamptz is null
           or (b.created_at, b.id) < ($2::timestamptz, $3::uuid)
         )
       order by b.created_at desc, b.id desc
       limit $4`,
      [userId, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1],
    );
    return pageResult(result.rows || [], limit, actor, 'blocked_companions', filters, mapCompanionBlock);
  } catch (error) {
    throw normalizeFailure(error);
  }
}

export async function listBlockedCompanionIdsForConsumer(client, options = {}) {
  assertClient(client);
  const userId = requireUuid(options.userId, 'userId', 'COMPANION_BLOCK_QUERY_INVALID');
  try {
    const result = await client.query(
      `select companion_id
       from user_companion_blocks
       where user_id = $1::uuid
       order by created_at desc, id desc`,
      [userId],
    );
    return (result.rows || []).map((row) => stringValue(row.companion_id));
  } catch (error) {
    throw normalizeFailure(error);
  }
}

export async function blockCompanionForConsumer(client, input = {}) {
  assertClient(client);
  const userId = requireUuid(input.userId, 'userId', 'COMPANION_BLOCK_QUERY_INVALID');
  const companionId = requireUuid(input.companionId, 'companionId', 'COMPANION_BLOCK_TARGET_NOT_FOUND');
  const blockId = optionalUuid(input.blockId, 'blockId', 'COMPANION_BLOCK_QUERY_INVALID') || randomUUID();
  return inTransaction(client, async () => {
    const existing = await loadCompanionBlock(client, userId, companionId);
    if (existing) return mapCompanionBlock(existing);

    const target = await client.query(
      `select c.id, c.user_id
       from companions c
       where c.id = $1::uuid
         and c.status = 'approved'
         and c.service_enabled = true
       limit 1
       for share`,
      [companionId],
    );
    const companion = target.rows?.[0];
    if (!companion) throw complianceError('COMPANION_BLOCK_TARGET_NOT_FOUND', 'Photographer not found', 404);
    if (String(companion.user_id) === userId) {
      throw complianceError('COMPANION_BLOCK_TARGET_NOT_FOUND', 'Photographer not found', 404);
    }

    await client.query(
      `insert into user_companion_blocks (id, user_id, companion_id, created_at)
       values ($1::uuid, $2::uuid, $3::uuid, now())
       on conflict (user_id, companion_id) do nothing`,
      [blockId, userId, companionId],
    );
    const row = await loadCompanionBlock(client, userId, companionId);
    if (!row) throw new Error('Companion block insert disappeared');
    return mapCompanionBlock(row);
  });
}

export async function unblockCompanionForConsumer(client, input = {}) {
  assertClient(client);
  const userId = requireUuid(input.userId, 'userId', 'COMPANION_BLOCK_QUERY_INVALID');
  const companionId = requireUuid(input.companionId, 'companionId', 'COMPANION_BLOCK_TARGET_NOT_FOUND');
  try {
    await client.query(
      `delete from user_companion_blocks
       where user_id = $1::uuid
         and companion_id = $2::uuid`,
      [userId, companionId],
    );
    return { companionId, blocked: false, blockedAt: null };
  } catch (error) {
    throw normalizeFailure(error);
  }
}

async function loadCompanionBlock(client, userId, companionId) {
  const result = await client.query(
    `${companionBlockSelect()}
     where b.user_id = $1::uuid
       and b.companion_id = $2::uuid
     limit 1`,
    [userId, companionId],
  );
  return result.rows?.[0] || null;
}

function companionBlockSelect() {
  return `select
            b.id,
            b.companion_id,
            b.created_at,
            to_char(b.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at_cursor,
            c.display_name,
            c.real_photo_url,
            c.base_city
          from user_companion_blocks b
          join companions c on c.id = b.companion_id`;
}

function mapCompanionBlock(row) {
  return {
    companionId: stringValue(row.companion_id),
    displayName: stringValue(row.display_name),
    avatarUrl: optionalString(row.real_photo_url),
    baseCity: stringValue(row.base_city),
    blockedAt: toIso(row.created_at),
  };
}

async function insertAdminActionLog(client, entry) {
  await client.query(
    `insert into admin_action_logs (
       id, admin_id, action, target_type, target_id,
       before_data, after_data, ip, user_agent, created_at
     ) values (
       $1::uuid, $2::uuid, $3, $4, $5::uuid,
       $6::jsonb, $7::jsonb, $8, $9, now()
     )`,
    [
      entry.id,
      entry.adminId,
      entry.action,
      entry.targetType,
      entry.targetId,
      JSON.stringify(entry.beforeData),
      JSON.stringify(entry.afterData),
      entry.ip || null,
      entry.userAgent || null,
    ],
  );
}

function pageResult(rows, limit, actor, resource, filters, mapper) {
  const pageRows = rows.slice(0, limit);
  const hasMore = rows.length > limit;
  const lastRow = hasMore ? pageRows.at(-1) : null;
  return {
    items: pageRows.map(mapper),
    nextCursor: lastRow
      ? encodeCursor(lastRow.created_at_cursor, lastRow.id, { resource, actor, filters })
      : null,
    hasMore,
  };
}

function parseCursor(value, context) {
  if (value === undefined || value === null || value === '') return null;
  const cursor = String(value).trim();
  if (!cursor || cursor.length > 512 || !CURSOR_PATTERN.test(cursor)) {
    throw complianceError(context.code, context.message, 400);
  }
  try {
    const decodedBytes = Buffer.from(cursor, 'base64url');
    if (decodedBytes.toString('base64url') !== cursor) throw new Error('non-canonical base64url');
    const decoded = JSON.parse(decodedBytes.toString('utf8'));
    if (
      decoded?.v !== 1
      || decoded.resource !== context.resource
      || decoded.actorType !== context.actor.type
      || decoded.actorId !== context.actor.id
      || JSON.stringify(decoded.filters ?? {}) !== JSON.stringify(context.filters ?? {})
      || !UUID_PATTERN.test(String(decoded.id || ''))
    ) {
      throw new Error('cursor binding mismatch');
    }
    return {
      createdAt: exactCursorTimestamp(decoded.createdAt, context.code, context.message),
      id: String(decoded.id),
    };
  } catch (error) {
    if (error instanceof StoreLiteComplianceGatewayError) throw error;
    throw complianceError(context.code, context.message, 400);
  }
}

function encodeCursor(createdAt, id, context) {
  const timestamp = String(createdAt || '');
  const cursorId = String(id || '');
  const parsedTimestamp = new Date(timestamp);
  if (
    !CURSOR_TIMESTAMP_PATTERN.test(timestamp)
    || !Number.isFinite(parsedTimestamp.getTime())
    || parsedTimestamp.toISOString() !== `${timestamp.slice(0, 23)}Z`
    || !UUID_PATTERN.test(cursorId)
  ) {
    throw new Error('Compliance list returned an invalid cursor boundary');
  }
  const payload = {
    v: 1,
    resource: context.resource,
    actorType: context.actor.type,
    actorId: context.actor.id,
    filters: context.filters,
    createdAt: timestamp,
    id: cursorId,
  };
  return Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
}

function exactCursorTimestamp(value, code, message) {
  const timestamp = String(value || '');
  if (!CURSOR_TIMESTAMP_PATTERN.test(timestamp)) throw complianceError(code, message, 400);
  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== `${timestamp.slice(0, 23)}Z`) {
    throw complianceError(code, message, 400);
  }
  return timestamp;
}

function parseAdminActor(input, code) {
  return {
    type: 'admin',
    adminId: requireUuid(input.adminId, 'adminId', code),
    ip: optionalText(input.ip, 64, 'ip', code),
    userAgent: optionalText(input.userAgent, 2000, 'userAgent', code),
  };
}

function parseOptionalEnum(value, allowed, code, message) {
  if (value === undefined || value === null || value === '') return null;
  return parseRequiredEnum(value, allowed, code, message);
}

function parseRequiredEnum(value, allowed, code, message) {
  const parsed = String(value || '').trim();
  if (!allowed.has(parsed)) throw complianceError(code, message, 400);
  return parsed;
}

function parseLimit(value, code) {
  if (value === undefined || value === null || value === '') return DEFAULT_LIMIT;
  if (!/^[1-9]\d*$/.test(String(value))) {
    throw complianceError(code, `limit must be an integer between 1 and ${MAX_LIMIT}`, 400);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_LIMIT) {
    throw complianceError(code, `limit must be an integer between 1 and ${MAX_LIMIT}`, 400);
  }
  return parsed;
}

function fingerprintOf(value) {
  return createHash('sha256').update(JSON.stringify(value), 'utf8').digest('hex');
}

function assertFingerprint(row, expected, code, message) {
  if (String(row.request_fingerprint || '') !== expected) {
    throw complianceError(code, message, 409);
  }
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
        // Preserve the original domain or database error.
      }
    }
    throw normalizeFailure(error);
  }
}

function normalizeFailure(error) {
  if (error instanceof StoreLiteComplianceGatewayError) return error;
  const wrapped = complianceError(
    'COMPLIANCE_STORE_UNAVAILABLE',
    'Store Lite compliance data is temporarily unavailable',
    503,
  );
  wrapped.cause = error;
  return wrapped;
}

function complianceError(code, message, status) {
  return new StoreLiteComplianceGatewayError(code, message, status);
}

function requireUuid(value, field, code) {
  const id = String(value || '').trim();
  if (!UUID_PATTERN.test(id)) throw complianceError(code, `${field} must be a UUID`, 400);
  return id;
}

function optionalUuid(value, field, code) {
  if (value === undefined || value === null || value === '') return null;
  return requireUuid(value, field, code);
}

function requireText(value, min, max, field, code) {
  const text = String(value ?? '').trim();
  if (text.length < min || text.length > max) {
    throw complianceError(code, `${field} must contain between ${min} and ${max} characters`, 400);
  }
  return text;
}

function optionalText(value, max, field, code) {
  if (value === undefined || value === null || value === '') return null;
  return requireText(value, 1, max, field, code);
}

function truncate(value, max) {
  if (value === null || value === undefined) return null;
  const text = String(value);
  return text.length > max ? text.slice(0, max) : text;
}

function toIso(value) {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) throw new Error('Compliance timestamp is invalid');
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
