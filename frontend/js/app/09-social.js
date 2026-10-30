// ============================================================
// 09-social.js — Social : alliance, classement, rapports
// Découpé depuis app.js (lignes 8256-8795) — portée globale partagée,
// l'ordre de chargement dans index.html doit être respecté.
// ============================================================
// ========== ALLIANCE ==========
async function fetchJson(path) {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
}

function renderLoadError(el, retryFn) {
  if (el) el.innerHTML = `<div class="empty-state">Impossible de charger les données. <button class="btn btn-secondary" onclick="${retryFn}">Réessayer</button></div>`;
}

async function loadAlliance() {
  const content = document.getElementById('alliance-content');
  try {
    const [mine, alliances] = await Promise.all([fetchJson('/api/alliance/mine'), fetchJson('/api/alliances')]);
    const myAlliance = mine?.alliance || null;

    if (myAlliance) {
      const myRole = mine.role;
      const isLeaderOrOfficer = ['LEADER', 'OFFICER'].includes(myRole);
      const diplomacyData = await fetchJson('/api/alliance/diplomacy').catch(() => ({ diplomacy: [] }));
      const otherAlliances = alliances.filter(a => a.id !== myAlliance.id);
      const roleLabel = (role) => role === 'LEADER' ? '<img class="ico" src="assets/images/3d/ui/crown.webp" alt=""> Chef' : role === 'OFFICER' ? '<img class="ico" src="assets/images/3d/ui/star.webp" alt=""> Officier' : '<img class="ico" src="assets/images/3d/ui/defense.webp" alt=""> Membre';

      const showSub = (id) => currentAllianceTab === id ? 'block' : 'none';
      content.innerHTML = `
          <div class="alliance-container">
            <div id="alliance-sub-overview" class="alliance-sub-section" style="display:${showSub('overview')}">
              <div class="alliance-section">
                <div class="alliance-header">
                  <div class="alliance-emblem"><img class="ico" src="assets/images/3d/ui/defense.webp" alt=""></div>
                  <div class="alliance-info">
                    <h3>[${escapeHtml(myAlliance.tag)}] ${escapeHtml(myAlliance.name)}</h3>
                    <div class="alliance-tag">${myAlliance.members.length}${mine.maxMembers ? ` / ${mine.maxMembers}` : ''} membres · ${roleLabel(myRole)}</div>
                    ${myAlliance.description ? `<p style="font-size:12px;color:var(--text-muted)">${escapeHtml(myAlliance.description)}</p>` : ''}
                  </div>
                </div>
                ${isLeaderOrOfficer ? `
                  <div class="form-row" style="margin-top:16px">
                    <label>Inviter un joueur</label>
                    <input type="text" id="alliance-invite-name" placeholder="Pseudo exact" autocapitalize="none">
                    <button class="btn btn-secondary" onclick="invitePlayer()">Inviter</button>
                  </div>` : ''}
                <button onclick="leaveAlliance()" class="btn btn-danger" style="margin-top:20px">Quitter l'alliance</button>
              </div>
              <div id="challenge-alliance-box"></div>
            </div>

            <div id="alliance-sub-members" class="alliance-sub-section" style="display:${showSub('members')}">
              ${renderAllianceMembers(myAlliance, myRole, mine.serverTime)}
            </div>

            <div id="alliance-sub-help" class="alliance-sub-section" style="display:${showSub('help')}">
              <div class="alliance-section" id="alliance-help-box"><p class="empty-state">Chargement…</p></div>
            </div>

            <div id="alliance-sub-shop" class="alliance-sub-section" style="display:${showSub('shop')}">
              <div class="alliance-section" id="alliance-shop-box"><p class="empty-state">Chargement…</p></div>
            </div>

            <div id="alliance-sub-diplomacy" class="alliance-sub-section" style="display:${showSub('diplomacy')}">
              ${renderAllianceDiplomacy(myAlliance, otherAlliances, diplomacyData)}
            </div>

            <div id="alliance-sub-bastion" class="alliance-sub-section" style="display:${showSub('bastion')}">
              <div class="alliance-section" id="alliance-bastion-box"><p class="empty-state">Chargement…</p></div>
            </div>

            <div id="alliance-sub-rallies" class="alliance-sub-section" style="display:${showSub('rallies')}">
              <div class="alliance-section" id="alliance-rallies-box"><p class="empty-state">Chargement…</p></div>
            </div>
          </div>
        `;
      if (typeof loadAllianceHelp === 'function') loadAllianceHelp();
      if (typeof loadAllianceShop === 'function') loadAllianceShop();
      if (typeof renderBastionSection === 'function') renderBastionSection(document.getElementById('alliance-bastion-box'));
      if (typeof renderAllianceRallies === 'function') renderAllianceRallies(document.getElementById('alliance-rallies-box'));   // rassemblements d'alliance (09l-rally.js)
      if (typeof loadChallengeCard === 'function') loadChallengeCard('challenge-alliance-box', { compact: true });   // défi d'alliance de la semaine (09h-ranking.js)
      return;
    }

    const invites = await fetchJson('/api/alliance/invites').catch(() => []);
    content.innerHTML = `
      ${invites.length ? `
      <div style="margin-bottom:30px">
        <h3 style="color:var(--gold);margin-bottom:15px">Invitations reçues</h3>
        ${invites.map(inv => `
          <div class="member-row">
            <span class="member-name">[${escapeHtml(inv.alliance?.tag)}] ${escapeHtml(inv.alliance?.name)}</span>
            <span>
              <button onclick="joinAlliance('${inv.alliance?.id}')" class="btn btn-secondary" style="margin:0;padding:6px 12px">Accepter</button>
              <button onclick="declineInvite('${inv.id}')" class="btn btn-danger" style="margin:0 0 0 6px;padding:6px 12px">Refuser</button>
            </span>
          </div>`).join('')}
      </div>` : ''}
      <div style="margin-bottom:30px">
        <h3 style="color:var(--gold);margin-bottom:15px">Créer une alliance</h3>
        <input type="text" id="alliance-name" placeholder="Nom de l'alliance" style="width:100%;padding:10px;margin-bottom:10px;background:var(--bg-light);border:1px solid var(--border-dark);color:var(--text-light);border-radius:4px">
        <input type="text" id="alliance-tag" placeholder="Tag (2-5 caractères)" maxlength="5" style="width:100%;padding:10px;margin-bottom:10px;background:var(--bg-light);border:1px solid var(--border-dark);color:var(--text-light);border-radius:4px">
        <button onclick="createAlliance()" class="btn">Créer</button>
      </div>
      <h3 style="color:var(--gold);margin-bottom:15px">Alliances existantes</h3>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">On rejoint une alliance sur invitation de l'un de ses officiers.</p>
      ${alliances.slice(0, 20).map(a => `
        <div class="member-row">
          <span class="member-name"><a href="#" onclick="event.preventDefault(); openAllianceSheet('${chatSafeId(a.id)}')">[${escapeHtml(a.tag)}] ${escapeHtml(a.name)}</a> (${a.members.length} membres)</span>
        </div>
      `).join('') || '<p style="color:var(--text-muted)">Aucune alliance</p>'}
    `;
  } catch (e) {
    console.warn('loadAlliance error:', e);
    renderLoadError(content, 'loadAlliance()');
  }
}

async function invitePlayer() {
  const playerName = document.getElementById('alliance-invite-name')?.value?.trim();
  if (!playerName) { showToast('Entrez un pseudo', 'error'); return; }
  try {
    const res = await fetch(`${API}/api/alliance/invite`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ playerName }) });
    const data = await res.json().catch(() => ({}));
    showToast(res.ok ? (data.message || 'Invitation envoyée') : (data.error || 'Erreur'), res.ok ? 'success' : 'error');
  } catch (e) { showToast('Erreur réseau', 'error'); }
}

async function declineInvite(inviteId) {
  await allianceAction(`/api/alliance/invites/${inviteId}/decline`, 'Invitation refusée');
}

async function promoteMember(playerId, role) {
  if (role === 'OFFICER' && !(await confirmModal('Céder le leadership à ce membre ? Vous deviendrez officier.', { title: 'Transférer le leadership', okLabel: 'Céder', danger: true }))) return;
  await allianceAction(`/api/alliance/promote/${playerId}`, role === 'OFFICER' ? 'Leadership transféré' : 'Membre promu');
}

async function kickMember(playerId) {
  if (!(await confirmModal('Exclure ce membre de l\'alliance ?', { title: 'Exclure', okLabel: 'Exclure', danger: true }))) return;
  await allianceAction(`/api/alliance/kick/${playerId}`, 'Membre exclu');
}

async function allianceAction(path, okMessage) {
  try {
    const res = await fetch(`${API}${path}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (res.ok) { showToast(data.message || okMessage, 'success'); loadAlliance(); }
    else showToast(data.error || 'Erreur', 'error');
  } catch (e) {
    showToast('Erreur réseau', 'error');
  }
}

async function createAlliance() {
  const name = document.getElementById('alliance-name')?.value;
  const tag = document.getElementById('alliance-tag')?.value;

  if (!name || !tag) {
    showToast('Remplissez le nom et le tag', 'error');
    return;
  }

  try {
    const res = await fetch(`${API}/api/alliance/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, tag })
    });

    if (res.ok) {
      showToast('Alliance créée !', 'success');
      loadAlliance();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur réseau', 'error');
  }
}

async function joinAlliance(id) {
  try {
    const res = await fetch(`${API}/api/alliance/${id}/join`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });

    if (res.ok) {
      showToast('Alliance rejointe!', 'success');
      loadAlliance();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur réseau', 'error');
  }
}

async function leaveAlliance() {
  if (!(await confirmModal('Quitter l\'alliance ?', { title: 'Quitter l\'alliance', okLabel: 'Quitter', danger: true }))) return;
  await allianceAction('/api/alliance/leave', 'Alliance quittée');
}

// ========== RANKING ========== (09h-ranking.js)

// ========== REPORTS ==========
async function loadReports() {
  const list = document.getElementById('reports-list');
  let reports;
  try {
    reports = await fetchJson('/api/reports/battles');
  } catch (e) {
    console.warn('loadReports error:', e);
    renderLoadError(list, 'loadReports()');
    return;
  }
  if (typeof currentReportTab !== 'undefined' && currentReportTab !== 'battles') return;   // l'onglet a changé pendant le chargement
  if (reports.length === 0) {
    list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Aucun rapport de bataille</p>';
    return;
  }

  list.innerHTML = reports.map((r, idx) => renderBattleReportCard(r, idx)).join('');

  // Store reports for replay
  window.battleReports = reports;
}

// One battle report, readable at a glance: who, where, when, the outcome, both sides unit by unit
// (before -> after), what was taken and what the wall suffered. Travian-style table, Rise of Kingdoms-style summary.
// opts.asPlayerId : le rapport vu par son propriétaire (un rapport partagé dans la messagerie) ; opts.shared : pas de
// bouton « Partager » (ce n'est pas le rapport du joueur)
function renderBattleReportCard(r, idx, opts = {}) {
  const hasRounds = r.loot?.rounds && r.loot.rounds.length > 0;
  const attackerName = escapeHtml(r.loot?.attackerName || 'Attaquant');
  const defenderName = escapeHtml(r.loot?.defenderName || 'Défenseur');
  const cityName = escapeHtml(r.loot?.cityName || `(${r.x}, ${r.y})`);
  const duration = r.loot?.duration || 1;
  const iAttacked = r.attackerId === (opts.asPlayerId || player?.id);
  const won = r.result ? r.result === 'WIN' : (iAttacked === (r.winner === 'ATTACKER'));
  const isRaid = r.loot?.type === 'RAID', isTribe = r.rounds?.type === 'TRIBE_RAID';
  const kind = isRaid ? 'Pillage' : isTribe ? 'Tribu' : iAttacked ? 'Attaque' : 'Défense';
  // batailles en rase campagne du siège : attaque d'un camp pour briser un siège (et anciens rapports de riposte)
  const fieldKind = { RIPOSTE: true, SIEGE_BREAK: true, ENCOUNTER: true }[r.loot?.type];   // ENCOUNTER: deux armées ennemies qui se croisent
  const title = fieldKind ? `${cityName}${iAttacked ? '' : ` par ${attackerName}`}` : isTribe ? `Combat contre la tribu de ${cityName}` : iAttacked ? `${kind} de ${cityName}` : `${kind} de ${cityName} par ${attackerName}`;
  const date = new Date(r.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

  // Per-unit outcome: detailed reports carry initial/remaining per unit, raids only a global rate
  const finals = (side) => (side === 'A' ? r.attackerLosses?.units : r.defenderLosses?.units) || null;
  const rate = (side) => Number((side === 'A' ? r.attackerLosses : r.defenderLosses)?.rate || 0);
  // rows grouped per unit type: older field-battle reports kept one row per army and no `remaining`
  const unitRows = (units, side) => Object.values((units || []).reduce((m, u) => {
    const k = u.key || u.unitKey;   // tribe reports store unitKey
    const e = (m[k] ||= { ...u, key: k, count: 0, rateKilled: 0 });
    e.count += u.count || 0; e.rateKilled += Math.floor((u.count || 0) * rate(side));   // the server floors per row
    return m;
  }, {})).map(u => {
    const list = finals(side);
    const before = u.count || 0;
    const killed = Array.isArray(list) ? list.filter(f => f.key === u.key).reduce((t, f) => t + (f.killed || 0), 0) : u.rateKilled;
    const after = Math.max(0, before - killed);
    return `<div class="unit-line${after === 0 ? ' wiped' : ''}">
      <span class="unit-name unit-link" onclick="showUnitInfoModal('${sheetKey(u.key)}')" title="Fiche de l'unité">${unitIconHtml(u.key, 'unit-ico-sm')}${escapeHtml(u.name || getUnitName(u.key))}</span>
      <span class="unit-before">${formatNum(before)}</span>
      <span class="unit-arrow">→</span>
      <span class="unit-after">${formatNum(after)}</span>
      <span class="unit-lost">${killed > 0 ? '−' + formatNum(killed) : ''}</span>
    </div>`;
  }).join('') || '<div class="unit-line empty">Aucune unité</div>';
  const killedA = r.attackerLosses?.totalKilled ?? r.attackerLosses?.totalAttackerLosses ?? 0;
  const killedD = r.defenderLosses?.totalKilled ?? r.defenderLosses?.totalDefenderLosses ?? 0;
  const mine = iAttacked ? killedA : killedD, theirs = iAttacked ? killedD : killedA;
  // the defender of an assault sees everything that left the city (r.loot.pillaged), not only what the army could carry
  // what an army took from a resource point (tribe camp or point held by other armies) is in r.loot.resources
  const lootRes = r.loot?.resources ? r.loot.resources : isTribe ? {} : (!iAttacked && r.loot?.pillaged) ? r.loot.pillaged : { wood: r.loot?.wood, stone: r.loot?.stone, iron: r.loot?.iron, food: r.loot?.food, gold: r.loot?.gold };
  const lootHtml = ['wood', 'stone', 'iron', 'food', 'gold'].filter(k => lootRes[k]).map(k => `<span><img class="ico" src="assets/images/3d/ui/${k}.webp" alt=""> ${formatNum(lootRes[k])}</span>`).join('');
  // Mur bouclier : PV au début et à la fin du combat (siège, décision du 25 octobre 2026)
  const L = r.loot || {};
  const wall = L.wallMaxHp ? `<span class="strip-item"><img class="ico" src="assets/images/3d/ui/defense.webp" alt=""> Mur ${formatNum(L.wallHpStart)} → ${formatNum(L.wallHpEnd)} PV${L.wallBroken ? ' (brèche)' : ' (a tenu)'}</span>`
    : L.wallDamage ? `<span class="strip-item"><img class="ico" src="assets/images/3d/ui/defense.webp" alt=""> Mur −${formatNum(L.wallDamage)} PV</span>` : '';
  // Siège : durée du camp, camps alliés réunis, vies de la ville après le combat et sort de la ville quand elle tombe
  const lv = L.lives, ws = L.wallStructure;
  const siegeInfo = (L.campMinutes ? `<span class="strip-item">Camp ${formatNum(L.campMinutes)} min${L.camps > 1 ? ` · ${L.camps} camps` : ''}</span>` : L.siegeMinutes ? `<span class="strip-item">Siège ${formatNum(L.siegeMinutes)} min</span>` : '')
    + (lv ? `<span class="strip-item"><img class="ico" src="assets/images/3d/ui/defense.webp" alt=""> Vies ${lv.before} → ${lv.after} / ${lv.total}${lv.fallen ? (lv.fate === 'RELOCATED' ? ' : capitale déplacée' : ' : ville détruite') : ''}</span>`
      : ws ? `<span class="strip-item"><img class="ico" src="assets/images/3d/ui/defense.webp" alt=""> Muraille ${ws.before} % → ${ws.after} %${ws.fallen ? (ws.fate === 'RELOCATED' ? ' : capitale déplacée' : ' : ville rasée') : ''}</span>` : '');
  // Vignette peinte du camp de la tribu (scenes/vignette-tribe-<biome>, guide § S14) en tête des rapports de tribu
  const tribeScene = isTribe && typeof paintedSet !== 'undefined' ? (() => { const p = `scenes/vignette-tribe-${typeof getBiome === 'function' ? getBiome(r.x, r.y) : 'forest'}.webp`; return paintedSet.has(p) ? `<img class="report-scene" src="assets/images/painted/${p}" alt="" style="width:100%; display:block; border-radius:6px 6px 0 0;">` : ''; })() : '';

  return `
    <div class="report-card ${won ? 'report-victory' : 'report-defeat'}" data-report-id="${escapeHtml(String(r.id || ''))}">
      ${tribeScene}
      <div class="report-header">
        <div class="report-title-section">
          <span class="report-icon">${iAttacked || isTribe ? '<img class="ico" src="assets/images/3d/ui/attack.webp" alt="">' : '<img class="ico" src="assets/images/3d/ui/defense.webp" alt="">'}</span>
          <div class="report-title-info">
            <span class="report-title">${title}</span>
            <span class="report-date">${escapeHtml(kind)} · ${date}</span>
          </div>
        </div>
        <span class="report-result ${won ? 'victory' : 'defeat'}">
          ${won ? '<img class="ico" src="assets/images/3d/ui/ranking.webp" alt=""> VICTOIRE' : '<img class="ico" src="assets/images/3d/ui/skull.webp" alt=""> DÉFAITE'}
        </span>
      </div>
      <div class="report-strip">
        <span class="strip-item"><img class="ico" src="assets/images/3d/ui/skull.webp" alt=""> Vos pertes : <strong>${formatNum(mine)}</strong></span>
        <span class="strip-item"><img class="ico" src="assets/images/3d/ui/attack.webp" alt=""> Pertes adverses : <strong>${formatNum(theirs)}</strong></span>
        ${lootHtml ? `<span class="strip-item loot">${iAttacked || isTribe ? 'Butin' : 'Pillé'} : ${lootHtml}</span>` : ''}
        ${wall}
        ${siegeInfo}
        ${hasRounds ? `<span class="strip-item">${duration} round${duration > 1 ? 's' : ''}</span>` : ''}
      </div>
      <div class="report-summary">
        <div class="report-side attacker">
          <h4><img class="ico" src="assets/images/3d/ui/attack.webp" alt=""> ${attackerName}</h4>
          <div class="units-head"><span></span><span>Avant</span><span></span><span>Après</span><span>Pertes</span></div>
          <div class="units-list">${unitRows(r.attackerUnits, 'A')}</div>
        </div>
        <div class="report-vs">VS</div>
        <div class="report-side defender">
          <h4><img class="ico" src="assets/images/3d/ui/defense.webp" alt=""> ${defenderName}</h4>
          <div class="units-head"><span></span><span>Avant</span><span></span><span>Après</span><span>Pertes</span></div>
          <div class="units-list">${unitRows(r.defenderUnits, 'D')}</div>
        </div>
      </div>
      ${hasRounds || !opts.shared ? `<div class="report-actions">${hasRounds ? `<button class="btn btn-replay" onclick="showBattleReplay(${idx})">▶ Revoir le combat</button>` : ''}${!opts.shared && r.id ? `<button class="btn btn-secondary" onclick="openSharePicker({ type: 'battle', reportId: '${String(r.id).replace(/[^\w-]/g, '')}' })">${resIconHtml('send')} Partager</button>` : ''}</div>` : ''}
    </div>`;
}

// Battle replay system
function showBattleReplay(reportIndex) {
  const report = window.battleReports[reportIndex];
  if (!report || !report.loot?.rounds) {
    showToast('Replay non disponible', 'error');
    return;
  }
  
  const rounds = report.loot.rounds;
  const attackerName = report.loot?.attackerName || 'Attaquant';
  const defenderName = report.loot?.defenderName || 'Défenseur';
  
  // Create replay modal
  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modal-body');
  
  modalBody.innerHTML = `
    <div class="battle-replay">
      <h2><img class="ico" src="assets/images/3d/ui/attack.webp" alt=""> Replay de la Bataille</h2>
      <p class="replay-subtitle">${escapeHtml(attackerName)} vs ${escapeHtml(defenderName)}</p>
      <canvas id="replay-canvas" aria-label="Champ de bataille"></canvas>
      <div class="replay-arena">
        <div class="replay-side attacker-side">
          <h4><img class="ico" src="assets/images/3d/ui/attack.webp" alt=""> Attaquant</h4>
          <div class="replay-hp-bar">
            <div class="hp-fill attacker-hp" id="attacker-hp-bar" style="width:100%"></div>
          </div>
          <span class="replay-count" id="attacker-count">-</span>
        </div>
        
        <div class="replay-center">
          <div class="replay-round-info">
            <span class="round-label">Round</span>
            <span class="round-number" id="replay-round">0</span>
            <span class="round-total">/ ${rounds.length}</span>
          </div>
          <div class="replay-damage">
            <div class="damage-arrow attacker-arrow" id="attacker-damage">→ 0</div>
            <div class="damage-arrow defender-arrow" id="defender-damage">← 0</div>
          </div>
        </div>
        
        <div class="replay-side defender-side">
          <h4><img class="ico" src="assets/images/3d/ui/defense.webp" alt=""> Défenseur</h4>
          <div class="replay-hp-bar">
            <div class="hp-fill defender-hp" id="defender-hp-bar" style="width:100%"></div>
          </div>
          <span class="replay-count" id="defender-count">-</span>
        </div>
      </div>
      
      <div class="replay-log" id="replay-log"></div>
      
      <div class="replay-controls">
        <button class="btn" onclick="replayPrevRound()">⏮️ Précédent</button>
        <button class="btn btn-primary" onclick="replayTogglePlay()" id="replay-play-btn">▶️ Lecture</button>
        <button class="btn" onclick="replayNextRound()">Suivant ⏭️</button>
        <button class="btn btn-secondary" onclick="replayReset()">Rejouer</button>
      </div>
      
      <div class="replay-speed">
        <label>Vitesse:</label>
        <input type="range" min="0.5" max="3" step="0.5" value="1" id="replay-speed" onchange="updateReplaySpeed()">
        <span id="replay-speed-label">1x</span>
      </div>
    </div>
  `;
  
  modal.style.display = 'flex';
  
  // Initialize replay state
  stopBattleReplay();
  window.replayState = {
    report,
    rounds,
    currentRound: 0,
    playing: false,
    speed: 1,
    intervalId: null,
    attackerInitial: (report.attackerUnits || []).reduce((s, u) => s + u.count, 0),
    defenderInitial: (report.defenderUnits || []).reduce((s, u) => s + u.count, 0)
  };
  
  // Show initial state
  if (typeof battleScene !== 'undefined') battleScene.attach(window.replayState);
  renderReplayState();
}

function renderReplayState() {
  const state = window.replayState;
  if (!state) return;
  
  const round = state.currentRound;
  const roundData = round > 0 ? state.rounds[round - 1] : null;
  
  // Update round number
  document.getElementById('replay-round').textContent = round;
  
  // Calculate remaining units
  let attackerRemaining = state.attackerInitial;
  let defenderRemaining = state.defenderInitial;
  
  for (let i = 0; i < round && i < state.rounds.length; i++) {
    const r = state.rounds[i];
    attackerRemaining = r.attackerRemaining;
    defenderRemaining = r.defenderRemaining;
  }
  
  // Update counts
  document.getElementById('attacker-count').textContent = `${attackerRemaining} / ${state.attackerInitial}`;
  document.getElementById('defender-count').textContent = `${defenderRemaining} / ${state.defenderInitial}`;
  
  // Update HP bars
  const attackerPct = state.attackerInitial > 0 ? (attackerRemaining / state.attackerInitial) * 100 : 0;
  const defenderPct = state.defenderInitial > 0 ? (defenderRemaining / state.defenderInitial) * 100 : 0;
  document.getElementById('attacker-hp-bar').style.width = `${attackerPct}%`;
  document.getElementById('defender-hp-bar').style.width = `${defenderPct}%`;
  
  // Update damage indicators
  if (roundData) {
    document.getElementById('attacker-damage').textContent = `→ ${formatNum(roundData.attackerDamage)}`;
    document.getElementById('defender-damage').textContent = `← ${formatNum(roundData.defenderDamage)}`;
    document.getElementById('attacker-damage').classList.add('flash');
    document.getElementById('defender-damage').classList.add('flash');
    setTimeout(() => {
      document.getElementById('attacker-damage').classList.remove('flash');
      document.getElementById('defender-damage').classList.remove('flash');
    }, 300);
  } else {
    document.getElementById('attacker-damage').textContent = '→ 0';
    document.getElementById('defender-damage').textContent = '← 0';
  }
  
  // Update log
  const log = document.getElementById('replay-log');
  if (roundData) {
    let logHtml = `<div class="log-round">Round ${round}:</div>`;
    if ((roundData.attackerKills || []).length > 0) {
      logHtml += `<div class="log-kills attacker-kills"><img class="ico" src="assets/images/3d/ui/attack.webp" alt=""> Attaquant tue: ${roundData.attackerKills.map(k => `${k.killed}x ${escapeHtml(k.name)}`).join(', ')}</div>`;
    }
    if ((roundData.defenderKills || []).length > 0) {
      logHtml += `<div class="log-kills defender-kills"><img class="ico" src="assets/images/3d/ui/defense.webp" alt=""> Défenseur tue: ${roundData.defenderKills.map(k => `${k.killed}x ${escapeHtml(k.name)}`).join(', ')}</div>`;
    }
    log.innerHTML = logHtml + log.innerHTML;
  }
  
  // Scène 2.5D
  if (typeof battleScene !== 'undefined') battleScene.render(state);

  // Check if battle ended
  if (round >= state.rounds.length && state.playing) {
    replayTogglePlay();
    const winner = state.report.winner === 'ATTACKER' ? 'Attaquant' : 'Défenseur';
    log.innerHTML = `<div class="log-winner"><img class="ico" src="assets/images/3d/ui/ranking.webp" alt=""> ${winner} remporte la bataille!</div>` + log.innerHTML;
  }
}

function replayNextRound() {
  const state = window.replayState;
  if (!state || state.currentRound >= state.rounds.length) return;
  state.currentRound++;
  renderReplayState();
}

function replayPrevRound() {
  const state = window.replayState;
  if (!state || state.currentRound <= 0) return;
  const target = state.currentRound - 1;
  document.getElementById('replay-log').innerHTML = '';
  // Rebuild the log by replaying rounds 0..target
  for (let i = 0; i <= target; i++) {
    state.currentRound = i;
    renderReplayState();
  }
}

function stopBattleReplay() {
  if (typeof battleScene !== 'undefined') battleScene.stop();
  const state = window.replayState;
  if (state?.intervalId) clearInterval(state.intervalId);
  window.replayState = null;
}

function replayTogglePlay() {
  const state = window.replayState;
  if (!state) return;
  
  state.playing = !state.playing;
  const btn = document.getElementById('replay-play-btn');
  
  if (state.playing) {
    btn.textContent = '⏸️ Pause';
    state.intervalId = setInterval(() => {
      if (state.currentRound >= state.rounds.length) {
        replayTogglePlay();
        return;
      }
      replayNextRound();
    }, 1500 / state.speed);
  } else {
    btn.textContent = '▶️ Lecture';
    if (state.intervalId) {
      clearInterval(state.intervalId);
      state.intervalId = null;
    }
  }
}

function replayReset() {
  const state = window.replayState;
  if (!state) return;
  
  if (state.playing) replayTogglePlay();
  state.currentRound = 0;
  document.getElementById('replay-log').innerHTML = '';
  renderReplayState();
}

function updateReplaySpeed() {
  const state = window.replayState;
  if (!state) return;
  
  state.speed = parseFloat(document.getElementById('replay-speed').value);
  document.getElementById('replay-speed-label').textContent = `${state.speed}x`;
  
  // Restart if playing
  if (state.playing) {
    replayTogglePlay();
    replayTogglePlay();
  }
}

