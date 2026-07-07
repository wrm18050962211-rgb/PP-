export async function recordAuditLogTransaction(client, draft) {
  assertClient(client);
  assertAuditLogDraft(draft);

  await client.query('begin');
  try {
    const result = await client.query(
      `insert into audit_logs (
        id, audit_case_id, action, operator_id, operator_type, comment, metadata
      ) values ($1, $2, $3, $4, $5, $6, $7)
      returning *`,
      [
        draft.auditLogId,
        draft.auditCaseId,
        draft.action,
        draft.operatorId || null,
        draft.operatorType || 'admin',
        draft.comment || draft.note || null,
        draft.metadata || {},
      ],
    );

    await client.query('commit');
    return result.rows?.[0] || null;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function recordAdminActionTransaction(client, draft) {
  assertClient(client);
  assertAdminActionDraft(draft);

  await client.query('begin');
  try {
    const result = await client.query(
      `insert into admin_action_logs (
        id, admin_id, action, target_type, target_id, before_data, after_data, ip, user_agent
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      returning *`,
      [
        draft.adminActionLogId,
        draft.adminId || null,
        draft.action,
        draft.targetType || null,
        draft.targetId || null,
        draft.beforeData || null,
        draft.afterData || { note: draft.note || '' },
        draft.ip || null,
        draft.userAgent || null,
      ],
    );

    await client.query('commit');
    return result.rows?.[0] || null;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

function assertClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('PostgreSQL client with query(sql, params) is required');
  }
}

function assertAuditLogDraft(draft) {
  const required = ['auditLogId', 'auditCaseId', 'action'];
  const missing = required.filter((key) => draft?.[key] === undefined || draft?.[key] === null || draft?.[key] === '');
  if (missing.length) throw new Error(`Missing audit log draft fields: ${missing.join(', ')}`);
}

function assertAdminActionDraft(draft) {
  const required = ['adminActionLogId', 'action'];
  const missing = required.filter((key) => draft?.[key] === undefined || draft?.[key] === null || draft?.[key] === '');
  if (missing.length) throw new Error(`Missing admin action draft fields: ${missing.join(', ')}`);
}
