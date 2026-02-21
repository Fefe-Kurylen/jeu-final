const config = require('../config');

const cacheControl = (duration) => (req, res, next) => {
  if (config.isProduction && duration > 0) {
    res.set('Cache-Control', `public, max-age=${duration}`);
  } else {
    res.set('Cache-Control', 'no-store');
  }
  next();
};

module.exports = cacheControl;
