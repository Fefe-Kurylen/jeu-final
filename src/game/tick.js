// ========== GAME TICK PROCESSOR ==========
// Runs every 30 seconds to process all game events
// Each subsystem is handled by its own processor module

const os = require('os');
const config = require('../config');
const prisma = require('../config/database');
const { processHealedUnits } = require('../services/woundedService');
const { processResourceProduction, processUpkeep, processResourceRegen, processWallRegen, processGoldIncome } = require('./processors/resourceProcessor');
const { processBuilds, syncAllCityStorage } = require('./processors/buildProcessor');
const { processRecruits } = require('./processors/recruitProcessor');
const { processResearch } = require('./processors/researchProcessor');
const { processExpeditions, generateNewExpeditions } = require('./processors/expeditionProcessor');
const { processArmyMovements } = require('./processors/armyProcessor');
const { processSieges, retryPendingFalls } = require('./processors/siegeProcessor');
const { processHarvesting, processTribeRespawn } = require('./processors/harvestProcessor');
const { updatePopulation, cleanupOrphanedFlags, purgeOldRecords } = require('./processors/worldProcessor');

let tickRunning = false;
const LEASE_OWNER = `${os.hostname()}:${process.pid}`;

// A single executor at a time, across processes and deployments: the lease lives in the DB.
// Returns null when another live process holds it (e.g. the previous instance during a rollout),
// otherwise the number of hours elapsed since the previous tick, measured on the database clock
// and capped: production, upkeep and wall regeneration are computed on real time, so a late tick,
// a restart or a deployment never loses (nor duplicates) production.
async function acquireTickLease() {
  const until = new Date(Date.now() + config.tick.leaseMs);
  const rows = await prisma.$queryRaw`
    WITH prev AS (SELECT "lastTickAt" FROM "TickLock" WHERE id = 1)
    INSERT INTO "TickLock" (id, owner, "lockedUntil", "lastTickAt") VALUES (1, ${LEASE_OWNER}, ${until}, (NOW() AT TIME ZONE 'UTC'))
    ON CONFLICT (id) DO UPDATE SET owner = EXCLUDED.owner, "lockedUntil" = EXCLUDED."lockedUntil", "lastTickAt" = (NOW() AT TIME ZONE 'UTC')
    WHERE "TickLock".owner = EXCLUDED.owner OR "TickLock"."lockedUntil" < (NOW() AT TIME ZONE 'UTC')
    RETURNING (SELECT "lastTickAt" FROM prev) AS prev, (NOW() AT TIME ZONE 'UTC') AS now`;
  if (rows.length !== 1) return null;
  const prev = rows[0].prev ? new Date(rows[0].prev).getTime() : null;
  const now = new Date(rows[0].now).getTime();
  if (!prev) return config.tick.tickHours;
  const elapsedHours = (now - prev) / 3600000;
  return Math.min(config.tick.maxCatchUpHours, Math.max(0, elapsedHours));
}

// Renews the lease between two steps; false when another process took it over (this tick must stop)
async function renewTickLease() {
  const until = new Date(Date.now() + config.tick.leaseMs);
  const n = await prisma.$executeRaw`UPDATE "TickLock" SET "lockedUntil" = ${until} WHERE id = 1 AND owner = ${LEASE_OWNER} AND "lockedUntil" >= ${new Date()}`;
  return n === 1;
}

async function releaseTickLease() {
  await prisma.$executeRaw`UPDATE "TickLock" SET "lockedUntil" = ${new Date()} WHERE id = 1 AND owner = ${LEASE_OWNER}`;
}

// Each step is isolated: a failure in one subsystem must not skip the others for this tick.
// The lease is renewed first: if another process holds it now, the rest of this tick is abandoned.
class LeaseLost extends Error {}
async function step(name, fn) {
  if (!(await renewTickLease())) throw new LeaseLost(`lease lost before step ${name}`);
  try { return await fn(); } catch (e) { console.error(`[TICK] ${name} error:`, e); }
}

async function gameTick() {
  if (tickRunning) return;
  tickRunning = true;

  const now = new Date();

  try {
    let TICK_HOURS = null;
    try { TICK_HOURS = await acquireTickLease(); } catch (e) { console.error('[TICK] lease error:', e.message); return; }
    if (TICK_HOURS === null) { console.warn('[TICK] lease held by another process, skipping'); return; }
    if (TICK_HOURS > config.tick.tickHours * 4) console.log(`[TICK] catching up ${(TICK_HOURS * 60).toFixed(1)} min of game time`);

    // a fall that failed after its assault is done first, before builds, research or expeditions touch the doomed city
    await step('falls', () => retryPendingFalls());

    const healedCount = await step('heal', () => processHealedUnits());
    if (healedCount > 0) console.log(`[TICK] ${healedCount} wounded unit groups healed`);

    await step('production', () => processResourceProduction(TICK_HOURS));
    await step('upkeep', () => processUpkeep(TICK_HOURS, now));
    await step('wallRegen', () => processWallRegen(TICK_HOURS));
    await step('gold', () => processGoldIncome(TICK_HOURS));

    await step('builds', () => processBuilds(now));
    await step('recruits', () => processRecruits(now));
    await step('research', () => processResearch(now));

    await step('expeditions', () => processExpeditions(now));
    await step('newExpeditions', () => generateNewExpeditions());

    await step('sieges', () => processSieges(now, TICK_HOURS));   // walls worn down, assault times updated
    await step('armies', () => processArmyMovements(now));
    await step('harvest', () => processHarvesting(now));

    await step('flags', () => cleanupOrphanedFlags());
    await step('population', () => updatePopulation(now));
    await step('tribeRespawn', () => processTribeRespawn(now));
    await step('regen', () => processResourceRegen(now, TICK_HOURS));
    await step('purge', () => purgeOldRecords(now));
  } catch (e) {
    if (e instanceof LeaseLost) console.warn('[TICK]', e.message);
    else console.error('[TICK] error:', e);
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
