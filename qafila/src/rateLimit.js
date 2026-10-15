// Limiteur par IP, fenêtre glissante d'une minute. L'IP n'est jamais journalisée.
export function rateLimit({ perMinute = 60 } = {}) {
  const hits = new Map();
  setInterval(() => {
    const cutoff = Date.now() - 60_000;
    for (const [ip, arr] of hits) {
      const kept = arr.filter(t => t > cutoff);
      if (kept.length) hits.set(ip, kept); else hits.delete(ip);
    }
  }, 30_000).unref();

  return (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    const arr = (hits.get(ip) || []).filter(t => t > now - 60_000);
    arr.push(now);
    hits.set(ip, arr);
    if (arr.length > perMinute) {
      res.set('Retry-After', '60');
      return res.status(429).json({ error: 'Trop de requêtes, réessayez dans une minute.' });
    }
    next();
  };
}
