import { runProviderCallbackRetryJob } from '../jobs/providerCallbackRetryJob.mjs';

const calls = {
  claimed: null,
  processed: [],
  failed: [],
};
const logs = [];
const events = [
  {
    id: 'callback-1',
    provider: 'wechat_pay',
    event_type: 'TRANSACTION.SUCCESS',
    retry_count: 1,
  },
  {
    id: 'callback-2',
    provider: 'wechat_pay',
    event_type: 'REFUND.SUCCESS',
    retry_count: 2,
  },
  {
    id: 'callback-3',
    provider: 'unknown_provider',
    event_type: 'UNKNOWN',
    retry_count: 0,
  },
];

const result = await runProviderCallbackRetryJob({
  dataStore: {
    providerCallbackWrites: {
      async claimDue(draft) {
        calls.claimed = draft;
        return events;
      },
      async markProcessed(draft) {
        calls.processed.push(draft);
        return { id: draft.callbackEventId, status: 'processed' };
      },
      async markFailed(draft) {
        calls.failed.push(draft);
        return { id: draft.callbackEventId, status: draft.retryable ? 'retrying' : 'failed' };
      },
    },
  },
  processors: {
    'wechat_pay:TRANSACTION.SUCCESS': async () => ({ objectType: 'payment', paymentId: 'payment-1', orderId: 'order-1' }),
    'wechat_pay:REFUND.SUCCESS': async () => {
      throw new Error('temporary refund lock');
    },
  },
  dueAt: '2026-07-08T12:00:00.000Z',
  limit: 9999,
  logger: { log: (message) => logs.push(message) },
});

assert(result.ok === true && result.skipped === false, 'job runs when gateway exists');
assert(calls.claimed.dueAt === '2026-07-08T12:00:00.000Z', 'job forwards dueAt');
assert(calls.claimed.limit === 200, 'job clamps overly large limits');
assert(calls.processed.length === 1 && calls.processed[0].paymentId === 'payment-1', 'job marks successful processor result processed');
assert(calls.failed.length === 2, 'job marks processor error and missing processor failed for retry');
assert(calls.failed.every((draft) => draft.retryable === true && draft.nextRetryAt), 'failed callbacks are retryable with nextRetryAt');
assert(calls.failed.some((draft) => draft.lastError === 'temporary refund lock'), 'processor error is recorded');
assert(calls.failed.some((draft) => draft.lastError === 'No provider callback retry processor configured'), 'missing processor is recorded');
assert(result.claimedCount === 3 && result.processedCount === 1 && result.failedCount === 2, 'job returns counts');
assert(logs.some((message) => message.includes('claimed 3, processed 1, retrying 2')), 'job logs summary');

const skipped = await runProviderCallbackRetryJob({ dataStore: {}, logger: null });
assert(skipped.ok === true && skipped.skipped === true, 'job skips without gateway');
assert(skipped.claimedCount === 0, 'skipped job has zero claimed count');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['claim-due', 'processor-success', 'processor-failure', 'missing-processor', 'skips-missing-gateway', 'clamps-limit'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Provider callback retry job check failed: ${message}`);
}
