import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.REQUEST_SECURITY_CHECK_PORT || 18789);
const baseUrl = `http://127.0.0.1:${port}`;
const tempDir = await mkdtemp(resolve(tmpdir(), 'pp-request-security-'));
const storePath = resolve(tempDir, 'store.json');
const consumerToken = 'security-route-consumer-secret-token';
const logs = [];
let server;

try {
  await writeFile(storePath, JSON.stringify(seedStore(), null, 2));
  server = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      APP_ENV: 'production',
      RELEASE_PROFILE: 'commercial',
      CORS_ALLOWED_ORIGINS: 'http://localhost',
      PHONE_OTP_PEPPER: 'request-security-test-pepper',
      PORT: String(port),
      STORE_DRIVER: 'json',
      STORE_PATH: storePath,
      REQUEST_BODY_MAX_BYTES: '64',
      RATE_LIMIT_GLOBAL_MAX: '100',
      RATE_LIMIT_SENSITIVE_MAX: '20',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => logs.push(String(chunk)));
  server.stderr.on('data', (chunk) => logs.push(String(chunk)));

  await waitForHealth();

  const tracedHealth = await fetch(`${baseUrl}/api/health`, {
    headers: { 'X-Request-Id': 'security-route-request-123' },
  });
  assert(tracedHealth.headers.get('x-request-id') === 'security-route-request-123', 'valid request ID is echoed');
  assert(tracedHealth.headers.get('access-control-expose-headers')?.includes('X-Request-Id'), 'request ID is CORS-exposed');

  const generatedHealth = await fetch(`${baseUrl}/api/health`, {
    headers: { 'X-Request-Id': 'bad id' },
  });
  assert(/^[0-9a-f-]{36}$/.test(generatedHealth.headers.get('x-request-id') || ''), 'invalid request ID is replaced');

  const malformed = await rawRequest('POST', '/api/admin/auth/login', '{"passcode":', {
    requestId: 'security-malformed-123',
  });
  assert(malformed.status === 400, 'malformed JSON returns 400');
  assert(malformed.payload.error?.code === 'INVALID_JSON', 'malformed JSON uses stable error code');
  assert(malformed.payload.error?.requestId === 'security-malformed-123', 'error payload includes request ID');

  const unsupported = await rawRequest('POST', '/api/auth/phone/request-code', '{"phone":"13800138000"}', {
    contentType: 'text/plain',
    requestId: 'security-content-type-123',
  });
  assert(unsupported.status === 415, 'unsupported content type returns 415');
  assert(unsupported.payload.error?.code === 'CONTENT_TYPE_UNSUPPORTED', 'content type uses stable error code');

  const oversized = await rawRequest('POST', '/api/auth/wechat/login', JSON.stringify({ code: 'x'.repeat(100) }), {
    requestId: 'security-oversized-123',
  });
  assert(oversized.status === 413, 'oversized body returns 413');
  assert(oversized.payload.error?.code === 'REQUEST_BODY_TOO_LARGE', 'oversized body uses stable error code');

  const anonymousAdmin = await rawRequest('GET', '/api/admin/orders', undefined, {
    requestId: 'security-auth-required-123',
  });
  assert(anonymousAdmin.status === 401, 'central policy rejects anonymous admin request');
  assert(anonymousAdmin.payload.error?.code === 'AUTH_REQUIRED', 'central policy uses auth error code');

  const consumerAdmin = await rawRequest('GET', '/api/admin/orders', undefined, {
    authToken: consumerToken,
    requestId: 'security-forbidden-123',
  });
  assert(consumerAdmin.status === 403, 'central policy rejects consumer token on admin request');
  assert(consumerAdmin.payload.error?.code === 'FORBIDDEN', 'role denial uses stable error code');

  await delay(50);
  const logOutput = logs.join('');
  assert(logOutput.includes('"event":"request_completed"'), 'request completion is logged');
  assert(logOutput.includes('"requestId":"security-route-request-123"'), 'request log includes request ID');
  assert(!logOutput.includes(consumerToken), 'request log excludes bearer token');
  assert(!logOutput.includes('13800138000'), 'request log excludes request body phone');

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          'request-id-header',
          'request-id-error-payload',
          'json-parse-error',
          'content-type-rejection',
          'body-size-rejection',
          'central-auth-policy',
          'central-role-policy',
          'traceable-redacted-request-log',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  if (server) server.kill();
  await rm(tempDir, { recursive: true, force: true });
}

async function waitForHealth() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return;
    } catch {
      await delay(100);
    }
  }
  throw new Error(`Request security server did not start:\n${logs.join('')}`);
}

async function rawRequest(method, path, body, options = {}) {
  const headers = {
    'X-Request-Id': options.requestId || 'security-route-default-123',
  };
  if (body !== undefined) headers['Content-Type'] = options.contentType || 'application/json';
  if (options.authToken) headers.Authorization = `Bearer ${options.authToken}`;
  const response = await fetch(`${baseUrl}${path}`, { method, headers, body });
  return {
    status: response.status,
    payload: await response.json(),
  };
}

function seedStore() {
  const timestamp = new Date().toISOString();
  const user = {
    id: 'security-route-user',
    openId: 'security-route-openid',
    nickname: 'Security Route User',
    status: 'active',
    roles: ['consumer'],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
  return {
    meta: { version: 3 },
    users: [user],
    sessions: [
      {
        token: consumerToken,
        provider: 'wechat',
        role: 'consumer',
        roles: ['consumer'],
        user,
        loginAt: timestamp,
        updatedAt: timestamp,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    ],
  };
}

function delay(ms) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(`Request security route check failed: ${message}`);
}
