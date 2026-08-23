export const STORE_LITE_BOOKINGS_FLAG = 'ENABLE_STORE_LITE_BOOKINGS';
export const STORE_LITE_COMPLIANCE_FLAG = 'ENABLE_STORE_LITE_COMPLIANCE';

export function readStoreLiteFeatureFlags(env = {}) {
  return Object.freeze({
    storeLiteBookingsEnabled: parseBooleanFlag(env[STORE_LITE_BOOKINGS_FLAG]),
    storeLiteComplianceEnabled: parseBooleanFlag(env[STORE_LITE_COMPLIANCE_FLAG]),
  });
}

function parseBooleanFlag(value) {
  return String(value ?? 'false').trim().toLowerCase() === 'true';
}
