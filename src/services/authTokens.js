// ========== ONE-TIME TOKENS (e-mail verification, password reset) ==========
// The clear token travels in the e-mail link; only its SHA-256 is stored. A token is single use.
const crypto = require('crypto');
const prisma = require('../config/database');
const config = require('../config');
const { sendMail } = require('./mailService');

const TTL = { VERIFY_EMAIL: 24 * 3600 * 1000, RESET_PASSWORD: 60 * 60 * 1000 };
const hash = (t) => crypto.createHash('sha256').update(t).digest('hex');

async function issue(accountId, type) {
  const token = crypto.randomBytes(32).toString('hex');
  // A fresh token replaces the previous ones of the same kind
  await prisma.authToken.deleteMany({ where: { accountId, type, usedAt: null } });
  await prisma.authToken.create({ data: { accountId, type, tokenHash: hash(token), expiresAt: new Date(Date.now() + TTL[type]) } });
  return token;
}

// Returns the accountId when the token is valid, marks it used; null otherwise
async function consume(token, type) {
  if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) return null;
  const row = await prisma.authToken.findUnique({ where: { tokenHash: hash(token) } });
  if (!row || row.type !== type || row.usedAt || row.expiresAt < new Date()) return null;
  const used = await prisma.authToken.updateMany({ where: { id: row.id, usedAt: null }, data: { usedAt: new Date() } });
  return used.count === 1 ? row.accountId : null;
}

const link = (path) => `${config.email.publicUrl.replace(/\/$/, '')}${path}`;

async function sendVerificationMail(account, playerName) {
  const token = await issue(account.id, 'VERIFY_EMAIL');
  const url = link(`/api/auth/verify-email?token=${token}`);
  await sendMail({
    to: account.email,
    subject: 'Imperium Antiquitas : confirmez votre adresse',
    text: `Bienvenue ${playerName} !\n\nConfirmez votre adresse e-mail en ouvrant ce lien (valable 24 h) :\n${url}\n\nSi vous n'avez pas créé de compte, ignorez ce message.`,
    html: `<p>Bienvenue ${playerName} !</p><p>Confirmez votre adresse e-mail en ouvrant ce lien (valable 24 h) :<br><a href="${url}">${url}</a></p><p>Si vous n'avez pas créé de compte, ignorez ce message.</p>`
  });
  return url;
}

async function sendResetMail(account) {
  const token = await issue(account.id, 'RESET_PASSWORD');
  const url = link(`/reset-password?token=${token}`);
  await sendMail({
    to: account.email,
    subject: 'Imperium Antiquitas : réinitialisation du mot de passe',
    text: `Pour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 h) :\n${url}\n\nSi vous n'avez rien demandé, ignorez ce message : votre mot de passe reste inchangé.`,
    html: `<p>Pour choisir un nouveau mot de passe, ouvrez ce lien (valable 1 h) :<br><a href="${url}">${url}</a></p><p>Si vous n'avez rien demandé, ignorez ce message : votre mot de passe reste inchangé.</p>`
  });
  return url;
}

module.exports = { issue, consume, sendVerificationMail, sendResetMail };
