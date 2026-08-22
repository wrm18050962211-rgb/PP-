import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.PRODUCTION_MEDIA_GUARD_PORT || 18788);
const baseUrl = `http://127.0.0.1:${port}`;
const tempDir = await mkdtemp(resolve(tmpdir(), 'pp-production-media-guard-'));
const storePath = resolve(tempDir, 'store.json');
const publicToken = 'production-media-guard-public-token';
const adminToken = 'production-media-guard-admin-token';

let server;
const logs = [];

try {
  await writeFile(storePath, JSON.stringify(createSeedStore(), null, 2));
  server = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: {
      ...process.env,
      APP_ENV: 'production',
      CORS_ALLOWED_ORIGINS: 'http://localhost',
      PHONE_OTP_PEPPER: 'production-media-guard-test-phone-otp-pepper',
      PORT: String(port),
      STORE_DRIVER: 'json',
      STORE_PATH: storePath,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  server.stdout.on('data', (chunk) => logs.push(String(chunk)));
  server.stderr.on('data', (chunk) => logs.push(String(chunk)));

  await waitForHealth();

  const allowedCorsHealth = await rawApi('GET', '/api/health', undefined, { omitAuth: true, origin: 'http://localhost' });
  assert(allowedCorsHealth.headers.get('access-control-allow-origin') === 'http://localhost', 'production CORS allows configured origin');
  const blockedCorsHealth = await api('GET', '/api/health', undefined, { omitAuth: true, origin: 'https://evil.example', expectOk: false });
  assert(blockedCorsHealth.error?.code === 'CORS_FORBIDDEN', 'production CORS rejects unlisted origin');

  const mockLogin = await api('POST', '/api/auth/wechat/mock-login', { role: 'consumer' }, { omitAuth: true, expectOk: false });
  assert(mockLogin.error?.code === 'TEST_LOGIN_DISABLED', 'production rejects mock user login');

  const localAdminLogin = await api('POST', '/api/admin/auth/login', { passcode: '000000' }, { omitAuth: true, expectOk: false });
  assert(localAdminLogin.error?.code === 'TEST_LOGIN_DISABLED', 'production rejects local admin login');

  const anonymousAdminOrders = await api('GET', '/api/admin/orders', undefined, { omitAuth: true, expectOk: false });
  assert(anonymousAdminOrders.error?.code === 'AUTH_REQUIRED', 'production admin orders API requires auth');

  const anonymousOrders = await api('GET', '/api/orders?role=user', undefined, { omitAuth: true, expectOk: false });
  assert(anonymousOrders.error?.code === 'AUTH_REQUIRED', 'production public orders API requires auth');

  const publicOrdersWithoutPostgres = await api('GET', '/api/orders?role=user', undefined, { expectOk: false });
  assert(publicOrdersWithoutPostgres.error?.code === 'ORDER_POSTGRES_REQUIRED', 'production order list refuses JSON fallback');
  const publicOrderDetailWithoutPostgres = await api(
    'GET',
    '/api/orders/00000000-0000-4000-8000-000000000901',
    undefined,
    { expectOk: false },
  );
  assert(publicOrderDetailWithoutPostgres.error?.code === 'ORDER_POSTGRES_REQUIRED', 'production order detail refuses JSON fallback');

  const anonymousConversations = await api('GET', '/api/conversations', undefined, { omitAuth: true, expectOk: false });
  assert(anonymousConversations.error?.code === 'AUTH_REQUIRED', 'production conversations API requires auth');

  const publicTokenAdminOrders = await api('GET', '/api/admin/orders', undefined, { expectOk: false });
  assert(publicTokenAdminOrders.error?.code === 'FORBIDDEN', 'production rejects public token on admin orders API');

  const adminTokenPublicOrders = await api('GET', '/api/orders?role=user', undefined, { authToken: adminToken, expectOk: false });
  assert(adminTokenPublicOrders.error?.code === 'FORBIDDEN', 'production rejects admin token on public orders API');

  const adminTokenConversations = await api('GET', '/api/conversations', undefined, { authToken: adminToken, expectOk: false });
  assert(adminTokenConversations.error?.code === 'FORBIDDEN', 'production rejects admin token on conversations API');

  const securityStore = await readGuardStore();
  assert(
    securityStore.securityEvents?.some((item) => item.type === 'permission_denied' && item.targetType === 'admin_api' && item.actualRole === 'consumer'),
    'production records public-token admin API denial',
  );
  assert(
    securityStore.securityEvents?.some((item) => item.type === 'permission_denied' && item.targetType === 'orders_api' && item.actualRole === 'admin'),
    'production records admin-token public API denial',
  );
  assert(
    securityStore.securityEvents?.some((item) => item.type === 'permission_denied' && item.targetType === 'conversation' && item.actualRole === 'admin'),
    'production records admin-token conversations API denial',
  );

  const anonymousUpload = await api('POST', '/api/media/upload-policy', { fileName: 'avatar.jpg' }, { omitAuth: true, expectOk: false });
  assert(anonymousUpload.error?.code === 'AUTH_REQUIRED', 'production media policy still requires auth');

  const uploadPolicy = await api('POST', '/api/media/upload-policy', { fileName: 'avatar.jpg', purpose: 'avatar' }, { expectOk: false });
  assert(uploadPolicy.error?.code === 'MEDIA_UPLOAD_NOT_CONFIGURED', 'production media policy rejects mock upload credentials');

  const invalidUpload = await api(
    'POST',
    '/api/media/upload-policy',
    { fileName: 'payload.html', purpose: 'avatar', contentType: 'text/html', sizeBytes: 100 },
    { expectOk: false },
  );
  assert(invalidUpload.error?.code === 'MEDIA_TYPE_NOT_ALLOWED', 'production media policy rejects unsafe content types');

  const identityUpload = await api(
    'POST',
    '/api/media/upload-policy',
    { fileName: 'identity.jpg', purpose: 'identity', contentType: 'image/jpeg', sizeBytes: 100 },
    { expectOk: false },
  );
  assert(identityUpload.error?.code === 'PRIVATE_MEDIA_UPLOAD_NOT_CONFIGURED', 'public media policy rejects private identity uploads');

  const mockPayment = await api('POST', '/api/payments/production-guard-payment/mock-success', undefined, { expectOk: false });
  assert(mockPayment.error?.code === 'MOCK_PAYMENT_DISABLED', 'production rejects mock payment success endpoint');

  console.log(
    JSON.stringify(
      {
        ok: true,
        checks: [
          'cors-allowlist',
          'cors-forbidden',
          'mock-login-disabled',
          'local-admin-login-disabled',
          'anonymous-admin-api-auth-required',
          'anonymous-public-order-api-auth-required',
          'production-order-list-postgres-required',
          'production-order-detail-postgres-required',
          'anonymous-conversations-api-auth-required',
          'public-token-admin-api-forbidden',
          'admin-token-public-api-forbidden',
          'admin-token-conversations-api-forbidden',
          'permission-denial-security-events',
          'auth-required',
          'production-media-not-configured',
          'unsafe-media-type-rejected',
          'identity-media-kept-private',
          'mock-payment-disabled',
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

function createSeedStore() {
  const now = new Date().toISOString();
  const user = {
    id: 'production-media-guard-user',
    openId: 'production-media-guard-openid',
    nickname: 'Production Media Guard',
    avatarUrl: '',
    gender: 'unknown',
    city: 'Shanghai',
    status: 'active',
    isCompanion: false,
    roles: ['consumer'],
    createdAt: now,
    updatedAt: now,
  };
  const adminUser = {
    id: 'production-media-guard-admin',
    openId: 'production-media-guard-admin-openid',
    nickname: 'Production Admin Guard',
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
    users: [user, adminUser],
    sessions: [
      {
        token: publicToken,
        provider: 'wechat',
        role: 'consumer',
        roles: ['consumer'],
        user,
        loginAt: now,
        updatedAt: now,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
      {
        token: adminToken,
        provider: 'admin',
        role: 'admin',
        roles: ['admin'],
        user: adminUser,
        adminScope: ['audit', 'orders', 'risk', 'finance'],
        loginAt: now,
        updatedAt: now,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      },
    ],
  };
}

async function waitForHealth() {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    try {
      const health = await api('GET', '/api/health', undefined, { omitAuth: true });
      if (health.status === 'ok') return;
    } catch {
      await delay(100);
    }
  }

  throw new Error(`Production media guard server did not start:\n${server ? await readServerOutput() : ''}`);
}

async function api(method, path, body, options = {}) {
  const response = await rawApi(method, path, body, options);
  const payload = await response.json();
  if (options.expectOk === false) {
    assert(!payload.success, `${method} ${path} should fail`);
    return payload;
  }
  assert(response.ok && payload.success, `${method} ${path} should succeed`);
  return payload.data;
}

async function rawApi(method, path, body, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (!options.omitAuth) headers.Authorization = `Bearer ${options.authToken || publicToken}`;
  if (options.origin) headers.Origin = options.origin;
  return fetch(`${baseUrl}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
}

async function readServerOutput() {
  return logs.join('');
}

async function readGuardStore() {
  return JSON.parse(await readFile(storePath, 'utf8'));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function assert(condition, message) {
  if (!condition) throw new Error(`Production media guard check failed: ${message}`);
}
