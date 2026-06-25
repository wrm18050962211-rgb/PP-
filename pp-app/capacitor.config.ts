import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ppplatform.app',
  appName: 'PP',
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
