import { createCipheriv, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createWechatCallbackProcessors, processWechatCallbackEvent } from '../jobs/wechatCallbackProcessors.mjs';

const previousKey = process.env.WECHAT_PAY_API_V3_KEY;
process.env.WECHAT_PAY_API_V3_KEY = '12345678901234567890123456789012';

const calls = {
  paid: [],
  terminalPayment: [],
  refund: [],
};

const dataStore = {
  async load() {
    return {
      store: {
        payments: [
          {
            id: '00000000-0000-4000-8000-000000000701',
            orderId: '00000000-0000-4000-8000-000000000702',
            paymentNo: 'PAY-CALLBACK-1',
            status: 'pending',
          },
          {
            id: '00000000-0000-4000-8000-000000000703',
            orderId: '00000000-0000-4000-8000-000000000704',
            paymentNo: 'PAY-CLOSED-1',
            status: 'pending',
          },
        ],
        refunds: [
          {
            id: '00000000-0000-4000-8000-000000000705',
            orderId: '00000000-0000-4000-8000-000000000706',
            refundNo: 'REF-CALLBACK-1',
            status: 'pending',
          },
        ],
      },
      changed: false,
    };
  },
  orderWrites: {
    async markPaymentPaid(draft) {
      calls.paid.push(draft);
      return { payment: { id: draft.paymentId, status: 'paid' } };
    },
    async markPaymentTerminal(draft) {
      calls.terminalPayment.push(draft);
      return { payment: { id: draft.paymentId, status: draft.status } };
    },
    async markRefundTerminal(draft) {
      calls.refund.push(draft);
      return { refund: { id: draft.refundId, status: draft.status } };
    },
  },
};

const processors = createWechatCallbackProcessors({
  dataStore,
  now: () => '2026-07-08T12:00:00.000Z',
  id: nextId,
});

const paymentResult = await processors['wechat_pay:TRANSACTION.SUCCESS']({
  provider: 'wechat_pay',
  event_type: 'TRANSACTION.SUCCESS',
  raw_payload: encryptedPayload({
    out_trade_no: 'PAY-CALLBACK-1',
    transaction_id: 'wx-transaction-1',
    trade_state: 'SUCCESS',
    success_time: '2026-07-08T12:01:00.000Z',
    payer: { openid: 'openid-1' },
  }),
});

assert(paymentResult.paymentId === '00000000-0000-4000-8000-000000000701', 'payment processor returns payment id');
assert(calls.paid.length === 1, 'payment processor marks payment paid');
assert(calls.paid[0].conversationId === '00000000-0000-4000-8000-000000000001', 'payment processor uses uuid conversation id');
assert(calls.paid[0].statusLogId === '00000000-0000-4000-8000-000000000002', 'payment processor uses uuid status log id');
assert(calls.paid[0].thirdPartyTradeNo === 'wx-transaction-1', 'payment processor forwards trade number');

await processWechatCallbackEvent(
  {
    provider: 'wechat_pay',
    event_type: 'TRANSACTION.SUCCESS',
    raw_payload: encryptedPayload({
      out_trade_no: 'PAY-CLOSED-1',
      transaction_id: 'wx-transaction-closed',
      trade_state: 'CLOSED',
    }),
  },
  { dataStore, now: () => '2026-07-08T12:02:00.000Z', id: nextId },
);

assert(calls.terminalPayment.length === 1, 'payment processor marks terminal payment state');
assert(calls.terminalPayment[0].status === 'closed', 'closed trade state maps to closed payment');

const refundResult = await processors.wechat_pay({
  provider: 'wechat_pay',
  event_type: 'REFUND.SUCCESS',
  raw_payload: encryptedPayload({
    out_refund_no: 'REF-CALLBACK-1',
    refund_id: 'wx-refund-1',
    refund_status: 'SUCCESS',
    success_time: '2026-07-08T12:03:00.000Z',
  }),
});

assert(refundResult.refundId === '00000000-0000-4000-8000-000000000705', 'refund processor returns refund id');
assert(calls.refund.length === 1, 'refund processor marks refund terminal');
assert(calls.refund[0].status === 'succeeded', 'refund success maps to succeeded');
assert(calls.refund[0].statusLogId === '00000000-0000-4000-8000-000000000003', 'refund success uses uuid status log id');

const cliSource = readFileSync(new URL('run-provider-callback-retry-job.mjs', import.meta.url), 'utf8');
assert(/createWechatCallbackProcessors/.test(cliSource), 'retry CLI wires WeChat processors');

if (previousKey === undefined) delete process.env.WECHAT_PAY_API_V3_KEY;
else process.env.WECHAT_PAY_API_V3_KEY = previousKey;

console.log(
  JSON.stringify(
    {
      ok: true,
      checks: ['payment-success-replay', 'payment-terminal-replay', 'refund-success-replay', 'uuid-side-effect-ids', 'retry-cli-wiring'],
    },
    null,
    2,
  ),
);

function encryptedPayload(plaintext) {
  const associatedData = 'callback-associated-data';
  const nonce = randomBytes(6).toString('hex');
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(process.env.WECHAT_PAY_API_V3_KEY, 'utf8'), Buffer.from(nonce, 'utf8'));
  cipher.setAAD(Buffer.from(associatedData, 'utf8'));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(plaintext), 'utf8'), cipher.final()]);
  return {
    resource: {
      algorithm: 'AEAD_AES_256_GCM',
      associated_data: associatedData,
      nonce,
      ciphertext: ciphertext.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    },
  };
}

function nextId() {
  nextId.count = (nextId.count || 0) + 1;
  return `00000000-0000-4000-8000-${String(nextId.count).padStart(12, '0')}`;
}

function assert(condition, message) {
  if (!condition) throw new Error(`WeChat callback processor check failed: ${message}`);
}
