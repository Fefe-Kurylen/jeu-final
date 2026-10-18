// ========== RESEARCH PROCESSOR ==========
// Completes the researches whose time is up (one transaction each, idempotent), then starts the next queued
// item of each player concerned. Technologies are per player (data/technologies.json, utils/techEffects.js).
const prisma = require('../../config/database');
const { notify } = require('../../services/pushService');
const T = require('../../utils/techEffects');

async function processResearch(now, { playerId = null } = {}) {
  const due = await prisma.researchQueueItem.findMany({ where: { status: 'RUNNING', endsAt: { lte: now }, ...(playerId ? { playerId } : {}) }, orderBy: { endsAt: 'asc' }, take: 200 });
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
  for (const playerId of players) {
    try { await startNextQueued(prisma, playerId, now); } catch (e) { console.error('[RESEARCH ERROR] start next:', e.message); }
  }
}

// Starts the oldest QUEUED item of a player when nothing is running; the duration fixed at enqueue time is kept
async function startNextQueued(db, playerId, now = new Date()) {
  const running = await db.researchQueueItem.count({ where: { playerId, status: 'RUNNING' } });
  if (running > 0) return null;
  const next = await db.researchQueueItem.findFirst({ where: { playerId, status: 'QUEUED' }, orderBy: { startedAt: 'asc' } });
  if (!next) return null;
  const durationMs = Math.max(1000, new Date(next.endsAt).getTime() - new Date(next.startedAt).getTime());
  return db.researchQueueItem.update({ where: { id: next.id }, data: { status: 'RUNNING', startedAt: now, endsAt: new Date(now.getTime() + durationMs) } });
}

module.exports = { processResearch, startNextQueued };
