// ============================================================
// 09d-alliance.js — Alliance (décisions du 26 octobre 2026) : liste des membres, diplomatie à proposer et accepter,
// fiche publique d'une alliance, couleurs de la diplomatie sur la carte et les profils ; aide d'alliance et boutique plus
// bas. Portée globale partagée avec les autres scripts (ordre de index.html).
// ============================================================

// Couleurs du GDD (alliance_config.diplomacy.statuses) : ennemi rouge, neutre gris, allié bleu clair ; sa propre alliance
// en vert et soi-même en or
const DIPLO_STYLE = {
  SELF: { color: '#c9a227', label: 'Vous' },
  SAME_ALLIANCE: { color: '#3f9b4f', label: 'Votre alliance' },
  ALLY: { color: '#4fb3e8', label: 'Allié' },
  NEUTRAL: { color: '#8a8a8a', label: 'Neutre' },
  ENEMY: { color: '#d9443a', label: 'Ennemi' }
};
function diploBadge(status) {
  const st = DIPLO_STYLE[status] || DIPLO_STYLE.NEUTRAL;
  return `<span class="diplo-badge" style="--diplo:${st.color}">${st.label}</span>`;
}

// ---- relations de son alliance, pour la carte : { myAllianceId, relations: { id: 'ALLY' | 'ENEMY' } } ----
let allianceRelations = { myAllianceId: null, relations: {} }, allianceRelationsAt = 0;
async function loadAllianceRelations(force = false) {
  if (!token || (!force && Date.now() - allianceRelationsAt < 60000)) return allianceRelations;
  allianceRelationsAt = Date.now();
  try { allianceRelations = await fetchJson('/api/alliance/relations'); } catch (e) { /* la carte garde les dernières couleurs */ }
  return allianceRelations;
}
// Statut d'une ville de la carte vu par le joueur
function mapRelationOf(tile) {
  if (!tile) return 'NEUTRAL';
  if (tile.playerId && tile.playerId === player?.id) return 'SELF';
  const aid = tile.allianceId || tile.player?.allianceId || null;
  if (!aid) return 'NEUTRAL';
  const mine = allianceRelations.myAllianceId || player?.alliance?.allianceId || null;
  if (mine && aid === mine) return 'SAME_ALLIANCE';
  return allianceRelations.relations?.[aid] || 'NEUTRAL';
}

// ---- dates arrondies ----
function lastSeenLabel(iso, serverNow) {
  if (!iso) return '—';
  const min = Math.max(0, ((serverNow ? new Date(serverNow) : new Date()) - new Date(iso)) / 60000);
  if (min < 15) return '<span class="online-dot"></span> En ligne';
  if (min < 60) return 'il y a moins d\'1 h';
  if (min < 24 * 60) return `il y a ${Math.floor(min / 60)} h`;
  return `il y a ${Math.floor(min / 1440)} j`;
}
function sinceLabel(iso, serverNow) {
  const days = Math.floor(Math.max(0, ((serverNow ? new Date(serverNow) : new Date()) - new Date(iso)) / 86400000));
  return days < 1 ? 'aujourd\'hui' : days === 1 ? '1 jour' : `${days} jours`;
}

// ---- liste des membres (GDD membership.memberListFields : dernière connexion, population, ancienneté, rôle) ----
function renderAllianceMembers(myAlliance, myRole, serverTime) {
  const isLeader = myRole === 'LEADER';
  const roleLabel = (role) => role === 'LEADER' ? `${resIconHtml('crown')} Chef` : role === 'OFFICER' ? `${resIconHtml('star')} Officier` : `${resIconHtml('defense')} Membre`;
  const order = { LEADER: 0, OFFICER: 1, MEMBER: 2 };
  const members = [...myAlliance.members].sort((a, b) => (order[a.role] ?? 3) - (order[b.role] ?? 3) || (b.player?.population || 0) - (a.player?.population || 0));
  return `
    <div class="alliance-section">
      <h4>${resIconHtml('population')} Membres (${members.length})</h4>
      <div class="member-table">
        <div class="member-head"><span>Joueur</span><span>Rôle</span><span>Population</span><span>Dans l'alliance</span><span>Connexion</span><span></span></div>
        ${members.map(m => {
          const isMe = m.playerId === player?.id;
          const canPromote = isLeader && !isMe && m.role !== 'LEADER';
          const canKick = !isMe && m.role !== 'LEADER' && (isLeader || (myRole === 'OFFICER' && m.role === 'MEMBER'));
          const pid = chatSafeId(m.playerId);
          return `
          <div class="member-line${isMe ? ' me' : ''}">
            <span class="member-name"><a href="#" onclick="event.preventDefault(); viewPlayerProfile('${pid}')">${escapeHtml(m.player?.name || '?')}</a></span>
            <span class="member-role ${String(m.role).toLowerCase()}">${roleLabel(m.role)}</span>
            <span>${formatNum(m.player?.population || 0)}</span>
            <span>${sinceLabel(m.joinedAt, serverTime)}</span>
            <span>${isMe ? '<span class="online-dot"></span> En ligne' : lastSeenLabel(m.player?.lastSeenAt, serverTime)}</span>
            <span class="member-actions">
              ${canPromote ? `<button class="btn btn-secondary btn-sm" onclick="promoteMember('${pid}', '${m.role === 'OFFICER' ? 'OFFICER' : 'MEMBER'}')">${m.role === 'OFFICER' ? 'Céder la direction' : 'Promouvoir'}</button>` : ''}
              ${canKick ? `<button class="btn btn-danger btn-sm" onclick="kickMember('${pid}')">Exclure</button>` : ''}
            </span>
          </div>`;
        }).join('')}
      </div>
    </div>`;
}

// ---- diplomatie ----
function renderAllianceDiplomacy(myAlliance, otherAlliances, dip) {
  const statusOf = (id) => (dip.diplomacy || []).find(d => d.allianceId === id) || { status: 'NEUTRAL', declared: 'NEUTRAL', declaredByThem: 'NEUTRAL' };
  const incomingFrom = new Map((dip.incoming || []).map(r => [r.alliance.id, r]));
  const outgoingTo = new Map((dip.outgoing || []).map(r => [r.alliance.id, r]));
  const allies = otherAlliances.filter(a => statusOf(a.id).status === 'ALLY');
  const manage = !!dip.canManage;
  const name = (a) => `<a href="#" onclick="event.preventDefault(); openAllianceSheet('${chatSafeId(a.id)}')"><strong>[${escapeHtml(a.tag)}]</strong> ${escapeHtml(a.name)}</a>`;
  const actions = (a) => {
    const st = statusOf(a.id), id = chatSafeId(a.id), tag = chatJsArg(`[${a.tag}] ${a.name}`);
    if (!manage) return '';
    const inc = incomingFrom.get(a.id), out = outgoingTo.get(a.id);
    const btns = [];
    if (inc) btns.push(`<button class="btn btn-primary btn-sm" onclick="acceptAllyRequest('${chatSafeId(inc.id)}')">Accepter l'alliance</button>`, `<button class="btn btn-secondary btn-sm" onclick="dropAllyRequest('${chatSafeId(inc.id)}', true)">Refuser</button>`);
    if (st.status === 'ALLY') btns.push(`<button class="btn btn-secondary btn-sm" onclick="setDiplomacy('${id}', 'NEUTRAL', ${tag})">Rompre l'alliance</button>`);
    else if (!inc && out) btns.push(`<button class="btn btn-secondary btn-sm" onclick="dropAllyRequest('${chatSafeId(out.id)}', false)">Retirer la proposition</button>`);
    else if (!inc && st.declaredByThem !== 'ENEMY') btns.push(`<button class="btn btn-secondary btn-sm" onclick="setDiplomacy('${id}', 'ALLY', ${tag})" ${allies.length >= (dip.maxAllies || 3) ? 'disabled title="3 alliés au plus"' : ''}>Proposer une alliance</button>`);
    if (st.declared === 'ENEMY') btns.push(`<button class="btn btn-secondary btn-sm" onclick="setDiplomacy('${id}', 'NEUTRAL', ${tag})">Faire la paix</button>`);
    else btns.push(`<button class="btn btn-danger btn-sm" onclick="setDiplomacy('${id}', 'ENEMY', ${tag})">Déclarer ennemie</button>`);
    return btns.join('');
  };
  const note = (a) => {
    const st = statusOf(a.id), out = outgoingTo.get(a.id), inc = incomingFrom.get(a.id);
    if (inc) return '<span class="diplo-note">vous propose une alliance</span>';
    if (out) return '<span class="diplo-note">proposition envoyée</span>';
    if (st.status === 'ENEMY' && st.declared !== 'ENEMY') return '<span class="diplo-note">vous a déclaré ennemis</span>';
    return '';
  };
  const row = (a) => `
    <div class="diplomacy-row">
      <div class="diplomacy-alliance">${name(a)} <span class="diplo-members">${a.members.length} membre${a.members.length > 1 ? "s" : ""}</span></div>
      <div class="diplomacy-status">${diploBadge(statusOf(a.id).status)} ${note(a)}</div>
      ${manage ? `<div class="diplomacy-actions">${actions(a)}</div>` : ''}
    </div>`;
  // alliances avec un lien d'abord (propositions, alliés, ennemis), puis les autres
  const weight = (a) => incomingFrom.has(a.id) ? 0 : statusOf(a.id).status === 'ALLY' ? 1 : statusOf(a.id).status === 'ENEMY' ? 2 : outgoingTo.has(a.id) ? 3 : 4;
  const sorted = [...otherAlliances].sort((a, b) => weight(a) - weight(b) || b.members.length - a.members.length);
  const shown = manage ? sorted : sorted.filter(a => weight(a) < 4);
  return `
    <div class="alliance-section">
      <h4>${resIconHtml('alliance')} Diplomatie</h4>
      <p class="diplo-help">Une alliance se propose et doit être acceptée par l'autre alliance (${dip.maxAllies || 3} alliés au plus). Déclarer une alliance ennemie se fait seul et rompt une alliance en cours. Tout le monde voit ces statuts ; seuls le chef et les officiers les changent.</p>
      <div class="diplo-legend">${['SAME_ALLIANCE', 'ALLY', 'NEUTRAL', 'ENEMY'].map(diploBadge).join(' ')} <span class="diplo-note">couleurs des villes sur la carte</span></div>
      <p class="diplo-count">Alliés : <strong>${allies.length} / ${dip.maxAllies || 3}</strong></p>
      <div class="diplomacy-list">
        ${shown.map(row).join('') || `<p class="empty-state">${manage ? 'Aucune autre alliance' : 'Aucun allié ni ennemi pour l\'instant.'}</p>`}
      </div>
      ${manage ? '' : '<p class="diplo-help">Seuls le chef et les officiers peuvent proposer une alliance ou déclarer une alliance ennemie.</p>'}
    </div>`;
}

async function setDiplomacy(targetAllianceId, status, label) {
  const name = label || 'cette alliance';
  if (status === 'ENEMY' && !(await confirmModal(`Déclarer ${name} ennemie ? Vos joueurs ne pourront plus lui envoyer de ressources et vos armées combattront les siennes en chemin.`, { title: 'Déclarer ennemie', okLabel: 'Déclarer', danger: true }))) return;
  if (status === 'NEUTRAL' && label && !(await confirmModal(`Revenir à une relation neutre avec ${name} ? Une alliance en cours est rompue des deux côtés et les renforts rentrent chez eux.`, { title: 'Relation neutre', okLabel: 'Confirmer' }))) return;
  try {
    const res = await fetch(`${API}/api/alliance/diplomacy/${targetAllianceId}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ status }) });
    const data = await res.json().catch(() => ({}));
    showToast(res.ok ? data.message : (data.error || 'Erreur'), res.ok ? 'success' : 'error');
  } catch (e) { showToast('Erreur réseau', 'error'); }
  loadAllianceRelations(true);
  loadAlliance();
}
async function acceptAllyRequest(id) {
  await allianceRequest(`/api/alliance/diplomacy/requests/${id}/accept`, 'POST');
}
async function dropAllyRequest(id, incoming) {
  if (incoming && !(await confirmModal('Refuser cette proposition d\'alliance ?', { title: 'Refuser', okLabel: 'Refuser', danger: true }))) return;
  await allianceRequest(`/api/alliance/diplomacy/requests/${id}`, 'DELETE');
}
async function allianceRequest(path, method, body) {
  try {
    const res = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    showToast(res.ok ? (data.message || 'Fait') : (data.error || 'Erreur'), res.ok ? 'success' : 'error');
    if (res.ok) { loadAllianceRelations(true); loadAlliance(); }
    return res.ok ? data : null;
  } catch (e) { showToast('Erreur réseau', 'error'); return null; }
}

// ---- fiche publique d'une alliance (membres, alliés, ennemis) ----
async function openAllianceSheet(allianceId) {
  let a;
  try { a = await fetchJson(`/api/alliance/${allianceId}`); } catch (e) { showToast('Alliance introuvable', 'error'); return; }
  const rel = mapRelationOf({ allianceId: a.id });
  const list = (arr) => arr.length ? arr.map(o => `<a href="#" onclick="event.preventDefault(); openAllianceSheet('${chatSafeId(o.id)}')">[${escapeHtml(o.tag)}] ${escapeHtml(o.name)}</a>`).join(', ') : '—';
  const role = { LEADER: 'Chef', OFFICER: 'Officier', MEMBER: 'Membre' };
  openSheetModal(`[${a.tag}] ${a.name}`, `
    <div class="alliance-sheet">
      <p>${diploBadge(rel)} · ${a.members.length} membre${a.members.length > 1 ? "s" : ""}</p>
      ${a.description ? `<p class="diplo-help">${escapeHtml(a.description)}</p>` : ''}
      <p><strong>Alliés :</strong> ${list(a.allies || [])}</p>
      <p><strong>Ennemis :</strong> ${list(a.enemies || [])}</p>
      <h4>Membres</h4>
      <div class="profile-cities">
        ${[...a.members].sort((x, y) => (y.player?.population || 0) - (x.player?.population || 0)).map(m => `
          <div class="profile-city"><a href="#" onclick="event.preventDefault(); viewPlayerProfile('${chatSafeId(m.playerId)}')">${escapeHtml(m.player?.name || '?')}</a> · ${role[m.role] || ''} · ${formatNum(m.player?.population || 0)} hab.</div>`).join('')}
      </div>
      <div class="profile-actions"><button class="btn btn-secondary" onclick="closeModal()">Fermer</button></div>
    </div>`);
}

// ============================================================
// Renfort allié : envoyer une armée défendre la ville d'un membre de l'alliance ou d'un allié, voir et renvoyer les
// renforts reçus (onglet Armée)
// ============================================================
function openSupportPicker(cityId, cityName, sieged = false) {
  if (sieged) { showToast(`${cityName} est assiégée : aucun renfort n'entre pendant le siège`, 'error'); return; }
  const ready = (armies || []).filter(a => a.status === 'IDLE' && !a.isGarrison && (a.units || []).some(u => u.count > 0));
  if (!ready.length) { showToast('Aucune armée disponible : composez une armée dans une de vos villes', 'error'); return; }
  const cityOf = (id) => (cities || []).find(c => c.id === id)?.name || '';
  openSheetModal(`Renforcer ${cityName}`, `
    <p class="diplo-help">L'armée part défendre la ville et y reste jusqu'à ce que vous la rappeliez (ou que l'hôte la renvoie). Sa nourriture reste payée par sa ville d'origine. Pendant un siège, aucun renfort n'entre.</p>
    <div class="support-pick">
      ${ready.map(a => {
        const n = a.units.reduce((t, u) => t + u.count, 0);
        return `<label class="support-option"><input type="radio" name="support-army" value="${chatSafeId(a.id)}"> <strong>${escapeHtml(a.name)}</strong> · ${formatNum(n)} soldats${a.heroId ? ' · héros' : ''} <small>(${escapeHtml(cityOf(a.cityId))})</small></label>`;
      }).join('')}
    </div>
    <div class="profile-actions">
      <button class="btn btn-primary" onclick="confirmSupport('${chatSafeId(cityId)}')">${resIconHtml('defense')} Envoyer en renfort</button>
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
    </div>`);
  document.querySelector('input[name="support-army"]')?.setAttribute('checked', 'checked');
}
async function confirmSupport(cityId) {
  const armyId = document.querySelector('input[name="support-army"]:checked')?.value;
  if (!armyId) { showToast('Choisissez une armée', 'error'); return; }
  try {
    const res = await fetch(`${API}/api/army/${armyId}/support`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ targetCityId: cityId }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(data.error || 'Erreur', 'error'); return; }
    closeModal();
    showToast(`${data.message} (arrivée dans ${formatTime(data.arrivalAt)})`, 'success');
    if (typeof loadArmies === 'function') await loadArmies();
    if (typeof loadMap === 'function' && document.getElementById('tab-map')?.classList.contains('active')) loadMap();
  } catch (e) { showToast('Erreur réseau', 'error'); }
}

let supportReceived = [], supportReceivedAt = 0;
async function renderSupportReceived(container) {
  if (!container) return;
  if (Date.now() - supportReceivedAt > 30000) {
    supportReceivedAt = Date.now();
    try { supportReceived = await fetchJson('/api/army/support/received'); } catch (e) { /* garde la dernière liste */ }
  }
  let box = document.getElementById('support-received');
  if (!supportReceived.length) { box?.remove(); return; }
  if (!box) { box = document.createElement('div'); box.id = 'support-received'; box.className = 'support-received'; container.parentNode.insertBefore(box, container.nextSibling); }
  box.innerHTML = `
    <h4>${resIconHtml('defense')} Renforts alliés reçus</h4>
    ${supportReceived.map(a => {
      const n = (a.units || []).reduce((t, u) => t + u.count, 0);
      return `<div class="support-line">
        <span><strong>${escapeHtml(a.name)}</strong> de <a href="#" onclick="event.preventDefault(); viewPlayerProfile('${chatSafeId(a.owner?.id)}')">${escapeHtml(a.owner?.name || '?')}</a> · ${formatNum(n)} soldats${a.heroed ? ' · héros' : ''}</span>
        <span class="support-where">${escapeHtml(a.city?.name || '')} · ${a.status === 'STATIONED' ? 'en place' : `arrive dans <span class="qd-timer" data-ends-at="${a.arrivalAt}">${formatTime(a.arrivalAt)}</span>`}</span>
        ${a.status === 'STATIONED' ? `<button class="btn btn-secondary btn-sm" onclick="sendSupportBack('${chatSafeId(a.id)}')">Renvoyer</button>` : ''}
      </div>`;
    }).join('')}`;
}
async function sendSupportBack(armyId) {
  if (!(await confirmModal('Renvoyer ce renfort chez son propriétaire ? Il ne défendra plus votre ville.', { title: 'Renvoyer le renfort', okLabel: 'Renvoyer' }))) return;
  const ok = await allianceRequest(`/api/army/support/${armyId}/send-back`, 'POST');
  if (ok) { supportReceivedAt = 0; if (typeof renderArmies === 'function') renderArmies(); }
}

// ============================================================
// Aide d'alliance : demander de l'aide sur ses constructions, recherches et soins ; aider les autres (« Tout aider »),
// ce qui rapporte des points d'alliance
// ============================================================
const HELP_KIND = { BUILD: { icon: 'build', label: 'Construction' }, RESEARCH: { icon: 'tools', label: 'Recherche' }, HEAL: { icon: 'endurance', label: 'Soins' } };
function setBadge(id, n) {
  const el = document.getElementById(id);
  if (!el) return;
  el.textContent = n > 99 ? '99+' : String(n);
  el.style.display = n > 0 ? '' : 'none';
}
function updateAllianceHelpBadge(n = player?.allianceHelpPending || 0) {
  setBadge('alliance-help-badge', n);
  setBadge('alliance-nav-badge', n);
}

let allianceHelpData = null;
async function loadAllianceHelp() {
  const box = document.getElementById('alliance-help-box');
  if (!box) return;
  try { allianceHelpData = await fetchJson('/api/alliance/help'); } catch (e) { renderLoadError(box, 'loadAllianceHelp()'); return; }
  const d = allianceHelpData;
  const others = (d.requests || []).filter(r => !r.mine);
  const canHelp = others.filter(r => !r.helped && r.helps < r.maxHelps);
  if (player) player.allianceHelpPending = canHelp.length;
  updateAllianceHelpBadge(canHelp.length);
  const todo = (d.targets || []).filter(t => !t.asked);
  const kind = (k) => `${resIconHtml(HELP_KIND[k]?.icon || 'build')} ${HELP_KIND[k]?.label || k}`;
  const bar = (r) => `<span class="help-bar"><span style="width:${Math.min(100, Math.round(100 * r.helps / Math.max(1, r.maxHelps)))}%"></span></span> <small>${r.helps} / ${r.maxHelps}</small>`;
  box.innerHTML = `
    <h4>${resIconHtml('build')} Aide d'alliance</h4>
    <p class="diplo-help">Chaque aide d'un membre retire ${d.reductionPct || 1} % du temps restant (${Math.round((d.minSeconds || 60) / 60)} minute au moins) à une construction, une recherche ou des soins. Votre Ambassade (niveau ${d.embassyLevel || 0}) vous permet de recevoir jusqu'à <strong>${d.maxHelps || 0}</strong> aides par demande.</p>
    <div class="help-points">${resIconHtml('gold')} Points d'alliance : <strong>${formatNum(d.alliancePoints || 0)}</strong> <small>(+${d.pointsPerHelp || 10} par aide, ${formatNum(d.pointsToday || 0)} / ${formatNum(d.pointsCap || 300)} sur 24 h)</small> <button class="btn btn-secondary btn-sm" onclick="showAllianceTab('shop')">Boutique</button></div>

    <h5>Vos demandes</h5>
    ${(d.targets || []).length ? `
      <div class="help-list">
        ${d.targets.map(t => `<div class="help-line">
          <span class="help-kind">${kind(t.kind)}</span>
          <span class="help-label">${escapeHtml(t.label)}</span>
          <span class="help-time"><span class="qd-timer" data-ends-at="${t.endsAt}">${formatTime(t.endsAt)}</span></span>
          <span class="help-state">${t.asked ? bar({ helps: t.helps, maxHelps: t.maxHelps ?? d.maxHelps }) : `<button class="btn btn-secondary btn-sm" onclick="askAllianceHelp('${t.kind}', '${chatSafeId(t.targetId)}')" ${d.maxHelps ? '' : 'disabled'}>Demander</button>`}</span>
        </div>`).join('')}
      </div>
      ${todo.length > 1 && d.maxHelps ? `<button class="btn btn-primary" onclick="askAllianceHelp()">Demander de l'aide pour tout (${todo.length})</button>` : ''}
    ` : '<p class="empty-state">Rien en cours : lancez une construction, une recherche ou des soins pour demander de l\'aide.</p>'}

    <h5>Aider vos alliés</h5>
    ${others.length ? `
      ${canHelp.length ? `<button class="btn btn-primary" onclick="helpAllAlliance()">${resIconHtml('build')} Tout aider (${canHelp.length})</button>` : '<p class="diplo-help">Vous avez aidé toutes les demandes en cours.</p>'}
      <div class="help-list">
        ${others.map(r => `<div class="help-line${r.helped ? ' done' : ''}">
          <span class="help-kind">${kind(r.kind)}</span>
          <span class="help-label"><strong>${escapeHtml(r.player?.name || '?')}</strong> · ${escapeHtml(r.label)}</span>
          <span class="help-time"><span class="qd-timer" data-ends-at="${r.endsAt}">${formatTime(r.endsAt)}</span></span>
          <span class="help-state">${bar(r)} ${r.helped ? '<small>aidé</small>' : `<button class="btn btn-secondary btn-sm" onclick="helpAllianceRequest('${chatSafeId(r.id)}')">Aider</button>`}</span>
        </div>`).join('')}
      </div>
    ` : '<p class="empty-state">Aucune demande d\'aide dans l\'alliance pour l\'instant.</p>'}`;
}
async function askAllianceHelp(kind, targetId) {
  const r = await allianceRequestNoReload('/api/alliance/help/request', 'POST', kind ? { kind, targetId } : {});
  if (r) loadAllianceHelp();
}
async function helpAllianceRequest(id) {
  const r = await allianceRequestNoReload(`/api/alliance/help/${id}`, 'POST');
  if (r) loadAllianceHelp();
}
async function helpAllAlliance() {
  const r = await allianceRequestNoReload('/api/alliance/help/all', 'POST');
  if (r) loadAllianceHelp();
}
// Comme allianceRequest, sans recharger tout l'onglet
async function allianceRequestNoReload(path, method, body) {
  try {
    const res = await fetch(`${API}${path}`, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: body ? JSON.stringify(body) : undefined });
    const data = await res.json().catch(() => ({}));
    showToast(res.ok ? (data.message || 'Fait') : (data.error || 'Erreur'), res.ok ? 'success' : 'error');
    return res.ok ? data : null;
  } catch (e) { showToast('Erreur réseau', 'error'); return null; }
}
// Bouton « Aide » à côté d'une construction, d'une recherche ou des soins en cours (seulement dans une alliance)
function helpAskButton(kind, targetId) {
  if (!player?.alliance) return '';
  return `<button type="button" class="btn-small help-ask" title="Demander de l'aide à l'alliance" aria-label="Demander de l'aide à l'alliance" onclick="event.stopPropagation(); askAllianceHelp('${kind}', '${chatSafeId(targetId)}')">${resIconHtml('alliance')}</button>`;
}

// ============================================================
// Boutique d'alliance : ressources, objets de héros, plaques de nom et bannières (points d'alliance)
// ============================================================
const SHOP_SECTIONS = [
  { type: 'resources', title: 'Ressources', note: 'Livrées dans la ville choisie, dans la limite de son entrepôt.' },
  { type: 'hero_item', title: 'Objets de héros', note: 'Rangés dans le sac de votre héros.' },
  { type: 'nameplate', title: 'Plaques de nom', note: 'La plaque sous le nom de vos villes, sur la carte. Achetée une fois, gardée pour toujours.' },
  { type: 'banner', title: 'Bannières', note: 'Plantées devant vos villes, sur la carte. Achetée une fois, gardée pour toujours.' }
];
async function loadAllianceShop() {
  const box = document.getElementById('alliance-shop-box');
  if (!box) return;
  let d;
  try { d = await fetchJson('/api/alliance/shop'); } catch (e) { renderLoadError(box, 'loadAllianceShop()'); return; }
  const preview = (it) => it.type === 'nameplate' ? `<span class="plate-preview plate-${escapeHtml(it.style || '')}">${escapeHtml(currentCity?.name || 'Ma ville')}</span>`
    : it.type === 'banner' ? (it.available && it.image ? `<img class="shop-banner" src="${escapeHtml(it.image)}" alt="">` : '<span class="shop-soon">image à venir</span>')
    : it.type === 'hero_item' ? (typeof getItemIcon === 'function' ? getItemIcon(it.itemKey) : resIconHtml('item_crate')) : resIconHtml('item_crate');
  const action = (it) => {
    if (it.type === 'nameplate' || it.type === 'banner') {
      if (it.owned) return it.equipped ? `<button class="btn btn-secondary btn-sm" onclick="equipShopItem('${it.type}', null)">Retirer</button>` : `<button class="btn btn-secondary btn-sm" onclick="equipShopItem('${it.type}', '${chatSafeId(it.key)}')">Mettre</button>`;
      if (!it.available) return '<button class="btn btn-secondary btn-sm" disabled>Bientôt</button>';
    }
    return `<button class="btn btn-primary btn-sm" onclick="buyShopItem('${chatSafeId(it.key)}', '${it.type}')" ${d.points < it.price ? 'disabled' : ''}>${formatNum(it.price)} pts</button>`;
  };
  box.innerHTML = `
    <h4>${resIconHtml('gold')} Boutique d'alliance</h4>
    <div class="help-points">Vos points d'alliance : <strong>${formatNum(d.points)}</strong> <small>gagnés en aidant les membres de votre alliance (onglet Aide)</small></div>
    ${SHOP_SECTIONS.map(sec => {
      const items = d.items.filter(i => i.type === sec.type);
      if (!items.length) return '';
      return `<h5>${sec.title}</h5><p class="diplo-help">${sec.note}</p>
        <div class="shop-grid">${items.map(it => `
          <div class="shop-card${it.equipped ? ' equipped' : ''}">
            <div class="shop-preview">${preview(it)}</div>
            <div class="shop-name">${escapeHtml(it.name)}${it.equipped ? ' <small>(en place)</small>' : it.owned ? ' <small>(acquis)</small>' : ''}</div>
            <div class="shop-desc">${escapeHtml(it.description || '')}</div>
            <div class="shop-action">${action(it)}</div>
          </div>`).join('')}</div>`;
    }).join('')}`;
}
async function buyShopItem(key, type) {
  let cityId;
  if (type === 'resources') {
    const mine = cities || [];
    if (mine.length > 1) {
      const pick = await new Promise((resolve) => {
        openSheetModal('Livrer dans quelle ville ?', `
          <div class="support-pick">${mine.map(c => `<label class="support-option"><input type="radio" name="shop-city" value="${chatSafeId(c.id)}" ${c.id === currentCity?.id ? 'checked' : ''}> ${escapeHtml(c.name)}</label>`).join('')}</div>
          <div class="profile-actions"><button class="btn btn-primary" id="shop-city-ok">Livrer</button><button class="btn btn-secondary" id="shop-city-cancel">Annuler</button></div>`);
        document.getElementById('shop-city-ok').onclick = () => { const v = document.querySelector('input[name="shop-city"]:checked')?.value; closeModal(); resolve(v || null); };
        document.getElementById('shop-city-cancel').onclick = () => { closeModal(); resolve(null); };
      });
      if (!pick) return;
      cityId = pick;
    } else cityId = currentCity?.id || mine[0]?.id;
  }
  const r = await allianceRequestNoReload('/api/alliance/shop/buy', 'POST', { key, cityId });
  if (r) {
    loadAllianceShop();
    if (type === 'resources' && typeof refreshData === 'function') refreshData(true);
    if (type === 'hero_item' && typeof loadPlayer === 'function') loadPlayer();
  }
}
async function equipShopItem(slot, key) {
  const r = await allianceRequestNoReload('/api/alliance/shop/equip', 'POST', { slot, key });
  if (r) loadAllianceShop();
}
