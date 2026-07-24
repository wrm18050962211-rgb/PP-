export async function upsertAuthIdentityUserTransaction(client, draft) {
  assertClient(client);
  assertAuthIdentityDraft(draft);

  const loginAt = draft.loginAt || new Date().toISOString();
  await client.query('begin');
  try {
    const identityResult = await client.query(
      `select i.id as identity_id,
              i.user_id,
              u.phone,
              u.nickname,
              u.avatar_url,
              u.gender,
              u.city,
              u.status,
              u.is_companion,
              c.id as companion_id
       from user_auth_identities i
       join users u on u.id = i.user_id
       left join companions c on c.user_id = u.id
       where i.provider = $1
         and i.provider_user_id = $2
       for update of i`,
      [draft.provider, draft.providerUserId],
    );

    const existing = identityResult.rows?.[0];
    if (existing) {
      const userResult = await client.query(
        `update users
         set last_login_at = $2,
             phone = coalesce(phone, $3),
             updated_at = now()
         where id = $1
         returning *`,
        [existing.user_id, loginAt, draft.phone || null],
      );
      await client.query(
        `update user_auth_identities
         set union_id = coalesce($2, union_id),
             phone = coalesce($3, phone),
             metadata = $4,
             last_login_at = $5,
             updated_at = now()
         where id = $1`,
        [existing.identity_id, draft.unionId || null, draft.phone || null, draft.metadata || {}, loginAt],
      );
      await client.query('commit');
      return normalizeUserRow({ ...existing, ...(userResult.rows?.[0] || {}) });
    }

    let phoneUser = null;
    if (draft.phone) {
      const phoneUserResult = await client.query(
        `select u.*,
                c.id as companion_id
         from users u
         left join companions c on c.user_id = u.id
         where u.phone = $1
         for update of u`,
        [draft.phone],
      );
      phoneUser = phoneUserResult.rows?.[0] || null;
    }

    if (phoneUser) {
      const userResult = await client.query(
        `update users
         set last_login_at = $2,
             updated_at = now()
         where id = $1
         returning *`,
        [phoneUser.id, loginAt],
      );
      await client.query(
        `insert into user_auth_identities (
          id, user_id, provider, provider_user_id, union_id, phone, metadata, last_login_at
        ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          draft.identityId,
          phoneUser.id,
          draft.provider,
          draft.providerUserId,
          draft.unionId || null,
          draft.phone,
          draft.metadata || {},
          loginAt,
        ],
      );
      await client.query('commit');
      return normalizeUserRow({ ...phoneUser, ...(userResult.rows?.[0] || {}) });
    }

    const userResult = await client.query(
      `insert into users (
        id, phone, nickname, avatar_url, gender, city, status, is_companion, last_login_at
      ) values ($1, $2, $3, $4, $5, $6, 'active', false, $7)
      returning *`,
      [
        draft.userId,
        draft.phone || null,
        draft.nickname || 'User',
        draft.avatarUrl || null,
        draft.gender || 'unknown',
        draft.city || null,
        loginAt,
      ],
    );

    await client.query(
      `insert into user_auth_identities (
        id, user_id, provider, provider_user_id, union_id, phone, metadata, last_login_at
      ) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        draft.identityId,
        draft.userId,
        draft.provider,
        draft.providerUserId,
        draft.unionId || null,
        draft.phone || null,
        draft.metadata || {},
        loginAt,
      ],
    );

    await client.query('commit');
    return normalizeUserRow(userResult.rows?.[0]);
  } catch (error) {
    await client.query('rollback');
    throw error;
  }
}

function normalizeUserRow(row = {}) {
  return {
    id: row.id || row.user_id,
    phone: row.phone || '',
    nickname: row.nickname || 'User',
    avatarUrl: row.avatar_url || '',
    gender: row.gender || 'unknown',
    city: row.city || '',
    status: row.status || 'active',
    isCompanion: Boolean(row.is_companion),
    companionId: row.companion_id || null,
    roles: row.is_companion ? ['consumer', 'companion'] : ['consumer'],
  };
}

function assertClient(client) {
  if (!client || typeof client.query !== 'function') {
    throw new Error('PostgreSQL client with query(sql, params) is required');
  }
}

function assertAuthIdentityDraft(draft) {
  const required = ['userId', 'identityId', 'provider', 'providerUserId'];
  const missing = required.filter((key) => draft?.[key] === undefined || draft?.[key] === null || draft?.[key] === '');
  if (missing.length) throw new Error(`Missing auth identity draft fields: ${missing.join(', ')}`);
}
