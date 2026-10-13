const config = require('../config');

const rateLimitMap = new Map();

// Cleanup old entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) rateLimitMap.delete(key);
  }
}, 60000);

const rateLimit = (maxRequests, keyPrefix = 'api') => (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress;
  const key = `${keyPrefix}:${ip}`;
  const now = Date.now();

  const record = rateLimitMap.get(key) || { count: 0, resetAt: now + config.rateLimit.windowMs };

  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + config.rateLimit.windowMs;
  }

  record.count++;
  rateLimitMap.set(key, record);

  if (record.count > maxRequests) {
    return res.status(429).json({ error: 'Trop de requêtes, réessayez plus tard' });
  }

  next();
};

module.exports = rateLimit;
