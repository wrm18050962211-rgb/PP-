export async function createOrderTransaction(client, draft) {
  assertClient(client);
  assertDraft(draft);

  await client.query('begin');
  try {
    const slotResult = await client.query(
      `select id, status
       from availability_slots
       where id = $1
       for update`,
      [draft.availabilitySlotId],
    );
    const slot = slotResult.rows?.[0];
    if (!slot) throw conflict('ORDER_SLOT_NOT_FOUND', 'Availability slot not found');
    if (slot.status !== 'available') throw conflict('ORDER_SLOT_UNAVAILABLE', 'Slot is not available');

    const orderResult = await client.query(
      `insert into orders (
        id, order_no, user_id, companion_id, post_id, activity_pricing_id, availability_slot_id,
        city, place_name, place_address, activity_name, duration_minutes, start_at, end_at,
        base_amount_cents, extra_amount_cents, total_amount_cents, platform_fee_cents, companion_income_cents,
        status, user_note
      ) values (
        $1, $2, $3, $4, $5, $6, $7,
        $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19,
        'pending_payment', $20
      )
      returning *`,
      [
        draft.orderId,
        draft.orderNo,
        draft.userId,
        draft.companionId,
        draft.postId || null,
        draft.activityPricingId,
        draft.availabilitySlotId,
        draft.city,
        draft.placeName,
        draft.placeAddress || null,
        draft.activityName,
        draft.durationMinutes,
        draft.startAt,
        draft.endAt,
        draft.baseAmountCents,
        draft.extraAmountCents,
        draft.totalAmountCents,
        draft.platformFeeCents,
        draft.companionIncomeCents,
        draft.userNote || null,
      ],
    );

    for (const extra of draft.extras || []) {
      await client.query(
        `insert into order_extras (
          id, order_id, extra_id, name, quantity, unit_price_cents, amount_cents
        ) values ($1, $2, $3, $4, $5, $6, $7)`,
        [extra.id, draft.orderId, extra.extraId || null, extra.name, extra.quantity, extra.unitPriceCents, extra.amountCents],
      );
    }

    const paymentResult = await client.query(
      `insert into payments (
        id, order_id, payment_no, channel, amount_cents, status
      ) values ($1, $2, $3, $4, $5, 'pending')
      returning *`,
      [draft.paymentId, draft.orderId, draft.paymentNo, draft.paymentChannel || 'wechat_pay', draft.totalAmountCents],
    );

    await client.query(
      `update availability_slots
       set status = 'locked',
           locked_order_id = $1,
           locked_until = $2,
           updated_at = now()
       where id = $3`,
      [draft.orderId, draft.lockedUntil || null, draft.availabilitySlotId],
    );

    await client.query(
      `insert into order_status_logs (
        id, order_id, from_status, to_status, operator_type, operator_id, reason
      ) values ($1, $2, null, 'pending_payment', $3, $4, $5)`,
      [draft.statusLogId, draft.orderId, draft.operatorType || 'user', draft.userId, draft.statusReason || 'Order created and slot locked'],
    );

    await client.query('commit');
    return {
      order: orderResult.rows?.[0] || null,
      payment: paymentResult.rows?.[0] || null,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function markPaymentPaidTransaction(client, draft) {
  assertClient(client);
  assertPaymentDraft(draft);

  await client.query('begin');
  try {
    const paymentResult = await client.query(
      `select p.id as payment_id,
              p.status as payment_status,
              p.order_id,
              o.status as order_status,
              o.user_id,
              o.companion_id,
              o.availability_slot_id
       from payments p
       join orders o on o.id = p.order_id
       where p.id = $1
       for update of p, o`,
      [draft.paymentId],
    );
    const payment = paymentResult.rows?.[0];
    if (!payment) throw conflict('PAYMENT_NOT_FOUND', 'Payment not found');
    if (payment.payment_status !== 'pending') throw conflict('PAYMENT_STATUS_INVALID', 'Payment is not pending');
    if (payment.order_status !== 'pending_payment') throw conflict('ORDER_STATUS_INVALID', 'Order is not pending payment');

    const paidAt = draft.paidAt || new Date().toISOString();
    const paidPaymentResult = await client.query(
      `update payments
       set status = 'paid',
           third_party_trade_no = $1,
           third_party_buyer_id = $2,
           raw_callback = $3,
           paid_at = $4,
           updated_at = now()
       where id = $5
       returning *`,
      [draft.thirdPartyTradeNo || null, draft.thirdPartyBuyerId || null, draft.rawCallback || {}, paidAt, draft.paymentId],
    );

    const paidOrderResult = await client.query(
      `update orders
       set status = 'paid_pending_confirm',
           paid_at = $1,
           updated_at = now()
       where id = $2
       returning *`,
      [paidAt, payment.order_id],
    );

    await client.query(
      `update availability_slots
       set status = 'booked',
           locked_until = null,
           updated_at = now()
       where id = $1`,
      [payment.availability_slot_id],
    );

    const conversationResult = await client.query(
      `insert into conversations (
        id, order_id, user_id, companion_id, status, created_at, updated_at
      ) values ($1, $2, $3, $4, 'active', now(), now())
      on conflict (order_id) do update
      set updated_at = excluded.updated_at
      returning *`,
      [draft.conversationId, payment.order_id, payment.user_id, payment.companion_id],
    );

    await client.query(
      `insert into order_status_logs (
        id, order_id, from_status, to_status, operator_type, operator_id, reason
      ) values ($1, $2, 'pending_payment', 'paid_pending_confirm', $3, $4, $5)`,
      [draft.statusLogId, payment.order_id, draft.operatorType || 'system', draft.operatorId || null, draft.statusReason || 'Payment succeeded'],
    );

    await client.query('commit');
    return {
      payment: paidPaymentResult.rows?.[0] || null,
      order: paidOrderResult.rows?.[0] || null,
      conversation: conversationResult.rows?.[0] || null,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

function assertClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('PostgreSQL client with query(sql, params) is required');
  }
}

function assertDraft(draft) {
  const required = [
    'orderId',
    'orderNo',
    'userId',
    'companionId',
    'activityPricingId',
    'availabilitySlotId',
    'city',
    'placeName',
    'activityName',
    'durationMinutes',
    'startAt',
    'endAt',
    'baseAmountCents',
    'extraAmountCents',
    'totalAmountCents',
    'platformFeeCents',
    'companionIncomeCents',
    'paymentId',
    'paymentNo',
    'statusLogId',
  ];
  const missing = required.filter((key) => draft?.[key] === undefined || draft?.[key] === null || draft?.[key] === '');
  if (missing.length) throw new Error(`Missing createOrder draft fields: ${missing.join(', ')}`);
}

function assertPaymentDraft(draft) {
  const required = ['paymentId', 'conversationId', 'statusLogId'];
  const missing = required.filter((key) => draft?.[key] === undefined || draft?.[key] === null || draft?.[key] === '');
  if (missing.length) throw new Error(`Missing markPaymentPaid draft fields: ${missing.join(', ')}`);
}

function conflict(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 409;
  return error;
}
