const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const expeditions = await prisma.expedition.findMany({
      where: { playerId: req.user.playerId, OR: [{ status: 'IN_PROGRESS' }, { status: 'AVAILABLE', expiresAt: { gt: new Date() } }] },
      orderBy: { createdAt: 'desc' }
    });
    res.json(expeditions);
  } catch (e) { sendError(res, e); }
});

router.post('/:id/start', auth, async (req, res) => {
  try {
    const expedition = await prisma.expedition.findFirst({ where: { id: req.params.id, playerId: req.user.playerId, status: 'AVAILABLE', expiresAt: { gt: new Date() } } });
    if (!expedition) return res.status(404).json({ error: 'Expedition non trouvee' });
    const armyWhere = { ownerId: req.user.playerId, status: 'IDLE', isGarrison: false };
    if (req.body.armyId) armyWhere.id = req.body.armyId;
    const candidates = await prisma.army.findMany({ where: armyWhere, include: { units: true, city: true } });
    // Only an army standing in its city can leave on an expedition
    const army = candidates.find(a => a.units.length > 0 && a.city && a.x === a.city.x && a.y === a.city.y);
    if (!army) return res.status(400).json({ error: 'Armee requise avec des unites, en ville' });
    const now = new Date();
    const endsAt = new Date(now.getTime() + expedition.duration * 1000);
    await prisma.$transaction([
      prisma.expedition.update({ where: { id: expedition.id }, data: { status: 'IN_PROGRESS', startedAt: now, endsAt, armyId: army.id } }),
      prisma.army.update({ where: { id: army.id }, data: { status: 'EXPEDITION' } })
    ]);
    res.json({ message: 'Expedition lancee', endsAt });
  } catch (e) { sendError(res, e); }
});

module.exports = router;
