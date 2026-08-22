export const COMPOSITE_ORDER_DOMAIN_FLAG = 'ENABLE_COMPOSITE_ORDER_DOMAIN';

export function readCompositeOrderFeatureFlags(env = {}) {
  return Object.freeze({
    domainEnabled: parseBooleanFlag(env[COMPOSITE_ORDER_DOMAIN_FLAG]),
    // This first slice intentionally has no runtime switch for real composite
    // payments. A later payment/settlement slice must add that capability.
    compositePaymentsEnabled: false,
  });
}

function parseBooleanFlag(value) {
  return String(value ?? 'false').trim().toLowerCase() === 'true';
}
