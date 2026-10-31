// ============================================================
// 11b-market-trade.js — Marché (décisions du 27 et du 31 octobre 2026) : marchands, taxe des échanges, routes commerciales
// entre ses villes. La Place du marché n'existe que dans la capitale et sert toutes les villes du joueur : un marchand par
// niveau, une charge et une vitesse selon la civilisation (charge augmentée par le Comptoir et le Poste du Désert). Toutes
// les livraisons du marché passent par les marchands (offres entre joueurs, envois, routes) ; un marchand est occupé à
// l'aller comme au retour. Le marchand du serveur (échange immédiat) n'en demande pas.
// Serveur : src/routes/market.js, src/services/marketService.js.
// ============================================================
const MARKET_RES = [['wood', 'Bois'], ['stone', 'Pierre'], ['iron', 'Fer'], ['food', 'Nourriture']];

// ---- marchands ----
// État du marché vu de la ville affichée (GET /api/market/state) : taxe des échanges qui en partent et marchands du joueur
// { total, free, capacity, speed }
let marketState = null;
async function loadMarketState() {
  if (!currentCity) return null;
  try { marketState = await fetchJson(`/api/market/state?cityId=${encodeURIComponent(currentCity.id)}`); } catch (e) { /* le dernier état connu reste affiché */ }
  renderMerchantsBar();
  return marketState;
}
// Marchands qu'il faut pour porter `amount`, comme le serveur (marketService.merchantsFor)
const merchantsFor = (amount, capacity) => Math.ceil(Math.max(0, amount) / Math.max(1, capacity));
// Durée de l'aller des marchands (secondes) vers (x, y), en ligne droite à leur vitesse comme calculateTravelTime du serveur :
// « au moins », la vraie route contourne le relief et l'eau ; le retour dure autant
const merchantSeconds = (from, x, y, speed) => Math.max(1, Math.ceil(Math.hypot(x - from.x, y - from.y) * 30 * (50 / Math.max(1, speed))));
// Refus du serveur quand il manque des marchands (marketService.noMerchants), affiché avant l'envoi
const noMerchantsText = (free, needed) => `Pas assez de marchands libres (${free} libres, ${needed} nécessaires)`;
const merchantsText = (n) => `${n} marchand${n > 1 ? 's' : ''}`;

// Bandeau des marchands en tête du marché : libres / total, charge et vitesse
function renderMerchantsBar() {
  const el = document.getElementById('market-merchants');
  const m = marketState?.merchants;
  if (!el || !m) return;
  el.innerHTML = m.total
    ? `${resIconHtml('item_crate')} Marchands : <strong>${m.free} libre${m.free > 1 ? 's' : ''} / ${m.total}</strong> · ${formatNum(m.capacity)} ressources chacun · vitesse ${m.speed} <small>Un marchand par niveau du Marché de la capitale, occupé à l'aller comme au retour.</small>`
    : `${resIconHtml('lock')} Aucun marchand : construisez la Place du marché dans la capitale (un marchand par niveau).`;
}
// Aide d'une livraison de `amount` ressources : marchands nécessaires, ou le refus s'il en manque ; avec une destination
// { x, y }, la durée de l'aller et du retour. '' tant que rien n'est saisi
function merchantNeedHtml(amount, dest = null) {
  const m = marketState?.merchants;
  if (!m || !(amount > 0)) return '';
  const need = merchantsFor(amount, m.capacity);
  if (need > m.free) return `<span class="missing">${noMerchantsText(m.free, need)}</span>`;
  const trip = dest && currentCity ? merchantSeconds(currentCity, dest.x, dest.y, m.speed) : 0;
  return `${merchantsText(need)} sur ${m.free} libre${m.free > 1 ? 's' : ''}${trip ? ` · aller : au moins ${formatDuration(trip)}, retour des marchands : autant` : ''}`;
}
// Après une livraison (réponse du serveur { merchantsUsed, arrivalAt, returnAt }) : quand les ressources arrivent et quand
// les marchands sont de retour
const deliveryTimesText = (d) => (d?.arrivalAt ? ` · arrivée dans ${formatTime(d.arrivalAt)}, marchands de retour dans ${formatTime(d.returnAt)}` : '');

// ---- envoi de ressources ----
// Formulaire « Envoyer » : marchands nécessaires et durée, à chaque saisie
function updateSendMerchants() {
  const el = document.getElementById('send-merchants');
  if (!el) return;
  const amount = RES_KEYS.reduce((t, r) => t + (parseInt(document.getElementById(`send-${r}`)?.value) || 0), 0);
  const x = parseInt(document.getElementById('send-target-x')?.value), y = parseInt(document.getElementById('send-target-y')?.value);
  el.innerHTML = merchantNeedHtml(amount, Number.isNaN(x) || Number.isNaN(y) ? null : { x, y });
}

// ---- offres entre joueurs ----
// Formulaire « Créer une offre » (état du marché déjà chargé) : taxe des échanges qui partent de cette ville et marchands
// que l'offre réservera
function refreshOfferForm() {
  const t = marketState;
  const help = document.getElementById('market-offer-help');
  if (help && t) {
    const office = fmtTechPct(buildingEffectOf('TRADE_OFFICE', 'p2pTaxReductionPctPerLevel', 1));
    help.innerHTML = `Vos marchands attendent en ville avec les marchandises jusqu'à l'échange (${t.offerHours} h au plus). À l'échange, les marchands de chaque côté partent, puis rentrent ; taxe sur ce qu'ils portent : <strong>${fmtTechPct(t.taxPct)} %</strong> depuis cette ville (${t.basePct} % de base, −${office} % par niveau du Comptoir de la capitale, −0,25 % par niveau de la Chambre au Trésor).`;
  }
  updateOfferMerchants();
}
function updateOfferMerchants() {
  const el = document.getElementById('market-offer-merchants');
  if (el) el.innerHTML = merchantNeedHtml(parseInt(document.getElementById('market-sell-amount')?.value) || 0);
}

// Accepter une offre : les marchands de la ville portent la contrepartie vers la ville du vendeur
function openAcceptOffer(offer) {
  const name = (k) => (MARKET_RES.find(r => r[0] === k) || [k, k])[1].toLowerCase();
  const need = merchantNeedHtml(offer.buyAmount, offer.city);
  const m = marketState?.merchants;
  const enough = !m || merchantsFor(offer.buyAmount, m.capacity) <= m.free;
  openSheetModal('Accepter l\'offre', `
    <p>Vous donnez <strong>${formatNum(offer.buyAmount)} ${name(offer.buyResource)}</strong> et recevez <strong>${formatNum(offer.sellAmount)} ${name(offer.sellResource)}</strong> (moins la taxe de chaque côté).</p>
    <p class="diplo-help">Vos marchands partent de ${escapeHtml(currentCity?.name || 'votre ville')} vers ${escapeHtml(offer.city?.name || 'la ville du vendeur')} avec votre part, ceux du vendeur viennent vers vous ; livraison à l'arrivée, puis retour.</p>
    ${need ? `<p class="diplo-help">${need}</p>` : ''}
    <div class="profile-actions">
      <button class="btn btn-primary" ${enough ? '' : 'disabled'} onclick="confirmAcceptOffer('${chatSafeId(offer.id)}')">Accepter</button>
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
    </div>`);
}

// ---- routes commerciales ----
const CONVOY_KIND = { SEND: 'Envoi', TRADE: 'Échange', ROUTE: 'Route' };
async function loadTradeRoutes() {
  const box = document.getElementById('market-routes-box');
  if (!box) return;
  let d;
  try { d = await fetchJson('/api/market/routes'); } catch (e) { box.innerHTML = '<p class="empty-state">Routes indisponibles pour le moment.</p>'; return; }
  if (d.merchants) { marketState = { ...(marketState || {}), merchants: d.merchants }; renderMerchantsBar(); }
  const myCities = cities || [];
  const cityName = (id) => escapeHtml(myCities.find(c => c.id === id)?.name || 'ville disparue');
  const placeName = (id) => escapeHtml(myCities.find(c => c.id === id)?.name || 'la ville d\'un autre joueur');   // envois et échanges
  const resList = (r) => MARKET_RES.filter(([k]) => r[k]).map(([k]) => resIconHtml(k)).join(' ');
  const per = (id) => d.perSend?.[id];
  const now = serverNow();
  // un convoi va livrer (arrivée), puis ses marchands rentrent (retour) : ils restent occupés jusque-là
  const convoyTime = (c) => (!c.deliveredAt && new Date(c.arrivalAt).getTime() > now
    ? `arrivée <span class="qd-timer" data-ends-at="${c.arrivalAt}">${formatTime(c.arrivalAt)}</span>`
    : `retour des marchands <span class="qd-timer" data-ends-at="${c.returnAt}">${formatTime(c.returnAt)}</span>`);
  box.innerHTML = `
    <h3>Routes commerciales</h3>
    <p class="diplo-help">Entre vos propres villes : toutes les ${d.rules.intervalHours} h, des marchands partent avec ${fmtTechPct(d.rules.pctPerSend)} % du stockage de la ville de départ pour chaque ressource choisie (${d.rules.pctOfStoragePer24h} % au plus en 24 h), dans la limite de ce que portent vos marchands libres. Ce qui ne tient pas à l'arrivée revient. Aucun marchand ne part d'une ville assiégée ni n'y entre.</p>
    ${myCities.length < 2 ? '<p class="empty-state">Il faut au moins deux villes pour créer une route.</p>' : `
    <div class="route-form">
      <label class="form-row">De <select id="route-from">${myCities.map(c => `<option value="${chatSafeId(c.id)}" ${c.id === currentCity?.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></label>
      <label class="form-row">Vers <select id="route-to">${myCities.map(c => `<option value="${chatSafeId(c.id)}" ${c.id !== currentCity?.id ? 'selected' : ''}>${escapeHtml(c.name)}</option>`).join('')}</select></label>
      <div class="route-res">${MARKET_RES.map(([k, l]) => `<label><input type="checkbox" id="route-${k}" ${k !== 'food' ? 'checked' : ''}> ${resIconHtml(k)} ${l}</label>`).join('')}</div>
      <button class="btn btn-primary" onclick="createTradeRoute()">Créer la route</button>
    </div>`}
    <div class="route-list">
      ${d.routes.length ? d.routes.map(r => `<div class="member-row route-row ${r.active ? '' : 'paused'}">
        <span class="member-name">${cityName(r.fromCityId)} → ${cityName(r.toCityId)} <small>${resList(r)}${per(r.fromCityId) ? ` · ${formatNum(per(r.fromCityId).other)} par envoi` : ''}</small></span>
        <span>${r.active ? `prochain départ <span class="qd-timer" data-ends-at="${r.nextSendAt}">${formatTime(r.nextSendAt)}</span>` : 'en pause'}</span>
        <span><button class="btn btn-secondary btn-sm" onclick="toggleTradeRoute('${chatSafeId(r.id)}')">${r.active ? 'Pause' : 'Reprendre'}</button>
        <button class="btn btn-danger btn-sm" onclick="deleteTradeRoute('${chatSafeId(r.id)}')">Supprimer</button></span>
      </div>`).join('') : '<p class="empty-state">Aucune route.</p>'}
    </div>
    ${d.convoys.length ? `<h4>Marchands en chemin</h4>${d.convoys.map(c => `<div class="member-row"><span class="member-name">${CONVOY_KIND[c.kind] || 'Livraison'} : ${placeName(c.fromCityId)} → ${placeName(c.toCityId)} <small>${merchantsText(c.merchants || 0)}</small></span>
      <span>${MARKET_RES.filter(([k]) => c[k] > 0).map(([k]) => `${resIconHtml(k)} ${formatNum(c[k])}`).join(' ')}</span>
      <span>${convoyTime(c)}</span></div>`).join('')}` : ''}`;
}
async function createTradeRoute() {
  const body = { fromCityId: document.getElementById('route-from')?.value, toCityId: document.getElementById('route-to')?.value };
  for (const [k] of MARKET_RES) body[k] = !!document.getElementById('route-' + k)?.checked;
  if (await allianceRequestNoReload('/api/market/routes', 'POST', body)) loadTradeRoutes();
}
async function toggleTradeRoute(id) { if (await allianceRequestNoReload(`/api/market/routes/${id}/toggle`, 'POST')) loadTradeRoutes(); }
async function deleteTradeRoute(id) { if (await allianceRequestNoReload(`/api/market/routes/${id}`, 'DELETE')) loadTradeRoutes(); }
