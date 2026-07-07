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
    if (payment.payment_status === 'paid') {
      await client.query('commit');
      return {
        payment: { id: payment.payment_id, status: payment.payment_status },
        order: { id: payment.order_id, status: payment.order_status },
        conversation: null,
        skipped: true,
      };
    }
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

export async function markPaymentTerminalTransaction(client, draft) {
  assertClient(client);
  assertTerminalPaymentDraft(draft);

  await client.query('begin');
  try {
    const paymentResult = await client.query(
      `select id, status
       from payments
       where id = $1
       for update`,
      [draft.paymentId],
    );
    const payment = paymentResult.rows?.[0];
    if (!payment) throw conflict('PAYMENT_NOT_FOUND', 'Payment not found');
    if (payment.status !== 'pending') {
      await client.query('commit');
      return { payment, skipped: true };
    }

    const occurredAt = draft.occurredAt || new Date().toISOString();
    const updatedPayment = await client.query(
      `update payments
       set status = $1,
           third_party_trade_no = coalesce($2, third_party_trade_no),
           raw_callback = $3,
           closed_at = case when $1 = 'closed' then $4 else closed_at end,
           updated_at = now()
       where id = $5
       returning *`,
      [draft.status, draft.thirdPartyTradeNo || null, draft.rawCallback || {}, occurredAt, draft.paymentId],
    );

    await client.query('commit');
    return { payment: updatedPayment.rows?.[0] || null, skipped: false };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function expirePendingPaymentsTransaction(client, draft = {}) {
  assertClient(client);

  const occurredAt = draft.occurredAt || new Date().toISOString();
  const reason = draft.reason || 'Payment window expired';
  const limit = normalizePositiveInteger(draft.limit, 100, 500);
  await client.query('begin');
  try {
    const result = await client.query(
      `with expired as (
         select o.id as order_id,
                s.id as slot_id,
                p.id as payment_id
         from orders o
         join availability_slots s on s.locked_order_id = o.id
         join payments p on p.order_id = o.id
         where o.status = 'pending_payment'
           and s.status = 'locked'
           and s.locked_until is not null
           and s.locked_until < $1
           and p.status <> 'paid'
         order by s.locked_until asc
         limit $3
         for update of o, s, p skip locked
       ),
       closed_payments as (
         update payments p
         set status = 'closed',
             closed_at = coalesce(closed_at, $1),
             raw_callback = case
               when p.status = 'pending' then jsonb_build_object('source', 'timeout_job', 'reason', $2)
               else raw_callback
             end,
             updated_at = now()
         from expired e
         where p.id = e.payment_id
           and p.status = 'pending'
         returning p.id
       ),
       cancelled_orders as (
         update orders o
         set status = 'cancelled',
             cancel_reason = $2,
             cancelled_at = $1,
             updated_at = now()
         from expired e
         where o.id = e.order_id
           and o.status = 'pending_payment'
         returning o.id
       ),
       released_slots as (
         update availability_slots s
         set status = 'available',
             locked_order_id = null,
             locked_until = null,
             updated_at = now()
         from expired e
         where s.id = e.slot_id
           and s.status = 'locked'
         returning s.id
       ),
       status_logs as (
         insert into order_status_logs (
           order_id, from_status, to_status, operator_type, operator_id, reason
         )
         select e.order_id, 'pending_payment', 'cancelled', 'system', $4, $2
         from expired e
         join cancelled_orders o on o.id = e.order_id
         returning id
       )
       select
         (select count(*)::int from expired) as expired_count,
         (select count(*)::int from closed_payments) as closed_payment_count,
         (select count(*)::int from cancelled_orders) as cancelled_order_count,
         (select count(*)::int from released_slots) as released_slot_count,
         (select count(*)::int from status_logs) as status_log_count`,
      [occurredAt, reason, limit, draft.operatorId || null],
    );
    await client.query('commit');
    const row = result.rows?.[0] || {};
    return {
      expiredCount: normalizeCount(row.expired_count),
      closedPaymentCount: normalizeCount(row.closed_payment_count),
      cancelledOrderCount: normalizeCount(row.cancelled_order_count),
      releasedSlotCount: normalizeCount(row.released_slot_count),
      statusLogCount: normalizeCount(row.status_log_count),
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function transitionOrderTransaction(client, draft) {
  assertClient(client);
  assertTransitionDraft(draft);

  await client.query('begin');
  try {
    const orderResult = await client.query(
      `select id,
              status,
              companion_id,
              availability_slot_id,
              total_amount_cents,
              platform_fee_cents,
              companion_income_cents
       from orders
       where id = $1
       for update`,
      [draft.orderId],
    );
    const order = orderResult.rows?.[0];
    if (!order) throw conflict('ORDER_NOT_FOUND', 'Order not found');

    const nextStatus = nextOrderStatus(order.status, draft.action);
    const occurredAt = draft.occurredAt || new Date().toISOString();
    const paidOrderResult = await client.query(
      `update orders
       set status = $1,
           confirmed_at = case when $1 = 'confirmed' then $2 else confirmed_at end,
           completed_at = case when $1 = 'completed' then $2 else completed_at end,
           cancelled_at = case when $1 in ('cancelled', 'refunding') then $2 else cancelled_at end,
           cancel_reason = case when $1 in ('cancelled', 'refunding') then $3 else cancel_reason end,
           updated_at = now()
       where id = $4
       returning *`,
      [nextStatus, occurredAt, draft.reason || null, draft.orderId],
    );

    if (draft.action === 'complete') {
      await insertSettlementSideEffects(client, draft, order, occurredAt);
    }

    if (draft.action === 'cancel') {
      await client.query(
        `update availability_slots
         set status = 'available',
             locked_order_id = null,
             locked_until = null,
             updated_at = now()
         where id = $1`,
        [order.availability_slot_id],
      );

      if (nextStatus === 'refunding') {
        await client.query(
          `insert into refunds (
            id, order_id, refund_no, amount_cents, reason, status, requested_by
          ) values ($1, $2, $3, $4, $5, 'pending', $6)
          on conflict (refund_no) do nothing`,
          [draft.refundId, draft.orderId, draft.refundNo, order.total_amount_cents, draft.reason || 'Order cancelled', draft.operatorId || null],
        );
      }
    }

    await client.query(
      `insert into order_status_logs (
        id, order_id, from_status, to_status, operator_type, operator_id, reason
      ) values ($1, $2, $3, $4, $5, $6, $7)`,
      [draft.statusLogId, draft.orderId, order.status, nextStatus, draft.operatorType || 'system', draft.operatorId || null, draft.reason || defaultTransitionReason(draft.action)],
    );

    await client.query('commit');
    return {
      order: paidOrderResult.rows?.[0] || null,
      fromStatus: order.status,
      toStatus: nextStatus,
    };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function setAdminOrderStatusTransaction(client, draft) {
  assertClient(client);
  assertAdminStatusDraft(draft);

  await client.query('begin');
  try {
    const orderResult = await client.query(
      `select id,
              status,
              companion_id,
              total_amount_cents,
              platform_fee_cents,
              companion_income_cents
       from orders
       where id = $1
       for update`,
      [draft.orderId],
    );
    const order = orderResult.rows?.[0];
    if (!order) throw conflict('ORDER_NOT_FOUND', 'Order not found');

    const occurredAt = draft.occurredAt || new Date().toISOString();
    const updatedOrderResult = await client.query(
      `update orders
       set status = $1,
           confirmed_at = case when $1 = 'confirmed' then coalesce(confirmed_at, $2) else confirmed_at end,
           completed_at = case when $1 = 'completed' then coalesce(completed_at, $2) else completed_at end,
           cancelled_at = case when $1 in ('cancelled', 'refunding', 'refunded') then coalesce(cancelled_at, $2) else cancelled_at end,
           cancel_reason = case when $1 in ('cancelled', 'refunding', 'refunded') then $3 else cancel_reason end,
           updated_at = now()
       where id = $4
       returning *`,
      [draft.status, occurredAt, draft.reason || null, draft.orderId],
    );

    if (draft.status === 'completed') {
      await insertSettlementSideEffects(client, draft, order, occurredAt);
    }

    await client.query(
      `insert into order_status_logs (
        id, order_id, from_status, to_status, operator_type, operator_id, reason
      ) values ($1, $2, $3, $4, $5, $6, $7)`,
      [draft.statusLogId, draft.orderId, order.status, draft.status, 'admin', draft.adminId || null, draft.reason || 'Manual admin status update'],
    );

    await client.query('commit');
    return {
      order: updatedOrderResult.rows?.[0] || null,
      fromStatus: order.status,
      toStatus: draft.status,
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

function assertTerminalPaymentDraft(draft) {
  const required = ['paymentId', 'status'];
  const missing = required.filter((key) => draft?.[key] === undefined || draft?.[key] === null || draft?.[key] === '');
  if (!['closed', 'failed'].includes(draft?.status)) missing.push('status:closed_or_failed');
  if (missing.length) throw new Error(`Missing terminal payment draft fields: ${missing.join(', ')}`);
}

function assertTransitionDraft(draft) {
  const required = ['orderId', 'action', 'statusLogId'];
  const missing = required.filter((key) => draft?.[key] === undefined || draft?.[key] === null || draft?.[key] === '');
  if (draft?.action === 'complete') {
    for (const key of ['settlementId', 'ledgerEntryId']) {
      if (!draft[key]) missing.push(key);
    }
  }
  if (draft?.action === 'cancel' && draft?.expectRefund) {
    for (const key of ['refundId', 'refundNo']) {
      if (!draft[key]) missing.push(key);
    }
  }
  if (missing.length) throw new Error(`Missing transitionOrder draft fields: ${missing.join(', ')}`);
}

function assertAdminStatusDraft(draft) {
  const required = ['orderId', 'status', 'statusLogId'];
  const missing = required.filter((key) => draft?.[key] === undefined || draft?.[key] === null || draft?.[key] === '');
  if (draft?.status === 'completed') {
    for (const key of ['settlementId', 'ledgerEntryId']) {
      if (!draft[key]) missing.push(key);
    }
  }
  if (missing.length) throw new Error(`Missing admin order status draft fields: ${missing.join(', ')}`);
}

function normalizePositiveInteger(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}

function normalizeCount(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nextOrderStatus(status, action) {
  if (action === 'confirm') {
    if (status !== 'paid_pending_confirm') throw conflict('ORDER_STATUS_INVALID', 'Order cannot be confirmed');
    return 'confirmed';
  }
  if (action === 'complete') {
    if (!['confirmed', 'in_service'].includes(status)) throw conflict('ORDER_STATUS_INVALID', 'Order cannot be completed');
    return 'completed';
  }
  if (action === 'cancel') {
    if (['completed', 'refunded'].includes(status)) throw conflict('ORDER_STATUS_INVALID', 'Order cannot be cancelled');
    return status === 'pending_payment' ? 'cancelled' : 'refunding';
  }
  throw conflict('ORDER_ACTION_INVALID', 'Unknown order action');
}

async function insertSettlementSideEffects(client, draft, order, occurredAt) {
  await client.query(
    `insert into settlements (
      id, order_id, companion_id, gross_amount_cents, platform_fee_cents, net_amount_cents, status, settle_after
    ) values ($1, $2, $3, $4, $5, $6, 'pending', $7)
    on conflict (order_id) do nothing`,
    [
      draft.settlementId,
      order.id,
      order.companion_id,
      order.total_amount_cents,
      order.platform_fee_cents,
      order.companion_income_cents,
      draft.settleAfter || occurredAt,
    ],
  );

  await client.query(
    `insert into companion_wallets (
      companion_id, pending_cents, available_cents, frozen_cents, withdrawn_cents
    ) values ($1, $2, 0, 0, 0)
    on conflict (companion_id) do update
    set pending_cents = companion_wallets.pending_cents + excluded.pending_cents,
        updated_at = now()`,
    [order.companion_id, order.companion_income_cents],
  );

  await client.query(
    `insert into ledger_entries (
      id, companion_id, order_id, settlement_id, entry_type, direction,
      amount_cents, balance_type, balance_after_cents, description
    ) values ($1, $2, $3, $4, 'order_income', 'in', $5, 'pending', $6, $7)`,
    [
      draft.ledgerEntryId,
      order.companion_id,
      order.id,
      draft.settlementId,
      order.companion_income_cents,
      draft.balanceAfterCents || order.companion_income_cents,
      draft.ledgerDescription || 'Order completed',
    ],
  );
}

function defaultTransitionReason(action) {
  if (action === 'confirm') return 'Companion confirmed order';
  if (action === 'complete') return 'Order completed';
  if (action === 'cancel') return 'Order cancelled';
  return 'Order status changed';
}

function conflict(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 409;
  return error;
}
