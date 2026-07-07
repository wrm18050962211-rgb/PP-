import { runPendingPaymentExpiryJob } from './paymentExpiryJob.mjs';
import { runProviderCallbackRetryJob } from './providerCallbackRetryJob.mjs';
import { createWechatCallbackProcessors } from './wechatCallbackProcessors.mjs';

export async function runMaintenanceJobs({
  dataStore,
  now = new Date().toISOString(),
  paymentExpiryLimit = 100,
  providerCallbackLimit = 20,
  logger = console,
  expirePayments = runPendingPaymentExpiryJob,
  retryProviderCallbacks = runProviderCallbackRetryJob,
} = {}) {
  const paymentExpiry = await expirePayments({
    dataStore,
    occurredAt: now,
    reason: 'Payment window expired',
    limit: paymentExpiryLimit,
    logger,
  });

  const providerCallbacks = await retryProviderCallbacks({
    dataStore,
    dueAt: now,
    limit: providerCallbackLimit,
    processors: createWechatCallbackProcessors({ dataStore }),
    logger,
  });

  return {
    ok: Boolean(paymentExpiry?.ok && providerCallbacks?.ok),
    ranAt: now,
    jobs: {
      paymentExpiry,
      providerCallbacks,
    },
  };
}
