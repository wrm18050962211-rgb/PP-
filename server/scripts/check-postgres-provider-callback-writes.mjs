import {
  markProviderCallbackFailedTransaction,
  markProviderCallbackProcessedTransaction,
  recordProviderCallbackReceivedTransaction,
} from '../store/postgresProviderCallbackWrites.mjs';

const receivedClient = createMockClient();
const received = await recordProviderCallbackReceivedTransaction(receivedClient, {
  callbackEventId: '00000000-0000-4000-8000-000000000a01',
  provider: 'wechat_pay',
  eventType: 'TRANSACTION.SUCCESS',
  providerEventId: 'wechat-event-1',
  requestHeaders: { 'wechatpay-timestamp': '123' },
  rawBody: '{"id":"wechat-event-1"}',
  rawPayload: { id: 'wechat-event-1' },
});

assert(received.id === '00000000-0000-4000-8000-000000000a01', 'received callback event is returned');
assert(receivedClient.calls[0].sql === 'begin', 'received callback starts transaction');
assert(receivedClient.calls.some((call) => /insert into provider_callback_events/i.test(call.sql)), 'received callback inserts event row');
assert(receivedClient.calls.some((call) => /on conflict \(provider, event_type, provider_event_id\)/i.test(call.sql)), 'received callback is idempotent by provider event id');
assert(receivedClient.calls.at(-1).sql === 'commit', 'received callback commits transaction');

const processedClient = createMockClient();
const processed = await markProviderCallbackProcessedTransaction(processedClient, {
  callbackEventId: '00000000-0000-4000-8000-000000000a01',
  objectType: 'payment',
  objectId: '00000000-0000-4000-8000-000000000b01',
  paymentId: '00000000-0000-4000-8000-000000000b01',
  orderId: '00000000-0000-4000-8000-000000000c01',
});

assert(processed.status === 'processed', 'processed callback status is returned');
assert(processedClient.calls.some((call) => /status = 'processed'/i.test(call.sql)), 'processed callback updates status');
assert(processedClient.calls.some((call) => /payment_id = coalesce/i.test(call.sql)), 'processed callback links business object');

const failedClient = createMockClient();
const failed = await markProviderCallbackFailedTransaction(failedClient, {
  callbackEventId: '00000000-0000-4000-8000-000000000a01',
  nextRetryAt: '2026-07-08T12:00:00.000Z',
  lastError: 'payment row not found',
});

assert(failed.status === 'retrying', 'retryable callback failure is returned');
assert(failedClient.calls.some((call) => /retry_count = retry_count \+ 1/i.test(call.sql)), 'failed callback increments retry count');
assert(failedClient.calls.some((call) => call.params?.[1] === 'retrying'), 'failed callback becomes retrying by default');

const terminalFailureClient = createMockClient();
await markProviderCallbackFailedTransaction(terminalFailureClient, {
  callbackEventId: '00000000-0000-4000-8000-000000000a01',
  retryable: false,
  lastError: 'invalid signature',
});
assert(terminalFailureClient.calls.some((call) => call.params?.[1] === 'failed'), 'non-retryable callback failure becomes failed');

const rollbackClient = createMockClient({ failInsert: true });
await assertRejects(
  () =>
    recordProviderCallbackReceivedTransaction(rollbackClient, {
      callbackEventId: '00000000-0000-4000-8000-000000000a02',
      provider: 'wechat_pay',
      eventType: 'TRANSACTION.SUCCESS',
      providerEventId: 'wechat-event-2',
    }),
  'insert failed',
  'received callback rolls back on failure',
);
assert(rollbackClient.calls.at(-1).sql === 'rollback', 'received callback sends rollback on failure');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['received-upsert', 'processed-link', 'retryable-failure', 'terminal-failure', 'rollback'],
    },
    null,
    2,
  ),
);

function createMockClient(options = {}) {
  return {
    calls: [],
    async query(sql, params = []) {
      const normalized = sql.trim();
      this.calls.push({ sql: normalized, params });
      if (options.failInsert && /insert into provider_callback_events/i.test(normalized)) throw new Error('insert failed');
      if (normalized === 'begin' || normalized === 'commit' || normalized === 'rollback') return { rows: [] };
      if (/insert into provider_callback_events/i.test(normalized)) {
        return { rows: [{ id: params[0], provider: params[1], event_type: params[2], status: 'received' }] };
      }
      if (/update provider_callback_events/i.test(normalized) && /status = 'processed'/i.test(normalized)) {
        return { rows: [{ id: params[0], status: 'processed', payment_id: params[3], order_id: params[5] }] };
      }
      if (/update provider_callback_events/i.test(normalized)) {
        return { rows: [{ id: params[0], status: params[1], retry_count: 1, last_error: params[3] }] };
      }
      return { rows: [] };
    },
  };
}

async function assertRejects(fn, messagePart, label) {
  try {
    await fn();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(messagePart), label);
    return;
  }
  throw new Error(`Provider callback writes check failed: ${label}`);
}

function assert(condition, message) {
  if (!condition) throw new Error(`Provider callback writes check failed: ${message}`);
}
