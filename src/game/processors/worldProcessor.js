// ========== WORLD STATE PROCESSOR ==========
// Population updates, orphan cleanup

const prisma = require('../../config/database');

async function updatePopulation() {
  await prisma.$executeRaw`
    UPDATE "Player" p SET population = COALESCE(sub.pop, 0)
    FROM (
      SELECT c."playerId", SUM(cb.level * 5) as pop
      FROM "City" c
      JOIN "CityBuilding" cb ON cb."cityId" = c.id
      GROUP BY c."playerId"
    ) sub
    WHERE p.id = sub."playerId"
  `;
}

async function cleanupOrphanedFlags() {
  const orphanedNodes = await prisma.$executeRaw`
    UPDATE "ResourceNode" SET "hasPlayerArmy" = false, "lastArmyDeparture" = NOW()
    WHERE "hasPlayerArmy" = true AND id NOT IN (
      SELECT "targetResourceId" FROM "Army" WHERE "targetResourceId" IS NOT NULL AND status = 'HARVESTING'
    )
  `;
  if (orphanedNodes > 0) console.log(`[CLEANUP] ${orphanedNodes} orphaned hasPlayerArmy flags reset`);
}

module.exports = { updatePopulation, cleanupOrphanedFlags };
