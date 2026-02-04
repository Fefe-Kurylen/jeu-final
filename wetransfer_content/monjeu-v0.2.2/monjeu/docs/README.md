# MonJeu Alpha (backend NestJS + Prisma + Redis/Postgres)

Ce dépôt contient une alpha côté serveur (REST + Workers tick 30s) conforme au GDD verrouillé dans la conversation.

## Prérequis
- Node.js 18+ (ou 20+)
- Docker (pour Postgres + Redis)

## Démarrage rapide
1) Copier `.env.example` -> `.env` et ajuster si besoin.
2) Lancer Postgres + Redis :
```bash
docker compose up -d
```
3) Installer les dépendances :
```bash
npm install
```
4) Générer Prisma + migrer + seed :
```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```
5) Lancer l’API et les workers (2 terminaux) :
```bash
npm run dev:api
npm run dev:workers
```

## Endpoints principaux
- POST /auth/register { email, password, name, faction }
- POST /auth/login { email, password }
- POST /player/bootstrap  (crée capitale, héros, armée 1)
- GET  /map/viewport?x=&y=&zoom=
- POST /city/:id/build/start { slot:1|2, buildingKey }
- POST /city/:id/recruit { unitKey, count, buildingKey }
- POST /army/move { armyId, x, y }
- POST /army/attack { armyId, x, y }
- POST /army/raid { armyId, x, y }
- POST /army/spy { armyId, x, y, targetType:"CITY"|"RESOURCE" }
- GET  /reports/battles

## Notes
- Alpha volontairement minimaliste côté “front” (pas d’UI incluse).
- Tu peux tester avec Postman/Insomnia.
