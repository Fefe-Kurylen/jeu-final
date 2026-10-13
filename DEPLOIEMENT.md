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
| `AUTO_DB_PUSH` | `false` pour désactiver la synchronisation du schéma au démarrage (migrations gérées à part) |
| `CLUSTER_WORKERS` | `auto` ou un nombre pour lancer plusieurs workers HTTP (un seul exécute la boucle de jeu) |
| `DB_POOL` | taille du pool Prisma (10 par défaut) |

Au démarrage le serveur : synchronise le schéma (`prisma db push`), répare les données (emplacement du Bâtiment principal, vitesse de régénération des points de ressource, PV des murs), génère les points de ressource si la table est vide, puis lance la boucle de jeu (tick toutes les 30 s). `/api/health` répond `503` tant que ce n'est pas terminé, `200` ensuite : les plates-formes attendent ce `200` avant de router le trafic.

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
- Réinitialiser la base (destructif) : `npx prisma db push --force-reset`.
- Simulation d'équilibrage (2 ans de jeu en ~8 min) : `DATABASE_URL=... node simulate-2years.js` sur une base dédiée (elle est vidée au départ).
