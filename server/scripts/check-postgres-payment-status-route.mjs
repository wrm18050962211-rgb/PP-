import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');
const functionStart = source.indexOf('async function getPaymentStatus');
const functionEnd = source.indexOf('async function transitionOrder');
const functionSource = source.slice(functionStart, functionEnd);

assert(/async function getPaymentStatus/.test(source), 'payment status route exists');
assert(/if \(dataStore\.kind === 'json'\) \{[\s\S]*refreshWechatPaymentStatus\(store, payment\)[\s\S]*\}/.test(functionSource), 'live refresh is limited to json mode');
assert(!/let refreshed = false;\s*try\s*\{/.test(functionSource), 'postgres path does not unconditionally refresh mutable payment state');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['payment-status-json-refresh-only', 'postgres-read-only-status'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres payment status route check failed: ${message}`);
}
