const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const hero = await prisma.hero.findUnique({ where: { playerId: req.user.playerId }, include: { items: true, army: true } });
    res.json(hero);
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
