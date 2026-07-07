import { recordAdminActionTransaction, recordAuditLogTransaction } from '../store/postgresAuditWrites.mjs';

const ids = {
  auditLogId: '00000000-0000-4000-8000-000000000501',
  auditCaseId: '00000000-0000-4000-8000-000000000502',
  operatorId: '00000000-0000-4000-8000-000000000503',
  adminActionLogId: '00000000-0000-4000-8000-000000000504',
  adminId: '00000000-0000-4000-8000-000000000505',
  targetId: '00000000-0000-4000-8000-000000000506',
};

const auditClient = createMockClient();
const auditLog = await recordAuditLogTransaction(auditClient, {
  auditLogId: ids.auditLogId,
  auditCaseId: ids.auditCaseId,
  action: 'approved',
  operatorId: ids.operatorId,
  operatorType: 'admin',
  note: 'Review approved',
  metadata: { source: 'check-postgres-audit-writes' },
});
const auditSql = auditClient.calls.map((call) => call.sql);
assert(auditLog.id === ids.auditLogId, 'returns inserted audit log');
assert(auditSql[0] === 'begin', 'audit log transaction begins');
assert(auditSql.some((statement) => /insert into audit_logs/i.test(statement)), 'inserts audit log');
assert(auditSql.at(-1) === 'commit', 'audit log transaction commits');

const actionClient = createMockClient();
const adminAction = await recordAdminActionTransaction(actionClient, {
  adminActionLogId: ids.adminActionLogId,
  adminId: ids.adminId,
  action: 'audit_approved',
  targetType: 'post',
  targetId: ids.targetId,
  note: 'Post approved',
  beforeData: { status: 'pending' },
  afterData: { status: 'approved' },
  ip: '127.0.0.1',
  userAgent: 'check-postgres-audit-writes',
});
const actionSql = actionClient.calls.map((call) => call.sql);
assert(adminAction.id === ids.adminActionLogId, 'returns inserted admin action');
assert(actionSql[0] === 'begin', 'admin action transaction begins');
assert(actionSql.some((statement) => /insert into admin_action_logs/i.test(statement)), 'inserts admin action log');
assert(actionSql.at(-1) === 'commit', 'admin action transaction commits');

await assertRejects(
  () => recordAuditLogTransaction(createMockClient(), { auditLogId: ids.auditLogId, action: 'approved' }),
  'Missing audit log draft fields: auditCaseId',
  'missing audit case rejects',
);

const failingClient = createMockClient({ failOn: /insert into admin_action_logs/i });
await assertRejects(
  () =>
    recordAdminActionTransaction(failingClient, {
      adminActionLogId: ids.adminActionLogId,
      action: 'audit_rejected',
      targetType: 'post',
      targetId: ids.targetId,
    }),
  'forced insert failure',
  'insert failure rejects',
);
assert(failingClient.calls.at(-1).sql === 'rollback', 'failed admin action rolls back');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['insert-audit-log', 'insert-admin-action-log', 'missing-required-field', 'admin-action-rollback'],
      auditQueryCount: auditClient.calls.length,
      adminActionQueryCount: actionClient.calls.length,
    },
    null,
    2,
  ),
);

function createMockClient(options = {}) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      calls.push({ sql: normalized, params });
      if (options.failOn?.test(normalized)) throw new Error('forced insert failure');
      if (/insert into audit_logs/i.test(normalized)) return { rows: [{ id: params[0], action: params[2] }] };
      if (/insert into admin_action_logs/i.test(normalized)) return { rows: [{ id: params[0], action: params[2] }] };
      return { rows: [] };
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres audit write check failed: ${message}`);
}

async function assertRejects(fn, messagePart, label) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(messagePart), label);
    return;
  }
  throw new Error(`Postgres audit write check failed: ${label}`);
}
