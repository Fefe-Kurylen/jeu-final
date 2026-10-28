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
const { consume, sendVerificationMail, sendResetMail } = require('../services/authTokens');
const { noteCityCells } = require('../utils/pathfinding');
const { findFreeSpawn, lockPlacement, gatherArmiesOnBlock } = require('../utils/spawn');
const path = require('path');
const fs = require('fs');

// Known-good hash used when the account does not exist: the response time does not reveal it
const DUMMY_HASH = '$2a$12$C6UzMDM.H6dfI/f/IKcEeO7ZcbKMYq0PbIcJXKqwyQBSD1uV5S8O2';

const signToken = (account, playerId) => jwt.sign({ id: account.id, playerId, v: account.tokenVersion || 0 }, config.jwtSecret, { expiresIn: config.jwtExpiry });

// Failed logins are counted per e-mail (whatever the IP, shared by every process): after N failures the
// e-mail is locked for a while. The answer is the same whether the account exists or not.
const LOCK_WINDOW_MS = config.rateLimit.loginLockMinutes * 60000;
const lockKey = (email) => `lock:${email}`;
async function lockedFor(email) {
  try {
    const { count, resetAt } = await rateLimit.peekShared(lockKey(email), LOCK_WINDOW_MS);
    return count >= config.rateLimit.loginMaxFailures ? Math.max(0, resetAt - Date.now()) : 0;
  } catch (e) { return 0; }
}
async function recordFailure(email) {
  try { await rateLimit.hitShared(lockKey(email), LOCK_WINDOW_MS); } catch (e) { /* limiter store unavailable */ }
}
async function clearFailures(email) {
  try { await rateLimit.clearShared(lockKey(email)); } catch (e) { /* idem */ }
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
    // cycle du serveur (décision du 28 octobre 2026) : inscriptions ouvertes 60 jours, 5 000 joueurs, monde pas terminé
    { const closed = await require('../services/wonderService').registrationBlocked(); if (closed) return res.status(403).json({ error: closed, registrationClosed: true }); }

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
      try {
        created = await prisma.$transaction(async (tx) => {
          await lockPlacement(tx);   // the place is chosen and taken under one lock (no overlapping 2 × 2 blocks)
          const account = await tx.account.create({ data: { email: normalizedEmail, passwordHash: hash } });
          const player = await tx.player.create({ data: { accountId: account.id, name, faction: factionKey, gold: 0 } });
          const city = await require('../services/startService').createStart(tx, { playerId: player.id, name });
          return { account, player, city };
        }, { timeout: 20000 });
      } catch (e) {
        if (e.status === 503) return res.status(503).json({ error: 'Carte saturée, réessayez plus tard' });   // findFreeSpawn: plus de place libre près du bord
        const target = String(e.meta?.target || '');
        if (e.code !== 'P2002') throw e;
        if (target.includes('email')) return res.status(400).json({ error: 'Email deja utilise' });
        if (target.includes('name')) return res.status(400).json({ error: 'Pseudo deja pris' });
        if (!target.includes('x')) throw e;
      }
    }
    if (!created) return res.status(503).json({ error: 'Carte saturée, réessayez' });
    if (created.city) noteCityCells(created.city.x, created.city.y);

    // The verification link leaves in the background: a mail outage never blocks a sign-up
    sendVerificationMail(created.account, name).catch(e => console.error('[MAIL] verification:', e.message));

    const token = signToken(created.account, created.player.id);
    res.json({ token, player: { id: created.player.id, name, faction: factionKey }, emailVerificationRequired: config.email.enforce });
  } catch (e) {
    console.error('Register error:', e);
    sendError(res, e);
  }
});

// POST /api/auth/login
router.post('/login', rateLimit(config.rateLimit.maxAuth, 'auth'), async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) return res.status(400).json({ error: 'Email et mot de passe requis' });
    if (!validateEmail(email) || password.length > 100) return res.status(400).json({ error: 'Identifiants invalides' });
    const normalizedEmail = email.toLowerCase();

    const lockMs = await lockedFor(normalizedEmail);
    if (lockMs > 0) {
      res.set('Retry-After', String(Math.ceil(lockMs / 1000)));
      return res.status(429).json({ error: 'Trop de tentatives, réessayez plus tard' });
    }

    const account = await prisma.account.findUnique({ where: { email: normalizedEmail }, include: { player: true } });
    // Anti-énumération : temps de réponse constant même si le compte n'existe pas
    const hashToCheck = account?.passwordHash || DUMMY_HASH;
    const valid = await bcrypt.compare(password, hashToCheck);
    if (!account || !account.player || !valid) {
      await recordFailure(normalizedEmail);
      return res.status(401).json({ error: 'Identifiants invalides' });
    }
    await clearFailures(normalizedEmail);

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

// POST /api/auth/verify-email/resend — a new verification link for the connected account
router.post('/verify-email/resend', auth, rateLimit(5, 'resend'), async (req, res) => {
  try {
    const account = await prisma.account.findUnique({ where: { id: req.user.id }, include: { player: { select: { name: true } } } });
    if (!account) return res.status(404).json({ error: 'Compte introuvable' });
    if (account.emailVerifiedAt) return res.json({ message: 'Adresse déjà confirmée', verified: true });
    await sendVerificationMail(account, account.player?.name || '');
    res.json({ message: 'E-mail de confirmation envoyé', verified: false });
  } catch (e) { sendError(res, e); }
});

// GET /api/auth/verify-email?token=… — the link from the e-mail; answers with a small HTML page
const resultPage = (title, message) => fs.readFileSync(path.join(__dirname, '..', 'public', 'verify-result.html'), 'utf8').replace('{{TITLE}}', title).replace('{{MESSAGE}}', message);
router.get('/verify-email', rateLimit(30, 'verify'), async (req, res) => {
  try {
    const accountId = await consume(String(req.query.token || ''), 'VERIFY_EMAIL');
    if (!accountId) return res.status(400).type('html').send(resultPage('Lien invalide ou expiré', 'Demandez un nouvel e-mail de confirmation depuis les paramètres du jeu.'));
    await prisma.account.updateMany({ where: { id: accountId, emailVerifiedAt: null }, data: { emailVerifiedAt: new Date() } });
    res.type('html').send(resultPage('Adresse confirmée', 'Merci ! Votre adresse e-mail est confirmée.'));
  } catch (e) { sendError(res, e); }
});

// POST /api/auth/forgot-password { email } — always 200: the answer never says whether the account exists
router.post('/forgot-password', rateLimit(5, 'forgot'), async (req, res) => {
  try {
    const { email } = req.body || {};
    if (typeof email !== 'string' || !validateEmail(email)) return res.status(400).json({ error: 'Email invalide' });
    const account = await prisma.account.findUnique({ where: { email: email.toLowerCase() } });
    if (account) sendResetMail(account).catch(e => console.error('[MAIL] reset:', e.message));
    res.json({ message: 'Si un compte existe pour cette adresse, un e-mail vient de partir' });
  } catch (e) { sendError(res, e); }
});

// POST /api/auth/reset-password { token, newPassword } — from the public page; every session is logged out
router.post('/reset-password', rateLimit(10, 'reset'), async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!validatePassword(newPassword)) return res.status(400).json({ error: 'Mot de passe: 8-100 caractères requis' });
    const accountId = await consume(token, 'RESET_PASSWORD');
    if (!accountId) return res.status(400).json({ error: 'Lien invalide ou expiré' });
    const hash = await bcrypt.hash(newPassword, 12);
    // Receiving the link proves the mailbox: the address counts as verified
    const account = await prisma.account.update({ where: { id: accountId }, data: { passwordHash: hash, tokenVersion: { increment: 1 }, emailVerifiedAt: new Date() }, include: { player: { select: { id: true } } } });
    if (account.player) auth.forgetPlayer(account.player.id);
    await clearFailures(account.email);
    res.json({ message: 'Mot de passe modifié' });
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
