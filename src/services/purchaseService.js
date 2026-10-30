// Achats intégrés : le client achète via StoreKit / Google Play (plugin RevenueCat), le serveur ne croit
// que RevenueCat (API REST avec la clé secrète). Les avantages sont stockés sur le joueur.
const config = require('../config');
const prisma = require('../config/database');
const products = require('../../data/products.json');

const RC_API = 'https://api.revenuecat.com/v1';
const byId = new Map(products.map(p => [p.id, p]));

function catalog() { return products; }

async function fetchSubscriber(appUserId) {
  const key = config.purchases.revenuecatSecret;
  if (!key) return null;
  const res = await fetch(`${RC_API}/subscribers/${encodeURIComponent(appUserId)}`, { headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(10000) });
  if (res.status === 404) return { entitlements: {}, subscriptions: {}, non_subscriptions: {} };
  if (!res.ok) throw new Error(`RevenueCat ${res.status}`);
  return (await res.json()).subscriber;
}

// Traduit la fiche RevenueCat en avantages : abonnement « Plus » actif → premiumUntil, cosmétiques possédés
async function applySubscriber(playerId, subscriber) {
  const now = Date.now();
  let premiumUntil = null;
  const ent = subscriber.entitlements?.[config.purchases.premiumEntitlement];
  if (ent) {
    const exp = ent.expires_date ? new Date(ent.expires_date) : null;
    if (!exp || exp.getTime() > now) premiumUntil = exp || new Date(now + 100 * 365 * 24 * 3600 * 1000);
  }
  const cosmetics = new Set();
  const rows = [];
  for (const [productId, list] of Object.entries(subscriber.non_subscriptions || {})) {
    for (const t of list || []) {
      if (byId.get(productId)?.type === 'cosmetic') cosmetics.add(productId);
      rows.push({ productId, transactionId: String(t.id), purchasedAt: new Date(t.purchase_date), expiresAt: null, store: t.store || 'app_store', status: 'ACTIVE', raw: t });
    }
  }
  for (const [productId, sub] of Object.entries(subscriber.subscriptions || {})) {
    const expiresAt = sub.expires_date ? new Date(sub.expires_date) : null;
    rows.push({ productId, transactionId: `${productId}:${sub.purchase_date}`, purchasedAt: new Date(sub.purchase_date), expiresAt, store: sub.store || 'app_store', status: expiresAt && expiresAt.getTime() < now ? 'EXPIRED' : 'ACTIVE', raw: sub });
  }
  await prisma.$transaction(async (tx) => {
    for (const r of rows) {
      // un achat transféré (RevenueCat TRANSFER) passe au compte qui le détient désormais
      await tx.purchase.upsert({ where: { transactionId: r.transactionId }, update: { playerId, status: r.status, expiresAt: r.expiresAt, raw: r.raw }, create: { playerId, ...r } });
    }
    await tx.player.update({ where: { id: playerId }, data: { premiumUntil, cosmetics: [...cosmetics] } });
  });
  return { premiumUntil, cosmetics: [...cosmetics], purchases: rows.length };
}

// Synchronise un joueur avec RevenueCat (après un achat, une restauration ou un webhook)
async function syncPlayer(playerId) {
  const subscriber = await fetchSubscriber(playerId);
  if (!subscriber) return null;   // RevenueCat non configuré : rien n'est accordé
  return applySubscriber(playerId, subscriber);
}

module.exports = { catalog, syncPlayer, fetchSubscriber };
