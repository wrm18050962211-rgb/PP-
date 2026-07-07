export async function createSessionTransaction(client, draft) {
  assertClient(client);
  assertSessionDraft(draft);

  const loginAt = draft.loginAt || new Date().toISOString();

  await client.query('begin');
  try {
    const result = await client.query(
      `insert into user_sessions (
        id, token_hash, session_scope, user_id, admin_id, companion_id, role,
        provider, device_id, ip, user_agent, metadata, login_at, last_seen_at, expires_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      returning *`,
      [
        draft.sessionId,
        draft.tokenHash,
        normalizeScope(draft.sessionScope),
        draft.userId || null,
        draft.adminId || null,
        draft.companionId || null,
        draft.role,
        draft.provider || null,
        draft.deviceId || null,
        draft.ip || null,
        draft.userAgent || null,
        draft.metadata || {},
        loginAt,
        draft.lastSeenAt || loginAt,
        draft.expiresAt,
      ],
    );

    await client.query('commit');
    return result.rows?.[0] || null;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function touchSessionTransaction(client, draft) {
  assertClient(client);
  assertTokenDraft(draft, 'touchSession');

  await client.query('begin');
  try {
    const result = await client.query(
      `update user_sessions
       set last_seen_at = $2,
           updated_at = now()
       where token_hash = $1
         and revoked_at is null
         and expires_at > now()
       returning *`,
      [draft.tokenHash, draft.seenAt || new Date().toISOString()],
    );

    await client.query('commit');
    return result.rows?.[0] || null;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function revokeSessionTransaction(client, draft) {
  assertClient(client);
  assertTokenDraft(draft, 'revokeSession');

  await client.query('begin');
  try {
    const result = await client.query(
      `update user_sessions
       set revoked_at = $2,
           updated_at = now()
       where token_hash = $1
         and revoked_at is null
       returning *`,
      [draft.tokenHash, draft.revokedAt || new Date().toISOString()],
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

function assertSessionDraft(draft) {
  const required = ['sessionId', 'tokenHash', 'role', 'expiresAt'];
  const missing = required.filter((key) => draft?.[key] === undefined || draft?.[key] === null || draft?.[key] === '');
  if (missing.length) throw new Error(`Missing session draft fields: ${missing.join(', ')}`);

  const hasUser = Boolean(draft.userId);
  const hasAdmin = Boolean(draft.adminId);
  if (hasUser === hasAdmin) throw new Error('Session draft must include exactly one of userId or adminId');

  const scope = normalizeScope(draft.sessionScope);
  if (scope === 'admin' && !hasAdmin) throw new Error('Admin session must include adminId');
  if (scope !== 'admin' && !hasUser) throw new Error('User session must include userId');
}

function assertTokenDraft(draft, label) {
  if (!draft?.tokenHash) throw new Error(`Missing ${label} draft fields: tokenHash`);
}

function normalizeScope(scope) {
  return scope || 'user';
}
