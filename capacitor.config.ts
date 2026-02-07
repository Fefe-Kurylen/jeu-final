import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.imperiumantiquitas.app',
  appName: 'Imperium Antiquitas',
  webDir: 'frontend',
  server: {
    // En production, pointer vers votre serveur Railway
    url: 'https://jeu-final-production.up.railway.app',
    cleartext: false,
    // Permettre la navigation vers l'API
    allowNavigation: ['jeu-final-production.up.railway.app', '*.railway.app']
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
    buildOptions: {
      keystorePath: undefined,
      keystoreAlias: undefined
    }
  },
  ios: {
    contentInset: 'automatic',
    backgroundColor: '#1a1a2e',
    scheme: 'Imperium Antiquitas'
  }
};

export default config;
