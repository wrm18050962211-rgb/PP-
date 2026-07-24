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
