// MonJeu v0.6 - Frontend JavaScript (Optimized)
const API = '';
let token = localStorage.getItem('token');
let player = null;
let currentCity = null;
let cities = [];
let armies = [];

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
    
    if (this.pending.has(key)) {
      return this.pending.get(key);
    }
    
    const promise = fetch(url, options)
      .then(res => {
        this.pending.delete(key);
        return res;
      })
      .catch(err => {
        this.pending.delete(key);
        throw err;
      });
    
    this.pending.set(key, promise);
    return promise;
  },
  
  // Fetch avec retry automatique
  async fetchWithRetry(url, options = {}, retries = 2) {
    for (let i = 0; i <= retries; i++) {
      try {
        const res = await this.fetch(url, options);
        if (res.ok || res.status === 400 || res.status === 401) return res;
        if (i < retries) await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      } catch (e) {
        if (i === retries) throw e;
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      }
    }
  }
};

// Building icons mapping (39 bâtiments)
const BUILDING_ICONS = {
  // Base buildings
  MAIN_HALL: '🏛️', FARM: '🌾', LUMBER: '🪵', QUARRY: '🪨', IRON_MINE: '⛏️',
  WAREHOUSE: '📦', SILO: '🏺',
  // Intermediate buildings
  RALLY_POINT: '🚩', BARRACKS: '⚔️', STABLE: '🐎', WORKSHOP: '⚙️',
  ACADEMY: '📚', FORGE: '🔨', HIDEOUT: '🕳️', HEALING_TENT: '⛺',
  // Advanced buildings
  MARKET: '🏪', WALL: '🏰', MOAT: '💧',
  // Production bonus
  MILL: '🌀', BAKERY: '🥖', SAWMILL: '🪚', STONEMASON: '🗿', FOUNDRY: '🔥',
  // Protected storage
  GREAT_SILO: '🏛️', GREAT_WAREHOUSE: '🏗️',
  // Military advanced
  GREAT_BARRACKS: '🏟️', GREAT_STABLE: '🐴', WATCHTOWER: '🗼',
  // Special buildings
  EMBASSY: '🏰', TREASURE_CHAMBER: '💎', HERO_MANSION: '👤', RESIDENCE: '🏠', TRADE_OFFICE: '📊',
  // Faction buildings
  ROMAN_THERMAE: '🛁', GALLIC_BREWERY: '🍺', GREEK_TEMPLE: '⛩️',
  EGYPTIAN_IRRIGATION: '💦', HUN_WAR_TENT: '⛺', SULTAN_DESERT_OUTPOST: '🏜️',
  // Legacy
  HERO_HOME: '👤'
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
      localStorage.setItem('token', token);
      showGame();
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
      localStorage.setItem('token', token);
      showGame();
    } else {
      showAuthError(data.error || 'Erreur d\'inscription');
    }
  } catch (e) {
    showAuthError('Erreur de connexion au serveur');
  }
}

function logout() {
  token = null;
  localStorage.removeItem('token');
  document.getElementById('game-screen').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  el.textContent = msg;
  setTimeout(() => el.textContent = '', 5000);
}

// ========== GAME ==========
async function showGame() {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('game-screen').style.display = 'flex';
  await loadWorldInfo(); // Load world size first
  await Promise.all([loadPlayer(), loadBuildings(), loadUnits()]);
  await loadCities();
  await loadArmies();
  // Init canvases now that game screen is visible and data is loaded
  initCityCanvas();
  initFieldsCanvas();
  renderCityCanvas();
  startAttackCheck();
  startRefresh();
}

// Load world info to get dynamic world size
async function loadWorldInfo() {
  try {
    const res = await fetch(`${API}/api/world/info`);
    if (res.ok) {
      const info = await res.json();
      updateWorldSize(info.playerCount, info.worldSize);
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
      document.getElementById('player-name').textContent = player.name;
      document.getElementById('player-faction').textContent = player.faction;
      document.getElementById('player-pop').textContent = player.population || 0;
      document.getElementById('res-gold').textContent = formatNum(player.gold || 0);
    } else if (res.status === 401) {
      logout();
    }
  } catch (e) {
    console.warn('loadPlayer error:', e);
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
      `<option value="${c.id}" ${c.id === currentCity?.id ? 'selected' : ''}>${c.name} ${c.isCapital ? '👑' : ''}</option>`
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
    const resp = await fetch(`${API}/api/incoming-attacks`, {
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

  // Filter to attacks that haven't arrived yet
  const now = new Date();
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
  }

  // Show count if multiple attacks
  const iconEl = notifEl.querySelector('.attack-icon');
  if (iconEl) {
    iconEl.textContent = active.length > 1 ? `⚔️ ${active.length}x` : '⚔️';
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

  // Calculate max storage
  const warehouse = currentCity.buildings?.find(b => b.key === 'WAREHOUSE');
  const silo = currentCity.buildings?.find(b => b.key === 'SILO');
  const maxRes = 800 + ((warehouse?.level || 0) * 400);
  const maxFood = 800 + ((silo?.level || 0) * 400);

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
  
  // Calculate production
  let woodProd = 5, stoneProd = 5, ironProd = 5, foodProd = 10;
  if (currentCity.buildings) {
    currentCity.buildings.forEach(b => {
      if (b.key === 'LUMBER') woodProd += getProductionAtLevel('LUMBER', b.level);
      if (b.key === 'QUARRY') stoneProd += getProductionAtLevel('QUARRY', b.level);
      if (b.key === 'IRON_MINE') ironProd += getProductionAtLevel('IRON_MINE', b.level);
      if (b.key === 'FARM') foodProd += getProductionAtLevel('FARM', b.level);
    });
  }
  
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
  loadWounded();
}

// ========== CITY CANVAS 2.5D CIRCULAR ==========
let cityCanvas, cityCtx;
let fieldsCanvas, fieldsCtx;
let cityHoveredSlot = null;
let citySlots = [];
let currentCityView = 'city'; // 'city' ou 'fields'

// Définition des 20 slots en disposition circulaire (style Travian)
// Centre = Main Hall, puis anneaux concentriques
const CITY_LAYOUT = {
  // Anneau central (Main Hall) - slot 0
  center: { slot: 0, key: 'MAIN_HALL', fixed: true },
  
  // Anneau intérieur (6 slots) - slots 1-6
  innerRing: [
    { slot: 1, angle: 0 },
    { slot: 2, angle: 60 },
    { slot: 3, angle: 120 },
    { slot: 4, angle: 180 },
    { slot: 5, angle: 240 },
    { slot: 6, angle: 300 }
  ],
  
  // Anneau extérieur (13 slots) - slots 7-19
  outerRing: [
    { slot: 7, angle: 0 },
    { slot: 8, angle: 27.7 },
    { slot: 9, angle: 55.4 },
    { slot: 10, angle: 83.1 },
    { slot: 11, angle: 110.8 },
    { slot: 12, angle: 138.5 },
    { slot: 13, angle: 166.2 },
    { slot: 14, angle: 193.8 },
    { slot: 15, angle: 221.5 },
    { slot: 16, angle: 249.2 },
    { slot: 17, angle: 276.9 },
    { slot: 18, angle: 304.6 },
    { slot: 19, angle: 332.3 }
  ]
};

// Layout des champs de ressources (vue séparée) - 18 emplacements typique Travian
const FIELDS_LAYOUT = {
  // 4 types de ressources × plusieurs emplacements
  fields: [
    // Bois (forêt) - 4 emplacements
    { slot: 1, type: 'LUMBER', angle: 20, ring: 1 },
    { slot: 2, type: 'LUMBER', angle: 70, ring: 2 },
    { slot: 3, type: 'LUMBER', angle: 340, ring: 1 },
    { slot: 4, type: 'LUMBER', angle: 290, ring: 2 },
    
    // Pierre (carrière) - 4 emplacements
    { slot: 5, type: 'QUARRY', angle: 110, ring: 1 },
    { slot: 6, type: 'QUARRY', angle: 160, ring: 2 },
    { slot: 7, type: 'QUARRY', angle: 200, ring: 1 },
    { slot: 8, type: 'QUARRY', angle: 250, ring: 2 },
    
    // Fer (mine) - 4 emplacements
    { slot: 9, type: 'IRON_MINE', angle: 45, ring: 2 },
    { slot: 10, type: 'IRON_MINE', angle: 135, ring: 1 },
    { slot: 11, type: 'IRON_MINE', angle: 225, ring: 2 },
    { slot: 12, type: 'IRON_MINE', angle: 315, ring: 1 },
    
    // Nourriture (ferme) - 6 emplacements
    { slot: 13, type: 'FARM', angle: 0, ring: 1 },
    { slot: 14, type: 'FARM', angle: 60, ring: 1 },
    { slot: 15, type: 'FARM', angle: 120, ring: 1 },
    { slot: 16, type: 'FARM', angle: 180, ring: 1 },
    { slot: 17, type: 'FARM', angle: 240, ring: 1 },
    { slot: 18, type: 'FARM', angle: 300, ring: 1 }
  ]
};

function initCityCanvas() {
  cityCanvas = document.getElementById('city-canvas');
  if (!cityCanvas) return;

  cityCtx = cityCanvas.getContext('2d');

  // Resize to container with fallback dimensions
  const container = cityCanvas.parentElement;
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;
  cityCanvas.width = Math.max(width, 300);
  cityCanvas.height = Math.max(height, 200);

  // Only add events once
  if (!cityCanvas.hasAttribute('data-events-attached')) {
    cityCanvas.setAttribute('data-events-attached', 'true');
    cityCanvas.addEventListener('mousemove', onCityMouseMove);
    cityCanvas.addEventListener('click', onCityClick);
    cityCanvas.addEventListener('mouseleave', () => {
      cityHoveredSlot = null;
      renderCityCanvas();
      hideCityTooltip();
    });
  }

  // Calculate slot positions
  calculateCitySlots();
}

function initFieldsCanvas() {
  fieldsCanvas = document.getElementById('fields-canvas');
  if (!fieldsCanvas) return;

  fieldsCtx = fieldsCanvas.getContext('2d');

  // Resize to container with fallback dimensions
  const container = fieldsCanvas.parentElement;
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;
  fieldsCanvas.width = Math.max(width, 300);
  fieldsCanvas.height = Math.max(height, 200);

  // Only add events once
  if (!fieldsCanvas.hasAttribute('data-events-attached')) {
    fieldsCanvas.setAttribute('data-events-attached', 'true');
    fieldsCanvas.addEventListener('mousemove', onFieldsMouseMove);
    fieldsCanvas.addEventListener('click', onFieldsClick);
    fieldsCanvas.addEventListener('mouseleave', () => {
      cityHoveredSlot = null;
      renderFieldsCanvas();
      hideFieldsTooltip();
    });
  }

  // Calculate field slot positions
  calculateFieldSlots();
}

function calculateCitySlots() {
  if (!cityCanvas) return;
  
  const w = cityCanvas.width;
  const h = cityCanvas.height;
  const centerX = w / 2;
  const centerY = h / 2 + 20;
  
  // Adjust layout based on portrait vs landscape
  const isPortrait = h > w;
  const base = Math.min(w, h);

  const innerRadius = base * (isPortrait ? 0.14 : 0.16);
  const outerRadius = base * (isPortrait ? 0.27 : 0.30);
  const slotSize = base * (isPortrait ? 0.06 : 0.07);
  const yCompress = isPortrait ? 0.50 : 0.55; // Less compression on portrait

  citySlots = [];

  // Centre (Main Hall) - slot 0
  citySlots.push({
    slot: 0,
    x: centerX,
    y: centerY,
    size: slotSize * 1.3,
    fixed: true,
    fixedKey: 'MAIN_HALL'
  });

  // Anneau intérieur (6 slots) - slots 1-6
  CITY_LAYOUT.innerRing.forEach(s => {
    const rad = (s.angle - 90) * Math.PI / 180;
    citySlots.push({
      slot: s.slot,
      x: centerX + Math.cos(rad) * innerRadius,
      y: centerY + Math.sin(rad) * innerRadius * yCompress,
      size: slotSize,
      ring: 'inner'
    });
  });

  // Anneau extérieur (13 slots) - slots 7-19
  CITY_LAYOUT.outerRing.forEach(s => {
    const rad = (s.angle - 90) * Math.PI / 180;
    citySlots.push({
      slot: s.slot,
      x: centerX + Math.cos(rad) * outerRadius,
      y: centerY + Math.sin(rad) * outerRadius * yCompress,
      size: slotSize * 0.85,
      ring: 'outer'
    });
  });
}

function calculateFieldSlots() {
  if (!cityCanvas) return;
  
  const w = cityCanvas.width;
  const h = cityCanvas.height;
  const centerX = w / 2;
  const centerY = h / 2 + 30;
  
  const ring1Radius = Math.min(w, h) * 0.22;
  const ring2Radius = Math.min(w, h) * 0.35;
  const slotSize = Math.min(w, h) * 0.08;
  
  citySlots = [];
  
  // Centre = vue ville (bouton retour)
  citySlots.push({
    slot: -1, // Slot spécial pour retour ville
    x: centerX,
    y: centerY,
    size: slotSize * 1.8,
    isVillageCenter: true
  });
  
  // Champs de ressources en anneaux
  FIELDS_LAYOUT.fields.forEach(f => {
    const radius = f.ring === 1 ? ring1Radius : ring2Radius;
    const rad = (f.angle - 90) * Math.PI / 180;
    
    citySlots.push({
      slot: f.slot,
      x: centerX + Math.cos(rad) * radius,
      y: centerY + Math.sin(rad) * radius * 0.5, // Écrasement 2.5D
      size: slotSize,
      isField: true,
      fieldType: f.type,
      ring: f.ring
    });
  });
}

// Animation loop state
let cityAnimationRunning = false;
let cityAnimationFrame = null;

function startCityAnimation() {
  if (cityAnimationRunning) return;
  cityAnimationRunning = true;
  animateCityView();
}

function stopCityAnimation() {
  cityAnimationRunning = false;
  if (cityAnimationFrame) {
    cancelAnimationFrame(cityAnimationFrame);
    cityAnimationFrame = null;
  }
}

let lastCityFrameTime = 0;
const CITY_FRAME_INTERVAL = 50; // ~20fps for animations (was 60fps)

function animateCityView() {
  if (!cityAnimationRunning) return;

  // Only animate if city tab is visible
  const cityTab = document.getElementById('tab-city');
  if (!cityTab || !cityTab.classList.contains('active')) {
    cityAnimationFrame = requestAnimationFrame(animateCityView);
    return;
  }

  const now = performance.now();
  if (now - lastCityFrameTime >= CITY_FRAME_INTERVAL) {
    lastCityFrameTime = now;
    renderCityCanvas();
  }
  cityAnimationFrame = requestAnimationFrame(animateCityView);
}

function renderCityCanvas() {
  if (!cityCtx || !cityCanvas) {
    initCityCanvas();
    if (!cityCtx) return;
  }

  // Render based on current view mode
  if (currentCityView === 'fields') {
    calculateFieldSlots();
    renderFieldsView();
  } else {
    calculateCitySlots();
    renderCityView();
  }
}

function renderFieldsCanvas() {
  if (!fieldsCtx || !fieldsCanvas) {
    initFieldsCanvas();
    if (!fieldsCtx) return;
  }

  calculateFieldSlots();
  renderFieldsView();
}


function switchCityView(view) {
  currentCityView = view;

  // Update button states (if buttons exist)
  document.getElementById('btn-view-city')?.classList.toggle('active', view === 'city');
  document.getElementById('btn-view-fields')?.classList.toggle('active', view === 'fields');

  // Update bottom nav active tab
  document.querySelectorAll('.bnav-tab').forEach(b => b.classList.remove('active'));
  document.querySelector(`.bnav-tab[data-tab="${view === 'fields' ? 'fields' : 'city'}"]`)?.classList.add('active');

  // Re-render
  calculateCitySlots();
  if (view === 'fields') calculateFieldSlots();
  renderCityCanvas();
}

function renderCityView() {
  const w = cityCanvas.width;
  const h = cityCanvas.height;
  const centerX = w / 2;
  const centerY = h / 2 + 20;
  const nightMode = isNightMode();

  // Clear
  cityCtx.clearRect(0, 0, w, h);

  // ========== SKY (Day/Night) ==========
  const skyGrad = cityCtx.createLinearGradient(0, 0, 0, h * 0.5);
  if (nightMode) {
    // Night sky - deep blue/purple
    skyGrad.addColorStop(0, '#0a1020');
    skyGrad.addColorStop(0.3, '#152040');
    skyGrad.addColorStop(0.7, '#203050');
    skyGrad.addColorStop(1, '#304060');
  } else {
    // Day sky - bright blue
    skyGrad.addColorStop(0, '#4a90c2');
    skyGrad.addColorStop(0.5, '#7bb8e0');
    skyGrad.addColorStop(1, '#a8d4f0');
  }
  cityCtx.fillStyle = skyGrad;
  cityCtx.fillRect(0, 0, w, h * 0.5);

  // Sun/Moon with rays
  if (nightMode) {
    drawMoon(w - 100, 70, 30);
    drawStars(w, h * 0.45);
  } else {
    drawSun(w - 100, 70, 35);
  }

  // Clouds (darker at night)
  if (!nightMode) {
    drawCloud(cityCtx, 80, 45, 45);
    drawCloud(cityCtx, 250, 75, 35);
    drawCloud(cityCtx, w - 250, 55, 40);
    drawCloud(cityCtx, w / 2, 40, 50);
  } else {
    // Night clouds - darker, more subtle
    drawNightCloud(cityCtx, 80, 45, 45);
    drawNightCloud(cityCtx, 250, 75, 35);
    drawNightCloud(cityCtx, w - 250, 55, 40);
  }
  
  // ========== DISTANT MOUNTAINS ==========
  drawMountains(w, h, nightMode);

  // ========== PLAINS / GROUND ==========
  const groundY = h * 0.45;

  // Far grass (Day/Night colors)
  const farGrassGrad = cityCtx.createLinearGradient(0, groundY, 0, h);
  if (nightMode) {
    // Night grass - darker, blue-tinted
    farGrassGrad.addColorStop(0, '#2a4030');
    farGrassGrad.addColorStop(0.3, '#1a3020');
    farGrassGrad.addColorStop(0.7, '#152818');
    farGrassGrad.addColorStop(1, '#102010');
  } else {
    // Day grass - vibrant green
    farGrassGrad.addColorStop(0, '#6a9a4a');
    farGrassGrad.addColorStop(0.3, '#5a8a3a');
    farGrassGrad.addColorStop(0.7, '#4a7a2a');
    farGrassGrad.addColorStop(1, '#3a6a1a');
  }
  cityCtx.fillStyle = farGrassGrad;
  cityCtx.fillRect(0, groundY, w, h - groundY);

  // ========== DISTANT TREES (forest line) ==========
  drawForestLine(w, groundY, nightMode);

  // ========== RIVER ==========
  drawRiver(w, h, groundY, nightMode);

  // ========== SCATTERED TREES ==========
  drawScatteredTrees(w, h, groundY, centerX, centerY, nightMode);

  // ========== FIELDS / CROPS around city ==========
  drawCropFields(w, h, centerX, centerY, nightMode);

  // ========== PATHS leading to city ==========
  drawPaths(w, h, centerX, centerY, nightMode);

  // ========== CITY CIRCLE ==========
  const cityRadius = Math.min(w, h) * 0.35;

  // Outer wall shadow
  cityCtx.fillStyle = nightMode ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.35)';
  cityCtx.beginPath();
  cityCtx.ellipse(centerX + 8, centerY + 12, cityRadius + 15, (cityRadius + 15) * 0.5, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Moat (water around city) - darker at night
  const moatGrad = cityCtx.createRadialGradient(centerX, centerY, cityRadius - 5, centerX, centerY, cityRadius + 20);
  if (nightMode) {
    moatGrad.addColorStop(0, '#203050');
    moatGrad.addColorStop(0.5, '#1a2840');
    moatGrad.addColorStop(1, '#253858');
  } else {
    moatGrad.addColorStop(0, '#4a8ab0');
    moatGrad.addColorStop(0.5, '#3a7aa0');
    moatGrad.addColorStop(1, '#5a9ac0');
  }
  cityCtx.fillStyle = moatGrad;
  cityCtx.beginPath();
  cityCtx.ellipse(centerX, centerY, cityRadius + 15, (cityRadius + 15) * 0.5, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // ========== TRAVIAN-STYLE: GRASS + CIRCULAR ROAD + CROSS PATHS ==========
  const innerRadius = cityRadius - 5;
  const pathWidth = 16;
  const roadRadius = innerRadius * 0.72; // Circular road where buildings sit

  // Step 1: Draw grass background (bright green like Travian)
  const grassGrad = cityCtx.createRadialGradient(centerX, centerY - 20, 0, centerX, centerY, innerRadius);
  if (nightMode) {
    grassGrad.addColorStop(0, '#3a5030');
    grassGrad.addColorStop(0.5, '#2a4020');
    grassGrad.addColorStop(1, '#1a3015');
  } else {
    grassGrad.addColorStop(0, '#82bc48');
    grassGrad.addColorStop(0.2, '#74b03a');
    grassGrad.addColorStop(0.5, '#68a430');
    grassGrad.addColorStop(0.8, '#5c9828');
    grassGrad.addColorStop(1, '#508c20');
  }
  cityCtx.fillStyle = grassGrad;
  cityCtx.beginPath();
  cityCtx.ellipse(centerX, centerY, innerRadius, innerRadius * 0.5, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Step 2: Grass texture (natural patches)
  if (!nightMode) {
    // Darker patches
    cityCtx.save();
    cityCtx.beginPath();
    cityCtx.ellipse(centerX, centerY, innerRadius - 2, (innerRadius - 2) * 0.5, 0, 0, Math.PI * 2);
    cityCtx.clip();

    for (let i = 0; i < 30; i++) {
      const angle = (i * 12 + 3) * Math.PI / 180;
      const dist = innerRadius * (0.15 + (i % 5) * 0.15);
      const spotX = centerX + Math.cos(angle) * dist;
      const spotY = centerY + Math.sin(angle) * dist * 0.5;
      const spotSize = 12 + (i % 4) * 10;
      cityCtx.fillStyle = i % 3 === 0 ? 'rgba(100, 160, 50, 0.25)' : 'rgba(140, 200, 80, 0.2)';
      cityCtx.beginPath();
      cityCtx.ellipse(spotX, spotY, spotSize, spotSize * 0.5, (i * 30) * Math.PI / 180, 0, Math.PI * 2);
      cityCtx.fill();
    }
    cityCtx.restore();
  }

  // Step 3: Circular road ring (Travian brick/dirt road)
  const roadColor = nightMode ? '#4a3828' : '#b89060';
  const roadDark = nightMode ? '#3a2818' : '#8a6840';
  const roadLight = nightMode ? '#5a4838' : '#d4b888';

  cityCtx.save();
  cityCtx.beginPath();
  cityCtx.ellipse(centerX, centerY, innerRadius - 2, (innerRadius - 2) * 0.5, 0, 0, Math.PI * 2);
  cityCtx.clip();

  // Road outer edge
  cityCtx.strokeStyle = roadDark;
  cityCtx.lineWidth = pathWidth + 4;
  cityCtx.beginPath();
  cityCtx.ellipse(centerX, centerY, roadRadius, roadRadius * 0.5, 0, 0, Math.PI * 2);
  cityCtx.stroke();

  // Road surface
  cityCtx.strokeStyle = roadColor;
  cityCtx.lineWidth = pathWidth;
  cityCtx.beginPath();
  cityCtx.ellipse(centerX, centerY, roadRadius, roadRadius * 0.5, 0, 0, Math.PI * 2);
  cityCtx.stroke();

  // Road inner highlight
  cityCtx.strokeStyle = roadLight;
  cityCtx.lineWidth = 2;
  cityCtx.beginPath();
  cityCtx.ellipse(centerX, centerY, roadRadius - pathWidth * 0.35, (roadRadius - pathWidth * 0.35) * 0.5, 0, 0, Math.PI * 2);
  cityCtx.stroke();

  // Step 4: Cross paths connecting to center
  const pathColor = nightMode ? '#4a3828' : '#c4a060';
  const pathDark = nightMode ? '#3a2818' : '#a08040';
  const pathLight = nightMode ? '#5a4838' : '#d4b880';

  // Vertical path (N-S)
  const pw = pathWidth * 0.8;
  cityCtx.fillStyle = pathColor;
  cityCtx.fillRect(centerX - pw / 2, centerY - roadRadius * 0.5, pw, roadRadius);

  // Horizontal path (E-W)
  cityCtx.fillRect(centerX - roadRadius, centerY - pw * 0.35, roadRadius * 2, pw * 0.7);

  // Center plaza (circular platform)
  const plazaGrad = cityCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, pathWidth * 2);
  plazaGrad.addColorStop(0, pathLight);
  plazaGrad.addColorStop(0.7, pathColor);
  plazaGrad.addColorStop(1, roadDark);
  cityCtx.fillStyle = plazaGrad;
  cityCtx.beginPath();
  cityCtx.ellipse(centerX, centerY, pathWidth * 2, pathWidth * 1.1, 0, 0, Math.PI * 2);
  cityCtx.fill();
  cityCtx.strokeStyle = roadDark;
  cityCtx.lineWidth = 2;
  cityCtx.stroke();

  cityCtx.restore();

  // Stone wall ring
  drawCityWall(centerX, centerY, cityRadius);

  // Roads are now integrated in the grass quadrants above
  // drawCityRoads(centerX, centerY); // Disabled - using new cross paths
  
  // ========== RESOURCE FIELDS (4 coins) ==========
  citySlots.filter(s => s.isField).forEach(slot => {
    drawResourceField(slot);
  });
  
  // ========== BUILDINGS ==========
  // Sort by Y for proper layering (back to front)
  const sortedSlots = citySlots.filter(s => !s.isField).sort((a, b) => a.y - b.y);
  
  sortedSlots.forEach(slot => {
    const building = getBuildingAtSlot(slot.slot);
    const isHovered = cityHoveredSlot === slot.slot;
    const isBuilding = currentCity?.buildQueue?.some(q => q.slot === slot.slot && q.status === 'RUNNING');
    
    drawBuildingSlot(slot, building, isHovered, isBuilding);
  });
  
  // ========== DECORATIVE ELEMENTS ==========
  drawDecorations(w, h, centerX, centerY);
}

function drawSun(x, y, radius) {
  // Sun glow
  const glowGrad = cityCtx.createRadialGradient(x, y, 0, x, y, radius * 2.5);
  glowGrad.addColorStop(0, 'rgba(255,248,200,0.8)');
  glowGrad.addColorStop(0.5, 'rgba(255,220,100,0.3)');
  glowGrad.addColorStop(1, 'rgba(255,200,50,0)');
  cityCtx.fillStyle = glowGrad;
  cityCtx.beginPath();
  cityCtx.arc(x, y, radius * 2.5, 0, Math.PI * 2);
  cityCtx.fill();

  // Sun rays
  cityCtx.strokeStyle = 'rgba(255,240,150,0.4)';
  cityCtx.lineWidth = 2;
  for (let i = 0; i < 12; i++) {
    const angle = (i * 30) * Math.PI / 180;
    cityCtx.beginPath();
    cityCtx.moveTo(x + Math.cos(angle) * radius * 1.3, y + Math.sin(angle) * radius * 1.3);
    cityCtx.lineTo(x + Math.cos(angle) * radius * 2, y + Math.sin(angle) * radius * 2);
    cityCtx.stroke();
  }

  // Sun disc
  cityCtx.fillStyle = '#fff8dc';
  cityCtx.shadowColor = '#ffd700';
  cityCtx.shadowBlur = 30;
  cityCtx.beginPath();
  cityCtx.arc(x, y, radius, 0, Math.PI * 2);
  cityCtx.fill();
  cityCtx.shadowBlur = 0;
}

// ========== NIGHT MODE DRAWING FUNCTIONS ==========
function drawMoon(x, y, radius) {
  // Moon glow
  const glowGrad = cityCtx.createRadialGradient(x, y, 0, x, y, radius * 3);
  glowGrad.addColorStop(0, 'rgba(200,220,255,0.4)');
  glowGrad.addColorStop(0.4, 'rgba(150,180,220,0.2)');
  glowGrad.addColorStop(1, 'rgba(100,140,180,0)');
  cityCtx.fillStyle = glowGrad;
  cityCtx.beginPath();
  cityCtx.arc(x, y, radius * 3, 0, Math.PI * 2);
  cityCtx.fill();

  // Moon disc
  cityCtx.fillStyle = '#e8e8f0';
  cityCtx.shadowColor = '#a0c0e0';
  cityCtx.shadowBlur = 20;
  cityCtx.beginPath();
  cityCtx.arc(x, y, radius, 0, Math.PI * 2);
  cityCtx.fill();
  cityCtx.shadowBlur = 0;

  // Moon craters (subtle)
  cityCtx.fillStyle = 'rgba(180,180,200,0.3)';
  cityCtx.beginPath();
  cityCtx.arc(x - radius * 0.3, y - radius * 0.2, radius * 0.15, 0, Math.PI * 2);
  cityCtx.fill();
  cityCtx.beginPath();
  cityCtx.arc(x + radius * 0.2, y + radius * 0.3, radius * 0.1, 0, Math.PI * 2);
  cityCtx.fill();
  cityCtx.beginPath();
  cityCtx.arc(x + radius * 0.4, y - radius * 0.1, radius * 0.08, 0, Math.PI * 2);
  cityCtx.fill();
}

function drawStars(w, h) {
  // Use seeded random for consistent star positions
  const seed = 12345;
  const random = (i) => {
    const x = Math.sin(seed + i) * 10000;
    return x - Math.floor(x);
  };

  for (let i = 0; i < 80; i++) {
    const x = random(i) * w;
    const y = random(i + 100) * h;
    const size = random(i + 200) * 2 + 0.5;
    const brightness = random(i + 300) * 0.5 + 0.5;

    // Twinkling effect
    const twinkle = Math.sin(Date.now() / 500 + i) * 0.3 + 0.7;

    cityCtx.fillStyle = `rgba(255, 255, 255, ${brightness * twinkle})`;
    cityCtx.beginPath();
    cityCtx.arc(x, y, size, 0, Math.PI * 2);
    cityCtx.fill();
  }
}

function drawNightCloud(ctx, x, y, size) {
  ctx.fillStyle = 'rgba(30, 40, 60, 0.4)';
  ctx.beginPath();
  ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
  ctx.arc(x + size * 0.4, y - size * 0.1, size * 0.4, 0, Math.PI * 2);
  ctx.arc(x + size * 0.8, y, size * 0.45, 0, Math.PI * 2);
  ctx.arc(x + size * 0.3, y + size * 0.15, size * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

function drawMountains(w, h, nightMode = false) {
  const mountainY = h * 0.45;

  // Far mountains (blue/purple - darker at night)
  cityCtx.fillStyle = nightMode ? '#2a3040' : '#8090a8';
  cityCtx.beginPath();
  cityCtx.moveTo(0, mountainY);
  cityCtx.lineTo(w * 0.15, mountainY - 60);
  cityCtx.lineTo(w * 0.25, mountainY - 30);
  cityCtx.lineTo(w * 0.4, mountainY - 80);
  cityCtx.lineTo(w * 0.5, mountainY - 40);
  cityCtx.lineTo(w * 0.65, mountainY - 90);
  cityCtx.lineTo(w * 0.8, mountainY - 50);
  cityCtx.lineTo(w * 0.9, mountainY - 70);
  cityCtx.lineTo(w, mountainY - 35);
  cityCtx.lineTo(w, mountainY);
  cityCtx.closePath();
  cityCtx.fill();
  
  // Snow caps
  cityCtx.fillStyle = '#e8e8f0';
  cityCtx.beginPath();
  cityCtx.moveTo(w * 0.38, mountainY - 75);
  cityCtx.lineTo(w * 0.4, mountainY - 80);
  cityCtx.lineTo(w * 0.42, mountainY - 72);
  cityCtx.closePath();
  cityCtx.fill();
  
  cityCtx.beginPath();
  cityCtx.moveTo(w * 0.63, mountainY - 85);
  cityCtx.lineTo(w * 0.65, mountainY - 90);
  cityCtx.lineTo(w * 0.67, mountainY - 82);
  cityCtx.closePath();
  cityCtx.fill();
}

function drawForestLine(w, groundY, nightMode = false) {
  cityCtx.fillStyle = nightMode ? '#1a2a15' : '#3a5a2a';

  for (let x = 0; x < w; x += 25) {
    const treeH = 15 + Math.sin(x * 0.1) * 8;
    const treeY = groundY + 5 + Math.sin(x * 0.05) * 3;

    cityCtx.beginPath();
    cityCtx.moveTo(x, treeY);
    cityCtx.lineTo(x + 12, treeY);
    cityCtx.lineTo(x + 6, treeY - treeH);
    cityCtx.closePath();
    cityCtx.fill();
  }
}

function drawRiver(w, h, groundY, nightMode = false) {
  // Main river (wider, curves around city like Travian)
  cityCtx.strokeStyle = nightMode ? '#1a3050' : '#4888b8';
  cityCtx.lineWidth = 28;
  cityCtx.lineCap = 'round';
  cityCtx.lineJoin = 'round';

  cityCtx.beginPath();
  cityCtx.moveTo(-20, groundY + 40);
  cityCtx.bezierCurveTo(w * 0.15, groundY + 80, w * 0.3, h * 0.55, w * 0.22, h * 0.75);
  cityCtx.bezierCurveTo(w * 0.18, h * 0.85, w * 0.25, h * 0.92, w * 0.35, h + 20);
  cityCtx.stroke();

  // River banks (darker edges)
  cityCtx.strokeStyle = nightMode ? '#0a2040' : '#2a6890';
  cityCtx.lineWidth = 32;
  cityCtx.globalAlpha = 0.3;
  cityCtx.beginPath();
  cityCtx.moveTo(-20, groundY + 40);
  cityCtx.bezierCurveTo(w * 0.15, groundY + 80, w * 0.3, h * 0.55, w * 0.22, h * 0.75);
  cityCtx.bezierCurveTo(w * 0.18, h * 0.85, w * 0.25, h * 0.92, w * 0.35, h + 20);
  cityCtx.stroke();
  cityCtx.globalAlpha = 1;

  // River highlight
  cityCtx.strokeStyle = nightMode ? 'rgba(100,140,180,0.3)' : 'rgba(160,210,240,0.5)';
  cityCtx.lineWidth = 10;
  cityCtx.beginPath();
  cityCtx.moveTo(-15, groundY + 38);
  cityCtx.bezierCurveTo(w * 0.14, groundY + 75, w * 0.28, h * 0.53, w * 0.21, h * 0.73);
  cityCtx.stroke();

  // Small tributary
  cityCtx.strokeStyle = nightMode ? '#1a3050' : '#4888b8';
  cityCtx.lineWidth = 12;
  cityCtx.beginPath();
  cityCtx.moveTo(w + 10, h * 0.6);
  cityCtx.bezierCurveTo(w * 0.7, h * 0.65, w * 0.5, h * 0.7, w * 0.3, h * 0.8);
  cityCtx.stroke();
}

function drawScatteredTrees(w, h, groundY, centerX, centerY, nightMode = false) {
  const trees = [
    { x: 40, y: groundY + 70, size: 40, type: 'pine' },
    { x: 90, y: groundY + 100, size: 45, type: 'oak' },
    { x: 140, y: groundY + 130, size: 38, type: 'pine' },
    { x: w - 60, y: groundY + 80, size: 42, type: 'oak' },
    { x: w - 130, y: groundY + 120, size: 48, type: 'pine' },
    { x: w - 40, y: groundY + 160, size: 35, type: 'oak' },
    { x: w - 80, y: h - 90, size: 40, type: 'pine' },
    { x: 60, y: h - 70, size: 35, type: 'oak' },
    { x: w / 2 - 220, y: groundY + 55, size: 38, type: 'pine' },
    { x: w / 2 + 220, y: groundY + 60, size: 42, type: 'oak' },
    { x: w / 2 - 180, y: h - 50, size: 36, type: 'pine' },
    { x: w / 2 + 190, y: h - 60, size: 40, type: 'oak' }
  ];

  // Rocks/boulders
  const rocks = [
    { x: 30, y: groundY + 140, size: 20 },
    { x: w - 40, y: h - 130, size: 16 },
    { x: w / 2 - 250, y: h * 0.7, size: 22 },
    { x: w / 2 + 260, y: h * 0.65, size: 18 },
    { x: 180, y: h - 40, size: 14 },
    { x: w - 180, y: groundY + 170, size: 20 }
  ];

  rocks.forEach(rock => {
    const dx = rock.x - centerX;
    const dy = rock.y - centerY;
    if (Math.sqrt(dx*dx + dy*dy) < 200) return;
    drawRock(rock.x, rock.y, rock.size, nightMode);
  });

  trees.forEach(tree => {
    const dx = tree.x - centerX;
    const dy = tree.y - centerY;
    if (Math.sqrt(dx*dx + dy*dy) < 200) return;
    drawTree(tree.x, tree.y, tree.size, nightMode);
  });
}

function drawRock(x, y, size, nightMode = false) {
  const baseColor = nightMode ? '#3a3830' : '#8a8478';
  const lightColor = nightMode ? '#4a4840' : '#a8a090';
  const darkColor = nightMode ? '#2a2820' : '#6a6458';

  cityCtx.fillStyle = darkColor;
  cityCtx.beginPath();
  cityCtx.ellipse(x + 2, y + 3, size * 0.6, size * 0.25, 0.1, 0, Math.PI * 2);
  cityCtx.fill();

  // Main rock body
  cityCtx.fillStyle = baseColor;
  cityCtx.beginPath();
  cityCtx.moveTo(x - size * 0.5, y);
  cityCtx.quadraticCurveTo(x - size * 0.4, y - size * 0.6, x, y - size * 0.5);
  cityCtx.quadraticCurveTo(x + size * 0.4, y - size * 0.6, x + size * 0.5, y);
  cityCtx.quadraticCurveTo(x + size * 0.3, y + size * 0.15, x - size * 0.3, y + size * 0.15);
  cityCtx.closePath();
  cityCtx.fill();

  // Light side
  cityCtx.fillStyle = lightColor;
  cityCtx.beginPath();
  cityCtx.moveTo(x - size * 0.3, y - size * 0.1);
  cityCtx.quadraticCurveTo(x - size * 0.2, y - size * 0.45, x + size * 0.1, y - size * 0.4);
  cityCtx.quadraticCurveTo(x + size * 0.15, y - size * 0.15, x - size * 0.1, y);
  cityCtx.closePath();
  cityCtx.fill();
}

function drawTree(x, y, size, nightMode = false) {
  // Shadow
  cityCtx.fillStyle = nightMode ? 'rgba(0,0,0,0.4)' : 'rgba(0,0,0,0.2)';
  cityCtx.beginPath();
  cityCtx.ellipse(x + 4, y + 5, size * 0.45, size * 0.15, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Trunk
  const trunkGrad = cityCtx.createLinearGradient(x - size * 0.1, 0, x + size * 0.1, 0);
  trunkGrad.addColorStop(0, nightMode ? '#2a2018' : '#5a4030');
  trunkGrad.addColorStop(0.5, nightMode ? '#3a3020' : '#6a5040');
  trunkGrad.addColorStop(1, nightMode ? '#2a2018' : '#4a3020');
  cityCtx.fillStyle = trunkGrad;
  cityCtx.fillRect(x - size * 0.07, y - size * 0.35, size * 0.14, size * 0.4);

  // Round foliage (Travian style - bushy round tree)
  const darkGreen = nightMode ? '#0a2008' : '#2a5a1a';
  const midGreen = nightMode ? '#152810' : '#3a7a2a';
  const lightGreen = nightMode ? '#1a3015' : '#4a8a3a';

  // Main canopy (large circle)
  cityCtx.fillStyle = darkGreen;
  cityCtx.beginPath();
  cityCtx.arc(x, y - size * 0.55, size * 0.42, 0, Math.PI * 2);
  cityCtx.fill();

  // Light patch (top-left highlight)
  cityCtx.fillStyle = midGreen;
  cityCtx.beginPath();
  cityCtx.arc(x - size * 0.08, y - size * 0.62, size * 0.32, 0, Math.PI * 2);
  cityCtx.fill();

  // Small highlight
  cityCtx.fillStyle = lightGreen;
  cityCtx.beginPath();
  cityCtx.arc(x - size * 0.12, y - size * 0.68, size * 0.18, 0, Math.PI * 2);
  cityCtx.fill();

  // Side foliage bumps
  cityCtx.fillStyle = darkGreen;
  cityCtx.beginPath();
  cityCtx.arc(x - size * 0.25, y - size * 0.42, size * 0.2, 0, Math.PI * 2);
  cityCtx.fill();
  cityCtx.beginPath();
  cityCtx.arc(x + size * 0.22, y - size * 0.45, size * 0.2, 0, Math.PI * 2);
  cityCtx.fill();
}

function drawCropFields(w, h, centerX, centerY, nightMode = false) {
  // Wheat fields (golden rectangles around city - darker at night)
  const dayColors = ['#c4a030', '#d4b040', '#b49020', '#c4a030'];
  const nightColors = ['#4a4020', '#5a4828', '#3a3018', '#4a4020'];

  const fields = [
    { x: 50, y: h * 0.55, w: 80, h: 50, colorIdx: 0 },
    { x: w - 130, y: h * 0.58, w: 90, h: 45, colorIdx: 1 },
    { x: 30, y: h - 120, w: 70, h: 40, colorIdx: 2 },
    { x: w - 100, y: h - 110, w: 60, h: 35, colorIdx: 3 }
  ];

  fields.forEach(field => {
    // Field base
    cityCtx.fillStyle = nightMode ? nightColors[field.colorIdx] : dayColors[field.colorIdx];
    cityCtx.beginPath();
    cityCtx.moveTo(field.x, field.y + field.h * 0.3);
    cityCtx.lineTo(field.x + field.w * 0.1, field.y);
    cityCtx.lineTo(field.x + field.w * 0.9, field.y);
    cityCtx.lineTo(field.x + field.w, field.y + field.h * 0.3);
    cityCtx.lineTo(field.x + field.w, field.y + field.h);
    cityCtx.lineTo(field.x, field.y + field.h);
    cityCtx.closePath();
    cityCtx.fill();

    // Crop lines
    cityCtx.strokeStyle = nightMode ? 'rgba(0,0,0,0.3)' : 'rgba(0,0,0,0.15)';
    cityCtx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const lineY = field.y + field.h * 0.3 + (field.h * 0.7 / 5) * i;
      cityCtx.beginPath();
      cityCtx.moveTo(field.x + 5, lineY);
      cityCtx.lineTo(field.x + field.w - 5, lineY);
      cityCtx.stroke();
    }
  });
}

function drawPaths(w, h, centerX, centerY, nightMode = false) {
  cityCtx.strokeStyle = nightMode ? '#3a3028' : '#a08050';
  cityCtx.lineWidth = 12;
  cityCtx.lineCap = 'round';

  // Main road from bottom
  cityCtx.beginPath();
  cityCtx.moveTo(w / 2 + 30, h + 10);
  cityCtx.quadraticCurveTo(w / 2, h * 0.8, centerX, centerY + 100);
  cityCtx.stroke();

  // Road from right
  cityCtx.beginPath();
  cityCtx.moveTo(w + 10, h * 0.6);
  cityCtx.quadraticCurveTo(w * 0.8, h * 0.55, centerX + 120, centerY + 30);
  cityCtx.stroke();

  // Road highlight (torchlight at night)
  cityCtx.strokeStyle = nightMode ? '#504030' : '#c0a070';
  cityCtx.lineWidth = 4;

  cityCtx.beginPath();
  cityCtx.moveTo(w / 2 + 32, h + 10);
  cityCtx.quadraticCurveTo(w / 2 + 2, h * 0.8, centerX + 2, centerY + 100);
  cityCtx.stroke();
}

function drawCityWall(centerX, centerY, radius) {
  const wallRadius = radius - 3;
  const nightMode = isNightMode();
  const faction = player?.faction || 'ROME';

  // ========== FACTION-SPECIFIC WALL THEMES ==========
  const WALL_THEMES = {
    ROME: {
      // Pierre beige classique, toits tuiles rouges
      stone: nightMode ? '#4a4038' : '#c9b896',
      stoneDark: nightMode ? '#3a3028' : '#a08060',
      stoneLight: nightMode ? '#5a5048' : '#e4d4b0',
      roof: nightMode ? '#5a2a1a' : '#c45a20',
      pattern: 'brick',
      towerStyle: 'pointed'
    },
    GAUL: {
      // Palissade en bois, tours en bois
      stone: nightMode ? '#3a3020' : '#8b7355',
      stoneDark: nightMode ? '#2a2010' : '#6a5a40',
      stoneLight: nightMode ? '#4a4030' : '#a89070',
      roof: nightMode ? '#2a4020' : '#4a7a30',
      pattern: 'wood',
      towerStyle: 'wooden'
    },
    GREEK: {
      // Marbre blanc, toits bleus
      stone: nightMode ? '#6a6a70' : '#e8e4e0',
      stoneDark: nightMode ? '#4a4a50' : '#c8c4c0',
      stoneLight: nightMode ? '#8a8a90' : '#f8f4f0',
      roof: nightMode ? '#2a4060' : '#4a7ab0',
      pattern: 'marble',
      towerStyle: 'column'
    },
    EGYPT: {
      // Grès doré, tours plates
      stone: nightMode ? '#5a4a30' : '#d4b896',
      stoneDark: nightMode ? '#4a3a20' : '#b49876',
      stoneLight: nightMode ? '#6a5a40' : '#e4c8a6',
      roof: nightMode ? '#4a6060' : '#6a9a9a',
      pattern: 'sandstone',
      towerStyle: 'flat'
    },
    HUN: {
      // Terre et bois, style nomade
      stone: nightMode ? '#3a3028' : '#7a6a5a',
      stoneDark: nightMode ? '#2a2018' : '#5a4a3a',
      stoneLight: nightMode ? '#4a4038' : '#9a8a7a',
      roof: nightMode ? '#4a3020' : '#8a5030',
      pattern: 'earth',
      towerStyle: 'tent'
    },
    SULTAN: {
      // Briques ocre, dômes
      stone: nightMode ? '#5a4a38' : '#c4a080',
      stoneDark: nightMode ? '#4a3a28' : '#a48060',
      stoneLight: nightMode ? '#6a5a48' : '#e4c0a0',
      roof: nightMode ? '#2a5050' : '#4a8a7a',
      pattern: 'brick',
      towerStyle: 'dome'
    }
  };

  const theme = WALL_THEMES[faction] || WALL_THEMES.ROME;
  const { stone: stoneColor, stoneDark, stoneLight, roof: roofColor, pattern, towerStyle } = theme;

  // Wall base shadow
  cityCtx.fillStyle = 'rgba(0,0,0,0.3)';
  cityCtx.beginPath();
  cityCtx.ellipse(centerX + 5, centerY + 8, wallRadius + 5, (wallRadius + 5) * 0.5, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Wall base - style depends on faction
  if (pattern === 'wood') {
    // Wooden palisade for Gaul
    drawWoodenWall(centerX, centerY, wallRadius, stoneColor, stoneDark, stoneLight);
  } else if (pattern === 'earth') {
    // Earthen wall for Huns
    drawEarthenWall(centerX, centerY, wallRadius, stoneColor, stoneDark, stoneLight);
  } else {
    // Stone wall (Rome, Greek, Egypt, Sultan)
    cityCtx.strokeStyle = stoneColor;
    cityCtx.lineWidth = 22;
    cityCtx.beginPath();
    cityCtx.ellipse(centerX, centerY, wallRadius, wallRadius * 0.5, 0, 0, Math.PI * 2);
    cityCtx.stroke();

    // Wall inner edge (darker)
    cityCtx.strokeStyle = stoneDark;
    cityCtx.lineWidth = 4;
    cityCtx.beginPath();
    cityCtx.ellipse(centerX, centerY, wallRadius - 10, (wallRadius - 10) * 0.5, 0, 0, Math.PI * 2);
    cityCtx.stroke();

    // Wall outer edge (lighter highlight)
    cityCtx.strokeStyle = stoneLight;
    cityCtx.lineWidth = 3;
    cityCtx.beginPath();
    cityCtx.ellipse(centerX, centerY, wallRadius + 8, (wallRadius + 8) * 0.5, 0, Math.PI, Math.PI * 2);
    cityCtx.stroke();

    // Wall pattern
    cityCtx.strokeStyle = stoneDark;
    cityCtx.lineWidth = 1;
    const patternSpacing = pattern === 'marble' ? 18 : 12;
    for (let angle = 0; angle < 360; angle += patternSpacing) {
      const rad = angle * Math.PI / 180;
      const x1 = centerX + Math.cos(rad) * (wallRadius - 10);
      const y1 = centerY + Math.sin(rad) * (wallRadius - 10) * 0.5;
      const x2 = centerX + Math.cos(rad) * (wallRadius + 10);
      const y2 = centerY + Math.sin(rad) * (wallRadius + 10) * 0.5;
      cityCtx.beginPath();
      cityCtx.moveTo(x1, y1);
      cityCtx.lineTo(x2, y2);
      cityCtx.stroke();
    }
  }

  // 4 Gates (N, E, S, W)
  const gateAngles = [0, 90, 180, 270];
  gateAngles.forEach((angle, idx) => {
    const rad = angle * Math.PI / 180;
    const gx = centerX + Math.cos(rad) * wallRadius;
    const gy = centerY + Math.sin(rad) * wallRadius * 0.5;
    drawFactionGate(gx, gy, 28, angle, stoneColor, stoneDark, roofColor, towerStyle);
  });

  // Towers between gates
  const towerAngles = [45, 135, 225, 315, 22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5];
  towerAngles.forEach((angle, idx) => {
    const rad = angle * Math.PI / 180;
    const tx = centerX + Math.cos(rad) * wallRadius;
    const ty = centerY + Math.sin(rad) * wallRadius * 0.5;
    const towerSize = idx < 4 ? 16 : 12;
    drawFactionTower(tx, ty, towerSize, stoneColor, stoneDark, stoneLight, roofColor, towerStyle);
  });
}

// ========== WOODEN WALL (Gaul) ==========
function drawWoodenWall(centerX, centerY, wallRadius, woodColor, woodDark, woodLight) {
  // Wooden palisade effect
  for (let angle = 0; angle < 360; angle += 6) {
    const rad = angle * Math.PI / 180;
    const x = centerX + Math.cos(rad) * wallRadius;
    const y = centerY + Math.sin(rad) * wallRadius * 0.5;

    // Wooden post
    cityCtx.fillStyle = woodColor;
    cityCtx.fillRect(x - 4, y - 15, 8, 18);

    // Post top (pointed)
    cityCtx.beginPath();
    cityCtx.moveTo(x - 5, y - 15);
    cityCtx.lineTo(x, y - 22);
    cityCtx.lineTo(x + 5, y - 15);
    cityCtx.closePath();
    cityCtx.fill();

    // Wood grain
    cityCtx.strokeStyle = woodDark;
    cityCtx.lineWidth = 1;
    cityCtx.beginPath();
    cityCtx.moveTo(x, y - 15);
    cityCtx.lineTo(x, y + 3);
    cityCtx.stroke();
  }
}

// ========== EARTHEN WALL (Huns) ==========
function drawEarthenWall(centerX, centerY, wallRadius, earthColor, earthDark, earthLight) {
  // Low earthen rampart
  cityCtx.strokeStyle = earthColor;
  cityCtx.lineWidth = 18;
  cityCtx.beginPath();
  cityCtx.ellipse(centerX, centerY, wallRadius, wallRadius * 0.5, 0, 0, Math.PI * 2);
  cityCtx.stroke();

  // Darker base
  cityCtx.strokeStyle = earthDark;
  cityCtx.lineWidth = 6;
  cityCtx.beginPath();
  cityCtx.ellipse(centerX, centerY, wallRadius - 6, (wallRadius - 6) * 0.5, 0, 0, Math.PI * 2);
  cityCtx.stroke();

  // Grass/earth texture spots
  for (let i = 0; i < 30; i++) {
    const angle = (i * 12) * Math.PI / 180;
    const x = centerX + Math.cos(angle) * wallRadius;
    const y = centerY + Math.sin(angle) * wallRadius * 0.5;
    cityCtx.fillStyle = i % 3 === 0 ? '#5a7040' : earthLight;
    cityCtx.beginPath();
    cityCtx.arc(x, y - 5, 3, 0, Math.PI * 2);
    cityCtx.fill();
  }
}

// ========== FACTION-SPECIFIC TOWER ==========
function drawFactionTower(x, y, size, stoneColor, stoneDark, stoneLight, roofColor, style) {
  const nightMode = isNightMode();

  // Tower shadow
  cityCtx.fillStyle = 'rgba(0,0,0,0.3)';
  cityCtx.beginPath();
  cityCtx.ellipse(x + 3, y + 4, size * 0.8, size * 0.4, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Tower base
  cityCtx.fillStyle = stoneDark;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, size, size * 0.5, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Tower body
  const bodyGrad = cityCtx.createLinearGradient(x - size, y, x + size, y);
  bodyGrad.addColorStop(0, stoneLight);
  bodyGrad.addColorStop(0.4, stoneColor);
  bodyGrad.addColorStop(1, stoneDark);
  cityCtx.fillStyle = bodyGrad;
  cityCtx.beginPath();
  cityCtx.moveTo(x - size, y);
  cityCtx.lineTo(x - size * 0.9, y - size * 1.8);
  cityCtx.lineTo(x + size * 0.9, y - size * 1.8);
  cityCtx.lineTo(x + size, y);
  cityCtx.closePath();
  cityCtx.fill();

  // Tower top platform
  cityCtx.fillStyle = stoneColor;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y - size * 1.8, size * 0.95, size * 0.5, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Roof based on style
  const roofGrad = cityCtx.createLinearGradient(x - size, y, x + size, y);
  roofGrad.addColorStop(0, roofColor);
  roofGrad.addColorStop(0.5, nightMode ? shadeColor(roofColor, 20) : shadeColor(roofColor, 15));
  roofGrad.addColorStop(1, nightMode ? shadeColor(roofColor, -20) : shadeColor(roofColor, -15));
  cityCtx.fillStyle = roofGrad;

  if (style === 'pointed' || style === 'wooden') {
    // Pointed roof (Rome, Gaul)
    cityCtx.beginPath();
    cityCtx.moveTo(x, y - size * 3);
    cityCtx.lineTo(x - size * 1.1, y - size * 1.7);
    cityCtx.lineTo(x + size * 1.1, y - size * 1.7);
    cityCtx.closePath();
    cityCtx.fill();
  } else if (style === 'dome') {
    // Dome roof (Sultan)
    cityCtx.beginPath();
    cityCtx.arc(x, y - size * 2.2, size * 0.9, Math.PI, 0);
    cityCtx.closePath();
    cityCtx.fill();
  } else if (style === 'flat') {
    // Flat roof (Egypt)
    cityCtx.fillRect(x - size * 0.9, y - size * 2.2, size * 1.8, size * 0.4);
  } else if (style === 'column') {
    // Greek column style
    cityCtx.beginPath();
    cityCtx.moveTo(x, y - size * 2.8);
    cityCtx.lineTo(x - size * 1.2, y - size * 1.9);
    cityCtx.lineTo(x + size * 1.2, y - size * 1.9);
    cityCtx.closePath();
    cityCtx.fill();
  } else if (style === 'tent') {
    // Tent style (Huns)
    cityCtx.beginPath();
    cityCtx.moveTo(x, y - size * 2.8);
    cityCtx.quadraticCurveTo(x - size * 0.5, y - size * 2, x - size * 1.1, y - size * 1.7);
    cityCtx.lineTo(x + size * 1.1, y - size * 1.7);
    cityCtx.quadraticCurveTo(x + size * 0.5, y - size * 2, x, y - size * 2.8);
    cityCtx.fill();
  }
}

// ========== FACTION-SPECIFIC GATE ==========
function drawFactionGate(x, y, size, angle, stoneColor, stoneDark, roofColor, style) {
  // Gate base
  cityCtx.fillStyle = 'rgba(0,0,0,0.3)';
  cityCtx.beginPath();
  cityCtx.ellipse(x + 4, y + 5, size * 0.9, size * 0.45, 0, 0, Math.PI * 2);
  cityCtx.fill();

  cityCtx.fillStyle = stoneDark;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, size * 0.85, size * 0.42, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Gate house
  const gateGrad = cityCtx.createLinearGradient(x - size, y, x + size, y);
  gateGrad.addColorStop(0, stoneColor);
  gateGrad.addColorStop(1, stoneDark);
  cityCtx.fillStyle = gateGrad;
  cityCtx.beginPath();
  cityCtx.moveTo(x - size * 0.8, y);
  cityCtx.lineTo(x - size * 0.7, y - size * 1.5);
  cityCtx.lineTo(x + size * 0.7, y - size * 1.5);
  cityCtx.lineTo(x + size * 0.8, y);
  cityCtx.closePath();
  cityCtx.fill();

  // Gate arch (dark opening)
  cityCtx.fillStyle = '#1a1008';
  cityCtx.beginPath();
  cityCtx.arc(x, y - size * 0.3, size * 0.4, Math.PI, 0);
  cityCtx.lineTo(x + size * 0.4, y + size * 0.1);
  cityCtx.lineTo(x - size * 0.4, y + size * 0.1);
  cityCtx.closePath();
  cityCtx.fill();

  // Small roof on gate based on style
  cityCtx.fillStyle = roofColor;
  if (style === 'dome') {
    cityCtx.beginPath();
    cityCtx.arc(x, y - size * 1.7, size * 0.6, Math.PI, 0);
    cityCtx.closePath();
    cityCtx.fill();
  } else if (style === 'flat') {
    cityCtx.fillRect(x - size * 0.75, y - size * 1.7, size * 1.5, size * 0.25);
  } else {
    // Pointed (default)
    cityCtx.beginPath();
    cityCtx.moveTo(x, y - size * 2);
    cityCtx.lineTo(x - size * 0.8, y - size * 1.5);
    cityCtx.lineTo(x + size * 0.8, y - size * 1.5);
    cityCtx.closePath();
    cityCtx.fill();
  }
}

// ========== TRAVIAN-STYLE TOWER ==========
function drawTravianTower(x, y, size, stoneColor, stoneDark, stoneLight, roofColor) {
  const nightMode = isNightMode();

  // Tower shadow
  cityCtx.fillStyle = 'rgba(0,0,0,0.3)';
  cityCtx.beginPath();
  cityCtx.ellipse(x + 3, y + 4, size * 0.8, size * 0.4, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Tower base (ellipse)
  cityCtx.fillStyle = stoneDark;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, size, size * 0.5, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Tower body (cylinder effect)
  const bodyGrad = cityCtx.createLinearGradient(x - size, y, x + size, y);
  bodyGrad.addColorStop(0, stoneLight);
  bodyGrad.addColorStop(0.4, stoneColor);
  bodyGrad.addColorStop(1, stoneDark);
  cityCtx.fillStyle = bodyGrad;
  cityCtx.beginPath();
  cityCtx.moveTo(x - size, y);
  cityCtx.lineTo(x - size * 0.9, y - size * 1.8);
  cityCtx.lineTo(x + size * 0.9, y - size * 1.8);
  cityCtx.lineTo(x + size, y);
  cityCtx.closePath();
  cityCtx.fill();

  // Tower top platform
  cityCtx.fillStyle = stoneColor;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y - size * 1.8, size * 0.95, size * 0.5, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Roof (orange tiles - Travian style)
  const roofGrad = cityCtx.createLinearGradient(x - size, y, x + size, y);
  roofGrad.addColorStop(0, roofColor);
  roofGrad.addColorStop(0.5, nightMode ? '#7a3a2a' : '#d47030');
  roofGrad.addColorStop(1, nightMode ? '#4a2010' : '#a04010');
  cityCtx.fillStyle = roofGrad;

  // Pointed roof
  cityCtx.beginPath();
  cityCtx.moveTo(x, y - size * 3);
  cityCtx.lineTo(x - size * 1.1, y - size * 1.7);
  cityCtx.lineTo(x + size * 1.1, y - size * 1.7);
  cityCtx.closePath();
  cityCtx.fill();

  // Roof highlight
  cityCtx.strokeStyle = nightMode ? '#8a4a3a' : '#e48040';
  cityCtx.lineWidth = 1;
  cityCtx.beginPath();
  cityCtx.moveTo(x, y - size * 3);
  cityCtx.lineTo(x - size * 1.1, y - size * 1.7);
  cityCtx.stroke();
}

// ========== TRAVIAN-STYLE GATE ==========
function drawTravianGate(x, y, size, angle, stoneColor, stoneDark, roofColor) {
  const nightMode = isNightMode();

  // Gate tower shadow
  cityCtx.fillStyle = 'rgba(0,0,0,0.3)';
  cityCtx.beginPath();
  cityCtx.ellipse(x + 4, y + 5, size * 0.9, size * 0.45, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Gate base
  cityCtx.fillStyle = stoneDark;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, size * 0.85, size * 0.42, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Gate house body
  const bodyGrad = cityCtx.createLinearGradient(x - size, y, x + size, y);
  bodyGrad.addColorStop(0, nightMode ? '#5a5048' : '#e4d4b0');
  bodyGrad.addColorStop(0.5, stoneColor);
  bodyGrad.addColorStop(1, stoneDark);
  cityCtx.fillStyle = bodyGrad;
  cityCtx.beginPath();
  cityCtx.moveTo(x - size * 0.8, y);
  cityCtx.lineTo(x - size * 0.75, y - size * 1.5);
  cityCtx.lineTo(x + size * 0.75, y - size * 1.5);
  cityCtx.lineTo(x + size * 0.8, y);
  cityCtx.closePath();
  cityCtx.fill();

  // Gate arch (dark opening)
  cityCtx.fillStyle = nightMode ? '#0a0808' : '#1a1410';
  cityCtx.beginPath();
  cityCtx.moveTo(x - size * 0.35, y);
  cityCtx.lineTo(x - size * 0.35, y - size * 0.6);
  cityCtx.arc(x, y - size * 0.6, size * 0.35, Math.PI, 0);
  cityCtx.lineTo(x + size * 0.35, y);
  cityCtx.closePath();
  cityCtx.fill();

  // Arch border (stone)
  cityCtx.strokeStyle = stoneDark;
  cityCtx.lineWidth = 3;
  cityCtx.beginPath();
  cityCtx.moveTo(x - size * 0.35, y);
  cityCtx.lineTo(x - size * 0.35, y - size * 0.6);
  cityCtx.arc(x, y - size * 0.6, size * 0.35, Math.PI, 0);
  cityCtx.lineTo(x + size * 0.35, y);
  cityCtx.stroke();

  // Gate top platform
  cityCtx.fillStyle = stoneColor;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y - size * 1.5, size * 0.8, size * 0.4, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Roof (orange tiles)
  const roofGrad = cityCtx.createLinearGradient(x - size, y, x + size, y);
  roofGrad.addColorStop(0, roofColor);
  roofGrad.addColorStop(0.5, nightMode ? '#7a3a2a' : '#d47030');
  roofGrad.addColorStop(1, nightMode ? '#4a2010' : '#a04010');
  cityCtx.fillStyle = roofGrad;

  // Pointed roof with wider base
  cityCtx.beginPath();
  cityCtx.moveTo(x, y - size * 2.5);
  cityCtx.lineTo(x - size * 0.95, y - size * 1.4);
  cityCtx.lineTo(x + size * 0.95, y - size * 1.4);
  cityCtx.closePath();
  cityCtx.fill();

  // Roof highlight
  cityCtx.strokeStyle = nightMode ? '#8a4a3a' : '#e48040';
  cityCtx.lineWidth = 1;
  cityCtx.beginPath();
  cityCtx.moveTo(x, y - size * 2.5);
  cityCtx.lineTo(x - size * 0.95, y - size * 1.4);
  cityCtx.stroke();
}

function drawDecorations(w, h, centerX, centerY) {
  const time = Date.now() / 1000;
  const nightMode = isNightMode();

  // ========== ANIMATED BIRDS (day only) / FIREFLIES (night) ==========
  if (nightMode) {
    drawFireflies(w, h, time);
  } else {
    drawAnimatedBirds(w, h, time);
  }

  // ========== ANIMATED WATER (moat reflections) ==========
  drawWaterAnimation(centerX, centerY, time);

  // ========== ANIMATED VILLAGERS (fewer at night) ==========
  if (!nightMode || Math.random() > 0.7) {
    drawAnimatedVillagers(centerX, centerY, time);
  }

  // ========== ANIMATED SMOKE from buildings ==========
  const smokeBuildings = ['FORGE', 'BARRACKS', 'WORKSHOP'];
  smokeBuildings.forEach(key => {
    const building = currentCity?.buildings?.find(b => b.key === key);
    if (building) {
      const slot = citySlots.find(s => s.slot === building.slot);
      if (slot) {
        drawAnimatedSmoke(slot.x, slot.y - 50, time, key === 'FORGE' ? 1.5 : 0.8);
      }
    }
  });

  // ========== ANIMATED FLAGS ==========
  drawAnimatedFlags(centerX, centerY, time);

  // ========== PARTICLE EFFECTS (leaves day, embers night) ==========
  drawParticleEffects(w, h, time);

  // ========== TORCHES at night ==========
  if (nightMode) {
    drawTorches(centerX, centerY, time);
  }

  // ========== NIGHT AMBIENT OVERLAY ==========
  if (nightMode) {
    cityCtx.fillStyle = 'rgba(10, 15, 30, 0.15)';
    cityCtx.fillRect(0, 0, w, h);
  }
}

// ========== FIREFLIES (night) ==========
let firefliesState = [];
function initFireflies(w, h) {
  firefliesState = [];
  for (let i = 0; i < 20; i++) {
    firefliesState.push({
      x: Math.random() * w,
      y: h * 0.4 + Math.random() * h * 0.5,
      phase: Math.random() * Math.PI * 2,
      brightness: Math.random()
    });
  }
}

function drawFireflies(w, h, time) {
  if (firefliesState.length === 0) initFireflies(w, h);

  firefliesState.forEach((ff, i) => {
    // Gentle floating movement
    ff.x += Math.sin(time * 0.5 + ff.phase) * 0.3;
    ff.y += Math.cos(time * 0.7 + ff.phase) * 0.2;

    // Wrap around
    if (ff.x > w) ff.x = 0;
    if (ff.x < 0) ff.x = w;
    if (ff.y > h) ff.y = h * 0.4;
    if (ff.y < h * 0.3) ff.y = h * 0.4;

    // Pulsing glow
    const pulse = Math.sin(time * 3 + ff.phase * 2) * 0.5 + 0.5;
    const alpha = ff.brightness * pulse;

    // Glow
    const glowGrad = cityCtx.createRadialGradient(ff.x, ff.y, 0, ff.x, ff.y, 8);
    glowGrad.addColorStop(0, `rgba(200, 255, 100, ${alpha * 0.8})`);
    glowGrad.addColorStop(0.5, `rgba(150, 255, 80, ${alpha * 0.3})`);
    glowGrad.addColorStop(1, 'rgba(100, 200, 50, 0)');
    cityCtx.fillStyle = glowGrad;
    cityCtx.beginPath();
    cityCtx.arc(ff.x, ff.y, 8, 0, Math.PI * 2);
    cityCtx.fill();

    // Core
    cityCtx.fillStyle = `rgba(255, 255, 150, ${alpha})`;
    cityCtx.beginPath();
    cityCtx.arc(ff.x, ff.y, 2, 0, Math.PI * 2);
    cityCtx.fill();
  });
}

// ========== TORCHES at night ==========
function drawTorches(centerX, centerY, time) {
  // Torch positions around city wall
  const torchPositions = [
    { angle: 0, dist: 150 },
    { angle: 60, dist: 150 },
    { angle: 120, dist: 150 },
    { angle: 180, dist: 150 },
    { angle: 240, dist: 150 },
    { angle: 300, dist: 150 }
  ];

  torchPositions.forEach((pos, i) => {
    const rad = pos.angle * Math.PI / 180;
    const x = centerX + Math.cos(rad) * pos.dist;
    const y = centerY + Math.sin(rad) * pos.dist * 0.5; // Isometric

    // Torch pole
    cityCtx.fillStyle = '#3a2a1a';
    cityCtx.fillRect(x - 2, y - 20, 4, 20);

    // Flame flicker
    const flicker = Math.sin(time * 8 + i) * 3;
    const flicker2 = Math.cos(time * 12 + i * 0.5) * 2;

    // Flame glow
    const glowGrad = cityCtx.createRadialGradient(x, y - 25, 0, x, y - 25, 30);
    glowGrad.addColorStop(0, 'rgba(255, 200, 50, 0.6)');
    glowGrad.addColorStop(0.3, 'rgba(255, 150, 30, 0.3)');
    glowGrad.addColorStop(1, 'rgba(255, 100, 0, 0)');
    cityCtx.fillStyle = glowGrad;
    cityCtx.beginPath();
    cityCtx.arc(x, y - 25, 30, 0, Math.PI * 2);
    cityCtx.fill();

    // Flame
    cityCtx.fillStyle = '#ff6600';
    cityCtx.beginPath();
    cityCtx.moveTo(x - 4, y - 18);
    cityCtx.quadraticCurveTo(x + flicker, y - 35 + flicker2, x, y - 40);
    cityCtx.quadraticCurveTo(x + flicker2, y - 35 + flicker, x + 4, y - 18);
    cityCtx.closePath();
    cityCtx.fill();

    // Inner flame
    cityCtx.fillStyle = '#ffcc00';
    cityCtx.beginPath();
    cityCtx.moveTo(x - 2, y - 18);
    cityCtx.quadraticCurveTo(x + flicker * 0.5, y - 30 + flicker2 * 0.5, x, y - 32);
    cityCtx.quadraticCurveTo(x + flicker2 * 0.5, y - 30 + flicker * 0.5, x + 2, y - 18);
    cityCtx.closePath();
    cityCtx.fill();
  });
}

// ========== ANIMATED BIRDS ==========
let birdsState = [];
function initBirds(w, h) {
  birdsState = [];
  for (let i = 0; i < 8; i++) {
    birdsState.push({
      x: Math.random() * w,
      y: 60 + Math.random() * 80,
      vx: 0.3 + Math.random() * 0.5,
      vy: 0,
      phase: Math.random() * Math.PI * 2,
      size: 4 + Math.random() * 3
    });
  }
}

function drawAnimatedBirds(w, h, time) {
  if (birdsState.length === 0) initBirds(w, h);
  
  cityCtx.strokeStyle = '#2a2a2a';
  cityCtx.lineWidth = 1.5;
  
  birdsState.forEach(bird => {
    // Update position
    bird.x += bird.vx;
    bird.y += Math.sin(time * 2 + bird.phase) * 0.3;
    
    // Wrap around
    if (bird.x > w + 20) {
      bird.x = -20;
      bird.y = 60 + Math.random() * 80;
    }
    
    // Wing flap animation
    const flapOffset = Math.sin(time * 8 + bird.phase) * 3;
    
    cityCtx.beginPath();
    cityCtx.moveTo(bird.x - bird.size, bird.y + flapOffset);
    cityCtx.quadraticCurveTo(bird.x - bird.size/2, bird.y - 2, bird.x, bird.y);
    cityCtx.quadraticCurveTo(bird.x + bird.size/2, bird.y - 2, bird.x + bird.size, bird.y + flapOffset);
    cityCtx.stroke();
  });
}

// ========== ANIMATED WATER ==========
function drawWaterAnimation(centerX, centerY, time) {
  const cityRadius = Math.min(cityCanvas.width, cityCanvas.height) * 0.25;
  
  // Water sparkles/reflections
  cityCtx.fillStyle = 'rgba(255,255,255,0.6)';
  for (let i = 0; i < 12; i++) {
    const angle = (i * 30 + time * 20) * Math.PI / 180;
    const r = cityRadius + 8;
    const x = centerX + Math.cos(angle) * r;
    const y = centerY + Math.sin(angle) * r * 0.5;
    const sparkle = Math.sin(time * 3 + i) * 0.5 + 0.5;
    
    if (sparkle > 0.7) {
      cityCtx.globalAlpha = (sparkle - 0.7) * 3;
      cityCtx.beginPath();
      cityCtx.arc(x, y, 2, 0, Math.PI * 2);
      cityCtx.fill();
    }
  }
  cityCtx.globalAlpha = 1;
  
  // Water ripples
  cityCtx.strokeStyle = 'rgba(255,255,255,0.2)';
  cityCtx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const ripplePhase = (time * 0.5 + i * 0.3) % 1;
    const rippleR = cityRadius + 5 + ripplePhase * 15;
    const alpha = 1 - ripplePhase;
    
    cityCtx.globalAlpha = alpha * 0.3;
    cityCtx.beginPath();
    cityCtx.ellipse(centerX, centerY, rippleR, rippleR * 0.5, 0, 0, Math.PI * 2);
    cityCtx.stroke();
  }
  cityCtx.globalAlpha = 1;
}

// ========== ANIMATED VILLAGERS ==========
let villagersState = [];
function initVillagers(centerX, centerY) {
  villagersState = [];
  const cityRadius = Math.min(cityCanvas.width, cityCanvas.height) * 0.20;
  
  for (let i = 0; i < 6; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.random() * cityRadius * 0.6;
    villagersState.push({
      x: centerX + Math.cos(angle) * r,
      y: centerY + Math.sin(angle) * r * 0.5,
      targetX: centerX + Math.cos(angle) * r,
      targetY: centerY + Math.sin(angle) * r * 0.5,
      speed: 0.3 + Math.random() * 0.3,
      color: ['#8b4513', '#a0522d', '#6b4423', '#5d3a1a'][Math.floor(Math.random() * 4)],
      walkPhase: Math.random() * Math.PI * 2,
      waitTime: 0,
      direction: 1
    });
  }
}

function drawAnimatedVillagers(centerX, centerY, time) {
  if (villagersState.length === 0) initVillagers(centerX, centerY);
  
  const cityRadius = Math.min(cityCanvas.width, cityCanvas.height) * 0.20;
  
  villagersState.forEach(v => {
    // Update movement
    if (v.waitTime > 0) {
      v.waitTime -= 0.016;
    } else {
      const dx = v.targetX - v.x;
      const dy = v.targetY - v.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      
      if (dist < 3) {
        // Pick new target
        const angle = Math.random() * Math.PI * 2;
        const r = Math.random() * cityRadius * 0.6;
        v.targetX = centerX + Math.cos(angle) * r;
        v.targetY = centerY + Math.sin(angle) * r * 0.5;
        v.waitTime = 1 + Math.random() * 3;
        v.direction = v.targetX > v.x ? 1 : -1;
      } else {
        v.x += (dx / dist) * v.speed;
        v.y += (dy / dist) * v.speed;
        v.walkPhase += 0.3;
      }
    }
    
    // Draw villager
    const bobY = v.waitTime > 0 ? 0 : Math.sin(v.walkPhase) * 1.5;
    
    // Shadow
    cityCtx.fillStyle = 'rgba(0,0,0,0.2)';
    cityCtx.beginPath();
    cityCtx.ellipse(v.x, v.y + 4, 5, 2, 0, 0, Math.PI * 2);
    cityCtx.fill();
    
    // Body
    cityCtx.fillStyle = v.color;
    cityCtx.beginPath();
    cityCtx.ellipse(v.x, v.y - 5 + bobY, 4, 6, 0, 0, Math.PI * 2);
    cityCtx.fill();
    
    // Head
    cityCtx.fillStyle = '#deb887';
    cityCtx.beginPath();
    cityCtx.arc(v.x, v.y - 13 + bobY, 3, 0, Math.PI * 2);
    cityCtx.fill();
    
    // Legs animation
    if (v.waitTime <= 0) {
      const legSwing = Math.sin(v.walkPhase) * 2;
      cityCtx.strokeStyle = v.color;
      cityCtx.lineWidth = 2;
      cityCtx.beginPath();
      cityCtx.moveTo(v.x - 1, v.y + 1);
      cityCtx.lineTo(v.x - 1 + legSwing, v.y + 5);
      cityCtx.moveTo(v.x + 1, v.y + 1);
      cityCtx.lineTo(v.x + 1 - legSwing, v.y + 5);
      cityCtx.stroke();
    }
  });
}

// ========== ANIMATED SMOKE ==========
let smokeParticles = {};
function drawAnimatedSmoke(x, y, time, intensity = 1) {
  const key = `${Math.floor(x)}_${Math.floor(y)}`;
  
  if (!smokeParticles[key]) {
    smokeParticles[key] = [];
  }
  
  // Add new particles
  if (Math.random() < 0.15 * intensity) {
    smokeParticles[key].push({
      x: x + (Math.random() - 0.5) * 8,
      y: y,
      vx: (Math.random() - 0.5) * 0.3,
      vy: -0.5 - Math.random() * 0.5,
      size: 5 + Math.random() * 5,
      life: 1,
      maxLife: 1
    });
  }
  
  // Update and draw particles
  smokeParticles[key] = smokeParticles[key].filter(p => {
    p.x += p.vx + Math.sin(time * 2 + p.y * 0.1) * 0.2;
    p.y += p.vy;
    p.size += 0.15;
    p.life -= 0.012;
    p.vx *= 0.99;
    
    if (p.life <= 0) return false;
    
    const alpha = p.life * 0.4;
    const gray = 120 + (1 - p.life) * 80;
    cityCtx.fillStyle = `rgba(${gray},${gray},${gray},${alpha})`;
    cityCtx.beginPath();
    cityCtx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    cityCtx.fill();
    
    return true;
  });
  
  // Limit particles
  if (smokeParticles[key].length > 30) {
    smokeParticles[key] = smokeParticles[key].slice(-30);
  }
}

// ========== ANIMATED FLAGS ==========
function drawAnimatedFlags(centerX, centerY, time) {
  const cityRadius = Math.min(cityCanvas.width, cityCanvas.height) * 0.25;
  
  // Flag positions (on towers)
  const flagPositions = [
    { x: centerX, y: centerY - cityRadius * 0.5 - 30 },
    { x: centerX - cityRadius, y: centerY - 20 },
    { x: centerX + cityRadius, y: centerY - 20 }
  ];
  
  flagPositions.forEach((pos, i) => {
    const waveOffset = Math.sin(time * 4 + i * 0.5);
    const waveOffset2 = Math.sin(time * 5 + i * 0.5 + 1);
    
    // Flag pole
    cityCtx.strokeStyle = '#4a3020';
    cityCtx.lineWidth = 2;
    cityCtx.beginPath();
    cityCtx.moveTo(pos.x, pos.y + 15);
    cityCtx.lineTo(pos.x, pos.y - 15);
    cityCtx.stroke();
    
    // Flag fabric (wavy)
    cityCtx.fillStyle = i === 0 ? '#c41e3a' : '#2244aa';
    cityCtx.beginPath();
    cityCtx.moveTo(pos.x, pos.y - 15);
    cityCtx.quadraticCurveTo(pos.x + 8 + waveOffset * 2, pos.y - 12, pos.x + 15 + waveOffset2 * 3, pos.y - 10 + waveOffset);
    cityCtx.quadraticCurveTo(pos.x + 10 + waveOffset * 2, pos.y - 5, pos.x + 15 + waveOffset2 * 2, pos.y - 2 + waveOffset);
    cityCtx.lineTo(pos.x, pos.y - 3);
    cityCtx.closePath();
    cityCtx.fill();
    
    // Flag emblem (simple)
    cityCtx.fillStyle = 'rgba(255,255,255,0.5)';
    cityCtx.beginPath();
    cityCtx.arc(pos.x + 7 + waveOffset, pos.y - 9, 3, 0, Math.PI * 2);
    cityCtx.fill();
  });
}

// ========== PARTICLE EFFECTS ==========
let leafParticles = [];
function drawParticleEffects(w, h, time) {
  // Initialize leaves
  if (leafParticles.length < 10) {
    for (let i = leafParticles.length; i < 10; i++) {
      leafParticles.push({
        x: Math.random() * w,
        y: Math.random() * h * 0.5 + h * 0.3,
        vx: 0.2 + Math.random() * 0.3,
        vy: 0.1 + Math.random() * 0.2,
        rotation: Math.random() * Math.PI * 2,
        rotationSpeed: (Math.random() - 0.5) * 0.1,
        size: 3 + Math.random() * 2,
        color: ['#5a8a3a', '#6a9a4a', '#8aaa5a', '#7a6030'][Math.floor(Math.random() * 4)]
      });
    }
  }
  
  // Update and draw leaves
  leafParticles.forEach(leaf => {
    leaf.x += leaf.vx + Math.sin(time + leaf.y * 0.05) * 0.3;
    leaf.y += leaf.vy + Math.cos(time * 0.5 + leaf.x * 0.02) * 0.2;
    leaf.rotation += leaf.rotationSpeed;
    
    // Reset if off screen
    if (leaf.x > w + 20 || leaf.y > h + 20) {
      leaf.x = -10;
      leaf.y = Math.random() * h * 0.4 + h * 0.3;
    }
    
    // Draw leaf
    cityCtx.save();
    cityCtx.translate(leaf.x, leaf.y);
    cityCtx.rotate(leaf.rotation);
    cityCtx.fillStyle = leaf.color;
    cityCtx.beginPath();
    cityCtx.ellipse(0, 0, leaf.size, leaf.size * 0.4, 0, 0, Math.PI * 2);
    cityCtx.fill();
    cityCtx.restore();
  });
  
  // Dust motes near ground
  cityCtx.fillStyle = 'rgba(200,180,150,0.3)';
  for (let i = 0; i < 5; i++) {
    const dustX = (time * 20 + i * 150) % w;
    const dustY = h * 0.75 + Math.sin(time * 2 + i) * 10;
    const dustSize = 1 + Math.sin(time * 3 + i * 2) * 0.5;
    
    cityCtx.beginPath();
    cityCtx.arc(dustX, dustY, dustSize, 0, Math.PI * 2);
    cityCtx.fill();
  }
}

// ========== VUE CHAMPS DE RESSOURCES ==========
function renderFieldsView() {
  if (!cityCanvas || !cityCtx) return;

  const w = cityCanvas.width;
  const h = cityCanvas.height;
  const centerX = w / 2;
  const centerY = h / 2 + 30;
  const nightMode = isNightMode();

  // Clear
  cityCtx.clearRect(0, 0, w, h);

  // ========== SKY (Day/Night) ==========
  const skyGrad = cityCtx.createLinearGradient(0, 0, 0, h * 0.45);
  if (nightMode) {
    skyGrad.addColorStop(0, '#0a1020');
    skyGrad.addColorStop(0.5, '#152040');
    skyGrad.addColorStop(1, '#203050');
  } else {
    skyGrad.addColorStop(0, '#5a9ac2');
    skyGrad.addColorStop(0.5, '#7bc8e0');
    skyGrad.addColorStop(1, '#a8e4f0');
  }
  cityCtx.fillStyle = skyGrad;
  cityCtx.fillRect(0, 0, w, h * 0.45);

  // Sun/Moon
  if (nightMode) {
    drawMoon(w - 100, 70, 30);
    drawStars(w, h * 0.42);
  } else {
    drawSun(w - 100, 70, 35);
    // Clouds
    drawCloud(cityCtx, 100, 55, 40);
    drawCloud(cityCtx, w - 180, 70, 45);
  }

  // ========== GROUND - FARMLAND ==========
  const groundY = h * 0.42;

  // Background hills
  cityCtx.fillStyle = nightMode ? '#1a2a18' : '#5a8a4a';
  cityCtx.beginPath();
  cityCtx.moveTo(0, groundY);
  cityCtx.quadraticCurveTo(w * 0.25, groundY - 30, w * 0.5, groundY);
  cityCtx.quadraticCurveTo(w * 0.75, groundY - 20, w, groundY);
  cityCtx.lineTo(w, h);
  cityCtx.lineTo(0, h);
  cityCtx.closePath();
  cityCtx.fill();

  // Main ground
  const groundGrad = cityCtx.createLinearGradient(0, groundY, 0, h);
  if (nightMode) {
    groundGrad.addColorStop(0, '#2a3a28');
    groundGrad.addColorStop(0.3, '#1a2a18');
    groundGrad.addColorStop(0.7, '#152515');
    groundGrad.addColorStop(1, '#102010');
  } else {
    groundGrad.addColorStop(0, '#6a9a5a');
    groundGrad.addColorStop(0.3, '#5a8a4a');
    groundGrad.addColorStop(0.7, '#4a7a3a');
    groundGrad.addColorStop(1, '#3a6a2a');
  }
  cityCtx.fillStyle = groundGrad;
  cityCtx.fillRect(0, groundY, w, h - groundY);

  // ========== SCATTERED TREES AROUND ==========
  const treesPos = [
    { x: 40, y: groundY + 50, size: 35 },
    { x: w - 50, y: groundY + 60, size: 38 },
    { x: 30, y: h - 60, size: 30 },
    { x: w - 40, y: h - 50, size: 32 }
  ];
  treesPos.forEach(t => drawTree(t.x, t.y, t.size, nightMode));

  // ========== PATHS TO FIELDS ==========
  cityCtx.strokeStyle = nightMode ? '#3a3028' : '#8a7050';
  cityCtx.lineWidth = 10;
  cityCtx.lineCap = 'round';

  // Paths from center to fields
  citySlots.filter(s => s.isField).forEach(slot => {
    cityCtx.beginPath();
    cityCtx.moveTo(centerX, centerY);
    cityCtx.lineTo(slot.x, slot.y);
    cityCtx.stroke();
  });
  
  // ========== VILLAGE CENTER (click to return to city view) ==========
  const villageSlot = citySlots.find(s => s.isVillageCenter);
  if (villageSlot) {
    drawVillageCenter(villageSlot, cityHoveredSlot === -1);
  }
  
  // ========== RESOURCE FIELDS ==========
  // Sort by Y for proper layering
  const sortedFields = citySlots.filter(s => s.isField).sort((a, b) => a.y - b.y);
  
  sortedFields.forEach(slot => {
    const building = getFieldBuildingAtSlot(slot.slot, slot.fieldType);
    const isHovered = cityHoveredSlot === slot.slot;
    const isBuilding = currentCity?.buildQueue?.some(q => 
      q.buildingKey === slot.fieldType && q.status === 'RUNNING'
    );
    
    drawFieldSlot(slot, building, isHovered, isBuilding);
  });
  
  // ========== ANIMATED DECORATIONS ==========
  drawFieldAnimations(w, h, centerX, centerY);
}

// ========== FIELD ANIMATIONS ==========
let fieldAnimals = [];
let fieldButterflies = [];

function drawFieldAnimations(w, h, centerX, centerY) {
  const time = Date.now() / 1000;
  const nightMode = isNightMode();

  // ========== ANIMATED BIRDS/FIREFLIES ==========
  if (nightMode) {
    drawFireflies(w, h, time);
  } else {
    drawAnimatedBirds(w, h, time);
  }

  // ========== ANIMATED WHEAT WAVES ==========
  if (!nightMode) {
    drawWheatWaves(w, h, time);
  }

  // ========== FARM ANIMALS (day only) ==========
  if (!nightMode) {
    drawFarmAnimals(w, h, time);
  }

  // ========== BUTTERFLIES (day) / FIREFLIES (night) ==========
  if (!nightMode) {
    drawButterflies(w, h, time);
  }

  // ========== DUST/MIST PARTICLES ==========
  drawFieldDust(w, h, time);

  // ========== NIGHT AMBIENT OVERLAY ==========
  if (nightMode) {
    cityCtx.fillStyle = 'rgba(10, 15, 30, 0.15)';
    cityCtx.fillRect(0, 0, w, h);
  }
}

function drawWheatWaves(w, h, time) {
  // Draw animated wheat stalks along paths
  const farmSlots = citySlots.filter(s => s.fieldType === 'FARM');
  
  farmSlots.forEach(slot => {
    const waveIntensity = Math.sin(time * 2 + slot.x * 0.02) * 3;
    
    // Draw animated wheat near farm
    for (let i = 0; i < 5; i++) {
      const angle = (i * 72) * Math.PI / 180;
      const dist = slot.size * 0.8;
      const wx = slot.x + Math.cos(angle) * dist;
      const wy = slot.y + Math.sin(angle) * dist * 0.5;
      
      // Wheat stalk
      cityCtx.strokeStyle = '#c4a030';
      cityCtx.lineWidth = 2;
      cityCtx.beginPath();
      const bendX = Math.sin(time * 3 + i + wx * 0.01) * 3;
      cityCtx.moveTo(wx, wy);
      cityCtx.quadraticCurveTo(wx + bendX, wy - 10, wx + bendX * 1.5, wy - 15);
      cityCtx.stroke();
      
      // Wheat head
      cityCtx.fillStyle = '#daa520';
      cityCtx.beginPath();
      cityCtx.ellipse(wx + bendX * 1.5, wy - 17, 2, 4, 0, 0, Math.PI * 2);
      cityCtx.fill();
    }
  });
}

function initFieldAnimals(w, h) {
  fieldAnimals = [];
  // Add some chickens
  for (let i = 0; i < 4; i++) {
    fieldAnimals.push({
      type: 'chicken',
      x: 100 + Math.random() * (w - 200),
      y: h * 0.55 + Math.random() * (h * 0.35),
      targetX: 100 + Math.random() * (w - 200),
      targetY: h * 0.55 + Math.random() * (h * 0.35),
      speed: 0.4 + Math.random() * 0.3,
      peckTimer: Math.random() * 3,
      direction: Math.random() > 0.5 ? 1 : -1
    });
  }
}

function drawFarmAnimals(w, h, time) {
  if (fieldAnimals.length === 0) initFieldAnimals(w, h);
  
  fieldAnimals.forEach(animal => {
    if (animal.type === 'chicken') {
      drawChicken(animal, time);
    }
  });
}

function drawChicken(chicken, time) {
  // Update movement
  chicken.peckTimer -= 0.016;
  
  if (chicken.peckTimer <= 0) {
    const dx = chicken.targetX - chicken.x;
    const dy = chicken.targetY - chicken.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    
    if (dist < 5) {
      // Pick new target or start pecking
      if (Math.random() < 0.3) {
        chicken.peckTimer = 1 + Math.random() * 2;
      } else {
        chicken.targetX = 80 + Math.random() * (cityCanvas.width - 160);
        chicken.targetY = cityCanvas.height * 0.55 + Math.random() * (cityCanvas.height * 0.35);
        chicken.direction = chicken.targetX > chicken.x ? 1 : -1;
      }
    } else {
      chicken.x += (dx / dist) * chicken.speed;
      chicken.y += (dy / dist) * chicken.speed;
    }
  }
  
  const pecking = chicken.peckTimer > 0 && Math.sin(time * 15) > 0;
  const headY = pecking ? 3 : 0;
  
  // Shadow
  cityCtx.fillStyle = 'rgba(0,0,0,0.15)';
  cityCtx.beginPath();
  cityCtx.ellipse(chicken.x, chicken.y + 3, 6, 2, 0, 0, Math.PI * 2);
  cityCtx.fill();
  
  // Body
  cityCtx.fillStyle = '#f5deb3';
  cityCtx.beginPath();
  cityCtx.ellipse(chicken.x, chicken.y - 3, 7, 5, 0, 0, Math.PI * 2);
  cityCtx.fill();
  
  // Head
  cityCtx.fillStyle = '#f5deb3';
  cityCtx.beginPath();
  cityCtx.arc(chicken.x + chicken.direction * 5, chicken.y - 6 + headY, 4, 0, Math.PI * 2);
  cityCtx.fill();
  
  // Beak
  cityCtx.fillStyle = '#ffa500';
  cityCtx.beginPath();
  cityCtx.moveTo(chicken.x + chicken.direction * 9, chicken.y - 5 + headY);
  cityCtx.lineTo(chicken.x + chicken.direction * 12, chicken.y - 4 + headY);
  cityCtx.lineTo(chicken.x + chicken.direction * 9, chicken.y - 3 + headY);
  cityCtx.closePath();
  cityCtx.fill();
  
  // Comb
  cityCtx.fillStyle = '#ff4444';
  cityCtx.beginPath();
  cityCtx.arc(chicken.x + chicken.direction * 4, chicken.y - 10 + headY, 2, 0, Math.PI * 2);
  cityCtx.fill();
  
  // Eye
  cityCtx.fillStyle = '#000';
  cityCtx.beginPath();
  cityCtx.arc(chicken.x + chicken.direction * 6, chicken.y - 7 + headY, 1, 0, Math.PI * 2);
  cityCtx.fill();
  
  // Legs
  cityCtx.strokeStyle = '#ffa500';
  cityCtx.lineWidth = 1;
  cityCtx.beginPath();
  cityCtx.moveTo(chicken.x - 2, chicken.y + 2);
  cityCtx.lineTo(chicken.x - 2, chicken.y + 5);
  cityCtx.moveTo(chicken.x + 2, chicken.y + 2);
  cityCtx.lineTo(chicken.x + 2, chicken.y + 5);
  cityCtx.stroke();
}

function initButterflies(w, h) {
  fieldButterflies = [];
  for (let i = 0; i < 6; i++) {
    fieldButterflies.push({
      x: Math.random() * w,
      y: h * 0.4 + Math.random() * (h * 0.4),
      vx: (Math.random() - 0.5) * 2,
      vy: (Math.random() - 0.5) * 1,
      phase: Math.random() * Math.PI * 2,
      color: ['#ff69b4', '#ffd700', '#87ceeb', '#ff6347', '#98fb98'][Math.floor(Math.random() * 5)],
      size: 3 + Math.random() * 2
    });
  }
}

function drawButterflies(w, h, time) {
  if (fieldButterflies.length === 0) initButterflies(w, h);
  
  fieldButterflies.forEach(b => {
    // Update position with random wandering
    b.vx += (Math.random() - 0.5) * 0.2;
    b.vy += (Math.random() - 0.5) * 0.15;
    b.vx = Math.max(-2, Math.min(2, b.vx));
    b.vy = Math.max(-1.5, Math.min(1.5, b.vy));
    
    b.x += b.vx;
    b.y += b.vy + Math.sin(time * 5 + b.phase) * 0.5;
    
    // Wrap around
    if (b.x < -20) b.x = w + 20;
    if (b.x > w + 20) b.x = -20;
    if (b.y < h * 0.35) b.vy += 0.1;
    if (b.y > h * 0.85) b.vy -= 0.1;
    
    // Wing flap
    const wingAngle = Math.sin(time * 12 + b.phase) * 0.5;
    
    // Draw butterfly
    cityCtx.fillStyle = b.color;
    
    // Left wing
    cityCtx.save();
    cityCtx.translate(b.x, b.y);
    cityCtx.rotate(-wingAngle);
    cityCtx.beginPath();
    cityCtx.ellipse(-b.size, 0, b.size, b.size * 0.6, 0, 0, Math.PI * 2);
    cityCtx.fill();
    cityCtx.restore();
    
    // Right wing
    cityCtx.save();
    cityCtx.translate(b.x, b.y);
    cityCtx.rotate(wingAngle);
    cityCtx.beginPath();
    cityCtx.ellipse(b.size, 0, b.size, b.size * 0.6, 0, 0, Math.PI * 2);
    cityCtx.fill();
    cityCtx.restore();
    
    // Body
    cityCtx.fillStyle = '#333';
    cityCtx.beginPath();
    cityCtx.ellipse(b.x, b.y, 1.5, 3, 0, 0, Math.PI * 2);
    cityCtx.fill();
  });
}

function drawFieldDust(w, h, time) {
  // Dust particles kicked up by animals or wind
  cityCtx.fillStyle = 'rgba(180,160,120,0.3)';
  
  for (let i = 0; i < 8; i++) {
    const dustX = (time * 15 + i * 120) % w;
    const dustY = h * 0.75 + Math.sin(time * 2 + i * 0.5) * 15;
    const dustSize = 1.5 + Math.sin(time * 3 + i) * 0.5;
    
    cityCtx.beginPath();
    cityCtx.arc(dustX, dustY, dustSize, 0, Math.PI * 2);
    cityCtx.fill();
  }
}

function drawVillageCenter(slot, isHovered) {
  const { x, y, size } = slot;
  
  // Shadow
  cityCtx.fillStyle = 'rgba(0,0,0,0.3)';
  cityCtx.beginPath();
  cityCtx.ellipse(x + 5, y + 8, size * 0.6, size * 0.3, 0, 0, Math.PI * 2);
  cityCtx.fill();
  
  // Glow if hovered
  if (isHovered) {
    cityCtx.shadowColor = '#ffd700';
    cityCtx.shadowBlur = 25;
  }
  
  // Village base (circular wall)
  cityCtx.fillStyle = '#7a7a7a';
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, size * 0.55, size * 0.3, 0, 0, Math.PI * 2);
  cityCtx.fill();
  
  // Village ground
  cityCtx.fillStyle = '#c4a060';
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, size * 0.45, size * 0.25, 0, 0, Math.PI * 2);
  cityCtx.fill();
  
  cityCtx.shadowBlur = 0;
  
  // Mini buildings
  drawMapBuilding(x, y - 8, size * 0.2, '#d4a84b', '#8b6914');
  drawMapBuilding(x - size * 0.2, y + 3, size * 0.12, '#8b7355', '#5a4030');
  drawMapBuilding(x + size * 0.2, y + 3, size * 0.12, '#8b7355', '#5a4030');
  
  // Label
  cityCtx.font = 'bold 12px Cinzel, serif';
  cityCtx.textAlign = 'center';
  cityCtx.fillStyle = '#fff';
  cityCtx.shadowColor = '#000';
  cityCtx.shadowBlur = 3;
  cityCtx.fillText('🏰 Ville', x, y + size * 0.5);
  cityCtx.shadowBlur = 0;
  
  if (isHovered) {
    cityCtx.font = '10px Arial';
    cityCtx.fillStyle = '#ffd700';
    cityCtx.fillText('Cliquez pour voir la ville', x, y + size * 0.65);
  }
}

// ========== TRAVIAN-STYLE RESOURCE FIELD ==========
function drawFieldSlot(slot, building, isHovered, isBuilding) {
  const { x, y, size, fieldType } = slot;
  const level = building?.level || 0;
  const time = Date.now() / 1000;

  // Travian-style field definitions
  const fieldStyles = {
    FARM: {
      bgOuter: '#8a9a4a', bgInner: '#c4a030', accent: '#daa520',
      icon: '🌾', name: 'Ferme', productIcon: '🌾'
    },
    LUMBER: {
      bgOuter: '#3a5a2a', bgInner: '#4a6a3a', accent: '#2a4a1a',
      icon: '🪵', name: 'Bûcheron', productIcon: '🌲'
    },
    QUARRY: {
      bgOuter: '#6a6a6a', bgInner: '#8a8a8a', accent: '#5a5a5a',
      icon: '🪨', name: 'Carrière', productIcon: '⛰️'
    },
    IRON_MINE: {
      bgOuter: '#4a4a5a', bgInner: '#6a6a7a', accent: '#3a3a4a',
      icon: '⛏️', name: 'Mine', productIcon: '⚒️'
    }
  };

  const style = fieldStyles[fieldType] || fieldStyles.FARM;

  // ========== HOVER GLOW (Travian-style) ==========
  if (isHovered) {
    cityCtx.fillStyle = 'rgba(255,215,0,0.2)';
    cityCtx.beginPath();
    cityCtx.ellipse(x, y, size * 0.85, size * 0.45, 0, 0, Math.PI * 2);
    cityCtx.fill();
  }

  // ========== SHADOW ==========
  cityCtx.fillStyle = 'rgba(0,0,0,0.35)';
  cityCtx.beginPath();
  cityCtx.ellipse(x + 4, y + 6, size * 0.72, size * 0.38, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // ========== OUTER FIELD (terrain) ==========
  const outerGrad = cityCtx.createRadialGradient(x, y, 0, x, y, size * 0.7);
  outerGrad.addColorStop(0, style.bgInner);
  outerGrad.addColorStop(0.7, style.bgOuter);
  outerGrad.addColorStop(1, shadeColor(style.bgOuter, -20));
  cityCtx.fillStyle = outerGrad;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, size * 0.7, size * 0.38, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // ========== HOVER BORDER ==========
  if (isHovered) {
    cityCtx.strokeStyle = '#ffd700';
    cityCtx.lineWidth = 3;
    cityCtx.shadowColor = '#ffd700';
    cityCtx.shadowBlur = 15;
    cityCtx.beginPath();
    cityCtx.ellipse(x, y, size * 0.7, size * 0.38, 0, 0, Math.PI * 2);
    cityCtx.stroke();
    cityCtx.shadowBlur = 0;
  }

  // ========== FIELD-SPECIFIC GRAPHICS ==========
  if (level > 0) {
    drawFieldDetails(x, y, size, fieldType, level, time);
  }

  // ========== FIELD DECORATION BASED ON TYPE ==========
  if (fieldType === 'FARM' && level > 0) {
    drawFarmField(x, y, size, level, time);
  } else if (fieldType === 'LUMBER' && level > 0) {
    drawLumberField(x, y, size, level);
  } else if (fieldType === 'QUARRY' && level > 0) {
    drawQuarryField(x, y, size, level);
  } else if (fieldType === 'IRON_MINE' && level > 0) {
    drawMineField(x, y, size, level, time);
  }

  // ========== PRODUCTION INDICATOR (animated) ==========
  if (level > 0 && !isBuilding) {
    const prodY = y - size * 0.5 + Math.sin(time * 2) * 3;
    cityCtx.globalAlpha = 0.7 + Math.sin(time * 3) * 0.2;
    cityCtx.font = '16px Arial';
    cityCtx.textAlign = 'center';
    cityCtx.fillText(style.productIcon, x, prodY);
    cityCtx.globalAlpha = 1;
  }

  // ========== EMPTY SLOT INDICATOR ==========
  if (level === 0) {
    // Dashed border for empty
    cityCtx.strokeStyle = isHovered ? '#ffd700' : 'rgba(255,255,255,0.4)';
    cityCtx.lineWidth = 2;
    cityCtx.setLineDash([5, 5]);
    cityCtx.beginPath();
    cityCtx.ellipse(x, y, size * 0.5, size * 0.28, 0, 0, Math.PI * 2);
    cityCtx.stroke();
    cityCtx.setLineDash([]);

    // Plus sign
    cityCtx.fillStyle = isHovered ? '#ffd700' : 'rgba(255,255,255,0.6)';
    cityCtx.font = `bold ${size * 0.4}px Arial`;
    cityCtx.textAlign = 'center';
    cityCtx.textBaseline = 'middle';
    cityCtx.fillText('+', x, y);
  }

  // ========== LEVEL BADGE (Travian-style) ==========
  if (level > 0) {
    const badgeX = x + size * 0.55;
    const badgeY = y - size * 0.2;

    // Badge shadow
    cityCtx.fillStyle = 'rgba(0,0,0,0.5)';
    cityCtx.beginPath();
    cityCtx.arc(badgeX + 2, badgeY + 2, 13, 0, Math.PI * 2);
    cityCtx.fill();

    // Badge background
    cityCtx.fillStyle = isHovered ? '#2a2a2a' : '#1a1a1a';
    cityCtx.beginPath();
    cityCtx.arc(badgeX, badgeY, 13, 0, Math.PI * 2);
    cityCtx.fill();

    // Gold ring
    cityCtx.strokeStyle = isHovered ? '#ffd700' : '#c9a227';
    cityCtx.lineWidth = isHovered ? 3 : 2;
    cityCtx.stroke();

    // Level number
    cityCtx.fillStyle = isHovered ? '#ffd700' : '#e8c547';
    cityCtx.font = 'bold 11px Cinzel, serif';
    cityCtx.textAlign = 'center';
    cityCtx.textBaseline = 'middle';
    cityCtx.fillText(level.toString(), badgeX, badgeY + 1);
  }

  // ========== CONSTRUCTION INDICATOR ==========
  if (isBuilding) {
    cityCtx.globalAlpha = 0.6 + Math.sin(time * 5) * 0.2;

    // Hammer animation
    const hammerY = y - size * 0.55 + Math.sin(time * 8) * 3;
    cityCtx.fillStyle = '#ffa500';
    cityCtx.font = 'bold 20px Arial';
    cityCtx.textAlign = 'center';
    cityCtx.fillText('⚒️', x, hammerY);

    // Progress ring
    const progress = (time % 2) / 2;
    cityCtx.strokeStyle = '#ffa500';
    cityCtx.lineWidth = 3;
    cityCtx.beginPath();
    cityCtx.arc(x, y, size * 0.4, -Math.PI / 2, -Math.PI / 2 + progress * Math.PI * 2);
    cityCtx.stroke();

    cityCtx.globalAlpha = 1;
  }
}

// ========== FARM FIELD DETAILS ==========
function drawFarmField(x, y, size, level, time) {
  // Wheat rows (animated)
  const rows = Math.min(5, 2 + Math.floor(level / 5));

  for (let i = 0; i < rows; i++) {
    const rowY = y - size * 0.15 + i * (size * 0.12);
    const wave = Math.sin(time * 2 + i * 0.5) * 2;

    // Wheat stalks
    cityCtx.strokeStyle = '#c9a227';
    cityCtx.lineWidth = 1.5;
    for (let j = 0; j < 6; j++) {
      const stalkX = x - size * 0.35 + j * (size * 0.14);
      const stalkWave = Math.sin(time * 3 + j * 0.3) * 2;
      cityCtx.beginPath();
      cityCtx.moveTo(stalkX, rowY + 5);
      cityCtx.quadraticCurveTo(stalkX + stalkWave, rowY - 3, stalkX + stalkWave * 1.5, rowY - 8);
      cityCtx.stroke();

      // Wheat head
      cityCtx.fillStyle = '#daa520';
      cityCtx.beginPath();
      cityCtx.ellipse(stalkX + stalkWave * 1.5, rowY - 10, 2, 4, stalkWave * 0.1, 0, Math.PI * 2);
      cityCtx.fill();
    }
  }

  // Scarecrow for higher levels
  if (level >= 10) {
    const scX = x + size * 0.3;
    const scY = y - size * 0.1;
    cityCtx.strokeStyle = '#5a4030';
    cityCtx.lineWidth = 2;
    cityCtx.beginPath();
    cityCtx.moveTo(scX, scY + 8);
    cityCtx.lineTo(scX, scY - 15);
    cityCtx.moveTo(scX - 8, scY - 8);
    cityCtx.lineTo(scX + 8, scY - 8);
    cityCtx.stroke();
    cityCtx.fillStyle = '#c4a030';
    cityCtx.beginPath();
    cityCtx.arc(scX, scY - 18, 4, 0, Math.PI * 2);
    cityCtx.fill();
  }
}

// ========== LUMBER FIELD DETAILS ==========
function drawLumberField(x, y, size, level) {
  // Trees based on level
  const treeCount = Math.min(5, 2 + Math.floor(level / 4));
  const treePositions = [
    { dx: 0, dy: -5, s: 1.2 },
    { dx: -0.25, dy: 0, s: 0.9 },
    { dx: 0.25, dy: 0, s: 1.0 },
    { dx: -0.15, dy: 8, s: 0.8 },
    { dx: 0.15, dy: 8, s: 0.85 }
  ];

  for (let i = 0; i < treeCount; i++) {
    const pos = treePositions[i];
    const treeX = x + pos.dx * size;
    const treeY = y + pos.dy;
    const treeSize = size * 0.18 * pos.s;

    // Tree shadow
    cityCtx.fillStyle = 'rgba(0,0,0,0.2)';
    cityCtx.beginPath();
    cityCtx.ellipse(treeX + 2, treeY + treeSize * 0.8, treeSize * 0.6, treeSize * 0.2, 0, 0, Math.PI * 2);
    cityCtx.fill();

    // Trunk
    cityCtx.fillStyle = '#5a4030';
    cityCtx.fillRect(treeX - treeSize * 0.12, treeY, treeSize * 0.24, treeSize * 0.6);

    // Foliage (layers)
    cityCtx.fillStyle = '#2a5a1a';
    for (let layer = 0; layer < 3; layer++) {
      const layerY = treeY - layer * treeSize * 0.35;
      const layerW = treeSize * (1 - layer * 0.2);
      cityCtx.beginPath();
      cityCtx.moveTo(treeX, layerY - treeSize * 0.5);
      cityCtx.lineTo(treeX - layerW * 0.6, layerY);
      cityCtx.lineTo(treeX + layerW * 0.6, layerY);
      cityCtx.closePath();
      cityCtx.fill();
    }
  }

  // Logs pile for higher levels
  if (level >= 8) {
    cityCtx.fillStyle = '#6a5040';
    cityCtx.fillRect(x + size * 0.35, y + 3, 12, 5);
    cityCtx.fillRect(x + size * 0.35 + 2, y - 2, 10, 5);
  }
}

// ========== QUARRY FIELD DETAILS ==========
function drawQuarryField(x, y, size, level) {
  // Rock formations
  const rockCount = Math.min(4, 1 + Math.floor(level / 5));
  const rockPositions = [
    { dx: 0, dy: -3, s: 1.2 },
    { dx: -0.2, dy: 3, s: 0.9 },
    { dx: 0.2, dy: 5, s: 1.0 },
    { dx: 0, dy: 8, s: 0.7 }
  ];

  for (let i = 0; i < rockCount; i++) {
    const pos = rockPositions[i];
    const rockX = x + pos.dx * size;
    const rockY = y + pos.dy;
    const rockSize = size * 0.12 * pos.s;

    // Rock shadow
    cityCtx.fillStyle = 'rgba(0,0,0,0.25)';
    cityCtx.beginPath();
    cityCtx.ellipse(rockX + 2, rockY + rockSize * 0.3, rockSize * 1.1, rockSize * 0.4, 0, 0, Math.PI * 2);
    cityCtx.fill();

    // Rock body
    const rockGrad = cityCtx.createLinearGradient(rockX - rockSize, rockY, rockX + rockSize, rockY);
    rockGrad.addColorStop(0, '#a0a0a0');
    rockGrad.addColorStop(0.5, '#c0c0c0');
    rockGrad.addColorStop(1, '#808080');
    cityCtx.fillStyle = rockGrad;
    cityCtx.beginPath();
    cityCtx.moveTo(rockX - rockSize, rockY);
    cityCtx.lineTo(rockX - rockSize * 0.7, rockY - rockSize * 1.2);
    cityCtx.lineTo(rockX + rockSize * 0.3, rockY - rockSize * 1.5);
    cityCtx.lineTo(rockX + rockSize, rockY - rockSize * 0.5);
    cityCtx.lineTo(rockX + rockSize * 0.8, rockY);
    cityCtx.closePath();
    cityCtx.fill();
  }

  // Stone blocks for higher levels
  if (level >= 10) {
    cityCtx.fillStyle = '#9a9a9a';
    cityCtx.fillRect(x - size * 0.4, y + 5, 10, 6);
    cityCtx.fillStyle = '#8a8a8a';
    cityCtx.fillRect(x - size * 0.35, y + 1, 8, 5);
  }
}

// ========== MINE FIELD DETAILS ==========
function drawMineField(x, y, size, level, time) {
  // Mine entrance
  cityCtx.fillStyle = '#3a3a3a';
  cityCtx.beginPath();
  cityCtx.arc(x, y - 2, size * 0.2, Math.PI, 0);
  cityCtx.lineTo(x + size * 0.2, y + 5);
  cityCtx.lineTo(x - size * 0.2, y + 5);
  cityCtx.closePath();
  cityCtx.fill();

  // Dark interior
  cityCtx.fillStyle = '#1a1a1a';
  cityCtx.beginPath();
  cityCtx.arc(x, y, size * 0.14, Math.PI, 0);
  cityCtx.lineTo(x + size * 0.14, y + 3);
  cityCtx.lineTo(x - size * 0.14, y + 3);
  cityCtx.closePath();
  cityCtx.fill();

  // Wooden frame
  cityCtx.strokeStyle = '#5a4030';
  cityCtx.lineWidth = 3;
  cityCtx.beginPath();
  cityCtx.moveTo(x - size * 0.18, y + 5);
  cityCtx.lineTo(x - size * 0.18, y - size * 0.15);
  cityCtx.arc(x, y - size * 0.15, size * 0.18, Math.PI, 0);
  cityCtx.lineTo(x + size * 0.18, y + 5);
  cityCtx.stroke();

  // Mine cart for higher levels
  if (level >= 5) {
    const cartX = x + size * 0.3;
    const cartY = y + 3;

    // Cart body
    cityCtx.fillStyle = '#6a5a4a';
    cityCtx.fillRect(cartX - 6, cartY - 4, 12, 6);

    // Ore in cart
    cityCtx.fillStyle = '#4a5a6a';
    cityCtx.beginPath();
    cityCtx.arc(cartX - 2, cartY - 5, 3, 0, Math.PI * 2);
    cityCtx.arc(cartX + 2, cartY - 6, 2.5, 0, Math.PI * 2);
    cityCtx.fill();

    // Wheels
    cityCtx.fillStyle = '#3a3a3a';
    cityCtx.beginPath();
    cityCtx.arc(cartX - 4, cartY + 2, 2, 0, Math.PI * 2);
    cityCtx.arc(cartX + 4, cartY + 2, 2, 0, Math.PI * 2);
    cityCtx.fill();
  }

  // Torch flame for high levels
  if (level >= 12) {
    const flameY = y - size * 0.25 + Math.sin(time * 10) * 2;
    cityCtx.fillStyle = `rgba(255,${150 + Math.sin(time * 15) * 50},0,0.8)`;
    cityCtx.beginPath();
    cityCtx.arc(x, flameY, 4 + Math.sin(time * 8), 0, Math.PI * 2);
    cityCtx.fill();
  }
}

// Helper for field details
function drawFieldDetails(x, y, size, fieldType, level, time) {
  // Add subtle ground texture
  cityCtx.strokeStyle = 'rgba(0,0,0,0.1)';
  cityCtx.lineWidth = 0.5;
  for (let i = 0; i < 3; i++) {
    const rowY = y - size * 0.1 + i * size * 0.15;
    cityCtx.beginPath();
    cityCtx.moveTo(x - size * 0.5, rowY);
    cityCtx.lineTo(x + size * 0.5, rowY);
    cityCtx.stroke();
  }
}

function getFieldBuildingAtSlot(slotNum, fieldType) {
  // Les champs de ressources sont stockés différemment
  // On cherche le bâtiment de ce type avec ce numéro de slot
  return currentCity?.buildings?.find(b => 
    b.key === fieldType && b.slot === slotNum + 100 // Offset pour différencier des slots ville
  );
}


function drawCloud(ctx, x, y, size) {
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.beginPath();
  ctx.arc(x, y, size * 0.5, 0, Math.PI * 2);
  ctx.arc(x + size * 0.4, y - size * 0.1, size * 0.4, 0, Math.PI * 2);
  ctx.arc(x + size * 0.8, y, size * 0.5, 0, Math.PI * 2);
  ctx.arc(x + size * 0.4, y + size * 0.2, size * 0.35, 0, Math.PI * 2);
  ctx.fill();
}

function drawCityRoads(centerX, centerY) {
  const nightMode = isNightMode();
  const cityRadius = Math.min(cityCanvas.width, cityCanvas.height) * 0.32;

  // Travian-style cross roads (N, E, S, W)
  const roadColor = nightMode ? '#3a3028' : '#8a7050';
  const roadHighlight = nightMode ? '#4a4038' : '#a09070';
  const roadDark = nightMode ? '#2a2018' : '#6a5030';

  // Main cross roads to gates
  cityCtx.strokeStyle = roadColor;
  cityCtx.lineWidth = 14;
  cityCtx.lineCap = 'round';

  // Vertical road (N-S)
  cityCtx.beginPath();
  cityCtx.moveTo(centerX, centerY - cityRadius * 0.5 + 20);
  cityCtx.lineTo(centerX, centerY + cityRadius * 0.5 - 20);
  cityCtx.stroke();

  // Horizontal road (E-W) - compressed for isometric
  cityCtx.beginPath();
  cityCtx.moveTo(centerX - cityRadius + 25, centerY);
  cityCtx.lineTo(centerX + cityRadius - 25, centerY);
  cityCtx.stroke();

  // Road borders (darker edges)
  cityCtx.strokeStyle = roadDark;
  cityCtx.lineWidth = 2;

  // Vertical borders
  cityCtx.beginPath();
  cityCtx.moveTo(centerX - 7, centerY - cityRadius * 0.5 + 20);
  cityCtx.lineTo(centerX - 7, centerY + cityRadius * 0.5 - 20);
  cityCtx.stroke();
  cityCtx.beginPath();
  cityCtx.moveTo(centerX + 7, centerY - cityRadius * 0.5 + 20);
  cityCtx.lineTo(centerX + 7, centerY + cityRadius * 0.5 - 20);
  cityCtx.stroke();

  // Horizontal borders
  cityCtx.beginPath();
  cityCtx.moveTo(centerX - cityRadius + 25, centerY - 3);
  cityCtx.lineTo(centerX + cityRadius - 25, centerY - 3);
  cityCtx.stroke();
  cityCtx.beginPath();
  cityCtx.moveTo(centerX - cityRadius + 25, centerY + 3);
  cityCtx.lineTo(centerX + cityRadius - 25, centerY + 3);
  cityCtx.stroke();

  // Center circle (plaza)
  cityCtx.fillStyle = roadHighlight;
  cityCtx.beginPath();
  cityCtx.ellipse(centerX, centerY, 25, 15, 0, 0, Math.PI * 2);
  cityCtx.fill();
  cityCtx.strokeStyle = roadDark;
  cityCtx.lineWidth = 2;
  cityCtx.stroke();

  // Secondary roads to slots
  cityCtx.strokeStyle = roadColor;
  cityCtx.lineWidth = 6;
  citySlots.filter(s => s.ring === 'inner' && !s.isField).forEach(slot => {
    cityCtx.beginPath();
    cityCtx.moveTo(centerX, centerY);
    cityCtx.lineTo(slot.x, slot.y);
    cityCtx.stroke();
  });
}

function drawResourceField(slot) {
  const { x, y, size, fieldType } = slot;
  const building = getBuildingAtSlot(slot.slot);
  const level = building?.level || 0;
  const isHovered = cityHoveredSlot === slot.slot;
  
  // Field colors by type
  const fieldColors = {
    FARM: { bg: '#7a9a40', detail: '#5a7a20', icon: '🌾' },
    LUMBER: { bg: '#4a6a3a', detail: '#3a5a2a', icon: '🌲' },
    QUARRY: { bg: '#7a7a7a', detail: '#5a5a5a', icon: '⛰️' },
    IRON_MINE: { bg: '#5a5a6a', detail: '#4a4a5a', icon: '⛏️' }
  };
  
  const colors = fieldColors[fieldType] || fieldColors.FARM;
  
  // Shadow
  cityCtx.fillStyle = 'rgba(0,0,0,0.3)';
  cityCtx.beginPath();
  cityCtx.ellipse(x + 3, y + 5, size, size * 0.5, 0, 0, Math.PI * 2);
  cityCtx.fill();
  
  // Field base
  cityCtx.fillStyle = colors.bg;
  if (isHovered) {
    cityCtx.shadowColor = '#ffd700';
    cityCtx.shadowBlur = 20;
  }
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, size, size * 0.5, 0, 0, Math.PI * 2);
  cityCtx.fill();
  cityCtx.shadowBlur = 0;
  
  // Field border
  cityCtx.strokeStyle = isHovered ? '#ffd700' : colors.detail;
  cityCtx.lineWidth = isHovered ? 3 : 2;
  cityCtx.stroke();
  
  // Icon
  cityCtx.font = `${size * 0.7}px Arial`;
  cityCtx.textAlign = 'center';
  cityCtx.textBaseline = 'middle';
  cityCtx.fillText(colors.icon, x, y - 5);
  
  // Level badge
  if (level > 0) {
    cityCtx.fillStyle = 'rgba(0,0,0,0.7)';
    cityCtx.beginPath();
    cityCtx.arc(x + size * 0.6, y + size * 0.2, 12, 0, Math.PI * 2);
    cityCtx.fill();
    
    cityCtx.fillStyle = '#ffd700';
    cityCtx.font = 'bold 11px Cinzel, serif';
    cityCtx.fillText(level, x + size * 0.6, y + size * 0.2 + 1);
  }
}

function drawBuildingSlot(slot, building, isHovered, isBuilding) {
  const { x, y, size, fixed, fixedKey } = slot;
  
  // Determine what's in this slot
  const key = fixed ? fixedKey : building?.key;
  const level = building?.level || (fixed ? 1 : 0);
  const isEmpty = !key;
  
  // Shadow
  cityCtx.fillStyle = 'rgba(0,0,0,0.4)';
  cityCtx.beginPath();
  cityCtx.ellipse(x + 4, y + 6, size * 0.6, size * 0.3, 0, 0, Math.PI * 2);
  cityCtx.fill();
  
  if (isEmpty) {
    // Empty slot - draw placeholder
    cityCtx.fillStyle = isHovered ? 'rgba(212,168,75,0.5)' : 'rgba(100,80,60,0.5)';
    cityCtx.strokeStyle = isHovered ? '#ffd700' : '#806040';
    cityCtx.lineWidth = isHovered ? 3 : 2;
    cityCtx.setLineDash([5, 5]);
    
    cityCtx.beginPath();
    cityCtx.ellipse(x, y, size * 0.5, size * 0.3, 0, 0, Math.PI * 2);
    cityCtx.fill();
    cityCtx.stroke();
    cityCtx.setLineDash([]);
    
    // Plus icon
    cityCtx.fillStyle = isHovered ? '#ffd700' : '#a08060';
    cityCtx.font = `bold ${size * 0.5}px Arial`;
    cityCtx.textAlign = 'center';
    cityCtx.textBaseline = 'middle';
    cityCtx.fillText('+', x, y);
    
  } else {
    // Building present - draw 2.5D building
    draw25DBuilding(x, y, size, key, level, isHovered, isBuilding);
  }
}

// ========== CULTURE-SPECIFIC BUILDING STYLES ==========
const CULTURE_THEMES = {
  ROME: {
    name: 'Roman',
    stone: '#c9b896', stoneDark: '#a08060', stoneLight: '#e4d4b0',
    roof: '#c45a20', roofDark: '#8a3010', roofLight: '#d47030',
    accent: '#8b0000', trim: '#5a4010', wood: '#6a4a2a'
  },
  GAUL: {
    name: 'Gaulois',
    stone: '#8a7a5a', stoneDark: '#6a5a3a', stoneLight: '#a89a7a',
    roof: '#4a6a2a', roofDark: '#2a4a1a', roofLight: '#6a8a4a',
    accent: '#2a5a1a', trim: '#4a3a20', wood: '#5a4020'
  },
  GREEK: {
    name: 'Greek',
    stone: '#e8e0d0', stoneDark: '#c8c0b0', stoneLight: '#f8f0e0',
    roof: '#4a6a8a', roofDark: '#2a4a6a', roofLight: '#6a8aaa',
    accent: '#3a5a7a', trim: '#8a8070', wood: '#7a6a5a'
  },
  EGYPT: {
    name: 'Egyptian',
    stone: '#d4c4a0', stoneDark: '#b4a480', stoneLight: '#f4e4c0',
    roof: '#3a8a8a', roofDark: '#1a6a6a', roofLight: '#5aaaaa',
    accent: '#c9a227', trim: '#8a7040', wood: '#8a6a30'
  },
  HUN: {
    name: 'Hun',
    stone: '#7a6a5a', stoneDark: '#5a4a3a', stoneLight: '#9a8a7a',
    roof: '#6a4030', roofDark: '#4a2010', roofLight: '#8a5040',
    accent: '#8a2a10', trim: '#4a3020', wood: '#5a3a20'
  },
  SULTAN: {
    name: 'Sultanat',
    stone: '#e4d4b4', stoneDark: '#c4b494', stoneLight: '#f4e4d4',
    roof: '#2a6a5a', roofDark: '#1a4a3a', roofLight: '#4a8a7a',
    accent: '#c9a227', trim: '#6a5a40', wood: '#6a5030'
  }
};

function getCultureTheme() {
  const faction = player?.faction || 'ROME';
  return CULTURE_THEMES[faction] || CULTURE_THEMES.ROME;
}

// ========== TRAVIAN-STYLE BUILDING GRAPHICS ==========
function draw25DBuilding(x, y, size, key, level, isHovered, isBuilding) {
  const culture = getCultureTheme();

  // Detailed Travian-style building definitions with culture colors
  const buildingStyles = {
    MAIN_HALL: {
      base: culture.stoneDark, roof: culture.roof, roofType: 'dome',
      height: 2.0, windows: 4, hasColumns: true, hasFlag: true,
      wallColor: culture.stone, trimColor: culture.trim
    },
    BARRACKS: {
      base: culture.stoneDark, roof: culture.accent, roofType: 'pointed',
      height: 1.5, windows: 2, hasBanner: true, hasWeaponRack: true,
      wallColor: culture.stone, trimColor: culture.accent
    },
    STABLE: {
      base: culture.wood, roof: culture.roofDark, roofType: 'barn',
      height: 1.3, windows: 1, hasHorseshoe: true, hasDoors: true,
      wallColor: culture.stone, trimColor: culture.wood
    },
    WORKSHOP: {
      base: '#5a4a3a', roof: '#444444', roofType: 'flat',
      height: 1.5, windows: 2, hasChimney: true, hasGears: true,
      wallColor: '#6a5a4a', trimColor: '#333333'
    },
    ACADEMY: {
      base: culture.stoneLight, roof: culture.roof, roofType: 'temple',
      height: 1.7, windows: 3, hasColumns: true, hasScrolls: true,
      wallColor: culture.stoneLight, trimColor: culture.trim
    },
    FORGE: {
      base: '#4a3a2a', roof: '#2a2a2a', roofType: 'pointed',
      height: 1.4, windows: 1, hasChimney: true, hasAnvil: true,
      wallColor: '#5a4a3a', trimColor: '#1a1a1a'
    },
    MARKET: {
      base: culture.stone, roof: culture.accent, roofType: 'tent',
      height: 1.1, windows: 0, hasAwning: true, hasCrates: true,
      wallColor: culture.stoneLight, trimColor: culture.accent
    },
    WAREHOUSE: {
      base: culture.wood, roof: culture.roofDark, roofType: 'barn',
      height: 1.4, windows: 1, hasDoors: true, hasCrates: true,
      wallColor: culture.stone, trimColor: culture.wood
    },
    SILO: {
      base: culture.stone, roof: culture.roof, roofType: 'cone',
      height: 1.8, windows: 0, isRound: true, hasWheat: true,
      wallColor: culture.stoneLight, trimColor: culture.roofDark
    },
    WALL: {
      base: culture.stoneDark, roof: culture.stoneDark, roofType: 'crenelated',
      height: 1.3, windows: 0, hasTorches: true, isWall: true,
      wallColor: culture.stone, trimColor: culture.trim
    },
    HEALING_TENT: {
      base: '#f5f5e5', roof: '#ffffff', roofType: 'tent',
      height: 1.0, windows: 0, hasCross: true, isTent: true,
      wallColor: '#ffffff', trimColor: '#cc0000'
    },
    RALLY_POINT: {
      base: culture.stoneDark, roof: culture.accent, roofType: 'flag',
      height: 0.9, windows: 0, hasFlag: true, hasTorch: true,
      wallColor: culture.stone, trimColor: culture.accent
    },
    HIDEOUT: {
      base: '#4a3a2a', roof: '#3a3a2a', roofType: 'underground',
      height: 0.5, windows: 0, isUnderground: true,
      wallColor: '#5a4a3a', trimColor: '#2a2a1a'
    },
    MOAT: {
      base: '#4a7a9a', roof: '#3a6a8a', roofType: 'water',
      height: 0.2, windows: 0, isWater: true,
      wallColor: '#5a8aaa', trimColor: '#2a5a7a'
    },
    HERO_HOME: {
      base: culture.stoneLight, roof: culture.roof, roofType: 'temple',
      height: 1.6, windows: 2, hasColumns: true, hasStatue: true,
      wallColor: culture.stoneLight, trimColor: culture.trim
    },
    // ===== NOUVEAUX BÂTIMENTS (21) =====
    MILL: {
      base: culture.wood, roof: culture.roofDark, roofType: 'pointed',
      height: 1.8, windows: 1, hasWindmill: true,
      wallColor: culture.stone, trimColor: culture.wood
    },
    BAKERY: {
      base: culture.stone, roof: culture.roof, roofType: 'pointed',
      height: 1.3, windows: 2, hasChimney: true,
      wallColor: culture.stoneLight, trimColor: culture.trim
    },
    SAWMILL: {
      base: culture.wood, roof: culture.roofDark, roofType: 'barn',
      height: 1.2, windows: 1, hasDoors: true,
      wallColor: '#8B4513', trimColor: culture.wood
    },
    STONEMASON: {
      base: culture.stoneDark, roof: culture.roofDark, roofType: 'flat',
      height: 1.3, windows: 1, hasAnvil: true,
      wallColor: culture.stone, trimColor: '#555555'
    },
    FOUNDRY: {
      base: '#3a2a1a', roof: '#1a1a1a', roofType: 'pointed',
      height: 1.5, windows: 1, hasChimney: true, hasAnvil: true,
      wallColor: '#4a3a2a', trimColor: '#ff4400'
    },
    GREAT_SILO: {
      base: culture.stone, roof: culture.roof, roofType: 'dome',
      height: 2.0, windows: 0, isRound: true,
      wallColor: culture.stoneLight, trimColor: culture.trim
    },
    GREAT_WAREHOUSE: {
      base: culture.stoneDark, roof: culture.roofDark, roofType: 'barn',
      height: 1.6, windows: 2, hasDoors: true, hasCrates: true,
      wallColor: culture.stone, trimColor: culture.wood
    },
    GREAT_BARRACKS: {
      base: culture.stoneDark, roof: culture.accent, roofType: 'pointed',
      height: 1.7, windows: 3, hasBanner: true, hasWeaponRack: true,
      wallColor: culture.stone, trimColor: culture.accent
    },
    GREAT_STABLE: {
      base: culture.wood, roof: culture.roofDark, roofType: 'barn',
      height: 1.5, windows: 2, hasHorseshoe: true, hasDoors: true,
      wallColor: culture.stone, trimColor: culture.wood
    },
    WATCHTOWER: {
      base: culture.stoneDark, roof: culture.roof, roofType: 'pointed',
      height: 2.2, windows: 4, hasTorches: true, hasFlag: true,
      wallColor: culture.stone, trimColor: culture.trim
    },
    EMBASSY: {
      base: culture.stoneLight, roof: culture.accent, roofType: 'dome',
      height: 1.6, windows: 3, hasColumns: true, hasFlag: true,
      wallColor: culture.stoneLight, trimColor: culture.accent
    },
    TREASURE_CHAMBER: {
      base: '#4a3a1a', roof: '#ffd700', roofType: 'dome',
      height: 1.4, windows: 1, hasColumns: true,
      wallColor: '#5a4a2a', trimColor: '#ffd700'
    },
    HERO_MANSION: {
      base: culture.stoneLight, roof: culture.roof, roofType: 'temple',
      height: 1.8, windows: 3, hasColumns: true, hasStatue: true,
      wallColor: culture.stoneLight, trimColor: culture.trim
    },
    RESIDENCE: {
      base: culture.stone, roof: culture.roof, roofType: 'pointed',
      height: 1.5, windows: 3, hasColumns: true,
      wallColor: culture.stoneLight, trimColor: culture.trim
    },
    TRADE_OFFICE: {
      base: culture.stone, roof: culture.accent, roofType: 'tent',
      height: 1.3, windows: 2, hasAwning: true, hasCrates: true,
      wallColor: culture.stoneLight, trimColor: culture.accent
    },
    // Faction buildings
    ROMAN_THERMAE: {
      base: '#e8e0d0', roof: '#b8a090', roofType: 'dome',
      height: 1.4, windows: 2, hasColumns: true, isWater: true,
      wallColor: '#f0e8e0', trimColor: '#8b7355'
    },
    GALLIC_BREWERY: {
      base: culture.wood, roof: '#8B4513', roofType: 'barn',
      height: 1.4, windows: 1, hasChimney: true, hasDoors: true,
      wallColor: '#a08060', trimColor: culture.wood
    },
    GREEK_TEMPLE: {
      base: '#f5f5f5', roof: '#e0d8c8', roofType: 'temple',
      height: 1.8, windows: 0, hasColumns: true,
      wallColor: '#ffffff', trimColor: '#d4af37'
    },
    EGYPTIAN_IRRIGATION: {
      base: '#c9b896', roof: '#a08b6e', roofType: 'flat',
      height: 1.0, windows: 0, isWater: true,
      wallColor: '#d4c4a8', trimColor: '#8b7355'
    },
    HUN_WAR_TENT: {
      base: '#8b7355', roof: '#6b5344', roofType: 'tent',
      height: 1.2, windows: 0, isTent: true, hasFlag: true,
      wallColor: '#9b8365', trimColor: '#5b4334'
    },
    SULTAN_DESERT_OUTPOST: {
      base: '#d4b896', roof: '#c4a886', roofType: 'dome',
      height: 1.4, windows: 2, hasFlag: true,
      wallColor: '#e4c8a6', trimColor: '#8b7355'
    }
  };

  const style = buildingStyles[key] || {
    base: '#a08060', roof: '#6b4423', roofType: 'pointed',
    height: 1.2, windows: 1, wallColor: '#b09070', trimColor: '#5b3413'
  };

  const bh = size * style.height;
  const bw = size * 0.55;

  // ========== HOVER EFFECT (Travian-style golden glow) ==========
  if (isHovered) {
    // Outer glow
    cityCtx.shadowColor = '#ffd700';
    cityCtx.shadowBlur = 30;
    cityCtx.fillStyle = 'rgba(255,215,0,0.15)';
    cityCtx.beginPath();
    cityCtx.ellipse(x, y, bw + 10, (bw + 10) * 0.55, 0, 0, Math.PI * 2);
    cityCtx.fill();
    cityCtx.shadowBlur = 0;
  }

  // ========== CONSTRUCTION ANIMATION ==========
  if (isBuilding) {
    cityCtx.globalAlpha = 0.6 + Math.sin(Date.now() / 150) * 0.2;
  }

  // ========== SHADOW ==========
  cityCtx.fillStyle = 'rgba(0,0,0,0.4)';
  cityCtx.beginPath();
  cityCtx.ellipse(x + 5, y + 8, bw * 0.9, bw * 0.45, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // ========== BASE PLATFORM ==========
  cityCtx.fillStyle = '#6a5a4a';
  cityCtx.beginPath();
  cityCtx.ellipse(x, y + 3, bw + 5, (bw + 5) * 0.5, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Draw building based on type
  if (style.isWater) {
    drawWaterBuilding(x, y, bw, style);
  } else if (style.isUnderground) {
    drawUndergroundBuilding(x, y, bw, style);
  } else if (style.isTent) {
    drawTentBuilding(x, y, bw, bh, style);
  } else if (style.isRound) {
    drawRoundBuilding(x, y, bw, bh, style, level);
  } else if (style.isWall) {
    drawWallBuilding(x, y, bw, bh, style, level);
  } else {
    drawStandardBuilding(x, y, bw, bh, style, key, level);
  }

  cityCtx.globalAlpha = 1;

  // ========== LEVEL BADGE (Travian-style) ==========
  if (level > 0) {
    drawTravianLevelBadge(x, y, bw, bh, level, isHovered);
  }

  // ========== CONSTRUCTION INDICATOR ==========
  if (isBuilding) {
    const hammerY = y - bh - 15;
    cityCtx.fillStyle = '#ffa500';
    cityCtx.font = 'bold 18px Arial';
    cityCtx.textAlign = 'center';
    cityCtx.fillText('⚒️', x, hammerY + Math.sin(Date.now() / 200) * 3);
  }
}

// ========== TRAVIAN-STYLE STANDARD BUILDING ==========
function drawStandardBuilding(x, y, bw, bh, style, key, level) {
  // Foundation
  cityCtx.fillStyle = style.base;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, bw, bw * 0.5, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Left wall (lit side)
  const wallGrad = cityCtx.createLinearGradient(x - bw, y, x, y);
  wallGrad.addColorStop(0, style.wallColor);
  wallGrad.addColorStop(1, shadeColor(style.wallColor, -15));
  cityCtx.fillStyle = wallGrad;
  cityCtx.beginPath();
  cityCtx.moveTo(x - bw, y);
  cityCtx.lineTo(x - bw * 0.9, y - bh);
  cityCtx.lineTo(x, y - bh - bw * 0.2);
  cityCtx.lineTo(x, y - bw * 0.5);
  cityCtx.closePath();
  cityCtx.fill();

  // Right wall (shadow side)
  cityCtx.fillStyle = shadeColor(style.wallColor, -30);
  cityCtx.beginPath();
  cityCtx.moveTo(x + bw, y);
  cityCtx.lineTo(x + bw * 0.9, y - bh);
  cityCtx.lineTo(x, y - bh - bw * 0.2);
  cityCtx.lineTo(x, y - bw * 0.5);
  cityCtx.closePath();
  cityCtx.fill();

  // Wall details (stones/bricks pattern)
  drawWallPattern(x, y, bw, bh, style);

  // Windows
  if (style.windows > 0) {
    drawWindows(x, y, bw, bh, style.windows);
  }

  // Door
  drawDoor(x, y, bw);

  // Roof based on type
  drawRoof(x, y, bw, bh, style);

  // Columns for temple/academy
  if (style.hasColumns) {
    drawColumns(x, y, bw, bh);
  }

  // Chimney
  if (style.hasChimney) {
    drawChimney(x, y, bw, bh);
  }

  // Flag
  if (style.hasFlag) {
    drawBuildingFlag(x, y, bw, bh, key);
  }

  // Decorative elements
  if (style.hasAnvil) drawAnvil(x, y, bw);
  if (style.hasGears) drawGears(x, y, bw, bh);
  if (style.hasWeaponRack) drawWeaponRack(x, y, bw);
  if (style.hasCrates) drawCrates(x, y, bw);
  if (style.hasStatue) drawStatue(x, y, bw, bh);
}

// ========== WALL PATTERN ==========
function drawWallPattern(x, y, bw, bh, style) {
  cityCtx.strokeStyle = shadeColor(style.wallColor, -20);
  cityCtx.lineWidth = 0.5;

  // Horizontal lines (brick rows)
  for (let i = 1; i < 5; i++) {
    const rowY = y - (bh * i / 5);
    cityCtx.beginPath();
    cityCtx.moveTo(x - bw * 0.85 + (i * 2), rowY);
    cityCtx.lineTo(x, rowY - bw * 0.1);
    cityCtx.stroke();
  }
}

// ========== WINDOWS ==========
function drawWindows(x, y, bw, bh, count) {
  const winW = bw * 0.15;
  const winH = bh * 0.12;
  const nightMode = isNightMode();

  for (let i = 0; i < count; i++) {
    const winX = x - bw * 0.4 + (i % 2) * bw * 0.3;
    const winY = y - bh * 0.5 - Math.floor(i / 2) * bh * 0.25;

    // Night mode: warm glow around window
    if (nightMode) {
      const glowGrad = cityCtx.createRadialGradient(winX, winY, 0, winX, winY, winW * 2);
      glowGrad.addColorStop(0, 'rgba(255, 200, 100, 0.4)');
      glowGrad.addColorStop(0.5, 'rgba(255, 180, 80, 0.2)');
      glowGrad.addColorStop(1, 'rgba(255, 150, 50, 0)');
      cityCtx.fillStyle = glowGrad;
      cityCtx.beginPath();
      cityCtx.arc(winX, winY, winW * 2, 0, Math.PI * 2);
      cityCtx.fill();
    }

    // Window frame
    cityCtx.fillStyle = nightMode ? '#1a1510' : '#3a2a1a';
    cityCtx.fillRect(winX - winW / 2 - 1, winY - winH / 2 - 1, winW + 2, winH + 2);

    // Window glass
    if (nightMode) {
      // Warm candlelight at night
      const glassGrad = cityCtx.createLinearGradient(winX, winY - winH / 2, winX, winY + winH / 2);
      glassGrad.addColorStop(0, '#ffcc66');
      glassGrad.addColorStop(0.5, '#ffaa33');
      glassGrad.addColorStop(1, '#ff8800');
      cityCtx.fillStyle = glassGrad;
    } else {
      // Daytime reflections
      const glassGrad = cityCtx.createLinearGradient(winX, winY - winH / 2, winX, winY + winH / 2);
      glassGrad.addColorStop(0, '#87ceeb');
      glassGrad.addColorStop(0.5, '#ffd700');
      glassGrad.addColorStop(1, '#4682b4');
      cityCtx.fillStyle = glassGrad;
    }
    cityCtx.fillRect(winX - winW / 2, winY - winH / 2, winW, winH);

    // Window cross
    cityCtx.strokeStyle = nightMode ? '#1a1008' : '#2a1a0a';
    cityCtx.lineWidth = 1;
    cityCtx.beginPath();
    cityCtx.moveTo(winX, winY - winH / 2);
    cityCtx.lineTo(winX, winY + winH / 2);
    cityCtx.moveTo(winX - winW / 2, winY);
    cityCtx.lineTo(winX + winW / 2, winY);
    cityCtx.stroke();
  }
}

// ========== DOOR ==========
function drawDoor(x, y, bw) {
  const doorW = bw * 0.25;
  const doorH = bw * 0.35;
  const doorX = x;
  const doorY = y - bw * 0.3;

  // Door frame
  cityCtx.fillStyle = '#3a2a1a';
  cityCtx.beginPath();
  cityCtx.moveTo(doorX - doorW / 2 - 2, doorY + 2);
  cityCtx.lineTo(doorX - doorW / 2 - 2, doorY - doorH);
  cityCtx.arc(doorX, doorY - doorH, doorW / 2 + 2, Math.PI, 0, false);
  cityCtx.lineTo(doorX + doorW / 2 + 2, doorY + 2);
  cityCtx.closePath();
  cityCtx.fill();

  // Door wood
  cityCtx.fillStyle = '#6b4423';
  cityCtx.beginPath();
  cityCtx.moveTo(doorX - doorW / 2, doorY);
  cityCtx.lineTo(doorX - doorW / 2, doorY - doorH);
  cityCtx.arc(doorX, doorY - doorH, doorW / 2, Math.PI, 0, false);
  cityCtx.lineTo(doorX + doorW / 2, doorY);
  cityCtx.closePath();
  cityCtx.fill();

  // Door handle
  cityCtx.fillStyle = '#ffd700';
  cityCtx.beginPath();
  cityCtx.arc(doorX + doorW * 0.25, doorY - doorH * 0.4, 2, 0, Math.PI * 2);
  cityCtx.fill();
}

// ========== ROOF TYPES ==========
function drawRoof(x, y, bw, bh, style) {
  const roofY = y - bh;

  switch (style.roofType) {
    case 'pointed':
      // Triangular roof
      cityCtx.fillStyle = style.roof;
      cityCtx.beginPath();
      cityCtx.moveTo(x, roofY - bw * 0.6);
      cityCtx.lineTo(x - bw * 1.1, roofY + bw * 0.15);
      cityCtx.lineTo(x + bw * 1.1, roofY + bw * 0.15);
      cityCtx.closePath();
      cityCtx.fill();

      // Roof shadow
      cityCtx.fillStyle = shadeColor(style.roof, -25);
      cityCtx.beginPath();
      cityCtx.moveTo(x, roofY - bw * 0.6);
      cityCtx.lineTo(x + bw * 1.1, roofY + bw * 0.15);
      cityCtx.lineTo(x, roofY + bw * 0.05);
      cityCtx.closePath();
      cityCtx.fill();
      break;

    case 'dome':
      // Domed roof
      cityCtx.fillStyle = style.roof;
      cityCtx.beginPath();
      cityCtx.ellipse(x, roofY, bw, bw * 0.5, 0, 0, Math.PI * 2);
      cityCtx.fill();

      cityCtx.fillStyle = shadeColor(style.roof, 15);
      cityCtx.beginPath();
      cityCtx.arc(x, roofY - bw * 0.2, bw * 0.6, Math.PI, 0, false);
      cityCtx.closePath();
      cityCtx.fill();

      // Dome pinnacle
      cityCtx.fillStyle = '#ffd700';
      cityCtx.beginPath();
      cityCtx.arc(x, roofY - bw * 0.5, 4, 0, Math.PI * 2);
      cityCtx.fill();
      break;

    case 'temple':
      // Greek temple roof
      cityCtx.fillStyle = style.roof;
      cityCtx.beginPath();
      cityCtx.moveTo(x, roofY - bw * 0.5);
      cityCtx.lineTo(x - bw * 1.2, roofY + bw * 0.1);
      cityCtx.lineTo(x + bw * 1.2, roofY + bw * 0.1);
      cityCtx.closePath();
      cityCtx.fill();

      // Pediment (triangular facade)
      cityCtx.fillStyle = '#f5f0e5';
      cityCtx.beginPath();
      cityCtx.moveTo(x, roofY - bw * 0.35);
      cityCtx.lineTo(x - bw * 0.8, roofY + bw * 0.05);
      cityCtx.lineTo(x + bw * 0.8, roofY + bw * 0.05);
      cityCtx.closePath();
      cityCtx.fill();
      break;

    case 'barn':
      // Gambrel/barn roof
      cityCtx.fillStyle = style.roof;
      cityCtx.beginPath();
      cityCtx.moveTo(x, roofY - bw * 0.4);
      cityCtx.lineTo(x - bw * 0.6, roofY);
      cityCtx.lineTo(x - bw * 1.0, roofY + bw * 0.2);
      cityCtx.lineTo(x + bw * 1.0, roofY + bw * 0.2);
      cityCtx.lineTo(x + bw * 0.6, roofY);
      cityCtx.closePath();
      cityCtx.fill();
      break;

    case 'flat':
      // Flat roof
      cityCtx.fillStyle = style.roof;
      cityCtx.beginPath();
      cityCtx.ellipse(x, roofY, bw * 1.05, bw * 0.55, 0, 0, Math.PI * 2);
      cityCtx.fill();
      break;

    case 'tent':
      // Tent/awning roof
      cityCtx.fillStyle = style.roof;
      cityCtx.beginPath();
      cityCtx.moveTo(x, roofY - bw * 0.5);
      cityCtx.quadraticCurveTo(x - bw * 0.5, roofY - bw * 0.2, x - bw * 1.2, roofY + bw * 0.2);
      cityCtx.lineTo(x + bw * 1.2, roofY + bw * 0.2);
      cityCtx.quadraticCurveTo(x + bw * 0.5, roofY - bw * 0.2, x, roofY - bw * 0.5);
      cityCtx.closePath();
      cityCtx.fill();

      // Stripes
      cityCtx.strokeStyle = shadeColor(style.roof, -30);
      cityCtx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        cityCtx.beginPath();
        const sx = x - bw * 0.8 + i * bw * 0.4;
        cityCtx.moveTo(sx, roofY + bw * 0.15);
        cityCtx.lineTo(x, roofY - bw * 0.45);
        cityCtx.stroke();
      }
      break;

    case 'cone':
      // Conical roof (silo)
      cityCtx.fillStyle = style.roof;
      cityCtx.beginPath();
      cityCtx.moveTo(x, roofY - bw * 0.7);
      cityCtx.lineTo(x - bw * 0.7, roofY + bw * 0.1);
      cityCtx.arc(x, roofY + bw * 0.1, bw * 0.7, Math.PI, 0, false);
      cityCtx.closePath();
      cityCtx.fill();
      break;

    case 'crenelated':
      // Castle wall crenelations
      cityCtx.fillStyle = style.roof;
      for (let i = 0; i < 5; i++) {
        const cx = x - bw * 0.8 + i * bw * 0.4;
        cityCtx.fillRect(cx - 4, roofY - 8, 8, 12);
      }
      break;
  }
}

// ========== COLUMNS ==========
function drawColumns(x, y, bw, bh) {
  const colW = bw * 0.08;
  const positions = [-0.6, -0.3, 0.3, 0.6];

  positions.forEach(pos => {
    const colX = x + bw * pos;

    // Column base
    cityCtx.fillStyle = '#d4c4b4';
    cityCtx.fillRect(colX - colW * 1.2, y - bw * 0.35, colW * 2.4, 6);

    // Column shaft
    const colGrad = cityCtx.createLinearGradient(colX - colW, 0, colX + colW, 0);
    colGrad.addColorStop(0, '#f0e8e0');
    colGrad.addColorStop(0.5, '#ffffff');
    colGrad.addColorStop(1, '#d4c4b4');
    cityCtx.fillStyle = colGrad;
    cityCtx.fillRect(colX - colW, y - bh * 0.85, colW * 2, bh * 0.55);

    // Column capital
    cityCtx.fillStyle = '#d4c4b4';
    cityCtx.fillRect(colX - colW * 1.3, y - bh * 0.85 - 4, colW * 2.6, 6);
  });
}

// ========== CHIMNEY ==========
function drawChimney(x, y, bw, bh) {
  const chimX = x + bw * 0.3;
  const chimY = y - bh - bw * 0.2;

  // Chimney body
  cityCtx.fillStyle = '#6a5a4a';
  cityCtx.fillRect(chimX - 6, chimY - 20, 12, 25);

  // Chimney top
  cityCtx.fillStyle = '#5a4a3a';
  cityCtx.fillRect(chimX - 8, chimY - 22, 16, 5);

  // Smoke
  const time = Date.now() / 1000;
  cityCtx.fillStyle = 'rgba(150,150,150,0.5)';
  for (let i = 0; i < 3; i++) {
    const smokeY = chimY - 30 - i * 12 - Math.sin(time * 2 + i) * 5;
    const smokeX = chimX + Math.sin(time * 1.5 + i * 2) * 8;
    cityCtx.beginPath();
    cityCtx.arc(smokeX, smokeY, 5 + i * 2, 0, Math.PI * 2);
    cityCtx.fill();
  }
}

// ========== BUILDING FLAG ==========
function drawBuildingFlag(x, y, bw, bh, key) {
  const flagX = x;
  const flagY = y - bh - bw * 0.5;

  // Pole
  cityCtx.strokeStyle = '#4a3a2a';
  cityCtx.lineWidth = 3;
  cityCtx.beginPath();
  cityCtx.moveTo(flagX, flagY + 15);
  cityCtx.lineTo(flagX, flagY - 15);
  cityCtx.stroke();

  // Flag
  const time = Date.now() / 1000;
  const wave = Math.sin(time * 3) * 2;
  cityCtx.fillStyle = key === 'MAIN_HALL' ? '#ffd700' : '#c44';
  cityCtx.beginPath();
  cityCtx.moveTo(flagX, flagY - 15);
  cityCtx.quadraticCurveTo(flagX + 10 + wave, flagY - 10, flagX + 15, flagY - 8 + wave);
  cityCtx.quadraticCurveTo(flagX + 10 + wave, flagY - 3, flagX, flagY - 3);
  cityCtx.closePath();
  cityCtx.fill();
}

// ========== DECORATIVE ELEMENTS ==========
function drawAnvil(x, y, bw) {
  cityCtx.fillStyle = '#333';
  cityCtx.fillRect(x + bw * 0.5, y - 8, 15, 8);
  cityCtx.fillRect(x + bw * 0.5 - 3, y - 12, 21, 5);
}

function drawGears(x, y, bw, bh) {
  const time = Date.now() / 1000;
  cityCtx.save();
  cityCtx.translate(x - bw * 0.7, y - bh * 0.6);
  cityCtx.rotate(time);
  cityCtx.fillStyle = '#666';
  for (let i = 0; i < 6; i++) {
    cityCtx.fillRect(-8, -2, 16, 4);
    cityCtx.rotate(Math.PI / 3);
  }
  cityCtx.beginPath();
  cityCtx.arc(0, 0, 5, 0, Math.PI * 2);
  cityCtx.fill();
  cityCtx.restore();
}

function drawWeaponRack(x, y, bw) {
  // Swords
  cityCtx.strokeStyle = '#888';
  cityCtx.lineWidth = 2;
  cityCtx.beginPath();
  cityCtx.moveTo(x + bw * 0.6, y - 5);
  cityCtx.lineTo(x + bw * 0.6, y - 20);
  cityCtx.moveTo(x + bw * 0.75, y - 5);
  cityCtx.lineTo(x + bw * 0.75, y - 18);
  cityCtx.stroke();
}

function drawCrates(x, y, bw) {
  cityCtx.fillStyle = '#8b7355';
  cityCtx.fillRect(x + bw * 0.5, y - 10, 12, 10);
  cityCtx.fillStyle = '#7a6345';
  cityCtx.fillRect(x + bw * 0.6, y - 18, 10, 8);
}

function drawStatue(x, y, bw, bh) {
  // Small hero statue
  cityCtx.fillStyle = '#c9a86c';
  cityCtx.fillRect(x - bw * 0.7 - 5, y - 8, 10, 8);
  cityCtx.fillStyle = '#d4b896';
  cityCtx.beginPath();
  cityCtx.arc(x - bw * 0.7, y - 20, 6, 0, Math.PI * 2);
  cityCtx.fill();
  cityCtx.fillRect(x - bw * 0.7 - 4, y - 16, 8, 12);
}

// ========== SPECIAL BUILDING TYPES ==========
function drawRoundBuilding(x, y, bw, bh, style, level) {
  // Silo-style round building
  cityCtx.fillStyle = style.base;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, bw * 0.8, bw * 0.4, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Cylindrical body
  const bodyGrad = cityCtx.createLinearGradient(x - bw * 0.8, 0, x + bw * 0.8, 0);
  bodyGrad.addColorStop(0, style.wallColor);
  bodyGrad.addColorStop(0.3, shadeColor(style.wallColor, 20));
  bodyGrad.addColorStop(0.7, shadeColor(style.wallColor, -10));
  bodyGrad.addColorStop(1, shadeColor(style.wallColor, -30));
  cityCtx.fillStyle = bodyGrad;
  cityCtx.beginPath();
  cityCtx.moveTo(x - bw * 0.8, y);
  cityCtx.lineTo(x - bw * 0.8, y - bh);
  cityCtx.ellipse(x, y - bh, bw * 0.8, bw * 0.4, 0, Math.PI, 0, true);
  cityCtx.lineTo(x + bw * 0.8, y);
  cityCtx.closePath();
  cityCtx.fill();

  // Conical roof
  cityCtx.fillStyle = style.roof;
  cityCtx.beginPath();
  cityCtx.moveTo(x, y - bh - bw * 0.8);
  cityCtx.lineTo(x - bw * 0.9, y - bh + bw * 0.1);
  cityCtx.ellipse(x, y - bh, bw * 0.9, bw * 0.45, 0, Math.PI, 0, false);
  cityCtx.closePath();
  cityCtx.fill();

  // Wheat decoration
  if (style.hasWheat) {
    cityCtx.fillStyle = '#daa520';
    cityCtx.font = '14px Arial';
    cityCtx.fillText('🌾', x, y - bh * 0.5);
  }
}

function drawWallBuilding(x, y, bw, bh, style, level) {
  // Wall segment
  cityCtx.fillStyle = style.wallColor;
  cityCtx.fillRect(x - bw * 0.8, y - bh, bw * 1.6, bh);

  // Stone texture
  cityCtx.strokeStyle = shadeColor(style.wallColor, -15);
  cityCtx.lineWidth = 1;
  for (let row = 0; row < 4; row++) {
    const rowY = y - row * (bh / 4);
    for (let col = 0; col < 3; col++) {
      const stoneX = x - bw * 0.7 + col * bw * 0.5 + (row % 2) * bw * 0.25;
      cityCtx.strokeRect(stoneX, rowY - bh / 4, bw * 0.45, bh / 4.5);
    }
  }

  // Crenellations
  for (let i = 0; i < 5; i++) {
    const cx = x - bw * 0.6 + i * bw * 0.3;
    cityCtx.fillStyle = style.wallColor;
    cityCtx.fillRect(cx - 5, y - bh - 10, 10, 12);
  }

  // Torches
  if (style.hasTorches && level >= 5) {
    const time = Date.now() / 1000;
    [-0.5, 0.5].forEach(pos => {
      const tx = x + bw * pos;
      cityCtx.fillStyle = '#4a3a2a';
      cityCtx.fillRect(tx - 2, y - bh * 0.7, 4, 15);
      cityCtx.fillStyle = `rgba(255,${150 + Math.sin(time * 10) * 50},0,0.8)`;
      cityCtx.beginPath();
      cityCtx.arc(tx, y - bh * 0.75, 5 + Math.sin(time * 8) * 2, 0, Math.PI * 2);
      cityCtx.fill();
    });
  }
}

function drawTentBuilding(x, y, bw, bh, style) {
  // Tent fabric
  cityCtx.fillStyle = style.wallColor;
  cityCtx.beginPath();
  cityCtx.moveTo(x, y - bh - bw * 0.3);
  cityCtx.quadraticCurveTo(x - bw * 0.5, y - bh * 0.3, x - bw, y);
  cityCtx.lineTo(x + bw, y);
  cityCtx.quadraticCurveTo(x + bw * 0.5, y - bh * 0.3, x, y - bh - bw * 0.3);
  cityCtx.closePath();
  cityCtx.fill();

  // Tent pole
  cityCtx.strokeStyle = '#5a4a3a';
  cityCtx.lineWidth = 4;
  cityCtx.beginPath();
  cityCtx.moveTo(x, y);
  cityCtx.lineTo(x, y - bh - bw * 0.3);
  cityCtx.stroke();

  // Cross (healing tent)
  if (style.hasCross) {
    cityCtx.fillStyle = '#cc0000';
    cityCtx.fillRect(x - 8, y - bh * 0.6 - 3, 16, 6);
    cityCtx.fillRect(x - 3, y - bh * 0.6 - 8, 6, 16);
  }
}

function drawUndergroundBuilding(x, y, bw, style) {
  // Trapdoor/underground entrance
  cityCtx.fillStyle = '#3a3a2a';
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, bw * 0.6, bw * 0.35, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Dark hole
  cityCtx.fillStyle = '#1a1a1a';
  cityCtx.beginPath();
  cityCtx.ellipse(x, y - 3, bw * 0.45, bw * 0.25, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Wooden trapdoor edge
  cityCtx.strokeStyle = '#5a4a3a';
  cityCtx.lineWidth = 3;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, bw * 0.6, bw * 0.35, 0, 0, Math.PI * 2);
  cityCtx.stroke();
}

function drawWaterBuilding(x, y, bw, style) {
  // Moat/water feature
  const time = Date.now() / 1000;
  cityCtx.fillStyle = style.wallColor;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, bw * 0.8, bw * 0.45, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Water shine
  cityCtx.fillStyle = 'rgba(255,255,255,0.3)';
  cityCtx.beginPath();
  cityCtx.ellipse(x - bw * 0.2, y - bw * 0.1, bw * 0.2, bw * 0.1, -0.3, 0, Math.PI * 2);
  cityCtx.fill();

  // Ripples
  cityCtx.strokeStyle = 'rgba(255,255,255,0.4)';
  cityCtx.lineWidth = 1;
  for (let i = 0; i < 2; i++) {
    const rippleSize = (time * 0.5 + i * 0.5) % 1;
    cityCtx.beginPath();
    cityCtx.ellipse(x, y, bw * 0.3 * (1 + rippleSize), bw * 0.15 * (1 + rippleSize), 0, 0, Math.PI * 2);
    cityCtx.stroke();
  }
}

// ========== TRAVIAN-STYLE LEVEL BADGE ==========
function drawTravianLevelBadge(x, y, bw, bh, level, isHovered, canUpgrade = true) {
  const badgeX = x + bw * 0.6;
  const badgeY = y - bh * 0.3;
  const badgeRadius = 12;

  // Travian Legends style: blue circle with white text (like screenshot)
  const bgColor = isHovered ? '#4a9ad8' : '#3a8ac8';

  // Badge shadow
  cityCtx.fillStyle = 'rgba(0,0,0,0.5)';
  cityCtx.beginPath();
  cityCtx.arc(badgeX + 1, badgeY + 2, badgeRadius + 1, 0, Math.PI * 2);
  cityCtx.fill();

  // Badge background (Travian blue circle)
  const badgeGrad = cityCtx.createRadialGradient(badgeX - 2, badgeY - 2, 0, badgeX, badgeY, badgeRadius);
  badgeGrad.addColorStop(0, isHovered ? '#6ab8f0' : '#5aa8e0');
  badgeGrad.addColorStop(0.6, bgColor);
  badgeGrad.addColorStop(1, '#2a6aa0');
  cityCtx.fillStyle = badgeGrad;
  cityCtx.beginPath();
  cityCtx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
  cityCtx.fill();

  // Badge border (white like Travian)
  cityCtx.strokeStyle = isHovered ? '#ffffff' : 'rgba(255,255,255,0.8)';
  cityCtx.lineWidth = 2;
  cityCtx.stroke();

  // Inner highlight (shine)
  cityCtx.strokeStyle = 'rgba(255,255,255,0.4)';
  cityCtx.lineWidth = 1;
  cityCtx.beginPath();
  cityCtx.arc(badgeX, badgeY, badgeRadius - 3, Math.PI * 1.1, Math.PI * 1.9);
  cityCtx.stroke();

  // Level number (white, bold)
  cityCtx.fillStyle = '#ffffff';
  cityCtx.font = `bold ${level >= 10 ? 11 : 13}px Arial, sans-serif`;
  cityCtx.textAlign = 'center';
  cityCtx.textBaseline = 'middle';
  cityCtx.fillText(level.toString(), badgeX, badgeY + 1);
}

function shadeColor(color, percent) {
  const num = parseInt(color.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.max(0, Math.min(255, (num >> 16) + amt));
  const G = Math.max(0, Math.min(255, ((num >> 8) & 0x00FF) + amt));
  const B = Math.max(0, Math.min(255, (num & 0x0000FF) + amt));
  return `#${(0x1000000 + R * 0x10000 + G * 0x100 + B).toString(16).slice(1)}`;
}

function getBuildingAtSlot(slotNum) {
  return currentCity?.buildings?.find(b => b.slot === slotNum);
}

function onCityMouseMove(e) {
  const rect = cityCanvas.getBoundingClientRect();
  const mouseX = (e.clientX - rect.left) * (cityCanvas.width / rect.width);
  const mouseY = (e.clientY - rect.top) * (cityCanvas.height / rect.height);

  // Find hovered slot - correct ellipse collision detection
  let foundSlot = null;
  for (const slot of citySlots) {
    const dx = mouseX - slot.x;
    const dy = mouseY - slot.y;
    // Ellipse formula: (dx/rx)^2 + (dy/ry)^2 <= 1
    const rx = slot.size * 0.6;  // Rayon horizontal
    const ry = slot.size * 0.35; // Rayon vertical (ellipse aplatie)
    const normalizedDist = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);

    if (normalizedDist <= 1) {
      foundSlot = slot.slot;
      break;
    }
  }
  
  if (foundSlot !== cityHoveredSlot) {
    cityHoveredSlot = foundSlot;
    renderCityCanvas();

    // Curseur pointer dynamique
    cityCanvas.style.cursor = foundSlot !== null ? 'pointer' : 'default';

    if (foundSlot !== null) {
      showCityTooltip(e.clientX, e.clientY, foundSlot);
    } else {
      hideCityTooltip();
    }
  } else if (foundSlot !== null) {
    // Mettre à jour la position du tooltip même si le slot n'a pas changé
    const tooltip = document.getElementById('city-tooltip');
    if (tooltip && tooltip.style.display !== 'none') {
      const canvasRect = cityCanvas.parentElement.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      let left = e.clientX - canvasRect.left + 10;
      let top = e.clientY - canvasRect.top + 20;
      if (left + tooltipRect.width > canvasRect.width - 10) {
        left = e.clientX - canvasRect.left - tooltipRect.width - 10;
      }
      if (top + tooltipRect.height > canvasRect.height - 10) {
        top = e.clientY - canvasRect.top - tooltipRect.height - 20;
      }
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }
  }
}

// Animation de clic (ripple effect)
function showClickRipple(x, y) {
  const ripple = document.createElement('div');
  ripple.className = 'click-ripple';
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  cityCanvas.parentElement.appendChild(ripple);
  setTimeout(() => ripple.remove(), 500);
}

function onCityClick(e) {
  if (!currentCity) return; // Guard: city data not loaded yet
  if (cityHoveredSlot !== null) {
    // Feedback visuel de clic
    const canvasRect = cityCanvas.getBoundingClientRect();
    showClickRipple(e.clientX - canvasRect.left, e.clientY - canvasRect.top);

    if (currentCityView === 'fields') {
      // Vue champs
      if (cityHoveredSlot === -1) {
        // Clic sur le centre village -> retour vue ville
        switchCityView('city');
      } else {
        // Clic sur un champ -> ouvrir panel construction champ
        openFieldBuildPanel(cityHoveredSlot);
      }
    } else {
      // Vue ville -> ouvrir panel construction normal
      openBuildPanel(cityHoveredSlot);
    }
  }
}

function showCityTooltip(mouseX, mouseY, slotNum) {
  const tooltip = document.getElementById('city-tooltip');
  if (!tooltip) return;

  const slot = citySlots.find(s => s.slot === slotNum);

  let html = '';

  if (currentCityView === 'fields') {
    // Vue champs - style Travian
    if (slot?.isVillageCenter) {
      html = `
        <h4><span class="tt-icon">🏰</span> Centre du Village</h4>
        <p class="tt-hint">Cliquez pour voir les bâtiments</p>
      `;
    } else if (slot?.isField) {
      const fieldIcons = {
        FARM: '🌾',
        LUMBER: '🪵',
        QUARRY: '🪨',
        IRON_MINE: '⛏️'
      };
      const fieldNames = {
        FARM: 'Champ de blé',
        LUMBER: 'Scierie',
        QUARRY: 'Carrière de pierre',
        IRON_MINE: 'Mine de fer'
      };
      const building = getFieldBuildingAtSlot(slot.slot, slot.fieldType);
      const level = building?.level || 0;
      const production = building?.prodPerHour || 0;
      const cvMainHall = currentCity?.buildings?.find(b => b.key === 'MAIN_HALL');
      const cvMainHallLevel = cvMainHall?.level || 1;
      const cvFieldDef = buildingsData?.find(b => b.key === slot.fieldType);
      const cvFieldMax = cvFieldDef?.maxLevel || 20;
      const cvEffectiveMax = Math.min(cvFieldMax, cvMainHallLevel);

      html = `
        <h4><span class="tt-icon">${fieldIcons[slot.fieldType] || '🏭'}</span> ${fieldNames[slot.fieldType] || 'Ressource'}</h4>
        <p class="tt-level">Niveau ${level}/${cvEffectiveMax}</p>
        ${production > 0 ? `<p class="tt-production">+${formatNum(production)} par heure</p>` : ''}
        <p class="tt-hint">${level === 0 ? 'Cliquez pour construire' : level >= cvEffectiveMax ? (level >= cvFieldMax ? 'Niveau maximum atteint' : `Limité par Bât. principal (Niv.${cvMainHallLevel})`) : 'Cliquez pour améliorer'}</p>
      `;
    }
  } else {
    // Vue ville - style Travian
    const building = getBuildingAtSlot(slotNum);

    if (building) {
      const def = buildingsData?.find(b => b.key === building.key);
      const maxLevel = def?.maxLevel || 20;
      const ttMainHall = currentCity?.buildings?.find(b => b.key === 'MAIN_HALL');
      const ttMainHallLevel = ttMainHall?.level || 1;
      const ttEffectiveMax = building.key === 'MAIN_HALL' ? maxLevel : Math.min(maxLevel, ttMainHallLevel);
      const production = building.prodPerHour || 0;
      const effect = getBuildingEffect(building.key, building.level);

      html = `
        <h4><span class="tt-icon">${BUILDING_ICONS[building.key] || '🏠'}</span> ${getBuildingName(building.key)}</h4>
        <p class="tt-level">Niveau ${building.level}/${ttEffectiveMax}</p>
        ${production > 0 ? `<p class="tt-production">+${formatNum(production)} par heure</p>` : ''}
        ${effect ? `<div class="tt-stats"><span class="tt-stat">${effect}</span></div>` : ''}
        <p class="tt-hint">${building.level < ttEffectiveMax ? 'Cliquez pour améliorer' : building.level >= maxLevel ? 'Niveau maximum atteint' : `Limité par Bât. principal (Niv.${ttMainHallLevel})`}</p>
      `;
    } else if (slot?.fixed) {
      const mainHall = getBuildingAtSlot(0);
      const level = mainHall?.level || 1;
      html = `
        <h4><span class="tt-icon">🏛️</span> Bâtiment principal</h4>
        <p class="tt-level">Niveau ${level}/30</p>
        <div class="tt-stats">
          <span class="tt-stat">Réduction construction: <span class="tt-stat-value">${(level * 2.5).toFixed(1)}%</span></span>
        </div>
        <p class="tt-hint">Cliquez pour améliorer</p>
      `;
    } else {
      html = `
        <h4><span class="tt-icon">🔨</span> Emplacement libre</h4>
        <p class="tt-hint">Cliquez pour construire un bâtiment</p>
      `;
    }
  }

  tooltip.innerHTML = html;
  tooltip.style.display = 'block';

  // Positionner le tooltip sous le curseur avec animation
  const canvasRect = cityCanvas.parentElement.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();

  let left = mouseX - canvasRect.left + 10;
  let top = mouseY - canvasRect.top + 20;

  // Éviter que le tooltip sorte de l'écran
  if (left + tooltipRect.width > canvasRect.width - 10) {
    left = mouseX - canvasRect.left - tooltipRect.width - 10;
  }
  if (top + tooltipRect.height > canvasRect.height - 10) {
    top = mouseY - canvasRect.top - tooltipRect.height - 20;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

// Helper pour obtenir l'effet d'un bâtiment (39 bâtiments)
function getBuildingEffect(key, level) {
  const effects = {
    // Base & Intermediate
    'MAIN_HALL': `Réduction construction: ${(level * 2.5).toFixed(1)}%`,
    'BARRACKS': `Réduction entraînement: ${(level * 0.5).toFixed(1)}%`,
    'STABLE': `Réduction entraînement: ${(level * 0.5).toFixed(1)}%`,
    'WORKSHOP': `Réduction entraînement: ${(level * 4).toFixed(1)}%`,
    'ACADEMY': `Réduction recherche: ${(level * 1).toFixed(1)}%`,
    'FORGE': `Bonus défense global: ${(level * 0.5).toFixed(1)}%`,
    'WALL': `Bonus défense: ${(level * 1).toFixed(1)}%`,
    'MOAT': `Bonus ATK/DEF: ${(level * 0.5).toFixed(1)}%`,
    'HIDEOUT': `Ressources cachées: ${Math.min(level * 1, 20)}%`,
    'HEALING_TENT': `Capacité soins: ${level * 3} unités`,
    'HERO_HOME': `Bonus XP héros: ${(level * 2).toFixed(0)}%`,
    'HERO_MANSION': `Résurrection: -${(level * 2).toFixed(0)}% temps`,
    'MARKET': `Taxe réduite: ${(30 - level).toFixed(0)}%`,
    'RALLY_POINT': `Armées max: ${Math.min(1 + Math.floor(level / 5), 3)}`,
    'WAREHOUSE': `Capacité: ${formatNum(1200 + (160000 - 1200) * (level - 1) / 19)}`,
    'SILO': `Capacité: ${formatNum(1200 + (160000 - 1200) * (level - 1) / 19)}`,
    // Production bonus
    'MILL': `Bonus céréales: +${(4 + (level - 1) * 4).toFixed(0)}%`,
    'BAKERY': `Bonus céréales: +${(4 + (level - 1) * 4).toFixed(0)}%`,
    'SAWMILL': `Bonus bois: +${(5 * level).toFixed(0)}%`,
    'STONEMASON': `Bonus pierre: +${(5 * level).toFixed(0)}%`,
    'FOUNDRY': `Bonus fer: +${(5 * level).toFixed(0)}%`,
    // Protected storage
    'GREAT_SILO': `Protégé: ${formatNum(3600 + (600000 - 3600) * (level - 1) / 19)}`,
    'GREAT_WAREHOUSE': `Protégé: ${formatNum(3600 + (600000 - 3600) * (level - 1) / 19)}`,
    // Military advanced
    'GREAT_BARRACKS': `Réduction: -${(level * 4).toFixed(0)}% temps`,
    'GREAT_STABLE': `Réduction: -${(level * 4).toFixed(0)}% temps`,
    'WATCHTOWER': `Vision: ${5 + level * 6} cases`,
    // Special buildings
    'EMBASSY': `Aide alliance: ${Math.min(level, 20)} max`,
    'TREASURE_CHAMBER': `Or/jour: ${10 + (level - 1) * 10}`,
    'RESIDENCE': `Colons: ${level >= 20 ? 3 : level >= 15 ? 2 : level >= 10 ? 1 : 0}`,
    'TRADE_OFFICE': `Taxe P2P: -${level}%`,
    // Faction buildings
    'ROMAN_THERMAE': `Soins: -${(level * 1.5).toFixed(1)}% temps`,
    'GALLIC_BREWERY': `Défense siège: +${level}%`,
    'GREEK_TEMPLE': `Recherche: -${level}%`,
    'EGYPTIAN_IRRIGATION': `Production: +${level}%`,
    'HUN_WAR_TENT': `Entretien: -${(level * 0.5).toFixed(1)}%`,
    'SULTAN_DESERT_OUTPOST': `Taxe inter-villes: -${(level * 0.5).toFixed(1)}%`
  };
  return effects[key] || null;
}

function hideCityTooltip() {
  const tooltip = document.getElementById('city-tooltip');
  if (tooltip) tooltip.style.display = 'none';
}

// ========== FIELDS CANVAS HANDLERS ==========
function onFieldsMouseMove(e) {
  if (!fieldsCanvas) return;

  const rect = fieldsCanvas.getBoundingClientRect();
  const mouseX = (e.clientX - rect.left) * (fieldsCanvas.width / rect.width);
  const mouseY = (e.clientY - rect.top) * (fieldsCanvas.height / rect.height);

  // Find hovered slot
  let foundSlot = null;
  for (const slot of citySlots) {
    const dx = mouseX - slot.x;
    const dy = mouseY - slot.y;
    const rx = slot.size * 0.6;
    const ry = slot.size * 0.35;
    const normalizedDist = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);

    if (normalizedDist <= 1) {
      foundSlot = slot.slot;
      break;
    }
  }

  if (foundSlot !== cityHoveredSlot) {
    cityHoveredSlot = foundSlot;
    renderFieldsCanvas();

    fieldsCanvas.style.cursor = foundSlot !== null ? 'pointer' : 'default';

    if (foundSlot !== null) {
      showFieldsTooltip(e.clientX, e.clientY, foundSlot);
    } else {
      hideFieldsTooltip();
    }
  }
}

function onFieldsClick(e) {
  if (!currentCity) return; // Guard: city data not loaded yet
  if (cityHoveredSlot !== null) {
    if (cityHoveredSlot === -1) {
      // Click on village center -> switch to city tab
      showTab('city');
    } else {
      // Click on a field -> open field build panel
      openFieldBuildPanel(cityHoveredSlot);
    }
  }
}

function showFieldsTooltip(mouseX, mouseY, slotNum) {
  const tooltip = document.getElementById('fields-tooltip');
  if (!tooltip) return;

  const slot = citySlots.find(s => s.slot === slotNum);
  let html = '';

  if (slot?.isVillageCenter) {
    html = `
      <h4><span class="tt-icon">🏰</span> Centre du Village</h4>
      <p class="tt-hint">Cliquez pour voir les bâtiments</p>
    `;
  } else if (slot?.isField) {
    const fieldIcons = { FARM: '🌾', LUMBER: '🪵', QUARRY: '🪨', IRON_MINE: '⛏️' };
    const fieldNames = { FARM: 'Champ de blé', LUMBER: 'Scierie', QUARRY: 'Carrière de pierre', IRON_MINE: 'Mine de fer' };
    const building = getFieldBuildingAtSlot(slot.slot, slot.fieldType);
    const level = building?.level || 0;
    const production = getProductionAtLevel(slot.fieldType, level);
    const fMainHall = currentCity?.buildings?.find(b => b.key === 'MAIN_HALL');
    const fMainHallLevel = fMainHall?.level || 1;
    const fieldDef = buildingsData?.find(b => b.key === slot.fieldType);
    const fieldMax = fieldDef?.maxLevel || 20;
    const fEffectiveMax = Math.min(fieldMax, fMainHallLevel);

    html = `
      <h4><span class="tt-icon">${fieldIcons[slot.fieldType] || '🏭'}</span> ${fieldNames[slot.fieldType] || 'Ressource'}</h4>
      <p class="tt-level">Niveau ${level}/${fEffectiveMax}</p>
      ${level > 0 ? `<p class="tt-production">+${formatNum(production)} par heure</p>` : ''}
      <p class="tt-hint">${level === 0 ? 'Cliquez pour construire' : level >= fEffectiveMax ? (level >= fieldMax ? 'Niveau maximum atteint' : `Limité par Bât. principal (Niv.${fMainHallLevel})`) : 'Cliquez pour améliorer'}</p>
    `;
  }

  tooltip.innerHTML = html;
  tooltip.style.display = 'block';

  // Position tooltip
  const canvasRect = fieldsCanvas.parentElement.getBoundingClientRect();
  let left = mouseX - canvasRect.left + 10;
  let top = mouseY - canvasRect.top + 20;

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideFieldsTooltip() {
  const tooltip = document.getElementById('fields-tooltip');
  if (tooltip) tooltip.style.display = 'none';
}

// ========== BUILD PANEL ==========
let selectedBuildSlot = null;

function openBuildPanel(slotNum) {
  selectedBuildSlot = slotNum;
  const panel = document.getElementById('build-panel');
  const content = document.getElementById('build-panel-content');
  const title = document.getElementById('build-panel-title');
  
  const slot = citySlots.find(s => s.slot === slotNum);
  const building = getBuildingAtSlot(slotNum);
  
  // Create overlay with animation
  let overlay = document.querySelector('.build-panel-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'build-panel-overlay';
    overlay.onclick = closeBuildPanel;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'block';
  overlay.classList.add('fade-in');
  
  if (building || slot?.fixed) {
    // ===== EXISTING BUILDING - TABBED INTERFACE (Travian Style) =====
    const key = building?.key || slot?.fixedKey;
    const level = building?.level || 1;
    const def = buildingsData.find(b => b.key === key);
    const maxLevel = def?.maxLevel || 20;
    // Other buildings cannot exceed MAIN_HALL level
    const mainHall = currentCity?.buildings?.find(b => b.key === 'MAIN_HALL');
    const mainHallLevel = mainHall?.level || 1;
    const effectiveMax = key === 'MAIN_HALL' ? maxLevel : Math.min(maxLevel, mainHallLevel);
    const canUpgrade = level < effectiveMax;
    const nextLevel = level + 1;

    // ===== MILITARY BUILDINGS - RECRUITMENT PANEL =====
    const isMilitaryBuilding = ['BARRACKS', 'STABLE', 'WORKSHOP'].includes(key);

    if (isMilitaryBuilding) {
      openRecruitmentPanel(key, level, slotNum);
      return;
    }

    // ===== HERO HOME - HERO MANAGEMENT PANEL =====
    if (key === 'HERO_HOME' || key === 'HERO_MANSION') {
      openHeroManagementPanel(level, slotNum);
      return;
    }

    // Calculate costs for next level - must match backend formula
    const costMultiplier = Math.pow(1.28, level);
    const nextCost = {
      wood: Math.floor((def?.costL1?.wood || 50) * costMultiplier),
      stone: Math.floor((def?.costL1?.stone || 50) * costMultiplier),
      iron: Math.floor((def?.costL1?.iron || 50) * costMultiplier),
      food: Math.floor((def?.costL1?.food || 30) * costMultiplier)
    };

    // Time formula must match backend
    const baseDuration = def?.timeL1Sec || 60;
    const buildTime = Math.floor(baseDuration * Math.pow(1.2, level));
    const timeStr = formatDuration(buildTime);

    const bonus = getBuildingBonus(key, level);
    const nextBonus = getBuildingBonus(key, nextLevel);

    const hasResources = currentCity &&
      currentCity.wood >= nextCost.wood &&
      currentCity.stone >= nextCost.stone &&
      currentCity.iron >= nextCost.iron &&
      currentCity.food >= nextCost.food;

    // Determine special tabs based on building type
    const specialTabs = getBuildingSpecialTabs(key, level, slotNum);

    title.innerHTML = `
      <div class="building-title-header">
        <span class="building-detail-icon">${BUILDING_ICONS[key] || '🏠'}</span>
        <span>${getBuildingName(key)}</span>
        <span class="building-level-badge">Niv. ${level}/${maxLevel}</span>
      </div>
    `;

    content.innerHTML = `
      <div class="building-tabbed-card">
        <!-- Tabs Navigation -->
        <div class="building-tabs">
          <button class="building-tab active" onclick="switchBuildingTab('upgrade', this)">⬆️ Améliorer</button>
          <button class="building-tab" onclick="switchBuildingTab('info', this)">📖 Information</button>
          ${specialTabs.map(t => `<button class="building-tab" onclick="switchBuildingTab('${t.id}', this)">${t.icon} ${t.name}</button>`).join('')}
        </div>

        <!-- Tab Content: Upgrade -->
        <div class="building-tab-content" id="tab-upgrade">
          ${canUpgrade ? `
            <div class="upgrade-preview">
              <div class="upgrade-comparison">
                <div class="level-current">
                  <span class="level-num">${level}</span>
                  <span class="level-label">Actuel</span>
                  <p class="bonus-text">${bonus}</p>
                </div>
                <div class="level-arrow">→</div>
                <div class="level-next">
                  <span class="level-num">${nextLevel}</span>
                  <span class="level-label">Suivant</span>
                  <p class="bonus-text">${nextBonus}</p>
                </div>
              </div>
            </div>
            <div class="upgrade-costs">
              <h4>Coût d'amélioration</h4>
              <div class="cost-grid">
                <div class="cost-item ${currentCity?.wood >= nextCost.wood ? 'available' : 'missing'}">
                  <span class="cost-icon">🪵</span>
                  <span class="cost-value">${formatNum(nextCost.wood)}</span>
                  <div class="cost-bar"><div class="cost-bar-fill" style="width:${Math.min(100, (currentCity?.wood / nextCost.wood) * 100)}%"></div></div>
                </div>
                <div class="cost-item ${currentCity?.stone >= nextCost.stone ? 'available' : 'missing'}">
                  <span class="cost-icon">🪨</span>
                  <span class="cost-value">${formatNum(nextCost.stone)}</span>
                  <div class="cost-bar"><div class="cost-bar-fill" style="width:${Math.min(100, (currentCity?.stone / nextCost.stone) * 100)}%"></div></div>
                </div>
                <div class="cost-item ${currentCity?.iron >= nextCost.iron ? 'available' : 'missing'}">
                  <span class="cost-icon">⛏️</span>
                  <span class="cost-value">${formatNum(nextCost.iron)}</span>
                  <div class="cost-bar"><div class="cost-bar-fill" style="width:${Math.min(100, (currentCity?.iron / nextCost.iron) * 100)}%"></div></div>
                </div>
                <div class="cost-item ${currentCity?.food >= nextCost.food ? 'available' : 'missing'}">
                  <span class="cost-icon">🌾</span>
                  <span class="cost-value">${formatNum(nextCost.food)}</span>
                  <div class="cost-bar"><div class="cost-bar-fill" style="width:${Math.min(100, (currentCity?.food / nextCost.food) * 100)}%"></div></div>
                </div>
              </div>
            </div>
            <div class="upgrade-action">
              <div class="build-time"><span class="time-icon">⏱️</span> ${timeStr}</div>
              <button class="upgrade-btn ${hasResources && !isBuildQueueFull() ? '' : 'disabled'}" onclick="upgradeBuilding('${key}', ${slotNum})" ${hasResources && !isBuildQueueFull() ? '' : 'disabled'}>
                ${isBuildQueueFull() ? '⏳ File de construction pleine' : hasResources ? '🔨 Ameliorer' : '❌ Ressources insuffisantes'}
              </button>
            </div>
          ` : `
            <div class="max-level-notice">
              <span class="max-icon">${level >= maxLevel ? '🏆' : '🔒'}</span>
              <p>${level >= maxLevel ? 'Niveau maximum atteint !' : `Limité par le Bâtiment principal (Niv.${mainHallLevel})`}</p>
              ${level < maxLevel ? `<p class="bonus-hint">Améliorez le Bâtiment principal pour débloquer les niveaux suivants</p>` : ''}
              <p class="bonus-max">${bonus}</p>
            </div>
          `}
        </div>

        <!-- Tab Content: Information -->
        <div class="building-tab-content" id="tab-info" style="display:none">
          <div class="info-section">
            <h4>📜 Description</h4>
            <p class="info-description">${getBuildingDescription(key)}</p>
          </div>
          <div class="info-section">
            <h4>📊 Bonus actuel (Niveau ${level})</h4>
            <div class="info-bonus">${bonus}</div>
          </div>
          ${building?.prodPerHour ? `
            <div class="info-section">
              <h4>📈 Production</h4>
              <p class="info-production">+${formatNum(building.prodPerHour)} par heure</p>
            </div>
          ` : ''}
          ${def?.prereq && def.prereq.length > 0 ? `
            <div class="info-section">
              <h4>📋 Prérequis</h4>
              <div class="prereq-list">
                ${def.prereq.map(p => {
                  const prereqBuilding = currentCity?.buildings?.find(b => b.key === p.key);
                  const met = prereqBuilding && prereqBuilding.level >= p.level;
                  return `<div class="prereq-item ${met ? 'met' : 'unmet'}">
                    <span>${BUILDING_ICONS[p.key] || '🏠'}</span>
                    <span>${getBuildingName(p.key)} Niv.${p.level}</span>
                    <span class="prereq-status">${met ? '✓' : '✗'}</span>
                  </div>`;
                }).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Special Tabs Content -->
        ${specialTabs.map(t => `
          <div class="building-tab-content" id="tab-${t.id}" style="display:none">
            ${t.content}
          </div>
        `).join('')}
      </div>
    `;
  } else if (slot?.isField) {
    // ===== RESOURCE FIELD - DETAILED CARD =====
    const fieldKey = slot.fieldType;
    const def = buildingsData.find(b => b.key === fieldKey);
    const resourceType = fieldKey === 'FARM' ? 'nourriture' : fieldKey === 'LUMBER' ? 'bois' : fieldKey === 'QUARRY' ? 'pierre' : 'fer';
    const resourceIcon = fieldKey === 'FARM' ? '🌾' : fieldKey === 'LUMBER' ? '🪵' : fieldKey === 'QUARRY' ? '🪨' : '⛏️';
    
    title.innerHTML = `<span class="building-detail-icon">${BUILDING_ICONS[fieldKey] || '🌾'}</span> ${getBuildingName(fieldKey)}`;
    
    content.innerHTML = `
      <div class="building-detail-card field-card">
        <div class="field-header">
          <div class="field-icon-large">${BUILDING_ICONS[fieldKey]}</div>
          <div class="field-info">
            <h3>${getBuildingName(fieldKey)}</h3>
            <p class="field-type">Champ de ${resourceType}</p>
          </div>
        </div>
        
        <div class="field-production-preview">
          <span class="prod-icon">${resourceIcon}</span>
          <span class="prod-text">Production: <strong>+${def?.effects?.[fieldKey.toLowerCase() + 'ProdL1'] || 20}/h</strong> au niveau 1</span>
        </div>
        
        <div class="cost-grid compact">
          <div class="cost-item">
            <span class="cost-icon">🪵</span>
            <span class="cost-value">${formatNum(def?.costL1?.wood || 50)}</span>
          </div>
          <div class="cost-item">
            <span class="cost-icon">🪨</span>
            <span class="cost-value">${formatNum(def?.costL1?.stone || 50)}</span>
          </div>
          <div class="cost-item">
            <span class="cost-icon">⛏️</span>
            <span class="cost-value">${formatNum(def?.costL1?.iron || 50)}</span>
          </div>
          <div class="cost-item">
            <span class="cost-icon">🌾</span>
            <span class="cost-value">${formatNum(def?.costL1?.food || 0)}</span>
          </div>
        </div>
        
        <button class="build-field-btn ${isBuildQueueFull() ? 'disabled' : ''}" onclick="buildAtSlot('${fieldKey}', ${slotNum})" ${isBuildQueueFull() ? 'disabled' : ''}>
          ${isBuildQueueFull() ? '⏳ File de construction pleine' : `🏗️ Construire ${getBuildingName(fieldKey)}`}
        </button>
      </div>
    `;
  } else {
    // ===== EMPTY SLOT - BUILDING LIST (Travian Style) =====
    title.textContent = '🏗️ Construire un bâtiment';

    const availableBuildings = buildingsData.filter(b => {
      if (['FARM', 'LUMBER', 'QUARRY', 'IRON_MINE', 'MAIN_HALL'].includes(b.key)) return false;
      // Filter faction buildings: only show those matching player faction
      if (b.category === 'FACTION' && b.faction && player?.faction && b.faction !== player.faction) return false;
      return true;
    });

    // Group by category
    const categories = {
      'BASE': { name: 'Infrastructure', icon: '🏛️', buildings: [] },
      'INTERMEDIATE': { name: 'Militaire', icon: '⚔️', buildings: [] },
      'ADVANCED': { name: 'Avancé', icon: '🏰', buildings: [] },
      'FACTION': { name: 'Bâtiment de faction', icon: '🏟️', buildings: [] }
    };

    availableBuildings.forEach(b => {
      const cat = b.category || 'INTERMEDIATE';
      if (categories[cat]) categories[cat].buildings.push(b);
    });

    content.innerHTML = `
      <div class="building-categories travian-style">
        ${Object.entries(categories).map(([key, cat]) => cat.buildings.length > 0 ? `
          <div class="building-category">
            <h4 class="category-title">${cat.icon} ${cat.name}</h4>
            <div class="buildings-list">
              ${cat.buildings.map(b => {
                // Check prerequisites
                const prereqStatus = checkBuildingPrerequisites(b);
                const hasPrereqs = prereqStatus.met;
                const hasResources = currentCity &&
                  currentCity.wood >= (b.costL1?.wood || 0) &&
                  currentCity.stone >= (b.costL1?.stone || 0) &&
                  currentCity.iron >= (b.costL1?.iron || 0) &&
                  currentCity.food >= (b.costL1?.food || 0);
                const canBuild = hasPrereqs && hasResources;
                const alreadyBuilt = currentCity?.buildings?.some(existing => existing.key === b.key);
                const isUnique = b.maxPerCity === 1 || !b.maxPerCity;
                const blocked = alreadyBuilt && isUnique;

                return `
                  <div class="build-option-card ${!hasPrereqs ? 'locked' : ''} ${!hasResources ? 'insufficient' : ''} ${blocked ? 'already-built' : ''}"
                       onclick="${canBuild && !blocked ? `buildAtSlot('${b.key}', ${slotNum})` : ''}"
                       ${!canBuild || blocked ? 'style="cursor: not-allowed"' : ''}>
                    <div class="build-option-icon-large">${BUILDING_ICONS[b.key] || '🏠'}</div>
                    <div class="build-option-details">
                      <h5>${b.name}</h5>
                      ${blocked ? `
                        <p class="build-option-status already">✓ Déjà construit</p>
                      ` : !hasPrereqs ? `
                        <p class="build-option-prereq">⚠️ ${prereqStatus.missing}</p>
                      ` : `
                        <p class="build-option-desc">${getBuildingDescription(b.key)}</p>
                      `}
                      <div class="build-option-costs ${!hasPrereqs ? 'dimmed' : ''}">
                        <span class="${currentCity?.wood >= (b.costL1?.wood || 0) ? '' : 'missing'}">🪵${formatNum(b.costL1?.wood || 0)}</span>
                        <span class="${currentCity?.stone >= (b.costL1?.stone || 0) ? '' : 'missing'}">🪨${formatNum(b.costL1?.stone || 0)}</span>
                        <span class="${currentCity?.iron >= (b.costL1?.iron || 0) ? '' : 'missing'}">⛏️${formatNum(b.costL1?.iron || 0)}</span>
                        <span class="${currentCity?.food >= (b.costL1?.food || 0) ? '' : 'missing'}">🌾${formatNum(b.costL1?.food || 0)}</span>
                      </div>
                      <div class="build-option-time">⏱️ ${formatDuration(b.timeL1Sec || 60)}</div>
                    </div>
                    <div class="build-option-action">
                      ${blocked ? `<span class="built-badge">✓</span>` :
                        canBuild ? `<button class="mini-build-btn">🔨</button>` :
                        `<button class="mini-build-btn disabled">🔒</button>`}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : '').join('')}
      </div>
    `;
  }
  
  panel.style.display = 'flex';
  panel.classList.add('slide-in');
}

// Helper: Format duration in seconds to readable string
function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  return `${days}j ${hours % 24}h`;
}

// Helper: Get building bonus text
function getBuildingBonus(key, level) {
  const bonuses = {
    MAIN_HALL: `Réduction temps construction: -${(level * 2.5).toFixed(1)}%`,
    BARRACKS: `Réduction temps entraînement: -${(level * 0.5).toFixed(1)}%`,
    STABLE: `Réduction temps entraînement cavalerie: -${(level * 0.5).toFixed(1)}%`,
    WORKSHOP: `Réduction temps entraînement siège: -${(level * 4).toFixed(1)}%`,
    ACADEMY: `Réduction temps recherche: -${level}%`,
    FORGE: `Bonus défense globale: +${(level * 0.5).toFixed(1)}%`,
    MARKET: `Réduction taxe marché: -${level}%, Capacité transport: +${level * 5}%`,
    WAREHOUSE: `Stockage ressources: ${formatNum(1200 + level * 8000)}`,
    SILO: `Stockage nourriture: ${formatNum(1200 + level * 8000)}`,
    FARM: `Production nourriture: +${formatNum(getProductionAtLevel('FARM', level))}/h`,
    LUMBER: `Production bois: +${formatNum(getProductionAtLevel('LUMBER', level))}/h`,
    QUARRY: `Production pierre: +${formatNum(getProductionAtLevel('QUARRY', level))}/h`,
    IRON_MINE: `Production fer: +${formatNum(getProductionAtLevel('IRON_MINE', level))}/h`,
    WALL: `Bonus défense: +${level}%, Régénération mur: +${level}%`,
    MOAT: `Bonus ATK/DEF défenseur: +${(level * 0.5).toFixed(1)}%`,
    HEALING_TENT: `Capacité de soins: ${level * 3} blessés`,
    RALLY_POINT: `Armées max: ${Math.min(1 + Math.floor(level / 5), 3)}`,
    HIDEOUT: `Ressources cachées: ${level}%`
  };
  return bonuses[key] || 'Aucun bonus spécial';
}

// Helper: Switch building panel tabs
function switchBuildingTab(tabId, btn) {
  // Hide all tab contents
  document.querySelectorAll('.building-tab-content').forEach(c => c.style.display = 'none');
  // Remove active from all tabs
  document.querySelectorAll('.building-tab').forEach(t => t.classList.remove('active'));
  // Show selected tab and mark button active
  const tabEl = document.getElementById(`tab-${tabId}`);
  if (tabEl) tabEl.style.display = 'block';
  if (btn) btn.classList.add('active');
}

// Helper: Get special tabs for specific building types
function getBuildingSpecialTabs(buildingKey, level, slotNum) {
  const tabs = [];

  switch (buildingKey) {
    case 'MARKET':
      tabs.push({
        id: 'trade',
        icon: '📦',
        name: 'Commerce',
        content: `
          <div class="special-tab-content">
            <h4>🏪 Place du marché</h4>
            <p>Capacité de transport: <strong>${100 + level * 50}</strong> unités</p>
            <p>Marchands disponibles: <strong>${Math.floor(level / 5) + 1}</strong></p>
            <button class="btn-primary" onclick="showTab('market'); closeBuildPanel();">Accéder au marché</button>
          </div>
        `
      });
      break;

    case 'ACADEMY':
      tabs.push({
        id: 'research',
        icon: '🔬',
        name: 'Recherche',
        content: `
          <div class="special-tab-content">
            <h4>🎓 Académie</h4>
            <p>Bonus recherche: <strong>-${level}%</strong> temps</p>
            <p>Technologies disponibles selon le niveau de l'académie.</p>
            <button class="btn-secondary" onclick="showToast('Recherches bientôt disponibles', 'info')">Voir les recherches</button>
          </div>
        `
      });
      break;

    case 'EMBASSY':
      tabs.push({
        id: 'diplomacy',
        icon: '🤝',
        name: 'Diplomatie',
        content: `
          <div class="special-tab-content">
            <h4>🏛️ Ambassade</h4>
            <p>Permet de créer ou rejoindre une alliance.</p>
            ${level >= 3 ? `<p>Niveau ${level}: Peut accueillir jusqu'à <strong>${level * 3}</strong> membres.</p>` : ''}
            <button class="btn-primary" onclick="showTab('alliance'); closeBuildPanel();">Accéder à l'alliance</button>
          </div>
        `
      });
      break;

    case 'RALLY_POINT':
      tabs.push({
        id: 'armies',
        icon: '⚔️',
        name: 'Armées',
        content: `
          <div class="special-tab-content">
            <h4>🎯 Point de ralliement</h4>
            <p>Armées simultanées: <strong>${Math.min(1 + Math.floor(level / 5), 5)}</strong></p>
            <p>Gérez vos troupes et envoyez des missions depuis ici.</p>
            <button class="btn-primary" onclick="showTab('army'); closeBuildPanel();">Gérer les armées</button>
          </div>
        `
      });
      break;

    case 'HEALING_TENT':
      tabs.push({
        id: 'heal',
        icon: '💊',
        name: 'Soins',
        content: `
          <div class="special-tab-content">
            <h4>🏥 Tente de soins</h4>
            <p>Capacité: <strong>${level * 3}</strong> blessés</p>
            <p>Les troupes blessées peuvent être soignées ici après une bataille défensive.</p>
            <button class="btn-success" onclick="healWounded()">Soigner les blessés</button>
          </div>
        `
      });
      break;

    case 'WAREHOUSE':
    case 'GREAT_WAREHOUSE':
      tabs.push({
        id: 'storage',
        icon: '📦',
        name: 'Stockage',
        content: `
          <div class="special-tab-content">
            <h4>🏪 Capacité de stockage</h4>
            <div class="storage-bars">
              <div class="storage-row">
                <span>🪵 Bois:</span>
                <div class="storage-bar"><div style="width:${Math.min(100, (currentCity?.wood / (1200 + level * 8000)) * 100)}%"></div></div>
                <span>${formatNum(currentCity?.wood || 0)} / ${formatNum(1200 + level * 8000)}</span>
              </div>
              <div class="storage-row">
                <span>🪨 Pierre:</span>
                <div class="storage-bar"><div style="width:${Math.min(100, (currentCity?.stone / (1200 + level * 8000)) * 100)}%"></div></div>
                <span>${formatNum(currentCity?.stone || 0)} / ${formatNum(1200 + level * 8000)}</span>
              </div>
              <div class="storage-row">
                <span>⛏️ Fer:</span>
                <div class="storage-bar"><div style="width:${Math.min(100, (currentCity?.iron / (1200 + level * 8000)) * 100)}%"></div></div>
                <span>${formatNum(currentCity?.iron || 0)} / ${formatNum(1200 + level * 8000)}</span>
              </div>
            </div>
          </div>
        `
      });
      break;

    case 'SILO':
    case 'GREAT_SILO':
      tabs.push({
        id: 'food-storage',
        icon: '🌾',
        name: 'Stockage',
        content: `
          <div class="special-tab-content">
            <h4>🌾 Capacité de stockage nourriture</h4>
            <div class="storage-bars">
              <div class="storage-row">
                <span>🌾 Nourriture:</span>
                <div class="storage-bar food"><div style="width:${Math.min(100, (currentCity?.food / (1200 + level * 8000)) * 100)}%"></div></div>
                <span>${formatNum(currentCity?.food || 0)} / ${formatNum(1200 + level * 8000)}</span>
              </div>
            </div>
          </div>
        `
      });
      break;

    case 'WATCHTOWER':
      tabs.push({
        id: 'watch',
        icon: '👁️',
        name: 'Surveillance',
        content: `
          <div class="special-tab-content">
            <h4>🗼 Tour de guet</h4>
            <p>Portée de détection: <strong>${level * 2}</strong> cases</p>
            <p>Temps d'alerte: <strong>${Math.max(1, 10 - level)}</strong> minutes avant l'arrivée</p>
            <p class="info-note">Les attaques ennemies seront détectées à l'avance.</p>
          </div>
        `
      });
      break;
  }

  return tabs;
}

// Helper: Check building prerequisites
function checkBuildingPrerequisites(buildingDef) {
  if (!buildingDef.prereq || buildingDef.prereq.length === 0) {
    return { met: true, missing: '' };
  }

  const missingPrereqs = [];

  for (const prereq of buildingDef.prereq) {
    const existingBuilding = currentCity?.buildings?.find(b => b.key === prereq.key);
    const currentLevel = existingBuilding?.level || 0;

    if (currentLevel < prereq.level) {
      const prereqDef = buildingsData?.find(b => b.key === prereq.key);
      const prereqName = prereqDef?.name || prereq.key;
      missingPrereqs.push(`${prereqName} niv.${prereq.level}`);
    }
  }

  if (missingPrereqs.length > 0) {
    return { met: false, missing: `Requis: ${missingPrereqs.join(', ')}` };
  }

  return { met: true, missing: '' };
}

function closeBuildPanel() {
  const panel = document.getElementById('build-panel');
  if (panel) panel.style.display = 'none';
  const overlay = document.querySelector('.build-panel-overlay');
  if (overlay) overlay.style.display = 'none';
  selectedBuildSlot = null;
}

function openFieldBuildPanel(slotNum) {
  const slot = citySlots.find(s => s.slot === slotNum);
  if (!slot || !slot.isField) return;
  
  selectedBuildSlot = slotNum;
  const panel = document.getElementById('build-panel');
  const content = document.getElementById('build-panel-content');
  const title = document.getElementById('build-panel-title');
  
  const fieldType = slot.fieldType;
  const building = getFieldBuildingAtSlot(slotNum, fieldType);
  const level = building?.level || 0;
  const def = buildingsData.find(b => b.key === fieldType);
  
  const fieldNames = { 
    FARM: 'Ferme', 
    LUMBER: 'Bûcheron', 
    QUARRY: 'Carrière de pierre', 
    IRON_MINE: 'Mine de fer' 
  };
  
  const fieldIcons = {
    FARM: '🌾',
    LUMBER: '🌲',
    QUARRY: '⛰️',
    IRON_MINE: '⛏️'
  };
  
  // Create overlay
  let overlay = document.querySelector('.build-panel-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'build-panel-overlay';
    overlay.onclick = closeBuildPanel;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'block';
  
  if (level > 0) {
    // Existing field - show upgrade
    const maxLevel = def?.maxLevel || 20;
    const canUpgrade = level < maxLevel;
    
    title.textContent = 'Améliorer';
    content.innerHTML = `
      <div class="current-building">
        <div class="current-building-icon">${fieldIcons[fieldType]}</div>
        <h4>${fieldNames[fieldType]}</h4>
        <span class="level-badge">Niveau ${level}</span>
        <p style="margin-top:10px;font-size:12px;color:#666">
          Production: +${getProductionAtLevel(fieldType, level)}/h
        </p>
      </div>
      ${canUpgrade ? `
        <div class="upgrade-info">
          <h5>Améliorer au niveau ${level + 1}</h5>
          <p style="font-size:12px;color:#666;margin-bottom:10px">
            Production: +${getProductionAtLevel(fieldType, level + 1)}/h (+${getProductionAtLevel(fieldType, level + 1) - getProductionAtLevel(fieldType, level)}/h)
          </p>
          <div class="upgrade-cost">
            <span>🪵 ${formatNum((def?.costL1?.wood || 50) * (level + 1))}</span>
            <span>🪨 ${formatNum((def?.costL1?.stone || 50) * (level + 1))}</span>
            <span>⛏️ ${formatNum((def?.costL1?.iron || 50) * (level + 1))}</span>
          </div>
          <button class="build-option-btn" onclick="buildField('${fieldType}', ${slotNum + 100})">
            Améliorer
          </button>
        </div>
      ` : `<p style="text-align:center;color:#666;">Niveau maximum atteint</p>`}
    `;
  } else {
    // Empty field - show build option
    title.textContent = 'Construire';
    content.innerHTML = `
      <div class="build-option" onclick="buildField('${fieldType}', ${slotNum + 100})">
        <div class="build-option-icon">${fieldIcons[fieldType]}</div>
        <div class="build-option-info">
          <h4>${fieldNames[fieldType]}</h4>
          <p>Production de ${fieldType === 'FARM' ? 'nourriture' : fieldType === 'LUMBER' ? 'bois' : fieldType === 'QUARRY' ? 'pierre' : 'fer'}</p>
          <p style="font-size:11px;color:#888">+${getProductionAtLevel(fieldType, 1)}/h au niveau 1</p>
          <div class="build-option-cost">
            <span>🪵 ${def?.costL1?.wood || 50}</span>
            <span>🪨 ${def?.costL1?.stone || 50}</span>
            <span>⛏️ ${def?.costL1?.iron || 50}</span>
          </div>
        </div>
        <button class="build-option-btn">Construire</button>
      </div>
    `;
  }
  
  panel.style.display = 'flex';
}

// ========== RECRUITMENT PANEL (via Military Buildings) ==========
function openRecruitmentPanel(buildingKey, buildingLevel, slotNum) {
  const panel = document.getElementById('build-panel');
  const content = document.getElementById('build-panel-content');
  const title = document.getElementById('build-panel-title');

  // Create overlay
  let overlay = document.querySelector('.build-panel-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'build-panel-overlay';
    overlay.onclick = closeBuildPanel;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'block';
  overlay.classList.add('fade-in');

  // Building configurations
  const buildingNames = { BARRACKS: 'Caserne', STABLE: 'Écurie', WORKSHOP: 'Atelier' };
  const buildingIcons = { BARRACKS: '⚔️', STABLE: '🐎', WORKSHOP: '⚙️' };
  const allowedClasses = {
    BARRACKS: ['INFANTRY', 'ARCHER'],
    STABLE: ['CAVALRY'],
    WORKSHOP: ['SIEGE']
  };

  const classes = allowedClasses[buildingKey] || [];

  // Filter units by tier based on building level
  const availableUnits = unitsData.filter(u => {
    if (u.faction !== player?.faction) return false;
    if (!classes.includes(u.class)) return false;
    if (u.tier === 'intermediate' && buildingLevel < 9) return false;
    if (u.tier === 'elite' && buildingLevel < 15) return false;
    return true;
  });

  // Group units by class for BARRACKS (separate Infantry and Archers)
  const unitsByClass = {};
  availableUnits.forEach(u => {
    if (!unitsByClass[u.class]) unitsByClass[u.class] = [];
    unitsByClass[u.class].push(u);
  });

  // Check current recruitment queue
  const currentQueue = currentCity?.recruitQueue?.filter(q => q.buildingKey === buildingKey) || [];
  const isRecruiting = currentQueue.some(q => q.status === 'RUNNING');

  title.innerHTML = `<span class="building-detail-icon">${buildingIcons[buildingKey]}</span> ${buildingNames[buildingKey]} (Niv.${buildingLevel})`;

  // Helper function to render a unit card
  const renderUnitCard = (u, isRecruiting, buildingKey) => {
    const tierColor = TIER_COLORS[u.tier] || '#aaa';
    // Use per-unit GDD costs from units data (class-specific + tier multiplier)
    const unitCost = u.recruitCost || { wood: 50, stone: 30, iron: 60, food: 30 };
    const canAfford = currentCity &&
      currentCity.wood >= unitCost.wood &&
      currentCity.stone >= unitCost.stone &&
      currentCity.iron >= unitCost.iron &&
      currentCity.food >= unitCost.food;

    return `
      <div class="unit-recruit-card ${isRecruiting ? 'disabled' : ''}">
        <div class="unit-recruit-header" style="border-color: ${tierColor}">
          <span class="unit-icon clickable" onclick="event.stopPropagation(); showUnitStatsPopup('${u.key}')" title="Voir les stats détaillées">${UNIT_ICONS[u.class] || '⚔️'}</span>
          <span class="tier-badge" style="background: ${tierColor}">${u.tier.charAt(0).toUpperCase()}</span>
        </div>
        <div class="unit-recruit-body" onclick="${!isRecruiting ? `openUnitRecruitModal('${u.key}', '${buildingKey}')` : ''}">
          <h5>${u.name}</h5>
          <div class="unit-mini-stats">
            <span>⚔️${u.stats?.attack}</span>
            <span>🛡️${u.stats?.defense}</span>
            <span>🏃${u.stats?.speed}</span>
          </div>
          <div class="unit-mini-cost ${canAfford ? '' : 'insufficient'}">
            <span>🪵${unitCost.wood}</span>
            <span>⛏️${unitCost.iron}</span>
          </div>
        </div>
        ${isRecruiting ? '<div class="unit-blocked">⏳ En cours...</div>' : ''}
      </div>
    `;
  };

  // Helper function to render a class section
  const renderClassSection = (className, classLabel, classIcon, units) => {
    if (!units || units.length === 0) return '';
    return `
      <div class="unit-class-section">
        <div class="class-section-header">
          <span class="class-icon">${classIcon}</span>
          <span class="class-label">${classLabel}</span>
          <span class="class-count">(${units.length})</span>
        </div>
        <div class="units-recruit-grid">
          ${units.map(u => renderUnitCard(u, isRecruiting, buildingKey)).join('')}
        </div>
      </div>
    `;
  };

  // Build sections based on building type
  let unitsHtml = '';
  if (buildingKey === 'BARRACKS') {
    // Separate Infantry and Archers
    unitsHtml += renderClassSection('INFANTRY', 'Infanterie', '⚔️', unitsByClass['INFANTRY']);
    unitsHtml += renderClassSection('ARCHER', 'Archers', '🏹', unitsByClass['ARCHER']);
  } else if (buildingKey === 'STABLE') {
    unitsHtml += renderClassSection('CAVALRY', 'Cavalerie', '🐎', unitsByClass['CAVALRY']);
  } else if (buildingKey === 'WORKSHOP') {
    unitsHtml += renderClassSection('SIEGE', 'Machines de siège', '⚙️', unitsByClass['SIEGE']);
  }

  content.innerHTML = `
    <div class="recruitment-panel">
      <!-- Building info header -->
      <div class="recruit-building-header">
        <div class="building-icon-large">${buildingIcons[buildingKey]}</div>
        <div class="building-info">
          <h3>${buildingNames[buildingKey]}</h3>
          <p class="building-level">Niveau ${buildingLevel}</p>
          <p class="tier-info">
            ${buildingLevel < 9 ? '🔹 Unités de base (Niv.1-8)' :
              buildingLevel < 15 ? '🔹 Base + Intermédiaires (Niv.9-14)' :
              '🔹 Toutes les unités (Niv.15+)'}
          </p>
        </div>
        <button class="upgrade-building-btn" onclick="closeBuildPanel(); openBuildPanelUpgrade('${buildingKey}', ${slotNum})">
          ⬆️ Améliorer
        </button>
      </div>

      <!-- Current recruitment queue -->
      ${currentQueue.length > 0 ? `
        <div class="current-recruitment">
          <h4>🔄 En cours de recrutement</h4>
          <div class="recruit-queue-items">
            ${currentQueue.map(q => `
              <div class="recruit-queue-item ${q.status === 'RUNNING' ? 'running' : 'queued'}">
                <span class="queue-unit">${q.count}x ${getUnitName(q.unitKey)}</span>
                <span class="queue-time">${q.status === 'RUNNING' ? formatTime(q.endsAt) : 'En attente'}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Available units by class -->
      <div class="available-units">
        <h4>🎖️ Recruter des unités</h4>
        <p class="recruit-hint">💡 Cliquez sur l'icône d'une unité pour voir ses statistiques détaillées</p>
        ${unitsHtml || `
          <div class="no-units-available">
            <p>Aucune unité disponible</p>
            <p class="hint">Améliorez le bâtiment pour débloquer plus d'unités</p>
          </div>
        `}
      </div>

      ${isRecruiting ? `
        <div class="recruitment-warning">
          <span>⚠️</span>
          <span>Un recrutement est déjà en cours. Attendez qu'il se termine.</span>
        </div>
      ` : ''}
    </div>
  `;

  panel.style.display = 'flex';
}

// Open unit recruit modal (from recruitment panel)
function openUnitRecruitModal(unitKey, buildingKey) {
  const unit = unitsData.find(u => u.key === unitKey);
  if (!unit) return;
  
  closeBuildPanel();
  
  const modal = document.getElementById('modal');
  const tierColor = TIER_COLORS[unit.tier] || '#aaa';
  
  // Use per-unit GDD costs from units data (class-specific + tier multiplier)
  const unitCost = unit.recruitCost || { wood: 50, stone: 30, iron: 60, food: 30 };

  // Training time from GDD data
  const baseTime = unit.recruitTimeSec || 360;

  // Upkeep (GDD economy_config.json values)
  const foodUpkeep = unit.tier === 'base' ? 5 : unit.tier === 'intermediate' ? 10 : unit.tier === 'elite' ? 15 : 15;
  
  const wood = currentCity?.wood || 0;
  const stone = currentCity?.stone || 0;
  const iron = currentCity?.iron || 0;
  const food = currentCity?.food || 0;
  
  const getResourceClass = (needed, available) => needed <= available ? 'res-available' : 'res-missing';
  const canAffordOne = wood >= unitCost.wood && stone >= unitCost.stone && iron >= unitCost.iron && food >= unitCost.food;
  
  document.getElementById('modal-body').innerHTML = `
    <div class="unit-detail-modal">
      <div class="unit-detail-header" style="background: linear-gradient(135deg, ${tierColor}33 0%, transparent 100%); border-left: 4px solid ${tierColor}">
        <div class="unit-detail-icon">${UNIT_ICONS[unit.class] || '⚔️'}</div>
        <div class="unit-detail-title">
          <h2>${unit.name}</h2>
          <div class="unit-badges">
            <span class="tier-badge" style="background: ${tierColor}">${unit.tier.toUpperCase()}</span>
            <span class="class-badge">${unit.class}</span>
          </div>
        </div>
      </div>
      
      <div class="unit-stats-full">
        <h4>📊 Statistiques</h4>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-icon">⚔️</span>
            <span class="stat-label">Attaque</span>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width: ${Math.min(100, unit.stats?.attack || 0)}%; background: #e74c3c"></div>
            </div>
            <span class="stat-value">${unit.stats?.attack || 0}</span>
          </div>
          <div class="stat-item">
            <span class="stat-icon">🛡️</span>
            <span class="stat-label">Défense</span>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width: ${Math.min(100, unit.stats?.defense || 0)}%; background: #3498db"></div>
            </div>
            <span class="stat-value">${unit.stats?.defense || 0}</span>
          </div>
          <div class="stat-item">
            <span class="stat-icon">🏃</span>
            <span class="stat-label">Vitesse</span>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width: ${Math.min(100, unit.stats?.speed || 0)}%; background: #f39c12"></div>
            </div>
            <span class="stat-value">${unit.stats?.speed || 0}</span>
          </div>
        </div>
      </div>
      
      <div class="unit-costs">
        <h4>💰 Coût par unité</h4>
        <div class="cost-row">
          <span class="cost-item ${getResourceClass(unitCost.wood, wood)}">🪵 ${unitCost.wood}</span>
          <span class="cost-item ${getResourceClass(unitCost.stone, stone)}">🪨 ${unitCost.stone}</span>
          <span class="cost-item ${getResourceClass(unitCost.iron, iron)}">⛏️ ${unitCost.iron}</span>
          <span class="cost-item ${getResourceClass(unitCost.food, food)}">🌾 ${unitCost.food}</span>
        </div>
      </div>
      
      <div class="unit-info-row">
        <div class="info-box">
          <span class="info-icon">⏱️</span>
          <span class="info-label">Formation</span>
          <span class="info-value">${formatDuration(baseTime)}</span>
        </div>
        <div class="info-box upkeep">
          <span class="info-icon">🌾</span>
          <span class="info-label">Céréales/h</span>
          <span class="info-value">${foodUpkeep}</span>
        </div>
      </div>
      
      <div class="recruit-section">
        <h4>🎖️ Recruter</h4>
        <div class="recruit-row">
          <input type="number" id="recruit-count" value="10" min="1" max="1000" class="recruit-input"
                 data-wood="${unitCost.wood}" data-stone="${unitCost.stone}" 
                 data-iron="${unitCost.iron}" data-food="${unitCost.food}">
          <button id="recruit-btn" onclick="recruitFromBuilding('${unit.key}', '${buildingKey}')" 
                  class="recruit-action-btn ${canAffordOne ? '' : 'disabled'}">
            Recruter
          </button>
        </div>
        <div class="recruit-total" id="recruit-total"></div>
      </div>
    </div>
  `;
  
  // Update total cost dynamically
  const updateRecruitTotal = () => {
    const input = document.getElementById('recruit-count');
    const totalDiv = document.getElementById('recruit-total');
    const btn = document.getElementById('recruit-btn');
    if (!input || !totalDiv || !btn) return;
    
    const count = Math.max(1, parseInt(input.value) || 1);
    const totalWood = unitCost.wood * count;
    const totalStone = unitCost.stone * count;
    const totalIron = unitCost.iron * count;
    const totalFood = unitCost.food * count;
    
    const canAfford = wood >= totalWood && stone >= totalStone && iron >= totalIron && food >= totalFood;
    
    totalDiv.innerHTML = `
      <span class="cost-label">Coût total:</span>
      <span class="${totalWood <= wood ? 'res-available' : 'res-missing'}">🪵 ${formatNum(totalWood)}</span>
      <span class="${totalStone <= stone ? 'res-available' : 'res-missing'}">🪨 ${formatNum(totalStone)}</span>
      <span class="${totalIron <= iron ? 'res-available' : 'res-missing'}">⛏️ ${formatNum(totalIron)}</span>
      <span class="${totalFood <= food ? 'res-available' : 'res-missing'}">🌾 ${formatNum(totalFood)}</span>
    `;
    
    btn.classList.toggle('disabled', !canAfford);
  };
  
  setTimeout(() => {
    updateRecruitTotal();
    const input = document.getElementById('recruit-count');
    if (input) input.oninput = updateRecruitTotal;
  }, 50);
  
  modal.style.display = 'flex';
}

// Global action guard to prevent double-click on any resource-modifying action
let _actionInProgress = false;

// Recruit from building
async function recruitFromBuilding(unitKey, buildingKey) {
  if (_actionInProgress) return;
  _actionInProgress = true;
  const countInput = document.getElementById('recruit-count');
  const count = parseInt(countInput?.value) || 1;
  
  if (count < 1) {
    showToast('Nombre invalide', 'error');
    return;
  }
  
  try {
    const res = await fetch(`${API}/api/city/${currentCity.id}/recruit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ unitKey, count, buildingKey })
    });
    
    const data = await res.json();
    closeModal();
    
    if (res.ok) {
      showToast(`Recrutement de ${count}x ${getUnitName(unitKey)} lancé!`, 'success');
      await loadCities();
      renderCity();
    } else {
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur de connexion', 'error');
  } finally {
    _actionInProgress = false;
  }
}

// Open upgrade panel for military building
function openBuildPanelUpgrade(buildingKey, slotNum) {
  selectedBuildSlot = slotNum;
  const panel = document.getElementById('build-panel');
  const content = document.getElementById('build-panel-content');
  const title = document.getElementById('build-panel-title');
  
  const building = currentCity?.buildings?.find(b => b.key === buildingKey);
  const level = building?.level || 1;
  const def = buildingsData.find(b => b.key === buildingKey);
  const maxLevel = def?.maxLevel || 20;
  // Other buildings cannot exceed MAIN_HALL level
  const upMainHall = currentCity?.buildings?.find(b => b.key === 'MAIN_HALL');
  const upMainHallLevel = upMainHall?.level || 1;
  const upEffectiveMax = buildingKey === 'MAIN_HALL' ? maxLevel : Math.min(maxLevel, upMainHallLevel);
  const canUpgrade = level < upEffectiveMax;
  const nextLevel = level + 1;
  
  let overlay = document.querySelector('.build-panel-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'build-panel-overlay';
    overlay.onclick = closeBuildPanel;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'block';
  
  // Cost formula must match backend: Math.pow(1.5, targetLevel - 1) where targetLevel = level + 1
  const costMultiplier = Math.pow(1.28, level);
  const nextCost = {
    wood: Math.floor((def?.costL1?.wood || 50) * costMultiplier),
    stone: Math.floor((def?.costL1?.stone || 50) * costMultiplier),
    iron: Math.floor((def?.costL1?.iron || 50) * costMultiplier),
    food: Math.floor((def?.costL1?.food || 30) * costMultiplier)
  };

  // Time formula must match backend: Math.pow(1.8, targetLevel - 1)
  const baseDuration = def?.timeL1Sec || 60;
  const buildTime = Math.floor(baseDuration * Math.pow(1.2, level));
  
  const hasResources = currentCity && 
    currentCity.wood >= nextCost.wood &&
    currentCity.stone >= nextCost.stone &&
    currentCity.iron >= nextCost.iron &&
    currentCity.food >= nextCost.food;
  
  title.innerHTML = `${BUILDING_ICONS[buildingKey]} ${getBuildingName(buildingKey)} - Amélioration`;
  
  content.innerHTML = `
    <div class="building-detail-card">
      <div class="building-detail-header">
        <div class="building-level-display">
          <div class="level-circle">${level}</div>
          <span class="level-label">Niveau</span>
        </div>
        <div class="building-image-container">
          <div class="building-image">${BUILDING_ICONS[buildingKey]}</div>
        </div>
        <div class="building-max-level">
          <span class="max-label">Max</span>
          <div class="max-circle">${upEffectiveMax}</div>
        </div>
      </div>
      
      <div class="tier-unlock-info">
        <h4>🎖️ Unités débloquées</h4>
        <div class="tier-list">
          <div class="tier-item ${level >= 1 ? 'unlocked' : 'locked'}">
            <span>Niv. 1+</span> Base
          </div>
          <div class="tier-item ${level >= 9 ? 'unlocked' : 'locked'}">
            <span>Niv. 9+</span> Intermédiaire
          </div>
          <div class="tier-item ${level >= 15 ? 'unlocked' : 'locked'}">
            <span>Niv. 15+</span> Elite
          </div>
        </div>
      </div>
      
      ${canUpgrade ? `
        <div class="upgrade-section">
          <h4>⬆️ Améliorer au niveau ${nextLevel}</h4>
          <div class="cost-grid">
            <div class="cost-item ${currentCity?.wood >= nextCost.wood ? 'available' : 'missing'}">
              <span class="cost-icon">🪵</span>
              <span class="cost-value">${formatNum(nextCost.wood)}</span>
              <div class="cost-bar"><div class="cost-bar-fill" style="width: ${Math.min(100, (currentCity?.wood / nextCost.wood) * 100)}%"></div></div>
            </div>
            <div class="cost-item ${currentCity?.stone >= nextCost.stone ? 'available' : 'missing'}">
              <span class="cost-icon">🪨</span>
              <span class="cost-value">${formatNum(nextCost.stone)}</span>
              <div class="cost-bar"><div class="cost-bar-fill" style="width: ${Math.min(100, (currentCity?.stone / nextCost.stone) * 100)}%"></div></div>
            </div>
            <div class="cost-item ${currentCity?.iron >= nextCost.iron ? 'available' : 'missing'}">
              <span class="cost-icon">⛏️</span>
              <span class="cost-value">${formatNum(nextCost.iron)}</span>
              <div class="cost-bar"><div class="cost-bar-fill" style="width: ${Math.min(100, (currentCity?.iron / nextCost.iron) * 100)}%"></div></div>
            </div>
            <div class="cost-item ${currentCity?.food >= nextCost.food ? 'available' : 'missing'}">
              <span class="cost-icon">🌾</span>
              <span class="cost-value">${formatNum(nextCost.food)}</span>
              <div class="cost-bar"><div class="cost-bar-fill" style="width: ${Math.min(100, (currentCity?.food / nextCost.food) * 100)}%"></div></div>
            </div>
          </div>
          <div class="upgrade-footer">
            <div class="build-time">⏱️ ${formatDuration(buildTime)}</div>
            <button class="upgrade-btn ${hasResources && !isBuildQueueFull() ? '' : 'disabled'}"
                    onclick="upgradeBuilding('${buildingKey}', ${slotNum})"
                    ${hasResources && !isBuildQueueFull() ? '' : 'disabled'}>
              ${isBuildQueueFull() ? '⏳ File pleine' : hasResources ? '🔨 Ameliorer' : '❌ Ressources insuffisantes'}
            </button>
          </div>
        </div>
      ` : `
        <div class="max-level-notice">
          <span class="max-icon">${level >= maxLevel ? '🏆' : '🔒'}</span>
          <p>${level >= maxLevel ? 'Niveau maximum atteint!' : `Limité par le Bâtiment principal (Niv.${upMainHallLevel})`}</p>
          ${level < maxLevel ? `<p class="bonus-hint">Améliorez le Bâtiment principal pour débloquer les niveaux suivants</p>` : ''}
        </div>
      `}

      <button class="back-to-recruit-btn" onclick="closeBuildPanel(); openBuildPanel(${slotNum})">
        ← Retour au recrutement
      </button>
    </div>
  `;
  
  panel.style.display = 'flex';
}

// Get unit name helper
function getUnitName(unitKey) {
  const unit = unitsData.find(u => u.key === unitKey);
  return unit?.name || unitKey;
}

let _buildInProgress = false;

function isBuildQueueFull() {
  const queueSize = currentCity?.buildQueue?.length || 0;
  return queueSize >= 4;
}

async function buildField(buildingKey, slot) {
  if (_buildInProgress) return;
  if (isBuildQueueFull()) {
    showToast('File de construction pleine (4/4)', 'error');
    return;
  }
  _buildInProgress = true;
  try {
    const res = await fetch(`${API}/api/city/${currentCity.id}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ buildingKey, slot })
    });

    const data = await res.json();

    if (res.ok) {
      closeBuildPanel();
      showToast(`Construction de ${getBuildingName(buildingKey)} lancee!`, 'success');
      await loadCities();
      renderCity();
    } else {
      showToast(data.error || 'Erreur de construction', 'error');
    }
  } catch (e) {
    console.error('buildField error:', e);
    showToast('Erreur reseau', 'error');
  } finally {
    _buildInProgress = false;
  }
}

async function buildAtSlot(buildingKey, slot) {
  if (_buildInProgress) return;
  if (isBuildQueueFull()) {
    showToast('File de construction pleine (4/4)', 'error');
    return;
  }
  _buildInProgress = true;
  try {
    const res = await fetch(`${API}/api/city/${currentCity.id}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ buildingKey, slot })
    });

    const data = await res.json();

    if (res.ok) {
      closeBuildPanel();
      showToast(`Construction de ${getBuildingName(buildingKey)} lancee!`, 'success');
      await loadCities();
      renderCity();
    } else {
      showToast(data.error || 'Erreur de construction', 'error');
    }
  } catch (e) {
    console.error('buildAtSlot error:', e);
    showToast('Erreur reseau', 'error');
  } finally {
    _buildInProgress = false;
  }
}

async function upgradeBuilding(buildingKey, slot) {
  await buildAtSlot(buildingKey, slot);
}

function getBuildingDescription(key) {
  // Chercher dans buildingsData d'abord (contient les descriptions des 39 bâtiments)
  const building = window.buildingsData?.find(b => b.key === key);
  if (building?.description) return building.description;

  const descriptions = {
    MAIN_HALL: 'Réduit le temps de construction',
    BARRACKS: 'Entraîne l\'infanterie et les archers',
    STABLE: 'Entraîne la cavalerie',
    WORKSHOP: 'Construit des machines de siège',
    ACADEMY: 'Recherche et formation',
    FORGE: 'Améliore l\'équipement',
    MARKET: 'Commerce et échanges',
    WAREHOUSE: 'Stocke les ressources',
    SILO: 'Stocke la nourriture',
    WALL: 'Défense de la ville',
    HEALING_TENT: 'Soigne les blessés',
    RALLY_POINT: 'Rassemblement des armées',
    HIDEOUT: 'Cache des ressources',
    MOAT: 'Douves défensives',
    FARM: 'Produit de la nourriture',
    LUMBER: 'Produit du bois',
    QUARRY: 'Produit de la pierre',
    IRON_MINE: 'Produit du fer',
    MILL: 'Augmente production céréales',
    BAKERY: 'Augmente production céréales',
    SAWMILL: 'Augmente production bois',
    STONEMASON: 'Augmente production pierre',
    FOUNDRY: 'Augmente production fer',
    GREAT_SILO: 'Stockage protégé nourriture',
    GREAT_WAREHOUSE: 'Stockage protégé ressources',
    GREAT_BARRACKS: 'Recrutement hors capitale',
    GREAT_STABLE: 'Cavalerie hors capitale',
    WATCHTOWER: 'Détection et espionnage',
    EMBASSY: 'Gestion des alliances',
    TREASURE_CHAMBER: 'Produit de l\'or',
    HERO_MANSION: 'Gestion du héros',
    RESIDENCE: 'Formation de colons',
    TRADE_OFFICE: 'Bonus commerce',
    ROMAN_THERMAE: 'Soins rapides (Rome)',
    GALLIC_BREWERY: 'Défense siège (Gaule)',
    GREEK_TEMPLE: 'Recherche bonus (Grèce)',
    EGYPTIAN_IRRIGATION: 'Production bonus (Égypte)',
    HUN_WAR_TENT: 'Entretien réduit (Huns)',
    SULTAN_DESERT_OUTPOST: 'Commerce bonus (Sultanat)',
    HERO_HOME: 'Gestion du héros'
  };
  return descriptions[key] || 'Bâtiment';
}

// (resize handler consolidated below in map section)

// Animation loop for construction (250ms = 4 FPS, sufficient for progress bars)
let constructionAnimInterval = null;
function startConstructionAnimation() {
  if (constructionAnimInterval) return;
  constructionAnimInterval = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (document.getElementById('tab-city')?.classList.contains('active') &&
        currentCity?.buildQueue?.some(q => q.status === 'RUNNING')) {
      renderCityCanvas();
    }
  }, 250);
}
startConstructionAnimation();

// ========== QUEUE STATUS BAR & DROPDOWNS ==========
function toggleQueueDropdown(type) {
  const dropdown = document.getElementById(`${type}-queue-dropdown`);
  const statusItem = document.getElementById(`${type}-status`);
  const otherType = type === 'build' ? 'recruit' : 'build';
  const otherDropdown = document.getElementById(`${otherType}-queue-dropdown`);
  const otherStatus = document.getElementById(`${otherType}-status`);

  // Close the other dropdown
  if (otherDropdown) otherDropdown.classList.remove('open');
  if (otherStatus) otherStatus.classList.remove('open');

  // Toggle this dropdown
  if (dropdown) dropdown.classList.toggle('open');
  if (statusItem) statusItem.classList.toggle('open');
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(e) {
  const bar = document.getElementById('queue-status-bar');
  const buildDD = document.getElementById('build-queue-dropdown');
  const recruitDD = document.getElementById('recruit-queue-dropdown');
  if (bar && !bar.contains(e.target) &&
      buildDD && !buildDD.contains(e.target) &&
      recruitDD && !recruitDD.contains(e.target)) {
    buildDD.classList.remove('open');
    recruitDD.classList.remove('open');
    document.getElementById('build-status')?.classList.remove('open');
    document.getElementById('recruit-status')?.classList.remove('open');
  }
});

function renderBuildQueue() {
  const queue = currentCity?.buildQueue || [];
  const running = queue.filter(q => q.status === 'RUNNING').sort((a, b) => new Date(a.endsAt) - new Date(b.endsAt));
  const queued = queue.filter(q => q.status === 'QUEUED').sort((a, b) => a.slot - b.slot);

  // Update status bar text
  const statusItem = document.getElementById('build-status');
  const statusText = document.getElementById('build-status-text');
  const statusTimer = document.getElementById('build-status-timer');

  if (statusText) {
    const total = running.length + queued.length;
    if (running.length > 0) {
      const suffix = total > 1 ? ` (+${total - 1})` : '';
      statusText.textContent = `${getBuildingName(running[0].buildingKey)} Niv.${running[0].targetLevel}${suffix}`;
      if (statusTimer) {
        statusTimer.textContent = formatTime(running[0].endsAt);
        statusTimer.dataset.endsAt = running[0].endsAt;
      }
      statusItem?.classList.add('active');
    } else if (queued.length > 0) {
      statusText.textContent = `${queued.length} en attente`;
      if (statusTimer) { statusTimer.textContent = ''; statusTimer.dataset.endsAt = ''; }
      statusItem?.classList.add('active');
    } else {
      statusText.textContent = 'Aucune construction';
      if (statusTimer) { statusTimer.textContent = ''; statusTimer.dataset.endsAt = ''; }
      statusItem?.classList.remove('active');
    }
  }

  // Update dropdown content
  const listEl = document.getElementById('build-queue-list');
  if (listEl) {
    if (running.length > 0 || queued.length > 0) {
      let html = '';
      if (running.length > 0) {
        html += '<div class="qd-section-header">🔨 En cours (${running.length}/2)</div>'.replace('${running.length}', running.length);
        running.forEach((q, i) => {
          html += `<div class="qd-item running">
            <span class="qd-num">${i + 1}</span>
            <span class="qd-name">${BUILDING_ICONS[q.buildingKey] || '🏠'} ${getBuildingName(q.buildingKey)}</span>
            <span class="qd-level">Niv.${q.targetLevel}</span>
            <span class="qd-timer" data-ends-at="${q.endsAt}">${formatTime(q.endsAt)}</span>
          </div>`;
        });
      }
      if (queued.length > 0) {
        html += '<div class="qd-section-header">⏳ En attente (${queued.length}/2)</div>'.replace('${queued.length}', queued.length);
        queued.forEach((q, i) => {
          html += `<div class="qd-item queued">
            <span class="qd-num">${i + 1}</span>
            <span class="qd-name">${BUILDING_ICONS[q.buildingKey] || '🏠'} ${getBuildingName(q.buildingKey)}</span>
            <span class="qd-level">Niv.${q.targetLevel}</span>
            <span class="qd-status">En attente</span>
          </div>`;
        });
      }
      listEl.innerHTML = html;
    } else {
      listEl.innerHTML = '<div class="qd-empty">Aucune construction en cours</div>';
    }
  }
}

function renderRecruitQueue() {
  const queue = currentCity?.recruitQueue || [];

  // Update status bar text
  const statusItem = document.getElementById('recruit-status');
  const statusText = document.getElementById('recruit-status-text');
  const statusTimer = document.getElementById('recruit-status-timer');

  if (statusText) {
    if (queue.length > 0) {
      const first = queue[0];
      statusText.textContent = `${first.count}x ${getUnitName(first.unitKey)}`;
      if (statusTimer) {
        statusTimer.textContent = formatTime(first.endsAt);
        statusTimer.dataset.endsAt = first.endsAt;
      }
      statusItem?.classList.add('active');
    } else {
      statusText.textContent = 'Aucun recrutement';
      if (statusTimer) { statusTimer.textContent = ''; statusTimer.dataset.endsAt = ''; }
      statusItem?.classList.remove('active');
    }
  }

  // Update dropdown content
  const listEl = document.getElementById('recruit-queue-list');
  if (listEl) {
    if (queue.length > 0) {
      listEl.innerHTML = queue.map(q => `
        <div class="qd-item running">
          <span>⚔️</span>
          <span class="qd-name">${q.count}x ${getUnitName(q.unitKey)}</span>
          <span class="qd-timer" data-ends-at="${q.endsAt}">${formatTime(q.endsAt)}</span>
        </div>
      `).join('');
    } else {
      listEl.innerHTML = '<div class="qd-empty">Aucun recrutement en cours</div>';
    }
  }
}

function renderMovingArmies() {
  const moving = armies.filter(a => a.status !== 'IDLE');

  const missionIcons = {
    'ATTACK': '⚔️',
    'RAID': '💰',
    'SUPPORT': '🛡️',
    'SPY': '🔍',
    'TRANSPORT': '📦',
    'RETURNING': '🏠',
    'MOVING': '🚶'
  };

  // Update activity bar
  const activityEl = document.getElementById('movement-activity');
  if (activityEl) {
    if (moving.length > 0) {
      const first = moving[0];
      const icon = missionIcons[first.missionType] || missionIcons[first.status] || '🚶';
      activityEl.classList.add('active');
      activityEl.innerHTML = `
        <span class="activity-icon">${icon}</span>
        <span class="activity-text">${first.name || 'Armée'}</span>
        <span class="activity-timer" data-ends-at="${first.arrivalAt || ''}">${first.arrivalAt ? formatTime(first.arrivalAt) : '-'}</span>
        ${moving.length > 1 ? `<span class="activity-more">+${moving.length - 1}</span>` : ''}
      `;
    } else {
      activityEl.classList.remove('active');
      activityEl.innerHTML = `
        <span class="activity-icon">🚶</span>
        <span class="activity-text">Aucun mouvement</span>
      `;
    }
  }

  // Also update legacy moving-armies element if it exists
  const legacyEl = document.getElementById('movement-queue') || document.getElementById('moving-armies');
  if (legacyEl) {
    if (moving.length === 0) {
      legacyEl.innerHTML = '<p style="color:var(--text-muted);font-size:11px;text-align:center;">Aucun mouvement</p>';
    } else {
      legacyEl.innerHTML = moving.map(a => `
        <div class="queue-item">
          <span class="queue-icon">${missionIcons[a.missionType] || missionIcons[a.status] || '🚶'}</span>
          <div class="queue-info">
            <span class="queue-name">${a.name || 'Armée'}</span>
            <span class="queue-time">${a.arrivalAt ? formatTime(a.arrivalAt) : '-'}</span>
          </div>
        </div>
      `).join('');
    }
  }
}

// ========== WOUNDED UNITS ==========
async function loadWounded() {
  if (!currentCity) return;

  try {
    const res = await fetch(`${API}/api/city/${currentCity.id}/wounded`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const wounded = await res.json();
      renderWounded(wounded);
    }
  } catch (e) {
    console.warn('Could not load wounded:', e);
  }
}

function renderWounded(wounded) {
  const el = document.getElementById('wounded-list');
  if (!el) return;

  if (!wounded || wounded.length === 0) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:11px;text-align:center;">Aucun blessé</p>';
    return;
  }

  el.innerHTML = wounded.map(w => {
    const timeLeft = Math.max(0, w.timeToHeal);
    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);

    return `
      <div class="wounded-item">
        <span class="wounded-icon">🩹</span>
        <span class="wounded-count">${w.count}x ${w.unitName || w.unitKey}</span>
        <span class="wounded-time">${minutes}:${seconds.toString().padStart(2, '0')}</span>
        <button class="btn-small" onclick="healWounded('${w.unitKey}')" title="Soigner (${w.count} or)">💰</button>
      </div>
    `;
  }).join('');
}

async function healWounded(unitKey) {
  if (!currentCity) return;
  if (_actionInProgress) return;
  _actionInProgress = true;
  try {
    const res = await fetch(`${API}/api/city/${currentCity.id}/wounded/heal`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ unitKey })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(`${data.healed} unités soignées! (-${data.goldSpent} or)`, 'success');
      loadWounded();
      loadPlayer(); // Refresh gold
    } else {
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur reseau', 'error');
  } finally {
    _actionInProgress = false;
  }
}

// ========== CITY STATS SIDEBAR ==========
function updateCityStats() {
  if (!currentCity) return;

  // Get building levels
  const warehouse = currentCity.buildings?.find(b => b.key === 'WAREHOUSE');
  const silo = currentCity.buildings?.find(b => b.key === 'SILO');
  const wall = currentCity.buildings?.find(b => b.key === 'WALL');

  // Calculate storage (base 1000 + 500 per warehouse level)
  const storageLevel = warehouse?.level || 0;
  const maxStorage = 1000 + (storageLevel * 500);
  const currentStorage = Math.floor((currentCity.wood || 0) + (currentCity.stone || 0) + (currentCity.iron || 0));

  // Calculate silo (base 1000 + 500 per silo level)
  const siloLevel = silo?.level || 0;
  const maxSilo = 1000 + (siloLevel * 500);
  const currentSilo = Math.floor(currentCity.food || 0);

  // Wall HP
  const wallLevel = wall?.level || 0;
  const maxWallHp = wallLevel * 100;
  const currentWallHp = currentCity.wallHp || maxWallHp;

  // Update display
  const storageEl = document.getElementById('city-storage');
  const siloEl = document.getElementById('city-silo');
  const wallsEl = document.getElementById('city-walls');

  if (storageEl) storageEl.textContent = `${formatNum(currentStorage)}/${formatNum(maxStorage)}`;
  if (siloEl) siloEl.textContent = `${formatNum(currentSilo)}/${formatNum(maxSilo)}`;
  if (wallsEl) wallsEl.textContent = wallLevel > 0 ? `${currentWallHp}/${maxWallHp}` : 'Pas de mur';
}

// ========== TABS ==========
function showTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bnav-tab').forEach(b => b.classList.remove('active'));

  const tabEl = document.getElementById(`tab-${tabName}`);
  if (tabEl) tabEl.classList.add('active');
  // Activate both old nav-tab and new bnav-tab
  document.querySelector(`.nav-tab[data-tab="${tabName}"]`)?.classList.add('active');
  document.querySelector(`.bnav-tab[data-tab="${tabName}"]`)?.classList.add('active');
  
  // Start/stop animations based on tab
  if (tabName === 'city' || tabName === 'fields') {
    startCityAnimation();
  } else {
    stopCityAnimation();
  }

  // Stop map animation if not on map
  if (tabName !== 'map' && typeof stopMapAnimation === 'function') {
    stopMapAnimation();
  }

  // Special handling for fields/city tabs - they share the city-canvas
  if (tabName === 'fields' || tabName === 'city') {
    // Show city tab container (both use city-canvas)
    document.getElementById('tab-fields')?.classList.remove('active');
    document.getElementById('tab-city')?.classList.add('active');
    currentCityView = tabName;
    // Init canvas if not yet done (ensures event handlers are attached)
    if (!cityCanvas || !cityCtx) initCityCanvas();
    // Ensure canvas is properly sized (may have been hidden)
    if (cityCanvas) {
      const container = cityCanvas.parentElement;
      if (container && container.clientWidth > 0) {
        cityCanvas.width = Math.max(container.clientWidth, 300);
        cityCanvas.height = Math.max(container.clientHeight, 200);
      }
    }
    if (tabName === 'fields') calculateFieldSlots();
    else calculateCitySlots();
    renderCityCanvas();
    return;
  }

  // Load tab content
  switch(tabName) {
    case 'buildings': loadBuildings(); break;
    case 'army': renderArmies(); break;
    case 'recruit': loadUnits(); break;
    case 'hero': loadHero(); break;
    case 'inventory': loadInventory(); break;
    case 'expeditions': loadExpeditions(); break;
    case 'map': loadMap(); break;
    case 'alliance': loadAlliance(); break;
    case 'market': loadMarket(); break;
    case 'ranking': loadRanking('players'); break;
    case 'reports': loadReports(); break;
  }
}

// ========== BUILDINGS ==========
let buildingsData = [];
window.buildingsData = buildingsData; // Rendre accessible globalement

async function loadBuildings() {
  // Utiliser le cache si disponible
  const cached = cache.get('buildings');
  if (cached) {
    buildingsData = cached;
    window.buildingsData = buildingsData;
    renderBuildings('all');
    return;
  }

  try {
    const res = await requestManager.fetchWithRetry(`${API}/api/buildings`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const raw = await res.json();
      buildingsData = Array.isArray(raw) ? raw : (raw.buildings || []);
      window.buildingsData = buildingsData;
      cache.set('buildings', buildingsData);
    }
  } catch (e) {
    console.warn('loadBuildings error:', e);
  }
  renderBuildings('all');
}

function renderBuildings(filter) {
  const grid = document.getElementById('buildings-grid');
  let buildings = buildingsData.filter(b => {
    // Filter faction buildings: only show those matching player faction
    if (b.category === 'FACTION' && b.faction && player?.faction && b.faction !== player.faction) return false;
    return true;
  });

  if (filter !== 'all') {
    buildings = buildings.filter(b => b.category === filter);
  }
  
  const rbMainHall = currentCity?.buildings?.find(cb => cb.key === 'MAIN_HALL');
  const rbMainHallLevel = rbMainHall?.level || 1;

  grid.innerHTML = buildings.map(b => {
    const existing = currentCity?.buildings?.find(cb => cb.key === b.key);
    const level = existing?.level || 0;
    const nextLevel = level + 1;
    const rbEffectiveMax = b.key === 'MAIN_HALL' ? b.maxLevel : Math.min(b.maxLevel, rbMainHallLevel);
    const canBuild = nextLevel <= rbEffectiveMax;
    const blockedByMainHall = !canBuild && level < b.maxLevel && b.key !== 'MAIN_HALL';

    return `
      <div class="card">
        <h3>${BUILDING_ICONS[b.key] || '🏠'} ${b.name}</h3>
        <p>Niveau actuel: ${level} / ${rbEffectiveMax}</p>
        <div class="stats">
          Coût: 🪵${formatNum(b.costL1?.wood || 50)} 🪨${formatNum(b.costL1?.stone || 50)} ⛏️${formatNum(b.costL1?.iron || 50)} 🌾${formatNum(b.costL1?.food || 50)}
        </div>
        ${isBuildQueueFull() ? '<p style="padding:10px;color:var(--error);">⏳ File de construction pleine (4/4)</p>' :
          canBuild ? `<button onclick="build('${b.key}')">Construire Niv.${nextLevel}</button>` :
          blockedByMainHall ? `<p style="padding:10px;color:#e67e22;">🔒 Bat. principal Niv.${rbMainHallLevel} requis</p>` :
          '<p style="padding:10px;color:var(--gold);">Niveau max</p>'}
      </div>
    `;
  }).join('');
}

async function build(buildingKey) {
  if (_buildInProgress) return;
  if (isBuildQueueFull()) {
    showToast('File de construction pleine (4/4)', 'error');
    return;
  }
  _buildInProgress = true;
  try {
    const res = await fetch(`${API}/api/city/${currentCity.id}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ buildingKey })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Construction lancée!', 'success');
      await loadCities();
      renderCity();
      loadBuildings();
    } else {
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    console.error('build error:', e);
    showToast('Erreur réseau', 'error');
  } finally {
    _buildInProgress = false;
  }
}

// ========== UNITS ==========
let unitsData = [];

async function loadUnits() {
  // Utiliser le cache si disponible
  const cached = cache.get('units');
  if (cached) {
    unitsData = cached;
    renderUnits('all');
    return;
  }
  
  try {
    const res = await requestManager.fetchWithRetry(`${API}/api/units`, { 
      headers: { Authorization: `Bearer ${token}` } 
    });
    if (res.ok) {
      const raw = await res.json();
      unitsData = Array.isArray(raw) ? raw : (raw.units || []);
      cache.set('units', unitsData);
    }
  } catch (e) {
    console.warn('loadUnits error:', e);
  }
  renderUnits('all');
}

function renderUnits(filter) {
  const grid = document.getElementById('units-grid');
  if (!grid) return;
  let units = unitsData.filter(u => u.faction === player?.faction);
  
  if (filter !== 'all') {
    units = units.filter(u => u.class === filter);
  }
  
  grid.innerHTML = units.map(u => `
    <div class="unit-card" onclick="showUnitDetail('${u.key}')">
      <div class="unit-card-header" style="border-color: ${TIER_COLORS[u.tier]}">
        <span class="unit-class-icon">${UNIT_ICONS[u.class] || '⚔️'}</span>
        <div class="unit-tier-badge" style="background: ${TIER_COLORS[u.tier]}">${u.tier.charAt(0).toUpperCase()}</div>
      </div>
      <div class="unit-card-body">
        <h3 class="unit-name">${u.name}</h3>
        <div class="unit-stats-mini">
          <span title="Attaque">⚔️${u.stats?.attack || 0}</span>
          <span title="Défense">🛡️${u.stats?.defense || 0}</span>
          <span title="Endurance">❤️${u.stats?.endurance || 0}</span>
          <span title="Vitesse">🏃${u.stats?.speed || 0}</span>
        </div>
      </div>
      <div class="unit-card-footer">
        <button class="recruit-btn" onclick="event.stopPropagation(); showRecruitModal('${u.key}', '${u.name}')">
          Recruter
        </button>
      </div>
    </div>
  `).join('');
}

// ===== UNIT DETAIL MODAL (Travian Style) =====
function showUnitDetail(unitKey) {
  const unit = unitsData.find(u => u.key === unitKey);
  if (!unit) return;
  
  const modal = document.getElementById('modal');
  const tierColor = TIER_COLORS[unit.tier] || '#aaa';
  
  // Use per-unit GDD costs from units data (class-specific + tier multiplier)
  const unitCost = unit.recruitCost || { wood: 50, stone: 30, iron: 60, food: 30 };

  // Upkeep (GDD economy_config.json values)
  const foodUpkeep = unit.tier === 'base' ? 5 : unit.tier === 'intermediate' ? 10 : unit.tier === 'elite' ? 15 : 15;

  // Training time from GDD data
  const trainTime = unit.recruitTimeSec || 360;
  
  // Helper function to check and color resources
  const getResourceClass = (needed, available) => needed <= available ? 'res-available' : 'res-missing';
  const wood = currentCity?.wood || 0;
  const stone = currentCity?.stone || 0;
  const iron = currentCity?.iron || 0;
  const food = currentCity?.food || 0;
  
  // Check if can afford 1 unit
  const canAffordOne = wood >= unitCost.wood && stone >= unitCost.stone && iron >= unitCost.iron && food >= unitCost.food;
  
  document.getElementById('modal-body').innerHTML = `
    <div class="unit-detail-modal">
      <!-- Header avec couleur tier -->
      <div class="unit-detail-header" style="background: linear-gradient(135deg, ${tierColor}33 0%, transparent 100%); border-left: 4px solid ${tierColor}">
        <div class="unit-detail-icon">${UNIT_ICONS[unit.class] || '⚔️'}</div>
        <div class="unit-detail-title">
          <h2>${unit.name}</h2>
          <div class="unit-badges">
            <span class="tier-badge" style="background: ${tierColor}">${unit.tier.toUpperCase()}</span>
            <span class="class-badge">${unit.class}</span>
            <span class="faction-badge">${unit.faction}</span>
          </div>
        </div>
      </div>
      
      <!-- Stats complètes -->
      <div class="unit-stats-full">
        <h4>📊 Statistiques</h4>
        <div class="stats-grid">
          <div class="stat-item attack">
            <span class="stat-icon">⚔️</span>
            <span class="stat-label">Attaque</span>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width: ${Math.min(100, unit.stats?.attack || 0)}%; background: #e74c3c"></div>
            </div>
            <span class="stat-value">${unit.stats?.attack || 0}</span>
          </div>
          <div class="stat-item defense">
            <span class="stat-icon">🛡️</span>
            <span class="stat-label">Défense</span>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width: ${Math.min(100, unit.stats?.defense || 0)}%; background: #3498db"></div>
            </div>
            <span class="stat-value">${unit.stats?.defense || 0}</span>
          </div>
          <div class="stat-item endurance">
            <span class="stat-icon">❤️</span>
            <span class="stat-label">Endurance</span>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width: ${Math.min(100, unit.stats?.endurance || 0)}%; background: #2ecc71"></div>
            </div>
            <span class="stat-value">${unit.stats?.endurance || 0}</span>
          </div>
          <div class="stat-item speed">
            <span class="stat-icon">🏃</span>
            <span class="stat-label">Vitesse</span>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width: ${Math.min(100, unit.stats?.speed || 0)}%; background: #f39c12"></div>
            </div>
            <span class="stat-value">${unit.stats?.speed || 0}</span>
          </div>
          <div class="stat-item transport">
            <span class="stat-icon">📦</span>
            <span class="stat-label">Transport</span>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width: ${Math.min(100, unit.stats?.transport || 0)}%; background: #9b59b6"></div>
            </div>
            <span class="stat-value">${unit.stats?.transport || 0}</span>
          </div>
        </div>
      </div>
      
      <!-- Coûts d'entraînement (avec couleurs selon ressources) -->
      <div class="unit-costs">
        <h4>💰 Coût par unité</h4>
        <div class="cost-row">
          <span class="cost-item ${getResourceClass(unitCost.wood, wood)}">🪵 ${unitCost.wood}</span>
          <span class="cost-item ${getResourceClass(unitCost.stone, stone)}">🪨 ${unitCost.stone}</span>
          <span class="cost-item ${getResourceClass(unitCost.iron, iron)}">⛏️ ${unitCost.iron}</span>
          <span class="cost-item ${getResourceClass(unitCost.food, food)}">🌾 ${unitCost.food}</span>
        </div>
      </div>
      
      <!-- Temps et consommation -->
      <div class="unit-info-row">
        <div class="info-box">
          <span class="info-icon">⏱️</span>
          <span class="info-label">Formation</span>
          <span class="info-value">${formatDuration(trainTime)}</span>
        </div>
        <div class="info-box upkeep">
          <span class="info-icon">🌾</span>
          <span class="info-label">Céréales/h</span>
          <span class="info-value">${foodUpkeep}</span>
        </div>
        <div class="info-box">
          <span class="info-icon">👥</span>
          <span class="info-label">Pop. (score)</span>
          <span class="info-value">${unit.tier === 'siege' ? 4 : unit.tier === 'elite' ? 3 : unit.tier === 'intermediate' ? 2 : 1}</span>
        </div>
      </div>
      
      <!-- Info consommation céréales -->
      <div class="upkeep-info">
        <span class="upkeep-icon">💡</span>
        <span>Chaque unité consomme <strong>${foodUpkeep} céréales/h</strong>. Si la production de nourriture est insuffisante, vos troupes mourront de faim!</span>
      </div>
      
      <!-- Section recrutement -->
      <div class="recruit-section">
        <h4>🎖️ Recruter</h4>
        <div class="recruit-row">
          <input type="number" id="recruit-count" value="10" min="1" max="1000" class="recruit-input" 
                 data-wood="${unitCost.wood}" data-stone="${unitCost.stone}" 
                 data-iron="${unitCost.iron}" data-food="${unitCost.food}">
          <button id="recruit-btn" onclick="recruit('${unit.key}')" class="recruit-action-btn ${canAffordOne ? '' : 'disabled'}">
            Recruter
          </button>
        </div>
        <div class="recruit-total" id="recruit-total"></div>
      </div>
    </div>
  `;
  
  // Update total cost and button state on input change
  const updateRecruitTotal = () => {
    const input = document.getElementById('recruit-count');
    const totalDiv = document.getElementById('recruit-total');
    const btn = document.getElementById('recruit-btn');
    if (!input || !totalDiv || !btn) return;
    
    const count = Math.max(1, parseInt(input.value) || 1);
    const totalWood = unitCost.wood * count;
    const totalStone = unitCost.stone * count;
    const totalIron = unitCost.iron * count;
    const totalFood = unitCost.food * count;
    
    const canAfford = wood >= totalWood && stone >= totalStone && iron >= totalIron && food >= totalFood;
    
    totalDiv.innerHTML = `
      <span class="cost-label">Coût total:</span>
      <span class="${totalWood <= wood ? 'res-available' : 'res-missing'}">🪵 ${formatNum(totalWood)}</span>
      <span class="${totalStone <= stone ? 'res-available' : 'res-missing'}">🪨 ${formatNum(totalStone)}</span>
      <span class="${totalIron <= iron ? 'res-available' : 'res-missing'}">⛏️ ${formatNum(totalIron)}</span>
      <span class="${totalFood <= food ? 'res-available' : 'res-missing'}">🌾 ${formatNum(totalFood)}</span>
    `;
    
    btn.classList.toggle('disabled', !canAfford);
    btn.title = canAfford ? '' : 'Ressources insuffisantes';
  };
  
  setTimeout(() => {
    updateRecruitTotal();
    const input = document.getElementById('recruit-count');
    if (input) input.oninput = updateRecruitTotal;
  }, 50);
  
  modal.style.display = 'flex';
}

function showRecruitModal(unitKey, unitName) {
  // Use the detailed modal instead
  showUnitDetail(unitKey);
}

async function recruit(unitKey) {
  if (_actionInProgress) return;
  _actionInProgress = true;
  try {
    const count = parseInt(document.getElementById('recruit-count').value) || 1;

    const res = await fetch(`${API}/api/city/${currentCity.id}/recruit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ unitKey, count })
    });

    const data = await res.json();
    closeModal();

    if (res.ok) {
      showToast(`Recrutement de ${count}x ${unitKey} lancé!`, 'success');
      await loadCities();
      renderCity();
    } else {
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur reseau', 'error');
  } finally {
    _actionInProgress = false;
  }
}

// ========== ARMIES ==========
// ========== ARMY MANAGEMENT SYSTEM ==========
// Max armées selon niveau Rally Point (1 à niv.1, 2 à niv.5, 3 à niv.10)
function getMaxArmies() {
  const rallyPoint = currentCity?.buildings?.find(b => b.key === 'RALLY_POINT');
  const level = rallyPoint?.level || 0;
  if (level >= 10) return 3;
  if (level >= 5) return 2;
  if (level >= 1) return 1;
  return 0; // Pas de Rally Point = pas d'armée
}

function renderArmies() {
  const container = document.getElementById('armies-management');
  const garrisonSummary = document.getElementById('garrison-summary');
  
  if (!container) return;

  // Get garrison units (units in city, not assigned to any army)
  const garrisonUnits = getGarrisonUnits();
  const cityArmies = armies.filter(a => a.cityId === currentCity?.id && !a.isGarrison);
  const maxArmies = getMaxArmies();
  const heroData = player?.hero;
  const heroAssignedToArmy = cityArmies.find(a => a.heroId === heroData?.id);

  // Rally Point info
  const rallyPoint = currentCity?.buildings?.find(b => b.key === 'RALLY_POINT');
  const rallyLevel = rallyPoint?.level || 0;

  // Total garrison count
  const totalGarrison = garrisonUnits.reduce((sum, u) => sum + u.count, 0);

  // Create garrison-summary if it doesn't exist
  if (!garrisonSummary) {
    const gs = document.createElement('div');
    gs.id = 'garrison-summary';
    container.parentNode.insertBefore(gs, container);
  }
  const gsSummary = document.getElementById('garrison-summary');
  if (!gsSummary) return;

  // Render garrison summary header (compact)
  gsSummary.innerHTML = `
    <div class="army-header-compact">
      <div class="header-left-info">
        <span class="rally-badge">🚩 Rally Niv.${rallyLevel}</span>
        <span class="army-count-badge">${cityArmies.length}/${maxArmies} armées</span>
      </div>
      <div class="header-right-info">
        <span class="garrison-badge-compact">🏰 ${totalGarrison} en garnison</span>
      </div>
    </div>
  `;
  
  // Build main content - Two column layout
  let html = `
    <div class="army-management-layout">
      <!-- Left: Armies Grid -->
      <div class="armies-column">
        <div class="column-header">
          <h3>⚔️ Mes Armées</h3>
        </div>
        <div class="armies-list">
          ${[1, 2, 3].map(slotNum => {
            const army = cityArmies.find(a => a.slot === slotNum);
            const isLocked = slotNum > maxArmies;
            return renderArmyCardNew(slotNum, army, isLocked, heroData);
          }).join('')}
        </div>
      </div>
      
      <!-- Right: Hero + Garrison -->
      <div class="garrison-column">
        <!-- Hero Card -->
        <div class="hero-assignment-card">
          <div class="hero-card-header">
            <span class="hero-icon-mini">👤</span>
            <span class="hero-name-mini">${heroData?.name || 'Héros'}</span>
            <span class="hero-level-mini">Niv.${heroData?.level || 1}</span>
          </div>
          <div class="hero-stats-row">
            <span>⚔️${heroData?.attack || 5}</span>
            <span>🛡️${heroData?.defense || 5}</span>
            <span>⚡${heroData?.speed || 5}</span>
          </div>
          <div class="hero-assign-status">
            ${heroAssignedToArmy 
              ? `<span class="assigned-to">➡️ ${heroAssignedToArmy.name}</span>
                 <button class="btn-unassign-small" onclick="unassignHero('${heroAssignedToArmy.id}')">Retirer</button>`
              : `<span class="hero-available">✓ Disponible</span>`
            }
          </div>
        </div>
        
        <!-- Garrison Panel -->
        <div class="garrison-panel-compact">
          <div class="garrison-header-compact">
            <span>🏰 Garnison</span>
            <span class="garrison-count-compact">${totalGarrison} unités</span>
          </div>
          ${garrisonUnits.length > 0 ? `
            <div class="garrison-units-grid">
              ${garrisonUnits.map(u => {
                const unit = unitsData.find(ud => ud.key === u.unitKey);
                const tierColor = TIER_COLORS[unit?.tier] || '#888';
                return `
                  <div class="garrison-unit-compact" title="${unit?.name || u.unitKey}" onclick="showUnitInfoModal('${u.unitKey}')">
                    <span class="g-unit-icon" style="border-color: ${tierColor}">${UNIT_ICONS[unit?.class] || '⚔️'}</span>
                    <span class="g-unit-count">×${u.count}</span>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div class="garrison-empty-compact">
              <p>Aucune unité</p>
              <p class="hint-small">Recrutez via bâtiments militaires</p>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
}

// New compact army card
function renderArmyCardNew(slotNum, army, isLocked, heroData) {
  // Locked slot
  if (isLocked) {
    const requiredLevel = slotNum === 2 ? 5 : 10;
    return `
      <div class="army-card-new locked">
        <div class="army-card-top locked">
          <span class="slot-num">#${slotNum}</span>
          <span class="lock-icon">🔒</span>
        </div>
        <div class="army-card-body-locked">
          <p>Rally Niv.${requiredLevel} requis</p>
        </div>
      </div>
    `;
  }
  
  // Empty slot
  if (!army) {
    return `
      <div class="army-card-new empty" onclick="createArmy(${slotNum})">
        <div class="army-card-top empty">
          <span class="slot-num">#${slotNum}</span>
          <span class="empty-label">Vide</span>
        </div>
        <div class="army-card-body-empty">
          <span class="create-plus">➕</span>
          <p>Créer une armée</p>
        </div>
      </div>
    `;
  }
  
  // Existing army
  const hasHero = army.heroId === heroData?.id;
  const totalUnits = army.units?.reduce((s, u) => s + u.count, 0) || 0;
  const armyPower = calculateArmyPower(army);
  
  const statusMap = {
    'IDLE': { icon: '🏠', label: 'En ville', cls: 'idle' },
    'MOVING': { icon: '🚶', label: 'En route', cls: 'moving' },
    'ATTACKING': { icon: '⚔️', label: 'Attaque', cls: 'attacking' },
    'RETURNING': { icon: '↩️', label: 'Retour', cls: 'returning' },
    'RAIDING': { icon: '💰', label: 'Pillage', cls: 'raiding' },
    'GARRISON': { icon: '🏰', label: 'Garnison', cls: 'garrison' },
    'HARVESTING': { icon: '⛏️', label: 'Récolte', cls: 'harvesting' },
    'COLLECTING': { icon: '📦', label: 'Collecte', cls: 'collecting' }
  };
  const status = statusMap[army.status] || { icon: '❓', label: army.status, cls: 'unknown' };
  
  return `
    <div class="army-card-new active ${status.cls}" data-army-id="${army.id}">
      <!-- Header -->
      <div class="army-card-top">
        <div class="army-name-section">
          <span class="slot-num">#${slotNum}</span>
          <input type="text" class="army-name-input-new" value="${army.name || `Armée ${slotNum}`}" 
                 onchange="renameArmy('${army.id}', this.value)" onclick="event.stopPropagation()">
        </div>
        <span class="status-pill ${status.cls}">${status.icon} ${status.label}</span>
      </div>
      
      <!-- Hero Row -->
      <div class="army-hero-row ${hasHero ? 'has-hero' : 'no-hero'}" 
           onclick="${!hasHero && army.status === 'IDLE' ? `assignHeroToArmy('${army.id}')` : ''}">
        ${hasHero ? `
          <span class="hero-mini-icon">👤</span>
          <span class="hero-mini-name">${heroData?.name || 'Héros'}</span>
          ${army.status === 'IDLE' ? `<button class="btn-x-small" onclick="event.stopPropagation(); unassignHero('${army.id}')" title="Retirer">✕</button>` : ''}
        ` : `
          <span class="hero-placeholder-text">${army.status === 'IDLE' ? '+ Ajouter héros' : 'Sans héros'}</span>
        `}
      </div>
      
      <!-- Units Summary -->
      <div class="army-units-row">
        <div class="units-stat">
          <span class="stat-label">Unités</span>
          <span class="stat-value">${totalUnits}</span>
        </div>
        <div class="units-stat">
          <span class="stat-label">Force</span>
          <span class="stat-value">⚔️${formatNum(armyPower)}</span>
        </div>
        ${army.units?.length > 0 ? `
          <div class="units-icons-mini">
            ${army.units.slice(0, 4).map(u => {
              const unit = unitsData.find(ud => ud.key === u.unitKey);
              return `<span class="unit-icon-tiny" title="${unit?.name}: ${u.count}">${UNIT_ICONS[unit?.class] || '⚔️'}</span>`;
            }).join('')}
            ${army.units.length > 4 ? `<span class="more-badge">+${army.units.length - 4}</span>` : ''}
          </div>
        ` : `<span class="no-units-badge">Aucune</span>`}
      </div>
      
      <!-- Harvest Progress (if harvesting) -->
      ${army.status === 'HARVESTING' ? `
        <div class="harvest-progress-row">
          <div class="harvest-info">
            <span class="harvest-type">⛏️ ${army.harvestResourceType || '?'}</span>
            <span class="harvest-rate">+100/min</span>
          </div>
          <div class="harvest-carry">
            <span class="carry-label">Transporté:</span>
            <span class="carry-value">${formatNum((army.carryWood || 0) + (army.carryStone || 0) + (army.carryIron || 0) + (army.carryFood || 0))}</span>
          </div>
        </div>
      ` : ''}

      <!-- Actions -->
      <div class="army-actions-row">
        ${army.status === 'IDLE' ? `
          <button class="army-btn primary" onclick="openArmyComposition('${army.id}')" title="Composer">
            📋 Composer
          </button>
          <button class="army-btn icon-only" onclick="showArmyActionsMenu('${army.id}')" title="Actions">
            ⚙️
          </button>
        ` : army.status === 'HARVESTING' ? `
          <button class="army-btn secondary" onclick="returnArmy('${army.id}')">
            ↩️ Arrêter & Rentrer
          </button>
          <span class="destination-badge">📍 (${army.targetX || army.x || '?'}, ${army.targetY || army.y || '?'})</span>
        ` : `
          <button class="army-btn secondary" onclick="returnArmy('${army.id}')">
            ↩️ Rappeler
          </button>
          <span class="destination-badge">📍 (${army.targetX || '?'}, ${army.targetY || '?'})</span>
        `}
      </div>
    </div>
  `;
}

// Calculate army power
function calculateArmyPower(army) {
  if (!army?.units) return 0;
  return army.units.reduce((sum, u) => {
    const unit = unitsData.find(ud => ud.key === u.unitKey);
    return sum + (u.count * ((unit?.stats?.attack || 0) + (unit?.stats?.defense || 0)));
  }, 0);
}

// Show actions menu for army
function showArmyActionsMenu(armyId) {
  const army = armies.find(a => a.id === armyId);
  if (!army) return;

  // Check if army can move (needs at least 1 unit)
  const totalUnits = army.units?.reduce((s, u) => s + u.count, 0) || 0;
  const hasHero = army.heroId;
  const canMove = totalUnits > 0;
  const disabledReason = !canMove ? (hasHero ? 'Le héros nécessite au moins 1 soldat' : 'Armée vide') : '';

  const modal = document.getElementById('modal');
  document.getElementById('modal-body').innerHTML = `
    <div class="army-actions-modal">
      <h3>⚙️ Actions - ${army.name}</h3>
      ${!canMove ? `<p class="warning-text" style="color:#ff6b6b;text-align:center;margin-bottom:10px">⚠️ ${disabledReason}</p>` : ''}
      <div class="actions-grid">
        <button class="action-card ${!canMove ? 'disabled' : ''}" ${canMove ? `onclick="closeModal(); showMoveModal('${armyId}')"` : 'disabled'}>
          <span class="action-icon">🚶</span>
          <span class="action-label">Déplacer</span>
        </button>
        <button class="action-card ${!canMove ? 'disabled' : ''}" ${canMove ? `onclick="closeModal(); showAttackModal('${armyId}')"` : 'disabled'}>
          <span class="action-icon">⚔️</span>
          <span class="action-label">Attaquer</span>
        </button>
        <button class="action-card ${!canMove ? 'disabled' : ''}" ${canMove ? `onclick="closeModal(); showRaidModal('${armyId}')"` : 'disabled'}>
          <span class="action-icon">💰</span>
          <span class="action-label">Piller</span>
        </button>
        <button class="action-card danger" onclick="closeModal(); confirmDisbandArmy('${armyId}')">
          <span class="action-icon">🗑️</span>
          <span class="action-label">Dissoudre</span>
        </button>
      </div>
      <button class="btn-close-modal" onclick="closeModal()">Fermer</button>
    </div>
  `;
  modal.style.display = 'flex';
}

// ========== ARMY COMPOSITION SYSTEM ==========
function openArmyComposition(armyId) {
  const army = armies.find(a => a.id === armyId);
  if (!army) {
    showToast('Armée introuvable', 'error');
    return;
  }
  
  if (army.status !== 'IDLE') {
    showToast('L\'armée doit être en ville pour modifier sa composition', 'warning');
    return;
  }
  
  const garrisonUnits = getGarrisonUnits();
  const heroData = player?.hero;
  const hasHero = army.heroId === heroData?.id;
  
  // Merge garrison + army units for total available
  const allUnitsMap = {};
  
  // Add garrison units
  garrisonUnits.forEach(u => {
    allUnitsMap[u.unitKey] = { garrison: u.count, inArmy: 0 };
  });
  
  // Add army units
  army.units?.forEach(u => {
    if (!allUnitsMap[u.unitKey]) {
      allUnitsMap[u.unitKey] = { garrison: 0, inArmy: 0 };
    }
    allUnitsMap[u.unitKey].inArmy = u.count;
  });
  
  // Filter units that exist (garrison or in army)
  const availableUnits = Object.entries(allUnitsMap)
    .filter(([key, data]) => data.garrison > 0 || data.inArmy > 0)
    .map(([unitKey, data]) => {
      const unit = unitsData.find(u => u.key === unitKey);
      return {
        unitKey,
        unit,
        garrison: data.garrison,
        inArmy: data.inArmy,
        total: data.garrison + data.inArmy
      };
    })
    .sort((a, b) => {
      // Sort by class then tier
      const classOrder = { 'INFANTRY': 0, 'ARCHER': 1, 'CAVALRY': 2, 'SIEGE': 3 };
      const tierOrder = { 'base': 0, 'intermediate': 1, 'elite': 2, 'siege': 3 };
      const classA = classOrder[a.unit?.class] ?? 99;
      const classB = classOrder[b.unit?.class] ?? 99;
      if (classA !== classB) return classA - classB;
      return (tierOrder[a.unit?.tier] ?? 99) - (tierOrder[b.unit?.tier] ?? 99);
    });
  
  const modal = document.getElementById('modal');
  
  document.getElementById('modal-body').innerHTML = `
    <div class="army-composition-modal">
      <!-- Header -->
      <div class="comp-header">
        <div class="comp-header-left">
          <span class="comp-slot-badge">#${army.slot}</span>
          <h2>${army.name}</h2>
        </div>
        <div class="comp-header-right">
          <span class="comp-power" id="comp-power">⚔️ ${formatNum(calculateArmyPower(army))}</span>
        </div>
      </div>
      
      <!-- Hero Assignment -->
      <div class="comp-hero-section">
        <div class="comp-hero-card ${hasHero ? 'assigned' : ''}">
          <span class="hero-icon-comp">👤</span>
          <div class="hero-info-comp">
            ${hasHero ? `
              <span class="hero-name-comp">${heroData?.name || 'Héros'}</span>
              <span class="hero-stats-comp">⚔️${heroData?.attack} 🛡️${heroData?.defense} ⚡${heroData?.speed}</span>
            ` : `
              <span class="hero-placeholder-comp">Aucun héros assigné</span>
            `}
          </div>
          <div class="hero-action-comp">
            ${hasHero 
              ? `<button class="btn-hero-action remove" onclick="unassignHeroFromComposition('${armyId}')">Retirer</button>`
              : `<button class="btn-hero-action assign" onclick="assignHeroFromComposition('${armyId}')">Assigner</button>`
            }
          </div>
        </div>
      </div>
      
      <!-- Units Composition -->
      <div class="comp-units-section">
        <div class="comp-units-header">
          <h3>📋 Composition</h3>
          <div class="comp-actions">
            <button class="comp-btn" onclick="setAllUnitsToArmy('${armyId}')">Tout ajouter</button>
            <button class="comp-btn" onclick="removeAllUnitsFromArmy('${armyId}')">Tout retirer</button>
          </div>
        </div>
        
        ${availableUnits.length > 0 ? `
          <div class="comp-units-list" id="comp-units-list">
            ${availableUnits.map(u => renderCompositionUnitRow(armyId, u)).join('')}
          </div>
        ` : `
          <div class="comp-no-units">
            <p>Aucune unité disponible</p>
            <p class="hint">Recrutez des troupes dans vos bâtiments militaires!</p>
          </div>
        `}
      </div>
      
      <!-- Footer -->
      <div class="comp-footer">
        <div class="comp-summary">
          <span class="summary-item" id="comp-total-units">
            <strong>${army.units?.reduce((s, u) => s + u.count, 0) || 0}</strong> unités dans l'armée
          </span>
          <span class="summary-item" id="comp-garrison-left">
            <strong>${garrisonUnits.reduce((s, u) => s + u.count, 0)}</strong> en garnison
          </span>
        </div>
        <button class="btn-done" onclick="closeModal(); renderArmies();">✓ Terminé</button>
      </div>
    </div>
  `;
  
  modal.style.display = 'flex';
}

// Render a unit row in composition modal
function renderCompositionUnitRow(armyId, unitData) {
  const { unitKey, unit, garrison, inArmy, total } = unitData;
  const tierColor = TIER_COLORS[unit?.tier] || '#888';
  
  return `
    <div class="comp-unit-row" data-unit="${unitKey}">
      <div class="comp-unit-info">
        <span class="comp-unit-icon" style="border-color: ${tierColor}">${UNIT_ICONS[unit?.class] || '⚔️'}</span>
        <div class="comp-unit-details">
          <span class="comp-unit-name">${unit?.name || unitKey}</span>
          <span class="comp-unit-tier" style="color: ${tierColor}">${unit?.tier?.toUpperCase() || ''}</span>
        </div>
      </div>
      
      <div class="comp-unit-controls">
        <div class="comp-available">
          <span class="available-label">Garnison:</span>
          <span class="available-count" id="garrison-${unitKey}">${garrison}</span>
        </div>
        
        <div class="comp-slider-group">
          <button class="comp-btn-adjust" onclick="adjustComposition('${armyId}', '${unitKey}', -10)">−10</button>
          <button class="comp-btn-adjust" onclick="adjustComposition('${armyId}', '${unitKey}', -1)">−</button>
          <input type="number" class="comp-input" id="comp-${unitKey}" 
                 value="${inArmy}" min="0" max="${total}" 
                 onchange="setComposition('${armyId}', '${unitKey}', this.value)">
          <button class="comp-btn-adjust" onclick="adjustComposition('${armyId}', '${unitKey}', 1)">+</button>
          <button class="comp-btn-adjust" onclick="adjustComposition('${armyId}', '${unitKey}', 10)">+10</button>
        </div>
        
        <button class="comp-btn-max" onclick="setMaxComposition('${armyId}', '${unitKey}', ${total})">MAX</button>
      </div>
    </div>
  `;
}

// Adjust composition (add/remove units)
async function adjustComposition(armyId, unitKey, delta) {
  const input = document.getElementById(`comp-${unitKey}`);
  const garrisonSpan = document.getElementById(`garrison-${unitKey}`);
  if (!input) return;
  
  const currentInArmy = parseInt(input.value) || 0;
  const currentGarrison = parseInt(garrisonSpan?.textContent) || 0;
  const total = currentInArmy + currentGarrison;
  
  let newValue = currentInArmy + delta;
  newValue = Math.max(0, Math.min(total, newValue));
  
  if (newValue === currentInArmy) return;
  
  const actualDelta = newValue - currentInArmy;
  
  // Optimistic UI update
  input.value = newValue;
  if (garrisonSpan) {
    garrisonSpan.textContent = currentGarrison - actualDelta;
  }
  updateCompositionSummary();
  
  // Send to server
  try {
    const res = await fetch(`${API}/api/army/${armyId}/set-unit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ unitKey, count: newValue })
    });
    
    if (!res.ok) {
      // Revert on error
      input.value = currentInArmy;
      if (garrisonSpan) garrisonSpan.textContent = currentGarrison;
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    } else {
      // Refresh armies data silently
      await loadArmies();
    }
  } catch (e) {
    input.value = currentInArmy;
    if (garrisonSpan) garrisonSpan.textContent = currentGarrison;
    showToast('Erreur de connexion', 'error');
  }
}

// Set exact composition
async function setComposition(armyId, unitKey, value) {
  const newValue = Math.max(0, parseInt(value) || 0);
  await adjustComposition(armyId, unitKey, 0); // Trigger validation
  
  const input = document.getElementById(`comp-${unitKey}`);
  const garrisonSpan = document.getElementById(`garrison-${unitKey}`);
  const currentInArmy = parseInt(input?.value) || 0;
  const currentGarrison = parseInt(garrisonSpan?.textContent) || 0;
  const total = currentInArmy + currentGarrison;
  
  const clampedValue = Math.min(newValue, total);
  const delta = clampedValue - currentInArmy;
  
  if (delta !== 0) {
    await adjustComposition(armyId, unitKey, delta);
  }
}

// Set max units
async function setMaxComposition(armyId, unitKey, total) {
  const input = document.getElementById(`comp-${unitKey}`);
  const currentInArmy = parseInt(input?.value) || 0;
  const delta = total - currentInArmy;
  
  if (delta !== 0) {
    await adjustComposition(armyId, unitKey, delta);
  }
}

// Update summary in composition modal
function updateCompositionSummary() {
  const totalUnitsSpan = document.getElementById('comp-total-units');
  const garrisonLeftSpan = document.getElementById('comp-garrison-left');
  const powerSpan = document.getElementById('comp-power');
  
  if (!totalUnitsSpan) return;
  
  let totalInArmy = 0;
  let totalGarrison = 0;
  let totalPower = 0;
  
  document.querySelectorAll('.comp-unit-row').forEach(row => {
    const unitKey = row.dataset.unit;
    const input = row.querySelector('.comp-input');
    const garrisonSpan = row.querySelector('.available-count');
    
    const inArmy = parseInt(input?.value) || 0;
    const garrison = parseInt(garrisonSpan?.textContent) || 0;
    
    totalInArmy += inArmy;
    totalGarrison += garrison;
    
    const unit = unitsData.find(u => u.key === unitKey);
    totalPower += inArmy * ((unit?.stats?.attack || 0) + (unit?.stats?.defense || 0));
  });
  
  totalUnitsSpan.innerHTML = `<strong>${totalInArmy}</strong> unités dans l'armée`;
  garrisonLeftSpan.innerHTML = `<strong>${totalGarrison}</strong> en garnison`;
  if (powerSpan) powerSpan.textContent = `⚔️ ${formatNum(totalPower)}`;
}

// Add all units to army
async function setAllUnitsToArmy(armyId) {
  const rows = document.querySelectorAll('.comp-unit-row');
  for (const row of rows) {
    const unitKey = row.dataset.unit;
    const input = row.querySelector('.comp-input');
    const garrisonSpan = row.querySelector('.available-count');
    
    const currentInArmy = parseInt(input?.value) || 0;
    const currentGarrison = parseInt(garrisonSpan?.textContent) || 0;
    const total = currentInArmy + currentGarrison;
    
    if (currentInArmy < total) {
      await adjustComposition(armyId, unitKey, total - currentInArmy);
    }
  }
  showToast('Toutes les unités ajoutées', 'success');
}

// Remove all units from army
async function removeAllUnitsFromArmy(armyId) {
  const rows = document.querySelectorAll('.comp-unit-row');
  for (const row of rows) {
    const unitKey = row.dataset.unit;
    const input = row.querySelector('.comp-input');
    const currentInArmy = parseInt(input?.value) || 0;
    
    if (currentInArmy > 0) {
      await adjustComposition(armyId, unitKey, -currentInArmy);
    }
  }
  showToast('Toutes les unités retirées', 'success');
}

// Hero assignment from composition modal
async function assignHeroFromComposition(armyId) {
  await assignHeroToArmy(armyId);
  // Refresh modal
  openArmyComposition(armyId);
}

async function unassignHeroFromComposition(armyId) {
  await unassignHero(armyId);
  // Refresh modal
  openArmyComposition(armyId);
}

// Get garrison units (not in any army)
function getGarrisonUnits() {
  // For now, get from the "garrison" army (slot 0) or first IDLE army in city
  const garrisonArmy = armies.find(a => a.cityId === currentCity?.id && a.isGarrison);
  if (garrisonArmy?.units) {
    return garrisonArmy.units;
  }
  
  // Fallback: aggregate all idle army units in city
  const cityArmies = armies.filter(a => a.cityId === currentCity?.id && a.status === 'IDLE');
  const unitMap = {};
  cityArmies.forEach(army => {
    army.units?.forEach(u => {
      if (!unitMap[u.unitKey]) unitMap[u.unitKey] = 0;
      unitMap[u.unitKey] += u.count;
    });
  });
  
  return Object.entries(unitMap).map(([unitKey, count]) => ({ unitKey, count }));
}

// Create new army
async function createArmy(slotNum) {
  const maxArmies = getMaxArmies();
  const cityArmies = armies.filter(a => a.cityId === currentCity?.id);
  
  if (maxArmies === 0) {
    showToast('Construisez une Place de rassemblement!', 'error');
    return;
  }
  
  if (cityArmies.length >= maxArmies) {
    showToast(`Maximum ${maxArmies} armées! (Améliorez le Rally Point)`, 'error');
    return;
  }
  
  try {
    const res = await fetch(`${API}/api/army/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ 
        cityId: currentCity.id, 
        slot: slotNum,
        name: `Armée ${slotNum}`
      })
    });
    
    const data = await res.json();
    
    if (res.ok) {
      showToast(`Armée ${slotNum} créée!`, 'success');
      await loadArmies();
      renderArmies();
    } else {
      showToast(data.error || 'Erreur création armée', 'error');
    }
  } catch (e) {
    showToast('Erreur de connexion', 'error');
  }
}

// Rename army
async function renameArmy(armyId, newName) {
  try {
    await fetch(`${API}/api/army/${armyId}/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newName })
    });
    
    const army = armies.find(a => a.id === armyId);
    if (army) army.name = newName;
  } catch (e) {
    console.error('Rename error', e);
  }
}

// Assign hero to army
async function assignHeroToArmy(armyId) {
  if (!player?.hero) {
    showToast('Aucun héros disponible', 'error');
    return;
  }
  
  // Check if hero is already assigned elsewhere
  const armyWithHero = armies.find(a => a.heroId && a.id !== armyId);
  if (armyWithHero) {
    showToast(`Le héros est déjà assigné à ${armyWithHero.name}. Retirez-le d'abord.`, 'warning');
    return;
  }
  
  try {
    const res = await fetch(`${API}/api/army/${armyId}/assign-hero`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ heroId: player.hero.id })
    });
    
    if (res.ok) {
      showToast('Héros assigné!', 'success');
      await loadArmies();
      renderArmies();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur de connexion', 'error');
  }
}

// Unassign hero from army
async function unassignHero(armyId) {
  try {
    const res = await fetch(`${API}/api/army/${armyId}/unassign-hero`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    });
    
    if (res.ok) {
      showToast('Héros retiré de l\'armée', 'success');
      await loadArmies();
      renderArmies();
    }
  } catch (e) {
    showToast('Erreur', 'error');
  }
}

// Adjust unit count in army
async function adjustArmyUnit(armyId, unitKey, delta) {
  const army = armies.find(a => a.id === armyId);
  if (!army || army.status !== 'IDLE') {
    showToast('Armée non disponible', 'error');
    return;
  }
  
  const currentUnit = army.units?.find(u => u.unitKey === unitKey);
  const currentCount = currentUnit?.count || 0;
  const newCount = Math.max(0, currentCount + delta);
  
  // Check garrison has enough units if adding
  if (delta > 0) {
    const garrison = getGarrisonUnits();
    const garrisonUnit = garrison.find(u => u.unitKey === unitKey);
    const available = garrisonUnit?.count || 0;
    if (delta > available) {
      showToast('Pas assez d\'unités en garnison', 'error');
      return;
    }
  }
  
  try {
    const res = await fetch(`${API}/api/army/${armyId}/adjust-unit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ unitKey, delta })
    });
    
    if (res.ok) {
      await loadArmies();
      renderArmies();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur', 'error');
  }
}

// Confirm disband army
function confirmDisbandArmy(armyId) {
  const army = armies.find(a => a.id === armyId);
  
  document.getElementById('modal-body').innerHTML = `
    <div class="disband-confirm">
      <h3>🗑️ Dissoudre l'armée ?</h3>
      <p>Les unités retourneront en garnison.</p>
      <p class="warning">Cette action est irréversible!</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
        <button class="btn btn-danger" onclick="disbandArmy('${armyId}')">Dissoudre</button>
      </div>
    </div>
  `;
  
  document.getElementById('modal').style.display = 'flex';
}

// Disband army
async function disbandArmy(armyId) {
  try {
    const res = await fetch(`${API}/api/army/${armyId}/disband`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    
    closeModal();
    
    if (res.ok) {
      showToast('Armée dissoute', 'success');
      await loadArmies();
      renderArmies();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur', 'error');
  }
}

function showMoveModal(armyId) {
  document.getElementById('modal-body').innerHTML = `
    <h3>Déplacer l'armée</h3>
    <input type="number" id="move-x" placeholder="X" style="width:48%;display:inline-block">
    <input type="number" id="move-y" placeholder="Y" style="width:48%;display:inline-block">
    <button onclick="moveArmy('${armyId}')" class="btn">Déplacer</button>
  `;
  document.getElementById('modal').style.display = 'flex';
}

async function moveArmy(armyId) {
  try {
    const x = parseInt(document.getElementById('move-x').value);
    const y = parseInt(document.getElementById('move-y').value);

    const res = await fetch(`${API}/api/army/${armyId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ x, y })
    });

    const data = await res.json();
    closeModal();

    if (res.ok) {
      showToast('Armée en mouvement!', 'success');
      await loadArmies();
      renderArmies();
    } else {
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    console.error('moveArmy error:', e);
    closeModal();
    showToast('Erreur réseau', 'error');
  }
}

function showAttackModal(armyId) {
  document.getElementById('modal-body').innerHTML = `
    <h3>Attaquer une ville</h3>
    <p style="margin-bottom:10px;color:var(--wood-medium)">Entrez l'ID de la ville cible</p>
    <input type="text" id="attack-city" placeholder="ID de la ville cible">
    <button onclick="attackCity('${armyId}')" class="btn btn-danger">Attaquer!</button>
  `;
  document.getElementById('modal').style.display = 'flex';
}

async function attackCity(armyId) {
  try {
    const targetCityId = document.getElementById('attack-city').value;

    const res = await fetch(`${API}/api/army/${armyId}/attack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ targetCityId })
    });

    const data = await res.json();
    closeModal();

    if (res.ok) {
      showToast(`Attaque lancée contre ${data.target}!`, 'success');
      await loadArmies();
      renderArmies();
    } else {
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    console.error('attackCity error:', e);
    closeModal();
    showToast('Erreur réseau', 'error');
  }
}

function showRaidModal(armyId) {
  document.getElementById('modal-body').innerHTML = `
    <h3>Piller une ville</h3>
    <p style="margin-bottom:10px;color:var(--wood-medium)">Volez des ressources à l'ennemi!</p>
    <input type="text" id="raid-city" placeholder="ID de la ville cible">
    <button onclick="raidCity('${armyId}')" class="btn" style="background:linear-gradient(180deg,orange,#c70)">Piller!</button>
  `;
  document.getElementById('modal').style.display = 'flex';
}

async function raidCity(armyId) {
  try {
    const targetCityId = document.getElementById('raid-city').value;

    const res = await fetch(`${API}/api/army/${armyId}/raid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ targetCityId })
    });

    const data = await res.json();
    closeModal();

    if (res.ok) {
      showToast(`Raid lancé contre ${data.target}!`, 'success');
      await loadArmies();
      renderArmies();
    } else {
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    console.error('raidCity error:', e);
    closeModal();
    showToast('Erreur réseau', 'error');
  }
}

async function returnArmy(armyId) {
  try {
    const res = await fetch(`${API}/api/army/${armyId}/return`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Armée rappelée!', 'success');
      await loadArmies();
      renderArmies();
    } else {
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    console.error('returnArmy error:', e);
    showToast('Erreur réseau', 'error');
  }
}

// ========== HERO ==========

// Equipment slots definition
const EQUIPMENT_SLOTS = {
  head: { name: 'Tete', icon: '🪖', x: 50, y: 5 },
  chest: { name: 'Torse', icon: '🛡️', x: 50, y: 28 },
  weapon: { name: 'Arme', icon: '⚔️', x: 15, y: 35 },
  shield: { name: 'Bouclier', icon: '🛡️', x: 85, y: 35 },
  legs: { name: 'Jambes', icon: '👖', x: 50, y: 55 },
  boots: { name: 'Bottes', icon: '👢', x: 50, y: 78 },
  ring: { name: 'Anneau', icon: '💍', x: 15, y: 60 },
  amulet: { name: 'Amulette', icon: '📿', x: 85, y: 60 }
};

let heroData = null;

async function loadHero() {
  let res;
  try {
    res = await fetch(`${API}/api/hero`, { headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    console.error('loadHero error:', e);
    showToast('Erreur réseau', 'error');
    return;
  }
  const panel = document.getElementById('hero-panel');

  if (res.ok) {
    const hero = await res.json();
    heroData = hero;
    if (hero) {
      const xpPct = Math.min(100, (hero.xp / hero.xpToNextLevel) * 100);
      const xpRemaining = hero.xpToNextLevel - hero.xp;

      // Build equipment map from hero items
      const equippedItems = {};
      if (hero.items) {
        hero.items.forEach(item => { equippedItems[item.slot] = item; });
      }

      panel.innerHTML = `
        <div class="hero-full-panel">
          <!-- Left: Hero info + Stats -->
          <div class="hero-left-col">
            <div class="hero-identity">
              <div class="hero-portrait-large">⚔️</div>
              <div class="hero-name-level">
                <h3>${hero.name}</h3>
                <span class="hero-level-badge">Niv. ${hero.level}</span>
              </div>
            </div>

            <!-- XP Bar -->
            <div class="hero-xp-section">
              <div class="xp-label">
                <span>Experience</span>
                <span class="xp-numbers">${formatNum(hero.xp)} / ${formatNum(hero.xpToNextLevel)}</span>
              </div>
              <div class="xp-bar-outer">
                <div class="xp-bar-inner" style="width:${xpPct}%">
                  <span class="xp-bar-text">${xpPct.toFixed(1)}%</span>
                </div>
              </div>
              <div class="xp-remaining">${formatNum(xpRemaining)} XP restants</div>
            </div>

            <!-- Stats -->
            <div class="hero-stats-grid">
              <div class="hero-stat-row">
                <span class="stat-icon">⚔️</span>
                <span class="stat-label">Attaque</span>
                <span class="stat-val">${hero.attack + hero.atkPoints}</span>
                ${hero.statPoints > 0 ? `<button class="stat-plus-btn" onclick="assignPoint('atk')">+</button>` : ''}
              </div>
              <div class="hero-stat-row">
                <span class="stat-icon">🛡️</span>
                <span class="stat-label">Defense</span>
                <span class="stat-val">${hero.defense + hero.defPoints}</span>
                ${hero.statPoints > 0 ? `<button class="stat-plus-btn" onclick="assignPoint('def')">+</button>` : ''}
              </div>
              <div class="hero-stat-row">
                <span class="stat-icon">🏃</span>
                <span class="stat-label">Vitesse</span>
                <span class="stat-val">${hero.speed + hero.spdPoints}</span>
                ${hero.statPoints > 0 ? `<button class="stat-plus-btn" onclick="assignPoint('spd')">+</button>` : ''}
              </div>
              <div class="hero-stat-row">
                <span class="stat-icon">📦</span>
                <span class="stat-label">Logistique</span>
                <span class="stat-val">${hero.logistics + hero.logPoints}</span>
                ${hero.statPoints > 0 ? `<button class="stat-plus-btn" onclick="assignPoint('log')">+</button>` : ''}
              </div>
            </div>
            ${hero.statPoints > 0 ? `
              <div class="hero-free-points">
                <span>Points a distribuer:</span>
                <span class="free-points-count">${hero.statPoints}</span>
              </div>
            ` : ''}
          </div>

          <!-- Right: Body Equipment -->
          <div class="hero-right-col">
            <h4 class="equipment-title">Equipement</h4>
            <div class="hero-body-container">
              <!-- Body silhouette -->
              <div class="hero-body-silhouette">
                <svg viewBox="0 0 100 100" class="body-svg">
                  <!-- Head -->
                  <circle cx="50" cy="15" r="10" fill="rgba(200,160,80,0.3)" stroke="rgba(200,160,80,0.5)" stroke-width="1"/>
                  <!-- Neck -->
                  <line x1="50" y1="25" x2="50" y2="30" stroke="rgba(200,160,80,0.3)" stroke-width="3"/>
                  <!-- Torso -->
                  <rect x="35" y="30" width="30" height="25" rx="3" fill="rgba(200,160,80,0.2)" stroke="rgba(200,160,80,0.4)" stroke-width="1"/>
                  <!-- Arms -->
                  <line x1="35" y1="33" x2="20" y2="48" stroke="rgba(200,160,80,0.3)" stroke-width="3"/>
                  <line x1="65" y1="33" x2="80" y2="48" stroke="rgba(200,160,80,0.3)" stroke-width="3"/>
                  <!-- Legs -->
                  <line x1="42" y1="55" x2="38" y2="75" stroke="rgba(200,160,80,0.3)" stroke-width="3"/>
                  <line x1="58" y1="55" x2="62" y2="75" stroke="rgba(200,160,80,0.3)" stroke-width="3"/>
                  <!-- Feet -->
                  <ellipse cx="36" cy="80" rx="6" ry="3" fill="rgba(200,160,80,0.2)" stroke="rgba(200,160,80,0.4)" stroke-width="1"/>
                  <ellipse cx="64" cy="80" rx="6" ry="3" fill="rgba(200,160,80,0.2)" stroke="rgba(200,160,80,0.4)" stroke-width="1"/>
                </svg>

                <!-- Equipment slot overlays -->
                ${Object.entries(EQUIPMENT_SLOTS).map(([slot, info]) => {
                  const equipped = equippedItems[slot];
                  const isEmpty = !equipped;
                  return `
                    <div class="equip-slot ${isEmpty ? 'empty' : 'filled'}"
                         style="left:${info.x}%;top:${info.y}%"
                         onclick="onEquipSlotClick('${slot}')"
                         title="${info.name}${equipped ? ': ' + equipped.itemKey : ' (vide)'}">
                      <span class="equip-slot-icon">${equipped ? getItemIcon(equipped.itemKey) : info.icon}</span>
                      ${!isEmpty ? '<span class="equip-slot-badge">!</span>' : ''}
                    </div>
                  `;
                }).join('')}
              </div>
            </div>
          </div>
        </div>
      `;
    } else {
      panel.innerHTML = '<p style="color:var(--text-muted)">Aucun heros. Construisez une Demeure du Heros.</p>';
    }
  }
}

function getItemIcon(itemKey) {
  const icons = {
    'iron_sword': '🗡️', 'steel_sword': '⚔️', 'bronze_helm': '🪖', 'iron_helm': '⛑️',
    'leather_armor': '🧥', 'chain_mail': '🛡️', 'iron_boots': '👢', 'war_boots': '🥾',
    'gold_ring': '💍', 'war_amulet': '📿', 'wooden_shield': '🛡️', 'iron_shield': '🔰',
    'leather_pants': '👖', 'chain_legs': '🦿'
  };
  return icons[itemKey] || '📦';
}

function onEquipSlotClick(slotKey) {
  const slotInfo = EQUIPMENT_SLOTS[slotKey];
  const equipped = heroData?.items?.find(i => i.slot === slotKey);

  if (equipped) {
    // Show equipped item details
    showModal(`${slotInfo.name} - ${equipped.itemKey}`, `
      <div style="text-align:center;">
        <div style="font-size:48px;margin:10px 0;">${getItemIcon(equipped.itemKey)}</div>
        <h4>${equipped.itemKey.replace(/_/g, ' ')}</h4>
        ${equipped.stats ? `
          <div style="margin-top:10px;text-align:left;">
            ${Object.entries(equipped.stats).map(([k, v]) => `
              <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-dark);">
                <span>${k}</span><span style="color:var(--green-light);">+${v}</span>
              </div>
            `).join('')}
          </div>
        ` : '<p style="color:var(--text-muted)">Aucun bonus</p>'}
        <button class="btn-primary" onclick="unequipItem('${equipped.id}');closeModal();" style="margin-top:12px;">Desequiper</button>
      </div>
    `);
  } else {
    // Show empty slot info
    showModal(`${slotInfo.name} - Vide`, `
      <div style="text-align:center;">
        <div style="font-size:48px;margin:10px 0;opacity:0.3;">${slotInfo.icon}</div>
        <p style="color:var(--text-muted)">Emplacement vide</p>
        <p style="color:var(--text-muted);font-size:12px;">Trouvez des objets en expedition ou au combat.</p>
      </div>
    `);
  }
}

async function unequipItem(itemId) {
  try {
    const res = await fetch(`${API}/api/hero/unequip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ itemId })
    });
    if (res.ok) {
      showToast('Objet desequipe', 'success');
      loadHero();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur reseau', 'error');
  }
}

async function assignPoint(stat) {
  try {
    const body = { atk: 0, def: 0, spd: 0, log: 0 };
    body[stat] = 1;

    const res = await fetch(`${API}/api/hero/assign-points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body)
    });

    if (res.ok) {
      showToast('Point assigne!', 'success');
      loadHero();
    } else {
      const data = await res.json();
      showToast(data.error || 'Plus de points disponibles', 'error');
    }
  } catch (e) {
    console.error('assignPoint error:', e);
    showToast('Erreur reseau', 'error');
  }
}

// ========== HERO MANAGEMENT PANEL (Domus du héros) ==========
async function openHeroManagementPanel(buildingLevel, slotNum) {
  const panel = document.getElementById('build-panel');
  const content = document.getElementById('build-panel-content');
  const title = document.getElementById('build-panel-title');

  // Fetch hero data
  let hero = null;
  try {
    const res = await fetch(`${API}/api/hero`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      hero = await res.json();
    }
  } catch (e) {
    console.error('Error loading hero:', e);
  }

  // Calculate bonuses from building level
  const xpBonus = buildingLevel * 2;
  const statBonus = buildingLevel * 1;

  title.innerHTML = `<span class="building-detail-icon">🏛️</span> Domus du héros`;

  if (!hero) {
    content.innerHTML = `
      <div class="hero-management-panel">
        <div class="hero-empty-state">
          <div class="hero-empty-icon">👤</div>
          <h3>Aucun héros</h3>
          <p>Votre héros n'a pas encore été créé.</p>
          <button class="btn btn-primary" onclick="createHero()">Créer un héros</button>
        </div>
        <div class="building-bonus-section">
          <h4>📊 Bonus du bâtiment (Niv.${buildingLevel})</h4>
          <div class="bonus-grid">
            <div class="bonus-item"><span>⚡ XP Bonus:</span><span>+${xpBonus}%</span></div>
            <div class="bonus-item"><span>💪 Stats Bonus:</span><span>+${statBonus}%</span></div>
          </div>
        </div>
      </div>
    `;
  } else {
    const xpPct = (hero.xp / hero.xpToNextLevel) * 100;
    const canAssignPoints = hero.statPoints > 0;

    content.innerHTML = `
      <div class="hero-management-panel">
        <!-- Hero Profile Section -->
        <div class="hero-profile-section">
          <div class="hero-avatar-large">⚔️</div>
          <div class="hero-profile-info">
            <h3 class="hero-name-large">${hero.name}</h3>
            <div class="hero-level-badge">Niveau ${hero.level}</div>
            <div class="hero-xp-bar-container">
              <div class="hero-xp-bar">
                <div class="hero-xp-fill" style="width:${xpPct}%"></div>
              </div>
              <div class="hero-xp-text">${hero.xp} / ${hero.xpToNextLevel} XP</div>
            </div>
          </div>
        </div>

        <!-- Stats Section -->
        <div class="hero-stats-section">
          <h4>📊 Statistiques</h4>
          <div class="hero-stats-grid">
            <div class="hero-stat-card">
              <span class="stat-icon">⚔️</span>
              <span class="stat-name">Attaque</span>
              <span class="stat-value">${hero.atkPoints}</span>
              ${canAssignPoints ? `<button class="stat-plus-btn" onclick="assignPointFromPanel('atk')">+</button>` : ''}
            </div>
            <div class="hero-stat-card">
              <span class="stat-icon">🛡️</span>
              <span class="stat-name">Défense</span>
              <span class="stat-value">${hero.defPoints}</span>
              ${canAssignPoints ? `<button class="stat-plus-btn" onclick="assignPointFromPanel('def')">+</button>` : ''}
            </div>
            <div class="hero-stat-card">
              <span class="stat-icon">🏃</span>
              <span class="stat-name">Vitesse</span>
              <span class="stat-value">${hero.spdPoints}</span>
              ${canAssignPoints ? `<button class="stat-plus-btn" onclick="assignPointFromPanel('spd')">+</button>` : ''}
            </div>
            <div class="hero-stat-card">
              <span class="stat-icon">📦</span>
              <span class="stat-name">Logistique</span>
              <span class="stat-value">${hero.logPoints}</span>
              ${canAssignPoints ? `<button class="stat-plus-btn" onclick="assignPointFromPanel('log')">+</button>` : ''}
            </div>
          </div>
          ${canAssignPoints ? `<div class="points-available-banner">🎯 ${hero.statPoints} points à distribuer</div>` : ''}
        </div>

        <!-- Building Bonus Section -->
        <div class="building-bonus-section">
          <h4>🏛️ Bonus du Domus (Niv.${buildingLevel})</h4>
          <div class="bonus-grid">
            <div class="bonus-item"><span>⚡ XP Bonus:</span><span class="bonus-value">+${xpBonus}%</span></div>
            <div class="bonus-item"><span>💪 Stats Bonus:</span><span class="bonus-value">+${statBonus}%</span></div>
          </div>
        </div>

        <!-- Actions Section -->
        <div class="hero-actions-section">
          <button class="btn btn-secondary" onclick="renameHero()">✏️ Renommer</button>
          <button class="btn btn-info" onclick="showHeroEquipment()">🎒 Équipement</button>
          <button class="btn btn-warning" onclick="showTab('hero'); closeBuildPanel();">📜 Expéditions</button>
        </div>
      </div>
    `;
  }

  // Show panel
  let overlay = document.querySelector('.build-panel-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'build-panel-overlay';
    overlay.onclick = closeBuildPanel;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'block';
  overlay.classList.add('fade-in');

  panel.classList.add('open');
}

// Assign point from hero panel and refresh
async function assignPointFromPanel(stat) {
  await assignPoint(stat);
  // Refresh the panel
  const heroHomeBuilding = currentCity?.buildings?.find(b => b.key === 'HERO_HOME' || b.key === 'HERO_MANSION');
  if (heroHomeBuilding) {
    openHeroManagementPanel(heroHomeBuilding.level, selectedBuildSlot);
  }
}

// Create hero (placeholder)
async function createHero() {
  const name = prompt('Nom de votre héros:');
  if (!name) return;

  try {
    const res = await fetch(`${API}/api/hero/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name })
    });

    if (res.ok) {
      showToast('Héros créé!', 'success');
      const heroHomeBuilding = currentCity?.buildings?.find(b => b.key === 'HERO_HOME' || b.key === 'HERO_MANSION');
      if (heroHomeBuilding) {
        openHeroManagementPanel(heroHomeBuilding.level, selectedBuildSlot);
      }
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur lors de la création', 'error');
    }
  } catch (e) {
    showToast('Erreur de connexion', 'error');
  }
}

// Rename hero
async function renameHero() {
  const newName = prompt('Nouveau nom du héros:');
  if (!newName) return;

  try {
    const res = await fetch(`${API}/api/hero/rename`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newName })
    });

    if (res.ok) {
      showToast('Heros renomme!', 'success');
      const heroHomeBuilding = currentCity?.buildings?.find(b => b.key === 'HERO_HOME' || b.key === 'HERO_MANSION');
      if (heroHomeBuilding) {
        openHeroManagementPanel(heroHomeBuilding.level, selectedBuildSlot);
      }
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur lors du renommage', 'error');
    }
  } catch (e) {
    showToast('Erreur reseau', 'error');
  }
}

// Show hero equipment (placeholder)
function showHeroEquipment() {
  showToast('Équipement bientôt disponible!', 'info');
}

// ========== EXPEDITIONS ==========
async function loadExpeditions() {
  let res;
  try {
    res = await fetch(`${API}/api/expeditions`, { headers: { Authorization: `Bearer ${token}` } });
  } catch (e) {
    console.error('loadExpeditions error:', e);
    showToast('Erreur réseau', 'error');
    return;
  }
  
  if (res.ok) {
    const expeditions = await res.json();
    const available = expeditions.filter(e => e.status === 'AVAILABLE');
    const history = expeditions.filter(e => e.status !== 'AVAILABLE');
    
    document.getElementById('expeditions-available').innerHTML = available.length > 0 
      ? available.map(e => `
          <div class="expedition-card">
            <div class="exp-difficulty"><span class="exp-stars">${'⭐'.repeat(e.difficulty)}</span></div>
            <h4>Expédition ${e.difficulty > 2 ? 'Difficile' : 'Standard'}</h4>
            <p>Puissance ennemie: ${e.enemyPower}</p>
            <p>Durée: ${Math.floor(e.duration / 60)} min</p>
            <div class="exp-loot"><span class="loot-badge ${e.lootTier}">${e.lootTier}</span></div>
            <button onclick="startExpedition('${e.id}')" class="btn">Lancer</button>
          </div>
        `).join('')
      : '<p style="color:var(--text-muted)">Aucune expédition disponible</p>';
    
    document.getElementById('expeditions-history').innerHTML = history.slice(0, 10).map(e => `
      <div class="queue-item">
        <span>${e.won ? '✅' : '❌'} Difficulté ${e.difficulty}</span>
        <span class="loot-badge ${e.lootTier}">${e.xpGained || 0} XP</span>
      </div>
    `).join('') || '<p style="color:var(--text-muted)">Aucun historique</p>';
  }
}

async function startExpedition(id) {
  const army = armies.find(a => a.status === 'IDLE' && a.units?.length > 0);
  if (!army) {
    showToast('Aucune armée disponible', 'error');
    return;
  }

  try {
    const res = await fetch(`${API}/api/expedition/${id}/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ armyId: army.id })
    });

    if (res.ok) {
      showToast('Expédition lancée!', 'success');
      await loadArmies();
      loadExpeditions();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    console.error('startExpedition error:', e);
    showToast('Erreur réseau', 'error');
  }
}


// Map system extracted to js/map.js

// ========== ALLIANCE ==========
async function loadAlliance() {
  const res = await fetch(`${API}/api/player/me`, { headers: { Authorization: `Bearer ${token}` } });
  const content = document.getElementById('alliance-content');
  
  if (res.ok) {
    const p = await res.json();
    
    if (p.allianceMember) {
      const allianceRes = await fetch(`${API}/api/alliances`, { headers: { Authorization: `Bearer ${token}` } });
      const alliances = await allianceRes.json();
      const myAlliance = alliances.find(a => a.members.some(m => m.playerId === p.id));
      
      if (myAlliance) {
        const myRole = myAlliance.members.find(m => m.playerId === p.id)?.role;
        const isLeaderOrOfficer = ['LEADER', 'OFFICER'].includes(myRole);
        
        // Get diplomacy
        const diplomacyRes = await fetch(`${API}/api/alliance/diplomacy`, { headers: { Authorization: `Bearer ${token}` } });
        const diplomacyData = await diplomacyRes.json();
        
        // Get other alliances for diplomacy management
        const otherAlliances = alliances.filter(a => a.id !== myAlliance.id);
        
        const showSub = (id) => currentAllianceTab === id ? 'block' : 'none';
        content.innerHTML = `
          <div class="alliance-container">
            <div id="alliance-sub-overview" class="alliance-sub-section" style="display:${showSub('overview')}">
              <div class="alliance-section">
                <div class="alliance-header">
                  <div class="alliance-emblem">🛡️</div>
                  <div class="alliance-info">
                    <h3>[${myAlliance.tag}] ${myAlliance.name}</h3>
                    <div class="alliance-tag">${myAlliance.members.length} membres</div>
                  </div>
                </div>
                <button onclick="leaveAlliance()" class="btn btn-danger" style="margin-top:20px">Quitter l'alliance</button>
              </div>
            </div>

            <div id="alliance-sub-members" class="alliance-sub-section" style="display:${showSub('members')}">
              <div class="alliance-section">
                <h4>👥 Membres (${myAlliance.members.length})</h4>
                ${myAlliance.members.map(m => `
                  <div class="member-row">
                    <span class="member-name">${m.player.name}</span>
                    <span class="member-role ${m.role.toLowerCase()}">${m.role === 'LEADER' ? '👑 Leader' : m.role === 'OFFICER' ? '⭐ Officier' : '🛡️ Membre'}</span>
                  </div>
                `).join('')}
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
                          <strong>[${a.tag}]</strong> ${a.name}
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
    }
    
    // No alliance
    const alliancesRes = await fetch(`${API}/api/alliances`, { headers: { Authorization: `Bearer ${token}` } });
    const alliances = await alliancesRes.json();
    
    content.innerHTML = `
      <div style="margin-bottom:30px">
        <h3 style="color:var(--gold);margin-bottom:15px">Créer une alliance</h3>
        <input type="text" id="alliance-name" placeholder="Nom de l'alliance" style="width:100%;padding:10px;margin-bottom:10px;background:var(--bg-light);border:1px solid var(--border);color:var(--text);border-radius:4px">
        <input type="text" id="alliance-tag" placeholder="Tag (2-5 caractères)" maxlength="5" style="width:100%;padding:10px;margin-bottom:10px;background:var(--bg-light);border:1px solid var(--border);color:var(--text);border-radius:4px">
        <button onclick="createAlliance()" class="btn">Créer</button>
      </div>
      <h3 style="color:var(--gold);margin-bottom:15px">Rejoindre une alliance</h3>
      ${alliances.slice(0, 10).map(a => `
        <div class="member-row">
          <span class="member-name">[${a.tag}] ${a.name} (${a.members.length} membres)</span>
          <button onclick="joinAlliance('${a.id}')" class="btn btn-secondary" style="margin:0;padding:6px 12px">Rejoindre</button>
        </div>
      `).join('') || '<p style="color:var(--text-muted)">Aucune alliance</p>'}
    `;
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
  const res = await fetch(`${API}/api/alliance/leave`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (res.ok) {
    showToast('Alliance quittée', 'success');
    loadAlliance();
  }
}

// ========== RANKING ==========
async function loadRanking(type) {
  document.querySelectorAll('.rank-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.rank-tab:${type === 'players' ? 'first-child' : 'last-child'}`)?.classList.add('active');
  
  const endpoint = type === 'players' ? '/api/ranking/players' : '/api/ranking/alliances';
  const res = await fetch(`${API}${endpoint}`, { headers: { Authorization: `Bearer ${token}` } });
  
  if (res.ok) {
    const data = await res.json();
    const content = document.getElementById('ranking-content');
    
    content.innerHTML = `
      <div class="ranking-list">
        ${data.map((item, i) => `
          <div class="ranking-row">
            <span class="ranking-position ${i < 3 ? 'top' + (i + 1) : ''}">${i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</span>
            <span class="ranking-name">${type === 'players' ? item.name : `[${item.tag}] ${item.name}`}</span>
            <span class="ranking-value">${formatNum(item.population || 0)} pop</span>
          </div>
        `).join('')}
      </div>
    `;
  }
}

function showRanking(type) {
  loadRanking(type);
}

// ========== REPORTS ==========
async function loadReports() {
  const res = await fetch(`${API}/api/reports/battles`, { headers: { Authorization: `Bearer ${token}` } });
  
  if (res.ok) {
    const reports = await res.json();
    const list = document.getElementById('reports-list');
    
    if (reports.length === 0) {
      list.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:20px;">Aucun rapport de bataille</p>';
      return;
    }
    
    list.innerHTML = reports.map((r, idx) => {
      const hasRounds = r.loot?.rounds && r.loot.rounds.length > 0;
      const attackerName = r.loot?.attackerName || 'Attaquant';
      const defenderName = r.loot?.defenderName || 'Défenseur';
      const cityName = r.loot?.cityName || `(${r.x}, ${r.y})`;
      const duration = r.loot?.duration || 1;
      const isAttacker = r.winner === 'ATTACKER';
      
      return `
        <div class="report-card ${isAttacker ? 'report-victory' : 'report-defeat'}">
          <div class="report-header">
            <div class="report-title-section">
              <span class="report-icon">${isAttacker ? '⚔️' : '🛡️'}</span>
              <div class="report-title-info">
                <span class="report-title">Bataille à ${cityName}</span>
                <span class="report-date">${new Date(r.createdAt).toLocaleString('fr-FR')}</span>
              </div>
            </div>
            <span class="report-result ${isAttacker ? 'victory' : 'defeat'}">
              ${isAttacker ? '🏆 VICTOIRE' : '💀 DÉFAITE'}
            </span>
          </div>
          
          <div class="report-summary">
            <div class="report-side attacker">
              <h4>⚔️ ${attackerName}</h4>
              <div class="units-list">
                ${(r.attackerUnits || []).map(u => `
                  <div class="unit-line">
                    <span class="unit-name">${u.name || u.key}</span>
                    <span class="unit-count">${u.count}</span>
                  </div>
                `).join('')}
              </div>
              <div class="losses">
                <span class="loss-label">Pertes:</span>
                <span class="loss-value">${Math.round((r.attackerLosses?.rate || 0) * 100)}%</span>
                <span class="loss-count">(${r.attackerLosses?.totalKilled || 0} unités)</span>
              </div>
            </div>
            
            <div class="report-vs">VS</div>
            
            <div class="report-side defender">
              <h4>🛡️ ${defenderName}</h4>
              <div class="units-list">
                ${(r.defenderUnits || []).map(u => `
                  <div class="unit-line">
                    <span class="unit-name">${u.name || u.key}</span>
                    <span class="unit-count">${u.count}</span>
                  </div>
                `).join('')}
              </div>
              <div class="losses">
                <span class="loss-label">Pertes:</span>
                <span class="loss-value">${Math.round((r.defenderLosses?.rate || 0) * 100)}%</span>
                <span class="loss-count">(${r.defenderLosses?.totalKilled || 0} unités)</span>
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
      <p class="replay-subtitle">${attackerName} vs ${defenderName}</p>
      
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
  window.replayState = {
    report,
    rounds,
    currentRound: 0,
    playing: false,
    speed: 1,
    intervalId: null,
    attackerInitial: report.attackerUnits.reduce((s, u) => s + u.count, 0),
    defenderInitial: report.defenderUnits.reduce((s, u) => s + u.count, 0)
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
  const attackerPct = (attackerRemaining / state.attackerInitial) * 100;
  const defenderPct = (defenderRemaining / state.defenderInitial) * 100;
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
  state.currentRound--;
  document.getElementById('replay-log').innerHTML = '';
  // Re-render all rounds up to current
  for (let i = 0; i <= state.currentRound; i++) {
    state.currentRound = i;
    if (i === state.currentRound) renderReplayState();
  }
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
            <span class="stat-icon">⚔️</span>
            <span class="stat-label">Attaque</span>
            <div class="stat-bar-container">
              <div class="stat-bar attack" style="width: ${Math.min(attack, 100)}%"></div>
            </div>
            <span class="stat-value">${attack}</span>
          </div>
          <div class="stat-bar-row">
            <span class="stat-icon">🛡️</span>
            <span class="stat-label">Défense</span>
            <div class="stat-bar-container">
              <div class="stat-bar defense" style="width: ${Math.min(defense, 100)}%"></div>
            </div>
            <span class="stat-value">${defense}</span>
          </div>
          <div class="stat-bar-row">
            <span class="stat-icon">🏃</span>
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
          <div class="cost-item"><span class="cost-icon">🪵</span><span>${unit.cost?.wood || 0}</span></div>
          <div class="cost-item"><span class="cost-icon">🪨</span><span>${unit.cost?.stone || 0}</span></div>
          <div class="cost-item"><span class="cost-icon">⛏️</span><span>${unit.cost?.iron || 0}</span></div>
          <div class="cost-item"><span class="cost-icon">🌾</span><span>${unit.cost?.food || 0}</span></div>
        </div>
        <div class="train-time">
          <span>⏱️ Temps: ${formatDuration(unit.trainTime || 60)}</span>
        </div>
      </div>

      <!-- Bâtiment requis -->
      <div class="unit-building-section">
        <h4>🏗️ Formation</h4>
        <p>Entraîné dans: <strong>${getBuildingName(unit.building) || 'Caserne'}</strong></p>
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
          <div class="cost-item"><span class="cost-icon">🪵</span><span>${building.costL1?.wood || 0}</span></div>
          <div class="cost-item"><span class="cost-icon">🪨</span><span>${building.costL1?.stone || 0}</span></div>
          <div class="cost-item"><span class="cost-icon">⛏️</span><span>${building.costL1?.iron || 0}</span></div>
          <div class="cost-item"><span class="cost-icon">🌾</span><span>${building.costL1?.food || 0}</span></div>
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

  if (indicator) {
    indicator.classList.toggle('night', isNight);
    indicator.classList.toggle('day', !isNight);
  }

  if (iconEl) {
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

// ========== MARCHÉ ==========
let marketOffers = [];

async function loadMarket() {
  try {
    const res = await fetch(`${API}/api/market`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      marketOffers = await res.json();
      renderMarketOffers();
    }
  } catch (e) {
    console.error('Error loading market:', e);
  }
}

function renderMarketOffers() {
  const container = document.getElementById('market-offers');
  if (!container) return;
  
  const resourceIcons = { wood: '🪵', stone: '🪨', iron: '⛏️', food: '🌾' };
  
  if (marketOffers.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucune offre disponible</p>';
    return;
  }
  
  container.innerHTML = marketOffers.map(offer => {
    const isMyOffer = offer.sellerId === player?.id;
    return `
      <div class="market-offer ${isMyOffer ? 'my-offer' : ''}">
        <div class="offer-seller">${isMyOffer ? '👤 Votre offre' : `👤 ${offer.seller?.name || 'Inconnu'}`}</div>
        <div class="offer-exchange">
          <span class="offer-sell">${resourceIcons[offer.sellResource]} ${formatNum(offer.sellAmount)}</span>
          <span class="offer-arrow">➡️</span>
          <span class="offer-buy">${resourceIcons[offer.buyResource]} ${formatNum(offer.buyAmount)}</span>
        </div>
        <div class="offer-ratio">Ratio: 1:${(offer.buyAmount / offer.sellAmount).toFixed(2)}</div>
        <div class="offer-actions">
          ${isMyOffer 
            ? `<button class="btn btn-danger btn-small" onclick="cancelMarketOffer('${offer.id}')">Annuler</button>`
            : `<button class="btn btn-success btn-small" onclick="acceptMarketOffer('${offer.id}')">Accepter</button>`
          }
        </div>
      </div>
    `;
  }).join('');
}

async function createMarketOffer() {
  if (_actionInProgress) return;
  const sellResource = document.getElementById('market-sell-resource')?.value;
  const sellAmount = parseInt(document.getElementById('market-sell-amount')?.value);
  const buyResource = document.getElementById('market-buy-resource')?.value;
  const buyAmount = parseInt(document.getElementById('market-buy-amount')?.value);

  if (!sellAmount || !buyAmount || sellAmount <= 0 || buyAmount <= 0) {
    showToast('Quantités invalides', 'error');
    return;
  }

  if (sellResource === buyResource) {
    showToast('Sélectionnez des ressources différentes', 'error');
    return;
  }

  _actionInProgress = true;
  try {
    const res = await fetch(`${API}/api/market/offer`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sellResource, sellAmount, buyResource, buyAmount, cityId: currentCity?.id })
    });
    
    if (res.ok) {
      showToast('Offre créée!', 'success');
      document.getElementById('market-sell-amount').value = '';
      document.getElementById('market-buy-amount').value = '';
      await loadMarket();
      await loadCities();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur réseau', 'error');
  } finally {
    _actionInProgress = false;
  }
}

async function acceptMarketOffer(offerId) {
  if (_actionInProgress) return;
  _actionInProgress = true;
  try {
    const res = await fetch(`${API}/api/market/offer/${offerId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ cityId: currentCity?.id })
    });
    
    if (res.ok) {
      showToast('Échange effectué!', 'success');
      await loadMarket();
      await loadCities();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur réseau', 'error');
  } finally {
    _actionInProgress = false;
  }
}

async function cancelMarketOffer(offerId) {
  if (_actionInProgress) return;
  _actionInProgress = true;
  try {
    const res = await fetch(`${API}/api/market/offer/${offerId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (res.ok) {
      showToast('Offre annulée', 'success');
      await loadMarket();
      await loadCities();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur réseau', 'error');
  } finally {
    _actionInProgress = false;
  }
}

// ========== RAPPORTS ESPIONNAGE ==========
let spyReports = [];
let currentReportTab = 'battles';

function showReportsTab(tab) {
  currentReportTab = tab;
  const reportTabContainer = document.querySelector('#tab-reports .toolbar-tabs');
  if (reportTabContainer) {
    reportTabContainer.querySelectorAll('.toolbar-btn').forEach(t => t.classList.remove('active'));
    reportTabContainer.querySelector(`.toolbar-btn[onclick*="${tab}"]`)?.classList.add('active');
  }
  
  if (tab === 'battles') {
    loadReports();
  } else if (tab === 'spy') {
    loadSpyReports();
  } else if (tab === 'trade') {
    loadTradeReports();
  }
}

let tradeReports = [];

async function loadTradeReports() {
  try {
    const res = await fetch(`${API}/api/reports/trade`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      tradeReports = await res.json();
      renderTradeReports();
    }
  } catch (e) {
    console.error('Error loading trade reports:', e);
  }
}

function renderTradeReports() {
  const container = document.getElementById('reports-list');
  if (!container) return;

  if (!tradeReports.length) {
    container.innerHTML = '<div class="empty-state">Aucun echange effectue</div>';
    return;
  }

  const resNames = { wood: 'Bois', stone: 'Pierre', iron: 'Fer', food: 'Nourriture' };
  const resIcons = { wood: '🪵', stone: '🪨', iron: '⚒️', food: '🌾' };

  container.innerHTML = tradeReports.map(t => {
    const isSeller = t.sellerId === gameState?.player?.id;
    const date = new Date(t.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    return `
      <div class="report-item" style="padding:10px;margin-bottom:6px;background:var(--bg-tertiary);border-radius:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <span>${isSeller ? '📤 Vendu' : '📥 Achet\u00e9'}</span>
          <span style="color:var(--text-secondary);font-size:0.85em;">${date}</span>
        </div>
        <div style="margin-top:4px;">
          <span style="color:var(--error)">${resIcons[t.sellResource] || ''} -${formatNum(t.sellAmount)} ${resNames[t.sellResource] || t.sellResource}</span>
          →
          <span style="color:var(--success)">${resIcons[t.buyResource] || ''} +${formatNum(t.buyAmount)} ${resNames[t.buyResource] || t.buyResource}</span>
        </div>
      </div>
    `;
  }).join('');
}

async function loadSpyReports() {
  try {
    const res = await fetch(`${API}/api/reports/spy`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      spyReports = await res.json();
      renderSpyReports();
    }
  } catch (e) {
    console.error('Error loading spy reports:', e);
  }
}

function renderSpyReports() {
  const container = document.getElementById('reports-list');
  if (!container) return;
  
  if (spyReports.length === 0) {
    container.innerHTML = '<p class="empty-state">Aucun rapport d\'espionnage</p>';
    return;
  }
  
  const resourceIcons = { wood: '🪵', stone: '🪨', iron: '⛏️', food: '🌾' };
  
  container.innerHTML = spyReports.map(report => {
    const date = new Date(report.createdAt).toLocaleString('fr-FR');
    
    if (!report.success) {
      return `
        <div class="report-card report-defeat">
          <div class="report-header">
            <span class="report-title">🔍 Espionnage échoué</span>
            <span class="report-date">${date}</span>
          </div>
          <p>Votre espion n'a pas réussi à infiltrer <strong>${report.cityName}</strong> à (${report.x}, ${report.y})</p>
        </div>
      `;
    }
    
    return `
      <div class="report-card report-victory">
        <div class="report-header">
          <span class="report-title">🔍 Espionnage réussi</span>
          <span class="report-date">${date}</span>
        </div>
        <p><strong>${report.cityName}</strong> à (${report.x}, ${report.y})</p>
        
        <div class="spy-section">
          <h4>💰 Ressources</h4>
          <div class="spy-resources">
            ${Object.entries(report.resources || {}).map(([res, val]) => 
              `<span>${resourceIcons[res] || res} ${formatNum(val)}</span>`
            ).join('')}
          </div>
        </div>
        
        <div class="spy-section">
          <h4>🏛️ Bâtiments</h4>
          <div class="spy-buildings">
            ${(report.buildings || []).map(b => 
              `<span class="spy-building">${getBuildingName(b.key)} Niv.${b.level}</span>`
            ).join('')}
          </div>
        </div>
        
        <div class="spy-section">
          <h4>⚔️ Armées</h4>
          ${(report.armies || []).length === 0 ? '<p>Aucune armée détectée</p>' : 
            report.armies.map(a => `
              <div class="spy-army">
                <strong>${a.name}</strong>: 
                ${a.units.map(u => `${getUnitName(u.key)} x${u.count}`).join(', ')}
              </div>
            `).join('')
          }
        </div>
      </div>
    `;
  }).join('');
}

function getBuildingName(key) {
  // Chercher dans buildingsData d'abord (contient les 39 bâtiments)
  const building = window.buildingsData?.find(b => b.key === key);
  if (building?.name) return building.name;

  // Fallback pour les cas où buildingsData n'est pas encore chargé
  const fallbackNames = {
    MAIN_HALL: 'Bâtiment principal', BARRACKS: 'Caserne', STABLE: 'Écurie', WORKSHOP: 'Atelier',
    WAREHOUSE: 'Dépôt', SILO: 'Silo', MARKET: 'Marché', ACADEMY: 'Académie',
    FARM: 'Ferme', LUMBER: 'Bûcheron', QUARRY: 'Carrière', IRON_MINE: 'Mine de fer',
    WALL: 'Mur', MOAT: 'Douves', HIDEOUT: 'Cachette', HEALING_TENT: 'Tente de soins',
    RALLY_POINT: 'Place de rassemblement', FORGE: 'Forge', HERO_MANSION: 'Domus du Héros',
    MILL: 'Moulin', BAKERY: 'Boulangerie', SAWMILL: 'Scierie', STONEMASON: 'Tailleur de Pierre',
    FOUNDRY: 'Fonderie', GREAT_SILO: 'Grand Silo', GREAT_WAREHOUSE: 'Grand Dépôt',
    GREAT_BARRACKS: 'Grande Caserne', GREAT_STABLE: 'Grande Écurie', WATCHTOWER: 'Tour de Guet',
    EMBASSY: 'Ambassade', TREASURE_CHAMBER: 'Chambre au Trésor', RESIDENCE: 'Résidence',
    TRADE_OFFICE: 'Comptoir de Commerce', ROMAN_THERMAE: 'Thermes', GALLIC_BREWERY: 'Brasserie',
    GREEK_TEMPLE: 'Temple', EGYPTIAN_IRRIGATION: 'Poste d\'Irrigation', HUN_WAR_TENT: 'Tente de Guerre',
    SULTAN_DESERT_OUTPOST: 'Poste du Désert', HERO_HOME: 'Domus du Héros'
  };
  return fallbackNames[key] || key;
}

// ========== VILLAGE LIST MODAL ==========
function openVillageList() {
  if (!cities || cities.length === 0) {
    showToast('Aucune ville', 'warning');
    return;
  }

  let html = '<div class="village-list">';
  cities.forEach(city => {
    const isActive = city.id === currentCity?.id;
    html += `
      <div class="village-list-item ${isActive ? 'active' : ''}" onclick="selectCity('${city.id}'); closeModal();">
        <span class="village-icon">${city.isCapital ? '👑' : '🏘️'}</span>
        <div class="village-details">
          <span class="village-name">${city.name}</span>
          <span class="village-coords">(${city.x}|${city.y})</span>
        </div>
        <span class="village-pop">Pop: ${city.population || 0}</span>
      </div>
    `;
  });
  html += '</div>';

  showModal('Vos villages', html);
}

// ========== TAB SUB-TABS ==========
function showArmyTab(subTab) {
  document.querySelectorAll('#tab-army .toolbar-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`#tab-army .toolbar-btn[onclick*="${subTab}"]`)?.classList.add('active');

  const container = document.getElementById('armies-management');
  if (!container) return;

  switch (subTab) {
    case 'overview':
      renderArmies();
      break;
    case 'train':
      loadUnits();
      break;
    case 'send':
      renderSendTroopsForm();
      break;
    default:
      renderArmies();
  }
}

let currentAllianceTab = 'overview';

function showAllianceTab(subTab) {
  currentAllianceTab = subTab;
  document.querySelectorAll('#tab-alliance .toolbar-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`#tab-alliance .toolbar-btn[onclick*="${subTab}"]`)?.classList.add('active');

  // Show/hide sections
  document.querySelectorAll('.alliance-sub-section').forEach(s => s.style.display = 'none');
  const section = document.getElementById(`alliance-sub-${subTab}`);
  if (section) section.style.display = 'block';

  // If sections don't exist yet, load fresh
  if (!section) loadAlliance();
}

function showMarketTab(subTab) {
  document.querySelectorAll('#tab-market .toolbar-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`#tab-market .toolbar-btn[onclick*="${subTab}"]`)?.classList.add('active');

  // Hide all sections
  document.querySelectorAll('#market-content .market-section').forEach(s => s.style.display = 'none');

  // Show selected section
  const section = document.getElementById(`market-section-${subTab}`);
  if (section) section.style.display = 'block';

  if (subTab === 'offers') loadMarket();
  if (subTab === 'npc') showNpcMerchant();
}

function filterBuildings(category) {
  document.querySelectorAll('#tab-buildings .toolbar-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`#tab-buildings .toolbar-btn[onclick*="${category}"]`)?.classList.add('active');
  renderBuildings(category);
}

// ========== SEND RESOURCES ==========
async function sendResources() {
  const target = document.getElementById('send-target')?.value;
  const wood = parseInt(document.getElementById('send-wood')?.value) || 0;
  const stone = parseInt(document.getElementById('send-stone')?.value) || 0;
  const iron = parseInt(document.getElementById('send-iron')?.value) || 0;
  const food = parseInt(document.getElementById('send-food')?.value) || 0;

  if (!target) {
    showToast('Entrez une destination', 'error');
    return;
  }

  if (wood + stone + iron + food === 0) {
    showToast('Entrez des ressources à envoyer', 'error');
    return;
  }

  // Parse coordinates (format: "x|y" or "x,y")
  let targetX, targetY;
  const coordMatch = target.match(/(-?\d+)[|,](-?\d+)/);
  if (coordMatch) {
    targetX = parseInt(coordMatch[1]);
    targetY = parseInt(coordMatch[2]);
  } else {
    showToast('Format invalide. Utilisez x|y', 'error');
    return;
  }

  try {
    const res = await fetch(`${API}/api/trade/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fromCityId: currentCity.id,
        targetX,
        targetY,
        resources: { wood, stone, iron, food }
      })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Ressources envoyées!', 'success');
      loadCities();
    } else {
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur réseau', 'error');
  }
}

function renderSendTroopsForm() {
  const container = document.getElementById('armies-management');
  if (!container) return;

  container.innerHTML = `
    <div class="send-troops-form">
      <h3>Envoyer des troupes</h3>
      <div class="form-row">
        <label>Destination</label>
        <input type="text" id="troops-target" placeholder="x|y">
      </div>
      <div class="form-row">
        <label>Mission</label>
        <select id="troops-mission">
          <option value="ATTACK">⚔️ Attaque</option>
          <option value="RAID">💰 Raid</option>
          <option value="SUPPORT">🛡️ Renfort</option>
          <option value="SPY">🔍 Espionnage</option>
        </select>
      </div>
      <div id="troops-selection" class="troops-selection">
        <p style="color:var(--text-muted)">Chargement des troupes...</p>
      </div>
      <button class="btn-primary" onclick="sendTroops()">Envoyer</button>
    </div>
  `;

  loadTroopsForSending();
}

async function loadTroopsForSending() {
  const cityArmy = armies.find(a => a.cityId === currentCity?.id && a.status === 'IDLE');
  const container = document.getElementById('troops-selection');
  if (!container) return;

  if (!cityArmy || !cityArmy.units || cityArmy.units.length === 0) {
    container.innerHTML = '<p style="color:var(--text-muted)">Aucune troupe disponible</p>';
    return;
  }

  container.innerHTML = cityArmy.units.map(u => `
    <div class="troop-row">
      <span class="troop-name">${getUnitName(u.unitKey)}</span>
      <span class="troop-available">Dispo: ${u.count}</span>
      <input type="number" id="send-${u.unitKey}" min="0" max="${u.count}" value="0">
    </div>
  `).join('');
}

async function sendTroops() {
  const target = document.getElementById('troops-target')?.value?.trim();
  const mission = document.getElementById('troops-mission')?.value || 'ATTACK';

  if (!target) {
    showToast('Veuillez entrer une destination', 'error');
    return;
  }

  // Parse coordinates
  const coordMatch = target.match(/(-?\d+)[|,](-?\d+)/);
  if (!coordMatch) {
    showToast('Format invalide. Utilisez x|y', 'error');
    return;
  }

  const targetX = parseInt(coordMatch[1]);
  const targetY = parseInt(coordMatch[2]);

  // Collect selected troops
  const cityArmy = armies.find(a => a.cityId === currentCity?.id && a.status === 'IDLE');
  if (!cityArmy) {
    showToast('Aucune armée disponible', 'error');
    return;
  }

  const units = {};
  let totalTroops = 0;

  cityArmy.units?.forEach(u => {
    const input = document.getElementById(`send-${u.unitKey}`);
    const count = parseInt(input?.value) || 0;
    if (count > 0) {
      units[u.unitKey] = count;
      totalTroops += count;
    }
  });

  if (totalTroops === 0) {
    showToast('Sélectionnez au moins une unité', 'error');
    return;
  }

  try {
    const res = await fetch(`${API}/api/armies/send`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        armyId: cityArmy.id,
        targetX,
        targetY,
        mission,
        units
      })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(`Troupes envoyées en mission ${mission}!`, 'success');
      loadArmies();
      loadCities();
    } else {
      showToast(data.error || 'Erreur lors de l\'envoi', 'error');
    }
  } catch (e) {
    showToast('Erreur réseau', 'error');
  }
}

function showNpcMerchant() {
  const container = document.getElementById('market-section-npc');
  if (!container) return;

  const resources = [
    { key: 'wood', icon: '🪵', name: 'Bois', current: Math.floor(currentCity?.wood || 0) },
    { key: 'stone', icon: '🧱', name: 'Argile', current: Math.floor(currentCity?.stone || 0) },
    { key: 'iron', icon: '⛏️', name: 'Fer', current: Math.floor(currentCity?.iron || 0) },
    { key: 'food', icon: '🌾', name: 'Ble', current: Math.floor(currentCity?.food || 0) }
  ];

  // NPC exchange rate: give X resources, receive Y of another type
  // Rate: 3:2 (give 3, get 2) - NPC takes a 33% cut
  const NPC_RATE_GIVE = 3;
  const NPC_RATE_RECEIVE = 2;

  container.innerHTML = `
    <div class="npc-merchant">
      <h3>🏪 Marchand Itinerant</h3>
      <p style="color:var(--text-muted);margin-bottom:12px;">
        Echangez vos ressources entre elles. Taux: <strong>${NPC_RATE_GIVE} → ${NPC_RATE_RECEIVE}</strong> (le marchand prend sa part)
      </p>

      <div class="npc-exchange-form">
        <div class="npc-row">
          <label>Je donne</label>
          <select id="npc-give-resource">
            ${resources.map(r => `<option value="${r.key}">${r.icon} ${r.name} (${formatNum(r.current)})</option>`).join('')}
          </select>
          <input type="number" id="npc-give-amount" placeholder="Quantite" min="1"
                 oninput="updateNpcPreview()">
        </div>
        <div class="npc-arrow">⬇️</div>
        <div class="npc-row">
          <label>Je recois</label>
          <select id="npc-receive-resource" onchange="updateNpcPreview()">
            ${resources.map((r, i) => `<option value="${r.key}" ${i === 1 ? 'selected' : ''}>${r.icon} ${r.name}</option>`).join('')}
          </select>
          <span id="npc-receive-preview" class="npc-preview">0</span>
        </div>
        <button onclick="executeNpcTrade()" class="btn-primary" style="margin-top:12px;">Echanger</button>
      </div>

      <div class="npc-stock" style="margin-top:16px;">
        <h4>Vos ressources</h4>
        <div class="npc-resources-grid">
          ${resources.map(r => `
            <div class="npc-res-item">
              <span>${r.icon}</span>
              <span>${formatNum(r.current)}</span>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;
}

function updateNpcPreview() {
  const giveAmount = parseInt(document.getElementById('npc-give-amount')?.value) || 0;
  const preview = document.getElementById('npc-receive-preview');
  if (preview) {
    const received = Math.floor(giveAmount * 2 / 3); // 3:2 rate
    preview.textContent = formatNum(received);
  }
}

async function executeNpcTrade() {
  if (_actionInProgress) return;
  const giveResource = document.getElementById('npc-give-resource')?.value;
  const receiveResource = document.getElementById('npc-receive-resource')?.value;
  const giveAmount = parseInt(document.getElementById('npc-give-amount')?.value) || 0;

  if (!giveResource || !receiveResource || giveAmount <= 0) {
    showToast('Entrez une quantite valide', 'error');
    return;
  }
  if (giveResource === receiveResource) {
    showToast('Choisissez des ressources differentes', 'error');
    return;
  }
  if (giveAmount < 3) {
    showToast('Minimum 3 ressources pour un echange', 'error');
    return;
  }

  _actionInProgress = true;
  try {
    const res = await fetch(`${API}/api/market/npc-trade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ cityId: currentCity?.id, giveResource, receiveResource, giveAmount })
    });

    if (res.ok) {
      const data = await res.json();
      showToast(`Echange reussi! -${formatNum(data.given)} ${giveResource} → +${formatNum(data.received)} ${receiveResource}`, 'success');
      await loadCities();
      showNpcMerchant(); // Refresh display
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur reseau', 'error');
  } finally {
    _actionInProgress = false;
  }
}

// ========== INVENTORY ==========
async function loadInventory() {
  const container = document.getElementById('inventory-content');
  if (!container) return;

  try {
    const res = await fetch(`${API}/api/hero`, { headers: { Authorization: `Bearer ${token}` } });
    let heroItems = [];
    if (res.ok) {
      const hero = await res.json();
      heroItems = hero?.items || [];
    }

    renderInventory(heroItems);
  } catch (e) {
    container.innerHTML = '<p style="color:var(--text-muted);padding:20px;">Erreur de chargement</p>';
  }
}

function renderInventory(items) {
  const container = document.getElementById('inventory-content');
  if (!container) return;

  // Define item categories
  const categories = {
    items: { name: 'Objets', filter: i => ['weapon', 'shield', 'head', 'chest', 'legs', 'boots', 'ring', 'amulet'].includes(i.slot) },
    materials: { name: 'Materiaux', filter: i => !['weapon', 'shield', 'head', 'chest', 'legs', 'boots', 'ring', 'amulet'].includes(i.slot) }
  };

  const currentTab = document.querySelector('#tab-inventory .toolbar-btn.active')?.textContent?.includes('Materiaux') ? 'materials' : 'items';
  const filteredItems = items.filter(categories[currentTab]?.filter || (() => true));

  if (filteredItems.length === 0) {
    container.innerHTML = `
      <div class="inventory-empty">
        <div style="font-size:48px;margin-bottom:12px;">🎒</div>
        <h3>Inventaire vide</h3>
        <p style="color:var(--text-muted)">Trouvez des objets en expedition, en pillant des tribus locales ou au combat.</p>
        <p style="color:var(--text-muted);font-size:12px;margin-top:8px;">
          Accedez a vos troupes via la
          <strong style="color:var(--gold)">Place de rassemblement</strong> 🚩 dans votre village.
        </p>
      </div>
    `;
    return;
  }

  container.innerHTML = `
    <div class="inventory-grid">
      ${filteredItems.map(item => `
        <div class="inventory-item" onclick="showItemDetails('${item.id}')">
          <div class="item-icon">${getItemIcon(item.itemKey)}</div>
          <div class="item-info">
            <div class="item-name">${item.itemKey.replace(/_/g, ' ')}</div>
            <div class="item-slot">${EQUIPMENT_SLOTS[item.slot]?.name || item.slot}</div>
          </div>
          ${item.stats ? `
            <div class="item-stats-mini">
              ${Object.entries(item.stats).slice(0, 2).map(([k, v]) => `<span>+${v} ${k}</span>`).join('')}
            </div>
          ` : ''}
        </div>
      `).join('')}
    </div>
    <div class="inventory-hint" style="margin-top:16px;padding:12px;background:var(--bg-dark);border-radius:6px;text-align:center;">
      <p style="color:var(--text-muted);font-size:12px;">
        Gerez vos troupes via la <strong style="color:var(--gold)">Place de rassemblement</strong> 🚩 dans votre village.
      </p>
    </div>
  `;
}

function showInventoryTab(subTab) {
  document.querySelectorAll('#tab-inventory .toolbar-btn').forEach(b => b.classList.remove('active'));
  document.querySelector(`#tab-inventory .toolbar-btn[onclick*="${subTab}"]`)?.classList.add('active');
  loadInventory();
}

function showItemDetails(itemId) {
  const item = heroData?.items?.find(i => i.id === itemId);
  if (!item) return;

  const slotInfo = EQUIPMENT_SLOTS[item.slot] || { name: item.slot, icon: '📦' };
  showModal(`${item.itemKey.replace(/_/g, ' ')}`, `
    <div style="text-align:center;">
      <div style="font-size:48px;margin:10px 0;">${getItemIcon(item.itemKey)}</div>
      <p style="color:var(--text-muted);">Emplacement: ${slotInfo.name}</p>
      ${item.stats ? `
        <div style="margin-top:10px;text-align:left;">
          ${Object.entries(item.stats).map(([k, v]) => `
            <div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid var(--border-dark);">
              <span>${k}</span><span style="color:var(--green-light);">+${v}</span>
            </div>
          `).join('')}
        </div>
      ` : '<p style="color:var(--text-muted)">Aucun bonus</p>'}
      <div style="display:flex;gap:8px;margin-top:12px;justify-content:center;">
        <button class="btn-primary" onclick="equipItem('${item.id}');closeModal();">Equiper</button>
        <button class="btn btn-danger btn-small" onclick="dropItem('${item.id}');closeModal();" style="padding:8px 16px;">Jeter</button>
      </div>
    </div>
  `);
}

async function equipItem(itemId) {
  try {
    const res = await fetch(`${API}/api/hero/equip`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ itemId })
    });
    if (res.ok) {
      showToast('Objet equipe!', 'success');
      loadInventory();
      loadHero();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur reseau', 'error');
  }
}

async function dropItem(itemId) {
  try {
    const res = await fetch(`${API}/api/hero/drop-item`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ itemId })
    });
    if (res.ok) {
      showToast('Objet jete', 'success');
      loadInventory();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur reseau', 'error');
  }
}

// ========== INIT ==========
window.onload = () => {
  if (token) {
    showGame();
  }
};

// Close modal on outside click
document.getElementById('modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'modal') closeModal();
});
