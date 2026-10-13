// ========== WORLD STATE PROCESSOR ==========
// Population updates, orphan cleanup, retention

const prisma = require('../../config/database');
const config = require('../../config');

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

// Old reports, finished expeditions and closed offers would otherwise grow without bound
let lastPurgeAt = 0;
async function purgeOldRecords(now) {
  if (now.getTime() - lastPurgeAt < 3600000) return;
  lastPurgeAt = now.getTime();
  const days = (n) => new Date(now.getTime() - n * 86400000);
  const r = config.tick.retentionDays;
  const [reports, spy, expeditions, offers] = await Promise.all([
    prisma.battleReport.deleteMany({ where: { createdAt: { lt: days(r.reports) } } }),
    prisma.spyReport.deleteMany({ where: { createdAt: { lt: days(r.reports) } } }),
    prisma.expedition.deleteMany({ where: { status: { in: ['COMPLETED', 'EXPIRED'] }, createdAt: { lt: days(r.expeditions) } } }),
    prisma.marketOffer.deleteMany({ where: { status: { in: ['COMPLETED', 'CANCELLED'] }, createdAt: { lt: days(r.offers) } } })
  ]);
  const total = reports.count + spy.count + expeditions.count + offers.count;
  if (total > 0) console.log(`[PURGE] ${reports.count} rapports, ${spy.count} espionnages, ${expeditions.count} expéditions, ${offers.count} offres supprimés`);
}

module.exports = { updatePopulation, cleanupOrphanedFlags, purgeOldRecords };
