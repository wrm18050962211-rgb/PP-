export async function beginIdempotencyRequestTransaction(client, draft) {
  assertClient(client);
  assertKeyDraft(draft);

  await client.query('begin');
  try {
    const existingResult = await client.query(
      `select *
       from idempotency_keys
       where scope = $1
         and request_key = $2
         and actor_type = $3
         and actor_key = $4
       for update`,
      [draft.scope, draft.requestKey, draft.actorType, draft.actorKey],
    );
    const existing = existingResult.rows?.[0];
    if (existing?.status === 'completed') {
      await client.query('commit');
      return { state: 'completed', record: existing };
    }
    if (existing?.status === 'processing' && isFuture(existing.locked_until)) {
      throw conflict('IDEMPOTENCY_IN_PROGRESS', 'Request is already processing');
    }

    const lockedUntil = draft.lockedUntil || new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const result = existing
      ? await client.query(
          `update idempotency_keys
           set request_hash = $1,
               status = 'processing',
               locked_until = $2,
               updated_at = now()
           where id = $3
           returning *`,
          [draft.requestHash || null, lockedUntil, existing.id],
        )
      : await client.query(
          `insert into idempotency_keys (
            id, scope, request_key, actor_type, actor_key, request_hash, status, locked_until
          ) values ($1, $2, $3, $4, $5, $6, 'processing', $7)
          returning *`,
          [draft.idempotencyId, draft.scope, draft.requestKey, draft.actorType, draft.actorKey, draft.requestHash || null, lockedUntil],
        );

    await client.query('commit');
    return { state: 'started', record: result.rows?.[0] || null };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function completeIdempotencyRequestTransaction(client, draft) {
  assertClient(client);
  assertKeyDraft(draft);

  await client.query('begin');
  try {
    const result = await client.query(
      `update idempotency_keys
       set status = $1,
           response_status = $2,
           response_body = $3,
           locked_until = null,
           completed_at = now(),
           updated_at = now()
       where scope = $4
         and request_key = $5
         and actor_type = $6
         and actor_key = $7
       returning *`,
      [
        draft.status || 'completed',
        draft.responseStatus || null,
        draft.responseBody || null,
        draft.scope,
        draft.requestKey,
        draft.actorType,
        draft.actorKey,
      ],
    );
    if (!result.rows?.[0]) throw conflict('IDEMPOTENCY_KEY_NOT_FOUND', 'Idempotency key not found');
    await client.query('commit');
    return result.rows[0];
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

function assertKeyDraft(draft) {
  const required = ['scope', 'requestKey', 'actorType', 'actorKey'];
  const missing = required.filter((key) => draft?.[key] === undefined || draft?.[key] === null || draft?.[key] === '');
  if (missing.length) throw new Error(`Missing idempotency draft fields: ${missing.join(', ')}`);
}

function isFuture(value) {
  const timestamp = new Date(value || '').getTime();
  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function conflict(code, message) {
  const error = new Error(message);
  error.code = code;
  error.status = 409;
  return error;
}
