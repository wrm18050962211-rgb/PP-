import { runPendingPaymentExpiryJob } from './paymentExpiryJob.mjs';
import { runPendingMediaExpiryJob } from './mediaExpiryJob.mjs';
import { runProviderCallbackRetryJob } from './providerCallbackRetryJob.mjs';
import { createWechatCallbackProcessors } from './wechatCallbackProcessors.mjs';

export async function runMaintenanceJobs({
  dataStore,
  now = new Date().toISOString(),
  paymentExpiryLimit = 100,
  mediaExpiryLimit = 100,
  providerCallbackLimit = 20,
  logger = console,
  expirePayments = runPendingPaymentExpiryJob,
  expireMedia = runPendingMediaExpiryJob,
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

  const mediaExpiry = await runMaintenanceChild('mediaExpiry', () =>
    expireMedia({
      dataStore,
      occurredAt: now,
      limit: mediaExpiryLimit,
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
    ok: Boolean(paymentExpiry?.ok && mediaExpiry?.ok && providerCallbacks?.ok),
    ranAt: now,
    jobs: {
      paymentExpiry,
      mediaExpiry,
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
