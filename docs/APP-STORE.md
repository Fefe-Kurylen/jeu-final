# Imperium Antiquitas — Publication sur l'App Store (et Google Play)

Ce document suit le plan de publication phase par phase : ce qui est **déjà en place dans le code**, ce
qui reste à faire **dans les consoles** (App Store Connect, RevenueCat, Apple Developer) et les réponses
préparées pour les questionnaires. Les points marqués 🔧 demandent une action de ta part.

## Phase 1 — Technique

| Point du plan | État |
|---|---|
| Jeu web → Capacitor | ✅ `capacitor.config.ts`, projets `ios/` et `android/`, plugins App, Haptics, Keyboard, Network, SplashScreen, StatusBar, **PushNotifications**, **RevenueCat (purchases-capacitor)** |
| Backend sur un vrai serveur avec HTTPS | ✅ `DEPLOIEMENT.md` : Render, Fly.io, Docker, et section VPS (Docker + Caddy, HTTPS automatique) |
| Vraies fonctions natives (piège n°1) | ✅ notifications push (attaque en approche, bataille, construction terminée), achats intégrés, haptique, barre d'état, clavier, interface mobile (barre de navigation basse, rendu haute densité) |
| Interface pensée mobile | ✅ navigation basse (10 onglets qui tiennent sur 360 px, sélecteur de ville dans la barre des files), rendu au devicePixelRatio, scène de ville isométrique avec gestes (déplacement, pincement, double tap), icônes peintes, polices embarquées (aucun appel réseau au lancement), écrans verrouillés en **portrait** (iOS et Android), bouton Retour Android (ferme le panneau, revient au village, puis « appuyez encore pour quitter »), dialogues de confirmation dans le style du jeu, haptique sur succès/erreur |
| Audit mobile (octobre 2026) | ✅ mesuré à 360/375/390 px : barre d'onglets et en-tête tiennent sans débordement, onglets défilables, inscription utilisable clavier ouvert, cibles ≥ 44 px, rendu groupé pendant les gestes, charge utile de /api/player/me réduite |

## Phase 2 — Compte Apple 🔧

1. Compte Apple Developer (99 $/an), accepter les contrats **Paid Apps** dans App Store Connect (sinon pas d'achats ni de ventes).
2. Créer l'app dans App Store Connect avec le bundle `com.imperiumantiquitas.app` (voir `capacitor.config.ts`).
3. Clé APNs (Certificates, Identifiers & Profiles → Keys → Apple Push Notifications service) : noter **Key ID**, **Team ID**, télécharger le `.p8`.
4. Activer la capacité **Push Notifications** sur l'App ID puis dans Xcode (Signing & Capabilities). Xcode crée `App.entitlements` avec `aps-environment`.
5. Variables serveur : `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY` (contenu du .p8, retours à la ligne en `\n`), `APNS_BUNDLE_ID`, `APNS_PRODUCTION=true` en production.

## Phase 3 — Monétisation

| Point du plan | État |
|---|---|
| Achats intégrés Apple (StoreKit) | ✅ via le plugin RevenueCat (`frontend/js/store.js`) : achat, prix réels du store, restauration |
| Abonnement « Plus » + essai gratuit | ✅ produit `imperium.plus.monthly` dans `data/products.json` ; 🔧 à créer dans App Store Connect (abonnement auto-renouvelable, groupe « Imperium Plus », essai 7 jours) et à relier à l'entitlement `plus` dans RevenueCat |
| Chaque cosmétique comme produit | ✅ `imperium.cosmetic.golden_banner`, `crimson_banner`, `lanterns` (non consommables) ; 🔧 à créer dans App Store Connect et dans l'offering RevenueCat |
| Vérification côté serveur (anti-triche) | ✅ le serveur n'accorde rien sur la parole du client : `POST /api/purchases/sync` interroge l'API RevenueCat avec la **clé secrète** et met à jour `premiumUntil` / `cosmetics` ; webhook `POST /api/purchases/webhook` pour les renouvellements et remboursements |
| Avantages Plus | ✅ +1 construction en file, +5 % de production (`config.purchases.perks`), bandeau doré ; cosmétiques exposés dans `/api/player/me` |

Configuration 🔧 :
- RevenueCat : créer le projet, ajouter l'app iOS (clé **App Store Connect API** + shared secret) et Android ; produits, entitlement `plus`, offering `default` contenant les 4 produits.
- Clés : `window.REVENUECAT_APPLE_KEY` / `window.REVENUECAT_GOOGLE_KEY` à définir dans `frontend/js/mobile.js` (clés *publiques* SDK) ; serveur : `REVENUECAT_SECRET_KEY` (clé *secrète*), `REVENUECAT_WEBHOOK_AUTH` (valeur de l'en-tête Authorization configurée dans le webhook RevenueCat → `https://<api>/api/purchases/webhook`).
- Sans ces clés, la boutique est en lecture seule et `sync` répond 503 : rien n'est accordé.

## Phase 4 — Obligations Apple

| Obligation | État |
|---|---|
| Politique de confidentialité en ligne (URL) | ✅ `https://<api>/privacy` (fichier `src/public/privacy.html`, aussi embarqué dans l'app). 🔧 remplacer `[NOM DE L'ÉDITEUR]`, `[EMAIL DE CONTACT]`, l'hébergeur |
| URL d'assistance | ✅ `https://<api>/support` |
| Suppression de compte dans l'app | ✅ Paramètres → Supprimer mon compte (mot de passe, double confirmation) → `DELETE /api/auth/account` : suppression transactionnelle de tout (villes, armées, héros, rapports, offres, expéditions, jetons, achats), passation de la direction d'alliance, rapports des autres joueurs anonymisés, e-mail réutilisable |
| « Se connecter avec Apple » | Non requis : seule la connexion e-mail/mot de passe est proposée (pas de Google/Facebook). À ajouter si un login tiers est introduit |
| Questionnaire de classification d'âge | Réponses préparées ci-dessous |
| Fiche « confidentialité » (App Privacy) | Réponses préparées ci-dessous |
| Bouton « Restaurer les achats » | ✅ dans la boutique et dans Paramètres |

### Réponses au questionnaire de classification d'âge (App Store Connect)
- Violence de dessin animé ou fantastique : **peu fréquente / modérée** (batailles d'armées stylisées, sans sang).
- Violence réaliste, contenu sexuel, nudité, grossièretés, horreur, drogues/alcool/tabac : **aucun** (la brasserie gauloise est un bâtiment décoratif).
- Jeux d'argent simulés, concours : **non**. Accès web non restreint : **non**.
- Achats intégrés : **oui**. Interactions entre utilisateurs (alliances, classement, pseudonymes) : **oui** → classification attendue **12+** (« Violence de dessin animé ou fantastique peu fréquente/modérée », interactions sociales).

### Fiche App Privacy (données collectées)
| Catégorie Apple | Donnée | Liée à l'identité | Suivi | Usage |
|---|---|---|---|---|
| Contact Info | Adresse e-mail | Oui | Non | Fonctionnalité de l'app (compte) |
| User Content | Pseudonyme, contenu de jeu | Oui | Non | Fonctionnalité de l'app |
| Identifiers | Identifiant utilisateur (id joueur) | Oui | Non | Fonctionnalité, achats (RevenueCat) |
| Purchases | Historique d'achats | Oui | Non | Fonctionnalité de l'app |
| Usage Data | Interactions produit (événements d'entonnoir internes) | Oui | Non | Analyses (internes, aucun tiers) |
| Diagnostics | Journaux techniques | Non | Non | Fonctionnement |
Pas de données de localisation, contacts, santé, photos, ni de publicité. **Aucun suivi** (pas d'ATT).

## Phase 5 — Tests

| Point du plan | État |
|---|---|
| TestFlight bêta privée | 🔧 archive Xcode → App Store Connect → TestFlight (testeurs internes immédiatement, externes après revue bêta) |
| Corriger crashs, équilibre, lag serveur | ✅ 138 tests API, simulation de 2 ans, captures automatisées ; 🔧 observer `GET /api/analytics/funnel` (en-tête `x-admin-key: $ADMIN_KEY`) et les logs |
| Achats en mode sandbox | 🔧 compte Sandbox Tester dans App Store Connect, achat dans la build TestFlight, vérifier `Paramètres → Restaurer` et `premiumUntil` dans `/api/purchases/me` |
| Analytics « où les joueurs abandonnent » | ✅ interne, sans SDK tiers : `app_open`, `register_success`, `login_success`, `tab_view`, `first_build`, `first_recruit`, `first_army_send`, `account_deleted` → `GET /api/analytics/funnel?days=7` |

## Phase 6 — Publication

| Point du plan | État |
|---|---|
| Fiche store : icône, 5-10 captures, vidéo 30 s, description, mots-clés | ✅ icône 1024 (`frontend/assets/images/icon-1024.png`), captures générées par `node tools/store-screenshots.cjs` (iPhone 6,7" 1290×2796 et 6,5" 1242×2688, iPad 12,9" 2048×2732 car l'app cible aussi l'iPad), textes ci-dessous ; 🔧 vidéo d'aperçu (enregistrer le simulateur, 15-30 s, format 886×1920 ou 1080×1920) |
| Soumettre à la review | 🔧 build archivée + fiche complète + compte de test pour la review (Notes for Review : e-mail/mot de passe d'un compte avec une ville développée) |
| Si refus → corriger et resoumettre | — |
| Date de sortie avec serveur neuf | 🔧 `npx prisma migrate reset --force` sur la base de production juste avant l'ouverture, puis redémarrer l'API : le monde se régénère sur une **nouvelle carte tirée au hasard** (ou celle de `WORLD_SEED`, choisie avec `node tools/apercu-carte.cjs --random=4`) ; voir `docs/DEPLOIEMENT.md`, « Carte du serveur » |

### Textes de fiche (brouillon)
- **Nom** : Imperium Antiquitas
- **Sous-titre** : Stratégie antique en ligne
- **Mots-clés** : stratégie, empire, antiquité, rome, guerre, mmo, alliance, cité, conquête, bataille
- **Description** : Bâtissez votre cité, levez vos armées et conquérez le monde antique. Choisissez votre civilisation (Rome, Gaule, Grèce, Égypte, Huns, Sultanat), développez vos champs et vos bâtiments, recrutez infanterie, archers, cavalerie et engins de siège, puis affrontez les autres joueurs sur une carte vivante aux trois biomes. Nouez des alliances, espionnez vos rivaux, envoyez votre héros en expédition et grimpez au classement. Chaque civilisation a son architecture et ses troupes. Abonnement Imperium Plus facultatif : une file de construction supplémentaire et un bonus de production.
- **Nouveautés (1.0)** : Première version.

## Phase 7 — Publicité YouTube 🔧
- 2-3 vidéos courtes (15-30 s) : vue ville qui évolue, bataille (rapport animé), carte avec les trois biomes. Capturer depuis le simulateur iOS en 1080×1920.
- Google Ads : campagne « App » (objectif installations), ciblage France/Belgique/Suisse/Québec, budget test 5-10 €/jour pendant 2 semaines, puis arbitrer avec `analytics/funnel` (coût par inscription, part des joueurs qui font une première construction).

## Google Play (en plus)
- Google Play Console (25 $ une fois), `android/` prêt ; notifications via Firebase Cloud Messaging : 🔧 projet Firebase, `google-services.json` dans `android/app/`, compte de service JSON dans `FCM_SERVICE_ACCOUNT` côté serveur.
- Achats : produits identiques dans Google Play Console, reliés dans RevenueCat (`REVENUECAT_GOOGLE_KEY`).
- Même politique de confidentialité, suppression de compte in-app (exigence Google aussi), questionnaire « Sécurité des données ».
