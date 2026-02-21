const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const { unitsData, factionsData } = require('../config/gamedata');
const { calculateTravelTime, getArmyMinSpeed, getFactionBonus } = require('../utils/calculations');

// GET /api/market
router.get('/', auth, async (req, res) => {
  try {
    const offers = await prisma.marketOffer.findMany({ where: { status: 'ACTIVE' }, include: { player: { select: { id: true, name: true } } }, orderBy: { createdAt: 'desc' } });
    res.json(offers);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/trade/send
router.post('/trade/send', auth, async (req, res) => {
  try {
    const { fromCityId, targetX, targetY, resources } = req.body;
    const wood = resources?.wood || 0, stone = resources?.stone || 0, iron = resources?.iron || 0, food = resources?.food || 0;
    if (wood < 0 || stone < 0 || iron < 0 || food < 0) return res.status(400).json({ error: 'Montants invalides' });
    if (wood + stone + iron + food <= 0) return res.status(400).json({ error: 'Entrez des ressources a envoyer' });
    const targetCity = await prisma.city.findFirst({ where: { x: targetX, y: targetY }, include: { player: true } });
    if (!targetCity) return res.status(404).json({ error: 'Aucune ville a ces coordonnees' });

    const result = await prisma.$transaction(async (tx) => {
      const army = await tx.army.findFirst({ where: { cityId: fromCityId, ownerId: req.user.playerId, status: 'IDLE' }, include: { units: true, city: true } });
      if (!army || !army.units.length) return { error: 'Aucune armee disponible pour transporter', status: 400 };
      const sourceCity = army.city;
      if (!sourceCity) return { error: 'Ville source introuvable', status: 400 };
      if (sourceCity.wood < wood || sourceCity.stone < stone || sourceCity.iron < iron || sourceCity.food < food) return { error: 'Ressources insuffisantes', status: 400 };
      const player = await tx.player.findUnique({ where: { id: req.user.playerId } });
      const transportBonus = getFactionBonus(player?.faction, 'transportCapacity', factionsData);
      const transportMultiplier = 1 + (transportBonus / 100);
      const baseCarry = army.units.reduce((sum, u) => { const unitDef = unitsData.find(ud => ud.key === u.unitKey); return sum + (unitDef?.stats?.transport || 50) * u.count; }, 0);
      const carryCapacity = Math.floor(baseCarry * transportMultiplier);
      if (wood + stone + iron + food > carryCapacity) return { error: `Capacite insuffisante (max ${carryCapacity})`, status: 400 };
      await tx.city.update({ where: { id: sourceCity.id }, data: { wood: sourceCity.wood - wood, stone: sourceCity.stone - stone, iron: sourceCity.iron - iron, food: sourceCity.food - food } });
      const minSpeed = getArmyMinSpeed(army.units, unitsData);
      const travelTime = calculateTravelTime(sourceCity.x, sourceCity.y, targetCity.x, targetCity.y, minSpeed);
      const arrivalAt = new Date(Date.now() + travelTime * 1000);
      await tx.army.update({ where: { id: army.id }, data: { status: 'TRANSPORTING', targetX: targetCity.x, targetY: targetCity.y, targetCityId: targetCity.id, arrivalAt, missionType: 'TRANSPORT', carryWood: wood, carryStone: stone, carryIron: iron, carryFood: food } });
      return { message: `Ressources envoyees vers ${targetCity.name}` };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/market/offer
router.post('/offer', auth, async (req, res) => {
  try {
    const { sellResource, sellAmount, buyResource, buyAmount, cityId } = req.body;
    const validResources = ['wood', 'stone', 'iron', 'food'];
    if (!sellResource || !sellAmount || !buyResource || !buyAmount) return res.status(400).json({ error: 'Paramètres manquants' });
    if (!validResources.includes(sellResource) || !validResources.includes(buyResource)) return res.status(400).json({ error: 'Ressource invalide' });
    if (!Number.isInteger(sellAmount) || sellAmount < 1 || !Number.isInteger(buyAmount) || buyAmount < 1) return res.status(400).json({ error: 'Montants invalides' });
    const result = await prisma.$transaction(async (tx) => {
      const city = await tx.city.findFirst({ where: { id: cityId, playerId: req.user.playerId } });
      if (!city) return { error: 'Ville non trouvée', status: 404 };
      if (city[sellResource] < sellAmount) return { error: `Ressources insuffisantes (${sellResource}: ${Math.floor(city[sellResource])})`, status: 400 };
      await tx.city.update({ where: { id: city.id }, data: { [sellResource]: city[sellResource] - sellAmount } });
      const offer = await tx.marketOffer.create({ data: { sellerId: req.user.playerId, cityId: city.id, sellResource, sellAmount, buyResource, buyAmount, status: 'ACTIVE' } });
      return { message: 'Offre créée', offer };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
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
  } catch (e) { res.status(500).json({ error: e.message }); }
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/market/npc-trade
router.post('/npc-trade', auth, async (req, res) => {
  try {
    const { cityId, giveResource, receiveResource, giveAmount } = req.body;
    const validResources = ['wood', 'stone', 'iron', 'food'];
    if (!validResources.includes(giveResource) || !validResources.includes(receiveResource)) return res.status(400).json({ error: 'Ressource invalide' });
    if (giveResource === receiveResource) return res.status(400).json({ error: 'Choisissez des ressources differentes' });
    if (!giveAmount || giveAmount < 3) return res.status(400).json({ error: 'Minimum 3 ressources' });
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
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
