const prisma = require('../config/database');

// Relation between two players as seen by `playerId`.
// Only my own alliance's declaration restricts me (a unilateral ALLY flag set by the other side
// must not make them immune); an ENEMY flag from either side blocks resource transfers.
async function getRelation(playerId, targetPlayerId, tx = prisma) {
  if (playerId === targetPlayerId) return { status: 'SELF', canTransport: true, canAttack: false };
  const [myMember, targetMember] = await Promise.all([
    tx.allianceMember.findUnique({ where: { playerId } }),
    tx.allianceMember.findUnique({ where: { playerId: targetPlayerId } })
  ]);
  if (!myMember || !targetMember) return { status: 'NEUTRAL', canTransport: true, canAttack: true };
  if (myMember.allianceId === targetMember.allianceId) return { status: 'SAME_ALLIANCE', canTransport: true, canAttack: false };
  const rows = await tx.allianceDiplomacy.findMany({ where: { OR: [
    { allianceId: myMember.allianceId, targetAllianceId: targetMember.allianceId },
    { allianceId: targetMember.allianceId, targetAllianceId: myMember.allianceId }
  ] } });
  const mine = rows.find(r => r.allianceId === myMember.allianceId)?.status || 'NEUTRAL';
  const theirs = rows.find(r => r.allianceId === targetMember.allianceId)?.status || 'NEUTRAL';
  const status = mine !== 'NEUTRAL' ? mine : (theirs === 'ENEMY' ? 'ENEMY' : 'NEUTRAL');
  return { status, declared: mine, declaredByThem: theirs, canTransport: mine !== 'ENEMY' && theirs !== 'ENEMY', canAttack: mine !== 'ALLY' };
}

module.exports = { getRelation };
