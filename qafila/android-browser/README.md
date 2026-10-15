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
  MainActivity.kt              Hôte Compose (bord à bord), intents VIEW / WEB_SEARCH / SEND, mode démo (extra « demo »)
  data/Models.kt               Onglets, favoris, historique, actions de barre + galerie (6 barres), réglages (kotlinx.serialization)
  data/BrowserStore.kt         ViewModel : état global, actions, réglages par site, veille des onglets, persistance JSON, démo
  web/TabManager.kt            Une WebView par onglet, bloqueur (pubs / traqueurs / cookies, exceptions par site), taille du texte, lecteur
  web/ContentBlocker.kt        Listes de domaines (pubs, traqueurs, bandeaux de cookies) + sélecteurs CSS masqués
  web/Favicons.kt              Favicons par domaine (WebView, sinon le site lui-même), cache disque
  web/Scripts.kt               Temps de lecture + couleur du site, assombrir, lecteur, page d'erreur
  ui/Theme.kt                  Palette neutre (DESIGN.md §1), couleurs de barre (Auto / palette clair-sombre)
  ui/Icons.kt                  Icônes au trait fin dessinées à la main (graisse Fine / Normale / Grasse)
  ui/Chrome.kt                 Barre du bas : 6 styles d'adresse, adresse en ligne, rangée d'icônes, mini-adresse, saisie, aperçu
  ui/MenuCard.kt               Menu flottant (tuiles, lignes, actions rouges, séparateurs)
  ui/TabsScreen.kt             Onglets : liste groupée, grille 2/3 colonnes, carrousels par site
  ui/SettingsScreen.kt         Réglages à sous-pages ; ToolbarEditorScreen.kt : éditeur barre/menu + galerie
  ui/StartPage.kt, ListsScreens.kt, Components.kt, BrowserScreen.kt
```

La spécification de design commune iOS / Android est dans [`../DESIGN.md`](../DESIGN.md).
