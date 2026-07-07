import { createPostgresStore } from '../store/postgresStore.mjs';

const ids = {
  userId: '00000000-0000-4000-8000-000000000901',
  identityId: '00000000-0000-4000-8000-000000000902',
};

const pool = createMockPool();
const store = createPostgresStore({
  databaseUrl: 'postgres://user:pass@127.0.0.1:5432/pp',
  poolFactory: () => pool,
});

assert(store.capabilities.authWrites === true, 'postgres store advertises auth writes');

const user = await store.authWrites.upsertIdentityUser({
  userId: ids.userId,
  identityId: ids.identityId,
  provider: 'wechat',
  openid: 'openid-store-gateway',
  unionid: 'union-store-gateway',
  nickname: 'Store Gateway User',
  avatarUrl: 'https://example.com/avatar.jpg',
  metadata: { source: 'check-postgres-store-auth-gateway' },
  loginAt: '2026-07-08T09:00:00.000Z',
});

assert(user.id === ids.userId, 'auth gateway returns user');
const client = pool.clients[0];
assert(client.calls.some((call) => /from user_auth_identities i/i.test(call.sql)), 'auth gateway checks existing identity');
const identityInsert = client.calls.find((call) => /insert into user_auth_identities/i.test(call.sql));
assert(identityInsert, 'auth gateway inserts identity');
assert(identityInsert.params[2] === 'wechat', 'auth gateway maps provider');
assert(identityInsert.params[3] === 'openid-store-gateway', 'auth gateway maps openid to provider user id');
assert(client.released === true, 'auth gateway releases client');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['auth-write-capability', 'upsert-identity-user-gateway', 'openid-mapping', 'client-release'],
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
      if (/from user_auth_identities i/i.test(normalized)) return { rows: [] };
      if (/insert into users/i.test(normalized)) {
        return { rows: [{ id: params[0], nickname: params[2], avatar_url: params[3], gender: params[4], city: params[5], status: 'active', is_companion: false }] };
      }
      return { rows: [] };
    },
    release() {
      this.released = true;
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres store auth gateway check failed: ${message}`);
}
