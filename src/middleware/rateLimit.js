const config = require('../config');

const rateLimitMap = new Map();
const MAX_ENTRIES = 50000;

// Cleanup old entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) rateLimitMap.delete(key);
  }
  // Safety: prevent unbounded memory growth
  if (rateLimitMap.size > MAX_ENTRIES) {
    console.warn(`[RATE LIMIT] Map size ${rateLimitMap.size} exceeds ${MAX_ENTRIES}, clearing expired`);
    rateLimitMap.clear();
  }
}, 60000);

const rateLimit = (maxRequests, keyPrefix = 'api') => (req, res, next) => {
  const ip = req.ip;
  if (!ip) return next();
  const key = `${keyPrefix}:${ip}`;
  const now = Date.now();

  const record = rateLimitMap.get(key) || { count: 0, resetAt: now + config.rateLimit.windowMs };

  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + config.rateLimit.windowMs;
  }

  record.count++;
  rateLimitMap.set(key, record);

  // Set rate limit headers
  res.set('X-RateLimit-Limit', String(maxRequests));
  res.set('X-RateLimit-Remaining', String(Math.max(0, maxRequests - record.count)));
  res.set('X-RateLimit-Reset', String(Math.ceil(record.resetAt / 1000)));

  if (record.count > maxRequests) {
    return res.status(429).json({ error: 'Trop de requêtes, réessayez plus tard' });
  }

  next();
};

module.exports = rateLimit;
