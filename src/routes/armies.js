const express = require('express');
const { notify } = require('../services/pushService');
const router = express.Router();
const { sendError, sendFail } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const config = require('../config');
const { unitsData, factionsData } = require('../config/gamedata');
const { validateCoordinates, cleanText, isAmount } = require('../utils/validation');
const { calculateArmyPower, countSiegeEngines, getArmyTravelTime, getArmyCarryCapacity, getFactionBonus, pointAlongPath } = require('../utils/calculations');
const T = require('../utils/techEffects');
const bastionBonus = () => require('../services/bastionService');
// Cartographie (technologie) + Bastion d'alliance actif (+5 %, décision du 26 octobre 2026) + Irrigation égyptienne de la
// capitale du joueur (bâtiment « capitale seulement », chargé avec le propriétaire par loadArmy)
const speedTechPct = (army) => T.techPct(army?.owner?.technologies, 'armySpeedBonusPct') + bastionBonus().speedPctSync(army?.owner?.alliance?.allianceId) + fx.marchSpeedBonusPct(fx.capitalOf(army?.owner));
const { resolveTribeCombat, resolveNodeHolderCombat, raidCooldownWhere, depositCarryTx } = require('../services/armyService');
const { getRelation, outsideAlliance, allianceRowsOf } = require('../services/diplomacyService');
const { footprintFree, cityAtCellWhere } = require('../utils/spawn');
const { lockArmy, lockCity, debitCity, lockPlayerCities, debitPlayer, missingMessage, buildingsWithCapital, withDeadlockRetry, transition, isId, claimNode } = require('../utils/db');
const fx = require('../utils/buildingEffects');
const { routeLength, findRoute, isBlockedTile } = require('../utils/pathfinding');
const { refreshSiegeFlag } = require('../game/processors/siegeProcessor');
// Propriétaires de camps hors de l'alliance du joueur (combat forcé du retour, quelle que soit la diplomatie déclarée) :
// même prédicat que le siège vu par routes/cities.js
const campsOutsideAlliance = async (playerId, ownerIds, db = prisma) => outsideAlliance(await allianceRowsOf([playerId, ...ownerIds], db), playerId, ownerIds);

const OUTBOUND = ['MOVING', 'ATTACKING', 'RAIDING', 'SPYING', 'TRANSPORTING', 'SUPPORTING'];

// Héros avec ses objets portés seulement (le sac ne sert ni au combat ni à la charge, il vient de /api/hero)
const HERO_EQUIPPED = { include: { items: { where: { slot: { not: 'inventory' } } } } };
// L'armée, ses unités, son propriétaire (technologies, alliance, bâtiments « capitale seulement » de sa capitale), son
// héros et sa ville
const loadArmy = (id, playerId, include = {}, db = prisma) =>
  db.army.findFirst({ where: { id, ownerId: playerId }, include: { units: true, owner: { include: { technologies: true, alliance: { select: { allianceId: true } }, cities: fx.CAPITAL_BUILDINGS } }, hero: HERO_EQUIPPED, city: true, ...include } });

// Charge d'une armée qui transporte ou récolte : unités et héros, civilisation, bonus de transport des bâtiments de la
// capitale (Marché, Comptoir, Poste du Désert : `cityBuildings`), Bastion d'alliance ; la même que harvestProcessor applique à la récolte
const transportCapacity = (army, cityBuildings) => Math.floor(getArmyCarryCapacity(army.units, unitsData, army.hero)
  * (1 + getFactionBonus(army.owner?.faction, 'transportCapacity', factionsData) / 100) * (1 + fx.transportBonusPct(cityBuildings) / 100)
  * bastionBonus().carryMultSync(army.owner?.alliance?.allianceId));
// bâtiments de la ville de l'armée, ceux « capitale seulement » lus dans la capitale (chargée par loadArmy)
const cityBuildingsOf = async (db, army) => fx.withCapital(army.cityId ? await db.cityBuilding.findMany({ where: { cityId: army.cityId }, select: { key: true, level: true } }) : [], fx.capitalOf(army.owner));

// Travel times follow the route around mountains and water; both throw { code: 'NO_ROUTE' } when there is none
const travelTo = async (army, toX, toY) => getArmyTravelTime(army.units, army.x, army.y, toX, toY, army.owner?.faction, army.hero, await routeLength(army.x, army.y, toX, toY, army.owner?.faction), speedTechPct(army));
const noRoute = (res, e) => (e && e.code === 'NO_ROUTE' ? res.status(400).json({ error: e.message }) : null);
const isHome = (army, city) => !!city && army.x === city.x && army.y === city.y;

// Common checks before a field army leaves: the garrison never leaves the city
function readyToLeave(army, verb) {
  if (!army) return { status: 404, error: 'Armée non trouvée' };
  if (army.isGarrison) return { status: 400, error: 'La garnison ne quitte pas la ville : créez une armée au point de ralliement' };
  if (army.status !== 'IDLE') return { status: 400, error: 'Armée déjà en mission' };
  if (army.units.length === 0) return { status: 400, error: army.heroId ? `Le héros nécessite au moins 1 soldat pour ${verb}` : 'Armée vide' };
  return null;
}

// A camp before the army's own city: its armies leave the walls only to attack the camp (décision du 25 octobre 2026)
async function campBlocksExit(army, db = prisma) {
  if (!army?.cityId) return null;
  const city = await db.city.findUnique({ where: { id: army.cityId }, select: { x: true, y: true, isSieged: true } });
  if (!city || !city.isSieged || army.x !== city.x || army.y !== city.y) return null;
  return 'Ville assiégée : vos armées ne sortent que pour attaquer le camp ennemi (« Briser le siège »)';
}

// Returns an error message when `army` may not run `mission` (ATTACK|RAID) against `targetCity`
// `db` is the transaction client when called inside one (no extra pool connection while the transaction holds one)
async function checkHostileTarget(army, targetCity, mission, db = prisma) {
  if (targetCity.playerId === army.ownerId) return 'Vous ne pouvez pas cibler vos propres villes';
  const relation = await getRelation(army.ownerId, targetCity.playerId, db);
  if (!relation.canAttack) return relation.status === 'SAME_ALLIANCE' ? 'Impossible d\'attaquer un membre de votre alliance' : 'Impossible d\'attaquer une alliance alliée';
  // no siege without at least one siege engine (décision du 25 octobre 2026: no tier minimum, no escort, no cap)
  if (mission === 'ATTACK' && countSiegeEngines(army.units, unitsData) < config.combat.siege.minEngines) return 'Pas de siège sans engin : il faut au moins 1 engin de siège dans l\'armée.';
  if (mission === 'RAID') {
    // GDD: one raid per target city per attacker per 24h
    const since = new Date(Date.now() - config.combat.raidCooldownHours * 3600000);
    const recent = await db.battleReport.findFirst({ where: raidCooldownWhere(army.ownerId, targetCity, since), select: { createdAt: true } });
    if (recent) {
      const hoursLeft = Math.ceil((recent.createdAt.getTime() + config.combat.raidCooldownHours * 3600000 - Date.now()) / 3600000);
      return `Cette ville a déjà été pillée récemment : nouveau raid possible dans ${hoursLeft} h`;
    }
    const inFlight = await db.army.count({ where: { ownerId: army.ownerId, status: 'RAIDING', missionType: 'RAID', targetCityId: targetCity.id } });
    if (inFlight > 0) return 'Un de vos raids est déjà en route vers cette ville';
  }
  return null;
}

// Départ d'une armée sous le verrou de sa ville, celui que prennent set-unit / adjust-unit / disband : l'armée est relue
// et revérifiée, et la marche se calcule sur ses unités au moment du départ (rien ne s'ajoute ni ne se retire entre le
// contrôle et le départ). `len` : routeLength calculé hors transaction (A*) ; `check(fresh, tx)` : refus (message) ou null.
// Renvoie { travelTime, arrivalAt } ou { error, status }.
function departLocked(army, verb, { toX, toY, len, data, check = null }) {
  return prisma.$transaction(async (tx) => {
    if (army.cityId) await lockCity(tx, army.cityId);
    const fresh = await loadArmy(army.id, army.ownerId, {}, tx);
    if (fresh && (fresh.cityId !== army.cityId || fresh.x !== army.x || fresh.y !== army.y)) return { error: 'Armée déjà en mission', status: 409 };   // partie ou rattachée ailleurs entre-temps
    const err = readyToLeave(fresh, verb);
    if (err) return { error: err.error, status: err.status };
    const refusal = check && await check(fresh, tx);
    if (refusal) return { error: refusal, status: 400 };
    const travelTime = getArmyTravelTime(fresh.units, fresh.x, fresh.y, toX, toY, fresh.owner?.faction, fresh.hero, len, speedTechPct(fresh));
    const arrivalAt = new Date(Date.now() + travelTime * 1000);
    const ok = await transition(tx, 'army', fresh.id, 'IDLE', { ...data, targetX: toX, targetY: toY, arrivalAt, departedAt: new Date() });
    return ok ? { travelTime, arrivalAt } : { error: 'Armée déjà en mission', status: 409 };
  }, { timeout: 15000 });
}

// Attaque ou raid sur une ville : le contrôle de composition (au moins un engin) et le départ ne font qu'une étape
async function launchCityMission(army, targetCity, mission, verb) {
  const len = await routeLength(army.x, army.y, targetCity.x, targetCity.y, army.owner?.faction);   // A* outside the transaction (throws NO_ROUTE)
  const launched = await departLocked(army, verb, {
    toX: targetCity.x, toY: targetCity.y, len,
    data: { status: { ATTACK: 'ATTACKING', RAID: 'RAIDING' }[mission], targetCityId: targetCity.id, missionType: mission },
    check: async (fresh, tx) => (await campBlocksExit(fresh, tx)) || checkHostileTarget(fresh, targetCity, mission, tx)
  });
  // the target is always warned of an attack or a raid on its way, however it was launched (décision du 25 octobre 2026)
  if (!launched.error) {
    const minutes = Math.max(1, Math.round(launched.travelTime / 60));
    const what = mission === 'ATTACK' ? 'Attaque' : 'Raid';
    notify(targetCity.playerId, 'attack_incoming', `⚔️ ${what} en approche`, `${army.owner?.name || 'Un joueur'} marche sur ${targetCity.name} (arrivée dans ${minutes} min)`, { to: 'city', cityId: targetCity.id, x: targetCity.x, y: targetCity.y });
  }
  return launched;
}

// Moves units between an army standing in its city and that city's garrison. Both rows move by
// increments guarded by their current count, so a batch of recruits or a healed group landing at the
// same moment is never overwritten by a stale absolute value.
async function transferUnits(tx, army, garrison, unitKey, newCount, currentInArmy) {
  const delta = newCount - currentInArmy;
  if (delta === 0) return 0;
  const tier = unitsData.find(u => u.key === unitKey)?.tier || 'base';
  const from = delta > 0 ? garrison : army, to = delta > 0 ? army : garrison, n = Math.abs(delta);
  const taken = await tx.armyUnit.updateMany({ where: { armyId: from.id, unitKey, count: { gte: n } }, data: { count: { decrement: n } } });
  if (taken.count !== 1) throw Object.assign(new Error('units changed'), { code: 'UNITS_CHANGED' });
  await tx.armyUnit.upsert({ where: { armyId_unitKey: { armyId: to.id, unitKey } }, update: { count: { increment: n } }, create: { armyId: to.id, unitKey, tier, count: n } });
  await tx.armyUnit.deleteMany({ where: { armyId: { in: [army.id, garrison.id] }, unitKey, count: { lte: 0 } } });
  return delta;
}

// Both rows are locked through the city: every unit transfer of a city is serialized
// Une colonie fondée depuis le 30 octobre 2026 n'a pas de garnison (pas de troupes propres, § 1 bis) : ses armées gardent
// leurs troupes. `emptyOk` : une armée vide s'y passe de garnison (dissoudre une armée vide ne rend aucune troupe) ;
// `garrison` vaut alors null.
async function loadArmyAndGarrison(tx, armyId, playerId, { emptyOk = false } = {}) {
  const probe = await tx.army.findFirst({ where: { id: armyId, ownerId: playerId }, select: { cityId: true } });
  if (!probe?.cityId) return { error: 'Armée non trouvée', status: 404 };
  await lockCity(tx, probe.cityId);
  const army = await loadArmy(armyId, playerId, {}, tx);
  if (!army) return { error: 'Armée non trouvée', status: 404 };
  if (army.isGarrison) return { error: 'Impossible de modifier la garnison directement', status: 400 };
  if (army.status !== 'IDLE' || !isHome(army, army.city)) return { error: 'Armée doit être en ville', status: 400 };
  const garrison = await tx.army.findFirst({ where: { cityId: army.cityId, isGarrison: true }, include: { units: true } });
  if (!garrison) {
    if (army.city?.isCapital) return { error: 'Garnison introuvable', status: 404 };
    if (!emptyOk || army.units.some(u => u.count > 0)) return { error: 'Une colonie n\'a pas de garnison : ses armées gardent leurs troupes, les nouvelles troupes arrivent dans la capitale', status: 400 };
  }
  return { army, garrison };
}

// ========== ENDPOINTS ==========

// ---- Renfort allié (décision du 26 octobre 2026, supportService) ----
// GET /api/army/support/received — renforts stationnés ou en route vers les villes du joueur
router.get('/support/received', auth, async (req, res) => {
  try { res.json(await require('../services/supportService').receivedBy(req.user.playerId)); } catch (e) { sendError(res, e); }
});
// POST /api/army/support/:id/send-back — l'hôte renvoie un renfort chez son propriétaire
router.post('/support/:id/send-back', auth, async (req, res) => {
  try {
    if (!isId(req.params.id)) return res.status(400).json({ error: 'Armée invalide' });
    res.json(await require('../services/supportService').sendBack(req.user.playerId, req.params.id));
  } catch (e) { sendFail(res, e); }
});
// POST /api/army/:id/support { targetCityId } — envoie l'armée défendre la ville d'un membre de l'alliance ou d'un allié
router.post('/:id/support', auth, async (req, res) => {
  try {
    const { targetCityId } = req.body || {};
    if (!isId(targetCityId)) return res.status(400).json({ error: 'Ville cible requise' });
    const { supportRefusal } = require('../services/supportService');
    const targetCity = await prisma.city.findUnique({ where: { id: targetCityId }, select: { id: true, name: true, x: true, y: true, playerId: true, isSieged: true } });
    const early = await supportRefusal(req.user.playerId, targetCity);
    if (early) return res.status(targetCity ? 400 : 404).json({ error: early });
    const probe = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, select: { x: true, y: true, owner: { select: { faction: true } } } });
    if (!probe) return res.status(404).json({ error: 'Armée non trouvée' });
    const len = await routeLength(probe.x, probe.y, targetCity.x, targetCity.y, probe.owner?.faction);   // A* outside the transaction (throws NO_ROUTE)
    const result = await prisma.$transaction(async (tx) => {
      const p = await tx.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, select: { cityId: true } });
      if (p?.cityId) await lockCity(tx, p.cityId);
      const army = await loadArmy(req.params.id, req.user.playerId, {}, tx);
      const err = readyToLeave(army, 'partir en renfort');
      if (err) return { error: err.error, status: err.status };
      { const camp = await campBlocksExit(army, tx); if (camp) return { error: camp, status: 400 }; }
      const refusal = await supportRefusal(req.user.playerId, await tx.city.findUnique({ where: { id: targetCity.id }, select: { id: true, name: true, playerId: true, isSieged: true } }), tx);
      if (refusal) return { error: refusal, status: 400 };
      const travelTime = getArmyTravelTime(army.units, army.x, army.y, targetCity.x, targetCity.y, army.owner?.faction, army.hero, len, speedTechPct(army));
      const arrivalAt = new Date(Date.now() + travelTime * 1000);
      if (!(await transition(tx, 'army', army.id, 'IDLE', { status: 'SUPPORTING', targetX: targetCity.x, targetY: targetCity.y, targetCityId: targetCity.id, arrivalAt, departedAt: new Date(), missionType: 'SUPPORT' }))) return { error: 'Armée déjà en mission', status: 409 };
      return { message: `Renfort en route vers ${targetCity.name}`, travelTime, arrivalAt, armyName: army.name, ownerName: army.owner?.name };
    }, { timeout: 15000 });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    const minutes = Math.max(1, Math.round(result.travelTime / 60));
    notify(targetCity.playerId, 'alliance', '🛡️ Renfort en approche', `${result.ownerName || 'Un allié'} envoie ${result.armyName} défendre ${targetCity.name} (arrivée dans ${minutes} min).`, { to: 'city', cityId: targetCity.id, x: targetCity.x, y: targetCity.y });
    res.json({ message: result.message, travelTime: result.travelTime, arrivalAt: result.arrivalAt });
  } catch (e) { if (noRoute(res, e)) return; sendError(res, e); }
});

// POST /api/army/create
router.post('/create', auth, async (req, res) => {
  try {
    const { cityId, slot } = req.body;
    if (!isId(cityId) || !Number.isInteger(slot) || slot < 1) return res.status(400).json({ error: 'cityId et slot requis' });
    const name = req.body.name === undefined || req.body.name === '' ? `Armée ${slot}` : cleanText(req.body.name, 2, 30);
    { const bad = name && require('../utils/nameFilter').nameProblem(name); if (bad) return res.status(400).json({ error: bad, badName: true }); }
    if (!name) return res.status(400).json({ error: 'Nom invalide (2-30 caractères)' });
    const result = await prisma.$transaction(async (tx) => {
      await lockCity(tx, cityId);
      const city = await tx.city.findFirst({ where: { id: cityId, playerId: req.user.playerId }, include: { buildings: true } });
      if (!city) return { error: 'Ville non trouvée', status: 404 };
      // Place de rassemblement « capitale seulement » : chaque ville a autant d'armées que la place de la capitale en permet
      const maxArmies = fx.maxArmies(await buildingsWithCapital(tx, city));
      if (slot > maxArmies) return { error: `Emplacement ${slot} non débloqué : Place de rassemblement niveau ${fx.rallyLevelForArmies(slot)} requise dans la capitale.`, status: 400 };
      const existingArmy = await tx.army.findFirst({ where: { cityId, slot, isGarrison: false } });
      if (existingArmy) return { error: `Slot ${slot} déjà occupé`, status: 400 };
      const army = await tx.army.create({ data: { ownerId: req.user.playerId, cityId, slot, name, x: city.x, y: city.y, status: 'IDLE', isGarrison: false } });
      return { message: 'Armée créée', army };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

// PATCH|POST /api/army/:id/rename
async function renameArmy(req, res) {
  try {
    const name = cleanText(req.body.name, 2, 30);
    { const bad = name && require('../utils/nameFilter').nameProblem(name); if (bad) return res.status(400).json({ error: bad, badName: true }); }
    if (!name) return res.status(400).json({ error: 'Nom invalide (2-30 caractères)' });
    const army = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId } });
    if (!army) return res.status(404).json({ error: 'Armée non trouvée' });
    await prisma.army.update({ where: { id: army.id }, data: { name } });
    res.json({ message: 'Armée renommée', name });
  } catch (e) { sendError(res, e); }
}
router.patch('/:id/rename', auth, renameArmy);
router.post('/:id/rename', auth, renameArmy);

// Joindre ou retirer le héros : sous le verrou de la ville de l'armée (celui que prend tout combat qui peut le faire
// tomber), puis celui du héros (ordre de startRevive) ; l'armée, le héros et son armée actuelle sont relus sous ces verrous
async function lockHeroMove(tx, armyId, playerId) {
  const probe = await tx.army.findFirst({ where: { id: armyId, ownerId: playerId }, select: { cityId: true } });
  if (!probe) return { error: 'Armée non trouvée', status: 404 };
  if (probe.cityId) await lockCity(tx, probe.cityId);
  await tx.$queryRaw`SELECT id FROM "Hero" WHERE "playerId" = ${playerId} FOR UPDATE`;
  const army = await tx.army.findFirst({ where: { id: armyId, ownerId: playerId }, include: { city: true } });
  if (!army) return { error: 'Armée non trouvée', status: 404 };
  if (army.cityId !== probe.cityId) return { error: 'Armée rattachée à une autre ville, réessayez', status: 409 };
  if (army.status !== 'IDLE' || !isHome(army, army.city)) return { error: 'Armée doit être en ville', status: 400 };
  return { army };
}

// POST /api/army/:id/assign-hero
router.post('/:id/assign-hero', auth, async (req, res) => {
  try {
    const playerId = req.user.playerId;
    const result = await prisma.$transaction(async (tx) => {
      const locked = await lockHeroMove(tx, req.params.id, playerId);
      if (locked.error) return locked;
      const { army } = locked;
      const hero = await tx.hero.findFirst({ where: { playerId } });
      if (!hero) return { error: 'Héros non trouvé', status: 404 };
      if (hero.diedAt) return { error: 'Votre héros est tombé : ressuscitez-le au Domus du Héros', status: 400 };
      const armyWithHero = await tx.army.findFirst({ where: { heroId: hero.id, NOT: { id: army.id } }, include: { city: true } });
      if (!armyWithHero && hero.cityId && hero.cityId !== army.cityId) {
        // sa ville n'existe plus (colonie rasée) : il s'est enfui vers la capitale
        const where = (await tx.city.findFirst({ where: { id: hero.cityId, playerId }, select: { id: true, name: true } }))
          || (await tx.city.findFirst({ where: { playerId, isCapital: true }, select: { id: true, name: true } }));
        if (where && where.id !== army.cityId) return { error: `Le héros attend à ${where.name} : joignez-le à une armée de cette ville`, status: 400 };
      }
      // The hero can only switch between armies standing in the same city
      if (armyWithHero && (armyWithHero.status !== 'IDLE' || armyWithHero.cityId !== army.cityId || !isHome(armyWithHero, armyWithHero.city))) {
        return { error: 'Héros déjà assigné à une autre armée hors de la ville', status: 400 };
      }
      if (armyWithHero) await tx.army.update({ where: { id: armyWithHero.id }, data: { heroId: null } });
      await tx.army.update({ where: { id: army.id }, data: { heroId: hero.id } });
      await tx.hero.update({ where: { id: hero.id }, data: { cityId: army.cityId } });
      return { message: 'Héros assigné' };
    });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.json(result);
  } catch (e) {
    if (e.code === 'P2002') return res.status(409).json({ error: 'Héros déjà assigné, réessayez' });
    sendError(res, e);
  }
});

// POST /api/army/:id/unassign-hero
router.post('/:id/unassign-hero', auth, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const locked = await lockHeroMove(tx, req.params.id, req.user.playerId);
      if (locked.error) return locked;
      const { army } = locked;
      if (!army.heroId) return { message: 'Aucun héros assigné' };
      // décision du 29 octobre 2026 : le héros retiré attend dans la ville, joint à aucune armée, et ne combat pas
      // (garnison comprise) tant qu'on ne le joint pas à une armée depuis son panneau
      await tx.army.update({ where: { id: army.id }, data: { heroId: null } });
      await tx.hero.update({ where: { id: army.heroId }, data: { cityId: army.cityId } });
      return { message: 'Héros retiré : il attend en ville sans combattre' };
    });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.json(result);
  } catch (e) { sendError(res, e); }
});

// POST /api/army/:id/adjust-unit (par incréments ; utilisé par les tests et la simulation, le client passe par set-unit)
router.post('/:id/adjust-unit', auth, async (req, res) => {
  try {
    const { unitKey, delta } = req.body;
    if (!isId(unitKey) || !Number.isInteger(delta) || delta === 0 || Math.abs(delta) > config.limits.maxAmount) return res.status(400).json({ error: 'unitKey et delta (entier non nul) requis' });

    const result = await prisma.$transaction(async (tx) => {
      const loaded = await loadArmyAndGarrison(tx, req.params.id, req.user.playerId);
      if (loaded.error) return loaded;
      const { army, garrison } = loaded;
      const currentInArmy = army.units.find(u => u.unitKey === unitKey)?.count || 0;
      const currentInGarrison = garrison.units.find(u => u.unitKey === unitKey)?.count || 0;
      if (delta > 0 && delta > currentInGarrison) return { error: 'Pas assez d\'unites en garnison', status: 400 };
      if (delta < 0 && -delta > currentInArmy) return { error: 'Pas assez d\'unites dans l\'armee', status: 400 };
      const newCount = currentInArmy + delta;
      await transferUnits(tx, army, garrison, unitKey, newCount, currentInArmy);
      return { message: 'Composition mise a jour', newCount };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) {
    if (e.code === 'UNITS_CHANGED') return res.status(409).json({ error: 'Les effectifs ont changé, réessayez' });
    sendError(res, e);
  }
});

// POST /api/army/:id/set-unit (absolute count, clamped to what the garrison can provide)
router.post('/:id/set-unit', auth, async (req, res) => {
  try {
    const { unitKey, count } = req.body;
    if (!isId(unitKey) || !isAmount(count)) return res.status(400).json({ error: 'unitKey et count (entier positif) requis' });

    const result = await prisma.$transaction(async (tx) => {
      const loaded = await loadArmyAndGarrison(tx, req.params.id, req.user.playerId);
      if (loaded.error) return loaded;
      const { army, garrison } = loaded;
      const currentInArmy = army.units.find(u => u.unitKey === unitKey)?.count || 0;
      const currentInGarrison = garrison.units.find(u => u.unitKey === unitKey)?.count || 0;
      const newCount = Math.min(count, currentInArmy + currentInGarrison);
      if (newCount === currentInArmy) return { message: 'Aucun changement', newCount };
      const delta = await transferUnits(tx, army, garrison, unitKey, newCount, currentInArmy);
      return { message: 'Composition mise à jour', delta, newCount, clamped: newCount !== count };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) {
    if (e.code === 'UNITS_CHANGED') return res.status(409).json({ error: 'Les effectifs ont changé, réessayez' });
    sendError(res, e);
  }
});

// DELETE /api/army/:id/disband — ses troupes rejoignent la garnison de sa ville ; une armée vide d'une colonie sans
// garnison se dissout aussi (sinon elle resterait pour toujours)
router.delete('/:id/disband', auth, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      const loaded = await loadArmyAndGarrison(tx, req.params.id, req.user.playerId, { emptyOk: true });
      if (loaded.error) return loaded;
      const { army, garrison } = loaded;
      for (const unit of army.units.filter(u => u.count > 0)) {
        await tx.armyUnit.upsert({
          where: { armyId_unitKey: { armyId: garrison.id, unitKey: unit.unitKey } },
          update: { count: { increment: unit.count } },
          create: { armyId: garrison.id, unitKey: unit.unitKey, tier: unit.tier, count: unit.count }
        });
      }
      const heroId = army.heroId;
      await tx.armyUnit.deleteMany({ where: { armyId: army.id } });
      await tx.army.delete({ where: { id: army.id } });
      if (heroId) await tx.hero.update({ where: { id: heroId }, data: { cityId: army.cityId } });   // il attend en ville, joint à aucune armée
      return { message: 'Armée dissoute' };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { sendError(res, e); }
});

// Une ville couvre 2 × 2 cases : un déplacement vers l'une d'elles va à sa case principale (celle de la ville), sinon
// l'armée resterait « à côté de chez elle » (ni rentrée, ni défenseur, ni rencontrée en campagne)
async function cityAnchorOf(x, y) {
  const city = await prisma.city.findFirst({ where: cityAtCellWhere(x, y), select: { x: true, y: true } });
  if (city) return { x: city.x, y: city.y };
  // a colony being founded holds its 2 × 2 block already: its node is the anchor
  const founding = await prisma.army.findFirst({ where: { status: 'FOUNDING', targetX: { gte: x - 1, lte: x }, targetY: { gte: y - 1, lte: y } }, select: { targetX: true, targetY: true } });
  return founding ? { x: founding.targetX, y: founding.targetY } : { x, y };
}

// POST /api/army/:id/move
router.post('/:id/move', auth, async (req, res) => {
  try {
    let x = parseInt(req.body.x), y = parseInt(req.body.y);
    if (!validateCoordinates(x, y)) return res.status(400).json({ error: 'Coordonnées invalides' });
    ({ x, y } = await cityAnchorOf(x, y));
    const army = await loadArmy(req.params.id, req.user.playerId);
    const err = readyToLeave(army, 'se déplacer');
    if (err) return res.status(err.status).json({ error: err.error });
    { const camp = await campBlocksExit(army); if (camp) return res.status(400).json({ error: camp }); }
    if (x === army.x && y === army.y) return res.status(400).json({ error: 'L\'armée est déjà sur place' });
    const len = await routeLength(army.x, army.y, x, y, army.owner?.faction);
    const moved = await departLocked(army, 'se déplacer', { toX: x, toY: y, len, data: { status: 'MOVING', missionType: 'MOVE' }, check: campBlocksExit });
    if (moved.error) return res.status(moved.status).json({ error: moved.error });
    res.json({ message: 'Armee en mouvement', travelTime: moved.travelTime, arrivalAt: moved.arrivalAt });
  } catch (e) { if (noRoute(res, e)) return; sendError(res, e); }
});

// POST /api/army/:id/attack | /raid
function cityMissionRoute(mission, messages) {
  return async (req, res) => {
    try {
      const { targetCityId } = req.body;
      if (!isId(targetCityId)) return res.status(400).json({ error: 'Cible requise' });
      const army = await loadArmy(req.params.id, req.user.playerId);
      const err = readyToLeave(army, messages.verb);
      if (err) return res.status(err.status).json({ error: err.error });
      const targetCity = await prisma.city.findUnique({ where: { id: targetCityId }, include: { buildings: true } });
      if (!targetCity) return res.status(404).json({ error: 'Ville cible non trouvée' });
      const launched = await launchCityMission(army, targetCity, mission, messages.verb);
      if (launched.error) return res.status(launched.status).json({ error: launched.error });
      res.json({ message: messages.ok, ...launched, target: targetCity.name });
    } catch (e) { if (noRoute(res, e)) return; sendError(res, e); }
  };
}
router.post('/:id/attack', auth, cityMissionRoute('ATTACK', { verb: 'attaquer', ok: 'Attaque lancee' }));

// POST /api/army/:id/break-siege — any player may attack the armies besieging a city (décision d'octobre 2026), except
// the camps of his own alliance or of an allied alliance
router.post('/:id/break-siege', auth, async (req, res) => {
  try {
    const { targetCityId } = req.body || {};
    if (!isId(targetCityId)) return res.status(400).json({ error: 'Ville requise' });
    const army = await loadArmy(req.params.id, req.user.playerId);
    const err = readyToLeave(army, 'briser le siège');
    if (err) return res.status(err.status).json({ error: err.error });
    const city = await prisma.city.findUnique({ where: { id: targetCityId }, select: { id: true, name: true, x: true, y: true, playerId: true } });
    if (!city) return res.status(404).json({ error: 'Ville non trouvée' });
    // assiégée, sa propre ville ne laisse sortir que contre son camp (décision du 25 octobre 2026) : pas vers une autre ville
    const ownCampBlocks = (a, db) => (city.id !== a.cityId ? campBlocksExit(a, db) : null);
    { const blocked = await ownCampBlocks(army); if (blocked) return res.status(400).json({ error: blocked }); }
    const camp = await prisma.army.findMany({ where: { status: 'BESIEGING', targetCityId: city.id, NOT: { ownerId: req.user.playerId } }, select: { ownerId: true } });
    if (!camp.length) return res.status(400).json({ error: 'Cette ville n\'est pas assiégée' });
    const owners = [...new Set(camp.map(b => b.ownerId))];
    const hostile = [];
    // an army of this very city coming from outside fights its way home: every camp outside its own alliance is hostile;
    // a sortie from the walls is a voluntary attack (diplomacy applies)
    if (army.cityId === city.id && !(army.x === city.x && army.y === city.y)) hostile.push(...(await campsOutsideAlliance(req.user.playerId, owners)));
    else for (const id of owners) if ((await getRelation(req.user.playerId, id)).canAttack) hostile.push(id);
    if (!hostile.length) return res.status(400).json({ error: 'Les armées qui assiègent cette ville sont de votre alliance ou d\'une alliance alliée' });
    const len = await routeLength(army.x, army.y, city.x, city.y, army.owner?.faction);
    const launched = await departLocked(army, 'briser le siège', { toX: city.x, toY: city.y, len, data: { status: 'ATTACKING', targetCityId: city.id, missionType: 'BREAK_SIEGE' }, check: ownCampBlocks });
    if (launched.error) return res.status(launched.status).json({ error: launched.error });
    const { travelTime, arrivalAt } = launched;
    const minutes = Math.max(1, Math.round(travelTime / 60));
    for (const id of hostile) notify(id, 'attack_incoming', '⚔️ Sortie contre votre siège', `${army.owner?.name || 'Un joueur'} marche sur votre armée devant ${city.name} (arrivée dans ${minutes} min)`, { to: 'map', x: city.x, y: city.y });
    res.json({ message: `Armée en route pour briser le siège de ${city.name}`, travelTime, arrivalAt, target: city.name });
  } catch (e) { if (noRoute(res, e)) return; sendError(res, e); }
});
router.post('/:id/raid', auth, cityMissionRoute('RAID', { verb: 'piller', ok: 'Raid lance' }));
// Les armées n'espionnent plus (décision du 26 octobre 2026) : ce sont les espions de la Tour de guet (/api/spies)
const NO_ARMY_SPY = 'Les armées n\'espionnent plus : envoyez un espion (Tour de guet niveau 5, onglet Armée)';
router.post('/:id/spy', auth, (req, res) => res.status(400).json({ error: NO_ARMY_SPY }));

// POST /api/army/:id/raid-resource
router.post('/:id/raid-resource', auth, async (req, res) => {
  try {
    const { resourceNodeId } = req.body;
    if (!isId(resourceNodeId)) return res.status(400).json({ error: 'ID de ressource requis' });
    const army = await loadArmy(req.params.id, req.user.playerId);
    const err = readyToLeave(army, 'attaquer');
    if (err) return res.status(err.status).json({ error: err.error });
    { const camp = await campBlocksExit(army); if (camp) return res.status(400).json({ error: camp }); }
    const node = await prisma.resourceNode.findUnique({ where: { id: resourceNodeId } });
    if (!node) return res.status(404).json({ error: 'Ressource non trouvée' });
    if (node.cityId) return res.status(400).json({ error: 'Une ville occupe ce point' });
    // un donjon ne s'attaque qu'en rassemblement d'alliance (façon Rise of Kingdoms, rallyService)
    if (node.resourceType === 'HORDE') return res.status(400).json({ error: 'Un donjon ne s\'attaque qu\'en rassemblement d\'alliance : lancez-en un ou rejoignez celui de votre alliance', rallyOnly: true });
    // A raid is a fight: against the tribe, or against the army of another player holding the node (as on a Travian
    // oasis). An undefended, free node is simply collected; an ally's or one's own army is never attacked.
    const holders = node.hasPlayerArmy ? await prisma.army.findMany({ where: { status: { in: ['HARVESTING', 'FOUNDING'] }, targetResourceId: node.id }, select: { ownerId: true } }) : [];
    const tribePresent = node.hasDefenders && node.defenderPower > 0;
    if (!tribePresent && !holders.length) return res.status(400).json({ error: 'Aucune tribu ni armée adverse sur ce point : lancez une collecte' });
    if (holders.some(h => h.ownerId === req.user.playerId)) return res.status(409).json({ error: 'Votre armée récolte déjà ce point' });
    for (const ownerId of new Set(holders.map(h => h.ownerId))) {
      const relation = await getRelation(req.user.playerId, ownerId);
      if (!relation.canAttack) return res.status(403).json({ error: relation.status === 'SAME_ALLIANCE' ? 'Ce point est tenu par votre alliance : lancez une collecte' : 'Impossible d\'attaquer une armée alliée' });
    }
    const distance = Math.sqrt(Math.pow(node.x - army.x, 2) + Math.pow(node.y - army.y, 2));
    if (distance <= 1.5) {
      // Adjacent: the fight is resolved now, under the army row lock so it cannot be resolved twice
      // (verrou de la ville d'abord : l'armée qui gagne quitte sa case, aucun set-unit entre-temps)
      const result = await prisma.$transaction(async (tx) => {
        if (army.cityId) await lockCity(tx, army.cityId);
        await lockArmy(tx, army.id);
        const fresh = await loadArmy(army.id, req.user.playerId, {}, tx);
        if (!fresh || fresh.status !== 'IDLE' || fresh.units.length === 0 || fresh.cityId !== army.cityId || fresh.x !== army.x || fresh.y !== army.y) return { error: 'Armée déjà en mission', status: 409 };
        const freshNode = await tx.$queryRaw`SELECT * FROM "ResourceNode" WHERE id = ${node.id} FOR UPDATE`.then(r => r[0]);
        if (!freshNode) return { error: 'Ressource non trouvée', status: 404 };
        if (!freshNode.hasDefenders && !freshNode.hasPlayerArmy) return { error: 'Ce point a changé entre-temps, rafraîchissez la carte', status: 409 };
        const r = freshNode.hasDefenders ? await resolveTribeCombat(fresh, freshNode, req.user.playerId, tx) : await resolveNodeHolderCombat(fresh, freshNode, req.user.playerId, tx);
        if (r.blocked) return { error: 'Impossible d\'attaquer une armée alliée', status: 403 };   // devenue alliée depuis le contrôle
        if (r.success && !require('../services/wonderService').isSpecial(freshNode)) {
          if (await claimNode(tx, node.id, { playerId: req.user.playerId, allianceId: fresh.owner?.alliance?.allianceId || null })) {
            await tx.army.update({ where: { id: army.id }, data: { status: 'HARVESTING', x: node.x, y: node.y, targetX: node.x, targetY: node.y, targetResourceId: node.id, missionType: 'HARVEST', harvestResourceType: node.resourceType } });
            r.message = 'Tribu vaincue! Récolte démarrée (100/min)';
            r.status = 'HARVESTING';
          } else {
            r.message = 'Tribu vaincue, mais le point est déjà occupé';
          }
        }
        return r;
      }, { timeout: 15000 });
      if (result.error) return res.status(result.status || 400).json(result);
      const { notices = [], ...answer } = result;
      for (const n of notices) notify(...n);   // the holders' alerts, once the fight is committed
      return res.json(answer);
    }
    const len = await routeLength(army.x, army.y, node.x, node.y, army.owner?.faction);
    const launched = await departLocked(army, 'attaquer', { toX: node.x, toY: node.y, len, data: { status: 'RAIDING', targetResourceId: node.id, missionType: 'RAID_RESOURCE' }, check: campBlocksExit });
    if (launched.error) return res.status(launched.status).json({ error: launched.error });
    res.json({ message: 'Armée en route', travelTime: launched.travelTime, arrivalAt: launched.arrivalAt, target: `${node.resourceType} (${node.x}, ${node.y})` });
  } catch (e) { if (noRoute(res, e)) return; sendError(res, e); }
});

// POST /api/army/:id/found-city { resourceNodeId, name? } — send an army with a settler and the foundation resources
// (GDD: 3 000 of each, taken from the capital first, then from the player's other cities) from the capital to a free
// resource node; the city rises 24 h after the army arrives.
router.post('/:id/found-city', auth, async (req, res) => {
  try {
    const { resourceNodeId } = req.body || {};
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 40) : '';
    { const bad = name && require('../utils/nameFilter').nameProblem(name); if (bad) return res.status(400).json({ error: bad, badName: true }); }
    if (!isId(resourceNodeId)) return res.status(400).json({ error: 'ID de ressource requis' });
    // toutes les villes verrouillées : rejoué après un interblocage rare avec le tick (withDeadlockRetry)
    const result = await withDeadlockRetry(() => prisma.$transaction(async (tx) => {
      // lock order City then Army, as the other army routes: all the player's cities first, the foundation resources may
      // come from any of them (stock partagé, capitale d'abord)
      const cities = await lockPlayerCities(tx, req.user.playerId);
      await lockArmy(tx, req.params.id);
      const army = await loadArmy(req.params.id, req.user.playerId, {}, tx);
      const err = readyToLeave(army, 'fonder une ville');
      if (err) return { error: err.error, status: err.status };
      { const camp = await campBlocksExit(army, tx); if (camp) return { error: camp, status: 400 }; }
      if (!army.city || !army.city.isCapital) return { error: 'Seule une armée de la capitale peut fonder une ville', status: 400 };
      if (!isHome(army, army.city)) return { error: 'L\'armée doit être dans la capitale', status: 400 };
      const capital = await tx.city.findUnique({ where: { id: army.city.id }, include: { buildings: true } });
      const residence = capital.buildings.find(b => b.key === 'RESIDENCE');
      const slots = Math.min(config.city.maxSecondaryCities, fx.settlerSlots(residence?.level || 0));
      const node = await tx.resourceNode.findUnique({ where: { id: resourceNodeId } });
      if (!node) return { error: 'Ressource non trouvée', status: 404 };
      if (node.resourceType === 'PLAN') return { error: 'On ne fonde pas de ville sur un plan : battez les Immortels pour le prendre', status: 400 };
      if (node.resourceType === 'HORDE') return { error: 'On ne fonde pas de ville sur un donjon barbare', status: 400 };
      if (node.resourceType === 'WONDER') {
        // Ville Merveille (décision du 28 octobre 2026) : dans une alliance, une par joueur, hors du compte des colonies
        if (!(await tx.allianceMember.findUnique({ where: { playerId: req.user.playerId } }))) return { error: 'Une Ville Merveille se fonde pour une alliance : rejoignez-en une', status: 400 };
        if (await tx.city.count({ where: { playerId: req.user.playerId, isWonder: true } })) return { error: 'Vous avez déjà une Ville Merveille', status: 400 };
      } else {
        const colonies = await tx.city.count({ where: { playerId: req.user.playerId, isCapital: false, isWonder: false } });
        if (colonies >= slots) return { error: slots ? `Limite atteinte : ${slots} ville(s) secondaire(s) avec cette Résidence` : 'Résidence niveau 10 requise', status: 400 };
      }
      if (capital.settlers < 1) return { error: 'Aucun colon disponible : formez-en un à la Résidence', status: 400 };
      if (node.cityId) return { error: 'Une ville occupe déjà ce point', status: 400 };
      if (node.resourceType === 'GOLD') return { error: 'Impossible de fonder une ville sur un gisement d\'or', status: 400 };
      if (node.hasDefenders && node.defenderPower > 0) return { error: 'Tribu encore présente : chassez-la d\'abord', status: 400 };
      if (node.hasPlayerArmy) return { error: 'Une armée occupe ce point', status: 409 };
      if (!(await footprintFree(node.x, node.y, { ignoreNodeId: node.id, db: tx }))) return { error: 'Pas assez de place : une ville occupe 2 × 2 cases, les trois cases à côté du point doivent être libres (ni ville, ni point, ni relief, ni eau)', status: 400 };
      const cost = config.city.foundationTransport;
      const paid = await debitPlayer(tx, req.user.playerId, capital.id, cost, cities);
      if (!paid.ok) return { error: missingMessage(paid), status: 400, cost, missing: paid.missing };
      await tx.city.update({ where: { id: capital.id }, data: { settlers: { decrement: 1 } } });
      const travelTime = await travelTo(army, node.x, node.y);
      const arrivalAt = new Date(Date.now() + travelTime * 1000);
      const ok = await transition(tx, 'army', army.id, 'IDLE', {
        status: 'MOVING', missionType: 'FOUND', targetX: node.x, targetY: node.y, targetResourceId: node.id, arrivalAt, departedAt: new Date(), settlers: 1,
        carryWood: { increment: cost.wood }, carryStone: { increment: cost.stone }, carryIron: { increment: cost.iron }, carryFood: { increment: cost.food },
        harvestResourceType: name || null   // the chosen name travels with the army (reused field, freed at arrival)
      });
      if (!ok) throw new Error('army busy');
      return { message: `Colon en route : la ville sera fondée ${Math.round(fx.cityFoundationTimeSec() / 3600)} h après l'arrivée`, travelTime, arrivalAt, foundationTimeSec: fx.cityFoundationTimeSec() };
    }));
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { if (noRoute(res, e)) return; sendError(res, e); }
});

// POST /api/army/:id/collect-resource
router.post('/:id/collect-resource', auth, async (req, res) => {
  try {
    const { resourceNodeId } = req.body;
    if (!isId(resourceNodeId)) return res.status(400).json({ error: 'ID de ressource requis' });
    // A* hors transaction, depuis la position lue ici (revérifiée sous les verrous) ; un NO_ROUTE ne sort qu'après les contrôles
    const probe = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, select: { cityId: true, x: true, y: true, status: true, isGarrison: true, owner: { select: { faction: true } } } });
    const spot = probe?.status === 'IDLE' && !probe.isGarrison ? await prisma.resourceNode.findUnique({ where: { id: resourceNodeId }, select: { x: true, y: true } }) : null;
    const route = spot && Math.hypot(spot.x - probe.x, spot.y - probe.y) > 1.5
      ? await routeLength(probe.x, probe.y, spot.x, spot.y, probe.owner?.faction).then(len => ({ len }), e => { if (e?.code === 'NO_ROUTE') return { e }; throw e; })
      : null;

    const result = await prisma.$transaction(async (tx) => {
      // verrous Ville puis Armée, comme les autres départs (set-unit prend celui de la ville)
      if (probe?.cityId) await lockCity(tx, probe.cityId);
      await lockArmy(tx, req.params.id);
      const army = await loadArmy(req.params.id, req.user.playerId, {}, tx);
      if (army && (army.cityId !== probe?.cityId || army.x !== probe?.x || army.y !== probe?.y)) return { error: 'Armée déjà en mission', status: 409 };   // partie ou rattachée ailleurs entre-temps
      const err = readyToLeave(army, 'collecter');
      if (err) return { error: err.error, status: err.status };
      { const camp = await campBlocksExit(army, tx); if (camp) return { error: camp, status: 400 }; }
      const node = await tx.resourceNode.findUnique({ where: { id: resourceNodeId } });
      if (!node) return { error: 'Ressource non trouvée', status: 404 };
      if (require('../services/wonderService').isSpecial(node)) return { error: 'Rien à récolter ici', status: 400 };
      if (node.cityId) return { error: 'Une ville occupe ce point', status: 400 };
      if (node.hasDefenders && node.defenderPower > 0) return { error: 'Tribu encore présente - attaquez d\'abord!', status: 400 };
      if (node.hasPlayerArmy) {
        // Shared with one's own or allied armies only
        const holders = await tx.army.findMany({ where: { status: { in: ['HARVESTING', 'FOUNDING'] }, targetResourceId: node.id }, select: { ownerId: true, status: true, owner: { select: { alliance: { select: { allianceId: true } } } } } });
        if (holders.some(h => h.status === 'FOUNDING')) return { error: 'Une ville est en cours de fondation sur ce point', status: 409 };
        const mine = army.owner?.alliance?.allianceId || null;
        if (holders.length && !holders.every(h => h.ownerId === req.user.playerId || (mine && h.owner?.alliance?.allianceId === mine))) return { error: 'Une armée adverse récolte déjà ce point : attaquez-la', status: 409 };
      }
      const distance = Math.sqrt(Math.pow(node.x - army.x, 2) + Math.pow(node.y - army.y, 2));
      if (distance > 1.5) {
        if (route?.e) throw route.e;
        const len = route && spot.x === node.x && spot.y === node.y ? route.len : await routeLength(army.x, army.y, node.x, node.y, army.owner?.faction);
        const travelTime = getArmyTravelTime(army.units, army.x, army.y, node.x, node.y, army.owner?.faction, army.hero, len, speedTechPct(army));
        const arrivalAt = new Date(Date.now() + travelTime * 1000);
        await tx.army.update({ where: { id: army.id }, data: { status: 'MOVING', targetX: node.x, targetY: node.y, targetResourceId: node.id, arrivalAt, departedAt: new Date(), missionType: 'MOVE_TO_HARVEST', harvestResourceType: node.resourceType } });
        return { message: 'Armée en route pour collecter', travelTime, arrivalAt };
      }
      const carryCapacity = transportCapacity(army, await cityBuildingsOf(tx, army));   // capacité complète, celle de la récolte
      // The node is taken conditionally: free, or already held by one's own or allied armies (shared harvest)
      if (!(await claimNode(tx, node.id, { playerId: req.user.playerId, allianceId: army.owner?.alliance?.allianceId || null }))) return { error: 'Une armée adverse récolte déjà ce point : attaquez-la', status: 409 };
      await tx.army.update({ where: { id: army.id }, data: { status: 'HARVESTING', x: node.x, y: node.y, targetX: node.x, targetY: node.y, targetResourceId: node.id, missionType: 'HARVEST', harvestResourceType: node.resourceType } });
      return { success: true, status: 'HARVESTING', resourceType: node.resourceType, nodeAmount: node.amount, carryCapacity, harvestRate: 100, message: `Récolte démarrée! (100 ${node.resourceType}/min, capacité: ${carryCapacity})` };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { if (noRoute(res, e)) return; sendError(res, e); }
});

// les marches d'un rassemblement (vers le lanceur, puis vers la cible) se rappellent aussi depuis leur position sur la route
const RECALL_EN_ROUTE = [...OUTBOUND, 'RALLY_JOIN', 'RALLY_MARCH'];

// POST /api/army/:id/return — also recalls an army that is still on its way
router.post('/:id/return', auth, async (req, res) => {
  try {
    const result = await prisma.$transaction(async (tx) => {
      // a camp is locked City then Army, the order of every tick transaction on a siege (no deadlock)
      const probe = await tx.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, select: { status: true, targetCityId: true, cityId: true } });
      const campCityId = probe?.status === 'BESIEGING' || probe?.status === 'STATIONED' ? probe.targetCityId : null;   // a camp, or a reinforcement in an allied city
      if (campCityId) await lockCity(tx, campCityId);
      else if (RECALL_EN_ROUTE.includes(probe?.status) && probe.cityId) await lockCity(tx, probe.cityId);   // a mission recalled on its home tile unloads there
      await lockArmy(tx, req.params.id);
      const army = await loadArmy(req.params.id, req.user.playerId, {}, tx);
      if (!army) return { error: 'Armee non trouvee', status: 404 };
      if (!army.city) return { error: 'Armee sans ville d\'origine', status: 400 };
      if (army.status === 'RETURNING') return { message: 'Armée déjà sur le chemin du retour', arrivalAt: army.arrivalAt };
      if (army.status === 'EXPEDITION') return { error: 'Armée en expédition : impossible de la rappeler', status: 400 };
      if (army.claimedAt) return { error: 'Arrivée en cours de résolution, réessayez dans quelques secondes', status: 409 };

      let fromX = army.x, fromY = army.y;
      if (RECALL_EN_ROUTE.includes(army.status) && army.arrivalAt && army.targetX !== null && army.targetY !== null) {
        // Position is only written on arrival: find where the army is on its route right now
        const total = army.departedAt ? (new Date(army.arrivalAt).getTime() - new Date(army.departedAt).getTime()) / 1000 : 0;
        const remaining = Math.max(0, (new Date(army.arrivalAt).getTime() - Date.now()) / 1000);
        const progress = total > 0 ? Math.min(1, Math.max(0, 1 - remaining / total)) : 1;
        const route = await findRoute(army.x, army.y, army.targetX, army.targetY, army.owner?.faction);   // the path it is walking
        const at = route ? pointAlongPath(route.path, progress) : { x: army.x + (army.targetX - army.x) * progress, y: army.y + (army.targetY - army.y) * progress };
        fromX = Math.round(at.x); fromY = Math.round(at.y);
        // left from its own city and not off its tile yet (a sortie, or any mission recalled at once): it is simply back
        // inside, with its load, and never has to fight its way through a camp it did not cross
        if (isHome(army, army.city) && fromX === army.city.x && fromY === army.city.y) {
          await depositCarryTx(tx, army.id, army.city.id);
          await tx.army.update({ where: { id: army.id }, data: { status: 'IDLE', x: army.city.x, y: army.city.y, targetX: null, targetY: null, targetCityId: null, targetBastionId: null, arrivalAt: null, departedAt: null, claimedAt: null, missionType: null, targetResourceId: null, harvestResourceType: null, rallyId: null } });
          return { message: 'Armée rentrée en ville', travelTime: 0 };
        }
      } else if (army.status === 'IDLE' && isHome(army, army.city)) {
        return { message: 'Armee deja a la maison' };
      }
      if ((army.status === 'HARVESTING' || army.status === 'FOUNDING') && army.targetResourceId) {
        // Shared node: released only when this is the last harvesting army on it (a recalled foundation is abandoned)
        const others = await tx.army.count({ where: { status: { in: ['HARVESTING', 'FOUNDING'] }, targetResourceId: army.targetResourceId, id: { not: army.id } } });
        if (others === 0) await tx.resourceNode.updateMany({ where: { id: army.targetResourceId }, data: { hasPlayerArmy: false, lastArmyDeparture: new Date() } });
      }

      const travelTime = getArmyTravelTime(army.units, fromX, fromY, army.city.x, army.city.y, army.owner.faction, army.hero, await routeLength(fromX, fromY, army.city.x, army.city.y, army.owner.faction).catch(() => null), speedTechPct(army));
      const arrivalAt = new Date(Date.now() + travelTime * 1000);
      await tx.army.update({ where: { id: army.id }, data: {
        status: 'RETURNING', x: Math.round(fromX), y: Math.round(fromY), targetX: army.city.x, targetY: army.city.y, targetCityId: null, targetBastionId: null,
        arrivalAt, departedAt: new Date(), missionType: 'RETURN', targetResourceId: null, harvestResourceType: null, rallyId: null
      } });
      // a camp that leaves: the siege is lifted at once when no other army camps before the city
      if (army.status === 'BESIEGING' && army.targetCityId && army.targetCityId === campCityId) await refreshSiegeFlag(tx, army.targetCityId);
      if (army.status === 'BESIEGING' && army.targetBastionId) await bastionBonus().refreshSieged(tx, army.targetBastionId);   // camp devant un Bastion
      const leftSupport = (army.status === 'STATIONED' || army.status === 'SUPPORTING') && army.targetCityId ? await tx.city.findUnique({ where: { id: army.targetCityId }, select: { id: true, name: true, playerId: true } }) : null;
      return { message: 'Retour en cours', travelTime, arrivalAt, leftSupport, armyName: army.name, ownerName: army.owner?.name };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    const { leftSupport, armyName, ownerName, ...out } = result;
    if (leftSupport) notify(leftSupport.playerId, 'alliance', '↩️ Renfort rappelé', `${ownerName || 'Votre allié'} rappelle ${armyName} de ${leftSupport.name}.`, { to: 'city', cityId: leftSupport.id });
    res.json(out);
  } catch (e) { sendError(res, e); }
});

// POST /api/army/:id/transport
router.post('/:id/transport', auth, async (req, res) => {
  try {
    const { targetCityId, wood = 0, stone = 0, iron = 0, food = 0 } = req.body;
    if (!isId(targetCityId)) return res.status(400).json({ error: 'Ville cible requise' });
    if (![wood, stone, iron, food].every(isAmount)) return res.status(400).json({ error: 'Montants invalides' });
    if (wood + stone + iron + food <= 0) return res.status(400).json({ error: 'Entrez des ressources a envoyer' });
    const targetCity = await prisma.city.findUnique({ where: { id: targetCityId } });
    if (!targetCity) return res.status(404).json({ error: 'Ville cible non trouvée' });
    const relation = await getRelation(req.user.playerId, targetCity.playerId);
    if (!relation.canTransport) return res.status(403).json({ error: 'Impossible d\'envoyer des ressources à un ennemi' });

    const result = await prisma.$transaction(async (tx) => {
      const probe = await tx.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, select: { cityId: true } });
      if (!probe?.cityId) return { error: 'Armée non trouvée', status: 404 };
      await lockCity(tx, probe.cityId);
      const army = await loadArmy(req.params.id, req.user.playerId, {}, tx);
      const err = readyToLeave(army, 'transporter');
      if (err) return { error: err.error, status: err.status };
      { const camp = await campBlocksExit(army, tx); if (camp) return { error: camp, status: 400 }; }   // assiégée, la ville ne laisse sortir que contre le camp
      if (!army.city) return { error: 'Armée sans ville d\'origine', status: 400 };
      if (!isHome(army, army.city)) return { error: 'Armée doit être en ville pour charger des ressources', status: 400 };
      // le Marché est « capitale seulement » (décision du 31 octobre 2026) : celui de la capitale ouvre le transport depuis
      // toutes les villes du joueur ; la mission d'armée ne prend pas de marchand
      const cityBuildings = await cityBuildingsOf(tx, army);
      if (config.market.requireBuilding && fx.levelOf(cityBuildings, 'MARKET') < 1) return { error: 'Construisez un Marché dans la capitale (niveau 1 minimum) pour envoyer des ressources', status: 400 };
      const carryCapacity = transportCapacity(army, cityBuildings);
      if (wood + stone + iron + food > carryCapacity) return { error: `Capacité insuffisante (max ${carryCapacity})`, status: 400 };
      if (!(await debitCity(tx, army.city.id, { wood, stone, iron, food }))) return { error: 'Ressources insuffisantes', status: 400 };
      const travelTime = await travelTo(army, targetCity.x, targetCity.y);
      const arrivalAt = new Date(Date.now() + travelTime * 1000);
      if (!(await transition(tx, 'army', army.id, 'IDLE', { status: 'TRANSPORTING', targetX: targetCity.x, targetY: targetCity.y, targetCityId: targetCity.id, arrivalAt, departedAt: new Date(), missionType: 'TRANSPORT', carryWood: wood, carryStone: stone, carryIron: iron, carryFood: food }))) throw new Error('army busy');
      return { message: `Transport lancé vers ${targetCity.name}`, travelTime, arrivalAt, resources: { wood, stone, iron, food } };
    });

    if (result.error) return res.status(result.status || 400).json(result);
    require('../services/questService').bumpLater(req.user.playerId, 'trade_sent', 1);   // quêtes
    res.json(result);
  } catch (e) {
    if (e.message === 'army busy') return res.status(409).json({ error: 'Armée déjà en mission' });
    if (noRoute(res, e)) return;
    sendError(res, e);
  }
});

// POST /api/armies/send (dispatch endpoint)
router.post('/send', auth, async (req, res) => {
  try {
    const { armyId, targetX, targetY, mission } = req.body;
    if (!isId(armyId)) return res.status(400).json({ error: 'Armee requise' });
    let parsedX = parseInt(targetX), parsedY = parseInt(targetY);
    if (!validateCoordinates(parsedX, parsedY)) return res.status(400).json({ error: 'Coordonnées invalides' });
    const army = await loadArmy(armyId, req.user.playerId);
    const err = readyToLeave(army, 'partir');
    if (err) return res.status(err.status).json({ error: err.error });
    { const camp = await campBlocksExit(army); if (camp) return res.status(400).json({ error: camp }); }
    if (mission === 'SPY') return res.status(400).json({ error: NO_ARMY_SPY });
    if (mission === 'ATTACK' || mission === 'RAID') {
      const targetCity = await prisma.city.findFirst({ where: cityAtCellWhere(parsedX, parsedY), include: { buildings: true } });   // any of its 2 × 2 cells
      if (!targetCity) return res.status(404).json({ error: 'Aucune ville a ces coordonnees' });
      const launched = await launchCityMission(army, targetCity, mission, 'partir');
      if (launched.error) return res.status(launched.status).json({ error: launched.error });
      const label = { ATTACK: 'Attaque lancée', RAID: 'Raid lancé' }[mission];
      return res.json({ message: `${label} vers ${targetCity.name}`, target: targetCity.name, ...launched });
    }
    ({ x: parsedX, y: parsedY } = await cityAnchorOf(parsedX, parsedY));
    if (await isBlockedTile(parsedX, parsedY)) return res.status(400).json({ error: 'Une armée ne peut pas se rendre sur une montagne ou dans l\'eau' });
    if (parsedX === army.x && parsedY === army.y) return res.status(400).json({ error: 'L\'armée est déjà sur place' });
    const len = await routeLength(army.x, army.y, parsedX, parsedY, army.owner?.faction);
    const moved = await departLocked(army, 'partir', { toX: parsedX, toY: parsedY, len, data: { status: 'MOVING', missionType: 'MOVE' }, check: campBlocksExit });
    if (moved.error) return res.status(moved.status).json({ error: moved.error });
    res.json({ message: `Armee en mouvement vers (${parsedX}, ${parsedY})`, travelTime: moved.travelTime, arrivalAt: moved.arrivalAt });
  } catch (e) { if (noRoute(res, e)) return; sendError(res, e); }
});

// GET /api/army/:id
router.get('/:id', auth, async (req, res) => {
  try {
    const army = await prisma.army.findFirst({ where: { id: req.params.id, ownerId: req.user.playerId }, include: { units: true, city: true, hero: HERO_EQUIPPED } });
    if (!army) return res.status(404).json({ error: 'Armee non trouvee' });
    res.json({ ...army, power: calculateArmyPower(army.units, unitsData) });
  } catch (e) { sendError(res, e); }
});

// GET /api/armies
router.get('/', auth, async (req, res) => {
  try {
    const armies = await prisma.army.findMany({ where: { ownerId: req.user.playerId }, include: { units: true, city: true, hero: HERO_EQUIPPED } });
    res.json(armies.map(a => ({ ...a, power: calculateArmyPower(a.units, unitsData) })));
  } catch (e) { sendError(res, e); }
});

module.exports = router;
// calculs de marche et de charge, pour les tests
module.exports.speedTechPct = speedTechPct;
module.exports.transportCapacity = transportCapacity;
