// ========== COLONIE NEUVE PROTÉGÉE ==========
// Décision du 31 octobre 2026 (rapport de vérification, config.city.newColonyProtectionHours) : pendant 72 h après sa
// fondation (City.createdAt), une colonie ne peut être ni attaquée, ni pillée, ni assiégée. Refus à l'envoi
// (routes/armies.js) et à l'arrivée : une armée déjà en route fait demi-tour (processors/armyProcessor.js). Les espions
// passent ; les armées de la colonie sortent librement. Ni la capitale ni la Ville Merveille.
const config = require('../config');

const HOUR_MS = 3600000;

// Fin de la protection d'une ville { isCapital, isWonder, createdAt } : une Date, ou null si elle n'est pas (ou plus)
// protégée à `now`
function protectedUntil(city, now = new Date()) {
  if (!city || city.isCapital || city.isWonder || !city.createdAt) return null;
  const end = new Date(new Date(city.createdAt).getTime() + config.city.newColonyProtectionHours * HOUR_MS);
  return end > now ? end : null;
}

// Temps restant en clair : « 2 j 5 h », « 5 h 12 min », « 12 min » (une minute au moins)
function remainingText(end, now = new Date()) {
  const minutes = Math.max(1, Math.ceil((new Date(end) - now) / 60000));
  const d = Math.floor(minutes / 1440), h = Math.floor((minutes % 1440) / 60), m = minutes % 60;
  if (d > 0) return `${d} j${h ? ` ${h} h` : ''}`;
  if (h > 0) return `${h} h${m ? ` ${m} min` : ''}`;
  return `${m} min`;
}

// Refus d'une attaque, d'un raid ou d'un siège contre cette ville (message pour le joueur), ou null
function protectionRefusal(city, now = new Date()) {
  const end = protectedUntil(city, now);
  return end ? `Colonie protégée encore ${remainingText(end, now)} : une colonie neuve ne peut être ni attaquée, ni pillée, ni assiégée pendant ${config.city.newColonyProtectionHours} h après sa fondation` : null;
}

module.exports = { protectedUntil, protectionRefusal, remainingText };
