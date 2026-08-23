import { createJsonStore } from './jsonStore.mjs';
import { createPostgresStore } from './postgresStore.mjs';
import { readCompositeOrderFeatureFlags } from '../services/compositeOrderFeature.mjs';
import { readStoreLiteFeatureFlags } from '../services/storeLiteFeature.mjs';

export function createDataStore(options) {
  const driver = normalizeStoreDriver(process.env.STORE_DRIVER);

  if (driver === 'json') {
    return createJsonStore(options);
  }

  return createPostgresStore({
    ...options,
    databaseUrl: process.env.DATABASE_URL,
    featureFlags: {
      ...readCompositeOrderFeatureFlags(process.env),
      ...readStoreLiteFeatureFlags(process.env),
    },
  });
}

function normalizeStoreDriver(driver) {
  const normalized = String(driver || 'json').trim().toLowerCase();
  if (['json', 'postgres'].includes(normalized)) return normalized;
  throw new Error(`Unsupported STORE_DRIVER "${driver}". Use "json" or "postgres".`);
}
