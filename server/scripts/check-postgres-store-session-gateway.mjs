import { createPostgresStore } from '../store/postgresStore.mjs';
import { hashSessionToken } from '../store/sessionTokenHash.mjs';

const ids = {
  sessionId: '00000000-0000-4000-8000-000000000601',
  userId: '00000000-0000-4000-8000-000000000602',
  companionId: '00000000-0000-4000-8000-000000000603',
};

const pool = createMockPool();
const store = createPostgresStore({
  databaseUrl: 'postgres://user:pass@127.0.0.1:5432/pp',
  poolFactory: () => pool,
});

assert(store.capabilities.sessionWrites === true, 'postgres store advertises session writes');

const created = await store.sessionWrites.create({
  id: ids.sessionId,
  token: 'raw-session-token',
  role: 'companion',
  user: { id: ids.userId },
  companionId: ids.companionId,
  provider: 'wechat',
  roles: ['consumer', 'companion'],
  loginAt: '2026-07-08T09:00:00.000Z',
  updatedAt: '2026-07-08T09:00:00.000Z',
  expiresAt: '2026-08-08T09:00:00.000Z',
});
assert(created.id === ids.sessionId, 'creates session through store gateway');
const createClient = pool.clients[0];
const createInsert = createClient.calls.find((call) => /insert into user_sessions/i.test(call.sql));
assert(createInsert, 'create gateway inserts user session');
assert(createInsert.params[1] === hashSessionToken('raw-session-token'), 'create gateway stores token hash');
assert(!createInsert.params.includes('raw-session-token'), 'create gateway never sends raw token to PostgreSQL');
assert(createClient.released === true, 'create gateway releases client');

const touched = await store.sessionWrites.touchToken('raw-session-token', '2026-07-08T10:00:00.000Z');
assert(touched.token_hash === hashSessionToken('raw-session-token'), 'touch gateway hashes token');
assert(pool.clients[1].calls.some((call) => /last_seen_at/i.test(call.sql)), 'touch gateway updates last seen');
assert(pool.clients[1].released === true, 'touch gateway releases client');

const revoked = await store.sessionWrites.revokeToken('raw-session-token', '2026-07-08T11:00:00.000Z');
assert(revoked.token_hash === hashSessionToken('raw-session-token'), 'revoke gateway hashes token');
assert(pool.clients[2].calls.some((call) => /revoked_at/i.test(call.sql)), 'revoke gateway marks session revoked');
assert(pool.clients[2].released === true, 'revoke gateway releases client');

const foundUserSession = await store.sessionWrites.findByToken('raw-session-token');
assert(foundUserSession.role === 'companion', 'find gateway maps user session role');
assert(foundUserSession.user.id === ids.userId, 'find gateway maps user identity');
assert(foundUserSession.companionId === ids.companionId, 'find gateway maps companion identity');
const findUserCall = pool.clients[3].calls.find((call) => /from user_sessions s/i.test(call.sql));
assert(findUserCall.params[0] === hashSessionToken('raw-session-token'), 'find gateway queries by token hash');
assert(!findUserCall.params.includes('raw-session-token'), 'find gateway never sends raw token to PostgreSQL');
assert(pool.clients[3].released === true, 'find user gateway releases client');

const foundAdminSession = await store.sessionWrites.findByToken('raw-admin-token');
assert(foundAdminSession.role === 'admin', 'find gateway maps admin session role');
assert(foundAdminSession.adminId === '00000000-0000-4000-8000-000000000604', 'find gateway maps admin identity');
assert(foundAdminSession.user.nickname === 'Ops Admin', 'find gateway maps admin display name');
assert(foundAdminSession.roles.length === 1 && foundAdminSession.roles[0] === 'admin', 'find gateway keeps admin roles isolated');
assert(!foundAdminSession.roles.includes('consumer') && !foundAdminSession.roles.includes('companion'), 'find gateway does not leak public roles into admin session');
assert(foundAdminSession.adminScope.includes('risk'), 'find gateway maps admin scope from metadata');
assert(pool.clients[4].released === true, 'find admin gateway releases client');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['session-write-capability', 'create-session-gateway', 'touch-session-gateway', 'revoke-session-gateway', 'find-user-session-gateway', 'find-admin-session-gateway', 'admin-role-isolation', 'client-release'],
      clientCount: pool.clients.length,
    },
    null,
    2,
  ),
);

function createMockPool() {
  const clients = [];
  return {
    clients,
    async connect() {
      const client = createMockClient();
      clients.push(client);
      return client;
    },
  };
}

function createMockClient() {
  return {
    calls: [],
    released: false,
    async query(sql, params = []) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      this.calls.push({ sql: normalized, params });
      if (/from user_sessions s/i.test(normalized)) return { rows: [sessionRowForTokenHash(params[0])] };
      if (/insert into user_sessions/i.test(normalized)) return { rows: [{ id: params[0], token_hash: params[1] }] };
      if (/update user_sessions/i.test(normalized)) return { rows: [{ token_hash: params[0] }] };
      return { rows: [] };
    },
    release() {
      this.released = true;
    },
  };
}

function sessionRowForTokenHash(tokenHash) {
  if (tokenHash === hashSessionToken('raw-admin-token')) {
    return {
      session_id: '00000000-0000-4000-8000-000000000605',
      session_scope: 'admin',
      session_role: 'admin',
      provider: 'password',
      metadata: { adminScope: ['audit', 'risk'] },
      login_at: new Date('2026-07-08T09:00:00.000Z'),
      last_seen_at: new Date('2026-07-08T10:00:00.000Z'),
      expires_at: new Date('2026-08-08T09:00:00.000Z'),
      admin_id: '00000000-0000-4000-8000-000000000604',
      admin_username: 'ops',
      admin_name: 'Ops Admin',
      admin_status: 'active',
      companion_id: null,
    };
  }

  return {
    session_id: ids.sessionId,
    session_scope: 'user',
    session_role: 'companion',
    provider: 'wechat',
    metadata: { roles: ['consumer', 'companion'] },
    login_at: new Date('2026-07-08T09:00:00.000Z'),
    last_seen_at: new Date('2026-07-08T10:00:00.000Z'),
    expires_at: new Date('2026-08-08T09:00:00.000Z'),
    user_id: ids.userId,
    nickname: 'Mori',
    avatar_url: '',
    gender: 'female',
    city: 'Shanghai',
    user_status: 'active',
    is_companion: true,
    companion_id: ids.companionId,
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres store session gateway check failed: ${message}`);
}
