export async function issuePhoneVerificationChallengeTransaction(client, draft) {
  assertClient(client);
  assertIssueDraft(draft);
  await client.query('begin');
  try {
    await client.query(
      `select pg_advisory_xact_lock(hashtext($1))`,
      [`phone-verification:${draft.purpose}:${draft.phone}`],
    );

    const latestResult = await client.query(
      `select created_at
       from phone_verification_challenges
       where phone = $1
         and purpose = $2
         and delivery_status in ('pending', 'sent')
       order by created_at desc
       limit 1`,
      [draft.phone, draft.purpose],
    );
    const latestCreatedAt = latestResult.rows?.[0]?.created_at;
    if (latestCreatedAt) {
      const retryAfterSeconds = Math.ceil(
        (new Date(latestCreatedAt).getTime() + draft.cooldownSeconds * 1000 - new Date(draft.createdAt).getTime()) / 1000,
      );
      if (retryAfterSeconds > 0) throw repositoryError('PHONE_CODE_COOLDOWN', retryAfterSeconds);
    }

    const countResult = await client.query(
      `select count(*) filter (where phone = $1)::integer as phone_count,
              count(*) filter (where requested_ip = $2::inet)::integer as ip_count,
              min(created_at) filter (where phone = $1) as phone_window_start,
              min(created_at) filter (where requested_ip = $2::inet) as ip_window_start
       from phone_verification_challenges
       where created_at >= $3::timestamptz - interval '1 hour'
         and (phone = $1 or ($2::text is not null and requested_ip = $2::inet))`,
      [draft.phone, draft.requestedIp, draft.createdAt],
    );
    const counts = countResult.rows?.[0] || {};
    if (Number(counts.phone_count || 0) >= draft.phoneHourlyLimit) {
      throw repositoryError('PHONE_CODE_PHONE_RATE_LIMIT', secondsUntilReset(counts.phone_window_start, draft.createdAt));
    }
    if (draft.requestedIp && Number(counts.ip_count || 0) >= draft.ipHourlyLimit) {
      throw repositoryError('PHONE_CODE_IP_RATE_LIMIT', secondsUntilReset(counts.ip_window_start, draft.createdAt));
    }

    const inserted = await client.query(
      `insert into phone_verification_challenges (
        id, phone, purpose, code_hash, requested_ip, delivery_status, provider,
        attempts, max_attempts, expires_at, created_at, updated_at
      ) values ($1, $2, $3, $4, $5::inet, 'pending', $6, 0, $7, $8, $9, $9)
      returning *`,
      [
        draft.id,
        draft.phone,
        draft.purpose,
        draft.codeHash,
        draft.requestedIp,
        draft.provider,
        draft.maxAttempts,
        draft.expiresAt,
        draft.createdAt,
      ],
    );
    await client.query('commit');
    return inserted.rows?.[0] || null;
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

export async function markPhoneVerificationSentTransaction(client, draft) {
  assertClient(client);
  return updateChallengeDelivery(client, {
    ...draft,
    deliveryStatus: 'sent',
    timestampColumn: 'sent_at',
    timestamp: draft.sentAt,
  });
}

export async function markPhoneVerificationFailedTransaction(client, draft) {
  assertClient(client);
  return updateChallengeDelivery(client, {
    ...draft,
    deliveryStatus: 'failed',
    timestampColumn: 'failed_at',
    timestamp: draft.failedAt,
  });
}

export async function verifyPhoneVerificationChallengeTransaction(client, draft) {
  assertClient(client);
  await client.query('begin');
  try {
    await client.query(
      `select pg_advisory_xact_lock(hashtext($1))`,
      [`phone-verification:${draft.purpose}:${draft.phone}`],
    );
    const selected = await client.query(
      `select id, code_hash, attempts, max_attempts, expires_at, consumed_at
       from phone_verification_challenges
       where phone = $1
         and purpose = $2
         and delivery_status = 'sent'
       order by created_at desc
       limit 1
       for update`,
      [draft.phone, draft.purpose],
    );
    const challenge = selected.rows?.[0];
    if (!challenge) {
      await client.query('commit');
      return { status: 'not_found' };
    }
    if (challenge.consumed_at) {
      await client.query('commit');
      return { status: 'consumed', challengeId: challenge.id };
    }
    if (new Date(challenge.expires_at).getTime() < new Date(draft.verifiedAt).getTime()) {
      await client.query('commit');
      return { status: 'expired', challengeId: challenge.id };
    }
    if (Number(challenge.attempts) >= Number(challenge.max_attempts)) {
      await client.query('commit');
      return { status: 'too_many_attempts', challengeId: challenge.id };
    }
    if (challenge.code_hash !== draft.codeHash) {
      const attempts = Number(challenge.attempts) + 1;
      await client.query(
        `update phone_verification_challenges
         set attempts = $2,
             updated_at = $3
         where id = $1`,
        [challenge.id, attempts, draft.verifiedAt],
      );
      await client.query('commit');
      const attemptsRemaining = Math.max(0, Number(challenge.max_attempts) - attempts);
      return {
        status: attemptsRemaining === 0 ? 'too_many_attempts' : 'invalid',
        challengeId: challenge.id,
        attemptsRemaining,
      };
    }

    await client.query(
      `update phone_verification_challenges
       set consumed_at = $2,
           updated_at = $2
       where id = $1`,
      [challenge.id, draft.verifiedAt],
    );
    await client.query('commit');
    return { status: 'verified', challengeId: challenge.id };
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

async function updateChallengeDelivery(client, draft) {
  const failureCode = draft.deliveryStatus === 'failed' ? String(draft.failureCode || '').slice(0, 80) || null : null;
  const providerRequestId = draft.deliveryStatus === 'sent' ? draft.providerRequestId || null : null;
  const result = await client.query(
    `update phone_verification_challenges
     set delivery_status = $2,
         provider_request_id = coalesce($3, provider_request_id),
         failure_code = coalesce($4, failure_code),
         ${draft.timestampColumn} = $5,
         updated_at = $5
     where id = $1
     returning *`,
    [draft.challengeId, draft.deliveryStatus, providerRequestId, failureCode, draft.timestamp],
  );
  return result.rows?.[0] || null;
}

function assertClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('PostgreSQL client with query(sql, params) is required');
  }
}

function assertIssueDraft(draft) {
  const required = ['id', 'phone', 'purpose', 'codeHash', 'provider', 'maxAttempts', 'expiresAt', 'createdAt'];
  const missing = required.filter((key) => draft?.[key] === undefined || draft?.[key] === null || draft?.[key] === '');
  if (missing.length) throw new Error(`Missing phone verification draft fields: ${missing.join(', ')}`);
}

function repositoryError(code, retryAfterSeconds) {
  const error = new Error(code);
  error.code = code;
  error.retryAfterSeconds = Math.max(1, retryAfterSeconds || 3600);
  return error;
}

function secondsUntilReset(windowStart, now) {
  if (!windowStart) return 3600;
  return Math.max(1, Math.ceil((new Date(windowStart).getTime() + 60 * 60 * 1000 - new Date(now).getTime()) / 1000));
}
