// Comme auth, mais laisse passer les requêtes sans jeton (req.user absent) : analytics avant connexion
const jwt = require('jsonwebtoken');
const config = require('../config');

module.exports = function optionalAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token) {
    try { req.user = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] }); } catch (e) { /* jeton invalide : anonyme */ }
  }
  next();
};
