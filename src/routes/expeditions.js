const express = require('express');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const auth = require('../middleware/auth');
const { lockArmy, transition, isId } = require('../utils/db');

router.get('/', auth, async (req, res) => {
  try {
    const now = new Date();
    const [open, history] = await Promise.all([
      prisma.expedition.findMany({
        where: { playerId: req.user.playerId, OR: [{ status: 'IN_PROGRESS' }, { status: 'AVAILABLE', expiresAt: { gt: now } }] },
        orderBy: { createdAt: 'desc' }
      }),
      prisma.expedition.findMany({ where: { playerId: req.user.playerId, status: { in: ['COMPLETED', 'EXPIRED'] } }, orderBy: { createdAt: 'desc' }, take: 10 })
    ]);
    res.json([...open, ...history]);
  } catch (e) { sendError(res, e); }
});

router.post('/:id/start', auth, async (req, res) => {
  try {
    const armyId = req.body.armyId;
    if (armyId !== undefined && !isId(armyId)) return res.status(400).json({ error: 'Armée invalide' });
    const result = await prisma.$transaction(async (tx) => {
      const expedition = await tx.expedition.findFirst({ where: { id: req.params.id, playerId: req.user.playerId, status: 'AVAILABLE', expiresAt: { gt: new Date() } } });
      if (!expedition) return { error: 'Expedition non trouvee', status: 404 };
      const armyWhere = { ownerId: req.user.playerId, status: 'IDLE', isGarrison: false };
      if (armyId) armyWhere.id = armyId;
      const candidates = await tx.army.findMany({ where: armyWhere, include: { units: true, city: true } });
      // Only an army standing in its city can leave on an expedition
      const army = candidates.find(a => a.units.length > 0 && a.city && a.x === a.city.x && a.y === a.city.y);
      if (!army) return { error: 'Armee requise avec des unites, en ville', status: 400 };
      await lockArmy(tx, army.id);
      const now = new Date();
      const endsAt = new Date(now.getTime() + expedition.duration * 1000);
      // Both transitions are conditional: the same army cannot be sent on two expeditions at once
      if (!(await transition(tx, 'army', army.id, 'IDLE', { status: 'EXPEDITION' }))) return { error: 'Armée déjà en mission', status: 409 };
      if (!(await transition(tx, 'expedition', expedition.id, 'AVAILABLE', { status: 'IN_PROGRESS', startedAt: now, endsAt, armyId: army.id }))) throw new Error('expedition raced');
      return { message: 'Expedition lancee', endsAt, armyId: army.id };
    });
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (e) {
    if (e.message === 'expedition raced') return res.status(409).json({ error: 'Expédition déjà lancée' });
    sendError(res, e);
  }
});

module.exports = router;
