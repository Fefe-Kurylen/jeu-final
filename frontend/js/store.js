// ========== BOUTIQUE : abonnement « Plus » et cosmétiques ==========
// L'achat passe par le plugin RevenueCat (StoreKit / Google Play) ; le serveur vérifie auprès de
// RevenueCat avant d'accorder quoi que ce soit (POST /api/purchases/sync). Sur le web : lecture seule.
const Store = {
  catalog: [],
  entitlements: { premium: false, premiumUntil: null, cosmetics: [] },
  configured: false,

  isNative() {
    return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform() && window.Capacitor.Plugins && window.Capacitor.Plugins.Purchases);
  },

  playerId: null,

  async configure(playerId) {
    if (!this.isNative()) return;
    const Purchases = window.Capacitor.Plugins.Purchases;
    try {
      if (this.configured) {
        // Another player on the same device: switch the RevenueCat identity instead of keeping the first one
        if (this.playerId !== playerId) { await Purchases.logIn({ appUserID: playerId }); this.playerId = playerId; }
        return;
      }
      const platform = window.Capacitor.getPlatform();
      const apiKey = platform === 'ios' ? window.REVENUECAT_APPLE_KEY : window.REVENUECAT_GOOGLE_KEY;
      if (!apiKey) return;
      await Purchases.configure({ apiKey, appUserID: playerId });
      this.configured = true;
      this.playerId = playerId;
    } catch (e) { console.warn('RevenueCat:', e.message); }
  },

  async logOut() {
    this.entitlements = { premium: false, premiumUntil: null, cosmetics: [] };
    if (!this.configured || !this.isNative()) return;
    try { await window.Capacitor.Plugins.Purchases.logOut(); } catch (e) { /* anonymous already */ }
    this.playerId = null;
  },

  async loadCatalog() {
    if (this.catalog.length) return this.catalog;
    try { const res = await fetch(`${API}/api/purchases/catalog`); const json = await res.json(); this.catalog = json.products || []; } catch (e) { this.catalog = []; }
    return this.catalog;
  },

  async refresh() {
    try {
      const res = await fetch(`${API}/api/purchases/me`, { headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) this.entitlements = await res.json();
    } catch (e) { /* hors ligne */ }
    return this.entitlements;
  },

  // Prix réels des stores quand le plugin est disponible
  async storePrices() {
    const prices = {};
    if (!this.isNative() || !this.configured) return prices;
    try {
      const { Purchases } = window.Capacitor.Plugins;
      const offerings = await Purchases.getOfferings();
      const all = Object.values(offerings.all || {}).concat(offerings.current ? [offerings.current] : []);
      for (const off of all) for (const pkg of off.availablePackages || []) { prices[pkg.product.identifier] = { priceString: pkg.product.priceString, pkg }; }
    } catch (e) { console.warn('offerings:', e.message); }
    return prices;
  },

  async buy(productId) {
    if (!this.isNative()) { showToast('Les achats se font depuis l\'application iOS ou Android', 'info'); return; }
    if (!this.configured) { showToast('Boutique indisponible pour le moment', 'error'); return; }
    try {
      const prices = await this.storePrices();
      const entry = prices[productId];
      if (!entry) { showToast('Produit indisponible sur ce store', 'error'); return; }
      await window.Capacitor.Plugins.Purchases.purchasePackage({ aPackage: entry.pkg });
      await this.sync();
      showToast('Merci ! Vos avantages sont activés.', 'success');
      if (typeof haptic === 'function') haptic('medium');
    } catch (e) {
      if (!(e && (e.userCancelled || /cancel/i.test(e.message || '')))) showToast('Achat impossible : ' + (e.message || 'erreur'), 'error');
    }
    this.openShop();
  },

  // Bouton « Restaurer les achats » (exigence App Store)
  async restore() {
    if (!this.isNative() || !this.configured) { showToast('Restauration disponible depuis l\'application', 'info'); return; }
    try {
      await window.Capacitor.Plugins.Purchases.restorePurchases();
      const result = await this.sync();
      showToast(result && (result.premium || (result.cosmetics || []).length) ? 'Achats restaurés' : 'Aucun achat à restaurer', 'info');
    } catch (e) { showToast('Restauration impossible : ' + (e.message || 'erreur'), 'error'); }
  },

  async sync() {
    try {
      const res = await fetch(`${API}/api/purchases/sync`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
      if (res.ok) { this.entitlements = await res.json(); if (typeof loadPlayer === 'function') loadPlayer(); return this.entitlements; }
      const err = await res.json().catch(() => ({}));
      showToast(err.error || 'Vérification impossible', 'error');
    } catch (e) { showToast('Vérification impossible (hors ligne ?)', 'error'); }
    return null;
  },

  async openShop() {
    await Promise.all([this.loadCatalog(), this.refresh()]);
    const prices = await this.storePrices();
    const ent = this.entitlements;
    const owned = new Set(ent.cosmetics || []);
    const until = ent.premiumUntil ? new Date(ent.premiumUntil) : null;
    const items = this.catalog.map(p => {
      const price = prices[p.id] ? prices[p.id].priceString : p.priceHint;
      const isSub = p.type === 'subscription';
      const active = isSub ? ent.premium : owned.has(p.id);
      const perks = (p.perks || []).map(x => `<li>${escapeHtml(x)}</li>`).join('');
      const action = active
        ? `<span class="shop-owned">${isSub ? 'Actif' + (until ? ' jusqu\'au ' + until.toLocaleDateString('fr-FR') : '') : 'Possédé'}</span>`
        : `<button class="btn-primary shop-buy" onclick="Store.buy('${p.id}')">${escapeHtml(price)}</button>`;
      return `<div class="shop-item ${isSub ? 'shop-sub' : ''}">
        <div class="shop-item-head"><strong>${escapeHtml(p.name)}</strong>${action}</div>
        <p>${escapeHtml(p.description)}</p>${perks ? `<ul>${perks}</ul>` : ''}
      </div>`;
    }).join('');
    const note = this.isNative() ? '' : '<p class="shop-note">Les achats et la restauration se font depuis l\'application iOS ou Android.</p>';
    showModal('Boutique', `<div class="shop">${items}${note}
      <div class="shop-footer">
        <button class="btn-secondary" onclick="Store.restore()">Restaurer les achats</button>
        <p class="shop-legal">Abonnement renouvelé automatiquement, annulable à tout moment dans les réglages de votre store. Paiement géré par Apple ou Google.</p>
      </div></div>`);
  }
};
window.Store = Store;
