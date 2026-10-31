// ============================================================
// 09l-rally.js — Rassemblement d'alliance contre un donjon d'invasion, un Bastion ennemi (façon Rise of Kingdoms,
// décision du 29 octobre 2026) ou un site ou un plan de Merveille gardé par les Immortels (décision du 30 octobre 2026) ;
// jamais contre une ville : lancer depuis le panneau de la cible (armée + attente),
// rejoindre, quitter, partir plus tôt, annuler ; liste dans le panneau de la cible et dans Alliance › Rassemblements. Serveur : src/services/rallyService.js, src/routes/rally.js.
// ============================================================
const RALLY_WAITS = [5, 10, 30, 60];
// cibles d'un rassemblement (kind renvoyé par /api/rallies : HORDE, BASTION, WONDER, PLAN) : the = la cible, at = où le groupe arrive
const RALLY_TARGETS = {
  HORDE: { the: 'le donjon', at: 'au donjon' },
  BASTION: { the: 'le Bastion', at: 'devant le Bastion' },
  WONDER: { the: 'le site de Merveille', at: 'au site de Merveille' },
  PLAN: { the: 'le plan', at: 'au plan' }
};
const rallyKind = (r) => (RALLY_TARGETS[r.kind] ? r.kind : r.targetBastionId ? 'BASTION' : 'HORDE');
function rallyWhat(r, kind) {
  if (kind === 'BASTION') return `Bastion [${escapeHtml(r.bastionTag || '?')}] (${r.x}, ${r.y})`;
  // site ou plan : puissance des Immortels qui le gardent encore (guardPower du serveur)
  const guard = r.guardPower > 0 ? ` · Immortels ${formatNum(r.guardPower)}` : '';
  if (kind === 'WONDER') return `site de Merveille (${r.x}, ${r.y})${guard}`;
  if (kind === 'PLAN') return `plan de construction (${r.x}, ${r.y})${guard}`;
  return `donjon niv. ${r.level || '?'} (${r.x}, ${r.y})${r.floor ? ` · étage ${r.floor}/3` : ''}`;
}
// armées libres pour un rassemblement : à l'arrêt dans leur ville, pas la garnison
function rallyArmies() {
  return (typeof armies !== 'undefined' ? armies : []).filter(a => a.status === 'IDLE' && !a.isGarrison && (a.units || []).some(u => u.count > 0)
    && (cities || []).some(c => c.id === a.cityId && c.x === a.x && c.y === a.y));
}
const armyOptionLabel = (a) => {
  const city = (cities || []).find(c => c.id === a.cityId);
  const n = (a.units || []).reduce((t, u) => t + u.count, 0);
  return `${a.name} — ${formatNum(n)} soldats${city ? ` (${city.name})` : ''}`;
};

function ralliesHtml(list, { compact = false } = {}) {
  if (!list.length) return '<p class="diplo-help">Aucun rassemblement en cours.</p>';
  return list.map(r => {
    const id = chatSafeId(r.id);
    const gathering = r.status === 'GATHERING';
    const kind = rallyKind(r), target = RALLY_TARGETS[kind];
    const timer = gathering ? `départ <span class="qd-timer" data-ends-at="${r.launchAt}">${formatTime(r.launchAt)}</span>` : `arrivée ${target.at} <span class="qd-timer" data-ends-at="${r.arrivalAt}">${formatTime(r.arrivalAt)}</span>`;
    const what = rallyWhat(r, kind);
    const actions = [];
    if (gathering && r.mine) actions.push(`<button class="btn btn-primary btn-sm" onclick="rallyAction('${id}', 'launch')">Partir maintenant</button>`, `<button class="btn btn-secondary btn-sm" onclick="rallyAction('${id}', 'cancel')">Annuler</button>`);
    else if (gathering && r.joined) actions.push(`<button class="btn btn-secondary btn-sm" onclick="rallyAction('${id}', 'leave')">Retirer mon armée</button>`);
    else if (gathering && r.armies.length < r.maxArmies) actions.push(`<button class="btn btn-primary btn-sm" onclick="openRallyJoin('${id}')">${resIconHtml('rally')} Rejoindre</button>`);
    else if (gathering) actions.push(`<span class="rally-full">Rassemblement complet (${r.maxArmies} armées au plus)</span>`);
    return `<div class="rally-card ${r.mine ? 'mine' : ''}">
      <div class="rally-head">${resIconHtml('rally')} <strong>Rassemblement de ${escapeHtml(r.leader)}</strong>
        <small>${compact ? '' : `${what} · `}${timer}</small></div>
      <div class="rally-meta" title="Taille fixée par la Place de rassemblement du lanceur">${r.armies.length} / ${r.maxArmies} armées · puissance ${formatNum(r.power)}</div>
      <ul class="rally-armies">${r.armies.map(a => `<li class="${a.mine ? 'me' : ''}">${escapeHtml(a.owner)} <small>${formatNum(a.units)} soldats · ${a.status === 'RALLY_JOIN' ? `en route, arrivée <span class="qd-timer" data-ends-at="${a.arrivalAt}">${formatTime(a.arrivalAt)}</span>` : a.status === 'RALLY_WAIT' ? 'arrivée' : `en marche vers ${target.the}`}</small></li>`).join('')}</ul>
      ${actions.length ? `<div class="profile-actions">${actions.join('')}</div>` : ''}
    </div>`;
  }).join('');
}

// ---- lancer ----
// kind : 'HORDE' (donjon d'invasion, par défaut), 'BASTION' (Bastion ennemi : level porte alors le tag de son alliance),
// 'WONDER' ou 'PLAN' (site ou plan de Merveille gardé par les Immortels)
function openRallyLaunch(targetId, x, y, level, kind = 'HORDE') {
  const list = rallyArmies();
  if (!list.length) { showToast('Aucune armée libre dans ses murs', 'error'); return; }
  if (!RALLY_TARGETS[kind]) kind = 'HORDE';
  const gather = 'Les membres de votre alliance envoient leurs armées dans votre ville ; à la fin de l\'attente, toutes celles arrivées partent ensemble';
  const intro = {
    BASTION: `Bastion [${escapeHtml(level || '?')}] en (${x}, ${y}). ${gather}, campent 1 h devant le Bastion puis livrent un seul assaut, mené par votre héros. Il faut au moins un engin de siège dans le groupe au départ.`,
    WONDER: `Site de Merveille en (${x}, ${y}), gardé par les Immortels. ${gather} et livrent un seul combat contre la garnison, mené par votre héros. Victoire : le site est libéré, à vous d'y fonder la Ville Merveille avec un colon.`,
    PLAN: `Plan de construction en (${x}, ${y}), gardé par les Immortels. ${gather} et livrent un seul combat contre la garnison, mené par votre héros. Victoire : le plan revient à votre capitale.`,
    HORDE: `Donjon barbare${level ? ` de niveau ${level}` : ''} en (${x}, ${y}). ${gather} et livrent un seul combat.`
  }[kind];
  openSheetModal('Lancer un rassemblement', `
    <p>${intro}</p>
    <label class="admin-field"><span>Votre armée (elle mène le rassemblement)</span>
      <select id="rally-army">${list.map(a => `<option value="${chatSafeId(a.id)}">${escapeHtml(armyOptionLabel(a))}</option>`).join('')}</select></label>
    <label class="admin-field"><span>Attente avant le départ</span>
      <select id="rally-wait">${RALLY_WAITS.map(w => `<option value="${w}" ${w === 10 ? 'selected' : ''}>${w} min</option>`).join('')}</select></label>
    <p class="diplo-help">Votre Place de rassemblement (niveau ${rallyPointLevel()}) fixe la taille du rassemblement : <strong>${rallyMaxArmiesAt(rallyPointLevel())} armées au plus</strong>, la vôtre comprise (${rallyMaxArmiesAt(20)} au niveau 20). Vous pouvez partir plus tôt ou annuler tant que le rassemblement attend.</p>
    <div class="profile-actions"><button class="btn btn-danger" onclick="confirmRallyLaunch('${chatSafeId(targetId)}', '${kind}')">${resIconHtml('rally')} Lancer le rassemblement</button><button class="btn btn-secondary" onclick="closeModal()">Annuler</button></div>`);
}
async function confirmRallyLaunch(targetId, kind = 'HORDE') {
  const armyId = document.getElementById('rally-army')?.value, waitMinutes = Number(document.getElementById('rally-wait')?.value);
  const ok = await allianceRequestNoReload('/api/rallies', 'POST', { armyId, waitMinutes, ...(kind === 'BASTION' ? { bastionId: targetId } : { nodeId: targetId }) });
  if (ok) { closeModal(); if (typeof loadArmies === 'function') loadArmies(); refreshRallyViews(); }
}
// ---- rejoindre ----
function openRallyJoin(rallyId) {
  const list = rallyArmies();
  if (!list.length) { showToast('Aucune armée libre dans ses murs', 'error'); return; }
  openSheetModal('Rejoindre le rassemblement', `
    <label class="admin-field"><span>Armée à envoyer</span>
      <select id="rally-join-army">${list.map(a => `<option value="${chatSafeId(a.id)}">${escapeHtml(armyOptionLabel(a))}</option>`).join('')}</select></label>
    <p class="diplo-help">Elle marche jusqu'à la ville du lanceur et doit y arriver avant le départ. Une armée par joueur.</p>
    <div class="profile-actions"><button class="btn btn-primary" onclick="confirmRallyJoin('${chatSafeId(rallyId)}')">${resIconHtml('rally')} Envoyer</button><button class="btn btn-secondary" onclick="closeModal()">Annuler</button></div>`);
}
async function confirmRallyJoin(rallyId) {
  const ok = await allianceRequestNoReload(`/api/rallies/${rallyId}/join`, 'POST', { armyId: document.getElementById('rally-join-army')?.value });
  if (ok) { closeModal(); if (typeof loadArmies === 'function') loadArmies(); refreshRallyViews(); }
}
async function rallyAction(rallyId, action) {
  if (action === 'cancel' && !(await confirmModal('Annuler le rassemblement ? Toutes les armées rentrent.', { title: 'Rassemblement', okLabel: 'Annuler le rassemblement', cancelLabel: 'Garder', danger: true }))) return;
  if (await allianceRequestNoReload(`/api/rallies/${rallyId}/${action}`, 'POST')) { if (typeof loadArmies === 'function') loadArmies(); refreshRallyViews(); }
}
function refreshRallyViews() {
  const box = document.getElementById('alliance-rallies-box');
  if (box && box.offsetParent !== null) renderAllianceRallies(box);
  const panel = document.querySelector('[data-horde-node]');
  if (panel && typeof renderHordeNodePanel === 'function') renderHordeNodePanel({ id: panel.dataset.hordeNode }, panel.parentElement);
  const wonder = document.querySelector('[data-wonder-node]');   // site ou plan de Merveille (09i-world.js)
  if (wonder) fillNodeRallies(wonder.parentElement?.querySelector('.node-rallies'), wonder.dataset.wonderNode);
}

// ---- Alliance › Rassemblements ----
async function renderAllianceRallies(box) {
  if (!box) return;
  let d;
  try { d = await fetchJson('/api/rallies'); } catch (e) { box.innerHTML = '<p class="empty-state">Rassemblements indisponibles.</p>'; return; }
  box.innerHTML = `<h3>${resIconHtml('rally')} Rassemblements</h3>
    <p class="diplo-help">Pendant les invasions barbares (chaque week-end), un donjon ne s'attaque qu'en rassemblement. Un Bastion ennemi peut aussi être assiégé en rassemblement (au moins un engin de siège dans le groupe), et les Immortels qui gardent un site ou un plan de Merveille combattus de même. Lancez-en un depuis le panneau de la cible sur la carte, ou rejoignez celui d'un membre.${d.maxArmies ? ` Ceux que vous lancez réunissent ${d.maxArmies} armées au plus (votre Place de rassemblement).` : ''}</p>
    ${ralliesHtml(d.rallies)}`;
}
// le bloc des rassemblements de son alliance contre une cible (panneau de la carte) : param = nodeId ou bastionId
async function targetRalliesHtml(param, id) {
  try { const d = await fetchJson(`/api/rallies?${param}=${encodeURIComponent(id)}`); return d.rallies.length ? `<h4>${resIconHtml('rally')} Rassemblements de votre alliance</h4>${ralliesHtml(d.rallies, { compact: true })}` : ''; }
  catch (e) { return ''; }
}
function hordeRalliesHtml(nodeId) { return targetRalliesHtml('nodeId', nodeId); }   // un donjon, un site ou un plan de Merveille
// remplit un bloc du panneau de la carte avec les rassemblements contre un nœud (resté vide s'il n'y en a pas)
function fillNodeRallies(box, nodeId) {
  if (!box || !nodeId) return;
  hordeRalliesHtml(nodeId).then(h => { if (box.isConnected) box.innerHTML = h; });
}
function bastionRalliesHtml(bastionId) { return targetRalliesHtml('bastionId', bastionId); }   // un Bastion
