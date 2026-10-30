// ========== HTTP ERROR HELPER ==========
// Centralise la gestion des erreurs 500 :
// - log complet côté serveur
// - message générique côté client en production (pas de fuite de stack/SQL/Prisma)
const config = require('../config');

function sendError(res, e, context = '') {
  console.error(`[ERROR]${context ? ' ' + context : ''}:`, e);
  res.status(500).json({ error: config.isProduction ? 'Erreur serveur' : e.message });
}

// Erreur métier à montrer au joueur telle quelle (lancée par les services, rendue par sendFail)
const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

// Erreur d'une route : message métier (httpError) avec son statut, absence de chemin (NO_ROUTE) en 400 si `noRoute`,
// sinon 500 générique
function sendFail(res, e, { noRoute = false, context = '' } = {}) {
  if (e && e.expose && e.status) return res.status(e.status).json({ error: e.message });
  if (noRoute && e && e.code === 'NO_ROUTE') return res.status(400).json({ error: e.message });
  return sendError(res, e, context);
}

module.exports = { sendError, sendFail, httpError };
