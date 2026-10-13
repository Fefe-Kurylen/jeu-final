// ========== GLOBAL ERROR HANDLER ==========
const config = require('../config');

function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  if (config.isProduction) {
    res.status(500).json({ error: 'Erreur serveur' });
  } else {
    res.status(500).json({ error: err.message, stack: err.stack });
  }
}

module.exports = errorHandler;
