# MonJeu v0.6 - Combat PvP & Armées

Jeu de stratégie MMO style **Travian** / **Rise of Kingdoms**

## Nouveautés v0.6

### Combat PvP
- **Attaquer** des villes ennemies
- **Raids** pour piller des ressources
- **Mouvement d'armées** sur la carte du monde
- **Rapports de bataille** détaillés
- Système de **pertes** basé sur la puissance relative
- **Bonus de mur** pour les défenseurs

### Interface Améliorée
- Style médiéval/Travian avec textures
- Police Cinzel (titres) et Crimson Text (corps)
- Animations et effets visuels
- Couleurs parchemin, bois et or

## Installation

### Prérequis
- **Docker Desktop** (pour PostgreSQL)
- **Node.js 18+**

### Windows
1. Extraire le zip
2. Double-cliquer sur `JOUER.bat`
3. Ouvrir http://localhost:3000

### Mac/Linux
```bash
docker-compose up -d
npm install
npx prisma generate
npx prisma db push
node src/server.js
```

## Fonctionnalités

### Gestion de ville
- 18 types de bâtiments
- File de construction (max 2)
- Production de ressources automatique

### Armée
- 60 unités (10 par faction)
- Recrutement avec prérequis
- 6 factions: Rome, Gaule, Grèce, Égypte, Huns, Sultanat

### Combat
- `POST /api/army/:id/move` - Déplacer une armée
- `POST /api/army/:id/attack` - Attaquer une ville
- `POST /api/army/:id/raid` - Piller une ville
- `POST /api/army/:id/return` - Retourner à la base

### Héros
- Système de niveau et XP
- 4 stats: ATK, DEF, SPD, LOG
- Équipement (à venir)

### Expéditions
- Missions PvE avec récompenses
- 4 niveaux de difficulté
- Loot: Common, Rare, Epic, Legendary

### Alliance
- Créer/rejoindre une alliance
- Rôles: Leader, Officer, Member
- Classement par population

## API Endpoints

### Auth
- `POST /api/auth/register`
- `POST /api/auth/login`

### Player
- `GET /api/player/me`

### City
- `GET /api/cities`
- `POST /api/city/:id/build`
- `POST /api/city/:id/recruit`

### Army (NOUVEAU)
- `GET /api/armies`
- `GET /api/army/:id`
- `POST /api/army/:id/move`
- `POST /api/army/:id/attack`
- `POST /api/army/:id/raid`
- `POST /api/army/:id/return`

### Map
- `GET /api/map/viewport`

### Ranking
- `GET /api/ranking/players`
- `GET /api/ranking/alliances`

## Données de jeu

### Ratio de combat
- BASE: 1.0x
- INTERMEDIATE: 1.1x
- ELITE: 1.21x
- SIEGE: 0.75x

### Temps de déplacement
- 1 case = 30 secondes (vitesse 50)
- Cavalerie plus rapide
- Siège plus lent

### Bonus défenseur
- +3% par niveau de mur

## Architecture

```
monjeu-v06/
├── src/server.js      # Serveur Express + API + Tick
├── frontend/
│   ├── index.html     # Interface
│   ├── css/style.css  # Style Travian
│   └── js/app.js      # Logique frontend
├── prisma/
│   └── schema.prisma  # Base de données
├── data/
│   ├── units.json     # 60 unités
│   ├── buildings.json # 18 bâtiments
│   └── factions.json  # 6 factions
└── docker-compose.yml # PostgreSQL
```

## Prochaines étapes

- [ ] Vue ville isométrique avec sprites
- [ ] Carte style Rise of Kingdoms (zoom fluide)
- [ ] Marché P2P et serveur
- [ ] Diplomatie alliance
- [ ] WebSocket temps réel

---

**Version:** 0.6.0  
**Date:** 3 Février 2026
