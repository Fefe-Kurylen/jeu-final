# 🏰 MonJeu - MMO Stratégie Style Travian

**Version:** 0.2.1-FINAL  
**Date:** 1er Février 2026  
**Stack:** NestJS + Prisma + PostgreSQL + Redis + TypeScript

---

## 📋 Description

Jeu de stratégie massivement multijoueur inspiré de Travian avec :
- 🏛️ Gestion de villes et bâtiments
- ⚔️ Système de combat tactique (ratio 1.8)
- 🌍 Carte du monde avec ressources
- 🤝 Système d'alliances complet
- 🏪 Marché P2P et serveur
- 🧭 Expéditions PvE
- 📋 Système de quêtes
- ✉️ Messages privés
- 🦸 Héros avec équipement

---

## 🚀 Installation

### Prérequis
- Node.js 18+
- Docker (pour PostgreSQL + Redis)

### Démarrage rapide

```bash
# 1. Extraire et accéder au projet
unzip monjeu-v0.2.1-FINAL.zip
cd monjeu

# 2. Installer les dépendances
npm install

# 3. Lancer PostgreSQL + Redis
docker compose up -d

# 4. Configurer la base de données
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed

# 5. Lancer l'API (Terminal 1)
npm run dev:api

# 6. Lancer les Workers (Terminal 2)
npm run dev:workers
```

### Accès
- **Frontend:** http://localhost:3000
- **API:** http://localhost:3000/api

---

## 🎮 Fonctionnalités Implémentées

### ✅ Système de Base
| Fonctionnalité | État | Description |
|----------------|------|-------------|
| Authentification | ✅ | JWT, register, login, password reset |
| Joueurs | ✅ | 6 factions, bootstrap capital |
| Villes | ✅ | Construction 18 bâtiments, files d'attente |
| Ressources | ✅ | Production bois/pierre/fer/nourriture |
| Armées | ✅ | 60 unités, mouvement, combat |
| Carte | ✅ | 200x200 tiles, terrains, nœuds ressources |

### ✅ Combat & Militaire
| Fonctionnalité | État | Description |
|----------------|------|-------------|
| Combat | ✅ | Ratio 1.8, triangle tactique |
| Siège | ✅ | Dégâts aux murs, malus nourriture |
| Raid | ✅ | Pillage ressources |
| Espionnage | ✅ | Vision 100 cases |
| Blessés | ✅ | 35% survie, soins |
| Héros | ✅ | Stats, XP, équipement |

### ✅ Social & Commerce
| Fonctionnalité | État | Description |
|----------------|------|-------------|
| Alliances | ✅ | Création, rôles, diplomatie, chat |
| Bastion | ✅ | Contributions, garnison, bonus |
| Marché P2P | ✅ | Offres entre joueurs |
| Marché Serveur | ✅ | Échange instantané avec taxe |
| Routes Auto | ✅ | Transfert automatique entre villes |
| Messages | ✅ | Boîte de réception, envoi, réponse |

### ✅ PvE & Progression
| Fonctionnalité | État | Description |
|----------------|------|-------------|
| Expéditions | ✅ | 4 difficultés, loot, XP |
| Quêtes | ✅ | Quotidiennes et succès |
| Inventaire | ✅ | Items, équipement héros |
| Rapports | ✅ | Batailles, espionnage |

---

## 🏛️ Bâtiments (18)

| Bâtiment | Type | Effet Principal |
|----------|------|-----------------|
| MAIN_HALL | Base | Débloque niveaux bâtiments |
| RALLY_POINT | Inter | Nombre d'armées max |
| BARRACKS | Inter | Recrutement infanterie |
| STABLE | Inter | Recrutement cavalerie |
| WORKSHOP | Inter | Recrutement siège |
| ACADEMY | Inter | Réduction temps recherche |
| FORGE | Inter | Bonus défense global |
| MARKET | Avancé | Commerce, réduction taxes |
| FARM | Base | Production nourriture |
| LUMBER | Base | Production bois |
| QUARRY | Base | Production pierre |
| IRON_MINE | Base | Production fer |
| SILO | Base | Stockage nourriture |
| WAREHOUSE | Base | Stockage ressources |
| HIDEOUT | Inter | Protection ressources |
| HEALING_TENT | Inter | Soins blessés |
| WALL | Avancé | Bonus défense ville |
| MOAT | Avancé | Bonus défense supplémentaire |

---

## ⚔️ Unités (60)

### 6 Factions
- **ROME** - Infanterie lourde, défense
- **GAUL** - Cavalerie rapide, raid
- **GREEK** - Hoplites, formation
- **EGYPT** - Archers, chars
- **HUN** - Cavalerie légère, vitesse
- **SULTAN** - Équilibre, siège

### Types par Faction
| Classe | Base | Intermédiaire | Élite | Siège |
|--------|------|---------------|-------|-------|
| Infanterie | ✅ | ✅ | ✅ | - |
| Archer | ✅ | ✅ | ✅ | - |
| Cavalerie | ✅ | ✅ | ✅ | - |
| Siège | - | - | - | ✅ |

### Ratio Combat
- **BASE vs BASE:** 1:1
- **INTER vs INTER:** 1:1
- **ELITE vs ELITE:** 1:1
- **BASE vs INTER:** 1.1:1 (INTER gagne)
- **INTER vs ELITE:** 1.1:1 (ELITE gagne)
- **BASE vs ELITE:** ~1.8:1 (ELITE domine)

---

## 📡 API Endpoints (13 Contrôleurs)

### Auth
```
POST /auth/register     # Inscription
POST /auth/login        # Connexion
GET  /auth/me           # Profil actuel
```

### Player
```
POST /player/bootstrap  # Créer capitale + héros
GET  /player/me         # Infos joueur
GET  /player/cities     # Liste des villes
```

### City
```
GET  /city/:id              # Détails ville
POST /city/:id/build/start  # Lancer construction
POST /city/:id/recruit      # Recruter unités
```

### Army
```
GET  /army/list         # Liste des armées
POST /army/move         # Déplacer armée
POST /army/attack       # Attaquer
POST /army/raid         # Raid (pillage)
POST /army/spy          # Espionner
```

### Map
```
GET  /map/viewport      # Tuiles dans zone
GET  /map/tile/:x/:y    # Détails d'une tuile
```

### Alliance
```
POST /alliance/create       # Créer alliance
GET  /alliance/:id          # Infos alliance
POST /alliance/:id/invite   # Inviter joueur
POST /alliance/:id/diplomacy # Changer diplomatie
GET  /alliance/:id/messages # Chat alliance
```

### Bastion
```
POST /bastion/initiate      # Initier construction
POST /bastion/contribute    # Contribuer ressources
POST /bastion/garrison      # Envoyer garnison
GET  /bastion/leaderboard   # Classement
```

### Market
```
GET  /market/offers         # Liste offres
POST /market/offer          # Créer offre
POST /market/server/exchange # Échange serveur
GET  /market/routes         # Routes commerciales
```

### Expedition
```
GET  /expedition/available  # Expéditions disponibles
POST /expedition/:id/start  # Lancer expédition
GET  /expedition/stats      # Statistiques
```

### Quests
```
GET  /quests                # Liste des quêtes
POST /quests/:id/claim      # Réclamer récompense
```

### Messages
```
GET  /messages/inbox        # Boîte de réception
POST /messages/send         # Envoyer message
GET  /messages/:id          # Lire message
DELETE /messages/:id        # Supprimer message
```

### Inventory
```
GET  /inventory             # Liste des items
GET  /inventory/hero/equipment # Équipement héros
POST /inventory/equip/:id   # Équiper item
POST /inventory/unequip/:slot # Déséquiper
DELETE /inventory/:id/sell  # Vendre item
```

### Reports
```
GET  /reports/battles       # Rapports de bataille
GET  /reports/spy           # Rapports d'espionnage
GET  /reports/battle/:id    # Détails rapport
```

---

## ⏱️ Système de Tick (30 secondes)

Le worker exécute ces tâches toutes les 30 secondes :

1. **cityResourceProductionTick** - Production ressources
2. **upkeepTick** - Consommation nourriture armées
3. **constructionTick** - Fin des constructions
4. **recruitmentTick** - Fin des recrutements
5. **movementTick** - Déplacement + combat
6. **resourceNodeRegenTick** - Régénération nœuds
7. **siegeTick** - Dégâts siège
8. **healTick** - Soins blessés
9. **expeditionTick** - Génération + résolution
10. **bastionTick** - Construction bastion
11. **tradeRoutesTick** - Routes commerciales

---

## 🗂️ Structure du Projet

```
monjeu/
├── apps/
│   ├── api/                    # API REST NestJS
│   │   └── src/
│   │       ├── modules/        # 13 contrôleurs
│   │       │   ├── alliance/
│   │       │   ├── army/
│   │       │   ├── auth/
│   │       │   ├── bastion/
│   │       │   ├── city/
│   │       │   ├── expedition/
│   │       │   ├── inventory/
│   │       │   ├── map/
│   │       │   ├── market/
│   │       │   ├── messages/
│   │       │   ├── player/
│   │       │   ├── quests/
│   │       │   └── reports/
│   │       └── common/         # Services partagés
│   └── workers/                # Tick processor
│       └── src/workers/
├── libs/
│   ├── combat/                 # Engine de combat
│   └── game-data/              # Loaders JSON
├── prisma/
│   ├── schema.prisma           # 32 modèles
│   └── seed.ts                 # Génération monde
├── public/                     # Frontend
│   ├── index.html
│   ├── css/game.css
│   └── js/
│       ├── api.js
│       ├── game.js
│       ├── views.js
│       ├── map.js
│       └── modals.js
├── data/
│   ├── units.json              # 60 unités
│   ├── buildings.json          # 18 bâtiments
│   └── factions.json           # 6 factions
└── docker-compose.yml
```

---

## 📊 Statistiques du Code

| Composant | Fichiers | Lignes |
|-----------|----------|--------|
| Backend (API) | 13 contrôleurs | ~4,500 |
| Workers | 1 processor | ~1,300 |
| Frontend | 5 JS + 1 CSS + 1 HTML | ~2,000 |
| Schema Prisma | 1 | ~610 |
| Données JSON | 3 | ~2,000 |
| **Total** | **~25 fichiers** | **~10,400 lignes** |

---

## 🎯 Prochaines Étapes (Suggestions)

### Court terme
- [ ] Tests unitaires et e2e
- [ ] WebSocket temps réel
- [ ] Optimisation cache Redis
- [ ] Rate limiting API

### Moyen terme
- [ ] Version mobile (PWA ou React Native)
- [ ] Système de tutoriel
- [ ] Events saisonniers
- [ ] Classements globaux

### Long terme
- [ ] Monétisation (cosmétiques)
- [ ] Serveurs multiples
- [ ] Mode tournoi
- [ ] Éditeur de cartes

---

## 📝 Variables d'Environnement

```env
DATABASE_URL=postgresql://user:pass@localhost:5432/monjeu
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_secret_key_here
DATA_UNITS_PATH=data/units.json
DATA_BUILDINGS_PATH=data/buildings.json
DATA_FACTIONS_PATH=data/factions.json
```

---

## 🤝 Crédits

- **Design:** Inspiré de Travian / Rise of Kingdoms
- **Développement:** Claude AI + Humain
- **Stack:** NestJS, Prisma, PostgreSQL, Redis

---

**Bonne partie ! 🎮**
