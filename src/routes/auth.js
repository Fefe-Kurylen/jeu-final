const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const { sendError } = require('../utils/httpError');
const prisma = require('../config/database');
const config = require('../config');
const rateLimit = require('../middleware/rateLimit');
const { validateEmail, validatePassword, validateName, validateFaction } = require('../utils/validation');
const { createExpedition } = require('../services/expeditionService');

// POST /api/auth/register
router.post('/register', rateLimit(config.rateLimit.maxAuth, 'auth'), async (req, res) => {
  try {
    const { email, password, name, faction } = req.body;

    if (!email || !password || !name || !faction) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }
    if (!validateEmail(email)) return res.status(400).json({ error: 'Email invalide' });
    if (!validatePassword(password)) return res.status(400).json({ error: 'Mot de passe: 6-100 caractères requis' });
    if (!validateName(name)) return res.status(400).json({ error: 'Pseudo: 3-20 caractères alphanumériques' });
    if (!validateFaction(faction)) return res.status(400).json({ error: 'Faction invalide' });

    const exists = await prisma.account.findUnique({ where: { email: email.toLowerCase() } });
    if (exists) return res.status(400).json({ error: 'Email deja utilise' });

    const nameExists = await prisma.player.findUnique({ where: { name } });
    if (nameExists) return res.status(400).json({ error: 'Pseudo deja pris' });

    const hash = await bcrypt.hash(password, 12);
    const factionKey = faction.toUpperCase();

    // Everything is created atomically; a coordinate collision with a concurrent signup just retries
    let created = null;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const { x, y } = await findFreeSpawn();
      try {
        created = await prisma.$transaction(async (tx) => {
          const account = await tx.account.create({ data: { email: email.toLowerCase(), passwordHash: hash } });
          const player = await tx.player.create({ data: { accountId: account.id, name, faction: factionKey, gold: 0 } });
          await tx.playerStats.create({ data: { playerId: player.id } });
          const city = await tx.city.create({ data: { playerId: player.id, name: `Capitale de ${name}`, x, y, isCapital: true, wood: 500, stone: 500, iron: 500, food: 500 } });
          const hero = await tx.hero.create({ data: { playerId: player.id, name: `Heros de ${name}`, statPoints: 5 } });
          await tx.army.create({ data: { ownerId: player.id, cityId: city.id, heroId: hero.id, name: 'Garnison', x, y, status: 'IDLE', isGarrison: true } });
          for (let i = 0; i < 3; i++) await createExpedition(player.id, tx);
          return { account, player };
        });
      } catch (e) {
        const target = String(e.meta?.target || '');
        if (e.code !== 'P2002') throw e;
        if (target.includes('email')) return res.status(400).json({ error: 'Email deja utilise' });
        if (target.includes('name')) return res.status(400).json({ error: 'Pseudo deja pris' });
        if (!target.includes('x')) throw e;
      }
    }
    if (!created) return res.status(503).json({ error: 'Carte saturée, réessayez' });

    const token = jwt.sign({ id: created.account.id, playerId: created.player.id }, config.jwtSecret, { expiresIn: config.jwtExpiry });
    res.json({ token, player: { id: created.player.id, name, faction: factionKey } });
  } catch (e) {
    console.error('Register error:', e);
    sendError(res, e);
  }
});

function randomEdgePosition() {
  const { minCoord: MIN, maxCoord: MAX, spawnEdgeDelta: DELTA } = config.map;
  const along = () => MIN + Math.floor(Math.random() * (MAX - MIN + 1));
  switch (Math.floor(Math.random() * 4)) {
    case 0: return { x: along(), y: MAX - Math.floor(Math.random() * DELTA) };
    case 1: return { x: MAX - Math.floor(Math.random() * DELTA), y: along() };
    case 2: return { x: along(), y: MIN + Math.floor(Math.random() * DELTA) };
    default: return { x: MIN + Math.floor(Math.random() * DELTA), y: along() };
  }
}

async function findFreeSpawn() {
  let pos = randomEdgePosition();
  for (let i = 0; i < 100; i++) {
    if (!(await prisma.city.findUnique({ where: { x_y: pos } }))) return pos;
    pos = randomEdgePosition();
  }
  return pos;
}

// POST /api/auth/login
router.post('/login', rateLimit(config.rateLimit.maxAuth, 'auth'), async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

    const account = await prisma.account.findUnique({
      where: { email: email.toLowerCase() },
      include: { player: true }
    });
    // Anti-énumération : temps de réponse constant même si le compte n'existe pas
    const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZcbKMYq0PbIcJXKqwyQBSD1uV5S8O2';
    const hashToCheck = account?.passwordHash || DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCheck);
    if (!account || !account.player || !valid) return res.status(401).json({ error: 'Identifiants invalides' });

    const token = jwt.sign({ id: account.id, playerId: account.player.id }, config.jwtSecret, { expiresIn: config.jwtExpiry });
    res.json({ token, player: { id: account.player.id, name: account.player.name, faction: account.player.faction } });
  } catch (e) {
    sendError(res, e);
  }
});

module.exports = router;
