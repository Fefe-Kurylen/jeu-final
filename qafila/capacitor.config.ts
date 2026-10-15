import type { CapacitorConfig } from '@capacitor/cli';

// Appli mobile Qafila : la coque Capacitor affiche l'interface de recherche (dossier public/)
// et ouvre les sites dans un navigateur intégré (plugin @capgo/inappbrowser).
// Avant `npx cap sync`, définir QAFILA_SERVER_URL vers votre instance déployée si l'interface
// doit charger les résultats depuis un serveur distant (sinon modifier API_BASE dans public/app.js).
const config: CapacitorConfig = {
  appId: 'fr.qafila.app',
  appName: 'Qafila',
  webDir: 'public',
  server: {
    androidScheme: 'https',
    iosScheme: 'https',
    allowNavigation: ['*'],
  },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#0f1020', showSpinner: false },
    StatusBar: { style: 'DARK', backgroundColor: '#0f1020' },
  },
  ios: { contentInset: 'automatic', preferredContentMode: 'mobile', backgroundColor: '#0f1020' },
  android: { backgroundColor: '#0f1020', allowMixedContent: false },
};

export default config;
