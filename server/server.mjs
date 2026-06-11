import http from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const storePath = process.env.STORE_PATH ? resolve(process.env.STORE_PATH) : resolve(root, 'data/store.json');
const port = Number(process.env.PORT || 8787);
const platformFeeRate = 0.08;

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
    if (req.method === 'OPTIONS') return send(res, 204, '');

    try {
      const url = new URL(req.url || '/', 'http://local');
      const store = await loadStore();
      const body = await readBody(req);
      const result = await route(req.method || 'GET', url, body, store);
      if (result.changed) await saveStore(store);
      sendJson(res, result.status, result.payload);
    } catch (error) {
      sendJson(res, 500, fail('SERVER_ERROR', error instanceof Error ? error.message : 'Server error'));
    }
  })
  .listen(port, () => console.log(`PP backend MVP listening on http://127.0.0.1:${port}`));

async function route(method, url, body, store) {
  const path = url.pathname;

  if (method === 'GET' && path === '/api/health') return json({ status: 'ok', version: '0.3.0', storeVersion: store.meta.version });
  if (method === 'GET' && path === '/api/auth/session') return authSession(store);
  if (method === 'POST' && path === '/api/auth/wechat/mock-login') return mockWechatLogin(store, body);
  if (method === 'POST' && path === '/api/auth/logout') return logout(store);
  if (method === 'GET' && path === '/api/feed/posts') return json({ items: listFeedPosts(store, url) });
  if (method === 'GET' && path === '/api/matching/companions') return matchCompanions(store, url);
  if (method === 'GET' && path.startsWith('/api/posts/')) return getPost(store, last(path));

  if (method === 'POST' && path === '/api/orders/quote') return quoteOrder(store, body);
  if (method === 'POST' && path === '/api/orders') return createOrder(store, body);
  if (method === 'GET' && path === '/api/orders') return listOrders(store, url);
  if (method === 'POST' && isNestedRoute(path, '/api/payments/', '/mock-success')) return mockPaymentSuccess(store, path);
  if (method === 'POST' && isNestedRoute(path, '/api/orders/', '/confirm')) return transitionOrder(store, path, 'confirm');
  if (method === 'POST' && isNestedRoute(path, '/api/orders/', '/complete')) return transitionOrder(store, path, 'complete');
  if (method === 'POST' && isNestedRoute(path, '/api/orders/', '/cancel')) return transitionOrder(store, path, 'cancel', body);
  if (method === 'POST' && isNestedRoute(path, '/api/orders/', '/status')) return setOrderStatus(store, path, body.status);

  if (method === 'GET' && isNestedRoute(path, '/api/orders/', '/conversation')) return getConversation(store, path);
  if (method === 'POST' && isNestedRoute(path, '/api/conversations/', '/messages')) return sendMessage(store, path, body);
  if (method === 'POST' && isNestedRoute(path, '/api/orders/', '/report')) return createReport(store, path, body);
  if (method === 'POST' && path === '/api/reports') return createReport(store, `/api/orders/${body.orderId || ''}/report`, body);

  if (method === 'GET' && path === '/api/companion/me') return companionDashboard(store);
  if (method === 'POST' && path === '/api/companion/me/application') return saveApplication(store, body);
  if (method === 'PUT' && path === '/api/companion/me/application') return saveApplication(store, body);
  if (method === 'POST' && path === '/api/companion/me/submit-review') return submitCompanionReview(store);

  if (method === 'GET' && path === '/api/admin/dashboard') return adminDashboard(store);
  if (method === 'GET' && path === '/api/admin/moderation') return adminModeration(store);
  if (method === 'GET' && path === '/api/admin/audit-cases') return listAuditCases(store, url);
  if (method === 'POST' && isNestedRoute(path, '/api/admin/audit-cases/', '/approve')) return reviewAuditCase(store, path, 'approved');
  if (method === 'POST' && isNestedRoute(path, '/api/admin/audit-cases/', '/reject')) return reviewAuditCase(store, path, 'rejected', body);
  if (method === 'POST' && isNestedRoute(path, '/api/admin/moderation/', '/actions')) return applyModerationAction(store, path, body);

  return error(404, 'NOT_FOUND', 'Route not found');
}

function listFeedPosts(store, url) {
  const city = normalize(url.searchParams.get('city'));
  const limit = clampNumber(toNumber(url.searchParams.get('limit')) ?? 20, 1, 50);
  return store.posts
    .filter((post) => post.status === 'approved' && post.isFeedVisible !== false)
    .filter((post) => !city || normalize(post.city).includes(city) || normalize(post.location).includes(city))
    .slice(0, limit);
}

function getPost(store, postId) {
  const post = store.posts.find((item) => item.id === postId);
  return post ? json(post) : error(404, 'NOT_FOUND', 'Post not found');
}

function authSession(store) {
  if (store.activeSession?.role) store.activeSession = createSession(store, normalizeRole(store.activeSession.role));
  else store.activeSession = createSession(store, 'consumer');
  return json(store.activeSession);
}

function mockWechatLogin(store, body = {}) {
  const role = normalizeRole(body.role);
  const session = createSession(store, role);
  store.activeSession = session;
  return json(session, 200, true);
}

function logout(store) {
  store.activeSession = null;
  return json({ ok: true }, 200, true);
}

function createSession(store, role) {
  const user = ensureDemoUser(store, role);
  const session = {
    token: `local-${role}-session`,
    provider: 'mock_wechat',
    role,
    roles: role === 'admin' ? ['consumer', 'companion', 'admin'] : role === 'companion' ? ['consumer', 'companion'] : ['consumer'],
    user,
    companionId: role === 'companion' ? store.companions[0]?.id || null : null,
    adminScope: role === 'admin' ? ['audit', 'orders', 'risk', 'finance'] : [],
    loginAt: now(),
  };
  return session;
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
      roles: role === 'admin' ? ['consumer', 'companion', 'admin'] : role === 'companion' ? ['consumer', 'companion'] : ['consumer'],
      createdAt: now(),
      updatedAt: now(),
    };
    store.users.push(user);
  }
  user.openId ||= `mock-openid-${role}`;
  user.nickname ||= role === 'admin' ? 'Demo Admin' : role === 'companion' ? 'Demo Companion' : 'Demo Consumer';
  user.status = user.status || 'active';
  user.isCompanion = role === 'companion';
  user.roles = role === 'admin' ? ['consumer', 'companion', 'admin'] : role === 'companion' ? ['consumer', 'companion'] : ['consumer'];
  user.updatedAt = now();
  return user;
}

function normalizeRole(role) {
  return ['consumer', 'companion', 'admin'].includes(role) ? role : 'consumer';
}

function quoteOrder(store, input) {
  const context = resolveOrderContext(store, input);
  if (context.error) return context.error;
  return json(buildQuote(context, input));
}

function createOrder(store, input) {
  const context = resolveOrderContext(store, input);
  if (context.error) return context.error;
  if (context.slot.status !== 'available') return error(409, 'ORDER_SLOT_UNAVAILABLE', 'Slot is not available');

  const quote = buildQuote(context, input);
  const orderId = id('order');
  const paymentId = id('payment');
  const order = viewOrder({
    id: orderId,
    orderNo: orderNo(),
    status: 'pending_payment',
    title: input.title || `${context.activity.name} booking`,
    time: context.slot.label,
    place: input.placeName || input.place || context.post.locationName || context.post.location,
    amountCents: quote.totalAmountCents,
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
    paymentId,
    createdAt: now(),
    statusLogs: [statusLog('pending_payment', 'Order created and slot locked')],
  });

  context.slot.status = 'locked';
  context.slot.lockedOrderId = order.id;
  store.orders.unshift(order);
  store.payments.unshift({
    id: paymentId,
    paymentId,
    paymentNo: paymentNo(),
    orderId: order.id,
    channel: input.channel || 'mock_wechat',
    status: 'pending',
    amountCents: quote.totalAmountCents,
    payPayload: { mode: 'mock', next: `/api/payments/${paymentId}/mock-success` },
    createdAt: now(),
  });

  return json({ ...order, payment: publicPayment(store.payments[0]) }, 201, true);
}

function mockPaymentSuccess(store, path) {
  const paymentId = path.split('/')[3];
  const payment = store.payments.find((item) => item.id === paymentId || item.paymentId === paymentId);
  if (!payment) return error(404, 'NOT_FOUND', 'Payment not found');
  if (payment.status === 'paid') {
    const paidOrder = store.orders.find((item) => item.id === payment.orderId);
    return json({ payment: publicPayment(payment), order: paidOrder ? viewOrder(paidOrder) : null });
  }

  const order = store.orders.find((item) => item.id === payment.orderId);
  if (!order) return error(404, 'NOT_FOUND', 'Order not found');
  if (order.status !== 'pending_payment') return error(409, 'ORDER_STATUS_INVALID', 'Order is not pending payment');

  payment.status = 'paid';
  payment.paidAt = now();
  Object.assign(order, viewOrder({ ...order, status: 'paid_pending_confirm', paidAt: now() }));
  order.statusLogs = [...(order.statusLogs || []), statusLog('paid_pending_confirm', 'Mock payment succeeded')];

  const companion = store.companions.find((item) => item.id === order.companionId);
  const slot = companion?.slots.find((item) => item.id === order.slotId);
  if (slot) {
    slot.status = 'booked';
    slot.lockedOrderId = order.id;
  }
  store.conversations[order.id] ||= createConversation(order);

  return json({ payment: publicPayment(payment), order: viewOrder(order), conversation: store.conversations[order.id] }, 200, true);
}

function listOrders(store, url) {
  const role = normalize(url.searchParams.get('role') || 'user');
  const status = normalize(url.searchParams.get('status'));
  const items = store.orders
    .filter((order) => !status || normalize(order.status) === status)
    .filter((order) => role !== 'companion' || order.companionId)
    .map(viewOrder);
  return json({ items });
}

function transitionOrder(store, path, action, body = {}) {
  const order = findOrder(store, path.split('/')[3]);
  if (!order) return error(404, 'NOT_FOUND', 'Order not found');

  if (action === 'confirm') {
    if (order.status !== 'paid_pending_confirm') return error(409, 'ORDER_STATUS_INVALID', 'Order cannot be confirmed');
    return updateOrder(store, order, 'confirmed', 'Companion confirmed order');
  }

  if (action === 'complete') {
    if (!['confirmed', 'in_service'].includes(order.status)) return error(409, 'ORDER_STATUS_INVALID', 'Order cannot be completed');
    const result = updateOrder(store, order, 'completed', 'Order completed');
    createSettlement(store, order);
    return result;
  }

  if (action === 'cancel') {
    if (['completed', 'refunded'].includes(order.status)) return error(409, 'ORDER_STATUS_INVALID', 'Order cannot be cancelled');
    releaseSlot(store, order);
    const result = updateOrder(store, order, order.status === 'pending_payment' ? 'cancelled' : 'refunding', body.reason || 'Order cancelled');
    if (order.status === 'refunding') createRefund(store, order, body.reason || 'Order cancelled');
    return result;
  }

  return error(400, 'VALIDATION_ERROR', 'Unknown action');
}

function setOrderStatus(store, path, status) {
  const order = findOrder(store, path.split('/')[3]);
  if (!order) return error(404, 'NOT_FOUND', 'Order not found');
  if (!orderStatusText[status]) return error(400, 'VALIDATION_ERROR', 'Unknown order status');
  const result = updateOrder(store, order, status, 'Manual status update');
  if (status === 'completed') createSettlement(store, order);
  return result;
}

function updateOrder(store, order, status, reason) {
  Object.assign(order, viewOrder({ ...order, status }));
  order.statusLogs = [...(order.statusLogs || []), statusLog(status, reason)];
  return json(viewOrder(order), 200, true);
}

function getConversation(store, path) {
  const order = findOrder(store, path.split('/')[3]);
  if (!order) return error(404, 'NOT_FOUND', 'Order not found');
  if (!['paid_pending_confirm', 'confirmed', 'in_service', 'completed', 'disputed'].includes(order.status)) {
    return error(409, 'ORDER_STATUS_INVALID', 'Conversation opens after payment');
  }
  store.conversations[order.id] ||= createConversation(order);
  return json(store.conversations[order.id], 200, true);
}

function sendMessage(store, path, body) {
  const conversationId = path.split('/')[3];
  const conversation = Object.values(store.conversations).find((item) => item.id === conversationId);
  if (!conversation) return error(404, 'NOT_FOUND', 'Conversation not found');
  if (conversation.status === 'restricted') return error(403, 'FORBIDDEN', 'Conversation is restricted');

  const content = String(body.content || '').trim();
  if (!content) return error(400, 'VALIDATION_ERROR', 'Message content is required');

  const risk = evaluateRisk(content);
  if (risk.shouldBlock) {
    const blockedMessage = {
      id: id('blocked-message'),
      from: body.from || 'user',
      text: content,
      sentAt: now(),
      riskStatus: 'blocked',
    };
    const order = findOrder(store, conversation.orderId);
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
    from: body.from || 'user',
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

function createReport(store, path, body) {
  const orderId = path.split('/')[3] || body.orderId;
  const order = findOrder(store, orderId);
  if (!order) return error(404, 'NOT_FOUND', 'Order not found');

  const report = {
    id: id('report'),
    type: 'report_dispute',
    status: 'pending',
    riskLevel: body.riskLevel || 'medium',
    riskLabel: body.category || body.reason || 'Order dispute',
    reporterRole: body.reporterRole || 'user',
    reporterName: body.reporterRole === 'companion' ? order.companion : 'Demo user',
    targetName: body.reporterRole === 'companion' ? 'Demo user' : order.companion,
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

function companionDashboard(store) {
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
  store.application = { ...store.application, ...body, submitted: false, reviewStatus: 'draft', updatedAt: now() };
  return json(store.application, 200, true);
}

function submitCompanionReview(store) {
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

function adminModeration(store) {
  return json({
    messageCases: store.riskCases,
    reportCases: store.reports,
  });
}

function listAuditCases(store, url) {
  const targetType = normalize(url.searchParams.get('targetType'));
  const status = normalize(url.searchParams.get('status'));
  const items = store.auditCases
    .filter((item) => !targetType || normalize(item.targetType) === targetType)
    .filter((item) => !status || normalize(item.status) === status);
  return json({ items });
}

function reviewAuditCase(store, path, nextStatus, body = {}) {
  const caseId = path.split('/')[4];
  const auditCase = store.auditCases.find((item) => item.id === caseId);
  if (!auditCase) return error(404, 'NOT_FOUND', 'Audit case not found');
  if (auditCase.status !== 'pending') return error(409, 'AUDIT_CASE_NOT_PENDING', 'Audit case is not pending');

  auditCase.status = nextStatus;
  auditCase.resolvedAt = now();
  auditCase.logs = [
    { id: id('audit-log'), action: nextStatus, note: body.reason || nextStatus, createdAt: now() },
    ...(auditCase.logs || []),
  ];

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

  store.adminActionLogs.unshift({
    id: id('admin-action'),
    type: `audit_${nextStatus}`,
    targetType: auditCase.targetType,
    targetId: auditCase.targetId,
    note: body.reason || nextStatus,
    createdAt: now(),
  });

  return json({ ok: true, auditCase }, 200, true);
}

function applyModerationAction(store, path, body) {
  const caseId = path.split('/')[4];
  const actionType = body.actionType || 'confirm_violation';
  const log = {
    id: id('action'),
    type: actionType,
    label: actionLabel(actionType),
    note: body.note || actionLabel(actionType),
    createdAt: now(),
  };

  const riskCase = store.riskCases.find((item) => item.id === caseId);
  if (riskCase) {
    riskCase.status = nextMessageCaseStatus(actionType, riskCase.status);
    riskCase.actionLogs = [log, ...(riskCase.actionLogs || [])];
    applyModerationSideEffect(store, riskCase.orderId, actionType);
    return json(riskCase, 200, true);
  }

  const reportCase = store.reports.find((item) => item.id === caseId);
  if (reportCase) {
    reportCase.status = nextReportCaseStatus(actionType, reportCase.status);
    reportCase.actionLogs = [log, ...(reportCase.actionLogs || [])];
    applyModerationSideEffect(store, reportCase.orderId, actionType);
    return json(reportCase, 200, true);
  }

  return error(404, 'NOT_FOUND', 'Moderation case not found');
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
    amountCents: order.amountCents,
    reason,
    status: 'pending',
    createdAt: now(),
  });
}

function releaseSlot(store, order) {
  const companion = store.companions.find((item) => item.id === order.companionId);
  const slot = companion?.slots.find((item) => item.id === order.slotId);
  if (!slot) return;
  slot.status = 'available';
  delete slot.lockedOrderId;
}

function createConversation(order) {
  return {
    id: `conversation-${order.id}`,
    orderId: order.id,
    orderNo: order.orderNo,
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

async function loadStore() {
  let store;
  try {
    store = JSON.parse(await readFile(storePath, 'utf8'));
  } catch {
    store = initialStore();
  }
  const normalized = normalizeStore(store);
  if (normalized.changed) await saveStore(normalized.store);
  return normalized.store;
}

function normalizeStore(store) {
  let changed = false;
  const next = { ...initialStore(), ...store };
  next.meta = { ...(store.meta || {}), version: 3 };
  next.companions = Array.isArray(store.companions) && store.companions.length ? store.companions : initialStore().companions;
  next.posts = Array.isArray(store.posts) && store.posts.length ? store.posts : initialStore().posts;
  next.users = Array.isArray(store.users) ? store.users : [];
  next.activeSession = store.activeSession || null;
  next.orders = Array.isArray(store.orders) ? store.orders : [];
  next.payments = Array.isArray(store.payments) ? store.payments : [];
  next.conversations = store.conversations && typeof store.conversations === 'object' ? store.conversations : {};
  next.riskCases = Array.isArray(store.riskCases) ? store.riskCases : [];
  next.messageRiskEvents = Array.isArray(store.messageRiskEvents) ? store.messageRiskEvents : [];
  next.reports = Array.isArray(store.reports) ? store.reports : [];
  next.auditCases = Array.isArray(store.auditCases) ? store.auditCases : seedAuditCases(next);
  next.auditLogs = Array.isArray(store.auditLogs) ? store.auditLogs : [];
  next.adminActionLogs = Array.isArray(store.adminActionLogs) ? store.adminActionLogs : [];
  next.settlements = Array.isArray(store.settlements) ? store.settlements : [];
  next.ledgerEntries = Array.isArray(store.ledgerEntries) ? store.ledgerEntries : [];
  next.refunds = Array.isArray(store.refunds) ? store.refunds : [];
  next.wallets = Array.isArray(store.wallets) ? store.wallets : [];
  next.application = store.application || { reviewStatus: 'draft', updatedAt: now() };
  next.workDraft = store.workDraft || { reviewStatus: 'draft', updatedAt: now() };

  if (seedVirtualData(next)) changed = true;
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
    settlements: [],
    ledgerEntries: [],
    refunds: [],
    wallets: [],
    application: { reviewStatus: 'draft', updatedAt: now() },
    workDraft: { reviewStatus: 'draft', updatedAt: now() },
  };
}

function seedVirtualData(store) {
  let changed = false;
  const profiles = [
    ['Luna', 'female', '武康路', 'Citywalk', 39900, ['Citywalk', '自然光', '松弛感', '今天可拍'], '温柔沟通，会先帮你确认穿搭和路线，现场以自然走动抓拍为主。', 'https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80'],
    ['Aki', 'female', '巨鹿路', '探店', 32900, ['探店', '日常感', '咖啡店', '今天可拍'], '熟悉咖啡店和街角光线，适合轻松日常头像和朋友圈照片。', 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&q=80'],
    ['Mika', 'female', '苏州河', '夜景', 29900, ['夜景', '蓝调', '散步', '今天可拍'], '熟悉夜景人流和安全路线，会提醒集合点、动线和收尾时间。', 'https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=240&q=80'],
    ['Rin', 'female', '新天地', '城市街拍', 42900, ['城市感', '街拍', '小红书', '今天可拍'], '擅长红砖、玻璃、街巷背景，适合利落一点的城市人像。', 'https://images.unsplash.com/photo-1512316609839-ce289d3eba0a?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1526510747491-58f928ec870f?auto=format&fit=crop&w=240&q=80'],
  ];

  for (const [index, profile] of profiles.entries()) {
    const [name, gender, area, activityName, priceCents, styleTags, bio, image, avatar] = profile;
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
      tags: ['虚拟摄影师', '路线规划', '会指导动作'],
      safetyBadges: ['虚拟样例', '平台托管', '可测试预约'],
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
    } else if (existingCompanion.baseCity !== '上海' || !existingCompanion.areas?.includes(area)) {
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
      timeLabel: '今天可拍 / 虚拟样例 / 可替换资料',
      caption: `${bio} 这是一条虚拟摄影师样例资料，用于测试图片流、详情、预约和下单流程。`,
      styleTags: [...styleTags],
      activity: activityName,
      images: [{ id: `${postId}-image-1`, url: image, width: 900, height: 1200, sortOrder: 1 }],
      companion,
    };
    const postIndex = store.posts.findIndex((item) => item.id === postId);
    const existingPost = postIndex >= 0 ? store.posts[postIndex] : null;
    if (!existingPost) {
      store.posts.push(postData);
      changed = true;
    } else if (existingPost.city !== '上海' || existingPost.locationName !== area) {
      store.posts[postIndex] = postData;
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
    Object.assign(order, viewOrder(order));
    if (['paid_pending_confirm', 'confirmed', 'in_service', 'completed', 'disputed'].includes(order.status)) {
      store.conversations[order.id] ||= createConversation(order);
    }
    const companion = store.companions.find((item) => item.id === order.companionId);
    const slot = companion?.slots.find((item) => item.id === order.slotId);
    if (slot && order.status !== 'cancelled' && order.status !== 'refunded') {
      slot.status = order.status === 'pending_payment' ? 'locked' : 'booked';
      slot.lockedOrderId = order.id;
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
  return {
    paymentId: payment.id,
    paymentNo: payment.paymentNo,
    channel: payment.channel,
    status: payment.status,
    amountCents: payment.amountCents,
    amountText: formatMoney(payment.amountCents),
    payPayload: payment.payPayload || {},
    paidAt: payment.paidAt,
  };
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

async function saveStore(store) {
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2), 'utf8');
}

async function readBody(req) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method || '')) return {};
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

function json(data, status = 200, changed = false) {
  return { status, changed, payload: ok(data) };
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

function sendJson(res, status, payload) {
  send(res, status, JSON.stringify(payload), 'application/json; charset=utf-8');
}

function send(res, status, payload, contentType = 'text/plain; charset=utf-8') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-PP-Role, X-PP-User-Id',
  });
  res.end(payload);
}

function now() {
  return new Date().toISOString();
}
