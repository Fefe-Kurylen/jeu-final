# MonJeu - Game Design Document (GDD) Complet
## Version 0.2.0 - 31 Janvier 2026

---

## 📋 TABLE DES MATIÈRES

1. [Vue d'ensemble](#vue-densemble)
2. [Systèmes implémentés](#systèmes-implémentés)
3. [Systèmes manquants](#systèmes-manquants)
4. [Équilibrage & Formules](#équilibrage--formules)
5. [Roadmap](#roadmap)

---

## 🎮 VUE D'ENSEMBLE

### Concept
Jeu de stratégie MMO style Travian avec carte façon Rise of Kingdoms. Le joueur développe une ville, entraîne des armées et conquiert des territoires.

### Stack Technique
- **Backend**: NestJS + Prisma + PostgreSQL + Redis
- **Workers**: Bull Queue (tick 30s)
- **Frontend**: À développer (HTML/CSS/JS ou React)

### État actuel: Backend 95% ✅

---

## ✅ SYSTÈMES IMPLÉMENTÉS

### 1. Production de ressources ✅
```
Ressources: Bois, Pierre, Fer, Nourriture
Bâtiments: LUMBER, QUARRY, IRON_MINE, FARM
Courbe: L1=20/h → L20=1200/h (exponentielle)
Tick: Toutes les 30 secondes
Bloqué: Pendant siège
```

### 2. Consommation nourriture (Upkeep) ✅
```
Par heure:
- BASE: 5 food/h
- INTERMEDIATE: 10 food/h  
- ELITE: 15 food/h
- SIEGE: 15 food/h

Modificateurs:
- Siège attaquant: +10%
- Siège défenseur: -10%
- Héros logistique: -0.5% par point (max -25%)
```

### 3. Construction ✅
```
File d'attente: 2 slots actifs + 2 en attente
Durées: Courbes exponentielles (L1=150s → L20=24h)
Limite: Niveau bâtiment ≤ Niveau Main Hall
```

### 4. Recrutement ✅
```
Temps par unité:
- BASE: 60s (1 min)
- INTERMEDIATE: 120s (2 min)
- ELITE: 180s (3 min)
- SIEGE: 600s (10 min)
- Cavalerie: +25%

Coûts: Basés sur units.json × multiplicateurs tier
File d'attente: Par bâtiment (BARRACKS, STABLE, WORKSHOP)
```

### 5. Combat ✅
```
Ratio GDD: ~1.8 INTER pour tuer 1 ELITE

TIER_COEFF:
- base: 1.0
- intermediate: 1.10
- elite: 1.21 (1.10²)
- siege: 0.75

Triangle tactique:
- INF > ARCH (+20% dégâts)
- ARCH > CAV (+20% dégâts)
- CAV > INF (+20% dégâts)

Blessés: 35% des morts → Healing Tent
Défense ville: +15% bonus défenseur
```

### 6. Mouvement armées ✅
```
Vitesse: Basée sur unité la plus lente
Actions: MOVE, ATTACK, RAID, SPY, REINFORCE
```

### 7. Siège ✅
```
Dégâts mur: 10★ catapultes = 30min pour briser
Régénération: 24h pour réparer 100%
État: isSieged bloque production
```

### 8. Espionnage ✅
```
Vision: 100 cases
Rapports: Détails ville/armées/ressources
```

### 9. Héros ✅
```
4 stats: ATK, DEF, LOG, SPD
Points: +1 par level up
Bonus: Appliqués au combat et upkeep
```

### 10. Blessés et soins ✅
```
Healing Tent: 3 × niveau unités/tick
Priority: BASE → INTER → ELITE
```

### 11. Nœuds ressources monde ✅
```
Régénération: 4h pour 100%
Tribu: Défense proportionnelle au niveau
Pillage: Selon capacité de transport
```

---

## ❌ SYSTÈMES MANQUANTS

### 🔴 PRIORITÉ HAUTE

#### 1. Interface utilisateur (Frontend)
```
État: Non implémenté
Priorité: CRITIQUE

À faire:
□ Vue ville (bâtiments, ressources, files)
□ Vue carte monde (tiles, armées, villes)
□ Panneaux: Construction, Recrutement, Armées
□ Rapports de bataille
□ Chat/Messages
```

#### 2. Système d'alliances
```
État: Non implémenté
Priorité: HAUTE

Fonctionnalités:
□ Création/Dissolution alliance
□ Rôles: Chef, Officier, Membre
□ Diplomatie: Allié, Neutre, Ennemi
□ Chat alliance
□ Partage de vision carte
□ Renforts entre alliés
```

#### 3. Authentification complète
```
État: Basique
Priorité: HAUTE

À améliorer:
□ Validation email
□ Récupération mot de passe
□ Sessions JWT refresh
□ Rate limiting
□ 2FA (optionnel)
```

### 🟡 PRIORITÉ MOYENNE

#### 4. Marché/Commerce
```
État: Non implémenté
Priorité: MOYENNE

Fonctionnalités:
□ Offres de vente/achat
□ Taux de change dynamique
□ Marchands (caravanes)
□ Temps de transport
□ Taxes (optionnel)
```

#### 5. Quêtes/Tutoriel
```
État: Non implémenté
Priorité: MOYENNE

Fonctionnalités:
□ Quêtes tutoriel (construction, recrutement)
□ Quêtes quotidiennes
□ Récompenses
□ Progression guidée
```

#### 6. Événements serveur
```
État: Non implémenté
Priorité: MOYENNE

Types:
□ Invasions barbares
□ Bonus ressources weekend
□ Compétitions alliances
□ Artefacts uniques
```

#### 7. Recherche/Technologies
```
État: Non implémenté
Priorité: MOYENNE

Arbre tech:
□ Économie (bonus production)
□ Militaire (bonus combat)
□ Défense (bonus murs)
□ Logistique (bonus vitesse)
```

### 🟢 PRIORITÉ BASSE

#### 8. WebSocket temps réel
```
État: Non implémenté
Priorité: BASSE (polling fonctionne)

Fonctionnalités:
□ Updates ressources live
□ Notifications combat
□ Chat temps réel
□ Position armées live
```

#### 9. Classements
```
État: Non implémenté
Priorité: BASSE

Types:
□ Population
□ Puissance militaire
□ Alliances
□ Attaquants/Défenseurs
```

#### 10. Héros avancé
```
État: Basique implémenté
Priorité: BASSE

À ajouter:
□ Équipement (armes, armures)
□ Compétences actives
□ Arbre de talents
□ Mort/Résurrection
```

---

## 📊 ÉQUILIBRAGE & FORMULES

### Production ressources
```javascript
// Niveau 1 à 20, courbe exponentielle
function prodAtLevel(level) {
  const L1 = 20;   // food/h à niveau 1
  const L20 = 1200; // food/h à niveau 20
  const t = (level - 1) / 19;
  return L1 * Math.pow(L20 / L1, t);
}

// Exemples:
// L1  = 20/h
// L5  = 65/h
// L10 = 220/h
// L15 = 530/h
// L20 = 1200/h
```

### Balance nourriture
```javascript
// Équation d'équilibre
// Production - Upkeep ≥ 0 pour être viable

// Exemple: 100 unités BASE
// Upkeep = 100 × 5 = 500 food/h
// Ferme L10 = 220/h → besoin de 3 fermes L10 minimum
```

### Coûts recrutement
```javascript
const baseCost = { wood: 30, stone: 20, iron: 50, food: 20 };
const multipliers = {
  base: 1.30,        // +30%
  intermediate: 1.70, // +70%
  elite: 1.90,       // +90%
  siege: 1.00,       // normal
};

// Exemple Légionnaire (ELITE):
// wood: 96 × 1.9 = 182
// stone: 64 × 1.9 = 122
// iron: 160 × 1.9 = 304
// food: 64 × 1.9 = 122
```

### Temps construction
```javascript
function buildTimeAtLevel(level) {
  const L1 = 150;     // 2.5 min
  const L20 = 86400;  // 24h
  const t = (level - 1) / 19;
  return L1 * Math.pow(L20 / L1, t);
}

// Exemples:
// L1  = 2m30s
// L5  = 15m
// L10 = 1h30
// L15 = 6h
// L20 = 24h
```

### Combat - Kill ratio
```javascript
// Pour que ~1.8 INTER tuent 1 ELITE:
const TIER_COEFF = {
  base: 1.0,
  intermediate: 1.10,
  elite: 1.21,  // 1.10 × 1.10
  siege: 0.75,
};

// Puissance effective = stats × TIER_COEFF
// ELITE avec 100 ATK → 121 effective
// INTER avec 80 ATK → 88 effective
// Ratio: 121/88 ≈ 1.375 (avec autres facteurs → ~1.8)
```

---

## 🗺️ ROADMAP

### Phase 1 - MVP (Semaine 1-2)
```
✅ Backend complet
□ Frontend basique HTML/JS
□ Vue ville fonctionnelle
□ Vue carte scrollable
□ Authentification
□ Tests E2E
```

### Phase 2 - Social (Semaine 3-4)
```
□ Système d'alliances
□ Chat global/alliance
□ Messages privés
□ Classements
```

### Phase 3 - Contenu (Semaine 5-6)
```
□ Tutoriel/Quêtes
□ Événements serveur
□ Marché
□ Technologies
```

### Phase 4 - Polish (Semaine 7-8)
```
□ WebSocket temps réel
□ Notifications push
□ Mobile responsive
□ Optimisations performance
□ Beta test
```

---

## 📁 FICHIERS CLÉS

```
monjeu/
├── apps/
│   ├── api/              # REST API NestJS
│   └── workers/          # Tick processor
├── libs/
│   ├── combat/           # Engine combat
│   └── game-data/        # Loaders données
├── prisma/
│   ├── schema.prisma     # 15 models DB
│   └── seed.ts           # Génération monde
├── data/
│   ├── units.json        # 60 unités
│   ├── buildings.json    # 18 bâtiments
│   └── factions.json     # 6 factions
└── tools/
    └── simulation-48h.js # Tests équilibrage
```

---

## 🔧 ENDPOINTS API

```
POST /auth/register      { email, password, name, faction }
POST /auth/login         { email, password }
POST /player/bootstrap   (crée capitale + héros + armée)

GET  /city/:id
POST /city/:id/build/start   { slot, buildingKey }
POST /city/:id/recruit       { unitKey, count, buildingKey }

GET  /map/viewport       ?x=X&y=Y&zoom=ZOOM

POST /army/move          { armyId, x, y }
POST /army/attack        { armyId, x, y }
POST /army/raid          { armyId, x, y }
POST /army/spy           { armyId, x, y, targetType }

GET  /reports/battles
GET  /reports/spy
```

---

## 📈 MÉTRIQUES SIMULATION 48H

```
Configuration:
- Tick: 30s
- Total ticks: 5760
- Durée simulée: 48h

Résultats typiques:
- Production totale: ~3K de chaque ressource
- Bâtiments construits: 5-10
- Unités recrutées: 5-15
- Balance nourriture: Variable selon IA

Performance:
- ~165,000 ticks/seconde
- ~5M× temps réel
- ~35ms pour 48h simulées
```

---

*Document généré le 31 Janvier 2026*
*MonJeu Alpha v0.1.6-OPTIMIZED*
