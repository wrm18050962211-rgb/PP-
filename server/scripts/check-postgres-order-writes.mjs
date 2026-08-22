import { createOrderTransaction, expirePendingPaymentsTransaction, markPaymentPaidTransaction, markPaymentTerminalTransaction, markRefundTerminalTransaction, setAdminOrderStatusTransaction, transitionOrderTransaction } from '../store/postgresOrderWrites.mjs';

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
  placeLat: 31.2104,
  placeLng: 121.4386,
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

const invalidCoordinateClient = createMockClient([]);
await assertRejects(
  () => createOrderTransaction(invalidCoordinateClient, { ...draft, placeLat: null }),
  'coordinates must be provided as a pair',
  'single coordinate rejects before the transaction starts',
);
await assertRejects(
  () => createOrderTransaction(invalidCoordinateClient, { ...draft, placeLat: 91 }),
  'latitude must be a finite number between -90 and 90',
  'out-of-range latitude rejects before the transaction starts',
);
await assertRejects(
  () => createOrderTransaction(invalidCoordinateClient, { ...draft, placeLng: '121.4386' }),
  'longitude must be a finite number between -180 and 180',
  'string longitude rejects before the transaction starts',
);
assert(invalidCoordinateClient.calls.length === 0, 'invalid coordinates never reach PostgreSQL');

const emptyCoordinateClient = createMockClient([{ id: draft.availabilitySlotId, status: 'available' }]);
await createOrderTransaction(emptyCoordinateClient, { ...draft, placeLat: null, placeLng: null });
const emptyCoordinateInsert = emptyCoordinateClient.calls.find((call) => /insert into orders/i.test(call.sql));
assert(emptyCoordinateInsert?.params?.[20] === null && emptyCoordinateInsert?.params?.[21] === null, 'double-null legacy coordinates remain compatible');

const successClient = createMockClient([{ id: draft.availabilitySlotId, status: 'available' }]);
const result = await createOrderTransaction(successClient, draft);
const successSql = successClient.calls.map((call) => call.sql);
const orderInsertCall = successClient.calls.find((call) => /insert into orders/i.test(call.sql));

assert(result.order?.id === draft.orderId, 'returns inserted order');
assert(result.payment?.id === draft.paymentId, 'returns inserted payment');
assert(successSql[0] === 'begin', 'transaction begins first');
assert(successSql.some((sql) => /for update/i.test(sql)), 'locks availability slot for update');
assert(successSql.some((sql) => /insert into orders/i.test(sql)), 'inserts order');
assert(/place_lat, place_lng/i.test(orderInsertCall?.sql || ''), 'order insert persists the legacy coordinate snapshot');
assert(orderInsertCall?.params?.[20] === draft.placeLat && orderInsertCall?.params?.[21] === draft.placeLng, 'order insert parameterizes both coordinates');
assert(successSql.some((sql) => /insert into order_extras/i.test(sql)), 'inserts order extras');
assert(!successSql.some((sql) => /insert into order_items/i.test(sql)), 'disabled composite domain leaves the legacy order write unchanged');
assert(successSql.some((sql) => /insert into payments/i.test(sql)), 'inserts payment');
assert(successSql.some((sql) => /update availability_slots/i.test(sql) && /locked_order_id/i.test(sql)), 'locks slot to order');
assert(successSql.some((sql) => /insert into order_status_logs/i.test(sql)), 'inserts status log');
assert(successSql.at(-1) === 'commit', 'transaction commits last');

const compositeClient = createMockClient([{ id: draft.availabilitySlotId, status: 'available' }]);
await createOrderTransaction(compositeClient, draft, {
  compositeOrderDomainEnabled: true,
  photographyItemId: '00000000-0000-4000-8000-000000000019',
});
const photographyItemCall = compositeClient.calls.find((call) => /insert into order_items/i.test(call.sql));
assert(Boolean(photographyItemCall), 'enabled composite domain writes a photography item in the order transaction');
assert(/platform_subsidy_cents, user_payable_cents/i.test(photographyItemCall.sql), 'photography item stores subsidy and final payable fields');
assert(photographyItemCall.params[0] === '00000000-0000-4000-8000-000000000019', 'photography item uses the supplied id');
assert(photographyItemCall.params[11] === draft.totalAmountCents, 'photography item payable reconciles to the aggregate total');
assert(compositeClient.calls.at(-1).sql === 'commit', 'photography item commits atomically with the order');

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

const compositePaymentClient = createMockClient([{ payment_status: 'pending', order_status: 'pending_payment' }]);
await markPaymentPaidTransaction(compositePaymentClient, paymentDraft, { compositeOrderDomainEnabled: true });
const compositePaymentItemCall = compositePaymentClient.calls.find((call) => /update order_items/i.test(call.sql));
assert(Boolean(compositePaymentItemCall), 'enabled domain synchronizes the photography item after payment');
assert(compositePaymentItemCall.params[1] === 'paid_pending_confirm', 'paid photography item enters pending acceptance');

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

const compositeExpiredPaymentClient = createMockClient([{ expired_count: 1, closed_payment_count: 1, cancelled_order_count: 1, cancelled_item_count: 1, released_slot_count: 1, status_log_count: 1 }]);
const compositeExpiredPayments = await expirePendingPaymentsTransaction(compositeExpiredPaymentClient, {
  occurredAt: '2026-06-12T06:16:00.000Z',
  reason: 'Payment window expired',
  limit: 50,
}, { compositeOrderDomainEnabled: true });
const compositeExpiredSql = compositeExpiredPaymentClient.calls.map((call) => call.sql);
assert(compositeExpiredPayments.cancelledItemCount === 1, 'enabled timeout reports cancelled photography items');
assert(compositeExpiredSql.some((sql) => /cancelled_items as/i.test(sql) && /update order_items/i.test(sql)), 'enabled timeout cancels photography items in the same statement');

const confirmClient = createMockClient([{ order_status: 'paid_pending_confirm' }]);
const confirmed = await transitionOrderTransaction(confirmClient, {
  orderId: draft.orderId,
  action: 'confirm',
  statusLogId: '00000000-0000-4000-8000-000000000013',
  operatorType: 'companion',
  operatorId: draft.companionId,
}, { compositeOrderDomainEnabled: true });
const confirmSql = confirmClient.calls.map((call) => call.sql);
assert(confirmed.toStatus === 'confirmed' && confirmed.order?.status === 'confirmed', 'confirm transitions to confirmed');
assert(confirmSql.some((sql) => /from orders/i.test(sql) && /for update/i.test(sql)), 'confirm locks order for update');
assert(confirmSql.some((sql) => /update orders/i.test(sql) && /confirmed_at/i.test(sql)), 'confirm updates order');
assert(confirmSql.some((sql) => /update order_items/i.test(sql)), 'confirm synchronizes the photography item');
assert(confirmClient.calls.find((call) => /update order_items/i.test(call.sql))?.params[1] === 'confirmed', 'confirmed photography item records accepted state');
assert(confirmSql.at(-1) === 'commit', 'confirm commits');

const duplicateConfirmClient = createMockClient([{ order_status: 'confirmed' }]);
const duplicateConfirmed = await transitionOrderTransaction(duplicateConfirmClient, {
  orderId: draft.orderId,
  action: 'confirm',
  statusLogId: '00000000-0000-4000-8000-000000000025',
});
assert(duplicateConfirmed.skipped === true && duplicateConfirmed.toStatus === 'confirmed', 'duplicate confirm is idempotent');
assert(!duplicateConfirmClient.calls.some((call) => /insert into order_status_logs/i.test(call.sql)), 'duplicate confirm does not write status log');
assert(duplicateConfirmClient.calls.at(-1).sql === 'commit', 'duplicate confirm commits without side effects');

const completeClient = createMockClient([{ order_status: 'confirmed' }]);
const completed = await transitionOrderTransaction(completeClient, {
  orderId: draft.orderId,
  action: 'complete',
  statusLogId: '00000000-0000-4000-8000-000000000014',
  settlementId: '00000000-0000-4000-8000-000000000015',
  ledgerEntryId: '00000000-0000-4000-8000-000000000016',
}, { compositeOrderDomainEnabled: true });
const completeSql = completeClient.calls.map((call) => call.sql);
assert(completed.toStatus === 'completed', 'complete transitions to completed');
assert(completeSql.some((sql) => /insert into settlements/i.test(sql)), 'complete inserts settlement');
assert(completeSql.some((sql) => /insert into companion_wallets/i.test(sql)), 'complete upserts companion wallet');
assert(completeSql.some((sql) => /insert into ledger_entries/i.test(sql)), 'complete inserts ledger entry');
assert(completeClient.calls.find((call) => /update order_items/i.test(call.sql))?.params[1] === 'completed', 'completed photography item records fulfillment and settlement state');
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
}, { compositeOrderDomainEnabled: true });
const cancelSql = cancelClient.calls.map((call) => call.sql);
assert(cancelled.toStatus === 'refunding', 'paid cancel transitions to refunding');
assert(cancelSql.some((sql) => /update availability_slots/i.test(sql) && /status = 'available'/i.test(sql)), 'cancel releases slot');
assert(cancelSql.some((sql) => /insert into refunds/i.test(sql)), 'paid cancel inserts refund');
assert(cancelClient.calls.find((call) => /update order_items/i.test(call.sql))?.params[1] === 'refunding', 'paid cancellation marks the photography item refunding');
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
}, { compositeOrderDomainEnabled: true });
const adminStatusSql = adminStatusClient.calls.map((call) => call.sql);
assert(disputed.toStatus === 'disputed' && disputed.order?.status === 'disputed', 'admin status updates arbitrary status');
assert(adminStatusSql.some((sql) => /from orders/i.test(sql) && /for update/i.test(sql)), 'admin status locks order for update');
assert(adminStatusSql.some((sql) => /update orders/i.test(sql) && /status = \$1/i.test(sql)), 'admin status updates order status');
assert(adminStatusSql.some((sql) => /insert into order_status_logs/i.test(sql)), 'admin status writes status log');
assert(adminStatusClient.calls.find((call) => /update order_items/i.test(call.sql))?.params[1] === 'disputed', 'admin dispute freezes the photography item');
assert(adminStatusSql.at(-1) === 'commit', 'admin status commits');

const adminCompletedClient = createMockClient([{ order_status: 'confirmed' }]);
await setAdminOrderStatusTransaction(adminCompletedClient, {
  orderId: draft.orderId,
  status: 'completed',
  statusLogId: '00000000-0000-4000-8000-000000000022',
  settlementId: '00000000-0000-4000-8000-000000000023',
  ledgerEntryId: '00000000-0000-4000-8000-000000000024',
}, { compositeOrderDomainEnabled: true });
const adminCompletedSql = adminCompletedClient.calls.map((call) => call.sql);
assert(adminCompletedSql.some((sql) => /insert into settlements/i.test(sql)), 'admin completed inserts settlement');
assert(adminCompletedSql.some((sql) => /insert into ledger_entries/i.test(sql)), 'admin completed inserts ledger entry');

const refundTerminalClient = createMockClient([{ refund_status: 'pending', order_status: 'refunding' }]);
const refundTerminal = await markRefundTerminalTransaction(refundTerminalClient, {
  refundId: '00000000-0000-4000-8000-000000000025',
  status: 'succeeded',
  statusLogId: '00000000-0000-4000-8000-000000000026',
  thirdPartyRefundNo: 'wx-refund-0001',
  rawCallback: { refund_status: 'SUCCESS' },
}, { compositeOrderDomainEnabled: true });
const refundTerminalSql = refundTerminalClient.calls.map((call) => call.sql);
assert(refundTerminal.toStatus === 'refunded', 'refund terminal success transitions order to refunded');
assert(refundTerminalSql.some((sql) => /from refunds r/i.test(sql) && /for update of r, o/i.test(sql)), 'refund terminal locks refund and order');
assert(refundTerminalSql.some((sql) => /update refunds/i.test(sql) && /raw_callback/i.test(sql)), 'refund terminal updates refund audit fields');
assert(refundTerminalSql.some((sql) => /update orders/i.test(sql) && /status = 'refunded'/i.test(sql)), 'refund terminal updates order to refunded');
assert(refundTerminalClient.calls.find((call) => /update order_items/i.test(call.sql))?.params[1] === 'refunded', 'refund success synchronizes the photography item');
assert(refundTerminalSql.some((sql) => /insert into order_status_logs/i.test(sql)), 'refund terminal writes order status log');
assert(refundTerminalSql.at(-1) === 'commit', 'refund terminal commits');

const duplicateRefundClient = createMockClient([{ refund_status: 'succeeded', order_status: 'refunded' }]);
const duplicateRefund = await markRefundTerminalTransaction(duplicateRefundClient, {
  refundId: '00000000-0000-4000-8000-000000000025',
  status: 'succeeded',
  statusLogId: '00000000-0000-4000-8000-000000000026',
});
assert(duplicateRefund.skipped === true, 'duplicate terminal refund is idempotent');
assert(!duplicateRefundClient.calls.some((call) => /update refunds/i.test(call.sql)), 'duplicate terminal refund skips updates');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'create-begin',
        'slot-for-update',
        'insert-order',
        'insert-legacy-location-coordinates',
        'validate-legacy-location-coordinates',
        'insert-extras',
        'disabled-domain-no-item-write',
        'enabled-domain-photography-item',
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
        'enabled-domain-pay-item-sync',
        'pay-idempotent-skip',
        'pay-rollback',
        'terminal-payment',
        'expire-pending-payments',
        'enabled-domain-expire-item-sync',
        'confirm-order',
        'enabled-domain-confirm-item-sync',
        'confirm-idempotent-skip',
        'complete-order',
        'complete-settlement',
        'complete-wallet',
        'complete-ledger',
        'enabled-domain-complete-item-sync',
        'cancel-release-slot',
        'cancel-refund',
        'enabled-domain-cancel-item-sync',
        'transition-rollback',
        'admin-status-update',
        'admin-status-log',
        'enabled-domain-admin-item-sync',
        'admin-complete-settlement',
        'refund-terminal',
        'enabled-domain-refund-item-sync',
        'refund-terminal-idempotent',
      ],
      successQueryCount: successClient.calls.length,
      paymentQueryCount: paymentClient.calls.length,
      duplicatePaymentQueryCount: duplicatePaymentClient.calls.length,
      terminalPaymentQueryCount: terminalPaymentClient.calls.length,
      expiredPaymentQueryCount: expiredPaymentClient.calls.length,
      transitionQueryCount: confirmClient.calls.length + duplicateConfirmClient.calls.length + completeClient.calls.length + cancelClient.calls.length,
      adminStatusQueryCount: adminStatusClient.calls.length + adminCompletedClient.calls.length,
      refundTerminalQueryCount: refundTerminalClient.calls.length + duplicateRefundClient.calls.length,
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
              cancelled_item_count: row.cancelled_item_count || 0,
              released_slot_count: row.released_slot_count || 0,
              status_log_count: row.status_log_count || 0,
            },
          ],
        };
      }
      if (/from refunds r/i.test(normalized)) {
        const row = slotRows[0] || {};
        return {
          rows: [
            {
              id: params[0],
              status: row.refund_status || 'pending',
              order_id: draft.orderId,
              order_status: row.order_status || 'refunding',
            },
          ],
        };
      }
      if (/insert into orders/i.test(normalized)) return { rows: [{ id: draft.orderId, status: 'pending_payment' }] };
      if (/insert into payments/i.test(normalized)) return { rows: [{ id: draft.paymentId, status: 'pending' }] };
      if (/update payments/i.test(normalized) && /status = 'paid'/i.test(normalized)) return { rows: [{ id: draft.paymentId, status: 'paid' }] };
      if (/update payments/i.test(normalized) && /raw_callback/i.test(normalized)) return { rows: [{ id: draft.paymentId, status: params[0] }] };
      if (/update orders/i.test(normalized) && /paid_pending_confirm/i.test(normalized)) return { rows: [{ id: draft.orderId, status: 'paid_pending_confirm' }] };
      if (/update refunds/i.test(normalized)) return { rows: [{ id: params[5], status: params[0] }] };
      if (/update orders/i.test(normalized) && /status = 'refunded'/i.test(normalized)) return { rows: [{ id: draft.orderId, status: 'refunded' }] };
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
