import { createPostgresStore } from '../store/postgresStore.mjs';

const pool = createMockPool();
const store = createPostgresStore({
  databaseUrl: 'postgres://user:pass@127.0.0.1:5432/pp',
  poolFactory: () => pool,
});

assert(store.capabilities.idempotencyWrites === true, 'postgres store advertises idempotency writes');
assert(typeof store.idempotencyWrites.beginRequest === 'function', 'postgres store exposes begin idempotency gateway');
assert(typeof store.idempotencyWrites.completeRequest === 'function', 'postgres store exposes complete idempotency gateway');

const draft = {
  idempotencyId: '00000000-0000-4000-8000-000000000911',
  scope: 'orders.create',
  requestKey: 'client-request-2',
  actorType: 'user',
  actorKey: '00000000-0000-4000-8000-000000000912',
};

const started = await store.idempotencyWrites.beginRequest(draft);
const beginClient = pool.clients[0];
assert(started.state === 'started', 'begin gateway starts request');
assert(beginClient.calls.some((call) => /insert into idempotency_keys/i.test(call.sql)), 'begin gateway inserts key');
assert(beginClient.released === true, 'begin gateway releases client');

const completed = await store.idempotencyWrites.completeRequest({ ...draft, responseStatus: 201, responseBody: { ok: true } });
const completeClient = pool.clients[1];
assert(completed.status === 'completed', 'complete gateway stores completed status');
assert(completeClient.calls.some((call) => /update idempotency_keys/i.test(call.sql)), 'complete gateway updates key');
assert(completeClient.released === true, 'complete gateway releases client');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['idempotency-write-capability', 'begin-gateway', 'complete-gateway', 'client-release'],
      queryCount: beginClient.calls.length + completeClient.calls.length,
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
      if (/from idempotency_keys/i.test(normalized)) return { rows: [] };
      if (/insert into idempotency_keys/i.test(normalized)) return { rows: [{ id: params[0], status: 'processing' }] };
      if (/update idempotency_keys/i.test(normalized)) return { rows: [{ id: 'key-1', status: params[0] }] };
      return { rows: [] };
    },
    release() {
      this.released = true;
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres store idempotency gateway check failed: ${message}`);
}
