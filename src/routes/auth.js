const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const router = express.Router();
const prisma = require('../config/database');
const config = require('../config');
const rateLimit = require('../middleware/rateLimit');
const { validateEmail, validatePassword, validateName, validateFaction } = require('../utils/validation');

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

    const hash = await bcrypt.hash(password, 10);
    const account = await prisma.account.create({ data: { email: email.toLowerCase(), passwordHash: hash } });

    const player = await prisma.player.create({
      data: { accountId: account.id, name, faction: faction.toUpperCase(), gold: 0 }
    });

    await prisma.playerStats.create({ data: { playerId: player.id } });

    // Spawn on map edges
    const MIN_COORD = config.map.minCoord;
    const MAX_COORD = config.map.maxCoord;
    const SPAWN_DELTA = config.map.spawnEdgeDelta;

    function getRandomEdgePosition() {
      const side = Math.floor(Math.random() * 4);
      let x, y;
      switch(side) {
        case 0: x = MIN_COORD + Math.floor(Math.random() * (MAX_COORD - MIN_COORD + 1)); y = MAX_COORD - Math.floor(Math.random() * SPAWN_DELTA); break;
        case 1: x = MAX_COORD - Math.floor(Math.random() * SPAWN_DELTA); y = MIN_COORD + Math.floor(Math.random() * (MAX_COORD - MIN_COORD + 1)); break;
        case 2: x = MIN_COORD + Math.floor(Math.random() * (MAX_COORD - MIN_COORD + 1)); y = MIN_COORD + Math.floor(Math.random() * SPAWN_DELTA); break;
        case 3: x = MIN_COORD + Math.floor(Math.random() * SPAWN_DELTA); y = MIN_COORD + Math.floor(Math.random() * (MAX_COORD - MIN_COORD + 1)); break;
      }
      return { x, y };
    }

    let { x, y } = getRandomEdgePosition();
    for (let i = 0; i < 100; i++) {
      const posExists = await prisma.city.findUnique({ where: { x_y: { x, y } } });
      if (!posExists) break;
      ({ x, y } = getRandomEdgePosition());
    }

    const city = await prisma.city.create({
      data: { playerId: player.id, name: `Capitale de ${name}`, x, y, isCapital: true, wood: 500, stone: 500, iron: 500, food: 500 }
    });

    const hero = await prisma.hero.create({
      data: { playerId: player.id, name: `Heros de ${name}`, statPoints: 5 }
    });

    await prisma.army.create({
      data: { ownerId: player.id, cityId: city.id, heroId: hero.id, name: 'Garnison', x, y, status: 'IDLE', isGarrison: true }
    });

    // Create starter expeditions
    const { createExpedition } = require('../services/expeditionService');
    for (let i = 0; i < 3; i++) {
      await createExpedition(player.id);
    }

    const token = jwt.sign({ id: account.id, playerId: player.id }, config.jwtSecret, { expiresIn: config.jwtExpiry });
    res.json({ token, player: { id: player.id, name, faction } });
  } catch (e) {
    console.error('Register error:', e);
    res.status(500).json({ error: config.isProduction ? 'Erreur serveur' : e.message });
  }
});

// POST /api/auth/login
router.post('/login', rateLimit(config.rateLimit.maxAuth, 'auth'), async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });

    const account = await prisma.account.findUnique({
      where: { email: email.toLowerCase() },
      include: { player: true }
    });
    if (!account || !account.player) return res.status(401).json({ error: 'Identifiants invalides' });

    const valid = await bcrypt.compare(password, account.passwordHash);
    if (!valid) return res.status(401).json({ error: 'Identifiants invalides' });

    const token = jwt.sign({ id: account.id, playerId: account.player.id }, config.jwtSecret, { expiresIn: config.jwtExpiry });
    res.json({ token, player: { id: account.player.id, name: account.player.name, faction: account.player.faction } });
  } catch (e) {
    res.status(500).json({ error: config.isProduction ? 'Erreur serveur' : e.message });
  }
});

module.exports = router;
