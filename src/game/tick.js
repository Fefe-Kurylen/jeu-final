// ========== GAME TICK PROCESSOR ==========
// Runs every 30 seconds to process all game events
// Each subsystem is handled by its own processor module

const os = require('os');
const config = require('../config');
const prisma = require('../config/database');
const { processHealedUnits } = require('../services/woundedService');
const { processResourceProduction, processUpkeep, processResourceRegen, processWallRegen } = require('./processors/resourceProcessor');
const { processBuilds, syncAllCityStorage } = require('./processors/buildProcessor');
const { processRecruits } = require('./processors/recruitProcessor');
const { processExpeditions, generateNewExpeditions } = require('./processors/expeditionProcessor');
const { processArmyMovements } = require('./processors/armyProcessor');
const { processHarvesting, processTribeRespawn } = require('./processors/harvestProcessor');
const { updatePopulation, cleanupOrphanedFlags, purgeOldRecords } = require('./processors/worldProcessor');

let tickRunning = false;
const LEASE_OWNER = `${os.hostname()}:${process.pid}`;

// A single executor at a time, across processes and deployments: the lease lives in the DB.
// Returns false when another live process holds it (e.g. the previous instance during a rollout).
async function acquireTickLease() {
  const until = new Date(Date.now() + config.tick.leaseMs);
  const n = await prisma.$executeRaw`
    INSERT INTO "TickLock" (id, owner, "lockedUntil") VALUES (1, ${LEASE_OWNER}, ${until})
    ON CONFLICT (id) DO UPDATE SET owner = EXCLUDED.owner, "lockedUntil" = EXCLUDED."lockedUntil"
    WHERE "TickLock".owner = EXCLUDED.owner OR "TickLock"."lockedUntil" < NOW()`;
  return n === 1;
}

async function releaseTickLease() {
  await prisma.$executeRaw`UPDATE "TickLock" SET "lockedUntil" = NOW() WHERE id = 1 AND owner = ${LEASE_OWNER}`;
}

// Each step is isolated: a failure in one subsystem must not skip the others for this tick
async function step(name, fn) {
  try { return await fn(); } catch (e) { console.error(`[TICK] ${name} error:`, e); }
}

async function gameTick() {
  if (tickRunning) return;
  tickRunning = true;

  const now = new Date();
  const TICK_HOURS = config.tick.tickHours;

  try {
    let leased = false;
    try { leased = await acquireTickLease(); } catch (e) { console.error('[TICK] lease error:', e.message); return; }
    if (!leased) { console.warn('[TICK] lease held by another process, skipping'); return; }

    const healedCount = await step('heal', () => processHealedUnits());
    if (healedCount > 0) console.log(`[TICK] ${healedCount} wounded unit groups healed`);

    await step('production', () => processResourceProduction(TICK_HOURS));
    await step('upkeep', () => processUpkeep(TICK_HOURS, now));
    await step('wallRegen', () => processWallRegen(TICK_HOURS));

    await step('builds', () => processBuilds(now));
    await step('recruits', () => processRecruits(now));

    await step('expeditions', () => processExpeditions(now));
    await step('newExpeditions', () => generateNewExpeditions());

    await step('armies', () => processArmyMovements(now));
    await step('harvest', () => processHarvesting(now));

    await step('flags', () => cleanupOrphanedFlags());
    await step('population', () => updatePopulation());
    await step('tribeRespawn', () => processTribeRespawn(now));
    await step('regen', () => processResourceRegen(now, TICK_HOURS));
    await step('purge', () => purgeOldRecords(now));
  } finally {
    tickRunning = false;
  }
}

function startGameLoop() {
  console.log(`[TICK] Game loop started (interval: ${config.tick.intervalMs}ms)`);
  // Réparation unique : resynchronise le stockage des villes existantes (fix du bug maxStorage figé à 1000)
  syncAllCityStorage().catch(e => console.error('[STORAGE] Erreur sync:', e.message));
  return setInterval(gameTick, config.tick.intervalMs);
}

module.exports = { gameTick, startGameLoop, releaseTickLease };
