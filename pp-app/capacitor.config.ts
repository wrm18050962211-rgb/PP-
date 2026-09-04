import type { CapacitorConfig } from '@capacitor/cli';

const releaseProfile = String(process.env.CAPACITOR_RELEASE_PROFILE || 'main').trim();
const storeLiteRelease = releaseProfile === 'store_lite';
const photographerApp = releaseProfile === 'photographer';

if (releaseProfile !== 'main' && !storeLiteRelease && !photographerApp) {
  throw new Error(`Unsupported Capacitor release profile: ${releaseProfile}`);
}
if (storeLiteRelease && process.env.STORE_LITE_CAPACITOR_WRAPPER !== 'store-lite-wrapper-v1') {
  throw new Error('Store Lite Capacitor sync must use the guarded Store Lite wrapper.');
}
if (photographerApp && process.env.PHOTOGRAPHER_CAPACITOR_WRAPPER !== 'photographer-wrapper-v1') {
  throw new Error('Photographer Capacitor sync must use the dedicated photographer wrapper.');
}

const config: CapacitorConfig = {
  appId: photographerApp ? 'com.frameyu.still.photographer' : 'com.frameyu.still',
  appName: photographerApp ? '帧遇摄影师' : '帧遇',
  webDir: photographerApp ? 'dist-photographer' : storeLiteRelease ? 'dist-store-lite' : 'dist',
  bundledWebRuntime: false,
  ...(storeLiteRelease ? { includePlugins: [] } : {}),
  ios: {
    path: photographerApp ? 'ios-photographer' : 'ios',
    contentInset: 'automatic',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
