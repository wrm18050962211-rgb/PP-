import { runPendingMediaExpiryJob } from '../jobs/mediaExpiryJob.mjs';

const calls = [];
const dataStore = {
  mediaWrites: {
    expirePending: async (draft) => {
      calls.push(draft);
      return { expiredCount: 2 };
    },
  },
};

const result = await runPendingMediaExpiryJob({
  dataStore,
  occurredAt: '2026-08-03T10:30:00.000Z',
  limit: 25,
  logger: null,
});

assert(result.ok === true && result.expiredCount === 2, 'media expiry returns the gateway count');
assert(calls[0].occurredAt === '2026-08-03T10:30:00.000Z', 'media expiry forwards occurredAt');
assert(calls[0].limit === 25, 'media expiry forwards a bounded limit');

const clampedCalls = [];
await runPendingMediaExpiryJob({
  dataStore: {
    mediaWrites: {
      expirePending: async (draft) => {
        clampedCalls.push(draft);
        return { expiredCount: 0 };
      },
    },
  },
  limit: 5000,
  logger: null,
});
assert(clampedCalls[0].limit === 500, 'media expiry clamps batch size');

const skipped = await runPendingMediaExpiryJob({ dataStore: { kind: 'json' }, logger: null });
assert(skipped.ok === true && skipped.skipped === true, 'media expiry skips stores without the gateway');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['runs-gateway', 'forwards-occurred-at', 'returns-count', 'clamps-limit', 'skips-missing-gateway'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Media expiry job check failed: ${message}`);
}
