import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.imperiumantiquitas.app',
  appName: 'Imperium Antiquitas',
  webDir: 'frontend',
  server: {
    // In production, the app loads local files.
    // For development, uncomment and set your server URL:
    // url: 'http://192.168.1.x:3000',
    // cleartext: true,
    androidScheme: 'https',
    iosScheme: 'https',
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#1a1510',
      showSpinner: true,
      spinnerColor: '#c9a227',
      androidScaleType: 'CENTER_CROP',
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1a1510',
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true,
    },
  },
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    backgroundColor: '#1a1510',
  },
  android: {
    backgroundColor: '#1a1510',
    allowMixedContent: true,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};

export default config;
