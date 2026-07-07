import { readFileSync } from 'node:fs';
import { runMaintenanceJobs } from '../jobs/maintenanceJob.mjs';

const calls = [];
const dataStore = { kind: 'postgres-test' };

const result = await runMaintenanceJobs({
  dataStore,
  now: '2026-07-08T12:00:00.000Z',
  paymentExpiryLimit: 12,
  providerCallbackLimit: 7,
  logger: null,
  expirePayments: async (draft) => {
    calls.push({ name: 'payment-expiry', draft });
    return { ok: true, skipped: false, expiredCount: 1 };
  },
  retryProviderCallbacks: async (draft) => {
    calls.push({ name: 'provider-callbacks', draft });
    return { ok: true, skipped: false, claimedCount: 2, processedCount: 2 };
  },
});

assert(result.ok === true, 'maintenance job returns ok when child jobs pass');
assert(result.ranAt === '2026-07-08T12:00:00.000Z', 'maintenance job returns run time');
assert(calls.length === 2, 'maintenance job runs two child jobs');
assert(calls[0].name === 'payment-expiry' && calls[1].name === 'provider-callbacks', 'maintenance job runs in stable order');
assert(calls[0].draft.dataStore === dataStore, 'payment expiry receives data store');
assert(calls[0].draft.occurredAt === '2026-07-08T12:00:00.000Z', 'payment expiry receives occurredAt');
assert(calls[0].draft.limit === 12, 'payment expiry receives configured limit');
assert(calls[1].draft.dueAt === '2026-07-08T12:00:00.000Z', 'provider callbacks receive dueAt');
assert(calls[1].draft.limit === 7, 'provider callbacks receive configured limit');
assert(calls[1].draft.processors?.wechat_pay, 'provider callbacks receive WeChat processors');

const cliSource = readFileSync(new URL('run-maintenance-jobs.mjs', import.meta.url), 'utf8');
assert(/runMaintenanceJobs/.test(cliSource), 'maintenance CLI calls maintenance job');
assert(/PAYMENT_EXPIRY_JOB_LIMIT/.test(cliSource), 'maintenance CLI forwards payment expiry limit');
assert(/PROVIDER_CALLBACK_RETRY_JOB_LIMIT/.test(cliSource), 'maintenance CLI forwards provider callback limit');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['runs-child-jobs', 'stable-order', 'shared-run-time', 'limit-forwarding', 'wechat-processors', 'cli-wiring'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Maintenance job check failed: ${message}`);
}
