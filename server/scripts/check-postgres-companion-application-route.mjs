import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

const saveStart = source.indexOf('function saveApplication');
const submitStart = source.indexOf('function submitCompanionReview');
const adminStart = source.indexOf('function adminDashboard');
const saveSource = source.slice(saveStart, submitStart);
const submitSource = source.slice(submitStart, adminStart);

assert(/POSTGRES_COMPANION_APPLICATION_NOT_CONNECTED/.test(saveSource), 'save application fails closed in postgres mode');
assert(/POSTGRES_COMPANION_APPLICATION_NOT_CONNECTED/.test(submitSource), 'submit review fails closed in postgres mode');
assert(saveSource.indexOf("dataStore.kind !== 'json'") < saveSource.indexOf('store.application ='), 'save application checks postgres before mutation');
assert(submitSource.indexOf("dataStore.kind !== 'json'") < submitSource.indexOf('store.application ='), 'submit review checks postgres before mutation');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['companion-application-fail-closed', 'submit-review-fail-closed', 'no-postgres-memory-mutation'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres companion application route check failed: ${message}`);
}
