const config = require('../config');

const validateEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
};

const validatePassword = (password) => {
  if (!password || typeof password !== 'string') return false;
  return password.length >= 6 && password.length <= 100;
};

const validateName = (name) => {
  if (!name || typeof name !== 'string') return false;
  const nameRegex = /^[a-zA-Z0-9_-]+$/;
  return nameRegex.test(name) && name.length >= 3 && name.length <= 20;
};

const validateFaction = (faction) => {
  return config.validFactions.includes(faction?.toUpperCase());
};

const validateCoordinates = (x, y) => {
  return Number.isInteger(x) && Number.isInteger(y) &&
         x >= config.map.minCoord && x <= config.map.maxCoord &&
         y >= config.map.minCoord && y <= config.map.maxCoord;
};

module.exports = {
  validateEmail,
  validatePassword,
  validateName,
  validateFaction,
  validateCoordinates
};
