// ========== GLOBAL ERROR HANDLER ==========
const config = require('../config');

function errorHandler(err, req, res, next) {
  // Malformed JSON body or body over the size limit: client error, not a server failure
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'JSON invalide' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'Requête trop volumineuse' });

  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  if (config.isProduction) {
    res.status(500).json({ error: 'Erreur serveur' });
  } else {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
}

module.exports = errorHandler;
