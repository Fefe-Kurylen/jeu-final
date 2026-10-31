// ========== GAME CONFIGURATION ==========
// Centralized config to avoid magic numbers scattered across code

const IS_PRODUCTION = process.env.NODE_ENV === 'production';
// Terrain partagé avec le client : la taille de la carte du monde en cours (config.map) en vient
const Terrain = require('../../frontend/js/shared/terrain.js');
// Longueur donnée pour la carte de référence de 374 cases, à la taille de la carte en cours
const onMapSize = (cells) => Math.round(cells * Terrain.WORLD_SIZE / Terrain.REFERENCE_SIZE);

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
    throttleMs: { attack_incoming: 2 * 60 * 1000, battle: 60 * 1000, build_done: 10 * 60 * 1000, city_fall: 0, siege_halt: 0, message: 30 * 1000, friend: 60 * 1000, announcement: 0 }   // a fall or a blocked homecoming always reaches the player, even right after a battle push
  },

  // Alliance (décision du 26 octobre 2026) : aide (1 minute au moins par aide), points d'alliance gagnés en aidant
  // (plafond par 24 h glissantes), demandes d'aide gardées 7 jours
  alliance: {
    helpMinSeconds: 60,
    helpPoints: 10,
    helpPointsDailyCap: 300,
    helpRequestMaxAgeDays: 7,
    healRequestEveryHours: 6,
    // 100 membres au plus (adhésion et invitation) : décision du 31 octobre 2026 (rapport de vérification), avant 60. La fin de
    // partie reste réglée pour 15 à 20 joueurs : un rassemblement garde 25 armées au plus
    maxMembers: 100,
    // Défi de la semaine (décision du 30 octobre 2026) : points d'alliance par membre pour les 3 premières ; seuls comptent
    // (score et récompense) les membres arrivés avant le vendredi 0 h de la semaine, heure de Paris (1 = lundi … 5 = vendredi).
    // Score = total des membres ÷ max(membres, challengeMinMembers) : décision du 31 octobre 2026 (rapport de vérification),
    // la plus grosse alliance ne gagne plus à coup sûr
    challengeMinMembers: 20,
    challengeRewardPoints: [750, 500, 250],
    challengeJoinDeadline: { day: 5, hour: 0 }
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
  // plus dur (mur bouclier 3 fois un mur 20, 10 vies qui remontent en 72 h) ; 7 jours avant d'en rebâtir un. Un assaut = un
  // rassemblement ou une armée seule ; garnison de 10 armées au plus (décision du 31 octobre 2026, rapport de vérification)
  // Cycle du serveur (décision du 28 octobre 2026, GDD world_config.server) : inscriptions 2 mois, 2 000 joueurs (31 octobre 2026) ; fin par
  // une Merveille façon Travian gardée par les Immortels
  // Invasions barbares (décision du 29 octobre 2026) : chaque week-end, du vendredi 18 h au dimanche 23 h (Paris), des
  // donjons de hordes apparaissent sur la carte ; contenu d'alliance (aucune attaque contre les joueurs). Donjon à 3 étages
  // (avant-poste, remparts, chef), garnisons qui s'usent au fil des attaques ; trésor partagé selon les dégâts.
  invasion: {
    startDay: 5, startHour: 18,          // vendredi 18 h (heure de Paris)
    endHour: 23,                         // dimanche 23 h (fin = vendredi + 2 jours)
    counts: { 1: 15, 2: 12, 3: 8, 4: 5, 5: 3 },                            // donjons par niveau
    // distance au centre : bords → niveau 1, centre → niveau 5 ; cases de la carte de 374, à la taille de la carte en cours
    // (× 420 / 374 sur les nouvelles cartes, décision du 31 octobre 2026)
    ringsRef: { 1: [150, 178], 2: [120, 150], 3: [90, 120], 4: [55, 90], 5: [22, 55] },
    get rings() { return Object.fromEntries(Object.entries(this.ringsRef).map(([level, [a, b]]) => [level, [onMapSize(a), onMapSize(b)]])); },
    // pose d'un donjon (services/hordeService.js placeLevel) : essais par donjon et par règle ; à clearCells cases au moins
    // des autres donjons, sites et plans, et d'abord des villes ; sur une carte pleine, sinon comme une ville (décision du
    // 31 octobre 2026, rapport de vérification)
    placement: { tries: 120, clearCells: 4 },
    floors: ['Avant-poste', 'Remparts', 'Chef de la horde'],
    floorTier: ['base', 'intermediate', 'elite'],
    floorPowerMult: [1, 2, 4],
    basePower: 15000, levelFactor: 2.5,  // puissance de l'avant-poste au niveau 1, × 2,5 par niveau
    // par ressource, au niveau 1 ; or 200 au niveau 1 (avant 40) : décision du 31 octobre 2026 (rapport de vérification)
    treasure: { resources: 8000, gold: 200, alliancePoints: 30, resourceFactor: 2.5, goldFactor: 2 },
    itemChance: [0.15, 0.25, 0.35, 0.5, 0.7],                               // objet rare au dernier coup, par niveau
    itemTier: ['COMMON', 'COMMON', 'RARE', 'EPIC', 'EPIC'],
    manualHours: 48,                      // invasion lancée par l'équipe
    // Âge du monde (décision du 30 octobre 2026) : mult = min(ageMax, 1 + ageFactorPerWeek × max(0, semaine − ageFromWeek)),
    // fixé au lancement de l'invasion ; au niveau L, × mult^((L − 1)/4) sur la puissance des étages et les ressources du trésor
    ageFactorPerWeek: 0.35, ageFromWeek: 3, ageMax: 6,
    // Force des donjons réglée sur les joueurs (décision du 30 octobre 2026, rapport économie, recommandation 9) : au
    // lancement, puissance médiane des joueurs actifs (vus dans les activeDays derniers jours, puissance > 0) ;
    // avant-poste du niveau 1 = max(minOutpost, médiane × outpostPctOfMedian %), puis × levelFactor par niveau
    // (étages ×1 / ×2 / ×4). Moins de minPlayers joueurs mesurés : formule de l'âge du monde ci-dessus. Le trésor garde l'âge du monde.
    // Vérifié pour une alliance de 15 à 20 joueurs (décision du 31 octobre 2026, rapport de vérification ; vrai moteur, armées
    // de la simulation au jour 175, +15 % de recherches et de Forge) : chef du niveau 1 battu par 2 joueurs, du niveau 4 par
    // 11, du niveau 5 par 19 (20 joueurs y suffisent 97 fois sur 100, un rassemblement plein d'une alliance de 20) : inchangé
    powerRef: { activeDays: 7, minPlayers: 5, outpostPctOfMedian: 50, minOutpost: 3000, levelFactor: 1.8 }
  },

  world: {
    registrationDays: Number(process.env.WORLD_REGISTRATION_DAYS) || 60,
    maxPlayers: 2000,   // décision du 31 octobre 2026 : 2 000 joueurs par serveur (avant 5 000)
    wonderSitesDay: Number(process.env.WONDER_SITES_DAY) || 120,
    wonderPlansDay: Number(process.env.WONDER_PLANS_DAY) || 150,
    wonderSites: 12,             // sites de Merveille autour du centre
    wonderPlans: 13,             // plans de construction (nécessaires au-delà du niveau 50)
    // anneaux (distance au centre, en cases) où apparaissent les sites et les plans, les mêmes sur toute taille de carte : le
    // cœur du monde reste aussi serré. Place mesurée sur la carte de 420 avec 2 000 joueurs et leurs colonies : chaque site
    // et chaque plan trouve sa case (décision du 31 octobre 2026, tools/measure-map-capacity.cjs)
    wonderSiteRing: [12, 30],
    wonderPlanRing: [35, 55],
    wonderMaxLevel: 100,
    planNeededAbove: 50,
    // coût et durée d'un niveau : base × facteur^(niveau − 1) ; tiré du stock de la Merveille, rempli par les armées de
    // transport de l'alliance. Coût divisé par deux (décision du 31 octobre 2026, rapport de vérification, M6 ; avant
    // 250 000 / 250 000 / 250 000 / 75 000) : la Merveille entière ≈ 1,08 G (niveaux 1 à 50 : 86 M)
    wonderCostBase: { wood: 125000, stone: 125000, iron: 125000, food: 37500 },
    wonderCostFactor: 1.05,
    wonderTimeBaseSec: 3600,
    wonderTimeFactor: 1.025,
    wonderLevelsLostPerAssault: 2,
    immortalWaveHours: 12,       // les Immortels attaquent chaque Ville Merveille toutes les 12 h
    // Immortels (décision du 30 octobre 2026, rapport économie, recommandation 8) : garnison d'un site, d'un plan, et vague
    // contre une Ville Merveille = immortalWaveBase × niveau^immortalWaveExp. Réglés pour une alliance de 15 à 20 joueurs
    // (décision du 31 octobre 2026, rapport de vérification ; vrai moteur et armées de la simulation, jours 120 à 175) :
    // un site se prend avec 47 à 35 % de son armée de 15 à 20 joueurs (3 M, inchangé), un plan avec 74 à 55 % (65 % à 17 ;
    // 5,75 M, avant 4,5 M : 58 à 43 %). Vagues : base 14 000 (décision du 31 octobre 2026, rapport de vérification ; 20 000
    // avant, puis 14 500 proposé) : derrière le mur 15 de la Ville Merveille, une alliance de 15 / 16 / 17 / 18 / 20 joueurs
    // tient le niveau 100 avec 89 / 85 / 82 / 76 / 68 % de son armée, 80 % en moyenne comme visé (14 500 : 92 / 88 / 85 /
    // 78 / 70 %) ; 2,75 M au niveau 50, 7,02 M au niveau 100 (avant, 16 joueurs plafonnaient au niveau 86 avec toute leur
    // armée)
    immortalSitePower: 3000000,
    immortalPlanPower: 5750000,
    immortalWaveBase: 14000,
    immortalWaveExp: 1.35
  },

  // Héros (décision du 27 octobre 2026) : résurrection au Domus payée selon le niveau du héros
  hero: {
    reviveCostPerLevel: { wood: 250, stone: 250, iron: 250, food: 150 },
    // XP (décision du 30 octobre 2026) : 100 XP pour le niveau 2, puis × 1,25 par niveau (au lieu de × 1,5)
    xpFirstLevel: 100,
    xpLevelFactor: 1.25
  },

  bastion: {
    minMembers: 15,
    cost: { wood: 500000, stone: 500000, iron: 500000, food: 250000 },
    buildDays: 3,
    cooldownDays: 7,
    // Mur bouclier et garnison façon fort barbare de Rise of Kingdoms (décision du 31 octobre 2026, rapport de vérification,
    // choix du propriétaire après la mesure) : mur 3 fois un mur 20, soit 60 000 PV (10 avant, 50 avant le 30 octobre), et
    // 10 armées au plus en garnison, celles en route et en sortie comprises (25 puis 17 proposées avant). Un rassemblement
    // ne prend qu'une armée par joueur : une alliance de 15 à 20 membres n'aligne que 15 à 20 armées. Mesure (vrai moteur,
    // armées de la simulation au jour 150, une armée = toute l'armée d'un joueur, 65 engins par armée avec l'Atelier 20,
    // 300 tirages) : contre une garnison pleine de 10 armées comme les siennes, un rassemblement de 15 / 16 / 17 / 18 / 20
    // armées prend une vie 4 / 19 / 50 / 83 / 100 % des fois (à 17 armées en garnison, 0 % jusqu'à 20 armées) ; sans
    // garnison, 5 armées suffisent (4 sous un chef du Sultanat). Le camp devant le Bastion peut être attaqué par les renforts
    // (mission « Briser le siège » de l'alliance et de ses alliés, sortie de la garnison), comme un siège de ville
    wallMultiplier: 3,
    maxGarrisonArmies: 10,
    sortieSeconds: 30,                          // sortie d'une armée de la garnison contre le camp ennemi : combat 30 s après (décision du 29 octobre 2026)
    wallReferenceLevel: 20,
    assaults: 10,
    regenHours: 72,
    maxDistanceFromMember: 40,
    bonuses: { productionPct: 10, armySpeedPct: 5, carryPct: 10, garrisonDefensePct: 10 }
  },

  // Rassemblement d'alliance (services/rallyService.js) : attentes possibles avant le départ, en minutes ; 120 et 180 ajoutées
  // pour les alliances dispersées (décision du 31 octobre 2026, rapport de vérification, M5)
  rally: {
    waitMinutes: [5, 10, 30, 60, 120, 180]
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
  // Taille de la carte : celle du monde en cours, fixée par le générateur de sa carte (frontend/js/shared/terrain.js,
  // SIZE_BY_GENERATOR, partagé avec le client) : 374 × 374 pour les mondes ouverts avant le 31 octobre 2026, 420 × 420 pour
  // les nouveaux (décision du 31 octobre 2026, rapport de vérification : 2 000 joueurs à 2 colonies, mesure dans
  // tools/measure-map-capacity.cjs). Les longueurs « Ref » sont données pour la carte de 374 cases et suivent la taille.
  map: {
    get worldSize() { return Terrain.WORLD_SIZE; },
    get minCoord() { return Terrain.MIN_COORD; },
    get maxCoord() { return Terrain.MAX_COORD; },
    // Carte d'un serveur neuf (base vide) : WORLD_SEED de 0 à 2147483646, vide = tirée au hasard ; ignorée dès que le monde
    // a sa carte (src/game/world.js). 0 est une graine valable : pas de parseInt || défaut.
    worldSeed: process.env.WORLD_SEED === undefined || process.env.WORLD_SEED === '' ? null : process.env.WORLD_SEED,
    // Bande de départ des capitales le long des bords : 100 cases sur la carte de 374 (112 sur celle de 420)
    spawnEdgeDeltaRef: 100,
    get spawnEdgeDelta() { return onMapSize(this.spawnEdgeDeltaRef); },
    // Pose d'une capitale (utils/spawn.js) : essais par côté et par règle (3 cases au moins d'un gisement où fonder, puis la
    // règle d'avant)
    spawn: { tries: 300 },
    // Semis des points d'un monde neuf (décision du 31 octobre 2026, rapport de vérification ; src/game/seed.js) : un point
    // seulement là où une ville 2 × 2 tient, à 3 cases au moins des autres points et des villes (chaque gisement reste
    // fondable, même à côté d'une colonie voisine) ; côté² × perCell points de ressource (au plus max), plus goldPct % de
    // camps d'or : 6 000 gisements et 780 camps d'or sur la carte de 420 (avant : 4 895 sur celle de 374, plafond 5 000,
    // posés n'importe où sur la terre ferme, dont 65 % fondables)
    nodeSeeding: { perCell: 0.035, max: 6000, goldPct: 13 },
    // Cercle du centre, disputé : rayon en % de la demi-largeur de la carte de base ; la plupart des gisements de niveau 3 et
    // les sites de Merveille y sont (semis des points, src/game/seed.js) ; drapeau « central » des sites libres (routes/map.js)
    centerRadiusPct: 35,
    // Gold nodes (GDD resource_points.json): a small stock of gold per level that refills in 12 h, guarded like the others
    goldNode: { lootByLevel: { 1: 10, 2: 20, 3: 30 }, intervalHours: 12 },
    // Resource nodes: base stock by level (× 0.8-1.2 at seed), max = base × maxFactor, refilled in regenHours
    resourceNode: { baseAmountByLevel: { 1: 1500, 2: 4000, 3: 8000 }, maxFactor: 1.5, regenHours: 4 },
    // Camps (tribes): size × difficulty from the edge of the map (new players) to the centre (end game), ± variation between camps
    camps: { difficultyEdge: 0.5, difficultyCenter: 1.3, variationPct: 20, goldDefenseBonusPct: 40 }   // camp d'or : +40 % au combat comme à l'affichage (décision du 30 octobre 2026)
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
    requireBuilding: true,       // MARKET level >= 1 (Marché de la capitale) to post / accept offers and to send resources
    // décision du 27 octobre 2026 (GDD economy_config.market) ; plus de marchands ni de routes entre ses villes (décision du
    // 31 octobre 2026, rapport de vérification) : les échanges et les envois sont portés par des armées
    offerHours: 48,              // une offre non prise revient au vendeur
    // taxe des échanges entre joueurs : 30 % (avant 10 %), −1 % par niveau du Comptoir, −0,25 % par niveau de la Chambre au
    // Trésor, soit 5 % avec les deux au niveau 20 (décision du 31 octobre 2026, rapport de vérification)
    p2pTaxPctBase: 30,
    treasureTaxReductionPctPerLevel: 0.25
  },

  // Generic input bounds
  limits: {
    maxAmount: 1e9,
    maxRecruitCount: 10000
  },

  // City layout: ring slots from 1 (0 = Main Hall), the Wall on the enclosure, typed field slots 101-118
  city: {
    // Emplacements de l'anneau (décision du 31 octobre 2026, remplace les 19 emplacements d'avant) : autant que de bâtiments
    // possibles, capitale 18 (emplacements 1 à 18), colonie 12 ; la Ville Merveille compte comme une colonie
    // (utils/calculations.js ringSlotsOf)
    ringSlots: { capital: 18, colony: 12 },
    // Mur sur l'enceinte (décision du 30 octobre 2026) : sa place fixe, hors de l'anneau et des champs 101-118
    wallSlot: 20,
    // Alertes d'aide au suivi (décision du 30 octobre 2026) : « File de construction vide » au plus une fois par ville toutes
    // les 6 h ; « dépôt plein dans 1 h » au plus une fois par ville toutes les 12 h
    idleAlertHours: 6,
    storageAlertHours: 12,
    storageAlertLeadHours: 1,
    // Founding a secondary city on a resource node (GDD): resources carried by the founding army, deposited in the new city
    foundationTransport: { wood: 3000, stone: 3000, iron: 3000, food: 3000 },
    maxSecondaryCities: 2,   // décision du 31 octobre 2026 : 2 colonies par joueur (+ la Ville Merveille, hors quota)
    // Colonie neuve protégée (décision du 31 octobre 2026, rapport de vérification) : ni attaque, ni raid, ni siège pendant
    // 72 h après sa fondation (City.createdAt) ; les espions passent, ses armées sortent librement. Ni la capitale ni la
    // Ville Merveille (utils/colonyProtection.js)
    newColonyProtectionHours: 72,
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
    timeMultiplierBase: 1.2,    // was 1.8 → L20 = ~32x base (Travian-like)
    // Décision du 30 octobre 2026 (rapport économie, recommandations 3 et 4) : les champs coûtent ×1,45 par niveau ;
    // les champs et le Bâtiment principal prennent ×1,30 de temps par niveau. Calcul : utils/calculations.js buildCostFor / buildSecondsFor
    fieldCostMultiplier: 1.45,
    fieldCostKeys: ['FARM', 'LUMBER', 'QUARRY', 'IRON_MINE'],
    slowTimeMultiplier: 1.30,
    slowTimeKeys: ['FARM', 'LUMBER', 'QUARRY', 'IRON_MINE', 'MAIN_HALL']
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
    maxBatchesPerBuilding: 5,    // recruit batches waiting in one building (each batch is paid up front)
    // Or des unités d'élite (décision du 31 octobre 2026) : de l'or par unité EN PLUS des ressources, par palier (les
    // engins et les autres paliers n'en demandent pas) ; pour compenser, le prix en ressources de l'élite est multiplié
    // par eliteResourceCostMult (utils/calculations.js recruitCostFor / recruitGoldFor). 2 or et ressources × 0,85 : décision
    // du 31 octobre 2026 (rapport de vérification, § 5), avant 1 or et × 0,95
    goldPerUnit: { elite: 2 },
    eliteResourceCostMult: 0.85
  },

  // Combat (GDD combat_config.json + formulas)
  combat: {
    maxRounds: 15,
    roundDamageFactor: 0.18,     // fraction of the damage applied per round (otherwise mutual annihilation in 1-2 rounds)
    // Moteur de bataille du GDD (option B, décision du 30 octobre 2026) : un coup fait ATK × coef × triangle, sans
    // soustraction ni plancher ; la solidité d'une unité vaut END + 0,55 × DEF × coef (le bonus du mur compte dans DEF) ;
    // les coups se répartissent sur tous les paliers selon leur solidité (décision du 30 octobre 2026), engins en dernier
    defenseDamageMult: 0.55,     // GDD DAMAGE_DEF_MULT : poids de la défense dans la solidité
    // Siège (décision du 25 octobre 2026) : l'armée qui attaque une ville campe 1 h devant elle, puis le combat démarre
    // tout seul. Pendant l'heure, la ville vit normalement ; n'importe quel joueur peut attaquer le camp. Au combat, le
    // mur sert de bouclier : tant qu'il tient, les coups de l'attaquant tombent sur lui et seuls les engins l'abîment ;
    // son bonus de défense baisse avec ses PV. Tombé, le combat dure encore roundsAfterBreach rounds au moins.
    siege: {
      campMinutes: 60,                // durée du camp avant le combat
      minEngines: 1,                  // pas de siège sans au moins un engin
      wallShield: {
        engineMult: 1,                // coups d'un engin sur le mur : toute sa force...
        soldierMult: 0                // ...ceux d'un soldat : rien, seuls les engins abîment le mur (GDD onlySiegeEnginesDamageWall, 30 octobre 2026)
      },
      roundsAfterBreach: 5            // le mur tombé, le combat dure encore 5 rounds au moins (décision du 30 octobre 2026)
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
    wallBonusPerLevel: 0.01,     // GDD: +1% defender defense per wall level
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
    // Coefficients de palier. PUISSANCE (pillages, camps, rencontres, hordes, affichage) : (ATK + DEF) × coef, équilibrage
    // d'oct. 2026 (docs/EQUILIBRAGE.md). BATAILLE (combat détaillé) : ceux du GDD, sur ATK et DEF (docs/RAPPORT-UNITES.md, option B)
    tierCoefficients: { base: 1.0, intermediate: 1.25, elite: 1.55, siege: 0.75 },
    battleTierCoefficients: { base: 1.0, intermediate: 1.35, elite: 1.9, siege: 0.75 },
    // Triangle (GDD combat_config.json), par classe qui frappe / classe frappée : +50 % depuis le 30 octobre 2026 (+20 % dans
    // le GDD ; sans cela la cavalerie, plus chère, ne bat plus les archers)
    triangle: {
      INFANTRY_vs_CAVALRY: 1.50,
      CAVALRY_vs_ARCHER: 1.50,
      ARCHER_vs_INFANTRY: 1.50
    }
  },

  // Expeditions
  expedition: {
    powerDivisor: 7,             // army power / 7 ≈ 10 per base unit, 20 per intermediate, 35 per elite
    lossPctPerDifficulty: 0.02,  // 2% of each unit group lost per difficulty level
    // Or d'une expédition gagnée (décision du 31 octobre 2026, rapport de vérification) : SEULEMENT si le héros la mène.
    // chance de trouver de l'or ; montant tiré entre (1 − spread) et (1 + spread) × (base + perDifficulty × difficulté),
    // soit 20 / 30 / 40 / 50 en moyenne quand il tombe : 10 / 15 / 20 / 25 or espérés pour les difficultés 1 à 4 (avant
    // 50 / 75 / 60 / 37,5, sans héros). Le talent Chasseur de trésors s'y ajoute (processors/expeditionProcessor.js)
    gold: { chance: 0.5, base: 10, perDifficulty: 10, spread: 0.5 }
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
    // GDD : 5 / 10 / 15 ; décision du 30 octobre 2026 (rapport économie, recommandation 5) : 5 / 9 / 13, engins 15
    upkeepPerTier: { base: 5, intermediate: 9, elite: 13, siege: 15 },
    starvationIntervalHours: 1,    // famine façon Travian (décision du 28 octobre 2026) : vérifiée une fois par heure
    famineAlertHours: 12,          // alerte quand les greniers du joueur seront vides dans moins de 12 h (décision du 30 octobre 2026), une fois par 12 h au plus
    siegeUpkeepPct: { attacker: 10, defender: -10 }   // GDD economy_config.upkeep.siegeModifiersPct
  },

  // Wounded
  wounded: {
    baseRate: 0.30,
    bonusPerHealingLevel: 0.03,
    maxRate: 0.70,
    bedsPerLevel: 200,   // lits de la Tente de soins de la capitale par niveau, pour toutes les villes (GDD : capacité limitée)
    healLevelReduction: 0.95,
    // Soins payants et plus lents (décision du 30 octobre 2026, rapport économie, recommandation 6) :
    // prix = 30 % du recrutement de l'unité ; durée par unité = 10 % de son temps de formation de base × 0,95^(Tente − 1) ;
    // soin immédiat en or par unité selon le palier ; les blessés en attente paient l'entretien
    healCostPct: 30,
    healTimePctOfTraining: 10,
    instantHealGoldPerTier: { base: 1, intermediate: 2, elite: 3, siege: 3 },
    woundedPayUpkeep: true
  },

  // City tiers follow the Main Hall level (October 2026: the main building makes the walls evolve); the Wall building keeps
  // its defensive value (bonus, hit points, siege target) but no longer sets the city's look, tier or siege minimum
  cityTiers: [
    { minMainHall: 0, tier: 1, name: 'Village' },
    { minMainHall: 10, tier: 2, name: 'Ville' },
    { minMainHall: 20, tier: 3, name: 'Ville Fortifiée' }
  ],

  // Cachette : la part du stockage de la ville mise à l'abri par niveau est dans data/buildings.json
  // (HIDEOUT.effects.hideoutStoragePctPerLevel, décision du 31 octobre 2026, rapport de vérification) ; un raid emporte au
  // plus la moitié de ce qui dépasse la cachette
  hideout: {
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
