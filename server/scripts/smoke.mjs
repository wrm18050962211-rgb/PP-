import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.SMOKE_PORT || 18787);
const baseUrl = `http://127.0.0.1:${port}`;
const tempDir = await mkdtemp(resolve(tmpdir(), 'pp-api-smoke-'));
const storePath = resolve(tempDir, 'store.json');

let server;
let authToken = '';

try {
  server = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), STORE_DRIVER: 'json', STORE_PATH: storePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logs = [];
  server.stdout.on('data', (chunk) => logs.push(String(chunk)));
  server.stderr.on('data', (chunk) => logs.push(String(chunk)));

  await waitForHealth();

  const health = await api('GET', '/api/health');
  assert(health.status === 'ok', 'health returns ok');
  assert(health.storeDriver === 'json', 'health reports active store driver');
  assert(health.storeCapabilities?.writes === true, 'health reports json write capability');

  const launchCheck = await api('GET', '/api/ops/launch-check');
  assert(Array.isArray(launchCheck.missing) && launchCheck.current?.wechatPay === 'mock', 'launch check reports missing production configuration');

  const session = await api('GET', '/api/auth/session');
  assert(session.role === 'consumer' && session.user?.id, 'default auth session is consumer');

  const wechatSession = await api('POST', '/api/auth/wechat/login', { code: 'mock-smoke-code' });
  assert(wechatSession.provider === 'wechat' && wechatSession.role === 'consumer', 'wechat login endpoint accepts mini program code');

  const companionSession = await api('POST', '/api/auth/wechat/mock-login', { role: 'companion' });
  assert(companionSession.role === 'companion' && companionSession.companionId, 'mock login can switch to companion role');

  const adminSession = await api('POST', '/api/auth/wechat/mock-login', { role: 'admin' });
  assert(adminSession.role === 'admin' && adminSession.adminScope?.includes('risk'), 'mock login can switch to admin role');
  const anonymousAdmin = await api('GET', '/api/admin/dashboard', undefined, { omitAuth: true, expectOk: false });
  assert(anonymousAdmin.error?.code === 'AUTH_REQUIRED', 'admin API rejects missing token instead of using ambient session');

  const consumerSession = await api('POST', '/api/auth/wechat/mock-login', { role: 'consumer' });
  assert(consumerSession.role === 'consumer', 'mock login can switch back to consumer role');
  const consumerAdmin = await api('GET', '/api/admin/dashboard', undefined, { expectOk: false });
  assert(consumerAdmin.error?.code === 'FORBIDDEN', 'admin API rejects consumer token');

  const mediaPolicy = await api('POST', '/api/media/upload-policy', {
    purpose: 'post-image',
    fileName: 'cover.jpg',
    contentType: 'image/jpeg',
    sizeBytes: 1024,
  });
  assert(mediaPolicy.provider === 'tencent_cos' && mediaPolicy.objectKey?.includes('/post-image/'), 'media upload policy is shaped for Tencent COS');

  const feed = await api('GET', '/api/feed/posts?city=%E4%B8%8A%E6%B5%B7&limit=10');
  assert(Array.isArray(feed.items) && feed.items.length >= 5, 'feed exposes seeded photographers');

  const matching = await api('GET', '/api/matching/companions?lat=31.2112&lng=121.4476&city=%E4%B8%8A%E6%B5%B7&limit=10');
  assert(Array.isArray(matching.items) && matching.items.length > 0, 'nearby matching returns companions');

  const post = await api('GET', `/api/posts/${feed.items[0].id}`);
  const slot = post.companion.slots.find((item) => item.status === 'available') || post.companion.slots[0];
  const activity = post.companion.activities[0];
  assert(slot?.id && activity?.id, 'post has a bookable slot and activity');

  const quote = await api('POST', '/api/orders/quote', {
    postId: post.id,
    companionId: post.companion.id,
    slotId: slot.id,
    activityPricingId: activity.id,
    extras: post.companion.extras[0] ? [{ extraId: post.companion.extras[0].id, quantity: 1 }] : [],
  });
  assert(quote.totalAmountCents > 0 && quote.platformFeeCents > 0, 'quote includes payable totals and platform fee');

  const order = await api('POST', '/api/orders', {
    postId: post.id,
    companionId: post.companion.id,
    slotId: slot.id,
    activityPricingId: activity.id,
    placeName: post.locationName,
    userNote: 'smoke test booking',
  });
  assert(order.status === 'pending_payment' && order.payment?.paymentId, 'order starts pending payment with payment id');
  assert(order.payment.miniProgramPayParams?.package?.startsWith('prepay_id='), 'order returns mini program payment params');
  assert(order.payment.payPayload?.migrationTarget === 'wx.requestPayment', 'payment payload documents mini program migration target');

  const paid = await api('POST', `/api/payments/${order.payment.paymentId}/mock-success`);
  assert(paid.order.status === 'paid_pending_confirm' && paid.conversation?.id, 'mock payment pays order and opens conversation');
  const paidStatus = await api('GET', `/api/payments/${order.payment.paymentId}/status`);
  assert(paidStatus.payment.status === 'paid' && paidStatus.order.status === 'paid_pending_confirm', 'payment status endpoint returns paid order');

  const orders = await api('GET', '/api/orders?role=user');
  assert(orders.items.some((item) => item.id === paid.order.id), 'paid order appears in order list');
  const consumerStatusUpdate = await api('POST', `/api/orders/${paid.order.id}/status`, { status: 'disputed' }, { expectOk: false });
  assert(consumerStatusUpdate.error?.code === 'FORBIDDEN', 'consumer token cannot use admin order status endpoint');

  await api('POST', '/api/auth/wechat/mock-login', { role: 'companion', companionId: paid.order.companionId });
  const companionOrders = await api('GET', '/api/orders?role=companion');
  assert(companionOrders.items.every((item) => item.companionId === paid.order.companionId), 'companion order list is scoped to current companion');
  const confirmed = await api('POST', `/api/orders/${paid.order.id}/confirm`);
  assert(confirmed.status === 'confirmed', 'companion can confirm own order');

  await api('POST', '/api/auth/wechat/mock-login', { role: 'consumer' });
  const expiring = await findBookablePost(feed.items);
  const expiringOrder = await api('POST', '/api/orders', {
    postId: expiring.post.id,
    companionId: expiring.post.companion.id,
    slotId: expiring.slot.id,
    activityPricingId: expiring.activity.id,
    placeName: expiring.post.locationName,
    userNote: 'smoke test expiring payment',
  });
  await expirePendingOrderInStore(expiringOrder.id);
  const expiredStatus = await api('GET', `/api/payments/${expiringOrder.payment.paymentId}/status`);
  assert(expiredStatus.payment.status === 'closed' && expiredStatus.order.status === 'cancelled', 'payment status endpoint closes expired pending payment');
  const ordersAfterExpiry = await api('GET', '/api/orders?role=user');
  const expiredOrder = ordersAfterExpiry.items.find((item) => item.id === expiringOrder.id);
  assert(expiredOrder?.status === 'cancelled', 'expired pending payment order is cancelled automatically');
  const refreshedExpiringPost = await api('GET', `/api/posts/${expiring.post.id}`);
  const releasedSlot = refreshedExpiringPost.companion.slots.find((item) => item.id === expiring.slot.id);
  assert(releasedSlot?.status === 'available', 'expired pending payment releases the locked slot');

  const cancellable = await findBookablePost(feed.items);
  const cancellableOrder = await api('POST', '/api/orders', {
    postId: cancellable.post.id,
    companionId: cancellable.post.companion.id,
    slotId: cancellable.slot.id,
    activityPricingId: cancellable.activity.id,
    placeName: cancellable.post.locationName,
    userNote: 'smoke test cancellation settlement',
  });
  const cancellablePaid = await api('POST', `/api/payments/${cancellableOrder.payment.paymentId}/mock-success`);
  await api('POST', '/api/auth/wechat/mock-login', { role: 'companion', companionId: cancellablePaid.order.companionId });
  await api('POST', `/api/orders/${cancellablePaid.order.id}/confirm`);
  await api('POST', '/api/auth/wechat/mock-login', { role: 'consumer' });
  const cancelledConfirmed = await api('POST', `/api/orders/${cancellablePaid.order.id}/cancel`, { reason: 'smoke test client cancellation' });
  assert(cancelledConfirmed.status === 'refunding', 'confirmed cancellation transitions to refunding');
  assert(cancelledConfirmed.cancellationActor === 'creator', 'confirmed cancellation records client actor');
  assert(cancelledConfirmed.cancellationPhase === 'confirmed_before_balance', 'confirmed cancellation records phase');
  assert(typeof cancelledConfirmed.refundToCreatorCents === 'number', 'confirmed cancellation records refund amount');

  const conversation = await api('GET', `/api/orders/${paid.order.id}/conversation`);
  const safeMessage = await api('POST', `/api/conversations/${conversation.id}/messages`, { content: 'See you at the cafe entrance.' });
  assert(safeMessage.riskStatus === 'clean', 'safe chat message is accepted');

  const blocked = await api('POST', `/api/conversations/${conversation.id}/messages`, { content: 'Add my wechat and pay offline.' }, { expectOk: false });
  assert(blocked.error?.code === 'MESSAGE_BLOCKED' && blocked.data?.matchedKeywords?.length, 'risky chat message is blocked');

  await api('POST', '/api/auth/wechat/mock-login', { role: 'admin' });
  const moderation = await api('GET', '/api/admin/moderation');
  const riskCase = moderation.messageCases?.[0];
  assert(riskCase?.id, 'admin moderation exposes risk case');

  const action = await api('POST', `/api/admin/moderation/${riskCase.id}/actions`, {
    actionType: 'restrict_chat',
    note: 'smoke test moderation action',
  });
  assert(action.status !== 'pending', 'moderation action updates case status');

  console.log(
    JSON.stringify(
      {
        ok: true,
        baseUrl,
        checks: [
          'health',
          'launch-check',
          'auth-session',
          'wechat-login',
          'mock-login',
          'admin-auth-boundary',
          'media-upload-policy',
          'feed',
          'matching',
          'quote',
          'create-order',
          'mini-program-payment-params',
          'mock-payment',
          'payment-status',
          'orders',
          'admin-order-status-boundary',
          'role-scoped-orders',
          'pending-payment-expiry',
          'confirmed-cancellation-settlement',
          'conversation',
          'risk-block',
          'moderation-action',
        ],
      },
      null,
      2,
    ),
  );
} finally {
  if (server && !server.killed) server.kill();
  await rm(tempDir, { recursive: true, force: true });
}

async function waitForHealth() {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 7000) {
    try {
      await api('GET', '/api/health');
      return;
    } catch {
      await delay(150);
    }
  }
  throw new Error(`server did not become healthy on ${baseUrl}`);
}

async function api(method, path, body, options = {}) {
  const headers = {};
  if (body) headers['content-type'] = 'application/json';
  if (authToken && !options.omitAuth) headers.authorization = `Bearer ${authToken}`;
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: Object.keys(headers).length ? headers : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json();
  const expectOk = options.expectOk !== false;
  if (expectOk && (!response.ok || payload.success !== true)) {
    throw new Error(`${method} ${path} failed: ${JSON.stringify(payload)}`);
  }
  if (!expectOk && response.ok && payload.success !== false) {
    throw new Error(`${method} ${path} unexpectedly succeeded`);
  }
  if (expectOk && payload.success === true && payload.data?.token) {
    authToken = payload.data.token;
  }
  return expectOk ? payload.data ?? payload : payload;
}

async function findBookablePost(feedItems) {
  for (const item of feedItems) {
    const post = await api('GET', `/api/posts/${item.id}`);
    const slot = post.companion.slots.find((candidate) => candidate.status === 'available');
    const activity = post.companion.activities[0];
    if (slot?.id && activity?.id) return { post, slot, activity };
  }
  throw new Error('No available slot found for expiry smoke check');
}

async function expirePendingOrderInStore(orderId) {
  const store = JSON.parse(await readFile(storePath, 'utf8'));
  const expiredAt = '2000-01-01T00:00:00.000Z';
  const order = store.orders.find((item) => item.id === orderId);
  assert(order, 'expiring order exists in store');
  order.paymentExpiresAt = expiredAt;
  const payment = store.payments.find((item) => item.orderId === orderId);
  if (payment) payment.expiresAt = expiredAt;
  const companion = store.companions.find((item) => item.id === order.companionId);
  const slot = companion?.slots.find((item) => item.id === order.slotId);
  if (slot) slot.lockExpiresAt = expiredAt;
  await writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
}

function assert(condition, message) {
  if (!condition) throw new Error(`Smoke check failed: ${message}`);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
