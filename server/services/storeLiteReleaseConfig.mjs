export const STORE_LITE_PUBLIC_API_ORIGIN = 'https://api.weareinframe.com';
export const STORE_LITE_IOS_CORS_ORIGIN = 'capacitor://localhost';

export function assertStoreLiteReleaseConfiguration({
  env = process.env,
  appEnv,
  releaseProfile,
  storeLiteBookingsEnabled,
  storeLiteComplianceEnabled,
  phoneSmsProvider,
  tencentSmsConfigured,
  supportChannelKeys,
  enableTestRoleSwitch,
  corsAllowedOrigins,
}) {
  const nodeEnv = String(env.NODE_ENV || '').trim().toLowerCase();
  const normalizedAppEnv = String(appEnv || '').trim().toLowerCase();
  const normalizedProfile = String(releaseProfile || '').trim().toLowerCase();
  const configuredProfile = String(env.RELEASE_PROFILE || '').trim().toLowerCase();

  if (nodeEnv === 'production' && normalizedAppEnv !== 'production') {
    throw new Error('NODE_ENV=production requires APP_ENV=production.');
  }
  if (normalizedAppEnv === 'production' && !configuredProfile) {
    throw new Error('APP_ENV=production requires an explicit RELEASE_PROFILE.');
  }
  if (normalizedProfile !== 'store_lite') return;
  if (normalizedAppEnv !== 'production' || configuredProfile !== 'store_lite') {
    throw new Error('RELEASE_PROFILE=store_lite requires APP_ENV=production and an explicit Store Lite profile.');
  }
  if (storeLiteBookingsEnabled !== true) {
    throw new Error('Store Lite production requires ENABLE_STORE_LITE_BOOKINGS=true.');
  }
  if (storeLiteComplianceEnabled !== true) {
    throw new Error('Store Lite production requires ENABLE_STORE_LITE_COMPLIANCE=true.');
  }
  if (String(phoneSmsProvider || '').trim().toLowerCase() !== 'tencent' || tencentSmsConfigured !== true) {
    throw new Error('Store Lite production requires a complete Tencent SMS configuration.');
  }
  if (!Array.isArray(supportChannelKeys) || supportChannelKeys.length === 0) {
    throw new Error('Store Lite production requires at least one approved support channel key.');
  }
  if (String(enableTestRoleSwitch || '').trim().toLowerCase() !== 'false') {
    throw new Error('Store Lite production requires ENABLE_TEST_ROLE_SWITCH=false.');
  }
  assertStoreLiteCorsOrigins(corsAllowedOrigins);

  let publicApiOrigin;
  try {
    const parsed = new URL(String(env.PUBLIC_API_ORIGIN || '').trim());
    if (
      parsed.username
      || parsed.password
      || parsed.search
      || parsed.hash
      || parsed.pathname !== '/'
      || (parsed.port && parsed.port !== '443')
    ) {
      throw new Error('invalid origin shape');
    }
    publicApiOrigin = parsed.origin;
  } catch {
    throw new Error('Store Lite production PUBLIC_API_ORIGIN must be the approved HTTPS API origin.');
  }
  if (publicApiOrigin !== STORE_LITE_PUBLIC_API_ORIGIN) {
    throw new Error('Store Lite production PUBLIC_API_ORIGIN must be the approved HTTPS API origin.');
  }
}

function assertStoreLiteCorsOrigins(corsAllowedOrigins) {
  const origins = Array.isArray(corsAllowedOrigins)
    ? corsAllowedOrigins.map((origin) => String(origin || '').trim()).filter(Boolean)
    : [];

  if (!origins.includes(STORE_LITE_IOS_CORS_ORIGIN)) {
    throw new Error(`Store Lite production CORS_ALLOWED_ORIGINS must include ${STORE_LITE_IOS_CORS_ORIGIN} exactly.`);
  }

  for (const origin of origins) {
    if (origin === STORE_LITE_IOS_CORS_ORIGIN) continue;
    if (!isExactHttpsWebOrigin(origin)) {
      throw new Error(
        'Store Lite production additional CORS origins must be exact HTTPS web/admin origins without credentials, paths, query strings, fragments, or custom ports.',
      );
    }
  }
}

function isExactHttpsWebOrigin(origin) {
  try {
    const parsed = new URL(origin);
    return parsed.protocol === 'https:'
      && !parsed.username
      && !parsed.password
      && !parsed.search
      && !parsed.hash
      && parsed.pathname === '/'
      && !parsed.port
      && parsed.origin === origin;
  } catch {
    return false;
  }
}
