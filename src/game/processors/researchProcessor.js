// ========== RESEARCH PROCESSOR ==========
// Completes the researches whose time is up (one transaction each, idempotent), then starts the next queued
// item of each player concerned. Technologies are per player (data/technologies.json, utils/techEffects.js).
const prisma = require('../../config/database');
const { notify } = require('../../services/pushService');
const T = require('../../utils/techEffects');

async function processResearch(now, { playerId = null } = {}) {
  const due = await prisma.researchQueueItem.findMany({ where: { status: 'RUNNING', endsAt: { lte: now }, city: { wallStructure: { gt: 0 } }, ...(playerId ? { playerId } : {}) }, orderBy: { endsAt: 'asc' }, take: 200 });   // ville qui va tomber : rien n'aboutit
  const players = new Set();
  for (const item of due) {
    try {
      const done = await prisma.$transaction(async (tx) => {
        // The item may have been consumed or cancelled by another executor meanwhile
        const taken = await tx.researchQueueItem.deleteMany({ where: { id: item.id, status: 'RUNNING' } });
        if (taken.count !== 1) return false;
        const current = await tx.playerTechnology.findUnique({ where: { playerId_techKey: { playerId: item.playerId, techKey: item.techKey } } });
        // A level never goes down because of a stale item
        if (!current) await tx.playerTechnology.create({ data: { playerId: item.playerId, techKey: item.techKey, level: item.targetLevel } });
        else if (current.level < item.targetLevel) await tx.playerTechnology.update({ where: { id: current.id }, data: { level: item.targetLevel } });
        return true;
      });
      if (!done) continue;
      players.add(item.playerId);
      const tech = T.techOf(item.techKey);
      notify(item.playerId, 'research_done', '📜 Recherche terminée', `${tech?.name || item.techKey} niveau ${item.targetLevel}`, { tab: 'city', cityId: item.cityId });
      console.log(`[RESEARCH] ${item.techKey} niveau ${item.targetLevel} terminé`);
    } catch (e) {
      // Nothing was written: the item stays RUNNING and is retried at the next tick
      console.error(`[RESEARCH ERROR] ${item.techKey}:`, e.message);
    }
  }
  // self-healing: a player whose running research disappeared (colony razed) gets his next queued one started
  // (the tick checks everyone, a player's own request only himself)
  const stuck = playerId
    ? await prisma.$queryRaw`SELECT DISTINCT q."playerId" FROM "ResearchQueueItem" q WHERE q."playerId" = ${playerId} AND q.status = 'QUEUED' AND NOT EXISTS (SELECT 1 FROM "ResearchQueueItem" r WHERE r."playerId" = q."playerId" AND r.status = 'RUNNING')`
    : await prisma.$queryRaw`SELECT DISTINCT q."playerId" FROM "ResearchQueueItem" q WHERE q.status = 'QUEUED' AND NOT EXISTS (SELECT 1 FROM "ResearchQueueItem" r WHERE r."playerId" = q."playerId" AND r.status = 'RUNNING')`;
  for (const s of stuck) players.add(s.playerId);
  for (const id of players) {
    try { await prisma.$transaction((tx) => startNextQueued(tx, id, now)); } catch (e) { console.error('[RESEARCH ERROR] start next:', e.message); }
  }
}

// The research queue is shared by all of a player's cities: every order on it (start, cancel, promotion, fall of a
// colony) holds this per-player lock until its transaction ends, so two of them never both see « nothing running ».
// Taken after any City lock of the caller, never before one.
const lockResearch = (tx, playerId) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'research:' + playerId}))`;

// Starts the oldest QUEUED item of a player when nothing is running; the duration fixed at enqueue time is kept.
// `tx` must be a transaction (the lock lasts until it ends).
async function startNextQueued(tx, playerId, now = new Date()) {
  await lockResearch(tx, playerId);
  const running = await tx.researchQueueItem.count({ where: { playerId, status: 'RUNNING' } });
  if (running > 0) return null;
  const next = await tx.researchQueueItem.findFirst({ where: { playerId, status: 'QUEUED' }, orderBy: { startedAt: 'asc' } });
  if (!next) return null;
  const durationMs = Math.max(1000, new Date(next.endsAt).getTime() - new Date(next.startedAt).getTime());
  const ok = await tx.researchQueueItem.updateMany({ where: { id: next.id, status: 'QUEUED' }, data: { status: 'RUNNING', startedAt: now, endsAt: new Date(now.getTime() + durationMs) } });
  return ok.count === 1 ? next : null;
}

module.exports = { processResearch, startNextQueued, lockResearch };
