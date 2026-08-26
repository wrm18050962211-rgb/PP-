import type { CapacitorConfig } from '@capacitor/cli';

const releaseProfile = String(process.env.CAPACITOR_RELEASE_PROFILE || 'main').trim();
const storeLiteRelease = releaseProfile === 'store_lite';

if (releaseProfile !== 'main' && !storeLiteRelease) {
  throw new Error(`Unsupported Capacitor release profile: ${releaseProfile}`);
}
if (storeLiteRelease && process.env.STORE_LITE_CAPACITOR_WRAPPER !== 'store-lite-wrapper-v1') {
  throw new Error('Store Lite Capacitor sync must use the guarded Store Lite wrapper.');
}

const config: CapacitorConfig = {
  appId: 'com.frameyu.still',
  appName: 'Still',
  webDir: storeLiteRelease ? 'dist-store-lite' : 'dist',
  bundledWebRuntime: false,
  ...(storeLiteRelease ? { includePlugins: [] } : {}),
  ios: {
    contentInset: 'automatic',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
