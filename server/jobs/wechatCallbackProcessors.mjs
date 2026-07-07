import { createDecipheriv, randomUUID } from 'node:crypto';

export function createWechatCallbackProcessors({ dataStore, now = () => new Date().toISOString(), id = () => randomUUID() } = {}) {
  const processor = (event) => processWechatCallbackEvent(event, { dataStore, now, id });
  return {
    wechat_pay: processor,
    'wechat_pay:TRANSACTION.SUCCESS': processor,
    'wechat_pay:REFUND.SUCCESS': processor,
  };
}

export async function processWechatCallbackEvent(event = {}, { dataStore, now = () => new Date().toISOString(), id = () => randomUUID() } = {}) {
  if (!dataStore?.orderWrites) throw new Error('Postgres order write gateway is required for WeChat callback replay');
  const payload = normalizePayload(event.raw_payload ?? event.rawPayload);
  const transaction = decryptWechatPayResource(payload.resource || {});
  if (transaction.out_refund_no || transaction.refund_id || String(event.event_type || event.eventType || '').startsWith('REFUND.')) {
    return processWechatRefundCallback(transaction, { dataStore, now, id });
  }
  return processWechatPaymentCallback(transaction, { dataStore, now, id });
}

async function processWechatPaymentCallback(transaction, { dataStore, now, id }) {
  const { store } = await dataStore.load();
  const payment = (store.payments || []).find((item) => item.paymentNo === transaction.out_trade_no || item.transactionId === transaction.transaction_id);
  if (!payment) throw new Error('Payment not found');

  if (transaction.trade_state === 'SUCCESS') {
    if (payment.status !== 'paid' && payment.status !== 'closed') {
      await dataStore.orderWrites.markPaymentPaid({
        paymentId: payment.id,
        conversationId: id(),
        statusLogId: id(),
        paidAt: transaction.success_time || now(),
        thirdPartyTradeNo: transaction.transaction_id || null,
        thirdPartyBuyerId: transaction.payer?.openid || null,
        rawCallback: transaction,
        operatorType: 'system',
        statusReason: 'WeChat Pay callback replay succeeded',
      });
    }
    return { objectType: 'payment', objectId: payment.id, paymentId: payment.id, orderId: payment.orderId };
  }

  if (['CLOSED', 'REVOKED', 'PAYERROR'].includes(transaction.trade_state)) {
    if (payment.status === 'pending') {
      await dataStore.orderWrites.markPaymentTerminal({
        paymentId: payment.id,
        status: transaction.trade_state === 'PAYERROR' ? 'failed' : 'closed',
        occurredAt: now(),
        thirdPartyTradeNo: transaction.transaction_id || null,
        rawCallback: transaction,
      });
    }
    return { objectType: 'payment', objectId: payment.id, paymentId: payment.id, orderId: payment.orderId };
  }

  return { objectType: 'payment', objectId: payment.id, paymentId: payment.id, orderId: payment.orderId };
}

async function processWechatRefundCallback(transaction, { dataStore, now, id }) {
  const { store } = await dataStore.load();
  const refund = (store.refunds || []).find((item) => item.refundNo === transaction.out_refund_no || item.thirdPartyRefundNo === transaction.refund_id);
  if (!refund) throw new Error('Refund not found');

  const status = mapWechatRefundTerminalStatus(transaction.refund_status);
  if (status && !['succeeded', 'failed', 'rejected'].includes(refund.status)) {
    await dataStore.orderWrites.markRefundTerminal({
      refundId: refund.id,
      status,
      statusLogId: status === 'succeeded' ? id() : undefined,
      occurredAt: transaction.success_time || now(),
      thirdPartyRefundNo: transaction.refund_id || null,
      rawCallback: transaction,
      operatorType: 'system',
      reason: refundTerminalReason(status, transaction),
    });
  }

  return { objectType: 'refund', objectId: refund.id, refundId: refund.id, orderId: refund.orderId };
}

function decryptWechatPayResource(resource) {
  const key = Buffer.from(requiredEnv('WECHAT_PAY_API_V3_KEY'), 'utf8');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(resource.nonce || '', 'utf8'));
  decipher.setAuthTag(Buffer.from(resource.tag || '', 'base64'));
  decipher.setAAD(Buffer.from(resource.associated_data || '', 'utf8'));
  const plaintext = Buffer.concat([decipher.update(Buffer.from(resource.ciphertext || '', 'base64')), decipher.final()]);
  return JSON.parse(plaintext.toString('utf8'));
}

function normalizePayload(payload) {
  if (!payload) throw new Error('Provider callback raw payload is required');
  if (typeof payload === 'string') return JSON.parse(payload);
  if (typeof payload === 'object') return payload;
  throw new Error('Provider callback raw payload must be an object or JSON string');
}

function mapWechatRefundTerminalStatus(status) {
  if (status === 'SUCCESS') return 'succeeded';
  if (status === 'CLOSED') return 'rejected';
  if (status === 'ABNORMAL') return 'failed';
  return null;
}

function refundTerminalReason(status, transaction = {}) {
  if (status === 'succeeded') return 'WeChat refund callback replay succeeded';
  if (status === 'failed') return transaction.abnormal_reason || 'WeChat refund callback replay failed';
  if (status === 'rejected') return 'WeChat refund callback replay closed';
  return 'WeChat refund callback replay processed';
}

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}
