const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const config = require('../config');
const { getCityTier, getCityTierName } = require('../utils/calculations');

const BASE_WORLD_SIZE = config.map.baseWorldSize;
const EXPANSION_PER_PLAYER = config.map.expansionPerPlayer;
const MAX_PLAYERS = config.map.maxPlayers;

async function getWorldSize() {
  const playerCount = await prisma.player.count();
  const expansion = Math.min(playerCount, MAX_PLAYERS) * EXPANSION_PER_PLAYER;
  const worldSize = BASE_WORLD_SIZE + Math.floor(Math.sqrt(expansion * 100));
  return { worldSize, playerCount, center: Math.floor(worldSize / 2) };
}

router.get('/world/info', async (req, res) => {
  try {
    const { worldSize, playerCount, center } = await getWorldSize();
    const resourceCount = await prisma.resourceNode.count();
    res.json({ worldSize, playerCount, maxPlayers: MAX_PLAYERS, center, totalTiles: worldSize * worldSize, resourceNodes: resourceCount });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.get('/map/viewport', auth, async (req, res) => {
  try {
    const { center } = await getWorldSize();
    const x = parseInt(req.query.x) || center;
    const y = parseInt(req.query.y) || center;
    const r = parseInt(req.query.radius) || 10;
    const cities = await prisma.city.findMany({
      where: { x: { gte: x - r, lte: x + r }, y: { gte: y - r, lte: y + r } },
      select: { id: true, name: true, x: true, y: true, isCapital: true, playerId: true, buildings: { where: { key: 'WALL' }, select: { level: true } }, player: { select: { id: true, name: true, faction: true, population: true, alliance: { select: { alliance: { select: { id: true, tag: true } } } } } } }
    });
    const citiesWithTier = cities.map(city => {
      const wallLevel = city.buildings[0]?.level || 0;
      const cityTier = getCityTier(wallLevel);
      const allianceInfo = city.player?.alliance?.alliance;
      return { id: city.id, name: city.name, x: city.x, y: city.y, isCapital: city.isCapital, playerId: city.playerId, player: { id: city.player?.id, name: city.player?.name, faction: city.player?.faction, population: city.player?.population || 0, allianceId: allianceInfo?.id || null, allianceTag: allianceInfo?.tag || null }, wallLevel, cityTier, cityTierName: getCityTierName(cityTier) };
    });
    const nodes = await prisma.resourceNode.findMany({ where: { x: { gte: x - r, lte: x + r }, y: { gte: y - r, lte: y + r } } });
    res.json({ cities: citiesWithTier, resourceNodes: nodes, center: { x, y }, radius: r });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
module.exports.getWorldSize = getWorldSize;
