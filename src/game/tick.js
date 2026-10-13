// ========== GAME TICK PROCESSOR ==========
// Runs every 30 seconds to process all game events
// Each subsystem is handled by its own processor module

const config = require('../config');
const { processHealedUnits } = require('../services/woundedService');
const { processResourceProduction, processUpkeep, processResourceRegen } = require('./processors/resourceProcessor');
const { processBuilds, syncAllCityStorage } = require('./processors/buildProcessor');
const { processRecruits } = require('./processors/recruitProcessor');
const { processExpeditions, generateNewExpeditions } = require('./processors/expeditionProcessor');
const { processArmyMovements } = require('./processors/armyProcessor');
const { processHarvesting, processTribeRespawn } = require('./processors/harvestProcessor');
const { updatePopulation, cleanupOrphanedFlags } = require('./processors/worldProcessor');

let tickRunning = false;

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
    const healedCount = await step('heal', () => processHealedUnits());
    if (healedCount > 0) console.log(`[TICK] ${healedCount} wounded unit groups healed`);

    await step('production', () => processResourceProduction(TICK_HOURS));
    await step('upkeep', () => processUpkeep(TICK_HOURS));

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

module.exports = { gameTick, startGameLoop };
