// ============================================================================
// GAME.JS - Main Game Controller
// ============================================================================

// Game State
const gameState = {
  player: null,
  currentCity: null,
  cities: [],
  armies: [],
  alliance: null,
  refreshInterval: null,
};

// Building icons
const BUILDING_ICONS = {
  MAIN_HALL: '🏛️', RALLY_POINT: '⚔️', MARKET: '🏪', BARRACKS: '🛡️',
  STABLE: '🐎', WORKSHOP: '🔨', ACADEMY: '📚', FORGE: '⚒️',
  FARM: '🌾', LUMBER: '🪵', QUARRY: '🪨', IRON_MINE: '⛏️',
  SILO: '🏚️', WAREHOUSE: '📦', HIDEOUT: '🕳️', HEALING_TENT: '⛺',
  WALL: '🧱', MOAT: '🌊',
};

const UNIT_ICONS = { INFANTRY: '🗡️', ARCHER: '🏹', CAVALRY: '🐎', SIEGE: '💣' };
const RESOURCE_ICONS = { wood: '🪵', stone: '🪨', iron: '⛏️', food: '🌾' };

// ============================================================================
// INITIALIZATION
// ============================================================================

document.addEventListener('DOMContentLoaded', async () => {
  setTimeout(() => document.querySelector('.loading-progress').style.width = '100%', 500);
  setTimeout(async () => {
    document.getElementById('loading-screen').classList.add('hidden');
    if (api.isAuthenticated()) {
      await initGame();
    } else {
      showAuthScreen();
    }
  }, 2000);
});

function showAuthScreen() {
  document.getElementById('auth-screen').classList.remove('hidden');
  setupAuthHandlers();
}

function setupAuthHandlers() {
  document.getElementById('show-register')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('login-form').classList.add('hidden');
    document.getElementById('register-form').classList.remove('hidden');
  });

  document.getElementById('show-login')?.addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('register-form').classList.add('hidden');
    document.getElementById('login-form').classList.remove('hidden');
  });

  document.getElementById('login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await api.login(
        document.getElementById('login-email').value,
        document.getElementById('login-password').value
      );
      document.getElementById('auth-screen').classList.add('hidden');
      await initGame();
      showToast('Bienvenue !', 'success');
    } catch (error) {
      showToast(error.message || 'Erreur de connexion', 'error');
    }
  });

  document.getElementById('register-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const faction = document.getElementById('reg-faction').value;
    if (!faction) { showToast('Choisissez une faction', 'warning'); return; }
    try {
      await api.register(
        document.getElementById('reg-name').value,
        document.getElementById('reg-email').value,
        document.getElementById('reg-password').value,
        faction
      );
      try { await api.bootstrap(); } catch (e) {}
      document.getElementById('auth-screen').classList.add('hidden');
      await initGame();
      showToast('Empire créé !', 'success');
    } catch (error) {
      showToast(error.message || 'Erreur', 'error');
    }
  });
}

async function initGame() {
  document.getElementById('game-screen').classList.remove('hidden');
  try {
    gameState.player = await api.getPlayer();
    updatePlayerDisplay();
    await loadCities();
    setupNavigation();
    startRefreshLoop();
    switchView('city');
  } catch (error) {
    console.error('Init error:', error);
    showToast('Erreur de chargement', 'error');
  }
}

function startRefreshLoop() {
  if (gameState.refreshInterval) clearInterval(gameState.refreshInterval);
  gameState.refreshInterval = setInterval(async () => {
    if (gameState.currentCity) {
      await loadCityDetails(gameState.currentCity.id);
    }
    updateTimers();
  }, 5000);
}

function updateTimers() {
  document.querySelectorAll('[data-ends]').forEach(el => {
    const ends = new Date(el.dataset.ends);
    const remaining = Math.max(0, ends - new Date());
    el.textContent = formatDuration(remaining);
  });
}

// ============================================================================
// PLAYER & CITY
// ============================================================================

function updatePlayerDisplay() {
  if (gameState.player) {
    document.getElementById('player-name').textContent = gameState.player.name;
    document.getElementById('player-pop').textContent = formatNumber(gameState.player.population);
  }
}

async function loadCities() {
  try {
    gameState.cities = await api.getCities() || [];
    if (gameState.cities.length > 0 && !gameState.currentCity) {
      gameState.currentCity = gameState.cities.find(c => c.type === 'CAPITAL') || gameState.cities[0];
      await loadCityDetails(gameState.currentCity.id);
    }
  } catch (e) { console.error(e); }
}

async function loadCityDetails(cityId) {
  try {
    gameState.currentCity = await api.getCity(cityId);
    updateCityDisplay();
    updateResourceDisplay();
  } catch (e) { console.error(e); }
}

function updateCityDisplay() {
  const city = gameState.currentCity;
  if (!city) return;
  document.getElementById('city-name').textContent = city.name;
  document.getElementById('city-coords').textContent = `${city.x}, ${city.y}`;
  updateBuildingsGrid();
  updateBuildQueue();
  updateRecruitQueue();
}

function updateResourceDisplay() {
  const city = gameState.currentCity;
  if (!city) return;
  document.getElementById('res-wood').textContent = formatNumber(Math.floor(city.wood));
  document.getElementById('res-stone').textContent = formatNumber(Math.floor(city.stone));
  document.getElementById('res-iron').textContent = formatNumber(Math.floor(city.iron));
  document.getElementById('res-food').textContent = formatNumber(Math.floor(city.food));

  const buildings = city.buildings || [];
  let wp = 0, sp = 0, ip = 0, fp = 0;
  buildings.forEach(b => {
    const p = b.prodPerHour || 0;
    if (b.key === 'LUMBER') wp += p;
    if (b.key === 'QUARRY') sp += p;
    if (b.key === 'IRON_MINE') ip += p;
    if (b.key === 'FARM') fp += p;
  });
  document.getElementById('prod-wood').textContent = `+${formatNumber(Math.floor(wp))}/h`;
  document.getElementById('prod-stone').textContent = `+${formatNumber(Math.floor(sp))}/h`;
  document.getElementById('prod-iron').textContent = `+${formatNumber(Math.floor(ip))}/h`;
  document.getElementById('prod-food').textContent = `+${formatNumber(Math.floor(fp))}/h`;
}

function updateBuildingsGrid() {
  const city = gameState.currentCity;
  const grid = document.getElementById('buildings-grid');
  if (!city || !grid) return;
  grid.innerHTML = (city.buildings || []).map(b => `
    <div class="building-card" data-building="${b.key}" data-level="${b.level}">
      <div class="building-icon">${BUILDING_ICONS[b.key] || '🏗️'}</div>
      <div class="building-name">${getBuildingName(b.key)}</div>
      <div class="building-level">Niv. ${b.level}</div>
    </div>
  `).join('');
  grid.querySelectorAll('.building-card').forEach(c => {
    c.addEventListener('click', () => openBuildingModal(c.dataset.building, +c.dataset.level));
  });
}

function updateBuildQueue() {
  const city = gameState.currentCity;
  const queue = document.getElementById('build-queue');
  if (!city || !queue) return;
  const items = city.buildQueue || [];
  if (!items.length) { queue.innerHTML = '<p class="empty-queue">Aucune construction</p>'; return; }
  queue.innerHTML = items.map(i => `
    <div class="queue-item">
      <div class="queue-item-info">
        <span>${BUILDING_ICONS[i.buildingKey] || '🏗️'}</span>
        <span>${getBuildingName(i.buildingKey)} Niv.${i.targetLevel}</span>
      </div>
      <div class="queue-item-timer" data-ends="${i.endsAt}">${formatDuration(Math.max(0, new Date(i.endsAt) - new Date()))}</div>
    </div>
  `).join('');
}

function updateRecruitQueue() {
  const city = gameState.currentCity;
  const queue = document.getElementById('recruit-queue');
  if (!city || !queue) return;
  const items = (city.recruitQueue || []).filter(i => i.status !== 'DONE');
  if (!items.length) { queue.innerHTML = '<p class="empty-queue">Aucun recrutement</p>'; return; }
  queue.innerHTML = items.map(i => `
    <div class="queue-item">
      <div class="queue-item-info">
        <span>${getUnitIcon(i.unitKey)}</span>
        <span>${i.unitKey.split('_').pop()} ×${i.count}</span>
      </div>
      <div class="queue-item-timer">${i.status === 'RUNNING' && i.endsAt ? formatDuration(Math.max(0, new Date(i.endsAt) - new Date())) : 'Attente'}</div>
    </div>
  `).join('');
}

// ============================================================================
// NAVIGATION
// ============================================================================

function setupNavigation() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => switchView(btn.dataset.view));
  });
  document.getElementById('btn-settings')?.addEventListener('click', openSettingsModal);
  setupTabs('.market-header', '.market-content');
  setupTabs('.alliance-tabs', '.alliance-tab-content');
  setupTabs('.reports-tabs', '.reports-content');
}

function setupTabs(tabSelector, contentSelector) {
  document.querySelectorAll(`${tabSelector} .tab-btn`).forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll(`${tabSelector} .tab-btn`).forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      document.querySelectorAll(contentSelector).forEach(c => c.classList.remove('active'));
      const target = document.getElementById(`${tab.closest('section, div')?.id?.split('-')[0] || 'market'}-${tab.dataset.tab}`);
      target?.classList.add('active');
    });
  });
}

function switchView(viewName) {
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.view === viewName));
  document.querySelectorAll('.game-view').forEach(view => view.classList.toggle('active', view.id === `view-${viewName}`));
  
  const loaders = {
    city: () => gameState.currentCity && loadCityDetails(gameState.currentCity.id),
    map: initMap,
    army: loadArmiesView,
    market: loadMarketView,
    alliance: loadAllianceView,
    expedition: loadExpeditionView,
    reports: loadReportsView,
    quests: loadQuestsView,
    messages: loadMessagesView,
    inventory: loadInventoryView,
  };
  loaders[viewName]?.();
}

// ============================================================================
// UTILITIES
// ============================================================================

function formatNumber(n) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return Math.floor(n).toString();
}

function formatDuration(ms) {
  if (ms <= 0) return '0s';
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

function getBuildingName(key) {
  const names = {
    MAIN_HALL: 'Bâtiment Principal', RALLY_POINT: 'Place de Rassemblement', MARKET: 'Marché',
    BARRACKS: 'Caserne', STABLE: 'Écurie', WORKSHOP: 'Atelier', ACADEMY: 'Académie',
    FORGE: 'Forge', FARM: 'Ferme', LUMBER: 'Bûcheron', QUARRY: 'Carrière',
    IRON_MINE: 'Mine de Fer', SILO: 'Silo', WAREHOUSE: 'Entrepôt',
    HIDEOUT: 'Cachette', HEALING_TENT: 'Tente de Soins', WALL: 'Mur', MOAT: 'Douves',
  };
  return names[key] || key;
}

function getUnitIcon(key) {
  if (key.includes('_INF_') || key.includes('INFANTRY')) return '🗡️';
  if (key.includes('_ARC_') || key.includes('ARCHER')) return '🏹';
  if (key.includes('_CAV_') || key.includes('CAVALRY')) return '🐎';
  if (key.includes('SIEGE') || key.includes('CATAPULTE') || key.includes('BELIER')) return '💣';
  return '⚔️';
}

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span class="toast-icon">${icons[type]}</span><span class="toast-message">${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}

// Placeholder functions for views
async function loadArmiesView() { console.log('Loading armies...'); }
async function loadMarketView() { console.log('Loading market...'); }
async function loadAllianceView() { console.log('Loading alliance...'); }
async function loadExpeditionView() { console.log('Loading expeditions...'); }
async function loadReportsView() { console.log('Loading reports...'); }
function initMap() { console.log('Init map...'); }
function openBuildingModal(key, level) { showModal('Bâtiment', `<p>${getBuildingName(key)} - Niveau ${level}</p><p>Améliorer vers niveau ${level + 1} ?</p>`, [{ text: 'Améliorer', class: 'btn-primary', action: () => upgradeBuildingAction(key) }]); }
function openSettingsModal() { showModal('Paramètres', '<p>Paramètres du jeu</p>', [{ text: 'Déconnexion', class: 'btn-danger', action: () => api.logout() }]); }

async function upgradeBuildingAction(key) {
  try {
    await api.startBuild(gameState.currentCity.id, 1, key);
    showToast('Construction lancée !', 'success');
    closeModal();
    await loadCityDetails(gameState.currentCity.id);
  } catch (e) {
    showToast(e.message || 'Erreur', 'error');
  }
}
