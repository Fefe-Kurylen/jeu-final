const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../config/database');

// A valid signature is not enough: the player must still exist (account deleted while the token is
// still valid) and the token must not predate a password change (Account.tokenVersion). Both facts are
// cached per player for a short time, so this costs one query per player per minute.
const KNOWN_TTL_MS = 60 * 1000;
const SEEN_WRITE_MS = 10 * 60 * 1000;
const known = new Map();      // playerId -> { until, tokenVersion }
const seenWritten = new Map(); // playerId -> last lastSeenAt write
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of known) if (v.until < now) known.delete(k);
  for (const [k, t] of seenWritten) if (now - t > SEEN_WRITE_MS) seenWritten.delete(k);
}, KNOWN_TTL_MS).unref();

async function playerState(playerId) {
  const now = Date.now();
  const cached = known.get(playerId);
  if (cached && cached.until > now) return cached;
  const row = await prisma.player.findUnique({ where: { id: playerId }, select: { id: true, account: { select: { tokenVersion: true, bannedAt: true, banReason: true, suspendedUntil: true, suspendReason: true } } } });
  if (!row) return null;
  // suspension ou bannissement (administration, décision du 29 octobre 2026) : plus de requête acceptée
  const state = { until: now + KNOWN_TTL_MS, tokenVersion: row.account?.tokenVersion || 0, sanction: require('../services/adminService').activeSanction(row.account) };
  known.set(playerId, state);
  // Activity marker (expeditions, rankings…), written at most every 10 minutes per player
  if ((seenWritten.get(playerId) || 0) < now - SEEN_WRITE_MS) {
    seenWritten.set(playerId, now);
    prisma.player.update({ where: { id: playerId }, data: { lastSeenAt: new Date() } }).catch(() => {});
  }
  return state;
}

// Forgets a player immediately (account deletion, password change): the next request re-checks the DB
function forgetPlayer(playerId) { known.delete(playerId); }

function bearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

// Verifies a bearer token end to end; returns the payload or null (never throws)
async function verifyBearer(req) {
  const token = bearerToken(req);
  if (!token) return null;
  let payload = req._jwt;   // déjà vérifié par le limiteur de débit (même jeton), null s'il était invalide
  if (payload === undefined) { try { payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }); } catch (e) { return null; } }
  if (typeof payload?.playerId !== 'string' || typeof payload?.id !== 'string') return null;
  const state = await playerState(payload.playerId);
  if (!state) return null;
  // la sanction d'abord : elle change aussi tokenVersion (déconnexion), le joueur doit pourtant en lire le motif
  if (state.sanction && (!state.sanction.until || new Date(state.sanction.until) > new Date())) return { sanctioned: state.sanction };
  if ((payload.v || 0) !== state.tokenVersion) return null;
  return payload;
}

const auth = async (req, res, next) => {
  if (!bearerToken(req)) return res.status(401).json({ error: 'No token' });
  let payload;
  try {
    payload = await verifyBearer(req);
  } catch (e) {
    return res.status(503).json({ error: 'Service momentanément indisponible' });
  }
  if (!payload) return res.status(401).json({ error: 'Invalid token' });
  if (payload.sanctioned) return res.status(401).json({ error: require('../services/adminService').sanctionMessage(payload.sanctioned), sanction: payload.sanctioned });
  req.user = payload;
  next();
};

module.exports = auth;
module.exports.forgetPlayer = forgetPlayer;
module.exports.verifyBearer = verifyBearer;
