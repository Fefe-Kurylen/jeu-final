// ============================================================
// Marché (décisions du 27 et du 31 octobre 2026, GDD economy_config.market)
// - La Place du marché n'existe que dans la capitale et sert toutes les villes du joueur (bâtiment « capitale seulement »).
// - Marchands façon Travian : autant que de niveaux du Marché de la capitale (MARKET.effects.merchantsPerLevel). Toutes les
//   livraisons du marché passent par eux : échanges entre joueurs, envois de ressources à un joueur ou à une de ses villes,
//   routes commerciales (donc aussi les convois vers la Ville Merveille). Un marchand porte une charge selon la
//   civilisation, × (1 + bonus de transport du Comptoir et du Poste du Désert de la capitale), et marche à la vitesse de
//   sa civilisation (config.market.merchants) ; il est occupé à l'aller ET au retour. Les missions d'armée (transport,
//   récoltes, pillage) et le marchand du serveur (échange immédiat avec taxe) n'en demandent pas.
// - Échanges entre joueurs : les marchands du vendeur sont réservés avec les marchandises à la création de l'offre ; à
//   l'acceptation, ils partent vers la ville de l'acheteur et ceux de l'acheteur vers celle du vendeur. Une offre non prise
//   revient au vendeur au bout de 48 h (marchandises dans la ville, marchands libres).
// - Taxe des échanges : 10 % de ce que chaque convoi transporte, −1 % par niveau du Comptoir de Commerce de la capitale,
//   −0,25 % par niveau de sa Chambre au Trésor.
// - Routes commerciales entre ses propres villes : toutes les 2 h des marchands emportent 1/12 du stockage de la ville de
//   départ pour chaque ressource choisie (100 % au plus en 24 h), dans la limite de ce que les marchands libres portent. Ce
//   stockage est celui du Dépôt et du Silo seuls, sans les Grands (rapport économie, recommandation 12, option A).
// - Les marchandises partent de la ville choisie et arrivent dans la ville visée (pas de stock partagé) ; ce qui ne tient
//   pas dans l'entrepôt d'arrivée revient avec les marchands.
// ============================================================
const prisma = require('../config/database');
const config = require('../config');
const { calculateTravelTime, storageCapsWithoutGreat } = require('../utils/calculations');
const { debitCity, creditCity, lockCity, lockOffer, buildingsWithCapital, capitalBuildingsOf, RESOURCES, RES_FR } = require('../utils/db');
const { routeLength } = require('../utils/pathfinding');
const fx = require('../utils/buildingEffects');
const { notify } = require('./pushService');

const M = config.market;
const MC = M.merchants;
const loadOf = (o) => Object.fromEntries(RESOURCES.map(r => [r, Math.max(0, Math.floor(Number(o?.[r]) || 0))]));
const totalOf = (o) => RESOURCES.reduce((t, r) => t + (o[r] || 0), 0);
const resText = (o) => RESOURCES.filter(r => o[r] > 0).map(r => `${o[r]} ${RES_FR[r]}`).join(', ');

// Taxe d'un convoi qui part de cette ville (en %) : Comptoir et Chambre au Trésor de la capitale
async function p2pTaxPct(db, cityId) {
  const city = await db.city.findUnique({ where: { id: cityId }, select: { playerId: true, buildings: { select: { key: true, level: true } } } });
  if (!city) return M.p2pTaxPctBase;
  const buildings = await buildingsWithCapital(db, city);
  const office = fx.levelOf(buildings, 'TRADE_OFFICE') * fx.effectOf('TRADE_OFFICE', 'p2pTaxReductionPctPerLevel', 1);
  const treasure = fx.levelOf(buildings, 'TREASURE_CHAMBER') * M.treasureTaxReductionPctPerLevel;
  return Math.max(0, Math.round((M.p2pTaxPctBase - office - treasure) * 100) / 100);
}
const afterTax = (amount, pct) => Math.floor(amount * (1 - pct / 100));

// ---- marchands ----
// Charge d'un marchand de cette civilisation, avec le Comptoir et le Poste du Désert de la capitale ; sa vitesse
const merchantCapacity = (faction, capitalBuildings) => Math.floor((MC.capacity[faction] || Math.min(...Object.values(MC.capacity))) * (1 + fx.merchantCapacityBonusPct(capitalBuildings) / 100));
const merchantSpeed = (faction) => MC.speed[faction] || Math.min(...Object.values(MC.speed));
// Marchands qu'il faut pour porter `amount`
const merchantsFor = (amount, capacity) => Math.ceil(Math.max(0, amount) / Math.max(1, capacity));
const noMerchants = (free, needed) => `Pas assez de marchands libres (${free} libres, ${needed} nécessaires)`;

// Marchands occupés d'un joueur : ceux en route (aller ou retour) et ceux qui attendent avec les marchandises d'une de ses
// offres actives. Une seule requête, donc une seule photo de la base : un échange conclu au même moment fait passer ses
// marchands de l'offre au convoi d'un coup, ils ne sont jamais comptés zéro ou deux fois
async function busyMerchants(db, playerId) {
  const [row] = await db.$queryRaw`SELECT
    (SELECT COALESCE(SUM(merchants), 0) FROM "TradeConvoy" WHERE "playerId" = ${playerId})
    + (SELECT COALESCE(SUM(merchants), 0) FROM "MarketOffer" WHERE "sellerId" = ${playerId} AND status = 'ACTIVE') AS busy`;
  return Number(row?.busy) || 0;
}
// Marchands d'un joueur : { total, busy, free, capacity, speed }. `faction` : celle du joueur si l'appelant la connaît
async function merchantState(db, playerId, faction = null) {
  const [capital, player, busy] = await Promise.all([
    capitalBuildingsOf(db, playerId),
    faction ? null : db.player.findUnique({ where: { id: playerId }, select: { faction: true } }),
    busyMerchants(db, playerId)
  ]);
  const civ = faction || player?.faction;
  const total = fx.merchantCount(capital);
  return { total, busy, free: Math.max(0, total - busy), capacity: merchantCapacity(civ, capital), speed: merchantSpeed(civ) };
}

// Les marchands d'un joueur se prennent l'un après l'autre (deux envois simultanés ne comptent pas deux fois les mêmes) :
// verrou du joueur jusqu'à la fin de la transaction, pris APRÈS ceux des villes
const lockMerchants = (tx, playerId) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'merchants:' + playerId}))`;

// Marchands libres pour porter `amount` : { state, needed }, ou { error, status, merchants } quand il en manque
async function reserveMerchants(tx, playerId, amount, faction = null) {
  await lockMerchants(tx, playerId);
  const state = await merchantState(tx, playerId, faction);
  const needed = merchantsFor(amount, state.capacity);
  if (needed > state.free) return { error: noMerchants(state.free, needed), status: 400, merchants: state };
  return { state, needed };
}

// Trajet des marchands entre deux villes (secondes, aller ; le retour dure autant) : la vraie route (relief), à la vitesse
// de leur civilisation, sans les bonus de marche des armées. Sans chemin terrestre : refus (NO_ROUTE), ou la ligne droite
// si `lenient` (routes commerciales du tick, qui ne doivent pas rester bloquées)
async function merchantSeconds(from, to, faction, lenient = false) {
  const len = await routeLength(from.x, from.y, to.x, to.y, faction).catch(e => { if (lenient) return null; throw e; });
  return calculateTravelTime(from.x, from.y, to.x, to.y, merchantSpeed(faction), null, null, len);
}

// Des marchands partent de `from` vers `to` avec `load`, déjà débité de `from` ; ils restent occupés jusqu'au retour.
// Renvoie { merchantsUsed, arrivalAt, returnAt, convoy }
async function dispatchMerchants(tx, { playerId, faction, from, to, load, merchants, kind, routeId = null, now = new Date() }) {
  const seconds = await merchantSeconds(from, to, faction, kind === 'ROUTE');
  const arrivalAt = new Date(now.getTime() + seconds * 1000), returnAt = new Date(now.getTime() + 2 * seconds * 1000);
  const convoy = await tx.tradeConvoy.create({ data: { playerId, routeId, kind, fromCityId: from.id, toCityId: to.id, ...loadOf(load), merchants, departedAt: now, arrivalAt, returnAt } });
  return { merchantsUsed: merchants, arrivalAt, returnAt, convoy };
}

// Envoi de ressources d'une ville du joueur vers une autre ville (la sienne ou celle d'un joueur), par ses marchands. Dans
// la transaction de l'appelant, qui a vérifié la ville de départ, la diplomatie et le blocus. Renvoie
// { merchantsUsed, arrivalAt, returnAt }, ou { error, status }
async function sendResources(tx, { playerId, faction, fromCity, toCity, resources, now = new Date() }) {
  const load = loadOf(resources);
  if (totalOf(load) <= 0) return { error: 'Entrez des ressources à envoyer', status: 400 };
  await lockCity(tx, fromCity.id);
  const r = await reserveMerchants(tx, playerId, totalOf(load), faction);
  if (r.error) return r;
  if (!(await debitCity(tx, fromCity.id, load))) return { error: 'Ressources insuffisantes', status: 400 };
  const { merchantsUsed, arrivalAt, returnAt } = await dispatchMerchants(tx, { playerId, faction, from: fromCity, to: toCity, load, merchants: r.needed, kind: 'SEND', now });
  return { merchantsUsed, arrivalAt, returnAt };
}

// ---- échanges entre joueurs ----
// Offre : les marchands du vendeur attendent dans la ville avec les marchandises (offerHours au plus). La ville est
// verrouillée par l'appelant. Renvoie { offer, merchantsUsed, arrivalAt: null, returnAt: null }, ou { error, status }
async function createOffer(tx, { playerId, faction, city, sellResource, sellAmount, buyResource, buyAmount, now = new Date() }) {
  const r = await reserveMerchants(tx, playerId, sellAmount, faction);
  if (r.error) return r;
  if (!(await debitCity(tx, city.id, { [sellResource]: sellAmount }))) return { error: `Ressources insuffisantes (${RES_FR[sellResource]} : ${Math.floor(city[sellResource] || 0)})`, status: 400 };
  const offer = await tx.marketOffer.create({ data: { sellerId: playerId, cityId: city.id, sellResource, sellAmount, buyResource, buyAmount, status: 'ACTIVE', merchants: r.needed, expiresAt: new Date(now.getTime() + M.offerHours * 3600000) } });
  return { offer, merchantsUsed: r.needed, arrivalAt: null, returnAt: null };
}

// Échange conclu : les marchands du vendeur partent (taxe du vendeur déduite) vers la ville de l'acheteur, ceux de
// l'acheteur (taxe de l'acheteur déduite) vers celle du vendeur. L'appelant a verrouillé l'offre (active) et les deux
// villes, vérifié la diplomatie et le blocus. Renvoie { toBuyer, toSeller, sellerTax, buyerTax, seller, buyer } (seller /
// buyer : { merchantsUsed, arrivalAt, returnAt }), ou { error, status }
async function acceptOffer(tx, { offer, buyerId, buyerFaction, buyerCity, sellerCity, sellerFaction, now = new Date() }) {
  const r = await reserveMerchants(tx, buyerId, offer.buyAmount, buyerFaction);
  if (r.error) return r;
  if (!(await debitCity(tx, buyerCity.id, { [offer.buyResource]: offer.buyAmount }))) return { error: `Ressources insuffisantes (${RES_FR[offer.buyResource]})`, status: 400 };
  const done = await tx.marketOffer.updateMany({ where: { id: offer.id, status: 'ACTIVE' }, data: { status: 'COMPLETED', buyerId, buyerCityId: buyerCity.id, acceptedAt: now } });
  if (done.count !== 1) throw new Error('offer raced');
  const [sellerTax, buyerTax] = await Promise.all([p2pTaxPct(tx, sellerCity.id), p2pTaxPct(tx, buyerCity.id)]);
  const toBuyer = afterTax(offer.sellAmount, sellerTax), toSeller = afterTax(offer.buyAmount, buyerTax);
  const out = (d) => ({ merchantsUsed: d.merchantsUsed, arrivalAt: d.arrivalAt, returnAt: d.returnAt });
  const seller = out(await dispatchMerchants(tx, { playerId: offer.sellerId, faction: sellerFaction, from: sellerCity, to: buyerCity, load: { [offer.sellResource]: toBuyer }, merchants: offer.merchants, kind: 'TRADE', now }));
  const buyer = out(await dispatchMerchants(tx, { playerId: buyerId, faction: buyerFaction, from: buyerCity, to: sellerCity, load: { [offer.buyResource]: toSeller }, merchants: r.needed, kind: 'TRADE', now }));
  return { toBuyer, toSeller, sellerTax, buyerTax, seller, buyer };
}

// Place libre d'une ville pour une ressource (entrepôt, ou silo pour la nourriture) ; la Ville Merveille reçoit tout
// au stock du chantier, sans plafond (comme à l'arrivée d'un convoi)
function roomFor(city, res) {
  if (!city) return 0;
  if (city.isWonder) return Infinity;
  const cap = res === 'food' ? city.maxFoodStorage : city.maxStorage;
  return Math.max(0, Math.floor((cap || 0) - (city[res] || 0)));
}

// Une offre active se ferme (retirée, expirée, ville tombée) : ses marchandises reviennent à `refundCityId`, ses
// marchands sont libres (seules les offres actives les retiennent). false si elle n'était plus active
async function closeOffer(tx, offer, status, refundCityId = offer.cityId) {
  const ok = await tx.marketOffer.updateMany({ where: { id: offer.id, status: 'ACTIVE' }, data: { status, cityId: refundCityId || null } });
  if (ok.count !== 1) return false;
  if (refundCityId) await creditCity(tx, refundCityId, { [offer.sellResource]: offer.sellAmount });
  return true;
}
// Offres d'une ville annulées (chute de la ville, capitale déplacée) : marchandises vers `refundCityId`
async function cancelOffersOfCity(tx, cityId, refundCityId) {
  const offers = await tx.marketOffer.findMany({ where: { cityId, status: 'ACTIVE' } });
  for (const o of offers) await closeOffer(tx, o, 'CANCELLED', refundCityId);
  return offers.length;
}

// Tick : offres de plus de 48 h rendues au vendeur. L'offre puis sa ville, dans le même ordre que l'acceptation et le
// retrait (routes/market.js) : pas d'interblocage avec un acheteur au même moment
async function expireOffers(now = new Date()) {
  const due = await prisma.marketOffer.findMany({ where: { status: 'ACTIVE', expiresAt: { lte: now } }, take: 200 });
  for (const o of due) {
    const done = await prisma.$transaction(async (tx) => {
      await lockOffer(tx, o.id);
      if (o.cityId) await lockCity(tx, o.cityId);
      return closeOffer(tx, o, 'EXPIRED');
    });
    if (done) notify(o.sellerId, 'market', '⏳ Offre expirée', `Personne n'a pris votre offre (${o.sellAmount} ${RES_FR[o.sellResource]} contre ${o.buyAmount} ${RES_FR[o.buyResource]}) : les marchandises sont revenues dans la ville et vos marchands sont libres.`, { to: 'city', cityId: o.cityId });
  }
  return due.length;
}

// ---- routes commerciales entre ses villes ----
const routePct = () => M.routes.pctOfStoragePer24h / (24 / M.routes.intervalHours) / 100;   // part du stockage par envoi
// Charge d'un envoi au plus, par ressource : la part du stockage du Dépôt (bois, pierre, fer) et du Silo de la ville
function routeSendCap(buildings) {
  const caps = storageCapsWithoutGreat(buildings);
  return { other: Math.floor(caps.maxStorage * routePct()), food: Math.floor(caps.maxFoodStorage * routePct()) };
}
// Ce que des marchands peuvent porter au plus (`room`) : chaque ressource réduite dans la même proportion
function fitLoad(load, room) {
  const total = totalOf(load);
  if (total <= room) return load;
  return Object.fromEntries(RESOURCES.map(r => [r, Math.floor((load[r] || 0) * Math.max(0, room) / total)]));
}
const isBlocked = async (db, cityId) => (await db.army.count({ where: { status: 'BESIEGING', targetCityId: cityId } })) > 0;
// La cadence vaut pour la ville de départ et la ressource, pas pour la route : le dernier envoi est gardé dans la table des
// limites partagées (purgée au bout d'un jour), pour qu'une route reprise, recréée ou remplacée ne reparte pas plus tôt
const lastSendKey = (cityId, r) => `route:${cityId}:${r}`;
async function routeCadenceUntil(db, cityId, resources) {
  if (!resources.length) return new Date(0);
  const rows = await db.rateLimitBucket.findMany({ where: { key: { in: resources.map(r => lastSendKey(cityId, r)) } }, select: { windowStart: true } });
  return new Date(Math.max(0, ...rows.map(x => new Date(x.windowStart).getTime() + M.routes.intervalHours * 3600000)));
}

async function sendRouteConvoy(route, now) {
  return prisma.$transaction(async (tx) => {
    const ok = await tx.tradeRoute.updateMany({ where: { id: route.id, active: true, nextSendAt: { lte: now } }, data: { nextSendAt: new Date(now.getTime() + M.routes.intervalHours * 3600000) } });
    if (ok.count !== 1) return null;
    const [from, to] = await Promise.all([tx.city.findUnique({ where: { id: route.fromCityId } }), tx.city.findUnique({ where: { id: route.toCityId } })]);
    if (!from || !to || from.playerId !== route.playerId || to.playerId !== route.playerId) { await tx.tradeRoute.update({ where: { id: route.id }, data: { active: false } }); return { stopped: true }; }
    if ((await isBlocked(tx, from.id)) || (await isBlocked(tx, to.id))) return { skipped: 'siège' };
    await lockCity(tx, from.id);
    // cadence de la ville de départ pas encore écoulée (garde-fou) : la route attend la fin
    const until = await routeCadenceUntil(tx, from.id, RESOURCES.filter(r => route[r]));
    if (until > now) { await tx.tradeRoute.update({ where: { id: route.id }, data: { nextSendAt: until } }); return { skipped: 'cadence' }; }
    const fresh = await tx.city.findUnique({ where: { id: from.id }, include: { buildings: { select: { key: true, level: true } } } });
    const sendCap = routeSendCap(fresh.buildings);
    const wanted = {};
    for (const r of RESOURCES) wanted[r] = route[r] ? Math.max(0, Math.floor(Math.min(fresh[r], r === 'food' ? sendCap.food : sendCap.other))) : 0;
    if (totalOf(wanted) <= 0) return { skipped: 'vide' };
    // autant que les marchands libres du joueur peuvent porter
    const player = await tx.player.findUnique({ where: { id: route.playerId }, select: { faction: true } });
    await lockMerchants(tx, route.playerId);
    const state = await merchantState(tx, route.playerId, player?.faction);
    const load = fitLoad(wanted, state.free * state.capacity);
    if (totalOf(load) <= 0) return { skipped: 'marchands' };
    if (!(await debitCity(tx, from.id, load))) return { skipped: 'stock' };
    for (const r of RESOURCES) {
      if (load[r] > 0) await tx.rateLimitBucket.upsert({ where: { key: lastSendKey(from.id, r) }, update: { windowStart: now }, create: { key: lastSendKey(from.id, r), windowStart: now, count: 1 } });
    }
    return dispatchMerchants(tx, { playerId: route.playerId, faction: player?.faction, from, to, load, merchants: merchantsFor(totalOf(load), state.capacity), kind: 'ROUTE', routeId: route.id, now });
  });
}

// ---- marchands en route ----
// Arrivée : les marchandises entrent dans la ville visée, jusqu'à son plafond (la Ville Merveille prend tout, au stock du
// chantier) ; ce qui ne tient pas reste chargé et rentre avec les marchands. Rien n'est livré à une ville disparue, à un
// ennemi (devenu ennemi pendant la marche), ni par une route à une ville qui n'est plus au joueur.
async function deliverConvoy(c, now = new Date()) {
  const done = await prisma.$transaction(async (tx) => {
    const claimed = await tx.tradeConvoy.updateMany({ where: { id: c.id, deliveredAt: null }, data: { deliveredAt: now } });
    if (claimed.count !== 1) return null;
    const load = loadOf(c);
    const to = await tx.city.findUnique({ where: { id: c.toCityId } });
    const open = !!to && (c.kind === 'ROUTE' ? to.playerId === c.playerId : (await require('./diplomacyService').getRelation(c.playerId, to.playerId, tx)).canTransport);
    let kept = loadOf({});
    if (open && to.isWonder) {
      await require('./wonderService').depositToWonder(tx, to.id, load);   // chantier de la Merveille, sans plafond
      kept = load;
    } else if (open) {
      await lockCity(tx, to.id);
      const fresh = await tx.city.findUnique({ where: { id: to.id } });
      for (const r of RESOURCES) kept[r] = Math.min(load[r], roomFor(fresh, r));
      await creditCity(tx, to.id, kept);
    }
    const back = Object.fromEntries(RESOURCES.map(r => [r, load[r] - kept[r]]));
    if (totalOf(kept) > 0) await tx.tradeConvoy.update({ where: { id: c.id }, data: back });   // les marchands rentrent avec le reste
    return { to, open, kept, back };
  });
  if (!done || c.kind === 'ROUTE') return done;   // routes entre ses villes : rien à annoncer
  const { to, open, kept, back } = done;
  const got = resText(kept), over = resText(back);
  if (open && to.playerId !== c.playerId) {
    const sender = (await prisma.player.findUnique({ where: { id: c.playerId }, select: { name: true } }))?.name || 'votre partenaire';
    notify(to.playerId, 'market', '📦 Marchandises livrées', got ? `Les marchands de ${sender} ont livré ${got} à ${to.name}${over ? ` (entrepôt plein : ${over} repartent)` : ''}.` : `Les marchands de ${sender} n'ont rien pu livrer à ${to.name} : l'entrepôt est plein.`, { to: 'city', cityId: to.id });
  }
  if (!open) notify(c.playerId, 'market', '↩️ Livraison annulée', `${to ? `${to.name} appartient désormais à un ennemi` : 'La ville visée a disparu'} : vos marchands rentrent avec leur chargement.`, { to: 'city', cityId: c.fromCityId });
  else if (over) notify(c.playerId, 'market', '📦 Entrepôt plein', `${to.name} n'avait pas la place pour ${over} : vos marchands les ramènent.`, { to: 'city', cityId: c.fromCityId });
  return done;
}
// Retour : les marchands sont de nouveau libres ; ce qu'ils ramènent entre dans leur ville de départ (la capitale si
// elle a disparu), jusqu'à son plafond
async function convoyHome(c) {
  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`DELETE FROM "TradeConvoy" WHERE id = ${c.id} AND "deliveredAt" IS NOT NULL RETURNING wood, stone, iron, food`;
    if (!rows.length) return false;
    const back = loadOf(rows[0]);
    if (totalOf(back) <= 0) return true;
    const home = await tx.city.findFirst({ where: { id: c.fromCityId, playerId: c.playerId }, select: { id: true } })
      || await tx.city.findFirst({ where: { playerId: c.playerId, isCapital: true }, select: { id: true } });
    if (home) { await lockCity(tx, home.id); await creditCity(tx, home.id, back); }
    return true;
  });
}

async function processTradeRoutes(now = new Date()) {
  const routes = await prisma.tradeRoute.findMany({ where: { active: true, nextSendAt: { lte: now } }, take: 300 });
  for (const r of routes) await sendRouteConvoy(r, now).catch(e => console.error('[ROUTE]', e.message));
  const arriving = await prisma.tradeConvoy.findMany({ where: { deliveredAt: null, arrivalAt: { lte: now } }, orderBy: { arrivalAt: 'asc' }, take: 500 });
  for (const c of arriving) await deliverConvoy(c, now).catch(e => console.error('[CONVOY]', e.message));
  const returning = await prisma.tradeConvoy.findMany({ where: { deliveredAt: { not: null }, returnAt: { lte: now } }, orderBy: { returnAt: 'asc' }, take: 500 });
  for (const c of returning) await convoyHome(c).catch(e => console.error('[CONVOY]', e.message));
  return { routes: routes.length, convoys: arriving.length, returned: returning.length };
}

module.exports = {
  p2pTaxPct, afterTax, roomFor, merchantCapacity, merchantSpeed, merchantsFor, merchantState, reserveMerchants, merchantSeconds,
  dispatchMerchants, sendResources, createOffer, acceptOffer, closeOffer, cancelOffersOfCity, expireOffers, processTradeRoutes,
  sendRouteConvoy, deliverConvoy, convoyHome, fitLoad, routePct, routeSendCap, routeCadenceUntil, RES_FR
};
