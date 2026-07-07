import http from 'node:http';
import { createDecipheriv, createHash, randomBytes, randomUUID, sign, verify } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { runPendingPaymentExpiryJob } from './jobs/paymentExpiryJob.mjs';
import { mirrorAdminAction, mirrorAuditLog, mirrorSecurityEvent } from './runtimeAuditGateway.mjs';
import { createDataStore } from './store/index.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const storePath = process.env.STORE_PATH ? resolve(process.env.STORE_PATH) : resolve(root, 'data/store.json');
const dataStore = createDataStore({ storePath, initialStore, normalizeStore });
const port = Number(process.env.PORT || 8787);
const appEnv = String(process.env.APP_ENV || 'development').trim().toLowerCase();
const isProductionServerEnv = appEnv === 'production';
const corsAllowedOrigins = parseEnvList(process.env.CORS_ALLOWED_ORIGINS);
const enableTestRoleSwitch = String(process.env.ENABLE_TEST_ROLE_SWITCH ?? 'true').trim().toLowerCase();
const platformFeeRate = 0.08;
const pendingPaymentHoldMinutes = Number(process.env.PENDING_PAYMENT_HOLD_MINUTES || 15);
const pendingPaymentHoldMs = Math.max(1, pendingPaymentHoldMinutes) * 60 * 1000;
const activeSlotLocks = new Set();

if (isProductionServerEnv && corsAllowedOrigins.length === 0) {
  throw new Error('APP_ENV=production requires CORS_ALLOWED_ORIGINS.');
}

const orderStatusText = {
  pending_payment: 'Pending payment',
  paid_pending_confirm: 'Pending confirmation',
  confirmed: 'Confirmed',
  in_service: 'In service',
  completed: 'Completed',
  cancelled: 'Cancelled',
  refunding: 'Refunding',
  refunded: 'Refunded',
  disputed: 'Disputed',
};

const orderStepIndex = {
  pending_payment: 0,
  paid_pending_confirm: 1,
  confirmed: 2,
  in_service: 2,
  completed: 3,
  cancelled: 0,
  refunding: 1,
  refunded: 1,
  disputed: 1,
};

const riskKeywords = [
  { keyword: 'wechat', label: 'Contact exchange', level: 'high' },
  { keyword: 'wx', label: 'Contact exchange', level: 'high' },
  { keyword: 'vx', label: 'Contact exchange', level: 'high' },
  { keyword: 'phone', label: 'Contact exchange', level: 'high' },
  { keyword: 'mobile', label: 'Contact exchange', level: 'high' },
  { keyword: 'offline pay', label: 'Off-platform payment', level: 'high' },
  { keyword: 'private pay', label: 'Off-platform payment', level: 'high' },
  { keyword: 'transfer', label: 'Off-platform payment', level: 'high' },
  { keyword: 'bank card', label: 'Off-platform payment', level: 'high' },
  { keyword: 'alipay', label: 'Off-platform payment', level: 'high' },
  { keyword: 'paypal', label: 'Off-platform payment', level: 'high' },
  { keyword: '微信', label: 'Contact exchange', level: 'high' },
  { keyword: '加我', label: 'Contact exchange', level: 'high' },
  { keyword: '电话', label: 'Contact exchange', level: 'high' },
  { keyword: '手机号', label: 'Contact exchange', level: 'high' },
  { keyword: '私下付', label: 'Off-platform payment', level: 'high' },
  { keyword: '线下付', label: 'Off-platform payment', level: 'high' },
  { keyword: '转账', label: 'Off-platform payment', level: 'high' },
  { keyword: '银行卡', label: 'Off-platform payment', level: 'high' },
  { keyword: '支付宝', label: 'Off-platform payment', level: 'high' },
];

http
  .createServer(async (req, res) => {
    if (!isCorsRequestAllowed(req)) return sendJson(req, res, 403, fail('CORS_FORBIDDEN', 'Request origin is not allowed.'));
    if (req.method === 'OPTIONS') return send(req, res, 204, '');

    try {
      const url = new URL(req.url || '/', 'http://local');
      const { store, changed: storeChanged } = await dataStore.load();
      const cleanupChanged = dataStore.kind === 'json' ? expirePendingPaymentOrders(store) : false;
      if (dataStore.kind !== 'json') await expirePostgresPendingPaymentOrders();
      const body = await readBody(req);
      const result = await route(req.method || 'GET', url, body, store, req);
      if (dataStore.kind !== 'json' && (storeChanged || cleanupChanged || result.changed)) {
        return sendJson(req, res, 501, fail('POSTGRES_WRITE_ROUTE_NOT_CONNECTED', 'This write route has not been connected to the PostgreSQL transaction gateway yet.'));
      }
      if (storeChanged || cleanupChanged || result.changed) await dataStore.save(store);
      sendJson(req, res, result.status, result.payload);
    } catch (error) {
      sendJson(req, res, 500, fail('SERVER_ERROR', error instanceof Error ? error.message : 'Server error'));
    }
  })
  .listen(port, () => console.log(`Still backend listening on http://127.0.0.1:${port}`));

async function route(method, url, body, store, req) {
  const path = url.pathname;
  await applyRequestSession(store, req);

  if (method === 'GET' && path === '/api/health') {
    return json({
      status: 'ok',
      version: '0.3.0',
      storeVersion: store.meta.version,
      storeDriver: dataStore.kind,
      storeCapabilities: dataStore.capabilities,
    });
  }
  if (method === 'GET' && path === '/api/ops/launch-check') return launchCheck();
  if (method === 'GET' && path === '/api/auth/session') return authSession(store);
  if (method === 'POST' && path === '/api/auth/wechat/login') return wechatLogin(store, body);
  if (method === 'POST' && path === '/api/auth/wechat/mock-login') return mockWechatLogin(store, body);
  if (method === 'POST' && path === '/api/auth/logout') return logout(store);
  if (method === 'POST' && path === '/api/admin/auth/login') return adminLogin(store, body);
  if (method === 'POST' && path === '/api/admin/auth/logout') return adminLogout(store);
  if (method === 'POST' && path === '/api/media/upload-policy') return createMediaUploadPolicy(store, body);
  if (method === 'GET' && path === '/api/feed/posts') return json(listFeedPostPage(store, url));
  if (method === 'GET' && path === '/api/matching/companions') return matchCompanions(store, url);
  if (method === 'GET' && path.startsWith('/api/posts/')) return getPost(store, last(path));

  if (method === 'POST' && path === '/api/orders/quote') return quoteOrder(store, body);
  if (method === 'POST' && path === '/api/orders') return createOrder(store, body);
  if (method === 'GET' && path === '/api/orders') return listOrders(store, url);
  if (method === 'GET' && isNestedRoute(path, '/api/payments/', '/status')) return getPaymentStatus(store, path);
  if (method === 'POST' && isNestedRoute(path, '/api/payments/', '/mock-success')) return mockPaymentSuccess(store, path);
  if (method === 'POST' && path === '/api/payments/wechat/notify') return wechatPaymentNotify(store, body, req);
  if (method === 'POST' && path === '/api/payments/wechat/refund-notify') return wechatRefundNotify(store, body, req);
  if (method === 'POST' && isNestedRoute(path, '/api/orders/', '/confirm')) return transitionOrder(store, path, 'confirm', body);
  if (method === 'POST' && isNestedRoute(path, '/api/orders/', '/complete')) return transitionOrder(store, path, 'complete', body);
  if (method === 'POST' && isNestedRoute(path, '/api/orders/', '/cancel')) return transitionOrder(store, path, 'cancel', body);
  if (method === 'POST' && isNestedRoute(path, '/api/orders/', '/status')) return setOrderStatus(store, path, body.status);

  if (method === 'GET' && path === '/api/conversations') return listConversations(store, url);
  if (method === 'GET' && isNestedRoute(path, '/api/orders/', '/conversation')) return getConversation(store, path);
  if (method === 'POST' && isNestedRoute(path, '/api/conversations/', '/messages')) return sendMessage(store, path, body);
  if (method === 'POST' && isNestedRoute(path, '/api/orders/', '/report')) return createReport(store, path, body);
  if (method === 'POST' && path === '/api/reports') return createReport(store, `/api/orders/${body.orderId || ''}/report`, body);

  if (method === 'GET' && path === '/api/companion/me') return companionDashboard(store);
  if (method === 'POST' && path === '/api/companion/me/application') return saveApplication(store, body);
  if (method === 'PUT' && path === '/api/companion/me/application') return saveApplication(store, body);
  if (method === 'POST' && path === '/api/companion/me/submit-review') return submitCompanionReview(store);

  if (method === 'GET' && path === '/api/admin/dashboard') return adminDashboard(store);
  if (method === 'GET' && path === '/api/admin/orders') return adminOrders(store, url);
  if (method === 'POST' && isNestedRoute(path, '/api/admin/orders/', '/status')) return setAdminOrderStatus(store, path, body.status);
  if (method === 'GET' && path === '/api/admin/action-logs') return adminActionLogs(store, url);
  if (method === 'GET' && path === '/api/admin/security-events') return adminSecurityEvents(store, url);
  if (method === 'GET' && path === '/api/admin/moderation') return adminModeration(store);
  if (method === 'GET' && path === '/api/admin/audit-cases') return listAuditCases(store, url);
  if (method === 'POST' && isNestedRoute(path, '/api/admin/audit-cases/', '/approve')) return reviewAuditCase(store, path, 'approved');
  if (method === 'POST' && isNestedRoute(path, '/api/admin/audit-cases/', '/reject')) return reviewAuditCase(store, path, 'rejected', body);
  if (method === 'POST' && isNestedRoute(path, '/api/admin/moderation/', '/actions')) return applyModerationAction(store, path, body);

  return error(404, 'NOT_FOUND', 'Route not found');
}

function listFeedPostPage(store, url) {
  const city = normalize(url.searchParams.get('city'));
  const limit = clampNumber(toNumber(url.searchParams.get('limit')) ?? 20, 1, 50);
  const cursor = clampNumber(toNumber(url.searchParams.get('cursor')) ?? 0, 0, Number.MAX_SAFE_INTEGER);
  const source = store.posts
    .filter((post) => post.status === 'approved' && post.isFeedVisible !== false)
    .filter((post) => !city || normalize(post.city).includes(city) || normalize(post.location).includes(city));
  const items = source.slice(cursor, cursor + limit).map(withPostTitle);
  const nextOffset = cursor + items.length;

  return {
    items,
    nextCursor: nextOffset < source.length ? String(nextOffset) : null,
    hasMore: nextOffset < source.length,
  };
}

function getPost(store, postId) {
  const post = store.posts.find((item) => item.id === postId);
  return post ? json(withPostTitle(post)) : error(404, 'NOT_FOUND', 'Post not found');
}

function withPostTitle(post) {
  const title = buildPostTitle(post);
  return post.title === title ? post : { ...post, title };
}

function buildPostTitle(post = {}) {
  const explicitTitle = normalize(post.title);
  if (explicitTitle) return explicitTitle;

  const location = shortPostLocation(post);
  const style = normalize(post.activity) || normalize(post.styleTags?.[0]);
  const captionLead = normalize(post.caption).split(/[，。,.]/)[0]?.slice(0, 16);
  return [location, style].filter(Boolean).join(' ') || captionLead || '作品样板';
}

function shortPostLocation(post = {}) {
  const raw = normalize(post.locationName) || normalize(post.location) || normalize(post.companion?.areas?.[0]);
  const simplified = raw.replace(/^上海\s*[·\-｜|路]\s*/, '');
  const parts = simplified.split(/[·\-｜|]/).map((part) => part.trim()).filter(Boolean);
  return parts.at(-1) || raw;
}

function createMediaUploadPolicy(store, body = {}) {
  const publicSession = requirePublicSession(store, 'consumer', 'media_upload');
  if (publicSession.response) return publicSession.response;
  const { session } = publicSession;
  if (isProductionServerEnv) {
    return error(501, 'MEDIA_UPLOAD_NOT_CONFIGURED', 'Production media upload requires real object storage credentials.');
  }

  const purpose = normalizeMediaPurpose(body.purpose);
  const fileName = sanitizeFileName(body.fileName || 'upload.jpg');
  const contentType = String(body.contentType || 'application/octet-stream');
  const objectKey = `pp/${purpose}/${session.user.id}/${Date.now()}-${fileName}`;
  const bucket = process.env.COS_BUCKET || 'pp-mvp-local-1250000000';
  const region = process.env.COS_REGION || 'ap-shanghai';
  const publicBaseUrl = process.env.COS_PUBLIC_BASE_URL || `https://${bucket}.cos.${region}.myqcloud.com`;

  return json({
    provider: 'tencent_cos',
    mode: 'mock',
    bucket,
    region,
    purpose,
    objectKey,
    contentType,
    uploadUrl: `${publicBaseUrl}/${objectKey}`,
    publicUrl: `${publicBaseUrl}/${objectKey}`,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    credentials: {
      type: 'mock_sts',
      note: 'Replace this with Tencent Cloud STS temporary credentials before production upload.',
    },
  });
}

function normalizeMediaPurpose(purpose) {
  return ['post-image', 'avatar', 'portfolio', 'identity', 'video'].includes(purpose) ? purpose : 'post-image';
}

function sanitizeFileName(fileName) {
  return String(fileName)
    .replace(/[/\\?%*:|"<>]/g, '-')
    .replace(/\s+/g, '-')
    .slice(0, 80);
}

async function applyRequestSession(store, req) {
  const token = getBearerToken(req);
  if (!token) {
    store.activeSession = null;
    return null;
  }
  let session = findStoredSession(store, token);
  if (!session && dataStore.sessionWrites?.findByToken) {
    session = await dataStore.sessionWrites.findByToken(token);
  }
  if (!session) {
    store.activeSession = null;
    return null;
  }
  store.activeSession = refreshSession(store, session);
  if (dataStore.sessionWrites?.touchToken) await dataStore.sessionWrites.touchToken(token);
  return store.activeSession;
}

function authSession(store) {
  if (!store.activeSession?.role && (dataStore.kind !== 'json' || !isTestRoleSwitchAllowed())) return error(401, 'AUTH_REQUIRED', 'Authentication is required');
  const session = store.activeSession?.role ? refreshSession(store, store.activeSession) : createSession(store, 'consumer');
  return json(saveSession(store, session), 200, dataStore.kind === 'json');
}

function mockWechatLogin(store, body = {}) {
  if (!isTestRoleSwitchAllowed()) return error(403, 'TEST_LOGIN_DISABLED', 'Mock login is disabled in this environment');
  if (dataStore.kind !== 'json') return error(403, 'TEST_LOGIN_JSON_ONLY', 'Mock role switching is only available with the JSON store');
  const role = normalizeRole(body.role);
  if (role === 'admin') return error(403, 'ADMIN_LOGIN_REQUIRED', 'Use the admin login endpoint');
  const session = createSession(store, role, null, { companionId: body.companionId });
  return json(saveSession(store, session), 200, true);
}

function adminLogin(store, body = {}) {
  if (dataStore.kind !== 'json') return error(501, 'ADMIN_PASSWORD_LOGIN_NOT_CONFIGURED', 'Admin password login is not connected to PostgreSQL yet');
  if (!isTestRoleSwitchAllowed()) return error(403, 'TEST_LOGIN_DISABLED', 'Local admin login is disabled in this environment');
  if (String(body.passcode || '') !== '000000') {
    recordSecurityEvent(store, store.activeSession || null, 'admin_login_failed', {
      targetType: 'admin_auth',
      requiredRole: 'admin',
      actualRole: store.activeSession?.role || 'anonymous',
      reason: 'Invalid admin passcode',
      action: 'login',
    });
    return error(401, 'INVALID_ADMIN_PASSCODE', 'Invalid admin passcode', true);
  }
  const session = createSession(store, 'admin');
  session.provider = 'local_admin';
  const storedSession = saveSession(store, session);
  recordAdminAction(store, storedSession, 'admin_login', 'admin_auth', storedSession.user?.id || null, {
    note: 'Admin logged in',
  });
  return json(storedSession, 200, true);
}

async function adminLogout(store) {
  const gate = requireAdminSession(store);
  if (gate.response) return gate.response;
  recordAdminAction(store, gate.session, 'admin_logout', 'admin_auth', gate.session.user?.id || null, {
    note: 'Admin logged out',
  });
  return logout(store);
}

async function wechatLogin(store, body = {}) {
  const code = String(body.code || '').trim();
  if (!code) return error(400, 'VALIDATION_ERROR', 'WeChat login code is required');
  if (code.startsWith('mock-') && !isTestRoleSwitchAllowed()) return error(403, 'TEST_LOGIN_DISABLED', 'Mock WeChat login code is disabled in this environment');
  if (!hasWechatAuthConfig() && !isTestRoleSwitchAllowed()) return error(501, 'WECHAT_AUTH_NOT_CONFIGURED', 'WeChat auth config is required');

  if (hasWechatAuthConfig() && !code.startsWith('mock-')) {
    const identity = await exchangeWechatCode(code);
    const user = await resolveWechatUser(store, identity);
    const session = createSession(store, 'consumer', user);
    session.provider = 'wechat';
    session.openId = user.openId;
    return json(await persistSession(store, session), 200, dataStore.kind === 'json');
  }

  const user = await resolveWechatUser(store, {
    openid: `mock-openid-${code.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'consumer'}`,
    unionid: null,
  });
  const session = createSession(store, 'consumer', user);
  session.provider = 'wechat';
  session.mode = 'mock';
  session.loginCode = code.startsWith('mock-') ? code : undefined;
  return json(await persistSession(store, session), 200, dataStore.kind === 'json');
}

async function resolveWechatUser(store, identity) {
  if (dataStore.authWrites?.upsertIdentityUser) {
    const openId = String(identity.openid || '').trim();
    if (!openId) throw new Error('WeChat code2session did not return openid');
    const user = await dataStore.authWrites.upsertIdentityUser({
      provider: 'wechat',
      openid: openId,
      unionid: identity.unionid || null,
      nickname: identity.nickname || 'WeChat User',
      avatarUrl: identity.avatarUrl || '',
      metadata: { source: 'wechat_login' },
    });
    user.openId = openId;
    user.unionId = identity.unionid || null;
    return user;
  }
  return ensureWechatUser(store, identity);
}

async function persistSession(store, session) {
  const storedSession = saveSession(store, session);
  if (dataStore.sessionWrites?.create) await dataStore.sessionWrites.create(storedSession);
  return storedSession;
}

async function logout(store) {
  const token = store.activeSession?.token;
  revokeSession(store, token);
  if (token && dataStore.sessionWrites?.revokeToken) await dataStore.sessionWrites.revokeToken(token);
  store.activeSession = null;
  return json({ ok: true }, 200, dataStore.kind === 'json');
}

function createSession(store, role, existingUser = null, options = {}) {
  const user = existingUser || store.activeSession?.user || ensureDemoUser(store, role);
  const companionId = role === 'companion' ? resolveSessionCompanionId(store, options.companionId || store.activeSession?.companionId) : null;
  const session = {
    token: options.token || buildSessionToken(role, existingUser),
    provider: existingUser?.openId ? 'wechat' : 'mock_wechat',
    role,
    roles: rolesForSessionRole(role),
    user,
    companionId,
    adminScope: role === 'admin' ? ['audit', 'orders', 'risk', 'finance'] : [],
    loginAt: options.loginAt || now(),
  };
  return session;
}

function resolveSessionCompanionId(store, requestedCompanionId) {
  if (requestedCompanionId && store.companions.some((item) => item.id === requestedCompanionId)) return requestedCompanionId;
  return store.companions[0]?.id || null;
}

function ensureActiveSession(store, fallbackRole = 'consumer') {
  if (!store.activeSession?.role) {
    if (!isTestRoleSwitchAllowed() || fallbackRole !== 'consumer') return null;
  }

  const role = normalizeRole(store.activeSession?.role || fallbackRole);
  const session = createSession(store, role, store.activeSession?.user || null, {
    companionId: store.activeSession?.companionId,
    token: store.activeSession?.token,
    loginAt: store.activeSession?.loginAt,
  });
  return saveSession(store, session);
}

function authRequired() {
  return error(401, 'AUTH_REQUIRED', 'Authentication is required');
}

function runtimeSecurityChanged() {
  return dataStore.kind === 'json';
}

function adminRequired(changed = false) {
  return error(403, 'FORBIDDEN', 'Admin role is required', changed);
}

function companionRequired(message = 'Companion role is required', changed = false) {
  return error(403, 'FORBIDDEN', message, changed);
}

function requirePublicSession(store, fallbackRole = 'consumer', targetType = 'public_api') {
  const session = store.activeSession?.role ? ensureActiveSession(store, fallbackRole) : null;
  if (!session) return { response: authRequired() };
  if (session.role === 'admin') {
    recordSecurityEvent(store, session, 'permission_denied', {
      targetType,
      requiredRole: 'consumer_or_companion',
      actualRole: 'admin',
      reason: 'Admin session cannot access public app API',
    });
    return { response: error(403, 'FORBIDDEN', 'Admin session cannot access public app API', runtimeSecurityChanged()) };
  }
  return { session };
}

function requireAdminSession(store) {
  const session = ensureActiveSession(store, 'admin');
  if (!session) return { response: authRequired() };
  if (session.role !== 'admin') {
    recordSecurityEvent(store, session, 'permission_denied', {
      targetType: 'admin_api',
      requiredRole: 'admin',
      actualRole: session.role,
      reason: 'Admin role is required',
    });
    return { response: adminRequired(runtimeSecurityChanged()) };
  }
  return { session };
}

function requireCompanionSession(store, options = {}) {
  const session = ensureActiveSession(store, 'companion');
  if (!session) return { response: authRequired() };
  const allowAdmin = Boolean(options.allowAdmin);
  if (session.role !== 'companion' && !(allowAdmin && session.role === 'admin')) {
    const reason = allowAdmin ? 'Companion or admin role is required' : 'Companion role is required';
    recordSecurityEvent(store, session, 'permission_denied', {
      targetType: 'companion_api',
      requiredRole: allowAdmin ? 'companion_or_admin' : 'companion',
      actualRole: session.role,
      reason,
    });
    return { response: companionRequired(reason, runtimeSecurityChanged()) };
  }
  return { session };
}

function refreshSession(store, session) {
  return createSession(store, normalizeRole(session.role), session.user || null, {
    companionId: session.companionId,
    token: session.token,
    loginAt: session.loginAt,
  });
}

function saveSession(store, session) {
  store.sessions ||= [];
  const storedSession = {
    ...session,
    updatedAt: now(),
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  };
  const index = store.sessions.findIndex((item) => item.token === storedSession.token);
  if (index >= 0) store.sessions[index] = storedSession;
  else store.sessions.push(storedSession);
  store.activeSession = storedSession;
  return storedSession;
}

function findStoredSession(store, token) {
  const session = store.sessions?.find((item) => item.token === token);
  if (!session) return null;
  if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
    revokeSession(store, token);
    return null;
  }
  return session;
}

function revokeSession(store, token) {
  if (!token || !Array.isArray(store.sessions)) return;
  store.sessions = store.sessions.filter((item) => item.token !== token);
}

function getBearerToken(req) {
  const header = req?.headers?.authorization || req?.headers?.Authorization;
  const value = Array.isArray(header) ? header[0] : header;
  const match = String(value || '').match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

function buildSessionToken(role, user) {
  const prefix = user?.openId ? `wx-${role}-${user.id}` : `local-${role}`;
  return `${prefix}-${randomString(18)}`;
}

async function exchangeWechatCode(code) {
  const appId = requiredEnv('WECHAT_MINI_PROGRAM_APP_ID');
  const appSecret = requiredEnv('WECHAT_MINI_PROGRAM_APP_SECRET');
  const url = new URL('https://api.weixin.qq.com/sns/jscode2session');
  url.searchParams.set('appid', appId);
  url.searchParams.set('secret', appSecret);
  url.searchParams.set('js_code', code);
  url.searchParams.set('grant_type', 'authorization_code');

  const response = await fetch(url, { method: 'GET' });
  const data = await response.json();
  if (!response.ok || data.errcode) {
    return Promise.reject(new Error(data.errmsg || `WeChat code2session failed with ${response.status}`));
  }
  return data;
}

function ensureWechatUser(store, identity) {
  store.users ||= [];
  const openId = String(identity.openid || '').trim();
  if (!openId) throw new Error('WeChat code2session did not return openid');

  let user = store.users.find((item) => item.openId === openId);
  if (!user) {
    user = {
      id: `user-${openId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 28) || Date.now()}`,
      openId,
      unionId: identity.unionid || null,
      nickname: 'WeChat User',
      avatarUrl: '',
      gender: 'unknown',
      city: '',
      status: 'active',
      isCompanion: false,
      roles: ['consumer'],
      createdAt: now(),
      updatedAt: now(),
    };
    store.users.push(user);
  }

  user.openId = openId;
  user.unionId = identity.unionid || user.unionId || null;
  user.roles = Array.from(new Set([...(user.roles || []), 'consumer']));
  user.status = user.status || 'active';
  user.updatedAt = now();
  return user;
}

function ensureDemoUser(store, role) {
  store.users ||= [];
  const userId = `demo-${role}-user`;
  let user = store.users.find((item) => item.id === userId);
  if (!user) {
    user = {
      id: userId,
      openId: `mock-openid-${role}`,
      nickname: role === 'admin' ? 'Demo Admin' : role === 'companion' ? 'Demo Companion' : 'Demo Consumer',
      avatarUrl: '',
      gender: 'unknown',
      city: 'Shanghai',
      status: 'active',
      isCompanion: role === 'companion',
      roles: rolesForSessionRole(role),
      createdAt: now(),
      updatedAt: now(),
    };
    store.users.push(user);
  }
  user.openId ||= `mock-openid-${role}`;
  user.nickname ||= role === 'admin' ? 'Demo Admin' : role === 'companion' ? 'Demo Companion' : 'Demo Consumer';
  user.status = user.status || 'active';
  user.isCompanion = role === 'companion';
  user.roles = rolesForSessionRole(role);
  user.updatedAt = now();
  return user;
}

function rolesForSessionRole(role) {
  if (role === 'admin') return ['admin'];
  return role === 'companion' ? ['consumer', 'companion'] : ['consumer'];
}

function normalizeRole(role) {
  if (role === 'user') return 'consumer';
  return ['consumer', 'companion', 'admin'].includes(role) ? role : 'consumer';
}

function canAccessOrder(store, order, session, requestedRole = session.role) {
  const role = normalizeRole(requestedRole);
  if (session.role === 'admin' || role === 'admin') return false;
  if (role === 'companion') return Boolean(order.companionId && order.companionId === session.companionId);
  return !order.userId || order.userId === session.user.id;
}

function requireOrderAccess(store, orderOrId, session, requestedRole = session.role, forbiddenMessage = 'Order is not accessible for current role') {
  const order = typeof orderOrId === 'string' ? findOrder(store, orderOrId) : orderOrId;
  if (!order) return { response: error(404, 'NOT_FOUND', 'Order not found') };
  if (!canAccessOrder(store, order, session, requestedRole)) {
    recordSecurityEvent(store, session, 'permission_denied', {
      targetType: 'order',
      targetId: order.id,
      requiredRole: normalizeRole(requestedRole),
      actualRole: session.role,
      reason: forbiddenMessage,
    });
    return { response: error(403, 'FORBIDDEN', forbiddenMessage, runtimeSecurityChanged()) };
  }
  return { order };
}

function canMutateOrder(order, session, action) {
  if (session.role === 'admin') return false;
  if (action === 'confirm' || action === 'complete') return session.role === 'companion' && order.companionId === session.companionId;
  if (action === 'cancel') return order.userId === session.user.id || (session.role === 'companion' && order.companionId === session.companionId);
  return false;
}

function requireOrderMutationAccess(store, orderOrId, session, action) {
  const order = typeof orderOrId === 'string' ? findOrder(store, orderOrId) : orderOrId;
  if (!order) return { response: error(404, 'NOT_FOUND', 'Order not found') };
  if (!canMutateOrder(order, session, action)) {
    recordSecurityEvent(store, session, 'permission_denied', {
      targetType: 'order',
      targetId: order.id,
      requiredRole: `order_${action}`,
      actualRole: session.role,
      reason: 'Order action is not allowed for current role',
      action,
    });
    return { response: error(403, 'FORBIDDEN', 'Order action is not allowed for current role', runtimeSecurityChanged()) };
  }
  return { order };
}

function recordAuditLog(store, auditCase, action, session, note, metadata = {}) {
  const createdAt = now();
  const log = {
    id: dataStore.kind !== 'json' ? postgresId() : id('audit-log'),
    auditCaseId: auditCase.id,
    action,
    operatorId: session.user?.id || null,
    operatorType: session.role || 'admin',
    comment: note,
    note,
    metadata,
    createdAt,
  };
  store.auditLogs.unshift(log);
  auditCase.logs = [
    { id: log.id, action, note, operatorType: log.operatorType, createdAt },
    ...(auditCase.logs || []),
  ];
  mirrorAuditLog(dataStore, log);
  return log;
}

function recordAdminAction(store, session, action, targetType, targetId, options = {}) {
  const log = {
    id: dataStore.kind !== 'json' ? postgresId() : id('admin-action'),
    adminId: session.user?.id || null,
    action,
    type: action,
    targetType,
    targetId,
    note: options.note || '',
    beforeData: options.beforeData || null,
    afterData: options.afterData || null,
    createdAt: now(),
  };
  store.adminActionLogs.unshift(log);
  mirrorAdminAction(dataStore, log);
  return log;
}

function recordSecurityEvent(store, session, type, details = {}) {
  store.securityEvents ||= [];
  const event = {
    id: dataStore.kind !== 'json' ? postgresId() : id('security-event'),
    type,
    actorId: session?.user?.id || null,
    actorRole: session?.role || 'anonymous',
    targetType: details.targetType || null,
    targetId: details.targetId || null,
    targetKey: details.targetKey || null,
    requiredRole: details.requiredRole || null,
    actualRole: details.actualRole || session?.role || 'anonymous',
    reason: details.reason || '',
    action: details.action || null,
    metadata: details.metadata || {},
    ip: details.ip || null,
    userAgent: details.userAgent || null,
    createdAt: now(),
  };
  store.securityEvents.unshift(event);
  mirrorSecurityEvent(dataStore, event);
  return event;
}

function messageSenderRole(session) {
  return session.role === 'admin' ? 'admin' : session.role === 'companion' ? 'companion' : 'user';
}

function normalizeOrderIdempotencyKey(value) {
  return String(value || '').trim().slice(0, 120);
}

function hashRequestPayload(value) {
  return createHash('sha256').update(stableJson(value || {})).digest('hex');
}

function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map((item) => stableJson(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableJson(value[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

function findIdempotentOrder(store, session, idempotencyKey) {
  if (!idempotencyKey) return null;
  return store.orders.find(
    (order) =>
      order.idempotencyKey === idempotencyKey &&
      order.userId === session.user.id &&
      !['cancelled', 'refunded'].includes(order.status),
  );
}

function publicOrderWithPayment(store, order) {
  const payment = store.payments.find((item) => item.orderId === order.id);
  return payment ? { ...viewOrder(order), payment: publicPayment(payment) } : viewOrder(order);
}

function findPayment(store, idValue) {
  return store.payments.find((item) => item.id === idValue || item.paymentId === idValue || item.paymentNo === idValue);
}

function quoteOrder(store, input) {
  const context = resolveOrderContext(store, input);
  if (context.error) return context.error;
  return json(buildQuote(context, input));
}

async function createOrder(store, input) {
  const publicSession = requirePublicSession(store, 'consumer', 'order');
  if (publicSession.response) return publicSession.response;
  const { session } = publicSession;

  const idempotencyKey = normalizeOrderIdempotencyKey(input.idempotencyKey || input.clientRequestId);
  const existingOrder = idempotencyKey ? findIdempotentOrder(store, session, idempotencyKey) : null;
  if (existingOrder) return json(publicOrderWithPayment(store, existingOrder));
  if (dataStore.kind !== 'json' && idempotencyKey && dataStore.idempotencyWrites?.beginRequest) {
    const idempotency = await beginPostgresOrderIdempotency(session, idempotencyKey, input);
    if (idempotency.response) return idempotency.response;
  }

  const context = resolveOrderContext(store, input);
  if (context.error) return context.error;
  if (!reserveSlotForOrder(context.companion.id, context.slot)) return error(409, 'ORDER_SLOT_UNAVAILABLE', 'Slot is not available');

  const quote = buildQuote(context, input);
  const orderId = dataStore.kind !== 'json' ? postgresId() : id('order');
  const paymentId = dataStore.kind !== 'json' ? postgresId() : id('payment');
  const paymentExpiresAt = createPaymentExpiresAt();
  lockReservedSlotForOrder(context.companion.id, context.slot, orderId, paymentExpiresAt);
  const order = viewOrder({
    id: orderId,
    orderNo: orderNo(),
    status: 'pending_payment',
    title: input.title || `${context.activity.name} booking`,
    time: context.slot.label,
    place: input.placeName || input.place || context.post.locationName || context.post.location,
    amountCents: quote.totalAmountCents,
    userId: session.user.id,
    userName: session.user.nickname,
    companion: context.companion.name,
    companionId: context.companion.id,
    postId: context.post.id,
    activityId: context.activity.id,
    activityName: context.activity.name,
    slotId: context.slot.id,
    startAt: context.slot.startAt,
    endAt: context.slot.endAt,
    dateLabel: context.slot.dateLabel,
    timeLabel: context.slot.timeLabel,
    durationMinutes: context.activity.durationMinutes,
    durationLabel: context.activity.durationLabel,
    addOns: quote.addOns,
    placeAddress: input.placeAddress || '',
    userNote: input.userNote || '',
    quote,
    idempotencyKey,
    paymentId,
    paymentExpiresAt,
    createdAt: now(),
    statusLogs: [statusLog('pending_payment', 'Order created and slot locked')],
  });

  const payment = {
    id: paymentId,
    paymentId,
    paymentNo: paymentNo(),
    orderId: order.id,
    channel: input.channel || 'wechat_pay',
    provider: 'wechat_pay',
    mode: useLiveWechatPay() ? 'production' : 'mock',
    status: 'pending',
    amountCents: quote.totalAmountCents,
    expiresAt: paymentExpiresAt,
    createdAt: now(),
  };

  if (payment.mode === 'production') {
    try {
      const prepay = await createWechatJsapiPrepay(payment, order, session);
      Object.assign(payment, prepay);
    } catch (paymentError) {
      releaseSlotReservation(context.companion.id, context.slot, order.id);
      return error(502, 'WECHAT_PAY_PREPAY_FAILED', paymentError instanceof Error ? paymentError.message : 'WeChat Pay prepay failed');
    }
  }

  if (dataStore.kind !== 'json' && dataStore.orderWrites?.createOrder) {
    return createPostgresOrder(context, quote, order, payment, input, idempotencyKey);
  }

  store.orders.unshift(order);
  store.payments.unshift(payment);

  return json({ ...order, payment: publicPayment(payment) }, 201, true);
}

async function beginPostgresOrderIdempotency(session, idempotencyKey, input) {
  try {
    const result = await dataStore.idempotencyWrites.beginRequest({
      idempotencyId: postgresId(),
      scope: 'orders.create',
      requestKey: idempotencyKey,
      actorType: 'user',
      actorKey: session.user.id,
      requestHash: hashRequestPayload(input),
    });
    if (result.state === 'completed') {
      return { response: json(result.record?.response_body || result.record?.responseBody || {}, result.record?.response_status || result.record?.responseStatus || 200, false) };
    }
    return { response: null };
  } catch (error) {
    if (error?.code === 'IDEMPOTENCY_IN_PROGRESS') {
      return { response: errorResponse(409, 'IDEMPOTENCY_IN_PROGRESS', 'Request is already processing') };
    }
    throw error;
  }
}

function errorResponse(status, code, message) {
  return error(status, code, message);
}

async function createPostgresOrder(context, quote, order, payment, input, idempotencyKey = '') {
  await dataStore.orderWrites.createOrder({
    orderId: order.id,
    orderNo: order.orderNo,
    userId: order.userId,
    companionId: order.companionId,
    postId: order.postId,
    activityPricingId: order.activityId,
    availabilitySlotId: order.slotId,
    city: input.city || context.post.city || context.companion.baseCity || '',
    placeName: order.place,
    placeAddress: order.placeAddress || null,
    activityName: order.activityName,
    durationMinutes: order.durationMinutes,
    startAt: order.startAt,
    endAt: order.endAt,
    baseAmountCents: quote.baseAmountCents,
    extraAmountCents: quote.extraAmountCents,
    totalAmountCents: quote.totalAmountCents,
    platformFeeCents: quote.platformFeeCents,
    companionIncomeCents: quote.companionIncomeCents,
    userNote: order.userNote || null,
    paymentId: payment.id,
    paymentNo: payment.paymentNo,
    paymentChannel: payment.channel,
    lockedUntil: payment.expiresAt,
    statusLogId: postgresId(),
    operatorType: 'user',
    statusReason: 'Order created and slot locked',
    extras: (quote.addOns || []).map((extra) => ({
      id: postgresId(),
      extraId: extra.extraId,
      name: extra.name,
      quantity: extra.quantity,
      unitPriceCents: extra.unitPriceCents,
      amountCents: extra.amountCents,
    })),
  });

  const responseBody = { ...order, payment: publicPayment(payment) };
  if (idempotencyKey && dataStore.idempotencyWrites?.completeRequest) {
    await completePostgresOrderIdempotency(order, idempotencyKey, responseBody);
  }
  return json(responseBody, 201, false);
}

async function completePostgresOrderIdempotency(order, idempotencyKey, responseBody) {
  try {
    await dataStore.idempotencyWrites.completeRequest({
      scope: 'orders.create',
      requestKey: idempotencyKey,
      actorType: 'user',
      actorKey: order.userId,
      status: 'completed',
      responseStatus: 201,
      responseBody,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[idempotency] Failed to complete order idempotency key: ${message}`);
  }
}

async function mockPaymentSuccess(store, path) {
  if (!isTestRoleSwitchAllowed()) return error(403, 'MOCK_PAYMENT_DISABLED', 'Mock payment success is disabled in this environment');
  const publicSession = requirePublicSession(store, 'consumer', 'payment');
  if (publicSession.response) return publicSession.response;

  const paymentId = path.split('/')[3];
  const payment = store.payments.find((item) => item.id === paymentId || item.paymentId === paymentId);
  if (!payment) return error(404, 'NOT_FOUND', 'Payment not found');
  const order = store.orders.find((item) => item.id === payment.orderId);
  if (!order) return error(404, 'NOT_FOUND', 'Order not found');
  const access = requireOrderAccess(store, order, publicSession.session, publicSession.session.role, 'Payment is not accessible for current role');
  if (access.response) return access.response;
  if (payment.status === 'closed') return error(409, 'PAYMENT_CLOSED', 'Payment has expired or closed');
  if (payment.status === 'paid') {
    return json({ payment: publicPayment(payment), order: viewOrder(order) });
  }
  if (order.status !== 'pending_payment') return error(409, 'ORDER_STATUS_INVALID', 'Order is not pending payment');

  if (dataStore.kind !== 'json' && dataStore.orderWrites?.markPaymentPaid) {
    return markPostgresPaymentPaid(order, payment);
  }

  payment.status = 'paid';
  payment.paidAt = now();
  Object.assign(order, viewOrder({ ...order, status: 'paid_pending_confirm', paidAt: now() }));
  order.statusLogs = [...(order.statusLogs || []), statusLog('paid_pending_confirm', 'Mock payment succeeded')];

  const companion = store.companions.find((item) => item.id === order.companionId);
  const slot = companion?.slots.find((item) => item.id === order.slotId);
  if (slot) markSlotBooked(companion.id, slot, order.id);
  store.conversations[order.id] ||= createConversation(order);

  return json({ payment: publicPayment(payment), order: viewOrder(order), conversation: store.conversations[order.id] }, 200, true);
}

async function markPostgresPaymentPaid(order, payment) {
  const paidAt = now();
  const result = await dataStore.orderWrites.markPaymentPaid({
    paymentId: payment.id,
    conversationId: postgresId(),
    statusLogId: postgresId(),
    paidAt,
    thirdPartyTradeNo: `mock-${payment.paymentNo || payment.id}`,
    rawCallback: { source: 'mock-success' },
    operatorType: 'system',
    statusReason: 'Mock payment succeeded',
  });

  const paidPayment = { ...payment, status: 'paid', paidAt };
  const paidOrder = viewOrder({
    ...order,
    status: 'paid_pending_confirm',
    paidAt,
    statusLogs: [...(order.statusLogs || []), statusLog('paid_pending_confirm', 'Mock payment succeeded')],
  });
  const paidConversation = {
    ...createConversation(paidOrder),
    id: String(result.conversation?.id || `conversation-${paidOrder.id}`),
    status: result.conversation?.status || 'active',
  };
  return json(
    {
      payment: publicPayment(paidPayment),
      order: paidOrder,
      conversation: paidConversation,
    },
    200,
    false,
  );
}

function listOrders(store, url) {
  const publicSession = requirePublicSession(store, 'consumer', 'orders_api');
  if (publicSession.response) return publicSession.response;
  const { session } = publicSession;

  const role = normalize(url.searchParams.get('role') || session.role || 'user');
  const status = normalize(url.searchParams.get('status'));
  const items = store.orders
    .filter((order) => !status || normalize(order.status) === status)
    .filter((order) => canAccessOrder(store, order, session, role))
    .map(viewOrder);
  return json({ items });
}

async function getPaymentStatus(store, path) {
  const publicSession = requirePublicSession(store, 'consumer', 'payment');
  if (publicSession.response) return publicSession.response;
  const { session } = publicSession;

  const payment = findPayment(store, path.split('/')[3]);
  if (!payment) return error(404, 'NOT_FOUND', 'Payment not found');

  const access = requireOrderAccess(store, payment.orderId, session, session.role, 'Payment is not accessible for current role');
  if (access.response) return access.response;
  const { order } = access;

  let refreshed = false;
  if (dataStore.kind === 'json') {
    try {
      refreshed = await refreshWechatPaymentStatus(store, payment);
    } catch (paymentQueryError) {
      payment.lastQueryError = paymentQueryError instanceof Error ? paymentQueryError.message : 'Payment status query failed';
      payment.lastQueriedAt = now();
      refreshed = true;
    }
  }
  return json(
    {
      payment: publicPayment(payment),
      order: viewOrder(order),
      conversation: store.conversations[order.id] || null,
    },
    200,
    refreshed,
  );
}

async function transitionOrder(store, path, action, body = {}) {
  const publicSession = requirePublicSession(store, 'consumer', 'order');
  if (publicSession.response) return publicSession.response;
  const { session } = publicSession;

  const access = requireOrderMutationAccess(store, path.split('/')[3], session, action);
  if (access.response) return access.response;
  const { order } = access;
  const idempotencyKey = normalizeOrderIdempotencyKey(body.idempotencyKey || body.clientRequestId);
  const replay = await findPostgresOrderActionIdempotency(session, order, action, idempotencyKey);
  if (replay.response) return replay.response;

  if (action === 'confirm') {
    if (order.status !== 'paid_pending_confirm') return error(409, 'ORDER_STATUS_INVALID', 'Order cannot be confirmed');
    if (dataStore.kind !== 'json' && dataStore.orderWrites?.transitionOrder) {
      const idempotency = await beginPostgresOrderActionIdempotency(session, order, action, idempotencyKey, body);
      if (idempotency.response) return idempotency.response;
      return transitionPostgresOrder(order, action, session, 'Companion confirmed order', idempotencyKey);
    }
    return updateOrder(store, order, 'confirmed', 'Companion confirmed order');
  }

  if (action === 'complete') {
    if (!['confirmed', 'in_service'].includes(order.status)) return error(409, 'ORDER_STATUS_INVALID', 'Order cannot be completed');
    if (dataStore.kind !== 'json' && dataStore.orderWrites?.transitionOrder) {
      const idempotency = await beginPostgresOrderActionIdempotency(session, order, action, idempotencyKey, body);
      if (idempotency.response) return idempotency.response;
      return transitionPostgresOrder(order, action, session, 'Order completed', idempotencyKey);
    }
    const result = updateOrder(store, order, 'completed', 'Order completed');
    createSettlement(store, order);
    return result;
  }

  if (action === 'cancel') {
    if (['completed', 'refunded'].includes(order.status)) return error(409, 'ORDER_STATUS_INVALID', 'Order cannot be cancelled');
    if (dataStore.kind !== 'json' && dataStore.orderWrites?.transitionOrder) {
      const idempotency = await beginPostgresOrderActionIdempotency(session, order, action, idempotencyKey, body);
      if (idempotency.response) return idempotency.response;
      return transitionPostgresOrder(order, action, session, body.reason || 'Order cancelled', idempotencyKey);
    }
    return cancelOrder(store, order, session, body);
  }

  return error(400, 'VALIDATION_ERROR', 'Unknown action');
}

async function findPostgresOrderActionIdempotency(session, order, action, idempotencyKey) {
  if (!(dataStore.kind !== 'json' && idempotencyKey && dataStore.idempotencyWrites?.findRequest)) return { response: null };
  const actor = idempotencyActorForSession(session);
  const record = await dataStore.idempotencyWrites.findRequest({
    scope: orderActionIdempotencyScope(action),
    requestKey: idempotencyKey,
    actorType: actor.actorType,
    actorKey: actor.actorKey,
  });
  if (record?.status !== 'completed') return { response: null };
  return { response: json(record.response_body || record.responseBody || {}, record.response_status || record.responseStatus || 200, false) };
}

async function beginPostgresOrderActionIdempotency(session, order, action, idempotencyKey, body = {}) {
  if (!(dataStore.kind !== 'json' && idempotencyKey && dataStore.idempotencyWrites?.beginRequest)) return { response: null };
  const actor = idempotencyActorForSession(session);
  try {
    const result = await dataStore.idempotencyWrites.beginRequest({
      idempotencyId: postgresId(),
      scope: orderActionIdempotencyScope(action),
      requestKey: idempotencyKey,
      actorType: actor.actorType,
      actorKey: actor.actorKey,
      requestHash: hashRequestPayload({ orderId: order.id, action, body }),
    });
    if (result.state === 'completed') {
      return { response: json(result.record?.response_body || result.record?.responseBody || {}, result.record?.response_status || result.record?.responseStatus || 200, false) };
    }
    return { response: null };
  } catch (error) {
    if (error?.code === 'IDEMPOTENCY_IN_PROGRESS') {
      return { response: errorResponse(409, 'IDEMPOTENCY_IN_PROGRESS', 'Request is already processing') };
    }
    throw error;
  }
}

async function completePostgresOrderActionIdempotency(session, action, idempotencyKey, responseBody) {
  if (!(idempotencyKey && dataStore.idempotencyWrites?.completeRequest)) return;
  const actor = idempotencyActorForSession(session);
  try {
    await dataStore.idempotencyWrites.completeRequest({
      scope: orderActionIdempotencyScope(action),
      requestKey: idempotencyKey,
      actorType: actor.actorType,
      actorKey: actor.actorKey,
      status: 'completed',
      responseStatus: 200,
      responseBody,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[idempotency] Failed to complete order action idempotency key: ${message}`);
  }
}

function orderActionIdempotencyScope(action) {
  return `orders.${action}`;
}

function idempotencyActorForSession(session) {
  return {
    actorType: session.role === 'companion' ? 'companion' : 'user',
    actorKey: session.user?.id || session.companionId || '',
  };
}

async function transitionPostgresOrder(order, action, session, reason, idempotencyKey = '') {
  const occurredAt = now();
  const draft = {
    orderId: order.id,
    action,
    statusLogId: postgresId(),
    operatorType: session.role === 'companion' ? 'companion' : 'user',
    operatorId: session.user?.id || null,
    reason,
    occurredAt,
  };

  if (action === 'complete') {
    draft.settlementId = postgresId();
    draft.ledgerEntryId = postgresId();
    draft.settleAfter = occurredAt;
  }

  if (action === 'cancel' && order.status !== 'pending_payment') {
    draft.expectRefund = true;
    draft.refundId = postgresId();
    draft.refundNo = refundNo();
  }

  const result = await dataStore.orderWrites.transitionOrder(draft);
  const nextOrder = viewOrder({
    ...order,
    status: result.toStatus || order.status,
    statusLogs: [...(order.statusLogs || []), statusLog(result.toStatus || order.status, reason)],
  });
  await completePostgresOrderActionIdempotency(session, action, idempotencyKey, nextOrder);
  return json(nextOrder, 200, false);
}

function setOrderStatus(store, path, status) {
  const admin = requireAdminSession(store);
  if (admin.response) return admin.response;

  const order = findOrder(store, path.split('/')[3]);
  if (!order) return error(404, 'NOT_FOUND', 'Order not found');
  if (!orderStatusText[status]) return error(400, 'VALIDATION_ERROR', 'Unknown order status');
  const result = updateOrder(store, order, status, 'Manual status update');
  if (status === 'completed') createSettlement(store, order);
  return result;
}

async function setAdminOrderStatus(store, path, status) {
  const admin = requireAdminSession(store);
  if (admin.response) return admin.response;

  const order = findOrder(store, path.split('/')[4]);
  if (!order) return error(404, 'NOT_FOUND', 'Order not found');
  if (!orderStatusText[status]) return error(400, 'VALIDATION_ERROR', 'Unknown order status');
  if (dataStore.kind !== 'json' && dataStore.orderWrites?.setAdminOrderStatus) {
    const result = await setPostgresAdminOrderStatus(order, status, admin.session);
    recordAdminAction(store, admin.session, 'order_status_update', 'order', order.id, {
      note: `Order status set to ${status}`,
      beforeData: { status: order.status },
      afterData: { status },
    });
    return result;
  }
  const result = updateOrder(store, order, status, 'Manual admin status update');
  if (status === 'completed') createSettlement(store, order);
  recordAdminAction(store, admin.session, 'order_status_update', 'order', order.id, {
    note: `Order status set to ${status}`,
  });
  return result;
}

async function setPostgresAdminOrderStatus(order, status, adminSession) {
  const occurredAt = now();
  const draft = {
    orderId: order.id,
    status,
    statusLogId: postgresId(),
    adminId: adminSession.user?.id || null,
    reason: 'Manual admin status update',
    occurredAt,
  };

  if (status === 'completed') {
    draft.settlementId = postgresId();
    draft.ledgerEntryId = postgresId();
    draft.settleAfter = occurredAt;
  }

  const result = await dataStore.orderWrites.setAdminOrderStatus(draft);
  const nextOrder = viewOrder({
    ...order,
    status: result.toStatus || status,
    statusLogs: [...(order.statusLogs || []), statusLog(result.toStatus || status, 'Manual admin status update')],
  });
  return json(nextOrder, 200, false);
}

function updateOrder(store, order, status, reason) {
  Object.assign(order, viewOrder({ ...order, status }));
  order.statusLogs = [...(order.statusLogs || []), statusLog(status, reason)];
  return json(viewOrder(order), 200, true);
}

function cancelOrder(store, order, session, body = {}) {
  if (['completed', 'refunded'].includes(order.status)) return error(409, 'ORDER_STATUS_INVALID', 'Order cannot be cancelled');

  const reason = body.reason || 'Order cancelled';
  const nextStatus = order.status === 'pending_payment' ? 'cancelled' : 'refunding';
  const actor = cancellationActorForSession(session);
  const settlement = calculateCancellationSnapshot(order, actor, reason);

  releaseSlot(store, order);
  if (order.status === 'pending_payment') closePaymentForOrder(store, order, reason);
  Object.assign(order, settlement);

  const result = updateOrder(store, order, nextStatus, reason);
  if (nextStatus === 'refunding') createRefund(store, order, reason);
  return result;
}

function getConversation(store, path) {
  const publicSession = requirePublicSession(store, 'consumer', 'conversation');
  if (publicSession.response) return publicSession.response;
  const { session } = publicSession;

  const access = requireOrderAccess(store, path.split('/')[3], session);
  if (access.response) return access.response;
  const { order } = access;
  if (!canOpenConversation(order)) {
    return error(409, 'ORDER_STATUS_INVALID', 'Conversation opens after payment');
  }
  if (dataStore.kind !== 'json') {
    const conversation = store.conversations[order.id];
    if (!conversation) return error(404, 'CONVERSATION_NOT_FOUND', 'Conversation not found for this order');
    return json(conversation);
  }
  store.conversations[order.id] ||= createConversation(order);
  return json(store.conversations[order.id], 200, true);
}

function listConversations(store, url) {
  const publicSession = requirePublicSession(store, 'consumer', 'conversation');
  if (publicSession.response) return publicSession.response;
  const { session } = publicSession;

  const limit = clampNumber(toNumber(url.searchParams.get('limit')) ?? 20, 1, 50);
  const cursor = clampNumber(toNumber(url.searchParams.get('cursor')) ?? 0, 0, Number.MAX_SAFE_INTEGER);
  const source = store.orders
    .filter(
      (order) =>
        canOpenConversation(order) &&
        canAccessOrder(store, order, session, session.role) &&
        (dataStore.kind === 'json' || Boolean(store.conversations[order.id])),
    )
    .sort((left, right) => conversationSortTime(store, right) - conversationSortTime(store, left));
  const items = source.slice(cursor, cursor + limit).map((order) => {
    if (dataStore.kind === 'json') store.conversations[order.id] ||= createConversation(order);
    return conversationSummary(store.conversations[order.id]);
  });
  const nextOffset = cursor + items.length;

  return json({
    items,
    nextCursor: nextOffset < source.length ? String(nextOffset) : null,
    hasMore: nextOffset < source.length,
  });
}

async function sendMessage(store, path, body) {
  const publicSession = requirePublicSession(store, 'consumer', 'conversation');
  if (publicSession.response) return publicSession.response;
  const { session } = publicSession;

  const conversationId = path.split('/')[3];
  const conversation = Object.values(store.conversations).find((item) => item.id === conversationId);
  if (!conversation) return error(404, 'NOT_FOUND', 'Conversation not found');
  const access = requireOrderAccess(store, conversation.orderId, session, session.role, 'Conversation is not accessible for current role');
  if (access.response) return access.response;
  const { order } = access;
  if (conversation.status === 'restricted') return error(403, 'FORBIDDEN', 'Conversation is restricted');

  const content = String(body.content || '').trim();
  if (!content) return error(400, 'VALIDATION_ERROR', 'Message content is required');

  const risk = evaluateRisk(content);
  if (dataStore.kind !== 'json' && dataStore.messageWrites?.sendMessage) {
    return sendPostgresMessage(conversation, session, body, content, risk);
  }

  if (risk.shouldBlock) {
    const blockedMessage = {
      id: id('blocked-message'),
      from: body.from || messageSenderRole(session),
      text: content,
      sentAt: now(),
      riskStatus: 'blocked',
    };
    store.messageRiskEvents.unshift({
      id: id('message-risk-event'),
      conversationId,
      orderId: conversation.orderId,
      message: blockedMessage,
      matchedKeywords: risk.hits,
      action: 'block',
      createdAt: now(),
    });
    store.riskCases.unshift(createRiskCase(order, conversation, blockedMessage, risk.hits));
    return {
      status: 422,
      changed: true,
      payload: {
        success: false,
        data: {
          riskStatus: 'blocked',
          matchedKeywords: risk.hits.map((hit) => hit.keyword),
          message: 'For platform safety, please keep communication and payment on PP.',
        },
        error: { code: 'MESSAGE_BLOCKED', message: 'Message contains contact or off-platform payment content' },
      },
    };
  }

  const message = {
    id: id('message'),
    from: body.from || messageSenderRole(session),
    text: content,
    sentAt: now(),
    riskStatus: risk.hits.length ? 'flagged' : 'clean',
  };
  conversation.messages.push(message);

  if (risk.hits.length) {
    store.messageRiskEvents.unshift({
      id: id('message-risk-event'),
      conversationId,
      orderId: conversation.orderId,
      message,
      matchedKeywords: risk.hits,
      action: 'flag',
      createdAt: now(),
    });
  }

  return json(message, 200, true);
}

async function sendPostgresMessage(conversation, session, body, content, risk) {
  const sentAt = now();
  const messageId = postgresId();
  const from = body.from || messageSenderRole(session);
  const result = await dataStore.messageWrites.sendMessage({
    conversationId: conversation.id,
    messageId,
    senderId: session.user?.id,
    senderRole: from,
    content,
    sentAt,
    risk,
    riskEventId: risk.hits.length ? postgresId() : undefined,
  });

  if (result.blocked) {
    return {
      status: 422,
      changed: false,
      payload: {
        success: false,
        data: {
          riskStatus: 'blocked',
          matchedKeywords: risk.hits.map((hit) => hit.keyword),
          message: 'For platform safety, please keep communication and payment on PP.',
        },
        error: { code: 'MESSAGE_BLOCKED', message: 'Message contains contact or off-platform payment content' },
      },
    };
  }

  return json(
    {
      id: messageId,
      from,
      text: content,
      sentAt,
      riskStatus: result.riskStatus || (risk.hits.length ? 'flagged' : 'clean'),
    },
    200,
    false,
  );
}

function canOpenConversation(order) {
  return ['paid_pending_confirm', 'confirmed', 'in_service', 'completed', 'disputed'].includes(order.status);
}

function conversationSummary(conversation) {
  const lastMessage = conversation.messages.at(-1);
  return {
    ...conversation,
    messages: lastMessage ? [lastMessage] : [],
  };
}

function conversationSortTime(store, order) {
  const conversation = store.conversations[order.id];
  const lastMessageAt = conversation?.messages?.at(-1)?.sentAt;
  return toTimestamp(lastMessageAt) ?? toTimestamp(order.createdAt) ?? 0;
}

async function createReport(store, path, body) {
  const publicSession = requirePublicSession(store, 'consumer', 'report');
  if (publicSession.response) return publicSession.response;
  const { session } = publicSession;

  const orderId = path.split('/')[3] || body.orderId;
  const access = requireOrderAccess(store, orderId, session);
  if (access.response) return access.response;
  const { order } = access;

  const report = {
    id: dataStore.kind !== 'json' ? postgresId() : id('report'),
    type: 'report_dispute',
    status: 'pending',
    riskLevel: body.riskLevel || 'medium',
    riskLabel: body.category || body.reason || 'Order dispute',
    reporterRole: body.reporterRole || messageSenderRole(session),
    reporterName: session.role === 'companion' ? order.companion : session.user?.nickname || 'User',
    targetName: session.role === 'companion' ? order.userName || 'User' : order.companion,
    reason: body.reason || body.category || 'Order communication report',
    description: body.description || 'A user report was created from the order conversation.',
    evidenceFiles: body.evidenceFiles || [],
    orderId: order.id,
    orderNo: order.orderNo,
    orderTitle: order.title,
    orderStatusText: order.statusText,
    orderAmountText: order.amountText,
    createdAt: now(),
    actionLogs: [],
  };

  if (dataStore.kind !== 'json' && dataStore.moderationWrites?.createReport) {
    return createPostgresReport(store, report, session, body);
  }

  store.reports.unshift(report);
  store.auditCases.unshift({
    id: id('audit-case'),
    targetType: 'report',
    targetId: report.id,
    title: `Report ${report.reason}`,
    status: 'pending',
    createdAt: now(),
    payload: report,
    logs: [],
  });
  return json(report, 201, true);
}

async function createPostgresReport(store, report, session, body) {
  await dataStore.moderationWrites.createReport({
    reportId: report.id,
    auditCaseId: postgresId(),
    reporterId: session.user?.id,
    reportedUserId: body.reportedUserId || null,
    orderId: report.orderId,
    conversationId: store.conversations[report.orderId]?.id || null,
    targetType: body.targetType || 'order',
    targetId: body.targetId || report.orderId,
    category: report.reason,
    description: report.description,
    evidenceFiles: report.evidenceFiles,
    riskLevel: report.riskLevel,
  });
  return json(report, 201, false);
}

function companionDashboard(store) {
  const companion = requireCompanionSession(store);
  if (companion.response) return companion.response;

  const completed = store.orders.filter((order) => order.status === 'completed');
  const pending = store.settlements.filter((item) => item.status === 'pending').reduce((sum, item) => sum + item.payableCents, 0);
  return json({
    weeklyEstimatedCents: completed.reduce((sum, order) => sum + order.amountCents, 0),
    pendingCents: pending,
    availableCents: store.wallets[0]?.availableCents || 0,
    orderStats: [
      `Pending confirmation ${store.orders.filter((order) => order.status === 'paid_pending_confirm').length}`,
      `Confirmed ${store.orders.filter((order) => order.status === 'confirmed').length}`,
      `Completed ${completed.length}`,
      `Cancelled ${store.orders.filter((order) => order.status === 'cancelled').length}`,
    ],
  });
}

function saveApplication(store, body) {
  const companion = requireCompanionSession(store);
  if (companion.response) return companion.response;
  if (dataStore.kind !== 'json') {
    return error(501, 'POSTGRES_COMPANION_APPLICATION_NOT_CONNECTED', 'Companion application writes are not connected to PostgreSQL yet');
  }

  store.application = { ...store.application, ...body, submitted: false, reviewStatus: 'draft', updatedAt: now() };
  return json(store.application, 200, true);
}

function submitCompanionReview(store) {
  const companion = requireCompanionSession(store);
  if (companion.response) return companion.response;
  if (dataStore.kind !== 'json') {
    return error(501, 'POSTGRES_COMPANION_APPLICATION_NOT_CONNECTED', 'Companion application review submission is not connected to PostgreSQL yet');
  }

  store.application = { ...store.application, submitted: true, reviewStatus: 'pending_review', updatedAt: now() };
  const existing = store.auditCases.find((item) => item.targetType === 'companion' && item.targetId === 'companion-mori' && item.status === 'pending');
  if (!existing) {
    store.auditCases.unshift({
      id: id('audit-case'),
      targetType: 'companion',
      targetId: 'companion-mori',
      title: 'Companion onboarding review',
      status: 'pending',
      createdAt: now(),
      payload: store.application,
      logs: [],
    });
  }
  return json(store.application, 200, true);
}

function adminDashboard(store) {
  const admin = requireAdminSession(store);
  if (admin.response) return admin.response;

  const pendingCompanions = store.auditCases.filter((item) => item.targetType === 'companion' && item.status === 'pending').length;
  const pendingPosts = store.auditCases.filter((item) => item.targetType === 'post' && item.status === 'pending').length;
  const pendingReports = store.reports.filter((item) => item.status === 'pending').length;
  const gmvCents = store.orders.filter((item) => item.status !== 'cancelled').reduce((sum, item) => sum + item.amountCents, 0);
  const refundCents = store.refunds.reduce((sum, item) => sum + item.amountCents, 0);

  return json({
    metrics: [
      { label: 'Pending companions', value: String(pendingCompanions) },
      { label: 'Pending posts', value: String(pendingPosts) },
      { label: 'Orders', value: String(store.orders.length) },
      { label: 'Risk blocks', value: String(store.riskCases.length) },
      { label: 'GMV', value: formatMoney(gmvCents) },
      { label: 'Refunds', value: formatMoney(refundCents) },
      { label: 'Pending reports', value: String(pendingReports) },
    ],
    moduleCards: [
      { title: 'Message risk', desc: 'Blocked contact exchange and off-platform payment attempts' },
      { title: 'Reports', desc: 'Order disputes and report handling' },
      { title: 'Settlements', desc: 'Pending, frozen, and released companion income' },
    ],
    reviewQueues: {
      companions: store.auditCases.filter((item) => item.targetType === 'companion' && item.status === 'pending'),
      posts: store.auditCases.filter((item) => item.targetType === 'post' && item.status === 'pending'),
    },
    recentOrders: store.orders.slice(0, 5).map(viewOrder),
  });
}

function adminOrders(store, url) {
  const admin = requireAdminSession(store);
  if (admin.response) return admin.response;

  const status = normalize(url.searchParams.get('status'));
  const items = store.orders
    .filter((order) => !status || normalize(order.status) === status)
    .map(viewOrder);
  return json({ items });
}

function adminActionLogs(store, url) {
  const admin = requireAdminSession(store);
  if (admin.response) return admin.response;

  const action = normalize(url.searchParams.get('action'));
  const targetType = normalize(url.searchParams.get('targetType'));
  const limit = clampNumber(Number(url.searchParams.get('limit') || 50), 1, 100);
  const items = (store.adminActionLogs || [])
    .filter((item) => !action || normalize(item.action) === action)
    .filter((item) => !targetType || normalize(item.targetType) === targetType)
    .slice(0, limit);
  return json({ items });
}

function adminSecurityEvents(store, url) {
  const admin = requireAdminSession(store);
  if (admin.response) return admin.response;

  const type = normalize(url.searchParams.get('type'));
  const targetType = normalize(url.searchParams.get('targetType'));
  const limit = clampNumber(Number(url.searchParams.get('limit') || 50), 1, 100);
  const items = (store.securityEvents || [])
    .filter((item) => !type || normalize(item.type) === type)
    .filter((item) => !targetType || normalize(item.targetType) === targetType)
    .slice(0, limit);
  return json({ items });
}

function adminModeration(store) {
  const admin = requireAdminSession(store);
  if (admin.response) return admin.response;

  return json({
    messageCases: store.riskCases,
    reportCases: store.reports,
  });
}

function listAuditCases(store, url) {
  const admin = requireAdminSession(store);
  if (admin.response) return admin.response;

  const targetType = normalize(url.searchParams.get('targetType'));
  const status = normalize(url.searchParams.get('status'));
  const items = store.auditCases
    .filter((item) => !targetType || normalize(item.targetType) === targetType)
    .filter((item) => !status || normalize(item.status) === status);
  return json({ items });
}

async function reviewAuditCase(store, path, nextStatus, body = {}) {
  const admin = requireAdminSession(store);
  if (admin.response) return admin.response;

  const caseId = path.split('/')[4];
  const auditCase = store.auditCases.find((item) => item.id === caseId);
  if (!auditCase) return error(404, 'NOT_FOUND', 'Audit case not found');
  if (auditCase.status !== 'pending') return error(409, 'AUDIT_CASE_NOT_PENDING', 'Audit case is not pending');
  if (dataStore.kind !== 'json' && dataStore.moderationWrites?.reviewAuditCase) {
    return reviewPostgresAuditCase(auditCase, nextStatus, body, admin.session);
  }

  const beforeAuditCase = { status: auditCase.status, targetType: auditCase.targetType, targetId: auditCase.targetId };
  auditCase.status = nextStatus;
  auditCase.resolvedAt = now();
  recordAuditLog(store, auditCase, nextStatus, admin.session, body.reason || nextStatus, {
    targetType: auditCase.targetType,
    targetId: auditCase.targetId,
  });

  if (auditCase.targetType === 'companion') {
    const companion = store.companions.find((item) => item.id === auditCase.targetId);
    if (companion) {
      companion.status = nextStatus === 'approved' ? 'approved' : 'needs_change';
      companion.serviceEnabled = nextStatus === 'approved';
    }
  }

  if (auditCase.targetType === 'post') {
    const post = store.posts.find((item) => item.id === auditCase.targetId);
    if (post) {
      post.status = nextStatus === 'approved' ? 'approved' : 'rejected';
      post.isFeedVisible = nextStatus === 'approved';
      if (nextStatus === 'approved') post.publishedAt = now();
    }
  }

  if (auditCase.targetType === 'report') {
    const report = store.reports.find((item) => item.id === auditCase.targetId);
    if (report) report.status = nextStatus === 'approved' ? 'resolved' : 'rejected';
  }

  recordAdminAction(store, admin.session, `audit_${nextStatus}`, auditCase.targetType, auditCase.targetId, {
    note: body.reason || nextStatus,
    beforeData: beforeAuditCase,
    afterData: { status: auditCase.status, targetType: auditCase.targetType, targetId: auditCase.targetId },
  });

  return json({ ok: true, auditCase }, 200, true);
}

async function reviewPostgresAuditCase(auditCase, nextStatus, body, adminSession) {
  const reviewedAt = now();
  const note = body.reason || nextStatus;
  await dataStore.moderationWrites.reviewAuditCase({
    caseId: auditCase.id,
    nextStatus,
    auditLogId: postgresId(),
    adminActionLogId: postgresId(),
    adminId: adminSession.user?.id || null,
    note,
    reviewedAt,
  });

  const reviewedCase = {
    ...auditCase,
    status: nextStatus,
    resolvedAt: reviewedAt,
    logs: [
      {
        id: id('audit-log-view'),
        action: nextStatus,
        note,
        operatorType: 'admin',
        createdAt: reviewedAt,
      },
      ...(auditCase.logs || []),
    ],
  };
  return json({ ok: true, auditCase: reviewedCase }, 200, false);
}

async function applyModerationAction(store, path, body) {
  const admin = requireAdminSession(store);
  if (admin.response) return admin.response;

  const caseId = path.split('/')[4];
  const actionType = body.actionType || 'confirm_violation';
  const log = {
    id: id('action'),
    type: actionType,
    label: actionLabel(actionType),
    note: body.note || actionLabel(actionType),
    createdAt: now(),
  };

  if (dataStore.kind !== 'json' && dataStore.moderationWrites?.applyAction) {
    return applyPostgresModerationAction(store, caseId, actionType, log, admin.session);
  }

  const riskCase = store.riskCases.find((item) => item.id === caseId);
  if (riskCase) {
    const beforeData = { status: riskCase.status, orderId: riskCase.orderId };
    riskCase.status = nextMessageCaseStatus(actionType, riskCase.status);
    riskCase.actionLogs = [log, ...(riskCase.actionLogs || [])];
    applyModerationSideEffect(store, riskCase.orderId, actionType);
    recordAdminAction(store, admin.session, actionType, 'message_risk_event', riskCase.id, {
      note: log.note,
      beforeData,
      afterData: { status: riskCase.status, orderId: riskCase.orderId, actionType },
    });
    return json(riskCase, 200, true);
  }

  const reportCase = store.reports.find((item) => item.id === caseId);
  if (reportCase) {
    const beforeData = { status: reportCase.status, orderId: reportCase.orderId };
    reportCase.status = nextReportCaseStatus(actionType, reportCase.status);
    reportCase.actionLogs = [log, ...(reportCase.actionLogs || [])];
    applyModerationSideEffect(store, reportCase.orderId, actionType);
    recordAdminAction(store, admin.session, actionType, 'report', reportCase.id, {
      note: log.note,
      beforeData,
      afterData: { status: reportCase.status, orderId: reportCase.orderId, actionType },
    });
    return json(reportCase, 200, true);
  }

  return error(404, 'NOT_FOUND', 'Moderation case not found');
}

async function applyPostgresModerationAction(store, caseId, actionType, log, adminSession) {
  const riskCase = store.riskCases.find((item) => item.id === caseId);
  const reportCase = store.reports.find((item) => item.id === caseId);
  const targetCase = riskCase || reportCase;
  if (!targetCase) return error(404, 'NOT_FOUND', 'Moderation case not found');

  await dataStore.moderationWrites.applyAction({
    caseId,
    actionType,
    adminActionLogId: postgresId(),
    adminId: adminSession.user?.id || adminSession.adminId || null,
    note: log.note,
    reviewedAt: log.createdAt,
  });

  if (riskCase) {
    return json(
      {
        ...riskCase,
        status: nextMessageCaseStatus(actionType, riskCase.status),
        actionLogs: [log, ...(riskCase.actionLogs || [])],
      },
      200,
      false,
    );
  }

  return json(
    {
      ...reportCase,
      status: nextReportCaseStatus(actionType, reportCase.status),
      actionLogs: [log, ...(reportCase.actionLogs || [])],
    },
    200,
    false,
  );
}

function applyModerationSideEffect(store, orderId, actionType) {
  const order = findOrder(store, orderId);
  if (!order) return;
  if (actionType === 'freeze_order') {
    Object.assign(order, viewOrder({ ...order, status: 'disputed' }));
    order.statusLogs = [...(order.statusLogs || []), statusLog('disputed', 'Order frozen by moderation')];
  }
  if (actionType === 'restrict_chat') {
    const conversation = store.conversations[orderId];
    if (conversation) conversation.status = 'restricted';
  }
}

function resolveOrderContext(store, input) {
  const post = store.posts.find((item) => item.id === input.postId) || store.posts.find((item) => item.companion.id === input.companionId);
  const companion = store.companions.find((item) => item.id === input.companionId) || post?.companion;
  if (!post || !companion) return { error: error(404, 'NOT_FOUND', 'Post or companion not found') };

  const slot = companion.slots.find((item) => item.id === input.slotId);
  const activity = companion.activities.find((item) => item.id === (input.activityPricingId || input.activityId));
  if (!slot || !activity) return { error: error(404, 'NOT_FOUND', 'Slot or activity not found') };

  return { post, companion, slot, activity };
}

function buildQuote(context, input) {
  const extrasInput = Array.isArray(input.extras) ? input.extras : Array.isArray(input.addOns) ? input.addOns : [];
  const addOns = extrasInput
    .map((line) => {
      const extraId = line.extraId || line.id;
      const extra = context.companion.extras.find((item) => item.id === extraId);
      if (!extra) return null;
      const quantity = Math.max(1, Number(line.quantity || 1));
      return {
        extraId: extra.id,
        name: extra.name,
        unitLabel: extra.unitLabel,
        quantity,
        unitPriceCents: extra.priceCents,
        amountCents: extra.priceCents * quantity,
      };
    })
    .filter(Boolean);
  const baseAmountCents = context.activity.priceCents;
  const extraAmountCents = addOns.reduce((sum, item) => sum + item.amountCents, 0);
  const totalAmountCents = baseAmountCents + extraAmountCents;
  const platformFeeCents = Math.round(totalAmountCents * platformFeeRate);
  const companionIncomeCents = totalAmountCents - platformFeeCents;
  return {
    baseAmountCents,
    extraAmountCents,
    totalAmountCents,
    platformFeeCents,
    companionIncomeCents,
    addOns,
    lines: [
      { label: `${context.activity.name} - ${context.activity.durationLabel}`, amountText: formatMoney(baseAmountCents) },
      ...addOns.map((item) => ({ label: `${item.name} x ${item.quantity}`, amountText: formatMoney(item.amountCents) })),
    ],
  };
}

function createSettlement(store, order) {
  if (store.settlements.some((item) => item.orderId === order.id)) return;
  const commissionCents = order.quote?.platformFeeCents ?? Math.round(order.amountCents * platformFeeRate);
  const payableCents = order.amountCents - commissionCents;
  const settlement = {
    id: id('settlement'),
    orderId: order.id,
    orderNo: order.orderNo,
    companionId: order.companionId,
    grossCents: order.amountCents,
    commissionCents,
    payableCents,
    status: 'pending',
    settleAfter: now(),
    createdAt: now(),
  };
  store.settlements.unshift(settlement);
  const wallet = ensureWallet(store, order.companionId);
  wallet.pendingCents += payableCents;
  store.ledgerEntries.unshift({
    id: id('ledger'),
    companionId: order.companionId,
    orderId: order.id,
    entryType: 'order_income',
    amountCents: payableCents,
    createdAt: now(),
  });
}

function createRefund(store, order, reason) {
  if (store.refunds.some((item) => item.orderId === order.id)) return;
  store.refunds.unshift({
    id: id('refund'),
    orderId: order.id,
    orderNo: order.orderNo,
    amountCents: order.refundToCreatorCents ?? order.amountCents,
    penaltyCents: order.cancellationPenaltyCents || 0,
    platformFeeCents: order.platformFeeCents || 0,
    compensationToCounterpartyCents: order.compensationToCounterpartyCents || 0,
    reason,
    status: 'pending',
    createdAt: now(),
  });
}

function calculateCancellationSnapshot(order, actor, reason) {
  const phase = cancellationPhaseForOrder(order);
  const paidCents = getPaidCentsForCancellation(order, phase);
  const platformFeeCents = ['confirmed_before_balance', 'full_escrowed', 'completed'].includes(phase) ? Math.round(paidCents * platformFeeRate) : 0;
  let penaltyCents = 0;
  let compensationToCounterpartyCents = 0;
  let refundToCreatorCents = paidCents;

  if (phase === 'confirmed_before_balance') {
    if (actor === 'creator') {
      penaltyCents = Math.min(paidCents, Math.round(order.amountCents * 0.15));
      refundToCreatorCents = Math.max(0, paidCents - penaltyCents);
      compensationToCounterpartyCents = Math.max(0, penaltyCents - platformFeeCents);
    } else if (actor === 'photographer') {
      compensationToCounterpartyCents = Math.round(order.amountCents * 0.1);
      refundToCreatorCents = paidCents + compensationToCounterpartyCents;
    }
  } else if (phase === 'full_escrowed') {
    if (actor === 'creator') {
      penaltyCents = Math.min(paidCents, Math.max(order.depositCents || 0, Math.round(order.amountCents * 0.25)));
      refundToCreatorCents = Math.max(0, paidCents - penaltyCents);
      compensationToCounterpartyCents = Math.max(0, penaltyCents - platformFeeCents);
    } else if (actor === 'photographer') {
      compensationToCounterpartyCents = Math.round(order.amountCents * 0.2);
      refundToCreatorCents = paidCents + compensationToCounterpartyCents;
    }
  }

  if (actor === 'admin') {
    penaltyCents = 0;
    compensationToCounterpartyCents = 0;
    refundToCreatorCents = paidCents;
  }

  return {
    cancellationActor: actor,
    cancellationPhase: phase,
    cancellationReason: reason,
    cancellationPenaltyCents: penaltyCents,
    refundToCreatorCents,
    compensationToCounterpartyCents,
    platformFeeCents,
    cancellationSummary: buildCancellationSummary({
      actor,
      phase,
      paidCents,
      penaltyCents,
      refundToCreatorCents,
      compensationToCounterpartyCents,
      platformFeeCents,
    }),
    cancelledAt: now(),
    depositStatus: paidCents > 0 ? (penaltyCents >= paidCents ? 'forfeited' : 'refunded') : 'unpaid',
    balanceStatus: paidCents > 0 ? 'refunded' : 'unpaid',
    fundsStatus: paidCents > 0 ? 'refunded' : 'none',
    settlementStatus: 'cancelled',
  };
}

function cancellationActorForSession(session) {
  if (session.role === 'companion') return 'photographer';
  if (session.role === 'admin') return 'admin';
  return 'creator';
}

function cancellationPhaseForOrder(order) {
  if (order.status === 'pending_payment') return 'pending_payment';
  if (order.status === 'paid_pending_confirm') return 'paid_pending_confirm';
  if (order.fundsStatus === 'full_escrowed' || order.balanceStatus === 'paid') return 'full_escrowed';
  if (order.status === 'confirmed' || order.status === 'in_service') return 'confirmed_before_balance';
  if (order.status === 'completed') return 'completed';
  return 'other';
}

function getPaidCentsForCancellation(order, phase) {
  if (phase === 'pending_payment') return 0;
  if (order.fundsStatus === 'deposit_escrowed' || order.depositStatus === 'paid') return Math.min(order.amountCents, order.depositCents || order.amountCents);
  if (order.fundsStatus === 'full_escrowed' || order.balanceStatus === 'paid') return order.amountCents;
  if (['paid_pending_confirm', 'confirmed_before_balance', 'full_escrowed', 'completed'].includes(phase)) return order.amountCents;
  return 0;
}

function buildCancellationSummary({
  actor,
  phase,
  paidCents,
  penaltyCents,
  refundToCreatorCents,
  compensationToCounterpartyCents,
  platformFeeCents,
}) {
  const actorText = actor === 'creator' ? 'Client' : actor === 'photographer' ? 'Photographer' : 'Admin';
  const phaseText = {
    pending_payment: 'pending payment',
    paid_pending_confirm: 'paid before photographer confirmation',
    confirmed_before_balance: 'confirmed before balance settlement',
    full_escrowed: 'fully escrowed',
    completed: 'completed',
    other: 'other',
  }[phase] || phase;

  return `${actorText} cancelled during ${phaseText}; paid ${formatMoney(paidCents)}, penalty ${formatMoney(penaltyCents)}, refund ${formatMoney(refundToCreatorCents)}, compensation ${formatMoney(compensationToCounterpartyCents)}, platform fee ${formatMoney(platformFeeCents)}.`;
}

function releaseSlot(store, order) {
  const companion = store.companions.find((item) => item.id === order.companionId);
  const slot = companion?.slots.find((item) => item.id === order.slotId);
  if (!slot) return;
  releaseSlotReservation(companion.id, slot, order.id);
}

function expirePendingPaymentOrders(store) {
  let changed = false;
  const currentTime = Date.now();

  for (const order of store.orders) {
    if (order.status !== 'pending_payment') continue;
    const payment = store.payments.find((item) => item.orderId === order.id);
    if (payment?.status === 'paid') continue;
    const expiresAtMs = getPendingPaymentExpiresAt(order, payment);
    if (!expiresAtMs || expiresAtMs > currentTime) continue;

    releaseSlot(store, order);
    payment && closeExpiredPayment(payment);
    const settlement = calculateCancellationSnapshot(order, 'admin', 'Payment window expired');
    Object.assign(
      order,
      viewOrder({
        ...order,
        ...settlement,
        status: 'cancelled',
        cancelReason: 'Payment window expired',
      }),
    );
    order.statusLogs = [...(order.statusLogs || []), statusLog('cancelled', 'Payment window expired; slot released')];
    changed = true;
  }

  return changed;
}

async function expirePostgresPendingPaymentOrders() {
  await runPendingPaymentExpiryJob({
    dataStore,
    occurredAt: now(),
    reason: 'Payment window expired',
    limit: 100,
  });
}

function getPendingPaymentExpiresAt(order, payment) {
  const explicitTime = toTimestamp(order.paymentExpiresAt || payment?.expiresAt);
  if (explicitTime) return explicitTime;
  const createdAtMs = toTimestamp(order.createdAt || payment?.createdAt);
  return createdAtMs ? createdAtMs + pendingPaymentHoldMs : null;
}

function closeExpiredPayment(payment) {
  closePayment(payment, 'Payment window expired');
}

function closePaymentForOrder(store, order, reason) {
  const payment = store.payments.find((item) => item.orderId === order.id);
  if (!payment) return;
  closePayment(payment, reason);
}

function closePayment(payment, reason) {
  if (!payment || payment.status !== 'pending') return;
  payment.status = 'closed';
  payment.closedAt = now();
  payment.closeReason = reason;
}

function reserveSlotForOrder(companionId, slot) {
  const lockKey = slotLockKey(companionId, slot.id);
  if (activeSlotLocks.has(lockKey)) return false;
  if (!isSlotAvailable(slot)) return false;
  activeSlotLocks.add(lockKey);
  return true;
}

function lockReservedSlotForOrder(companionId, slot, orderId, expiresAt) {
  activeSlotLocks.add(slotLockKey(companionId, slot.id));
  slot.status = 'locked';
  slot.lockedOrderId = orderId;
  slot.lockExpiresAt = expiresAt || createPaymentExpiresAt();
}

function markSlotBooked(companionId, slot, orderId) {
  activeSlotLocks.add(slotLockKey(companionId, slot.id));
  slot.status = 'booked';
  slot.lockedOrderId = orderId;
  delete slot.lockExpiresAt;
}

function releaseSlotReservation(companionId, slot, orderId) {
  if (slot.lockedOrderId && orderId && slot.lockedOrderId !== orderId) return;
  activeSlotLocks.delete(slotLockKey(companionId, slot.id));
  slot.status = 'available';
  delete slot.lockedOrderId;
  delete slot.lockExpiresAt;
}

function isSlotAvailable(slot) {
  if (slot.status === 'locked' && slot.lockExpiresAt && new Date(slot.lockExpiresAt).getTime() < Date.now()) {
    slot.status = 'available';
    delete slot.lockedOrderId;
    delete slot.lockExpiresAt;
  }
  return slot.status === 'available';
}

function slotLockKey(companionId, slotId) {
  return `${companionId}:${slotId}`;
}

function createPaymentExpiresAt(baseTime = Date.now()) {
  return new Date(baseTime + pendingPaymentHoldMs).toISOString();
}

function toTimestamp(value) {
  const timestamp = new Date(value || '').getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function createConversation(order) {
  return {
    id: `conversation-${order.id}`,
    orderId: order.id,
    orderNo: order.orderNo,
    userId: order.userId || 'demo-consumer-user',
    companionId: order.companionId,
    status: 'active',
    safetyNotice: 'Keep all communication and payments inside PP for safety.',
    messages: [
      {
        id: `message-${order.id}-welcome`,
        from: 'system',
        text: `Order ${order.orderNo} is paid. Please confirm time, place, and shooting needs here.`,
        sentAt: now(),
        riskStatus: 'clean',
      },
    ],
  };
}

function createRiskCase(order, conversation, blockedMessage, hitWords) {
  return {
    id: id('risk-case'),
    type: 'message_risk',
    status: 'pending',
    riskLevel: 'high',
    riskLabel: 'Blocked message',
    conversationId: conversation.id,
    orderId: conversation.orderId,
    orderNo: conversation.orderNo,
    orderTitle: order?.title || '',
    orderStatusText: order?.statusText || '',
    orderAmountText: order?.amountText || '',
    userName: 'Demo user',
    companionName: order?.companion || '',
    blockedMessage,
    hitWords,
    contextMessages: [...conversation.messages.slice(-5), blockedMessage],
    createdAt: now(),
    actionLogs: [],
  };
}

function matchCompanions(store, url) {
  const lat = toNumber(url.searchParams.get('lat')) ?? 31.2112;
  const lng = toNumber(url.searchParams.get('lng')) ?? 121.4476;
  const city = normalize(url.searchParams.get('city'));
  const activity = normalize(url.searchParams.get('activity'));
  const gender = normalize(url.searchParams.get('gender'));
  const maxDistanceMeters = clampNumber(toNumber(url.searchParams.get('maxDistanceMeters')) ?? 8000, 500, 50000);
  const limit = clampNumber(toNumber(url.searchParams.get('limit')) ?? 20, 1, 50);

  const items = store.companions
    .filter((companion) => companion.status === 'approved' && companion.serviceEnabled)
    .filter((companion) => !city || normalize(companion.baseCity).includes(city))
    .filter((companion) => !gender || gender === 'any' || normalize(companion.gender) === gender)
    .filter((companion) => !activity || companion.activities.some((item) => normalize(item.name).includes(activity)))
    .map((companion) => buildMatchCandidate(companion, lat, lng, maxDistanceMeters))
    .filter(Boolean)
    .sort((a, b) => b.matchScore - a.matchScore || a.distanceMeters - b.distanceMeters)
    .slice(0, limit);

  return json({ items });
}

function buildMatchCandidate(companion, lat, lng, maxDistanceMeters) {
  const nearestServiceArea = companion.serviceAreas
    .map((area) => ({ ...area, distanceMeters: haversineMeters(lat, lng, area.lat, area.lng) }))
    .sort((a, b) => a.distanceMeters - b.distanceMeters)[0];
  if (!nearestServiceArea) return null;

  const acceptedDistance = Math.min(maxDistanceMeters, nearestServiceArea.radiusMeters || maxDistanceMeters);
  if (nearestServiceArea.distanceMeters > acceptedDistance) return null;
  const distanceMeters = Math.round(nearestServiceArea.distanceMeters);
  const distanceRatio = Math.min(distanceMeters / acceptedDistance, 1);
  return {
    companion,
    nearestServiceArea,
    distanceMeters,
    distanceText: distanceMeters < 1000 ? `${distanceMeters}m` : `${(distanceMeters / 1000).toFixed(1)}km`,
    matchScore: clampNumber(100 - distanceRatio * 70 + Math.round((companion.ratingAvg || 0) * 5), 1, 100),
  };
}

function evaluateRisk(content) {
  const original = String(content || '').toLowerCase();
  const compact = original.normalize('NFKC').replace(/[\s\p{P}\p{S}_]+/gu, '');
  const hits = riskKeywords.filter((item) => original.includes(item.keyword.toLowerCase()) || compact.includes(item.keyword.toLowerCase()));
  return { hits, shouldBlock: hits.length > 0 };
}

function normalizeStore(store) {
  let changed = false;
  const next = { ...initialStore(), ...store };
  next.meta = { ...(store.meta || {}), version: 3 };
  next.companions = Array.isArray(store.companions) && store.companions.length ? store.companions : initialStore().companions;
  next.posts = Array.isArray(store.posts) && store.posts.length ? store.posts : initialStore().posts;
  next.users = Array.isArray(store.users) ? store.users : [];
  next.activeSession = null;
  next.sessions = Array.isArray(store.sessions) ? store.sessions : [];
  next.orders = Array.isArray(store.orders) ? store.orders : [];
  next.payments = Array.isArray(store.payments) ? store.payments : [];
  next.conversations = store.conversations && typeof store.conversations === 'object' ? store.conversations : {};
  next.riskCases = Array.isArray(store.riskCases) ? store.riskCases : [];
  next.messageRiskEvents = Array.isArray(store.messageRiskEvents) ? store.messageRiskEvents : [];
  next.reports = Array.isArray(store.reports) ? store.reports : [];
  next.auditCases = Array.isArray(store.auditCases) ? store.auditCases : seedAuditCases(next);
  next.auditLogs = Array.isArray(store.auditLogs) ? store.auditLogs : [];
  next.adminActionLogs = Array.isArray(store.adminActionLogs) ? store.adminActionLogs : [];
  next.securityEvents = Array.isArray(store.securityEvents) ? store.securityEvents : [];
  next.settlements = Array.isArray(store.settlements) ? store.settlements : [];
  next.ledgerEntries = Array.isArray(store.ledgerEntries) ? store.ledgerEntries : [];
  next.refunds = Array.isArray(store.refunds) ? store.refunds : [];
  next.wallets = Array.isArray(store.wallets) ? store.wallets : [];
  next.application = store.application || { reviewStatus: 'draft', updatedAt: now() };
  next.workDraft = store.workDraft || { reviewStatus: 'draft', updatedAt: now() };

  if (seedVirtualData(next)) changed = true;
  if (seedVirtualTradeData(next)) changed = true;
  normalizeCompanions(next);
  normalizePosts(next);
  normalizeOrders(next);
  if (!next.auditCases.length) next.auditCases = seedAuditCases(next);

  changed = changed || store.meta?.version !== 3 || !Array.isArray(store.auditCases);
  return { store: next, changed };
}

function initialStore() {
  const companion = {
    id: 'companion-mori',
    userId: 'user-mori',
    name: 'Mori',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80',
    photo: 'https://images.unsplash.com/photo-1495385794356-15371f348c31?auto=format&fit=crop&w=900&q=80',
    bio: 'Gentle citywalk guide who helps first-time users feel natural on camera.',
    gender: 'female',
    baseCity: '上海',
    status: 'approved',
    serviceEnabled: true,
    ratingAvg: 4.9,
    ratingCount: 18,
    tags: ['会指导动作', '轻松聊天', '适合第一次拍照'],
    safetyBadges: ['已实名认证', '视频已审核', '平台担保'],
    areas: ['武康路', '安福路', '衡山路', '徐家汇'],
    serviceAreas: [],
    slots: [
      slot('slot-mori-1', '今天 10:00-12:00', '今天', '10:00-12:00', '2026-06-11T02:00:00.000Z', '2026-06-11T04:00:00.000Z'),
      slot('slot-mori-2', '今天 14:00-16:00', '今天', '14:00-16:00', '2026-06-11T06:00:00.000Z', '2026-06-11T08:00:00.000Z'),
    ],
    activities: [activity('activity-citywalk', 'Citywalk', 120, '2小时', 39900), activity('activity-cafe', '探店', 90, '1.5小时', 29900)],
    extras: [extra('extra-retouch', '精修', 'per_photo', '张', 3000), extra('extra-rush', '加急出图', 'per_order', '单', 8000)],
  };
  const post = {
    id: 'post-wukang',
    status: 'approved',
    isFeedVisible: true,
    city: '上海',
    locationName: '武康路',
    location: '上海 · 武康路',
    timeLabel: '今天可拍 / 傍晚 / 2026年6月',
    caption: '黄昏的梧桐树影很温柔，适合边散步边拍松弛感街拍。',
    styleTags: ['Citywalk', '自然光', '松弛感', '今天可拍'],
    activity: 'Citywalk',
    images: [
      { id: 'img-wukang-1', url: 'https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?auto=format&fit=crop&w=900&q=80', width: 900, height: 1200, sortOrder: 1 },
      { id: 'img-wukang-2', url: 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=80', width: 900, height: 1200, sortOrder: 2 },
    ],
    companion,
  };
  const order = viewOrder({
    id: 'order-seed-1',
    orderNo: 'PP26052401',
    status: 'paid_pending_confirm',
    title: 'Citywalk 陪拍',
    time: companion.slots[0].label,
    place: '武康路',
    amountCents: 48900,
    companion: companion.name,
    companionId: companion.id,
    postId: post.id,
    activityId: companion.activities[0].id,
    activityName: companion.activities[0].name,
    slotId: companion.slots[0].id,
    startAt: companion.slots[0].startAt,
    endAt: companion.slots[0].endAt,
    dateLabel: companion.slots[0].dateLabel,
    timeLabel: companion.slots[0].timeLabel,
    durationMinutes: 120,
    durationLabel: '2小时',
    addOns: [{ extraId: 'extra-retouch', name: '精修', unitLabel: '张', quantity: 3, unitPriceCents: 3000, amountCents: 9000 }],
    createdAt: now(),
  });
  return {
    meta: { version: 3, createdAt: now() },
    users: [],
    activeSession: null,
    sessions: [],
    companions: [companion],
    posts: [post],
    orders: [order],
    payments: [],
    conversations: { [order.id]: createConversation(order) },
    riskCases: [],
    messageRiskEvents: [],
    reports: [],
    auditCases: [],
    auditLogs: [],
    adminActionLogs: [],
    securityEvents: [],
    settlements: [],
    ledgerEntries: [],
    refunds: [],
    wallets: [],
    application: { reviewStatus: 'draft', updatedAt: now() },
    workDraft: { reviewStatus: 'draft', updatedAt: now() },
  };
}

const VIRTUAL_LANDSCAPE_INDEXES = new Set([1, 4, 7, 10, 13, 16]);
const VIRTUAL_LANDSCAPE_IMAGES = [
  'https://images.unsplash.com/photo-1500530855697-b586d89ba3ee?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1518005020951-eccb494ad742?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1494526585095-c41746248156?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1519501025264-65ba15a82390?auto=format&fit=crop&w=1200&q=80',
  'https://images.unsplash.com/photo-1511818966892-d7d671e672a2?auto=format&fit=crop&w=1200&q=80',
];

const VIRTUAL_LIVE_VIDEO_URLS = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://media.w3.org/2010/05/sintel/trailer.mp4',
];

function createVirtualPostImages(postId, index, image, secondaryImage, avatar) {
  const isLandscape = VIRTUAL_LANDSCAPE_INDEXES.has(index);
  const isLive = index % 4 === 1 || index % 7 === 0;
  const landscapeImageIndex = Math.floor(index / 3) % VIRTUAL_LANDSCAPE_IMAGES.length;
  const coverUrl = isLandscape ? VIRTUAL_LANDSCAPE_IMAGES[landscapeImageIndex] : image;
  const liveVideoUrl = VIRTUAL_LIVE_VIDEO_URLS[index % VIRTUAL_LIVE_VIDEO_URLS.length];
  return [
    {
      id: `${postId}-image-1`,
      url: coverUrl,
      mediaKind: isLive ? 'live' : 'image',
      videoUrl: isLive ? liveVideoUrl : undefined,
      posterUrl: coverUrl,
      width: isLandscape ? 1200 : 900,
      height: isLandscape ? 800 : 1200,
      sortOrder: 1,
    },
    { id: `${postId}-image-2`, url: secondaryImage || avatar, mediaKind: 'image', width: 900, height: 1200, sortOrder: 2 },
  ];
}

function hasSamePostImages(currentImages = [], nextImages = []) {
  return nextImages.every((nextImage, index) => {
    const currentImage = currentImages[index];
    return (
      currentImage?.url === nextImage.url &&
      currentImage?.width === nextImage.width &&
      currentImage?.height === nextImage.height &&
      currentImage?.mediaKind === nextImage.mediaKind &&
      currentImage?.videoUrl === nextImage.videoUrl &&
      currentImage?.posterUrl === nextImage.posterUrl
    );
  });
}

function seedVirtualData(store) {
  let changed = false;
  const profiles = [
    ['Luna', 'female', '武康路', 'Citywalk', 39900, ['Citywalk', '自然光', '松弛感', '今天可拍'], '温柔沟通，会先帮你确认穿搭和路线，现场以自然走动抓拍为主。', 'https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80', 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=80'],
    ['Aki', 'female', '巨鹿路', '探店', 32900, ['探店', '日常感', '咖啡店', '今天可拍'], '熟悉咖啡店和街角光线，适合轻松日常头像和朋友圈照片。', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&q=80', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=900&q=80'],
    ['Mika', 'female', '苏州河', '夜景', 29900, ['夜景', '蓝调', '散步', '今天可拍'], '熟悉夜景人流和安全路线，会提醒集合点、动线和收尾时间。', 'https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=240&q=80', 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=900&q=80'],
    ['Rin', 'female', '新天地', '城市街拍', 42900, ['城市感', '街拍', '杂志感', '今天可拍'], '擅长红砖、玻璃、街巷背景，适合利落一点的城市人像。', 'https://images.unsplash.com/photo-1512316609839-ce289d3eba0a?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1526510747491-58f928ec870f?auto=format&fit=crop&w=240&q=80', 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80'],
    ['Yoyo', 'female', '徐家汇', '校园感写真', 26900, ['清新', '校园感', '自然光', '今天可拍'], '偏清爽自然的照片，会帮助缓解镜头尴尬，适合学生和毕业季。', 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=240&q=80', 'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?auto=format&fit=crop&w=900&q=80'],
    ['Cici', 'female', '外滩', '旅行跟拍', 69900, ['旅行', '地标', '明亮', '今天可拍'], '适合来上海短暂停留的游客，路线紧凑，优先保证地标合影和自然抓拍。', 'https://images.unsplash.com/photo-1502325966718-85a90488dc29?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=240&q=80', 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80'],
    ['Niko', 'male', '愚园路', '男生头像', 29900, ['街头', '头像', '松弛', '黑白'], '适合男生头像、社交主页照片，会用简单指令减少摆拍感。', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&q=80', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=900&q=80'],
    ['Sora', 'female', '静安寺', '通勤形象照', 45900, ['通勤', '简洁', '职业感', '黑白'], '适合商务社交头像，路线会避开过度游客化背景，画面更像杂志专访。', 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=240&q=80', 'https://images.unsplash.com/photo-1495385794356-15371f348c31?auto=format&fit=crop&w=900&q=80'],
    ['Peach', 'female', '徐汇滨江', '宠物友好陪拍', 36900, ['宠物', '户外', '自然', '今天可拍'], '可以陪同宠物出镜，节奏会留出休息和互动时间，适合轻松户外照。', 'https://images.unsplash.com/photo-1517423440428-a5a00ad493e8?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1520813792240-56fc4a3765a7?auto=format&fit=crop&w=240&q=80', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80'],
    ['Bean', 'female', '田子坊', '复古胶片感', 39900, ['复古', '胶片感', '老街', '情绪'], '偏复古和情绪表达，会选择老街、门窗、墙面做背景，适合安静风格。', 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1495385794356-15371f348c31?auto=format&fit=crop&w=240&q=80', 'https://images.unsplash.com/photo-1503342217505-b0a15ec3261c?auto=format&fit=crop&w=900&q=80'],
    ['Noir', 'male', '西岸', '黑白大片', 52900, ['黑白', '杂志感', '艺术馆', '大片'], '偏广告大片和黑白情绪，会把建筑线条、人物姿态和留白一起设计。', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?auto=format&fit=crop&w=240&q=80', 'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?auto=format&fit=crop&w=900&q=80'],
    ['Iris', 'female', '安福路', '时装街拍', 48900, ['时装', '街拍', '黑白', '今天可拍'], '适合穿搭记录和主理人形象照，会控制背景干净度和人物比例。', 'https://images.unsplash.com/photo-1502823403499-6ccfcf4fb453?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&q=80', 'https://images.unsplash.com/photo-1512316609839-ce289d3eba0a?auto=format&fit=crop&w=900&q=80'],
    ['June', 'female', '龙美术馆', '艺术馆大片', 55900, ['艺术馆', '大片', '极简', '黑白'], '偏极简展馆和大面积留白，适合冷静、干净、像广告图的作品。', 'https://images.unsplash.com/photo-1529626455594-4ff0802cfb7e?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1520813792240-56fc4a3765a7?auto=format&fit=crop&w=240&q=80', 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80'],
    ['Vera', 'female', '前滩', '都市广告感', 49900, ['广告感', '都市', '干净', '今天可拍'], '用玻璃幕墙、台阶和光影做画面，适合想要更成熟质感的用户。', 'https://images.unsplash.com/photo-1487412720507-e7ab37603c6f?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=240&q=80', 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80'],
    ['Kiko', 'female', 'M50', '创意园街拍', 38900, ['创意园', '街拍', '涂鸦', '松弛'], '适合更年轻、更有街头感的照片，会避开杂乱背景，保留城市纹理。', 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80'],
    ['Tao', 'male', '北外滩', '建筑线条人像', 46900, ['建筑', '线条', '黑白', '男生友好'], '偏建筑空间和线条构图，适合男生、情侣或偏冷感的城市人像。', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1519345182560-3f2917c472ef?auto=format&fit=crop&w=240&q=80', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=900&q=80'],
    ['Mina', 'female', '思南路', '法式街区', 43900, ['法式', '街区', '自然光', '今天可拍'], '适合裙装、情侣和轻复古风格，会用街角、门廊和树影组织画面。', 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=240&q=80', 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80'],
    ['Haru', 'male', '大学路', '咖啡街区', 33900, ['咖啡', '街区', '生活方式', '今天可拍'], '适合更生活方式的照片，边走边拍，画面干净但不强摆拍。', 'https://images.unsplash.com/photo-1517256064527-09c73fc73e38?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=240&q=80', 'https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?auto=format&fit=crop&w=900&q=80'],
    ['Leia', 'female', '迪士尼小镇', '主题旅行跟拍', 69900, ['旅行', '主题', '明亮', '游客友好'], '适合主题乐园和游客路线，节奏快，会优先抓情绪和地标记忆点。', 'https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=240&q=80', 'https://images.unsplash.com/photo-1502325966718-85a90488dc29?auto=format&fit=crop&w=900&q=80'],
  ];

  for (const [index, profile] of profiles.entries()) {
    const [name, gender, area, activityName, priceCents, styleTags, bio, image, avatar, secondaryImage] = profile;
    const companionId = `virtual-companion-${index + 1}`;
    const companionData = {
      id: companionId,
      userId: `virtual-user-${index + 1}`,
      name,
      isVirtual: true,
      avatar,
      photo: image,
      bio,
      gender,
      baseCity: '上海',
      status: 'approved',
      serviceEnabled: true,
      ratingAvg: 4.6 + index / 10,
      ratingCount: 8 + index,
      tags: ['平台样片', '路线规划', '会指导动作'],
      safetyBadges: ['精选样片', '平台托管', '可预约参考'],
      areas: [area, '安福路', '徐汇滨江'],
      serviceAreas: [],
      slots: [
        slot(`virtual-slot-${index + 1}-1`, '今天 15:00', '今天', '15:00', '2026-06-11T07:00:00.000Z', '2026-06-11T09:00:00.000Z'),
        slot(`virtual-slot-${index + 1}-2`, '今天 19:00', '今天', '19:00', '2026-06-11T11:00:00.000Z', '2026-06-11T13:00:00.000Z'),
        slot(`virtual-slot-${index + 1}-3`, '周末 10:00', '周末', '10:00', '2026-06-14T02:00:00.000Z', '2026-06-14T04:00:00.000Z'),
      ],
      activities: [
        activity(`virtual-activity-${index + 1}`, activityName, 120, '2小时', Number(priceCents)),
        activity(`virtual-activity-${index + 1}-light`, '轻量头像快拍', 60, '1小时', Math.max(Number(priceCents) - 12000, 19900)),
      ],
      extras: [
        extra(`virtual-extra-${index + 1}-retouch`, '精修', 'per_photo', '张', 3000),
        extra(`virtual-extra-${index + 1}-rush`, '加急出图', 'per_order', '单', 8000),
      ],
    };
    const companionIndex = store.companions.findIndex((item) => item.id === companionId);
    const existingCompanion = companionIndex >= 0 ? store.companions[companionIndex] : null;
    if (!existingCompanion) {
      store.companions.push(companionData);
      changed = true;
    } else if (existingCompanion.baseCity !== '上海' || !existingCompanion.areas?.includes(area) || existingCompanion.photo !== image || existingCompanion.avatar !== avatar) {
      store.companions[companionIndex] = { ...companionData, slots: existingCompanion.slots?.length ? existingCompanion.slots : companionData.slots };
      changed = true;
    }

    const companion = store.companions.find((item) => item.id === companionId);
    const postId = `virtual-post-${index + 1}`;
    const postData = {
      id: postId,
      status: 'approved',
      isFeedVisible: true,
      city: '上海',
      locationName: area,
      location: `上海 · ${area}`,
      timeLabel: '今天可拍 / 精选样片 / 可预约参考',
      caption: `${bio} 适合作为预约前参考，具体拍摄方案以沟通确认为准。`,
      styleTags: [...styleTags],
      activity: activityName,
      images: createVirtualPostImages(postId, index, image, secondaryImage, avatar),
      companion,
    };
    const postIndex = store.posts.findIndex((item) => item.id === postId);
    const existingPost = postIndex >= 0 ? store.posts[postIndex] : null;
    if (!existingPost) {
      store.posts.push(postData);
      changed = true;
    } else if (
      existingPost.city !== '上海' ||
      existingPost.locationName !== area ||
      (existingPost.images?.length || 0) < postData.images.length ||
      !hasSamePostImages(existingPost.images, postData.images)
    ) {
      store.posts[postIndex] = postData;
      changed = true;
    }
  }
  return changed;
}

function seedVirtualTradeData(store) {
  let changed = false;
  const trades = [
    {
      id: 'virtual-trade-post-1',
      orderId: 'virtual-trade-order-1',
      orderNo: 'PPV26060001',
      companionId: 'companion-mori',
      creatorId: 'creator-00000000-0000-0000-0000-000000000701',
      creatorName: 'Creator 1',
      creatorPhone: '13910010001',
      location: '上海 · 武康路',
      activity: 'Citywalk',
      caption: 'Creator 1 and Mori completed this Citywalk order. The final work keeps natural street light and relaxed movement.',
      styleTags: ['订单成片', 'Citywalk', '自然光', '共同确认'],
      amountCents: 48900,
      dateLabel: '今天',
      timeLabel: '17:30',
      images: [
        ['virtual-trade-post-1-image-1', 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80', 900, 1200],
        ['virtual-trade-post-1-image-2', 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=900&q=80', 900, 1200],
      ],
    },
    {
      id: 'virtual-trade-post-2',
      orderId: 'virtual-trade-order-2',
      orderNo: 'PPV26060002',
      companionId: 'virtual-companion-2',
      creatorId: 'creator-00000000-0000-0000-0000-000000000702',
      creatorName: 'Creator 2',
      creatorPhone: '13910010002',
      location: '上海 · 巨鹿路',
      activity: '探店生活照',
      caption: 'Creator 2 and Aki completed this cafe lifestyle shoot. Window light, table details, and daily outfit shots are confirmed by both sides.',
      styleTags: ['订单成片', '探店', '日常感', '共同确认'],
      amountCents: 32900,
      dateLabel: '昨天',
      timeLabel: '15:30',
      images: [
        ['virtual-trade-post-2-image-1', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80', 900, 1200],
        ['virtual-trade-post-2-image-2', 'https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?auto=format&fit=crop&w=900&q=80', 900, 1200],
      ],
    },
    {
      id: 'virtual-trade-post-3',
      orderId: 'virtual-trade-order-3',
      orderNo: 'PPV26060003',
      companionId: 'virtual-companion-3',
      creatorId: 'creator-00000000-0000-0000-0000-000000000703',
      creatorName: 'Creator 3',
      creatorPhone: '13910010003',
      location: '上海 · 外滩',
      activity: '夜景散步',
      caption: 'Creator 3 and Mika completed this night walk order. Blue-hour skyline images and light-assisted portraits are jointly edited.',
      styleTags: ['订单成片', '夜景', '蓝调', '共同确认'],
      amountCents: 52900,
      dateLabel: '6月11日',
      timeLabel: '19:30',
      images: [
        ['virtual-trade-post-3-image-1', 'https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?auto=format&fit=crop&w=1200&q=80', 1200, 800],
        ['virtual-trade-post-3-image-2', 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=900&q=80', 900, 1200],
      ],
    },
    {
      id: 'virtual-trade-post-4',
      orderId: 'virtual-trade-order-4',
      orderNo: 'PPV26060004',
      companionId: 'companion-mori',
      creatorId: 'creator-00000000-0000-0000-0000-000000000704',
      creatorName: 'Creator 4',
      creatorPhone: '13910010004',
      location: '上海 · 安福路',
      activity: '书店街拍',
      caption: 'Creator 4 and Mori completed this bookstore street shoot. The final images use storefront lines and soft cloudy light.',
      styleTags: ['订单成片', '街拍', '文艺', '共同确认'],
      amountCents: 39900,
      dateLabel: '6月10日',
      timeLabel: '10:00',
      images: [
        ['virtual-trade-post-4-image-1', 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=80', 900, 1200],
        ['virtual-trade-post-4-image-2', 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80', 900, 1200],
      ],
    },
  ];

  for (const [index, trade] of trades.entries()) {
    const companion = store.companions.find((item) => item.id === trade.companionId) || store.companions[0];
    if (!companion) continue;

    const postData = {
      id: trade.id,
      status: 'approved',
      isFeedVisible: true,
      city: '上海',
      locationName: trade.location,
      location: trade.location,
      timeLabel: `订单成片 / ${trade.dateLabel} ${trade.timeLabel}`,
      caption: trade.caption,
      styleTags: trade.styleTags,
      activity: trade.activity,
      images: trade.images.map(([id, url, width, height], imageIndex) => ({ id, url, width, height, sortOrder: imageIndex + 1, mediaKind: 'image' })),
      companion,
      creator: {
        id: trade.creatorId,
        name: trade.creatorName,
        phone: trade.creatorPhone,
        avatar: trade.images[1]?.[1] || trade.images[0]?.[1],
        source: 'order',
      },
    };
    const postIndex = store.posts.findIndex((item) => item.id === trade.id);
    if (postIndex < 0) {
      store.posts.unshift(postData);
      changed = true;
    } else if (store.posts[postIndex].creator?.id !== trade.creatorId || store.posts[postIndex].images?.[0]?.url !== postData.images[0].url) {
      store.posts[postIndex] = { ...store.posts[postIndex], ...postData };
      changed = true;
    }

    const orderData = viewOrder({
      id: trade.orderId,
      orderNo: trade.orderNo,
      status: 'completed',
      title: trade.activity,
      time: `${trade.dateLabel} ${trade.timeLabel}`,
      place: trade.location,
      amountCents: trade.amountCents,
      companion: companion.name,
      companionId: companion.id,
      creatorId: trade.creatorId,
      creatorPhone: trade.creatorPhone,
      creatorName: trade.creatorName,
      companionPhone: `1393003${String(index + 1).padStart(4, '0')}`,
      postId: trade.id,
      activityId: companion.activities?.[0]?.id || `virtual-trade-activity-${index + 1}`,
      activityName: trade.activity,
      slotId: companion.slots?.[0]?.id || `virtual-trade-slot-${index + 1}`,
      startAt: new Date(Date.UTC(2026, 5, 10 + index, 8, 0, 0)).toISOString(),
      endAt: new Date(Date.UTC(2026, 5, 10 + index, 10, 0, 0)).toISOString(),
      dateLabel: trade.dateLabel,
      timeLabel: trade.timeLabel,
      durationMinutes: 120,
      durationLabel: '2 hours',
      addOns: [],
      createdAt: new Date(Date.UTC(2026, 5, 10 + index, 6, 0, 0)).toISOString(),
    });
    const orderIndex = store.orders.findIndex((item) => item.id === trade.orderId);
    if (orderIndex < 0) {
      store.orders.unshift(orderData);
      store.conversations[orderData.id] ||= createConversation(orderData);
      changed = true;
    } else if (store.orders[orderIndex].postId !== trade.id || store.orders[orderIndex].status !== 'completed') {
      store.orders[orderIndex] = { ...store.orders[orderIndex], ...orderData };
      store.conversations[orderData.id] ||= createConversation(orderData);
      changed = true;
    }
  }

  return changed;
}

function normalizeCompanions(store) {
  const points = [
    { lat: 31.2109, lng: 121.4457 },
    { lat: 31.2197, lng: 121.4544 },
    { lat: 31.2221, lng: 121.4755 },
    { lat: 31.2442, lng: 121.4891 },
  ];
  store.companions.forEach((companion, index) => {
    companion.status ||= 'approved';
    companion.serviceEnabled = companion.serviceEnabled !== false;
    companion.baseCity ||= '上海';
    companion.activities ||= [activity(`${companion.id}-activity`, 'Citywalk', 120, '2 hours', 39900)];
    companion.extras ||= [];
    companion.slots ||= [];
    companion.areas ||= [companion.locationName || '武康路'];
    companion.serviceAreas = buildServiceAreas(companion, points[index % points.length]);
  });
}

function normalizePosts(store) {
  store.posts.forEach((post) => {
    const companion = store.companions.find((item) => item.id === post.companion?.id) || post.companion || store.companions[0];
    post.companion = companion;
    post.status ||= 'approved';
    post.isFeedVisible = post.isFeedVisible !== false;
    post.city ||= companion.baseCity || '上海';
    post.locationName ||= post.location || companion.areas?.[0] || '武康路';
    post.location ||= `${post.city} - ${post.locationName}`;
  });
}

function normalizeOrders(store) {
  store.orders.forEach((order) => {
    order.userId ||= 'demo-consumer-user';
    order.userName ||= 'Demo Consumer';
    if (order.status === 'pending_payment') {
      order.paymentExpiresAt ||= createPaymentExpiresAt(toTimestamp(order.createdAt) || Date.now());
    }
    Object.assign(order, viewOrder(order));
    if (['paid_pending_confirm', 'confirmed', 'in_service', 'completed', 'disputed'].includes(order.status)) {
      store.conversations[order.id] ||= createConversation(order);
    }
    const companion = store.companions.find((item) => item.id === order.companionId);
    const slot = companion?.slots.find((item) => item.id === order.slotId);
    if (slot && order.status !== 'cancelled' && order.status !== 'refunded') {
      slot.status = order.status === 'pending_payment' ? 'locked' : 'booked';
      slot.lockedOrderId = order.id;
      if (order.status === 'pending_payment') slot.lockExpiresAt = order.paymentExpiresAt;
    }
  });
}

function seedAuditCases(store) {
  return [
    {
      id: 'audit-case-demo-post',
      targetType: 'post',
      targetId: store.posts[0]?.id || 'post-wukang',
      title: 'Demo post review queue item',
      status: 'pending',
      createdAt: now(),
      payload: { note: 'Seed moderation case for admin demo.' },
      logs: [],
    },
  ];
}

function buildServiceAreas(companion, fallbackPoint) {
  const areas = companion.serviceAreas?.length ? companion.serviceAreas : companion.areas.map((areaName, index) => ({ areaName, index }));
  return areas.map((area, index) => {
    const point = Number.isFinite(area.lat) && Number.isFinite(area.lng) ? area : offsetPoint(fallbackPoint, index);
    return {
      id: area.id || `${companion.id}-area-${index + 1}`,
      city: area.city || companion.baseCity || '上海',
      areaName: area.areaName || area.name || area,
      areaType: area.areaType || 'business_area',
      lat: point.lat,
      lng: point.lng,
      radiusMeters: area.radiusMeters || (index === 0 ? 4000 : 2500),
      enabled: area.enabled !== false,
    };
  });
}

function ensureWallet(store, companionId) {
  let wallet = store.wallets.find((item) => item.companionId === companionId);
  if (!wallet) {
    wallet = { id: id('wallet'), companionId, pendingCents: 0, availableCents: 0, frozenCents: 0 };
    store.wallets.push(wallet);
  }
  return wallet;
}

function viewOrder(order) {
  return {
    ...order,
    statusText: orderStatusText[order.status] || order.status,
    amountText: formatMoney(order.amountCents),
    steps: ['Created', 'Paid', 'Confirmed', 'Completed'],
    currentStep: orderStepIndex[order.status] ?? 0,
  };
}

function publicPayment(payment) {
  const miniProgramPayParams = buildMiniProgramPayParams(payment);
  return {
    paymentId: payment.id,
    paymentNo: payment.paymentNo,
    channel: payment.channel,
    provider: payment.provider || 'wechat_pay',
    mode: payment.mode || 'mock',
    status: payment.status,
    amountCents: payment.amountCents,
    amountText: formatMoney(payment.amountCents),
    expiresAt: payment.expiresAt,
    miniProgramPayParams,
    payPayload: {
      provider: payment.provider || 'wechat_pay',
      mode: payment.mode || 'mock',
      miniProgramPayParams,
      mockSuccessPath: `/api/payments/${payment.id}/mock-success`,
      migrationTarget: 'wx.requestPayment',
    },
    paidAt: payment.paidAt,
  };
}

function buildMiniProgramPayParams(payment) {
  const timeStamp = String(Math.floor(new Date(payment.createdAt || now()).getTime() / 1000));
  return {
    timeStamp,
    nonceStr: payment.nonceStr || `mock-${payment.id}`.replace(/[^a-zA-Z0-9]/g, '').slice(0, 32),
    package: payment.prepayPackage || `prepay_id=mock_${payment.id}`,
    signType: payment.signType || 'RSA',
    paySign: payment.paySign || `mock-sign-${payment.id}`,
  };
}

async function createWechatJsapiPrepay(payment, order, session) {
  const appId = requiredEnv('WECHAT_MINI_PROGRAM_APP_ID');
  const mchId = requiredEnv('WECHAT_PAY_MCH_ID');
  const notifyUrl = requiredEnv('WECHAT_PAY_NOTIFY_URL');
  const privateKey = getWechatPayPrivateKey();
  const body = {
    appid: appId,
    mchid: mchId,
    description: order.title.slice(0, 127),
    out_trade_no: payment.paymentNo,
    time_expire: payment.expiresAt,
    notify_url: notifyUrl,
    amount: { total: payment.amountCents, currency: 'CNY' },
    payer: { openid: session.user.openId },
  };

  if (!body.payer.openid || body.payer.openid.startsWith('mock-openid-')) {
    throw new Error('Live WeChat Pay requires a real user openid from wx.login');
  }

  const response = await wechatPayRequest('POST', '/v3/pay/transactions/jsapi', body, privateKey);
  const prepayPackage = `prepay_id=${response.prepay_id}`;
  const timeStamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = randomString(32);
  const paySign = signWechatPayMessage(`${appId}\n${timeStamp}\n${nonceStr}\n${prepayPackage}\n`, privateKey);
  return {
    prepayId: response.prepay_id,
    prepayPackage,
    timeStamp,
    nonceStr,
    signType: 'RSA',
    paySign,
  };
}

async function wechatPayRequest(method, path, body, privateKey) {
  const url = `https://api.mch.weixin.qq.com${path}`;
  const timestamp = String(Math.floor(Date.now() / 1000));
  const nonce = randomString(32);
  const bodyText = body ? JSON.stringify(body) : '';
  const message = `${method}\n${path}\n${timestamp}\n${nonce}\n${bodyText}\n`;
  const signature = signWechatPayMessage(message, privateKey);
  const authorization = [
    'WECHATPAY2-SHA256-RSA2048',
    `mchid="${requiredEnv('WECHAT_PAY_MCH_ID')}"`,
    `nonce_str="${nonce}"`,
    `signature="${signature}"`,
    `timestamp="${timestamp}"`,
    `serial_no="${requiredEnv('WECHAT_PAY_SERIAL_NO')}"`,
  ].join(',');

  const response = await fetch(url, {
    method,
    headers: {
      Accept: 'application/json',
      Authorization: authorization,
      'Content-Type': 'application/json',
      'User-Agent': 'Still-Platform/1.0',
    },
    body: bodyText || undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || `WeChat Pay request failed with ${response.status}`);
  return data;
}

async function wechatPaymentNotify(store, body = {}, req = null) {
  if (!process.env.WECHAT_PAY_API_V3_KEY) return error(501, 'WECHAT_PAY_NOTIFY_NOT_CONFIGURED', 'WECHAT_PAY_API_V3_KEY is required');
  const signatureCheck = verifyWechatPayNotifyRequest(req, body);
  if (signatureCheck) return signatureCheck;
  const callbackEvent = await recordWechatProviderCallback(body, req);
  const transaction = decryptWechatPayResource(body.resource || {});
  const payment = store.payments.find((item) => item.paymentNo === transaction.out_trade_no || item.transactionId === transaction.transaction_id);
  if (!payment) {
    await markWechatProviderCallbackFailed(callbackEvent, 'Payment not found');
    return error(404, 'NOT_FOUND', 'Payment not found');
  }
  if (dataStore.kind !== 'json' && dataStore.orderWrites?.markPaymentPaid) {
    if (transaction.trade_state === 'SUCCESS') return markPostgresWechatPaymentPaid(payment, transaction, callbackEvent);
    if (['CLOSED', 'REVOKED', 'PAYERROR'].includes(transaction.trade_state) && dataStore.orderWrites.markPaymentTerminal) {
      return markPostgresWechatPaymentTerminal(payment, transaction, callbackEvent);
    }
    await markWechatProviderCallbackProcessed(callbackEvent, {
      objectType: 'payment',
      objectId: payment.id,
      paymentId: payment.id,
      orderId: payment.orderId,
    });
    return rawJson({ code: 'SUCCESS', message: 'OK' }, 200, false);
  }
  payment.transactionId = transaction.transaction_id;
  payment.wechatTradeState = transaction.trade_state;
  if (transaction.trade_state === 'SUCCESS') return markPaymentPaid(store, payment, 'WeChat Pay callback succeeded');
  return rawJson({ code: 'SUCCESS', message: 'OK' }, 200, true);
}

async function markPostgresWechatPaymentPaid(payment, transaction, callbackEvent = null) {
  if (payment.status === 'paid' || payment.status === 'closed') {
    await markWechatProviderCallbackProcessed(callbackEvent, {
      objectType: 'payment',
      objectId: payment.id,
      paymentId: payment.id,
      orderId: payment.orderId,
    });
    return rawJson({ code: 'SUCCESS', message: 'OK' }, 200, false);
  }
  try {
    await dataStore.orderWrites.markPaymentPaid({
      paymentId: payment.id,
      conversationId: postgresId(),
      statusLogId: postgresId(),
      paidAt: transaction.success_time || now(),
      thirdPartyTradeNo: transaction.transaction_id || null,
      thirdPartyBuyerId: transaction.payer?.openid || null,
      rawCallback: transaction,
      operatorType: 'system',
      statusReason: 'WeChat Pay callback succeeded',
    });
    await markWechatProviderCallbackProcessed(callbackEvent, {
      objectType: 'payment',
      objectId: payment.id,
      paymentId: payment.id,
      orderId: payment.orderId,
    });
  } catch (error) {
    await markWechatProviderCallbackFailed(callbackEvent, error);
    throw error;
  }
  return rawJson({ code: 'SUCCESS', message: 'OK' }, 200, false);
}

async function markPostgresWechatPaymentTerminal(payment, transaction, callbackEvent = null) {
  const status = transaction.trade_state === 'PAYERROR' ? 'failed' : 'closed';
  try {
    await dataStore.orderWrites.markPaymentTerminal({
      paymentId: payment.id,
      status,
      occurredAt: now(),
      thirdPartyTradeNo: transaction.transaction_id || null,
      rawCallback: transaction,
    });
    await markWechatProviderCallbackProcessed(callbackEvent, {
      objectType: 'payment',
      objectId: payment.id,
      paymentId: payment.id,
      orderId: payment.orderId,
    });
  } catch (error) {
    await markWechatProviderCallbackFailed(callbackEvent, error);
    throw error;
  }
  return rawJson({ code: 'SUCCESS', message: 'OK' }, 200, false);
}

async function wechatRefundNotify(store, body = {}, req = null) {
  if (!process.env.WECHAT_PAY_API_V3_KEY) return error(501, 'WECHAT_PAY_NOTIFY_NOT_CONFIGURED', 'WECHAT_PAY_API_V3_KEY is required');
  const signatureCheck = verifyWechatPayNotifyRequest(req, body);
  if (signatureCheck) return signatureCheck;
  const callbackEvent = await recordWechatProviderCallback(body, req);
  const transaction = decryptWechatPayResource(body.resource || {});
  const refund = store.refunds.find((item) => item.refundNo === transaction.out_refund_no || item.thirdPartyRefundNo === transaction.refund_id);
  if (!refund) {
    await markWechatProviderCallbackFailed(callbackEvent, 'Refund not found');
    return error(404, 'NOT_FOUND', 'Refund not found');
  }

  if (dataStore.kind !== 'json' && dataStore.orderWrites?.markRefundTerminal) {
    return markPostgresWechatRefundTerminal(refund, transaction, callbackEvent);
  }

  const changed = applyWechatRefundTerminal(store, refund, transaction);
  return rawJson({ code: 'SUCCESS', message: 'OK' }, 200, changed);
}

async function markPostgresWechatRefundTerminal(refund, transaction, callbackEvent = null) {
  const status = mapWechatRefundTerminalStatus(transaction.refund_status);
  if (!status) {
    await markWechatProviderCallbackProcessed(callbackEvent, {
      objectType: 'refund',
      objectId: refund.id,
      refundId: refund.id,
      orderId: refund.orderId,
    });
    return rawJson({ code: 'SUCCESS', message: 'OK' }, 200, false);
  }

  try {
    await dataStore.orderWrites.markRefundTerminal({
      refundId: refund.id,
      status,
      statusLogId: status === 'succeeded' ? postgresId() : undefined,
      occurredAt: transaction.success_time || now(),
      thirdPartyRefundNo: transaction.refund_id || null,
      rawCallback: transaction,
      operatorType: 'system',
      reason: refundTerminalReason(status, transaction),
    });
    await markWechatProviderCallbackProcessed(callbackEvent, {
      objectType: 'refund',
      objectId: refund.id,
      refundId: refund.id,
      orderId: refund.orderId,
    });
  } catch (error) {
    await markWechatProviderCallbackFailed(callbackEvent, error);
    throw error;
  }
  return rawJson({ code: 'SUCCESS', message: 'OK' }, 200, false);
}

async function recordWechatProviderCallback(body = {}, req = null) {
  if (!(dataStore.kind !== 'json' && dataStore.providerCallbackWrites?.recordReceived)) return null;
  return dataStore.providerCallbackWrites.recordReceived({
    callbackEventId: postgresId(),
    provider: 'wechat_pay',
    eventType: body.event_type || 'UNKNOWN',
    providerEventId: body.id || id('wechat-event'),
    requestHeaders: getWechatPayNotifyHeaders(req),
    rawBody: rawBodyText(body),
    rawPayload: body,
  });
}

async function markWechatProviderCallbackProcessed(callbackEvent, draft = {}) {
  if (!callbackEvent?.id || !dataStore.providerCallbackWrites?.markProcessed) return null;
  return dataStore.providerCallbackWrites.markProcessed({
    callbackEventId: callbackEvent.id,
    ...draft,
  });
}

async function markWechatProviderCallbackFailed(callbackEvent, errorLike, options = {}) {
  if (!callbackEvent?.id || !dataStore.providerCallbackWrites?.markFailed) return null;
  const message = errorLike instanceof Error ? errorLike.message : String(errorLike || 'Provider callback processing failed');
  return dataStore.providerCallbackWrites.markFailed({
    callbackEventId: callbackEvent.id,
    nextRetryAt: options.nextRetryAt || new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    retryable: options.retryable !== false,
    lastError: message,
  });
}

function applyWechatRefundTerminal(store, refund, transaction) {
  const status = mapWechatRefundTerminalStatus(transaction.refund_status);
  if (!status || ['succeeded', 'failed', 'rejected'].includes(refund.status)) return false;

  refund.status = status;
  refund.thirdPartyRefundNo = transaction.refund_id || refund.thirdPartyRefundNo || null;
  refund.rawCallback = transaction;
  refund.updatedAt = now();

  if (status === 'succeeded') {
    refund.refundedAt = transaction.success_time || now();
    const order = store.orders.find((item) => item.id === refund.orderId);
    if (order?.status === 'refunding') {
      Object.assign(order, viewOrder({ ...order, status: 'refunded' }));
      order.statusLogs = [...(order.statusLogs || []), statusLog('refunded', refundTerminalReason(status, transaction))];
    }
  }

  return true;
}

function mapWechatRefundTerminalStatus(status) {
  if (status === 'SUCCESS') return 'succeeded';
  if (status === 'CLOSED') return 'rejected';
  if (status === 'ABNORMAL') return 'failed';
  return null;
}

function refundTerminalReason(status, transaction = {}) {
  if (status === 'succeeded') return 'WeChat refund succeeded';
  if (status === 'rejected') return transaction.status_desc || 'WeChat refund closed';
  return transaction.status_desc || 'WeChat refund failed';
}

async function refreshWechatPaymentStatus(store, payment) {
  if (!useLiveWechatPay() || payment.status !== 'pending' || !payment.paymentNo) return false;

  const privateKey = getWechatPayPrivateKey();
  const mchId = requiredEnv('WECHAT_PAY_MCH_ID');
  const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(payment.paymentNo)}?mchid=${encodeURIComponent(mchId)}`;
  const transaction = await wechatPayRequest('GET', path, null, privateKey);
  payment.transactionId = transaction.transaction_id || payment.transactionId;
  payment.wechatTradeState = transaction.trade_state;
  payment.lastQueriedAt = now();

  if (transaction.trade_state === 'SUCCESS') {
    applyPaidPayment(store, payment, 'WeChat Pay status query succeeded');
    return true;
  }

  if (['CLOSED', 'REVOKED'].includes(transaction.trade_state)) {
    closePayment(payment, transaction.trade_state_desc || transaction.trade_state);
    return true;
  }

  if (transaction.trade_state === 'PAYERROR') {
    payment.status = 'failed';
    payment.failedAt = now();
    payment.failureReason = transaction.trade_state_desc || 'WeChat Pay reported PAYERROR';
    return true;
  }

  return true;
}

function markPaymentPaid(store, payment, note) {
  if (payment.status === 'paid') return rawJson({ code: 'SUCCESS', message: 'OK' }, 200, true);
  if (payment.status === 'closed') return rawJson({ code: 'SUCCESS', message: 'OK' }, 200, true);
  const result = applyPaidPayment(store, payment, note);
  if (result.error) return result.error;
  return rawJson({ code: 'SUCCESS', message: 'OK' }, 200, true);
}

function applyPaidPayment(store, payment, note) {
  const order = store.orders.find((item) => item.id === payment.orderId);
  if (!order) return { error: error(404, 'NOT_FOUND', 'Order not found') };
  payment.status = 'paid';
  payment.paidAt = now();
  Object.assign(order, viewOrder({ ...order, status: 'paid_pending_confirm', paidAt: now() }));
  order.statusLogs = [...(order.statusLogs || []), statusLog('paid_pending_confirm', note)];
  const companion = store.companions.find((item) => item.id === order.companionId);
  const slot = companion?.slots.find((item) => item.id === order.slotId);
  if (slot) markSlotBooked(companion.id, slot, order.id);
  store.conversations[order.id] ||= createConversation(order);
  return { order, conversation: store.conversations[order.id] };
}

function decryptWechatPayResource(resource) {
  const key = Buffer.from(requiredEnv('WECHAT_PAY_API_V3_KEY'), 'utf8');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(resource.nonce || '', 'utf8'));
  decipher.setAuthTag(Buffer.from(resource.tag || '', 'base64'));
  decipher.setAAD(Buffer.from(resource.associated_data || '', 'utf8'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(resource.ciphertext || '', 'base64')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

function verifyWechatPayNotifyRequest(req, body) {
  if (!process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY && !process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH) {
    return error(501, 'WECHAT_PAY_NOTIFY_SIGNATURE_NOT_CONFIGURED', 'WECHAT_PAY_PLATFORM_PUBLIC_KEY or WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH is required');
  }

  try {
    const timestamp = getRequestHeader(req, 'wechatpay-timestamp');
    const nonce = getRequestHeader(req, 'wechatpay-nonce');
    const signature = getRequestHeader(req, 'wechatpay-signature');
    const rawBody = rawBodyText(body);
    if (!timestamp || !nonce || !signature || !rawBody) throw new Error('Missing WeChat Pay notify signature headers or raw body');

    const message = `${timestamp}\n${nonce}\n${rawBody}\n`;
    const publicKey = getWechatPayPlatformPublicKey();
    const verified = verify('RSA-SHA256', Buffer.from(message, 'utf8'), publicKey, Buffer.from(signature, 'base64'));
    if (!verified) throw new Error('Invalid WeChat Pay notify signature');
    return null;
  } catch (signatureError) {
    return error(401, 'WECHAT_PAY_NOTIFY_SIGNATURE_INVALID', signatureError instanceof Error ? signatureError.message : 'Invalid WeChat Pay notify signature');
  }
}

function getWechatPayPlatformPublicKey() {
  if (process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY) return process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY.replace(/\\n/g, '\n');
  if (process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH) return readFileSync(resolve(process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH), 'utf8');
  throw new Error('WECHAT_PAY_PLATFORM_PUBLIC_KEY or WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH is required');
}

function getRequestHeader(req, name) {
  const value = req?.headers?.[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value || '';
}

function getWechatPayNotifyHeaders(req) {
  return {
    timestamp: getRequestHeader(req, 'wechatpay-timestamp'),
    nonce: getRequestHeader(req, 'wechatpay-nonce'),
    signature: getRequestHeader(req, 'wechatpay-signature'),
    serial: getRequestHeader(req, 'wechatpay-serial'),
  };
}

function rawBodyText(body) {
  return typeof body?.__rawBody === 'string' ? body.__rawBody : '';
}

function signWechatPayMessage(message, privateKey) {
  return sign('RSA-SHA256', Buffer.from(message, 'utf8'), privateKey).toString('base64');
}

function getWechatPayPrivateKey() {
  if (process.env.WECHAT_PAY_PRIVATE_KEY) return process.env.WECHAT_PAY_PRIVATE_KEY.replace(/\\n/g, '\n');
  if (process.env.WECHAT_PAY_PRIVATE_KEY_PATH) return readFileSync(resolve(process.env.WECHAT_PAY_PRIVATE_KEY_PATH), 'utf8');
  throw new Error('WECHAT_PAY_PRIVATE_KEY or WECHAT_PAY_PRIVATE_KEY_PATH is required');
}

function useLiveWechatPay() {
  return process.env.WECHAT_PAY_MODE === 'live';
}

function isTestRoleSwitchAllowed() {
  if (appEnv === 'production') return false;
  return enableTestRoleSwitch !== 'false';
}

function hasWechatAuthConfig() {
  return Boolean(process.env.WECHAT_MINI_PROGRAM_APP_ID && process.env.WECHAT_MINI_PROGRAM_APP_SECRET);
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function randomString(length) {
  return randomBytes(Math.ceil(length / 2)).toString('hex').slice(0, length);
}

function launchCheck() {
  const requiredForProduction = [
    'STORE_DRIVER',
    'DATABASE_URL',
    'WECHAT_MINI_PROGRAM_APP_ID',
    'WECHAT_MINI_PROGRAM_APP_SECRET',
    'WECHAT_PAY_MODE',
    'WECHAT_PAY_MCH_ID',
    'WECHAT_PAY_SERIAL_NO',
    'WECHAT_PAY_PRIVATE_KEY',
    'WECHAT_PAY_PLATFORM_PUBLIC_KEY',
    'WECHAT_PAY_NOTIFY_URL',
    'WECHAT_PAY_API_V3_KEY',
    'COS_BUCKET',
    'COS_REGION',
    'COS_PUBLIC_BASE_URL',
  ];
  const missing = requiredForProduction.filter((name) => !isLaunchEnvConfigured(name));
  return json({
    ready: missing.length === 0,
    missing,
    current: {
      storeDriver: dataStore.kind,
      wechatAuth: hasWechatAuthConfig() ? 'configured' : 'mock',
      wechatPay: useLiveWechatPay() ? 'live' : 'mock',
      media: process.env.COS_PUBLIC_BASE_URL ? 'cos-configured' : 'mock',
    },
  });
}

function isLaunchEnvConfigured(name) {
  if (name === 'WECHAT_PAY_PRIVATE_KEY') return Boolean(process.env.WECHAT_PAY_PRIVATE_KEY || process.env.WECHAT_PAY_PRIVATE_KEY_PATH);
  if (name === 'WECHAT_PAY_PLATFORM_PUBLIC_KEY') return Boolean(process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY || process.env.WECHAT_PAY_PLATFORM_PUBLIC_KEY_PATH);
  return Boolean(process.env[name]);
}

function actionLabel(actionType) {
  const labels = {
    release_message: 'Release message',
    confirm_violation: 'Confirm violation',
    warn_user: 'Warn user',
    warn_companion: 'Warn companion',
    restrict_chat: 'Restrict chat',
    freeze_order: 'Freeze order',
    suspend_companion: 'Suspend companion',
    resolve_report: 'Resolve report',
  };
  return labels[actionType] || 'Record action';
}

function nextMessageCaseStatus(actionType, currentStatus) {
  if (actionType === 'release_message') return 'released';
  if (actionType === 'confirm_violation') return 'violation';
  if (actionType === 'restrict_chat') return 'restricted';
  return currentStatus;
}

function nextReportCaseStatus(actionType, currentStatus) {
  if (actionType === 'resolve_report') return 'resolved';
  if (actionType === 'confirm_violation' || actionType === 'freeze_order') return 'investigating';
  return currentStatus;
}

function slot(id, label, dateLabel, timeLabel, startAt, endAt) {
  return { id, label, dateLabel, timeLabel, startAt, endAt, status: 'available' };
}

function activity(id, name, durationMinutes, durationLabel, priceCents) {
  return { id, name, durationMinutes, durationLabel, priceCents, priceText: formatMoney(priceCents) };
}

function extra(id, name, unit, unitLabel, priceCents) {
  return { id, name, unit, unitLabel, priceCents, priceText: formatMoney(priceCents) };
}

function findOrder(store, idValue) {
  return store.orders.find((order) => order.id === idValue);
}

function statusLog(status, note) {
  return { id: id('status-log'), status, note, createdAt: now() };
}

function id(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function postgresId() {
  return randomUUID();
}

function orderNo() {
  return `PP${new Date().toISOString().slice(2, 10).replaceAll('-', '')}${String(Date.now()).slice(-4)}`;
}

function paymentNo() {
  return `PAY${new Date().toISOString().slice(2, 10).replaceAll('-', '')}${String(Date.now()).slice(-4)}`;
}

function isNestedRoute(path, prefix, suffix) {
  return path.startsWith(prefix) && path.endsWith(suffix) && path.length > prefix.length + suffix.length;
}

function last(path) {
  return decodeURIComponent(path.split('/').pop() || '');
}

function formatMoney(cents) {
  const yuan = Math.round(Number(cents || 0)) / 100;
  return `¥${Number.isInteger(yuan) ? yuan : yuan.toFixed(2)}`;
}

function haversineMeters(lat1, lng1, lat2, lng2) {
  const earthRadiusMeters = 6371000;
  const dLat = toRadians(lat2 - lat1);
  const dLng = toRadians(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLng / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function offsetPoint(point, index) {
  return {
    lat: Number((point.lat + index * 0.002).toFixed(7)),
    lng: Number((point.lng - index * 0.002).toFixed(7)),
  };
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') return undefined;
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(Math.round(value), min), max);
}

function normalize(value) {
  return String(value || '').trim().toLowerCase();
}


async function readBody(req) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method || '')) return {};
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  const parsed = raw ? JSON.parse(raw) : {};
  if (parsed && typeof parsed === 'object') {
    Object.defineProperty(parsed, '__rawBody', { value: raw, enumerable: false });
  }
  return parsed;
}

function json(data, status = 200, changed = false) {
  return { status, changed, payload: ok(data) };
}

function rawJson(data, status = 200, changed = false) {
  return { status, changed, payload: data };
}

function error(status, code, message, changed = false) {
  return { status, changed, payload: fail(code, message) };
}

function ok(data) {
  return { success: true, data, error: null };
}

function fail(code, message) {
  return { success: false, data: null, error: { code, message } };
}

function sendJson(req, res, status, payload) {
  send(req, res, status, JSON.stringify(payload), 'application/json; charset=utf-8');
}

function send(req, res, status, payload, contentType = 'text/plain; charset=utf-8') {
  const headers = {
    'Content-Type': contentType,
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-PP-Role, X-PP-User-Id',
    Vary: 'Origin',
  };
  const corsOrigin = getAllowedCorsOrigin(req);
  if (corsOrigin) headers['Access-Control-Allow-Origin'] = corsOrigin;
  res.writeHead(status, headers);
  res.end(payload);
}

function isCorsRequestAllowed(req) {
  return !getRequestOrigin(req) || Boolean(getAllowedCorsOrigin(req));
}

function getAllowedCorsOrigin(req) {
  const origin = getRequestOrigin(req);
  if (!origin) return '';
  if (corsAllowedOrigins.includes(origin)) return origin;
  if (!isProductionServerEnv && isLocalDevOrigin(origin)) return origin;
  return '';
}

function getRequestOrigin(req) {
  return String(req?.headers?.origin || '').trim();
}

function parseEnvList(value) {
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function isLocalDevOrigin(origin) {
  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}

function now() {
  return new Date().toISOString();
}
