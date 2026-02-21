const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const config = require('../config');
const { getCityTier, getCityTierName } = require('../utils/calculations');

const BASE_WORLD_SIZE = config.map.baseWorldSize;
const EXPANSION_PER_PLAYER = config.map.expansionPerPlayer;
const MAX_PLAYERS = config.map.maxPlayers;
const MIN_COORD = config.map.minCoord;
const MAX_COORD = config.map.maxCoord;

async function getWorldSize() {
  const playerCount = await prisma.player.count();
  const expansion = Math.min(playerCount, MAX_PLAYERS) * EXPANSION_PER_PLAYER;
  const worldSize = BASE_WORLD_SIZE + Math.floor(Math.sqrt(expansion * 100));
  return { worldSize, playerCount, minCoord: MIN_COORD, maxCoord: MAX_COORD };
}

router.get('/world/info', async (req, res) => {
  try {
    const { worldSize, playerCount, minCoord, maxCoord } = await getWorldSize();
    const resourceCount = await prisma.resourceNode.count();
    res.json({ worldSize, playerCount, maxPlayers: MAX_PLAYERS, center: 0, minCoord, maxCoord, totalTiles: worldSize * worldSize, resourceNodes: resourceCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/map/viewport', auth, async (req, res) => {
  try {
    // Use nullish check instead of || to properly handle x=0 and y=0
    const x = req.query.x !== undefined && req.query.x !== '' ? parseInt(req.query.x) : 0;
    const y = req.query.y !== undefined && req.query.y !== '' ? parseInt(req.query.y) : 0;
    const r = Math.min(parseInt(req.query.radius) || 30, 60);

    // Validate parsed coordinates
    const centerX = isNaN(x) ? 0 : Math.max(MIN_COORD, Math.min(MAX_COORD, x));
    const centerY = isNaN(y) ? 0 : Math.max(MIN_COORD, Math.min(MAX_COORD, y));

    const cities = await prisma.city.findMany({
      where: { x: { gte: centerX - r, lte: centerX + r }, y: { gte: centerY - r, lte: centerY + r } },
      select: { id: true, name: true, x: true, y: true, isCapital: true, playerId: true, buildings: { where: { key: 'WALL' }, select: { level: true } }, player: { select: { id: true, name: true, faction: true, population: true, alliance: { select: { alliance: { select: { id: true, tag: true } } } } } } }
    });
    const citiesWithTier = cities.map(city => {
      const wallLevel = city.buildings[0]?.level || 0;
      const cityTier = getCityTier(wallLevel);
      const allianceInfo = city.player?.alliance?.alliance;
      return { id: city.id, name: city.name, x: city.x, y: city.y, isCapital: city.isCapital, playerId: city.playerId, player: { id: city.player?.id, name: city.player?.name, faction: city.player?.faction, population: city.player?.population || 0, allianceId: allianceInfo?.id || null, allianceTag: allianceInfo?.tag || null }, wallLevel, cityTier, cityTierName: getCityTierName(cityTier) };
    });
    const nodes = await prisma.resourceNode.findMany({ where: { x: { gte: centerX - r, lte: centerX + r }, y: { gte: centerY - r, lte: centerY + r } } });

    // Include moving armies visible in viewport
    const movingArmies = await prisma.army.findMany({
      where: {
        status: { in: ['MOVING', 'ATTACKING', 'RAIDING', 'RETURNING', 'SPYING', 'TRANSPORTING', 'HARVESTING'] },
        OR: [
          { x: { gte: centerX - r, lte: centerX + r }, y: { gte: centerY - r, lte: centerY + r } },
          { targetX: { gte: centerX - r, lte: centerX + r }, targetY: { gte: centerY - r, lte: centerY + r } }
        ]
      },
      select: { id: true, name: true, x: true, y: true, targetX: true, targetY: true, status: true, missionType: true, arrivalAt: true, ownerId: true, owner: { select: { name: true, faction: true } } }
    });

    res.json({ cities: citiesWithTier, resourceNodes: nodes, armies: movingArmies, center: { x: centerX, y: centerY }, radius: r });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.getWorldSize = getWorldSize;
