# 📦 SAUVEGARDE - monjeu-v0_1_6-OPTIMIZED

**Date:** 31 Janvier 2026
**Version:** v0.1.6-OPTIMIZED
**Taille:** 52KB (sans node_modules)

---

## ✅ TOUTES LES OPTIMISATIONS APPLIQUÉES

### **1. COMBAT - Ratio 1.8** ⚔️
**Fichier:** `libs/combat/src/config.ts`

```typescript
TIER_COEFF = {
  base: 1.0,
  intermediate: 1.10,  // Au lieu de 1.35
  elite: 1.21,         // Au lieu de 1.9
  siege: 0.75
}
```

**Résultat:** ~1.8 unités INTER pour tuer 1 ELITE

---

### **2. PRODUCTION RESSOURCES** 🏭
**Fichier:** `apps/workers/src/workers/tick.processor.ts`

**Ajouté:**
- Fonction `cityResourceProductionTick()`
- Appelée en premier dans `handleTick()`
- Produit bois/pierre/fer/nourriture toutes les 30s
- Respecte caps de stockage
- Bloqué pendant siège

---

### **3. DONNÉES BUILDINGS - Extraction prodPerHour** 🏛️
**Fichier:** `libs/game-data/src/buildings.loader.ts`

**Ajouté:**
- Fonction `prodPerHourAtLevel(def, level)`
- Fonction `getProdType(def)`
- Interpolation exponentielle correcte
- Extrait de `effects.foodProdL1`, etc.

**Fichier:** `libs/game-data/src/loader.ts`
- Exporté les nouvelles fonctions

**Fichier:** `apps/workers/src/workers/tick.processor.ts`
- Utilise `prodPerHourAtLevel()` au lieu de `prodPerHour`

---

### **4. RECRUTEMENT - Coûts réels** 💰
**Fichier:** `apps/api/src/modules/city/city.controller.ts`

**Modifications:**
- Charge `RUNTIME_UNITS` au démarrage
- Récupère coûts depuis `unitDef.cost`
- Applique multiplicateurs par tier:
  - BASE: +30%
  - INTER: +70%
  - ELITE: +90%
  - SIEGE: normal

**Exemple:**
```
ROM_INF_LEGIONNAIRE (ELITE):
Base: 96 wood, 64 stone, 160 iron, 64 food
Avec +90%: 182 wood, 122 stone, 304 iron, 122 food
```

---

### **5. RECRUTEMENT - Tier correct** 🎖️
**Fichier:** `apps/api/src/modules/city/city.controller.ts`

**Modifié:**
- Utilise `unitDef.tier` au lieu de hardcoded `'base'`
- Les unités ELITE/INTER ont maintenant le bon multiplicateur en combat

---

### **6. RECRUTEMENT - Temps ajustés** ⏱️
**Fichier:** `apps/workers/src/workers/tick.processor.ts`

**Nouveaux temps par unité:**
- BASE: 60s (1 min)
- INTER: 120s (2 min)
- ELITE: 180s (3 min)
- SIEGE: 600s (10 min)
- CAV: +25% sur tout

**Exemples:**
```
10 Miliciens (BASE INF): 600s (10 min)
10 Equites (INTER CAV): 1500s (25 min)
5 Catapultes (SIEGE): 3000s (50 min)
```

---

### **7. FILE DE RECRUTEMENT** 👷
**Fichier:** `prisma/schema.prisma`

**Ajouté:**
- Model `RecruitmentQueueItem`
- Relation `City.recruitQueue`

**Fichier:** `apps/workers/src/workers/tick.processor.ts`

**Ajouté:**
- Fonction `recruitmentTick()`
- Gère file d'attente automatique
- 1 recrutement actif par bâtiment
- Termine automatiquement les recrutements

**Fichier:** `apps/api/src/modules/city/city.controller.ts`

**Modifié:**
- Endpoint `/city/:id/recruit` crée queue item
- Déduit ressources immédiatement
- Premier item démarre directement

---

### **8. CONSTRUCTION - MAIN_HALL** 🏛️
**Fichier:** `apps/api/src/modules/city/city.controller.ts`

**Corrigé:**
```typescript
// AVANT: 'MAIN_BUILDING' (n'existe pas)
// APRÈS: 'MAIN_HALL' (correct)
```

**Résultat:** La limite de niveau est maintenant appliquée correctement

---

### **9. CONSTRUCTION - Durées réelles** ⏱️
**Fichier:** `apps/api/src/modules/city/city.controller.ts`

**Modifié:**
- Charge `RUNTIME_BUILDINGS` au démarrage
- Utilise `timeAtLevelSec(buildingDef, level)`
- Courbes exponentielles du GDD

**Exemples:**
```
FARM:
  Niveau 1: 150s (2min 30s)
  Niveau 10: ~4h
  Niveau 20: 633h (26 jours)

MAIN_HALL:
  Niveau 1: 180s (3min)
  Niveau 10: ~4h 36min
  Niveau 20: 29 jours
```

---

## 📊 RÉSUMÉ DES CHANGEMENTS

### **Fichiers modifiés:**
1. `libs/combat/src/config.ts` - Ratio 1.8
2. `libs/game-data/src/buildings.loader.ts` - Fonctions prod
3. `libs/game-data/src/loader.ts` - Exports
4. `apps/workers/src/workers/tick.processor.ts` - Production + recrutement
5. `apps/api/src/modules/city/city.controller.ts` - Recrutement + construction
6. `prisma/schema.prisma` - RecruitmentQueueItem

### **Fichiers ajoutés:**
- Aucun (tout intégré)

### **Migrations Prisma:**
- `add-recruitment-queue` (table RecruitmentQueueItem)

---

## 🎯 ÉTAT DU PROJET

**Backend:** 95% fonctionnel ✅

**Systèmes complets:**
- ✅ Production ressources (LUMBER, QUARRY, IRON_MINE, FARM)
- ✅ Consommation nourriture (avec bonus héros)
- ✅ Construction (avec courbes réelles)
- ✅ Recrutement (avec file d'attente)
- ✅ Combat (ratio 1.8)
- ✅ Mouvement armées
- ✅ Siège, raid, espionnage
- ✅ Héros avec points
- ✅ Blessés et soins
- ✅ Nœuds ressources monde

**Ce qui reste:**
- ⬜ Interface utilisateur (HTML/CSS/JS)
- ⬜ WebSocket temps réel (optionnel)
- ⬜ Alliances (phase 2)

---

## 🚀 COMMENT UTILISER CETTE SAUVEGARDE

### **1. Extraire l'archive**
```bash
unzip monjeu-v0_1_6-OPTIMIZED.zip
cd monjeu-v0_1_6
```

### **2. Installer les dépendances**
```bash
npm install
```

### **3. Lancer Docker (Postgres + Redis)**
```bash
docker compose up -d
```

### **4. Générer Prisma + Migrer**
```bash
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

### **5. Lancer API + Workers**
```bash
# Terminal 1
npm run dev:api

# Terminal 2
npm run dev:workers
```

---

## 📝 ENDPOINTS DISPONIBLES

```
POST /auth/register { email, password, name, faction }
POST /auth/login { email, password }
POST /player/bootstrap (crée capitale + héros + armée)

GET  /city/:id
POST /city/:id/build/start { slot, buildingKey }
POST /city/:id/recruit { unitKey, count, buildingKey }

GET  /map/viewport?x=X&y=Y&zoom=ZOOM

POST /army/move { armyId, x, y }
POST /army/attack { armyId, x, y }
POST /army/raid { armyId, x, y }
POST /army/spy { armyId, x, y, targetType }

GET  /reports/battles
```

---

## 🔧 VARIABLES D'ENVIRONNEMENT

Fichier `.env` :
```
DATABASE_URL=postgresql://user:pass@localhost:5432/monjeu
REDIS_URL=redis://localhost:6379
JWT_SECRET=your_secret_here
DATA_UNITS_PATH=data/units.json
DATA_BUILDINGS_PATH=data/buildings.json
DATA_FACTIONS_PATH=data/factions.json
```

---

## ⚠️ NOTES IMPORTANTES

1. **Migration Prisma requise** après extraction
2. **Seed requis** pour générer le monde
3. **60 unités** et **18 bâtiments** déjà dans `data/`
4. **Ratio combat 1.8** déjà appliqué
5. **Toutes les corrections** sont dans cette version

---

## 📦 CONTENU DE L'ARCHIVE

```
monjeu-v0_1_6/
├── apps/
│   ├── api/          (REST API NestJS)
│   └── workers/      (Tick processor)
├── libs/
│   ├── combat/       (Engine combat)
│   └── game-data/    (Loaders)
├── prisma/
│   ├── schema.prisma (DB schema)
│   └── seed.ts       (World generation)
├── data/
│   ├── units.json    (60 unités)
│   ├── buildings.json (18 bâtiments)
│   └── factions.json (6 factions)
├── package.json
├── docker-compose.yml
└── README.md
```

---

**Version optimisée et prête à l'emploi !** 🎉
