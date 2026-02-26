const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const { sanitizeString } = require('../utils/validation');

router.get('/', auth, async (req, res) => {
  try {
    const hero = await prisma.hero.findUnique({ where: { playerId: req.user.playerId }, include: { items: true, army: true } });
    res.json(hero);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/hero/create
router.post('/create', auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.length < 2 || name.length > 20) return res.status(400).json({ error: 'Nom invalide (2-20 caracteres)' });
    const existing = await prisma.hero.findUnique({ where: { playerId: req.user.playerId } });
    if (existing) return res.status(400).json({ error: 'Vous avez deja un heros' });
    const hero = await prisma.hero.create({ data: { playerId: req.user.playerId, name: sanitizeString(name) } });
    res.json({ message: 'Heros cree', hero });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/hero/rename
router.post('/rename', auth, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || typeof name !== 'string' || name.length < 2 || name.length > 20) return res.status(400).json({ error: 'Nom invalide (2-20 caracteres)' });
    const hero = await prisma.hero.findUnique({ where: { playerId: req.user.playerId } });
    if (!hero) return res.status(404).json({ error: 'Heros non trouve' });
    await prisma.hero.update({ where: { id: hero.id }, data: { name: sanitizeString(name) } });
    res.json({ message: 'Heros renomme' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/hero/equip
router.post('/equip', auth, async (req, res) => {
  try {
    const { itemId, slot } = req.body;
    if (!itemId) return res.status(400).json({ error: 'itemId requis' });
    const hero = await prisma.hero.findUnique({ where: { playerId: req.user.playerId }, include: { items: true } });
    if (!hero) return res.status(404).json({ error: 'Heros non trouve' });
    const item = hero.items.find(i => i.id === itemId);
    if (!item) return res.status(404).json({ error: 'Objet non trouve' });
    const equipSlot = slot || item.slot || 'main';
    // Unequip any item currently in that slot
    const currentlyEquipped = hero.items.find(i => i.slot === equipSlot && i.id !== itemId);
    if (currentlyEquipped) {
      await prisma.heroItem.update({ where: { id: currentlyEquipped.id }, data: { slot: 'inventory' } });
    }
    await prisma.heroItem.update({ where: { id: itemId }, data: { slot: equipSlot } });
    res.json({ message: 'Objet equipe', slot: equipSlot });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/hero/unequip
router.post('/unequip', auth, async (req, res) => {
  try {
    const { itemId } = req.body;
    if (!itemId) return res.status(400).json({ error: 'itemId requis' });
    const hero = await prisma.hero.findUnique({ where: { playerId: req.user.playerId }, include: { items: true } });
    if (!hero) return res.status(404).json({ error: 'Heros non trouve' });
    const item = hero.items.find(i => i.id === itemId);
    if (!item) return res.status(404).json({ error: 'Objet non trouve' });
    await prisma.heroItem.update({ where: { id: itemId }, data: { slot: 'inventory' } });
    res.json({ message: 'Objet desequipe' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// POST /api/hero/drop-item
router.post('/drop-item', auth, async (req, res) => {
  try {
    const { itemId } = req.body;
    if (!itemId) return res.status(400).json({ error: 'itemId requis' });
    const hero = await prisma.hero.findUnique({ where: { playerId: req.user.playerId }, include: { items: true } });
    if (!hero) return res.status(404).json({ error: 'Heros non trouve' });
    const item = hero.items.find(i => i.id === itemId);
    if (!item) return res.status(404).json({ error: 'Objet non trouve' });
    await prisma.heroItem.delete({ where: { id: itemId } });
    res.json({ message: 'Objet jete' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/assign-points', auth, async (req, res) => {
  try {
    const { atk, def, spd, log } = req.body;
    const hero = await prisma.hero.findUnique({ where: { playerId: req.user.playerId } });
    if (!hero) return res.status(404).json({ error: 'Heros non trouve' });
    const vals = [atk, def, spd, log];
    if (vals.some(v => v !== undefined && v !== null && (typeof v !== 'number' || v < 0 || !Number.isInteger(v)))) {
      return res.status(400).json({ error: 'Valeurs invalides' });
    }
    const total = (atk || 0) + (def || 0) + (spd || 0) + (log || 0);
    if (total <= 0 || total > hero.statPoints) return res.status(400).json({ error: 'Pas assez de points' });
    await prisma.hero.update({
      where: { id: hero.id },
      data: { atkPoints: hero.atkPoints + (atk || 0), defPoints: hero.defPoints + (def || 0), spdPoints: hero.spdPoints + (spd || 0), logPoints: hero.logPoints + (log || 0), statPoints: hero.statPoints - total }
    });
    res.json({ message: 'Points assignes' });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
