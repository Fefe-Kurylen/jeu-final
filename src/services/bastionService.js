// ============================================================
// Bastion d'alliance (décision du 26 octobre 2026, GDD alliance_config.bastion)
// - Un par alliance d'au moins 15 membres, placé par le chef ou un officier sur une case libre (bloc 2 × 2 comme une
//   ville), à 40 cases au plus d'une ville de l'alliance.
// - Les membres y apportent les ressources par convois (500 000 bois, pierre, fer, 250 000 nourriture), puis 3 jours de
//   chantier ; actif, il donne à tous les membres +10 % de production, +5 % de vitesse des armées, +10 % de transport.
// - Les membres et les alliés y postent leurs armées (garnison, +10 % de défense), 10 armées au plus, celles en route et
//   en sortie comprises (config.bastion.maxGarrisonArmies, décision du 31 octobre 2026) ; pendant un siège, aucune n'entre.
// - Les autres l'attaquent avec des engins de siège : camp d'1 h, puis combat contre la garnison derrière un mur bouclier
//   3 fois plus solide qu'un mur 20 (décision du 31 octobre 2026, 10 fois avant) ; un assaut = un rassemblement ou une
//   armée seule, comme un fort barbare de Rise of Kingdoms ; chaque assaut gagné lui ôte une vie sur 10. Une vie ne
//   revient qu'après 24 h sans assaut gagné, puis une toutes les 7,2 h (décision du 1er novembre 2026, simulation de
//   200 jours, E3). À la dernière, il est rasé : plus de bonus, garnison renvoyée, 7 jours avant d'en rebâtir un.
// - Le camp devant le Bastion se brise comme un siège de ville ; les armées de son alliance et de ses alliés qui
//   l'atteignent dans la même minute se battent ensemble (E4). Un convoi se paie sur le stock commun du joueur (E1).
// ============================================================
const prisma = require('../config/database');
const config = require('../config');
const { unitsData, factionsData } = require('../config/gamedata');
const { getArmyTravelTime, getArmyCarryCapacity, getFactionBonus, countSiegeEngines } = require('../utils/calculations');
const { routeLength } = require('../utils/pathfinding');
const { footprintFree, lockPlacement } = require('../utils/spawn');
const { transition, lockCity, lockPlayerCities, debitPlayer, missingMessage, withDeadlockRetry } = require('../utils/db');
const { resolveCombat, resolveCombatDetailed, heroCombatStats } = require('./combatService');
const { calculateWoundedUnits, carryWounded } = require('./woundedService');
const { awardHeroXp } = require('./heroXpService');
const { relationsOf, getRelation } = require('./diplomacyService');
const { notify } = require('./pushService');
const T = require('../utils/techEffects');
const fx = require('../utils/buildingEffects');
const { mergeUnits, applyLosses } = require('../utils/armyUnits');

const B = config.bastion;
const RES = ['wood', 'stone', 'iron', 'food'];
const { httpError } = require('../utils/httpError');
const wallMaxHp = () => config.combat.wallHpPerLevel * B.wallReferenceLevel * B.wallMultiplier;

// Vies actuelles. structure = la valeur écrite à structureAt, l'instant de la dernière vie perdue (assaut gagné) ou de la
// mise en service ; un assaut repoussé n'écrit rien. Rien ne remonte pendant regenPauseHours (24 h sans assaut gagné,
// décision du 1er novembre 2026, simulation de 200 jours, E3), puis les vies remontent de 0 à 1 en regenHours.
const HOUR = 3600000;
const regenStartMs = (b) => new Date(b.structureAt).getTime() + B.regenPauseHours * HOUR;
function structureNow(b, now = Date.now()) {
  const s = b.structure ?? 1;
  if (s >= 1) return 1;
  return Math.min(1, s + Math.max(0, now - regenStartMs(b)) / HOUR / B.regenHours);
}
// Vies entières : une vie ne compte qu'une fois entièrement remontée
const livesOf = (structure) => Math.floor(structure * B.assaults + 1e-6);
// Ce que le panneau du Bastion et la carte affichent : fin de la pause (null si les vies remontent déjà ou sont toutes là)
// et instant où la prochaine vie sera revenue (null si toutes sont là)
function regenView(b, now = Date.now()) {
  if (!b || !['BUILDING', 'ACTIVE'].includes(b.status) || structureNow(b, now) >= 1) return { regenPausedUntil: null, nextLifeAt: null };
  const start = regenStartMs(b);
  const next = (livesOf(structureNow(b, now)) + 1) / B.assaults;   // part de la prochaine vie entière
  return { regenPausedUntil: start > now ? new Date(start) : null, nextLifeAt: new Date(start + (next - (b.structure ?? 1)) * B.regenHours * HOUR) };
}

// ---- bonus des membres (lus souvent : gardés 30 s) ----
let activeCache = { at: 0, ids: new Set() };
async function activeAllianceIds() {
  if (Date.now() - activeCache.at < 30000) return activeCache.ids;
  const rows = await prisma.bastion.findMany({ where: { status: 'ACTIVE' }, select: { allianceId: true } });
  activeCache = { at: Date.now(), ids: new Set(rows.map(r => r.allianceId)) };
  return activeCache.ids;
}
const forgetActive = () => { activeCache.at = 0; };
// Lecture synchrone pour les calculs de trajet et de charge : la dernière liste connue, rafraîchie en arrière-plan
function activeSync(allianceId) {
  if (Date.now() - activeCache.at > 30000) activeAllianceIds().catch(() => {});
  return !!allianceId && activeCache.ids.has(allianceId);
}
const speedPctSync = (allianceId) => (activeSync(allianceId) ? B.bonuses.armySpeedPct : 0);
const carryMultSync = (allianceId) => (activeSync(allianceId) ? 1 + B.bonuses.carryPct / 100 : 1);
async function hasBonus(playerId, db = prisma) {
  if (!playerId) return false;
  const m = await db.allianceMember.findUnique({ where: { playerId }, select: { allianceId: true } });
  return !!m && (await activeAllianceIds()).has(m.allianceId);
}
// bonus de vitesse (en points de %) et de transport (multiplicateur) d'un joueur
async function speedPct(playerId) { return (await hasBonus(playerId)) ? B.bonuses.armySpeedPct : 0; }
async function carryMult(playerId) { return (await hasBonus(playerId)) ? 1 + B.bonuses.carryPct / 100 : 1; }

// ---- vue d'un bastion ----
const publicBastion = (b, extra = {}) => b && ({
  id: b.id, allianceId: b.allianceId, x: b.x, y: b.y, status: b.status,
  delivered: { wood: b.wood, stone: b.stone, iron: b.iron, food: b.food }, cost: B.cost,
  buildEndsAt: b.buildEndsAt, structurePct: Math.round(structureNow(b) * 100), lives: livesOf(structureNow(b)), assaults: B.assaults, wallMaxHp: wallMaxHp(),
  ...regenView(b), maxGarrisonArmies: B.maxGarrisonArmies,
  isSieged: b.isSieged, activatedAt: b.activatedAt, destroyedAt: b.destroyedAt, cooldownUntil: b.cooldownUntil, ...extra
});
// règles que le client affiche (onglet Alliance › Bastion, panneau d'un Bastion sur la carte), même sans alliance
const RULES = { cost: B.cost, buildDays: B.buildDays, cooldownDays: B.cooldownDays, bonuses: B.bonuses, assaults: B.assaults, regenHours: B.regenHours, regenPauseHours: B.regenPauseHours, maxDistance: B.maxDistanceFromMember, wallMultiplier: B.wallMultiplier, wallReferenceLevel: B.wallReferenceLevel, maxGarrisonArmies: B.maxGarrisonArmies, breakGroupSeconds: B.breakGroupSeconds };

// Une armée qui a encore des soldats, ou plus aucun (filtres Prisma sur ses lignes d'unités)
const HAS_UNITS = { units: { some: { count: { gt: 0 } } } };
const NO_UNITS = { units: { none: { count: { gt: 0 } } } };
// Armées de la garnison d'un Bastion : celles qui y sont, celles en route pour y entrer et une sortie en cours (elle y
// revient victorieuse). Une armée postée sans soldats (anéantie dans un assaut) ne compte plus : elle rentre.
const garrisonWhere = (bastionId) => ({ targetBastionId: bastionId, OR: [{ status: 'STATIONED', ...HAS_UNITS }, { status: { in: ['SUPPORTING', 'ATTACKING'] }, missionType: { in: ['BASTION_GARRISON', 'BASTION_SORTIE'] } }] });
const GARRISON_FULL = `Garnison du Bastion complète : ${B.maxGarrisonArmies} armées au plus, celles en route comprises`;

async function bastionFor(playerId) {
  const m = await prisma.allianceMember.findUnique({ where: { playerId }, include: { alliance: { include: { bastion: true, _count: { select: { members: true } } } } } });
  if (!m) return { inAlliance: false, rules: RULES };
  const b = m.alliance.bastion;
  // la garnison comptée comme au plafond (garrisonWhere) : dedans, en route, en sortie
  const garrison = b ? await prisma.army.findMany({ where: garrisonWhere(b.id), include: { units: true, owner: { select: { id: true, name: true } } } }) : [];
  const convoys = b ? await prisma.army.count({ where: { status: 'TRANSPORTING', missionType: 'BASTION_SUPPLY', targetBastionId: b.id } }) : 0;
  return {
    inAlliance: true, role: m.role, canPlace: ['LEADER', 'OFFICER'].includes(m.role), members: m.alliance._count.members, minMembers: B.minMembers,
    rules: RULES,
    bastion: publicBastion(b, { convoys, garrison: garrison.map(a => ({ id: a.id, name: a.name, owner: a.owner, status: a.status, units: a.units.filter(u => u.count > 0).map(u => ({ key: u.unitKey, count: u.count })) })) })
  };
}

// ---- emplacement ----
async function place(playerId, x, y) {
  x = Math.round(Number(x)); y = Math.round(Number(y));
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw httpError(400, 'Coordonnées invalides');
  const m = await prisma.allianceMember.findUnique({ where: { playerId }, include: { alliance: { include: { bastion: true, _count: { select: { members: true } } } } } });
  if (!m) throw httpError(403, 'Rejoignez une alliance');
  if (!['LEADER', 'OFFICER'].includes(m.role)) throw httpError(403, 'Seuls le chef et les officiers placent le Bastion');
  if (m.alliance._count.members < B.minMembers) throw httpError(400, `Il faut ${B.minMembers} membres pour bâtir un Bastion (vous êtes ${m.alliance._count.members})`);
  const old = m.alliance.bastion;
  if (old && old.status !== 'DESTROYED') throw httpError(400, 'Votre alliance a déjà un Bastion');
  if (old && old.cooldownUntil && new Date(old.cooldownUntil) > new Date()) throw httpError(400, `Bastion rasé : un nouveau est possible le ${new Date(old.cooldownUntil).toLocaleString('fr-FR', { timeZone: 'Europe/Paris' })}`);
  const cities = await prisma.city.findMany({ where: { player: { alliance: { allianceId: m.allianceId } } }, select: { x: true, y: true } });
  if (!cities.some(c => Math.hypot(c.x - x, c.y - y) <= B.maxDistanceFromMember)) throw httpError(400, `Choisissez un emplacement à ${B.maxDistanceFromMember} cases au plus d'une ville de l'alliance`);
  const b = await prisma.$transaction(async (tx) => {
    await lockPlacement(tx);
    if (!(await footprintFree(x, y, { db: tx }))) throw httpError(400, 'Emplacement occupé ou impraticable (il faut 2 × 2 cases libres sur la terre ferme, loin des villes et des points)');
    if (await tx.bastion.findFirst({ where: { x: { gte: x - 2, lte: x + 2 }, y: { gte: y - 2, lte: y + 2 }, NOT: { allianceId: m.allianceId } } })) throw httpError(400, 'Un autre Bastion est trop près');
    if (old) await tx.bastion.delete({ where: { id: old.id } });
    return tx.bastion.create({ data: { allianceId: m.allianceId, x, y } });
  });
  const mates = await prisma.allianceMember.findMany({ where: { allianceId: m.allianceId, playerId: { not: playerId } }, select: { playerId: true } });
  for (const mate of mates) notify(mate.playerId, 'alliance', '🏰 Chantier du Bastion', `Le Bastion de l'alliance est placé en (${x}, ${y}) : envoyez-y des convois de ressources.`, { to: 'alliance', sub: 'bastion' });
  return { message: `Chantier du Bastion placé en (${x}, ${y})`, bastion: publicBastion(b) };
}

// ---- envoyer une armée vers le bastion (ravitaillement, garnison, siège) ----
// l'armée avec sa ville et les bâtiments « capitale seulement » de son joueur (Marché, Comptoir, Irrigation et Poste du
// désert de la capitale)
const ARMY_FULL = { units: true, city: { include: { buildings: { select: { key: true, level: true } } } }, hero: { include: { items: true } }, owner: { include: { technologies: true, alliance: { select: { allianceId: true } }, cities: fx.CAPITAL_BUILDINGS } } };
async function loadReadyArmy(tx, playerId, armyId) {
  const probe = await tx.army.findFirst({ where: { id: armyId, ownerId: playerId }, select: { cityId: true } });
  if (!probe) throw httpError(404, 'Armée non trouvée');
  if (probe.cityId) await lockCity(tx, probe.cityId);
  const army = await tx.army.findFirst({ where: { id: armyId, ownerId: playerId }, include: ARMY_FULL });
  if (army.isGarrison) throw httpError(400, 'La garnison ne quitte pas la ville : créez une armée au point de ralliement');
  if (army.status === 'MARKET') throw httpError(400, require('./marketService').MARKET_BUSY);   // réservée par une offre du marché
  if (army.status !== 'IDLE') throw httpError(400, 'Armée déjà en mission');
  if (!army.units.some(u => u.count > 0)) throw httpError(400, 'Armée vide');
  if (army.city?.isSieged && army.x === army.city.x && army.y === army.city.y) throw httpError(400, 'Ville assiégée : vos armées ne sortent que pour attaquer le camp ennemi');
  return army;
}
// Cartographie, Bastion actif et Irrigation de la capitale (bâtiments chargés par ARMY_FULL)
async function travelSeconds(army, b) {
  const len = await routeLength(army.x, army.y, b.x, b.y, army.owner?.faction);
  return getArmyTravelTime(army.units, army.x, army.y, b.x, b.y, army.owner?.faction, army.hero, len, T.techPct(army.owner?.technologies, 'armySpeedBonusPct') + (await speedPct(army.ownerId)) + fx.marchSpeedBonusPct(fx.capitalOf(army.owner)));
}

async function relationTo(playerAllianceId, bastionAllianceId) {
  if (!playerAllianceId) return 'NEUTRAL';
  if (playerAllianceId === bastionAllianceId) return 'SAME';
  return (await relationsOf(bastionAllianceId)).get(playerAllianceId)?.status || 'NEUTRAL';
}

async function send(playerId, bastionId, { armyId, mission, resources }) {
  const b = await prisma.bastion.findUnique({ where: { id: bastionId || '' }, include: { alliance: { select: { tag: true, name: true } } } });
  if (!b || b.status === 'DESTROYED') throw httpError(404, 'Bastion introuvable');
  if (mission === 'BREAK') return breakSiege(playerId, b, armyId);
  // Un convoi se paie sur le stock commun du joueur (décision du 1er novembre 2026, simulation de 200 jours, E1) : toutes
  // ses villes verrouillées d'abord (ordre des id, celle de l'armée comprise), puis le Bastion, comme pour la garnison ;
  // rejoué après un interblocage rare avec le tick
  const result = await withDeadlockRetry(() => prisma.$transaction(async (tx) => {
    const cities = mission === 'SUPPLY' ? await lockPlayerCities(tx, playerId) : null;
    const army = await loadReadyArmy(tx, playerId, armyId);
    const rel = await relationTo(army.owner?.alliance?.allianceId || null, b.allianceId);
    const travel = await travelSeconds(army, b);
    const now = new Date(), arrivalAt = new Date(now.getTime() + travel * 1000);
    const base = { targetX: b.x, targetY: b.y, targetBastionId: b.id, targetCityId: null, rallyId: null, arrivalAt, departedAt: now };   // armée seule : aucun ancien rassemblement
    if (mission === 'SUPPLY') {
      if (rel !== 'SAME') throw httpError(403, 'Seuls les membres de l\'alliance ravitaillent son Bastion');
      // état relu sous le verrou du Bastion, pris après ceux des villes
      await tx.$queryRaw`SELECT id FROM "Bastion" WHERE id = ${b.id} FOR UPDATE`;
      const fresh = await tx.bastion.findUnique({ where: { id: b.id }, select: { status: true } });
      if (fresh?.status !== 'FUNDING') throw httpError(400, 'Le Bastion a déjà toutes ses ressources');
      const load = Object.fromEntries(RES.map(r => [r, Math.max(0, Math.floor(Number(resources?.[r]) || 0))]));
      const total = RES.reduce((t, r) => t + load[r], 0);
      if (total <= 0) throw httpError(400, 'Entrez des ressources à envoyer');
      // Marché, Comptoir et Poste du désert de la capitale
      const mult = (1 + getFactionBonus(army.owner.faction, 'transportCapacity', factionsData) / 100) * (1 + fx.transportBonusPct(fx.withCapital(army.city?.buildings, fx.capitalOf(army.owner))) / 100) * (await carryMult(playerId));
      const cap = Math.floor(getArmyCarryCapacity(army.units, unitsData, army.hero) * mult);
      if (total > cap) throw httpError(400, `Capacité insuffisante (max ${cap})`);
      if (!army.city || army.x !== army.city.x || army.y !== army.city.y) throw httpError(400, 'L\'armée doit être en ville pour charger des ressources');
      // la ville de l'armée d'abord, puis les autres villes du joueur, la plus pleine d'abord
      const paid = await debitPlayer(tx, playerId, army.city.id, load, cities);
      if (!paid.ok) throw httpError(400, missingMessage(paid));
      if (!(await transition(tx, 'army', army.id, 'IDLE', { ...base, status: 'TRANSPORTING', missionType: 'BASTION_SUPPLY', carryWood: load.wood, carryStone: load.stone, carryIron: load.iron, carryFood: load.food }))) throw httpError(409, 'Armée déjà en mission');
      return { message: `Convoi en route vers le Bastion (${Math.max(1, Math.round(travel / 60))} min)`, travelTime: travel, arrivalAt };
    }
    if (mission === 'GARRISON') {
      if (rel !== 'SAME' && rel !== 'ALLY') throw httpError(403, 'Seuls les membres de l\'alliance et ses alliés tiennent garnison au Bastion');
      if (b.status === 'FUNDING') throw httpError(400, 'Le Bastion n\'est encore qu\'un chantier : apportez d\'abord les ressources');
      if (b.isSieged) throw httpError(400, 'Bastion assiégé : aucune troupe n\'entre pendant le siège');
      // maxGarrisonArmies au plus (décision du 31 octobre 2026), comptées sous le verrou du Bastion (après celui de la ville)
      await tx.$queryRaw`SELECT id FROM "Bastion" WHERE id = ${b.id} FOR UPDATE`;
      if ((await tx.army.count({ where: garrisonWhere(b.id) })) >= B.maxGarrisonArmies) throw httpError(400, GARRISON_FULL);
      if (!(await transition(tx, 'army', army.id, 'IDLE', { ...base, status: 'SUPPORTING', missionType: 'BASTION_GARRISON' }))) throw httpError(409, 'Armée déjà en mission');
      return { message: `Armée en route pour la garnison du Bastion (${Math.max(1, Math.round(travel / 60))} min)`, travelTime: travel, arrivalAt };
    }
    if (mission === 'ATTACK') {
      if (rel === 'SAME' || rel === 'ALLY') throw httpError(400, 'Impossible d\'attaquer le Bastion de votre alliance ou d\'une alliance alliée');
      if (b.status === 'FUNDING') throw httpError(400, 'Ce Bastion n\'est encore qu\'un chantier sans murs : rien à assiéger');
      if (countSiegeEngines(army.units, unitsData) < config.combat.siege.minEngines) throw httpError(400, 'Pas de siège sans engin : il faut au moins 1 engin de siège dans l\'armée.');
      if (!(await transition(tx, 'army', army.id, 'IDLE', { ...base, status: 'ATTACKING', missionType: 'BASTION_ATTACK' }))) throw httpError(409, 'Armée déjà en mission');
      return { message: `Armée en route pour assiéger le Bastion (${Math.max(1, Math.round(travel / 60))} min)`, travelTime: travel, arrivalAt, attackerName: army.owner?.name };
    }
    throw httpError(400, 'Mission inconnue');
  }, { timeout: 15000 }));
  if (mission === 'ATTACK') {
    const members = await prisma.allianceMember.findMany({ where: { allianceId: b.allianceId }, select: { playerId: true } });
    for (const mm of members) notify(mm.playerId, 'attack_incoming', '⚔️ Bastion menacé', `${result.attackerName || 'Un joueur'} marche sur le Bastion de l'alliance (arrivée dans ${Math.max(1, Math.round(result.travelTime / 60))} min).`, { to: 'map', x: b.x, y: b.y });
  }
  return result;
}

// ---- briser le siège d'un Bastion (décision du 29 octobre 2026) ----
// N'importe quel joueur peut attaquer le camp ennemi devant un Bastion, depuis l'extérieur, sauf les camps de son
// alliance ou d'une alliance alliée. Un joueur de la garnison fait une sortie avec une de ses armées. Le combat a lieu en
// terrain ouvert (ni mur bouclier ni +10 % de garnison). Les armées du côté du Bastion (son alliance et ses alliés,
// sorties comprises) qui atteignent le camp dans la même minute se battent ensemble (décision du 1er novembre 2026,
// simulation de 200 jours, E4) ; les autres se battent seules. Victoire : chaque armée reste là d'où elle a attaqué (dans
// le Bastion pour une sortie, devant lui sinon). Défaite : les survivants rentrent (à la capitale pour une sortie).
async function hostileCampOwners(playerId, bastionId, db = prisma) {
  const camp = await db.army.findMany({ where: { status: 'BESIEGING', targetBastionId: bastionId, NOT: { ownerId: playerId } }, select: { ownerId: true } });
  const owners = [...new Set(camp.map(c => c.ownerId))];
  const hostile = [];
  for (const id of owners) if ((await getRelation(playerId, id, db)).canAttack) hostile.push(id);
  return { owners, hostile };
}
async function breakSiege(playerId, b, armyId) {
  if (!['BUILDING', 'ACTIVE'].includes(b.status)) throw httpError(400, 'Ce Bastion n\'est pas assiégé');
  const { owners, hostile } = await hostileCampOwners(playerId, b.id);
  if (!owners.length) throw httpError(400, 'Ce Bastion n\'est pas assiégé');
  if (!hostile.length) throw httpError(400, 'Les armées qui assiègent ce Bastion sont de votre alliance ou d\'une alliance alliée');
  const result = await prisma.$transaction(async (tx) => {
    const probe = await tx.army.findFirst({ where: { id: armyId, ownerId: playerId }, select: { status: true, targetBastionId: true } });
    if (!probe) throw httpError(404, 'Armée non trouvée');
    const sortie = probe.status === 'STATIONED' && probe.targetBastionId === b.id;   // une armée de la garnison
    let army;
    if (sortie) {
      army = await tx.army.findFirst({ where: { id: armyId, ownerId: playerId }, include: ARMY_FULL });
      if (!army.units.some(u => u.count > 0)) throw httpError(400, 'Armée vide');
    } else {
      if (probe.status === 'STATIONED') throw httpError(400, 'Cette armée tient garnison ailleurs : rappelez-la d\'abord');
      army = await loadReadyArmy(tx, playerId, armyId);
    }
    const travel = sortie ? B.sortieSeconds : await travelSeconds(army, b);
    const now = new Date(), arrivalAt = new Date(now.getTime() + travel * 1000);
    const data = { status: 'ATTACKING', missionType: sortie ? 'BASTION_SORTIE' : 'BASTION_BREAK', targetX: b.x, targetY: b.y, targetBastionId: b.id, targetCityId: null, rallyId: null, arrivalAt, departedAt: now };
    if (!(await transition(tx, 'army', army.id, sortie ? 'STATIONED' : 'IDLE', data))) throw httpError(409, 'Armée déjà en mission');
    return { sortie, travel, arrivalAt, attackerName: army.owner?.name };
  }, { timeout: 15000 });
  const minutes = Math.max(1, Math.round(result.travel / 60));
  for (const id of hostile) notify(id, 'attack_incoming', '⚔️ Attaque contre votre siège', `${result.attackerName || 'Un joueur'} ${result.sortie ? 'fait une sortie du Bastion' : 'marche sur votre camp devant le Bastion'} [${b.alliance.tag}] (combat dans ${result.sortie ? 'un instant' : `${minutes} min`}).`, { to: 'map', x: b.x, y: b.y });
  return { message: result.sortie ? 'Sortie de la garnison : votre armée attaque le camp ennemi' : `Armée en route pour briser le siège du Bastion (${minutes} min)`, travelTime: result.travel, arrivalAt: result.arrivalAt, sortie: result.sortie };
}

// Une sortie vaincue rentre à la capitale si un emplacement d'armée y est libre, sinon dans sa ville. Une armée rattachée à
// une colonie y rentre, comme après toute mission : seul « Renvoyer à la capitale » la détache (décision du 1er novembre
// 2026, simulation de 200 jours, E2). Les emplacements sont lus sous le verrou de la capitale (celui de la création
// d'armée), pris par handleBreakArrival avant le Bastion.
async function capitalHomeTx(tx, army) {
  const cap = await tx.city.findFirst({ where: { playerId: army.ownerId, isCapital: true }, include: { buildings: { select: { key: true, level: true } } } });
  if (!cap || cap.id === army.cityId) return null;
  if (army.cityId && (await tx.city.findFirst({ where: { id: army.cityId, playerId: army.ownerId, isCapital: false }, select: { id: true } }))) return null;
  const used = new Set((await tx.army.findMany({ where: { cityId: cap.id, isGarrison: false }, select: { slot: true } })).map(a => a.slot));
  let slot = null;
  for (let s = 1; s <= fx.maxArmies(cap.buildings); s++) if (!used.has(s)) { slot = s; break; }
  if (!slot) return null;
  await tx.army.update({ where: { id: army.id }, data: { cityId: cap.id, slot } });
  return cap;
}

const BREAK_MISSIONS = ['BASTION_BREAK', 'BASTION_SORTIE'];
const BREAK_ARMY = { units: true, city: true, hero: { include: { items: true } }, owner: { include: { technologies: true, alliance: { select: { allianceId: true } } } } };
const DEFENDING_SIDE = ['SAME', 'ALLY'];

// Les autres armées qui brisent le siège du même Bastion et l'atteignent dans la même minute (breakGroupSeconds après la
// première), pas encore réservées : lues avant les verrous, réservées sous celui du Bastion (claimBreakMates)
function breakMatesOf(tx, army, now) {
  const until = new Date(new Date(army.arrivalAt ?? now).getTime() + B.breakGroupSeconds * 1000);
  return tx.army.findMany({ where: { status: 'ATTACKING', missionType: { in: BREAK_MISSIONS }, targetBastionId: army.targetBastionId, claimedAt: null, id: { not: army.id }, arrivalAt: { lt: until } }, include: BREAK_ARMY, orderBy: { arrivalAt: 'asc' } });
}
// Celles qui se battent avec l'armée qui mène : toutes deux du côté du Bastion (son alliance ou une alliance alliée) et
// capables d'attaquer chaque armée du camp. Réservées ici (claimedAt, comme assaultGroup) : le tick ne les rejoue pas.
// Une armée qui n'est pas encore arrivée (dans la minute) est posée devant le Bastion.
async function claimBreakMates(tx, lead, candidates, hostile, b, now) {
  if (!candidates.length) return [];
  const sides = new Map();   // alliance -> relation avec l'alliance du Bastion
  const side = async (a) => {
    const id = a.owner?.alliance?.allianceId || null;
    if (!sides.has(id)) sides.set(id, await relationTo(id, b.allianceId));
    return sides.get(id);
  };
  if (!DEFENDING_SIDE.includes(await side(lead))) return [];   // hors du côté du Bastion : chacun se bat seul
  const campOwners = [...new Set(hostile.map(h => h.ownerId))];
  const mates = [];
  for (const m of candidates) {
    if (!DEFENDING_SIDE.includes(await side(m))) continue;
    let canAttack = true;
    for (const owner of campOwners) if (!(await getRelation(m.ownerId, owner, tx)).canAttack) { canAttack = false; break; }
    if (!canAttack) continue;
    if ((await tx.army.updateMany({ where: { id: m.id, status: 'ATTACKING', claimedAt: null }, data: { claimedAt: now, x: b.x, y: b.y } })).count === 1) mates.push(m);
  }
  return mates;
}

// Pertes d'un combat en terrain ouvert : la même part de chaque ligne d'unités (comme armyService.fieldBattle)
async function takeLosses(tx, units, rate) {
  let total = 0; const killed = [];
  for (const u of units) {
    const l = Math.floor(u.count * rate);
    if (l <= 0) continue;
    total += l; killed.push({ key: u.unitKey, killed: l, remaining: Math.max(0, u.count - l) });
    if (l >= u.count) await tx.armyUnit.deleteMany({ where: { id: u.id } }); else await tx.armyUnit.update({ where: { id: u.id }, data: { count: { decrement: l } } });
    u.count -= l;
  }
  return { total, killed };
}
// lignes d'un rapport additionnées par type d'unité (un camp peut compter plusieurs armées)
function perUnitKey(before, after) {
  const m = {};
  for (const u of before) (m[u.unitKey] ||= { key: u.unitKey, count: 0, remaining: 0 }).count += u.count;
  for (const u of after) if (m[u.unitKey]) m[u.unitKey].remaining += Math.max(0, u.count);
  return Object.values(m);
}
const lossRows = (rows) => rows.filter(e => e.count > e.remaining).map(e => ({ key: e.key, killed: e.count - e.remaining, remaining: e.remaining }));

// Combat contre le camp, en terrain ouvert comme armyService.fieldBattle, mais à plusieurs armées : `group` (l'armée qui
// mène d'abord) contre toutes les armées du camp (`holders`). L'armée qui mène donne ses technologies et son héros, chaque
// joueur garde sa Forge selon ses soldats et chaque armée sa civilisation ; chaque armée perd la même part de ses soldats
// et garde ses blessés ; les héros gagnent l'XP selon les soldats amenés ; un rapport par joueur. Dans `tx`.
async function breakBattle(tx, group, holders, place) {
  const HS = require('./heroService');
  const RK = require('./rankingService');
  const { combatPct } = require('./armyService');
  const lead = group[0], first = holders[0];
  const defenderUnits = holders.flatMap(h => h.units.filter(u => u.count > 0).map(u => ({ unitKey: u.unitKey, tier: u.tier, count: u.count })));
  const attackerUnits = group.flatMap(g => g.units.filter(u => u.count > 0).map(u => ({ unitKey: u.unitKey, tier: u.tier, count: u.count, faction: g.owner?.faction || null })));
  const atkTech = await tx.playerTechnology.findMany({ where: { playerId: lead.ownerId } });
  const [atkBonus, defBonus] = await Promise.all([combatPct(tx, lead.ownerId, atkTech, group), combatPct(tx, first.ownerId, first.owner?.technologies, holders)]);
  const combat = resolveCombat(attackerUnits, defenderUnits, 0, heroCombatStats(lead.hero), heroCombatStats(HS.leadingHero(holders)), {   // un héros sans soldats ne combat pas
    fieldBattle: true, attackerFaction: lead.owner?.faction, defenderFaction: first.owner?.faction, attackerBonusPct: atkBonus.atk, defenderBonusPct: defBonus.def
  });
  const won = combat.attackerWon;
  const soldiers = group.map(g => RK.unitCount(g.units));
  const allSoldiers = soldiers.reduce((t, n) => t + n, 0) || 1;
  const before = group.flatMap(g => g.units.map(u => ({ unitKey: u.unitKey, count: u.count })));
  const engaged = HS.fought([...group, ...holders]);   // héros des armées qui combattent avec des soldats
  const sides = { attackers: RK.sideOf(group), defenders: RK.sideOf(holders) };   // avant les pertes
  const lost = [];
  for (const g of group) lost.push(await takeLosses(tx, g.units, combat.attackerLossRate));
  let defTotal = 0; const defKilled = [];
  for (const h of holders) { const r = await takeLosses(tx, h.units, combat.defenderLossRate); defTotal += r.total; defKilled.push([h, r.killed]); }
  const atkTotal = lost.reduce((t, l) => t + l.total, 0);
  await HS.fallIfWiped(tx, engaged);   // une armée anéantie perd son héros
  await RK.recordCombat(tx, { ...sides, attackerLosses: lost.flatMap(l => l.killed), defenderLosses: defKilled.flatMap(([, k]) => k) });   // classements
  // blessés des deux camps : ils rentrent avec leur armée (Tente de soins de sa ville)
  const talent = require('../utils/heroEffects').talent;
  try {
    for (const [i, g] of group.entries()) if (lost[i].total > 0 && g.cityId) { const w = await calculateWoundedUnits(g.cityId, lost[i].killed, g.owner?.faction, T.techPct(i === 0 ? atkTech : g.owner?.technologies, 'woundedBonusPct') + talent(g.hero, 'woundedPct')); if (w.length) await carryWounded(tx, g.id, w); }
    for (const [h, killed] of defKilled) if (killed.length && h.cityId) { const w = await calculateWoundedUnits(h.cityId, killed, h.owner?.faction, T.techPct(h.owner?.technologies, 'woundedBonusPct') + talent(h.hero, 'woundedPct')); if (w.length) await carryWounded(tx, h.id, w); }
  } catch (e) { console.error('[WOUNDED]', e.message); }
  for (const [i, g] of group.entries()) if (g.heroId) await awardHeroXp(g.heroId, Math.floor(defTotal * soldiers[i] / allSoldiers * config.combat.heroXpPerKill * (won ? 1 : 0.3)), tx);
  for (const h of holders) if (h.heroId) await awardHeroXp(h.heroId, Math.floor(atkTotal * config.combat.heroXpPerKill * (won ? 0.3 : 1)), tx);

  const attackerName = [...new Set(group.map(g => g.owner?.name).filter(Boolean))].join(', ');
  const defenderName = [...new Set(holders.map(h => h.owner?.name).filter(Boolean))].join(', ') || 'Armée adverse';
  const A = perUnitKey(before, group.flatMap(g => g.units)), D = perUnitKey(defenderUnits, holders.flatMap(h => h.units));
  const base = {
    x: place.x, y: place.y, winner: won ? 'ATTACKER' : 'DEFENDER',
    attackerUnits: A.map(e => ({ key: e.key, count: e.count })),
    defenderUnits: D.map(e => ({ key: e.key, count: e.count })),
    attackerLosses: { totalKilled: atkTotal, rate: combat.attackerLossRate, units: lossRows(A) },
    defenderLosses: { totalKilled: defTotal, rate: combat.defenderLossRate, units: lossRows(D) },
    loot: { attackerName, defenderName, cityName: place.where, type: place.type, attackerPower: Math.round(combat.attackerPower), defenderPower: Math.round(combat.defenderPower), ...(group.length > 1 ? { armies: group.length } : {}) },
    rounds: place.rounds
  };
  const reportIds = {};   // la copie de chaque joueur, pour les liens des notifications
  const attackers = [...new Set(group.map(g => g.ownerId))];
  for (const id of attackers) reportIds[id] = (await tx.battleReport.create({ data: { ...base, playerId: id, attackerId: id, defenderId: first.ownerId, result: won ? 'WIN' : 'LOSE' } })).id;
  for (const id of new Set(holders.map(h => h.ownerId))) reportIds[id] = (await tx.battleReport.create({ data: { ...base, playerId: id, attackerId: lead.ownerId, defenderId: id, result: won ? 'LOSE' : 'WIN' } })).id;
  // statistiques : les pertes de chaque joueur, et sa part des soldats tués selon les soldats qu'il a amenés
  for (const id of attackers) {
    const mine = group.map((g, i) => i).filter(i => group[i].ownerId === id);
    const unitsLost = mine.reduce((t, i) => t + lost[i].total, 0);
    const unitsKilled = Math.round(defTotal * mine.reduce((t, i) => t + soldiers[i], 0) / allSoldiers);
    await tx.playerStats.upsert({ where: { playerId: id }, update: { unitsKilled: { increment: unitsKilled }, unitsLost: { increment: unitsLost }, ...(won ? { attacksWon: { increment: 1 } } : {}) }, create: { playerId: id, unitsKilled, unitsLost, attacksWon: won ? 1 : 0 } });
  }
  return { combat, reportIds, attackerName, defenderName };
}

// Arrivée d'une armée qui brise le siège (BASTION_BREAK) ou fait une sortie (BASTION_SORTIE), réservée par le tick. Elle
// emmène les armées de son côté qui arrivent dans la même minute (claimBreakMates), puis chacune connaît son sort.
async function handleBreakArrival(army, now, sendArmyHome) {
  const { sendArmyHomeTx } = require('./armyService');
  const out = await prisma.$transaction(async (tx) => {
    const candidates = await breakMatesOf(tx, army, now);
    // une sortie vaincue peut prendre un emplacement à la capitale de son joueur : ces villes d'abord (ordre des id), puis
    // le Bastion (ordre ville puis Bastion, comme relocateCapital)
    const sortieOwners = [...new Set([army, ...candidates].filter(a => a.missionType === 'BASTION_SORTIE').map(a => a.ownerId))];
    if (sortieOwners.length) {
      const capitals = await tx.city.findMany({ where: { playerId: { in: sortieOwners }, isCapital: true }, select: { id: true } });
      for (const id of capitals.map(c => c.id).sort()) await lockCity(tx, id);
    }
    await tx.$queryRaw`SELECT id FROM "Bastion" WHERE id = ${army.targetBastionId || ''} FOR UPDATE`;
    const b = await tx.bastion.findUnique({ where: { id: army.targetBastionId || '' }, include: { alliance: { select: { tag: true } } } });
    const alive = b && ['BUILDING', 'ACTIVE'].includes(b.status);
    const camp = alive ? await tx.army.findMany({ where: { status: 'BESIEGING', targetBastionId: b.id, claimedAt: null, NOT: { ownerId: army.ownerId } }, include: BREAK_ARMY }) : [];
    const hostile = [];
    for (const c of camp) if (c.units.some(u => u.count > 0) && (await getRelation(army.ownerId, c.ownerId, tx)).canAttack) hostile.push(c);
    const mates = hostile.length ? await claimBreakMates(tx, army, candidates, hostile, b, now) : [];
    const group = [];
    for (const a of [army, ...mates]) group.push({ ...a, units: await tx.armyUnit.findMany({ where: { armyId: a.id } }) });
    const hasMen = (g) => g.units.some(u => u.count > 0);
    const fighters = alive && hostile.length ? group.filter(hasMen) : [];
    const backInside = { status: 'STATIONED', x: b?.x ?? army.x, y: b?.y ?? army.y, arrivalAt: null, claimedAt: null, departedAt: null, missionType: 'BASTION_GARRISON' };
    let res = null, won = false;
    if (fighters.length) {
      const tag = `[${b.alliance.tag}]`;
      res = await breakBattle(tx, fighters, hostile, { x: b.x, y: b.y, where: `Siège du Bastion ${tag}`, type: 'SIEGE_BREAK', rounds: { type: 'SIEGE_BREAK', bastionId: b.id, armies: fighters.length } });
      won = res.combat.attackerWon;
      if (won) for (const h of hostile) await sendArmyHomeTx(tx, h);
      await refreshSieged(tx, b.id);
    }
    // le sort de chaque armée : une sortie gagnante (ou sans combat) rentre au Bastion, une armée du dehors gagnante le garde
    // devant ses murs, les autres rentrent (une sortie vaincue à sa capitale si une place y est libre)
    const fates = [];
    for (const g of group) {
      const sortie = g.missionType === 'BASTION_SORTIE', fought = fighters.includes(g);
      let fate = 'home', home = null;
      if (sortie && alive && (!fought || won)) { await tx.army.update({ where: { id: g.id }, data: backInside }); fate = 'inside'; }
      else if (fought && won && hasMen(g)) { await tx.army.update({ where: { id: g.id }, data: { status: 'IDLE', x: b.x, y: b.y, targetX: null, targetY: null, targetBastionId: null, arrivalAt: null, claimedAt: null, missionType: null } }); fate = 'guard'; }
      else if (fought && sortie) home = await capitalHomeTx(tx, g);
      fates.push({ army: g, sortie, fought, fate, home });
    }
    return { b, tag: b ? `[${b.alliance.tag}]` : '', won, fates, together: fighters.length, owners: [...new Set(hostile.map(h => h.ownerId))], attackerName: res?.attackerName, defenderName: res?.defenderName, reportIds: res?.reportIds || {} };
  }, { timeout: 15000 });
  const { b, tag, won, reportIds } = out;
  if (out.together) {
    const at = { x: b.x, y: b.y };
    const together = out.together > 1 ? ` (${out.together} armées ensemble)` : '';
    for (const f of out.fates.filter(x => x.fought)) {
      const a = f.army;
      notify(a.ownerId, 'battle', won ? '⚔️ Siège brisé' : '⚔️ Siège maintenu', won ? `${a.name} a chassé ${out.defenderName} de devant le Bastion ${tag}${together}.` : `${a.name} a été repoussée par le camp devant le Bastion ${tag}${together}${f.sortie ? ' : les survivants rentrent' + (f.home ? ` à ${f.home.name}` : '') : ''}.`, { to: 'report', reportId: reportIds[a.ownerId], ...at });
    }
    for (const id of out.owners) notify(id, 'battle', won ? '🏰 Siège levé' : '🏰 Attaque repoussée', won ? `Votre camp devant le Bastion ${tag} a été chassé par ${out.attackerName || 'un joueur'}.` : `Votre camp devant le Bastion ${tag} a repoussé ${out.attackerName || 'une armée'}.`, { to: 'report', reportId: reportIds[id], ...at });
    if (won) {
      const fighters = new Set(out.fates.filter(x => x.fought).map(x => x.army.ownerId));
      const members = await prisma.allianceMember.findMany({ where: { allianceId: b.allianceId }, select: { playerId: true } });
      for (const mm of members) if (!fighters.has(mm.playerId)) notify(mm.playerId, 'battle', '🏰 Siège du Bastion brisé', `${out.attackerName || 'Un joueur'} a chassé le camp ennemi devant le Bastion.`, { to: 'map', ...at });
    }
  }
  for (const { army: a, fate, home } of out.fates) {
    if (fate === 'inside') continue;
    if (fate === 'guard') { notify(a.ownerId, 'battle', '🛡️ Garde devant le Bastion', `${a.name} reste devant le Bastion. Rappelez-la quand vous voulez.`, { to: 'map', x: b.x, y: b.y, armyId: a.id }); continue; }
    await sendArmyHome(home ? { ...a, cityId: home.id } : a, a.targetX ?? a.x, a.targetY ?? a.y, { targetBastionId: null });
  }
}

// ---- arrivées (tick, depuis armyProcessor) ----
const sendHome = (army, sendArmyHome, extra = {}) => sendArmyHome(army, army.targetX ?? army.x, army.targetY ?? army.y, extra);

async function handleSupplyArrival(army, sendArmyHome) {
  const out = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Bastion" WHERE id = ${army.targetBastionId || ''} FOR UPDATE`;
    const b = await tx.bastion.findUnique({ where: { id: army.targetBastionId || '' } });
    if (!b || b.status !== 'FUNDING') return { refused: true };
    const carry = { wood: army.carryWood, stone: army.carryStone, iron: army.carryIron, food: army.carryFood };
    const take = Object.fromEntries(RES.map(r => [r, Math.max(0, Math.min(carry[r] || 0, B.cost[r] - b[r]))]));
    const after = Object.fromEntries(RES.map(r => [r, b[r] + take[r]]));
    const complete = RES.every(r => after[r] >= B.cost[r]);
    await tx.bastion.update({ where: { id: b.id }, data: { ...after, ...(complete ? { status: 'BUILDING', buildEndsAt: new Date(Date.now() + B.buildDays * 86400000) } : {}) } });
    const left = Object.fromEntries(RES.map(r => [r, (carry[r] || 0) - take[r]]));
    return { b, take, left, complete };
  });
  if (out.refused) {
    notify(army.ownerId, 'battle', '↩️ Convoi revenu', `${army.name} n'a pas pu livrer le Bastion (déjà complet ou disparu) : il rapporte son chargement.`, { to: 'army', armyId: army.id });
    await sendHome(army, sendArmyHome);
    return;
  }
  const got = RES.filter(r => out.take[r] > 0).map(r => `${out.take[r]} ${{ wood: 'bois', stone: 'pierre', iron: 'fer', food: 'nourriture' }[r]}`).join(', ');
  notify(army.ownerId, 'alliance', '🏰 Bastion ravitaillé', `${army.name} a livré ${got || 'rien'} au Bastion.${out.complete ? ' Toutes les ressources sont là : le chantier commence (3 jours).' : ''}`, { to: 'alliance', sub: 'bastion' });
  if (out.complete) {
    const members = await prisma.allianceMember.findMany({ where: { allianceId: out.b.allianceId }, select: { playerId: true } });
    for (const mm of members) if (mm.playerId !== army.ownerId) notify(mm.playerId, 'alliance', '🏰 Chantier du Bastion', `Toutes les ressources sont livrées : le Bastion sera achevé dans ${B.buildDays} jours.`, { to: 'alliance', sub: 'bastion' });
  }
  await sendHome(army, sendArmyHome, { carryWood: out.left.wood, carryStone: out.left.stone, carryIron: out.left.iron, carryFood: out.left.food });
}

async function handleGarrisonArrival(army, sendArmyHome) {
  const b = await prisma.bastion.findUnique({ where: { id: army.targetBastionId || '' } });
  const rel = b ? await relationTo((await prisma.allianceMember.findUnique({ where: { playerId: army.ownerId }, select: { allianceId: true } }))?.allianceId || null, b.allianceId) : null;
  let why = null;
  if (!b || (rel !== 'SAME' && rel !== 'ALLY')) why = 'gone';
  else {
    // entrée sous le verrou du Bastion, état relu (un camp a pu s'installer entre-temps) : maxGarrisonArmies au plus à
    // l'intérieur (décision du 31 octobre 2026)
    why = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Bastion" WHERE id = ${b.id} FOR UPDATE`;
      const now = await tx.bastion.findUnique({ where: { id: b.id }, select: { status: true, isSieged: true } });
      if (!now || now.status === 'DESTROYED' || now.status === 'FUNDING') return 'gone';
      if (now.isSieged) return 'sieged';
      const inside = await tx.army.count({ where: { targetBastionId: b.id, id: { not: army.id }, OR: [{ status: 'STATIONED', ...HAS_UNITS }, { status: 'ATTACKING', missionType: 'BASTION_SORTIE' }] } });
      if (inside >= B.maxGarrisonArmies) return 'full';
      await tx.army.update({ where: { id: army.id }, data: { status: 'STATIONED', x: b.x, y: b.y, arrivalAt: null, claimedAt: null } });
      return null;
    });
  }
  if (why) {
    notify(army.ownerId, 'battle', '↩️ Garnison refusée', `${army.name} n'a pas pu entrer dans le Bastion${why === 'sieged' ? ' (assiégé)' : why === 'full' ? ` (garnison complète : ${B.maxGarrisonArmies} armées au plus)` : ''} : elle rentre.`, { to: 'army', armyId: army.id });
    await sendHome(army, sendArmyHome);
    return;
  }
  notify(army.ownerId, 'alliance', '🛡️ Garnison du Bastion', `${army.name} tient garnison au Bastion (+${B.bonuses.garrisonDefensePct} % de défense).`, { to: 'army', armyId: army.id });
}

async function refreshSieged(db, bastionId) {
  const camps = await db.army.count({ where: { status: 'BESIEGING', targetBastionId: bastionId } });
  await db.bastion.updateMany({ where: { id: bastionId }, data: { isSieged: camps > 0 } });
}

// Une armée arrive devant le bastion : elle campe 1 h, puis livre son assaut, seule (handleBastionBattle : les autres camps,
// même de son alliance, livrent le leur)
async function handleAttackArrival(army, sendArmyHome) {
  const b = await prisma.bastion.findUnique({ where: { id: army.targetBastionId || '' } });
  const rel = b ? await relationTo((await prisma.allianceMember.findUnique({ where: { playerId: army.ownerId }, select: { allianceId: true } }))?.allianceId || null, b.allianceId) : null;
  if (!b || !['BUILDING', 'ACTIVE'].includes(b.status) || rel === 'SAME' || rel === 'ALLY') { await sendHome(army, sendArmyHome); return; }
  const end = new Date(Date.now() + config.combat.siege.campMinutes * 60000);
  await prisma.army.update({ where: { id: army.id }, data: { status: 'BESIEGING', x: b.x, y: b.y, arrivalAt: end, claimedAt: null } });
  await prisma.bastion.update({ where: { id: b.id }, data: { isSieged: true } });
  const members = await prisma.allianceMember.findMany({ where: { allianceId: b.allianceId }, select: { playerId: true } });
  for (const mm of members) notify(mm.playerId, 'attack_incoming', '🏰 Bastion assiégé', `${army.owner?.name || 'Une armée'} campe devant le Bastion : combat dans ${config.combat.siege.campMinutes} min. Brisez le siège ou renforcez la garnison avant.`, { to: 'map', x: b.x, y: b.y });
  notify(army.ownerId, 'battle', '⛺ Camp installé', `${army.name} campe devant le Bastion : assaut dans ${config.combat.siege.campMinutes} min.`, { to: 'army', armyId: army.id });
}

// Bonus de civilisation de la garnison. Le Bastion n'est la ville de personne : jamais de bonus « chez soi » (défense
// gauloise, attaque du Sultanat). Garnison d'une seule civilisation : ses bonus d'unités tels quels ; garnison mêlée : la
// défense des unités en moyenne selon les soldats de chacune, sans les points de vie romains en siège (le moteur de combat
// n'a qu'un jeu de bonus par camp). Rien ne dépend plus de l'ordre des armées en base.
const HOME_ONLY = ['cityDefense', 'defendingCityAttack'];
function garrisonFaction(defenders) {
  const men = new Map();   // civilisation -> soldats
  for (const d of defenders) {
    const n = d.units.reduce((s, u) => s + Math.max(0, u.count), 0);
    const f = d.owner?.faction || null;
    if (n > 0) men.set(f, (men.get(f) || 0) + n);
  }
  const [only] = men.keys();
  if (men.size === 1 && only && !HOME_ONLY.some(t => getFactionBonus(only, t, factionsData))) return { faction: only, def: 1 };
  const total = [...men.values()].reduce((s, n) => s + n, 0);
  const def = total ? [...men].reduce((s, [f, n]) => s + n * (1 + (f ? getFactionBonus(f, 'unitDefense', factionsData) : 0) / 100), 0) / total : 1;
  return { faction: null, def };
}

// Un rassemblement dont le groupe campe devant ce Bastion : parti (DONE) et dirigé vers lui
const campingRally = (rally, bastionId) => !!rally && rally.status === 'DONE' && rally.targetBastionId === bastionId;

// Qui livre l'assaut quand le camp de `army` a fini son heure (décision du 31 octobre 2026, rapport de vérification) : un
// assaut = un rassemblement (25 armées au plus, la taille fixée par la Place de rassemblement du lanceur) ou une armée
// seule. Les armées du rassemblement qui campe devant ce Bastion combattent ensemble, réservées ici (claimedAt) ; toute
// autre armée, même de la même alliance et finissant au même instant, livre son propre assaut. rally : celui qui campe
// devant ce Bastion, ou null (armée seule, ou ancien rallyId ignoré)
async function assaultGroup(tx, army, bastionId, now) {
  const found = army.rallyId ? await tx.rally.findUnique({ where: { id: army.rallyId }, select: { id: true, leaderId: true, status: true, targetBastionId: true } }) : null;
  const rally = campingRally(found, bastionId) ? found : null;
  const group = [army];
  if (!rally) return { group, rally };
  const mates = await tx.army.findMany({ where: { status: 'BESIEGING', targetBastionId: bastionId, rallyId: rally.id, claimedAt: null, id: { not: army.id } }, include: { units: true, owner: true, hero: { include: { items: true } } } });
  for (const o of mates) {
    if ((await tx.army.updateMany({ where: { id: o.id, status: 'BESIEGING', claimedAt: null }, data: { claimedAt: now } })).count === 1) group.push(o);
  }
  return { group, rally };
}

// L'heure du camp est passée : assaut contre la garnison derrière le mur bouclier
async function handleBastionBattle(army, now, sendArmyHome) {
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Bastion" WHERE id = ${army.targetBastionId || ''} FOR UPDATE`;
    const b = await tx.bastion.findUnique({ where: { id: army.targetBastionId || '' }, include: { alliance: { select: { id: true, tag: true, name: true } } } });
    if (!b || !['BUILDING', 'ACTIVE'].includes(b.status)) return { gone: true };
    // camp relu sous le verrou du Bastion : chassé entre-temps (siège brisé par une sortie ou des renforts, handleBreakArrival
    // prend le même verrou), il est déjà sur le chemin du retour et ne livre plus d'assaut
    if (!(await tx.army.count({ where: { id: army.id, status: 'BESIEGING', targetBastionId: b.id } }))) return { broken: true };
    const { group, rally } = await assaultGroup(tx, army, b.id, now);
    const rowsOf = new Map();
    for (const g of group) rowsOf.set(g.id, await tx.armyUnit.findMany({ where: { armyId: g.id } }));
    // la garnison : seules les armées qui ont des soldats combattent (une armée déjà vide rentre avec les anéanties)
    const stationed = await tx.army.findMany({ where: { status: 'STATIONED', targetBastionId: b.id }, include: { units: true, owner: true, hero: { include: { items: true } } } });
    const alive = (a) => a.units.some(u => u.count > 0);
    const defenders = stationed.filter(alive);
    const structure = structureNow(b, now.getTime());
    const maxHp = wallMaxHp();
    const attackerName = [...new Set(group.map(g => g.owner?.name).filter(Boolean))].join(', ');
    const defHero = require('./heroService').leadingHero(defenders);   // un héros sans soldats ne combat pas
    // rassemblement : c'est le héros de l'armée qui a lancé le rassemblement qui mène l'assaut (et donne ses bonus) ;
    // si cette armée n'est plus là, aucun héros. Armée seule : son héros.
    let leadHero = army.hero || null, leadOwnerId = army.ownerId;
    if (rally) {
      const lead = group.find(g => g.ownerId === rally.leaderId);
      leadHero = lead?.hero || null;
      if (lead) leadOwnerId = lead.ownerId;
    }
    if (army.rallyId) await tx.army.updateMany({ where: { id: { in: group.map(g => g.id) } }, data: { rallyId: null } });
    // technologies du chef de l'assaut ; Forge de chaque joueur des deux camps, selon ses soldats (décision du 31 octobre 2026)
    const { combatPct, combatMult } = require('./armyService');
    const atkBonus = combatMult(await combatPct(tx, leadOwnerId, await tx.playerTechnology.findMany({ where: { playerId: leadOwnerId } }), group.map(g => ({ ownerId: g.ownerId, units: rowsOf.get(g.id) }))));
    const garrison = garrisonFaction(defenders);
    const forge = combatMult(await combatPct(tx, null, null, defenders));
    const result = resolveCombatDetailed(mergeUnits([...rowsOf.values()].flat()), mergeUnits(defenders.flatMap(d => d.units)), B.wallReferenceLevel, attackerName, `Bastion [${b.alliance.tag}]`,
      heroCombatStats(leadHero), heroCombatStats(defHero), (group.find(g => g.ownerId === leadOwnerId) || army).owner?.faction, garrison.faction, B.bonuses.garrisonDefensePct,
      { attacker: atkBonus, defender: { atk: forge.atk, def: garrison.def * forge.def } }, { hp: maxHp * structure, maxHp });
    for (const g of group) await applyLosses(tx, rowsOf.get(g.id), result.attackerFinalUnits);
    for (const d of defenders) await applyLosses(tx, d.units, result.defenderFinalUnits);
    // armées de la garnison sans soldats après l'assaut (et celles déjà vides) : elles rentrent après la transaction et
    // libèrent leur place dans la garnison
    const wiped = stationed.filter(d => !alive(d));
    for (const d of defenders) if (!(await tx.armyUnit.count({ where: { armyId: d.id, count: { gt: 0 } } }))) wiped.push(d);
    const HS = require('./heroService');
    await HS.fallIfWiped(tx, HS.fought([...group.map(g => ({ ...g, units: rowsOf.get(g.id) })), ...defenders]), now);   // une armée anéantie perd son héros
    const RK = require('./rankingService');
    await RK.recordCombat(tx, { attackers: group.map(g => ({ playerId: g.ownerId, units: RK.unitCount(rowsOf.get(g.id)) })), defenders: RK.sideOf(defenders), attackerLosses: result.attackerFinalUnits, defenderLosses: result.defenderFinalUnits });   // classements
    const livesBefore = livesOf(structure);
    const destroyed = result.attackerWon && livesBefore - 1 <= 0;
    // assaut gagné : une vie de moins (la part d'une vie en train de remonter est perdue) et la pause de regenPauseHours
    // repart de maintenant (structureAt) ; assaut repoussé : rien n'est écrit, la pause et la remontée continuent
    if (destroyed) await tx.bastion.update({ where: { id: b.id }, data: { status: 'DESTROYED', structure: 0, structureAt: now, destroyedAt: now, cooldownUntil: new Date(now.getTime() + B.cooldownDays * 86400000), isSieged: false } });
    else if (result.attackerWon) await tx.bastion.update({ where: { id: b.id }, data: { structure: Math.max(0, livesBefore - 1) / B.assaults, structureAt: now } });
    const lives = { before: livesBefore, after: result.attackerWon ? Math.max(0, livesBefore - 1) : livesBefore, total: B.assaults, fallen: destroyed };
    const base = {
      x: b.x, y: b.y, attackerUnits: result.attackerInitialUnits, defenderUnits: result.defenderInitialUnits,
      attackerLosses: { rate: result.attackerLossRate, units: result.attackerFinalUnits, totalKilled: result.attackerTotalKilled },
      defenderLosses: { rate: result.defenderLossRate, units: result.defenderFinalUnits, totalKilled: result.defenderTotalKilled },
      winner: result.attackerWon ? 'ATTACKER' : 'DEFENDER',
      loot: { rounds: result.rounds, wallHpStart: Math.round(result.wallHpStart), wallHpEnd: result.wallHpEnd, wallMaxHp: maxHp, lives, attackerName, defenderName: `Bastion [${b.alliance.tag}]`, cityName: `Bastion [${b.alliance.tag}]`, type: 'BASTION', bastionId: b.id }
    };
    const reportIds = {};
    for (const id of new Set(group.map(g => g.ownerId))) reportIds[id] = (await tx.battleReport.create({ data: { ...base, result: result.attackerWon ? 'WIN' : 'LOSE', playerId: id, attackerId: id } })).id;
    for (const id of new Set(defenders.map(d => d.ownerId))) if (!reportIds[id]) reportIds[id] = (await tx.battleReport.create({ data: { ...base, result: result.attackerWon ? 'LOSE' : 'WIN', playerId: id, attackerId: army.ownerId, defenderId: id } })).id;
    return { b, group, result, destroyed, lives, reportIds, wiped };
  }, { timeout: 15000 });
  if (outcome.gone) { await sendHome(army, sendArmyHome, { rallyId: null }); return; }
  if (outcome.broken) return;
  const { b, group, result, destroyed, lives, reportIds, wiped } = outcome;
  const tag = `[${b.alliance.tag}]`;
  for (const id of new Set(group.map(g => g.ownerId))) notify(id, 'battle', result.attackerWon ? '⚔️ Assaut réussi' : '⚔️ Assaut repoussé', destroyed ? `Le Bastion ${tag} est rasé !` : result.attackerWon ? `Le Bastion ${tag} perd une vie : il lui en reste ${lives.after} sur ${lives.total}, et aucune ne revient avant ${B.regenPauseHours} h sans assaut gagné.` : `La garnison du Bastion ${tag} a repoussé votre assaut.`, { to: 'report', reportId: reportIds[id], x: b.x, y: b.y });
  const members = await prisma.allianceMember.findMany({ where: { allianceId: b.allianceId }, select: { playerId: true } });
  for (const mm of members) notify(mm.playerId, destroyed ? 'city_fall' : 'battle', destroyed ? '🏰 Bastion rasé' : '🏰 Bastion attaqué', destroyed ? `Le Bastion de l'alliance est tombé : plus de bonus. Un nouveau sera possible dans ${B.cooldownDays} jours.` : result.attackerWon ? `Le Bastion a perdu une vie (${lives.after}/${lives.total}) : aucune ne revient avant ${B.regenPauseHours} h sans assaut gagné.` : 'La garnison du Bastion a tenu.', reportIds[mm.playerId] ? { to: 'report', reportId: reportIds[mm.playerId], x: b.x, y: b.y } : { to: 'map', x: b.x, y: b.y });
  for (const g of group) await sendArmyHome(g, b.x, b.y);
  for (const d of wiped) await releaseWiped(d, sendArmyHome, `${d.name} a été anéantie au Bastion ${tag} : sa place en garnison est libérée.`);
  if (destroyed) {
    forgetActive();
    const { sendArmyHomeTx } = require('./armyService');
    const left = await prisma.army.findMany({ where: { targetBastionId: b.id, status: { in: ['STATIONED', 'BESIEGING', 'SUPPORTING'] } }, include: { units: true, city: true, hero: { include: { items: true } }, owner: { include: { technologies: true } } } });
    for (const a of left) await prisma.$transaction((tx) => sendArmyHomeTx(tx, a));
  }
  await refreshSieged(prisma, b.id);
}

// Drapeau de siège recalculé d'après les camps (un camp parti sans passer par refreshSieged : capitale déplacée, compte
// supprimé…), comme siegeProcessor.syncSiegeFlags pour les villes
async function syncSieged() {
  await prisma.$executeRaw`UPDATE "Bastion" b SET "isSieged" = true WHERE b."isSieged" = false AND b.status IN ('BUILDING', 'ACTIVE') AND EXISTS (SELECT 1 FROM "Army" a WHERE a."targetBastionId" = b.id AND a.status = 'BESIEGING')`;
  await prisma.$executeRaw`UPDATE "Bastion" b SET "isSieged" = false WHERE b."isSieged" = true AND NOT EXISTS (SELECT 1 FROM "Army" a WHERE a."targetBastionId" = b.id AND a.status = 'BESIEGING')`;
}

// Tick : chantiers achevés ; arrivées dispatchées par armyProcessor
async function processBastions(now = new Date()) {
  await releaseOrphanGarrisons().catch(e => console.error('[BASTION] garnisons :', e.message));
  await syncSieged().catch(e => console.error('[BASTION] sièges :', e.message));
  const done = await prisma.bastion.findMany({ where: { status: 'BUILDING', buildEndsAt: { lte: now } }, select: { id: true, allianceId: true, x: true, y: true } });
  for (const b of done) {
    const ok = await prisma.bastion.updateMany({ where: { id: b.id, status: 'BUILDING' }, data: { status: 'ACTIVE', activatedAt: now, structure: 1, structureAt: now } });
    if (ok.count !== 1) continue;
    forgetActive();
    const members = await prisma.allianceMember.findMany({ where: { allianceId: b.allianceId }, select: { playerId: true } });
    for (const mm of members) notify(mm.playerId, 'alliance', '🏰 Bastion achevé', `Le Bastion de l'alliance est debout : +${B.bonuses.productionPct} % de production, +${B.bonuses.armySpeedPct} % de vitesse, +${B.bonuses.carryPct} % de transport pour tous les membres.`, { to: 'alliance', sub: 'bastion' });
  }
}

// Une armée de la garnison sans soldats rentre (armyProcessor.sendArmyHome : sans troupes, elle est posée aussitôt dans sa
// ville avec ce qu'elle porte, blessés compris) : sa place dans la garnison est libre et elle redevient utilisable chez elle.
// Une erreur n'arrête pas la suite (Bastion rasé, autres armées) : le tick la renverra (releaseOrphanGarrisons).
async function releaseWiped(army, sendArmyHome, message) {
  try {
    await sendArmyHome(army, army.x, army.y);
  } catch (e) { console.error(`[BASTION] garnison vide ${army.id} :`, e.message); return false; }
  notify(army.ownerId, 'battle', '💀 Garnison anéantie', message, { to: 'army', armyId: army.id });
  return true;
}

// Garnisons qui n'ont plus lieu d'être : armée sans soldats (anéantie avant ce correctif), Bastion disparu ou rasé,
// joueur qui n'est plus membre ni allié. Elles rentrent. Tri sur une lecture légère (relation lue une fois par paire
// d'alliances), armée complète chargée pour celles qui partent.
async function releaseOrphanGarrisons() {
  const armies = await prisma.army.findMany({ where: { status: 'STATIONED', targetBastionId: { not: null } }, select: { id: true, targetBastionId: true, owner: { select: { alliance: { select: { allianceId: true } } } }, units: { where: { count: { gt: 0 } }, select: { id: true }, take: 1 } } });
  if (!armies.length) return 0;
  // sans soldats : elles rentrent quoi qu'il arrive (relues sous ce même filtre : un assaut a pu les renvoyer entre-temps)
  const emptyIds = armies.filter(a => !a.units.length).map(a => a.id);
  let released = 0;
  if (emptyIds.length) {
    const { sendArmyHome } = require('../game/processors/armyProcessor');
    for (const a of await prisma.army.findMany({ where: { id: { in: emptyIds }, status: 'STATIONED', targetBastionId: { not: null }, ...NO_UNITS } })) {
      if (await releaseWiped(a, sendArmyHome, `${a.name} n'a plus de soldats : elle quitte le Bastion et sa place en garnison est libérée.`)) released++;
    }
  }
  const bastions = new Map((await prisma.bastion.findMany({ where: { id: { in: [...new Set(armies.map(a => a.targetBastionId))] } }, select: { id: true, status: true, allianceId: true } })).map(b => [b.id, b]));
  const rels = new Map();
  const leaving = new Map();   // id de l'armée -> Bastion encore là ?
  for (const a of armies) {
    if (!a.units.length) continue;   // déjà rentrée plus haut
    const b = bastions.get(a.targetBastionId);
    if (b && b.status !== 'DESTROYED') {
      const mine = a.owner?.alliance?.allianceId || null, k = `${mine}|${b.allianceId}`;
      if (!rels.has(k)) rels.set(k, await relationTo(mine, b.allianceId));
      if (['SAME', 'ALLY'].includes(rels.get(k))) continue;
    }
    leaving.set(a.id, !!b);
  }
  if (!leaving.size) return released;
  const full = await prisma.army.findMany({ where: { id: { in: [...leaving.keys()] }, status: 'STATIONED', targetBastionId: { not: null } }, include: { units: true, city: true, hero: { include: { items: true } }, owner: { include: { technologies: true } } } });
  const { sendArmyHomeTx } = require('./armyService');
  for (const a of full) {
    await prisma.$transaction((tx) => sendArmyHomeTx(tx, a));
    notify(a.ownerId, 'alliance', '↩️ Garnison libérée', `${a.name} quitte le Bastion (${leaving.get(a.id) ? 'vous n\'êtes plus membre ni allié de son alliance' : 'il n\'existe plus'}) et rentre.`, { to: 'army', armyId: a.id });
  }
  return released + full.length;
}

// Bastions visibles sur la carte dans un rectangle
async function bastionsIn(x0, x1, y0, y1) {
  const rows = await prisma.bastion.findMany({ where: { x: { gte: x0, lte: x1 }, y: { gte: y0, lte: y1 }, status: { not: 'DESTROYED' } }, include: { alliance: { select: { id: true, tag: true, name: true, leaderId: true } } } });
  const leaders = await prisma.player.findMany({ where: { id: { in: rows.map(r => r.alliance.leaderId).filter(Boolean) } }, select: { id: true, faction: true } });
  return rows.map(r => ({ id: r.id, x: r.x, y: r.y, status: r.status, allianceId: r.allianceId, allianceTag: r.alliance.tag, allianceName: r.alliance.name, faction: leaders.find(l => l.id === r.alliance.leaderId)?.faction || 'ROME', structurePct: Math.round(structureNow(r) * 100), lives: livesOf(structureNow(r)), ...regenView(r), isSieged: r.isSieged, buildEndsAt: r.buildEndsAt }));
}

module.exports = { relationTo, breakSiege, handleBreakArrival, livesOf, regenView, refreshSieged, campingRally, assaultGroup, garrisonWhere, activeSync, speedPctSync, carryMultSync, bastionFor, place, send, handleSupplyArrival, handleGarrisonArrival, handleAttackArrival, handleBastionBattle, processBastions, releaseOrphanGarrisons, bastionsIn, hasBonus, speedPct, carryMult, activeAllianceIds, structureNow, wallMaxHp, httpError };
