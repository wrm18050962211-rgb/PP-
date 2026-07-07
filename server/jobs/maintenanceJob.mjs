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
  const paymentExpiry = await runMaintenanceChild('paymentExpiry', () =>
    expirePayments({
      dataStore,
      occurredAt: now,
      reason: 'Payment window expired',
      limit: paymentExpiryLimit,
      logger,
    }),
  );

  const providerCallbacks = await runMaintenanceChild('providerCallbacks', () =>
    retryProviderCallbacks({
      dataStore,
      dueAt: now,
      limit: providerCallbackLimit,
      processors: createWechatCallbackProcessors({ dataStore }),
      logger,
    }),
  );

  return {
    ok: Boolean(paymentExpiry?.ok && providerCallbacks?.ok),
    ranAt: now,
    jobs: {
      paymentExpiry,
      providerCallbacks,
    },
  };
}

async function runMaintenanceChild(name, callback) {
  try {
    return await callback();
  } catch (error) {
    return {
      ok: false,
      failed: true,
      name,
      error: {
        message: error instanceof Error ? error.message : String(error),
        code: error?.code || null,
      },
    };
  }
}
