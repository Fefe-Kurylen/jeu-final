// ========== GLOBAL ERROR HANDLER ==========
const config = require('../config');

function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.stack || err.message);
  const status = err.status || 500;
  if (config.isProduction) {
    res.status(status).json({ error: status >= 500 ? 'Erreur serveur' : err.message });
  } else {
    res.status(status).json({ error: err.message, stack: err.stack });
  }
}

module.exports = errorHandler;
