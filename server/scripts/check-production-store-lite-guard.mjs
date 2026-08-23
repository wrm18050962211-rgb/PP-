import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PRODUCTION_STORE_LITE_GUARD_PORT || 18789);
const baseUrl = `http://127.0.0.1:${port}`;
const tempDir = await mkdtemp(resolve(tmpdir(), 'pp-production-store-lite-guard-'));
const storePath = resolve(tempDir, 'store.json');
const consumerToken = 'production-store-lite-consumer-token';
const adminToken = 'production-store-lite-admin-token';
const bookingRequestId = '00000000-0000-4000-8000-000000000901';

let server;
const logs = [];

try {
  await writeFile(storePath, JSON.stringify(createSeedStore(), null, 2));
  server = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      APP_ENV: 'production',
      RELEASE_PROFILE: 'store_lite',
      CORS_ALLOWED_ORIGINS: 'http://localhost',
      DATABASE_URL: '',
      ENABLE_STORE_LITE_BOOKINGS: 'true',
      ADMIN_PASSWORD_PEPPER: 'production-store-lite-guard-admin-pepper',
      STORE_LITE_SUPPORT_CHANNEL_KEYS: 'still-support',
      PUBLIC_API_ORIGIN: 'https://api.example.test',
      PHONE_SMS_PROVIDER: 'tencent',
      PHONE_OTP_PEPPER: 'production-store-lite-guard-phone-pepper',
      TENCENT_SMS_SDK_APP_ID: '1400000000',
      TENCENT_SMS_SIGN_NAME: 'Store Lite Test',
      TENCENT_SMS_TEMPLATE_ID: '123456',
      PORT: String(port),
      STORE_DRIVER: 'json',
      STORE_PATH: storePath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', (chunk) => logs.push(String(chunk)));
  server.stderr.on('data', (chunk) => logs.push(String(chunk)));

  await waitForHealth();

  const launch = await request('GET', '/api/ops/launch-check', undefined, { omitAuth: true });
  assert.equal(launch.payload.data?.profile, 'store_lite', 'launch check reports the Store Lite release profile');
  assert.equal(launch.payload.data?.current?.wechatPay, 'disabled', 'launch check disables payment for Store Lite');
  assert.equal(launch.payload.data?.current?.media, 'read-only-content', 'launch check excludes upload requirements');
  assert.equal(
    launch.payload.data?.missing?.some((name) => /WECHAT_PAY|COS_|TENCENT_CLOUD/.test(name)),
    false,
    'Store Lite launch requirements exclude payment and upload credentials',
  );

  for (const [method, path, body, authToken] of [
    ['POST', '/api/orders/quote', {}, null],
    ['POST', '/api/payments/wechat/notify', {}, null],
    ['GET', '/api/conversations', undefined, consumerToken],
    ['POST', '/api/media/upload-policy', { fileName: 'test.jpg' }, consumerToken],
    ['POST', '/api/reports', { orderId: 'legacy-order', reason: 'test' }, consumerToken],
    ['GET', '/api/admin/dashboard', undefined, adminToken],
    ['GET', '/api/admin/action-logs', undefined, adminToken],
    ['GET', '/api/admin/security-events', undefined, adminToken],
    ['GET', '/api/admin/moderation', undefined, adminToken],
    ['GET', '/api/admin/audit-cases', undefined, adminToken],
  ]) {
    const disabled = await request(method, path, body, { omitAuth: !authToken, authToken });
    assertError(disabled, 404, 'STORE_LITE_ROUTE_DISABLED', `${method} ${path} is excluded from Store Lite`);
  }

  const consumerCases = [
    ['GET', '/api/booking-requests'],
    ['GET', `/api/booking-requests/${bookingRequestId}`],
    ['POST', '/api/booking-requests', validCreateBody()],
    ['POST', `/api/booking-requests/${bookingRequestId}/cancel`, { reasonCode: 'changed_plan', reason: 'Schedule changed' }],
  ];
  for (const [method, path, body] of consumerCases) {
    await assertPostgresRequired(method, path, body, consumerToken, 'consumer');
  }

  const adminCases = [
    ['GET', '/api/admin/booking-requests'],
    ['GET', `/api/admin/booking-requests/${bookingRequestId}`],
    ['POST', `/api/admin/booking-requests/${bookingRequestId}/confirm`, validConfirmBody()],
    ['POST', `/api/admin/booking-requests/${bookingRequestId}/decline`, validAdminReasonBody('not_available')],
    ['POST', `/api/admin/booking-requests/${bookingRequestId}/cancel`, validAdminReasonBody('operator_cancelled')],
  ];
  for (const [method, path, body] of adminCases) {
    await assertPostgresRequired(method, path, body, adminToken, 'admin');
  }

  for (const [method, path, body] of [consumerCases[0], consumerCases[2], adminCases[0], adminCases[2]]) {
    const response = await request(method, path, body, { omitAuth: true });
    assertError(response, 401, 'AUTH_REQUIRED', `${method} ${path} requires authentication`);
  }

  for (const [method, path, body] of [adminCases[0], adminCases[2], adminCases[3]]) {
    const response = await request(method, path, body, { authToken: consumerToken });
    assertError(response, 403, 'FORBIDDEN', `consumer cannot access ${method} ${path}`);
  }

  for (const [method, path, body] of [consumerCases[0], consumerCases[2], consumerCases[3]]) {
    const response = await request(method, path, body, { authToken: adminToken });
    assertError(response, 403, 'FORBIDDEN', `admin cannot access ${method} ${path}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          'production-json-consumer-bookings-fail-closed',
          'production-json-admin-bookings-fail-closed',
          'booking-list-detail-create-cancel-confirm-decline-covered',
          'anonymous-booking-auth-required',
          'consumer-admin-booking-forbidden',
          'admin-consumer-booking-forbidden',
          'no-empty-items-or-mock-success',
          'no-real-database-connection',
          'admin-booking-read-write-scopes-seeded',
          'store-lite-launch-requirements-exclude-payment-and-upload',
          'store-lite-commercial-routes-disabled',
          'store-lite-legacy-admin-routes-disabled',
          'store-lite-legacy-report-route-disabled',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  if (server) await stopServer(server);
  await rm(tempDir, { recursive: true, force: true });
}

async function assertPostgresRequired(method, path, body, authToken, actorLabel) {
  const response = await request(method, path, body, { authToken });
  assertError(response, 503, 'BOOKING_POSTGRES_REQUIRED', `${actorLabel} ${method} ${path} fails closed without PostgreSQL`);
  const serialized = JSON.stringify(response.payload);
  assert.equal(response.payload.success, false, `${actorLabel} ${method} ${path} cannot report success`);
  assert.equal(response.payload.data, null, `${actorLabel} ${method} ${path} can return only the standard null failure data`);
  assert.equal(/"items"\s*:\s*\[\s*\]/.test(serialized), false, `${actorLabel} ${method} ${path} cannot disguise failure as an empty list`);
  assert.equal(/mock.?success/i.test(serialized), false, `${actorLabel} ${method} ${path} cannot return mock success`);
}

function createSeedStore() {
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const consumer = {
    id: 'production-store-lite-consumer',
    openId: 'production-store-lite-consumer-openid',
    nickname: 'Store Lite Consumer',
    avatarUrl: '',
    gender: 'unknown',
    city: 'Shanghai',
    status: 'active',
    isCompanion: false,
    roles: ['consumer'],
    createdAt: now,
    updatedAt: now,
  };
  const admin = {
    id: 'production-store-lite-admin',
    openId: 'production-store-lite-admin-openid',
    nickname: 'Store Lite Operator',
    avatarUrl: '',
    gender: 'unknown',
    city: 'Shanghai',
    status: 'active',
    isCompanion: false,
    roles: ['admin'],
    createdAt: now,
    updatedAt: now,
  };
  return {
    meta: { version: 3 },
    users: [consumer, admin],
    sessions: [
      {
        token: consumerToken,
        provider: 'phone',
        role: 'consumer',
        roles: ['consumer'],
        user: consumer,
        loginAt: now,
        updatedAt: now,
        expiresAt,
      },
      {
        token: adminToken,
        provider: 'password',
        role: 'admin',
        roles: ['admin'],
        user: admin,
        adminId: admin.id,
        adminScope: ['booking_requests:read', 'booking_requests:write'],
        loginAt: now,
        updatedAt: now,
        expiresAt,
      },
    ],
  };
}

function validCreateBody() {
  return {
    companionId: '00000000-0000-4000-8000-000000000201',
    requestedStartAt: '2026-09-01T14:00:00+08:00',
    requestedEndAt: '2026-09-01T16:00:00+08:00',
    timezone: 'Asia/Shanghai',
    city: '上海',
    addressText: '上海市徐汇区测试地址',
    requirements: '自然纪实风格',
    clientRequestId: 'store-lite-guard-create-1',
  };
}

function validConfirmBody() {
  return {
    confirmedStartAt: '2026-09-01T14:00:00+08:00',
    confirmedEndAt: '2026-09-01T16:00:00+08:00',
    confirmedCity: '上海',
    confirmedAddressText: '上海市徐汇区确认地址',
    arrivalInstructions: '请提前十分钟到达指定入口',
    supportChannelKey: 'still-support',
    publicMessage: '预约时间已确认',
    internalNote: 'guard-only internal note',
  };
}

function validAdminReasonBody(reasonCode) {
  return {
    reasonCode,
    publicMessage: '当前申请无法继续处理',
    internalNote: 'guard-only internal note',
  };
}

async function waitForHealth() {
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    try {
      const response = await request('GET', '/api/health', undefined, { omitAuth: true });
      if (response.status === 200 && response.payload.success && response.payload.data?.storeDriver === 'json') return;
    } catch {
      // The child process may still be starting.
    }
    await delay(100);
  }
  throw new Error(`Production Store Lite guard server did not start:\n${logs.join('')}`);
}

async function request(method, path, body, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (!options.omitAuth) headers.Authorization = `Bearer ${options.authToken || consumerToken}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, payload: await response.json() };
}

function assertError(response, status, code, message) {
  assert.equal(response.status, status, `${message}: HTTP status`);
  assert.equal(response.payload.success, false, `${message}: success envelope`);
  assert.equal(response.payload.error?.code, code, `${message}: stable error code`);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

async function stopServer(child) {
  if (child.exitCode !== null) return;
  const exited = new Promise((resolveExit) => child.once('exit', resolveExit));
  child.kill();
  await Promise.race([exited, delay(2_000)]);
}
