# Audit du socle (octobre 2026)

Relecture complète de la base du jeu (API, boucle de jeu, schéma, client, déploiement) par trois relecteurs indépendants plus une lecture directe, puis correction de tout ce qui touche à la solidité. Ce document garde la trace de ce qui a été trouvé, de ce qui a été changé et de ce qui reste volontairement en l'état.

## Verdict d'ensemble

L'architecture est saine et n'avait pas à être refaite : API Express fine, logique de jeu dans un tick unique protégé par un bail en base, dépenses conditionnelles en SQL, client canvas optimisé (scène statique rasterisée, couche animée séparée). Les faiblesses étaient des **détails de robustesse** (concurrence, idempotence, dérive du schéma, session) et deux **bugs bloquants côté client**. Tout ce qui suit a été corrigé sauf mention contraire.

## Ce qui a été corrigé

### Sécurité
- Gel complet de l'API par un simple compte (`cleanText` quadratique sur un texte de 190 ko) : longueur bornée à 512 caractères avant toute expression régulière.
- Secret des jetons : obligatoire et ≥ 32 caractères quel que soit `NODE_ENV` (le serveur refuse de démarrer sinon). Seul `NODE_ENV=development` tolère un secret de développement.
- Connexion : entrées typées (plus de 500 sur un e-mail numérique), verrouillage de l'e-mail 15 min après 10 échecs (réponse identique que le compte existe ou non), inscriptions limitées à 10/min par IP, pseudo unique sans distinction de casse, mot de passe ≥ 8.
- Jetons : version de jeton par compte (`Account.tokenVersion`) ; changement de mot de passe (`POST /api/auth/password`) qui révoque toutes les autres sessions ; le middleware vérifie que le joueur existe encore (cache 60 s), donc un compte supprimé n'a plus aucun accès.
- Comparaisons de secrets (webhook RevenueCat, clé admin) à temps constant ; limite dédiée sur la route admin ; `credentials: false` dans CORS (jetons Bearer uniquement) ; image Docker non root.
- Suppression de compte : le pseudo disparaît aussi des rapports des autres joueurs ; tout ce que le joueur possède part par cascade de base.

### Intégrité des données et concurrence
- Combats (attaque et raid) résolus **dans une transaction sous verrou de la ville cible**, défenseurs relus dedans : un transfert d'unités pendant l'arrivée ne peut plus ressusciter des soldats.
- Arrivées **réclamées** (`Army.claimedAt`) : une résolution ne peut pas être rejouée ; une résolution interrompue est détectée et l'armée rentre.
- Bail du tick renouvelé entre chaque étape ; un bail perdu interrompt le tick.
- Fin de construction atomique sous verrou, jamais de suppression d'item sur erreur, un niveau ne redescend jamais ; expéditions et soins idempotents (claim conditionnel) ; recrutement consommé avant d'être crédité.
- Points de ressource : un seul récolteur par point (flag pris conditionnellement), prélèvement SQL qui ne passe jamais sous zéro, raid refusé sur un point sans défenseurs ou déjà occupé, butin de tribu chargé dans l'armée (plus de téléportation dans la ville).
- Raid : cooldown de 24 h revérifié à l'arrivée et comptage des raids en vol (plusieurs armées lancées ensemble ne pillent qu'une fois).
- Marché : bâtiment Marché requis, ratio borné 1:3, 10 offres actives, verrous pris dans un ordre fixe (plus d'interblocage possible), refus quand l'entrepôt ne peut pas recevoir, échange PNJ qui ne fait jamais payer ce qui serait détruit.
- Famine limitée aux armées à l'arrêt en ville ; PV de mur fractionnaires (régénération réellement en 24 h).
- Temps de jeu : chaque tick applique le **temps réellement écoulé** (horloge de la base, plafond 6 h) ; files échues réglées à la lecture.

### Schéma et déploiement
- Migrations Prisma versionnées (`0001_init` = ancien schéma, `0002_hardening` = durcissement) appliquées au démarrage, avec baseline automatique d'une base créée par `db push` et tolérance à une base déjà partiellement modifiée.
- Cascades `ON DELETE` sur tout ce qu'un joueur possède ; colonnes mortes retirées (`Army.playerId/arrivesAt/returnsAt/mission/harvestStartedAt`, `Hero.ownerId/freePoints`, `CityBuilding.category/prodPerHour`, `BattleReport.attackerLost/defenderLost`, `MarketOffer.playerId`, `Expedition.ownerId/rewards`, `SpyReport.ownerId`, `AllianceMember.ownerId`) ; index manquants ajoutés.
- Démarrage asynchrone (le `/api/health` répond pendant la synchronisation), arrêt propre (`server.close`, relais du signal aux workers en cluster), health en cache.
- `.env.example`, `docs/DEPLOIEMENT.md`, README à jour.

### Performance
- Récolte en **une seule instruction SQL** pour toutes les armées (au lieu de 3 requêtes par armée et par tick).
- Population recalculée à la fin d'une construction et toutes les 10 min (au lieu d'un agrégat complet toutes les 30 s).
- Expéditions générées seulement pour les joueurs vus dans les 7 derniers jours ; purge des événements analytics à 90 jours.
- Client : terrain de la carte mémoïsé (il était recalculé pour chaque tuile à chaque image), rayon de chargement borné, minimap qui ne charge qu'au relâchement, rechargement après pincement, ancre du zoom molette juste sur écrans Retina.

### Client
- Deux bugs bloquants : la composition d'armée plantait (`u.unitKey`), le panneau du Domus du héros ne s'ouvrait jamais.
- Verrou d'action qui restait bloqué sur un nombre négatif.
- Session : enveloppe unique autour de `fetch` pour l'API (délai 20 s, 401 → une déconnexion propre avec message, 429 → message, deux envois identiques simultanés partagent la même requête) ; `showGame` s'arrête dès que la session est refusée ; `logout` arrête aussi les minuteries de la carte et la session RevenueCat.
- RevenueCat suit le joueur connecté (appareil partagé), `allowNavigation` réduit à l'hôte de l'API, pages légales qui n'affichent pas une 404, toast au-dessus de la barre d'onglets.
- Analyse statique du client (`npm run lint`) : tous les identifiants doivent exister dans la portée partagée ; c'est ce qui aurait attrapé le bug de composition.

### Tests
- `tests/unit` (node:test) : moteur de combat, formules, validation, tribus. `tests/api-e2e.mjs` : partie complète (plus de 150 vérifications dont concurrence). `tests/compliance-e2e.mjs` : analytics, achats, push, suppression de compte, mot de passe. `tests/browser-smoke.cjs` : navigateur bureau et téléphone. CI GitHub Actions avec Postgres.

## Ce qui a été volontairement laissé en l'état

- **Compteurs en mémoire** (limites de débit, verrouillage de connexion) : par processus. Suffisant pour une machine ; à porter dans Postgres ou le reverse proxy si l'API tourne sur plusieurs machines.
- **Pas de vérification d'e-mail ni de réinitialisation de mot de passe** : à ajouter avant l'ouverture publique (nécessite un envoi d'e-mails).
- **Courbes de coût/temps** : le serveur utilise `coût L1 × 1,28^(n−1)` et ignore les colonnes `costL20/timeL20Sec` des données ; c'est un choix d'équilibrage à trancher, pas un bug.
- **Effets de bâtiments non implémentés** mais présents dans les données (Chambre au Trésor, réductions de temps du Bâtiment principal, Tour de guet, colons, etc.) : à implémenter ou à retirer de l'interface, feature par feature.
- **Espionnage sans contre-mesure, pas de renfort allié** : règles de jeu à concevoir.
- **Blessés de l'attaquant** soignables à distance : règle à décider.
- **`bcryptjs`** (JavaScript pur) : coût CPU visible sous forte charge de connexions ; `bcrypt` natif ou argon2 si besoin.

## Comment vérifier

```bash
npm run lint && npm run test:unit            # sans base
node src/server.js &                         # avec DATABASE_URL et JWT_SECRET
npm run test:e2e                             # partie complète
NODE_PATH=/opt/node-tools/node_modules npm run test:smoke
```
