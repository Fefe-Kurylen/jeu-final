// ========== VILLES SECONDAIRES (colons, fondation) ==========
// GDD : la Résidence de la capitale forme des colons (1 au niveau 10, 2 au 15, 3 au 20) ; une armée emmène un colon et
// 3 000 de chaque ressource sur un point de ressource libre, la ville est fondée 24 h après l'arrivée et produit +20 %.
// Les règles affichées sont celles du serveur (routes/cities.js, routes/armies.js, utils/buildingEffects.js).
const COLONY_RULES = { foundationTransport: 3000, maxSecondaryCities: 3, mainHallMax: 20 };
// Plafond du Bâtiment principal hors capitale (règle du serveur : config.city.secondaryMainHallMaxLevel, transmise par /api/world/info)
function colonyMainHallMax() { return Number(window.worldRules?.secondaryMainHallMaxLevel) || COLONY_RULES.mainHallMax; }
// Palier de ville (Village / Ville / Ville Fortifiée) d'après le niveau du Bâtiment principal, comme le serveur
function cityTierFromMainHall(level) {
  const tiers = (window.worldRules?.cityTiers || [{ minMainHall: 0, tier: 1 }, { minMainHall: 10, tier: 2 }, { minMainHall: 20, tier: 3 }]);
  let t = 1; for (const x of tiers) if ((level || 1) >= x.minMainHall) t = x.tier; return t;
}

// Icône du colon : version peinte `ui/settler.webp` dès qu'elle est livrée, sinon l'icône de ville
function settlerIcon(cls = 'ico') { return typeof paintedSet !== 'undefined' && paintedSet.has('ui/settler.webp') ? `<img class="${cls}" src="assets/images/painted/ui/settler.webp" alt="">` : resIconHtml('city', cls); }

// Portrait peint du colon (busts/SETTLER_<CIV>, guide § S12) dès qu'il est livré
function settlerPortrait(cls = 'unit-ico') { const p = `busts/SETTLER_${player?.faction || 'ROME'}.webp`; return typeof paintedSet !== 'undefined' && paintedSet.has(p) ? `<img class="${cls}" src="assets/images/painted/${p}" alt="">` : ''; }

const residenceEffects = () => (window.buildingsData?.find(b => b.key === 'RESIDENCE')?.effects) || {};
function settlerSlotsFor(level) {
  const fx = residenceEffects();
  if (level >= 20) return fx.unlockSettlerL20 || 3;
  if (level >= 15) return fx.unlockSettlerL15 || 2;
  if (level >= 10) return fx.unlockSettlerL10 || 1;
  return 0;
}
const capitalCity = () => (cities || []).find(c => c.isCapital) || null;
const secondaryCities = () => (cities || []).filter(c => !c.isCapital);
const settlersTravelling = () => (armies || []).reduce((s, a) => s + (a.settlers || 0), 0);

// Onglet « Colons » du panneau de la Résidence
function colonyTabHtml(level) {
  const slots = Math.min(COLONY_RULES.maxSecondaryCities, settlerSlotsFor(level));
  const colonies = secondaryCities();
  const training = (currentCity?.recruitQueue || []).filter(q => q.unitKey === 'SETTLER');
  const available = currentCity?.settlers || 0;
  const used = colonies.length + available + settlersTravelling() + training.length;
  const fx = residenceEffects();
  const trainH = Math.round((fx.settlerTrainTimeSec || 10800) / 3600), foundH = Math.round((fx.cityFoundationTimeSec || 86400) / 3600), bonus = fx.secondaryCityBonusPct || 20;
  const canTrain = currentCity?.isCapital && slots > 0 && used < slots;
  const nextLevel = slots >= 3 ? null : slots === 2 ? 20 : slots === 1 ? 15 : 10;
  return `
    <div class="special-tab-content">
      <h4>${settlerPortrait('unit-ico-sm') || settlerIcon()} Colons et villes secondaires</h4>
      <p>Résidence niveau <strong>${level}</strong> : <strong>${slots}</strong> colon${slots > 1 ? 's' : ''} (1 au niveau 10, 2 au niveau 15, 3 au niveau 20)${nextLevel ? ` · le suivant au niveau ${nextLevel}` : ''}.</p>
      <p>Villes secondaires : <strong>${colonies.length}</strong>${colonies.length ? ' (' + colonies.map(c => escapeHtml(c.name)).join(', ') + ')' : ''} · colons prêts dans la capitale : <strong>${available}</strong> · en route : <strong>${settlersTravelling()}</strong> · en formation : <strong>${training.length}</strong></p>
      ${training.length ? `<div class="research-queue">${training.map(q => `<div class="research-queue-item running"><span class="rq-name">Colon en formation</span><span class="rq-state"><span class="qd-timer" data-ends-at="${q.endsAt}">${formatTime(q.endsAt)}</span></span><button type="button" class="btn-small" onclick="cancelRecruit('${q.id}')" title="Annuler" aria-label="Annuler">✕</button></div>`).join('')}</div>` : ''}
      <button type="button" class="btn-primary" ${canTrain ? '' : 'disabled'} onclick="trainSettler()">${canTrain ? `Former un colon (${trainH} h)` : !currentCity?.isCapital ? 'Capitale seulement' : slots === 0 ? 'Résidence niveau 10 requise' : 'Tous les colons sont engagés'}</button>
      <p class="research-empty" style="margin-top:8px">Pour fonder une ville : une armée de la capitale emmène un colon et ${formatNum(COLONY_RULES.foundationTransport)} de chaque ressource sur un point de ressource libre (bulle du point sur la carte, « Fonder une ville »). La fondation dure ${foundH} h sur place ; la colonie produit +${bonus} %. Le colon est perdu si l'armée est battue en chemin.</p>
    </div>`;
}

async function trainSettler() {
  if (!currentCity) return;
  try {
    const res = await fetch(`${API}/api/city/${currentCity.id}/settlers`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    showToast(res.ok ? (data.message || 'Formation lancée') : (data.error || 'Formation impossible'), res.ok ? 'success' : 'error');
  } catch (e) { showToast('Erreur réseau', 'error'); }
  await loadCities();
  if (typeof openBuildPanel === 'function' && currentCity) { const r = (currentCity.buildings || []).find(b => b.key === 'RESIDENCE'); if (r) { openBuildPanel(r.slot); const btn = Array.from(document.querySelectorAll('.building-tab')).find(b => /Colons/.test(b.textContent)); if (btn) btn.click(); } }
}

// Depuis la bulle d'un point libre : choisir l'armée de la capitale qui part fonder
function foundCityAt(nodeId, x, y) {
  const capital = capitalCity();
  if (!capital) { showToast('Aucune capitale', 'error'); return; }
  if ((capital.settlers || 0) < 1) { showToast('Aucun colon disponible : formez-en un à la Résidence de la capitale', 'error'); return; }
  const candidates = (armies || []).filter(a => a.status === 'IDLE' && !a.isGarrison && a.cityId === capital.id && a.x === capital.x && a.y === capital.y && (a.units || []).length > 0);
  if (!candidates.length) { showToast('Aucune armée disponible dans la capitale', 'error'); return; }
  const fx = residenceEffects();
  document.getElementById('modal-body').innerHTML = `
    <h3>${settlerPortrait('unit-ico-sm') || settlerIcon()} Fonder une ville en (${x}, ${y})</h3>
    <p>Un colon part avec l'armée choisie et ${formatNum(COLONY_RULES.foundationTransport)} de chaque ressource de la capitale ; la ville est prête ${Math.round((fx.cityFoundationTimeSec || 86400) / 3600)} h après l'arrivée. Le point ne doit plus avoir de tribu ni d'armée.</p>
    <label style="display:block; margin:10px 0 5px;">Armée :</label>
    <select id="found-army-select" style="width:100%; padding:8px; margin-bottom:10px;">${candidates.map(a => `<option value="${a.id}">${escapeHtml(a.name)} (${(a.units || []).reduce((s, u) => s + u.count, 0)} unités)</option>`).join('')}</select>
    <label style="display:block; margin:10px 0 5px;">Nom de la ville (facultatif) :</label>
    <input id="found-city-name" type="text" maxlength="40" style="width:100%; padding:8px; margin-bottom:15px;" placeholder="Colonie de ${escapeHtml(player?.name || '')}">
    <div style="display:flex; gap:10px;">
      <button onclick="confirmFoundCity('${nodeId}')" class="btn btn-primary" style="flex:1;">${settlerIcon()} Fonder</button>
      <button onclick="closeModal()" class="btn btn-secondary" style="flex:1;">Annuler</button>
    </div>`;
  document.getElementById('modal').style.display = 'flex';
}

async function confirmFoundCity(nodeId) {
  const armyId = document.getElementById('found-army-select')?.value;
  const name = document.getElementById('found-city-name')?.value || '';
  if (!armyId) { showToast('Sélectionnez une armée', 'error'); return; }
  closeModal();
  if (typeof closeMapPanel === 'function') closeMapPanel();
  try {
    const res = await fetch(`${API}/api/army/${armyId}/found-city`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ resourceNodeId: nodeId, name }) });
    const data = await res.json().catch(() => ({}));
    showToast(res.ok ? (data.message || 'Colon en route') : (data.error || 'Fondation impossible'), res.ok ? 'success' : 'error');
  } catch (e) { showToast('Erreur réseau', 'error'); }
  await Promise.all([loadArmies(), loadCities()]);
  if (typeof loadMap === 'function') loadMap();
}
