import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.imperiumantiquitas.app',
  appName: 'Imperium Antiquitas',
  webDir: 'frontend',
  // App always connects to the remote API server
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    // Allow all navigation (API calls to server)
    allowNavigation: ['*'],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: false, // Hide manually after app init
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
      overlaysWebView: false,
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
    allowsLinkPreview: false,
  },
  android: {
    backgroundColor: '#1a1510',
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
    overScrollMode: 'never',
  },
};

export default config;
