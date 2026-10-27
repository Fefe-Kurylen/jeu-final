const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const { cleanText } = require('../utils/validation');
const { itemsData } = require('../config/gamedata');
const EQUIP_SLOTS = new Set(['head', 'chest', 'weapon', 'shield', 'legs', 'boots', 'ring', 'amulet']);

const heroService = require('../services/heroService');
const HE = require('../utils/heroEffects');
const fail = (res, e) => (e.expose ? res.status(e.status).json({ error: e.message }) : sendError(res, e));

router.get('/', auth, async (req, res) => {
  try {
    const hero = await prisma.hero.findUnique({ where: { playerId: req.user.playerId }, include: { items: true, army: true } });
    if (!hero) return res.json(hero);
    const { domusLevel } = await heroService.capitalWithDomus(prisma, req.user.playerId);
    res.json(heroService.heroView(hero, domusLevel));
  } catch (e) { sendError(res, e); }
});

// Talents (décision du 27 octobre 2026) : catalogue, apprendre un rang, réinitialiser ; résurrection au Domus
router.get('/talents', auth, (req, res) => res.json(HE.catalog));
router.post('/talents/learn', auth, async (req, res) => {
  try {
    const key = String(req.body?.key || '');
    if (!HE.TALENTS.has(key)) return res.status(400).json({ error: 'Talent inconnu' });
    res.json(await heroService.learnTalent(req.user.playerId, key));
  } catch (e) { fail(res, e); }
});
router.post('/talents/reset', auth, async (req, res) => {
  try { res.json(await heroService.resetTalents(req.user.playerId)); } catch (e) { fail(res, e); }
});
router.post('/revive', auth, async (req, res) => {
  try { res.json(await heroService.startRevive(req.user.playerId)); } catch (e) { fail(res, e); }
});

// POST /api/hero/create
router.post('/create', auth, async (req, res) => {
  try {
    const name = cleanText(req.body.name, 2, 20);
    if (!name) return res.status(400).json({ error: 'Nom invalide (2-20 caracteres)' });
    const existing = await prisma.hero.findUnique({ where: { playerId: req.user.playerId } });
    if (existing) return res.status(400).json({ error: 'Vous avez deja un heros' });
    const hero = await prisma.hero.create({ data: { playerId: req.user.playerId, name } });
    res.json({ message: 'Heros cree', hero });
  } catch (e) { sendError(res, e); }
});

// POST /api/hero/rename
router.post('/rename', auth, async (req, res) => {
  try {
    const name = cleanText(req.body.name, 2, 20);
    if (!name) return res.status(400).json({ error: 'Nom invalide (2-20 caracteres)' });
    const hero = await prisma.hero.findUnique({ where: { playerId: req.user.playerId } });
    if (!hero) return res.status(404).json({ error: 'Heros non trouve' });
    await prisma.hero.update({ where: { id: hero.id }, data: { name } });
    res.json({ message: 'Heros renomme' });
  } catch (e) { sendError(res, e); }
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
    const catalogSlot = itemsData.find(d => d.key === item.itemKey)?.slot;
    const equipSlot = catalogSlot || (EQUIP_SLOTS.has(slot) ? slot : null) || (EQUIP_SLOTS.has(item.slot) ? item.slot : null);
    if (!equipSlot) return res.status(400).json({ error: 'Cet objet ne s\'équipe pas' });
    // Unequip any item currently in that slot
    const currentlyEquipped = hero.items.find(i => i.slot === equipSlot && i.id !== itemId);
    if (currentlyEquipped) {
      await prisma.heroItem.update({ where: { id: currentlyEquipped.id }, data: { slot: 'inventory' } });
    }
    await prisma.heroItem.update({ where: { id: itemId }, data: { slot: equipSlot } });
    res.json({ message: 'Objet equipe', slot: equipSlot });
  } catch (e) { sendError(res, e); }
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
  } catch (e) { sendError(res, e); }
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
  } catch (e) { sendError(res, e); }
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
    const spent = await prisma.hero.updateMany({
      where: { id: hero.id, statPoints: { gte: total } },
      data: { atkPoints: { increment: atk || 0 }, defPoints: { increment: def || 0 }, spdPoints: { increment: spd || 0 }, logPoints: { increment: log || 0 }, statPoints: { decrement: total } }
    });
    if (spent.count !== 1) return res.status(400).json({ error: 'Pas assez de points' });
    res.json({ message: 'Points assignes' });
  } catch (e) { sendError(res, e); }
});

module.exports = router;
