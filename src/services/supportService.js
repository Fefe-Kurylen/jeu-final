// ============================================================
// Renfort allié (décision du 26 octobre 2026)
// - Un joueur envoie une armée défendre la ville d'un membre de son alliance ou d'une alliance alliée (alliance
//   acceptée des deux côtés). En marche : statut SUPPORTING ; arrivée : STATIONED dans la ville (targetCityId).
// - Stationnée, elle défend la ville avec ses troupes (attaques, raids ; l'espion la voit). Ses blessés rentrent avec elle.
// - Son entretien reste payé par sa ville d'origine (Army.cityId), jamais par l'hôte.
// - Pendant un siège (camp devant la ville), aucun renfort n'entre (GDD combat_config.siege.blockedActionsDuringSiege) :
//   il ne part pas, et celui qui arrive pendant le camp fait demi-tour. Les renforts déjà là restent et se battent.
// - Le propriétaire la rappelle à tout moment ; l'hôte peut la renvoyer. Une rupture d'alliance, un départ de
//   l'alliance ou la chute de la ville la renvoient chez elle.
// ============================================================
const prisma = require('../config/database');
const { getRelation } = require('./diplomacyService');
const { notify } = require('./pushService');
const { lockCity } = require('../utils/db');

const SUPPORT_STATUSES = ['SUPPORTING', 'STATIONED'];
const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });
const armyInclude = { city: true, units: true, hero: { include: { items: true } }, owner: { include: { technologies: true } } };

// Peut-on renforcer cette ville ? null si oui, sinon la raison
async function supportRefusal(ownerId, targetCity, db = prisma) {
  if (!targetCity) return 'Ville introuvable';
  if (targetCity.playerId === ownerId) return 'C\'est votre ville : déplacez-y simplement l\'armée';
  const rel = await getRelation(ownerId, targetCity.playerId, db);
  if (!rel.canSupport) return 'Renfort possible seulement chez un membre de votre alliance ou d\'une alliance alliée';
  if (targetCity.isSieged) return `${targetCity.name} est assiégée : aucun renfort n'entre pendant le siège (brisez d'abord le siège)`;
  return null;
}

// Arrivée d'un renfort (tick) : il entre et se poste, ou fait demi-tour (siège, diplomatie changée, ville disparue)
async function handleSupportArrival(army, sendArmyHome) {
  const outcome = await prisma.$transaction(async (tx) => {
    if (!army.targetCityId) return { refused: 'ville disparue' };
    await lockCity(tx, army.targetCityId);
    const city = await tx.city.findUnique({ where: { id: army.targetCityId }, select: { id: true, name: true, x: true, y: true, playerId: true, isSieged: true } });
    const refusal = await supportRefusal(army.ownerId, city, tx);
    if (refusal) return { refused: refusal, city };
    await tx.army.update({ where: { id: army.id }, data: { status: 'STATIONED', x: city.x, y: city.y, targetX: city.x, targetY: city.y, arrivalAt: null, claimedAt: null, missionType: 'SUPPORT' } });
    return { city };
  }, { timeout: 15000 });
  if (outcome.refused) {
    notify(army.ownerId, 'battle', '↩️ Renfort refusé', `${army.name} n'a pas pu entrer${outcome.city ? ` dans ${outcome.city.name}` : ''} : ${outcome.refused}. Elle rentre.`, { to: 'army', armyId: army.id });
    await sendArmyHome(army, army.targetX ?? army.x, army.targetY ?? army.y);
    return;
  }
  const { city } = outcome;
  notify(army.ownerId, 'alliance', '🛡️ Renfort en place', `${army.name} défend désormais ${city.name}. Rappelez-la quand vous voulez.`, { to: 'army', armyId: army.id });
  notify(city.playerId, 'alliance', '🛡️ Renfort arrivé', `${army.owner?.name || 'Un allié'} a posté ${army.name} dans ${city.name} pour la défendre.`, { to: 'city', cityId: city.id, x: city.x, y: city.y });
}

// Renvoie une armée de renfort chez elle (dans une transaction) ; `why` pour la notification de son propriétaire
async function sendSupportHome(tx, army) {
  const { sendArmyHomeTx } = require('./armyService');
  if (army.status === 'STATIONED') { await sendArmyHomeTx(tx, army); return true; }
  if (army.status === 'SUPPORTING' && !army.claimedAt) {
    // encore en marche : demi-tour, le retour prend le temps déjà marché (comme un rappel d'armée hostile vers une ville tombée)
    if (!army.city) { await tx.army.update({ where: { id: army.id }, data: { status: 'IDLE', missionType: null, targetCityId: null, targetX: null, targetY: null, arrivalAt: null, claimedAt: null } }); return true; }
    const now = Date.now(), back = army.departedAt ? Math.max(0, now - new Date(army.departedAt).getTime()) : 0;
    await tx.army.update({ where: { id: army.id }, data: { status: 'RETURNING', missionType: 'RETURN', targetCityId: null, targetX: army.city.x, targetY: army.city.y, departedAt: new Date(now), arrivalAt: new Date(now + Math.max(30000, back)), claimedAt: null } });
    return true;
  }
  return false;
}

// L'hôte renvoie un renfort stationné chez lui
async function sendBack(hostPlayerId, armyId) {
  const r = await prisma.$transaction(async (tx) => {
    const army = await tx.army.findUnique({ where: { id: armyId }, include: { ...armyInclude, } });
    if (!army || !SUPPORT_STATUSES.includes(army.status) || !army.targetCityId) throw httpError(404, 'Renfort introuvable');
    const city = await tx.city.findUnique({ where: { id: army.targetCityId }, select: { id: true, name: true, playerId: true } });
    if (!city || city.playerId !== hostPlayerId) throw httpError(403, 'Ce renfort n\'est pas dans une de vos villes');
    await lockCity(tx, city.id);
    if (!(await sendSupportHome(tx, army))) throw httpError(409, 'Arrivée en cours de résolution, réessayez dans quelques secondes');
    return { army, city };
  }, { timeout: 15000 });
  notify(r.army.ownerId, 'alliance', '↩️ Renfort renvoyé', `${r.city.name} n'a plus besoin de ${r.army.name} : elle rentre chez vous.`, { to: 'army', armyId: r.army.id });
  return { message: `${r.army.name} rentre chez ${r.army.owner?.name || 'son propriétaire'}` };
}

// Renforts qui ne sont plus permis (diplomatie, alliance quittée) entre ces joueurs : renvoyés chez eux
async function recallInvalid(where, reason) {
  const armies = await prisma.army.findMany({ where: { status: { in: SUPPORT_STATUSES }, ...where }, include: armyInclude });
  let n = 0;
  for (const a of armies) {
    const city = a.targetCityId ? await prisma.city.findUnique({ where: { id: a.targetCityId }, select: { id: true, name: true, playerId: true } }) : null;
    if (city && (await getRelation(a.ownerId, city.playerId)).canSupport) continue;
    const done = await prisma.$transaction(async (tx) => { if (city) await lockCity(tx, city.id); const fresh = await tx.army.findUnique({ where: { id: a.id }, include: armyInclude }); return fresh && SUPPORT_STATUSES.includes(fresh.status) ? sendSupportHome(tx, fresh) : false; }, { timeout: 15000 });
    if (!done) continue;
    n++;
    notify(a.ownerId, 'alliance', '↩️ Renfort rappelé', `${a.name} quitte ${city?.name || 'la ville alliée'} : ${reason}.`, { to: 'army', armyId: a.id });
    if (city) notify(city.playerId, 'alliance', '↩️ Renfort parti', `${a.name} de ${a.owner?.name || 'votre ancien allié'} quitte ${city.name} : ${reason}.`, { to: 'city', cityId: city.id });
  }
  return n;
}

// Deux alliances ne sont plus alliées : les renforts de l'une chez l'autre rentrent
async function recallBetween(allianceA, allianceB) {
  const members = await prisma.allianceMember.findMany({ where: { allianceId: { in: [allianceA, allianceB] } }, select: { playerId: true } });
  const ids = members.map(m => m.playerId);
  if (!ids.length) return 0;
  return recallInvalid({ ownerId: { in: ids } }, 'vos alliances ne sont plus alliées');
}

// Un joueur a quitté son alliance : ses renforts chez les autres et ceux des autres chez lui rentrent
async function recallForPlayer(playerId) {
  const cities = await prisma.city.findMany({ where: { playerId }, select: { id: true } });
  return recallInvalid({ OR: [{ ownerId: playerId }, { targetCityId: { in: cities.map(c => c.id) } }] }, 'le joueur n\'est plus dans la même alliance');
}

// Renforts reçus (stationnés ou en route) dans les villes du joueur
async function receivedBy(playerId) {
  const cities = await prisma.city.findMany({ where: { playerId }, select: { id: true, name: true } });
  if (!cities.length) return [];
  const byId = new Map(cities.map(c => [c.id, c]));
  const armies = await prisma.army.findMany({ where: { status: { in: SUPPORT_STATUSES }, targetCityId: { in: [...byId.keys()] } }, include: { units: true, owner: { select: { id: true, name: true, faction: true } } }, orderBy: { arrivalAt: 'asc' } });
  return armies.map(a => ({ id: a.id, name: a.name, status: a.status, arrivalAt: a.arrivalAt, owner: a.owner, city: byId.get(a.targetCityId), units: a.units.filter(u => u.count > 0).map(u => ({ unitKey: u.unitKey, count: u.count })), heroed: !!a.heroId }));
}

module.exports = { SUPPORT_STATUSES, supportRefusal, handleSupportArrival, sendSupportHome, sendBack, recallBetween, recallForPlayer, receivedBy };
