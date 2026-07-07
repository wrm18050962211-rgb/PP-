import { mirrorAdminAction, mirrorAuditLog, mirrorSecurityEvent } from '../runtimeAuditGateway.mjs';
import { readFileSync } from 'node:fs';

const writes = {
  auditLog: null,
  adminAction: null,
  securityEvent: null,
};

const dataStore = {
  auditWrites: {
    recordAuditLog: async (draft) => {
      writes.auditLog = draft;
    },
    recordAdminAction: async (draft) => {
      writes.adminAction = draft;
    },
  },
  securityWrites: {
    recordSecurityEvent: async (draft) => {
      writes.securityEvent = draft;
    },
  },
};

assert(
  mirrorAuditLog(dataStore, {
    id: 'audit-log-1',
    auditCaseId: 'audit-case-1',
    action: 'approved',
    operatorId: 'admin-1',
    operatorType: 'admin',
    note: 'looks good',
    metadata: { source: 'check-runtime-audit-gateway' },
  }) === true,
  'audit log mirror is enabled',
);
assert(writes.auditLog?.auditLogId === 'audit-log-1', 'audit log id is mapped');
assert(writes.auditLog?.auditCaseId === 'audit-case-1', 'audit case id is mapped');

assert(
  mirrorAdminAction(dataStore, {
    id: 'admin-action-1',
    adminId: 'admin-1',
    action: 'order_status_update',
    targetType: 'order',
    targetId: 'order-1',
    note: 'status updated',
  }) === true,
  'admin action mirror is enabled',
);
assert(writes.adminAction?.adminActionLogId === 'admin-action-1', 'admin action id is mapped');
assert(writes.adminAction?.targetType === 'order', 'admin action target type is mapped');

assert(
  mirrorSecurityEvent(dataStore, {
    id: 'security-event-1',
    type: 'permission_denied',
    actorId: 'user-1',
    actorRole: 'consumer',
    targetType: 'admin_api',
    targetId: 'admin-route',
    targetKey: '/api/admin/orders',
    requiredRole: 'admin',
    actualRole: 'consumer',
    reason: 'Admin role is required',
    metadata: { method: 'GET' },
    ip: '127.0.0.1',
    userAgent: 'runtime-audit-check',
  }) === true,
  'security event mirror is enabled',
);
assert(writes.securityEvent?.eventId === 'security-event-1', 'security event id is mapped');
assert(writes.securityEvent?.eventType === 'permission_denied', 'security event type is mapped');
assert(writes.securityEvent?.targetKey === '/api/admin/orders', 'security event target key is mapped');
assert(writes.securityEvent?.metadata?.method === 'GET', 'security event metadata is mapped');
assert(writes.securityEvent?.ip === '127.0.0.1', 'security event ip is mapped');
assert(writes.securityEvent?.userAgent === 'runtime-audit-check', 'security event user agent is mapped');

assert(mirrorAdminAction({}, { id: 'ignored', action: 'noop' }) === false, 'missing gateway is a no-op');

const serverSource = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
assert(/id: dataStore\.kind !== 'json' \? postgresId\(\) : id\('audit-log'\)/.test(serverSource), 'runtime audit log uses uuid id in postgres mode');
assert(/id: dataStore\.kind !== 'json' \? postgresId\(\) : id\('admin-action'\)/.test(serverSource), 'runtime admin action uses uuid id in postgres mode');
assert(/id: dataStore\.kind !== 'json' \? postgresId\(\) : id\('security-event'\)/.test(serverSource), 'runtime security event uses uuid id in postgres mode');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['audit-log-mirror', 'admin-action-mirror', 'security-event-mirror', 'security-event-context', 'postgres-runtime-uuid-ids', 'missing-gateway-noop'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Runtime audit gateway check failed: ${message}`);
}
