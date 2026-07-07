import { buildStoreFromPostgresRows } from '../store/postgresMappers.mjs';

const rows = {
  companions: [
    {
      id: 'companion-pg-1',
      user_id: 'user-pg-1',
      display_name: 'PG Demo',
      base_city: '上海',
      gender: 'female',
      bio: 'PostgreSQL read model demo',
      real_photo_url: 'https://cdn.example.com/avatar.jpg',
      status: 'approved',
      service_enabled: true,
      rating_avg: '4.9',
      rating_count: 23,
      completed_order_count: 18,
    },
  ],
  companionTags: [
    { companion_id: 'companion-pg-1', tag_type: 'profile', tag_name: 'Citywalk' },
    { companion_id: 'companion-pg-1', tag_type: 'safety', tag_name: '实名认证' },
  ],
  serviceAreas: [
    {
      id: 'area-pg-1',
      companion_id: 'companion-pg-1',
      city: '上海',
      area_name: '武康路',
      area_type: 'business_area',
      lat: '31.2109000',
      lng: '121.4457000',
      radius_meters: 4000,
      enabled: true,
    },
  ],
  activityPricings: [
    {
      id: 'activity-pg-1',
      companion_id: 'companion-pg-1',
      activity_name: 'Citywalk',
      duration_minutes: 120,
      price_cents: 39900,
    },
  ],
  companionExtras: [
    {
      id: 'extra-pg-1',
      companion_id: 'companion-pg-1',
      name: '精修返图',
      unit: 'per_photo',
      price_cents: 3900,
      description: '每张',
    },
  ],
  availabilitySlots: [
    {
      id: 'slot-pg-1',
      companion_id: 'companion-pg-1',
      start_at: '2026-06-12T06:00:00.000Z',
      end_at: '2026-06-12T08:00:00.000Z',
      status: 'available',
    },
  ],
  posts: [
    {
      id: 'post-pg-1',
      companion_id: 'companion-pg-1',
      city: '上海',
      location_name: '武康路',
      lat: '31.2109000',
      lng: '121.4457000',
      time_label: '今天可拍',
      caption: 'PG seed post',
      activity_name: 'Citywalk',
      status: 'approved',
      is_feed_visible: true,
      is_featured: true,
      quality_score: '95',
    },
  ],
  postImages: [
    {
      id: 'image-pg-1',
      post_id: 'post-pg-1',
      file_url: 'https://cdn.example.com/post.jpg',
      file_key: 'pp/post-image/post.jpg',
      width: 1200,
      height: 1600,
      sort_order: 0,
    },
  ],
  auditLogs: [
    {
      id: 'audit-log-pg-1',
      audit_case_id: 'audit-case-pg-1',
      action: 'approved',
      operator_id: 'admin-pg-1',
      operator_type: 'admin',
      comment: 'Approved in mapper check',
      metadata: { source: 'mapper-check' },
      created_at: '2026-06-12T09:00:00.000Z',
    },
  ],
  adminActionLogs: [
    {
      id: 'admin-action-pg-1',
      admin_id: 'admin-pg-1',
      action: 'order_status_update',
      target_type: 'order',
      target_id: 'order-pg-1',
      before_data: { status: 'confirmed' },
      after_data: { status: 'disputed', note: 'Order marked disputed' },
      created_at: '2026-06-12T09:05:00.000Z',
    },
  ],
  securityEvents: [
    {
      id: 'security-event-pg-1',
      event_type: 'permission_denied',
      actor_id: 'user-pg-1',
      actor_role: 'consumer',
      target_type: 'admin_api',
      target_id: null,
      required_role: 'admin',
      actual_role: 'consumer',
      action: 'read',
      reason: 'Admin role is required',
      metadata: { source: 'mapper-check' },
      created_at: '2026-06-12T09:10:00.000Z',
    },
  ],
  postTags: [{ post_id: 'post-pg-1', tag_name: '胶片感' }],
  orders: [
    {
      id: 'order-pg-1',
      order_no: 'ST2606120001',
      user_id: 'user-pg-1',
      companion_id: 'companion-pg-1',
      post_id: 'post-pg-1',
      activity_pricing_id: 'activity-pg-1',
      availability_slot_id: 'slot-pg-1',
      city: 'Shanghai',
      place_name: 'Wukang Road',
      activity_name: 'Citywalk',
      duration_minutes: 120,
      start_at: '2026-06-12T06:00:00.000Z',
      end_at: '2026-06-12T08:00:00.000Z',
      total_amount_cents: 39900,
      status: 'confirmed',
      created_at: '2026-06-12T05:00:00.000Z',
      updated_at: '2026-06-12T05:30:00.000Z',
    },
  ],
  payments: [
    {
      id: 'payment-pg-1',
      order_id: 'order-pg-1',
      payment_no: 'PAY2606120001',
      channel: 'wechat_pay',
      amount_cents: 39900,
      status: 'paid',
      third_party_trade_no: 'wx-trade-1',
      paid_at: '2026-06-12T05:35:00.000Z',
      closed_at: null,
      created_at: '2026-06-12T05:00:00.000Z',
      updated_at: '2026-06-12T05:35:00.000Z',
    },
  ],
  conversations: [
    {
      id: 'conversation-pg-1',
      order_id: 'order-pg-1',
      user_id: 'user-pg-1',
      companion_id: 'companion-pg-1',
      status: 'active',
    },
  ],
  messages: [
    {
      id: 'message-pg-1',
      conversation_id: 'conversation-pg-1',
      sender_role: 'user',
      message_type: 'text',
      content: 'Hello',
      risk_status: 'clean',
      sent_at: '2026-06-12T06:05:00.000Z',
    },
  ],
  messageRiskEvents: [
    {
      id: 'risk-event-pg-1',
      message_id: 'message-pg-1',
      conversation_id: 'conversation-pg-1',
      order_id: 'order-pg-1',
      user_id: 'user-pg-1',
      matched_keywords: ['wechat'],
      risk_type: 'private_transaction',
      risk_level: 'high',
      action_taken: 'block',
      review_status: 'pending',
      raw_payload: { content: 'Add my wechat' },
      created_at: '2026-06-12T06:06:00.000Z',
    },
  ],
  reports: [
    {
      id: 'report-pg-1',
      reporter_id: 'user-pg-1',
      reported_user_id: null,
      order_id: 'order-pg-1',
      conversation_id: 'conversation-pg-1',
      target_type: 'order',
      target_id: 'order-pg-1',
      category: 'Order dispute',
      description: 'Photographer was late.',
      evidence_files: ['cos://evidence-1.jpg'],
      status: 'pending',
      handled_at: null,
      result: null,
      created_at: '2026-06-12T06:10:00.000Z',
      updated_at: '2026-06-12T06:10:00.000Z',
    },
  ],
  auditCases: [
    {
      id: 'audit-case-pg-1',
      target_type: 'report',
      target_id: 'report-pg-1',
      status: 'pending',
      risk_level: 'medium',
      submitted_by: 'user-pg-1',
      reason: 'Order dispute',
      snapshot: { reportId: 'report-pg-1' },
      submitted_at: '2026-06-12T06:11:00.000Z',
      reviewed_at: null,
      created_at: '2026-06-12T06:11:00.000Z',
      updated_at: '2026-06-12T06:11:00.000Z',
    },
  ],
  refunds: [
    {
      id: 'refund-pg-1',
      order_id: 'order-pg-1',
      payment_id: 'payment-pg-1',
      refund_no: 'REF2606120001',
      amount_cents: 19900,
      reason: 'Client cancellation',
      status: 'pending',
      requested_by: 'user-pg-1',
      processed_by: null,
      third_party_refund_no: 'wx-refund-pg-1',
      raw_callback: { refund_status: 'SUCCESS' },
      refunded_at: null,
      created_at: '2026-06-12T06:20:00.000Z',
      updated_at: '2026-06-12T06:20:00.000Z',
    },
  ],
  settlements: [
    {
      id: 'settlement-pg-1',
      order_id: 'order-pg-1',
      companion_id: 'companion-pg-1',
      gross_amount_cents: 39900,
      platform_fee_cents: 3192,
      net_amount_cents: 36708,
      status: 'pending',
      settle_after: '2026-06-13T06:00:00.000Z',
      settled_at: null,
      frozen_reason: null,
      created_at: '2026-06-12T06:30:00.000Z',
      updated_at: '2026-06-12T06:30:00.000Z',
    },
  ],
  ledgerEntries: [
    {
      id: 'ledger-pg-1',
      companion_id: 'companion-pg-1',
      order_id: 'order-pg-1',
      settlement_id: 'settlement-pg-1',
      entry_type: 'order_income',
      direction: 'in',
      amount_cents: 36708,
      balance_type: 'pending',
      balance_after_cents: 36708,
      status: 'posted',
      description: 'Order completed',
      created_at: '2026-06-12T06:31:00.000Z',
    },
  ],
  wallets: [
    {
      companion_id: 'companion-pg-1',
      pending_cents: 36708,
      available_cents: 120000,
      frozen_cents: 0,
      withdrawn_cents: 50000,
      created_at: '2026-06-12T06:31:00.000Z',
      updated_at: '2026-06-12T06:31:00.000Z',
    },
  ],
};

const store = buildStoreFromPostgresRows(rows);
const companion = store.companions[0];
const post = store.posts[0];

assert(store.meta.version === 3, 'store version is normalized');
assert(companion.name === 'PG Demo', 'companion display name maps');
assert(companion.tags.includes('Citywalk'), 'companion profile tags map');
assert(companion.safetyBadges.includes('实名认证'), 'companion safety badges map');
assert(companion.activities[0].priceText === '¥399', 'activity price maps');
assert(companion.extras[0].unitLabel === '每张', 'extras map');
assert(companion.slots[0].dateLabel === '2026-06-12', 'slot date maps');
assert(post.companion.id === companion.id, 'post embeds companion');
assert(post.images[0].url.includes('post.jpg'), 'post image maps');
assert(post.styleTags.includes('胶片感'), 'post tags map');
assert(store.orders[0].orderNo === 'ST2606120001', 'orders map');
assert(store.orders[0].statusText === 'Confirmed', 'order status text maps');
assert(store.conversations['order-pg-1'].messages[0].text === 'Hello', 'conversation messages map');
assert(store.payments[0].paymentNo === 'PAY2606120001', 'payments map');
assert(store.payments[0].amountText === '¥399', 'payment amount text maps');
assert(store.payments[0].closedAt === undefined, 'nullable payment timestamps stay empty');
assert(store.messageRiskEvents[0].matchedKeywords[0] === 'wechat', 'message risk events map');
assert(store.riskCases[0].riskLevel === 'high', 'message risk cases map');
assert(store.reports[0].description === 'Photographer was late.', 'reports map');
assert(store.auditCases[0].targetType === 'report', 'audit cases map');
assert(store.auditCases[0].payload.id === 'report-pg-1', 'audit case report payload links');
assert(store.refunds[0].refundNo === 'REF2606120001', 'refunds map');
assert(store.refunds[0].thirdPartyRefundNo === 'wx-refund-pg-1', 'refund third-party id maps');
assert(store.refunds[0].rawCallback.refund_status === 'SUCCESS', 'refund raw callback maps');
assert(store.settlements[0].payableCents === 36708, 'settlements map');
assert(store.ledgerEntries[0].settlementId === 'settlement-pg-1', 'ledger entries map');
assert(store.wallets[0].availableCents === 120000, 'wallets map');
assert(Array.isArray(store.sessions) && store.sessions.length === 0, 'sessions start empty');
assert(store.auditLogs[0].auditCaseId === 'audit-case-pg-1', 'audit logs map');
assert(store.adminActionLogs[0].note === 'Order marked disputed', 'admin action logs map');
assert(store.securityEvents[0].type === 'permission_denied', 'security events map');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['companions', 'tags', 'service-areas', 'activities', 'extras', 'slots', 'posts', 'images', 'orders', 'payments', 'conversations', 'risk-cases', 'reports', 'audit-cases', 'refunds', 'settlements', 'ledger-entries', 'wallets', 'sessions', 'audit-logs', 'admin-action-logs', 'security-events'],
      companionCount: store.companions.length,
      postCount: store.posts.length,
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres mapper check failed: ${message}`);
}
