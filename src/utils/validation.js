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

// Validate a string is safe text (no HTML injection, reasonable length)
const validateString = (str, minLen = 1, maxLen = 100) => {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  return trimmed.length >= minLen && trimmed.length <= maxLen;
};

// Sanitize a string (strip HTML tags)
const sanitizeString = (str) => {
  if (!str || typeof str !== 'string') return '';
  return str.replace(/<[^>]*>/g, '').trim();
};

// Validate a positive integer
const validatePositiveInt = (val) => {
  return Number.isInteger(val) && val > 0;
};

// Validate alliance tag (2-5 uppercase alphanumeric)
const validateAllianceTag = (tag) => {
  if (!tag || typeof tag !== 'string') return false;
  const tagRegex = /^[A-Z0-9]{2,5}$/;
  return tagRegex.test(tag.toUpperCase());
};

// Validate alliance name (3-30 chars, alphanumeric + spaces)
const validateAllianceName = (name) => {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();
  return trimmed.length >= 3 && trimmed.length <= 30;
};

module.exports = {
  validateEmail,
  validatePassword,
  validateName,
  validateFaction,
  validateCoordinates,
  validateString,
  sanitizeString,
  validatePositiveInt,
  validateAllianceTag,
  validateAllianceName
};
