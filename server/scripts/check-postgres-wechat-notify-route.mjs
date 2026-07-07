import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

assert(/async function wechatPaymentNotify/.test(source), 'wechat notify route can await postgres writes');
assert(/dataStore\.kind !== 'json' && dataStore\.orderWrites\?\.markPaymentPaid/.test(source), 'wechat notify uses postgres payment gateway');
assert(/async function markPostgresWechatPaymentPaid/.test(source), 'wechat notify has isolated postgres helper');
assert(/dataStore\.orderWrites\.markPaymentPaid/.test(source), 'wechat notify helper calls payment transaction');
assert(/dataStore\.orderWrites\.markPaymentTerminal/.test(source), 'wechat notify helper calls terminal payment transaction');
assert(/\['CLOSED', 'REVOKED', 'PAYERROR'\]\.includes\(transaction\.trade_state\)/.test(source), 'wechat notify handles terminal payment states');
assert(/rawCallback: transaction/.test(source), 'wechat notify persists raw callback through gateway');
assert(/return rawJson\(\{ code: 'SUCCESS', message: 'OK' \}, 200, false\)/.test(source), 'wechat notify avoids json save in postgres mode');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['wechat-notify-gateway', 'terminal-payment-gateway', 'raw-callback', 'idempotent-read-model-guard', 'no-json-save'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres WeChat notify route check failed: ${message}`);
}
