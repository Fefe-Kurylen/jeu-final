// ========== WORLD STATE PROCESSOR ==========
// Population updates, orphan cleanup, retention

const prisma = require('../../config/database');
const config = require('../../config');

// Population of every player = 5 per building level (the per-city variant runs when a build completes)
let lastPopulationAt = 0;
async function updatePopulation(now = new Date(), force = false) {
  if (!force && now.getTime() - lastPopulationAt < config.tick.populationIntervalMinutes * 60000) return;
  lastPopulationAt = now.getTime();
  await prisma.$executeRaw`
    UPDATE "Player" p SET population = COALESCE(sub.pop, 0)
    FROM (
      SELECT c."playerId", SUM(cb.level * 5) as pop
      FROM "City" c
      JOIN "CityBuilding" cb ON cb."cityId" = c.id
      GROUP BY c."playerId"
    ) sub
    WHERE p.id = sub."playerId" AND p.population <> COALESCE(sub.pop, 0)
  `;
}

async function updatePlayerPopulation(db, playerId) {
  await db.$executeRaw`
    UPDATE "Player" p SET population = COALESCE((
      SELECT SUM(cb.level * 5) FROM "City" c JOIN "CityBuilding" cb ON cb."cityId" = c.id WHERE c."playerId" = ${playerId}
    ), 0) WHERE p.id = ${playerId}`;
}

async function cleanupOrphanedFlags() {
  const orphanedNodes = await prisma.$executeRaw`
    UPDATE "ResourceNode" SET "hasPlayerArmy" = false, "lastArmyDeparture" = ${new Date()}
    WHERE "hasPlayerArmy" = true AND NOT EXISTS (
      SELECT 1 FROM "Army" a WHERE a."targetResourceId" = "ResourceNode".id AND a.status = 'HARVESTING'
    )
  `;
  if (orphanedNodes > 0) console.log(`[CLEANUP] ${orphanedNodes} orphaned hasPlayerArmy flags reset`);
}

// Old reports, finished expeditions, closed offers and analytics would otherwise grow without bound
let lastPurgeAt = 0;
async function purgeOldRecords(now) {
  if (now.getTime() - lastPurgeAt < 3600000) return;
  lastPurgeAt = now.getTime();
  const days = (n) => new Date(now.getTime() - n * 86400000);
  const r = config.tick.retentionDays;
  const [reports, spy, expeditions, offers, analytics] = await Promise.all([
    prisma.battleReport.deleteMany({ where: { createdAt: { lt: days(r.reports) } } }),
    prisma.spyReport.deleteMany({ where: { createdAt: { lt: days(r.reports) } } }),
    prisma.expedition.deleteMany({ where: { status: { in: ['COMPLETED', 'EXPIRED'] }, createdAt: { lt: days(r.expeditions) } } }),
    prisma.marketOffer.deleteMany({ where: { status: { in: ['COMPLETED', 'CANCELLED'] }, createdAt: { lt: days(r.offers) } } }),
    prisma.analyticsEvent.deleteMany({ where: { createdAt: { lt: days(r.analytics) } } }),
    prisma.rateLimitBucket.deleteMany({ where: { windowStart: { lt: days(1) } } }),
    prisma.authToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } })
  ]);
  const total = reports.count + spy.count + expeditions.count + offers.count + analytics.count;
  if (total > 0) console.log(`[PURGE] ${reports.count} rapports, ${spy.count} espionnages, ${expeditions.count} expéditions, ${offers.count} offres, ${analytics.count} événements supprimés`);
}

module.exports = { updatePopulation, updatePlayerPopulation, cleanupOrphanedFlags, purgeOldRecords };
