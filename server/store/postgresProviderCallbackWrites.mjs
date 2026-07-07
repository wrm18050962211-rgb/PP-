export async function recordProviderCallbackReceivedTransaction(client, draft = {}) {
  assertClient(client);
  assertReceivedDraft(draft);

  await client.query('begin');
  try {
    const result = await client.query(
      `insert into provider_callback_events (
        id, provider, event_type, provider_event_id, request_headers, raw_body, raw_payload, status
      ) values ($1, $2, $3, $4, $5, $6, $7, 'received')
      on conflict (provider, event_type, provider_event_id) do update
      set request_headers = excluded.request_headers,
          raw_body = excluded.raw_body,
          raw_payload = excluded.raw_payload,
          status = case
            when provider_callback_events.status = 'processed' then provider_callback_events.status
            else 'received'
          end,
          updated_at = now()
      returning *`,
      [
        draft.callbackEventId,
        draft.provider,
        draft.eventType,
        draft.providerEventId,
        draft.requestHeaders || {},
        draft.rawBody || null,
        draft.rawPayload || {},
      ],
    );
    await client.query('commit');
    return result.rows?.[0] || null;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function markProviderCallbackProcessedTransaction(client, draft = {}) {
  assertClient(client);
  assertCallbackEventId(draft);

  const processedAt = draft.processedAt || new Date().toISOString();
  await client.query('begin');
  try {
    const result = await client.query(
      `update provider_callback_events
       set status = 'processed',
           object_type = coalesce($2, object_type),
           object_id = coalesce($3, object_id),
           payment_id = coalesce($4, payment_id),
           refund_id = coalesce($5, refund_id),
           order_id = coalesce($6, order_id),
           last_error = null,
           processed_at = $7,
           updated_at = now()
       where id = $1
       returning *`,
      [
        draft.callbackEventId,
        draft.objectType || null,
        draft.objectId || null,
        draft.paymentId || null,
        draft.refundId || null,
        draft.orderId || null,
        processedAt,
      ],
    );
    await client.query('commit');
    return result.rows?.[0] || null;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function markProviderCallbackFailedTransaction(client, draft = {}) {
  assertClient(client);
  assertCallbackEventId(draft);

  const retryable = draft.retryable !== false;
  await client.query('begin');
  try {
    const result = await client.query(
      `update provider_callback_events
       set status = $2,
           retry_count = retry_count + 1,
           next_retry_at = $3,
           last_error = $4,
           updated_at = now()
       where id = $1
       returning *`,
      [
        draft.callbackEventId,
        retryable ? 'retrying' : 'failed',
        retryable ? draft.nextRetryAt || null : null,
        draft.lastError || 'Provider callback processing failed',
      ],
    );
    await client.query('commit');
    return result.rows?.[0] || null;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function claimDueProviderCallbacksTransaction(client, draft = {}) {
  assertClient(client);

  const dueAt = draft.dueAt || new Date().toISOString();
  const limit = normalizePositiveInteger(draft.limit, 20, 200);
  await client.query('begin');
  try {
    const result = await client.query(
      `with due as (
         select id
         from provider_callback_events
         where status = 'retrying'
           and (next_retry_at is null or next_retry_at <= $1)
         order by coalesce(next_retry_at, created_at) asc, created_at asc
         limit $2
         for update skip locked
       )
       update provider_callback_events e
       set status = 'processing',
           updated_at = now()
       from due
       where e.id = due.id
       returning e.*`,
      [dueAt, limit],
    );
    await client.query('commit');
    return result.rows || [];
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

function assertReceivedDraft(draft) {
  const required = ['callbackEventId', 'provider', 'eventType', 'providerEventId'];
  const missing = required.filter((key) => draft?.[key] === undefined || draft?.[key] === null || draft?.[key] === '');
  if (missing.length) throw new Error(`Missing provider callback draft fields: ${missing.join(', ')}`);
}

function assertCallbackEventId(draft) {
  if (!draft?.callbackEventId) throw new Error('Missing provider callback draft fields: callbackEventId');
}

function normalizePositiveInteger(value, fallback, max) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(Math.floor(parsed), max);
}
