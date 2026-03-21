// ========== GAME TICK PROCESSOR ==========
// Runs every 30 seconds to process all game events
// Each subsystem is handled by its own processor module

const config = require('../config');
const { processHealedUnits } = require('../services/woundedService');
const { processResourceProduction, processUpkeep, processResourceRegen } = require('./processors/resourceProcessor');
const { processBuilds } = require('./processors/buildProcessor');
const { processRecruits } = require('./processors/recruitProcessor');
const { processExpeditions, generateNewExpeditions } = require('./processors/expeditionProcessor');
const { processArmyMovements } = require('./processors/armyProcessor');
const { processHarvesting, processTribeRespawn } = require('./processors/harvestProcessor');
const { updatePopulation, cleanupOrphanedFlags } = require('./processors/worldProcessor');

let tickRunning = false;

const TICK_TIMEOUT_MS = 25000; // 25s timeout (tick interval is 30s)

function withTimeout(promise, name) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error(`${name} timed out after ${TICK_TIMEOUT_MS}ms`)), TICK_TIMEOUT_MS))
  ]);
}

async function runProcessor(name, fn) {
  try {
    await withTimeout(fn(), name);
  } catch (e) {
    console.error(`[TICK] ${name} failed:`, e.message);
  }
}

async function gameTick() {
  if (tickRunning) return;
  tickRunning = true;

  const now = new Date();
  const TICK_HOURS = config.tick.tickHours;

  try {
    // Heal wounded units
    const healedCount = await processHealedUnits();
    if (healedCount > 0) console.log(`[TICK] ${healedCount} wounded unit groups healed`);

    // Resource production & upkeep
    await runProcessor('resourceProduction', () => processResourceProduction(TICK_HOURS));
    await runProcessor('upkeep', () => processUpkeep(TICK_HOURS));

    // Construction & recruitment queues
    await runProcessor('builds', () => processBuilds(now));
    await runProcessor('recruits', () => processRecruits(now));

    // Expeditions
    await runProcessor('expeditions', () => processExpeditions(now));
    await runProcessor('expeditionGen', () => generateNewExpeditions());

    // Army movement & combat
    await runProcessor('armyMovements', () => processArmyMovements(now));

    // Harvesting
    await runProcessor('harvesting', () => processHarvesting(now));

    // World state maintenance
    await runProcessor('cleanupOrphans', () => cleanupOrphanedFlags());
    await runProcessor('population', () => updatePopulation());
    await runProcessor('tribeRespawn', () => processTribeRespawn(now));
    await runProcessor('resourceRegen', () => processResourceRegen(now, TICK_HOURS));

  } catch (e) {
    console.error('Tick error:', e);
  } finally {
    tickRunning = false;
  }
}

function startGameLoop() {
  console.log(`[TICK] Game loop started (interval: ${config.tick.intervalMs}ms)`);
  return setInterval(gameTick, config.tick.intervalMs);
}

module.exports = { gameTick, startGameLoop };
