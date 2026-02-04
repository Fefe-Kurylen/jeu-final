# 📂 FICHIERS POUR PROJET CLAUDE

## 🎯 COMMENT UTILISER CES FICHIERS

### **Étape 1 - Créer le Projet Claude**
1. Va sur **claude.ai**
2. Clique sur **"Projects"** (icône en haut à gauche)
3. Clique sur **"Create Project"**
4. Nomme-le : **"MonJeu - Alpha Optimized"**

---

### **Étape 2 - Uploader les fichiers**

**Upload ces fichiers dans l'ordre :**

#### **1. Documentation (commence par ceux-là)**
- ✅ `README.md` - Vue d'ensemble du projet
- ✅ `CONVERSATION_SUMMARY.md` - Résumé complet de la session
- ✅ `SAUVEGARDE_CHANGELOG.md` - Liste des modifications
- ✅ `CODE_ANALYSIS_COMPLETE.md` - Analyse des problèmes

#### **2. Configuration & Schéma**
- ✅ `package.json` - Dépendances du projet
- ✅ `schema.prisma` - Schéma de base de données (14 models)

#### **3. Code source principal**
- ✅ `tick.processor.ts` - Worker principal (production, upkeep, construction, recrutement)
- ✅ `city.controller.ts` - API ville (construction, recrutement)
- ✅ `army.controller.ts` - API armée (mouvement, attaque, raid)
- ✅ `combat.config.ts` - Configuration combat (ratio 1.8)
- ✅ `buildings.loader.ts` - Loader bâtiments avec production
- ✅ `game-data.loader.ts` - Loader général

#### **4. Données de jeu**
- ✅ `units.json` - 60 unités (6 factions × 10 unités)
- ✅ `buildings.json` - 18 bâtiments avec courbes

---

### **Étape 3 - Ajouter des instructions personnalisées**

Dans la section **"Custom Instructions"** du projet, colle ceci :

```
Ce projet est un jeu de stratégie massivement multijoueur (MMO) style Travian.

ARCHITECTURE:
- Backend: NestJS + Prisma + Redis + PostgreSQL
- Tick system: 30 secondes
- API REST: 11 endpoints
- Workers: Tick processor automatique

ÉTAT DU PROJET:
- ✅ Backend 95% fonctionnel
- ✅ Toutes les optimisations appliquées (voir SAUVEGARDE_CHANGELOG.md)
- ✅ Combat avec ratio 1.8 validé
- ✅ Production ressources complète
- ✅ File de recrutement implémentée
- ⬜ Interface utilisateur (à faire)

DONNÉES IMPORTANTES:
- Ratio combat: BASE 1.0, INTER 1.10, ELITE 1.21
- Recrutement: BASE 1min, INTER 2min, ELITE 3min, SIEGE 10min
- Coûts: +30% BASE, +70% INTER, +90% ELITE
- 60 unités, 18 bâtiments (données GDD V4 complètes)

FICHIERS CLÉS:
- tick.processor.ts: Cœur du jeu (production, combat, mouvement)
- city.controller.ts: Gestion villes (construction, recrutement)
- schema.prisma: Structure database (14 models)
- combat.config.ts: Configuration combat optimisée

Pour toute question, consulte CONVERSATION_SUMMARY.md qui contient 
l'historique complet de toutes les décisions et optimisations.
```

---

## 📋 DESCRIPTION DES FICHIERS

### **Documentation**
- **README.md** (1.3 KB) - Guide démarrage rapide
- **CONVERSATION_SUMMARY.md** (19 KB) - Résumé complet session (760 lignes)
- **SAUVEGARDE_CHANGELOG.md** (7 KB) - Détail modifications
- **CODE_ANALYSIS_COMPLETE.md** (8 KB) - Analyse problèmes

### **Configuration**
- **package.json** (1.5 KB) - Scripts npm et dépendances
- **schema.prisma** (4.6 KB) - 14 models (Account, Player, City, Army, etc.)

### **Code source (TypeScript)**
- **tick.processor.ts** (22 KB) - Worker principal avec 8 ticks
  - Production ressources
  - Consommation nourriture
  - Construction
  - Recrutement
  - Mouvement
  - Combat
  - Siège
  - Soins

- **city.controller.ts** (2.9 KB) - API ville
  - GET /city/:id
  - POST /city/:id/build/start
  - POST /city/:id/recruit

- **army.controller.ts** (2.2 KB) - API armée
  - POST /army/move
  - POST /army/attack
  - POST /army/raid
  - POST /army/spy

- **combat.config.ts** (492 bytes) - Configuration combat
  - TIER_COEFF: {1.0, 1.10, 1.21, 0.75}
  - DAMAGE_DEF_MULT: 0.55
  - WOUNDED_RATE: 0.35

- **buildings.loader.ts** (1.7 KB) - Loader bâtiments
  - prodPerHourAtLevel()
  - getProdType()
  - costAtLevel()
  - timeAtLevelSec()

- **game-data.loader.ts** (1.7 KB) - Loader général
  - loadUnitsFromJson()
  - loadBuildingsFromJson()
  - loadFactionBonusesFromJson()

### **Données JSON**
- **units.json** (18 KB) - 60 unités avec stats complètes
  - Attack, Defense, Endurance, Speed, Transport
  - Coûts, Temps formation, Tier
  - 6 factions: ROME, GAUL, GREEK, EGYPT, HUN, SULTAN

- **buildings.json** (11 KB) - 18 bâtiments
  - Courbes niveau 1-20 (ou 30)
  - Production, Coûts, Temps construction
  - Effects et bonuses

---

## 🎮 UTILISATION DANS CLAUDE PROJECTS

**Avantages d'avoir ces fichiers dans un Projet:**

1. **Context persistant** - Claude se souvient de tout le projet
2. **Analyse de code** - Peut analyser et modifier les fichiers
3. **Debug facilité** - Peut tracer les bugs à travers tous les fichiers
4. **Évolution** - Peut continuer à développer (interface, alliances, etc.)
5. **Documentation** - Tout l'historique est accessible

**Exemples de demandes que tu peux faire:**

```
"Ajoute un endpoint pour voir la file de recrutement"
→ Claude va lire city.controller.ts et schema.prisma

"Optimise le tick processor pour moins de queries"
→ Claude va analyser tick.processor.ts

"Crée une interface HTML pour la vue ville"
→ Claude va utiliser les données de buildings.json

"Explique comment fonctionne le système de combat"
→ Claude va référencer combat.config.ts et CONVERSATION_SUMMARY.md

"Ajoute le système d'alliances"
→ Claude va lire schema.prisma et proposer les modifications
```

---

## ⚠️ NOTES IMPORTANTES

1. **Ces fichiers sont une EXTRACTION** du projet complet
2. **Le projet complet** est dans monjeu-v0_1_6-OPTIMIZED.zip
3. **Ces fichiers suffisent** pour que Claude comprenne tout le projet
4. **Pour exécuter le code**, il faut le projet complet avec node_modules

---

## 🚀 PROCHAINES ÉTAPES SUGGÉRÉES

Une fois le projet créé, tu peux demander à Claude de :

1. **Créer l'interface utilisateur** (HTML/CSS/JS Travian-style)
2. **Ajouter le système d'alliances** (déjà documenté dans le GDD)
3. **Implémenter le marché** (P2P, serveur, routes auto)
4. **Ajouter WebSocket** (temps réel)
5. **Optimiser les performances** (batch updates, cache)
6. **Créer des tests** (unit tests, e2e tests)

---

**Tous les fichiers sont prêts dans le dossier `project-files/` !**

*Guide créé automatiquement - 31 Janvier 2026*
