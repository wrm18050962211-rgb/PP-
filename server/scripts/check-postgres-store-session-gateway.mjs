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

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['session-write-capability', 'create-session-gateway', 'touch-session-gateway', 'revoke-session-gateway', 'client-release'],
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
      if (/insert into user_sessions/i.test(normalized)) return { rows: [{ id: params[0], token_hash: params[1] }] };
      if (/update user_sessions/i.test(normalized)) return { rows: [{ token_hash: params[0] }] };
      return { rows: [] };
    },
    release() {
      this.released = true;
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres store session gateway check failed: ${message}`);
}
