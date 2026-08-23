import type { CapacitorConfig } from '@capacitor/cli';

if (
  process.env.CAPACITOR_RELEASE_PROFILE !== 'store_lite'
  || process.env.STORE_LITE_CAPACITOR_WRAPPER !== 'store-lite-wrapper-v1'
) {
  throw new Error('Capacitor is locked to the Store Lite wrapper. Run an ios:* npm script instead of invoking cap directly.');
}

const config: CapacitorConfig = {
  appId: 'com.frameyu.still',
  appName: 'Still',
  webDir: 'dist-store-lite',
  bundledWebRuntime: false,
  includePlugins: [],
  ios: {
    contentInset: 'automatic',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
