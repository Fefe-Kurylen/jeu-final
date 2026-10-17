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
const auth = require('../middleware/auth');
const { deleteAccount } = require('../services/accountService');

// Known-good hash used when the account does not exist: the response time does not reveal it
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZcbKMYq0PbIcJXKqwyQBSD1uV5S8O2';

const signToken = (account, playerId) => jwt.sign({ id: account.id, playerId, v: account.tokenVersion || 0 }, config.jwtSecret, { expiresIn: config.jwtExpiry });

// Failed logins are counted per e-mail (whatever the IP): after N failures the e-mail is locked for a while.
// The answer is the same whether the account exists or not.
const loginFailures = new Map();   // email -> { count, until }
setInterval(() => { const now = Date.now(); for (const [k, v] of loginFailures) if (v.until < now) loginFailures.delete(k); }, 60000).unref();
function lockedFor(email) {
  const rec = loginFailures.get(email);
  if (!rec || rec.count < config.rateLimit.loginMaxFailures) return 0;
  return Math.max(0, rec.until - Date.now());
}
function recordFailure(email) {
  const now = Date.now();
  const rec = loginFailures.get(email);
  if (!rec || rec.until < now) loginFailures.set(email, { count: 1, until: now + config.rateLimit.loginLockMinutes * 60000 });
  else { rec.count++; rec.until = now + config.rateLimit.loginLockMinutes * 60000; }
}

// POST /api/auth/register
router.post('/register', rateLimit(config.rateLimit.maxRegister, 'register'), async (req, res) => {
  try {
    const { email, password, name, faction } = req.body || {};

    if (!email || !password || !name || !faction) {
      return res.status(400).json({ error: 'Tous les champs sont requis' });
    }
    if (!validateEmail(email)) return res.status(400).json({ error: 'Email invalide' });
    if (!validatePassword(password)) return res.status(400).json({ error: 'Mot de passe: 8-100 caractères requis' });
    if (!validateName(name)) return res.status(400).json({ error: 'Pseudo: 3-20 caractères alphanumériques' });
    if (!validateFaction(faction)) return res.status(400).json({ error: 'Faction invalide' });

    const normalizedEmail = email.toLowerCase();
    const exists = await prisma.account.findUnique({ where: { email: normalizedEmail } });
    if (exists) return res.status(400).json({ error: 'Email deja utilise' });

    // Pseudo unique without regard to case: "Felix" and "felix" are the same person for everyone else
    const nameExists = await prisma.player.findFirst({ where: { name: { equals: name, mode: 'insensitive' } } });
    if (nameExists) return res.status(400).json({ error: 'Pseudo deja pris' });

    const hash = await bcrypt.hash(password, 12);
    const factionKey = faction.toUpperCase();

    // Everything is created atomically; a coordinate collision with a concurrent signup just retries
    let created = null;
    for (let attempt = 0; attempt < 5 && !created; attempt++) {
      const { x, y } = await findFreeSpawn();
      try {
        created = await prisma.$transaction(async (tx) => {
          const account = await tx.account.create({ data: { email: normalizedEmail, passwordHash: hash } });
          const player = await tx.player.create({ data: { accountId: account.id, name, faction: factionKey, gold: 0 } });
          await tx.playerStats.create({ data: { playerId: player.id } });
          const city = await tx.city.create({ data: { playerId: player.id, name: `Capitale de ${name}`, x, y, isCapital: true, wood: 500, stone: 500, iron: 500, food: 500 } });
          await tx.cityBuilding.create({ data: { cityId: city.id, key: 'MAIN_HALL', slot: 0, level: 1 } });
          const hero = await tx.hero.create({ data: { playerId: player.id, name: `Heros de ${name}`, statPoints: 5 } });
          await tx.army.create({ data: { ownerId: player.id, cityId: city.id, heroId: hero.id, name: 'Garnison', x, y, status: 'IDLE', isGarrison: true } });
          for (let i = 0; i < 3; i++) await createExpedition(player.id, tx);
          return { account, player };
        }, { timeout: 20000 });
      } catch (e) {
        const target = String(e.meta?.target || '');
        if (e.code !== 'P2002') throw e;
        if (target.includes('email')) return res.status(400).json({ error: 'Email deja utilise' });
        if (target.includes('name')) return res.status(400).json({ error: 'Pseudo deja pris' });
        if (!target.includes('x')) throw e;
      }
    }
    if (!created) return res.status(503).json({ error: 'Carte saturée, réessayez' });

    const token = signToken(created.account, created.player.id);
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

// A free tile: no city and no resource node on it
async function findFreeSpawn() {
  let pos = randomEdgePosition();
  for (let i = 0; i < 100; i++) {
    const [city, node] = await Promise.all([
      prisma.city.findUnique({ where: { x_y: pos }, select: { id: true } }),
      prisma.resourceNode.findUnique({ where: { x_y: pos }, select: { id: true } })
    ]);
    if (!city && !node) return pos;
    pos = randomEdgePosition();
  }
  return pos;
}

// POST /api/auth/login
router.post('/login', rateLimit(config.rateLimit.maxAuth, 'auth'), async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
    if (!validateEmail(email) || password.length > 100) return res.status(400).json({ error: 'Identifiants invalides' });
    const normalizedEmail = email.toLowerCase();

    const lockMs = lockedFor(normalizedEmail);
    if (lockMs > 0) {
      res.set('Retry-After', String(Math.ceil(lockMs / 1000)));
      return res.status(429).json({ error: 'Trop de tentatives, réessayez plus tard' });
    }

    const account = await prisma.account.findUnique({ where: { email: normalizedEmail }, include: { player: true } });
    // Anti-énumération : temps de réponse constant même si le compte n'existe pas
    const hashToCheck = account?.passwordHash || DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCheck);
    if (!account || !account.player || !valid) {
      recordFailure(normalizedEmail);
      return res.status(401).json({ error: 'Identifiants invalides' });
    }
    loginFailures.delete(normalizedEmail);

    const token = signToken(account, account.player.id);
    res.json({ token, player: { id: account.player.id, name: account.player.name, faction: account.player.faction } });
  } catch (e) {
    sendError(res, e);
  }
});

// POST /api/auth/password { currentPassword, newPassword } — every other session is logged out
router.post('/password', auth, rateLimit(config.rateLimit.maxAuth, 'auth'), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (typeof currentPassword !== 'string' || !validatePassword(newPassword)) return res.status(400).json({ error: 'Nouveau mot de passe: 8-100 caractères requis' });
    const account = await prisma.account.findUnique({ where: { id: req.user.id } });
    if (!account) return res.status(404).json({ error: 'Compte introuvable' });
    if (!(await bcrypt.compare(currentPassword, account.passwordHash))) return res.status(400).json({ error: 'Mot de passe actuel incorrect' });
    const hash = await bcrypt.hash(newPassword, 12);
    const updated = await prisma.account.update({ where: { id: account.id }, data: { passwordHash: hash, tokenVersion: { increment: 1 } } });
    auth.forgetPlayer(req.user.playerId);
    res.json({ message: 'Mot de passe modifié', token: signToken(updated, req.user.playerId) });
  } catch (e) { sendError(res, e); }
});

// DELETE /api/auth/account { password } — suppression définitive du compte depuis l'application (exigence App Store)
router.delete('/account', auth, rateLimit(config.rateLimit.maxAuth, 'auth'), async (req, res) => {
  try {
    const { password } = req.body || {};
    const account = await prisma.account.findUnique({ where: { id: req.user.id } });
    if (!account) return res.status(404).json({ error: 'Compte introuvable' });
    if (typeof password !== 'string' || !(await bcrypt.compare(password, account.passwordHash))) return res.status(400).json({ error: 'Mot de passe incorrect' });
    await deleteAccount(account.id);
    res.status(204).end();
  } catch (e) { sendError(res, e); }
});

module.exports = router;
