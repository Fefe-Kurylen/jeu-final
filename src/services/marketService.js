// ============================================================
// Marché (décisions du 27 et du 31 octobre 2026, GDD economy_config.market)
// - La Place du marché et le Comptoir de commerce n'existent que dans la capitale et servent toutes les villes du joueur.
// - Plus de marchands ni de routes commerciales entre ses villes (décision du 31 octobre 2026, rapport de vérification) :
//   le stock du joueur est commun (dépenses et entretien puisent dans toutes ses villes), rien ne circule entre elles.
// - Échanges entre joueurs livrés par des armées : l'armée du vendeur est réservée à la création de l'offre (statut MARKET,
//   elle attend en ville avec les marchandises) ; à l'acceptation, elle part vers la ville de l'acheteur et une armée de
//   l'acheteur part vers celle du vendeur, chacune à sa vitesse ; livraison à l'arrivée, puis retour (armyProcessor).
// - Envoi de ressources à un autre joueur (cadeau, aide d'alliance, Ville Merveille) : une armée de transport.
// - Charge d'une armée : celle de ses troupes et de son héros, × bonus de transport de sa civilisation, du Marché, du
//   Comptoir et du Poste du Désert de la capitale, × Bastion d'alliance.
// - Taxe des échanges : config.market.p2pTaxPctBase de ce que chaque armée porte, −1 % par niveau du Comptoir de la
//   capitale, −0,25 % par niveau de sa Chambre au Trésor.
// - Une offre non prise revient au vendeur au bout de 48 h (marchandises rendues à son stock, armée libérée).
// - Stock commun (décision du 1er novembre 2026, simulation de 200 jours) : l'armée part de la ville où elle se tient, mais
//   ce qu'elle emporte (offre, échange accepté, envoi, livraison à la Ville Merveille) se prend dans toutes les villes du
//   joueur, la ville de départ d'abord, puis la plus pleine (utils/db.js debitPlayer), sous le verrou de toutes ses villes
//   (ordre des id ; pour un échange, les villes des deux joueurs en une seule passe). Une offre rendue et une livraison qui
//   arrive vont à la ville visée d'abord, puis aux autres villes du joueur selon la place (creditPlayer).
// ============================================================
const prisma = require('../config/database');
const config = require('../config');
const { unitsData, factionsData } = require('../config/gamedata');
const { getArmyTravelTime, getArmyCarryCapacity, getFactionBonus } = require('../utils/calculations');
const { lockOffer, lockPlayerCities, debitPlayer, creditPlayer, missingMessage, lostNote, withDeadlockRetry, transition, buildingsWithCapital, RESOURCES, RES_FR } = require('../utils/db');
const { routeLength } = require('../utils/pathfinding');
const fx = require('../utils/buildingEffects');
const T = require('../utils/techEffects');
const { notify } = require('./pushService');

const M = config.market;
// refus d'un envoi ou d'un transport vers une de ses propres villes (sauf une Ville Merveille) : routes/market.js et routes/armies.js
const OWN_CITIES_SHARE_STOCK = 'Vos villes partagent leur stock : rien à transporter entre elles';
// refus de tout départ, rappel ou changement d'une armée réservée par une offre (statut MARKET) : routes/armies.js,
// expéditions, rassemblements, Bastion
const MARKET_BUSY = 'Armée réservée pour une offre du marché : annulez l\'offre pour la libérer';
const loadOf = (o) => Object.fromEntries(RESOURCES.map(r => [r, Math.max(0, Math.floor(Number(o?.[r]) || 0))]));
const totalOf = (o) => RESOURCES.reduce((t, r) => t + (o[r] || 0), 0);
// chargement d'une armée (colonnes carry*)
const carryOf = (load) => ({ carryWood: load.wood || 0, carryStone: load.stone || 0, carryIron: load.iron || 0, carryFood: load.food || 0 });

// Taxe des échanges (en %) avec ces bâtiments (ceux de la capitale : Comptoir et Chambre au Trésor), jamais sous 0 ; sans
// requête, pour les outils de simulation aussi
function p2pTaxPctOf(buildings) {
  const office = fx.levelOf(buildings, 'TRADE_OFFICE') * fx.effectOf('TRADE_OFFICE', 'p2pTaxReductionPctPerLevel', 1);
  const treasure = fx.levelOf(buildings, 'TREASURE_CHAMBER') * M.treasureTaxReductionPctPerLevel;
  return Math.max(0, Math.round((M.p2pTaxPctBase - office - treasure) * 100) / 100);
}
// Taxe d'une armée d'échange qui part de cette ville (en %) : Comptoir et Chambre au Trésor de la capitale
async function p2pTaxPct(db, cityId) {
  const city = await db.city.findUnique({ where: { id: cityId }, select: { playerId: true, buildings: { select: { key: true, level: true } } } });
  if (!city) return M.p2pTaxPctBase;
  return p2pTaxPctOf(await buildingsWithCapital(db, city));
}
const afterTax = (amount, pct) => Math.floor(amount * (1 - pct / 100));

// ---- armées du marché ----
const ARMY_INCLUDE = { units: true, hero: { include: { items: true } } };
// Multiplicateur de charge des armées d'une ville : civilisation, Marché, Comptoir et Poste du Désert de la capitale
// (`buildings` : ceux de la ville avec ceux de la capitale, buildingsWithCapital), Bastion d'alliance
async function transportMult(buildings, faction, playerId) {
  return (1 + getFactionBonus(faction, 'transportCapacity', factionsData) / 100) * (1 + fx.transportBonusPct(buildings) / 100) * (await require('./bastionService').carryMult(playerId));
}
const tradeCapacity = (army, mult) => Math.floor(getArmyCarryCapacity(army.units, unitsData, army.hero) * mult);

// Armées libres de la ville (en ville, hors garnison, avec des soldats) et leur charge, la plus petite d'abord :
// [{ army, capacity }]. `armyId` : seulement celle-ci
async function freeTransportArmies(db, city, playerId, faction, armyId = null) {
  const where = { cityId: city.id, ownerId: playerId, status: 'IDLE', isGarrison: false, x: city.x, y: city.y, ...(armyId ? { id: armyId } : {}) };
  const armies = (await db.army.findMany({ where, include: ARMY_INCLUDE })).filter(a => a.units.some(u => u.count > 0));
  if (!armies.length) return [];
  const own = city.buildings || await db.cityBuilding.findMany({ where: { cityId: city.id }, select: { key: true, level: true } });
  const mult = await transportMult(await buildingsWithCapital(db, { ...city, playerId, buildings: own }), faction, playerId);
  return armies.map(army => ({ army, capacity: tradeCapacity(army, mult) })).sort((x, y) => x.capacity - y.capacity);
}

// Une armée libre de la ville qui peut porter `amount` : celle demandée, sinon la plus petite qui suffit, sans le héros
// quand c'est possible (une offre retient son armée jusqu'à 48 h). { army, capacity }, ou { error }
async function pickTransportArmy(db, city, playerId, faction, amount, armyId = null) {
  const sized = await freeTransportArmies(db, city, playerId, faction, armyId);
  if (!sized.length) return { error: armyId ? 'Cette armée n\'est pas libre en ville' : 'Aucune armée libre en ville pour transporter (formez-en une au point de ralliement)' };
  const fits = sized.filter(s => s.capacity >= amount);
  return fits.find(s => !s.army.heroId) || fits[0] || { error: `Capacité de transport insuffisante : ${amount} à porter, ${sized.at(-1).capacity} au mieux` };
}

// Trajet d'une armée du marché de `from` à `to` (secondes) : la vraie route (relief), à sa vitesse, avec la Cartographie,
// le Bastion d'alliance et l'Irrigation de la capitale de son joueur (relus par `db`)
async function travelSeconds(army, from, to, faction, db = prisma) {
  const len = await routeLength(from.x, from.y, to.x, to.y, faction);
  const technologies = await db.playerTechnology.findMany({ where: { playerId: army.ownerId } });
  const speedPct = T.techPct(technologies, 'armySpeedBonusPct') + (await require('./bastionService').speedPct(army.ownerId)) + (await require('./armyService').playerMarchPct(db, army.ownerId));
  return getArmyTravelTime(army.units, from.x, from.y, to.x, to.y, faction, army.hero, len, speedPct);
}

// L'armée part de `from` (statut `fromStatus`) livrer `load` à `to` : livraison à l'arrivée, puis retour (armyProcessor
// handleTransport) ; le retour dure autant que l'aller. { armyId, armyName, arrivalAt, returnAt, travelTime }, ou null si
// l'armée n'est plus dans ce statut
async function dispatchArmy(tx, { army, fromStatus, from, to, load, missionType, faction, now }) {
  const seconds = await travelSeconds(army, from, to, faction, tx);
  const arrivalAt = new Date(now.getTime() + seconds * 1000);
  const ok = await transition(tx, 'army', army.id, fromStatus, { status: 'TRANSPORTING', missionType, targetX: to.x, targetY: to.y, targetCityId: to.id, departedAt: now, arrivalAt, ...carryOf(load) });
  return ok ? { armyId: army.id, armyName: army.name, arrivalAt, returnAt: new Date(now.getTime() + 2 * seconds * 1000), travelTime: seconds } : null;
}

// ---- envoi de ressources à un autre joueur ----
// Une armée libre de la ville de départ (celle demandée, sinon la plus petite qui suffit) porte les ressources, prises dans
// le stock commun du joueur (la ville de départ d'abord). Dans la transaction de l'appelant, qui a vérifié la ville
// d'arrivée, la diplomatie et le blocus ; `cities` : les villes du joueur qu'il a déjà verrouillées (lockPlayerCities),
// sinon elles le sont ici. { armyId, armyName, arrivalAt, returnAt, travelTime }, ou { error, status }
async function sendResources(tx, { playerId, faction, fromCity, toCity, resources, armyId = null, now = new Date(), cities = null }) {
  const load = loadOf(resources);
  if (totalOf(load) <= 0) return { error: 'Entrez des ressources à envoyer', status: 400 };
  const stock = cities || await lockPlayerCities(tx, playerId);
  const pick = await pickTransportArmy(tx, fromCity, playerId, faction, totalOf(load), armyId);
  if (pick.error) return { error: pick.error, status: 400 };
  const paid = await debitPlayer(tx, playerId, fromCity.id, load, stock);
  if (!paid.ok) return { error: missingMessage(paid), status: 400 };
  const sent = await dispatchArmy(tx, { army: pick.army, fromStatus: 'IDLE', from: fromCity, to: toCity, load, missionType: 'TRANSPORT', faction, now });
  if (!sent) throw new Error('army busy');   // annule le débit
  return sent;
}

// ---- échanges entre joueurs ----
// Offre : l'armée du vendeur attend en ville avec les marchandises (offerHours au plus), prises dans son stock commun (la
// ville de l'offre d'abord). `cities` : les villes du vendeur que l'appelant a verrouillées (sinon elles le sont ici).
// { offer, armyId, armyName }, ou { error, status }
async function createOffer(tx, { playerId, faction, city, sellResource, sellAmount, buyResource, buyAmount, armyId = null, now = new Date(), cities = null }) {
  const stock = cities || await lockPlayerCities(tx, playerId);
  const pick = await pickTransportArmy(tx, city, playerId, faction, sellAmount, armyId);
  if (pick.error) return { error: pick.error, status: 400 };
  const paid = await debitPlayer(tx, playerId, city.id, { [sellResource]: sellAmount }, stock);
  if (!paid.ok) return { error: missingMessage(paid), status: 400 };
  if (!(await transition(tx, 'army', pick.army.id, 'IDLE', { status: 'MARKET', missionType: 'MARKET_OFFER' }))) throw new Error('army busy');   // annule le débit
  const offer = await tx.marketOffer.create({ data: { sellerId: playerId, cityId: city.id, sellResource, sellAmount, buyResource, buyAmount, status: 'ACTIVE', armyId: pick.army.id, expiresAt: new Date(now.getTime() + M.offerHours * 3600000) } });
  return { offer, armyId: pick.army.id, armyName: pick.army.name };
}

// Échange conclu : l'armée du vendeur part (taxe du vendeur déduite) vers la ville de l'acheteur, une armée de l'acheteur
// (taxe de l'acheteur déduite) vers celle du vendeur, avec la contrepartie prise dans le stock commun de l'acheteur (sa
// ville d'abord). L'appelant a verrouillé l'offre (active) et les villes des deux joueurs (lockCitiesOfPlayers, en une
// seule passe : `buyerCities`, sinon celles de l'acheteur sont verrouillées ici), vérifié la diplomatie et le blocus.
// { toBuyer, toSeller, sellerTax, buyerTax, seller, buyer } (seller / buyer : retour de dispatchArmy), ou { error, status }
async function acceptOffer(tx, { offer, buyerId, buyerFaction, buyerCity, sellerCity, sellerFaction, armyId = null, now = new Date(), buyerCities = null }) {
  const sellerArmy = offer.armyId ? await tx.army.findFirst({ where: { id: offer.armyId, status: 'MARKET' }, include: ARMY_INCLUDE }) : null;
  if (!sellerArmy) return { error: 'L\'armée du vendeur n\'est plus disponible', status: 409 };
  const stock = buyerCities || await lockPlayerCities(tx, buyerId);
  const pick = await pickTransportArmy(tx, buyerCity, buyerId, buyerFaction, offer.buyAmount, armyId);
  if (pick.error) return { error: pick.error, status: 400 };
  const paid = await debitPlayer(tx, buyerId, buyerCity.id, { [offer.buyResource]: offer.buyAmount }, stock);
  if (!paid.ok) return { error: missingMessage(paid), status: 400 };
  const done = await tx.marketOffer.updateMany({ where: { id: offer.id, status: 'ACTIVE' }, data: { status: 'COMPLETED', buyerId, buyerCityId: buyerCity.id, acceptedAt: now } });
  if (done.count !== 1) throw new Error('offer raced');
  const [sellerTax, buyerTax] = await Promise.all([p2pTaxPct(tx, sellerCity.id), p2pTaxPct(tx, buyerCity.id)]);
  const toBuyer = afterTax(offer.sellAmount, sellerTax), toSeller = afterTax(offer.buyAmount, buyerTax);
  const seller = await dispatchArmy(tx, { army: sellerArmy, fromStatus: 'MARKET', from: sellerCity, to: buyerCity, load: { [offer.sellResource]: toBuyer }, missionType: 'MARKET_DELIVERY', faction: sellerFaction, now });
  if (!seller) throw new Error('offer raced');   // l'armée du vendeur n'attend plus : tout est annulé
  const buyer = await dispatchArmy(tx, { army: pick.army, fromStatus: 'IDLE', from: buyerCity, to: sellerCity, load: { [offer.buyResource]: toSeller }, missionType: 'MARKET_DELIVERY', faction: buyerFaction, now });
  if (!buyer) throw new Error('army busy');   // l'armée de l'acheteur vient de partir ailleurs : tout est annulé
  return { toBuyer, toSeller, sellerTax, buyerTax, seller, buyer };
}

// Place libre d'une ville pour une ressource (entrepôt, ou silo pour la nourriture) ; la Ville Merveille reçoit tout
// au stock du chantier, sans plafond (comme à l'arrivée d'une armée de transport)
function roomFor(city, res) {
  if (!city) return 0;
  if (city.isWonder) return Infinity;
  const cap = res === 'food' ? city.maxFoodStorage : city.maxStorage;
  return Math.max(0, Math.floor((cap || 0) - (city[res] || 0)));
}
// Place libre de toutes les villes d'un joueur pour une ressource (lockPlayerCities) : une livraison qui arrive remplit la
// ville visée, puis les autres (stock commun, décision du 1er novembre 2026, simulation de 200 jours)
const playerRoomFor = (cities, res) => (cities || []).reduce((t, c) => t + roomFor(c, res), 0);

// Une offre active se ferme (retirée, expirée, ville tombée) : son armée est libre, ses marchandises reviennent au stock du
// vendeur, la ville `refundCityId` d'abord, puis ses autres villes selon la place (creditPlayer, stock commun, décision du
// 1er novembre 2026). `cities` : les villes du vendeur déjà verrouillées (sinon elles le sont ici). false si elle n'était
// plus active, sinon { lost } : ce qui n'a tenu dans aucune ville
async function closeOffer(tx, offer, status, refundCityId = offer.cityId, cities = null) {
  const ok = await tx.marketOffer.updateMany({ where: { id: offer.id, status: 'ACTIVE' }, data: { status, cityId: refundCityId || null } });
  if (ok.count !== 1) return false;
  const refund = refundCityId ? await creditPlayer(tx, offer.sellerId, refundCityId, { [offer.sellResource]: offer.sellAmount }, cities) : null;
  if (offer.armyId) await tx.army.updateMany({ where: { id: offer.armyId, status: 'MARKET' }, data: { status: 'IDLE', missionType: null } });
  return { lost: refund?.lost || {} };
}
// Offres d'une ville annulées (chute de la ville, capitale déplacée) : marchandises vers `refundCityId` puis les autres villes
// du vendeur, armées libérées. Une ville qui tombe (`refundCityId` est une autre ville) ne reçoit rien.
async function cancelOffersOfCity(tx, cityId, refundCityId) {
  const offers = await tx.marketOffer.findMany({ where: { cityId, status: 'ACTIVE' } });
  for (const o of offers) {
    const cities = refundCityId && refundCityId !== cityId ? (await lockPlayerCities(tx, o.sellerId)).filter(c => c.id !== cityId) : null;
    await closeOffer(tx, o, 'CANCELLED', refundCityId, cities);
  }
  return offers.length;
}

// Tick : offres de plus de 48 h rendues au vendeur. L'offre puis les villes du vendeur (ordre des id), dans le même ordre
// que l'acceptation et le retrait (routes/market.js) : pas d'interblocage avec un acheteur au même moment ; un interblocage
// avec une grande requête du tick relance la transaction
async function expireOffers(now = new Date()) {
  const due = await prisma.marketOffer.findMany({ where: { status: 'ACTIVE', expiresAt: { lte: now } }, take: 200 });
  for (const o of due) {
    const done = await withDeadlockRetry(() => prisma.$transaction(async (tx) => {
      await lockOffer(tx, o.id);
      return closeOffer(tx, o, 'EXPIRED', o.cityId, await lockPlayerCities(tx, o.sellerId));
    }));
    if (done) notify(o.sellerId, 'market', '⏳ Offre expirée', `Personne n'a pris votre offre (${o.sellAmount} ${RES_FR[o.sellResource]} contre ${o.buyAmount} ${RES_FR[o.buyResource]}) : l'armée est libre, les marchandises sont revenues dans vos villes${lostNote(done.lost)}.`, { to: 'city', cityId: o.cityId });
  }
  return due.length;
}

module.exports = {
  OWN_CITIES_SHARE_STOCK, MARKET_BUSY, p2pTaxPctOf, p2pTaxPct, afterTax, transportMult, tradeCapacity, freeTransportArmies, pickTransportArmy, travelSeconds, dispatchArmy,
  sendResources, createOffer, acceptOffer, roomFor, playerRoomFor, closeOffer, cancelOffersOfCity, expireOffers
};
