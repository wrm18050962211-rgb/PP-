import { randomUUID } from 'node:crypto';
import { isIP } from 'node:net';

const DEFAULT_MAX_BODY_BYTES = 1024 * 1024;
const DEFAULT_GLOBAL_LIMIT = 600;
const DEFAULT_SENSITIVE_LIMIT = 20;
const DEFAULT_WINDOW_MS = 60 * 1000;
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,128}$/;
const ORDER_CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ORDER_READ_ROLES = ['user', 'companion'];
const ORDER_STATUSES = [
  'pending_payment',
  'paid_pending_confirm',
  'confirmed',
  'in_service',
  'completed',
  'cancelled',
  'refunding',
  'refunded',
  'disputed',
];
const BOOKING_REQUEST_STATUSES = ['submitted', 'confirmed', 'declined', 'cancelled'];
const BOOKING_CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;
const COMPLIANCE_CURSOR_PATTERN = /^[A-Za-z0-9_-]+$/;
const UUID_ROUTE_PART = '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';
const USER_REQUEST_TYPES = ['support', 'data_access', 'data_copy', 'account_deletion'];
const USER_REQUEST_STATUSES = ['submitted', 'processing', 'completed', 'declined', 'cancelled'];
const USER_REQUEST_SUPPORT_CATEGORIES = ['booking', 'safety', 'account', 'privacy', 'other'];
const CONTENT_REPORT_STATUSES = ['pending', 'investigating', 'resolved', 'rejected'];
const CONTENT_REPORT_TARGET_TYPES = ['post', 'companion'];
const CONTENT_REPORT_CATEGORIES = ['content_violation', 'safety', 'fraud', 'privacy_or_rights', 'other'];
const CONTENT_REPORT_RESOLUTION_ACTIONS = ['no_action', 'remove_post', 'suspend_companion'];
const USER_REQUEST_DETAIL_PATH = new RegExp(`^/api/user-requests/${UUID_ROUTE_PART}$`, 'i');
const USER_REQUEST_CANCEL_PATH = new RegExp(`^/api/user-requests/${UUID_ROUTE_PART}/cancel$`, 'i');
const ADMIN_USER_REQUEST_DETAIL_PATH = new RegExp(`^/api/admin/user-requests/${UUID_ROUTE_PART}$`, 'i');
const ADMIN_USER_REQUEST_ACTION_PATH = new RegExp(
  `^/api/admin/user-requests/${UUID_ROUTE_PART}/(start|complete|decline)$`,
  'i',
);
const CONTENT_REPORT_DETAIL_PATH = new RegExp(`^/api/me/content-reports/${UUID_ROUTE_PART}$`, 'i');
const ADMIN_CONTENT_REPORT_DETAIL_PATH = new RegExp(`^/api/admin/content-reports/${UUID_ROUTE_PART}$`, 'i');
const ADMIN_CONTENT_REPORT_ACTION_PATH = new RegExp(
  `^/api/admin/content-reports/${UUID_ROUTE_PART}/(investigate|resolve|reject)$`,
  'i',
);
const BLOCKED_COMPANION_DETAIL_PATH = new RegExp(`^/api/me/blocked-companions/${UUID_ROUTE_PART}$`, 'i');
const SENSITIVE_KEY_PATTERN =
  /^(authorization|cookie|set-cookie|password|passcode|otp|verificationcode|token|accesstoken|refreshtoken|secret|secretid|secretkey|apikey|privatekey|pepper|signature)$/i;
const FORBIDDEN_OBJECT_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

export class RequestSecurityError extends Error {
  constructor(status, code, message, headers = {}) {
    super(message);
    this.name = 'RequestSecurityError';
    this.status = status;
    this.code = code;
    this.headers = headers;
  }
}

export function createRequestSecurity(options = {}) {
  const env = options.env || process.env;
  const clock = options.clock || (() => Date.now());
  const logger = options.logger || console;
  const buckets = new Map();
  const config = {
    trustProxy: envFlag(env.TRUST_PROXY, false),
    maxBodyBytes: positiveInteger(env.REQUEST_BODY_MAX_BYTES, DEFAULT_MAX_BODY_BYTES),
    globalLimit: positiveInteger(env.RATE_LIMIT_GLOBAL_MAX, DEFAULT_GLOBAL_LIMIT),
    globalWindowMs: positiveInteger(env.RATE_LIMIT_GLOBAL_WINDOW_MS, DEFAULT_WINDOW_MS),
    sensitiveLimit: positiveInteger(env.RATE_LIMIT_SENSITIVE_MAX, DEFAULT_SENSITIVE_LIMIT),
    sensitiveWindowMs: positiveInteger(env.RATE_LIMIT_SENSITIVE_WINDOW_MS, DEFAULT_WINDOW_MS),
  };

  function begin(req) {
    const requestId = readRequestId(req) || randomUUID();
    const context = {
      requestId,
      clientIp: resolveClientIp(req, config.trustProxy),
      startedAt: clock(),
    };
    req.securityContext = context;
    return context;
  }

  function enforceRateLimit(req, context = req.securityContext || begin(req)) {
    const method = String(req.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') return;

    const identity = context.clientIp || 'unknown';
    consumeBucket(
      buckets,
      `global:${identity}`,
      config.globalLimit,
      config.globalWindowMs,
      clock(),
      'RATE_LIMITED',
    );

    const group = sensitiveRouteGroup(method, requestPath(req));
    if (group) {
      consumeBucket(
        buckets,
        `sensitive:${group}:${identity}`,
        config.sensitiveLimit,
        config.sensitiveWindowMs,
        clock(),
        'SENSITIVE_RATE_LIMITED',
      );
    }

    if (buckets.size > 10_000) pruneBuckets(buckets, clock());
  }

  function log(level, event, details = {}) {
    const writer = level === 'error' ? logger.error : level === 'warn' ? logger.warn : logger.log;
    writer.call(
      logger,
      JSON.stringify({
        timestamp: new Date(clock()).toISOString(),
        level,
        event,
        ...redactSensitive(details),
      }),
    );
  }

  function complete(req, status) {
    const context = req.securityContext;
    if (!context) return;
    log('info', 'request_completed', {
      requestId: context.requestId,
      method: String(req.method || 'GET').toUpperCase(),
      path: requestPath(req),
      status,
      durationMs: Math.max(0, clock() - context.startedAt),
    });
  }

  return {
    config,
    begin,
    complete,
    enforceRateLimit,
    getClientIp(req) {
      return req?.securityContext?.clientIp || resolveClientIp(req, config.trustProxy);
    },
    log,
  };
}

export async function readJsonRequest(req, options = {}) {
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(String(req.method || '').toUpperCase())) return {};

  const maxBodyBytes = positiveInteger(options.maxBodyBytes, DEFAULT_MAX_BODY_BYTES);
  const declaredLength = Number(req.headers?.['content-length']);
  if (Number.isFinite(declaredLength) && declaredLength > maxBodyBytes) {
    throw new RequestSecurityError(413, 'REQUEST_BODY_TOO_LARGE', 'Request body exceeds the configured size limit');
  }

  const chunks = [];
  let receivedBytes = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    receivedBytes += buffer.length;
    if (receivedBytes > maxBodyBytes) {
      throw new RequestSecurityError(413, 'REQUEST_BODY_TOO_LARGE', 'Request body exceeds the configured size limit');
    }
    chunks.push(buffer);
  }

  if (receivedBytes === 0) return {};
  const contentType = String(req.headers?.['content-type'] || '')
    .split(';', 1)[0]
    .trim()
    .toLowerCase();
  if (contentType !== 'application/json') {
    throw new RequestSecurityError(415, 'CONTENT_TYPE_UNSUPPORTED', 'Request body must use application/json');
  }

  const raw = Buffer.concat(chunks).toString('utf8');
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new RequestSecurityError(400, 'INVALID_JSON', 'Request body must contain valid JSON');
  }
  assertNoDuplicateJsonObjectKeys(raw);
  if (!isPlainObject(parsed)) {
    throw new RequestSecurityError(400, 'REQUEST_BODY_INVALID', 'Request body must be a JSON object');
  }

  validateObjectSafety(parsed);
  Object.defineProperty(parsed, '__rawBody', { value: raw, enumerable: false });
  return parsed;
}

export function validateRouteInput(method, path, body) {
  const complianceRoute = resolveComplianceRoute(method, path);
  if (complianceRoute) {
    validateComplianceInput(complianceRoute, body);
    return;
  }
  const route = `${String(method || 'GET').toUpperCase()} ${path}`;
  if (route === 'POST /api/auth/phone/request-code') {
    requireString(body.phone, 'phone', 6, 32);
  } else if (route === 'POST /api/auth/phone/verify') {
    requireString(body.phone, 'phone', 6, 32);
    if (!/^\d{4,8}$/.test(String(body.code || ''))) {
      throw new RequestSecurityError(400, 'PHONE_CODE_INVALID', 'Verification code must contain 4 to 8 digits');
    }
    optionalEnum(body.role, 'role', ['consumer', 'companion']);
    optionalEnum(body.intent, 'intent', ['login', 'register']);
  } else if (route === 'POST /api/admin/auth/login') {
    requireAllowedFields(body, ['username', 'password', 'passcode']);
    const hasUsername = body.username !== undefined;
    const hasPassword = body.password !== undefined;
    if (hasUsername !== hasPassword) {
      throw new RequestSecurityError(400, 'ADMIN_LOGIN_INVALID', 'Provide username and password');
    }
    const hasPasswordLogin = hasUsername && hasPassword;
    const hasLocalPasscode = body.passcode !== undefined;
    if (hasPasswordLogin === hasLocalPasscode) {
      throw new RequestSecurityError(400, 'ADMIN_LOGIN_INVALID', 'Provide username and password');
    }
    if (hasPasswordLogin) {
      requireString(body.username, 'username', 3, 120);
      requireString(body.password, 'password', 10, 256);
    } else {
      requireString(body.passcode, 'passcode', 1, 128);
    }
  } else if (route === 'POST /api/orders') {
    optionalString(body.idempotencyKey || body.clientRequestId, 'idempotencyKey', 1, 120);
    optionalCoordinatePair(body, 'placeLat', 'placeLng');
  } else if (route === 'POST /api/booking-requests') {
    requireAllowedFields(body, [
      'companionId',
      'requestedStartAt',
      'requestedEndAt',
      'timezone',
      'city',
      'addressText',
      'requirements',
      'clientRequestId',
    ]);
    requireUuid(body.companionId, 'companionId');
    requireIsoDateTime(body.requestedStartAt, 'requestedStartAt');
    requireIsoDateTime(body.requestedEndAt, 'requestedEndAt');
    if (new Date(body.requestedEndAt).getTime() <= new Date(body.requestedStartAt).getTime()) {
      throw new RequestSecurityError(400, 'BOOKING_REQUEST_INVALID', 'requestedEndAt must be after requestedStartAt');
    }
    optionalString(body.timezone, 'timezone', 1, 80);
    requireString(body.city, 'city', 1, 80);
    requireString(body.addressText, 'addressText', 1, 500);
    requireString(body.requirements, 'requirements', 1, 2000);
    requireString(body.clientRequestId, 'clientRequestId', 8, 120);
  } else if (/^POST \/api\/booking-requests\/[^/]+\/cancel$/.test(route)) {
    requireAllowedFields(body, ['reasonCode', 'reason']);
    optionalString(body.reasonCode, 'reasonCode', 1, 80);
    optionalString(body.reason, 'reason', 1, 1000);
  } else if (/^POST \/api\/admin\/booking-requests\/[^/]+\/confirm$/.test(route)) {
    requireAllowedFields(body, [
      'confirmedStartAt',
      'confirmedEndAt',
      'confirmedCity',
      'confirmedAddressText',
      'arrivalInstructions',
      'supportChannelKey',
      'publicMessage',
      'internalNote',
    ]);
    requireIsoDateTime(body.confirmedStartAt, 'confirmedStartAt');
    requireIsoDateTime(body.confirmedEndAt, 'confirmedEndAt');
    if (new Date(body.confirmedEndAt).getTime() <= new Date(body.confirmedStartAt).getTime()) {
      throw new RequestSecurityError(400, 'BOOKING_REQUEST_INVALID', 'confirmedEndAt must be after confirmedStartAt');
    }
    requireString(body.confirmedCity, 'confirmedCity', 1, 80);
    requireString(body.confirmedAddressText, 'confirmedAddressText', 1, 500);
    requireString(body.arrivalInstructions, 'arrivalInstructions', 1, 1000);
    requireString(body.supportChannelKey, 'supportChannelKey', 1, 80);
    optionalString(body.publicMessage, 'publicMessage', 1, 1000);
    optionalString(body.internalNote, 'internalNote', 1, 1000);
  } else if (/^POST \/api\/admin\/booking-requests\/[^/]+\/(decline|cancel)$/.test(route)) {
    requireAllowedFields(body, ['reasonCode', 'publicMessage', 'internalNote']);
    requireString(body.reasonCode, 'reasonCode', 1, 80);
    requireString(body.publicMessage, 'publicMessage', 1, 1000);
    optionalString(body.internalNote, 'internalNote', 1, 1000);
  }
}

export function validateRouteQuery(method, path, searchParams) {
  const params = searchParams instanceof URLSearchParams ? searchParams : new URLSearchParams(searchParams || '');
  const complianceRoute = resolveComplianceRoute(method, path);
  if (complianceRoute) {
    validateComplianceQuery(params, complianceRoute);
    return;
  }
  if (String(method || 'GET').toUpperCase() !== 'GET') return;
  const isBookingList = path === '/api/booking-requests' || path === '/api/admin/booking-requests';
  const isBookingDetail = /^\/api\/(?:admin\/)?booking-requests\/[^/]+$/.test(path);
  if (isBookingList || isBookingDetail) {
    validateBookingQuery(params, { list: isBookingList });
    return;
  }
  const isOrderList = path === '/api/orders';
  const isOrderDetail = /^\/api\/orders\/[^/]+$/.test(path);
  if (!isOrderList && !isOrderDetail) return;

  const allowed = new Set(isOrderList ? ['role', 'status', 'limit', 'cursor'] : []);
  for (const key of params.keys()) {
    if (!allowed.has(key)) {
      throw new RequestSecurityError(400, 'ORDER_QUERY_INVALID', `Unsupported order query parameter: ${key}`);
    }
    if (params.getAll(key).length !== 1) {
      throw new RequestSecurityError(400, 'ORDER_QUERY_INVALID', `Order query parameter must not be repeated: ${key}`);
    }
  }

  const role = params.get('role');
  if (params.has('role') && !ORDER_READ_ROLES.includes(role)) {
    throw new RequestSecurityError(400, 'ORDER_QUERY_INVALID', `role must be one of: ${ORDER_READ_ROLES.join(', ')}`);
  }
  if (!isOrderList) return;

  const status = params.get('status');
  if (params.has('status') && !ORDER_STATUSES.includes(status)) {
    throw new RequestSecurityError(400, 'ORDER_QUERY_INVALID', `status must be one of: ${ORDER_STATUSES.join(', ')}`);
  }
  const limit = params.get('limit');
  if (params.has('limit') && (!/^[1-9]\d*$/.test(limit) || Number(limit) > 50)) {
    throw new RequestSecurityError(400, 'ORDER_QUERY_INVALID', 'limit must be an integer between 1 and 50');
  }
  const cursor = params.get('cursor');
  if (params.has('cursor') && (!cursor || cursor.length > 512 || !ORDER_CURSOR_PATTERN.test(cursor))) {
    throw new RequestSecurityError(400, 'ORDER_CURSOR_INVALID', 'cursor must be an opaque base64url token');
  }
}

function resolveComplianceRoute(method, path) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  const normalizedPath = String(path || '');
  const domain = complianceDomainForPath(normalizedPath);
  if (!domain) return null;

  if (normalizedPath === '/api/user-requests') {
    if (normalizedMethod === 'GET') return { name: 'user-request-list', domain };
    if (normalizedMethod === 'POST') return { name: 'user-request-create', domain };
  }
  if (USER_REQUEST_DETAIL_PATH.test(normalizedPath) && normalizedMethod === 'GET') {
    return { name: 'user-request-detail', domain };
  }
  if (USER_REQUEST_CANCEL_PATH.test(normalizedPath) && normalizedMethod === 'POST') {
    return { name: 'user-request-cancel', domain };
  }
  if (normalizedPath === '/api/admin/user-requests' && normalizedMethod === 'GET') {
    return { name: 'admin-user-request-list', domain };
  }
  if (ADMIN_USER_REQUEST_DETAIL_PATH.test(normalizedPath) && normalizedMethod === 'GET') {
    return { name: 'admin-user-request-detail', domain };
  }
  const userRequestAction = normalizedPath.match(ADMIN_USER_REQUEST_ACTION_PATH)?.[1]?.toLowerCase();
  if (userRequestAction && normalizedMethod === 'POST') {
    return { name: `admin-user-request-${userRequestAction}`, domain };
  }

  if (normalizedPath === '/api/content-reports' && normalizedMethod === 'POST') {
    return { name: 'content-report-create', domain };
  }
  if (normalizedPath === '/api/me/content-reports' && normalizedMethod === 'GET') {
    return { name: 'content-report-list', domain };
  }
  if (CONTENT_REPORT_DETAIL_PATH.test(normalizedPath) && normalizedMethod === 'GET') {
    return { name: 'content-report-detail', domain };
  }
  if (normalizedPath === '/api/admin/content-reports' && normalizedMethod === 'GET') {
    return { name: 'admin-content-report-list', domain };
  }
  if (ADMIN_CONTENT_REPORT_DETAIL_PATH.test(normalizedPath) && normalizedMethod === 'GET') {
    return { name: 'admin-content-report-detail', domain };
  }
  const contentReportAction = normalizedPath.match(ADMIN_CONTENT_REPORT_ACTION_PATH)?.[1]?.toLowerCase();
  if (contentReportAction && normalizedMethod === 'POST') {
    return { name: `admin-content-report-${contentReportAction}`, domain };
  }

  if (normalizedPath === '/api/me/blocked-companions' && normalizedMethod === 'GET') {
    return { name: 'blocked-companion-list', domain };
  }
  if (BLOCKED_COMPANION_DETAIL_PATH.test(normalizedPath) && ['PUT', 'DELETE'].includes(normalizedMethod)) {
    return { name: normalizedMethod === 'PUT' ? 'blocked-companion-put' : 'blocked-companion-delete', domain };
  }

  throw new RequestSecurityError(404, 'NOT_FOUND', 'Route not found');
}

function complianceDomainForPath(path) {
  if (isExactOrNestedPath(path, '/api/admin/user-requests') || isExactOrNestedPath(path, '/api/user-requests')) {
    return 'user_request';
  }
  if (
    isExactOrNestedPath(path, '/api/admin/content-reports')
    || isExactOrNestedPath(path, '/api/me/content-reports')
    || isExactOrNestedPath(path, '/api/content-reports')
  ) {
    return 'content_report';
  }
  if (isExactOrNestedPath(path, '/api/me/blocked-companions')) return 'companion_block';
  return null;
}

function validateComplianceInput(route, body = {}) {
  const inputCode = route.domain === 'user_request'
    ? 'USER_REQUEST_INVALID'
    : route.domain === 'content_report'
      ? 'CONTENT_REPORT_INVALID'
      : 'REQUEST_BODY_INVALID';

  if (route.name === 'user-request-create') {
    requireAllowedFields(
      body,
      ['requestType', 'supportCategory', 'bookingRequestId', 'description', 'clientRequestId'],
      inputCode,
    );
    const requestType = requireDomainEnum(body.requestType, 'requestType', USER_REQUEST_TYPES, inputCode);
    optionalDomainEnum(
      body.supportCategory,
      'supportCategory',
      USER_REQUEST_SUPPORT_CATEGORIES,
      inputCode,
    );
    optionalDomainUuid(body.bookingRequestId, 'bookingRequestId', inputCode);
    const hasSupportOnlyField = Object.prototype.hasOwnProperty.call(body, 'supportCategory')
      || Object.prototype.hasOwnProperty.call(body, 'bookingRequestId');
    if (requestType !== 'support' && hasSupportOnlyField) {
      throw new RequestSecurityError(
        400,
        inputCode,
        'Only support requests may include supportCategory or bookingRequestId',
      );
    }
    optionalDomainString(body.description, 'description', 1, 2000, inputCode);
    requireDomainString(body.clientRequestId, 'clientRequestId', 8, 160, inputCode);
    return;
  }
  if (route.name === 'user-request-cancel') {
    requireAllowedFields(body, ['reasonCode', 'reason'], inputCode);
    optionalDomainString(body.reasonCode, 'reasonCode', 1, 80, inputCode);
    optionalDomainString(body.reason, 'reason', 1, 1000, inputCode);
    return;
  }
  if (route.name === 'admin-user-request-start') {
    requireAllowedFields(body, ['publicMessage', 'internalNote'], inputCode);
    optionalDomainString(body.publicMessage, 'publicMessage', 1, 1000, inputCode);
    optionalDomainString(body.internalNote, 'internalNote', 1, 1000, inputCode);
    return;
  }
  if (route.name === 'admin-user-request-complete') {
    requireAllowedFields(body, ['publicMessage', 'internalNote'], inputCode);
    requireDomainString(body.publicMessage, 'publicMessage', 1, 1000, inputCode);
    optionalDomainString(body.internalNote, 'internalNote', 1, 1000, inputCode);
    return;
  }
  if (route.name === 'admin-user-request-decline') {
    requireAllowedFields(body, ['reasonCode', 'publicMessage', 'internalNote'], inputCode);
    requireDomainString(body.reasonCode, 'reasonCode', 1, 80, inputCode);
    requireDomainString(body.publicMessage, 'publicMessage', 1, 1000, inputCode);
    optionalDomainString(body.internalNote, 'internalNote', 1, 1000, inputCode);
    return;
  }
  if (route.name === 'content-report-create') {
    requireAllowedFields(body, ['targetType', 'targetId', 'category', 'description', 'clientRequestId'], inputCode);
    requireDomainEnum(body.targetType, 'targetType', CONTENT_REPORT_TARGET_TYPES, inputCode);
    requireDomainUuid(body.targetId, 'targetId', inputCode);
    requireDomainEnum(body.category, 'category', CONTENT_REPORT_CATEGORIES, inputCode);
    optionalDomainString(body.description, 'description', 1, 2000, inputCode);
    requireDomainString(body.clientRequestId, 'clientRequestId', 8, 160, inputCode);
    return;
  }
  if (route.name === 'admin-content-report-investigate') {
    requireAllowedFields(body, ['internalNote'], inputCode);
    optionalDomainString(body.internalNote, 'internalNote', 1, 1000, inputCode);
    return;
  }
  if (route.name === 'admin-content-report-resolve') {
    requireAllowedFields(body, ['resolutionAction', 'publicMessage', 'internalNote'], inputCode);
    requireDomainEnum(body.resolutionAction, 'resolutionAction', CONTENT_REPORT_RESOLUTION_ACTIONS, inputCode);
    requireDomainString(body.publicMessage, 'publicMessage', 1, 1000, inputCode);
    optionalDomainString(body.internalNote, 'internalNote', 1, 1000, inputCode);
    return;
  }
  if (route.name === 'admin-content-report-reject') {
    requireAllowedFields(body, ['publicMessage', 'internalNote'], inputCode);
    requireDomainString(body.publicMessage, 'publicMessage', 1, 1000, inputCode);
    optionalDomainString(body.internalNote, 'internalNote', 1, 1000, inputCode);
    return;
  }

  requireAllowedFields(body, [], inputCode);
}

function validateComplianceQuery(params, route) {
  const queryCode = route.domain === 'user_request'
    ? 'USER_REQUEST_QUERY_INVALID'
    : route.domain === 'content_report'
      ? 'CONTENT_REPORT_QUERY_INVALID'
      : 'COMPANION_BLOCK_QUERY_INVALID';
  const cursorCode = route.domain === 'user_request'
    ? 'USER_REQUEST_CURSOR_INVALID'
    : route.domain === 'content_report'
      ? 'CONTENT_REPORT_CURSOR_INVALID'
      : 'COMPANION_BLOCK_CURSOR_INVALID';
  let allowed = [];
  const enums = {};

  if (['user-request-list', 'admin-user-request-list'].includes(route.name)) {
    allowed = ['requestType', 'status', 'limit', 'cursor'];
    enums.requestType = USER_REQUEST_TYPES;
    enums.status = USER_REQUEST_STATUSES;
  } else if (route.name === 'content-report-list') {
    allowed = ['status', 'targetType', 'limit', 'cursor'];
    enums.status = CONTENT_REPORT_STATUSES;
    enums.targetType = CONTENT_REPORT_TARGET_TYPES;
  } else if (route.name === 'admin-content-report-list') {
    allowed = ['status', 'targetType', 'category', 'limit', 'cursor'];
    enums.status = CONTENT_REPORT_STATUSES;
    enums.targetType = CONTENT_REPORT_TARGET_TYPES;
    enums.category = CONTENT_REPORT_CATEGORIES;
  } else if (route.name === 'blocked-companion-list') {
    allowed = ['limit', 'cursor'];
  }

  validateComplianceQueryFields(params, { allowed, enums, queryCode, cursorCode });
}

function validateComplianceQueryFields(params, options) {
  const allowed = new Set(options.allowed);
  for (const key of params.keys()) {
    if (!allowed.has(key)) {
      throw new RequestSecurityError(400, options.queryCode, `Unsupported compliance query parameter: ${key}`);
    }
    if (params.getAll(key).length !== 1) {
      throw new RequestSecurityError(400, options.queryCode, `Compliance query parameter must not be repeated: ${key}`);
    }
  }

  for (const [key, values] of Object.entries(options.enums)) {
    if (params.has(key) && !values.includes(params.get(key))) {
      throw new RequestSecurityError(400, options.queryCode, `${key} must be one of: ${values.join(', ')}`);
    }
  }
  const limit = params.get('limit');
  if (params.has('limit') && (!/^[1-9]\d*$/.test(limit) || Number(limit) > 50)) {
    throw new RequestSecurityError(400, options.queryCode, 'limit must be an integer between 1 and 50');
  }
  const cursor = params.get('cursor');
  if (params.has('cursor') && (!cursor || cursor.length > 512 || !COMPLIANCE_CURSOR_PATTERN.test(cursor))) {
    throw new RequestSecurityError(400, options.cursorCode, 'cursor must be an opaque base64url token');
  }
}

export function resolveAccessPolicy(method, path) {
  const normalizedMethod = String(method || 'GET').toUpperCase();
  if (normalizedMethod === 'POST' && path === '/api/admin/auth/login') return policy('anonymous', 'admin_auth');
  if (isExactOrNestedPath(path, '/api/admin/user-requests') || isExactOrNestedPath(path, '/api/admin/content-reports')) {
    return policy('admin', 'store_lite_compliance_admin');
  }
  if (path.startsWith('/api/admin/')) return policy('admin', 'admin_api');

  if (path.startsWith('/api/companion/')) return policy('companion', 'companion_api');
  if (normalizedMethod === 'POST' && path === '/api/auth/logout') return policy('member', 'auth_session');
  if (path === '/api/media/upload-policy') return policy('member', 'media_upload');
  if (isExactOrNestedPath(path, '/api/user-requests')) return policy('member', 'user_request');
  if (isExactOrNestedPath(path, '/api/content-reports') || isExactOrNestedPath(path, '/api/me/content-reports')) {
    return policy('member', 'content_report');
  }
  if (isExactOrNestedPath(path, '/api/me/blocked-companions')) return policy('member', 'companion_block');
  if (path.startsWith('/api/me/')) return policy('member', 'user_data');
  if (path === '/api/booking-requests' || path.startsWith('/api/booking-requests/')) {
    return policy('member', 'booking_request');
  }

  if (normalizedMethod === 'POST' && /^\/api\/orders\/[^/]+\/status$/.test(path)) {
    return policy('admin', 'order_status');
  }
  if (path === '/api/orders/quote') return policy('anonymous', 'order_quote');
  if (normalizedMethod === 'GET' && path === '/api/orders') return policy('member', 'orders_api');
  if (/^\/api\/orders\/[^/]+\/conversation$/.test(path)) return policy('member', 'conversation');
  if (/^\/api\/orders\/[^/]+\/report$/.test(path)) return policy('member', 'report');
  if (path === '/api/orders' || path.startsWith('/api/orders/')) return policy('member', 'order');
  if (path === '/api/conversations' || path.startsWith('/api/conversations/')) return policy('member', 'conversation');
  if (path === '/api/reports') return policy('member', 'report');

  if (path === '/api/payments/wechat/notify' || path === '/api/payments/wechat/refund-notify') {
    return policy('anonymous', 'payment_callback');
  }
  if (path.startsWith('/api/payments/')) return policy('member', 'payment');
  return policy('anonymous', 'public_api');
}

export function rotatingSecretValues(env, currentName, previousName) {
  const values = [env?.[currentName], env?.[previousName]].map((value) => String(value || '').trim()).filter(Boolean);
  return Array.from(new Set(values));
}

export function redactSensitive(value, key = '') {
  if (SENSITIVE_KEY_PATTERN.test(normalizeKey(key))) return '[REDACTED]';
  if (typeof value === 'string') return redactSensitiveText(value);
  if (Array.isArray(value)) return value.map((item) => redactSensitive(item));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([entryKey, entryValue]) => [entryKey, redactSensitive(entryValue, entryKey)]));
  }
  return value;
}

export function redactSensitiveText(value) {
  return String(value || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [REDACTED]')
    .replace(/((?:token|secret|password|passcode|pepper|api[_-]?key)\s*[=:]\s*)[^\s,;]+/gi, '$1[REDACTED]')
    .replace(/(?<!\d)(1[3-9])\d{8}(\d)(?!\d)/g, '$1********$2');
}

export function safeErrorMessage(error) {
  const message = error instanceof Error ? error.message : String(error || 'Unknown error');
  return redactSensitiveText(message).slice(0, 500);
}

function consumeBucket(buckets, key, max, windowMs, timestamp, code) {
  if (max <= 0) return;
  let bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= timestamp) {
    bucket = { count: 0, resetAt: timestamp + windowMs };
    buckets.set(key, bucket);
  }
  bucket.count += 1;
  if (bucket.count <= max) return;

  const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - timestamp) / 1000));
  throw new RequestSecurityError(429, code, 'Too many requests. Retry after the indicated delay', {
    'Retry-After': String(retryAfterSeconds),
  });
}

function pruneBuckets(buckets, timestamp) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= timestamp) buckets.delete(key);
  }
}

function sensitiveRouteGroup(method, path) {
  if (method === 'POST') {
    if (path === '/api/auth/phone/request-code') return 'phone_request';
    if (path === '/api/auth/phone/verify') return 'phone_verify';
    if (path === '/api/auth/wechat/login') return 'wechat_login';
    if (path === '/api/auth/wechat/mock-login') return 'mock_login';
    if (path === '/api/admin/auth/login') return 'admin_login';
    if (path === '/api/booking-requests' || /\/api\/(?:admin\/)?booking-requests\/[^/]+\/(?:confirm|decline|cancel)$/.test(path)) {
      return 'booking_mutation';
    }
    if (isExactOrNestedPath(path, '/api/user-requests') || isExactOrNestedPath(path, '/api/admin/user-requests')) {
      return 'user_request_mutation';
    }
    if (isExactOrNestedPath(path, '/api/content-reports') || isExactOrNestedPath(path, '/api/admin/content-reports')) {
      return 'content_report_mutation';
    }
    if (path === '/api/media/upload-policy') return 'media_policy';
  }
  if (['PUT', 'DELETE'].includes(method) && isExactOrNestedPath(path, '/api/me/blocked-companions')) {
    return 'companion_block_mutation';
  }
  return '';
}

function readRequestId(req) {
  const value = req?.headers?.['x-request-id'];
  const candidate = Array.isArray(value) ? value[0] : String(value || '').trim();
  return REQUEST_ID_PATTERN.test(candidate) ? candidate : '';
}

function resolveClientIp(req, trustProxy) {
  const forwarded = trustProxy
    ? String(req?.headers?.['x-forwarded-for'] || '')
        .split(',', 1)[0]
        .trim()
    : '';
  const candidate = forwarded || String(req?.socket?.remoteAddress || '').trim();
  const normalized = candidate.startsWith('::ffff:') ? candidate.slice(7) : candidate;
  return isIP(normalized) ? normalized : null;
}

function requestPath(req) {
  try {
    return new URL(req?.url || '/', 'http://local').pathname;
  } catch {
    return '/';
  }
}

function isExactOrNestedPath(path, root) {
  const normalizedPath = String(path || '');
  return normalizedPath === root || normalizedPath.startsWith(`${root}/`);
}

function assertNoDuplicateJsonObjectKeys(raw) {
  let index = 0;

  function skipWhitespace() {
    while (/\s/.test(raw[index] || '')) index += 1;
  }

  function parseStringToken() {
    const start = index;
    index += 1;
    while (index < raw.length) {
      if (raw[index] === '\\') {
        index += 2;
        continue;
      }
      if (raw[index] === '"') {
        index += 1;
        return JSON.parse(raw.slice(start, index));
      }
      index += 1;
    }
    return '';
  }

  function parseArray() {
    index += 1;
    skipWhitespace();
    if (raw[index] === ']') {
      index += 1;
      return;
    }
    while (index < raw.length) {
      parseValue();
      skipWhitespace();
      if (raw[index] === ']') {
        index += 1;
        return;
      }
      index += 1;
      skipWhitespace();
    }
  }

  function parseObject() {
    index += 1;
    const keys = new Set();
    skipWhitespace();
    if (raw[index] === '}') {
      index += 1;
      return;
    }
    while (index < raw.length) {
      const key = parseStringToken();
      if (keys.has(key)) {
        throw new RequestSecurityError(400, 'REQUEST_BODY_INVALID', `Request body repeats field: ${key}`);
      }
      keys.add(key);
      skipWhitespace();
      index += 1;
      skipWhitespace();
      parseValue();
      skipWhitespace();
      if (raw[index] === '}') {
        index += 1;
        return;
      }
      index += 1;
      skipWhitespace();
    }
  }

  function parseValue() {
    skipWhitespace();
    if (raw[index] === '{') return parseObject();
    if (raw[index] === '[') return parseArray();
    if (raw[index] === '"') {
      parseStringToken();
      return;
    }
    while (index < raw.length && !/[\s,\]}]/.test(raw[index])) index += 1;
  }

  skipWhitespace();
  parseValue();
}

function validateObjectSafety(value, depth = 0) {
  if (depth > 12) {
    throw new RequestSecurityError(400, 'REQUEST_BODY_INVALID', 'Request body nesting is too deep');
  }
  if (Array.isArray(value)) {
    for (const item of value) validateObjectSafety(item, depth + 1);
    return;
  }
  if (!value || typeof value !== 'object') return;

  const entries = Object.entries(value);
  if (entries.length > 500) {
    throw new RequestSecurityError(400, 'REQUEST_BODY_INVALID', 'Request body contains too many fields');
  }
  for (const [entryKey, entryValue] of entries) {
    if (FORBIDDEN_OBJECT_KEYS.has(entryKey)) {
      throw new RequestSecurityError(400, 'REQUEST_BODY_INVALID', 'Request body contains a forbidden field');
    }
    validateObjectSafety(entryValue, depth + 1);
  }
}

function requireString(value, field, min, max) {
  const normalized = String(value ?? '').trim();
  if (normalized.length < min || normalized.length > max) {
    throw new RequestSecurityError(400, 'VALIDATION_ERROR', `${field} must contain between ${min} and ${max} characters`);
  }
}

function requireAllowedFields(body, allowedFields, errorCode = 'REQUEST_BODY_INVALID') {
  const allowed = new Set(allowedFields);
  for (const key of Object.keys(body || {})) {
    if (!allowed.has(key)) {
      throw new RequestSecurityError(400, errorCode, `Unsupported request field: ${key}`);
    }
  }
}

function requireUuid(value, field) {
  if (!UUID_PATTERN.test(String(value || '').trim())) {
    throw new RequestSecurityError(400, 'BOOKING_REQUEST_INVALID', `${field} must be a UUID`);
  }
}

function requireDomainUuid(value, field, code) {
  const normalized = String(value || '').trim();
  if (!UUID_PATTERN.test(normalized)) {
    throw new RequestSecurityError(400, code, `${field} must be a UUID`);
  }
  return normalized;
}

function optionalDomainUuid(value, field, code) {
  if (value === undefined || value === null || value === '') return null;
  return requireDomainUuid(value, field, code);
}

function requireDomainString(value, field, min, max, code) {
  if (typeof value !== 'string') {
    throw new RequestSecurityError(400, code, `${field} must be a string`);
  }
  const normalized = value.trim();
  if (normalized.length < min || normalized.length > max) {
    throw new RequestSecurityError(400, code, `${field} must contain between ${min} and ${max} characters`);
  }
  return normalized;
}

function optionalDomainString(value, field, min, max, code) {
  if (value === undefined || value === null || value === '') return null;
  return requireDomainString(value, field, min, max, code);
}

function requireDomainEnum(value, field, allowed, code) {
  if (typeof value !== 'string' || !allowed.includes(value)) {
    throw new RequestSecurityError(400, code, `${field} must be one of: ${allowed.join(', ')}`);
  }
  return value;
}

function optionalDomainEnum(value, field, allowed, code) {
  if (value === undefined || value === null || value === '') return null;
  return requireDomainEnum(value, field, allowed, code);
}

function requireIsoDateTime(value, field) {
  const normalized = String(value || '').trim();
  const timestamp = Date.parse(normalized);
  if (!normalized || !Number.isFinite(timestamp) || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(normalized)) {
    throw new RequestSecurityError(400, 'BOOKING_REQUEST_INVALID', `${field} must be an ISO 8601 timestamp with timezone`);
  }
}

function validateBookingQuery(params, { list }) {
  const allowed = new Set(list ? ['status', 'limit', 'cursor'] : []);
  for (const key of params.keys()) {
    if (!allowed.has(key)) {
      throw new RequestSecurityError(400, 'BOOKING_QUERY_INVALID', `Unsupported booking query parameter: ${key}`);
    }
    if (params.getAll(key).length !== 1) {
      throw new RequestSecurityError(400, 'BOOKING_QUERY_INVALID', `Booking query parameter must not be repeated: ${key}`);
    }
  }
  if (!list) return;

  const status = params.get('status');
  if (params.has('status') && !BOOKING_REQUEST_STATUSES.includes(status)) {
    throw new RequestSecurityError(400, 'BOOKING_QUERY_INVALID', `status must be one of: ${BOOKING_REQUEST_STATUSES.join(', ')}`);
  }
  const limit = params.get('limit');
  if (params.has('limit') && (!/^[1-9]\d*$/.test(limit) || Number(limit) > 50)) {
    throw new RequestSecurityError(400, 'BOOKING_QUERY_INVALID', 'limit must be an integer between 1 and 50');
  }
  const cursor = params.get('cursor');
  if (params.has('cursor') && (!cursor || cursor.length > 512 || !BOOKING_CURSOR_PATTERN.test(cursor))) {
    throw new RequestSecurityError(400, 'BOOKING_CURSOR_INVALID', 'cursor must be an opaque base64url token');
  }
}

function optionalString(value, field, min, max) {
  if (value === undefined || value === null || value === '') return;
  requireString(value, field, min, max);
}

function optionalEnum(value, field, allowed) {
  if (value === undefined || value === null || value === '') return;
  if (!allowed.includes(value)) {
    throw new RequestSecurityError(400, 'VALIDATION_ERROR', `${field} must be one of: ${allowed.join(', ')}`);
  }
}

function optionalCoordinatePair(body, latKey, lngKey) {
  const hasLat = Object.prototype.hasOwnProperty.call(body, latKey);
  const hasLng = Object.prototype.hasOwnProperty.call(body, lngKey);
  if (!hasLat && !hasLng) return;
  if (hasLat !== hasLng) {
    throw new RequestSecurityError(400, 'VALIDATION_ERROR', 'placeLat and placeLng must be provided together');
  }
  const lat = body[latKey];
  const lng = body[lngKey];
  if (typeof lat !== 'number' || !Number.isFinite(lat) || lat < -90 || lat > 90) {
    throw new RequestSecurityError(400, 'VALIDATION_ERROR', 'placeLat must be a number between -90 and 90');
  }
  if (typeof lng !== 'number' || !Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new RequestSecurityError(400, 'VALIDATION_ERROR', 'placeLng must be a number between -180 and 180');
  }
}

function policy(access, targetType) {
  return { access, targetType };
}

function normalizeKey(value) {
  return String(value || '').replace(/[^a-z0-9]/gi, '');
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function envFlag(value, fallback) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(normalized);
}

function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}
