import { runPendingPaymentExpiryJob } from '../jobs/paymentExpiryJob.mjs';

let capturedDraft = null;
const logs = [];
const dataStore = {
  orderWrites: {
    async expirePendingPayments(draft) {
      capturedDraft = draft;
      return {
        expiredCount: 2,
        closedPaymentCount: 2,
        cancelledOrderCount: 2,
        releasedSlotCount: 2,
      };
    },
  },
};

const result = await runPendingPaymentExpiryJob({
  dataStore,
  occurredAt: '2026-07-08T12:00:00.000Z',
  reason: 'Payment window expired',
  limit: 20,
  logger: { log: (message) => logs.push(message) },
});

assert(result.ok === true && result.skipped === false, 'job runs when gateway exists');
assert(result.expiredCount === 2, 'job returns expired count');
assert(capturedDraft.occurredAt === '2026-07-08T12:00:00.000Z', 'job forwards occurredAt');
assert(capturedDraft.reason === 'Payment window expired', 'job forwards reason');
assert(capturedDraft.limit === 20, 'job forwards normalized limit');
assert(logs.some((message) => message.includes('released 2 expired pending payment')), 'job logs positive release count');

const skipped = await runPendingPaymentExpiryJob({ dataStore: {}, logger: { log: () => logs.push('unexpected') } });
assert(skipped.ok === true && skipped.skipped === true, 'job skips when gateway is unavailable');
assert(skipped.expiredCount === 0, 'skipped job returns zero expired count');

const clampedDrafts = [];
await runPendingPaymentExpiryJob({
  dataStore: {
    orderWrites: {
      async expirePendingPayments(draft) {
        clampedDrafts.push(draft);
        return { expiredCount: 0 };
      },
    },
  },
  limit: 9999,
  logger: null,
});
assert(clampedDrafts[0].limit === 500, 'job clamps overly large limits');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['runs-gateway', 'forwards-draft', 'logs-release', 'skips-missing-gateway', 'clamps-limit'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Payment expiry job check failed: ${message}`);
}
