// ============================================================
// 10-modals-misc.js — Modales info, auto-refresh, redimensionnement, heure serveur, comptes à rebours
// Découpé depuis app.js (lignes 8796-9284) — portée globale partagée,
// l'ordre de chargement dans index.html doit être respecté.
// ============================================================
// ========== UTILS ==========
function formatNum(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return Math.floor(n).toString();
}

function formatTime(dateStr) {
  const date = new Date(dateStr);
  const now = new Date();
  const diff = Math.max(0, date - now);
  
  const hours = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  const secs = Math.floor((diff % 60000) / 1000);
  
  if (hours > 0) return `${hours}h ${mins}m`;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
}

// ========== UNIT INFO MODAL ==========
// Alias for unit stats popup (used in recruitment panel)
function showUnitStatsPopup(unitKey) {
  showUnitInfoModal(unitKey);
}

function showUnitInfoModal(unitKey) {
  const unit = unitsData.find(u => u.key === unitKey);
  if (!unit) {
    showToast('Unité non trouvée', 'error');
    return;
  }

  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modal-body');
  const modalTitle = document.getElementById('modal-title');

  const tierColor = TIER_COLORS[unit.tier] || '#888';
  const tierName = unit.tier === 'base' ? 'Base' : unit.tier === 'intermediate' ? 'Intermédiaire' : unit.tier === 'elite' ? 'Élite' : 'Siège';
  const classNames = { INFANTRY: 'Infanterie', ARCHER: 'Archer', CAVALRY: 'Cavalerie', SIEGE: 'Siège' };

  // Get stats from unit.stats or fallback to root level
  const attack = unit.stats?.attack || unit.attack || 0;
  const defense = unit.stats?.defense || unit.defense || 0;
  const speed = unit.stats?.speed || unit.speed || 0;
  const endurance = unit.stats?.endurance || unit.endurance || unit.hp || 50;
  const transport = unit.stats?.transport || unit.transport || unit.carryCapacity || 50;

  modalTitle.textContent = unit.name;
  modalBody.innerHTML = `
    <div class="unit-info-modal">
      <!-- Header avec icône et tier -->
      <div class="unit-info-header">
        <div class="unit-info-icon" style="border-color: ${tierColor}">
          ${UNIT_ICONS[unit.class] || '⚔️'}
        </div>
        <div class="unit-info-title">
          <h3>${unit.name}</h3>
          <span class="unit-tier-badge" style="background: ${tierColor}">${tierName}</span>
          <span class="unit-class-badge">${classNames[unit.class] || unit.class}</span>
        </div>
      </div>

      <!-- Stats de combat avec barres visuelles -->
      <div class="unit-stats-section">
        <h4>⚔️ Statistiques de combat</h4>
        <div class="unit-stats-bars">
          <div class="stat-bar-row">
            <span class="stat-icon"><img class="ico" src="assets/images/ui/attack.svg" alt=""></span>
            <span class="stat-label">Attaque</span>
            <div class="stat-bar-container">
              <div class="stat-bar attack" style="width: ${Math.min(attack, 100)}%"></div>
            </div>
            <span class="stat-value">${attack}</span>
          </div>
          <div class="stat-bar-row">
            <span class="stat-icon"><img class="ico" src="assets/images/ui/defense.svg" alt=""></span>
            <span class="stat-label">Défense</span>
            <div class="stat-bar-container">
              <div class="stat-bar defense" style="width: ${Math.min(defense, 100)}%"></div>
            </div>
            <span class="stat-value">${defense}</span>
          </div>
          <div class="stat-bar-row">
            <span class="stat-icon"><img class="ico" src="assets/images/ui/expedition.svg" alt=""></span>
            <span class="stat-label">Vitesse</span>
            <div class="stat-bar-container">
              <div class="stat-bar speed" style="width: ${Math.min(speed, 100)}%"></div>
            </div>
            <span class="stat-value">${speed}</span>
          </div>
          <div class="stat-bar-row">
            <span class="stat-icon">❤️</span>
            <span class="stat-label">Endurance</span>
            <div class="stat-bar-container">
              <div class="stat-bar endurance" style="width: ${Math.min(endurance, 100)}%"></div>
            </div>
            <span class="stat-value">${endurance}</span>
          </div>
        </div>
      </div>

      <!-- Capacités -->
      <div class="unit-capacity-section">
        <h4>📦 Capacités</h4>
        <div class="unit-capacity-grid">
          <div class="capacity-item">
            <span class="capacity-icon">🎒</span>
            <span class="capacity-label">Transport</span>
            <span class="capacity-value">${transport}</span>
          </div>
          <div class="capacity-item">
            <span class="capacity-icon">🍖</span>
            <span class="capacity-label">Nourriture/h</span>
            <span class="capacity-value">${unit.tier === 'base' ? 5 : unit.tier === 'intermediate' ? 10 : unit.tier === 'elite' ? 15 : 15}</span>
          </div>
          ${unit.class === 'SIEGE' ? `
          <div class="capacity-item">
            <span class="capacity-icon">🏰</span>
            <span class="capacity-label">Dégâts muraille</span>
            <span class="capacity-value">${unit.stats?.buildingDamage || unit.buildingDamage || 5}</span>
          </div>
          ` : ''}
        </div>
      </div>

      <!-- Coût de recrutement -->
      <div class="unit-cost-section">
        <h4>💰 Coût de recrutement</h4>
        <div class="unit-cost-grid">
          <div class="cost-item"><span class="cost-icon"><img class="ico" src="assets/images/ui/wood.svg" alt=""></span><span>${unit.recruitCost?.wood || 0}</span></div>
          <div class="cost-item"><span class="cost-icon"><img class="ico" src="assets/images/ui/stone.svg" alt=""></span><span>${unit.recruitCost?.stone || 0}</span></div>
          <div class="cost-item"><span class="cost-icon"><img class="ico" src="assets/images/ui/iron.svg" alt=""></span><span>${unit.recruitCost?.iron || 0}</span></div>
          <div class="cost-item"><span class="cost-icon"><img class="ico" src="assets/images/ui/food.svg" alt=""></span><span>${unit.recruitCost?.food || 0}</span></div>
        </div>
        <div class="train-time">
          <span>⏱️ Temps: ${formatDuration(unit.recruitTimeSec || 360)}</span>
        </div>
      </div>

      <!-- Bâtiment requis -->
      <div class="unit-building-section">
        <h4>🏗️ Formation</h4>
        <p>Entraîné dans: <strong>${getBuildingName({ INFANTRY: 'BARRACKS', ARCHER: 'BARRACKS', CAVALRY: 'STABLE', SIEGE: 'WORKSHOP' }[unit.class] || 'BARRACKS')}</strong>${unit.class === 'SIEGE' ? ' (niveau 5)' : unit.tier === 'intermediate' ? ' (niveau 7)' : unit.tier === 'elite' ? ' (niveau 15)' : ''}</p>
      </div>
    </div>
  `;

  modal.style.display = 'flex';
}

// ========== BUILDING INFO MODAL ==========
function showBuildingInfoModal(buildingKey) {
  const building = buildingsData.find(b => b.key === buildingKey);
  if (!building) {
    showToast('Bâtiment non trouvé', 'error');
    return;
  }

  const modal = document.getElementById('modal');
  const modalBody = document.getElementById('modal-body');
  const modalTitle = document.getElementById('modal-title');

  modalTitle.textContent = building.name;
  modalBody.innerHTML = `
    <div class="building-info-modal">
      <!-- Header -->
      <div class="building-info-header">
        <div class="building-info-icon">${BUILDING_ICONS[buildingKey] || '🏠'}</div>
        <div class="building-info-title">
          <h3>${building.name}</h3>
          <span class="building-category-badge">${building.category}</span>
        </div>
      </div>

      <!-- Description -->
      <div class="building-desc-section">
        <p>${getBuildingDescription(buildingKey)}</p>
      </div>

      <!-- Stats -->
      <div class="building-stats-section">
        <h4>📊 Informations</h4>
        <div class="building-info-grid">
          <div class="info-item">
            <span class="info-label">Niveau max</span>
            <span class="info-value">${building.maxLevel}</span>
          </div>
          <div class="info-item">
            <span class="info-label">Catégorie</span>
            <span class="info-value">${building.category}</span>
          </div>
        </div>
      </div>

      <!-- Coût niveau 1 -->
      <div class="building-cost-section">
        <h4>💰 Coût niveau 1</h4>
        <div class="building-cost-grid">
          <div class="cost-item"><span class="cost-icon"><img class="ico" src="assets/images/ui/wood.svg" alt=""></span><span>${building.costL1?.wood || 0}</span></div>
          <div class="cost-item"><span class="cost-icon"><img class="ico" src="assets/images/ui/stone.svg" alt=""></span><span>${building.costL1?.stone || 0}</span></div>
          <div class="cost-item"><span class="cost-icon"><img class="ico" src="assets/images/ui/iron.svg" alt=""></span><span>${building.costL1?.iron || 0}</span></div>
          <div class="cost-item"><span class="cost-icon"><img class="ico" src="assets/images/ui/food.svg" alt=""></span><span>${building.costL1?.food || 0}</span></div>
        </div>
        <div class="build-time">
          <span>⏱️ Temps: ${formatDuration(building.timeL1Sec || 60)}</span>
        </div>
      </div>

      <!-- Prérequis -->
      ${building.prereq && building.prereq.length > 0 ? `
        <div class="building-prereq-section">
          <h4>📋 Prérequis</h4>
          <div class="prereq-list">
            ${building.prereq.map(p => `
              <div class="prereq-item">
                <span>${BUILDING_ICONS[p.key] || '🏠'}</span>
                <span>${getBuildingName(p.key)} Niv.${p.level}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Effets -->
      ${building.effects ? `
        <div class="building-effects-section">
          <h4>✨ Effets</h4>
          <div class="effects-list">
            ${Object.entries(building.effects).map(([key, value]) => `
              <div class="effect-item">
                <span class="effect-name">${formatEffectName(key)}</span>
                <span class="effect-value">${typeof value === 'object' ? JSON.stringify(value) : value}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>
  `;

  modal.style.display = 'flex';
}

// Format effect name for display
function formatEffectName(key) {
  const names = {
    'buildTimeReductionPctPerLevel': 'Réduction temps construction/niv',
    'trainTimeReductionPctPerLevel': 'Réduction temps entraînement/niv',
    'foodProdL1': 'Production nourriture Niv.1',
    'woodProdL1': 'Production bois Niv.1',
    'stoneProdL1': 'Production pierre Niv.1',
    'ironProdL1': 'Production fer Niv.1',
    'storageL1': 'Stockage Niv.1',
    'foodStorageL1': 'Stockage nourriture Niv.1',
    'maxArmies': 'Armées max',
    'hiddenPctMax': 'Ressources cachées max %',
    'healCapacityPerLevel': 'Capacité soins/niv',
    'wallRegenBonusPctPerLevel': 'Régén murs/niv',
    'defenderDefenseBonusPctPerLevel': 'Bonus défense/niv',
    'heroXpBonusPctPerLevel': 'Bonus XP héros/niv',
    'heroStatBonusPctPerLevel': 'Bonus stats héros/niv'
  };
  return names[key] || key;
}

function closeModal() {
  const modal = document.getElementById('modal');
  if (modal) modal.style.display = 'none';
  if (typeof stopBattleReplay === 'function') stopBattleReplay();
}

function showModal(title, content) {
  const modal = document.getElementById('modal');
  if (!modal) return;
  const modalBox = modal.querySelector('.modal-box');

  if (modalBox) {
    // Use existing modal structure
    const titleEl = modal.querySelector('#modal-title') || modal.querySelector('.modal-header h3');
    const bodyEl = modal.querySelector('#modal-body') || modal.querySelector('.modal-body');
    const footerEl = modal.querySelector('#modal-footer');
    if (titleEl) titleEl.textContent = title;
    if (bodyEl) bodyEl.innerHTML = content;
    if (footerEl) footerEl.innerHTML = '';
  } else {
    // Fallback: recreate structure
    modal.innerHTML = `
      <div class="modal-backdrop" onclick="closeModal()"></div>
      <div class="modal-box">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" onclick="closeModal()">×</button>
        </div>
        <div class="modal-body">${content}</div>
        <div class="modal-footer"></div>
      </div>
    `;
  }

  modal.style.display = 'flex';
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.className = `toast ${type} show`;
  setTimeout(() => toast.classList.remove('show'), 3000);
}

// ========== AUTO REFRESH ==========
let refreshInterval;
let lastRefresh = 0;
let isRefreshing = false;
const MIN_REFRESH_INTERVAL = 5000; // Minimum 5s entre les refreshes

async function refreshData(force = false) {
  // Évite les refreshes trop rapprochés
  const now = Date.now();
  if (!force && (isRefreshing || now - lastRefresh < MIN_REFRESH_INTERVAL)) {
    return;
  }
  
  isRefreshing = true;
  lastRefresh = now;
  
  try {
    // Charger en parallèle pour plus de rapidité
    await Promise.all([
      loadCities(),
      loadArmies(),
      loadPlayer()
    ]);
    
    // Mettre à jour l'UI seulement si l'onglet ville est actif
    const cityTab = document.getElementById('tab-city');
    if (cityTab?.classList.contains('active')) {
      renderCity();
    }
    
    // Mettre à jour la carte si active
    const mapTab = document.getElementById('tab-map');
    if (mapTab?.classList.contains('active') && typeof renderMap === 'function') {
      renderMap();
    }
  } catch (e) {
    console.warn('refreshData error:', e);
  } finally {
    isRefreshing = false;
  }
}

function startRefresh() {
  // Nettoyer l'ancien interval si existant
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  
  // Refresh toutes les 15 secondes (seulement si onglet visible)
  refreshInterval = setInterval(() => {
    if (document.visibilityState === 'visible') refreshData();
  }, 15000);
  
  // Refresh immédiat au démarrage
  refreshData(true);
}

// Refresh quand la fenêtre redevient visible
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && token) {
    refreshData(true);
  }
});

// ========== CANVAS RESIZE HANDLER ==========
// (resize handler consolidated in map section)

// ========== SERVER TIME & DAY/NIGHT INDICATOR (Travian style) ==========
let serverTimeInterval;
let currentIsNight = null; // Track state for transitions

function updateServerTime() {
  const now = new Date();
  const hours = now.getHours();
  const mins = now.getMinutes();
  const secs = now.getSeconds();

  // Format time: HH:MM:SS
  const timeStr = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

  const timeEl = document.getElementById('server-time');
  const iconEl = document.getElementById('dn-icon');
  const indicator = document.getElementById('day-night-indicator');

  if (timeEl) timeEl.textContent = timeStr;

  // Day/Night: Night is 18:00 - 05:00 (like Travian)
  const isNight = hours >= 18 || hours < 5;

  // Update body class for global theme
  document.body.classList.toggle('night-mode', isNight);
  if (iconEl && iconEl.tagName === 'IMG') { const want = isNight ? 'assets/images/ui/moon.svg' : 'assets/images/ui/sun.svg'; if (!iconEl.getAttribute('src').endsWith(want.split('/').pop())) iconEl.setAttribute('src', want); }

  if (indicator) {
    indicator.classList.toggle('night', isNight);
    indicator.classList.toggle('day', !isNight);
  }

  if (iconEl && iconEl.tagName !== 'IMG') {
    iconEl.textContent = isNight ? '🌙' : '☀️';
  }

  // Re-render canvases when day/night changes
  if (currentIsNight !== isNight) {
    currentIsNight = isNight;
    // Re-render city canvas with new theme
    if (typeof renderCityCanvas === 'function') {
      setTimeout(() => renderCityCanvas(), 100);
    }
    // Re-render map canvas with new theme
    if (typeof renderMap === 'function') {
      setTimeout(() => renderMap(), 100);
    }
  }
}

function isNightMode() {
  return document.body.classList.contains('night-mode');
}

function startServerTime() {
  if (serverTimeInterval) clearInterval(serverTimeInterval);
  updateServerTime();
  serverTimeInterval = setInterval(() => {
    if (document.visibilityState === 'visible') updateServerTime();
  }, 1000);
}

// ========== LIVE COUNTDOWN TIMERS (Travian style) ==========
let countdownInterval;

function updateAllCountdowns() {
  // Update all countdown timers on the page
  const timers = document.querySelectorAll('.activity-timer, .queue-time, .qd-timer, .qs-timer, [data-countdown]');

  timers.forEach(timer => {
    const endsAt = timer.dataset.endsAt;
    if (!endsAt) return;

    const endDate = new Date(endsAt);
    const now = new Date();
    const diff = Math.max(0, endDate - now);

    if (diff === 0) {
      timer.textContent = 'Terminé!';
      timer.classList.add('countdown-done');
      return;
    }

    const hours = Math.floor(diff / 3600000);
    const mins = Math.floor((diff % 3600000) / 60000);
    const secs = Math.floor((diff % 60000) / 1000);

    if (hours > 0) {
      timer.textContent = `${hours}h ${mins}m ${secs}s`;
    } else if (mins > 0) {
      timer.textContent = `${mins}m ${secs}s`;
    } else {
      timer.textContent = `${secs}s`;
    }
  });
}

function startCountdowns() {
  if (countdownInterval) clearInterval(countdownInterval);
  countdownInterval = setInterval(() => {
    if (document.visibilityState === 'visible') {
      updateAllCountdowns();
      updateAttackNotification();
    }
  }, 500);
}

// Initialize server time when game starts
document.addEventListener('DOMContentLoaded', () => {
  startServerTime();
  startCountdowns();
});


// ========== PARAMÈTRES : compte, notifications, boutique, confidentialité, suppression ==========
function openSettings() {
  const native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const pushOn = !!localStorage.getItem('push_token');
  const version = (window.APP_VERSION || '1.0');
  showModal('Paramètres', `
    <div class="settings">
      <div class="settings-row"><span>Joueur</span><strong>${escapeHtml(player?.name || '')}</strong></div>
      <div class="settings-row"><span>Faction</span><strong>${escapeHtml(player?.faction || '')}</strong></div>
      <div class="settings-row"><span>Version</span><strong>${escapeHtml(version)}</strong></div>
      <div class="settings-actions">
        <button class="btn-primary" onclick="Store.openShop()">Boutique et abonnement</button>
        <button class="btn-secondary" onclick="Store.restore()">Restaurer les achats</button>
        ${native ? `<button class="btn-secondary" onclick="togglePush()">${pushOn ? 'Désactiver' : 'Activer'} les notifications</button>` : ''}
        <button class="btn-secondary" onclick="openLegalPage('privacy')">Politique de confidentialité</button>
        <button class="btn-secondary" onclick="openLegalPage('support')">Assistance</button>
        <button class="btn-secondary" onclick="logout()">Se déconnecter</button>
        <button class="btn-danger" onclick="confirmDeleteAccount()">Supprimer mon compte</button>
      </div>
    </div>`);
}

// Pages légales embarquées (frontend/privacy.html, support.html) ; aussi servies par l'API (/privacy, /support)
async function openLegalPage(name) {
  try {
    const res = await fetch(`${name}.html`);
    const html = await res.text();
    const body = html.replace(/^[\s\S]*<main>/, '').replace(/<\/main>[\s\S]*$/, '');
    showModal(name === 'privacy' ? 'Confidentialité' : 'Assistance', `<div class="legal">${body}</div>`);
  } catch (e) {
    window.open(`${API}/${name}`, '_blank');
  }
}

function confirmDeleteAccount() {
  showModal('Supprimer mon compte', `
    <div class="settings">
      <p>La suppression est <strong>immédiate et définitive</strong> : villes, armées, héros, rapports, achats et abonnement (à résilier séparément dans votre store) seront perdus.</p>
      <div class="form-group"><label>Confirmez avec votre mot de passe</label><input type="password" id="delete-password" autocomplete="current-password"></div>
      <div class="settings-actions">
        <button class="btn-danger" onclick="deleteAccount()">Supprimer définitivement</button>
        <button class="btn-secondary" onclick="closeModal()">Annuler</button>
      </div>
    </div>`);
}

async function deleteAccount() {
  const password = document.getElementById('delete-password')?.value || '';
  if (!password) { showToast('Mot de passe requis', 'error'); return; }
  try {
    const res = await fetch(`${API}/api/auth/account`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ password }) });
    if (res.status === 204) {
      if (typeof track === 'function') { track('account_deleted'); if (typeof flushAnalytics === 'function') flushAnalytics(); }
      try { localStorage.clear(); } catch (e) {}
      closeModal();
      logout();
      showToast('Compte supprimé. À bientôt peut-être !', 'info');
      return;
    }
    const err = await res.json().catch(() => ({}));
    showToast(err.error || 'Suppression impossible', 'error');
  } catch (e) { showToast('Suppression impossible (hors ligne ?)', 'error'); }
}
