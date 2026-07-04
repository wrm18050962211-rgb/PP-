import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.frameyu.still',
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
