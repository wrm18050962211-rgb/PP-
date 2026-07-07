import { beginIdempotencyRequestTransaction, completeIdempotencyRequestTransaction } from '../store/postgresIdempotencyWrites.mjs';

const draft = {
  idempotencyId: '00000000-0000-4000-8000-000000000901',
  scope: 'orders.create',
  requestKey: 'client-request-1',
  actorType: 'user',
  actorKey: '00000000-0000-4000-8000-000000000902',
  requestHash: 'hash-1',
  lockedUntil: '2999-01-01T00:00:00.000Z',
};

const insertClient = createMockClient({ mode: 'missing' });
const started = await beginIdempotencyRequestTransaction(insertClient, draft);
const insertSql = insertClient.calls.map((call) => call.sql);
assert(started.state === 'started', 'missing key starts processing');
assert(insertSql.some((sql) => /from idempotency_keys/i.test(sql) && /for update/i.test(sql)), 'begin locks existing key lookup');
assert(insertSql.some((sql) => /insert into idempotency_keys/i.test(sql)), 'begin inserts key');
assert(insertSql.at(-1) === 'commit', 'begin insert commits');

const completedClient = createMockClient({ mode: 'completed' });
const completed = await beginIdempotencyRequestTransaction(completedClient, draft);
assert(completed.state === 'completed', 'completed key returns cached state');
assert(!completedClient.calls.some((call) => /insert into idempotency_keys/i.test(call.sql)), 'completed key does not insert');

const staleClient = createMockClient({ mode: 'stale' });
const restarted = await beginIdempotencyRequestTransaction(staleClient, draft);
const staleSql = staleClient.calls.map((call) => call.sql);
assert(restarted.state === 'started', 'stale processing key restarts');
assert(staleSql.some((sql) => /update idempotency_keys/i.test(sql) && /status = 'processing'/i.test(sql)), 'stale key is relocked');

const activeClient = createMockClient({ mode: 'active' });
await assertRejects(() => beginIdempotencyRequestTransaction(activeClient, draft), 'already processing', 'active key rejects duplicate');
assert(activeClient.calls.at(-1).sql === 'rollback', 'active duplicate rolls back');

const completeClient = createMockClient({ mode: 'complete-update' });
const record = await completeIdempotencyRequestTransaction(completeClient, {
  ...draft,
  responseStatus: 201,
  responseBody: { orderId: 'order-1' },
});
const completeSql = completeClient.calls.map((call) => call.sql);
assert(record.status === 'completed', 'complete returns completed record');
assert(completeSql.some((sql) => /update idempotency_keys/i.test(sql) && /response_body/i.test(sql)), 'complete stores response body');
assert(completeSql.at(-1) === 'commit', 'complete commits');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['begin-insert', 'completed-cache', 'stale-relock', 'active-duplicate-rollback', 'complete-response'],
    },
    null,
    2,
  ),
);

function createMockClient({ mode }) {
  const calls = [];
  return {
    calls,
    async query(sql, params = []) {
      const normalized = sql.trim().replace(/\s+/g, ' ');
      calls.push({ sql: normalized, params });
      if (/from idempotency_keys/i.test(normalized)) {
        if (mode === 'missing') return { rows: [] };
        if (mode === 'completed') return { rows: [{ id: draft.idempotencyId, status: 'completed', response_status: 201 }] };
        if (mode === 'active') return { rows: [{ id: draft.idempotencyId, status: 'processing', locked_until: '2999-01-01T00:00:00.000Z' }] };
        if (mode === 'stale') return { rows: [{ id: draft.idempotencyId, status: 'processing', locked_until: '2000-01-01T00:00:00.000Z' }] };
      }
      if (/insert into idempotency_keys/i.test(normalized)) return { rows: [{ id: params[0], status: 'processing' }] };
      if (/update idempotency_keys/i.test(normalized)) return { rows: [{ id: draft.idempotencyId, status: params[0] }] };
      return { rows: [] };
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres idempotency write check failed: ${message}`);
}

async function assertRejects(fn, messagePart, label) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(messagePart), label);
    return;
  }
  throw new Error(`Postgres idempotency write check failed: ${label}`);
}
