const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const { unitsData, itemsData, factionsData, technologiesData } = require('../config/gamedata');
const config = require('../config');
const { bannerImage } = require('../services/allianceShopService');
const { getCityTier, getCityTierName, mainHallLevelOf } = require('../utils/calculations');
const Terrain = require('../../frontend/js/shared/terrain.js');

const BASE_WORLD_SIZE = config.map.baseWorldSize;
const EXPANSION_PER_PLAYER = config.map.expansionPerPlayer;
const MAX_PLAYERS = config.world.maxPlayers;
const MIN_COORD = config.map.minCoord;
const MAX_COORD = config.map.maxCoord;

// Sprite de carte d'une armée en mouvement : marchand pour les transports, sinon la classe
// de l'unité la plus nombreuse (hoplite / archer / cavalry / catapult)
const UNIT_CLASS = Object.fromEntries(unitsData.map(u => [u.key, u.class]));
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
    // monde suivant tout juste ouvert : la carte de ce processus suit celle de la base avant d'être annoncée au client
    { const WS = require('../services/wonderService'); const row = await WS.worldRow(); if (!WS.preparing(row)) WS.syncWorldSeed(row); }
    const { worldSize, playerCount, minCoord, maxCoord } = await getWorldSize();
    const resourceCount = await prisma.resourceNode.count();
    // Faction bonuses as the game applies them (data/factions.json): the client shows them on the sign-up cards and in building texts
    const factions = Object.fromEntries(Object.entries(factionsData).map(([k, f]) => [k, { name: f.name, bonuses: (f.bonuses || []).map(b => ({ type: b.type, value: b.value, description: b.description })) }]));
    res.json({ worldSize, playerCount, maxPlayers: MAX_PLAYERS, center: 0, minCoord, maxCoord, totalTiles: worldSize * worldSize, resourceNodes: resourceCount, factions, rules, terrainVersion: Terrain.minClientVersion, worldSeed: Terrain.worldSeed, terrainSignature: Terrain.signature });   // version du terrain qu'il faut au client pour dessiner cette carte ; empreinte de la carte à comparer à la sienne
  } catch (e) { sendError(res, e); }
});

// Cache viewport en mémoire : il garde la partie commune à tous les joueurs ; ce que chacun voit des armées (heure d'un
// camp, taille de la colonne) est appliqué à chaque requête. TTL court (3s) -> absorbe le polling de milliers de clients
// sans montrer de données périmées
const viewportCache = new Map();
const VIEWPORT_TTL_MS = 3000;
const VIEWPORT_CACHE_MAX = 2000;
// centre arrondi à 10 cases et rayon élargi de 5 : les joueurs qui regardent la même région partagent une entrée
const VIEWPORT_Q = 10;
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

    const qx = Math.round(centerX / VIEWPORT_Q) * VIEWPORT_Q, qy = Math.round(centerY / VIEWPORT_Q) * VIEWPORT_Q;
    const qr = r + VIEWPORT_Q / 2;   // couvre toujours la zone demandée (le centre bouge d'au plus 5)
    const cacheKey = `${qx}:${qy}:${qr}:${liteMode}`;
    const cached = viewportCache.get(cacheKey);
    const shared = cached && Date.now() < cached.expires ? cached.data : await loadViewport(qx, qy, qr, liteMode);
    if (shared !== cached?.data && viewportCache.size < VIEWPORT_CACHE_MAX) viewportCache.set(cacheKey, { data: shared, expires: Date.now() + VIEWPORT_TTL_MS });
    res.json({ ...(await viewFor(req.user.playerId, shared)), center: { x: centerX, y: centerY }, radius: r });
  } catch (e) { sendError(res, e); }
});

// Ce que le joueur voit (décisions des 25 et 26 octobre 2026, vision façon Travian) :
// - les villes, les points et le relief partout ;
// - les armées des autres seulement si elles sont à lui ou à son alliance, ou si elles vont vers (ou campent devant) une
//   ville à lui ou à son alliance ; l'heure du combat d'un camp n'est donnée qu'aux joueurs concernés et à leurs alliances ;
// - qui récolte un point : seulement ses armées, celles de son alliance, ou si le joueur a espionné le point depuis
//   moins d'1 h (sinon le point dit seulement qu'il est occupé) ; un point espionné donne son stock exact.
// La colonne dessinée (1 à 3 groupes) suit la taille réelle pour ses armées et celles de son alliance, une valeur tirée de
// l'armée pour les autres (l'effectif ne se lit qu'avec un espion).
async function viewFor(me, shared) {
  const { cityOwner, bastionAlliance = {}, armies: all, resourceNodes = [], ...rest } = shared;
  const myAlliance = (await prisma.allianceMember.findUnique({ where: { playerId: me }, select: { allianceId: true } }))?.allianceId || null;
  const friend = (playerId, allianceId) => playerId === me || (!!myAlliance && allianceId === myAlliance);
  const concerns = (a) => { const o = cityOwner[a.targetCityId]; if (o && friend(o.id, o.alliance)) return true; return !!a.targetBastionId && !!myAlliance && bastionAlliance[a.targetBastionId] === myAlliance; };
  const armies = (all || []).filter(a => friend(a.ownerId, a.ownerAllianceId) || concerns(a)).map(({ realSquads, ownerAllianceId, ...a }) => ({
    ...a,
    ...(a.status === 'BESIEGING' && !friend(a.ownerId, ownerAllianceId) && !concerns(a) ? { arrivalAt: null } : {}),
    squads: friend(a.ownerId, ownerAllianceId) ? realSquads : 1 + ([...String(a.id)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 3)
  }));
  let nodes = resourceNodes;
  if (nodes.length) {
    const intel = await require('../services/spyService').nodeIntelFor(me, nodes.map(n => n.id)).catch(() => ({}));
    nodes = nodes.map(n => {
      const spied = intel[n.id];
      const holders = (n.holders || []).filter(h => spied || friend(h.playerId, h.allianceId));
      const hidden = (n.holders || []).length - holders.length;
      return { ...n, holders, hiddenHolders: hidden, ...(spied ? { amount: spied.amount, spiedAt: spied.at, spied: { tribe: spied.tribe, holders: spied.holders } } : {}) };
    });
  }
  return { ...rest, resourceNodes: nodes, armies };
}

async function loadViewport(centerX, centerY, r, liteMode) {
    const [cities, nodes, movingArmies] = await Promise.all([
      prisma.city.findMany({
      where: { x: { gte: centerX - r, lte: centerX + r }, y: { gte: centerY - r, lte: centerY + r } },
      select: { id: true, name: true, x: true, y: true, isCapital: true, isSieged: true, wallStructure: true, isWonder: true, wonderLevel: true, playerId: true, buildings: { where: { key: { in: ['WALL', 'MAIN_HALL'] } }, select: { key: true, level: true } }, player: { select: { id: true, name: true, faction: true, population: true, nameplate: true, banner: true, alliance: { select: { alliance: { select: { id: true, tag: true } } } } } } }
    }),
      liteMode ? Promise.resolve([]) : prisma.resourceNode.findMany({ where: { x: { gte: centerX - r, lte: centerX + r }, y: { gte: centerY - r, lte: centerY + r }, cityId: null } }),
      liteMode ? Promise.resolve([]) : prisma.army.findMany({
        where: {
          status: { in: ['MOVING', 'ATTACKING', 'RAIDING', 'RETURNING', 'SPYING', 'TRANSPORTING', 'HARVESTING', 'FOUNDING', 'BESIEGING', 'SUPPORTING', 'RALLY_JOIN', 'RALLY_MARCH'] },   // RALLY_* : rassemblement (vu de son alliance, et de celle du Bastion visé)
          OR: [
            { x: { gte: centerX - r, lte: centerX + r }, y: { gte: centerY - r, lte: centerY + r } },
            { targetX: { gte: centerX - r, lte: centerX + r }, targetY: { gte: centerY - r, lte: centerY + r } }
          ]
        },
        select: { id: true, name: true, x: true, y: true, targetX: true, targetY: true, targetCityId: true, targetBastionId: true, status: true, missionType: true, arrivalAt: true, departedAt: true, ownerId: true, heroId: true, owner: { select: { name: true, faction: true } }, units: { select: { unitKey: true, count: true } } }
      })
    ]);
    // Civilisation de l'armée qui assiège chaque ville (sa bannière est plantée devant la ville)
    const siegedBy = {};
    for (const a of movingArmies) if (a.status === 'BESIEGING' && a.targetCityId && !siegedBy[a.targetCityId]) siegedBy[a.targetCityId] = a.owner?.faction || null;
    // propriétaires des villes visées et alliances des armées : de quoi appliquer à chaque joueur ce qu'il voit (viewFor)
    const cityOwner = Object.fromEntries(cities.map(c => [c.id, { id: c.playerId, alliance: c.player?.alliance?.alliance?.id || null }]));
    // villes visées hors de la zone affichée : il faut aussi savoir à qui elles sont (une armée qui marche sur ma ville se voit)
    const farTargets = [...new Set(movingArmies.map(a => a.targetCityId).filter(id => id && !cityOwner[id]))];
    // Bastions d'alliance de la zone, et alliance de chaque Bastion visé (une armée qui marche sur le Bastion de mon alliance se voit)
    const bastions = liteMode ? [] : await require('../services/bastionService').bastionsIn(centerX - r, centerX + r, centerY - r, centerY + r);
    const bastionAlliance = Object.fromEntries(bastions.map(b => [b.id, b.allianceId]));
    const farBastions = [...new Set(movingArmies.map(a => a.targetBastionId).filter(id => id && !bastionAlliance[id]))];
    if (farBastions.length) for (const b of await prisma.bastion.findMany({ where: { id: { in: farBastions } }, select: { id: true, allianceId: true } })) bastionAlliance[b.id] = b.allianceId;
    if (farTargets.length) for (const c of await prisma.city.findMany({ where: { id: { in: farTargets } }, select: { id: true, playerId: true, player: { select: { alliance: { select: { allianceId: true } } } } } })) cityOwner[c.id] = { id: c.playerId, alliance: c.player?.alliance?.allianceId || null };
    const ownerAlliance = new Map(movingArmies.length ? (await prisma.allianceMember.findMany({ where: { playerId: { in: [...new Set(movingArmies.map(a => a.ownerId))] } }, select: { playerId: true, allianceId: true } })).map(m => [m.playerId, m.allianceId]) : []);
    // taille de la colonne dessinée sur la carte (1 à 3 groupes de soldats), comme on la voit de loin : pas l'effectif
    const squadsOf = (units) => { const n = (units || []).reduce((t, u) => t + (u.count || 0), 0); return n < 100 ? 1 : n < 500 ? 2 : 3; };
    const armies = movingArmies.map(({ units, heroId, ...a }) => ({ ...a, hasHero: !!heroId, mainUnit: mainUnitSprite(a, units), realSquads: squadsOf(units), ownerAllianceId: ownerAlliance.get(a.ownerId) || null }));
    const citiesWithTier = cities.map(city => {
      const wallLevel = city.buildings.find(b => b.key === 'WALL')?.level || 0;
      const mainHallLevel = mainHallLevelOf(city.buildings);
      const cityTier = getCityTier(mainHallLevel);
      const allianceInfo = city.player?.alliance?.alliance;
      // vies perdues (le mur en a perdu la même part) : la fumée qui s'élève de la ville se voit de loin, par tranches de 10 %
      const wallDamage = Math.max(0, Math.min(100, Math.round((1 - (city.wallStructure ?? 1)) * 10) * 10));
      return { id: city.id, name: city.name, x: city.x, y: city.y, isCapital: city.isCapital, isSieged: city.isSieged, wallDamage, siegedBy: city.isSieged ? siegedBy[city.id] || null : null, playerId: city.playerId, player: { id: city.player?.id, name: city.player?.name, faction: city.player?.faction, population: city.player?.population || 0, allianceId: allianceInfo?.id || null, allianceTag: allianceInfo?.tag || null, nameplate: city.player?.nameplate || null, banner: bannerImage(city.player?.banner) }, wallLevel, mainHallLevel, cityTier, cityTierName: getCityTierName(cityTier), isWonder: city.isWonder || false, wonderLevel: city.wonderLevel || 0 };
    });

    // Who holds each node (harvesting armies), and a stock shown by quarters only (GDD: the exact state needs a spy)
    const holdersByNode = {};
    if (nodes.length) {
      const held = await prisma.army.findMany({ where: { status: { in: ['HARVESTING', 'FOUNDING'] }, targetResourceId: { in: nodes.map(n => n.id) } }, select: { targetResourceId: true, ownerId: true, status: true, owner: { select: { name: true, faction: true, alliance: { select: { allianceId: true } } } } } });
      for (const a of held) (holdersByNode[a.targetResourceId] ||= []).push({ playerId: a.ownerId, name: a.owner?.name, allianceId: a.owner?.alliance?.allianceId || null, founding: a.status === 'FOUNDING', faction: a.owner?.faction || null });
    }
    const quantize = (amount, max) => (max > 0 ? Math.round(Math.round(amount / max * 4) / 4 * max) : amount);
    // donjons d'une invasion barbare : étage en cours et garnison de départ de l'étage (barre de vie sur la carte)
    const hordeIds = nodes.filter(n => n.resourceType === 'HORDE').map(n => n.id);
    const hordes = hordeIds.length ? await prisma.horde.findMany({ where: { nodeId: { in: hordeIds } }, select: { nodeId: true, level: true, floor: true, floors: true } }) : [];
    const hordeBy = new Map(hordes.map(h => [h.nodeId, { level: h.level, floor: h.floor, floors: h.floors.length, floorPower: h.floors[h.floor - 1]?.power || 1 }]));
    const resourceNodes = nodes.map(n => ({ ...n, amount: quantize(n.amount, n.maxAmount), holders: holdersByNode[n.id] || [], ...(hordeBy.has(n.id) ? { horde: hordeBy.get(n.id) } : {}) }));
    return { cities: citiesWithTier, resourceNodes, armies, cityOwner, bastions, bastionAlliance, center: { x: centerX, y: centerY }, radius: r };
}

// Catalogues de jeu (statiques, très cacheables)
router.get('/technologies', auth, (req, res) => {
  res.set('Cache-Control', 'private, max-age=3600');
  res.json(technologiesData);
});
router.get('/items', (req, res) => {
  res.set('Cache-Control', 'public, max-age=3600');
  res.json(itemsData);
});

module.exports = router;
