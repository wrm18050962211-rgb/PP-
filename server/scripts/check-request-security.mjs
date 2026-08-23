import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import {
  createRequestSecurity,
  readJsonRequest,
  redactSensitive,
  redactSensitiveText,
  RequestSecurityError,
  resolveAccessPolicy,
  rotatingSecretValues,
  validateRouteInput,
  validateRouteQuery,
} from '../security/requestSecurity.mjs';

let timestamp = 1_000;
const logLines = [];
const security = createRequestSecurity({
  env: {
    TRUST_PROXY: 'false',
    RATE_LIMIT_GLOBAL_MAX: '10',
    RATE_LIMIT_GLOBAL_WINDOW_MS: '60000',
    RATE_LIMIT_SENSITIVE_MAX: '1',
    RATE_LIMIT_SENSITIVE_WINDOW_MS: '60000',
  },
  clock: () => timestamp,
  logger: {
    log: (line) => logLines.push(line),
    warn: (line) => logLines.push(line),
    error: (line) => logLines.push(line),
  },
});

const loginRequest = request('POST', '/api/admin/auth/login', {
  'x-request-id': 'security-request-123',
});
const context = security.begin(loginRequest);
assert.equal(context.requestId, 'security-request-123');
assert.equal(context.clientIp, '127.0.0.1');
security.enforceRateLimit(loginRequest, context);
assert.throws(
  () => security.enforceRateLimit(loginRequest, context),
  (error) => error instanceof RequestSecurityError && error.status === 429 && error.code === 'SENSITIVE_RATE_LIMITED',
);

const generatedContext = security.begin(request('GET', '/api/health', { 'x-request-id': 'bad id' }));
assert.notEqual(generatedContext.requestId, 'bad id');
assert.match(generatedContext.requestId, /^[0-9a-f-]{36}$/);

const globalLimitSecurity = createRequestSecurity({
  env: {
    RATE_LIMIT_GLOBAL_MAX: '1',
    RATE_LIMIT_GLOBAL_WINDOW_MS: '60000',
    RATE_LIMIT_SENSITIVE_MAX: '10',
  },
});
const firstHealthRequest = request('GET', '/api/health');
globalLimitSecurity.enforceRateLimit(firstHealthRequest, globalLimitSecurity.begin(firstHealthRequest));
const secondHealthRequest = request('GET', '/api/health');
assert.throws(
  () => globalLimitSecurity.enforceRateLimit(secondHealthRequest, globalLimitSecurity.begin(secondHealthRequest)),
  (error) => error instanceof RequestSecurityError && error.code === 'RATE_LIMITED',
);

const trustedProxySecurity = createRequestSecurity({ env: { TRUST_PROXY: 'true' } });
const proxyContext = trustedProxySecurity.begin(
  request('GET', '/api/health', { 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }),
);
assert.equal(proxyContext.clientIp, '203.0.113.9');

assert.deepEqual(resolveAccessPolicy('GET', '/api/admin/orders'), { access: 'admin', targetType: 'admin_api' });
assert.deepEqual(resolveAccessPolicy('PUT', '/api/companion/me/profile'), { access: 'companion', targetType: 'companion_api' });
assert.deepEqual(resolveAccessPolicy('GET', '/api/me/collections'), { access: 'member', targetType: 'user_data' });
assert.deepEqual(resolveAccessPolicy('POST', '/api/orders/quote'), { access: 'anonymous', targetType: 'order_quote' });
assert.deepEqual(resolveAccessPolicy('GET', '/api/orders'), { access: 'member', targetType: 'orders_api' });
assert.deepEqual(resolveAccessPolicy('POST', '/api/booking-requests'), { access: 'member', targetType: 'booking_request' });
assert.deepEqual(resolveAccessPolicy('GET', '/api/booking-requests/00000000-0000-4000-8000-000000000901'), {
  access: 'member',
  targetType: 'booking_request',
});
assert.deepEqual(resolveAccessPolicy('POST', '/api/admin/booking-requests/00000000-0000-4000-8000-000000000901/confirm'), {
  access: 'admin',
  targetType: 'admin_api',
});
assert.deepEqual(resolveAccessPolicy('GET', '/api/orders/00000000-0000-4000-8000-000000000901'), { access: 'member', targetType: 'order' });
assert.deepEqual(resolveAccessPolicy('POST', '/api/orders/order-1/status'), { access: 'admin', targetType: 'order_status' });
assert.deepEqual(resolveAccessPolicy('POST', '/api/payments/wechat/notify'), {
  access: 'anonymous',
  targetType: 'payment_callback',
});

const parsed = await readJsonRequest(jsonRequest('{"phone":"+8613800138000"}'));
assert.equal(parsed.phone, '+8613800138000');
assert.equal(parsed.__rawBody, '{"phone":"+8613800138000"}');
await assert.rejects(
  readJsonRequest(jsonRequest('{"phone":', 'application/json')),
  (error) => error instanceof RequestSecurityError && error.code === 'INVALID_JSON',
);
await assert.rejects(
  readJsonRequest(jsonRequest('{"phone":"ok"}', 'text/plain')),
  (error) => error instanceof RequestSecurityError && error.status === 415,
);
await assert.rejects(
  readJsonRequest(jsonRequest('{"payload":"too-large"}'), { maxBodyBytes: 8 }),
  (error) => error instanceof RequestSecurityError && error.status === 413,
);
await assert.rejects(
  readJsonRequest(jsonRequest('{"__proto__":{"polluted":true}}')),
  (error) => error instanceof RequestSecurityError && error.code === 'REQUEST_BODY_INVALID',
);

assert.throws(
  () => validateRouteInput('POST', '/api/auth/phone/verify', { phone: '+8613800138000', code: 'abc' }),
  (error) => error instanceof RequestSecurityError && error.code === 'PHONE_CODE_INVALID',
);
assert.doesNotThrow(() =>
  validateRouteInput('POST', '/api/auth/phone/verify', {
    phone: '+8613800138000',
    code: '123456',
    role: 'consumer',
    intent: 'login',
  }),
);
assert.doesNotThrow(() =>
  validateRouteInput('POST', '/api/admin/auth/login', {
    username: 'store-lite-ops',
    password: 'correct-password-2026',
  }),
);
assert.throws(
  () => validateRouteInput('POST', '/api/admin/auth/login', { username: 'store-lite-ops' }),
  (error) => error instanceof RequestSecurityError && error.code === 'ADMIN_LOGIN_INVALID',
);
assert.throws(
  () => validateRouteInput('POST', '/api/admin/auth/login', { username: 'store-lite-ops', password: 'correct-password-2026', passcode: '000000' }),
  (error) => error instanceof RequestSecurityError && error.code === 'ADMIN_LOGIN_INVALID',
);
const validBookingCreate = {
  companionId: '00000000-0000-4000-8000-000000000901',
  requestedStartAt: '2026-09-01T05:00:00.000Z',
  requestedEndAt: '2026-09-01T07:00:00.000Z',
  timezone: 'Asia/Shanghai',
  city: '上海',
  addressText: '武康路',
  requirements: '自然纪实风格',
  clientRequestId: 'booking-request-check-001',
};
assert.doesNotThrow(() => validateRouteInput('POST', '/api/booking-requests', validBookingCreate));
assert.throws(
  () => validateRouteInput('POST', '/api/booking-requests', { ...validBookingCreate, userId: 'forged-user' }),
  (error) => error instanceof RequestSecurityError && error.code === 'REQUEST_BODY_INVALID',
);
assert.throws(
  () => validateRouteInput('POST', '/api/booking-requests', { ...validBookingCreate, requestedEndAt: validBookingCreate.requestedStartAt }),
  (error) => error instanceof RequestSecurityError && error.code === 'BOOKING_REQUEST_INVALID',
);
assert.doesNotThrow(() =>
  validateRouteInput('POST', '/api/admin/booking-requests/00000000-0000-4000-8000-000000000901/confirm', {
    confirmedStartAt: '2026-09-01T05:00:00.000Z',
    confirmedEndAt: '2026-09-01T07:00:00.000Z',
    confirmedCity: '上海',
    confirmedAddressText: '武康路',
    arrivalInstructions: '请提前十分钟到达集合点',
    supportChannelKey: 'still.support',
  }),
);
assert.doesNotThrow(() =>
  validateRouteInput('POST', '/api/admin/booking-requests/00000000-0000-4000-8000-000000000901/decline', {
    reasonCode: 'photographer_unavailable',
    publicMessage: '摄影师该时段无法承接',
  }),
);
assert.doesNotThrow(() => validateRouteInput('POST', '/api/orders', { placeLat: 31.2, placeLng: 121.4 }));
assert.throws(
  () => validateRouteInput('POST', '/api/orders', { placeLat: 31.2 }),
  (error) => error instanceof RequestSecurityError && error.code === 'VALIDATION_ERROR',
);
assert.throws(
  () => validateRouteInput('POST', '/api/orders', { placeLat: 91, placeLng: 121.4 }),
  (error) => error instanceof RequestSecurityError && error.code === 'VALIDATION_ERROR',
);
for (const invalidCoordinates of [
  { placeLat: null },
  { placeLat: null, placeLng: null },
  { placeLat: 31.2, placeLng: null },
  { placeLat: '31.2', placeLng: 121.4 },
]) {
  assert.throws(
    () => validateRouteInput('POST', '/api/orders', invalidCoordinates),
    (error) => error instanceof RequestSecurityError && error.code === 'VALIDATION_ERROR',
  );
}

assert.doesNotThrow(() =>
  validateRouteQuery('GET', '/api/orders', new URLSearchParams('role=companion&status=confirmed&limit=25')),
);
assert.throws(
  () => validateRouteQuery('GET', '/api/orders', new URLSearchParams('role=admin')),
  (error) => error instanceof RequestSecurityError && error.code === 'ORDER_QUERY_INVALID',
);
assert.throws(
  () => validateRouteQuery('GET', '/api/orders', new URLSearchParams('role=consumer')),
  (error) => error instanceof RequestSecurityError && error.code === 'ORDER_QUERY_INVALID',
);
assert.throws(
  () => validateRouteQuery('GET', '/api/orders', new URLSearchParams('role=')),
  (error) => error instanceof RequestSecurityError && error.code === 'ORDER_QUERY_INVALID',
);
assert.throws(
  () => validateRouteQuery('GET', '/api/orders', new URLSearchParams('role=user&role=user')),
  (error) => error instanceof RequestSecurityError && error.code === 'ORDER_QUERY_INVALID',
);
assert.throws(
  () => validateRouteQuery('GET', '/api/orders', new URLSearchParams('status=unknown')),
  (error) => error instanceof RequestSecurityError && error.code === 'ORDER_QUERY_INVALID',
);
assert.throws(
  () => validateRouteQuery('GET', '/api/orders', new URLSearchParams('limit=51')),
  (error) => error instanceof RequestSecurityError && error.code === 'ORDER_QUERY_INVALID',
);
assert.throws(
  () => validateRouteQuery('GET', '/api/orders', new URLSearchParams('cursor=not+base64')),
  (error) => error instanceof RequestSecurityError && error.code === 'ORDER_CURSOR_INVALID',
);
assert.throws(
  () => validateRouteQuery('GET', '/api/orders/order-1', new URLSearchParams('status=confirmed')),
  (error) => error instanceof RequestSecurityError && error.code === 'ORDER_QUERY_INVALID',
);
assert.throws(
  () => validateRouteQuery('GET', '/api/orders', new URLSearchParams('status=')),
  (error) => error instanceof RequestSecurityError && error.code === 'ORDER_QUERY_INVALID',
);
assert.throws(
  () => validateRouteQuery('GET', '/api/orders', new URLSearchParams('limit=')),
  (error) => error instanceof RequestSecurityError && error.code === 'ORDER_QUERY_INVALID',
);
assert.throws(
  () => validateRouteQuery('GET', '/api/orders', new URLSearchParams('cursor=')),
  (error) => error instanceof RequestSecurityError && error.code === 'ORDER_CURSOR_INVALID',
);
assert.doesNotThrow(() =>
  validateRouteQuery('GET', '/api/booking-requests', new URLSearchParams('status=submitted&limit=20')),
);
assert.doesNotThrow(() =>
  validateRouteQuery('GET', '/api/admin/booking-requests', new URLSearchParams('status=confirmed&limit=50')),
);
assert.throws(
  () => validateRouteQuery('GET', '/api/booking-requests', new URLSearchParams('status=paid')),
  (error) => error instanceof RequestSecurityError && error.code === 'BOOKING_QUERY_INVALID',
);
assert.throws(
  () => validateRouteQuery('GET', '/api/booking-requests', new URLSearchParams('userId=forged')),
  (error) => error instanceof RequestSecurityError && error.code === 'BOOKING_QUERY_INVALID',
);
assert.throws(
  () => validateRouteQuery('GET', '/api/booking-requests/00000000-0000-4000-8000-000000000901', new URLSearchParams('status=submitted')),
  (error) => error instanceof RequestSecurityError && error.code === 'BOOKING_QUERY_INVALID',
);

assert.deepEqual(
  rotatingSecretValues({ CURRENT: 'new-key', PREVIOUS: 'old-key' }, 'CURRENT', 'PREVIOUS'),
  ['new-key', 'old-key'],
);
assert.deepEqual(rotatingSecretValues({ CURRENT: 'same', PREVIOUS: 'same' }, 'CURRENT', 'PREVIOUS'), ['same']);

const redacted = redactSensitive({
  authorization: 'Bearer token-value',
  nested: { secretKey: 'secret-value', phone: '13800138000' },
});
assert.equal(redacted.authorization, '[REDACTED]');
assert.equal(redacted.nested.secretKey, '[REDACTED]');
assert.equal(redacted.nested.phone, '13********0');
assert.equal(redactSensitiveText('Authorization: Bearer abc.def.ghi'), 'Authorization: Bearer [REDACTED]');

security.log('warn', 'security_sample', {
  authorization: 'Bearer should-not-appear',
  phone: '13800138000',
});
const logSample = logLines.at(-1);
assert(!logSample.includes('should-not-appear'));
assert(!logSample.includes('13800138000'));
assert(logSample.includes('security_sample'));

timestamp += 50;
security.complete(loginRequest, 401);
assert(logLines.at(-1).includes('"requestId":"security-request-123"'));

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'request-id',
        'trusted-proxy-boundary',
        'global-and-sensitive-rate-limit',
        'central-access-policy',
        'json-content-type-and-size',
        'unsafe-object-rejection',
        'route-validation',
        'order-query-validation',
        'rotating-keyring',
        'log-redaction',
        'request-completion-log',
      ],
    },
    null,
    2,
  ),
);

function request(method, url, headers = {}) {
  return {
    method,
    url,
    headers,
    socket: { remoteAddress: '127.0.0.1' },
  };
}

function jsonRequest(body, contentType = 'application/json') {
  const stream = Readable.from([Buffer.from(body)]);
  stream.method = 'POST';
  stream.headers = {
    'content-type': contentType,
    'content-length': String(Buffer.byteLength(body)),
  };
  stream.socket = { remoteAddress: '127.0.0.1' };
  return stream;
}
