# 🦊 Qafila — recherche privée et navigateur mobile

Qafila est un moteur de recherche privé **type Qwant** : une page de recherche sans pisteur, des résultats
agrégés depuis plusieurs sources, et une coque mobile (Capacitor) qui ouvre les sites dans un navigateur intégré.

L'interface reprend les codes de Qwant : logo serif avec étincelle, barre de recherche en pilule à halo lavande,
onglets **Tous / Images / Vidéos / Actualités** en pilules, cartes de résultats avec favicon rond, trait vertical et
titre bleu, bouton « Plus de résultats », grille d'images justifiée, pied de page sombre, thème clair/sombre.

## Fonctionnalités

- 🔍 Recherche **Tous / Images / Vidéos / Actualités**, « Plus de résultats », suggestions de saisie, filtres (région, ouverture)
- 🧮 Réponses instantanées locales : calculatrice, conversions d'unités, date/heure
- ⚡ Raccourcis `!w`, `!yt`, `!maps`, `!gh`, `!amz`, `!lbc`, `!img`, `!actus`
- 🕵️ Confidentialité : aucune requête journalisée, `Referrer-Policy: no-referrer`, vignettes et favicons servies via un proxy
  (l'IP de l'utilisateur n'atteint jamais les sites tiers), liens de redirection des moteurs décodés, publicités retirées
- 🌙 Thème clair/sombre, PWA installable, OpenSearch (ajout comme moteur par défaut dans Chrome/Firefox/Safari)
- 🔁 Plusieurs **fournisseurs de résultats** avec bascule automatique :

| Fournisseur | Clé requise | Catégories | Remarque |
|---|---|---|---|
| `brave` | `BRAVE_API_KEY` ([gratuit 2000 req/mois](https://brave.com/search/api/)) | web, images, vidéos, actus | Index indépendant, meilleure qualité |
| `searxng` | `SEARXNG_URL` (inclus dans `docker-compose.yml`) | web, images, vidéos, actus | Métamoteur open-source auto-hébergé |
| `ddg` | aucune | web | DuckDuckGo lite |
| `bing` | aucune | web, images, vidéos, actus | Lecture directe, filtré anti-« leurres » |
| `openverse` | aucune | images | Images libres (Creative Commons), dernier recours |

## Démarrage rapide

```bash
cd qafila
npm install
cp .env.example .env     # facultatif : clé Brave, URL SearXNG…
npm start                # http://localhost:4000
npm test                 # tests de fumée (SMOKE_NETWORK=1 npm test pour tester une vraie recherche)
```

### Avec Docker (Qafila + SearXNG auto-hébergé)

```bash
docker compose up -d     # http://localhost:4000
```

Modifiez `searxng/settings.yml` (clé `secret_key`) avant une mise en production.

### Déploiement (Railway, Fly.io, Render…)

Le `Dockerfile` suffit. Variables utiles : `PORT`, `PROVIDERS`, `BRAVE_API_KEY`, `SEARXNG_URL`, `DEFAULT_LANG`.

## Navigateurs natifs iPhone et Android (dans l'esprit de Quiche)

Le dossier [`ios-browser/`](ios-browser/) contient **Qafila Browser**, un navigateur SwiftUI + WKWebView avec barre d'outils et menu
entièrement personnalisables, galerie de barres, onglets groupés par site, bloqueur, mode sombre pour tous les sites, JavaScript par site,
lecteur et temps de lecture. Compilation : `xcodegen generate` puis Xcode (voir son README). La version Android est dans [`android-browser/`](android-browser/) (Kotlin + Compose).

**Publication App Store / Google Play** : tout est décrit pas à pas dans [`DEPLOIEMENT_STORES.md`](DEPLOIEMENT_STORES.md)
(workflows GitHub Actions `Qafila iOS` et `Qafila Android`, fastlane, métadonnées, politique de confidentialité sur `/confidentialite`).

## Coque mobile Capacitor (iOS / Android)

La coque Capacitor affiche l'interface (`public/`) et ouvre les sites dans un navigateur intégré natif.

```bash
npm install --include=optional          # Capacitor + @capgo/inappbrowser
# Dans public/app.js, remplacer https://qafila.example.com par l'URL de votre instance déployée
npm run android                         # ou : npm run ios (macOS + Xcode requis)
```

## API

| Route | Description |
|---|---|
| `GET /api/search?q=…&type=web\|images\|videos\|news&page=1&lang=fr-FR` | Résultats normalisés `{ provider, results[], infobox, instant, suggestions }` |
| `GET /api/suggest?q=…` | Suggestions de saisie |
| `GET /api/img?u=…` | Proxy d'images (https, anti-SSRF, 5 Mo max) |
| `GET /api/fav?host=…` | Favicon d'un domaine, récupérée côté serveur (204 si absente) |
| `GET /api/status` | État des fournisseurs |
| `GET /opensearch.xml` | Descripteur OpenSearch |

## Architecture

```
server.js                 Express : routes, en-têtes de confidentialité, fichiers statiques
src/providers/*.js        Un module par source (search(), categories, available())
src/providers/index.js    Orchestrateur : ordre, bascule, cache, dédoublonnage, filtre anti-leurres
src/instant.js            Réponses instantanées (sans réseau)
src/imageProxy.js         Proxy d'images avec protection SSRF
public/                   Interface (HTML/CSS/JS sans framework, PWA)
```

## Limites connues

- Les sources sans clé (`ddg`, `bing`) peuvent limiter les requêtes depuis certaines IP de centres de données.
  Pour une mise en production, utilisez `brave` et/ou `searxng`.
- Pas de synchronisation entre appareils : l'historique, s'il est activé, reste local.
