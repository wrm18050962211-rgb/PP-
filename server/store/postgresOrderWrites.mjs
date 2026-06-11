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

function conflict(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 409;
  return error;
}
