export function mirrorAuditLog(dataStore, log) {
  const writer = dataStore?.auditWrites?.recordAuditLog;
  if (typeof writer !== 'function') return false;

  void writer({
    auditLogId: log.id,
    auditCaseId: log.auditCaseId,
    action: log.action,
    operatorId: log.operatorId || null,
    operatorType: log.operatorType || 'admin',
    comment: log.comment || log.note || null,
    note: log.note || log.comment || null,
    metadata: log.metadata || {},
  }).catch((error) => warnMirrorFailure('audit log', error));
  return true;
}

export function mirrorAdminAction(dataStore, log) {
  const writer = dataStore?.auditWrites?.recordAdminAction;
  if (typeof writer !== 'function') return false;

  void writer({
    adminActionLogId: log.id,
    adminId: log.adminId || null,
    action: log.action,
    targetType: log.targetType || null,
    targetId: log.targetId || null,
    note: log.note || '',
    beforeData: log.beforeData || null,
    afterData: log.afterData || { note: log.note || '' },
  }).catch((error) => warnMirrorFailure('admin action', error));
  return true;
}

export function mirrorSecurityEvent(dataStore, event) {
  const writer = dataStore?.securityWrites?.recordSecurityEvent;
  if (typeof writer !== 'function') return false;

  void writer({
    eventId: event.id,
    eventType: event.type,
    actorId: event.actorId || null,
    actorRole: event.actorRole || 'anonymous',
    targetType: event.targetType || null,
    targetId: event.targetId || null,
    requiredRole: event.requiredRole || null,
    actualRole: event.actualRole || null,
    action: event.action || null,
    reason: event.reason || null,
    metadata: event.metadata || {},
  }).catch((error) => warnMirrorFailure('security event', error));
  return true;
}

function warnMirrorFailure(label, error) {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[audit-gateway] Failed to mirror ${label}: ${message}`);
}
