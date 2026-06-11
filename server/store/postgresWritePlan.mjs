export const postgresWriteOperations = [
  {
    name: 'createOrder',
    route: 'POST /api/orders',
    transaction: true,
    tables: ['orders', 'order_extras', 'order_status_logs', 'payments', 'availability_slots'],
    steps: [
      'select activity_pricings and availability_slots for update',
      'validate availability_slots.status = available',
      'insert orders with status pending_payment',
      'insert selected order_extras',
      'insert payments with status pending',
      'update availability_slots to locked with locked_order_id',
      'insert order_status_logs',
    ],
  },
  {
    name: 'markPaymentPaid',
    route: 'POST /api/payments/:paymentId/mock-success',
    transaction: true,
    tables: ['payments', 'orders', 'availability_slots', 'conversations', 'order_status_logs'],
    steps: [
      'select payments and related orders for update',
      'validate payment.status = pending and order.status = pending_payment',
      'update payments to paid',
      'update orders to paid_pending_confirm and set paid_at',
      'update availability_slots to booked',
      'insert conversations if missing',
      'insert order_status_logs',
    ],
  },
  {
    name: 'transitionOrder',
    route: 'POST /api/orders/:orderId/:action',
    transaction: true,
    tables: ['orders', 'order_status_logs', 'availability_slots', 'settlements', 'wallets', 'ledger_entries', 'refunds'],
    steps: [
      'select orders for update',
      'validate role permission and allowed status transition',
      'update orders to next status',
      'insert order_status_logs',
      'release availability_slots on cancel when applicable',
      'insert settlements, wallets, ledger_entries, or refunds when applicable',
    ],
  },
  {
    name: 'sendMessage',
    route: 'POST /api/conversations/:conversationId/messages',
    transaction: true,
    tables: ['conversations', 'messages', 'message_risk_events'],
    steps: [
      'select conversations with related order access context',
      'evaluate content against risk_keywords',
      'insert clean or flagged messages',
      'insert message_risk_events for flagged or blocked content',
      'update conversations.last_message_at',
    ],
  },
  {
    name: 'createReport',
    route: 'POST /api/orders/:orderId/report',
    transaction: true,
    tables: ['reports', 'audit_cases'],
    steps: ['select orders for report context', 'insert reports', 'insert linked audit_cases for moderation queue'],
  },
  {
    name: 'applyModerationAction',
    route: 'POST /api/admin/moderation/:caseId/actions',
    transaction: true,
    tables: ['message_risk_events', 'reports', 'admin_action_logs', 'orders', 'conversations'],
    steps: [
      'select risk/report case for update',
      'insert admin_action_logs',
      'update case status',
      'apply side effect such as restrict_chat or freeze_order',
    ],
  },
];

export function getPostgresWriteOperation(name) {
  return postgresWriteOperations.find((operation) => operation.name === name);
}
