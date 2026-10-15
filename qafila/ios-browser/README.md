# 📱 Qafila Browser — navigateur iPhone personnalisable (dans l'esprit de Quiche)

Navigateur natif iOS (SwiftUI + WKWebView, le moteur de Safari) qui reprend ce qui fait Quiche Browser :
**chaque bouton se place où l'on veut**, des onglets beaux et bien rangés, un bloqueur intégré, un mode sombre
pour tous les sites, et des réglages fins — sans abonnement, sans collecte de données.

## Fonctionnalités

| Domaine | Détail |
|---|---|
| **Barre d'outils** | Boutons déplaçables par glisser, retirables, taille Petit/Moyen/Grand, séparateurs ; chaque action peut être dans la barre, dans le menu, dans les deux ou nulle part. Appui long sur la barre → Personnaliser. |
| **Galerie de barres** | 4 presets prêts à l'emploi : Complète, Minimaliste (2 boutons), Gestes, Lecture. |
| **Menu** | Comme Quiche : rangée Nouvel onglet / Onglet privé, rangées d'icônes, lignes d'actions, actions rouges Fermer cet onglet / Fermer les N onglets, navigation < > ↻. Entièrement réordonnable. |
| **Barre d'adresse** | Icône du site, domaine ou titre, temps de lecture estimé, cadenas, suggestions (moteur + historique + favoris), menu contextuel (copier, coller et ouvrir, favori, version bureau, JavaScript). |
| **Onglets** | Liste **groupée par site** ou grille de vignettes (petites/grandes), tri par date, temps de lecture ou titre, onglets privés séparés, balayer pour fermer, compteur dans la barre. |
| **Confidentialité** | Bloqueur pubs + traqueurs (règles WebKit compilées), masquage des bandeaux de cookies, JavaScript global ou **par site** (bouton JS), passage automatique en HTTPS, user agent personnalisé, onglets privés non persistés, effacement des données. |
| **Lecture** | Assombrir tous les sites (ou par site), Lecteur (extraction de l'article), masquage des barres au défilement (plein écran), haut/bas de page, recherche dans la page, version bureau, traduction. |
| **Apparence** | Thème système/clair/sombre, 8 couleurs d'accent (monochrome par défaut), couleur de l'interface adaptée au site (`theme-color`), barre Classique ou Verre, position en bas ou en haut, vibrations. |
| **Recherche** | Qafila (votre serveur), DuckDuckGo, Qwant, Kagi, SearXNG perso, Brave, Google, Bing ; page de nouvel onglet au choix. |

## Compiler

Nécessite un Mac avec **Xcode 15+** (iOS 17). Le projet est décrit dans `project.yml` ([XcodeGen](https://github.com/yonaskolb/XcodeGen)).

```bash
brew install xcodegen
cd qafila/ios-browser
xcodegen generate          # crée QafilaBrowser.xcodeproj
open QafilaBrowser.xcodeproj
```

Dans Xcode : choisir votre équipe de signature (Signing & Capabilities), brancher l'iPhone, ▶︎ Run.
Pour un test rapide sans Mac : TestFlight nécessite de toute façon une compilation Xcode.

Sans XcodeGen : créer un projet « App » SwiftUI vide nommé `QafilaBrowser`, supprimer `ContentView.swift`, glisser le dossier
`QafilaBrowser/` (Models, Store, Web, Views, Services, Resources) dans le projet, et régler la cible minimale sur iOS 17.

## Structure

```
QafilaBrowser/
  QafilaBrowserApp.swift      Point d'entrée
  Models/                     BrowserTab, Bookmark, HistoryEntry, ToolbarAction (+ presets de la galerie)
  Store/                      Settings (tous les réglages), BrowserStore (état global, persistance JSON)
  Web/                        TabManager (une WKWebView par onglet, bloqueur, mode sombre, UA), WebContainer, StartPage
  Services/                   ContentBlocker (règles), Scripts (temps de lecture, assombrir, lecteur)
  Views/                      BrowserView, AddressBar, ToolbarView, MenuSheet, TabsView, ToolbarEditorView (+ galerie), SettingsView, BookmarksView, HistoryView
  Resources/Assets.xcassets   Icône (anneau, clair/sombre) et couleur d'accent
```

## Limites connues

- Le code a été vérifié syntaxiquement avec Swift 6.0.3 sous Linux, mais **pas compilé contre le SDK iOS** (pas de Xcode ici) :
  une première compilation peut remonter quelques ajustements mineurs.
- Le bloqueur embarque une liste courte et lisible de domaines ; on peut la remplacer par EasyList converti au format WebKit.
- Le Lecteur utilise une heuristique simple (pas Readability complet).
- Pas de synchronisation iCloud des onglets/favoris pour l'instant.
