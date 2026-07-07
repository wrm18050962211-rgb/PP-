export async function runProviderCallbackRetryJob({
  dataStore,
  processors = {},
  dueAt = new Date().toISOString(),
  limit = 20,
  logger = console,
} = {}) {
  const writes = dataStore?.providerCallbackWrites;
  if (!writes?.claimDue || !writes?.markProcessed || !writes?.markFailed) {
    return {
      ok: true,
      skipped: true,
      skipReason: 'provider-callback-gateway-unavailable',
      claimedCount: 0,
      processedCount: 0,
      failedCount: 0,
    };
  }

  const events = await writes.claimDue({
    dueAt,
    limit: normalizeLimit(limit),
  });
  let processedCount = 0;
  let failedCount = 0;
  const results = [];

  for (const event of events || []) {
    const eventId = event.id;
    const processor = resolveProcessor(processors, event);
    if (!processor) {
      const nextRetryAt = nextRetryTime(event.retry_count ?? event.retryCount);
      await writes.markFailed({
        callbackEventId: eventId,
        retryable: true,
        nextRetryAt,
        lastError: 'No provider callback retry processor configured',
      });
      failedCount += 1;
      results.push({ id: eventId, status: 'retrying', reason: 'missing_processor', nextRetryAt });
      continue;
    }

    try {
      const processorResult = (await processor(event)) || {};
      await writes.markProcessed({
        callbackEventId: eventId,
        objectType: processorResult.objectType,
        objectId: processorResult.objectId,
        paymentId: processorResult.paymentId,
        refundId: processorResult.refundId,
        orderId: processorResult.orderId,
      });
      processedCount += 1;
      results.push({ id: eventId, status: 'processed' });
    } catch (error) {
      const nextRetryAt = nextRetryTime(event.retry_count ?? event.retryCount);
      await writes.markFailed({
        callbackEventId: eventId,
        retryable: true,
        nextRetryAt,
        lastError: error instanceof Error ? error.message : String(error),
      });
      failedCount += 1;
      results.push({ id: eventId, status: 'retrying', reason: 'processor_error', nextRetryAt });
    }
  }

  if (events?.length) {
    logger?.log?.(`[provider-callbacks] claimed ${events.length}, processed ${processedCount}, retrying ${failedCount}.`);
  }

  return {
    ok: true,
    skipped: false,
    claimedCount: events?.length || 0,
    processedCount,
    failedCount,
    results,
  };
}

function resolveProcessor(processors = {}, event = {}) {
  const provider = event.provider;
  const eventType = event.event_type || event.eventType;
  return processors[`${provider}:${eventType}`] || processors[provider] || processors.default || null;
}

function nextRetryTime(retryCount = 0, baseMs = 5 * 60 * 1000, maxMs = 60 * 60 * 1000) {
  const count = Math.max(0, Number(retryCount) || 0);
  const delay = Math.min(maxMs, baseMs * 2 ** Math.min(count, 6));
  return new Date(Date.now() + delay).toISOString();
}

function normalizeLimit(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 20;
  return Math.max(1, Math.min(200, Math.floor(parsed)));
}
