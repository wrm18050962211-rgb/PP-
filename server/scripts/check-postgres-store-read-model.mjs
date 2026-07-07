import { createPostgresStore } from '../store/postgresStore.mjs';

const pool = createMockPool();
const store = createPostgresStore({
  databaseUrl: 'postgres://user:pass@127.0.0.1:5432/pp',
  poolFactory: () => pool,
});

const result = await store.load();
const loadedStore = result.store;

assert(result.changed === false, 'postgres load is read-only');
assert(loadedStore.orders[0]?.orderNo === 'ST2607080001', 'orders are loaded into read model');
assert(loadedStore.orders[0]?.companion === 'Mori', 'order companion name is attached');
assert(loadedStore.payments[0]?.paymentNo === 'PAY2607080001', 'payments are loaded into read model');
assert(loadedStore.payments[0]?.orderId === loadedStore.orders[0]?.id, 'payment order link is preserved');
assert(loadedStore.conversations['00000000-0000-4000-8000-000000000901']?.messages[0]?.text === 'Hello from Postgres', 'conversation messages are loaded');
assert(loadedStore.riskCases[0]?.orderId === loadedStore.orders[0]?.id, 'message risk cases are loaded');
assert(loadedStore.reports[0]?.orderId === loadedStore.orders[0]?.id, 'reports are loaded');
assert(loadedStore.auditCases[0]?.targetId === loadedStore.reports[0]?.id, 'audit cases are loaded');
assert(loadedStore.refunds[0]?.orderId === loadedStore.orders[0]?.id, 'refunds are loaded');
assert(loadedStore.settlements[0]?.orderId === loadedStore.orders[0]?.id, 'settlements are loaded');
assert(loadedStore.ledgerEntries[0]?.settlementId === loadedStore.settlements[0]?.id, 'ledger entries are loaded');
assert(loadedStore.wallets[0]?.companionId === loadedStore.orders[0]?.companionId, 'wallets are loaded');
assert(pool.calls.some((call) => /from orders/i.test(call.sql)), 'orders query is issued');
assert(pool.calls.some((call) => /from payments/i.test(call.sql)), 'payments query is issued');
assert(pool.calls.some((call) => /from conversations/i.test(call.sql)), 'conversations query is issued');
assert(pool.calls.some((call) => /from messages/i.test(call.sql)), 'messages query is issued');
assert(pool.calls.some((call) => /from message_risk_events/i.test(call.sql)), 'message risk events query is issued');
assert(pool.calls.some((call) => /from reports/i.test(call.sql)), 'reports query is issued');
assert(pool.calls.some((call) => /from audit_cases/i.test(call.sql)), 'audit cases query is issued');
assert(pool.calls.some((call) => /from refunds/i.test(call.sql)), 'refunds query is issued');
assert(pool.calls.some((call) => /from settlements/i.test(call.sql)), 'settlements query is issued');
assert(pool.calls.some((call) => /from ledger_entries/i.test(call.sql)), 'ledger entries query is issued');
assert(pool.calls.some((call) => /from companion_wallets/i.test(call.sql)), 'wallets query is issued');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['store-load-read-model', 'orders-query', 'payments-query', 'conversations-query', 'messages-query', 'risk-query', 'reports-query', 'audit-cases-query', 'refunds-query', 'settlements-query', 'ledger-query', 'wallets-query'],
      orderCount: loadedStore.orders.length,
      paymentCount: loadedStore.payments.length,
      conversationCount: Object.keys(loadedStore.conversations).length,
      riskCaseCount: loadedStore.riskCases.length,
      reportCount: loadedStore.reports.length,
      auditCaseCount: loadedStore.auditCases.length,
      refundCount: loadedStore.refunds.length,
      settlementCount: loadedStore.settlements.length,
      queryCount: pool.calls.length,
    },
    null,
    2,
  ),
);

function createMockPool() {
  return {
    calls: [],
    async query(sql) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      this.calls.push({ sql: normalized });
      if (/from companions/i.test(normalized)) {
        return {
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000902',
              user_id: '00000000-0000-4000-8000-000000000903',
              display_name: 'Mori',
              headline: 'City portrait photographer',
              bio: 'Good at relaxed lifestyle portraits.',
              city: 'Shanghai',
              gender: 'female',
              base_price_cents: 39900,
              rating_avg: 4.9,
              rating_count: 12,
              status: 'approved',
              service_enabled: true,
              accepts_instant: true,
              online_status: 'online',
              response_time_minutes: 8,
              created_at: '2026-07-08T08:00:00.000Z',
              updated_at: '2026-07-08T08:00:00.000Z',
            },
          ],
        };
      }
      if (/from orders/i.test(normalized)) {
        return {
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000901',
              order_no: 'ST2607080001',
              user_id: '00000000-0000-4000-8000-000000000904',
              companion_id: '00000000-0000-4000-8000-000000000902',
              post_id: null,
              activity_pricing_id: '00000000-0000-4000-8000-000000000905',
              availability_slot_id: '00000000-0000-4000-8000-000000000906',
              city: 'Shanghai',
              place_name: 'Wukang Road',
              activity_name: 'Citywalk',
              duration_minutes: 120,
              start_at: '2026-07-08T09:00:00.000Z',
              end_at: '2026-07-08T11:00:00.000Z',
              total_amount_cents: 39900,
              status: 'paid_pending_confirm',
              created_at: '2026-07-08T08:30:00.000Z',
              updated_at: '2026-07-08T08:45:00.000Z',
            },
          ],
        };
      }
      if (/from payments/i.test(normalized)) {
        return {
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000909',
              order_id: '00000000-0000-4000-8000-000000000901',
              payment_no: 'PAY2607080001',
              channel: 'wechat_pay',
              amount_cents: 39900,
              status: 'paid',
              third_party_trade_no: 'wx-trade-260708',
              paid_at: '2026-07-08T08:50:00.000Z',
              closed_at: null,
              created_at: '2026-07-08T08:30:00.000Z',
              updated_at: '2026-07-08T08:50:00.000Z',
            },
          ],
        };
      }
      if (/from conversations/i.test(normalized) && !/from messages/i.test(normalized)) {
        return {
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000907',
              order_id: '00000000-0000-4000-8000-000000000901',
              user_id: '00000000-0000-4000-8000-000000000904',
              companion_id: '00000000-0000-4000-8000-000000000902',
              status: 'active',
              last_message_at: '2026-07-08T09:05:00.000Z',
              created_at: '2026-07-08T09:00:00.000Z',
              updated_at: '2026-07-08T09:05:00.000Z',
            },
          ],
        };
      }
      if (/from messages/i.test(normalized)) {
        return {
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000908',
              conversation_id: '00000000-0000-4000-8000-000000000907',
              sender_role: 'user',
              message_type: 'text',
              content: 'Hello from Postgres',
              original_content: 'Hello from Postgres',
              risk_status: 'clean',
              sent_at: '2026-07-08T09:05:00.000Z',
            },
          ],
        };
      }
      if (/from message_risk_events/i.test(normalized)) {
        return {
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000910',
              message_id: '00000000-0000-4000-8000-000000000908',
              conversation_id: '00000000-0000-4000-8000-000000000907',
              order_id: '00000000-0000-4000-8000-000000000901',
              user_id: '00000000-0000-4000-8000-000000000904',
              matched_keywords: ['wechat'],
              risk_type: 'private_transaction',
              risk_level: 'high',
              action_taken: 'block',
              review_status: 'pending',
              raw_payload: { content: 'Add my wechat' },
              created_at: '2026-07-08T09:06:00.000Z',
            },
          ],
        };
      }
      if (/from reports/i.test(normalized)) {
        return {
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000911',
              reporter_id: '00000000-0000-4000-8000-000000000904',
              reported_user_id: null,
              order_id: '00000000-0000-4000-8000-000000000901',
              conversation_id: '00000000-0000-4000-8000-000000000907',
              target_type: 'order',
              target_id: '00000000-0000-4000-8000-000000000901',
              category: 'Order dispute',
              description: 'Photographer was late.',
              evidence_files: [],
              status: 'pending',
              handled_at: null,
              result: null,
              created_at: '2026-07-08T09:10:00.000Z',
              updated_at: '2026-07-08T09:10:00.000Z',
            },
          ],
        };
      }
      if (/from audit_cases/i.test(normalized)) {
        return {
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000912',
              target_type: 'report',
              target_id: '00000000-0000-4000-8000-000000000911',
              status: 'pending',
              risk_level: 'medium',
              submitted_by: '00000000-0000-4000-8000-000000000904',
              reason: 'Order dispute',
              snapshot: { reportId: '00000000-0000-4000-8000-000000000911' },
              submitted_at: '2026-07-08T09:11:00.000Z',
              reviewed_at: null,
              created_at: '2026-07-08T09:11:00.000Z',
              updated_at: '2026-07-08T09:11:00.000Z',
            },
          ],
        };
      }
      if (/from refunds/i.test(normalized)) {
        return {
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000913',
              order_id: '00000000-0000-4000-8000-000000000901',
              payment_id: '00000000-0000-4000-8000-000000000909',
              refund_no: 'REF2607080001',
              amount_cents: 19900,
              reason: 'Client cancellation',
              status: 'pending',
              requested_by: '00000000-0000-4000-8000-000000000904',
              processed_by: null,
              refunded_at: null,
              created_at: '2026-07-08T09:20:00.000Z',
              updated_at: '2026-07-08T09:20:00.000Z',
            },
          ],
        };
      }
      if (/from settlements/i.test(normalized)) {
        return {
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000914',
              order_id: '00000000-0000-4000-8000-000000000901',
              companion_id: '00000000-0000-4000-8000-000000000902',
              gross_amount_cents: 39900,
              platform_fee_cents: 3192,
              net_amount_cents: 36708,
              status: 'pending',
              settle_after: '2026-07-09T09:00:00.000Z',
              settled_at: null,
              frozen_reason: null,
              created_at: '2026-07-08T09:30:00.000Z',
              updated_at: '2026-07-08T09:30:00.000Z',
            },
          ],
        };
      }
      if (/from ledger_entries/i.test(normalized)) {
        return {
          rows: [
            {
              id: '00000000-0000-4000-8000-000000000915',
              companion_id: '00000000-0000-4000-8000-000000000902',
              order_id: '00000000-0000-4000-8000-000000000901',
              settlement_id: '00000000-0000-4000-8000-000000000914',
              entry_type: 'order_income',
              direction: 'in',
              amount_cents: 36708,
              balance_type: 'pending',
              balance_after_cents: 36708,
              status: 'posted',
              description: 'Order completed',
              created_at: '2026-07-08T09:31:00.000Z',
            },
          ],
        };
      }
      if (/from companion_wallets/i.test(normalized)) {
        return {
          rows: [
            {
              companion_id: '00000000-0000-4000-8000-000000000902',
              pending_cents: 36708,
              available_cents: 120000,
              frozen_cents: 0,
              withdrawn_cents: 50000,
              created_at: '2026-07-08T09:31:00.000Z',
              updated_at: '2026-07-08T09:31:00.000Z',
            },
          ],
        };
      }
      return { rows: [] };
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres store read model check failed: ${message}`);
}
