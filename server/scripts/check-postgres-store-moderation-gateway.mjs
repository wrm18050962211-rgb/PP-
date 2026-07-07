import { createPostgresStore } from '../store/postgresStore.mjs';

const pool = createMockPool();
const store = createPostgresStore({
  databaseUrl: 'postgres://user:pass@127.0.0.1:5432/pp',
  poolFactory: () => pool,
});

assert(store.capabilities.moderationWrites === true, 'postgres store advertises moderation writes');
assert(typeof store.moderationWrites.reviewAuditCase === 'function', 'postgres store exposes audit review gateway');

const result = await store.moderationWrites.createReport({
  reportId: '00000000-0000-4000-8000-000000000811',
  auditCaseId: '00000000-0000-4000-8000-000000000812',
  reporterId: '00000000-0000-4000-8000-000000000813',
  reportedUserId: '00000000-0000-4000-8000-000000000814',
  orderId: '00000000-0000-4000-8000-000000000815',
  conversationId: '00000000-0000-4000-8000-000000000816',
  category: 'message_risk',
  description: 'off-platform contact',
});

const client = pool.clients[0];
assert(result.report?.id === '00000000-0000-4000-8000-000000000811', 'moderation gateway returns report');
assert(result.auditCase?.id === '00000000-0000-4000-8000-000000000812', 'moderation gateway returns audit case');
assert(client.calls.some((call) => /from orders/i.test(call.sql)), 'moderation gateway loads order context');
assert(client.calls.some((call) => /insert into reports/i.test(call.sql)), 'moderation gateway inserts report');
assert(client.calls.some((call) => /insert into audit_cases/i.test(call.sql)), 'moderation gateway inserts audit case');
assert(client.calls.some((call) => /^commit$/i.test(call.sql)), 'moderation gateway commits transaction');
assert(client.released === true, 'moderation gateway releases client');

const reviewResult = await store.moderationWrites.reviewAuditCase({
  caseId: '00000000-0000-4000-8000-000000000812',
  nextStatus: 'approved',
  auditLogId: '00000000-0000-4000-8000-000000000817',
  adminActionLogId: '00000000-0000-4000-8000-000000000818',
  adminId: '00000000-0000-4000-8000-000000000819',
  note: 'Looks good',
});
const reviewClient = pool.clients[1];
assert(reviewResult.nextStatus === 'approved', 'audit review gateway returns next status');
assert(reviewClient.calls.some((call) => /from audit_cases/i.test(call.sql) && /for update/i.test(call.sql)), 'audit review gateway locks case');
assert(reviewClient.calls.some((call) => /update audit_cases/i.test(call.sql)), 'audit review gateway updates case');
assert(reviewClient.calls.some((call) => /insert into audit_logs/i.test(call.sql)), 'audit review gateway writes audit log');
assert(reviewClient.calls.some((call) => /insert into admin_action_logs/i.test(call.sql)), 'audit review gateway writes admin action log');
assert(reviewClient.released === true, 'audit review gateway releases client');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['moderation-write-capability', 'create-report-gateway', 'audit-review-gateway', 'client-release'],
      queryCount: client.calls.length + reviewClient.calls.length,
    },
    null,
    2,
  ),
);

function createMockPool() {
  const clients = [];
  return {
    clients,
    async connect() {
      const client = createMockClient();
      clients.push(client);
      return client;
    },
  };
}

function createMockClient() {
  return {
    calls: [],
    released: false,
    async query(sql, params = []) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      this.calls.push({ sql: normalized, params });
      if (/from orders/i.test(normalized)) {
        return {
          rows: [
            {
              id: params[0],
              user_id: '00000000-0000-4000-8000-000000000813',
              companion_id: '00000000-0000-4000-8000-000000000814',
            },
          ],
        };
      }
      if (/insert into reports/i.test(normalized)) return { rows: [{ id: params[0], category: params[7] }] };
      if (/insert into audit_cases/i.test(normalized)) return { rows: [{ id: params[0], target_id: params[1] }] };
      if (/from audit_cases/i.test(normalized)) return { rows: [{ id: params[0], target_type: 'report', target_id: '00000000-0000-4000-8000-000000000811', status: 'pending' }] };
      if (/update audit_cases/i.test(normalized)) return { rows: [{ id: params[3], status: params[0] }] };
      return { rows: [] };
    },
    release() {
      this.released = true;
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres store moderation gateway check failed: ${message}`);
}
