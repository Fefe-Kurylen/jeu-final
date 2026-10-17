const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../config/database');

// Two kinds of counters:
//  - in-memory (per process): the global API limit, cheap, counted per player or per IP;
//  - shared (one row per key in RateLimitBucket): the sensitive routes (login, sign-up, admin, webhook),
//    so several processes or machines enforce one limit together. One upsert per request.
const rateLimitMap = new Map();

// Cleanup old entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) rateLimitMap.delete(key);
  }
}, 60000).unref();

// Authenticated requests are counted per player: mobile carriers (CGNAT) put hundreds of
// players behind one IP, so an IP-only limit either blocks them or protects nothing.
function clientKey(req) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    try {
      const payload = jwt.verify(header.slice(7), config.jwtSecret, { algorithms: ['HS256'] });
      if (payload?.playerId) return `p:${payload.playerId}`;
    } catch (e) { /* invalid token: fall back to the IP */ }
  }
  return `ip:${req.ip || req.connection?.remoteAddress || 'unknown'}`;
}

// Counts one hit on a shared bucket; returns { count, resetAt }. The window restarts when it is over.
async function hitShared(key, windowMs) {
  const now = new Date();
  const rows = await prisma.$queryRaw`
    INSERT INTO "RateLimitBucket" (key, "windowStart", count) VALUES (${key}, ${now}, 1)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN "RateLimitBucket"."windowStart" < ${new Date(now.getTime() - windowMs)} THEN 1 ELSE "RateLimitBucket".count + 1 END,
      "windowStart" = CASE WHEN "RateLimitBucket"."windowStart" < ${new Date(now.getTime() - windowMs)} THEN ${now} ELSE "RateLimitBucket"."windowStart" END
    RETURNING count, "windowStart"`;
  const row = rows[0];
  return { count: Number(row.count), resetAt: new Date(row.windowStart).getTime() + windowMs };
}

// Reads a shared bucket without counting
async function peekShared(key, windowMs) {
  const rows = await prisma.$queryRaw`SELECT count, "windowStart" FROM "RateLimitBucket" WHERE key = ${key}`;
  if (!rows.length) return { count: 0, resetAt: 0 };
  const start = new Date(rows[0].windowStart).getTime();
  if (Date.now() - start > windowMs) return { count: 0, resetAt: 0 };
  return { count: Number(rows[0].count), resetAt: start + windowMs };
}

async function clearShared(key) {
  await prisma.rateLimitBucket.deleteMany({ where: { key } });
}

// One bucket per (prefix, client): a prefix must not be shared by routes with different ceilings
const SHARED_PREFIXES = new Set(['auth', 'register', 'forgot', 'reset', 'resend', 'verify', 'admin', 'webhook', 'purchases']);

const rateLimit = (maxRequests, keyPrefix = 'api', { shared = SHARED_PREFIXES.has(keyPrefix) } = {}) => async (req, res, next) => {
  const key = `${keyPrefix}:${clientKey(req)}`;
  const now = Date.now();
  const windowMs = config.rateLimit.windowMs;
  let count, resetAt;
  if (shared) {
    try {
      ({ count, resetAt } = await hitShared(key, windowMs));
    } catch (e) {
      // The database is the limiter's store: without it, fall back to this process's own counter
      shared = false;
    }
  }
  if (!shared) {
    const record = rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > record.resetAt) { record.count = 0; record.resetAt = now + windowMs; }
    record.count++;
    rateLimitMap.set(key, record);
    count = record.count; resetAt = record.resetAt;
  }
  if (count > maxRequests) {
    res.set('Retry-After', String(Math.max(1, Math.ceil((resetAt - now) / 1000))));
    return res.status(429).json({ error: 'Trop de requêtes, réessayez plus tard' });
  }
  next();
};

module.exports = rateLimit;
module.exports.hitShared = hitShared;
module.exports.peekShared = peekShared;
module.exports.clearShared = clearShared;
