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
    const p = { id: player?.id };
    const myAlliance = mine?.alliance || null;

    if (myAlliance) {
      const myRole = mine.role;
      const isLeaderOrOfficer = ['LEADER', 'OFFICER'].includes(myRole);
      const isLeader = myRole === 'LEADER';
      const diplomacyData = await fetchJson('/api/alliance/diplomacy').catch(() => ({ diplomacy: [] }));
      const otherAlliances = alliances.filter(a => a.id !== myAlliance.id);
      const roleLabel = (role) => role === 'LEADER' ? '👑 Leader' : role === 'OFFICER' ? '⭐ Officier' : '🛡️ Membre';

      const showSub = (id) => currentAllianceTab === id ? 'block' : 'none';
      content.innerHTML = `
          <div class="alliance-container">
            <div id="alliance-sub-overview" class="alliance-sub-section" style="display:${showSub('overview')}">
              <div class="alliance-section">
                <div class="alliance-header">
                  <div class="alliance-emblem">🛡️</div>
                  <div class="alliance-info">
                    <h3>[${escapeHtml(myAlliance.tag)}] ${escapeHtml(myAlliance.name)}</h3>
                    <div class="alliance-tag">${myAlliance.members.length} membres · ${roleLabel(myRole)}</div>
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
            </div>

            <div id="alliance-sub-members" class="alliance-sub-section" style="display:${showSub('members')}">
              <div class="alliance-section">
                <h4>👥 Membres (${myAlliance.members.length})</h4>
                ${myAlliance.members.map(m => {
                  const isMe = m.playerId === p.id;
                  const canPromote = isLeader && !isMe && m.role !== 'LEADER';
                  const canKick = !isMe && m.role !== 'LEADER' && (isLeader || (myRole === 'OFFICER' && m.role === 'MEMBER'));
                  return `
                  <div class="member-row">
                    <span class="member-name">${escapeHtml(m.player.name)}</span>
                    <span class="member-role ${m.role.toLowerCase()}">${roleLabel(m.role)}</span>
                    ${canPromote ? `<button class="btn btn-secondary" style="margin:0 0 0 6px;padding:4px 8px" onclick="promoteMember('${m.playerId}', '${m.role}')">${m.role === 'OFFICER' ? 'Céder le leadership' : 'Promouvoir'}</button>` : ''}
                    ${canKick ? `<button class="btn btn-danger" style="margin:0 0 0 6px;padding:4px 8px" onclick="kickMember('${m.playerId}')">Exclure</button>` : ''}
                  </div>`;
                }).join('')}
              </div>
            </div>

            <div id="alliance-sub-diplomacy" class="alliance-sub-section" style="display:${showSub('diplomacy')}">
            ${isLeaderOrOfficer ? `
              <div class="alliance-section">
                <h4>🤝 Diplomatie</h4>
                <p style="font-size:12px;color:var(--text-muted);margin-bottom:15px">Definissez vos relations avec les autres alliances (max 3 allies)</p>
                <div class="diplomacy-list">
                  ${otherAlliances.map(a => {
                    const dipStatus = diplomacyData.diplomacy?.find(d => d.allianceId === a.id)?.status || 'NEUTRAL';
                    return `
                      <div class="diplomacy-row">
                        <div class="diplomacy-alliance">
                          <strong>[${escapeHtml(a.tag)}]</strong> ${escapeHtml(a.name)}
                          <span style="font-size:11px;color:var(--text-muted)">(${a.members.length} membres)</span>
                        </div>
                        <div class="diplomacy-status">
                          <select onchange="setDiplomacy('${a.id}', this.value)" class="diplomacy-select">
                            <option value="NEUTRAL" ${dipStatus === 'NEUTRAL' ? 'selected' : ''}>⚪ Neutre</option>
                            <option value="ALLY" ${dipStatus === 'ALLY' ? 'selected' : ''}>🤝 Allie</option>
                            <option value="ENEMY" ${dipStatus === 'ENEMY' ? 'selected' : ''}>⚔️ Ennemi</option>
                          </select>
                        </div>
                      </div>
                    `;
                  }).join('') || '<p style="color:var(--text-muted)">Aucune autre alliance</p>'}
                </div>
              </div>
            ` : '<div class="alliance-section"><p style="color:var(--text-muted)">Seuls les leaders et officiers peuvent gerer la diplomatie.</p></div>'}
            </div>
          </div>
        `;
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
        <input type="text" id="alliance-name" placeholder="Nom de l'alliance" style="width:100%;padding:10px;margin-bottom:10px;background:var(--bg-light);border:1px solid var(--border);color:var(--text);border-radius:4px">
        <input type="text" id="alliance-tag" placeholder="Tag (2-5 caractères)" maxlength="5" style="width:100%;padding:10px;margin-bottom:10px;background:var(--bg-light);border:1px solid var(--border);color:var(--text);border-radius:4px">
        <button onclick="createAlliance()" class="btn">Créer</button>
      </div>
      <h3 style="color:var(--gold);margin-bottom:15px">Alliances existantes</h3>
      <p style="font-size:12px;color:var(--text-muted);margin-bottom:10px">On rejoint une alliance sur invitation de l'un de ses officiers.</p>
      ${alliances.slice(0, 20).map(a => `
        <div class="member-row">
          <span class="member-name">[${escapeHtml(a.tag)}] ${escapeHtml(a.name)} (${a.members.length} membres)</span>
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

async function setDiplomacy(targetAllianceId, status) {
  try {
    const res = await fetch(`${API}/api/alliance/diplomacy/${targetAllianceId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status })
    });
    
    if (res.ok) {
      const statusLabels = { ALLY: 'Allié', NEUTRAL: 'Neutre', ENEMY: 'Ennemi' };
      showToast(`Statut changé en ${statusLabels[status]}`, 'success');
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
      loadAlliance(); // Refresh to reset select
    }
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
      showToast('Alliance creee!', 'success');
      loadAlliance();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur reseau', 'error');
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
    showToast('Erreur reseau', 'error');
  }
}

async function leaveAlliance() {
  if (!(await confirmModal('Quitter l\'alliance ?', { title: 'Quitter l\'alliance', okLabel: 'Quitter', danger: true }))) return;
  await allianceAction('/api/alliance/leave', 'Alliance quittée');
}

// ========== RANKING ==========
async function loadRanking(type) {
  document.querySelectorAll('#tab-ranking .toolbar-btn').forEach(t => t.classList.remove('active'));
  document.querySelector(`#tab-ranking .toolbar-btn[onclick*="'${type}'"]`)?.classList.add('active');
  const content = document.getElementById('ranking-content');
  const endpoints = { players: '/api/ranking/players', alliances: '/api/ranking/alliances', attackers: '/api/ranking/attackers', defenders: '/api/ranking/defenders' };
  const valueOf = (item) => type === 'attackers' ? `${formatNum(item.attacksWon || 0)} victoires` : type === 'defenders' ? `${formatNum(item.defensesWon || 0)} défenses` : `${formatNum(item.population || 0)} pop`;

  try {
    const data = await fetchJson(endpoints[type] || endpoints.players);
    content.innerHTML = data.length === 0 ? '<div class="empty-state">Aucun classement pour le moment</div>' : `
      <div class="ranking-list">
        ${data.map((item, i) => `
          <div class="ranking-row ${item.id === player?.id ? 'me' : ''}" ${type !== 'alliances' && item.id ? `onclick="viewPlayerProfile('${item.id}')"` : ''}>
            <span class="ranking-position ${i < 3 ? 'top' + (i + 1) : ''}">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
            <span class="ranking-name">${type === 'alliances' ? `[${escapeHtml(item.tag)}] ${escapeHtml(item.name)}` : `${item.alliance?.alliance?.tag ? `[${escapeHtml(item.alliance.alliance.tag)}] ` : ''}${escapeHtml(item.name)}`}</span>
            <span class="ranking-value">${valueOf(item)}</span>
          </div>
        `).join('')}
      </div>
    `;
  } catch (e) {
    console.warn('loadRanking error:', e);
    renderLoadError(content, `loadRanking('${type}')`);
  }
}

function showRanking(type) {
  loadRanking(type);
}

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
  {
    if (reports.length === 0) {
      list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Aucun rapport de bataille</p>';
      return;
    }

    list.innerHTML = reports.map((r, idx) => {
      const hasRounds = r.loot?.rounds && r.loot.rounds.length > 0;
      const attackerName = escapeHtml(r.loot?.attackerName || 'Attaquant');
      const defenderName = escapeHtml(r.loot?.defenderName || 'Défenseur');
      const cityName = escapeHtml(r.loot?.cityName || `(${r.x}, ${r.y})`);
      const duration = r.loot?.duration || 1;
      // Reports are per player: result says whether the reader won; older rows only have the winner side
      const iAttacked = r.attackerId === player?.id;
      const won = r.result ? r.result === 'WIN' : (iAttacked === (r.winner === 'ATTACKER'));
      const title = r.loot?.type === 'RAID' ? 'Pillage' : (r.rounds?.type === 'TRIBE_RAID' ? 'Combat contre une tribu' : 'Bataille');

      return `
        <div class="report-card ${won ? 'report-victory' : 'report-defeat'}">
          <div class="report-header">
            <div class="report-title-section">
              <span class="report-icon">${iAttacked ? '⚔️' : '🛡️'}</span>
              <div class="report-title-info">
                <span class="report-title">${title} à ${cityName}</span>
                <span class="report-date">${new Date(r.createdAt).toLocaleString('fr-FR')}</span>
              </div>
            </div>
            <span class="report-result ${won ? 'victory' : 'defeat'}">
              ${won ? '🏆 VICTOIRE' : '💀 DÉFAITE'}
            </span>
          </div>

          <div class="report-summary">
            <div class="report-side attacker">
              <h4>⚔️ ${attackerName}</h4>
              <div class="units-list">
                ${(r.attackerUnits || []).map(u => `
                  <div class="unit-line">
                    <span class="unit-name">${escapeHtml(u.name || getUnitName(u.key))}</span>
                    <span class="unit-count">${u.count}</span>
                  </div>
                `).join('')}
              </div>
              <div class="losses">
                <span class="loss-label">Pertes:</span>
                <span class="loss-value">${Math.round((r.attackerLosses?.rate || 0) * 100)}%</span>
                <span class="loss-count">(${r.attackerLosses?.totalKilled ?? r.attackerLosses?.totalAttackerLosses ?? 0} unités)</span>
              </div>
            </div>
            
            <div class="report-vs">VS</div>
            
            <div class="report-side defender">
              <h4>🛡️ ${defenderName}</h4>
              <div class="units-list">
                ${(r.defenderUnits || []).map(u => `
                  <div class="unit-line">
                    <span class="unit-name">${escapeHtml(u.name || getUnitName(u.key))}</span>
                    <span class="unit-count">${u.count}</span>
                  </div>
                `).join('')}
              </div>
              <div class="losses">
                <span class="loss-label">Pertes:</span>
                <span class="loss-value">${Math.round((r.defenderLosses?.rate || 0) * 100)}%</span>
                <span class="loss-count">(${r.defenderLosses?.totalKilled ?? r.defenderLosses?.totalDefenderLosses ?? 0} unités)</span>
              </div>
            </div>
          </div>
          
          ${hasRounds ? `
            <div class="report-actions">
              <button class="btn btn-replay" onclick="showBattleReplay(${idx})">
                ▶️ Voir le combat (${duration} rounds)
              </button>
            </div>
          ` : ''}
          
          ${r.loot?.wood || r.loot?.stone || r.loot?.iron || r.loot?.food ? `
            <div class="report-loot">
              <span class="loot-label">Butin pillé:</span>
              ${r.loot.wood ? `<span>🪵 ${formatNum(r.loot.wood)}</span>` : ''}
              ${r.loot.stone ? `<span>🪨 ${formatNum(r.loot.stone)}</span>` : ''}
              ${r.loot.iron ? `<span>⛏️ ${formatNum(r.loot.iron)}</span>` : ''}
              ${r.loot.food ? `<span>🌾 ${formatNum(r.loot.food)}</span>` : ''}
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
    
    // Store reports for replay
    window.battleReports = reports;
  }
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
      <h2>⚔️ Replay de la Bataille</h2>
      <p class="replay-subtitle">${escapeHtml(attackerName)} vs ${escapeHtml(defenderName)}</p>
      
      <div class="replay-arena">
        <div class="replay-side attacker-side">
          <h4>⚔️ Attaquant</h4>
          <div class="replay-units" id="replay-attacker-units"></div>
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
          <h4>🛡️ Défenseur</h4>
          <div class="replay-units" id="replay-defender-units"></div>
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
        <button class="btn btn-secondary" onclick="replayReset()">🔄 Rejouer</button>
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
    if (roundData.attackerKills.length > 0) {
      logHtml += `<div class="log-kills attacker-kills">⚔️ Attaquant tue: ${roundData.attackerKills.map(k => `${k.killed}x ${k.name}`).join(', ')}</div>`;
    }
    if (roundData.defenderKills.length > 0) {
      logHtml += `<div class="log-kills defender-kills">🛡️ Défenseur tue: ${roundData.defenderKills.map(k => `${k.killed}x ${k.name}`).join(', ')}</div>`;
    }
    log.innerHTML = logHtml + log.innerHTML;
  }
  
  // Check if battle ended
  if (round >= state.rounds.length && state.playing) {
    replayTogglePlay();
    const winner = state.report.winner === 'ATTACKER' ? 'Attaquant' : 'Défenseur';
    log.innerHTML = `<div class="log-winner">🏆 ${winner} remporte la bataille!</div>` + log.innerHTML;
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

