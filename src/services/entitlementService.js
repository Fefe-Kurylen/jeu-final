// Avantages accordés par les achats vérifiés côté serveur (voir purchaseService)
const config = require('../config');

function isPremium(player) {
  return !!(player && player.premiumUntil && new Date(player.premiumUntil) > new Date());
}

function cosmeticsOf(player) {
  return Array.isArray(player?.cosmetics) ? player.cosmetics : [];
}

function entitlementsOf(player) {
  return { premium: isPremium(player), premiumUntil: player?.premiumUntil || null, cosmetics: cosmeticsOf(player), perks: config.purchases.perks };
}

module.exports = { isPremium, cosmeticsOf, entitlementsOf };
