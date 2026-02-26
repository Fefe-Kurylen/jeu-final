// ========== GAME CONFIGURATION ==========
// Centralized config to avoid magic numbers scattered across code

const IS_PRODUCTION = process.env.NODE_ENV === 'production';

const config = {
  // Server
  port: parseInt(process.env.PORT, 10) || 3000,
  isProduction: IS_PRODUCTION,
  jwtSecret: process.env.JWT_SECRET || 'monjeu-secret-change-this',
  jwtExpiry: '7d',

  // Map
  map: {
    baseWorldSize: 374,
    minCoord: -187,
    maxCoord: 186,
    expansionPerPlayer: 10,
    maxPlayers: 5000,
    spawnEdgeDelta: 100
  },

  // Rate limiting
  rateLimit: {
    windowMs: 60 * 1000,
    maxAuth: 5,   // 5 login attempts per minute (was 10 - too weak)
    maxApi: 60    // 60 API requests per minute (was 100)
  },

  // Build queue
  build: {
    maxRunning: 2,
    maxQueued: 2,
    costMultiplierBase: 1.28,   // was 1.5 → L20 = ~100x base (Travian-like)
    timeMultiplierBase: 1.2     // was 1.8 → L20 = ~32x base (Travian-like)
  },

  // Recruit
  recruit: {
    tierMultipliers: { base: 1.3, intermediate: 1.7, elite: 1.9 },
    baseTimeSec: { base: 60, intermediate: 120, elite: 180 },
    cavalryTimeMultiplier: 1.25
  },

  // Combat
  combat: {
    maxRounds: 10,
    wallBonusPerLevel: 0.03,
    moatBonusPerLevel: 0.02,
    heroBonusPerPoint: 0.01,
    winnerLossMultiplier: 0.3,
    loserLossBase: 0.7,
    loserLossRandom: 0.3,
    tierCoefficients: { base: 1.0, intermediate: 1.10, elite: 1.21, siege: 0.75 }
  },

  // Tick (game loop)
  tick: {
    intervalMs: 30000,
    tickHours: 30 / 3600,
    harvestPerTick: 50,   // 100/min at 30s ticks
    regenDelayMinutes: 5,
    tribeRespawnDelayMinutes: 10
  },

  // Army
  army: {
    baseSpeedTilesPerSec: 1 / 30,  // 1 tile per 30 seconds at speed 50
    baseSpeed: 50,
    upkeepPerTier: { base: 2.5, intermediate: 5, elite: 7.5, siege: 30 },
    starvationLossRate: 0.1
  },

  // Wounded
  wounded: {
    baseRate: 0.30,
    bonusPerHealingLevel: 0.03,
    maxRate: 0.70,
    baseHealMinutes: 30,
    healLevelReduction: 0.95
  },

  // City tiers
  cityTiers: [
    { minWall: 0, tier: 1, name: 'Village', minSiege: 1 },
    { minWall: 10, tier: 2, name: 'Ville', minSiege: 10 },
    { minWall: 15, tier: 3, name: 'Ville Fortifiée', minSiege: 20 }
  ],

  // Hideout
  hideout: {
    protectionPerLevel: 0.05,
    maxProtection: 1.0,
    raidStealRate: 0.5
  },

  // Valid factions
  validFactions: ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN']
};

// Security: Crash if JWT secret is default in production
if (config.isProduction && config.jwtSecret === 'monjeu-secret-change-this') {
  console.error('FATAL: Using default JWT secret in production! Set JWT_SECRET environment variable.');
  process.exit(1);
}

module.exports = config;
