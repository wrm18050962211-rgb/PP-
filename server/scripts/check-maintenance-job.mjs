import { readFileSync } from 'node:fs';
import { runMaintenanceJobs } from '../jobs/maintenanceJob.mjs';

const calls = [];
const dataStore = { kind: 'postgres-test' };

const result = await runMaintenanceJobs({
  dataStore,
  now: '2026-07-08T12:00:00.000Z',
  paymentExpiryLimit: 12,
  mediaExpiryLimit: 9,
  providerCallbackLimit: 7,
  logger: null,
  expirePayments: async (draft) => {
    calls.push({ name: 'payment-expiry', draft });
    return { ok: true, skipped: false, expiredCount: 1 };
  },
  expireMedia: async (draft) => {
    calls.push({ name: 'media-expiry', draft });
    return { ok: true, skipped: false, expiredCount: 3 };
  },
  retryProviderCallbacks: async (draft) => {
    calls.push({ name: 'provider-callbacks', draft });
    return { ok: true, skipped: false, claimedCount: 2, processedCount: 2 };
  },
});

assert(result.ok === true, 'maintenance job returns ok when child jobs pass');
assert(result.ranAt === '2026-07-08T12:00:00.000Z', 'maintenance job returns run time');
assert(calls.length === 3, 'maintenance job runs three child jobs');
assert(calls[0].name === 'payment-expiry' && calls[1].name === 'media-expiry' && calls[2].name === 'provider-callbacks', 'maintenance job runs in stable order');
assert(calls[0].draft.dataStore === dataStore, 'payment expiry receives data store');
assert(calls[0].draft.occurredAt === '2026-07-08T12:00:00.000Z', 'payment expiry receives occurredAt');
assert(calls[0].draft.limit === 12, 'payment expiry receives configured limit');
assert(calls[1].draft.occurredAt === '2026-07-08T12:00:00.000Z', 'media expiry receives occurredAt');
assert(calls[1].draft.limit === 9, 'media expiry receives configured limit');
assert(calls[2].draft.dueAt === '2026-07-08T12:00:00.000Z', 'provider callbacks receive dueAt');
assert(calls[2].draft.limit === 7, 'provider callbacks receive configured limit');
assert(calls[2].draft.processors?.wechat_pay, 'provider callbacks receive WeChat processors');

const cliSource = readFileSync(new URL('run-maintenance-jobs.mjs', import.meta.url), 'utf8');
assert(/runMaintenanceJobs/.test(cliSource), 'maintenance CLI calls maintenance job');
assert(/PAYMENT_EXPIRY_JOB_LIMIT/.test(cliSource), 'maintenance CLI forwards payment expiry limit');
assert(/MEDIA_EXPIRY_JOB_LIMIT/.test(cliSource), 'maintenance CLI forwards media expiry limit');
assert(/PROVIDER_CALLBACK_RETRY_JOB_LIMIT/.test(cliSource), 'maintenance CLI forwards provider callback limit');

const failureCalls = [];
const failureResult = await runMaintenanceJobs({
  dataStore,
  now: '2026-07-08T13:00:00.000Z',
  logger: null,
  expirePayments: async () => {
    failureCalls.push('payment-expiry');
    throw new Error('database lock timeout');
  },
  retryProviderCallbacks: async () => {
    failureCalls.push('provider-callbacks');
    return { ok: true, processedCount: 1 };
  },
});

assert(failureResult.ok === false, 'maintenance job reports failure when one child fails');
assert(failureCalls.join(',') === 'payment-expiry,provider-callbacks', 'maintenance job keeps running later child jobs after a failure');
assert(failureResult.jobs.paymentExpiry.error.message === 'database lock timeout', 'maintenance job returns child failure reason');
assert(failureResult.jobs.providerCallbacks.ok === true, 'maintenance job keeps successful child result');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['runs-child-jobs', 'stable-order', 'shared-run-time', 'limit-forwarding', 'wechat-processors', 'fail-soft', 'cli-wiring'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Maintenance job check failed: ${message}`);
}
