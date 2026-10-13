const prisma = require('../config/database');

// Relation between two players as seen by `playerId`
async function getRelation(playerId, targetPlayerId, tx = prisma) {
  if (playerId === targetPlayerId) return { status: 'SELF', canTransport: true, canAttack: false };
  const [myMember, targetMember] = await Promise.all([
    tx.allianceMember.findUnique({ where: { playerId } }),
    tx.allianceMember.findUnique({ where: { playerId: targetPlayerId } })
  ]);
  if (!myMember || !targetMember) return { status: 'NEUTRAL', canTransport: true, canAttack: true };
  if (myMember.allianceId === targetMember.allianceId) return { status: 'SAME_ALLIANCE', canTransport: true, canAttack: false };
  const diplomacy = await tx.allianceDiplomacy.findFirst({ where: { OR: [
    { allianceId: myMember.allianceId, targetAllianceId: targetMember.allianceId },
    { allianceId: targetMember.allianceId, targetAllianceId: myMember.allianceId }
  ] } });
  if (!diplomacy) return { status: 'NEUTRAL', canTransport: true, canAttack: true };
  return { status: diplomacy.status, canTransport: diplomacy.status !== 'ENEMY', canAttack: diplomacy.status !== 'ALLY' };
}

module.exports = { getRelation };
