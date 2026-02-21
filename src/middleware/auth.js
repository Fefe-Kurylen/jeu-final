const jwt = require('jsonwebtoken');
const config = require('../config');

const auth = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    next();
  } catch (e) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = auth;
