export const STORE_LITE_BOOKINGS_FLAG = 'ENABLE_STORE_LITE_BOOKINGS';

export function readStoreLiteFeatureFlags(env = {}) {
  return Object.freeze({
    storeLiteBookingsEnabled: parseBooleanFlag(env[STORE_LITE_BOOKINGS_FLAG]),
  });
}

function parseBooleanFlag(value) {
  return String(value ?? 'false').trim().toLowerCase() === 'true';
}
