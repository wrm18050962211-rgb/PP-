const orderStatuses = new Set([
  'pending_payment',
  'paid_pending_confirm',
  'confirmed',
  'in_service',
  'completed',
  'cancelled',
  'refunding',
  'refunded',
  'disputed',
]);

const orderStatusText = {
  pending_payment: '待支付',
  paid_pending_confirm: '待确认',
  confirmed: '已确认',
  in_service: '服务中',
  completed: '已完成',
  cancelled: '已取消',
  refunding: '退款中',
  refunded: '已退款',
  disputed: '争议处理中',
};

const orderStatusMessage = {
  pending_payment: '订单已创建，等待支付',
  paid_pending_confirm: '支付成功，等待摄影师确认',
  confirmed: '摄影师已确认订单',
  in_service: '服务已开始',
  completed: '订单已完成',
  cancelled: '订单已取消',
  refunding: '退款处理中',
  refunded: '退款已完成',
  disputed: '订单进入争议处理',
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

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const cursorPattern = /^[A-Za-z0-9_-]+$/;
const defaultPageSize = 20;
const maxPageSize = 50;
const orderDisplayTimeZone = 'Asia/Shanghai';
const orderDateTimeFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: orderDisplayTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export const ORDER_READ_STATUSES = Object.freeze(Array.from(orderStatuses));
export const ORDER_READ_ROLES = Object.freeze(['consumer', 'companion']);

/**
 * Lists orders owned by one authenticated public principal.
 *
 * The caller must derive userId/companionId from the authenticated session. No
 * caller-supplied owner identifier should be forwarded from an HTTP query/body.
 */
export async function listOrdersForActor(client, options = {}) {
  assertClient(client);
  const actor = resolveActor(options);
  const status = parseStatus(options.status);
  const limit = parseLimit(options.limit);
  const cursor = parseCursor(options.cursor, actor, status);
  const includeServiceItems = parseServiceItemsOption(options.includeServiceItems);
  const ownerPredicate = actor.role === 'consumer' ? 'o.user_id = $1::uuid' : 'o.companion_id = $1::uuid';

  try {
    const result = await client.query(
      `${orderSummarySelect()}
       where ${ownerPredicate}
         and ($2::order_status is null or o.status = $2::order_status)
         and (
           $3::timestamptz is null
           or (o.created_at, o.id) < ($3::timestamptz, $4::uuid)
         )
       order by o.created_at desc, o.id desc
       limit $5`,
      [actor.ownerId, status, cursor?.createdAt ?? null, cursor?.id ?? null, limit + 1],
    );

    const rows = result.rows || [];
    const pageRows = rows.slice(0, limit);
    const serviceItemsByOrder = includeServiceItems
      ? await loadPublicServiceItems(client, pageRows.map((row) => stringId(row.id)))
      : null;
    const items = pageRows.map((row) =>
      mapOrderSummary(row, actor.role, includeServiceItems ? serviceItemsByOrder.get(stringId(row.id)) || [] : null),
    );
    const hasMore = rows.length > limit;
    const lastRow = hasMore ? pageRows.at(-1) : null;

    return {
      items,
      nextCursor: lastRow ? encodeCursor(lastRow.created_at_cursor, lastRow.id, actor, status) : null,
      hasMore,
    };
  } catch (error) {
    throw normalizeReadFailure(error);
  }
}

/**
 * Returns a role-aware public order detail. Missing and cross-owner resources
 * intentionally share ORDER_NOT_FOUND so the gateway does not reveal whether
 * another principal's order exists.
 */
export async function getOrderDetailForActor(client, options = {}) {
  assertClient(client);
  const actor = resolveActor(options);
  const orderId = parseOrderId(options.orderId);
  const includeServiceItems = parseServiceItemsOption(options.includeServiceItems);
  const ownerPredicate = actor.role === 'consumer' ? 'o.user_id = $2::uuid' : 'o.companion_id = $2::uuid';
  try {
    const result = await client.query(
      `${orderDetailSelect()}
       where o.id = $1::uuid
         and ${ownerPredicate}
       limit 1`,
      [orderId, actor.ownerId],
    );
    const row = result.rows?.[0];
    if (!row) throw orderReadError('ORDER_NOT_FOUND', 'Order not found', 404);

    const serviceItemsByOrder = includeServiceItems ? await loadPublicServiceItems(client, [orderId]) : null;
    return mapOrderDetail(
      row,
      actor.role,
      includeServiceItems ? serviceItemsByOrder.get(orderId) || [] : null,
    );
  } catch (error) {
    throw normalizeReadFailure(error);
  }
}

/**
 * Returns the same field-whitelisted order detail for an authenticated admin.
 * The HTTP layer must enforce the admin session before calling this gateway.
 */
export async function getOrderDetailForAdmin(client, options = {}) {
  assertClient(client);
  const orderId = parseOrderId(options.orderId);
  const includeServiceItems = parseServiceItemsOption(options.includeServiceItems);
  try {
    const result = await client.query(
      `${orderDetailSelect()}
       where o.id = $1::uuid
       limit 1`,
      [orderId],
    );
    const row = result.rows?.[0];
    if (!row) throw orderReadError('ORDER_NOT_FOUND', 'Order not found', 404);

    const serviceItemsByOrder = includeServiceItems ? await loadPublicServiceItems(client, [orderId]) : null;
    return mapOrderDetail(
      row,
      'companion',
      includeServiceItems ? serviceItemsByOrder.get(orderId) || [] : null,
    );
  } catch (error) {
    throw normalizeReadFailure(error);
  }
}

function orderSummarySelect() {
  return `select
            o.id,
            o.order_no,
            o.status,
            o.city,
            o.place_name,
            o.place_address,
            o.place_lat,
            o.place_lng,
            o.activity_name,
            o.duration_minutes,
            o.start_at,
            o.end_at,
            o.total_amount_cents,
            o.companion_id,
            o.user_id as creator_id,
            o.post_id,
            o.activity_pricing_id,
            o.availability_slot_id,
            o.created_at,
            to_char(o.created_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at_cursor,
            o.updated_at,
            c.display_name as companion_name,
            c.real_photo_url as companion_avatar_url,
            u.nickname as creator_name,
            u.avatar_url as creator_avatar_url
     from orders o
     join companions c on c.id = o.companion_id
     join users u on u.id = o.user_id`;
}

function orderDetailSelect() {
  return `select
            o.id,
            o.order_no,
            o.status,
            o.city,
            o.place_name,
            o.place_address,
            o.place_lat,
            o.place_lng,
            o.activity_name,
            o.duration_minutes,
            o.start_at,
            o.end_at,
            o.base_amount_cents,
            o.extra_amount_cents,
            o.total_amount_cents,
            o.companion_id,
            o.user_id as creator_id,
            o.post_id,
            o.activity_pricing_id,
            o.availability_slot_id,
            o.user_note,
            o.companion_note,
            o.cancel_reason,
            o.paid_at,
            o.confirmed_at,
            o.service_started_at,
            o.completed_at,
            o.cancelled_at,
            o.created_at,
            o.updated_at,
            c.display_name as companion_name,
            c.real_photo_url as companion_avatar_url,
            u.nickname as creator_name,
            u.avatar_url as creator_avatar_url,
            coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id', oe.id,
                    'extraId', oe.extra_id,
                    'name', oe.name,
                    'quantity', oe.quantity,
                    'unitPriceCents', oe.unit_price_cents,
                    'amountCents', oe.amount_cents,
                    'createdAt', oe.created_at
                  )
                  order by oe.created_at, oe.id
                )
                from order_extras oe
                where oe.order_id = o.id
              ),
              '[]'::jsonb
            ) as extras,
            coalesce(
              (
                select jsonb_agg(
                  jsonb_build_object(
                    'id', osl.id,
                    'fromStatus', osl.from_status,
                    'toStatus', osl.to_status,
                    'createdAt', osl.created_at
                  )
                  order by osl.created_at, osl.id
                )
                from order_status_logs osl
                where osl.order_id = o.id
              ),
              '[]'::jsonb
            ) as status_logs
     from orders o
     join companions c on c.id = o.companion_id
     join users u on u.id = o.user_id`;
}

async function loadPublicServiceItems(client, orderIds) {
  const ids = orderIds.filter(Boolean);
  if (!ids.length) return new Map();

  const result = await client.query(
    `select
       oi.id,
       oi.order_id,
       oi.item_no,
       oi.service_type,
       oi.provider_type,
       oi.provider_companion_id,
       oi.provider_merchant_id,
       oi.activity_pricing_id,
       oi.merchant_offering_id,
       oi.offering_version,
       oi.service_name_snapshot,
       oi.service_description_snapshot,
       oi.duration_minutes,
       oi.start_at,
       oi.end_at,
       oi.timezone,
       oi.base_amount_cents,
       oi.extra_amount_cents,
       oi.discount_amount_cents,
       oi.total_amount_cents,
       oi.platform_subsidy_cents,
       oi.user_payable_cents,
       oi.currency,
       oi.acceptance_status,
       oi.acceptance_deadline_at,
       oi.accepted_at,
       oi.declined_at,
       oi.fulfillment_status,
       oi.service_started_at,
       oi.completed_at,
       oi.cancelled_at,
       oi.refund_status,
       oi.refunded_amount_cents,
       oi.source,
       oi.created_at,
       oi.updated_at,
       pc.display_name as provider_companion_name,
       pm.name as provider_merchant_name
     from order_items oi
     left join companions pc on pc.id = oi.provider_companion_id
     left join merchants pm on pm.id = oi.provider_merchant_id
     where oi.order_id = any($1::uuid[])
     order by oi.order_id, oi.item_no`,
    [ids],
  );

  const byOrder = new Map(ids.map((id) => [id, []]));
  for (const row of result.rows || []) {
    const orderId = stringId(row.order_id);
    if (!byOrder.has(orderId)) byOrder.set(orderId, []);
    byOrder.get(orderId).push(mapPublicServiceItem(row));
  }
  return byOrder;
}

function mapOrderSummary(row, role, serviceItems) {
  const status = normalize(row.status) || 'pending_payment';
  const startAt = toIso(row.start_at);
  const endAt = toIso(row.end_at);
  const labels = formatOrderLabels(startAt, endAt);
  const amountCents = number(row.total_amount_cents);
  const placeName = normalize(row.place_name) || normalize(row.city);
  const locationSnapshot = mapLocationSnapshot(row);
  const result = {
    id: stringId(row.id),
    orderNo: normalize(row.order_no) || stringId(row.id),
    status,
    statusText: orderStatusText[status] || status,
    title: normalize(row.activity_name) || 'Order',
    time: labels.time,
    place: placeName,
    locationSnapshot,
    amountCents,
    amountText: formatMoney(amountCents),
    companion: normalize(row.companion_name),
    companionId: stringId(row.companion_id),
    companionAvatarUrl: optionalText(row.companion_avatar_url),
    postId: optionalId(row.post_id),
    activityId: optionalId(row.activity_pricing_id),
    activityName: normalize(row.activity_name),
    slotId: optionalId(row.availability_slot_id),
    startAt,
    endAt,
    dateLabel: labels.dateLabel,
    timeLabel: labels.timeLabel,
    durationMinutes: number(row.duration_minutes),
    durationLabel: formatDuration(number(row.duration_minutes)),
    steps: ['已创建', '已支付', '已确认', '已完成'],
    currentStep: orderStepIndex[status] ?? 0,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };

  if (role === 'companion') {
    result.creatorId = stringId(row.creator_id);
    result.creatorName = normalize(row.creator_name);
    result.creatorAvatarUrl = optionalText(row.creator_avatar_url);
  }
  if (serviceItems) result.serviceItems = serviceItems;
  return result;
}

function mapOrderDetail(row, role, serviceItems) {
  const result = {
    ...mapOrderSummary(row, role, serviceItems),
    pricing: {
      baseAmountCents: number(row.base_amount_cents),
      extraAmountCents: number(row.extra_amount_cents),
      totalAmountCents: number(row.total_amount_cents),
      totalAmountText: formatMoney(row.total_amount_cents),
      currency: 'CNY',
    },
    userNote: optionalText(row.user_note),
    cancellationReason: optionalText(row.cancel_reason),
    paidAt: optionalIso(row.paid_at),
    confirmedAt: optionalIso(row.confirmed_at),
    serviceStartedAt: optionalIso(row.service_started_at),
    completedAt: optionalIso(row.completed_at),
    cancelledAt: optionalIso(row.cancelled_at),
    addOns: jsonArray(row.extras).map(mapExtra),
    statusLogs: jsonArray(row.status_logs).map(mapStatusLog),
  };
  if (role === 'companion') result.companionNote = optionalText(row.companion_note);
  return result;
}

function mapLocationSnapshot(row) {
  const lat = nullableNumber(row.place_lat);
  const lng = nullableNumber(row.place_lng);
  const hasCoordinatePair = lat !== null && lng !== null;
  return {
    name: normalize(row.place_name) || normalize(row.city),
    address: optionalText(row.place_address) ?? null,
    lat: hasCoordinatePair ? lat : null,
    lng: hasCoordinatePair ? lng : null,
  };
}

function mapExtra(extra = {}) {
  const amountCents = number(extra.amountCents ?? extra.amount_cents);
  const unitPriceCents = number(extra.unitPriceCents ?? extra.unit_price_cents);
  return {
    id: stringId(extra.id),
    extraId: optionalId(extra.extraId ?? extra.extra_id),
    name: normalize(extra.name),
    quantity: number(extra.quantity),
    unitPriceCents,
    unitPriceText: formatMoney(unitPriceCents),
    amountCents,
    amountText: formatMoney(amountCents),
    createdAt: optionalIso(extra.createdAt ?? extra.created_at),
  };
}

function mapStatusLog(log = {}) {
  const toStatus = normalize(log.toStatus ?? log.to_status);
  return {
    id: stringId(log.id),
    fromStatus: optionalText(log.fromStatus ?? log.from_status) ?? null,
    toStatus,
    statusText: orderStatusText[toStatus] || toStatus,
    message: orderStatusMessage[toStatus] || '订单状态已更新',
    createdAt: toIso(log.createdAt ?? log.created_at),
  };
}

function mapPublicServiceItem(row) {
  const providerType = row.provider_type === 'merchant' ? 'merchant' : 'photographer';
  const providerId = providerType === 'merchant' ? stringId(row.provider_merchant_id) : stringId(row.provider_companion_id);
  const providerName = providerType === 'merchant' ? normalize(row.provider_merchant_name) : normalize(row.provider_companion_name);
  const totalAmountCents = number(row.total_amount_cents);
  const platformSubsidyCents = number(row.platform_subsidy_cents);
  const userPayableCents = number(row.user_payable_cents);
  const refundedAmountCents = number(row.refunded_amount_cents);
  return {
    id: stringId(row.id),
    orderId: stringId(row.order_id),
    itemNo: number(row.item_no),
    serviceType: normalize(row.service_type) || 'other',
    provider: { type: providerType, id: providerId, name: providerName },
    activityPricingId: optionalId(row.activity_pricing_id),
    merchantOfferingId: optionalId(row.merchant_offering_id),
    offeringVersion: optionalNumber(row.offering_version),
    serviceName: normalize(row.service_name_snapshot),
    serviceDescription: optionalText(row.service_description_snapshot),
    durationMinutes: number(row.duration_minutes),
    startAt: toIso(row.start_at),
    endAt: toIso(row.end_at),
    timezone: normalize(row.timezone) || 'Asia/Shanghai',
    pricing: {
      baseAmountCents: number(row.base_amount_cents),
      extraAmountCents: number(row.extra_amount_cents),
      discountAmountCents: number(row.discount_amount_cents),
      totalAmountCents,
      totalAmountText: formatMoney(totalAmountCents),
      platformSubsidyCents,
      platformSubsidyText: formatMoney(platformSubsidyCents),
      userPayableCents,
      userPayableText: formatMoney(userPayableCents),
      currency: normalize(row.currency) || 'CNY',
    },
    acceptance: {
      status: normalize(row.acceptance_status) || 'not_requested',
      deadlineAt: optionalIso(row.acceptance_deadline_at),
      acceptedAt: optionalIso(row.accepted_at),
      declinedAt: optionalIso(row.declined_at),
    },
    fulfillment: {
      status: normalize(row.fulfillment_status) || 'not_started',
      serviceStartedAt: optionalIso(row.service_started_at),
      completedAt: optionalIso(row.completed_at),
      cancelledAt: optionalIso(row.cancelled_at),
    },
    refund: {
      status: normalize(row.refund_status) || 'not_requested',
      refundedAmountCents,
      refundedAmountText: formatMoney(refundedAmountCents),
    },
    source: normalize(row.source) || 'composite',
    createdAt: toIso(row.created_at),
    updatedAt: optionalIso(row.updated_at),
  };
}

function resolveActor(options) {
  const role = normalize(options.role);
  if (!ORDER_READ_ROLES.includes(role)) {
    throw orderReadError('ORDER_ROLE_INVALID', 'Order role must be consumer or companion', 400);
  }
  const ownerId = role === 'consumer' ? normalize(options.userId) : normalize(options.companionId);
  if (!uuidPattern.test(ownerId)) {
    throw orderReadError(
      'ORDER_OWNER_INVALID',
      role === 'consumer' ? 'A valid session userId is required' : 'A valid session companionId is required',
      400,
    );
  }
  return { role, ownerId };
}

function parseStatus(value) {
  if (value === undefined || value === null || value === '') return null;
  const status = normalize(value);
  if (!orderStatuses.has(status)) {
    throw orderReadError('ORDER_STATUS_INVALID', 'Unknown order status', 400);
  }
  return status;
}

function parseLimit(value) {
  if (value === undefined || value === null) return defaultPageSize;
  if (typeof value !== 'number' && !/^[1-9]\d*$/.test(String(value))) {
    throw orderReadError('ORDER_LIMIT_INVALID', `Order limit must be an integer between 1 and ${maxPageSize}`, 400);
  }
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > maxPageSize) {
    throw orderReadError('ORDER_LIMIT_INVALID', `Order limit must be an integer between 1 and ${maxPageSize}`, 400);
  }
  return parsed;
}

function parseServiceItemsOption(value) {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') {
    throw orderReadError('ORDER_SERVICE_ITEMS_OPTION_INVALID', 'includeServiceItems must be a boolean', 400);
  }
  return value;
}

function parseOrderId(value) {
  const orderId = normalize(value);
  if (!uuidPattern.test(orderId)) throw orderReadError('ORDER_NOT_FOUND', 'Order not found', 404);
  return orderId;
}

function parseCursor(value, actor, status) {
  if (value === undefined || value === null) return null;
  const cursor = normalize(value);
  if (!cursor || cursor.length > 512 || !cursorPattern.test(cursor)) throw invalidCursor();
  try {
    const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (
      !decoded ||
      decoded.v !== 1 ||
      typeof decoded.createdAt !== 'string' ||
      !uuidPattern.test(normalize(decoded.id)) ||
      decoded.role !== actor.role ||
      decoded.ownerId !== actor.ownerId ||
      (decoded.status ?? null) !== status
    ) {
      throw invalidCursor();
    }
    const createdAt = exactCursorTimestamp(decoded.createdAt);
    return { createdAt, id: normalize(decoded.id) };
  } catch (error) {
    if (error?.code === 'ORDER_CURSOR_INVALID') throw error;
    throw invalidCursor();
  }
}

function encodeCursor(createdAtValue, idValue, actor, status) {
  const createdAt = exactCursorTimestamp(createdAtValue);
  const id = normalize(idValue);
  if (!uuidPattern.test(id)) throw invalidCursor();
  return Buffer.from(
    JSON.stringify({ v: 1, createdAt, id, role: actor.role, ownerId: actor.ownerId, status }),
    'utf8',
  ).toString('base64url');
}

function invalidCursor() {
  return orderReadError('ORDER_CURSOR_INVALID', 'Order cursor is invalid', 400);
}

function exactCursorTimestamp(value) {
  const timestamp = String(value || '');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/.test(timestamp)) throw invalidCursor();
  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString() !== `${timestamp.slice(0, 23)}Z`) throw invalidCursor();
  return timestamp;
}

function formatOrderLabels(startAt, endAt) {
  const start = orderDateTimeParts(startAt);
  const end = orderDateTimeParts(endAt);
  const timeLabel = start.dateLabel === end.dateLabel
    ? `${start.timeLabel}-${end.timeLabel}`
    : `${start.timeLabel}-${end.dateLabel} ${end.timeLabel}`;
  return {
    dateLabel: start.dateLabel,
    timeLabel,
    time: `${start.dateLabel} ${timeLabel}`,
  };
}

function orderDateTimeParts(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('Order timestamp is invalid');
  const parts = Object.fromEntries(
    orderDateTimeFormatter
      .formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    dateLabel: `${parts.year}-${parts.month}-${parts.day}`,
    timeLabel: `${parts.hour}:${parts.minute}`,
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
  if (!value) throw new Error('Required order timestamp is missing');
  if (value instanceof Date) return value.toISOString();
  const timestamp = Date.parse(String(value));
  if (!Number.isFinite(timestamp)) throw new Error('Required order timestamp is invalid');
  return new Date(timestamp).toISOString();
}

function optionalIso(value) {
  return value ? toIso(value) : undefined;
}

function optionalNumber(value) {
  if (value === undefined || value === null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function nullableNumber(value) {
  if (value === undefined || value === null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function number(value) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalize(value) {
  return String(value ?? '').trim();
}

function optionalText(value) {
  const text = normalize(value);
  return text || undefined;
}

function stringId(value) {
  return normalize(value);
}

function optionalId(value) {
  const id = stringId(value);
  return id || undefined;
}

function jsonArray(value) {
  if (Array.isArray(value)) return value;
  if (typeof value !== 'string' || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function assertClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('PostgreSQL client with query(sql, params) is required');
  }
}

function orderReadError(code, message, status) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

function normalizeReadFailure(error) {
  if (error?.status && String(error.code || '').startsWith('ORDER_')) return error;
  const wrapped = orderReadError('ORDER_READ_FAILED', 'Order data is temporarily unavailable', 503);
  wrapped.cause = error;
  return wrapped;
}
