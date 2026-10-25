const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const { unitsData, buildingsData, itemsData, factionsData, technologiesData } = require('../config/gamedata');
const config = require('../config');
const { getCityTier, getCityTierName, mainHallLevelOf } = require('../utils/calculations');
const Terrain = require('../../frontend/js/shared/terrain.js');

const BASE_WORLD_SIZE = config.map.baseWorldSize;
const EXPANSION_PER_PLAYER = config.map.expansionPerPlayer;
const MAX_PLAYERS = config.map.maxPlayers;
const MIN_COORD = config.map.minCoord;
const MAX_COORD = config.map.maxCoord;

// Sprite de carte d'une armée en mouvement : marchand pour les transports, sinon la classe
// de l'unité la plus nombreuse (hoplite / archer / cavalry / catapult)
const UNIT_CLASS = Object.fromEntries((Array.isArray(unitsData) ? unitsData : (unitsData?.units || [])).map(u => [u.key, u.class]));
const CLASS_SPRITE = { SIEGE: 'catapult', CAVALRY: 'cavalry', ARCHER: 'archer', INFANTRY: 'hoplite' };
function mainUnitSprite(army, units) {
  if (army.status === 'TRANSPORTING' || army.missionType === 'TRANSPORT') return 'merchant';
  if (army.missionType === 'FOUND') return 'settler';   // settlers' party: painted sprite when delivered, the merchant cart otherwise
  let best = null;
  for (const u of units || []) if (!best || u.count > best.count) best = u;
  return (best && CLASS_SPRITE[UNIT_CLASS[best.unitKey]]) || 'hoplite';
}

async function getWorldSize() {
  const playerCount = await prisma.player.count();
  const expansion = Math.min(playerCount, MAX_PLAYERS) * EXPANSION_PER_PLAYER;
  const worldSize = BASE_WORLD_SIZE + Math.floor(Math.sqrt(expansion * 100));
  return { worldSize, playerCount, minCoord: MIN_COORD, maxCoord: MAX_COORD };
}

router.get('/world/info', async (req, res) => {
  // Rules the client displays (never computed client-side): city tiers by Main Hall level, Main Hall cap of a secondary city
  const rules = { healingBedsPerLevel: config.wounded.bedsPerLevel, cityTiers: config.cityTiers, secondaryMainHallMaxLevel: config.city.secondaryMainHallMaxLevel, maxSecondaryCities: config.city.maxSecondaryCities, foundationTransport: config.city.foundationTransport,
    // siège et chute des villes (octobre 2026)
    siege: { campMinutes: config.combat.siege.campMinutes, minEngines: config.combat.siege.minEngines, engineWallMult: config.combat.siege.wallShield.engineMult, soldierWallMult: config.combat.siege.wallShield.soldierMult, fallAssaults: config.combat.fall.assaults, fallExtraAssaults: config.combat.fall.extraAssaults, wallHealthRegenHours: config.combat.fall.regenHours, pillagePct: config.combat.fall.pillagePct } };
  try {
    const { worldSize, playerCount, minCoord, maxCoord } = await getWorldSize();
    const resourceCount = await prisma.resourceNode.count();
    // Faction bonuses as the game applies them (data/factions.json): the client shows them on the sign-up cards and in building texts
    const factions = Object.fromEntries(Object.entries(factionsData).map(([k, f]) => [k, { name: f.name, bonuses: (f.bonuses || []).map(b => ({ type: b.type, value: b.value, description: b.description })) }]));
    res.json({ worldSize, playerCount, maxPlayers: MAX_PLAYERS, center: 0, minCoord, maxCoord, totalTiles: worldSize * worldSize, resourceNodes: resourceCount, factions, rules, terrainVersion: Terrain.TERRAIN_VERSION });
  } catch (e) { sendError(res, e); }
});

// Cache viewport en mémoire : la réponse est identique pour tous les joueurs
// TTL court (3s) -> absorbe le polling de milliers de clients sans montrer de données périmées
const viewportCache = new Map();
const VIEWPORT_TTL_MS = 3000;
const VIEWPORT_CACHE_MAX = 2000;
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of viewportCache) if (now > v.expires) viewportCache.delete(k);
}, 10000).unref();

router.get('/map/viewport', auth, async (req, res) => {
  try {
    // Use nullish check instead of || to properly handle x=0 and y=0
    const x = req.query.x !== undefined && req.query.x !== '' ? parseInt(req.query.x) : 0;
    const y = req.query.y !== undefined && req.query.y !== '' ? parseInt(req.query.y) : 0;
    const r = Math.min(parseInt(req.query.radius) || 30, 100);
    const liteMode = r > 60; // vue d'ensemble : villes seulement (pas de noeuds/armées) pour garder un payload léger

    // Validate parsed coordinates
    const centerX = isNaN(x) ? 0 : Math.max(MIN_COORD, Math.min(MAX_COORD, x));
    const centerY = isNaN(y) ? 0 : Math.max(MIN_COORD, Math.min(MAX_COORD, y));

    const cacheKey = `${centerX}:${centerY}:${r}`;
    const cached = viewportCache.get(cacheKey);
    if (cached && Date.now() < cached.expires) {
      return res.json(cached.data);
    }

    const [cities, nodes, movingArmies] = await Promise.all([
      prisma.city.findMany({
      where: { x: { gte: centerX - r, lte: centerX + r }, y: { gte: centerY - r, lte: centerY + r } },
      select: { id: true, name: true, x: true, y: true, isCapital: true, isSieged: true, wallStructure: true, playerId: true, buildings: { where: { key: { in: ['WALL', 'MAIN_HALL'] } }, select: { key: true, level: true } }, player: { select: { id: true, name: true, faction: true, population: true, alliance: { select: { alliance: { select: { id: true, tag: true } } } } } } }
    }),
      liteMode ? Promise.resolve([]) : prisma.resourceNode.findMany({ where: { x: { gte: centerX - r, lte: centerX + r }, y: { gte: centerY - r, lte: centerY + r }, cityId: null } }),
      liteMode ? Promise.resolve([]) : prisma.army.findMany({
        where: {
          status: { in: ['MOVING', 'ATTACKING', 'RAIDING', 'RETURNING', 'SPYING', 'TRANSPORTING', 'HARVESTING', 'FOUNDING', 'BESIEGING'] },
          OR: [
            { x: { gte: centerX - r, lte: centerX + r }, y: { gte: centerY - r, lte: centerY + r } },
            { targetX: { gte: centerX - r, lte: centerX + r }, targetY: { gte: centerY - r, lte: centerY + r } }
          ]
        },
        select: { id: true, name: true, x: true, y: true, targetX: true, targetY: true, targetCityId: true, status: true, missionType: true, arrivalAt: true, departedAt: true, ownerId: true, heroId: true, owner: { select: { name: true, faction: true } }, units: { select: { unitKey: true, count: true } } }
      })
    ]);
    // Civilisation de l'armée qui assiège chaque ville (sa bannière est plantée devant la ville)
    const siegedBy = {};
    for (const a of movingArmies) if (a.status === 'BESIEGING' && a.targetCityId && !siegedBy[a.targetCityId]) siegedBy[a.targetCityId] = a.owner?.faction || null;
    // l'heure du combat d'un camp n'est donnée qu'aux joueurs concernés et à leurs alliances (décision du 25 octobre 2026)
    const me = req.user.playerId;
    const myAlliance = (await prisma.allianceMember.findUnique({ where: { playerId: me }, select: { allianceId: true } }))?.allianceId || null;
    const cityOwner = new Map(cities.map(c => [c.id, { id: c.playerId, alliance: c.player?.alliance?.alliance?.id || null }]));
    const campOwnerAlliance = new Map((await prisma.allianceMember.findMany({ where: { playerId: { in: [...new Set(movingArmies.filter(a => a.status === 'BESIEGING').map(a => a.ownerId))] } }, select: { playerId: true, allianceId: true } })).map(m => [m.playerId, m.allianceId]));
    const sees = (a) => {
      if (a.ownerId === me || (myAlliance && campOwnerAlliance.get(a.ownerId) === myAlliance)) return true;
      const o = cityOwner.get(a.targetCityId);
      return !!o && (o.id === me || (myAlliance && o.alliance === myAlliance));
    };
    const armies = movingArmies.map(({ units, heroId, ...a }) => ({ ...a, ...(a.status === 'BESIEGING' && !sees(a) ? { arrivalAt: null } : {}), hasHero: !!heroId, mainUnit: mainUnitSprite(a, units) }));
    const citiesWithTier = cities.map(city => {
      const wallLevel = city.buildings.find(b => b.key === 'WALL')?.level || 0;
      const mainHallLevel = mainHallLevelOf(city.buildings);
      const cityTier = getCityTier(mainHallLevel);
      const allianceInfo = city.player?.alliance?.alliance;
      // vies perdues (le mur en a perdu la même part) : la fumée qui s'élève de la ville se voit de loin, par tranches de 10 %
      const wallDamage = Math.max(0, Math.min(100, Math.round((1 - (city.wallStructure ?? 1)) * 10) * 10));
      return { id: city.id, name: city.name, x: city.x, y: city.y, isCapital: city.isCapital, isSieged: city.isSieged, wallDamage, siegedBy: city.isSieged ? siegedBy[city.id] || null : null, playerId: city.playerId, player: { id: city.player?.id, name: city.player?.name, faction: city.player?.faction, population: city.player?.population || 0, allianceId: allianceInfo?.id || null, allianceTag: allianceInfo?.tag || null }, wallLevel, mainHallLevel, cityTier, cityTierName: getCityTierName(cityTier) };
    });

    // Who holds each node (harvesting armies), and a stock shown by quarters only (GDD: the exact state needs a spy)
    const holdersByNode = {};
    if (nodes.length) {
      const held = await prisma.army.findMany({ where: { status: { in: ['HARVESTING', 'FOUNDING'] }, targetResourceId: { in: nodes.map(n => n.id) } }, select: { targetResourceId: true, ownerId: true, status: true, owner: { select: { name: true, faction: true, alliance: { select: { allianceId: true } } } } } });
      for (const a of held) (holdersByNode[a.targetResourceId] ||= []).push({ playerId: a.ownerId, name: a.owner?.name, allianceId: a.owner?.alliance?.allianceId || null, founding: a.status === 'FOUNDING', faction: a.owner?.faction || null });
    }
    const quantize = (amount, max) => (max > 0 ? Math.round(Math.round(amount / max * 4) / 4 * max) : amount);
    const resourceNodes = nodes.map(n => ({ ...n, amount: quantize(n.amount, n.maxAmount), holders: holdersByNode[n.id] || [] }));
    const payload = { cities: citiesWithTier, resourceNodes, armies, center: { x: centerX, y: centerY }, radius: r };
    if (viewportCache.size < VIEWPORT_CACHE_MAX) viewportCache.set(cacheKey, { data: payload, expires: Date.now() + VIEWPORT_TTL_MS });
    res.json(payload);
  } catch (e) { sendError(res, e); }
});

// Catalogues de jeu (statiques, très cacheables)
router.get('/buildings', auth, (req, res) => {
  res.set('Cache-Control', 'private, max-age=3600');
  res.json(buildingsData);
});
router.get('/units', auth, (req, res) => {
  res.set('Cache-Control', 'private, max-age=3600');
  res.json(unitsData);
});
router.get('/technologies', auth, (req, res) => {
  res.set('Cache-Control', 'private, max-age=3600');
  res.json(technologiesData);
});
router.get('/items', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(itemsData);
});

module.exports = router;
