const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const config = require('../config');
const { getRelation } = require('../services/diplomacyService');
const { isAmount } = require('../utils/validation');
const { RESOURCES, RES_FR, lockCity, lockOffer, debitCity, creditCity, isId, capitalBuildingsOf } = require('../utils/db');
const fx = require('../utils/buildingEffects');
const MS = require('../services/marketService');

// When a real mail provider is configured, trading with other players needs a verified address
// (the cheapest barrier against throw-away accounts feeding a main one)
async function tradeAllowed(tx, playerId) {
  if (!config.email.enforce) return null;
  const player = await tx.player.findUnique({ where: { id: playerId }, select: { account: { select: { emailVerifiedAt: true } } } });
  return player?.account?.emailVerifiedAt ? null : { error: 'Confirmez votre adresse e-mail pour commercer avec les autres joueurs', status: 403 };
}

const tradeRouter = express.Router();

// Le Marché n'existe que dans la capitale et sert toutes les villes du joueur (décision du 31 octobre 2026) : il faut celui
// de la capitale pour commercer depuis n'importe laquelle de ses villes (première barrière contre les comptes qui en
// nourrissent un autre). Échanges et envois sont portés par des armées (services/marketService.js)
async function hasMarket(db, playerId) {
  if (!config.market.requireBuilding) return true;
  return fx.levelOf(await capitalBuildingsOf(db, playerId), 'MARKET') >= 1;
}
const NO_MARKET = { error: 'Construisez un Marché dans la capitale (niveau 1 minimum) pour commercer', status: 400 };
// Blocus : par le marché non plus, aucune marchandise n'entre ni ne sort d'une ville assiégée (les offres gardent la leur)
const besieged = async (db, cityId) => (await db.army.count({ where: { status: 'BESIEGING', targetCityId: cityId } })) > 0;
const armyIdOk = (v) => v === undefined || v === null || isId(v);
const minutesUntil = (date) => Math.max(1, Math.round((date.getTime() - Date.now()) / 60000));

// Locks several cities in a fixed order so two crossed trades can never deadlock
async function lockCities(tx, ids) {
  for (const id of [...new Set(ids.filter(Boolean))].sort()) await lockCity(tx, id);
}

// GET /api/market : offres actives ; l'armée qui attend avec les marchandises n'est donnée qu'au vendeur
router.get('/', auth, async (req, res) => {
  try {
    const offers = await prisma.marketOffer.findMany({ where: { status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, take: 200, include: { seller: { select: { id: true, name: true } } } });
    const cities = new Map((await prisma.city.findMany({ where: { id: { in: offers.map(o => o.cityId).filter(Boolean) } }, select: { id: true, name: true, x: true, y: true } })).map(c => [c.id, c]));
    res.json(offers.map(({ seller, armyId, ...o }) => ({ ...o, ...(o.sellerId === req.user.playerId ? { armyId } : {}), player: seller, city: cities.get(o.cityId) || null })));
  } catch (e) { sendError(res, e); }
});

// POST /api/trade/send (mounted at /api) { fromCityId, armyId?, targetX, targetY, resources } : une armée libre de la ville
// (celle choisie, sinon la plus petite qui suffit) porte les ressources à la ville d'un autre joueur, ou à une Ville
// Merveille, puis rentre. Pas d'envoi entre ses propres villes : leur stock est commun (décision du 31 octobre 2026).
// { message, armyId, armyName, arrivalAt, returnAt, travelTime }
tradeRouter.post('/trade/send', auth, async (req, res) => {
  try {
    const { fromCityId, resources, armyId } = req.body || {};
    const targetX = parseInt(req.body?.targetX), targetY = parseInt(req.body?.targetY);
    const wood = resources?.wood || 0, stone = resources?.stone || 0, iron = resources?.iron || 0, food = resources?.food || 0;
    if (!isId(fromCityId)) return res.status(400).json({ error: 'Ville source requise' });
    if (!armyIdOk(armyId)) return res.status(400).json({ error: 'Armée invalide' });
    if (![wood, stone, iron, food].every(isAmount)) return res.status(400).json({ error: 'Montants invalides' });
    if (wood + stone + iron + food <= 0) return res.status(400).json({ error: 'Entrez des ressources à envoyer' });
    if (Number.isNaN(targetX) || Number.isNaN(targetY)) return res.status(400).json({ error: 'Coordonnées invalides' });
    const targetCity = await prisma.city.findFirst({ where: require('../utils/spawn').cityAtCellWhere(targetX, targetY) });   // any of its 2 × 2 cells
    if (!targetCity) return res.status(404).json({ error: 'Aucune ville à ces coordonnées' });
    if (targetCity.id === fromCityId) return res.status(400).json({ error: 'Choisissez une autre ville' });
    if (targetCity.playerId === req.user.playerId && !targetCity.isWonder) return res.status(400).json({ error: MS.OWN_CITIES_SHARE_STOCK });
    const relation = await getRelation(req.user.playerId, targetCity.playerId);
    if (!relation.canTransport) return res.status(403).json({ error: 'Impossible d\'envoyer des ressources à un ennemi' });
    if (await besieged(prisma, targetCity.id)) return res.status(400).json({ error: 'Ville assiégée : aucun convoi n\'entre tant que l\'armée ennemie est devant elle' });

    const result = await prisma.$transaction(async (tx) => {
      const sourceCity = await tx.city.findFirst({ where: { id: fromCityId, playerId: req.user.playerId }, include: { player: { select: { faction: true } } } });
      if (!sourceCity) return { error: 'Ville source introuvable', status: 404 };
      // blocus : aucun convoi ne sort non plus d'une ville assiégée (même règle que les échanges)
      if (await besieged(tx, sourceCity.id)) return { error: 'Ville assiégée : aucun convoi ne sort tant que l\'armée ennemie est devant elle', status: 400 };
      if (!(await hasMarket(tx, req.user.playerId))) return NO_MARKET;
      const blocked = await tradeAllowed(tx, req.user.playerId); if (blocked) return blocked;
      const sent = await MS.sendResources(tx, { playerId: req.user.playerId, faction: sourceCity.player.faction, fromCity: sourceCity, toCity: targetCity, resources: { wood, stone, iron, food }, armyId: armyId || null });
      if (sent.error) return sent;
      return { message: `${sent.armyName} part vers ${targetCity.name} (arrivée dans ${minutesUntil(sent.arrivalAt)} min)`, ...sent };
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

// ---- échanges entre joueurs, livrés par des armées (décisions du 27 et du 31 octobre 2026, services/marketService.js) ----

// POST /api/market/offer { sellResource, sellAmount, buyResource, buyAmount, cityId, armyId? }
// L'armée du vendeur (celle choisie, sinon la plus petite qui suffit) est réservée : elle attend en ville avec les
// marchandises jusqu'à l'échange, 48 h au plus. { message, offer, armyId, armyName, taxPct }
router.post('/offer', auth, async (req, res) => {
  try {
    const { sellResource, sellAmount, buyResource, buyAmount, cityId, armyId } = req.body || {};
    if (!sellResource || !sellAmount || !buyResource || !buyAmount) return res.status(400).json({ error: 'Paramètres manquants' });
    if (!RESOURCES.includes(sellResource) || !RESOURCES.includes(buyResource)) return res.status(400).json({ error: 'Ressource invalide' });
    if (sellResource === buyResource) return res.status(400).json({ error: 'Choisissez des ressources différentes' });
    if (!isAmount(sellAmount) || sellAmount < 1 || !isAmount(buyAmount) || buyAmount < 1) return res.status(400).json({ error: 'Montants invalides' });
    const ratio = Math.max(sellAmount / buyAmount, buyAmount / sellAmount);
    if (ratio > config.market.maxRatio) return res.status(400).json({ error: `Ratio limité à 1:${config.market.maxRatio}` });
    if (!isId(cityId)) return res.status(400).json({ error: 'Ville requise' });
    if (!armyIdOk(armyId)) return res.status(400).json({ error: 'Armée invalide' });
    const result = await prisma.$transaction(async (tx) => {
      const city = await tx.city.findFirst({ where: { id: cityId, playerId: req.user.playerId }, include: { player: { select: { faction: true } } } });
      if (!city) return { error: 'Ville non trouvée', status: 404 };
      await lockCity(tx, city.id);
      if (!(await hasMarket(tx, req.user.playerId))) return NO_MARKET;
      const blocked = await tradeAllowed(tx, req.user.playerId); if (blocked) return blocked;
      const active = await tx.marketOffer.count({ where: { sellerId: req.user.playerId, status: 'ACTIVE' } });
      if (active >= config.market.maxActiveOffers) return { error: `Maximum ${config.market.maxActiveOffers} offres actives`, status: 400 };
      const made = await MS.createOffer(tx, { playerId: req.user.playerId, faction: city.player.faction, city, sellResource, sellAmount, buyResource, buyAmount, armyId: armyId || null });
      if (made.error) return made;
      return { message: `Offre créée : ${made.armyName} attend en ville avec les marchandises (${config.market.offerHours} h au plus)`, ...made, taxPct: await MS.p2pTaxPct(tx, city.id) };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) {
    if (e.message === 'army busy') return res.status(409).json({ error: 'Armée déjà en mission' });
    sendError(res, e);
  }
});

// POST /api/market/offer/:id/accept { cityId, armyId? } : les deux armées partent, chacune avec ce qu'elle livre moins la
// taxe ; pour l'acheteur, { armyId (la sienne), arrivalAt (ses marchandises arrivent), returnAt (son armée rentre) }
router.post('/offer/:id/accept', auth, async (req, res) => {
  try {
    const { cityId, armyId } = req.body || {};
    if (!isId(cityId)) return res.status(400).json({ error: 'Ville requise' });
    if (!armyIdOk(armyId)) return res.status(400).json({ error: 'Armée invalide' });
    const result = await prisma.$transaction(async (tx) => {
      await lockOffer(tx, req.params.id);
      const offer = await tx.marketOffer.findUnique({ where: { id: req.params.id } });
      if (!offer) return { error: 'Offre non trouvée', status: 404 };
      if (offer.status !== 'ACTIVE') return { error: 'Offre inactive', status: 400 };
      if (offer.sellerId === req.user.playerId) return { error: 'Vous ne pouvez pas accepter votre propre offre', status: 400 };
      const buyerCity = await tx.city.findFirst({ where: { id: cityId, playerId: req.user.playerId }, include: { player: { select: { name: true, faction: true } } } });
      if (!buyerCity) return { error: 'Ville acheteur non trouvée', status: 404 };
      await lockCities(tx, [buyerCity.id, offer.cityId]);
      if (!(await hasMarket(tx, req.user.playerId))) return NO_MARKET;
      const blocked = await tradeAllowed(tx, req.user.playerId); if (blocked) return blocked;
      if (!(await getRelation(req.user.playerId, offer.sellerId, tx)).canTransport) return { error: 'Impossible de commercer avec un ennemi', status: 403 };
      const sellerCity = offer.cityId ? await tx.city.findUnique({ where: { id: offer.cityId }, include: { player: { select: { faction: true } } } }) : null;
      if (!sellerCity) return { error: 'La ville du vendeur n\'existe plus', status: 400 };
      if ((await besieged(tx, buyerCity.id)) || (await besieged(tx, sellerCity.id))) return { error: 'Ville assiégée : aucun convoi ne passe', status: 400 };
      const deal = await MS.acceptOffer(tx, { offer, buyerId: req.user.playerId, buyerFaction: buyerCity.player.faction, buyerCity, sellerCity, sellerFaction: sellerCity.player.faction, armyId: armyId || null });
      if (deal.error) return deal;
      const { toBuyer, toSeller, sellerTax, buyerTax, seller, buyer } = deal;
      // pas de refus : ce qui ne tiendra pas dans l'entrepôt à l'arrivée repartira chez le vendeur, l'acheteur est prévenu
      const room = MS.roomFor(await tx.city.findUnique({ where: { id: buyerCity.id }, select: { [offer.sellResource]: true, maxStorage: true, maxFoodStorage: true, isWonder: true } }), offer.sellResource);
      const warning = toBuyer > room ? `Attention : ${buyerCity.name} n'a de place que pour ${room} ${RES_FR[offer.sellResource]} en ce moment ; ce qui ne tiendra pas à l'arrivée repartira chez le vendeur.` : null;
      return {
        message: `Échange conclu : vos ${toSeller} ${RES_FR[offer.buyResource]} partent avec ${buyer.armyName}, ${toBuyer} ${RES_FR[offer.sellResource]} arrivent dans ${minutesUntil(seller.arrivalAt)} min${warning ? `. ${warning}` : ''}`,
        warning, toBuyer, toSeller, sellerTax, buyerTax, armyId: buyer.armyId, arrivalAt: seller.arrivalAt, returnAt: buyer.returnAt,
        offer, sellerReturnAt: seller.returnAt, buyerName: buyerCity.player.name, buyerCityName: buyerCity.name
      };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    const { offer, sellerReturnAt, buyerName, buyerCityName, ...out } = result;
    require('../services/pushService').notify(offer.sellerId, 'market', '🤝 Offre acceptée', `${buyerName} accepte votre offre : votre armée part vers ${buyerCityName} avec ${out.toBuyer} ${RES_FR[offer.sellResource]} (de retour dans ${minutesUntil(sellerReturnAt)} min), ${out.toSeller} ${RES_FR[offer.buyResource]} sont en route vers vous.`, { to: 'city', cityId: offer.cityId });
    res.json(out);
  } catch (e) {
    if (e.message === 'offer raced') return res.status(409).json({ error: 'Offre déjà prise' });
    if (e.message === 'army busy') return res.status(409).json({ error: 'Armée déjà en mission' });
    if (e.code === 'NO_ROUTE') return res.status(400).json({ error: e.message });
    sendError(res, e);
  }
});

// DELETE /api/market/offer/:id : marchandises rendues, armée libre
router.delete('/offer/:id', auth, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      await lockOffer(tx, req.params.id);
      const offer = await tx.marketOffer.findUnique({ where: { id: req.params.id } });
      if (!offer) return { error: 'Offre non trouvée', status: 404 };
      if (offer.sellerId !== req.user.playerId) return { error: 'Non autorisé', status: 403 };
      if (offer.status !== 'ACTIVE') return { error: 'Offre inactive', status: 400 };
      if (offer.cityId) await lockCity(tx, offer.cityId);
      if (!(await MS.closeOffer(tx, offer, 'CANCELLED'))) throw new Error('offer raced');
      return { message: 'Offre annulée : marchandises rendues, armée libre' };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) {
    if (e.message === 'offer raced') return res.status(409).json({ error: 'Offre déjà traitée' });
    sendError(res, e);
  }
});

// GET /api/market/state?cityId= (aussi /api/market/tax) : taxe des échanges qui partent de cette ville (Comptoir et Chambre
// au Trésor de la capitale) et armées libres de la ville avec leur charge, la plus petite d'abord : [{ id, name, capacity,
// hero }] (hero : le héros la mène)
router.get(['/state', '/tax'], auth, async (req, res) => {
  try {
    const cityId = String(req.query.cityId || '');
    if (!isId(cityId)) return res.status(400).json({ error: 'Ville requise' });
    const city = await prisma.city.findFirst({ where: { id: cityId, playerId: req.user.playerId }, select: { id: true, x: true, y: true, player: { select: { faction: true } } } });
    if (!city) return res.status(404).json({ error: 'Ville non trouvée' });
    const [taxPct, armies] = await Promise.all([MS.p2pTaxPct(prisma, city.id), MS.freeTransportArmies(prisma, city, req.user.playerId, city.player.faction)]);
    res.json({ taxPct, basePct: config.market.p2pTaxPctBase, offerHours: config.market.offerHours, armies: armies.map(({ army, capacity }) => ({ id: army.id, name: army.name, capacity, hero: !!army.heroId })) });
  } catch (e) { sendError(res, e); }
});

// POST /api/market/npc-trade — échange immédiat avec le marchand du serveur, dans n'importe quelle ville du joueur, sans
// armée ; taxe selon le niveau du Marché de la capitale (data serverMarketTax*)
router.post('/npc-trade', auth, async (req, res) => {
  try {
    const { cityId, giveResource, receiveResource, giveAmount } = req.body || {};
    if (!RESOURCES.includes(giveResource) || !RESOURCES.includes(receiveResource)) return res.status(400).json({ error: 'Ressource invalide' });
    if (giveResource === receiveResource) return res.status(400).json({ error: 'Choisissez des ressources différentes' });
    if (!isAmount(giveAmount) || giveAmount < 3) return res.status(400).json({ error: 'Minimum 3 ressources' });
    if (!isId(cityId)) return res.status(400).json({ error: 'Ville requise' });
    const result = await prisma.$transaction(async (tx) => {
      const city = await tx.city.findFirst({ where: { id: cityId, playerId: req.user.playerId } });
      if (!city) return { error: 'Ville non trouvee', status: 404 };
      await lockCity(tx, city.id);
      const marketLevel = fx.levelOf(await capitalBuildingsOf(tx, req.user.playerId), 'MARKET');
      if (marketLevel < 1) return { error: 'Construisez un Marché dans la capitale (niveau 1 minimum)', status: 400 };
      // NPC merchant tax: 30 % at level 1, one point less per level (data: serverMarketTax*)
      const taxPct = fx.npcMarketTaxPct(marketLevel);
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
