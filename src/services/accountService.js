// Suppression définitive d'un compte (exigence App Store : possible depuis l'application).
// Les lignes possédées par le joueur disparaissent par cascade de la base (villes, armées, héros, rapports,
// offres, expéditions, jetons push, achats) ; ce qui appartient aux autres joueurs (leurs rapports de bataille
// et d'espionnage) perd le lien et le nom du joueur supprimé.
const prisma = require('../config/database');
const { forgetPlayer } = require('../middleware/auth');

const DELETED_NAME = 'Joueur supprimé';

async function deleteAccount(accountId) {
  const player = await prisma.player.findUnique({ where: { accountId }, select: { id: true } });
  await prisma.$transaction(async (tx) => {
    if (player) {
      const pid = player.id;
      // Reports kept by other players: the pseudo is replaced inside the stored JSON
      await tx.$executeRaw`UPDATE "BattleReport" SET loot = COALESCE(loot, '{}'::jsonb) || jsonb_build_object('attackerName', ${DELETED_NAME}::text) WHERE "attackerId" = ${pid} AND "playerId" <> ${pid}`;
      await tx.$executeRaw`UPDATE "BattleReport" SET loot = COALESCE(loot, '{}'::jsonb) || jsonb_build_object('defenderName', ${DELETED_NAME}::text) WHERE "defenderId" = ${pid} AND "playerId" <> ${pid}`;
      await tx.spyReport.updateMany({ where: { targetPlayerId: pid }, data: { targetPlayerId: null, targetName: DELETED_NAME, cityName: 'Ville supprimée' } });
      await tx.analyticsEvent.updateMany({ where: { playerId: pid }, data: { playerId: null } });
      // Alliance: the oldest remaining member inherits the leadership, an empty alliance disappears
      const membership = await tx.allianceMember.findUnique({ where: { playerId: pid } });
      if (membership) {
        await tx.allianceMember.delete({ where: { playerId: pid } });
        const alliance = await tx.alliance.findUnique({ where: { id: membership.allianceId }, include: { members: { orderBy: { joinedAt: 'asc' }, take: 1 } } });
        if (alliance) {
          if (alliance.members.length === 0) await tx.alliance.delete({ where: { id: alliance.id } });
          else if (alliance.leaderId === pid) {
            await tx.alliance.update({ where: { id: alliance.id }, data: { leaderId: alliance.members[0].playerId } });
            await tx.allianceMember.update({ where: { id: alliance.members[0].id }, data: { role: 'LEADER' } });
          }
        }
      }
      // Harvesting armies free their resource node before the cascade removes them
      await tx.$executeRaw`UPDATE "ResourceNode" n SET "hasPlayerArmy" = false, "lastArmyDeparture" = NOW() AT TIME ZONE 'UTC'
        FROM "Army" a WHERE a."ownerId" = ${pid} AND a.status = 'HARVESTING' AND a."targetResourceId" = n.id
          AND NOT EXISTS (SELECT 1 FROM "Army" o WHERE o."targetResourceId" = n.id AND o.status = 'HARVESTING' AND o."ownerId" <> ${pid})`;
    }
    await tx.account.delete({ where: { id: accountId } });   // cascades to the player and everything it owns
  }, { timeout: 30000 });
  if (player) forgetPlayer(player.id);
}

module.exports = { deleteAccount };
