import { recordSecurityEventTransaction } from '../store/postgresSecurityWrites.mjs';

const ids = {
  eventId: '00000000-0000-4000-8000-000000000301',
  actorId: '00000000-0000-4000-8000-000000000302',
  orderId: '00000000-0000-4000-8000-000000000303',
};

const client = createMockClient();
const event = await recordSecurityEventTransaction(client, {
  eventId: ids.eventId,
  eventType: 'permission_denied',
  actorId: ids.actorId,
  actorRole: 'consumer',
  targetType: 'order',
  targetId: ids.orderId,
  requiredRole: 'order_confirm',
  actualRole: 'consumer',
  action: 'confirm',
  reason: 'Order action is not allowed for current role',
  metadata: { source: 'check-postgres-security-writes' },
});

const sql = client.calls.map((call) => call.sql);
assert(event.id === ids.eventId, 'returns inserted security event');
assert(sql[0] === 'begin', 'security event transaction begins');
assert(sql.some((statement) => /insert into security_events/i.test(statement)), 'inserts security event');
assert(sql.at(-1) === 'commit', 'security event transaction commits');

await assertRejects(
  () => recordSecurityEventTransaction(createMockClient(), { eventId: ids.eventId }),
  'Missing security event draft fields: eventType',
  'missing event type rejects',
);

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['insert-security-event', 'missing-required-field'],
      queryCount: client.calls.length,
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
      if (/insert into security_events/i.test(normalized)) return { rows: [{ id: params[0], event_type: params[1] }] };
      return { rows: [] };
    },
  };
}

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres security write check failed: ${message}`);
}

async function assertRejects(fn, messagePart, label) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(messagePart), label);
    return;
  }
  throw new Error(`Postgres security write check failed: ${label}`);
}
