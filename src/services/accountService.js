// Suppression définitive d'un compte (exigence App Store : possible depuis l'application).
// Tout ce qui identifie le joueur disparaît ; les rapports des autres joueurs sont conservés anonymisés.
const prisma = require('../config/database');

async function deleteAccount(accountId) {
  await prisma.$transaction(async (tx) => {
    const player = await tx.player.findUnique({ where: { accountId }, select: { id: true } });
    if (player) {
      const pid = player.id;
      await tx.armyUnit.deleteMany({ where: { army: { ownerId: pid } } });
      await tx.army.deleteMany({ where: { ownerId: pid } });
      const cities = await tx.city.findMany({ where: { playerId: pid }, select: { id: true } });
      const cityIds = cities.map(c => c.id);
      if (cityIds.length) await tx.woundedUnit.deleteMany({ where: { cityId: { in: cityIds } } });
      await tx.city.deleteMany({ where: { playerId: pid } });            // bâtiments et files en cascade
      await tx.heroItem.deleteMany({ where: { hero: { playerId: pid } } });
      await tx.hero.deleteMany({ where: { playerId: pid } });
      await tx.playerStats.deleteMany({ where: { playerId: pid } });
      await tx.spyReport.deleteMany({ where: { playerId: pid } });
      await tx.battleReport.deleteMany({ where: { playerId: pid } });
      await tx.battleReport.updateMany({ where: { attackerId: pid }, data: { attackerId: null } });
      await tx.battleReport.updateMany({ where: { defenderId: pid }, data: { defenderId: null } });
      await tx.marketOffer.deleteMany({ where: { OR: [{ playerId: pid }, { sellerId: pid }] } });
      await tx.expedition.deleteMany({ where: { playerId: pid } });
      await tx.allianceInvite.deleteMany({ where: { playerId: pid } });
      const membership = await tx.allianceMember.findUnique({ where: { playerId: pid } });
      if (membership) {
        await tx.allianceMember.delete({ where: { playerId: pid } });
        const alliance = await tx.alliance.findUnique({ where: { id: membership.allianceId }, include: { members: { orderBy: { joinedAt: 'asc' }, take: 1 } } });
        if (alliance) {
          if (alliance.members.length === 0) await tx.alliance.delete({ where: { id: alliance.id } });
          else if (alliance.leaderId === pid) {
            // Le plus ancien membre hérite de la direction
            await tx.alliance.update({ where: { id: alliance.id }, data: { leaderId: alliance.members[0].playerId } });
            await tx.allianceMember.update({ where: { id: alliance.members[0].id }, data: { role: 'LEADER' } });
          }
        }
      }
      await tx.analyticsEvent.updateMany({ where: { playerId: pid }, data: { playerId: null } });
      await tx.pushToken.deleteMany({ where: { playerId: pid } });
      await tx.purchase.deleteMany({ where: { playerId: pid } });
      await tx.player.delete({ where: { id: pid } });
    }
    await tx.account.delete({ where: { id: accountId } });
  });
}

module.exports = { deleteAccount };
