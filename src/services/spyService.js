// ============================================================
// Espions (décision du 26 octobre 2026, GDD espionage_config, façon Travian)
// - 2 espions au plus par compte : le 1er avec une Tour de guet niv. 5 (20 or), le 2e niv. 10 (200 or), prêts tout de
//   suite. Les armées n'espionnent plus.
// - Un espion part d'une de ses villes vers une ville (mission RESOURCES « Ressources et troupes » ou DEFENSES
//   « Défenses et troupes ») ou un point de ressource (NODE) ; il réussit toujours : le rapport est écrit à son arrivée,
//   puis il rentre (même durée).
// - La ville espionnée est prévenue selon sa Tour de guet : niv. 5 « un espion est venu », niv. 10 l'heure, niv. 15 qui.
//   Plus d'interception.
// - Ressources et troupes : les troupes présentes et la partie des ressources qu'un pillage pourrait prendre (hors
//   cachette, seule protection depuis le 30 octobre 2026), arrondie à la centaine. Défenses et troupes : les troupes, le mur (niveau, santé),
//   les douves, la Tour de guet, la cachette et le bonus de défense. Point : stock exact, tribu ou armées qui récoltent ;
//   le point garde son stock exact affiché pour l'espion pendant 1 h.
// ============================================================
const prisma = require('../config/database');
const config = require('../config');
const fx = require('../utils/buildingEffects');
const T = require('../utils/techEffects');
const { factionsData } = require('../config/gamedata');
const { calculateTravelTime } = require('../utils/calculations');
const { routeLength } = require('../utils/pathfinding');
const { notify } = require('./pushService');

const S = config.spies;
const { httpError } = require('../utils/httpError');
const RES = ['wood', 'stone', 'iron', 'food'];

async function watchtowerLevelOf(playerId, db = prisma) {
  const rows = await db.cityBuilding.findMany({ where: { key: 'WATCHTOWER', city: { playerId } }, select: { level: true } });
  return rows.reduce((m, r) => Math.max(m, r.level), 0);
}

const publicSpy = (s) => ({ id: s.id, slot: s.slot, status: s.status, mission: s.mission, fromCityId: s.fromCityId, fromX: s.fromX, fromY: s.fromY, targetX: s.targetX, targetY: s.targetY, targetCityId: s.targetCityId, targetNodeId: s.targetNodeId, departedAt: s.departedAt, arrivalAt: s.arrivalAt, returnAt: s.returnAt });

// Les espions du joueur et l'état des deux places (débloquée, coût, recrutée)
async function spiesOf(playerId) {
  const [spies, tower, player] = await Promise.all([
    prisma.spy.findMany({ where: { playerId }, orderBy: { slot: 'asc' } }),
    watchtowerLevelOf(playerId),
    prisma.player.findUnique({ where: { id: playerId }, select: { gold: true } })
  ]);
  const slots = S.unlockLevels.map((level, i) => ({ slot: i + 1, unlockLevel: level, cost: S.goldCost[i], unlocked: tower >= level, recruited: spies.some(s => s.slot === i + 1) }));
  return { watchtowerLevel: tower, gold: player?.gold || 0, slots, spies: spies.map(publicSpy), speed: S.speed };
}

// Recrute l'espion d'une place : Tour de guet au bon niveau, or payé, prêt tout de suite
async function recruit(playerId, slot) {
  const i = Number(slot) - 1;
  if (!(i >= 0 && i < S.unlockLevels.length)) throw httpError(400, 'Place d\'espion inconnue');
  const tower = await watchtowerLevelOf(playerId);
  if (tower < S.unlockLevels[i]) throw httpError(400, `Tour de guet niveau ${S.unlockLevels[i]} requise pour ${i === 0 ? 'un premier' : 'un deuxième'} espion`);
  return prisma.$transaction(async (tx) => {
    if (await tx.spy.findUnique({ where: { playerId_slot: { playerId, slot: i + 1 } } })) throw httpError(400, 'Cet espion est déjà recruté');
    const paid = await tx.player.updateMany({ where: { id: playerId, gold: { gte: S.goldCost[i] } }, data: { gold: { decrement: S.goldCost[i] } } });
    if (paid.count !== 1) throw httpError(400, `Il faut ${S.goldCost[i]} or pour recruter cet espion`);
    const spy = await tx.spy.create({ data: { playerId, slot: i + 1 } });
    return { message: `Espion recruté (${S.goldCost[i]} or)`, spy: publicSpy(spy) };
  });
}

// Envoie un espion libre depuis une de ses villes vers une ville (mission RESOURCES | DEFENSES) ou un point (NODE)
async function send(playerId, { fromCityId, targetCityId, targetNodeId, mission }) {
  const from = await prisma.city.findFirst({ where: { id: fromCityId || undefined, playerId }, orderBy: { isCapital: 'desc' }, select: { id: true, name: true, x: true, y: true, player: { select: { faction: true, technologies: true } }, buildings: { where: { key: 'EGYPTIAN_IRRIGATION' }, select: { key: true, level: true } } } });
  if (!from) throw httpError(400, 'Choisissez une de vos villes de départ');
  let target, kind;
  if (targetNodeId) {
    target = await prisma.resourceNode.findUnique({ where: { id: targetNodeId }, select: { id: true, x: true, y: true } });
    if (!target) throw httpError(404, 'Point de ressource introuvable');
    kind = 'NODE';
  } else {
    if (!['RESOURCES', 'DEFENSES'].includes(mission)) throw httpError(400, 'Mission inconnue : « Ressources et troupes » ou « Défenses et troupes »');
    target = await prisma.city.findUnique({ where: { id: targetCityId || '' }, select: { id: true, x: true, y: true, playerId: true, name: true } });
    if (!target) throw httpError(404, 'Ville introuvable');
    if (target.playerId === playerId) throw httpError(400, 'Vous ne pouvez pas espionner vos propres villes');
    kind = mission;
  }
  const len = await routeLength(from.x, from.y, target.x, target.y, from.player.faction);   // lève NO_ROUTE s'il n'y a pas de chemin
  const travel = calculateTravelTime(from.x, from.y, target.x, target.y, S.speed, from.player.faction, factionsData, len, T.techPct(from.player.technologies, 'armySpeedBonusPct') + fx.marchSpeedBonusPct(from.buildings));   // + Irrigation de la ville de départ
  const now = new Date(), arrivalAt = new Date(now.getTime() + travel * 1000);
  const free = await prisma.spy.findFirst({ where: { playerId, status: 'IDLE' }, orderBy: { slot: 'asc' } });
  if (!free) throw httpError(400, (await prisma.spy.count({ where: { playerId } })) ? 'Vos espions sont tous en mission' : 'Recrutez d\'abord un espion (Tour de guet niveau 5)');
  const ok = await prisma.spy.updateMany({ where: { id: free.id, status: 'IDLE' }, data: {
    status: 'OUT', mission: kind, fromCityId: from.id, fromX: from.x, fromY: from.y, targetX: target.x, targetY: target.y,
    targetCityId: kind === 'NODE' ? null : target.id, targetNodeId: kind === 'NODE' ? target.id : null, departedAt: now, arrivalAt, returnAt: null, claimedAt: null
  } });
  if (ok.count !== 1) throw httpError(409, 'Cet espion vient de partir : réessayez');
  return { message: `Espion en route (arrivée dans ${Math.max(1, Math.round(travel / 60))} min)`, travelTime: travel, arrivalAt, spyId: free.id };
}

// Rappelle un espion en route : il revient par le chemin déjà fait
async function recall(playerId, spyId) {
  const spy = await prisma.spy.findFirst({ where: { id: spyId, playerId } });
  if (!spy || spy.status !== 'OUT') throw httpError(400, 'Cet espion n\'est pas en route vers une cible');
  const now = Date.now(), back = Math.max(5000, now - new Date(spy.departedAt || now).getTime());
  const ok = await prisma.spy.updateMany({ where: { id: spy.id, status: 'OUT', claimedAt: null }, data: { status: 'RETURNING', returnAt: new Date(now + back), arrivalAt: null } });
  if (ok.count !== 1) throw httpError(409, 'L\'espion arrive à l\'instant : son rapport va tomber');
  return { message: 'Espion rappelé', returnAt: new Date(now + back) };
}

// ---- rapports ----
// Troupes présentes dans la ville : armées du propriétaire en ville (garnison comprise), ses armées venues d'autres
// villes, renforts alliés postés
async function troopsIn(city) {
  const armies = await prisma.army.findMany({ where: { OR: [
    { cityId: city.id, status: 'IDLE', x: city.x, y: city.y },
    { ownerId: city.playerId, cityId: { not: city.id }, status: 'IDLE', x: city.x, y: city.y },
    { status: 'STATIONED', targetCityId: city.id }
  ] }, include: { units: true, owner: { select: { id: true, name: true } } } });
  return armies.filter(a => a.units.some(u => u.count > 0)).map(a => ({
    name: a.isGarrison ? 'Garnison' : a.name, owner: a.ownerId === city.playerId ? null : a.owner?.name || '?', support: a.status === 'STATIONED',
    units: a.units.filter(u => u.count > 0).map(u => ({ key: u.unitKey, count: u.count }))
  }));
}

const { levelOf } = fx;
function hideoutShare(city) {
  let p = levelOf(city.buildings, 'HIDEOUT') * config.hideout.protectionPerLevel;
  const { getFactionBonus } = require('../utils/calculations');
  p *= 1 + (getFactionBonus(city.player?.faction, 'hideoutCapacity', factionsData) || 0) / 100;
  return Math.min(p, config.hideout.maxProtection);
}

async function cityReport(spy, owner) {
  const city = await prisma.city.findUnique({ where: { id: spy.targetCityId || '' }, include: { buildings: { select: { key: true, level: true } }, player: { select: { id: true, name: true, faction: true } } } });
  if (!city) return null;
  const armies = await troopsIn(city);
  const base = { playerId: spy.playerId, targetPlayerId: city.playerId, targetCityId: city.id, targetX: city.x, targetY: city.y, targetType: 'CITY', targetName: city.player?.name || null, cityName: city.name, success: true, armies };
  let data;
  if (spy.mission === 'DEFENSES') {
    const { wallLevelOf, wallHpNow } = require('../game/processors/siegeProcessor');
    const wallLevel = wallLevelOf(city.buildings);
    data = { mission: 'DEFENSES', defenses: {
      wallLevel, wallHp: Math.round(wallHpNow(city)), wallMaxHp: city.wallMaxHp || 0, structurePct: Math.round(Math.max(0, Math.min(1, city.wallStructure ?? 1)) * 100),
      moatLevel: levelOf(city.buildings, 'MOAT'), watchtowerLevel: levelOf(city.buildings, 'WATCHTOWER'), hideoutLevel: levelOf(city.buildings, 'HIDEOUT'),
      hideoutPct: Math.round(hideoutShare(city) * 100), defenseBonusPct: Math.round(fx.defenseBonusPct(city.buildings) || 0), sieged: !!city.isSieged
    } };
    base.buildings = ['WALL', 'MOAT', 'WATCHTOWER', 'HIDEOUT'].map(k => ({ key: k, level: levelOf(city.buildings, k) })).filter(b => b.level > 0);
    base.resources = {};
  } else {
    // la partie des ressources qu'un pillage pourrait prendre : hors cachette (seule protection), à la centaine près
    const share = 1 - hideoutShare(city);
    base.resources = Object.fromEntries(RES.map(r => [r, Math.max(0, Math.floor(Math.max(0, city[r] || 0) * share / 100) * 100)]));
    base.buildings = [];
    data = { mission: 'RESOURCES', visible: 'pillable' };
  }
  const report = await prisma.spyReport.create({ data: { ...base, data } });
  // la ville est prévenue selon sa Tour de guet
  const tower = levelOf(city.buildings, 'WATCHTOWER');
  const W = config.spies.alertLevels;
  let alert = null;
  if (tower >= W.seen) {
    const when = tower >= W.when, who = tower >= W.who;
    alert = await prisma.spyReport.create({ data: {
      playerId: city.playerId, targetPlayerId: who ? spy.playerId : null, targetCityId: city.id, targetX: city.x, targetY: city.y, targetType: 'SPY_ALERT',
      targetName: who ? owner?.name || null : null, cityName: city.name, success: true, buildings: [], armies: [], resources: {},
      data: { type: 'SPY_ALERT', watchtower: tower, when: when ? new Date() : null, who: who ? owner?.name || null : null, mission: who ? spy.mission : null }
    } });
    const text = who ? `${owner?.name || 'Un joueur'} a espionné ${city.name}${when ? ` à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}` : ''}.`
      : when ? `Un espion est venu à ${city.name} à ${new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' })}.` : `Un espion est venu à ${city.name}.`;
    notify(city.playerId, 'spy_alert', '🔭 Espion repéré', text, { to: 'spy', reportId: alert.id, x: city.x, y: city.y });
  }
  notify(spy.playerId, 'battle', '🔭 Rapport d\'espion', `Votre espion a observé ${city.name}${spy.mission === 'DEFENSES' ? ' (défenses et troupes)' : ' (ressources et troupes)'}.`, { to: 'spy', reportId: report.id, x: city.x, y: city.y });
  return report;
}

async function nodeReport(spy) {
  const node = await prisma.resourceNode.findUnique({ where: { id: spy.targetNodeId || '' } });
  if (!node) return null;
  const holders = await prisma.army.findMany({ where: { status: { in: ['HARVESTING', 'FOUNDING'] }, targetResourceId: node.id }, include: { units: true, owner: { select: { name: true } } } });
  const data = {
    mission: 'NODE', nodeId: node.id, resourceType: node.resourceType, level: node.level, amount: node.amount, maxAmount: node.maxAmount,
    tribe: node.hasDefenders && node.defenderPower > 0 ? { power: node.defenderPower, units: node.defenderUnits || {} } : null,
    holders: holders.map(a => ({ owner: a.owner?.name || '?', founding: a.status === 'FOUNDING', units: a.units.filter(u => u.count > 0).map(u => ({ key: u.unitKey, count: u.count })) })),
    cityId: node.cityId || null
  };
  const report = await prisma.spyReport.create({ data: { playerId: spy.playerId, targetX: node.x, targetY: node.y, targetType: 'NODE', targetName: null, cityName: `Point (${node.x}, ${node.y})`, success: true, buildings: [], armies: [], resources: { [String(node.resourceType).toLowerCase()]: node.amount }, data } });
  notify(spy.playerId, 'battle', '🔭 Rapport d\'espion', `Votre espion a observé le point (${node.x}, ${node.y}) : ${node.amount} ${String(node.resourceType).toLowerCase()}.`, { to: 'spy', reportId: report.id, x: node.x, y: node.y });
  return report;
}

// Tick : arrivées (rapport, puis retour) et retours
async function processSpies(now = new Date()) {
  const arriving = await prisma.spy.findMany({ where: { status: 'OUT', arrivalAt: { lte: now }, claimedAt: null }, include: { player: { select: { id: true, name: true } } }, take: 200 });
  for (const spy of arriving) {
    try {
      const claimed = await prisma.spy.updateMany({ where: { id: spy.id, status: 'OUT', claimedAt: null }, data: { claimedAt: now } });
      if (claimed.count !== 1) continue;
      if (spy.mission === 'NODE') await nodeReport(spy); else await cityReport(spy, spy.player);
      const back = Math.max(5000, new Date(spy.arrivalAt).getTime() - new Date(spy.departedAt || spy.arrivalAt).getTime());
      await prisma.spy.update({ where: { id: spy.id }, data: { status: 'RETURNING', returnAt: new Date(now.getTime() + back), claimedAt: null } });
    } catch (e) {
      console.error('[SPY]', spy.id, e.message);
      await prisma.spy.update({ where: { id: spy.id }, data: { status: 'RETURNING', returnAt: new Date(now.getTime() + 60000), claimedAt: null } }).catch(() => {});
    }
  }
  await prisma.spy.updateMany({ where: { status: 'RETURNING', returnAt: { lte: now } }, data: { status: 'IDLE', mission: null, targetX: null, targetY: null, targetCityId: null, targetNodeId: null, departedAt: null, arrivalAt: null, returnAt: null, claimedAt: null } });
}

// Points espionnés par le joueur depuis moins d'1 h : { nodeId: rapport (stock exact, tribu, récolteurs) }
async function nodeIntelFor(playerId, nodeIds = null) {
  const since = new Date(Date.now() - S.nodeIntelMinutes * 60000);
  const rows = await prisma.spyReport.findMany({ where: { playerId, targetType: 'NODE', createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, select: { data: true, createdAt: true } });
  const out = {};
  for (const r of rows) {
    const id = r.data?.nodeId;
    if (!id || out[id] || (nodeIds && !nodeIds.includes(id))) continue;
    out[id] = { ...r.data, at: r.createdAt };
  }
  return out;
}

module.exports = { spiesOf, recruit, send, recall, processSpies, nodeIntelFor };
