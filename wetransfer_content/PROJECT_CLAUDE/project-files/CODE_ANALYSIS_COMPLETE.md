# 🔍 ANALYSE COMPLÈTE & OPTIMISATION - v0.1.6

## ❌ PROBLÈMES CRITIQUES TROUVÉS

### **1. PRODUCTION DE RESSOURCES - NON IMPLÉMENTÉE** 🏭
**Localisation:** `apps/workers/src/workers/tick.processor.ts`

**Problème:**
```typescript
// Ligne 43: resourceNodeTick existe mais pas cityResourceProductionTick
await resourceNodeTick(this.prisma);  // ✅ Nœuds monde OK
await upkeepTick(this.prisma);        // ✅ Consommation OK
// ❌ MANQUE: cityResourceProductionTick
```

**Impact:** 
- Les villes ne produisent AUCUNE ressource
- LUMBER, QUARRY, IRON_MINE, FARM sont inutiles
- Joueur ne peut pas jouer sans ressources

**Solution:** Ajouter avant upkeepTick:
```typescript
await cityResourceProductionTick(this.prisma);
```

**Gravité:** ⚠️⚠️⚠️ CRITIQUE

---

### **2. DONNÉES BÂTIMENTS - STRUCTURE INCOMPATIBLE** 🏛️
**Localisation:** `apps/workers/src/workers/tick.processor.ts:214`

**Problème:**
```typescript
const prodPerHour = def?.prodPerHour ?? 0;
```

**Le fichier `data/buildings.json` a cette structure:**
```json
{
  "buildings": [
    {
      "key": "FARM",
      "levels": {
        "1": {
          "prod_storage": {
            "foodProdPerHour": 20
          }
        }
      }
    }
  ]
}
```

**Mais le code attend:**
```json
{
  "FARM": {
    "prodPerHour": 20  // ❌ N'existe pas
  }
}
```

**Impact:**
- `prodPerHour` est toujours 0
- Même si production est implémentée, elle produira 0

**Solution:** 
1. Reformat `data/buildings.json` en structure flat
2. OU adapter le loader pour extraire `prodPerHour` des levels

**Gravité:** ⚠️⚠️⚠️ CRITIQUE

---

### **3. RECRUTEMENT - COÛTS HARDCODÉS** 💰
**Localisation:** `apps/api/src/modules/city/city.controller.ts:43`

**Problème:**
```typescript
const cost = { 
  wood: 10*dto.count,   // ❌ Hardcodé
  stone: 5*dto.count,   // ❌ Hardcodé
  iron: 15*dto.count,   // ❌ Hardcodé
  food: 10*dto.count    // ❌ Hardcodé
};
```

**Impact:**
- Toutes les unités coûtent la même chose
- Pas de différence BASE/INTER/ELITE
- ROM_INF_MILICIEN = ROM_INF_LEGIONNAIRE (faux!)

**Solution:** Charger coûts depuis `data/units.json`:
```typescript
const unitDef = RUNTIME_UNITS[dto.unitKey];
const cost = {
  wood: unitDef.cost.wood * dto.count,
  stone: unitDef.cost.stone * dto.count,
  iron: unitDef.cost.iron * dto.count,
  food: unitDef.cost.food * dto.count,
};
```

**Gravité:** ⚠️⚠️ HAUTE

---

### **4. RECRUTEMENT - TIER HARDCODÉ** 🎖️
**Localisation:** `apps/api/src/modules/city/city.controller.ts:57`

**Problème:**
```typescript
create:{ 
  armyId:army.id, 
  unitKey:dto.unitKey, 
  tier:'base',  // ❌ Toujours 'base'
  count:dto.count 
}
```

**Impact:**
- Toutes les unités sont tier 'base'
- ELITE/INTER ont le multiplicateur BASE (1.0 au lieu de 1.10/1.21)
- Combat déséquilibré

**Solution:**
```typescript
const unitDef = RUNTIME_UNITS[dto.unitKey];
tier: unitDef.tier,  // ✅ Bon tier
```

**Gravité:** ⚠️⚠️ HAUTE

---

### **5. CONSTRUCTION - DURÉE HARDCODÉE** ⏱️
**Localisation:** `apps/api/src/modules/city/city.controller.ts:30`

**Problème:**
```typescript
const durationSec = 60 * (existing + 1); // alpha
```

**Impact:**
- Niveau 1: 60 secondes
- Niveau 20: 1200 secondes (20 minutes)
- Ne respecte pas les courbes GDD (croissance exponentielle)

**Solution:**
```typescript
const buildingDef = RUNTIME_BUILDINGS[dto.buildingKey];
const durationSec = timeAtLevelSec(buildingDef, existing + 1);
```

**Gravité:** ⚠️ MOYENNE

---

### **6. CONSTRUCTION - LIMITE MAIN BUILDING INCORRECTE** 🏛️
**Localisation:** `apps/api/src/modules/city/city.controller.ts:23`

**Problème:**
```typescript
const main = city.buildings.find(b=>b.key==='MAIN_BUILDING')?.level ?? 1;
```

**Le bon nom est:** `MAIN_HALL` (pas `MAIN_BUILDING`)

**Impact:**
- Limite jamais appliquée
- Joueur peut construire bâtiments niveau 20 sans Main Hall

**Solution:**
```typescript
const main = city.buildings.find(b=>b.key==='MAIN_HALL')?.level ?? 1;
```

**Gravité:** ⚠️⚠️ HAUTE

---

## ⚠️ PROBLÈMES MOYENS

### **7. RECRUITMENT QUEUE MANQUANTE** 👷

**Problème:**
- Recrutement instantané
- Pas de file d'attente
- Pas de temps de formation

**Impact:** Pas critique mais manque de gameplay

**Solution:** 
1. Créer table `RecruitmentQueueItem`
2. Ajouter `recruitmentTick()`
3. Update endpoint `/city/:id/recruit`

**Gravité:** ⚠️ MOYENNE

---

### **8. WEBSOCKET MANQUANT** 🔌

**Problème:**
- Pas de communication temps réel
- Frontend doit poll API toutes les X secondes

**Impact:** Performance sous-optimale

**Solution:** Ajouter `@nestjs/websockets`

**Gravité:** ⚠️ BAS

---

## ⚙️ OPTIMISATIONS RECOMMANDÉES

### **9. UPKEEP - DOUBLE QUERY** 🔄

**Localisation:** `apps/workers/src/workers/tick.processor.ts:116-119`

**Actuel:**
```typescript
const cities = await prisma.city.findMany({ select:{ id:true, isSieged:true } });
const citySiege = new Map(cities.map(c=>[c.id, c.isSieged]));
const armies = await prisma.army.findMany({ include:{ units:true, owner:{ include:{ hero:true } } } });
```

**Optimisation possible:**
```typescript
// Combine queries si possible
const armies = await prisma.army.findMany({ 
  include:{ 
    units:true, 
    owner:{ include:{ hero:true } },
    city: { select: { isSieged: true } }  // ✅ En une query
  } 
});
```

**Gain:** -1 query DB par tick

---

### **10. POPULATION - RECALCUL CHAQUE FOIS** 📊

**Localisation:** `apps/workers/src/workers/tick.processor.ts:168-180`

**Problème:**
- Recalcule toute la population à chaque bâtiment fini
- Potentiellement lent si beaucoup de villes

**Optimisation:**
```typescript
// Au lieu de tout recalculer:
const oldPop = buildingPop(existing, category, maxLevel);
const newPop = buildingPop(targetLevel, category, maxLevel);
const delta = newPop - oldPop;
await prisma.player.update({ 
  where:{ id: playerId }, 
  data:{ population: { increment: delta }}
});
```

**Gain:** Évite de scanner toutes les villes

---

## 🐛 BUGS MINEURS

### **11. PRISMA - RELATIONS MANQUANTES**

**Vérifier dans `prisma/schema.prisma`:**
- CityBuilding.prodPerHour existe ? ✅
- ArmyUnit.tier existe ? ✅ (à vérifier)

---

### **12. ERROR HANDLING - GÉNÉRIQUE** 

**Localisation:** Plusieurs controllers

**Problème:**
```typescript
throw new Error('forbidden');  // ❌ Code 500 au lieu de 403
```

**Solution:**
```typescript
import { ForbiddenException } from '@nestjs/common';
throw new ForbiddenException();  // ✅ Code 403
```

---

## 📋 CHECKLIST CORRECTIONS

### **URGENT (Bloquer le jeu):**
- [ ] ⚠️⚠️⚠️ Ajouter `cityResourceProductionTick()`
- [ ] ⚠️⚠️⚠️ Fix structure `data/buildings.json` pour prodPerHour
- [ ] ⚠️⚠️ Fix coûts recrutement (charger depuis units.json)
- [ ] ⚠️⚠️ Fix tier recrutement (toujours 'base')
- [ ] ⚠️⚠️ Fix MAIN_BUILDING → MAIN_HALL

### **IMPORTANT (Améliorer gameplay):**
- [ ] ⚠️ Fix durée construction (courbes)
- [ ] ⚠️ Ajouter recruitment queue

### **OPTIMISATIONS:**
- [ ] Optimiser upkeep query
- [ ] Optimiser population calculation
- [ ] Ajouter WebSocket

### **POLISH:**
- [ ] Fix error handling
- [ ] Ajouter validation DTO

---

## 🚀 PLAN D'ACTION

### **PHASE 1 - Corrections critiques (1h)**

1. **Ajouter production ressources (30 min)**
   - Créer `cityResourceProductionTick()`
   - Insérer dans tick processor
   - Tester

2. **Fix données buildings (15 min)**
   - Adapter loader pour extraire prodPerHour des levels
   - OU reformat buildings.json

3. **Fix recrutement (15 min)**
   - Charger coûts réels
   - Charger tier réel
   - Fix MAIN_HALL

### **PHASE 2 - Améliorations (1h)**

4. **Fix durée construction (15 min)**
5. **Recruitment queue (30 min)**
6. **Optimisations queries (15 min)**

### **PHASE 3 - Tests (30 min)**

7. **Test complet du tick**
8. **Test recrutement**
9. **Test construction**

---

## 📊 RÉSUMÉ

**Problèmes critiques:** 6
**Problèmes moyens:** 2
**Optimisations:** 2
**Bugs mineurs:** 2

**Temps total corrections:** ~2-3 heures

**Après corrections:** Jeu 90% fonctionnel (manque juste UI)
