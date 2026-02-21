const express = require('express');
const router = express.Router();
const prisma = require('../config/database');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const expeditions = await prisma.expedition.findMany({ where: { playerId: req.user.playerId, status: { in: ['AVAILABLE', 'IN_PROGRESS'] } }, orderBy: { createdAt: 'desc' } });
    res.json(expeditions);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

router.post('/:id/start', auth, async (req, res) => {
  try {
    const expedition = await prisma.expedition.findFirst({ where: { id: req.params.id, playerId: req.user.playerId, status: 'AVAILABLE' } });
    if (!expedition) return res.status(404).json({ error: 'Expedition non trouvee' });
    // Allow specifying which army to send, otherwise pick first idle
    const armyWhere = { ownerId: req.user.playerId, status: 'IDLE', isGarrison: false };
    if (req.body.armyId) armyWhere.id = req.body.armyId;
    const army = await prisma.army.findFirst({ where: armyWhere, include: { units: true } });
    if (!army || !army.units || army.units.length === 0) return res.status(400).json({ error: 'Armee requise avec des unites' });
    const now = new Date();
    const endsAt = new Date(now.getTime() + expedition.duration * 1000);
    await prisma.expedition.update({ where: { id: expedition.id }, data: { status: 'IN_PROGRESS', startedAt: now, endsAt, armyId: army.id } });
    await prisma.army.update({ where: { id: army.id }, data: { status: 'EXPEDITION' } });
    res.json({ message: 'Expedition lancee', endsAt });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
