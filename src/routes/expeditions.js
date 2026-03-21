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
    const result = await prisma.$transaction(async (tx) => {
      const expedition = await tx.expedition.findFirst({ where: { id: req.params.id, playerId: req.user.playerId, status: 'AVAILABLE' } });
      if (!expedition) return { error: 'Expedition non trouvee', status: 404 };
      // Allow specifying which army to send, otherwise pick first idle
      const armyWhere = { ownerId: req.user.playerId, status: 'IDLE', isGarrison: false };
      if (req.body.armyId) armyWhere.id = req.body.armyId;
      const army = await tx.army.findFirst({ where: armyWhere, include: { units: true } });
      if (!army || !army.units || army.units.length === 0) return { error: 'Armee requise avec des unites', status: 400 };
      const now = new Date();
      const endsAt = new Date(now.getTime() + (expedition.duration || 1800) * 1000);
      await tx.expedition.update({ where: { id: expedition.id }, data: { status: 'IN_PROGRESS', startedAt: now, endsAt, armyId: army.id } });
      await tx.army.update({ where: { id: army.id }, data: { status: 'EXPEDITION' } });
      return { message: 'Expedition lancee', endsAt };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

module.exports = router;
