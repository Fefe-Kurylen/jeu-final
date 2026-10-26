# Imperium Antiquitas - Guide de déploiement

Le dépôt contient deux choses :

- **l'API** (`src/`, Node 20 + Express + Prisma/PostgreSQL) : c'est elle que l'on déploie sur Render, Fly.io ou Docker ;
- **l'application mobile** (`frontend/` empaqueté par Capacitor dans `android/` et `ios/`) : elle se construit sur votre poste et parle à l'API via `window.API_SERVER` (`frontend/js/mobile.js`).

Le serveur ne sert pas le frontend : `https://<api>/` répond 404, seul `/api/...` existe.

## 1. Variables d'environnement

| Variable | Rôle |
|---|---|
| `DATABASE_URL` | URL PostgreSQL (obligatoire) |
| `JWT_SECRET` | clé de signature des sessions, longue et aléatoire (obligatoire en production) |
| `NODE_ENV` | `production` |
| `PORT` | port d'écoute (3000 par défaut ; Fly impose 8080, Render fournit le sien) |
| `DB_SYNC` | `migrate` (défaut : applique les migrations de `prisma/migrations`), `none` (migrations gérées à part), `push` (prototypage local) |
| `WORLD_SEED` | facultative, **base vide seulement** : graine de la carte du nouveau monde (0 = carte de référence, jusqu'à 2147483646) ; vide = tirée au hasard ; ignorée dès que le monde a sa carte (voir `docs/DEPLOIEMENT.md`, « Carte du serveur ») |
| `CLUSTER_WORKERS` | `auto` ou un nombre pour lancer plusieurs workers HTTP (un seul exécute la boucle de jeu) |
| `DB_POOL` | taille du pool Prisma (10 par défaut) |

Au démarrage le serveur : applique les migrations, charge la graine de la carte (un serveur neuf tire la sienne au hasard, ligne `[MONDE]` du journal), répare les données (emplacement du Bâtiment principal, vitesse de régénération des points de ressource, PV des murs), génère les points de ressource si la table est vide, puis lance la boucle de jeu (tick toutes les 30 s). `/api/health` répond `503` tant que ce n'est pas terminé, `200` ensuite : les plates-formes attendent ce `200` avant de router le trafic.

## 2. Render.com (fichier `render.yaml`)

1. Dashboard → **New +** → **Blueprint** → choisir le dépôt : la base `imperium-db` et le service `imperium-antiquitas-api` sont créés d'après `render.yaml`.
2. `JWT_SECRET` est généré automatiquement, `DATABASE_URL` est câblée sur la base.
3. L'API est disponible sur `https://imperium-antiquitas-api.onrender.com` (adapter `frontend/js/mobile.js` si le nom diffère).

Limites du plan gratuit : le service s'endort après 15 min d'inactivité (**la boucle de jeu s'arrête avec lui**) et la base expire après 90 jours. Pour un monde ouvert à de vrais joueurs, passer le service en plan `starter` (et la base en plan payant).

## 3. Fly.io (fichier `fly.toml`)

```bash
fly launch --no-deploy            # reprend fly.toml
fly postgres create               # ou une base externe
fly secrets set DATABASE_URL='postgres://...' JWT_SECRET="$(openssl rand -hex 32)"
fly deploy
```

`fly.toml` fixe `PORT=8080`, garde une machine allumée en permanence (`min_machines_running = 1`, pas d'arrêt automatique) et surveille `/api/health`.

## 4. Docker

```bash
docker build -t imperium-api .
docker run -e DATABASE_URL=... -e JWT_SECRET=... -e NODE_ENV=production -p 3000:3000 imperium-api
```

`docker-compose.yml` ne lance que PostgreSQL pour le développement local :

```bash
docker-compose up -d
npm install
npx prisma generate
DATABASE_URL=postgresql://monjeu:monjeu123@localhost:5432/monjeu node src/server.js
```

## 5. Application mobile

```bash
npm install                       # installe aussi les outils Capacitor (devDependencies)
# Mettre l'URL de l'API dans frontend/js/mobile.js (window.API_SERVER)
npx cap sync
npx cap open android              # ou: npx cap open ios
```

Les icônes et écrans de lancement sont générés depuis `tools/build-assets.cjs` (voir `frontend/assets/`). Incrémenter `versionCode` (`android/app/build.gradle`) et `CURRENT_PROJECT_VERSION` (`ios/App/App.xcodeproj`) à chaque envoi sur les stores.

## 6. Commandes utiles

- Logs Render : Dashboard → service → **Logs** ; Fly : `fly logs`.
- Réinitialiser la base (destructif) : **arrêter l'API**, `npx prisma migrate reset --force`, puis redémarrer : le serveur tire une **nouvelle carte** (ou prend `WORLD_SEED`) ; vérifier la ligne `[MONDE] nouvelle carte` du journal.
- Simulation d'équilibrage (2 ans de jeu en ~8 min) : `DATABASE_URL=... node simulate-2years.js` sur une base dédiée (elle est vidée au départ).

## 7. VPS avec HTTPS (Docker + Caddy)

Sur un VPS Debian/Ubuntu avec un nom de domaine pointant dessus (`api.votre-domaine.fr`) :

```bash
apt install -y docker.io docker-compose-plugin
git clone <dépôt> && cd jeu-final
cat > docker-compose.prod.yml <<'YAML'
services:
  db:
    image: postgres:16
    environment: { POSTGRES_USER: imperium, POSTGRES_PASSWORD: change-moi, POSTGRES_DB: imperium }
    volumes: [ "pgdata:/var/lib/postgresql/data" ]
  api:
    build: .
    environment:
      DATABASE_URL: postgresql://imperium:change-moi@db:5432/imperium
      JWT_SECRET: "<openssl rand -hex 32>"
      NODE_ENV: production
      PORT: "3000"
    depends_on: [ db ]
  caddy:
    image: caddy:2
    ports: [ "80:80", "443:443" ]
    command: caddy reverse-proxy --from api.votre-domaine.fr --to api:3000
    volumes: [ "caddy:/data" ]
volumes: { pgdata: {}, caddy: {} }
YAML
docker compose -f docker-compose.prod.yml up -d
```

Caddy obtient et renouvelle le certificat HTTPS automatiquement. Mettre `https://api.votre-domaine.fr` dans
`frontend/js/mobile.js` (`window.API_SERVER`) et dans `capacitor.config.ts` (`allowNavigation`).

## 8. Variables pour les fonctions natives

| Variable | Rôle |
|---|---|
| `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_PRIVATE_KEY`, `APNS_BUNDLE_ID`, `APNS_PRODUCTION` | notifications push iOS (clé .p8 Apple) |
| `FCM_SERVICE_ACCOUNT` | notifications push Android (JSON du compte de service Firebase, sur une ligne) |
| `REVENUECAT_SECRET_KEY` | vérification des achats côté serveur (clé secrète RevenueCat) |
| `REVENUECAT_WEBHOOK_AUTH` | valeur attendue dans l'en-tête Authorization du webhook RevenueCat |
| `ADMIN_KEY` | accès à `GET /api/analytics/funnel` et à la modération de la messagerie (`/api/chat/admin/reports`) |
| `DEEPL_API_KEY` | traduction automatique des messages (clé DeepL ; une clé gratuite finit par `:fx`) |
| `TRANSLATE_PROVIDER` | `deepl` (défaut si la clé est donnée), `log` (tests), `none` |

Sans ces variables, l'API fonctionne normalement : notifications, achats et traduction sont simplement désactivés.
Voir `docs/APP-STORE.md` pour la mise en place pas à pas.
