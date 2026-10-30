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
      SELECT 1 FROM "Army" a WHERE a."targetResourceId" = "ResourceNode".id AND a.status IN ('HARVESTING', 'FOUNDING')
    )
  `;
  if (orphanedNodes > 0) console.log(`[CLEANUP] ${orphanedNodes} orphaned hasPlayerArmy flags reset`);
}

// Rapports de bataille, la plus grosse table : effacés par lots pour garder chaque transaction courte
const PURGE_BATCH = 5000;
async function purgeBattleReports(before) {
  let total = 0;
  for (;;) {
    const n = await prisma.$executeRaw`DELETE FROM "BattleReport" WHERE id IN (SELECT id FROM "BattleReport" WHERE "createdAt" < ${before} LIMIT ${PURGE_BATCH})`;
    total += n;
    if (n < PURGE_BATCH) return total;
  }
}

// Old reports, finished expeditions, closed offers and analytics would otherwise grow without bound
// (l'une après l'autre : le tick partage le pool de connexions avec les requêtes HTTP)
let lastPurgeAt = 0;
async function purgeOldRecords(now) {
  if (now.getTime() - lastPurgeAt < 3600000) return;
  lastPurgeAt = now.getTime();
  const days = (n) => new Date(now.getTime() - n * 86400000);
  const r = config.tick.retentionDays;
  const reports = await purgeBattleReports(days(r.reports));
  const spy = await prisma.spyReport.deleteMany({ where: { createdAt: { lt: days(r.reports) } } });
  const expeditions = await prisma.expedition.deleteMany({ where: { status: { in: ['COMPLETED', 'EXPIRED'] }, createdAt: { lt: days(r.expeditions) } } });
  const offers = await prisma.marketOffer.deleteMany({ where: { status: { in: ['COMPLETED', 'CANCELLED'] }, createdAt: { lt: days(r.offers) } } });
  const analytics = await prisma.analyticsEvent.deleteMany({ where: { createdAt: { lt: days(r.analytics) } } });
  await prisma.rateLimitBucket.deleteMany({ where: { windowStart: { lt: days(1) } } });
  await prisma.authToken.deleteMany({ where: { OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] } });
  await prisma.notification.deleteMany({ where: { createdAt: { lt: days(r.notifications || 30) } } });
  const chatCount = await require('../../services/chatService').purgeOldMessages(now).catch(() => 0);   // global 7 jours, le reste 90
  const helpCount = await require('../../services/allianceHelpService').purgeOld().catch(() => 0);   // demandes d'aide de plus de 7 jours
  await require('../../services/questService').purgeOld().catch(() => 0);   // compteurs de quêtes de plus de 14 jours
  const total = reports + spy.count + expeditions.count + offers.count + analytics.count + chatCount + helpCount;
  if (total > 0) console.log(`[PURGE] ${reports} rapports, ${spy.count} espionnages, ${expeditions.count} expéditions, ${offers.count} offres, ${analytics.count} événements, ${chatCount} messages, ${helpCount} demandes d'aide supprimés`);
}

module.exports = { updatePopulation, updatePlayerPopulation, cleanupOrphanedFlags, purgeOldRecords };
