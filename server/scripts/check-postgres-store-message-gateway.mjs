import { createPostgresStore } from '../store/postgresStore.mjs';

const pool = createMockPool();
const store = createPostgresStore({
  databaseUrl: 'postgres://user:pass@127.0.0.1:5432/pp',
  poolFactory: () => pool,
});

assert(store.capabilities.messageWrites === true, 'postgres store advertises message writes');

const result = await store.messageWrites.sendMessage({
  conversationId: '00000000-0000-4000-8000-000000000801',
  messageId: '00000000-0000-4000-8000-000000000802',
  senderId: '00000000-0000-4000-8000-000000000803',
  senderRole: 'user',
  content: 'hello',
  sentAt: '2026-07-08T09:00:00.000Z',
  risk: { hits: [], shouldBlock: false },
});

const client = pool.clients[0];
assert(result.message?.id === '00000000-0000-4000-8000-000000000802', 'message gateway returns inserted message');
assert(client.calls.some((call) => /from conversations c/i.test(call.sql)), 'message gateway loads conversation context');
assert(client.calls.some((call) => /insert into messages/i.test(call.sql)), 'message gateway inserts message');
assert(client.calls.some((call) => /^commit$/i.test(call.sql)), 'message gateway commits transaction');
assert(client.released === true, 'message gateway releases client');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['message-write-capability', 'send-message-gateway', 'client-release'],
      queryCount: client.calls.length,
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
      if (/from conversations c/i.test(normalized)) {
        return {
          rows: [
            {
              id: params[0],
              order_id: '00000000-0000-4000-8000-000000000804',
              user_id: '00000000-0000-4000-8000-000000000803',
              companion_id: '00000000-0000-4000-8000-000000000805',
              status: 'active',
              order_status: 'confirmed',
            },
          ],
        };
      }
      if (/insert into messages/i.test(normalized)) return { rows: [{ id: params[0], risk_status: params[7] }] };
      return { rows: [] };
    },
    release() {
      this.released = true;
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres store message gateway check failed: ${message}`);
}
