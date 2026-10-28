// ========== GAME CONFIGURATION ==========
// Centralized config to avoid magic numbers scattered across code

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  isProduction: IS_PRODUCTION,
  jwtSecret: process.env.JWT_SECRET || '',   // validated below: mandatory and >= 32 chars outside development
  jwtExpiry: '7d',

  // Notifications push (APNs via HTTP/2 + JWT ES256, FCM v1 via compte de service) : inactif sans clés
  push: {
    apns: {
      keyId: process.env.APNS_KEY_ID || '',
      teamId: process.env.APNS_TEAM_ID || '',
      privateKey: (process.env.APNS_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
      bundleId: process.env.APNS_BUNDLE_ID || 'com.imperiumantiquitas.app',
      production: process.env.APNS_PRODUCTION === 'true'
    },
    fcm: { serviceAccount: process.env.FCM_SERVICE_ACCOUNT || '' },
    // Intervalle minimal entre deux notifications du même type pour un joueur
    throttleMs: { attack_incoming: 2 * 60 * 1000, battle: 60 * 1000, build_done: 10 * 60 * 1000, recruit_done: 10 * 60 * 1000, city_fall: 0, siege_halt: 0, message: 30 * 1000, friend: 60 * 1000 }   // a fall or a blocked homecoming always reaches the player, even right after a battle push
  },

  // Alliance (décision du 26 octobre 2026) : aide (1 minute au moins par aide), points d'alliance gagnés en aidant
  // (plafond par 24 h glissantes), demandes d'aide gardées 7 jours
  alliance: {
    helpMinSeconds: 60,
    helpPoints: 10,
    helpPointsDailyCap: 300,
    helpRequestMaxAgeDays: 7,
    healRequestEveryHours: 6
  },

  // Espions (décision du 26 octobre 2026, GDD espionage_config) : 2 par compte, Tour de guet niv. 5 puis 10, 20 puis
  // 200 or ; alerte de la ville espionnée selon sa Tour de guet ; un point espionné garde son stock exact 1 h
  spies: {
    unlockLevels: [5, 10],
    goldCost: [20, 200],
    speed: 80,
    nodeIntelMinutes: 60,
    alertLevels: { seen: 5, when: 10, who: 15 }
  },

  // Bastion d'alliance (décision du 26 octobre 2026, GDD alliance_config.bastion) : 15 membres pour le bâtir, ressources
  // apportées par convois, 3 jours de chantier ; bonus de tous les membres tant qu'il tient ; il tombe comme une ville en
  // plus dur (mur bouclier 50 fois un mur 20, 10 vies qui remontent en 72 h) ; 7 jours avant d'en rebâtir un
  // Cycle du serveur (décision du 28 octobre 2026, GDD world_config.server) : inscriptions 2 mois, 5 000 joueurs ; fin par
  // une Merveille façon Travian gardée par les Immortels
  world: {
    registrationDays: Number(process.env.WORLD_REGISTRATION_DAYS) || 60,
    maxPlayers: 5000,
    wonderSitesDay: Number(process.env.WONDER_SITES_DAY) || 120,
    wonderPlansDay: Number(process.env.WONDER_PLANS_DAY) || 150,
    wonderSites: 12,             // sites de Merveille autour du centre
    wonderPlans: 13,             // plans de construction (nécessaires au-delà du niveau 50)
    wonderMaxLevel: 100,
    planNeededAbove: 50,
    // coût et durée d'un niveau : base × facteur^(niveau − 1) ; tiré du stock de la Merveille (convois de l'alliance)
    wonderCostBase: { wood: 50000, stone: 50000, iron: 50000, food: 15000 },
    wonderCostFactor: 1.05,
    wonderTimeBaseSec: 3600,
    wonderTimeFactor: 1.025,
    wonderLevelsLostPerAssault: 2,
    immortalWaveHours: 12,       // les Immortels attaquent chaque Ville Merveille toutes les 12 h
    immortalSitePower: 600000,   // puissance de la garnison d'un site (un camp barbare de niveau 3 ≈ 3 000 à 10 000)
    immortalPlanPower: 900000
  },

  // Héros (décision du 27 octobre 2026) : résurrection au Domus payée selon le niveau du héros
  hero: {
    reviveCostPerLevel: { wood: 250, stone: 250, iron: 250, food: 150 }
  },

  bastion: {
    minMembers: 15,
    cost: { wood: 500000, stone: 500000, iron: 500000, food: 250000 },
    buildDays: 3,
    cooldownDays: 7,
    wallMultiplier: 50,
    wallReferenceLevel: 20,
    assaults: 10,
    regenHours: 72,
    maxDistanceFromMember: 40,
    bonuses: { productionPct: 10, armySpeedPct: 5, carryPct: 10, garrisonDefensePct: 10 }
  },

  // Achats intégrés : vérifiés côté serveur auprès de RevenueCat (clé secrète), avantages de l'abonnement « Plus »
  purchases: {
    revenuecatSecret: process.env.REVENUECAT_SECRET_KEY || '',
    webhookAuth: process.env.REVENUECAT_WEBHOOK_AUTH || '',
    premiumEntitlement: process.env.PREMIUM_ENTITLEMENT || 'plus',
    perks: { extraBuildQueue: 1, productionBonus: 0.05 }
  },

  // E-mail (address verification, password reset). provider: log (dev/tests) | smtp | resend.
  // When a real provider is configured, trading with other players requires a verified address.
  email: {
    provider: process.env.EMAIL_PROVIDER || 'log',
    from: process.env.EMAIL_FROM || 'Imperium Antiquitas <no-reply@imperium-antiquitas.local>',
    smtpUrl: process.env.SMTP_URL || '',
    resendKey: process.env.RESEND_API_KEY || '',
    logFile: process.env.EMAIL_LOG_FILE || '',
    publicUrl: process.env.PUBLIC_URL || `http://localhost:${parseInt(process.env.PORT, 10) || 3000}`,
    enforce: ['smtp', 'resend'].includes(process.env.EMAIL_PROVIDER || 'log') && process.env.REQUIRE_VERIFIED_EMAIL !== 'false'
  },

  // Map
  map: {
    baseWorldSize: 374,
    minCoord: -187,
    maxCoord: 186,
    expansionPerPlayer: 10,
    // Carte d'un serveur neuf (base vide) : WORLD_SEED de 0 (carte de référence) à 2147483646, vide = tirée au hasard ;
    // ignorée dès que le monde a sa carte (src/game/world.js). 0 est une graine valable : pas de parseInt || défaut.
    worldSeed: process.env.WORLD_SEED === undefined || process.env.WORLD_SEED === '' ? null : process.env.WORLD_SEED,
    maxPlayers: 5000,
    spawnEdgeDelta: 100,
    // Gold nodes (GDD resource_points.json): a small stock of gold per level that refills in 12 h, guarded like the others
    goldNode: { lootByLevel: { 1: 10, 2: 20, 3: 30 }, intervalHours: 12 },
    // Resource nodes: base stock by level (× 0.8-1.2 at seed), max = base × maxFactor, refilled in regenHours
    resourceNode: { baseAmountByLevel: { 1: 1500, 2: 4000, 3: 8000 }, maxFactor: 1.5, regenHours: 4 },
    // Camps (tribes): size × difficulty from the edge of the map (new players) to the centre (end game), ± variation between camps
    camps: { difficultyEdge: 0.5, difficultyCenter: 1.3, variationPct: 20 }
  },

  // Rate limiting (keyed by player once authenticated, by IP otherwise — mobile carriers share IPs)
  rateLimit: {
    windowMs: 60 * 1000,
    maxAuth: parseInt(process.env.RATE_MAX_AUTH, 10) || 20,
    maxRegister: parseInt(process.env.RATE_MAX_REGISTER, 10) || 10,   // sign-ups per IP per minute
    maxApi: parseInt(process.env.RATE_MAX_API, 10) || 240,
    loginMaxFailures: 10,        // failed logins on one e-mail before it is locked...
    loginLockMinutes: 15         // ...for this long (same 429 whether the account exists or not)
  },

  // Market rules (anti multi-account feeding): offers need a Market, bounded ratios, bounded count
  market: {
    maxRatio: 3,                 // 1:3 ... 3:1 between the two sides of an offer
    maxActiveOffers: 10,
    requireBuilding: true,       // MARKET level >= 1 to post / accept offers and to send resources
    // décision du 27 octobre 2026 (GDD economy_config.market)
    offerHours: 48,              // une offre non prise revient au vendeur
    p2pTaxPctBase: 10,           // taxe des échanges entre joueurs, −1 % par niveau du Comptoir, −0,25 % par niveau de la Chambre au Trésor
    treasureTaxReductionPctPerLevel: 0.25,
    routes: { intervalHours: 2, pctOfStoragePer24h: 100, convoySpeed: 60, maxPerPlayer: 10 }   // routes entre ses villes : 100 % du stockage en 24 h au plus
  },

  // Generic input bounds
  limits: {
    maxAmount: 1e9,
    maxRecruitCount: 10000
  },

  // City layout: ring slots 1-19 (0 = Main Hall), typed field slots 101-118
  city: {
    maxSlot: 19,
    // Founding a secondary city on a resource node (GDD): resources carried by the founding army, deposited in the new city
    foundationTransport: { wood: 3000, stone: 3000, iron: 3000, food: 3000 },
    maxSecondaryCities: 3,
    // Main Hall cap in a secondary city (the capital alone goes to 30); every other building is capped by the Main Hall
    secondaryMainHallMaxLevel: 20,
    fieldSlots: {
      LUMBER: [101, 102, 103, 104],
      QUARRY: [105, 106, 107, 108],
      IRON_MINE: [109, 110, 111, 112],
      FARM: [113, 114, 115, 116, 117, 118]
    }
  },

  // Build queue
  build: {
    maxRunning: 2,
    maxQueued: 2,
    costMultiplierBase: 1.28,   // was 1.5 → L20 = ~100x base (Travian-like)
    timeMultiplierBase: 1.2     // was 1.8 → L20 = ~32x base (Travian-like)
  },

  // Recruit (GDD v4 values)
  recruit: {
    // Per-class base costs (GDD formulas.json)
    baseCosts: {
      INFANTRY: { wood: 30, stone: 20, iron: 55, food: 20 },
      ARCHER:   { wood: 60, stone: 20, iron: 25, food: 20 },
      CAVALRY:  { wood: 45, stone: 35, iron: 50, food: 30 },
      SIEGE:    { wood: 140, stone: 160, iron: 180, food: 60 }
    },
    // Tier cost multipliers (GDD formulas.json)
    tierCostMultipliers: { base: 1.0, intermediate: 1.8, elite: 3.2, siege: 4.0 },
    // Per-class base training times in seconds (GDD unit_training_times.json)
    baseTimeSec: {
      INFANTRY: 360,
      ARCHER: 360,
      CAVALRY: 432,
      SIEGE: 1200
    },
    // Tier time multipliers (GDD unit_training_times.json)
    tierTimeMultipliers: { base: 1.0, intermediate: 1.6, elite: 2.7, siege: 3.0 },
    siegeWorkshopLevel: 5,
    maxBatchesPerBuilding: 5     // recruit batches waiting in one building (each batch is paid up front)
  },

  // Combat (GDD combat_config.json + formulas)
  combat: {
    maxRounds: 15,
    roundDamageFactor: 0.18,     // fraction of the damage applied per round (otherwise mutual annihilation in 1-2 rounds)
    defenseDamageMult: 0.55,     // GDD DAMAGE_DEF_MULT: damage per hit = ATK × mods − 0.55 × DEF
    minDamageRatio: 0.2,         // a hit always deals at least 20% of the raw attack
    targetingPriority: ['elite', 'intermediate', 'base', 'siege'],
    // Siège (décision du 25 octobre 2026) : l'armée qui attaque une ville campe 1 h devant elle, puis le combat démarre
    // tout seul. Pendant l'heure, la ville vit normalement ; n'importe quel joueur peut attaquer le camp. Au combat, le
    // mur sert de bouclier : tant qu'il tient, les coups de l'attaquant tombent sur lui, les engins le frappent bien plus
    // fort que les soldats ; son bonus de défense baisse avec ses PV.
    siege: {
      campMinutes: 60,                // durée du camp avant le combat
      minEngines: 1,                  // pas de siège sans au moins un engin
      wallShield: {
        engineMult: 1,                // coups d'un engin sur le mur : toute sa force...
        soldierMult: 0.1              // ...ceux d'un soldat : un dixième (un engin frappe le mur 10 fois plus fort)
      }
    },
    // Rencontres (décision du 25 octobre 2026) : deux armées de joueurs ennemis déclarés sur la même case au même moment se
    // battent, même en marche ; les positions sont échantillonnées toutes les sampleSeconds entre deux ticks
    encounters: { sampleSeconds: 5, lookBackSeconds: 60, meetDistance: 0.5, rematchMinutes: 30, maxRoutesPerTick: 150, routeTimeBudgetMs: 2000, routeCacheSize: 5000 },
    // Vies d'une ville (décision d'octobre 2026) : chaque combat gagné par l'attaquant lui ôte une vie (City.wallStructure,
    // part des vies restantes) et la même part des PV de son mur ; tout remonte de 0 à 100 % en 48 h. À la dernière vie,
    // une ville secondaire est détruite, une capitale est déplacée au hasard près du bord de la carte (jamais prise).
    fall: {
      assaults: { capital: 4, secondary: 2 },   // vies : capitale 4, ville secondaire 2...
      extraAssaults: { EGYPT: 1 },              // ...une de plus pour les villes égyptiennes (5 et 3)
      regenHours: 48,                           // de 0 à toutes ses vies en 48 h
      pillagePct: 25                            // part du stock pillable enlevée par un combat gagné, dans la limite de ce que l'armée porte (25 %, décision du 25 octobre 2026)
    },
    wallHpPerLevel: 1000,
    wallRegenHours: 24,          // GDD: the wall fully regenerates in 24h
    wallBonusPerLevel: 0.01,     // GDD: +1% defender defense per wall level
    moatBonusPerLevel: 0.005,    // GDD: +0.5% defender attack and defense per moat level
    heroBonusPerPoint: 0.001,    // +0.1 % per hero point (décision du 27 octobre 2026 : 50 points pour le plafond)...
    heroBonusMax: 0.05,          // ...capped at +5 % per stat (GDD)
    heroEquipmentPerPoint: 0.005, // equipment: +0.5 % per item point...
    heroEquipmentMax: 0.05,       // ...capped at +5 % apart (GDD « équipement plafonné à 5 % »)
    heroXpPerKill: 0.25,         // GDD: XP per enemy unit destroyed
    heroXpPerTribeKill: 1,       // XP per tribe unit destroyed when clearing a resource node
    heroMaxLevel: 30,
    winnerLossMultiplier: 0.3,
    tribeLossMultiplier: 0.15,   // winner's losses against a tribe (camp): half of a raid, the camp is a static target (docs/EQUILIBRAGE.md § 9)
    loserLossRate: 0.30,         // GDD raid rule: the fight stops once a side is below 70%
    raidLootPctOfCarry: 0.30,    // GDD: a raid carries away at most 30% of the army's capacity
    raidCooldownHours: 24,       // GDD: one raid per target city per attacker per 24h
    tierCoefficients: { base: 1.0, intermediate: 1.25, elite: 1.55, siege: 0.75 },  // équilibrage oct. 2026 : l'élite vaut plus par unité d'entretien (docs/EQUILIBRAGE.md)
    // Combat triangle (GDD combat_config.json), applied per attacker class / target class pair
    triangle: {
      INFANTRY_vs_CAVALRY: 1.20,
      CAVALRY_vs_ARCHER: 1.20,
      ARCHER_vs_INFANTRY: 1.20
    }
  },

  // Expeditions
  expedition: {
    powerDivisor: 7,             // army power / 7 ≈ 10 per base unit, 20 per intermediate, 35 per elite
    lossPctPerDifficulty: 0.02   // 2% of each unit group lost per difficulty level
  },

  // Tick (game loop)
  tick: {
    intervalMs: 30000,
    tickHours: 30 / 3600,
    leaseMs: 90000,              // only one process runs the tick: lease stored in the TickLock table
    maxCatchUpHours: 6,          // after a restart or a late tick, production is caught up on real elapsed time, up to this
    claimTimeoutMinutes: 5,      // an arrival whose resolution did not finish in this time is sent home
    populationIntervalMinutes: 10,
    expeditionsForActiveDays: 7, // new expeditions only for players seen in the last N days
    harvestPerTick: 50,          // 100/min at 30s ticks
    regenDelayMinutes: 5,
    tribeRespawnDelayMinutes: 10,
    tribeReinforceMinutes: 60,   // a camp left weak (failed assault, respawn on a depleted node) grows back to the strength of the current stock
    retentionDays: { reports: 30, expeditions: 7, offers: 30, analytics: 90, notifications: 30 }
  },

  // Army
  army: {
    baseSpeedTilesPerSec: 1 / 30,  // 1 tile per 30 seconds at speed 50
    baseSpeed: 50,
    upkeepPerTier: { base: 5, intermediate: 10, elite: 15, siege: 15 },  // GDD economy_config.json
    starvationIntervalHours: 1,    // famine façon Travian (décision du 28 octobre 2026) : vérifiée une fois par heure
    famineAlertHours: 6,           // alerte quand le grenier sera vide dans moins de 6 h
    siegeUpkeepPct: { attacker: 10, defender: -10 }   // GDD economy_config.upkeep.siegeModifiersPct
  },

  // Wounded
  wounded: {
    baseRate: 0.30,
    bonusPerHealingLevel: 0.03,
    maxRate: 0.70,
    baseHealMinutes: 30,
    bedsPerLevel: 200,   // lits de la Tente de soins par niveau (GDD : capacité limitée, surplus en file d'attente)
    healLevelReduction: 0.95
  },

  // City tiers follow the Main Hall level (October 2026: the main building makes the walls evolve); the Wall building keeps
  // its defensive value (bonus, hit points, siege target) but no longer sets the city's look, tier or siege minimum
  cityTiers: [
    { minMainHall: 0, tier: 1, name: 'Village', minSiege: 1 },
    { minMainHall: 10, tier: 2, name: 'Ville', minSiege: 10 },
    { minMainHall: 20, tier: 3, name: 'Ville Fortifiée', minSiege: 20 }
  ],

  // Hideout (GDD: 1% of the stock hidden per level, 20% max)
  hideout: {
    protectionPerLevel: 0.01,
    maxProtection: 0.20,
    raidStealRate: 0.5
  },

  // Valid factions
  validFactions: ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN']
};

// Security: the JWT secret is mandatory and must be strong, whatever the environment (a server deployed
// without NODE_ENV=production must not silently fall back to a public default). Only an explicit
// NODE_ENV=development or test may run without one.
const DEV_ENV = process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
if (!config.jwtSecret || config.jwtSecret.length < 32) {
  if (DEV_ENV && !config.jwtSecret) {
    config.jwtSecret = 'dev-only-secret-not-for-production-use-0000000000';
    console.warn('WARN: JWT_SECRET absent, secret de développement utilisé (NODE_ENV=' + process.env.NODE_ENV + ')');
  } else {
    console.error(`FATAL: JWT_SECRET doit être défini et faire au moins 32 caractères (NODE_ENV=${process.env.NODE_ENV || 'non défini'}). Exemple : openssl rand -hex 32`);
    process.exit(1);
  }
}

module.exports = config;
