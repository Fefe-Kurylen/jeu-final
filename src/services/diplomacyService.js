const prisma = require('../config/database');

// Diplomatie entre alliances (décision du 26 octobre 2026, GDD alliance_config.diplomacy) :
// - ALLIÉ seulement des deux côtés : une alliance propose, l'autre accepte (AllianceAllyRequest). Les deux lignes
//   AllianceDiplomacy passent alors à ALLY ; si l'une des deux rompt, les deux redeviennent neutres.
// - ENNEMI se déclare seul : il suffit d'un côté pour que les deux soient ennemis (pas de transport, rencontres en marche).
// - 3 alliés au plus ; tout le monde voit les statuts, seuls le chef et les officiers les changent.
const MAX_ALLIES = 3;

// Statut d'une paire d'alliances à partir des deux déclarations
function pairStatus(mine, theirs) {
  if (mine === 'ENEMY' || theirs === 'ENEMY') return 'ENEMY';
  if (mine === 'ALLY' && theirs === 'ALLY') return 'ALLY';
  return 'NEUTRAL';
}

// Relation entre deux joueurs vue par `playerId`
async function getRelation(playerId, targetPlayerId, tx = prisma) {
  if (playerId === targetPlayerId) return { status: 'SELF', canTransport: true, canAttack: false, canSupport: true };
  const [myMember, targetMember] = await Promise.all([
    tx.allianceMember.findUnique({ where: { playerId } }),
    tx.allianceMember.findUnique({ where: { playerId: targetPlayerId } })
  ]);
  if (!myMember || !targetMember) return { status: 'NEUTRAL', canTransport: true, canAttack: true, canSupport: false };
  if (myMember.allianceId === targetMember.allianceId) return { status: 'SAME_ALLIANCE', canTransport: true, canAttack: false, canSupport: true };
  const rows = await tx.allianceDiplomacy.findMany({ where: { OR: [
    { allianceId: myMember.allianceId, targetAllianceId: targetMember.allianceId },
    { allianceId: targetMember.allianceId, targetAllianceId: myMember.allianceId }
  ] } });
  const mine = rows.find(r => r.allianceId === myMember.allianceId)?.status || 'NEUTRAL';
  const theirs = rows.find(r => r.allianceId === targetMember.allianceId)?.status || 'NEUTRAL';
  const status = pairStatus(mine, theirs);
  return { status, declared: mine, declaredByThem: theirs, canTransport: status !== 'ENEMY', canAttack: status !== 'ALLY', canSupport: status === 'ALLY' };
}

// Statut de chaque alliance qui a une relation avec `allianceId` : Map id -> { status, mine, theirs }
async function relationsOf(allianceId, tx = prisma) {
  const rows = await tx.allianceDiplomacy.findMany({ where: { OR: [{ allianceId }, { targetAllianceId: allianceId }] } });
  const out = new Map();
  for (const r of rows) {
    const other = r.allianceId === allianceId ? r.targetAllianceId : r.allianceId;
    const e = out.get(other) || { mine: 'NEUTRAL', theirs: 'NEUTRAL' };
    if (r.allianceId === allianceId) e.mine = r.status; else e.theirs = r.status;
    out.set(other, e);
  }
  for (const e of out.values()) e.status = pairStatus(e.mine, e.theirs);
  return out;
}

async function allyIdsOf(allianceId, tx = prisma) {
  return [...(await relationsOf(allianceId, tx))].filter(([, e]) => e.status === 'ALLY').map(([id]) => id);
}

const setRow = (tx, allianceId, targetAllianceId, status) => tx.allianceDiplomacy.upsert({
  where: { allianceId_targetAllianceId: { allianceId, targetAllianceId } },
  update: { status, changedAt: new Date() },
  create: { allianceId, targetAllianceId, status }
});

module.exports = { MAX_ALLIES, pairStatus, getRelation, relationsOf, allyIdsOf, setRow };
