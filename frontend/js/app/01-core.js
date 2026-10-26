// ============================================================
// 01-core.js — Coeur : cache, requêtes, auth, état du jeu, alertes attaques
// Découpé depuis app.js (lignes 1-581) — portée globale partagée,
// l'ordre de chargement dans index.html doit être respecté.
// ============================================================
// Imperium Antiquitas v1.0 - Application Mobile Native
// API_SERVER est defini dans mobile.js (charge avant app.js)
const API = window.API_SERVER || '';
// Stockage local tolérant : une WebView en navigation privée ou un quota dépassé ne doit pas bloquer le jeu
const safeStorage = (() => {
  const mem = new Map();
  let ok = false;
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); ok = true; } catch (e) { ok = false; }
  return {
    getItem: (k) => { try { return ok ? localStorage.getItem(k) : (mem.has(k) ? mem.get(k) : null); } catch (e) { return mem.has(k) ? mem.get(k) : null; } },
    setItem: (k, v) => { mem.set(k, String(v)); try { if (ok) localStorage.setItem(k, v); } catch (e) {} },
    removeItem: (k) => { mem.delete(k); try { if (ok) localStorage.removeItem(k); } catch (e) {} },
    clear: () => { mem.clear(); try { if (ok) localStorage.clear(); } catch (e) {} }
  };
})();
// Carte du serveur (décision du 26 octobre 2026) : chaque serveur a la sienne, tirée d'une graine qu'il publie dans
// /api/world/info. La dernière graine connue de ce serveur est gardée pour dessiner tout de suite la bonne carte au
// prochain lancement, avant même la réponse du serveur (et hors ligne).
const WORLD_SEED_KEY = 'world-seed:' + (API || (typeof location !== 'undefined' ? location.origin : ''));
let worldSeedKnown = false;      // la graine de ce serveur est connue (réponse du serveur ou dernière visite)
let worldSeedConfirmed = false;  // le serveur l'a donnée pendant cette session (sinon on la redemande en arrière-plan)
(function restoreWorldSeed() {
  const saved = safeStorage.getItem(WORLD_SEED_KEY);
  if (saved !== null && saved !== '' && typeof Terrain !== 'undefined' && Terrain.setWorldSeed) { Terrain.setWorldSeed(Number(saved)); worldSeedKnown = true; }
})();
// Applique la graine du serveur ; si la carte change (premier lancement, autre serveur), tout ce qui garde du terrain est
// refait et la vue en cours redessinée
function applyWorldSeed(seed, signature) {
  if (typeof seed !== 'number') return;
  if (typeof Terrain === 'undefined' || !Terrain.setWorldSeed) {
    // terrain d'une version d'avant les cartes au hasard (fichier resté en cache) : il dessine bien la carte de référence ;
    // une autre carte demande la nouvelle version
    worldSeedKnown = true;
    if (seed !== 0) onTerrainOutdated();
    return;
  }
  safeStorage.setItem(WORLD_SEED_KEY, String(seed));
  worldSeedKnown = true;
  const changed = Terrain.setWorldSeed(seed);
  // même graine mais pas la même carte (version du jeu ou moteur JavaScript différent) : on le signale sans bloquer
  if (signature && Terrain.signature !== signature && !applyWorldSeed._warned) {
    applyWorldSeed._warned = true;
    console.error(`Carte différente de celle du serveur (graine ${seed}, empreinte ${Terrain.signature} au lieu de ${signature})`);
    if (typeof track === 'function') track('terrain_mismatch', { seed, client: Terrain.signature, server: signature, version: Terrain.TERRAIN_VERSION });
  }
  if (!changed) return;
  console.log(`🌍 Carte du serveur : graine ${seed}`);
  if (typeof onWorldTerrainChanged === 'function') onWorldTerrainChanged();
}
// Polyfill roundRect (iOS < 16)
if (typeof CanvasRenderingContext2D !== 'undefined' && !CanvasRenderingContext2D.prototype.roundRect) {
  CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
    const rr = Math.min(Array.isArray(r) ? r[0] : (r || 0), w / 2, h / 2);
    this.moveTo(x + rr, y); this.lineTo(x + w - rr, y); this.quadraticCurveTo(x + w, y, x + w, y + rr);
    this.lineTo(x + w, y + h - rr); this.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    this.lineTo(x + rr, y + h); this.quadraticCurveTo(x, y + h, x, y + h - rr);
    this.lineTo(x, y + rr); this.quadraticCurveTo(x, y, x + rr, y);
  };
}
window.safeStorage = safeStorage;
// Debug output only when asked (?debug=1 or safeStorage debug=1): the console stays quiet in production
const DEBUG = /[?&]debug=1/.test(location.search) || safeStorage.getItem('debug') === '1';
if (!DEBUG) console.log = function () {};
// Server clock: offset read from the Date header of API answers, so countdowns never depend on the phone's clock
let serverOffset = 0;
function serverNow() { return Date.now() + serverOffset; }
function noteServerDate(res) {
  const d = res && res.headers && res.headers.get && res.headers.get('date');
  if (!d) return;
  const t = Date.parse(d);
  if (!t) return;
  const offset = t + 500 - Date.now();   // the header has a one-second resolution
  if (Math.abs(offset - serverOffset) > 2000) serverOffset = offset;
}

// ========== API FETCH WRAPPER ==========
// Every call to the game API goes through here (fetch is kept as the call site everywhere):
//  - a 20 s timeout, so a dead connection never leaves a spinner for ever;
//  - a 401 on an authenticated call means the session is over: one toast, one logout, no retry loop;
//  - a 429 shows one throttling toast;
//  - two identical mutations in flight (double tap on "Envoyer") share one request.
const _nativeFetch = window.fetch.bind(window);
const _inflightMutations = new Map();
let _sessionEnded = false, _lastThrottleToast = 0;
function _isApiUrl(url) { return API ? url.startsWith(API + '/api/') : url.startsWith('/api/'); }
function _hasAuth(headers) {
  if (!headers) return false;
  if (typeof headers.get === 'function') return !!headers.get('Authorization');
  return Object.keys(headers).some(k => k.toLowerCase() === 'authorization' && headers[k] && !/null|undefined$/.test(String(headers[k])));
}
function onSessionExpired() {
  if (_sessionEnded || !token) return;
  _sessionEnded = true;
  if (typeof showToast === 'function') showToast('Session expirée, reconnectez-vous', 'error');
  logout();
}
window.fetch = function apiFetch(input, init = {}) {
  const url = typeof input === 'string' ? input : (input && input.url) || '';
  if (!_isApiUrl(url)) return _nativeFetch(input, init);
  const method = (init.method || 'GET').toUpperCase();
  const key = method !== 'GET' && method !== 'HEAD' ? `${method} ${url} ${typeof init.body === 'string' ? init.body : ''}` : null;
  if (key && _inflightMutations.has(key)) return _inflightMutations.get(key).then(r => r.clone());
  let options = init;
  let timer = null;
  if (!init.signal && typeof AbortController !== 'undefined') {
    const controller = new AbortController();
    timer = setTimeout(() => controller.abort(), init.timeoutMs || 20000);
    options = { ...init, signal: controller.signal };
  }
  const authed = _hasAuth(init.headers);
  const p = _nativeFetch(input, options).then(res => {
    noteServerDate(res);
    if (res.status === 401 && authed) onSessionExpired();
    else if (res.status === 429 && Date.now() - _lastThrottleToast > 5000) { _lastThrottleToast = Date.now(); if (typeof showToast === 'function') showToast('Trop de requêtes, patientez un instant', 'error'); }
    return res;
  }).finally(() => { if (timer) clearTimeout(timer); if (key) _inflightMutations.delete(key); });
  if (!key) return p;
  _inflightMutations.set(key, p);
  return p.then(r => r.clone());
};
let token = safeStorage.getItem('token');
let player = null;
let currentCity = null;
let cities = [];
let armies = [];

// Escape player-provided text before interpolating it into innerHTML
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Hourly production of a city per resource (same formula as the server's resourceProcessor)
function getCityProduction(city) {
  const fields = { wood: 0, stone: 0, iron: 0, food: 0 };
  const bonus = { wood: 0, stone: 0, iron: 0, food: 0 };
  const BONUS_KEYS = { SAWMILL: 'wood', STONEMASON: 'stone', FOUNDRY: 'iron', MILL: 'food', BAKERY: 'food' };
  const FIELD_KEYS = { LUMBER: 'wood', QUARRY: 'stone', IRON_MINE: 'iron', FARM: 'food' };
  (city?.buildings || []).forEach(b => {
    if (FIELD_KEYS[b.key]) fields[FIELD_KEYS[b.key]] += getProductionAtLevel(b.key, b.level);
    if (BONUS_KEYS[b.key]) bonus[BONUS_KEYS[b.key]] += b.level * 5;
  });
  // Ville secondaire : +20 % (données de la Résidence, comme le serveur)
  const colony = city && city.isCapital === false ? 1 + ((window.buildingsData?.find(b => b.key === 'RESIDENCE')?.effects?.secondaryCityBonusPct) || 20) / 100 : 1;
  return {
    wood: (5 + fields.wood * (1 + bonus.wood / 100)) * colony,
    stone: (5 + fields.stone * (1 + bonus.stone / 100)) * colony,
    iron: (5 + fields.iron * (1 + bonus.iron / 100)) * colony,
    food: (10 + fields.food * (1 + bonus.food / 100)) * colony
  };
}

// Storage given by a warehouse (or silo) level: exponential 1 200 -> 160 000, like the server
function getStorageAtLevel(level) {
  if (level <= 0) return 1000;
  if (level >= 20) return 160000;
  return Math.round(1200 * Math.pow(160000 / 1200, (level - 1) / 19));
}

// ========== CACHE SYSTEM ==========
const cache = {
  units: null,
  buildings: null,
  unitsTimestamp: 0,
  buildingsTimestamp: 0,
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes pour données statiques
  
  isValid(key) {
    return this[key] && (Date.now() - this[`${key}Timestamp`] < this.CACHE_DURATION);
  },
  
  set(key, data) {
    this[key] = data;
    this[`${key}Timestamp`] = Date.now();
  },
  
  get(key) {
    return this.isValid(key) ? this[key] : null;
  },
  
  clear() {
    this.units = null;
    this.buildings = null;
    this.unitsTimestamp = 0;
    this.buildingsTimestamp = 0;
  }
};

// ========== REQUEST MANAGER ==========
const requestManager = {
  pending: new Map(),
  
  // Évite les requêtes dupliquées simultanées
  async fetch(url, options = {}) {
    const key = url + JSON.stringify(options);
    let promise = this.pending.get(key);
    if (!promise) {
      promise = fetch(url, options).finally(() => this.pending.delete(key));
      this.pending.set(key, promise);
    }
    // Each caller gets its own copy: a Response body can only be read once
    return promise.then(res => res.clone());
  },
  
  // Fetch avec retry automatique ; la dernière réponse (même 5xx) est renvoyée au lieu de undefined
  async fetchWithRetry(url, options = {}, retries = 2) {
    let last = null;
    for (let i = 0; i <= retries; i++) {
      try {
        last = await this.fetch(url, options);
        if (last.ok || last.status < 500) return last;
        if (i < retries) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      } catch (e) {
        if (i === retries) throw e;
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
    return last;
  }
};


// ========== PRODUCTION INTERPOLATION (L1 → L10 → L20) ==========
function lerpExp(a, b, t) {
  if (a <= 0 || b <= 0) return a + (b - a) * t;
  return a * Math.pow(b / a, Math.max(0, Math.min(1, t)));
}

function getProductionAtLevel(buildingKey, level) {
  if (!window.buildingsData) return level * 30; // Fallback
  const def = window.buildingsData.find(b => b.key === buildingKey);
  if (!def || !def.effects) return level * 30;

  // Find the production key
  const prodKeys = {
    'FARM': 'foodProd',
    'LUMBER': 'woodProd',
    'QUARRY': 'stoneProd',
    'IRON_MINE': 'ironProd'
  };
  const prodKey = prodKeys[buildingKey];
  if (!prodKey) return level * 30;

  const L1 = def.effects[prodKey + 'L1'] || 10;
  const L10 = def.effects[prodKey + 'L10'];
  const L20 = def.effects[prodKey + 'L20'] || 4500;

  if (level <= 1) return L1;
  if (level >= 20) return L20;

  if (L10) {
    // Piecewise interpolation: L1→L10 then L10→L20
    if (level <= 10) {
      const t = (level - 1) / 9;
      return Math.round(lerpExp(L1, L10, t));
    } else {
      const t = (level - 10) / 10;
      return Math.round(lerpExp(L10, L20, t));
    }
  } else {
    // Simple interpolation: L1→L20
    const t = (level - 1) / 19;
    return Math.round(lerpExp(L1, L20, t));
  }
}

const UNIT_ICONS = {
  INFANTRY: '🗡️', ARCHER: '🏹', CAVALRY: '🐴', SIEGE: '💣'
};

const TIER_COLORS = {
  base: '#aaa', intermediate: '#4682B4', elite: '#da70d6', siege: '#ffa500'
};

// ========== AUTH ==========
function showRegister() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'flex';
}

function showLogin() {
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'flex';
}

function selectFaction(faction) {
  // Remove selected from all
  document.querySelectorAll('.faction-option').forEach(el => el.classList.remove('selected'));
  // Add selected to clicked one
  document.querySelector(`.faction-option[data-faction="${faction}"]`)?.classList.add('selected');
  // Set hidden input value
  document.getElementById('reg-faction').value = faction;
}

async function login() {
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  
  try {
    const res = await fetch(`${API}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    
    if (res.ok) {
      token = data.token;
      safeStorage.setItem('token', token);
      showGame();
      if (typeof track === 'function') track('login_success');
    } else {
      showAuthError(data.error || 'Erreur de connexion');
    }
  } catch (e) {
    showAuthError('Erreur de connexion au serveur');
  }
}

async function register() {
  const email = document.getElementById('reg-email').value;
  const name = document.getElementById('reg-name').value;
  const password = document.getElementById('reg-password').value;
  const faction = document.getElementById('reg-faction').value;
  
  if (!faction) {
    showAuthError('Choisissez une faction');
    return;
  }
  
  try {
    const res = await fetch(`${API}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, password, faction })
    });
    const data = await res.json();
    
    if (res.ok) {
      token = data.token;
      safeStorage.setItem('token', token);
      showGame();
      if (typeof track === 'function') track('register_success', { faction: document.getElementById('reg-faction')?.value || '' });
    } else {
      showAuthError(data.error || 'Erreur d\'inscription');
    }
  } catch (e) {
    showAuthError('Erreur de connexion au serveur');
  }
}

// "Mot de passe oublié" from the login screen: the server mails a reset link
async function forgotPassword() {
  const email = await promptModal('Votre adresse e-mail', { title: 'Mot de passe oublié', value: document.getElementById('login-email')?.value || '', placeholder: 'votre@email.com', maxLength: 255 });
  if (!email) return;
  try {
    const res = await fetch(`${API}/api/auth/forgot-password`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) showAuthError(''), showToast(data.message || 'E-mail envoyé si le compte existe', 'success');
    else showAuthError(data.error || 'Demande impossible');
  } catch (e) { showAuthError('Erreur de connexion au serveur'); }
}

// Settings: change the password; every other device is logged out, this one gets a fresh token
function openChangePassword() {
  showModal('Changer le mot de passe', `
    <div class="settings">
      <div class="form-group"><label for="pw-current">Mot de passe actuel</label><input type="password" id="pw-current" autocomplete="current-password"></div>
      <div class="form-group"><label for="pw-new">Nouveau mot de passe (8 caractères minimum)</label><input type="password" id="pw-new" autocomplete="new-password" minlength="8"></div>
      <div class="form-group"><label for="pw-new2">Confirmer</label><input type="password" id="pw-new2" autocomplete="new-password" minlength="8"></div>
      <div class="settings-actions">
        <button class="btn-primary" onclick="changePassword()">Enregistrer</button>
        <button class="btn-secondary" onclick="openSettings()">Retour</button>
      </div>
    </div>`);
}
async function changePassword() {
  const current = document.getElementById('pw-current')?.value || '', next = document.getElementById('pw-new')?.value || '', next2 = document.getElementById('pw-new2')?.value || '';
  if (next.length < 8) return showToast('8 caractères minimum', 'error');
  if (next !== next2) return showToast('Les deux mots de passe ne correspondent pas', 'error');
  try {
    const res = await fetch(`${API}/api/auth/password`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ currentPassword: current, newPassword: next }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return showToast(data.error || 'Changement impossible', 'error');
    if (data.token) { token = data.token; safeStorage.setItem('token', token); }
    closeModal();
    showToast('Mot de passe modifié', 'success');
  } catch (e) { showToast('Changement impossible (hors ligne ?)', 'error'); }
}

function logout() {
  if (typeof window.unregisterPush === 'function' && token) window.unregisterPush();
  if (typeof flushAnalytics === 'function') flushAnalytics();
  token = null;
  safeStorage.removeItem('token');
  // Stop every background activity started by showGame()
  if (typeof refreshInterval !== 'undefined' && refreshInterval) { clearInterval(refreshInterval); refreshInterval = null; }
  if (attackCheckInterval) { clearInterval(attackCheckInterval); attackCheckInterval = null; }
  if (typeof stopCityAnimation === 'function') stopCityAnimation();
  if (typeof stopBattleReplay === 'function') stopBattleReplay();
  if (typeof stopGameTimers === 'function') stopGameTimers();
  if (typeof mapAnimTimer !== 'undefined' && mapAnimTimer) { clearTimeout(mapAnimTimer); mapAnimTimer = null; }
  if (typeof mapReloadTimeout !== 'undefined' && mapReloadTimeout) { clearTimeout(mapReloadTimeout); mapReloadTimeout = null; }
  if (typeof Store !== 'undefined' && typeof Store.logOut === 'function') Store.logOut();
  player = null; currentCity = null; cities = []; armies = []; incomingAttacks = [];
  window._emailBannerDismissed = false;
  setConnectOverlay(null);
  const banner = document.getElementById('email-banner'); if (banner) banner.style.display = 'none';
  document.getElementById('game-screen').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  setTimeout(() => el.textContent = '', 5000);
}

// ========== GAME ==========
// Overlay shown while the first data loads (a cold server can take a minute): state 'loading' | 'error' | null
function setConnectOverlay(state) {
  let el = document.getElementById('connect-overlay');
  if (!el) {
    el = document.createElement('div');
    el.id = 'connect-overlay';
    el.innerHTML = '<div class="connect-box"><img src="assets/images/3d/logo/medallion.webp" width="72" height="72" alt=""><p id="connect-text"></p><button id="connect-retry" class="btn-primary" onclick="showGame()">Réessayer</button><button class="btn-secondary" onclick="logout()">Se déconnecter</button></div>';
    document.body.appendChild(el);
  }
  if (!state) { el.style.display = 'none'; return; }
  el.style.display = 'flex';
  document.getElementById('connect-text').textContent = state === 'error' ? 'Le serveur ne répond pas. Vérifiez votre connexion puis réessayez.' : 'Connexion au serveur…';
  el.classList.toggle('error', state === 'error');
}

// Banner asking to confirm the e-mail address (only when the server enforces it)
function updateEmailBanner() {
  let el = document.getElementById('email-banner');
  const show = !!(player && player.emailVerificationRequired && player.emailVerified === false && !window._emailBannerDismissed);
  if (!show) { if (el) el.style.display = 'none'; return; }
  if (!el) {
    el = document.createElement('div');
    el.id = 'email-banner';
    el.innerHTML = '<span>Adresse e-mail non confirmée : le commerce avec les autres joueurs est bloqué.</span><button class="btn-secondary" onclick="resendVerification()">Renvoyer l\'e-mail</button><button class="banner-close" aria-label="Fermer" onclick="window._emailBannerDismissed=true;updateEmailBanner()">×</button>';
    const screen = document.getElementById('game-screen');
    screen.insertBefore(el, screen.querySelector('.top-bar')?.nextSibling || null);
  }
  el.style.display = 'flex';
}
async function resendVerification() {
  try {
    const res = await fetch(`${API}/api/auth/verify-email/resend`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    showToast(res.ok ? (data.message || 'E-mail envoyé') : (data.error || 'Envoi impossible'), res.ok ? 'success' : 'error');
  } catch (e) { showToast('Envoi impossible (hors ligne ?)', 'error'); }
}

async function showGame() {
  _sessionEnded = false;
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'flex';
  setConnectOverlay('loading');
  await loadWorldInfo(); // Load world size first
  if (!worldSeedKnown) await loadWorldInfo();   // sans la carte du serveur, rien ne se dessine : une seconde tentative
  if (!worldSeedKnown) { setConnectOverlay('error'); return; }
  // graine retenue d'une visite précédente, pas encore confirmée par le serveur (il démarrait) : on la redemande
  if (!worldSeedConfirmed) confirmWorldSeedLater(2000);
  // Un seul aller-retour parallèle pour tout ce qui ne dépend pas des villes
  const [playerOk] = await Promise.all([loadPlayer(), loadBuildings(), loadUnits(), loadArmies(), loadPaintedManifest(), typeof loadItems === 'function' ? loadItems() : null, typeof loadTechnologies === 'function' ? loadTechnologies() : null]);
  if (!token) { setConnectOverlay(null); return; }   // session refusée : logout() a déjà remis l'écran de connexion
  if (!playerOk) { setConnectOverlay('error'); return; }
  await loadCities();
  if (!token) { setConnectOverlay(null); return; }
  if (!cities.length) { setConnectOverlay('error'); return; }
  if (typeof loadResearch === 'function') loadResearch();   // niveaux de technologie et file de recherche (non bloquant)
  setConnectOverlay(null);
  updateEmailBanner();
  // Init canvases now that game screen is visible and data is loaded
  initCityCanvas();
  initFieldsCanvas();
  renderCityCanvas();
  if (typeof startCityAnimation === 'function') startCityAnimation();
  if (typeof startServerTime === 'function') startServerTime();
  if (typeof startCountdowns === 'function') startCountdowns();
  startAttackCheck();
  startRefresh(false);
  if (typeof refreshChatBadge === 'function') refreshChatBadge();   // le badge de l'onglet Messages tout de suite
  if (typeof updateAllianceHelpBadge === 'function') updateAllianceHelpBadge();   // demandes d'aide d'alliance en attente
  if (typeof loadQuests === 'function') loadQuests(true);   // bouton Quêtes et bandeau du tutoriel
  if (typeof window.onGameReady === 'function') window.onGameReady();   // masque le splash natif
}

// Bonus de civilisation tels que le serveur les applique (data/factions.json, reçus avec /api/world/info) :
// valeur en % d'un bonus, avec repli sur la valeur connue si l'API n'a pas encore répondu
function factionBonusPct(faction, type, fallback = 0) {
  const b = window.factionsData?.[faction]?.bonuses?.find(x => x.type === type);
  return b ? Number(b.value) || 0 : fallback;
}
const FACTION_BONUS_LABELS = {
  unitDefense: v => `+${v} % défense des unités`,
  siegeLossReduction: v => `−${v} % pertes en siège`,
  cityDefense: v => `+${v} % défense chez soi`,
  hideoutCapacity: v => `+${v} % cachette`,
  buildTimeReduction: v => `−${v} % temps de construction`,
  woundedConversion: v => `+${v} % blessés sauvés`,
  wallHealth: v => `+${v} % points de vie des murs`,
  transportCapacity: v => `+${v} % transport`,
  armySpeed: v => `+${v} % vitesse des armées`,
  siegeAttack: v => `+${v} % attaque en siège`,
  siegeEngineAttack: v => `+${v} % dégâts des engins aux murs`,
  defendingCityAttack: v => `+${v} % attaque en défense`
};
// Cartes de civilisation de l'inscription : les deux bonus, dans les termes du serveur
function applyFactionBonusTexts() {
  if (!window.factionsData) return;
  document.querySelectorAll('.faction-option[data-faction]').forEach(card => {
    const f = window.factionsData[card.dataset.faction];
    const span = card.querySelector('.faction-bonus');
    if (!f || !span) return;
    const parts = (f.bonuses || []).map(b => (FACTION_BONUS_LABELS[b.type] ? FACTION_BONUS_LABELS[b.type](b.value) : b.description)).filter(Boolean);
    if (parts.length) span.textContent = parts.join(' · ');
  });
}

// Le serveur joue sur un autre terrain que celui de cette version du jeu (carte changée) : sur le web, un rechargement
// récupère la nouvelle version ; dans l'application, il faut la mettre à jour depuis la boutique
function onTerrainOutdated() {
  if (document.querySelector('.terrain-outdated')) return;   // déjà signalé
  const native = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  if (!native) {
    let tried = false;
    try { tried = sessionStorage.getItem('terrain-reload') === '1'; sessionStorage.setItem('terrain-reload', '1'); } catch (e) { tried = true; }
    if (!tried) { location.reload(); return; }
  }
  const msg = native ? 'La carte du monde a changé : mettez l\'application à jour depuis la boutique pour voir la carte telle qu\'elle est.' : 'La carte du monde a changé : videz le cache du navigateur et rechargez la page.';
  if (typeof showToast === 'function') showToast(msg, 'error');
  const bar = document.createElement('div');
  bar.className = 'terrain-outdated';
  bar.setAttribute('role', 'alert');
  bar.textContent = msg;
  bar.style.cssText = 'position:fixed;left:0;right:0;top:0;z-index:10000;padding:10px 14px;background:#7a2a18;color:#fff;font:600 14px/1.35 sans-serif;text-align:center';
  document.body.appendChild(bar);
}

// Redemande la carte du serveur en arrière-plan, de plus en plus espacé, jusqu'à sa réponse
function confirmWorldSeedLater(delay) {
  setTimeout(async () => {
    if (worldSeedConfirmed || !token) return;
    await loadWorldInfo();
    if (!worldSeedConfirmed) confirmWorldSeedLater(Math.min(delay * 2, 60000));
  }, delay);
}

// Load world info to get dynamic world size
async function loadWorldInfo() {
  try {
    let res = await fetch(`${API}/api/world/info`);
    // serveur en démarrage (sa carte n'est pas encore chargée) : quelques nouvelles tentatives si la graine est inconnue
    for (let i = 0; res.status === 503 && !worldSeedKnown && i < 8; i++) {
      await new Promise(r => setTimeout(r, 1500));
      res = await fetch(`${API}/api/world/info`);
    }
    if (res.ok) {
      const info = await res.json();
      applyWorldSeed(typeof info.worldSeed === 'number' ? info.worldSeed : 0, info.terrainSignature);   // un serveur d'avant les cartes au hasard joue la carte de référence
      worldSeedConfirmed = true;
      updateWorldSize(info.playerCount, info.worldSize);
      if (info.factions) { window.factionsData = info.factions; applyFactionBonusTexts(); }
      if (info.rules) window.worldRules = info.rules;   // paliers de ville par Bâtiment principal, plafond hors capitale, colonies
      // terrainVersion : la version du terrain qu'il faut pour dessiner la carte de ce serveur
      if (info.terrainVersion && typeof Terrain !== 'undefined' && info.terrainVersion > Terrain.TERRAIN_VERSION) onTerrainOutdated();
      else { try { sessionStorage.removeItem('terrain-reload'); } catch (e) { /* stockage indisponible */ } }
      console.log(`🌍 World: ${info.worldSize}x${info.worldSize}, ${info.playerCount} players, ${info.resourceNodes} resource nodes`);
    }
  } catch (e) {
    console.warn('Could not load world info, using defaults');
  }
}

async function loadPlayer() {
  try {
    const res = await requestManager.fetchWithRetry(`${API}/api/player/me`, { 
      headers: { Authorization: `Bearer ${token}` } 
    });
    if (res.ok) {
      player = await res.json();
      player.allianceId = player.alliance?.allianceId || null;
      if (!window._playerReadyFor || window._playerReadyFor !== player.id) { window._playerReadyFor = player.id; if (typeof window.onPlayerReady === 'function') window.onPlayerReady(player); }
      document.getElementById('player-name').textContent = player.name;
      document.getElementById('player-faction').textContent = player.faction;
      document.getElementById('player-pop').textContent = player.population || 0;
      document.getElementById('res-gold').textContent = formatNum(player.gold || 0);
      return true;
    } else if (res.status === 401) {
      onSessionExpired();
      return false;
    }
    return !!player;   // transient error: keep the current session
  } catch (e) {
    console.warn('loadPlayer error:', e);
    return !!player;
  }
}

async function loadCities() {
  try {
    const res = await requestManager.fetchWithRetry(`${API}/api/cities`, { 
      headers: { Authorization: `Bearer ${token}` } 
    });
    if (res.ok) {
      const newCities = await res.json();
      // Ne mettre à jour que si les données ont changé
      const hasChanged = JSON.stringify(cities) !== JSON.stringify(newCities);
      cities = newCities;
      
      if (cities.length > 0) {
        // Garder la ville actuelle si elle existe encore
        if (currentCity) {
          const updated = cities.find(c => c.id === currentCity.id);
          if (updated) {
            currentCity = updated;
          } else {
            currentCity = cities[0];
          }
        } else {
          currentCity = cities[0];
        }
        
        if (hasChanged) {
          updateCitySelector();
          renderCity();
        }
      }
    }
  } catch (e) {
    console.warn('loadCities error:', e);
  }
}

async function loadArmies() {
  try {
    const res = await requestManager.fetchWithRetry(`${API}/api/armies`, { 
      headers: { Authorization: `Bearer ${token}` } 
    });
    if (res.ok) {
      armies = await res.json();
    }
  } catch (e) {
    console.warn('loadArmies error:', e);
  }
}

function updateCitySelector() {
  // Update old select if it exists
  const select = document.getElementById('city-select');
  if (select) {
    select.innerHTML = cities.map(c =>
      `<option value="${c.id}" ${c.id === currentCity?.id ? 'selected' : ''}>${escapeHtml(c.name)} ${c.isCapital ? '👑' : ''}</option>`
    ).join('');
  }
  // Update bottom-nav village selector
  updateQuicklinksCity();
}

function selectCity(id) {
  currentCity = cities.find(c => c.id === id);
  renderCity();
  updateQuicklinksCity();
}

function updateQuicklinksCity() {
  const nameElM = document.getElementById('city-name-quick-m');
  if (nameElM && currentCity) nameElM.textContent = currentCity.name;
  const nameEl = document.getElementById('city-name-quick');
  const coordsEl = document.getElementById('city-coords-quick');
  const tierEl = document.getElementById('city-tier-quick');
  if (currentCity && nameEl) {
    nameEl.textContent = currentCity.name + (currentCity.isCapital ? ' ⭐' : '');
    if (coordsEl) coordsEl.textContent = `(${currentCity.x}|${currentCity.y})`;
    // Display city tier (Village/Ville/Ville Fortifiée)
    if (tierEl) {
      const tierName = currentCity.cityTierName || 'Village';
      const tierColors = { 'Village': '#90ee90', 'Ville': '#87ceeb', 'Ville Fortifiée': '#ffd700' };
      tierEl.textContent = tierName;
      tierEl.style.color = tierColors[tierName] || '#90ee90';
    }
  }
}

// ========== INCOMING ATTACK NOTIFICATION ==========
let incomingAttacks = [];
let attackCheckInterval = null;

async function checkIncomingAttacks() {
  try {
    const resp = await fetch(`${API}/api/city/incoming-attacks`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (resp.ok) {
      incomingAttacks = await resp.json();
    }
  } catch (e) {
    // Silently ignore
  }
}

function updateAttackNotification() {
  const notifEl = document.getElementById('attack-notif');
  if (!notifEl) return;

  // Filter to attacks that haven't arrived yet (server clock)
  const now = new Date(serverNow());
  const active = incomingAttacks.filter(a => new Date(a.arrivalAt) > now);

  if (active.length === 0) {
    notifEl.style.display = 'none';
    return;
  }

  notifEl.style.display = 'flex';

  // Show earliest attack timer
  const earliest = active[0];
  const diff = new Date(earliest.arrivalAt) - now;
  const totalSec = Math.max(0, Math.floor(diff / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const timerStr = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;

  const timerEl = document.getElementById('attack-timer');
  if (timerEl) {
    timerEl.textContent = timerStr;
    timerEl.title = earliest.type === 'SIEGE'
      ? `${earliest.attacker || 'Une armée'} campe devant ${earliest.targetCity} : combat dans ce délai. Touchez pour attaquer le camp.`
      : earliest.attacker ? `${earliest.attacker} marche sur ${earliest.targetCity}${earliest.units ? ' avec ' + earliest.units + ' soldats' : ''}` : `Armée inconnue en approche de ${earliest.targetCity}`;
  }
  // A siege in progress: the alert opens the siege window (break it with an army of the city or of an ally)
  const siege = active.find(a => a.type === 'SIEGE');
  notifEl.classList.toggle('siege', !!siege);
  notifEl.onclick = siege && typeof openBreakSiege === 'function' ? () => openBreakSiege(siege.targetCityId) : null;
  notifEl.style.cursor = siege ? 'pointer' : '';

  // Show count if multiple attacks
  const iconEl = notifEl.querySelector('.attack-icon');
  if (iconEl && iconEl.tagName !== 'IMG') {
    iconEl.textContent = active.length > 1 ? `⚔️ ${active.length}x` : '⚔️';
  } else if (iconEl) {
    iconEl.title = active.length > 1 ? `${active.length} attaques en approche` : 'Attaque en approche';
  }
}

// Start checking for attacks every 30 seconds
function startAttackCheck() {
  if (attackCheckInterval) clearInterval(attackCheckInterval);
  checkIncomingAttacks();
  attackCheckInterval = setInterval(checkIncomingAttacks, 30000);
}

function renderCity() {
  if (!currentCity) return;

  // Update quicklinks city name
  updateQuicklinksCity();

  // Update resources header
  document.getElementById('res-wood').textContent = formatNum(currentCity.wood);
  document.getElementById('res-stone').textContent = formatNum(currentCity.stone);
  document.getElementById('res-iron').textContent = formatNum(currentCity.iron);
  document.getElementById('res-food').textContent = formatNum(currentCity.food);

  // Storage capacity is computed by the server (warehouse / silo curves)
  const maxRes = currentCity.maxStorage || 1000;
  const maxFood = currentCity.maxFoodStorage || 1000;

  // Update max displays
  const maxWoodEl = document.getElementById('max-wood');
  const maxStoneEl = document.getElementById('max-stone');
  const maxIronEl = document.getElementById('max-iron');
  const maxFoodEl = document.getElementById('max-food');
  if (maxWoodEl) maxWoodEl.textContent = formatNum(maxRes);
  if (maxStoneEl) maxStoneEl.textContent = formatNum(maxRes);
  if (maxIronEl) maxIronEl.textContent = formatNum(maxRes);
  if (maxFoodEl) maxFoodEl.textContent = formatNum(maxFood);

  // Update resource progress bars
  const woodPct = Math.min(100, (currentCity.wood / maxRes) * 100);
  const stonePct = Math.min(100, (currentCity.stone / maxRes) * 100);
  const ironPct = Math.min(100, (currentCity.iron / maxRes) * 100);
  const foodPct = Math.min(100, (currentCity.food / maxFood) * 100);

  const woodBar = document.getElementById('wood-bar');
  const clayBar = document.getElementById('clay-bar');
  const ironBar = document.getElementById('iron-bar');
  const foodBar = document.getElementById('food-bar');
  if (woodBar) woodBar.style.width = `${woodPct}%`;
  if (clayBar) clayBar.style.width = `${stonePct}%`;
  if (ironBar) ironBar.style.width = `${ironPct}%`;
  if (foodBar) foodBar.style.width = `${foodPct}%`;

  // Wall HP (if element exists)
  const wallPct = (currentCity.wallHp / currentCity.wallMaxHp) * 100;
  const wallFill = document.getElementById('wall-fill');
  if (wallFill) wallFill.style.width = `${wallPct}%`;
  const wallHpEl = document.getElementById('wall-hp');
  if (wallHpEl) wallHpEl.textContent = `${Math.floor(currentCity.wallHp)}/${currentCity.wallMaxHp}`;
  
  // Production: base 5/5/5/10 + fields, boosted by the bonus buildings (+5%/level), like the server
  const prod = getCityProduction(currentCity);
  let woodProd = prod.wood, stoneProd = prod.stone, ironProd = prod.iron, foodProd = prod.food;
  
  // Calculate food consumption (upkeep) from armies
  let foodConsumption = 0;
  const cityArmies = armies.filter(a => a.cityId === currentCity.id);
  for (const army of cityArmies) {
    if (army.units) {
      for (const unit of army.units) {
        const unitDef = unitsData.find(u => u.key === unit.unitKey);
        // Upkeep par tier (must match backend config.army.upkeepPerTier)
        // GDD economy_config.json upkeep values
        const upkeep = unitDef?.tier === 'base' ? 5 :
                       unitDef?.tier === 'intermediate' ? 10 :
                       unitDef?.tier === 'elite' ? 15 : 15;
        foodConsumption += unit.count * upkeep;
      }
    }
  }
  
  // Net food production
  const netFood = foodProd - foodConsumption;
  
  // Update production display (Travian style: "/h: X")
  const prodWoodEl = document.getElementById('prod-wood');
  const prodStoneEl = document.getElementById('prod-stone');
  const prodIronEl = document.getElementById('prod-iron');
  if (prodWoodEl) prodWoodEl.textContent = `/h: ${formatNum(woodProd)}`;
  if (prodStoneEl) prodStoneEl.textContent = `/h: ${formatNum(stoneProd)}`;
  if (prodIronEl) prodIronEl.textContent = `/h: ${formatNum(ironProd)}`;

  // Food display with consumption
  const foodEl = document.getElementById('prod-food');
  if (foodEl) {
    if (netFood >= 0) {
      foodEl.textContent = `/h: ${formatNum(netFood)}`;
      foodEl.style.color = '';
    } else {
      foodEl.textContent = `/h: ${formatNum(netFood)}`;
      foodEl.style.color = '#c03030';
    }
  }

  // Calculate time until warehouse full (Travian timer style)
  function calcTimeToFull(current, max, prodPerH) {
    if (prodPerH <= 0 || current >= max) return '00:00:00';
    const remaining = max - current;
    const hoursLeft = remaining / prodPerH;
    const totalSec = Math.floor(hoursLeft * 3600);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  const timerWood = document.getElementById('timer-wood');
  const timerStone = document.getElementById('timer-stone');
  const timerIron = document.getElementById('timer-iron');
  const timerFood = document.getElementById('timer-food');
  if (timerWood) timerWood.textContent = calcTimeToFull(currentCity.wood, maxRes, woodProd);
  if (timerStone) timerStone.textContent = calcTimeToFull(currentCity.stone, maxRes, stoneProd);
  if (timerIron) timerIron.textContent = calcTimeToFull(currentCity.iron, maxRes, ironProd);
  if (timerFood) timerFood.textContent = calcTimeToFull(currentCity.food, maxFood, netFood);

  // Update food timer color if deficit
  if (timerFood && netFood < 0) {
    timerFood.style.background = '#c03030';
  } else if (timerFood) {
    timerFood.style.background = '';
  }

  // Update attack notification
  updateAttackNotification();
  
  // Render 2.5D city canvas
  renderCityCanvas();

  // Render queues (sidebar)
  renderBuildQueue();
  renderRecruitQueue();
  renderMovingArmies();

  // Update sidebar stats
  updateCityStats();
  if (document.getElementById('wounded-list')) loadWounded();   // seulement quand le panneau de la tente de soins est ouvert
}


// ========== CANVAS HAUTE DENSITÉ ==========
// Les canvas de jeu dessinent en pixels CSS (taille logique) sur un backing store × devicePixelRatio,
// pour un rendu net sur mobile. Taille logique courante de la vue ville / champs :
let cityViewW = 800, cityViewH = 600;
function canvasScale() { return Math.min(Math.max(window.devicePixelRatio || 1, 1), 3); }
// Dimensionne un canvas : taille logique (CSS) + backing store à l'échelle, transformation posée sur le contexte
function sizeCanvasForDpr(canvas, ctx, cssW, cssH) {
  const scale = canvasScale();
  canvas.width = Math.round(cssW * scale);
  canvas.height = Math.round(cssH * scale);
  canvas.style.width = cssW + 'px';
  canvas.style.height = cssH + 'px';
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
}

// ========== DIRECTION ARTISTIQUE : sprites peints par IA (painted/) ou rendus 3D (3d/) ==========
// tools/repaint.cjs repeint les rendus 3D dans le style de l'illustration de référence et liste les fichiers
// obtenus dans assets/images/painted/manifest.json ; art(chemin) renvoie la version peinte quand elle existe.
const paintedSet = new Set();
let _paintedPromise = null;
function art(p) { return (paintedSet.has(p) ? 'assets/images/painted/' : 'assets/images/3d/') + p; }
// Première version peinte parmi des candidats (du plus spécifique au plus général), sinon le rendu 3D du premier
function artFirst(cands) { for (const c of cands) if (paintedSet.has(c)) return 'assets/images/painted/' + c; return 'assets/images/3d/' + cands[0]; }
function loadPaintedManifest() {
  if (!_paintedPromise) _paintedPromise = fetch('assets/images/painted/manifest.json').then(r => r.ok ? r.json() : null).then(m => {
    for (const f of (m && m.files) || []) paintedSet.add(f);
    const root = document.documentElement;
    root.classList.toggle('painted-auth', paintedSet.has('scenes/auth-portrait.webp') && paintedSet.has('scenes/auth-landscape.webp'));
    // Paysage de chaque civilisation derrière sa carte d'inscription (scenes/faction-<CIV>, guide § S20)
    document.querySelectorAll('.faction-option[data-faction]').forEach(card => { const p = `scenes/faction-${card.dataset.faction}.webp`; if (paintedSet.has(p)) { card.style.backgroundImage = `linear-gradient(rgba(20,14,8,.55), rgba(20,14,8,.75)), url(assets/images/painted/${p})`; card.style.backgroundSize = 'cover'; card.classList.add('painted-faction'); } });
    root.classList.toggle('painted-headers', ['market', 'alliance', 'ranking', 'inventory', 'reports'].every(k => paintedSet.has(`scenes/header-${k}.webp`)));
    root.classList.toggle('painted-ui', ['btn-primary', 'btn-secondary', 'btn-danger', 'btn-gold', 'btn-info', 'frame-modal', 'frame-panel', 'plate-parchment', 'bar-wood'].every(k => paintedSet.has(`ui/${k}.webp`)));
    if (paintedSet.size) { repaintStaticIcons(document); if (typeof queueSpriteRedraw === 'function') queueSpriteRedraw(); }
  }).catch(() => {});
  return _paintedPromise;
}
loadPaintedManifest();
// Icônes écrites en dur (index.html, gabarits générés) : bascule vers la version peinte quand elle existe
function repaintStaticIcons(root) {
  if (!paintedSet.size || !root || !root.querySelectorAll) return;
  for (const img of root.querySelectorAll('img[src^="assets/images/3d/ui/"]')) { const p = img.getAttribute('src').slice('assets/images/3d/'.length); if (paintedSet.has(p)) img.setAttribute('src', 'assets/images/painted/' + p); }
}
// Les panneaux sont régénérés en innerHTML : un observateur bascule leurs icônes à chaque mise à jour
// (les nœuds ajoutés sont traités en une seule passe par image, et seulement s'il existe des icônes peintes)
const _repaintQueue = new Set();
let _repaintScheduled = false;
if (typeof MutationObserver === 'function') document.addEventListener('DOMContentLoaded', () => new MutationObserver(muts => {
  if (!paintedSet.size) return;
  for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1) _repaintQueue.add(n);
  if (_repaintScheduled || !_repaintQueue.size) return;
  _repaintScheduled = true;
  requestAnimationFrame(() => {
    _repaintScheduled = false;
    const nodes = [..._repaintQueue]; _repaintQueue.clear();
    for (const n of nodes) if (n.isConnected) repaintStaticIcons(n);
  });
}).observe(document.body, { childList: true, subtree: true }));

// ========== SPRITES 2.5D (WebP rendus en 3D par tools/build-3d.cjs : assets/images/3d/**) ==========
// Cadre commun des sprites ville/champs/parcelles : 130×180 (rendus en 2×), centre du losange au sol à
// l'ancre (0.5, 0.75) ; le losange d'une parcelle (2×2 unités) fait 100 px de large dans ce cadre
const SPRITE_FRAME = { w: 130, h: 180, ax: 0.5, ay: 0.75 };
const SPRITE_PLOT_W = 100 / 130;   // largeur du losange de parcelle, en fraction de la largeur du sprite
const _sprites = new Map();   // url -> { img, ready, failed }
const _spriteRasters = new Map(); // url@largeur -> canvas (un SVG rasterisé une fois par taille, puis simple blit)
let _spriteRedrawQueued = false;

// L'image n'a pas pu être chargée (fichier absent, réseau) : le dessin de repli prend le relais
function spriteFailed(url) { const s = _sprites.get(url); return !!(s && s.failed); }
function getSprite(url) {
  let s = _sprites.get(url);
  if (!s) {
    const img = new Image();
    s = { img, ready: false, failed: false };
    _sprites.set(url, s);
    img.onload = () => { s.ready = img.naturalWidth > 0; queueSpriteRedraw(); };
    img.onerror = () => { s.failed = true; queueSpriteRedraw(); };   // image absente : rendu de repli (redessiné tout de suite), pas de nouvel essai
    img.src = url;
  }
  return s.ready ? s.img : null;
}

// Un seul re-rendu par lot d'images chargées (la vue ville est aussi animée, la carte non)
function queueSpriteRedraw() {
  if (_spriteRedrawQueued) return;
  _spriteRedrawQueued = true;
  requestAnimationFrame(() => {
    _spriteRedrawQueued = false;
    if (document.getElementById('game-screen')?.style.display !== 'flex') return;
    if (typeof renderCityCanvas === 'function' && document.getElementById('tab-city')?.classList.contains('active')) renderCityCanvas();
    if (typeof scheduleMapRender === 'function' && document.getElementById('tab-map')?.classList.contains('active')) scheduleMapRender(true);
  });
}

// Variantes de rendu : le filtre est appliqué une fois à la rasterisation, jamais à chaque image
const SPRITE_VARIANTS = {
  day: '', hover: 'brightness(1.18)',
  night: 'brightness(0.62) saturate(0.85)', 'night-hover': 'brightness(0.85)'
};
function spriteVariant(isHovered) {
  const night = typeof isNightMode === 'function' && isNightMode();
  return night ? (isHovered ? 'night-hover' : 'night') : (isHovered ? 'hover' : 'day');
}

// Rasterise une image SVG à la résolution de l'écran (w × h logiques, × devicePixelRatio), une fois par
// taille et par variante, puis la renvoie pour un simple blit
// Budget mémoire des rasters (octets) : au-delà, les plus anciens sont libérés (Map = ordre d'insertion)
const SPRITE_RASTER_BUDGET = 40 * 1024 * 1024;
let _spriteRasterBytes = 0;
// Paliers de rasterisation : le sprite est rasterisé au palier supérieur puis réduit au dessin (réduction
// bilinéaire peu coûteuse) ; un pincement ne crée donc jamais plus de quelques rasters par sprite
const SPRITE_BUCKETS = [32, 48, 64, 96, 128, 192, 256, 384, 512];
function spriteRaster(img, w, h, variant) {
  const scale = canvasScale();
  const qw = SPRITE_BUCKETS.find(b => b >= w) || SPRITE_BUCKETS[SPRITE_BUCKETS.length - 1], qh = Math.max(1, Math.round(qw * h / w));
  const key = img.src + '@' + qw + '@' + variant + '@' + scale;
  let raster = _spriteRasters.get(key);
  if (raster) { _spriteRasters.delete(key); _spriteRasters.set(key, raster); return raster; }   // LRU : remonte en fin
  raster = document.createElement('canvas');
  raster.width = Math.max(1, Math.round(qw * scale));
  raster.height = Math.max(1, Math.round(qh * scale));
  const rc = raster.getContext('2d');
  const filter = SPRITE_VARIANTS[variant] || '';
  if (filter && 'filter' in rc) rc.filter = filter;
  rc.drawImage(img, 0, 0, raster.width, raster.height);
  _spriteRasters.set(key, raster);
  _spriteRasterBytes += raster.width * raster.height * 4;
  while (_spriteRasterBytes > SPRITE_RASTER_BUDGET && _spriteRasters.size > 1) {
    const [oldKey, old] = _spriteRasters.entries().next().value;
    _spriteRasters.delete(oldKey);
    _spriteRasterBytes -= old.width * old.height * 4;
    old.width = old.height = 0;   // libère le backing store immédiatement
  }
  return raster;
}

// Dessine un sprite ville/champ de largeur w, le centre de son losange au sol en (x, y)
function drawSprite(ctx, img, x, y, w, variant = 'day') {
  const cw = Math.max(1, Math.round(w));
  const ch = Math.max(1, Math.round(w * SPRITE_FRAME.h / SPRITE_FRAME.w));
  const raster = spriteRaster(img, cw, ch, variant);
  ctx.drawImage(raster, x - cw * SPRITE_FRAME.ax, y - ch * SPRITE_FRAME.ay, cw, ch);
}

// Décor (arbre, rocher…) : cadre 64×96, ancre bas-centre (0.5, 0.92) ; h = hauteur logique
const PROP_FRAME = { w: 64, h: 96, ax: 0.5, ay: 0.92 };
function drawProp(ctx, name, x, y, h, variant = 'day') {
  const img = getSprite(art(`props/${name}.webp`));
  if (!img) return false;
  const ch = Math.max(1, Math.round(h));
  const cw = Math.max(1, Math.round(h * PROP_FRAME.w / PROP_FRAME.h));
  const raster = spriteRaster(img, cw, ch, variant);
  ctx.drawImage(raster, x - cw * PROP_FRAME.ax, y - ch * PROP_FRAME.ay, cw, ch);
  return true;
}

// ========== TEXTURES DE TERRAIN (tuiles répétables : peintes painted/terrain/<nom>.webp, sinon assets/images/terrain/<nom>.svg) ==========
// Jeu complet de textures (docs/GUIDE-COMPLEMENTS-ANIMATIONS.md § T) : chaque variante peinte est utilisée dès qu'elle existe
// (painted/terrain/<nom>.webp), sinon on se replie sur une variante plus générale, jusqu'aux quatre sols de base
// (grass, dirt, sand, snow : peints ou SVG). Les textures d'eau n'ont pas de repli : sans image, le code dessine l'eau.
const TEXTURE_FALLBACK = {
  grass_lawn: 'grass', grass_dark: 'grass', grass_dry: 'grass', grass_flowers: 'grass', grass_hills: 'grass',
  dirt_packed: 'dirt', mud: 'dirt', gravel: 'dirt', cobble: 'dirt', flagstone: 'cobble', road_dirt: 'dirt_packed', road_paved: 'cobble', path_sand: 'sand',
  sand_ripples: 'sand', sand_rocky: 'sand', cracked_earth: 'sand', snow_fresh: 'snow', snow_trampled: 'snow', tundra: 'snow',
  plaza_ROME: 'flagstone', plaza_GAUL: 'dirt_packed', plaza_GREEK: 'flagstone', plaza_EGYPT: 'flagstone', plaza_HUN: 'dirt_packed', plaza_SULTAN: 'flagstone',
  soil_tilled: 'dirt', wheat: 'grass', orchard: 'grass',
  water_lake: null, water_deep: 'water_lake', water_river: 'water_lake', water_shallow: 'water_lake', ice: null
};
const TEXTURE_BASE = { grass: 1, dirt: 1, sand: 1, snow: 1 };
function hasPaintedTexture(name) { return paintedSet.has(`terrain/${name}.webp`); }
function terrainTextureUrl(name) {
  for (let n = name, guard = 0; n && guard < 8; n = TEXTURE_FALLBACK[n], guard++) {
    if (paintedSet.has(`terrain/${n}.webp`)) return `assets/images/painted/terrain/${n}.webp`;
    if (TEXTURE_BASE[n]) return `assets/images/terrain/${n}.svg`;
  }
  return null;
}
// Décalques au sol (painted/decals/<nom>.webp, fond transparent) : seulement quand l'image existe
function drawDecal(ctx, name, x, y, w, alpha = 1) {
  if (!paintedSet.has(`decals/${name}.webp`)) return false;
  const img = getSprite(`assets/images/painted/decals/${name}.webp`);
  if (!img) return false;
  ctx.globalAlpha = alpha;
  ctx.drawImage(img, x - w / 2, y - w / 4, w, w / 2);   // vu de dessus en projection iso : écrasé de moitié
  ctx.globalAlpha = 1;
  return true;
}
const _terrainPatterns = new Map();
function getTerrainPattern(ctx, name) {
  const url = terrainTextureUrl(name);
  if (!url) return null;
  const img = getSprite(url);
  if (!img) return null;
  const scale = canvasScale();
  const key = url + '@' + scale;
  let pattern = _terrainPatterns.get(key);
  if (!pattern) {
    // Tuile rasterisée à la résolution de l'écran, puis ramenée à 128 px logiques
    const tile = document.createElement('canvas');
    tile.width = Math.round(128 * scale);
    tile.height = Math.round(128 * scale);
    tile.getContext('2d').drawImage(img, 0, 0, tile.width, tile.height);
    pattern = ctx.createPattern(tile, 'repeat');
    if (scale !== 1 && pattern && typeof pattern.setTransform === 'function' && typeof DOMMatrix === 'function') {
      pattern.setTransform(new DOMMatrix().scale(1 / scale));
    }
    _terrainPatterns.set(key, pattern);
  }
  return pattern;
}
// Remplit (ou trace) le chemin courant avec la texture, puis le style d'origine par-dessus à overlayAlpha
// pour garder le modelé (dégradés, nuit). Sans texture chargée : style d'origine seul.
function fillTextured(ctx, name, style, overlayAlpha) {
  const pattern = getTerrainPattern(ctx, name);
  if (pattern) { ctx.fillStyle = pattern; ctx.fill(); ctx.globalAlpha = overlayAlpha; }
  ctx.fillStyle = style;
  ctx.fill();
  ctx.globalAlpha = 1;
}
function strokeTextured(ctx, name, style, overlayAlpha) {
  const pattern = getTerrainPattern(ctx, name);
  if (pattern) { ctx.strokeStyle = pattern; ctx.stroke(); ctx.globalAlpha = overlayAlpha; }
  ctx.strokeStyle = style;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

// ========== BIOMES (prairie / désert / neige) ==========
// Le biome d'une ville découle de sa position (même règle que la carte : getBiome dans map.js)
const BIOME_SCENE = {
  forest: { texture: 'grass', day: ['#6a9a4a', '#5a8a3a', '#4a7a2a', '#3a6a1a'], night: ['#2a4030', '#1a3020', '#152818', '#102010'],
    inner: ['#82bc48', '#74b03a', '#68a430', '#5c9828', '#508c20'], innerNight: ['#3a5030', '#2a4020', '#1a3015'],
    sky: ['#4a90c2', '#7bb8e0', '#a8d8f0'], hills: '#5a8a4a', hillsNight: '#1a2a18', props: { trees: ['pine', 'oak'], rock: 'rock' } },
  desert: { texture: 'sand', day: ['#e2c88e', '#d4b876', '#c4a660', '#b0924e'], night: ['#4a3e2a', '#3a3020', '#2e2618', '#241e12'],
    inner: ['#f0dca4', '#e6cf92', '#dcc484', '#d2b874', '#c8ae68'], innerNight: ['#4a4030', '#3a3222', '#2a2418'],
    sky: ['#5f9ed8', '#9ec6e8', '#f0d9a8'], hills: '#c9ad6e', hillsNight: '#3a3020', props: { trees: ['palm', 'cactus'], rock: 'dune' } },
  snow: { texture: 'snow', day: ['#eef3f8', '#dfe8f0', '#cfdbe6', '#bccbd8'], night: ['#2e3a4a', '#243040', '#1c2634', '#161e2a'],
    inner: ['#ffffff', '#f3f7fb', '#e8eef4', '#dde6ee', '#d0dbe6'], innerNight: ['#3a4656', '#2c3848', '#202a38'],
    sky: ['#8fb3d1', '#b8d0e4', '#dbe6ef'], hills: '#c8d4e0', hillsNight: '#242e3c', props: { trees: ['snowpine', 'snowpine'], rock: 'snowrock' } }
};
function cityBiome() {
  return (typeof getBiome === 'function' && currentCity) ? getBiome(currentCity.x, currentCity.y) : 'forest';
}
function biomeScene(biome) { return BIOME_SCENE[biome] || BIOME_SCENE.forest; }
function biomeGroundGradient(ctx, x0, y0, x1, y1, biome, night) {
  const g = ctx.createLinearGradient(x0, y0, x1, y1);
  const stops = night ? biomeScene(biome).night : biomeScene(biome).day;
  [0, 0.3, 0.7, 1].forEach((p, i) => g.addColorStop(p, stops[i]));
  return g;
}
function biomeInnerGradient(ctx, cx, cy, r, biome, night) {
  const g = ctx.createRadialGradient(cx, cy - 20, 0, cx, cy, r);
  const sc = biomeScene(biome);
  if (night) [0, 0.5, 1].forEach((p, i) => g.addColorStop(p, sc.innerNight[i]));
  else [0, 0.2, 0.5, 0.8, 1].forEach((p, i) => g.addColorStop(p, sc.inner[i]));
  return g;
}

// Bâtiment : architecture de la faction du joueur, palier visuel selon le niveau (1-6 modeste, 7-13 courant,
// 14-20 prestigieux ; le palier courant n'a pas de suffixe), variante enneigée dans le biome neige
function buildingTier(level) { return !level || level <= 6 ? 1 : level <= 13 ? 2 : 3; }
function buildingTierScale(level) { return [0, 0.74, 1, 1.14][buildingTier(level)]; }   // échelle des modèles 3D par palier (ancres des animations)
function buildingSpriteUrl(key, level = 10) {
  const f = player?.faction || 'ROME', snow = cityBiome() === 'snow' ? '_snow' : '', tier = buildingTier(level);
  const cur = `buildings/${f}/${key}${snow}.webp`;
  return tier === 2 ? art(cur) : artFirst([`buildings/${f}/${key}_t${tier}${snow}.webp`, cur]);
}
// Paliers visuels des champs : niveaux 1-6, 7-13, 14-20 ; cultures, arbres et sol propres au biome
function fieldSpriteUrl(type, level) {
  return art(`fields/${cityBiome()}/${type}_${level <= 6 ? 1 : level <= 13 ? 2 : 3}.webp`);
}
// Parcelle au sol du biome (sous chaque bâtiment et pour les emplacements vides), deux variantes
function plotSpriteUrl(variant = 0) { return art(`plots/${cityBiome()}_${variant & 1}.webp`); }
// Chantiers peints (docs/GUIDE-COMPLEMENTS-ANIMATIONS.md § S10-S11) : bâtiment en construction, échafaudage de la civilisation,
// champ en chantier ; null tant que l'image n'est pas livrée (le code garde alors le clignotement et le marteau)
function paintedUrl(p) { return typeof paintedSet !== 'undefined' && paintedSet.has(p) ? 'assets/images/painted/' + p : null; }
function buildingSiteUrl(key) { return paintedUrl(`buildings/${player?.faction || 'ROME'}/${key}_site.webp`); }
function scaffoldUrl(level) { return paintedUrl(`props/scaffold_${player?.faction || 'ROME'}_${buildingTier(level)}.webp`); }
function fieldSiteUrl(type) { return paintedUrl(`fields/${cityBiome()}/${type}_site.webp`); }

// Vignette 3D d'un bâtiment (sprite de la vue ville, architecture de la faction) pour les panneaux générés en HTML
function buildingIconHtml(key, cls = 'b-ico') { return `<img class="${cls}" src="${buildingSpriteUrl(key)}" alt="">`; }
// Icône 3D d'une ressource / d'une action (assets/images/3d/ui) pour les panneaux générés en HTML
function resIconHtml(key, cls = 'ico') { return `<img class="${cls}" src="${art(`ui/${key}.webp`)}" alt="">`; }

// Entrée / « OK » du clavier soumet les formulaires de connexion et d'inscription (auth-enter-submit)
document.addEventListener('keydown', (e) => {
  if (e.key !== 'Enter' || !(e.target instanceof HTMLInputElement)) return;
  if (e.target.closest('#login-form')) { e.preventDefault(); login(); }
  else if (e.target.closest('#register-form')) { e.preventDefault(); register(); }
});

// ========== PORTRAITS 3D (assets/images/3d/busts, assets/images/3d/heroes) ==========
const UNIT_KEY_FACTION = { ROM: 'ROME', GAU: 'GAUL', GRE: 'GREEK', EGY: 'EGYPT', HUN: 'HUN', SUL: 'SULTAN' };
function unitFactionOf(unitKey) { return UNIT_KEY_FACTION[String(unitKey || '').split('_')[0]] || null; }
function unitClassOf(unitKey) { const d = (typeof unitsData !== 'undefined' ? unitsData : []).find(u => u.key === unitKey); return d?.class || null; }
// Portrait d'une unité (clé d'unité ou classe) : <img class="unit-ico">, faction déduite de la clé
function unitIconHtml(keyOrClass, cls = 'unit-ico', title = '') {
  const isClass = ['INFANTRY', 'ARCHER', 'CAVALRY', 'SIEGE'].includes(keyOrClass);
  const klass = isClass ? keyOrClass : (unitClassOf(keyOrClass) || 'INFANTRY');
  const faction = isClass ? (player?.faction || null) : unitFactionOf(keyOrClass);
  const file = faction ? `${klass}_${faction}` : klass;
  // Jeton propre à l'unité (busts/units/<CLÉ>, guide § S17) dès qu'il est peint, sinon le jeton de la classe
  const own = !isClass && typeof paintedSet !== 'undefined' && paintedSet.has(`busts/units/${keyOrClass}.webp`) ? `assets/images/painted/busts/units/${keyOrClass}.webp` : null;
  return `<img class="${cls}" src="${own || `assets/images/3d/busts/${file}.webp`}" alt="" title="${escapeHtml(title)}">`;
}
// Figurine en pied (vue trois-quarts) d'une unité : assets/images/3d/figures/<CLASSE>_<FACTION>.webp
function unitFigureHtml(keyOrClass, cls = 'unit-figure', title = '') {
  const isClass = ['INFANTRY', 'ARCHER', 'CAVALRY', 'SIEGE'].includes(keyOrClass);
  const klass = isClass ? keyOrClass : (unitClassOf(keyOrClass) || 'INFANTRY');
  const faction = (isClass ? player?.faction : unitFactionOf(keyOrClass)) || player?.faction || 'ROME';
  const ownFig = typeof paintedSet !== 'undefined' && paintedSet.has(`figures/units/${keyOrClass}.webp`) ? `assets/images/painted/figures/units/${keyOrClass}.webp` : null;   // figurine propre à l'unité (guide § S17)
  return `<img class="${cls}" src="${ownFig || art(`figures/${klass}_${faction}.webp`)}" alt="" title="${escapeHtml(title)}">`;
}
function unitIconUrl(keyOrClass) { const m = unitIconHtml(keyOrClass).match(/src="([^"]+)"/); return m ? m[1] : ''; }
function heroPortraitHtml(faction, cls = 'hero-ico') { return `<img class="${cls}" src="assets/images/3d/heroes/${faction || player?.faction || 'ROME'}_bust.webp" alt="">`; }
// Figurine du héros sur son estrade (scène 3D) pour l'écran du héros
function heroStageUrl(faction) { return art(`scenes/hero-${faction || player?.faction || 'ROME'}.webp`); }
