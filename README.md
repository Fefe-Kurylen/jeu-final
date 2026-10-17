# Imperium Antiquitas

Jeu de stratégie MMO mobile (iOS et Android) dans l'esprit de **Travian** et de **Rise of Kingdoms** : six factions antiques, villes en 2.5D isométrique, carte du monde, armées, raids, alliances, héros et expéditions.

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
- `docs/APP-STORE.md` : publication sur les stores
- `docs/ART-PIPELINE.md` et `docs/PROMPTS-GRAPHIQUES.md` : production des graphismes
- `art/incoming/README.md` : déposer des images peintes à intégrer

## Principes du serveur

- Toute dépense est **conditionnelle** en SQL (`WHERE stock >= coût`) et tout changement d'état part de l'état attendu : jamais de ressources négatives, jamais de double envoi.
- Les combats sont résolus **sous verrou de la ville** attaquée ; une arrivée n'est jamais résolue deux fois.
- La production suit le **temps réel** écoulé entre deux ticks ; les files échues sont réglées à la lecture.
- Le schéma évolue par **migrations versionnées** appliquées au démarrage.
