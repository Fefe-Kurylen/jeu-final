// ============================================================
// 09g-bastion.js — Bastion d'alliance (décision du 26 octobre 2026) : onglet Alliance › Bastion (emplacement, convois,
// chantier, bonus, garnison) et panneau de la carte (ravitailler, tenir garnison, assiéger). Serveur :
// src/services/bastionService.js, routes /api/bastion.
// ============================================================
let bastionState = null, bastionLoadedAt = 0;
async function loadBastion(force = false) {
  if (!token) return null;
  if (!force && bastionState && Date.now() - bastionLoadedAt < 15000) return bastionState;
  try { bastionState = await fetchJson('/api/bastion'); bastionLoadedAt = Date.now(); } catch (e) { /* garde le dernier état */ }
  return bastionState;
}
const BASTION_RES = [['wood', 'bois'], ['stone', 'pierre'], ['iron', 'fer'], ['food', 'nourriture']];
const bastionStatusLabel = (s) => ({ FUNDING: 'Chantier : ressources à livrer', BUILDING: 'En construction', ACTIVE: 'Debout', DESTROYED: 'Rasé' }[s] || s);

function bastionBonusesHtml(rules) {
  const b = rules?.bonuses || {};
  return `<ul class="bastion-bonuses">
    <li>${resIconHtml('fields')} +${b.productionPct ?? 10} % de production</li>
    <li>${resIconHtml('horse')} +${b.armySpeedPct ?? 5} % de vitesse des armées</li>
    <li>${resIconHtml('item_crate')} +${b.carryPct ?? 10} % de capacité de transport</li>
    <li>${resIconHtml('defense')} +${b.garrisonDefensePct ?? 10} % de défense pour la garnison</li>
  </ul>`;
}

// Onglet Alliance › Bastion
async function renderBastionSection(box) {
  if (!box) return;
  const d = await loadBastion(true);
  if (!d) { box.innerHTML = '<p class="empty-state">Bastion indisponible pour le moment.</p>'; return; }
  if (!d.inAlliance) { box.innerHTML = '<p class="empty-state">Rejoignez une alliance pour bâtir un Bastion.</p>'; return; }
  const r = d.rules, b = d.bastion;
  const header = `<h4>${resIconHtml('defense')} Bastion d'alliance</h4>
    <p class="diplo-help">Un seul par alliance. Tant qu'il est debout, <strong>tous les membres</strong> profitent de :</p>${bastionBonusesHtml(r)}`;
  if (!b || b.status === 'DESTROYED') {
    const cooldown = b?.cooldownUntil && new Date(b.cooldownUntil) > new Date();
    const enough = d.members >= d.minMembers;
    box.innerHTML = `${header}
      ${b ? `<p class="bastion-fallen">${resIconHtml('attack')} Votre Bastion a été rasé${cooldown ? ` : un nouveau sera possible dans <span class="qd-timer" data-ends-at="${b.cooldownUntil}">${formatTime(b.cooldownUntil)}</span>` : '.'}</p>` : ''}
      <p>${enough ? resIconHtml('star') : resIconHtml('lock')} Membres : <strong>${d.members} / ${d.minMembers}</strong>${enough ? '' : ` — il faut ${d.minMembers} membres pour en bâtir un.`}</p>
      <p class="diplo-help">Coût, apporté par convois : ${BASTION_RES.map(([k]) => `${resIconHtml(k)} ${formatNum(r.cost[k])}`).join(' · ')} ; puis ${r.buildDays} jours de chantier. Emplacement : 2 × 2 cases libres sur la terre ferme, à ${r.maxDistance} cases au plus d'une ville de l'alliance.</p>
      ${d.canPlace ? `<div class="form-row bastion-place">
          <label>Emplacement</label>
          <input type="number" id="bastion-x" placeholder="x" value="${currentCity ? currentCity.x + 4 : ''}">
          <input type="number" id="bastion-y" placeholder="y" value="${currentCity ? currentCity.y + 4 : ''}">
          <button class="btn btn-primary" onclick="placeBastion()" ${enough && !cooldown ? '' : 'disabled'}>Placer le chantier</button>
        </div>
        <p class="diplo-help">Astuce : sur la carte, touchez une case vide puis « Placer le Bastion ici ».</p>` : '<p class="diplo-help">Le chef ou un officier choisit l\'emplacement.</p>'}`;
    return;
  }
  const progress = BASTION_RES.map(([k, label]) => {
    const pct = Math.min(100, Math.round(100 * (b.delivered[k] || 0) / Math.max(1, b.cost[k])));
    return `<div class="bastion-res"><span>${resIconHtml(k)} ${label}</span><div class="bastion-bar"><i style="width:${pct}%"></i></div><small>${formatNum(b.delivered[k] || 0)} / ${formatNum(b.cost[k])}</small></div>`;
  }).join('');
  const lives = b.lives;
  box.innerHTML = `${header}
    <div class="bastion-card status-${b.status.toLowerCase()}">
      <div class="bastion-head"><strong>${bastionStatusLabel(b.status)}</strong> · (${b.x}, ${b.y})
        <button class="btn btn-secondary btn-sm" onclick="goToBastionOnMap(${b.x}, ${b.y})">${resIconHtml('map')} Carte</button></div>
      ${b.status === 'FUNDING' ? `${progress}<p class="diplo-help">${b.convoys} convoi${b.convoys > 1 ? 's' : ''} en route. Envoyez une armée chargée depuis la carte : touchez le Bastion puis « Ravitailler ».</p>
        <button class="btn btn-primary" onclick="openBastionSend('${chatSafeId(b.id)}', 'SUPPLY')">${resIconHtml('item_crate')} Ravitailler</button>` : ''}
      ${b.status === 'BUILDING' ? `<p>Toutes les ressources sont là : achevé dans <span class="qd-timer" data-ends-at="${b.buildEndsAt}">${formatTime(b.buildEndsAt)}</span>.</p>` : ''}
      ${b.status === 'ACTIVE' || b.status === 'BUILDING' ? `<p>${resIconHtml('defense')} Vies : <strong>${lives} / ${b.assaults}</strong> <small>(elles remontent en ${r.regenHours} h)</small>${b.isSieged ? ` · <span class="bastion-sieged">${resIconHtml('attack')} assiégé</span>` : ''}</p>` : ''}
    </div>
    ${b.status !== 'FUNDING' ? `<h4>${resIconHtml('army')} Garnison <small>${b.garrison.length} armée${b.garrison.length > 1 ? 's' : ''}</small></h4>
      ${b.garrison.length ? `<div class="bastion-garrison">${b.garrison.map(g => `<div class="member-row"><span class="member-name">${escapeHtml(g.name)} <small>${escapeHtml(g.owner?.name || '')}${g.status === 'SUPPORTING' ? ' · en route' : ''}</small></span>
        <span>${g.units.map(u => `${formatNum(u.count)} ${escapeHtml(typeof getUnitName === 'function' ? getUnitName(u.key) : u.key)}`).join(', ')}</span>
        ${g.owner?.id === player?.id ? `${b.isSieged && g.status === 'STATIONED' ? `<button class="btn btn-danger btn-sm" onclick="bastionSortie('${chatSafeId(b.id)}', '${chatSafeId(g.id)}')">${resIconHtml('attack')} Sortie</button>` : ''}<button class="btn btn-secondary btn-sm" onclick="recallBastionArmy('${chatSafeId(g.id)}')">Rappeler</button>` : ''}</div>`).join('')}</div>` : '<p class="empty-state">Aucune armée en garnison.</p>'}
      ${b.isSieged ? `<p class="diplo-help">Pendant un siège, aucune troupe n'entre au Bastion. Chaque armée de la garnison peut faire une sortie contre le camp ennemi : elle se bat seule, hors des murs ; victorieuse, elle reste au Bastion, vaincue, elle rentre à la capitale.</p>
        <button class="btn btn-danger" onclick="openBastionSend('${chatSafeId(b.id)}', 'BREAK')">${resIconHtml('attack')} Briser le siège</button>` : `<button class="btn btn-primary" onclick="openBastionSend('${chatSafeId(b.id)}', 'GARRISON')">${resIconHtml('defense')} Envoyer en garnison</button>`}` : ''}`;
}

async function placeBastion(x, y) {
  x = x ?? Number(document.getElementById('bastion-x')?.value);
  y = y ?? Number(document.getElementById('bastion-y')?.value);
  if (!Number.isFinite(x) || !Number.isFinite(y)) { showToast('Entrez des coordonnées', 'error'); return; }
  const r = await allianceRequestNoReload('/api/bastion/place', 'POST', { x, y });
  if (r) { await loadBastion(true); renderBastionSection(document.getElementById('alliance-bastion-box')); if (typeof loadMap === 'function' && document.getElementById('tab-map')?.classList.contains('active')) loadMap(); }
}
// Bouton du panneau « Terrain vide » de la carte (chef ou officier d'une alliance sans Bastion)
function bastionPlaceButton(x, y) {
  const d = bastionState;
  if (!d?.inAlliance || !d.canPlace || d.members < d.minMembers) return '';
  if (d.bastion && d.bastion.status !== 'DESTROYED') return '';
  return `<button class="btn btn-primary" onclick="closeMapPanel(); confirmPlaceBastion(${Math.round(x)}, ${Math.round(y)})">${resIconHtml('defense')} Placer le Bastion ici</button>`;
}
function confirmPlaceBastion(x, y) {
  openSheetModal('Bastion d\'alliance', `<p>Placer le chantier du Bastion en <strong>(${x}, ${y})</strong> ? Les membres y apporteront ensuite les ressources par convois.</p>
    <div class="profile-actions"><button class="btn btn-primary" onclick="closeModal(); placeBastion(${x}, ${y})">Placer</button><button class="btn btn-secondary" onclick="closeModal()">Annuler</button></div>`);
}
function goToBastionOnMap(x, y) {
  if (typeof openNotificationLink === 'function') openNotificationLink({ to: 'map', x, y });
}
async function recallBastionArmy(armyId) {
  const ok = await allianceRequestNoReload(`/api/army/${armyId}/return`, 'POST');
  if (ok) { if (typeof loadArmies === 'function') loadArmies(); renderBastionSection(document.getElementById('alliance-bastion-box')); }
}

// Panneau de la carte quand on touche un Bastion
async function renderBastionMapPanel(tile, content) {
  const rel = typeof mapRelationOf === 'function' ? mapRelationOf(tile) : 'NEUTRAL';
  const mine = rel === 'SAME_ALLIANCE', friendly = mine || rel === 'ALLY';
  const id = chatSafeId(tile.id);
  const lives = tile.status === 'FUNDING' ? null : tile.lives;
  const actions = [];
  if (mine && tile.status === 'FUNDING') actions.push(`<button class="btn btn-primary" onclick="closeMapPanel(); openBastionSend('${id}', 'SUPPLY')">${resIconHtml('item_crate')} Ravitailler</button>`);
  if (friendly && tile.status !== 'FUNDING' && !tile.isSieged) actions.push(`<button class="btn btn-primary" onclick="closeMapPanel(); openBastionSend('${id}', 'GARRISON')">${resIconHtml('defense')} Garnison</button>`);
  if (!friendly && tile.status !== 'FUNDING') actions.push(`<button class="btn btn-danger" onclick="closeMapPanel(); openBastionSend('${id}', 'ATTACK')">${resIconHtml('attack')} Assiéger</button>`);
  // rassemblement d'alliance contre un Bastion ennemi (décision du 29 octobre 2026)
  const inAlliance = !!(typeof player !== 'undefined' && player?.allianceId) || !!bastionState?.inAlliance;
  if (!friendly && tile.status !== 'FUNDING' && inAlliance && typeof openRallyLaunch === 'function') actions.push(`<button class="btn btn-danger" onclick="closeMapPanel(); openRallyLaunch('${id}', ${tile.x}, ${tile.y}, '${escapeHtml(tile.allianceTag || '')}', 'BASTION')">${resIconHtml('rally')} Rassemblement</button>`);
  if (tile.isSieged && tile.status !== 'FUNDING') actions.push(`<button class="btn btn-danger" onclick="closeMapPanel(); openBastionSend('${id}', 'BREAK')">${resIconHtml('attack')} Briser le siège</button>`);
  if (mine) actions.push(`<button class="btn btn-secondary" onclick="closeMapPanel(); showTab('alliance'); showAllianceTab('bastion')">${resIconHtml('alliance')} Détails</button>`);
  content.innerHTML = `
    <h3>${resIconHtml('defense')} ${escapeHtml(tile.name)}</h3>
    <p>Position : (${tile.x}, ${tile.y}) · ${typeof diploBadge === 'function' ? diploBadge(rel === 'SELF' ? 'SAME_ALLIANCE' : rel) : ''}</p>
    <p>${escapeHtml(tile.allianceName || '')} — ${bastionStatusLabel(tile.status)}</p>
    ${lives !== null ? `<p>${resIconHtml('defense')} Vies : ${lives} / 10${tile.isSieged ? ` · <span class="bastion-sieged">assiégé</span>` : ''}</p>` : '<p class="diplo-help">Un chantier sans murs ne peut pas être attaqué.</p>'}
    ${!friendly && tile.status !== 'FUNDING' ? '<p class="diplo-help">Il faut au moins un engin de siège. Camp d\'1 h, puis assaut contre la garnison derrière un mur 50 fois plus solide qu\'un mur 20 ; 10 assauts gagnés le rasent. En rassemblement, toute votre alliance attaque ensemble.</p>' : ''}
    <div class="panel-actions">${actions.join('')}${typeof mapShareButton === 'function' ? mapShareButton(tile.x, tile.y) : ''}</div>
    <div class="bastion-rallies"></div>`;
  if (!friendly && typeof bastionRalliesHtml === 'function') { const box = content.querySelector('.bastion-rallies'); bastionRalliesHtml(tile.id).then(h => { if (box) box.innerHTML = h; }); }
}

// Choix de l'armée (et du chargement pour un convoi)
function openBastionSend(bastionId, mission) {
  const hasUnits = (a) => (a.units || []).some(u => u.count > 0);
  let ready = (armies || []).filter(a => a.status === 'IDLE' && !a.isGarrison && hasUnits(a));
  // briser le siège : aussi les armées de sa garnison dans ce Bastion (sortie)
  if (mission === 'BREAK') ready = [...(armies || []).filter(a => a.status === 'STATIONED' && a.targetBastionId === bastionId && hasUnits(a)), ...ready];
  const title = { SUPPLY: 'Ravitailler le Bastion', GARRISON: 'Garnison du Bastion', ATTACK: 'Assiéger le Bastion', BREAK: 'Briser le siège du Bastion' }[mission];
  if (!ready.length) {
    openSheetModal(title, `<p>Aucune armée disponible : formez une armée au Point de ralliement.</p>
      <div class="profile-actions"><button class="btn btn-primary" onclick="closeModal(); showTab('army')">Onglet Armée</button><button class="btn btn-secondary" onclick="closeModal()">Fermer</button></div>`);
    return;
  }
  const cityName = (id) => (cities || []).find(c => c.id === id)?.name || '';
  openSheetModal(title, `
    <label class="form-row">Armée <select id="bastion-army">${ready.map(a => `<option value="${chatSafeId(a.id)}" ${a.cityId === currentCity?.id ? 'selected' : ''}>${escapeHtml(a.name)}${a.status === 'STATIONED' ? ' — garnison du Bastion (sortie)' : cityName(a.cityId) ? ' — ' + escapeHtml(cityName(a.cityId)) : ''}</option>`).join('')}</select></label>
    ${mission === 'SUPPLY' ? `<div class="bastion-load">${BASTION_RES.map(([k, label]) => `<label class="form-row">${resIconHtml(k)} ${label} <input type="number" min="0" step="100" id="bastion-load-${k}" value="0"></label>`).join('')}</div>
      <p class="diplo-help">Les ressources sont prises dans la ville de l'armée, dans la limite de sa capacité de transport. Le surplus revient.</p>` : ''}
    ${mission === 'GARRISON' ? '<p class="diplo-help">L\'armée défend le Bastion (+10 % de défense) jusqu\'à ce que vous la rappeliez. Son entretien reste à votre charge.</p>' : ''}
    ${mission === 'ATTACK' ? '<p class="diplo-help">Il faut au moins un engin de siège dans l\'armée. Toute l\'alliance du Bastion est prévenue.</p>' : ''}
    ${mission === 'BREAK' ? '<p class="diplo-help">L\'armée attaque seule toutes les armées qui campent devant le Bastion, en terrain ouvert. Victorieuse, elle reste là d\'où elle a attaqué (dans le Bastion pour une sortie de la garnison, devant lui sinon) ; vaincue, elle rentre (à la capitale pour une sortie).</p>' : ''}
    <div class="profile-actions">
      <button class="btn ${mission === 'ATTACK' || mission === 'BREAK' ? 'btn-danger' : 'btn-primary'}" onclick="sendToBastion('${chatSafeId(bastionId)}', '${mission}')">Envoyer</button>
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
    </div>`);
}
// Sortie d'une armée de sa garnison (onglet Alliance › Bastion)
async function bastionSortie(bastionId, armyId) {
  const r = await allianceRequestNoReload(`/api/bastion/${bastionId}/send`, 'POST', { armyId, mission: 'BREAK' });
  if (r) { if (typeof loadArmies === 'function') loadArmies(); setTimeout(() => renderBastionSection(document.getElementById('alliance-bastion-box')), 400); }
}
async function sendToBastion(bastionId, mission) {
  const armyId = document.getElementById('bastion-army')?.value;
  const resources = mission === 'SUPPLY' ? Object.fromEntries(BASTION_RES.map(([k]) => [k, Math.max(0, Math.floor(Number(document.getElementById('bastion-load-' + k)?.value) || 0))])) : undefined;
  const r = await allianceRequestNoReload(`/api/bastion/${bastionId}/send`, 'POST', { armyId, mission, resources });
  if (r) {
    closeModal();
    if (typeof loadArmies === 'function') loadArmies();
    if (typeof loadPlayer === 'function' && mission === 'SUPPLY') loadPlayer();
    loadBastion(true);
  }
}
