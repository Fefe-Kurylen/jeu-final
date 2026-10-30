const config = require('../config');

const validateEmail = (email) => {
  if (!email || typeof email !== 'string') return false;
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email) && email.length <= 255;
};

const validatePassword = (password) => {
  if (!password || typeof password !== 'string') return false;
  return password.length >= 8 && password.length <= 100;
};

const validateName = (name) => {
  if (!name || typeof name !== 'string') return false;
  const nameRegex = /^[a-zA-Z0-9_-]+$/;
  return nameRegex.test(name) && name.length >= 3 && name.length <= 20;
};

const validateFaction = (faction) => {
  return typeof faction === 'string' && config.validFactions.includes(faction.toUpperCase());
};

const validateCoordinates = (x, y) => {
  return Number.isInteger(x) && Number.isInteger(y) &&
         x >= config.map.minCoord && x <= config.map.maxCoord &&
         y >= config.map.minCoord && y <= config.map.maxCoord;
};

// Player-visible free text: strips markup-significant characters and control chars,
// returns null when the cleaned result is outside [minLen, maxLen].
const MAX_TEXT_INPUT = 512;
const cleanText = (str, minLen = 1, maxLen = 30) => {
  if (typeof str !== 'string' || str.length > MAX_TEXT_INPUT) return null;
  const cleaned = str.replace(/<[^>]*>/g, '').replace(/[<>"'`\\]/g, '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  return cleaned.length >= minLen && cleaned.length <= maxLen ? cleaned : null;
};

// Resource amount accepted from a client: integer within [0, maxAmount]
const isAmount = (v) => Number.isInteger(v) && v >= 0 && v <= config.limits.maxAmount;

// Constant-time comparison of two secrets (header value vs configured key)
const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const crypto = require('crypto');
  const ha = crypto.createHash('sha256').update(a).digest(), hb = crypto.createHash('sha256').update(b).digest();
  return crypto.timingSafeEqual(ha, hb);
};

// Validate alliance tag (2-5 uppercase alphanumeric)
const validateAllianceTag = (tag) => {
  if (!tag || typeof tag !== 'string') return false;
  const tagRegex = /^[A-Z0-9]{2,5}$/;
  return tagRegex.test(tag.toUpperCase());
};

module.exports = {
  validateEmail,
  validatePassword,
  validateName,
  validateFaction,
  validateCoordinates,
  cleanText,
  isAmount,
  safeEqual,
  validateAllianceTag
};
