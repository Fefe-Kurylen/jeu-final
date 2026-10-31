// ============================================================
// 11b-market-trade.js — Marché (décision du 27 octobre 2026) : armée de transport des échanges, taxe, routes
// commerciales automatiques entre ses villes. Serveur : src/routes/market.js, src/services/marketService.js.
// ============================================================
const MARKET_RES = [['wood', 'Bois'], ['stone', 'Pierre'], ['iron', 'Fer'], ['food', 'Nourriture']];
const freeArmiesOfCity = (cityId) => (armies || []).filter(a => a.cityId === cityId && a.status === 'IDLE' && !a.isGarrison && (a.units || []).some(u => u.count > 0));
const armyCarryLabel = (a) => (a.carryCapacity ? ` · ${formatNum(a.carryCapacity)} de capacité` : '');

// Liste des armées libres de la ville pour porter une offre
function fillOfferArmySelect() {
  const sel = document.getElementById('market-offer-army');
  if (!sel) return;
  const list = freeArmiesOfCity(currentCity?.id);
  sel.innerHTML = list.length
    ? `<option value="">Choix automatique</option>${list.map(a => `<option value="${chatSafeId(a.id)}">${escapeHtml(a.name)}${armyCarryLabel(a)}</option>`).join('')}`
    : '<option value="">Aucune armée libre en ville</option>';
  if (currentCity) fetchJson(`/api/market/tax?cityId=${encodeURIComponent(currentCity.id)}`).then(t => {
    const help = document.getElementById('market-offer-help');
    // le meilleur Comptoir des colonies vaut pour toutes les villes (décision du 30 octobre 2026) ; sa baisse par niveau vient des données
    const office = String(window.buildingsData?.find(b => b.key === 'TRADE_OFFICE')?.effects?.p2pTaxReductionPctPerLevel ?? 1).replace('.', ',');
    if (help) help.innerHTML = `L'armée choisie attend en ville avec les marchandises jusqu'à l'échange (${t.offerHours} h au plus). À l'échange, chaque côté envoie son armée ; taxe sur ce qu'elle transporte : <strong>${String(t.taxPct).replace('.', ',')} %</strong> depuis cette ville (${t.basePct} % de base, −${office} % par niveau du meilleur Comptoir de vos colonies, −0,25 % par niveau de la Chambre au Trésor).`;
  }).catch(() => {});
}

// Accepter une offre : l'armée de la ville qui porte la contrepartie
function openAcceptOffer(offer) {
  const list = freeArmiesOfCity(currentCity?.id);
  const name = (k) => (MARKET_RES.find(r => r[0] === k) || [k, k])[1].toLowerCase();
  openSheetModal('Accepter l\'offre', `
    <p>Vous donnez <strong>${formatNum(offer.buyAmount)} ${name(offer.buyResource)}</strong> et recevez <strong>${formatNum(offer.sellAmount)} ${name(offer.sellResource)}</strong> (moins la taxe de chaque convoi).</p>
    <p class="diplo-help">Une armée de ${escapeHtml(currentCity?.name || 'votre ville')} part vers ${escapeHtml(offer.city?.name || 'la ville du vendeur')} avec votre part ; celle du vendeur vient vers vous. Livraison à l'arrivée, puis retour.</p>
    ${list.length ? `<label class="form-row">Armée <select id="accept-army"><option value="">Choix automatique</option>${list.map(a => `<option value="${chatSafeId(a.id)}">${escapeHtml(a.name)}${armyCarryLabel(a)}</option>`).join('')}</select></label>` : '<p class="bastion-sieged">Aucune armée libre dans cette ville : formez-en une au point de ralliement.</p>'}
    <div class="profile-actions">
      <button class="btn btn-primary" ${list.length ? '' : 'disabled'} onclick="confirmAcceptOffer('${chatSafeId(offer.id)}', document.getElementById('accept-army')?.value || null)">Accepter</button>
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
    </div>`);
}

// ---- routes commerciales ----
async function loadTradeRoutes() {
  const box = document.getElementById('market-routes-box');
  if (!box) return;
  let d;
  try { d = await fetchJson('/api/market/routes'); } catch (e) { box.innerHTML = '<p class="empty-state">Routes indisponibles pour le moment.</p>'; return; }
  const myCities = cities || [];
  const cityName = (id) => escapeHtml(myCities.find(c => c.id === id)?.name || 'ville disparue');
  const resList = (r) => MARKET_RES.filter(([k]) => r[k]).map(([k]) => resIconHtml(k)).join(' ');
  const per = (id) => d.perSend?.[id];
  box.innerHTML = `
    <h3>Routes commerciales</h3>
    <p class="diplo-help">Entre vos propres villes : toutes les ${d.rules.intervalHours} h, un convoi part avec ${String(d.rules.pctPerSend).replace('.', ',')} % du stockage de la ville de départ pour chaque ressource choisie (${d.rules.pctOfStoragePer24h} % au plus en 24 h), sans immobiliser d'armée. Ce qui ne tient pas à l'arrivée revient. Aucun convoi ne part d'une ville assiégée ni n'y entre.</p>
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
    ${d.convoys.length ? `<h4>Convois en chemin</h4>${d.convoys.map(c => `<div class="member-row"><span class="member-name">${cityName(c.fromCityId)} → ${cityName(c.toCityId)}</span>
      <span>${MARKET_RES.filter(([k]) => c[k] > 0).map(([k]) => `${resIconHtml(k)} ${formatNum(c[k])}`).join(' ')}</span>
      <span>arrivée <span class="qd-timer" data-ends-at="${c.arrivalAt}">${formatTime(c.arrivalAt)}</span></span></div>`).join('')}` : ''}`;
}
async function createTradeRoute() {
  const body = { fromCityId: document.getElementById('route-from')?.value, toCityId: document.getElementById('route-to')?.value };
  for (const [k] of MARKET_RES) body[k] = !!document.getElementById('route-' + k)?.checked;
  if (await allianceRequestNoReload('/api/market/routes', 'POST', body)) loadTradeRoutes();
}
async function toggleTradeRoute(id) { if (await allianceRequestNoReload(`/api/market/routes/${id}/toggle`, 'POST')) loadTradeRoutes(); }
async function deleteTradeRoute(id) { if (await allianceRequestNoReload(`/api/market/routes/${id}`, 'DELETE')) loadTradeRoutes(); }
