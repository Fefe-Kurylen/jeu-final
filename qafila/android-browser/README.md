# 🤖 Qafila Browser — Android

Version Android native (Kotlin, Jetpack Compose, WebView) de Qafila Browser, avec les mêmes fonctions que la version iOS :
barre d'outils et menu entièrement personnalisables, galerie de barres, onglets groupés par site, bloqueur, mode sombre pour tous
les sites, JavaScript par site, lecteur, temps de lecture, navigateur par défaut Android.

## Compiler

```bash
cd qafila/android-browser
gradle assembleDebug            # ou ./gradlew si vous ajoutez le wrapper ; Android Studio fonctionne aussi (File > Open)
# APK : app/build/outputs/apk/debug/app-debug.apk
```

Requis : JDK 17+, Android SDK (platform 35, build-tools 35). `local.properties` doit pointer vers le SDK (`sdk.dir=…`).

## Publier

Voir [`../DEPLOIEMENT_STORES.md`](../DEPLOIEMENT_STORES.md) : keystore (`./scripts-keystore.sh`), secrets GitHub, workflow
*Qafila Android* qui produit un bundle signé et l'envoie sur Google Play. Textes et visuels de la fiche : dossier `play/`.

## Structure

```
app/src/main/java/fr/qafila/browser/
  MainActivity.kt              Hôte Compose, intents VIEW / WEB_SEARCH / SEND
  data/Models.kt               Onglets, favoris, historique, actions de barre + presets, réglages (kotlinx.serialization)
  data/BrowserStore.kt         ViewModel : état global, actions, persistance JSON
  web/TabManager.kt            Une WebView par onglet, bloqueur (shouldInterceptRequest), scripts, user agent, lecteur
  web/ContentBlocker.kt        Domaines bloqués + sélecteurs de bandeaux cookies
  web/Scripts.kt               Temps de lecture, assombrir, lecteur, page de démarrage, page d'erreur
  ui/                          BrowserScreen, AddressBar, ToolbarRow, MenuSheet, TabsScreen, ToolbarEditorScreen (+ galerie), SettingsScreen, ListsScreens
```
