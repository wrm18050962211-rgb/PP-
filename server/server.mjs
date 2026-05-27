import http from 'node:http';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const storePath = resolve(root, 'data/store.json');
const port = Number(process.env.PORT || 8787);
const virtualProfiles = [
  ['Luna', 'female', '武康路', ['武康路', '安福路', '湖南路', '衡山路'], 'Citywalk 陪拍', ['自然抓拍', '会指导动作', '适合第一次拍照'], ['Citywalk', '自然光', '松弛感'], '偏温柔沟通，会先帮你确认穿搭和路线，现场以自然走动抓拍为主。', 39900, 120, 'https://images.unsplash.com/photo-1524250502761-1ac6f2e30d43?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80'],
  ['Aki', 'female', '巨鹿路', ['巨鹿路', '富民路', '长乐路', '静安寺'], '探店生活照', ['探店构图', '小红书风格', '穿搭建议'], ['探店', '日常感', '咖啡店'], '熟悉咖啡店和街角光线，适合想要轻松日常头像和朋友圈照片的用户。', 32900, 90, 'https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=240&q=80'],
  ['Rin', 'female', '新天地', ['新天地', '淮海中路', '思南路', '复兴公园'], '城市街拍', ['都市感', '干净构图', '情绪引导'], ['城市感', '街拍', '高级感'], '擅长红砖、玻璃、街巷背景，适合想要利落一点的城市人像。', 42900, 120, 'https://images.unsplash.com/photo-1512316609839-ce289d3eba0a?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1526510747491-58f928ec870f?auto=format&fit=crop&w=240&q=80'],
  ['Mika', 'female', '苏州河', ['苏州河', '外滩源', '北外滩', '南京东路'], '夜景散步', ['夜景路线熟', '安全提醒', '游客友好'], ['夜景', '蓝调', '旅行感'], '熟悉夜景人流和安全路线，会提醒集合点、动线和收尾时间。', 29900, 60, 'https://images.unsplash.com/photo-1492707892479-7bc8d5a4ee93?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=240&q=80'],
  ['Yoyo', 'female', '徐家汇', ['徐家汇', '衡山路', '徐汇滨江', '天平路'], '校园感写真', ['清新风格', '笑容引导', '适合学生党'], ['清新', '校园感', '自然光'], '偏清爽自然的照片，会帮助缓解镜头尴尬，适合学生和毕业季。', 26900, 90, 'https://images.unsplash.com/photo-1488426862026-3ee34a7d66df?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1524504388940-b1c1722653e1?auto=format&fit=crop&w=240&q=80'],
  ['Cici', 'female', '外滩', ['外滩', '外白渡桥', '圆明园路', '南京东路'], '旅行跟拍', ['游客路线', '地标机位', '出片效率高'], ['旅行', '地标', '明亮'], '适合来上海短暂停留的游客，路线紧凑，优先保证地标合影和自然抓拍。', 69900, 240, 'https://images.unsplash.com/photo-1502325966718-85a90488dc29?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1515372039744-b8f02a3ae446?auto=format&fit=crop&w=240&q=80'],
  ['Niko', 'male', '愚园路', ['愚园路', '中山公园', '江苏路', '番禺路'], '男生头像', ['男生友好', '不尴尬', '街头感'], ['街头', '头像', '松弛'], '适合男生头像、社交主页照片，会用简单指令减少摆拍感。', 29900, 90, 'https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=240&q=80'],
  ['Sora', 'female', '静安寺', ['静安寺', '南京西路', '铜仁路', '常德路'], '通勤形象照', ['职业形象', '干净背景', '效率高'], ['通勤', '简洁', '职业感'], '适合 LinkedIn、简历、商务社交头像，路线会避开过度游客化背景。', 45900, 120, 'https://images.unsplash.com/photo-1529139574466-a303027c1d8b?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?auto=format&fit=crop&w=240&q=80'],
  ['Peach', 'female', '滨江', ['徐汇滨江', '龙美术馆', '油罐艺术中心', '西岸'], '宠物友好陪拍', ['宠物友好', '耐心等待', '户外路线'], ['宠物', '户外', '暖色'], '可以陪同宠物出镜，节奏会留出休息和互动时间，适合轻松户外照。', 36900, 120, 'https://images.unsplash.com/photo-1517423440428-a5a00ad493e8?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1520813792240-56fc4a3765a7?auto=format&fit=crop&w=240&q=80'],
  ['Bean', 'female', '田子坊', ['田子坊', '打浦桥', '瑞金二路', '思南路'], '复古胶片感', ['复古色调', '老街路线', '情绪片'], ['复古', '胶片感', '老街'], '偏复古和情绪表达，会选择老街、门窗、墙面做背景，适合安静风格。', 39900, 120, 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?auto=format&fit=crop&w=900&q=80', 'https://images.unsplash.com/photo-1495385794356-15371f348c31?auto=format&fit=crop&w=240&q=80'],
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
  .listen(port, () => console.log('PP backend v2 listening on http://127.0.0.1:' + port));

async function route(method, url, body, store) {
  const path = url.pathname;
  if (method === 'GET' && path === '/api/health') return json({ status: 'ok', version: '0.2.0' });
  if (method === 'GET' && path === '/api/feed/posts') return json({ items: store.posts });
  if (method === 'GET' && path.startsWith('/api/posts/')) return jsonOr404(store.posts.find((item) => item.id === last(path)), 'Post');
  if (method === 'GET' && path === '/api/orders') return json({ items: store.orders });
  if (method === 'POST' && path === '/api/orders') return createOrder(store, body);
  if (method === 'POST' && isNestedRoute(path, '/api/orders/', '/confirm')) return setLifecycleStatus(store, path, 'confirm');
  if (method === 'POST' && isNestedRoute(path, '/api/orders/', '/complete')) return setLifecycleStatus(store, path, 'complete');
  if (method === 'POST' && isNestedRoute(path, '/api/orders/', '/cancel')) return setLifecycleStatus(store, path, 'cancel');
  if (method === 'POST' && isNestedRoute(path, '/api/orders/', '/status')) return setOrderStatus(store, path, body.status);
  if (method === 'GET' && isNestedRoute(path, '/api/orders/', '/conversation')) return getConversation(store, path);
  if (method === 'POST' && isNestedRoute(path, '/api/orders/', '/report')) return createReport(store, path, body);
  if (method === 'POST' && isNestedRoute(path, '/api/conversations/', '/messages')) return sendMessage(store, path, body);
  if (method === 'GET' && path === '/api/companion/me') return companionDashboard(store);
  if (method === 'GET' && path === '/api/admin/dashboard') return adminDashboard(store);
  if (method === 'GET' && path === '/api/admin/moderation') return json({ messageCases: store.riskCases, reportCases: store.reports });
  if (method === 'POST' && isNestedRoute(path, '/api/admin/moderation/', '/actions')) return applyModerationAction(store, path, body);
  if (method === 'POST' && path === '/api/companion/me/application') {
    store.application = { ...store.application, ...body, submitted: false, reviewStatus: '草稿', updatedAt: now() };
    return json(store.application, 200, true);
  }
  if (method === 'POST' && path === '/api/companion/me/submit-review') {
    store.application = { ...store.application, submitted: true, reviewStatus: '待审核', updatedAt: now() };
    return json(store.application, 200, true);
  }
  return error(404, 'NOT_FOUND', 'Route not found');
}

function createOrder(store, input) {
  const companion = store.companions.find((item) => item.id === input.companionId);
  const slot = companion?.slots.find((item) => item.id === input.slotId);
  if (!companion || !slot) return error(404, 'NOT_FOUND', 'Companion or slot not found');
  if (slot.status !== 'available') return error(409, 'ORDER_SLOT_UNAVAILABLE', 'Slot is not available');

  slot.status = 'booked';
  const order = viewOrder({
    ...input,
    id: 'order-' + Date.now(),
    orderNo: 'PP' + String(Date.now()).slice(-8),
    status: 'paid_pending_confirm',
    createdAt: now(),
  });
  store.orders.unshift(order);
  store.payments.push({ id: 'payment-' + Date.now(), orderId: order.id, status: 'paid', amountCents: order.amountCents, paidAt: now() });
  store.conversations[order.id] = createConversation(order);
  return json(order, 200, true);
}

function setLifecycleStatus(store, path, action) {
  const order = findOrder(store, path.split('/')[3]);
  if (!order) return error(404, 'NOT_FOUND', 'Order not found');
  if (action === 'confirm' && order.status !== 'paid_pending_confirm') return error(409, 'ORDER_STATUS_INVALID', 'Order cannot be confirmed');
  if (action === 'complete' && !['confirmed', 'in_service'].includes(order.status)) return error(409, 'ORDER_STATUS_INVALID', 'Order cannot be completed');

  const status = action === 'confirm' ? 'confirmed' : action === 'complete' ? 'completed' : 'cancelled';
  Object.assign(order, viewOrder({ ...order, status }));
  if (status === 'completed') createSettlement(store, order);
  return json(order, 200, true);
}

function setOrderStatus(store, path, status) {
  const order = findOrder(store, path.split('/')[3]);
  if (!order) return error(404, 'NOT_FOUND', 'Order not found');
  Object.assign(order, viewOrder({ ...order, status }));
  if (status === 'completed') createSettlement(store, order);
  return json(order, 200, true);
}

function getConversation(store, path) {
  const order = findOrder(store, path.split('/')[3]);
  if (!order) return error(404, 'NOT_FOUND', 'Order not found');
  store.conversations[order.id] ||= createConversation(order);
  return json(store.conversations[order.id], 200, true);
}

function sendMessage(store, path, body) {
  const conversationId = path.split('/')[3];
  const conversation = Object.values(store.conversations).find((item) => item.id === conversationId);
  if (!conversation) return error(404, 'NOT_FOUND', 'Conversation not found');
  const risk = evaluateRisk(body.content || '');
  if (risk.shouldBlock) {
    const order = findOrder(store, conversation.orderId);
    store.riskCases.unshift({
      id: 'risk-' + Date.now(),
      type: 'message_risk',
      status: 'pending',
      riskLevel: 'high',
      riskLabel: '高风险拦截',
      conversationId,
      orderId: conversation.orderId,
      orderNo: conversation.orderNo,
      orderTitle: order?.title || '',
      orderStatusText: order?.statusText || '',
      orderAmountText: order?.amountText || '',
      userName: '用户',
      companionName: order?.companion || '',
      blockedMessage: { id: 'blocked-' + Date.now(), from: 'user', text: body.content || '', sentAt: now(), riskStatus: 'blocked' },
      hitWords: risk.hits,
      contextMessages: conversation.messages,
      createdAt: now(),
      actionLogs: [],
    });
    return error(422, 'MESSAGE_BLOCKED', 'Message blocked by risk control', true);
  }
  const message = { id: 'message-' + Date.now(), from: 'user', text: body.content || '', sentAt: now(), riskStatus: 'clean' };
  conversation.messages.push(message);
  return json(message, 200, true);
}

function createReport(store, path, body) {
  const order = findOrder(store, path.split('/')[3]);
  if (!order) return error(404, 'NOT_FOUND', 'Order not found');

  const report = {
    id: 'report-' + Date.now(),
    type: 'report_dispute',
    status: 'pending',
    riskLevel: 'medium',
    riskLabel: body.reason || '消息沟通举报',
    reporterRole: body.reporterRole || 'user',
    reporterName: body.reporterRole === 'companion' ? order.companion : '用户',
    targetName: body.reporterRole === 'companion' ? '用户' : order.companion,
    reason: body.reason || '消息沟通举报',
    description: body.description || '用户在消息页发起举报，等待运营复核聊天上下文。',
    orderId: order.id,
    orderNo: order.orderNo,
    orderTitle: order.title,
    orderStatusText: order.statusText,
    orderAmountText: order.amountText,
    createdAt: now(),
    actionLogs: [],
  };

  store.reports.unshift(report);
  return json(report, 200, true);
}

function applyModerationAction(store, path, body) {
  const caseId = path.split('/')[4];
  const actionType = body.actionType || 'confirm_violation';
  const note = body.note || actionLabel(actionType);
  const log = {
    id: 'action-' + Date.now(),
    type: actionType,
    label: actionLabel(actionType),
    note,
    createdAt: now(),
  };

  const riskCase = store.riskCases.find((item) => item.id === caseId);
  if (riskCase) {
    riskCase.status = nextMessageCaseStatus(actionType, riskCase.status);
    riskCase.actionLogs = [log, ...(riskCase.actionLogs || [])];
    if (actionType === 'freeze_order') {
      const order = findOrder(store, riskCase.orderId);
      if (order) Object.assign(order, viewOrder({ ...order, status: 'disputed' }));
    }
    return json(riskCase, 200, true);
  }

  const reportCase = store.reports.find((item) => item.id === caseId);
  if (reportCase) {
    reportCase.status = nextReportCaseStatus(actionType, reportCase.status);
    reportCase.actionLogs = [log, ...(reportCase.actionLogs || [])];
    if (actionType === 'freeze_order') {
      const order = findOrder(store, reportCase.orderId);
      if (order) Object.assign(order, viewOrder({ ...order, status: 'disputed' }));
    }
    return json(reportCase, 200, true);
  }

  return error(404, 'NOT_FOUND', 'Moderation case not found');
}

function actionLabel(actionType) {
  const labels = {
    release_message: '放行消息',
    confirm_violation: '确认为违规',
    warn_user: '警告用户',
    warn_companion: '警告陪拍者',
    restrict_chat: '限制聊天',
    freeze_order: '冻结订单',
    suspend_companion: '暂停陪拍者接单',
    resolve_report: '处理完成',
  };
  return labels[actionType] || '记录处置';
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

function createSettlement(store, order) {
  if (store.settlements.some((item) => item.orderId === order.id)) return;
  const commissionCents = Math.round(order.amountCents * 0.15);
  store.settlements.push({
    id: 'settlement-' + Date.now(),
    orderId: order.id,
    companionId: order.companionId,
    grossCents: order.amountCents,
    commissionCents,
    payableCents: order.amountCents - commissionCents,
    status: 'pending',
    createdAt: now(),
  });
}

function companionDashboard(store) {
  const completed = store.orders.filter((order) => order.status === 'completed');
  const pending = store.settlements.filter((item) => item.status === 'pending').reduce((sum, item) => sum + item.payableCents, 0);
  return json({
    weeklyEstimatedCents: completed.reduce((sum, order) => sum + order.amountCents, 0),
    pendingCents: pending,
    availableCents: 0,
    orderStats: [
      '待确认 ' + store.orders.filter((order) => order.status === 'paid_pending_confirm').length,
      '今日行程 ' + store.orders.filter((order) => order.status === 'confirmed').length,
      '已完成 ' + completed.length,
      '取消 ' + store.orders.filter((order) => order.status === 'cancelled').length,
    ],
  });
}

function adminDashboard(store) {
  return json({
    metrics: [
      { label: '待审核陪拍者', value: store.application.reviewStatus === '待审核' ? '1' : '0' },
      { label: '待审作品', value: store.workDraft.reviewStatus === '待审核' ? '1' : '0' },
      { label: '订单总数', value: String(store.orders.length) },
      { label: '风控拦截', value: String(store.riskCases.length) },
    ],
    moduleCards: [
      { title: '消息风控', desc: '联系方式、私下交易、敏感词' },
      { title: '举报纠纷', desc: '爽约、跳单、退款介入' },
      { title: '结算财务', desc: '抽成、提现、冻结结算' },
    ],
  });
}

function initialStore() {
  const companion = {
    id: 'companion-mori',
    userId: 'user-mori',
    name: 'Mori',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=240&q=80',
    photo: 'https://images.unsplash.com/photo-1495385794356-15371f348c31?auto=format&fit=crop&w=900&q=80',
    bio: '会聊天，也会帮你慢慢找角度，第一次拍照也不尴尬。',
    gender: 'female',
    baseCity: '上海',
    status: 'approved',
    serviceEnabled: true,
    ratingAvg: 4.9,
    ratingCount: 18,
    tags: ['会指导动作', '轻松聊天', '适合第一次拍照'],
    safetyBadges: ['已实名认证', '视频已审核', '平台担保'],
    areas: ['武康路', '安福路', '衡山路', '徐家汇'],
    slots: [
      slot('slot-mori-1', '5月26日 周二 10:00-12:00', '5月26日 周二', '10:00-12:00', '2026-05-26T02:00:00.000Z', '2026-05-26T04:00:00.000Z'),
      slot('slot-mori-2', '5月27日 周三 14:00-16:00', '5月27日 周三', '14:00-16:00', '2026-05-27T06:00:00.000Z', '2026-05-27T08:00:00.000Z'),
    ],
    activities: [activity('activity-citywalk', 'Citywalk', 120, '2小时', 39900), activity('activity-cafe', '探店吃饭', 90, '1.5小时', 29900)],
    extras: [extra('extra-retouch', '精修', 'per_photo', '张', 3000), extra('extra-rush', '加急出图', 'per_order', '单', 8000)],
  };
  const post = {
    id: 'post-wukang',
    location: '上海 · 武康路',
    timeLabel: '傍晚 / 春季 / 2026年5月',
    caption: '黄昏的梧桐树影很温柔，适合边散步边拍松弛感街拍。',
    styleTags: ['Citywalk', '自然光', '松弛感'],
    activity: 'Citywalk 陪拍',
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
    meta: { version: 2, createdAt: now() },
    companions: [companion],
    posts: [post],
    orders: [order],
    payments: [],
    conversations: { [order.id]: createConversation(order) },
    riskCases: [],
    reports: [],
    settlements: [],
    application: { reviewStatus: '草稿', updatedAt: now() },
    workDraft: { reviewStatus: '草稿', updatedAt: now() },
  };
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

function createConversation(order) {
  return {
    id: 'conversation-' + order.id,
    orderId: order.id,
    orderNo: order.orderNo,
    status: 'active',
    safetyNotice: '请勿交换联系方式或私下付款。',
    messages: [
      { id: 'message-' + order.id + '-1', from: 'companion', text: '我看了你收藏的风格，可以先确认集合点和拍摄路线。', sentAt: now(), riskStatus: 'clean' },
      { id: 'message-' + order.id + '-2', from: 'user', text: '好呀，我想要自然一点的照片。', sentAt: now(), riskStatus: 'clean' },
    ],
  };
}

function viewOrder(order) {
  const map = { pending_payment: '待支付', paid_pending_confirm: '待确认', confirmed: '已确认', in_service: '服务中', completed: '已完成', cancelled: '已取消', refunding: '退款中', refunded: '已退款', disputed: '争议处理中' };
  const stepMap = { pending_payment: 0, paid_pending_confirm: 1, confirmed: 2, in_service: 2, completed: 3 };
  return { ...order, statusText: map[order.status] || order.status, amountText: formatMoney(order.amountCents), steps: ['已下单', '已支付', '已确认', '已完成'], currentStep: stepMap[order.status] ?? 0 };
}

function evaluateRisk(content) {
  const compact = String(content || '').normalize('NFKC').toLowerCase().replace(/[\s\p{P}\p{S}_]+/gu, '');
  const hits = ['微信', 'vx', 'v信', '电话', '手机号', '加我', '私下付', '线下付', '转账', '收款码']
    .filter((keyword) => compact.includes(keyword))
    .map((keyword) => ({ keyword, label: '风险词', level: 'high' }));
  return { level: hits.length ? 'high' : 'clean', hits, shouldBlock: hits.length > 0 };
}

function findOrder(store, id) {
  return store.orders.find((order) => order.id === id);
}

function jsonOr404(data, name) {
  return data ? json(data) : error(404, 'NOT_FOUND', name + ' not found');
}

function last(path) {
  return decodeURIComponent(path.split('/').pop() || '');
}

function isNestedRoute(path, prefix, suffix) {
  return path.startsWith(prefix) && path.endsWith(suffix) && path.length > prefix.length + suffix.length;
}

function formatMoney(cents) {
  const yuan = Math.round(Number(cents || 0)) / 100;
  return '¥' + (Number.isInteger(yuan) ? yuan : yuan.toFixed(2));
}

async function loadStore() {
  let store;
  try {
    store = JSON.parse(await readFile(storePath, 'utf8'));
  } catch {
    store = initialStore();
    const normalizedStore = normalizeStore(store);
    await saveStore(normalizedStore);
    return normalizedStore;
  }
  return normalizeStore(store);
}

function normalizeStore(store) {
  store.riskCases ||= [];
  store.reports ||= [];
  store.settlements ||= [];
  store.conversations ||= {};
  injectVirtualSeeds(store);
  for (const order of store.orders || []) {
    Object.assign(order, viewOrder(order));
    const companion = store.companions?.find((item) => item.id === order.companionId);
    const slot = companion?.slots?.find((item) => item.id === order.slotId);
    if (slot && order.status !== 'cancelled' && order.status !== 'refunded') slot.status = 'booked';
  }
  return store;
}

function injectVirtualSeeds(store) {
  store.companions ||= [];
  store.posts ||= [];
  const existingCompanionIds = new Set(store.companions.map((item) => item.id));
  const existingPostIds = new Set(store.posts.map((item) => item.id));

  virtualProfiles.forEach((profile, index) => {
    const companion = createVirtualCompanion(profile, index);
    const post = createVirtualPost(profile, companion, index);
    if (!existingCompanionIds.has(companion.id)) store.companions.push(companion);
    if (!existingPostIds.has(post.id)) store.posts.push(post);
  });
}

function createVirtualPost(profile, companion, index) {
  const [, , area, , activityName, , styleTags, bio, , , image, avatar] = profile;
  return {
    id: 'virtual-post-' + (index + 1),
    location: '上海 · ' + area,
    timeLabel: (index % 2 === 0 ? '下午' : '傍晚') + ' / 虚拟样例 / 可替换资料',
    caption: bio + ' 这是一条虚拟陪拍者样例资料，用于填充页面和调试预约流程。',
    styleTags: [...styleTags, '虚拟样例'],
    activity: activityName,
    images: [
      { id: 'virtual-post-' + (index + 1) + '-image-1', url: image, width: 900, height: 1200, sortOrder: 1 },
      { id: 'virtual-post-' + (index + 1) + '-image-2', url: avatar, width: 900, height: 1200, sortOrder: 2 },
    ],
    companion,
  };
}

function createVirtualCompanion(profile, index) {
  const [name, gender, , areas, activityName, tags, , bio, priceCents, durationMinutes, image, avatar] = profile;
  return {
    id: 'virtual-companion-' + (index + 1),
    userId: 'virtual-user-' + (index + 1),
    name,
    isVirtual: true,
    avatar,
    photo: image,
    bio,
    gender,
    baseCity: '上海',
    status: 'approved',
    serviceEnabled: true,
    ratingAvg: 4.6 + (index % 4) / 10,
    ratingCount: 8 + index * 3,
    tags,
    safetyBadges: ['虚拟样例', '资料待替换', '流程演示'],
    areas,
    slots: createVirtualSlots(index),
    activities: [
      activity('virtual-activity-' + (index + 1) + '-main', activityName, durationMinutes, durationLabel(durationMinutes), priceCents),
      activity('virtual-activity-' + (index + 1) + '-light', '轻量头像快拍', 60, '1小时', Math.max(priceCents - 12000, 19900)),
    ],
    extras: [
      extra('virtual-extra-' + (index + 1) + '-retouch', '精修', 'per_photo', '张', 3000),
      extra('virtual-extra-' + (index + 1) + '-rush', '加急出图', 'per_order', '单', 8000),
      extra('virtual-extra-' + (index + 1) + '-video', '短视频花絮', 'per_order', '单', 12000),
    ],
  };
}

function createVirtualSlots(index) {
  const day = 28 + (index % 5);
  const hour = 10 + (index % 7);
  return [
    virtualSlot(index, 1, '明天 ' + hour + ':00', '2026-05-' + pad(day) + 'T' + pad(hour - 8) + ':00:00.000Z', '2026-05-' + pad(day) + 'T' + pad(hour - 6) + ':00:00.000Z'),
    virtualSlot(index, 2, '周五 ' + (hour + 2) + ':30', '2026-05-' + pad(day + 1) + 'T' + pad(hour - 6) + ':30:00.000Z', '2026-05-' + pad(day + 1) + 'T' + pad(hour - 4) + ':30:00.000Z'),
    virtualSlot(index, 3, '周末 ' + (hour + 4) + ':00', '2026-06-' + pad((index % 3) + 1) + 'T' + pad(hour - 4) + ':00:00.000Z', '2026-06-' + pad((index % 3) + 1) + 'T' + pad(hour - 2) + ':00:00.000Z'),
  ];
}

function virtualSlot(index, sort, label, startAt, endAt) {
  const [dateLabel, timeLabel] = label.split(' ');
  return { id: 'virtual-slot-' + (index + 1) + '-' + sort, label, dateLabel, timeLabel, startAt, endAt, status: 'available' };
}

function durationLabel(minutes) {
  if (minutes === 60) return '1小时';
  if (minutes === 90) return '1.5小时';
  if (minutes === 240) return '4小时';
  return '2小时';
}

function pad(value) {
  return String(value).padStart(2, '0');
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
