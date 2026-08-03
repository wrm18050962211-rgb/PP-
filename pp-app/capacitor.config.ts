import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.frameyu.still',
  // English/default bundle name. The iOS zh-Hans localization owns "Still帧遇".
  appName: 'Still',
  webDir: 'dist',
  bundledWebRuntime: false,
  ios: {
    contentInset: 'automatic',
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;
