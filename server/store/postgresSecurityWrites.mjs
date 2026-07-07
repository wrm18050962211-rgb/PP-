export async function recordSecurityEventTransaction(client, draft) {
  assertClient(client);
  assertSecurityEventDraft(draft);

  await client.query('begin');
  try {
    const result = await client.query(
      `insert into security_events (
        id, event_type, actor_id, actor_role, target_type, target_id, target_key,
        required_role, actual_role, action, reason, metadata, ip, user_agent
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      returning *`,
      [
        draft.eventId,
        draft.eventType,
        draft.actorId || null,
        draft.actorRole || 'anonymous',
        draft.targetType || null,
        draft.targetId || null,
        draft.targetKey || null,
        draft.requiredRole || null,
        draft.actualRole || null,
        draft.action || null,
        draft.reason || null,
        draft.metadata || {},
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

function assertSecurityEventDraft(draft) {
  const required = ['eventId', 'eventType'];
  const missing = required.filter((key) => draft?.[key] === undefined || draft?.[key] === null || draft?.[key] === '');
  if (missing.length) throw new Error(`Missing security event draft fields: ${missing.join(', ')}`);
}
