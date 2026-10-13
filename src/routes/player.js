const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');

// GET /api/player/me
router.get('/me', auth, async (req, res) => {
  try {
    const player = await prisma.player.findUnique({
      where: { id: req.user.playerId },
      include: {
        cities: { include: { buildings: true, buildQueue: true, recruitQueue: true, armies: { include: { units: true } } } },
        hero: { include: { items: true } },
        stats: true,
        alliance: { include: { alliance: { include: { members: { include: { player: { select: { id: true, name: true, faction: true, population: true } } } } } } } },
        expeditions: { where: { status: { in: ['AVAILABLE', 'IN_PROGRESS'] } }, orderBy: { createdAt: 'desc' } }
      }
    });
    if (!player) return res.status(401).json({ error: 'Compte supprimé ou introuvable' });   // jeton encore valide mais compte effacé
    res.json(player);
  } catch (e) {
    sendError(res, e);
  }
});

// GET /api/player/:id - Public profile
router.get('/:id', auth, async (req, res) => {
  try {
    const targetPlayer = await prisma.player.findUnique({
      where: { id: req.params.id },
      include: {
        cities: { select: { id: true, name: true, x: true, y: true, isCapital: true } },
        stats: true,
        alliance: { include: { alliance: { select: { name: true, tag: true } } } },
        hero: { select: { name: true, level: true } }
      }
    });
    if (!targetPlayer) return res.status(404).json({ error: 'Joueur non trouvé' });

    res.json({
      id: targetPlayer.id, name: targetPlayer.name, faction: targetPlayer.faction,
      population: targetPlayer.population, citiesCount: targetPlayer.cities.length,
      cities: targetPlayer.cities,
      alliance: targetPlayer.alliance?.alliance ? {
        name: targetPlayer.alliance.alliance.name, tag: targetPlayer.alliance.alliance.tag, role: targetPlayer.alliance.role
      } : null,
      hero: targetPlayer.hero ? { name: targetPlayer.hero.name, level: targetPlayer.hero.level } : null,
      stats: targetPlayer.stats ? { attacksWon: targetPlayer.stats.attacksWon, defensesWon: targetPlayer.stats.defensesWon } : null,
      createdAt: targetPlayer.createdAt
    });
  } catch (e) {
    sendError(res, e);
  }
});

module.exports = router;
