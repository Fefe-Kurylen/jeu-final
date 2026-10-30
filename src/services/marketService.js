// ============================================================
// Marché (décision du 27 octobre 2026, GDD economy_config.market)
// - Échanges entre joueurs livrés par armées de transport : l'armée du vendeur est réservée à la création de l'offre
//   (statut MARKET, elle attend en ville avec les marchandises) ; à l'acceptation, elle part vers la ville de l'acheteur
//   et une armée de l'acheteur part vers celle du vendeur, chacune à sa vitesse ; livraison à l'arrivée, puis retour.
// - Taxe des échanges : 10 % de ce que chaque convoi transporte, −1 % par niveau du Comptoir de Commerce de la ville
//   qui envoie, −0,25 % par niveau de la Chambre au Trésor de sa capitale.
// - Une offre non prise revient au vendeur au bout de 48 h (marchandises dans la ville, armée libérée).
// - Routes commerciales entre ses propres villes : toutes les 2 h un convoi (sans armée) emporte 1/12 du stockage de la
//   ville de départ pour chaque ressource choisie, soit 100 % au plus en 24 h ; il voyage à vitesse fixe.
// ============================================================
const prisma = require('../config/database');
const config = require('../config');
const { unitsData, factionsData } = require('../config/gamedata');
const { getArmyTravelTime, getArmyCarryCapacity, getFactionBonus, calculateTravelTime } = require('../utils/calculations');
const { debitCity, creditCity, transition, lockCity, RESOURCES } = require('../utils/db');
const { routeLength } = require('../utils/pathfinding');
const fx = require('../utils/buildingEffects');
const T = require('../utils/techEffects');
const { notify } = require('./pushService');

const M = config.market;
const RES_FR = { wood: 'bois', stone: 'pierre', iron: 'fer', food: 'nourriture' };
const levelOf = (buildings, key) => (buildings || []).find(b => b.key === key)?.level || 0;

// Taxe d'un convoi qui part de cette ville (en %)
async function p2pTaxPct(db, cityId) {
  const city = await db.city.findUnique({ where: { id: cityId }, select: { playerId: true, buildings: { select: { key: true, level: true } } } });
  if (!city) return M.p2pTaxPctBase;
  const capital = await db.city.findFirst({ where: { playerId: city.playerId, isCapital: true }, select: { buildings: { where: { key: 'TREASURE_CHAMBER' }, select: { key: true, level: true } } } });
  const office = levelOf(city.buildings, 'TRADE_OFFICE') * fx.effectOf('TRADE_OFFICE', 'p2pTaxReductionPctPerLevel', 1);
  const treasure = levelOf(capital?.buildings, 'TREASURE_CHAMBER') * M.treasureTaxReductionPctPerLevel;
  return Math.max(0, Math.round((M.p2pTaxPctBase - office - treasure) * 100) / 100);
}
const afterTax = (amount, pct) => Math.floor(amount * (1 - pct / 100));

// Capacité d'une armée pour le commerce : mêmes bonus qu'un convoi (civilisation, Marché + Comptoir, Bastion)
async function tradeCapacity(db, army, city, faction, playerId) {
  const buildings = city.buildings || await db.cityBuilding.findMany({ where: { cityId: city.id }, select: { key: true, level: true } });
  const mult = (1 + getFactionBonus(faction, 'transportCapacity', factionsData) / 100) * (1 + fx.transportBonusPct(buildings) / 100) * (await require('./bastionService').carryMult(playerId));
  return Math.floor(getArmyCarryCapacity(army.units, unitsData, army.hero) * mult);
}

// Une armée libre de la ville, en ville, qui peut porter `amount` (celle demandée, sinon la plus petite qui suffit)
async function pickTransportArmy(db, city, playerId, faction, amount, armyId = null) {
  const where = { cityId: city.id, ownerId: playerId, status: 'IDLE', isGarrison: false, x: city.x, y: city.y, ...(armyId ? { id: armyId } : {}) };
  const armies = (await db.army.findMany({ where, include: { units: true, hero: { include: { items: true } } } })).filter(a => a.units.some(u => u.count > 0));
  if (!armies.length) return { error: armyId ? 'Cette armée n\'est pas libre en ville' : 'Aucune armée libre en ville pour transporter (formez-en une au point de ralliement)' };
  const sized = [];
  for (const a of armies) sized.push({ army: a, capacity: await tradeCapacity(db, a, city, faction, playerId) });
  const fit = sized.filter(s => s.capacity >= amount).sort((x, y) => x.capacity - y.capacity)[0];
  if (!fit) return { error: `Capacité de transport insuffisante : ${amount} à porter, ${Math.max(...sized.map(s => s.capacity))} au mieux` };
  return fit;
}

async function travelSecondsBetween(army, from, to, faction, technologies) {
  const len = await routeLength(from.x, from.y, to.x, to.y, faction);
  const speedPct = T.techPct(technologies, 'armySpeedBonusPct') + (await require('./bastionService').speedPct(army.ownerId));
  return getArmyTravelTime(army.units, from.x, from.y, to.x, to.y, faction, army.hero, len, speedPct);
}

// L'armée réservée d'une offre redevient libre
async function releaseOfferArmy(tx, offer) {
  if (offer.armyId) await tx.army.updateMany({ where: { id: offer.armyId, status: 'MARKET' }, data: { status: 'IDLE', missionType: null } });
}
// Offres d'une ville annulées (chute de la ville, capitale déplacée) : marchandises vers `refundCityId`, armées libérées
async function cancelOffersOfCity(tx, cityId, refundCityId) {
  const offers = await tx.marketOffer.findMany({ where: { cityId, status: 'ACTIVE' } });
  for (const o of offers) {
    const ok = await tx.marketOffer.updateMany({ where: { id: o.id, status: 'ACTIVE' }, data: { status: 'CANCELLED', cityId: refundCityId || null } });
    if (ok.count !== 1) continue;
    if (refundCityId) await creditCity(tx, refundCityId, { [o.sellResource]: o.sellAmount });
    await releaseOfferArmy(tx, o);
  }
  return offers.length;
}

// Tick : offres de plus de 48 h rendues au vendeur
async function expireOffers(now = new Date()) {
  const due = await prisma.marketOffer.findMany({ where: { status: 'ACTIVE', expiresAt: { lte: now } }, take: 200 });
  for (const o of due) {
    const done = await prisma.$transaction(async (tx) => {
      if (o.cityId) await lockCity(tx, o.cityId);
      const ok = await tx.marketOffer.updateMany({ where: { id: o.id, status: 'ACTIVE' }, data: { status: 'EXPIRED' } });
      if (ok.count !== 1) return false;
      if (o.cityId) await creditCity(tx, o.cityId, { [o.sellResource]: o.sellAmount });
      await releaseOfferArmy(tx, o);
      return true;
    });
    if (done) notify(o.sellerId, 'market', '⏳ Offre expirée', `Personne n'a pris votre offre (${o.sellAmount} ${RES_FR[o.sellResource]} contre ${o.buyAmount} ${RES_FR[o.buyResource]}) : les marchandises sont revenues dans la ville et l'armée est libre.`, { to: 'city', cityId: o.cityId });
  }
  return due.length;
}

// ---- routes commerciales entre ses villes ----
const routePct = () => M.routes.pctOfStoragePer24h / (24 / M.routes.intervalHours) / 100;   // part du stockage par envoi
const isBlocked = async (db, cityId) => (await db.army.count({ where: { status: 'BESIEGING', targetCityId: cityId } })) > 0;

async function sendRouteConvoy(route, now) {
  return prisma.$transaction(async (tx) => {
    const ok = await tx.tradeRoute.updateMany({ where: { id: route.id, active: true, nextSendAt: { lte: now } }, data: { nextSendAt: new Date(now.getTime() + M.routes.intervalHours * 3600000) } });
    if (ok.count !== 1) return null;
    const [from, to] = await Promise.all([tx.city.findUnique({ where: { id: route.fromCityId } }), tx.city.findUnique({ where: { id: route.toCityId } })]);
    if (!from || !to || from.playerId !== route.playerId || to.playerId !== route.playerId) { await tx.tradeRoute.update({ where: { id: route.id }, data: { active: false } }); return { stopped: true }; }
    if ((await isBlocked(tx, from.id)) || (await isBlocked(tx, to.id))) return { skipped: 'siège' };
    await lockCity(tx, from.id);
    const fresh = await tx.city.findUnique({ where: { id: from.id } });
    const load = {};
    for (const r of RESOURCES) {
      if (!route[r]) continue;
      const cap = r === 'food' ? fresh.maxFoodStorage : fresh.maxStorage;
      load[r] = Math.max(0, Math.floor(Math.min(fresh[r], cap * routePct())));
    }
    if (!Object.values(load).some(v => v > 0)) return { skipped: 'vide' };
    if (!(await debitCity(tx, from.id, load))) return { skipped: 'stock' };
    const player = await tx.player.findUnique({ where: { id: route.playerId }, select: { faction: true } });
    const len = await routeLength(from.x, from.y, to.x, to.y, player?.faction).catch(() => null);
    const seconds = calculateTravelTime(from.x, from.y, to.x, to.y, M.routes.convoySpeed, player?.faction, factionsData, len);
    return tx.tradeConvoy.create({ data: { playerId: route.playerId, routeId: route.id, fromCityId: from.id, toCityId: to.id, ...load, departedAt: now, arrivalAt: new Date(now.getTime() + seconds * 1000) } });
  });
}
async function deliverConvoy(c) {
  return prisma.$transaction(async (tx) => {
    const gone = await tx.tradeConvoy.deleteMany({ where: { id: c.id } });
    if (gone.count !== 1) return false;
    const to = await tx.city.findUnique({ where: { id: c.toCityId } });
    const target = to && to.playerId === c.playerId ? to : await tx.city.findFirst({ where: { id: c.fromCityId, playerId: c.playerId } });
    if (!target) return false;
    await lockCity(tx, target.id);
    const fresh = await tx.city.findUnique({ where: { id: target.id } });
    // ce qui ne tient pas dans l'entrepôt d'arrivée revient à la ville de départ
    const kept = {}, back = {};
    for (const r of RESOURCES) {
      const cap = r === 'food' ? fresh.maxFoodStorage : fresh.maxStorage;
      kept[r] = Math.max(0, Math.min(c[r], Math.floor(cap - fresh[r])));
      back[r] = c[r] - kept[r];
    }
    if (target.isWonder) { await require('./wonderService').depositToWonder(tx, target.id, c); return true; }   // chantier de la Merveille, sans plafond
    await creditCity(tx, target.id, kept);
    if (target.id !== c.fromCityId && Object.values(back).some(v => v > 0) && (await tx.city.findUnique({ where: { id: c.fromCityId }, select: { id: true } }))) await creditCity(tx, c.fromCityId, back);
    return true;
  });
}
async function processTradeRoutes(now = new Date()) {
  const routes = await prisma.tradeRoute.findMany({ where: { active: true, nextSendAt: { lte: now } }, take: 300 });
  for (const r of routes) await sendRouteConvoy(r, now).catch(e => console.error('[ROUTE]', e.message));
  const convoys = await prisma.tradeConvoy.findMany({ where: { arrivalAt: { lte: now } }, take: 500 });
  for (const c of convoys) await deliverConvoy(c).catch(e => console.error('[CONVOY]', e.message));
  return { routes: routes.length, convoys: convoys.length };
}

module.exports = { p2pTaxPct, afterTax, tradeCapacity, pickTransportArmy, travelSecondsBetween, releaseOfferArmy, cancelOffersOfCity, expireOffers, processTradeRoutes, sendRouteConvoy, routePct, RES_FR };
