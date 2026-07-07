import { createOrderTransaction, expirePendingPaymentsTransaction, markPaymentPaidTransaction, markPaymentTerminalTransaction, setAdminOrderStatusTransaction, transitionOrderTransaction } from '../store/postgresOrderWrites.mjs';

const draft = {
  orderId: '00000000-0000-4000-8000-000000000001',
  orderNo: 'PP2606110001',
  userId: '00000000-0000-4000-8000-000000000002',
  companionId: '00000000-0000-4000-8000-000000000003',
  postId: '00000000-0000-4000-8000-000000000004',
  activityPricingId: '00000000-0000-4000-8000-000000000005',
  availabilitySlotId: '00000000-0000-4000-8000-000000000006',
  city: 'Shanghai',
  placeName: 'Wukang Road',
  placeAddress: 'Wukang Road, Xuhui District, Shanghai',
  activityName: 'Citywalk',
  durationMinutes: 120,
  startAt: '2026-06-12T06:00:00.000Z',
  endAt: '2026-06-12T08:00:00.000Z',
  baseAmountCents: 39900,
  extraAmountCents: 3900,
  totalAmountCents: 43800,
  platformFeeCents: 3504,
  companionIncomeCents: 40296,
  userNote: 'demo',
  paymentId: '00000000-0000-4000-8000-000000000007',
  paymentNo: 'PAY2606110001',
  paymentChannel: 'wechat_pay',
  statusLogId: '00000000-0000-4000-8000-000000000008',
  lockedUntil: '2026-06-11T12:10:00.000Z',
  extras: [
    {
      id: '00000000-0000-4000-8000-000000000009',
      extraId: '00000000-0000-4000-8000-000000000010',
      name: 'Retouched photos',
      quantity: 1,
      unitPriceCents: 3900,
      amountCents: 3900,
    },
  ],
};

const successClient = createMockClient([{ id: draft.availabilitySlotId, status: 'available' }]);
const result = await createOrderTransaction(successClient, draft);
const successSql = successClient.calls.map((call) => call.sql);

assert(result.order?.id === draft.orderId, 'returns inserted order');
assert(result.payment?.id === draft.paymentId, 'returns inserted payment');
assert(successSql[0] === 'begin', 'transaction begins first');
assert(successSql.some((sql) => /for update/i.test(sql)), 'locks availability slot for update');
assert(successSql.some((sql) => /insert into orders/i.test(sql)), 'inserts order');
assert(successSql.some((sql) => /insert into order_extras/i.test(sql)), 'inserts order extras');
assert(successSql.some((sql) => /insert into payments/i.test(sql)), 'inserts payment');
assert(successSql.some((sql) => /update availability_slots/i.test(sql) && /locked_order_id/i.test(sql)), 'locks slot to order');
assert(successSql.some((sql) => /insert into order_status_logs/i.test(sql)), 'inserts status log');
assert(successSql.at(-1) === 'commit', 'transaction commits last');

const unavailableClient = createMockClient([{ id: draft.availabilitySlotId, status: 'booked' }]);
await assertRejects(() => createOrderTransaction(unavailableClient, draft), 'Slot is not available', 'unavailable slot rejects');
assert(unavailableClient.calls.at(-1).sql === 'rollback', 'unavailable slot rolls back');

const paymentDraft = {
  paymentId: draft.paymentId,
  conversationId: '00000000-0000-4000-8000-000000000011',
  statusLogId: '00000000-0000-4000-8000-000000000012',
  thirdPartyTradeNo: 'wx-trade-001',
  thirdPartyBuyerId: 'openid-demo',
  rawCallback: { transaction_id: 'wx-trade-001' },
  paidAt: '2026-06-12T06:01:00.000Z',
};
const paymentClient = createMockClient([{ payment_status: 'pending', order_status: 'pending_payment' }]);
const paid = await markPaymentPaidTransaction(paymentClient, paymentDraft);
const paymentSql = paymentClient.calls.map((call) => call.sql);

assert(paid.payment?.status === 'paid', 'returns paid payment');
assert(paid.order?.status === 'paid_pending_confirm', 'returns paid order');
assert(paid.conversation?.id === paymentDraft.conversationId, 'returns conversation');
assert(paymentSql[0] === 'begin', 'payment transaction begins first');
assert(paymentSql.some((sql) => /for update of p, o/i.test(sql)), 'locks payment and order for update');
assert(paymentSql.some((sql) => /update payments/i.test(sql) && /status = 'paid'/i.test(sql)), 'updates payment to paid');
assert(paymentSql.some((sql) => /update orders/i.test(sql) && /paid_pending_confirm/i.test(sql)), 'updates order to paid pending confirm');
assert(paymentSql.some((sql) => /update availability_slots/i.test(sql) && /status = 'booked'/i.test(sql)), 'books slot');
assert(paymentSql.some((sql) => /insert into conversations/i.test(sql) && /on conflict/i.test(sql)), 'creates or reuses conversation');
assert(paymentSql.some((sql) => /insert into order_status_logs/i.test(sql)), 'records payment status log');
assert(paymentSql.at(-1) === 'commit', 'payment transaction commits last');

const duplicatePaymentClient = createMockClient([{ payment_status: 'paid', order_status: 'paid_pending_confirm' }]);
const duplicatePaid = await markPaymentPaidTransaction(duplicatePaymentClient, paymentDraft);
assert(duplicatePaid.skipped === true && duplicatePaid.payment?.status === 'paid', 'duplicate paid callback is idempotent');
assert(duplicatePaymentClient.calls.at(-1).sql === 'commit', 'duplicate paid callback commits without side effects');

const invalidPaymentClient = createMockClient([{ payment_status: 'closed', order_status: 'pending_payment' }]);
await assertRejects(() => markPaymentPaidTransaction(invalidPaymentClient, paymentDraft), 'Payment is not pending', 'invalid payment status rejects');
assert(invalidPaymentClient.calls.at(-1).sql === 'rollback', 'invalid payment rolls back');

const terminalPaymentClient = createMockClient([{ payment_status: 'pending' }]);
const terminalPayment = await markPaymentTerminalTransaction(terminalPaymentClient, {
  paymentId: draft.paymentId,
  status: 'closed',
  thirdPartyTradeNo: 'wx-closed-001',
  rawCallback: { trade_state: 'CLOSED' },
  occurredAt: '2026-06-12T06:02:00.000Z',
});
const terminalPaymentSql = terminalPaymentClient.calls.map((call) => call.sql);
assert(terminalPayment.payment?.status === 'closed', 'terminal payment updates status');
assert(terminalPaymentSql.some((sql) => /from payments/i.test(sql) && /for update/i.test(sql)), 'terminal payment locks payment');
assert(terminalPaymentSql.some((sql) => /update payments/i.test(sql) && /raw_callback/i.test(sql)), 'terminal payment stores raw callback');
assert(terminalPaymentSql.at(-1) === 'commit', 'terminal payment commits');

const expiredPaymentClient = createMockClient([{ expired_count: 2, closed_payment_count: 1, cancelled_order_count: 2, released_slot_count: 2, status_log_count: 2 }]);
const expiredPayments = await expirePendingPaymentsTransaction(expiredPaymentClient, {
  occurredAt: '2026-06-12T06:16:00.000Z',
  reason: 'Payment window expired',
  limit: 50,
});
const expiredPaymentSql = expiredPaymentClient.calls.map((call) => call.sql);
assert(expiredPayments.expiredCount === 2, 'expired payment job returns expired count');
assert(expiredPayments.closedPaymentCount === 1, 'expired payment job returns closed payment count');
assert(expiredPayments.releasedSlotCount === 2, 'expired payment job returns released slot count');
assert(expiredPaymentSql.some((sql) => /with expired as/i.test(sql) && /skip locked/i.test(sql)), 'expired payment job locks expired rows with skip locked');
assert(expiredPaymentSql.some((sql) => /update payments/i.test(sql) && /status = 'closed'/i.test(sql)), 'expired payment job closes pending payments');
assert(expiredPaymentSql.some((sql) => /update orders/i.test(sql) && /status = 'cancelled'/i.test(sql)), 'expired payment job cancels orders');
assert(expiredPaymentSql.some((sql) => /update availability_slots/i.test(sql) && /locked_order_id = null/i.test(sql)), 'expired payment job releases slots');
assert(expiredPaymentSql.some((sql) => /insert into order_status_logs/i.test(sql)), 'expired payment job writes status logs');
assert(expiredPaymentSql.at(-1) === 'commit', 'expired payment job commits');

const confirmClient = createMockClient([{ order_status: 'paid_pending_confirm' }]);
const confirmed = await transitionOrderTransaction(confirmClient, {
  orderId: draft.orderId,
  action: 'confirm',
  statusLogId: '00000000-0000-4000-8000-000000000013',
  operatorType: 'companion',
  operatorId: draft.companionId,
});
const confirmSql = confirmClient.calls.map((call) => call.sql);
assert(confirmed.toStatus === 'confirmed' && confirmed.order?.status === 'confirmed', 'confirm transitions to confirmed');
assert(confirmSql.some((sql) => /from orders/i.test(sql) && /for update/i.test(sql)), 'confirm locks order for update');
assert(confirmSql.some((sql) => /update orders/i.test(sql) && /confirmed_at/i.test(sql)), 'confirm updates order');
assert(confirmSql.at(-1) === 'commit', 'confirm commits');

const completeClient = createMockClient([{ order_status: 'confirmed' }]);
const completed = await transitionOrderTransaction(completeClient, {
  orderId: draft.orderId,
  action: 'complete',
  statusLogId: '00000000-0000-4000-8000-000000000014',
  settlementId: '00000000-0000-4000-8000-000000000015',
  ledgerEntryId: '00000000-0000-4000-8000-000000000016',
});
const completeSql = completeClient.calls.map((call) => call.sql);
assert(completed.toStatus === 'completed', 'complete transitions to completed');
assert(completeSql.some((sql) => /insert into settlements/i.test(sql)), 'complete inserts settlement');
assert(completeSql.some((sql) => /insert into companion_wallets/i.test(sql)), 'complete upserts companion wallet');
assert(completeSql.some((sql) => /insert into ledger_entries/i.test(sql)), 'complete inserts ledger entry');
assert(completeSql.at(-1) === 'commit', 'complete commits');

const cancelClient = createMockClient([{ order_status: 'paid_pending_confirm' }]);
const cancelled = await transitionOrderTransaction(cancelClient, {
  orderId: draft.orderId,
  action: 'cancel',
  statusLogId: '00000000-0000-4000-8000-000000000017',
  reason: 'user cancelled',
  refundId: '00000000-0000-4000-8000-000000000018',
  refundNo: 'RF2606110001',
  expectRefund: true,
});
const cancelSql = cancelClient.calls.map((call) => call.sql);
assert(cancelled.toStatus === 'refunding', 'paid cancel transitions to refunding');
assert(cancelSql.some((sql) => /update availability_slots/i.test(sql) && /status = 'available'/i.test(sql)), 'cancel releases slot');
assert(cancelSql.some((sql) => /insert into refunds/i.test(sql)), 'paid cancel inserts refund');
assert(cancelSql.at(-1) === 'commit', 'cancel commits');

const invalidTransitionClient = createMockClient([{ order_status: 'completed' }]);
await assertRejects(() => transitionOrderTransaction(invalidTransitionClient, { orderId: draft.orderId, action: 'cancel', statusLogId: '00000000-0000-4000-8000-000000000019' }), 'Order cannot be cancelled', 'invalid transition rejects');
assert(invalidTransitionClient.calls.at(-1).sql === 'rollback', 'invalid transition rolls back');

const adminStatusClient = createMockClient([{ order_status: 'paid_pending_confirm' }]);
const disputed = await setAdminOrderStatusTransaction(adminStatusClient, {
  orderId: draft.orderId,
  status: 'disputed',
  statusLogId: '00000000-0000-4000-8000-000000000020',
  adminId: '00000000-0000-4000-8000-000000000021',
  reason: 'Manual admin status update',
});
const adminStatusSql = adminStatusClient.calls.map((call) => call.sql);
assert(disputed.toStatus === 'disputed' && disputed.order?.status === 'disputed', 'admin status updates arbitrary status');
assert(adminStatusSql.some((sql) => /from orders/i.test(sql) && /for update/i.test(sql)), 'admin status locks order for update');
assert(adminStatusSql.some((sql) => /update orders/i.test(sql) && /status = \$1/i.test(sql)), 'admin status updates order status');
assert(adminStatusSql.some((sql) => /insert into order_status_logs/i.test(sql)), 'admin status writes status log');
assert(adminStatusSql.at(-1) === 'commit', 'admin status commits');

const adminCompletedClient = createMockClient([{ order_status: 'confirmed' }]);
await setAdminOrderStatusTransaction(adminCompletedClient, {
  orderId: draft.orderId,
  status: 'completed',
  statusLogId: '00000000-0000-4000-8000-000000000022',
  settlementId: '00000000-0000-4000-8000-000000000023',
  ledgerEntryId: '00000000-0000-4000-8000-000000000024',
});
const adminCompletedSql = adminCompletedClient.calls.map((call) => call.sql);
assert(adminCompletedSql.some((sql) => /insert into settlements/i.test(sql)), 'admin completed inserts settlement');
assert(adminCompletedSql.some((sql) => /insert into ledger_entries/i.test(sql)), 'admin completed inserts ledger entry');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'create-begin',
        'slot-for-update',
        'insert-order',
        'insert-extras',
        'insert-payment',
        'lock-slot',
        'create-status-log',
        'create-commit',
        'create-rollback',
        'pay-begin',
        'payment-order-for-update',
        'mark-payment-paid',
        'mark-order-paid',
        'book-slot',
        'conversation',
        'payment-status-log',
        'pay-commit',
        'pay-idempotent-skip',
        'pay-rollback',
        'terminal-payment',
        'expire-pending-payments',
        'confirm-order',
        'complete-order',
        'complete-settlement',
        'complete-wallet',
        'complete-ledger',
        'cancel-release-slot',
        'cancel-refund',
        'transition-rollback',
        'admin-status-update',
        'admin-status-log',
        'admin-complete-settlement',
      ],
      successQueryCount: successClient.calls.length,
      paymentQueryCount: paymentClient.calls.length,
      duplicatePaymentQueryCount: duplicatePaymentClient.calls.length,
      terminalPaymentQueryCount: terminalPaymentClient.calls.length,
      expiredPaymentQueryCount: expiredPaymentClient.calls.length,
      transitionQueryCount: confirmClient.calls.length + completeClient.calls.length + cancelClient.calls.length,
      adminStatusQueryCount: adminStatusClient.calls.length + adminCompletedClient.calls.length,
    },
    null,
    2,
  ),
);

function createMockClient(slotRows) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      calls.push({ sql: normalized, params });
      if (/select id, status from availability_slots/i.test(normalized)) return { rows: slotRows };
      if (/select id, status, companion_id/i.test(normalized) && /from orders/i.test(normalized)) {
        const row = slotRows[0] || {};
        return {
          rows: [
            {
              id: draft.orderId,
              status: row.order_status || 'confirmed',
              companion_id: draft.companionId,
              availability_slot_id: draft.availabilitySlotId,
              total_amount_cents: draft.totalAmountCents,
              platform_fee_cents: draft.platformFeeCents,
              companion_income_cents: draft.companionIncomeCents,
            },
          ],
        };
      }
      if (/select p\.id as payment_id/i.test(normalized)) {
        const row = slotRows[0] || {};
        return {
          rows: [
            {
              payment_id: draft.paymentId,
              payment_status: row.payment_status || 'pending',
              order_id: draft.orderId,
              order_status: row.order_status || 'pending_payment',
              user_id: draft.userId,
              companion_id: draft.companionId,
              availability_slot_id: draft.availabilitySlotId,
            },
          ],
        };
      }
      if (/select id, status from payments/i.test(normalized)) {
        const row = slotRows[0] || {};
        return { rows: [{ id: draft.paymentId, status: row.payment_status || 'pending' }] };
      }
      if (/with expired as/i.test(normalized)) {
        const row = slotRows[0] || {};
        return {
          rows: [
            {
              expired_count: row.expired_count || 0,
              closed_payment_count: row.closed_payment_count || 0,
              cancelled_order_count: row.cancelled_order_count || 0,
              released_slot_count: row.released_slot_count || 0,
              status_log_count: row.status_log_count || 0,
            },
          ],
        };
      }
      if (/insert into orders/i.test(normalized)) return { rows: [{ id: draft.orderId, status: 'pending_payment' }] };
      if (/insert into payments/i.test(normalized)) return { rows: [{ id: draft.paymentId, status: 'pending' }] };
      if (/update payments/i.test(normalized) && /status = 'paid'/i.test(normalized)) return { rows: [{ id: draft.paymentId, status: 'paid' }] };
      if (/update payments/i.test(normalized) && /raw_callback/i.test(normalized)) return { rows: [{ id: draft.paymentId, status: params[0] }] };
      if (/update orders/i.test(normalized) && /paid_pending_confirm/i.test(normalized)) return { rows: [{ id: draft.orderId, status: 'paid_pending_confirm' }] };
      if (/update orders/i.test(normalized)) return { rows: [{ id: draft.orderId, status: params[0] }] };
      if (/insert into conversations/i.test(normalized)) return { rows: [{ id: paymentDraft.conversationId, order_id: draft.orderId, status: 'active' }] };
      return { rows: [] };
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres order write check failed: ${message}`);
}

async function assertRejects(fn, messagePart, label) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(messagePart), label);
    return;
  }
  throw new Error(`Postgres order write check failed: ${label}`);
}
