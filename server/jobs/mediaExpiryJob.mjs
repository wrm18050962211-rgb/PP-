export async function runPendingMediaExpiryJob({
  dataStore,
  occurredAt = new Date().toISOString(),
  limit = 100,
  logger = console,
} = {}) {
  if (!dataStore?.mediaWrites?.expirePending) {
    return {
      ok: true,
      skipped: true,
      skipReason: 'expire-pending-media-gateway-unavailable',
      expiredCount: 0,
    };
  }

  const result = await dataStore.mediaWrites.expirePending({
    occurredAt,
    limit: normalizeLimit(limit),
  });
  const expiredCount = Number(result?.expiredCount || 0);

  if (expiredCount > 0) {
    logger?.log?.(`[media] expired ${expiredCount} pending upload(s).`);
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
