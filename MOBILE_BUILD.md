# Imperium Antiquitas - Build Mobile (Capacitor)

## Prerequis

### Android
- [Android Studio](https://developer.android.com/studio) (avec SDK 33+)
- JDK 17+

### iOS (Mac uniquement)
- Xcode 15+
- CocoaPods (`sudo gem install cocoapods`)

## Installation rapide

```bash
# Installer les dependances
npm install

# Ajouter les plateformes (si premier build)
npm run cap:add:android
npm run cap:add:ios

# Synchroniser le frontend avec les projets natifs
npm run cap:sync
```

## Build Android

```bash
# Ouvrir dans Android Studio
npm run cap:open:android

# OU lancer directement sur device/emulateur connecte
npm run cap:run:android
```

Dans Android Studio :
1. Attendre la synchronisation Gradle
2. Selectionner le device/emulateur
3. Cliquer "Run" (triangle vert)
4. Pour un APK : Build > Build Bundle(s) / APK(s) > Build APK(s)

## Build iOS

```bash
# Ouvrir dans Xcode
npm run cap:open:ios

# OU lancer directement
npm run cap:run:ios
```

Dans Xcode :
1. Selectionner le scheme "App"
2. Choisir simulateur ou device
3. Cliquer "Run" (triangle)
4. Pour publier : Product > Archive

## Configuration serveur

Le fichier `capacitor.config.ts` contient l'URL du serveur backend.
Modifier `server.url` pour pointer vers votre instance :

```typescript
server: {
  url: 'https://votre-serveur.railway.app',
}
```

## Developpement local

Pour tester en local avec hot-reload :

```bash
# Demarrer le serveur local
npm start

# Dans capacitor.config.ts, changer server.url en :
# url: 'http://VOTRE_IP_LOCALE:3000'
# puis synchroniser
npm run cap:sync
npm run cap:run:android
```

## Commandes utiles

| Commande | Description |
|----------|-------------|
| `npm run cap:sync` | Copie le frontend + met a jour les plugins |
| `npm run cap:open:android` | Ouvre le projet Android Studio |
| `npm run cap:open:ios` | Ouvre le projet Xcode |
| `npm run cap:run:android` | Build + lance sur device Android |
| `npm run cap:run:ios` | Build + lance sur device iOS |
