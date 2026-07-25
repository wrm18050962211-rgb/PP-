import { upsertAuthIdentityUserTransaction } from '../store/postgresAuthWrites.mjs';

const ids = {
  userId: '00000000-0000-4000-8000-000000000801',
  identityId: '00000000-0000-4000-8000-000000000802',
  existingUserId: '00000000-0000-4000-8000-000000000803',
  existingIdentityId: '00000000-0000-4000-8000-000000000804',
};

const createClient = createMockClient({ existing: false });
const created = await upsertAuthIdentityUserTransaction(createClient, {
  userId: ids.userId,
  identityId: ids.identityId,
  provider: 'wechat',
  providerUserId: 'openid-new',
  unionId: 'union-new',
  nickname: 'WeChat User',
  avatarUrl: 'https://example.com/avatar.jpg',
  gender: 'unknown',
  metadata: { source: 'check-postgres-auth-writes' },
  loginAt: '2026-07-08T09:00:00.000Z',
});
const createSql = createClient.calls.map((call) => call.sql);
assert(created.id === ids.userId, 'returns created user');
assert(createSql[0] === 'begin', 'create transaction begins');
assert(createSql.some((sql) => /from user_auth_identities i/i.test(sql) && /for update of i/i.test(sql)), 'locks auth identity lookup');
assert(createSql.some((sql) => /insert into users/i.test(sql)), 'creates missing user');
assert(createSql.some((sql) => /insert into user_auth_identities/i.test(sql)), 'creates auth identity');
assert(createSql.at(-1) === 'commit', 'create transaction commits');

const existingClient = createMockClient({ existing: true });
const existing = await upsertAuthIdentityUserTransaction(existingClient, {
  userId: ids.userId,
  identityId: ids.identityId,
  provider: 'wechat',
  providerUserId: 'openid-existing',
  unionId: 'union-existing',
  metadata: { source: 'check-postgres-auth-writes' },
  loginAt: '2026-07-08T10:00:00.000Z',
});
const existingSql = existingClient.calls.map((call) => call.sql);
assert(existing.id === ids.existingUserId, 'returns existing user');
assert(!existingSql.some((sql) => /insert into users/i.test(sql)), 'existing identity does not create duplicate user');
assert(existingSql.some((sql) => /update users/i.test(sql) && /last_login_at/i.test(sql)), 'existing identity updates user login time');
assert(existingSql.some((sql) => /update user_auth_identities/i.test(sql)), 'existing identity updates identity metadata');
assert(existingSql.at(-1) === 'commit', 'existing transaction commits');

const phoneUserClient = createMockClient({ existing: false, phoneExisting: true });
const phoneUser = await upsertAuthIdentityUserTransaction(phoneUserClient, {
  userId: ids.userId,
  identityId: ids.identityId,
  provider: 'phone',
  providerUserId: '13800138000',
  phone: '13800138000',
  nickname: 'Still User',
  metadata: { source: 'check-postgres-auth-writes' },
  loginAt: '2026-07-08T11:00:00.000Z',
});
const phoneUserSql = phoneUserClient.calls.map((call) => call.sql);
assert(phoneUser.id === ids.existingUserId, 'phone identity attaches to existing phone user');
assert(!phoneUserSql.some((sql) => /insert into users/i.test(sql)), 'existing phone user is not duplicated');
assert(phoneUser.roles.length === 1 && phoneUser.roles[0] === 'consumer', 'phone user without an approved companion keeps consumer role');
const phoneIdentityInsert = phoneUserClient.calls.find((call) => /insert into user_auth_identities/i.test(call.sql));
assert(phoneIdentityInsert?.params[1] === ids.existingUserId, 'phone identity references existing user');

const pendingCompanionClient = createMockClient({ existing: false, phoneExisting: true, companionStatus: 'pending_review' });
const pendingCompanionUser = await upsertAuthIdentityUserTransaction(pendingCompanionClient, {
  userId: ids.userId,
  identityId: ids.identityId,
  provider: 'phone',
  providerUserId: '13900139000',
  phone: '13900139000',
  loginAt: '2026-07-08T11:30:00.000Z',
});
assert(!pendingCompanionUser.isCompanion, 'pending companion application does not grant companion identity');
assert(!pendingCompanionUser.roles.includes('companion'), 'pending companion application does not grant companion role');

const approvedCompanionClient = createMockClient({ existing: false, phoneExisting: true, companionStatus: 'approved' });
const approvedCompanionUser = await upsertAuthIdentityUserTransaction(approvedCompanionClient, {
  userId: ids.userId,
  identityId: ids.identityId,
  provider: 'phone',
  providerUserId: '13700137000',
  phone: '13700137000',
  loginAt: '2026-07-08T11:45:00.000Z',
});
assert(approvedCompanionUser.isCompanion, 'approved companion account grants companion identity');
assert(approvedCompanionUser.roles.includes('companion'), 'approved companion account grants companion role');

await assertRejects(
  () => upsertAuthIdentityUserTransaction(createMockClient({ existing: false }), { provider: 'wechat' }),
  'Missing auth identity draft fields: userId, identityId, providerUserId',
  'missing required fields reject',
);

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: [
        'create-auth-user',
        'create-auth-identity',
        'update-existing-auth-user',
        'attach-existing-phone-user',
        'pending-companion-role-boundary',
        'approved-companion-role',
        'missing-required-field',
      ],
      createQueryCount: createClient.calls.length,
      existingQueryCount: existingClient.calls.length,
    },
    null,
    2,
  ),
);

function createMockClient({ existing, phoneExisting = false, companionStatus = null }) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      calls.push({ sql: normalized, params });
      if (/from user_auth_identities i/i.test(normalized)) {
        return {
          rows: existing
            ? [
                {
                  identity_id: ids.existingIdentityId,
                  user_id: ids.existingUserId,
                  nickname: 'Existing User',
                  avatar_url: '',
                  gender: 'unknown',
                  city: 'Shanghai',
                  status: 'active',
                  is_companion: Boolean(companionStatus),
                  companion_id: companionStatus ? ids.userId : null,
                  companion_status: companionStatus,
                },
              ]
            : [],
        };
      }
      if (/from users u/i.test(normalized) && /where u\.phone/i.test(normalized)) {
        return {
          rows: phoneExisting
            ? [
                {
                  id: ids.existingUserId,
                  phone: '13800138000',
                  nickname: 'Existing Phone User',
                  avatar_url: '',
                  gender: 'unknown',
                  city: 'Shanghai',
                  status: 'active',
                  is_companion: Boolean(companionStatus),
                  companion_id: companionStatus ? ids.userId : null,
                  companion_status: companionStatus,
                },
              ]
            : [],
        };
      }
      if (/insert into users/i.test(normalized)) {
        return { rows: [{ id: params[0], nickname: params[2], avatar_url: params[3], gender: params[4], city: params[5], status: 'active', is_companion: false }] };
      }
      if (/update users/i.test(normalized)) {
        return { rows: [{ id: params[0], nickname: 'Existing User', avatar_url: '', gender: 'unknown', city: 'Shanghai', status: 'active', is_companion: false }] };
      }
      return { rows: [] };
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres auth write check failed: ${message}`);
}

async function assertRejects(fn, messagePart, label) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(messagePart), label);
    return;
  }
  throw new Error(`Postgres auth write check failed: ${label}`);
}
