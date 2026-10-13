const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const { unitsData, factionsData } = require('../config/gamedata');
const { getArmyTravelTime, getArmyCarryCapacity, getFactionBonus } = require('../utils/calculations');
const { getRelation } = require('../services/diplomacyService');

const RESOURCES = ['wood', 'stone', 'iron', 'food'];
const tradeRouter = express.Router();

// GET /api/market
router.get('/', auth, async (req, res) => {
  try {
    const offers = await prisma.marketOffer.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 200 });
    // Older offers only carry sellerId, so resolve seller names from it
    const sellerIds = [...new Set(offers.map(o => o.sellerId || o.playerId).filter(Boolean))];
    const sellers = await prisma.player.findMany({ where: { id: { in: sellerIds } }, select: { id: true, name: true } });
    const byId = new Map(sellers.map(p => [p.id, p]));
    res.json(offers.map(o => ({ ...o, player: byId.get(o.sellerId || o.playerId) || null })));
  } catch (e) { sendError(res, e); }
});

// POST /api/trade/send (mounted at /api)
tradeRouter.post('/trade/send', auth, async (req, res) => {
  try {
    const { fromCityId, resources } = req.body;
    const targetX = parseInt(req.body.targetX), targetY = parseInt(req.body.targetY);
    const wood = resources?.wood || 0, stone = resources?.stone || 0, iron = resources?.iron || 0, food = resources?.food || 0;
    if (![wood, stone, iron, food].every(v => Number.isInteger(v) && v >= 0)) return res.status(400).json({ error: 'Montants invalides' });
    if (wood + stone + iron + food <= 0) return res.status(400).json({ error: 'Entrez des ressources a envoyer' });
    if (Number.isNaN(targetX) || Number.isNaN(targetY)) return res.status(400).json({ error: 'Coordonnées invalides' });
    const targetCity = await prisma.city.findFirst({ where: { x: targetX, y: targetY } });
    if (!targetCity) return res.status(404).json({ error: 'Aucune ville a ces coordonnees' });
    if (targetCity.id === fromCityId) return res.status(400).json({ error: 'Choisissez une autre ville' });
    const relation = await getRelation(req.user.playerId, targetCity.playerId);
    if (!relation.canTransport) return res.status(403).json({ error: 'Impossible d\'envoyer des ressources à un ennemi' });

    const result = await prisma.$transaction(async (tx) => {
      // Any idle army (garrison included) standing in the source city can carry the goods
      const candidates = await tx.army.findMany({ where: { cityId: fromCityId, ownerId: req.user.playerId, status: 'IDLE' }, include: { units: true, city: true, owner: true } });
      const army = candidates.find(a => a.units.length > 0 && a.city && a.x === a.city.x && a.y === a.city.y);
      if (!army) return { error: 'Aucune armee disponible pour transporter', status: 400 };
      const sourceCity = army.city;
      if (sourceCity.wood < wood || sourceCity.stone < stone || sourceCity.iron < iron || sourceCity.food < food) return { error: 'Ressources insuffisantes', status: 400 };
      const transportMultiplier = 1 + (getFactionBonus(army.owner.faction, 'transportCapacity', factionsData) / 100);
      const carryCapacity = Math.floor(getArmyCarryCapacity(army.units, unitsData) * transportMultiplier);
      if (wood + stone + iron + food > carryCapacity) return { error: `Capacite insuffisante (max ${carryCapacity})`, status: 400 };
      await tx.city.update({ where: { id: sourceCity.id }, data: { wood: { decrement: wood }, stone: { decrement: stone }, iron: { decrement: iron }, food: { decrement: food } } });
      const travelTime = getArmyTravelTime(army.units, sourceCity.x, sourceCity.y, targetCity.x, targetCity.y, army.owner.faction);
      const arrivalAt = new Date(Date.now() + travelTime * 1000);
      await tx.army.update({ where: { id: army.id }, data: { status: 'TRANSPORTING', targetX: targetCity.x, targetY: targetCity.y, targetCityId: targetCity.id, arrivalAt, missionType: 'TRANSPORT', carryWood: wood, carryStone: stone, carryIron: iron, carryFood: food } });
      return { message: `Ressources envoyees vers ${targetCity.name}`, travelTime, arrivalAt };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

// POST /api/market/offer
router.post('/offer', auth, async (req, res) => {
  try {
    const { sellResource, sellAmount, buyResource, buyAmount, cityId } = req.body;
    if (!sellResource || !sellAmount || !buyResource || !buyAmount) return res.status(400).json({ error: 'Paramètres manquants' });
    if (!RESOURCES.includes(sellResource) || !RESOURCES.includes(buyResource)) return res.status(400).json({ error: 'Ressource invalide' });
    if (sellResource === buyResource) return res.status(400).json({ error: 'Choisissez des ressources differentes' });
    if (!Number.isInteger(sellAmount) || sellAmount < 1 || !Number.isInteger(buyAmount) || buyAmount < 1) return res.status(400).json({ error: 'Montants invalides' });
    const result = await prisma.$transaction(async (tx) => {
      const city = await tx.city.findFirst({ where: { id: cityId, playerId: req.user.playerId } });
      if (!city) return { error: 'Ville non trouvée', status: 404 };
      if (city[sellResource] < sellAmount) return { error: `Ressources insuffisantes (${sellResource}: ${Math.floor(city[sellResource])})`, status: 400 };
      await tx.city.update({ where: { id: city.id }, data: { [sellResource]: city[sellResource] - sellAmount } });
      const offer = await tx.marketOffer.create({ data: { sellerId: req.user.playerId, playerId: req.user.playerId, cityId: city.id, sellResource, sellAmount, buyResource, buyAmount, status: 'ACTIVE' } });
      return { message: 'Offre créée', offer };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

// POST /api/market/offer/:id/accept
router.post('/offer/:id/accept', auth, async (req, res) => {
  try {
    const { cityId } = req.body;
    const result = await prisma.$transaction(async (tx) => {
      const offer = await tx.marketOffer.findUnique({ where: { id: req.params.id }, include: { player: true } });
      if (!offer) return { error: 'Offre non trouvée', status: 404 };
      if (offer.status !== 'ACTIVE') return { error: 'Offre inactive', status: 400 };
      if (offer.sellerId === req.user.playerId) return { error: 'Vous ne pouvez pas accepter votre propre offre', status: 400 };
      const buyerCity = await tx.city.findFirst({ where: { id: cityId, playerId: req.user.playerId } });
      if (!buyerCity) return { error: 'Ville acheteur non trouvée', status: 404 };
      if (buyerCity[offer.buyResource] < offer.buyAmount) return { error: `Ressources insuffisantes (${offer.buyResource})`, status: 400 };
      await tx.city.update({ where: { id: buyerCity.id }, data: { [offer.buyResource]: buyerCity[offer.buyResource] - offer.buyAmount, [offer.sellResource]: Math.min(buyerCity[offer.sellResource] + offer.sellAmount, offer.sellResource === 'food' ? buyerCity.maxFoodStorage : buyerCity.maxStorage) } });
      const sellerCity = await tx.city.findUnique({ where: { id: offer.cityId } });
      if (sellerCity) { await tx.city.update({ where: { id: sellerCity.id }, data: { [offer.buyResource]: Math.min(sellerCity[offer.buyResource] + offer.buyAmount, offer.buyResource === 'food' ? sellerCity.maxFoodStorage : sellerCity.maxStorage) } }); }
      await tx.marketOffer.update({ where: { id: offer.id }, data: { status: 'COMPLETED', buyerId: req.user.playerId } });
      return { message: 'Échange effectué!' };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

// DELETE /api/market/offer/:id
router.delete('/offer/:id', auth, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const offer = await tx.marketOffer.findUnique({ where: { id: req.params.id } });
      if (!offer) return { error: 'Offre non trouvée', status: 404 };
      if (offer.sellerId !== req.user.playerId) return { error: 'Non autorisé', status: 403 };
      if (offer.status !== 'ACTIVE') return { error: 'Offre inactive', status: 400 };
      const city = await tx.city.findUnique({ where: { id: offer.cityId } });
      if (city) {
        const maxCap = offer.sellResource === 'food' ? city.maxFoodStorage : city.maxStorage;
        await tx.city.update({ where: { id: city.id }, data: { [offer.sellResource]: Math.min(city[offer.sellResource] + offer.sellAmount, maxCap) } });
      }
      await tx.marketOffer.update({ where: { id: offer.id }, data: { status: 'CANCELLED' } });
      return { message: 'Offre annulée' };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

// POST /api/market/npc-trade
router.post('/npc-trade', auth, async (req, res) => {
  try {
    const { cityId, giveResource, receiveResource, giveAmount } = req.body;
    if (!RESOURCES.includes(giveResource) || !RESOURCES.includes(receiveResource)) return res.status(400).json({ error: 'Ressource invalide' });
    if (giveResource === receiveResource) return res.status(400).json({ error: 'Choisissez des ressources differentes' });
    if (!Number.isInteger(giveAmount) || giveAmount < 3) return res.status(400).json({ error: 'Minimum 3 ressources' });
    const result = await prisma.$transaction(async (tx) => {
      const city = await tx.city.findFirst({ where: { id: cityId, playerId: req.user.playerId } });
      if (!city) return { error: 'Ville non trouvee', status: 404 };
      if (city[giveResource] < giveAmount) return { error: `Pas assez de ${giveResource}`, status: 400 };
      const market = await tx.cityBuilding.findFirst({ where: { cityId: city.id, key: 'MARKET' } });
      if (!market || market.level < 1) return { error: 'Construisez un marche (niveau 1 minimum)', status: 400 };
      const receiveAmount = Math.floor(giveAmount * 2 / 3);
      if (receiveAmount <= 0) return { error: 'Quantite trop faible', status: 400 };
      const maxStorage = receiveResource === 'food' ? city.maxFoodStorage : city.maxStorage;
      const actualReceived = Math.min(receiveAmount, maxStorage - city[receiveResource]);
      if (actualReceived <= 0) return { error: 'Stockage plein pour cette ressource', status: 400 };
      await tx.city.update({ where: { id: city.id }, data: { [giveResource]: city[giveResource] - giveAmount, [receiveResource]: city[receiveResource] + actualReceived } });
      return { given: giveAmount, received: actualReceived, giveResource, receiveResource };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

module.exports = router;
module.exports.tradeRouter = tradeRouter;
