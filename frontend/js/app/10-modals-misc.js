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

// Les fiches d'information des unités et des bâtiments sont dans 10b-sheets.js

function closeModal() {
  if (window._modalResolve) { const r = window._modalResolve; window._modalResolve = null; r(false); return; }   // dialogue fermé = annulé
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
  if (type === 'success' && typeof haptic === 'function') haptic('light');
  if (type === 'error' && typeof hapticNotify === 'function') hapticNotify('ERROR');
}

// Boîtes de dialogue dans le style du jeu (remplacent confirm() / prompt() natifs)
function confirmModal(message, { title = 'Confirmer', okLabel = 'Confirmer', cancelLabel = 'Annuler', danger = false } = {}) {
  return new Promise((resolve) => {
    window._modalResolve = (v) => { window._modalResolve = null; closeModal(); resolve(v); };
    showModal(title, `<div class="settings"><p>${escapeHtml(message)}</p>
      <div class="settings-actions">
        <button class="${danger ? 'btn-danger' : 'btn-primary'}" onclick="window._modalResolve && window._modalResolve(true)">${escapeHtml(okLabel)}</button>
        <button class="btn-secondary" onclick="window._modalResolve && window._modalResolve(false)">${escapeHtml(cancelLabel)}</button>
      </div></div>`);
  });
}
function promptModal(message, { title = 'Saisie', value = '', placeholder = '', maxLength = 30, okLabel = 'Valider' } = {}) {
  return new Promise((resolve) => {
    window._modalResolve = (ok) => { const v = ok ? (document.getElementById('prompt-modal-input')?.value || '').trim() : null; window._modalResolve = null; closeModal(); resolve(v || null); };
    showModal(title, `<div class="settings"><p>${escapeHtml(message)}</p>
      <div class="form-group"><input type="text" id="prompt-modal-input" value="${escapeHtml(value)}" placeholder="${escapeHtml(placeholder)}" maxlength="${maxLength}" enterkeyhint="done" onkeydown="if(event.key==='Enter'){event.preventDefault();window._modalResolve && window._modalResolve(true);}"></div>
      <div class="settings-actions">
        <button class="btn-primary" onclick="window._modalResolve && window._modalResolve(true)">${escapeHtml(okLabel)}</button>
        <button class="btn-secondary" onclick="window._modalResolve && window._modalResolve(false)">Annuler</button>
      </div></div>`);
    setTimeout(() => document.getElementById('prompt-modal-input')?.focus(), 50);
  });
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
      loadPlayer(),
      typeof refreshNotificationBadge === 'function' ? refreshNotificationBadge() : null,
      typeof refreshChatBadge === 'function' ? refreshChatBadge() : null
    ]);
    if (typeof updateAllianceHelpBadge === 'function') updateAllianceHelpBadge();
    if (typeof refreshQuestsLight === 'function') refreshQuestsLight();   // pastille des quêtes, bandeau du tutoriel   // demandes d'aide d'alliance (player.allianceHelpPending)
    // Une recherche en cours : suivre son avancement (niveau atteint, file promue)
    if (typeof research !== 'undefined' && research?.queue?.length && typeof loadResearch === 'function') loadResearch();
    
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

function startRefresh(immediate = false) {
  // Nettoyer l'ancien interval si existant
  if (refreshInterval) {
    clearInterval(refreshInterval);
  }
  
  // Refresh toutes les 15 secondes (seulement si onglet visible)
  refreshInterval = setInterval(() => {
    if (document.visibilityState === 'visible') refreshData();
  }, 15000);
  
  // Refresh immédiat seulement à la demande (showGame vient de tout charger)
  if (immediate) refreshData(true);
}

// Refresh quand la fenêtre redevient visible
// Coming back to the app (tab visible, native resume, network back) refreshes once, not once per signal
let _resumeTimer = null;
function onAppResume() {
  if (!token) return;
  clearTimeout(_resumeTimer);
  _resumeTimer = setTimeout(() => refreshData(true), 400);
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') onAppResume(); });

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
    const now = new Date(typeof serverNow === 'function' ? serverNow() : Date.now());
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

// Horloge et comptes à rebours : démarrés par showGame(), arrêtés par logout()
function stopGameTimers() {
  if (serverTimeInterval) { clearInterval(serverTimeInterval); serverTimeInterval = null; }
  if (countdownInterval) { clearInterval(countdownInterval); countdownInterval = null; }
}


// ========== PARAMÈTRES : compte, notifications, boutique, confidentialité, suppression ==========
function openSettings() {
  const native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  const pushOn = !!safeStorage.getItem('push_token');
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
        <button class="btn-secondary" onclick="openChangePassword()">Changer le mot de passe</button>
        ${player && player.emailVerificationRequired && player.emailVerified === false ? '<button class="btn-secondary" onclick="resendVerification()">Renvoyer l\'e-mail de confirmation</button>' : ''}
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
    if (!res.ok) throw new Error(String(res.status));
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
      try { safeStorage.clear(); } catch (e) {}
      closeModal();
      logout();
      showToast('Compte supprimé. À bientôt peut-être !', 'info');
      return;
    }
    const err = await res.json().catch(() => ({}));
    showToast(err.error || 'Suppression impossible', 'error');
  } catch (e) { showToast('Suppression impossible (hors ligne ?)', 'error'); }
}
