// ========== HTTP ERROR HELPER ==========
// Centralise la gestion des erreurs 500 :
// - log complet côté serveur
// - message générique côté client en production (pas de fuite de stack/SQL/Prisma)
const config = require('../config');

function sendError(res, e, context = '') {
  console.error(`[ERROR]${context ? ' ' + context : ''}:`, e);
  res.status(500).json({ error: config.isProduction ? 'Erreur serveur' : e.message });
}

module.exports = { sendError };
