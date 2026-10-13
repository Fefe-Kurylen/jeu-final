import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.imperiumantiquitas.app',
  appName: 'Imperium Antiquitas',
  webDir: 'frontend',
  // App always connects to the remote API server
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    // Only the game API may be navigated to from the WebView
    allowNavigation: ['imperium-antiquitas.onrender.com', '*.onrender.com', '*.fly.dev'],
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      // The web layer hides it once initialised; auto-hide guarantees the app never stays stuck on it
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
