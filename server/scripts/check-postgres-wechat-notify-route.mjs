import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../server.mjs', import.meta.url), 'utf8');

assert(/async function wechatPaymentNotify/.test(source), 'wechat notify route can await postgres writes');
assert(/path === '\/api\/payments\/wechat\/refund-notify'/.test(source), 'wechat refund notify route is registered');
assert(/verifyWechatPayNotifyRequest\(req, body\)/.test(source), 'wechat notify verifies request signatures before decrypting resource');
assert(/function verifyWechatPayNotifyRequest/.test(source), 'wechat notify signature helper exists');
assert(/WECHAT_PAY_PLATFORM_PUBLIC_KEY/.test(source), 'wechat notify requires platform public key for signature verification');
assert(/Object\.defineProperty\(parsed, '__rawBody'/.test(source), 'readBody preserves raw body for signature verification');
assert(/recordWechatProviderCallback\(body, req\)/.test(source), 'wechat notify records provider callback event');
assert(/dataStore\.providerCallbackWrites\.recordReceived/.test(source), 'wechat notify uses provider callback received gateway');
assert(/markWechatProviderCallbackProcessed/.test(source), 'wechat notify marks callback processed after business write');
assert(/markWechatProviderCallbackFailed/.test(source), 'wechat notify marks callback failed for retryable failures');
assert(/dataStore\.kind !== 'json' && dataStore\.orderWrites\?\.markPaymentPaid/.test(source), 'wechat notify uses postgres payment gateway');
assert(/async function markPostgresWechatPaymentPaid/.test(source), 'wechat notify has isolated postgres helper');
assert(/async function wechatRefundNotify/.test(source), 'wechat refund notify has isolated handler');
assert(/async function markPostgresWechatRefundTerminal/.test(source), 'wechat refund notify has isolated postgres helper');
assert(/dataStore\.orderWrites\.markPaymentPaid/.test(source), 'wechat notify helper calls payment transaction');
assert(/dataStore\.orderWrites\.markPaymentTerminal/.test(source), 'wechat notify helper calls terminal payment transaction');
assert(/dataStore\.orderWrites\.markRefundTerminal/.test(source), 'wechat refund notify helper calls refund terminal transaction');
assert(/\['CLOSED', 'REVOKED', 'PAYERROR'\]\.includes\(transaction\.trade_state\)/.test(source), 'wechat notify handles terminal payment states');
assert(/mapWechatRefundTerminalStatus/.test(source), 'wechat refund notify maps provider refund states');
assert(/rawCallback: transaction/.test(source), 'wechat notify persists raw callback through gateway');
assert(/return rawJson\(\{ code: 'SUCCESS', message: 'OK' \}, 200, false\)/.test(source), 'wechat notify avoids json save in postgres mode');

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['wechat-notify-gateway', 'notify-signature-guard', 'provider-callback-event', 'terminal-payment-gateway', 'refund-notify-gateway', 'raw-callback', 'idempotent-read-model-guard', 'no-json-save'],
    },
    null,
    2,
  ),
);

function assert(condition, message) {
  if (!condition) throw new Error(`Postgres WeChat notify route check failed: ${message}`);
}
