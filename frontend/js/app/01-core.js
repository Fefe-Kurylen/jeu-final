// ============================================================
// 01-core.js — Coeur : cache, requêtes, auth, état du jeu, alertes attaques
// Découpé depuis app.js (lignes 1-581) — portée globale partagée,
// l'ordre de chargement dans index.html doit être respecté.
// ============================================================
// Imperium Antiquitas v1.0 - Application Mobile Native
// API_SERVER est defini dans mobile.js (charge avant app.js)
const API = window.API_SERVER || '';
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

