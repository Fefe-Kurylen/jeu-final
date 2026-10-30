const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const config = require('../config');
const { unitsData, factionsData } = require('../config/gamedata');
const { getArmyTravelTime, getArmyCarryCapacity, getFactionBonus } = require('../utils/calculations');
const T = require('../utils/techEffects');
const { getRelation } = require('../services/diplomacyService');
const { isAmount } = require('../utils/validation');
const { RESOURCES, lockCity, lockOffer, debitCity, creditCity, transition, isId } = require('../utils/db');
const fx = require('../utils/buildingEffects');
const { routeLength } = require('../utils/pathfinding');
// Blockade: no goods leave or enter a besieged city through the market either (offers hold goods in escrow)

// When a real mail provider is configured, trading with other players needs a verified address
// (the cheapest barrier against throw-away accounts feeding a main one)
async function tradeAllowed(tx, playerId) {
  if (!config.email.enforce) return null;
  const player = await tx.player.findUnique({ where: { id: playerId }, select: { account: { select: { emailVerifiedAt: true } } } });
  return player?.account?.emailVerifiedAt ? null : { error: 'Confirmez votre adresse e-mail pour commercer avec les autres joueurs', status: 403 };
}

const tradeRouter = express.Router();

// Trading needs a Market in the city (Travian rule; also the first barrier against multi-account feeding)
async function hasMarket(tx, cityId) {
  if (!config.market.requireBuilding) return true;
  const market = await tx.cityBuilding.findFirst({ where: { cityId, key: 'MARKET', level: { gte: 1 } }, select: { id: true } });
  return !!market;
}
const NO_MARKET = { error: 'Construisez un Marché (niveau 1 minimum) pour commercer', status: 400 };

// Locks several cities in a fixed order so two crossed trades can never deadlock
async function lockCities(tx, ids) {
  for (const id of [...new Set(ids.filter(Boolean))].sort()) await lockCity(tx, id);
}

// GET /api/market
router.get('/', auth, async (req, res) => {
  try {
    const offers = await prisma.marketOffer.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 200, include: { seller: { select: { id: true, name: true } } } });
    const cities = new Map((await prisma.city.findMany({ where: { id: { in: offers.map(o => o.cityId).filter(Boolean) } }, select: { id: true, name: true, x: true, y: true } })).map(c => [c.id, c]));
    res.json(offers.map(({ seller, armyId, ...o }) => ({ ...o, player: seller, city: cities.get(o.cityId) || null })));
  } catch (e) { sendError(res, e); }
});

// POST /api/trade/send (mounted at /api): a field army of the city carries the goods
tradeRouter.post('/trade/send', auth, async (req, res) => {
  try {
    const { fromCityId, resources } = req.body || {};
    const targetX = parseInt(req.body?.targetX), targetY = parseInt(req.body?.targetY);
    const wood = resources?.wood || 0, stone = resources?.stone || 0, iron = resources?.iron || 0, food = resources?.food || 0;
    if (!isId(fromCityId)) return res.status(400).json({ error: 'Ville source requise' });
    if (![wood, stone, iron, food].every(isAmount)) return res.status(400).json({ error: 'Montants invalides' });
    if (wood + stone + iron + food <= 0) return res.status(400).json({ error: 'Entrez des ressources a envoyer' });
    if (Number.isNaN(targetX) || Number.isNaN(targetY)) return res.status(400).json({ error: 'Coordonnées invalides' });
    const targetCity = await prisma.city.findFirst({ where: require('../utils/spawn').cityAtCellWhere(targetX, targetY) });   // any of its 2 × 2 cells
    if (!targetCity) return res.status(404).json({ error: 'Aucune ville a ces coordonnees' });
    if (targetCity.id === fromCityId) return res.status(400).json({ error: 'Choisissez une autre ville' });
    const relation = await getRelation(req.user.playerId, targetCity.playerId);
    if (!relation.canTransport) return res.status(403).json({ error: 'Impossible d\'envoyer des ressources à un ennemi' });
    if (await prisma.army.count({ where: { status: 'BESIEGING', targetCityId: targetCity.id } })) return res.status(400).json({ error: 'Ville assiégée : aucun convoi ne passe tant que l\'armée ennemie est devant elle' });

    const result = await prisma.$transaction(async (tx) => {
      const sourceCity = await tx.city.findFirst({ where: { id: fromCityId, playerId: req.user.playerId }, include: { player: { include: { technologies: true } } } });
      if (!sourceCity) return { error: 'Ville source introuvable', status: 404 };
      await lockCity(tx, sourceCity.id);
      if (!(await hasMarket(tx, sourceCity.id))) return NO_MARKET;
      const blocked = await tradeAllowed(tx, req.user.playerId); if (blocked) return blocked;
      const candidates = await tx.army.findMany({ where: { cityId: sourceCity.id, ownerId: req.user.playerId, status: 'IDLE', isGarrison: false }, include: { units: true, hero: { include: { items: true } } } });
      const army = candidates.find(a => a.units.length > 0 && a.x === sourceCity.x && a.y === sourceCity.y);
      if (!army) return { error: 'Aucune armée disponible pour transporter (créez une armée au point de ralliement)', status: 400 };
      const cityBuildings = await tx.cityBuilding.findMany({ where: { cityId: sourceCity.id }, select: { key: true, level: true } });
      const transportMultiplier = (1 + getFactionBonus(sourceCity.player.faction, 'transportCapacity', factionsData) / 100) * (1 + fx.transportBonusPct(cityBuildings) / 100) * (await require('../services/bastionService').carryMult(req.user.playerId));   // + Bastion d'alliance
      const carryCapacity = Math.floor(getArmyCarryCapacity(army.units, unitsData, army.hero) * transportMultiplier);
      if (wood + stone + iron + food > carryCapacity) return { error: `Capacite insuffisante (max ${carryCapacity})`, status: 400 };
      if (!(await debitCity(tx, sourceCity.id, { wood, stone, iron, food }))) return { error: 'Ressources insuffisantes', status: 400 };
      const travelTime = getArmyTravelTime(army.units, sourceCity.x, sourceCity.y, targetCity.x, targetCity.y, sourceCity.player.faction, army.hero, await routeLength(sourceCity.x, sourceCity.y, targetCity.x, targetCity.y, sourceCity.player.faction), T.techPct(sourceCity.player.technologies, 'armySpeedBonusPct'));
      const arrivalAt = new Date(Date.now() + travelTime * 1000);
      const ok = await transition(tx, 'army', army.id, 'IDLE', { status: 'TRANSPORTING', targetX: targetCity.x, targetY: targetCity.y, targetCityId: targetCity.id, arrivalAt, departedAt: new Date(), missionType: 'TRANSPORT', carryWood: wood, carryStone: stone, carryIron: iron, carryFood: food });
      if (!ok) throw new Error('army busy');
      return { message: `Ressources envoyees vers ${targetCity.name}`, travelTime, arrivalAt };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    require('../services/questService').bumpLater(req.user.playerId, 'trade_sent', 1);   // quêtes
    res.json(result);
  } catch (e) {
    if (e.message === 'army busy') return res.status(409).json({ error: 'Armée déjà en mission' });
    if (e.code === 'NO_ROUTE') return res.status(400).json({ error: e.message });
    sendError(res, e);
  }
});

// ---- échanges entre joueurs, livrés par armées de transport (décision du 27 octobre 2026, services/marketService.js) ----
const MS = require('../services/marketService');
const besieged = async (db, cityId) => (await db.army.count({ where: { status: 'BESIEGING', targetCityId: cityId } })) > 0;

// POST /api/market/offer { sellResource, sellAmount, buyResource, buyAmount, cityId, armyId? }
// L'armée de transport du vendeur est réservée (elle attend en ville avec les marchandises) jusqu'à l'échange ou 48 h
router.post('/offer', auth, async (req, res) => {
  try {
    const { sellResource, sellAmount, buyResource, buyAmount, cityId, armyId } = req.body || {};
    if (!sellResource || !sellAmount || !buyResource || !buyAmount) return res.status(400).json({ error: 'Paramètres manquants' });
    if (!RESOURCES.includes(sellResource) || !RESOURCES.includes(buyResource)) return res.status(400).json({ error: 'Ressource invalide' });
    if (sellResource === buyResource) return res.status(400).json({ error: 'Choisissez des ressources differentes' });
    if (!isAmount(sellAmount) || sellAmount < 1 || !isAmount(buyAmount) || buyAmount < 1) return res.status(400).json({ error: 'Montants invalides' });
    const ratio = Math.max(sellAmount / buyAmount, buyAmount / sellAmount);
    if (ratio > config.market.maxRatio) return res.status(400).json({ error: `Ratio limité à 1:${config.market.maxRatio}` });
    if (!isId(cityId)) return res.status(400).json({ error: 'Ville requise' });
    if (armyId !== undefined && armyId !== null && !isId(armyId)) return res.status(400).json({ error: 'Armée invalide' });
    const result = await prisma.$transaction(async (tx) => {
      const city = await tx.city.findFirst({ where: { id: cityId, playerId: req.user.playerId }, include: { player: { select: { faction: true } }, buildings: { select: { key: true, level: true } } } });
      if (!city) return { error: 'Ville non trouvée', status: 404 };
      await lockCity(tx, city.id);
      if (!(await hasMarket(tx, city.id))) return NO_MARKET;
      const blocked = await tradeAllowed(tx, req.user.playerId); if (blocked) return blocked;
      const active = await tx.marketOffer.count({ where: { sellerId: req.user.playerId, status: 'ACTIVE' } });
      if (active >= config.market.maxActiveOffers) return { error: `Maximum ${config.market.maxActiveOffers} offres actives`, status: 400 };
      const pick = await MS.pickTransportArmy(tx, city, req.user.playerId, city.player.faction, sellAmount, armyId || null);
      if (pick.error) return { error: pick.error, status: 400 };
      if (!(await debitCity(tx, city.id, { [sellResource]: sellAmount }))) return { error: `Ressources insuffisantes (${sellResource}: ${Math.floor(city[sellResource])})`, status: 400 };
      if (!(await transition(tx, 'army', pick.army.id, 'IDLE', { status: 'MARKET', missionType: 'MARKET_OFFER' }))) return { error: 'Armée déjà en mission', status: 409 };
      const offer = await tx.marketOffer.create({ data: { sellerId: req.user.playerId, cityId: city.id, sellResource, sellAmount, buyResource, buyAmount, status: 'ACTIVE', armyId: pick.army.id, expiresAt: new Date(Date.now() + config.market.offerHours * 3600000) } });
      return { message: `Offre créée : ${pick.army.name} attend en ville avec les marchandises (48 h au plus)`, offer, taxPct: await MS.p2pTaxPct(tx, city.id) };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

// POST /api/market/offer/:id/accept { cityId, armyId? } : les deux armées partent, chacune avec ce qu'elle livre moins la taxe
router.post('/offer/:id/accept', auth, async (req, res) => {
  try {
    const { cityId, armyId } = req.body || {};
    if (!isId(cityId)) return res.status(400).json({ error: 'Ville requise' });
    if (armyId !== undefined && armyId !== null && !isId(armyId)) return res.status(400).json({ error: 'Armée invalide' });
    const result = await prisma.$transaction(async (tx) => {
      await lockOffer(tx, req.params.id);
      const offer = await tx.marketOffer.findUnique({ where: { id: req.params.id } });
      if (!offer) return { error: 'Offre non trouvée', status: 404 };
      if (offer.status !== 'ACTIVE') return { error: 'Offre inactive', status: 400 };
      if (offer.sellerId === req.user.playerId) return { error: 'Vous ne pouvez pas accepter votre propre offre', status: 400 };
      const buyerCity = await tx.city.findFirst({ where: { id: cityId, playerId: req.user.playerId }, include: { player: { include: { technologies: true } }, buildings: { select: { key: true, level: true } } } });
      if (!buyerCity) return { error: 'Ville acheteur non trouvée', status: 404 };
      await lockCities(tx, [buyerCity.id, offer.cityId]);
      if (!(await hasMarket(tx, buyerCity.id))) return NO_MARKET;
      const blocked = await tradeAllowed(tx, req.user.playerId); if (blocked) return blocked;
      if (!(await getRelation(req.user.playerId, offer.sellerId, tx)).canTransport) return { error: 'Impossible de commercer avec un ennemi', status: 403 };
      const sellerCity = offer.cityId ? await tx.city.findUnique({ where: { id: offer.cityId }, include: { player: { include: { technologies: true } } } }) : null;
      if (!sellerCity) return { error: 'La ville du vendeur n\'existe plus', status: 400 };
      if ((await besieged(tx, buyerCity.id)) || (await besieged(tx, sellerCity.id))) return { error: 'Ville assiégée : aucun convoi ne passe', status: 400 };
      const sellerArmy = offer.armyId ? await tx.army.findFirst({ where: { id: offer.armyId, status: 'MARKET' }, include: { units: true, hero: { include: { items: true } } } }) : null;
      if (!sellerArmy) return { error: 'Le convoi du vendeur n\'est plus disponible', status: 409 };
      const pick = await MS.pickTransportArmy(tx, buyerCity, req.user.playerId, buyerCity.player.faction, offer.buyAmount, armyId || null);
      if (pick.error) return { error: pick.error, status: 400 };
      if (!(await debitCity(tx, buyerCity.id, { [offer.buyResource]: offer.buyAmount }))) return { error: `Ressources insuffisantes (${offer.buyResource})`, status: 400 };
      const [sellerTax, buyerTax] = await Promise.all([MS.p2pTaxPct(tx, sellerCity.id), MS.p2pTaxPct(tx, buyerCity.id)]);
      const toBuyer = MS.afterTax(offer.sellAmount, sellerTax), toSeller = MS.afterTax(offer.buyAmount, buyerTax);
      const now = new Date();
      const tSeller = await MS.travelSecondsBetween(sellerArmy, sellerCity, buyerCity, sellerCity.player.faction, sellerCity.player.technologies);
      const tBuyer = await MS.travelSecondsBetween(pick.army, buyerCity, sellerCity, buyerCity.player.faction, buyerCity.player.technologies);
      const carry = (r, n) => ({ carryWood: r === 'wood' ? n : 0, carryStone: r === 'stone' ? n : 0, carryIron: r === 'iron' ? n : 0, carryFood: r === 'food' ? n : 0 });
      if (!(await transition(tx, 'army', sellerArmy.id, 'MARKET', { status: 'TRANSPORTING', missionType: 'MARKET_DELIVERY', targetX: buyerCity.x, targetY: buyerCity.y, targetCityId: buyerCity.id, departedAt: now, arrivalAt: new Date(now.getTime() + tSeller * 1000), ...carry(offer.sellResource, toBuyer) }))) throw new Error('offer raced');
      if (!(await transition(tx, 'army', pick.army.id, 'IDLE', { status: 'TRANSPORTING', missionType: 'MARKET_DELIVERY', targetX: sellerCity.x, targetY: sellerCity.y, targetCityId: sellerCity.id, departedAt: now, arrivalAt: new Date(now.getTime() + tBuyer * 1000), ...carry(offer.buyResource, toSeller) }))) throw new Error('offer raced');
      const ok = await transition(tx, 'marketOffer', offer.id, 'ACTIVE', { status: 'COMPLETED', buyerId: req.user.playerId, buyerCityId: buyerCity.id, acceptedAt: now });
      if (!ok) throw new Error('offer raced');
      return { message: `Échange conclu : vos ${toSeller} ${MS.RES_FR[offer.buyResource]} partent avec ${pick.army.name}, ${toBuyer} ${MS.RES_FR[offer.sellResource]} arrivent dans ${Math.max(1, Math.round(tSeller / 60))} min`, toBuyer, toSeller, sellerTax, buyerTax, arrivalAt: new Date(now.getTime() + tSeller * 1000), offer, buyerName: buyerCity.player.name, buyerCityName: buyerCity.name };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    const { offer, buyerName, buyerCityName, ...out } = result;
    require('../services/pushService').notify(offer.sellerId, 'market', '🤝 Offre acceptée', `${buyerName} accepte votre offre : ${out.toBuyer} ${MS.RES_FR[offer.sellResource]} partent vers ${buyerCityName}, ${out.toSeller} ${MS.RES_FR[offer.buyResource]} sont en route vers vous.`, { to: 'city', cityId: offer.cityId });
    res.json(out);
  } catch (e) {
    if (e.message === 'offer raced') return res.status(409).json({ error: 'Offre déjà prise' });
    if (e.code === 'NO_ROUTE') return res.status(400).json({ error: e.message });
    sendError(res, e);
  }
});

// DELETE /api/market/offer/:id : marchandises rendues, armée libérée
router.delete('/offer/:id', auth, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockOffer(tx, req.params.id);
      const offer = await tx.marketOffer.findUnique({ where: { id: req.params.id } });
      if (!offer) return { error: 'Offre non trouvée', status: 404 };
      if (offer.sellerId !== req.user.playerId) return { error: 'Non autorisé', status: 403 };
      if (offer.status !== 'ACTIVE') return { error: 'Offre inactive', status: 400 };
      const ok = await transition(tx, 'marketOffer', offer.id, 'ACTIVE', { status: 'CANCELLED' });
      if (!ok) throw new Error('offer raced');
      if (offer.cityId) await creditCity(tx, offer.cityId, { [offer.sellResource]: offer.sellAmount });
      await MS.releaseOfferArmy(tx, offer);
      return { message: 'Offre annulée : marchandises rendues, armée libre' };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) {
    if (e.message === 'offer raced') return res.status(409).json({ error: 'Offre déjà traitée' });
    sendError(res, e);
  }
});

// GET /api/market/tax?cityId= : taxe des convois qui partent de cette ville
router.get('/tax', auth, async (req, res) => {
  try {
    const cityId = String(req.query.cityId || '');
    if (!isId(cityId)) return res.status(400).json({ error: 'Ville requise' });
    const city = await prisma.city.findFirst({ where: { id: cityId, playerId: req.user.playerId }, select: { id: true } });
    if (!city) return res.status(404).json({ error: 'Ville non trouvée' });
    res.json({ taxPct: await MS.p2pTaxPct(prisma, city.id), basePct: config.market.p2pTaxPctBase, offerHours: config.market.offerHours });
  } catch (e) { sendError(res, e); }
});

// ---- routes commerciales entre ses propres villes (décision du 27 octobre 2026) ----
router.get('/routes', auth, async (req, res) => {
  try {
    const [routes, convoys, cities] = await Promise.all([
      prisma.tradeRoute.findMany({ where: { playerId: req.user.playerId }, orderBy: { createdAt: 'asc' } }),
      prisma.tradeConvoy.findMany({ where: { playerId: req.user.playerId }, orderBy: { arrivalAt: 'asc' } }),
      prisma.city.findMany({ where: { playerId: req.user.playerId }, select: { id: true, name: true, maxStorage: true, maxFoodStorage: true } })
    ]);
    const pct = MS.routePct();
    res.json({ routes, convoys, perSend: Object.fromEntries(cities.map(c => [c.id, { other: Math.floor(c.maxStorage * pct), food: Math.floor(c.maxFoodStorage * pct) }])), rules: { ...config.market.routes, pctPerSend: Math.round(pct * 10000) / 100 } });
  } catch (e) { sendError(res, e); }
});
router.post('/routes', auth, async (req, res) => {
  try {
    const { fromCityId, toCityId } = req.body || {};
    const pick = Object.fromEntries(RESOURCES.map(r => [r, !!req.body?.[r]]));
    if (!isId(fromCityId) || !isId(toCityId) || fromCityId === toCityId) return res.status(400).json({ error: 'Choisissez deux villes différentes' });
    if (!RESOURCES.some(r => pick[r])) return res.status(400).json({ error: 'Choisissez au moins une ressource' });
    const mine = await prisma.city.count({ where: { id: { in: [fromCityId, toCityId] }, playerId: req.user.playerId } });
    if (mine !== 2) return res.status(403).json({ error: 'Une route relie deux de vos villes' });
    if (!(await hasMarket(prisma, fromCityId))) return res.status(400).json(NO_MARKET);
    if ((await prisma.tradeRoute.count({ where: { playerId: req.user.playerId } })) >= config.market.routes.maxPerPlayer) return res.status(400).json({ error: `Maximum ${config.market.routes.maxPerPlayer} routes` });
    const route = await prisma.tradeRoute.create({ data: { playerId: req.user.playerId, fromCityId, toCityId, ...pick, nextSendAt: new Date() } });
    res.json({ message: `Route créée : un convoi part toutes les ${config.market.routes.intervalHours} h`, route });
  } catch (e) { sendError(res, e); }
});
router.post('/routes/:id/toggle', auth, async (req, res) => {
  try {
    const route = await prisma.tradeRoute.findFirst({ where: { id: req.params.id, playerId: req.user.playerId } });
    if (!route) return res.status(404).json({ error: 'Route introuvable' });
    await prisma.tradeRoute.update({ where: { id: route.id }, data: { active: !route.active, ...(route.active ? {} : { nextSendAt: new Date() }) } });
    res.json({ message: route.active ? 'Route en pause' : 'Route reprise', active: !route.active });
  } catch (e) { sendError(res, e); }
});
router.delete('/routes/:id', auth, async (req, res) => {
  try {
    const gone = await prisma.tradeRoute.deleteMany({ where: { id: req.params.id, playerId: req.user.playerId } });
    if (!gone.count) return res.status(404).json({ error: 'Route introuvable' });
    res.json({ message: 'Route supprimée (les convois en chemin arrivent quand même)' });
  } catch (e) { sendError(res, e); }
});

// POST /api/market/npc-trade — 3:2 exchange with the NPC merchant, needs a Market building
router.post('/npc-trade', auth, async (req, res) => {
  try {
    const { cityId, giveResource, receiveResource, giveAmount } = req.body || {};
    if (!RESOURCES.includes(giveResource) || !RESOURCES.includes(receiveResource)) return res.status(400).json({ error: 'Ressource invalide' });
    if (giveResource === receiveResource) return res.status(400).json({ error: 'Choisissez des ressources differentes' });
    if (!isAmount(giveAmount) || giveAmount < 3) return res.status(400).json({ error: 'Minimum 3 ressources' });
    if (!isId(cityId)) return res.status(400).json({ error: 'Ville requise' });
    const result = await prisma.$transaction(async (tx) => {
      const city = await tx.city.findFirst({ where: { id: cityId, playerId: req.user.playerId } });
      if (!city) return { error: 'Ville non trouvee', status: 404 };
      await lockCity(tx, city.id);
      const market = await tx.cityBuilding.findFirst({ where: { cityId: city.id, key: 'MARKET' }, select: { level: true } });
      if (!market || market.level < 1) return { error: 'Construisez un marche (niveau 1 minimum)', status: 400 };
      // NPC merchant tax: 30 % at level 1, one point less per level (data: serverMarketTax*)
      const taxPct = fx.npcMarketTaxPct(market.level);
      const receiveAmount = Math.floor(giveAmount * (1 - taxPct / 100));
      if (receiveAmount <= 0) return { error: 'Quantite trop faible', status: 400 };
      const fresh = await tx.city.findUnique({ where: { id: city.id } });
      const maxStorage = receiveResource === 'food' ? fresh.maxFoodStorage : fresh.maxStorage;
      const free = Math.floor(maxStorage - fresh[receiveResource]);
      if (free <= 0) return { error: 'Stockage plein pour cette ressource', status: 400 };
      // Never pay for what the warehouse cannot hold: the given amount is scaled down to the room left
      const actualReceived = Math.min(receiveAmount, free);
      const actualGiven = actualReceived === receiveAmount ? giveAmount : Math.ceil(actualReceived / (1 - taxPct / 100));
      if (!(await debitCity(tx, city.id, { [giveResource]: actualGiven }))) return { error: `Pas assez de ${giveResource}`, status: 400 };
      await creditCity(tx, city.id, { [receiveResource]: actualReceived });
      return { given: actualGiven, received: actualReceived, giveResource, receiveResource, taxPct };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

module.exports = router;
module.exports.tradeRouter = tradeRouter;
