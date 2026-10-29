// Comme auth, mais laisse passer les requêtes sans jeton valide (req.user absent) : analytics avant connexion.
// Un jeton d'un compte supprimé ou révoqué compte comme anonyme.
const { verifyBearer } = require('./auth');

module.exports = async function optionalAuth(req, res, next) {
  try {
    const payload = await verifyBearer(req);
    if (payload && !payload.sanctioned) req.user = payload;   // compte suspendu ou banni : anonyme
  } catch (e) { /* base indisponible : anonyme */ }
  next();
};
