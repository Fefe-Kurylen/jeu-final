# Imperium Antiquitas

Jeu de stratégie MMO mobile (iOS et Android) dans l'esprit de **Travian** et de **Rise of Kingdoms** : six factions antiques, villes en 2.5D isométrique, villes secondaires fondées par des colons, carte du monde, armées, raids, alliances, héros, expéditions et recherche.

- **API** : Node 20, Express, Prisma 5, PostgreSQL (`src/`)
- **Client** : vanilla JS + canvas, embarqué dans Capacitor (`frontend/`)
- **Graphismes** : pipeline 3D → sprites WebP (`tools/`), style peint (voir `docs/ART-PIPELINE.md`)

## Démarrer en local

```bash
docker compose up -d                      # PostgreSQL
npm install
cp .env.example .env                      # puis renseigner DATABASE_URL et JWT_SECRET (32+ caractères)
npx prisma generate
NODE_ENV=development node src/server.js   # applique les migrations puis écoute sur :3000
```

Servir `frontend/` avec n'importe quel serveur statique (`python3 -m http.server 8083` dans `frontend/`) et ouvrir `index.html` ; `window.API_SERVER` (dans `frontend/js/mobile.js`) pointe vers l'API.

## Tests

```bash
npm run test:unit    # moteur de combat, formules, validation (sans base)
npm run test:e2e     # partie complète jouée contre l'API locale
npm run test:smoke   # navigateur (Playwright), bureau et téléphone
```

## Documentation

- `docs/DEPLOIEMENT.md` : variables, migrations, boucle de jeu, limites, plateformes
- `docs/EQUILIBRAGE.md` : vérification de l'équilibrage (bonus de civilisation, unités, déplacements, courbes des bâtiments), réglages appliqués (coefficients de palier des unités) arbre de technologies (recherche à l'Académie, § 8), camps barbares (§ 9), villes secondaires (§ 10) et paliers de ville par Bâtiment principal (§ 11, `node tools/simulate-colonies.cjs`)
- `docs/APP-STORE.md` : publication sur les stores
- `docs/ART-PIPELINE.md`, `docs/PROMPTS-GRAPHIQUES.md`, `docs/LISTE-GRAPHISMES.md` (inventaire et état de chaque image, `node tools/liste-graphismes.cjs`) et `docs/GUIDE-COMPLEMENTS-ANIMATIONS.md` (compléments, animations) : production des graphismes
- `docs/GRAPHISMES-COMPLET.md` : **tout ce qu'il faut graphiquement**, famille par famille, avec l'état et l'ordre conseillé (`node tools/liste-graphismes.cjs`)
- `docs/GRAPHISMES-MANQUANTS.md` : chantiers par civilisation (avis historique), colons et villes secondaires, tribus, technologies, fiches : ce qui manque, où ça s'affiche, ordre conseillé
- `art/incoming/README.md` : déposer des images peintes à intégrer

## Principes du serveur

- Toute dépense est **conditionnelle** en SQL (`WHERE stock >= coût`) et tout changement d'état part de l'état attendu : jamais de ressources négatives, jamais de double envoi.
- Les combats sont résolus **sous verrou de la ville** attaquée ; une arrivée n'est jamais résolue deux fois.
- La production suit le **temps réel** écoulé entre deux ticks ; les files échues sont réglées à la lecture.
- Le schéma évolue par **migrations versionnées** appliquées au démarrage.
