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
    await processResourceProduction(TICK_HOURS);
    await processUpkeep(TICK_HOURS);

    // Construction & recruitment queues
    await processBuilds(now);
    await processRecruits(now);

    // Expeditions
    await processExpeditions(now);
    await generateNewExpeditions();

    // Army movement & combat
    await processArmyMovements(now);

    // Harvesting
    await processHarvesting(now);

    // World state maintenance
    await cleanupOrphanedFlags();
    await updatePopulation();
    await processTribeRespawn(now);
    await processResourceRegen(now, TICK_HOURS);

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
