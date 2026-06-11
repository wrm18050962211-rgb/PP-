import { mkdtemp, rm } from 'node:fs/promises';
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

try {
  server = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    env: { ...process.env, PORT: String(port), STORE_PATH: storePath },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const logs = [];
  server.stdout.on('data', (chunk) => logs.push(String(chunk)));
  server.stderr.on('data', (chunk) => logs.push(String(chunk)));

  await waitForHealth();

  const health = await api('GET', '/api/health');
  assert(health.status === 'ok', 'health returns ok');

  const session = await api('GET', '/api/auth/session');
  assert(session.role === 'consumer' && session.user?.id, 'default auth session is consumer');

  const companionSession = await api('POST', '/api/auth/wechat/mock-login', { role: 'companion' });
  assert(companionSession.role === 'companion' && companionSession.companionId, 'mock login can switch to companion role');

  const adminSession = await api('POST', '/api/auth/wechat/mock-login', { role: 'admin' });
  assert(adminSession.role === 'admin' && adminSession.adminScope?.includes('risk'), 'mock login can switch to admin role');

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

  const paid = await api('POST', `/api/payments/${order.payment.paymentId}/mock-success`);
  assert(paid.order.status === 'paid_pending_confirm' && paid.conversation?.id, 'mock payment pays order and opens conversation');

  const orders = await api('GET', '/api/orders?role=user');
  assert(orders.items.some((item) => item.id === paid.order.id), 'paid order appears in order list');

  const conversation = await api('GET', `/api/orders/${paid.order.id}/conversation`);
  const safeMessage = await api('POST', `/api/conversations/${conversation.id}/messages`, { content: 'See you at the cafe entrance.' });
  assert(safeMessage.riskStatus === 'clean', 'safe chat message is accepted');

  const blocked = await api('POST', `/api/conversations/${conversation.id}/messages`, { content: 'Add my wechat and pay offline.' }, { expectOk: false });
  assert(blocked.error?.code === 'MESSAGE_BLOCKED' && blocked.data?.matchedKeywords?.length, 'risky chat message is blocked');

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
          'auth-session',
          'mock-login',
          'feed',
          'matching',
          'quote',
          'create-order',
          'mock-payment',
          'orders',
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
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
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
  return expectOk ? payload.data ?? payload : payload;
}

function assert(condition, message) {
  if (!condition) throw new Error(`Smoke check failed: ${message}`);
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}
