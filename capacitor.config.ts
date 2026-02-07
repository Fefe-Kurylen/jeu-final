import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.imperiumantiquitas.app',
  appName: 'Imperium Antiquitas',
  webDir: 'frontend',
  server: {
    // IMPORTANT: Remplacez par l'URL de votre serveur Railway
    // Pour dev local: 'http://VOTRE_IP:3000'
    url: 'https://jeu-final-production.up.railway.app',
    cleartext: false,
    allowNavigation: ['*.railway.app', '*.up.railway.app']
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#1a1a2e'
    },
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: '#1a1a2e',
      showSpinner: true,
      spinnerColor: '#c9a227',
      launchAutoHide: true
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true
    }
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#1a1a2e',
    webContentsDebuggingEnabled: false
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#1a1a2e',
    scheme: 'Imperium Antiquitas',
    preferredContentMode: 'mobile'
  }
};

export default config;
