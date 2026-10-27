// ============================================================
// Bastion d'alliance (décision du 26 octobre 2026, GDD alliance_config.bastion)
// - Un par alliance d'au moins 15 membres, placé par le chef ou un officier sur une case libre (bloc 2 × 2 comme une
//   ville), à 40 cases au plus d'une ville de l'alliance.
// - Les membres y apportent les ressources par convois (500 000 bois, pierre, fer, 250 000 nourriture), puis 3 jours de
//   chantier ; actif, il donne à tous les membres +10 % de production, +5 % de vitesse des armées, +10 % de transport.
// - Les membres et les alliés y postent leurs armées (garnison, +10 % de défense) ; pendant un siège, aucune n'entre.
// - Les autres l'attaquent avec des engins de siège : camp d'1 h, puis combat contre la garnison derrière un mur bouclier
//   50 fois plus solide qu'un mur 20 ; chaque assaut gagné lui ôte une vie sur 10 (les vies remontent en 72 h). À la
//   dernière, il est rasé : plus de bonus, garnison renvoyée, 7 jours avant d'en rebâtir un.
// ============================================================
const prisma = require('../config/database');
const config = require('../config');
const { unitsData, factionsData } = require('../config/gamedata');
const { getArmyTravelTime, getArmyCarryCapacity, getFactionBonus, countSiegeEngines } = require('../utils/calculations');
const { routeLength } = require('../utils/pathfinding');
const { footprintFree, lockPlacement } = require('../utils/spawn');
const { transition, debitCity, lockCity } = require('../utils/db');
const { resolveCombatDetailed, heroCombatStats } = require('./combatService');
const { relationsOf } = require('./diplomacyService');
const { notify } = require('./pushService');
const T = require('../utils/techEffects');
const fx = require('../utils/buildingEffects');

const B = config.bastion;
const RES = ['wood', 'stone', 'iron', 'food'];
const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });
const wallMaxHp = () => config.combat.wallHpPerLevel * B.wallReferenceLevel * B.wallMultiplier;

// Vies actuelles (elles remontent de 0 à 1 en regenHours depuis la dernière valeur écrite)
function structureNow(b, now = Date.now()) {
  const hours = Math.max(0, (now - new Date(b.structureAt).getTime()) / 3600000);
  return Math.min(1, (b.structure ?? 1) + hours / B.regenHours);
}
// Vies entières : une vie ne compte qu'une fois entièrement remontée
const livesOf = (structure) => Math.floor(structure * B.assaults + 1e-6);

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
  isSieged: b.isSieged, activatedAt: b.activatedAt, destroyedAt: b.destroyedAt, cooldownUntil: b.cooldownUntil, ...extra
});

async function bastionFor(playerId) {
  const m = await prisma.allianceMember.findUnique({ where: { playerId }, include: { alliance: { include: { bastion: true, _count: { select: { members: true } } } } } });
  if (!m) return { inAlliance: false };
  const b = m.alliance.bastion;
  const garrison = b ? await prisma.army.findMany({ where: { status: { in: ['STATIONED', 'SUPPORTING'] }, targetBastionId: b.id }, include: { units: true, owner: { select: { id: true, name: true } } } }) : [];
  const convoys = b ? await prisma.army.count({ where: { status: 'TRANSPORTING', missionType: 'BASTION_SUPPLY', targetBastionId: b.id } }) : 0;
  return {
    inAlliance: true, role: m.role, canPlace: ['LEADER', 'OFFICER'].includes(m.role), members: m.alliance._count.members, minMembers: B.minMembers,
    rules: { cost: B.cost, buildDays: B.buildDays, cooldownDays: B.cooldownDays, bonuses: B.bonuses, assaults: B.assaults, regenHours: B.regenHours, maxDistance: B.maxDistanceFromMember },
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
async function loadReadyArmy(tx, playerId, armyId) {
  const probe = await tx.army.findFirst({ where: { id: armyId, ownerId: playerId }, select: { cityId: true } });
  if (!probe) throw httpError(404, 'Armée non trouvée');
  if (probe.cityId) await lockCity(tx, probe.cityId);
  const army = await tx.army.findFirst({ where: { id: armyId, ownerId: playerId }, include: { units: true, city: { include: { buildings: { select: { key: true, level: true } } } }, hero: { include: { items: true } }, owner: { include: { technologies: true, alliance: { select: { allianceId: true } } } } } });
  if (army.isGarrison) throw httpError(400, 'La garnison ne quitte pas la ville : créez une armée au point de ralliement');
  if (army.status !== 'IDLE') throw httpError(400, 'Armée déjà en mission');
  if (!army.units.some(u => u.count > 0)) throw httpError(400, 'Armée vide');
  if (army.city?.isSieged && army.x === army.city.x && army.y === army.city.y) throw httpError(400, 'Ville assiégée : vos armées ne sortent que pour attaquer le camp ennemi');
  return army;
}
async function travelSeconds(army, b) {
  const len = await routeLength(army.x, army.y, b.x, b.y, army.owner?.faction);
  return getArmyTravelTime(army.units, army.x, army.y, b.x, b.y, army.owner?.faction, army.hero, len, T.techPct(army.owner?.technologies, 'armySpeedBonusPct') + (await speedPct(army.ownerId)));
}

async function relationTo(playerAllianceId, bastionAllianceId) {
  if (!playerAllianceId) return 'NEUTRAL';
  if (playerAllianceId === bastionAllianceId) return 'SAME';
  return (await relationsOf(bastionAllianceId)).get(playerAllianceId)?.status || 'NEUTRAL';
}

async function send(playerId, bastionId, { armyId, mission, resources }) {
  const b = await prisma.bastion.findUnique({ where: { id: bastionId || '' }, include: { alliance: { select: { tag: true, name: true } } } });
  if (!b || b.status === 'DESTROYED') throw httpError(404, 'Bastion introuvable');
  const result = await prisma.$transaction(async (tx) => {
    const army = await loadReadyArmy(tx, playerId, armyId);
    const rel = await relationTo(army.owner?.alliance?.allianceId || null, b.allianceId);
    const travel = await travelSeconds(army, b);
    const now = new Date(), arrivalAt = new Date(now.getTime() + travel * 1000);
    const base = { targetX: b.x, targetY: b.y, targetBastionId: b.id, targetCityId: null, arrivalAt, departedAt: now };
    if (mission === 'SUPPLY') {
      if (rel !== 'SAME') throw httpError(403, 'Seuls les membres de l\'alliance ravitaillent son Bastion');
      if (b.status !== 'FUNDING') throw httpError(400, 'Le Bastion a déjà toutes ses ressources');
      const load = Object.fromEntries(RES.map(r => [r, Math.max(0, Math.floor(Number(resources?.[r]) || 0))]));
      const total = RES.reduce((t, r) => t + load[r], 0);
      if (total <= 0) throw httpError(400, 'Entrez des ressources à envoyer');
      const mult = (1 + getFactionBonus(army.owner.faction, 'transportCapacity', factionsData) / 100) * (1 + fx.transportBonusPct(army.city?.buildings || []) / 100) * (await carryMult(playerId));
      const cap = Math.floor(getArmyCarryCapacity(army.units, unitsData, army.hero) * mult);
      if (total > cap) throw httpError(400, `Capacité insuffisante (max ${cap})`);
      if (!army.city || army.x !== army.city.x || army.y !== army.city.y) throw httpError(400, 'L\'armée doit être en ville pour charger des ressources');
      if (!(await debitCity(tx, army.city.id, load))) throw httpError(400, 'Ressources insuffisantes');
      if (!(await transition(tx, 'army', army.id, 'IDLE', { ...base, status: 'TRANSPORTING', missionType: 'BASTION_SUPPLY', carryWood: load.wood, carryStone: load.stone, carryIron: load.iron, carryFood: load.food }))) throw httpError(409, 'Armée déjà en mission');
      return { message: `Convoi en route vers le Bastion (${Math.max(1, Math.round(travel / 60))} min)`, travelTime: travel, arrivalAt };
    }
    if (mission === 'GARRISON') {
      if (rel !== 'SAME' && rel !== 'ALLY') throw httpError(403, 'Seuls les membres de l\'alliance et ses alliés tiennent garnison au Bastion');
      if (b.status === 'FUNDING') throw httpError(400, 'Le Bastion n\'est encore qu\'un chantier : apportez d\'abord les ressources');
      if (b.isSieged) throw httpError(400, 'Bastion assiégé : aucune troupe n\'entre pendant le siège');
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
  }, { timeout: 15000 });
  if (mission === 'ATTACK') {
    const members = await prisma.allianceMember.findMany({ where: { allianceId: b.allianceId }, select: { playerId: true } });
    for (const mm of members) notify(mm.playerId, 'attack_incoming', '⚔️ Bastion menacé', `${result.attackerName || 'Un joueur'} marche sur le Bastion de l'alliance (arrivée dans ${Math.max(1, Math.round(result.travelTime / 60))} min).`, { to: 'map', x: b.x, y: b.y });
  }
  return result;
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
  if (!b || b.status === 'DESTROYED' || b.status === 'FUNDING' || b.isSieged || (rel !== 'SAME' && rel !== 'ALLY')) {
    notify(army.ownerId, 'battle', '↩️ Garnison refusée', `${army.name} n'a pas pu entrer dans le Bastion${b?.isSieged ? ' (assiégé)' : ''} : elle rentre.`, { to: 'army', armyId: army.id });
    await sendHome(army, sendArmyHome);
    return;
  }
  await prisma.army.update({ where: { id: army.id }, data: { status: 'STATIONED', x: b.x, y: b.y, arrivalAt: null, claimedAt: null } });
  notify(army.ownerId, 'alliance', '🛡️ Garnison du Bastion', `${army.name} tient garnison au Bastion (+${B.bonuses.garrisonDefensePct} % de défense).`, { to: 'army', armyId: army.id });
}

async function refreshSieged(db, bastionId) {
  const camps = await db.army.count({ where: { status: 'BESIEGING', targetBastionId: bastionId } });
  await db.bastion.updateMany({ where: { id: bastionId }, data: { isSieged: camps > 0 } });
}

// Une armée arrive devant le bastion : elle campe 1 h (ou rejoint un camp allié déjà là), puis le combat démarre
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

const mergeUnits = (rows) => { const m = {}; for (const u of rows) if (u.count > 0) (m[u.unitKey] ||= { unitKey: u.unitKey, tier: u.tier, count: 0 }).count += u.count; return Object.values(m); };
const survival = (finalUnits, key) => { const r = finalUnits.find(u => u.key === key); return r && r.initial > 0 ? r.remaining / r.initial : 0; };
async function applyLosses(tx, units, finalUnits) {
  for (const u of units) {
    const n = Math.round(u.count * survival(finalUnits, u.unitKey));
    if (n <= 0) await tx.armyUnit.deleteMany({ where: { id: u.id } });
    else if (n !== u.count) await tx.armyUnit.update({ where: { id: u.id }, data: { count: n } });
  }
}

// L'heure du camp est passée : assaut contre la garnison derrière le mur bouclier
async function handleBastionBattle(army, now, sendArmyHome) {
  const outcome = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Bastion" WHERE id = ${army.targetBastionId || ''} FOR UPDATE`;
    const b = await tx.bastion.findUnique({ where: { id: army.targetBastionId || '' }, include: { alliance: { select: { id: true, tag: true, name: true } } } });
    if (!b || !['BUILDING', 'ACTIVE'].includes(b.status)) return { gone: true };
    const others = await tx.army.findMany({ where: { status: 'BESIEGING', targetBastionId: b.id, claimedAt: null, arrivalAt: { lte: now }, id: { not: army.id } }, include: { units: true, owner: true, hero: { include: { items: true } } } });
    const myAlliance = (await tx.allianceMember.findUnique({ where: { playerId: army.ownerId }, select: { allianceId: true } }))?.allianceId || null;
    const group = [army];
    for (const o of others) {
      const oa = (await tx.allianceMember.findUnique({ where: { playerId: o.ownerId }, select: { allianceId: true } }))?.allianceId || null;
      if (o.ownerId !== army.ownerId && !(myAlliance && oa === myAlliance)) continue;
      if ((await tx.army.updateMany({ where: { id: o.id, status: 'BESIEGING', claimedAt: null }, data: { claimedAt: now } })).count === 1) group.push(o);
    }
    const rowsOf = new Map();
    for (const g of group) rowsOf.set(g.id, await tx.armyUnit.findMany({ where: { armyId: g.id } }));
    const defenders = await tx.army.findMany({ where: { status: 'STATIONED', targetBastionId: b.id }, include: { units: true, owner: true, hero: { include: { items: true } } } });
    const structure = structureNow(b, now.getTime());
    const maxHp = wallMaxHp();
    const attackerName = [...new Set(group.map(g => g.owner?.name).filter(Boolean))].join(', ');
    const defHero = defenders.find(d => d.hero)?.hero || null;
    const atkTech = await tx.playerTechnology.findMany({ where: { playerId: army.ownerId } });
    const result = resolveCombatDetailed(mergeUnits([...rowsOf.values()].flat()), mergeUnits(defenders.flatMap(d => d.units)), B.wallReferenceLevel, 0, attackerName, `Bastion [${b.alliance.tag}]`,
      heroCombatStats(army.hero), heroCombatStats(defHero), army.owner?.faction, defenders[0]?.owner?.faction || null, B.bonuses.garrisonDefensePct,
      { attacker: { atk: T.techBonusMult(atkTech, 'attackBonusPct'), def: T.techBonusMult(atkTech, 'defenseBonusPct') }, defender: { atk: 1, def: 1 } }, { hp: maxHp * structure, maxHp });
    for (const g of group) await applyLosses(tx, rowsOf.get(g.id), result.attackerFinalUnits);
    for (const d of defenders) await applyLosses(tx, d.units, result.defenderFinalUnits);
    const HS = require('./heroService');
    await HS.fallIfWiped(tx, HS.fought([...group.map(g => ({ ...g, units: rowsOf.get(g.id) })), ...defenders]), now);   // une armée anéantie perd son héros
    const RK = require('./rankingService');
    await RK.recordCombat(tx, { attackers: group.map(g => ({ playerId: g.ownerId, units: RK.unitCount(rowsOf.get(g.id)) })), defenders: RK.sideOf(defenders), attackerLosses: result.attackerFinalUnits, defenderLosses: result.defenderFinalUnits });   // classements
    const livesBefore = livesOf(structure);
    let after = structure, destroyed = false;
    if (result.attackerWon) {   // une vie de moins (la part d'une vie en train de remonter est perdue)
      after = Math.max(0, livesBefore - 1) / B.assaults;
      destroyed = livesBefore - 1 <= 0;
    }
    await tx.bastion.update({ where: { id: b.id }, data: destroyed
      ? { status: 'DESTROYED', structure: 0, structureAt: now, destroyedAt: now, cooldownUntil: new Date(now.getTime() + B.cooldownDays * 86400000), isSieged: false }
      : { structure: after, structureAt: now } });
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
    return { b, group, defenders, result, destroyed, lives, reportIds };
  }, { timeout: 15000 });
  if (outcome.gone) { await sendHome(army, sendArmyHome); return; }
  const { b, group, defenders, result, destroyed, lives, reportIds } = outcome;
  const tag = `[${b.alliance.tag}]`;
  for (const id of new Set(group.map(g => g.ownerId))) notify(id, 'battle', result.attackerWon ? '⚔️ Assaut réussi' : '⚔️ Assaut repoussé', destroyed ? `Le Bastion ${tag} est rasé !` : result.attackerWon ? `Le Bastion ${tag} perd une vie : il lui en reste ${lives.after} sur ${lives.total}.` : `La garnison du Bastion ${tag} a repoussé votre assaut.`, { to: 'report', reportId: reportIds[id], x: b.x, y: b.y });
  const members = await prisma.allianceMember.findMany({ where: { allianceId: b.allianceId }, select: { playerId: true } });
  for (const mm of members) notify(mm.playerId, destroyed ? 'city_fall' : 'battle', destroyed ? '🏰 Bastion rasé' : '🏰 Bastion attaqué', destroyed ? `Le Bastion de l'alliance est tombé : plus de bonus. Un nouveau sera possible dans ${B.cooldownDays} jours.` : result.attackerWon ? `Le Bastion a perdu une vie (${lives.after}/${lives.total}).` : 'La garnison du Bastion a tenu.', reportIds[mm.playerId] ? { to: 'report', reportId: reportIds[mm.playerId], x: b.x, y: b.y } : { to: 'map', x: b.x, y: b.y });
  for (const g of group) await sendArmyHome(g, b.x, b.y);
  if (destroyed) {
    forgetActive();
    const { sendArmyHomeTx } = require('./armyService');
    const left = await prisma.army.findMany({ where: { targetBastionId: b.id, status: { in: ['STATIONED', 'BESIEGING', 'SUPPORTING'] } }, include: { units: true, city: true, hero: { include: { items: true } }, owner: { include: { technologies: true } } } });
    for (const a of left) await prisma.$transaction((tx) => sendArmyHomeTx(tx, a));
  }
  await refreshSieged(prisma, b.id);
}

// Tick : chantiers achevés ; arrivées dispatchées par armyProcessor
async function processBastions(now = new Date()) {
  await releaseOrphanGarrisons().catch(e => console.error('[BASTION] garnisons :', e.message));
  const done = await prisma.bastion.findMany({ where: { status: 'BUILDING', buildEndsAt: { lte: now } }, select: { id: true, allianceId: true, x: true, y: true } });
  for (const b of done) {
    const ok = await prisma.bastion.updateMany({ where: { id: b.id, status: 'BUILDING' }, data: { status: 'ACTIVE', activatedAt: now, structure: 1, structureAt: now } });
    if (ok.count !== 1) continue;
    forgetActive();
    const members = await prisma.allianceMember.findMany({ where: { allianceId: b.allianceId }, select: { playerId: true } });
    for (const mm of members) notify(mm.playerId, 'alliance', '🏰 Bastion achevé', `Le Bastion de l'alliance est debout : +${B.bonuses.productionPct} % de production, +${B.bonuses.armySpeedPct} % de vitesse, +${B.bonuses.carryPct} % de transport pour tous les membres.`, { to: 'alliance', sub: 'bastion' });
  }
}

// Garnisons qui n'ont plus lieu d'être (Bastion disparu ou rasé, joueur qui n'est plus membre ni allié) : elles rentrent
async function releaseOrphanGarrisons() {
  const armies = await prisma.army.findMany({ where: { status: 'STATIONED', targetBastionId: { not: null } }, include: { units: true, city: true, hero: { include: { items: true } }, owner: { include: { technologies: true, alliance: { select: { allianceId: true } } } } }, take: 500 });
  if (!armies.length) return 0;
  const bastions = new Map((await prisma.bastion.findMany({ where: { id: { in: [...new Set(armies.map(a => a.targetBastionId))] } } })).map(b => [b.id, b]));
  const { sendArmyHomeTx } = require('./armyService');
  let n = 0;
  for (const a of armies) {
    const b = bastions.get(a.targetBastionId);
    const rel = b ? await relationTo(a.owner?.alliance?.allianceId || null, b.allianceId) : null;
    if (b && b.status !== 'DESTROYED' && (rel === 'SAME' || rel === 'ALLY')) continue;
    await prisma.$transaction((tx) => sendArmyHomeTx(tx, a));
    notify(a.ownerId, 'alliance', '↩️ Garnison libérée', `${a.name} quitte le Bastion (${b ? 'vous n\'êtes plus membre ni allié de son alliance' : 'il n\'existe plus'}) et rentre.`, { to: 'army', armyId: a.id });
    n++;
  }
  return n;
}

// Bastions visibles sur la carte dans un rectangle
async function bastionsIn(x0, x1, y0, y1) {
  const rows = await prisma.bastion.findMany({ where: { x: { gte: x0, lte: x1 }, y: { gte: y0, lte: y1 }, status: { not: 'DESTROYED' } }, include: { alliance: { select: { id: true, tag: true, name: true, leaderId: true } } } });
  const leaders = await prisma.player.findMany({ where: { id: { in: rows.map(r => r.alliance.leaderId).filter(Boolean) } }, select: { id: true, faction: true } });
  return rows.map(r => ({ id: r.id, x: r.x, y: r.y, status: r.status, allianceId: r.allianceId, allianceTag: r.alliance.tag, allianceName: r.alliance.name, faction: leaders.find(l => l.id === r.alliance.leaderId)?.faction || 'ROME', structurePct: Math.round(structureNow(r) * 100), lives: livesOf(structureNow(r)), isSieged: r.isSieged, buildEndsAt: r.buildEndsAt }));
}

module.exports = { livesOf, refreshSieged, activeSync, speedPctSync, carryMultSync, bastionFor, place, send, handleSupplyArrival, handleGarrisonArrival, handleAttackArrival, handleBastionBattle, processBastions, bastionsIn, hasBonus, speedPct, carryMult, activeAllianceIds, structureNow, wallMaxHp, httpError };
