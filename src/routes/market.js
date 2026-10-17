const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const config = require('../config');
const { unitsData, factionsData } = require('../config/gamedata');
const { getArmyTravelTime, getArmyCarryCapacity, getFactionBonus } = require('../utils/calculations');
const { getRelation } = require('../services/diplomacyService');
const { isAmount } = require('../utils/validation');
const { RESOURCES, lockCity, lockOffer, debitCity, creditCity, transition, isId } = require('../utils/db');

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
    res.json(offers.map(({ seller, ...o }) => ({ ...o, player: seller })));
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
    const targetCity = await prisma.city.findFirst({ where: { x: targetX, y: targetY } });
    if (!targetCity) return res.status(404).json({ error: 'Aucune ville a ces coordonnees' });
    if (targetCity.id === fromCityId) return res.status(400).json({ error: 'Choisissez une autre ville' });
    const relation = await getRelation(req.user.playerId, targetCity.playerId);
    if (!relation.canTransport) return res.status(403).json({ error: 'Impossible d\'envoyer des ressources à un ennemi' });

    const result = await prisma.$transaction(async (tx) => {
      const sourceCity = await tx.city.findFirst({ where: { id: fromCityId, playerId: req.user.playerId }, include: { player: true } });
      if (!sourceCity) return { error: 'Ville source introuvable', status: 404 };
      await lockCity(tx, sourceCity.id);
      if (!(await hasMarket(tx, sourceCity.id))) return NO_MARKET;
      const candidates = await tx.army.findMany({ where: { cityId: sourceCity.id, ownerId: req.user.playerId, status: 'IDLE', isGarrison: false }, include: { units: true, hero: true } });
      const army = candidates.find(a => a.units.length > 0 && a.x === sourceCity.x && a.y === sourceCity.y);
      if (!army) return { error: 'Aucune armée disponible pour transporter (créez une armée au point de ralliement)', status: 400 };
      const transportMultiplier = 1 + (getFactionBonus(sourceCity.player.faction, 'transportCapacity', factionsData) / 100);
      const carryCapacity = Math.floor(getArmyCarryCapacity(army.units, unitsData, army.hero) * transportMultiplier);
      if (wood + stone + iron + food > carryCapacity) return { error: `Capacite insuffisante (max ${carryCapacity})`, status: 400 };
      if (!(await debitCity(tx, sourceCity.id, { wood, stone, iron, food }))) return { error: 'Ressources insuffisantes', status: 400 };
      const travelTime = getArmyTravelTime(army.units, sourceCity.x, sourceCity.y, targetCity.x, targetCity.y, sourceCity.player.faction, army.hero);
      const arrivalAt = new Date(Date.now() + travelTime * 1000);
      const ok = await transition(tx, 'army', army.id, 'IDLE', { status: 'TRANSPORTING', targetX: targetCity.x, targetY: targetCity.y, targetCityId: targetCity.id, arrivalAt, missionType: 'TRANSPORT', carryWood: wood, carryStone: stone, carryIron: iron, carryFood: food });
      if (!ok) throw new Error('army busy');
      return { message: `Ressources envoyees vers ${targetCity.name}`, travelTime, arrivalAt };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) {
    if (e.message === 'army busy') return res.status(409).json({ error: 'Armée déjà en mission' });
    sendError(res, e);
  }
});

// POST /api/market/offer
router.post('/offer', auth, async (req, res) => {
  try {
    const { sellResource, sellAmount, buyResource, buyAmount, cityId } = req.body || {};
    if (!sellResource || !sellAmount || !buyResource || !buyAmount) return res.status(400).json({ error: 'Paramètres manquants' });
    if (!RESOURCES.includes(sellResource) || !RESOURCES.includes(buyResource)) return res.status(400).json({ error: 'Ressource invalide' });
    if (sellResource === buyResource) return res.status(400).json({ error: 'Choisissez des ressources differentes' });
    if (!isAmount(sellAmount) || sellAmount < 1 || !isAmount(buyAmount) || buyAmount < 1) return res.status(400).json({ error: 'Montants invalides' });
    const ratio = Math.max(sellAmount / buyAmount, buyAmount / sellAmount);
    if (ratio > config.market.maxRatio) return res.status(400).json({ error: `Ratio limité à 1:${config.market.maxRatio}` });
    if (!isId(cityId)) return res.status(400).json({ error: 'Ville requise' });
    const result = await prisma.$transaction(async (tx) => {
      const city = await tx.city.findFirst({ where: { id: cityId, playerId: req.user.playerId } });
      if (!city) return { error: 'Ville non trouvée', status: 404 };
      await lockCity(tx, city.id);
      if (!(await hasMarket(tx, city.id))) return NO_MARKET;
      const active = await tx.marketOffer.count({ where: { sellerId: req.user.playerId, status: 'ACTIVE' } });
      if (active >= config.market.maxActiveOffers) return { error: `Maximum ${config.market.maxActiveOffers} offres actives`, status: 400 };
      if (!(await debitCity(tx, city.id, { [sellResource]: sellAmount }))) return { error: `Ressources insuffisantes (${sellResource}: ${Math.floor(city[sellResource])})`, status: 400 };
      const offer = await tx.marketOffer.create({ data: { sellerId: req.user.playerId, cityId: city.id, sellResource, sellAmount, buyResource, buyAmount, status: 'ACTIVE' } });
      return { message: 'Offre créée', offer };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

// POST /api/market/offer/:id/accept
router.post('/offer/:id/accept', auth, async (req, res) => {
  try {
    const { cityId } = req.body || {};
    if (!isId(cityId)) return res.status(400).json({ error: 'Ville requise' });
    const result = await prisma.$transaction(async (tx) => {
      await lockOffer(tx, req.params.id);
      const offer = await tx.marketOffer.findUnique({ where: { id: req.params.id } });
      if (!offer) return { error: 'Offre non trouvée', status: 404 };
      if (offer.status !== 'ACTIVE') return { error: 'Offre inactive', status: 400 };
      if (offer.sellerId === req.user.playerId) return { error: 'Vous ne pouvez pas accepter votre propre offre', status: 400 };
      const buyerCity = await tx.city.findFirst({ where: { id: cityId, playerId: req.user.playerId } });
      if (!buyerCity) return { error: 'Ville acheteur non trouvée', status: 404 };
      await lockCities(tx, [buyerCity.id, offer.cityId]);
      if (!(await hasMarket(tx, buyerCity.id))) return NO_MARKET;
      const fresh = await tx.city.findUnique({ where: { id: buyerCity.id } });
      const cap = offer.sellResource === 'food' ? fresh.maxFoodStorage : fresh.maxStorage;
      if (fresh[offer.sellResource] + offer.sellAmount > cap) return { error: `Stockage insuffisant pour recevoir ${offer.sellAmount} ${offer.sellResource}`, status: 400 };
      if (!(await debitCity(tx, buyerCity.id, { [offer.buyResource]: offer.buyAmount }))) return { error: `Ressources insuffisantes (${offer.buyResource})`, status: 400 };
      await creditCity(tx, buyerCity.id, { [offer.sellResource]: offer.sellAmount });
      if (offer.cityId) await creditCity(tx, offer.cityId, { [offer.buyResource]: offer.buyAmount });
      const ok = await transition(tx, 'marketOffer', offer.id, 'ACTIVE', { status: 'COMPLETED', buyerId: req.user.playerId });
      if (!ok) throw new Error('offer raced');
      return { message: 'Échange effectué!' };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) {
    if (e.message === 'offer raced') return res.status(409).json({ error: 'Offre déjà prise' });
    sendError(res, e);
  }
});

// DELETE /api/market/offer/:id
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
      return { message: 'Offre annulée' };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) {
    if (e.message === 'offer raced') return res.status(409).json({ error: 'Offre déjà traitée' });
    sendError(res, e);
  }
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
      if (!(await hasMarket(tx, city.id))) return { error: 'Construisez un marche (niveau 1 minimum)', status: 400 };
      const receiveAmount = Math.floor(giveAmount * 2 / 3);
      if (receiveAmount <= 0) return { error: 'Quantite trop faible', status: 400 };
      const fresh = await tx.city.findUnique({ where: { id: city.id } });
      const maxStorage = receiveResource === 'food' ? fresh.maxFoodStorage : fresh.maxStorage;
      const free = Math.floor(maxStorage - fresh[receiveResource]);
      if (free <= 0) return { error: 'Stockage plein pour cette ressource', status: 400 };
      // Never pay for what the warehouse cannot hold: the given amount is scaled down to the room left
      const actualReceived = Math.min(receiveAmount, free);
      const actualGiven = actualReceived === receiveAmount ? giveAmount : Math.ceil(actualReceived * 3 / 2);
      if (!(await debitCity(tx, city.id, { [giveResource]: actualGiven }))) return { error: `Pas assez de ${giveResource}`, status: 400 };
      await creditCity(tx, city.id, { [receiveResource]: actualReceived });
      return { given: actualGiven, received: actualReceived, giveResource, receiveResource };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

module.exports = router;
module.exports.tradeRouter = tradeRouter;
