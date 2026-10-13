const jwt = require('jsonwebtoken');
const config = require('../config');

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

const rateLimit = (maxRequests, keyPrefix = 'api') => (req, res, next) => {
  const key = `${keyPrefix}:${clientKey(req)}`;
  const now = Date.now();

  const record = rateLimitMap.get(key) || { count: 0, resetAt: now + config.rateLimit.windowMs };

  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + config.rateLimit.windowMs;
  }

  record.count++;
  rateLimitMap.set(key, record);

  if (record.count > maxRequests) {
    res.set('Retry-After', String(Math.ceil((record.resetAt - now) / 1000)));
    return res.status(429).json({ error: 'Trop de requêtes, réessayez plus tard' });
  }

  next();
};

module.exports = rateLimit;
