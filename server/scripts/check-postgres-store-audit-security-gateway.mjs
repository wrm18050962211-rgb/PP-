import { createPostgresStore } from '../store/postgresStore.mjs';

const ids = {
  auditLogId: '00000000-0000-4000-8000-000000000701',
  auditCaseId: '00000000-0000-4000-8000-000000000702',
  adminActionLogId: '00000000-0000-4000-8000-000000000703',
  adminId: '00000000-0000-4000-8000-000000000704',
  eventId: '00000000-0000-4000-8000-000000000705',
  targetId: '00000000-0000-4000-8000-000000000706',
};

const pool = createMockPool();
const store = createPostgresStore({
  databaseUrl: 'postgres://user:pass@127.0.0.1:5432/pp',
  poolFactory: () => pool,
});

assert(store.capabilities.auditWrites === true, 'postgres store advertises audit writes');
assert(store.capabilities.securityWrites === true, 'postgres store advertises security writes');

const auditLog = await store.auditWrites.recordAuditLog({
  auditLogId: ids.auditLogId,
  auditCaseId: ids.auditCaseId,
  action: 'approved',
  operatorId: ids.adminId,
  note: 'Approved by admin',
});
assert(auditLog.id === ids.auditLogId, 'records audit log through store gateway');
assert(pool.clients[0].calls.some((call) => /insert into audit_logs/i.test(call.sql)), 'audit gateway inserts audit log');
assert(pool.clients[0].released === true, 'audit log gateway releases client');

const adminAction = await store.auditWrites.recordAdminAction({
  adminActionLogId: ids.adminActionLogId,
  adminId: ids.adminId,
  action: 'audit_approved',
  targetType: 'post',
  targetId: ids.targetId,
  afterData: { status: 'approved' },
});
assert(adminAction.id === ids.adminActionLogId, 'records admin action through store gateway');
assert(pool.clients[1].calls.some((call) => /insert into admin_action_logs/i.test(call.sql)), 'admin action gateway inserts action log');
assert(pool.clients[1].released === true, 'admin action gateway releases client');

const securityEvent = await store.securityWrites.recordSecurityEvent({
  eventId: ids.eventId,
  eventType: 'permission_denied',
  actorId: ids.adminId,
  actorRole: 'consumer',
  targetType: 'admin_api',
  requiredRole: 'admin',
  actualRole: 'consumer',
  reason: 'Admin role is required',
});
assert(securityEvent.id === ids.eventId, 'records security event through store gateway');
assert(pool.clients[2].calls.some((call) => /insert into security_events/i.test(call.sql)), 'security gateway inserts event');
assert(pool.clients[2].released === true, 'security gateway releases client');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['audit-write-capability', 'security-write-capability', 'audit-log-gateway', 'admin-action-gateway', 'security-event-gateway', 'client-release'],
      clientCount: pool.clients.length,
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
      if (/insert into audit_logs/i.test(normalized)) return { rows: [{ id: params[0], action: params[2] }] };
      if (/insert into admin_action_logs/i.test(normalized)) return { rows: [{ id: params[0], action: params[2] }] };
      if (/insert into security_events/i.test(normalized)) return { rows: [{ id: params[0], event_type: params[1] }] };
      return { rows: [] };
    },
    release() {
      this.released = true;
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres store audit/security gateway check failed: ${message}`);
}
