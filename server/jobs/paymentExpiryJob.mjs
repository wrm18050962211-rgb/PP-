export async function runPendingPaymentExpiryJob({
  dataStore,
  occurredAt = new Date().toISOString(),
  reason = 'Payment window expired',
  limit = 100,
  logger = console,
} = {}) {
  if (!dataStore?.orderWrites?.expirePendingPayments) {
    return {
      ok: true,
      skipped: true,
      skipReason: 'expire-pending-payments-gateway-unavailable',
      expiredCount: 0,
    };
  }

  const result = await dataStore.orderWrites.expirePendingPayments({
    occurredAt,
    reason,
    limit: normalizeLimit(limit),
  });
  const expiredCount = Number(result?.expiredCount || 0);

  if (expiredCount > 0) {
    logger?.log?.(`[orders] released ${expiredCount} expired pending payment order(s).`);
  }

  return {
    ok: true,
    skipped: false,
    expiredCount,
    result,
  };
}

function normalizeLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 100;
  return Math.max(1, Math.min(500, Math.floor(parsed)));
}
