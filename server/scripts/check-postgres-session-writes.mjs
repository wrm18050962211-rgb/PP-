import { createSessionTransaction, revokeSessionTransaction, touchSessionTransaction } from '../store/postgresSessionWrites.mjs';

const ids = {
  sessionId: '00000000-0000-4000-8000-000000000401',
  userId: '00000000-0000-4000-8000-000000000402',
  companionId: '00000000-0000-4000-8000-000000000403',
  adminSessionId: '00000000-0000-4000-8000-000000000404',
  adminId: '00000000-0000-4000-8000-000000000405',
};

const userClient = createMockClient();
const userSession = await createSessionTransaction(userClient, {
  sessionId: ids.sessionId,
  tokenHash: 'user-token-hash',
  sessionScope: 'user',
  userId: ids.userId,
  companionId: ids.companionId,
  role: 'companion',
  provider: 'mock',
  expiresAt: '2026-07-09T00:00:00.000Z',
});
const userSql = userClient.calls.map((call) => call.sql);
assert(userSession.id === ids.sessionId, 'returns inserted user session');
assert(userSql[0] === 'begin', 'user session transaction begins');
assert(userSql.some((statement) => /insert into user_sessions/i.test(statement)), 'inserts user session');
assert(userSql.at(-1) === 'commit', 'user session transaction commits');

const adminClient = createMockClient();
const adminSession = await createSessionTransaction(adminClient, {
  sessionId: ids.adminSessionId,
  tokenHash: 'admin-token-hash',
  sessionScope: 'admin',
  adminId: ids.adminId,
  role: 'admin',
  provider: 'password',
  expiresAt: '2026-07-09T00:00:00.000Z',
});
assert(adminSession.id === ids.adminSessionId, 'returns inserted admin session');
assert(adminClient.calls.some((call) => call.params[2] === 'admin' && call.params[4] === ids.adminId), 'admin session uses admin scope and admin id');

const touchClient = createMockClient();
const touched = await touchSessionTransaction(touchClient, {
  tokenHash: 'user-token-hash',
  seenAt: '2026-07-08T10:00:00.000Z',
});
assert(touched.token_hash === 'user-token-hash', 'returns touched session');
assert(touchClient.calls.some((call) => /update user_sessions/i.test(call.sql) && /last_seen_at/i.test(call.sql)), 'touch updates last seen');
assert(touchClient.calls.at(-1).sql === 'commit', 'touch transaction commits');

const revokeClient = createMockClient();
const revoked = await revokeSessionTransaction(revokeClient, {
  tokenHash: 'user-token-hash',
  revokedAt: '2026-07-08T11:00:00.000Z',
});
assert(revoked.token_hash === 'user-token-hash', 'returns revoked session');
assert(revokeClient.calls.some((call) => /update user_sessions/i.test(call.sql) && /revoked_at/i.test(call.sql)), 'revoke marks revoked');
assert(revokeClient.calls.at(-1).sql === 'commit', 'revoke transaction commits');

await assertRejects(
  () => createSessionTransaction(createMockClient(), { sessionId: ids.sessionId, tokenHash: 'bad-token', role: 'user', expiresAt: '2026-07-09T00:00:00.000Z' }),
  'exactly one of userId or adminId',
  'missing actor rejects',
);

await assertRejects(
  () =>
    createSessionTransaction(createMockClient(), {
      sessionId: ids.sessionId,
      tokenHash: 'mixed-token',
      userId: ids.userId,
      adminId: ids.adminId,
      role: 'admin',
      expiresAt: '2026-07-09T00:00:00.000Z',
    }),
  'exactly one of userId or adminId',
  'mixed actor rejects',
);

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['create-user-session', 'create-admin-session', 'touch-session', 'revoke-session', 'session-boundary-validation'],
      createQueryCount: userClient.calls.length + adminClient.calls.length,
      touchQueryCount: touchClient.calls.length,
      revokeQueryCount: revokeClient.calls.length,
    },
    null,
    2,
  ),
);

function createMockClient() {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      calls.push({ sql: normalized, params });
      if (/insert into user_sessions/i.test(normalized)) return { rows: [{ id: params[0], token_hash: params[1], session_scope: params[2] }] };
      if (/update user_sessions/i.test(normalized)) return { rows: [{ token_hash: params[0] }] };
      return { rows: [] };
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres session write check failed: ${message}`);
}

async function assertRejects(fn, messagePart, label) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(messagePart), label);
    return;
  }
  throw new Error(`Postgres session write check failed: ${label}`);
}
