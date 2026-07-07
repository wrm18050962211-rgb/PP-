export function buildStoreFromPostgresRows(rows) {
  const companions = mapCompanions(rows);
  const companionById = new Map(companions.map((companion) => [companion.id, companion]));
  const posts = mapPosts(rows, companionById);
  const orders = mapOrders(rows, companionById);
  const reports = mapReports(rows, orders);
  const settlements = mapSettlements(rows, orders);

  return {
    meta: { version: 3 },
    companions,
    posts,
    users: [],
    activeSession: null,
    sessions: [],
    orders,
    payments: mapPayments(rows),
    conversations: mapConversations(rows, orders),
    riskCases: mapRiskCases(rows, orders),
    messageRiskEvents: mapMessageRiskEvents(rows),
    reports,
    auditCases: mapAuditCases(rows, reports),
    auditLogs: mapAuditLogs(rows),
    adminActionLogs: mapAdminActionLogs(rows),
    securityEvents: mapSecurityEvents(rows),
    settlements,
    ledgerEntries: mapLedgerEntries(rows),
    refunds: mapRefunds(rows, orders),
    wallets: mapWallets(rows),
    application: { reviewStatus: 'draft', updatedAt: new Date().toISOString() },
    workDraft: { reviewStatus: 'draft', updatedAt: new Date().toISOString() },
  };
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

function mapCompanions(rows) {
  return (rows.companions || []).map((row) => {
    const id = stringId(row.id);
    const profileTags = (rows.companionTags || []).filter((tag) => stringId(tag.companion_id) === id && tag.tag_type === 'profile').map((tag) => tag.tag_name);
    const safetyBadges = (rows.companionTags || []).filter((tag) => stringId(tag.companion_id) === id && tag.tag_type === 'safety').map((tag) => tag.tag_name);
    const serviceAreas = (rows.serviceAreas || []).filter((area) => stringId(area.companion_id) === id).map(mapServiceArea);

    return {
      id,
      userId: stringId(row.user_id),
      name: row.display_name,
      baseCity: row.base_city,
      gender: row.gender || 'unknown',
      bio: row.bio || '',
      avatar: row.real_photo_url || '',
      photo: row.real_photo_url || '',
      status: row.status || 'approved',
      serviceEnabled: row.service_enabled !== false,
      ratingAvg: number(row.rating_avg),
      ratingCount: number(row.rating_count),
      completedOrderCount: number(row.completed_order_count),
      tags: profileTags,
      safetyBadges,
      areas: serviceAreas.map((area) => area.areaName),
      locationName: serviceAreas[0]?.areaName || row.base_city,
      serviceAreas,
      activities: (rows.activityPricings || []).filter((activity) => stringId(activity.companion_id) === id).map(mapActivity),
      extras: (rows.companionExtras || []).filter((extra) => stringId(extra.companion_id) === id).map(mapExtra),
      slots: (rows.availabilitySlots || []).filter((slot) => stringId(slot.companion_id) === id).map(mapSlot),
    };
  });
}

function mapPosts(rows, companionById) {
  return (rows.posts || []).map((row) => {
    const id = stringId(row.id);
    const companion = companionById.get(stringId(row.companion_id));
    const images = (rows.postImages || [])
      .filter((image) => stringId(image.post_id) === id)
      .sort((a, b) => number(a.sort_order) - number(b.sort_order))
      .map((image) => ({
        id: stringId(image.id),
        url: image.file_url,
        objectKey: image.file_key || '',
        width: image.width == null ? undefined : number(image.width),
        height: image.height == null ? undefined : number(image.height),
        sortOrder: number(image.sort_order),
      }));

    return {
      id,
      city: row.city,
      locationName: row.location_name,
      location: `${row.city} - ${row.location_name}`,
      lat: row.lat == null ? undefined : number(row.lat),
      lng: row.lng == null ? undefined : number(row.lng),
      timeLabel: row.time_label,
      caption: row.caption || '',
      activity: row.activity_name || companion?.activities?.[0]?.name || '',
      status: row.status || 'approved',
      isFeedVisible: row.is_feed_visible !== false,
      isFeatured: Boolean(row.is_featured),
      qualityScore: number(row.quality_score),
      images,
      cover: images[0]?.url || companion?.photo || '',
      styleTags: (rows.postTags || []).filter((tag) => stringId(tag.post_id) === id).map((tag) => tag.tag_name),
      companion,
    };
  });
}

function mapOrders(rows, companionById) {
  return (rows.orders || []).map((row) => {
    const id = stringId(row.id);
    const status = row.status || 'pending_payment';
    const startAt = toIso(row.start_at);
    const endAt = toIso(row.end_at);
    const companion = companionById.get(stringId(row.companion_id));
    const amountCents = number(row.total_amount_cents);
    return {
      id,
      orderNo: row.order_no || id,
      status,
      title: row.activity_name || 'Order',
      time: `${startAt.slice(0, 10)} ${startAt.slice(11, 16)}-${endAt.slice(11, 16)}`,
      place: row.place_name || row.city || '',
      amountCents,
      amountText: formatMoney(amountCents),
      companion: companion?.name || '',
      companionId: stringId(row.companion_id),
      postId: row.post_id ? stringId(row.post_id) : undefined,
      activityId: row.activity_pricing_id ? stringId(row.activity_pricing_id) : undefined,
      activityName: row.activity_name || '',
      slotId: row.availability_slot_id ? stringId(row.availability_slot_id) : undefined,
      userId: stringId(row.user_id),
      startAt,
      endAt,
      dateLabel: startAt.slice(0, 10),
      timeLabel: `${startAt.slice(11, 16)}-${endAt.slice(11, 16)}`,
      durationMinutes: number(row.duration_minutes),
      durationLabel: formatDuration(number(row.duration_minutes)),
      statusText: orderStatusText[status] || status,
      steps: ['Created', 'Paid', 'Confirmed', 'Completed'],
      currentStep: orderStepIndex[status] ?? 0,
      createdAt: toIso(row.created_at),
      updatedAt: toIso(row.updated_at),
    };
  });
}

function mapPayments(rows) {
  return (rows.payments || []).map((row) => {
    const id = stringId(row.id);
    const amountCents = number(row.amount_cents);
    return {
      id,
      paymentId: id,
      paymentNo: row.payment_no || id,
      orderId: stringId(row.order_id),
      channel: row.channel || 'wechat_pay',
      provider: row.channel || 'wechat_pay',
      mode: 'production',
      status: row.status || 'pending',
      amountCents,
      amountText: formatMoney(amountCents),
      transactionId: row.third_party_trade_no || undefined,
      paidAt: toOptionalIso(row.paid_at),
      closedAt: toOptionalIso(row.closed_at),
      createdAt: toOptionalIso(row.created_at),
      updatedAt: toOptionalIso(row.updated_at),
    };
  });
}

function mapConversations(rows, orders) {
  const orderById = new Map(orders.map((order) => [order.id, order]));
  return Object.fromEntries(
    (rows.conversations || []).map((row) => {
      const id = stringId(row.id);
      const orderId = stringId(row.order_id);
      const order = orderById.get(orderId);
      return [
        orderId,
        {
          id,
          orderId,
          orderNo: order?.orderNo || '',
          userId: stringId(row.user_id),
          companionId: stringId(row.companion_id),
          status: row.status || 'active',
          safetyNotice: 'Keep all communication and payments inside Still for safety.',
          messages: (rows.messages || [])
            .filter((message) => stringId(message.conversation_id) === id)
            .sort((left, right) => new Date(toIso(left.sent_at)).getTime() - new Date(toIso(right.sent_at)).getTime())
            .map(mapMessage),
        },
      ];
    }),
  );
}

function mapMessage(row) {
  const text = row.content ?? row.original_content ?? '';
  return {
    id: stringId(row.id),
    from: mapSenderRole(row.sender_role),
    kind: row.message_type || 'text',
    text,
    sentAt: toIso(row.sent_at),
    riskStatus: row.risk_status || 'clean',
  };
}

function mapSenderRole(role) {
  if (role === 'companion') return 'companion';
  if (role === 'admin') return 'admin';
  if (role === 'system') return 'system';
  return 'user';
}

function mapRiskCases(rows, orders) {
  const orderById = new Map(orders.map((order) => [order.id, order]));
  return (rows.messageRiskEvents || []).map((row) => {
    const order = orderById.get(stringId(row.order_id));
    const message = (rows.messages || []).find((item) => stringId(item.id) === stringId(row.message_id));
    const hitWords = arrayValue(row.matched_keywords).map((keyword) => ({
      keyword,
      label: row.risk_type || 'message_risk',
      level: row.risk_level || 'medium',
    }));
    const blockedMessage = message
      ? mapMessage(message)
      : {
          id: row.message_id ? stringId(row.message_id) : stringId(row.id),
          from: 'user',
          text: jsonObject(row.raw_payload).content || '',
          sentAt: toIso(row.created_at),
          riskStatus: row.action_taken === 'block' ? 'blocked' : 'flagged',
        };
    return {
      id: stringId(row.id),
      type: 'message_risk',
      status: row.review_status || 'pending',
      riskLevel: row.risk_level || 'medium',
      riskLabel: row.risk_type || 'Message risk',
      conversationId: stringId(row.conversation_id),
      orderId: stringId(row.order_id),
      orderNo: order?.orderNo || '',
      orderTitle: order?.title || '',
      orderStatusText: order?.statusText || '',
      orderAmountText: order?.amountText || '',
      userName: '',
      companionName: order?.companion || '',
      blockedMessage,
      hitWords,
      contextMessages: [blockedMessage].filter((item) => item.text),
      createdAt: toIso(row.created_at),
      actionLogs: [],
    };
  });
}

function mapMessageRiskEvents(rows) {
  return (rows.messageRiskEvents || []).map((row) => ({
    id: stringId(row.id),
    messageId: row.message_id ? stringId(row.message_id) : null,
    conversationId: stringId(row.conversation_id),
    orderId: row.order_id ? stringId(row.order_id) : null,
    userId: row.user_id ? stringId(row.user_id) : null,
    matchedKeywords: arrayValue(row.matched_keywords),
    riskType: row.risk_type,
    riskLevel: row.risk_level,
    action: row.action_taken,
    reviewStatus: row.review_status || 'pending',
    rawPayload: jsonObject(row.raw_payload),
    createdAt: toIso(row.created_at),
  }));
}

function mapReports(rows, orders) {
  const orderById = new Map(orders.map((order) => [order.id, order]));
  return (rows.reports || []).map((row) => {
    const order = orderById.get(stringId(row.order_id));
    return {
      id: stringId(row.id),
      type: 'report_dispute',
      status: row.status || 'pending',
      riskLevel: row.risk_level || 'medium',
      riskLabel: row.category || 'Order dispute',
      reporterId: stringId(row.reporter_id),
      reportedUserId: row.reported_user_id ? stringId(row.reported_user_id) : null,
      reporterRole: '',
      reporterName: '',
      targetName: order?.companion || '',
      reason: row.category || 'Order dispute',
      description: row.description || '',
      evidenceFiles: arrayValue(row.evidence_files),
      orderId: row.order_id ? stringId(row.order_id) : null,
      orderNo: order?.orderNo || '',
      orderTitle: order?.title || '',
      orderStatusText: order?.statusText || '',
      orderAmountText: order?.amountText || '',
      createdAt: toIso(row.created_at),
      handledAt: toOptionalIso(row.handled_at),
      result: row.result || '',
      actionLogs: [],
    };
  });
}

function mapAuditCases(rows, reports) {
  const reportById = new Map(reports.map((report) => [report.id, report]));
  const logsByCaseId = new Map();
  for (const log of mapAuditLogs(rows)) {
    if (!logsByCaseId.has(log.auditCaseId)) logsByCaseId.set(log.auditCaseId, []);
    logsByCaseId.get(log.auditCaseId).push(log);
  }
  return (rows.auditCases || []).map((row) => {
    const id = stringId(row.id);
    const targetType = row.target_type || '';
    const targetId = stringId(row.target_id);
    const payload = targetType === 'report' ? reportById.get(targetId) || jsonObject(row.snapshot) : jsonObject(row.snapshot);
    return {
      id,
      targetType,
      targetId,
      title: targetType === 'report' ? `Report ${payload.reason || payload.riskLabel || ''}`.trim() : `${targetType || 'Item'} review`,
      status: row.status || 'pending',
      riskLevel: row.risk_level || 'low',
      reason: row.reason || '',
      createdAt: toIso(row.submitted_at || row.created_at),
      resolvedAt: toOptionalIso(row.reviewed_at),
      payload,
      logs: logsByCaseId.get(id) || [],
    };
  });
}

function mapSettlements(rows, orders) {
  const orderById = new Map(orders.map((order) => [order.id, order]));
  return (rows.settlements || []).map((row) => {
    const order = orderById.get(stringId(row.order_id));
    return {
      id: stringId(row.id),
      orderId: stringId(row.order_id),
      orderNo: order?.orderNo || '',
      companionId: stringId(row.companion_id),
      grossCents: number(row.gross_amount_cents),
      commissionCents: number(row.platform_fee_cents),
      payableCents: number(row.net_amount_cents),
      status: row.status || 'pending',
      settleAfter: toIso(row.settle_after),
      settledAt: toOptionalIso(row.settled_at),
      frozenReason: row.frozen_reason || '',
      createdAt: toIso(row.created_at),
      updatedAt: toOptionalIso(row.updated_at),
    };
  });
}

function mapLedgerEntries(rows) {
  return (rows.ledgerEntries || []).map((row) => ({
    id: stringId(row.id),
    companionId: stringId(row.companion_id),
    orderId: row.order_id ? stringId(row.order_id) : null,
    settlementId: row.settlement_id ? stringId(row.settlement_id) : null,
    entryType: row.entry_type,
    direction: row.direction || 'in',
    amountCents: number(row.amount_cents),
    balanceType: row.balance_type || '',
    balanceAfterCents: number(row.balance_after_cents),
    status: row.status || 'posted',
    description: row.description || '',
    createdAt: toIso(row.created_at),
  }));
}

function mapRefunds(rows, orders) {
  const orderById = new Map(orders.map((order) => [order.id, order]));
  return (rows.refunds || []).map((row) => {
    const order = orderById.get(stringId(row.order_id));
    return {
      id: stringId(row.id),
      orderId: stringId(row.order_id),
      orderNo: order?.orderNo || '',
      paymentId: row.payment_id ? stringId(row.payment_id) : null,
      refundNo: row.refund_no || stringId(row.id),
      amountCents: number(row.amount_cents),
      penaltyCents: 0,
      platformFeeCents: 0,
      compensationToCounterpartyCents: 0,
      reason: row.reason || '',
      status: row.status || 'pending',
      requestedBy: row.requested_by ? stringId(row.requested_by) : null,
      processedBy: row.processed_by ? stringId(row.processed_by) : null,
      thirdPartyRefundNo: row.third_party_refund_no || null,
      rawCallback: jsonObject(row.raw_callback),
      refundedAt: toOptionalIso(row.refunded_at),
      createdAt: toIso(row.created_at),
      updatedAt: toOptionalIso(row.updated_at),
    };
  });
}

function mapWallets(rows) {
  return (rows.wallets || []).map((row) => ({
    id: stringId(row.companion_id),
    companionId: stringId(row.companion_id),
    pendingCents: number(row.pending_cents),
    availableCents: number(row.available_cents),
    frozenCents: number(row.frozen_cents),
    withdrawnCents: number(row.withdrawn_cents),
    createdAt: toIso(row.created_at),
    updatedAt: toOptionalIso(row.updated_at),
  }));
}

function mapAuditLogs(rows) {
  return (rows.auditLogs || []).map((row) => ({
    id: stringId(row.id),
    auditCaseId: stringId(row.audit_case_id),
    action: row.action,
    operatorId: row.operator_id ? stringId(row.operator_id) : null,
    operatorType: row.operator_type || 'admin',
    comment: row.comment || '',
    note: row.comment || '',
    metadata: jsonObject(row.metadata),
    createdAt: toIso(row.created_at),
  }));
}

function mapAdminActionLogs(rows) {
  return (rows.adminActionLogs || []).map((row) => {
    const afterData = jsonObject(row.after_data);
    return {
      id: stringId(row.id),
      adminId: row.admin_id ? stringId(row.admin_id) : null,
      action: row.action,
      type: row.action,
      targetType: row.target_type || null,
      targetId: row.target_id ? stringId(row.target_id) : null,
      note: typeof afterData.note === 'string' ? afterData.note : '',
      beforeData: jsonObject(row.before_data),
      afterData,
      createdAt: toIso(row.created_at),
    };
  });
}

function mapSecurityEvents(rows) {
  return (rows.securityEvents || []).map((row) => ({
    id: stringId(row.id),
    type: row.event_type,
    actorId: row.actor_id ? stringId(row.actor_id) : null,
    actorRole: row.actor_role || 'anonymous',
    targetType: row.target_type || null,
    targetId: row.target_id ? stringId(row.target_id) : null,
    targetKey: row.target_key || null,
    requiredRole: row.required_role || null,
    actualRole: row.actual_role || null,
    action: row.action || null,
    reason: row.reason || '',
    metadata: jsonObject(row.metadata),
    createdAt: toIso(row.created_at),
  }));
}

function mapServiceArea(row) {
  return {
    id: stringId(row.id),
    city: row.city,
    areaName: row.area_name,
    areaType: row.area_type || 'business_area',
    lat: row.lat == null ? undefined : number(row.lat),
    lng: row.lng == null ? undefined : number(row.lng),
    radiusMeters: row.radius_meters == null ? 3000 : number(row.radius_meters),
    enabled: row.enabled !== false,
  };
}

function mapActivity(row) {
  const durationMinutes = number(row.duration_minutes);
  return {
    id: stringId(row.id),
    name: row.activity_name,
    durationMinutes,
    durationLabel: formatDuration(durationMinutes),
    priceCents: number(row.price_cents),
    priceText: formatMoney(row.price_cents),
  };
}

function mapExtra(row) {
  return {
    id: stringId(row.id),
    name: row.name,
    unit: row.unit || 'per_order',
    unitLabel: row.description || row.unit || 'per_order',
    priceCents: number(row.price_cents),
    priceText: formatMoney(row.price_cents),
  };
}

function mapSlot(row) {
  const startAt = toIso(row.start_at);
  const endAt = toIso(row.end_at);
  const dateLabel = startAt.slice(0, 10);
  const timeLabel = `${startAt.slice(11, 16)}-${endAt.slice(11, 16)}`;
  return {
    id: stringId(row.id),
    label: `${dateLabel} ${timeLabel}`,
    dateLabel,
    timeLabel,
    startAt,
    endAt,
    status: row.status || 'available',
  };
}

function formatMoney(cents) {
  const yuan = Math.round(number(cents)) / 100;
  return `¥${Number.isInteger(yuan) ? yuan : yuan.toFixed(2)}`;
}

function formatDuration(minutes) {
  if (!minutes) return '';
  if (minutes % 60 === 0) return `${minutes / 60}小时`;
  return `${Number((minutes / 60).toFixed(1))}小时`;
}

function toIso(value) {
  if (!value) return new Date(0).toISOString();
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function toOptionalIso(value) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  return new Date(value).toISOString();
}

function number(value) {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function jsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function arrayValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string' && value) return [value];
  return [];
}

function stringId(value) {
  return String(value || '');
}
