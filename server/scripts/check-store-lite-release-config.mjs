import assert from 'node:assert/strict';
import {
  assertStoreLiteReleaseConfiguration,
  STORE_LITE_IOS_CORS_ORIGIN,
  STORE_LITE_PUBLIC_API_ORIGIN,
} from '../services/storeLiteReleaseConfig.mjs';

const valid = {
  env: {
    NODE_ENV: 'production',
    APP_ENV: 'production',
    RELEASE_PROFILE: 'store_lite',
    PUBLIC_API_ORIGIN: STORE_LITE_PUBLIC_API_ORIGIN,
  },
  appEnv: 'production',
  releaseProfile: 'store_lite',
  storeLiteBookingsEnabled: true,
  storeLiteComplianceEnabled: true,
  phoneSmsProvider: 'tencent',
  tencentSmsConfigured: true,
  supportChannelKeys: ['store_lite.support'],
  enableTestRoleSwitch: 'false',
  corsAllowedOrigins: [
    STORE_LITE_IOS_CORS_ORIGIN,
    'https://www.weareinframe.com',
    'https://admin.weareinframe.com',
  ],
};

assert.doesNotThrow(() => assertStoreLiteReleaseConfiguration(valid));

const invalidCases = [
  ['node-production-with-development-app', { appEnv: 'development', env: { ...valid.env, APP_ENV: 'development' } }],
  ['missing-explicit-profile', { env: { ...valid.env, RELEASE_PROFILE: '' } }],
  ['store-lite-development', { appEnv: 'development', env: { ...valid.env, NODE_ENV: '', APP_ENV: 'development' } }],
  ['booking-flag-off', { storeLiteBookingsEnabled: false }],
  ['compliance-flag-off', { storeLiteComplianceEnabled: false }],
  ['mock-sms', { phoneSmsProvider: 'mock' }],
  ['incomplete-sms', { tencentSmsConfigured: false }],
  ['missing-support', { supportChannelKeys: [] }],
  ['test-role-enabled', { enableTestRoleSwitch: 'true' }],
  ['missing-ios-origin', { corsAllowedOrigins: ['https://www.weareinframe.com'] }],
  ['ios-origin-with-slash', { corsAllowedOrigins: ['capacitor://localhost/'] }],
  ['wrong-capacitor-host', { corsAllowedOrigins: ['capacitor://app'] }],
  ['wildcard-cors-origin', { corsAllowedOrigins: [STORE_LITE_IOS_CORS_ORIGIN, '*'] }],
  ['insecure-web-cors-origin', { corsAllowedOrigins: [STORE_LITE_IOS_CORS_ORIGIN, 'http://www.weareinframe.com'] }],
  ['web-cors-origin-with-path', { corsAllowedOrigins: [STORE_LITE_IOS_CORS_ORIGIN, 'https://www.weareinframe.com/app'] }],
  ['web-cors-origin-with-trailing-slash', { corsAllowedOrigins: [STORE_LITE_IOS_CORS_ORIGIN, 'https://www.weareinframe.com/'] }],
  ['web-cors-origin-with-custom-port', { corsAllowedOrigins: [STORE_LITE_IOS_CORS_ORIGIN, 'https://admin.weareinframe.com:8443'] }],
  ['unapproved-api-origin', { env: { ...valid.env, PUBLIC_API_ORIGIN: 'https://api.evil.org' } }],
  ['api-origin-with-path', { env: { ...valid.env, PUBLIC_API_ORIGIN: `${STORE_LITE_PUBLIC_API_ORIGIN}/v1` } }],
];

for (const [name, override] of invalidCases) {
  assert.throws(
    () => assertStoreLiteReleaseConfiguration({ ...valid, ...override }),
    undefined,
    `Store Lite release configuration must reject ${name}`,
  );
}

assert.doesNotThrow(() => assertStoreLiteReleaseConfiguration({
  ...valid,
  env: { APP_ENV: 'development', RELEASE_PROFILE: 'development' },
  appEnv: 'development',
  releaseProfile: 'development',
}));

assert.doesNotThrow(() => assertStoreLiteReleaseConfiguration({
  ...valid,
  corsAllowedOrigins: [STORE_LITE_IOS_CORS_ORIGIN],
}));

console.log(JSON.stringify({ ok: true, invalidCases: invalidCases.map(([name]) => name) }, null, 2));
