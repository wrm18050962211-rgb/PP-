import { mirrorAdminAction, mirrorAuditLog, mirrorSecurityEvent } from '../runtimeAuditGateway.mjs';

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
    requiredRole: 'admin',
    actualRole: 'consumer',
    reason: 'Admin role is required',
  }) === true,
  'security event mirror is enabled',
);
assert(writes.securityEvent?.eventId === 'security-event-1', 'security event id is mapped');
assert(writes.securityEvent?.eventType === 'permission_denied', 'security event type is mapped');

assert(mirrorAdminAction({}, { id: 'ignored', action: 'noop' }) === false, 'missing gateway is a no-op');

console.log(JSON.stringify({ ok: true, checks: ['audit-log-mirror', 'admin-action-mirror', 'security-event-mirror', 'missing-gateway-noop'] }, null, 2));

function assert(condition, message) {
  if (!condition) throw new Error(`Runtime audit gateway check failed: ${message}`);
}
