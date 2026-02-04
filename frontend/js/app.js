// MonJeu v0.6 - Frontend JavaScript (Optimized)
const API = '';
let token = localStorage.getItem('token');
let player = null;
let currentCity = null;
let cities = [];
let armies = [];
let mapX = 0, mapY = 0;

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

// ========== DEBOUNCE UTILITY ==========
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

// ========== THROTTLE UTILITY ==========
function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// Building icons mapping
const BUILDING_ICONS = {
  MAIN_HALL: '🏛️', BARRACKS: '⚔️', STABLE: '🐎', WORKSHOP: '⚙️',
  FARM: '🌾', LUMBER: '🪵', QUARRY: '🪨', IRON_MINE: '⛏️',
  WAREHOUSE: '📦', SILO: '🏺', MARKET: '🏪', ACADEMY: '📚',
  FORGE: '🔨', WALL: '🏰', MOAT: '💧', HEALING_TENT: '⛺',
  RALLY_POINT: '🚩', HIDEOUT: '🕳️'
};

const UNIT_ICONS = {
  INFANTRY: '🗡️', ARCHER: '🏹', CAVALRY: '🐴', SIEGE: '💣'
};

const TIER_COLORS = {
  base: '#aaa', intermediate: '#4682B4', elite: '#da70d6', siege: '#ffa500'
};

// ========== AUTH ==========
function showRegister() {
  document.getElementById('login-form').style.display = 'none';
  document.getElementById('register-form').style.display = 'block';
}

function showLogin() {
  document.getElementById('register-form').style.display = 'none';
  document.getElementById('login-form').style.display = 'block';
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
  await loadPlayer();
  await loadCities();
  await loadArmies();
  startRefresh();
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
  const select = document.getElementById('city-select');
  select.innerHTML = cities.map(c => 
    `<option value="${c.id}" ${c.id === currentCity?.id ? 'selected' : ''}>${c.name} ${c.isCapital ? '👑' : ''}</option>`
  ).join('');
}

function selectCity(id) {
  currentCity = cities.find(c => c.id === id);
  renderCity();
  updateQuicklinksCity();
}

function updateQuicklinksCity() {
  const nameEl = document.getElementById('city-name-quick');
  const coordsEl = document.getElementById('city-coords-quick');
  if (currentCity && nameEl) {
    nameEl.textContent = currentCity.name + (currentCity.isCapital ? ' ⭐' : '');
    if (coordsEl) coordsEl.textContent = `(${currentCity.x}|${currentCity.y})`;
  }
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
  
  // Wall HP
  const wallPct = (currentCity.wallHp / currentCity.wallMaxHp) * 100;
  const wallFill = document.getElementById('wall-fill');
  if (wallFill) wallFill.style.width = `${wallPct}%`;
  document.getElementById('wall-hp').textContent = `${Math.floor(currentCity.wallHp)}/${currentCity.wallMaxHp}`;
  
  // Calculate production
  let woodProd = 5, stoneProd = 5, ironProd = 5, foodProd = 10;
  if (currentCity.buildings) {
    currentCity.buildings.forEach(b => {
      if (b.key === 'LUMBER') woodProd += b.level * 30;
      if (b.key === 'QUARRY') stoneProd += b.level * 30;
      if (b.key === 'IRON_MINE') ironProd += b.level * 30;
      if (b.key === 'FARM') foodProd += b.level * 40;
    });
  }
  
  // Calculate food consumption (upkeep) from armies
  let foodConsumption = 0;
  const cityArmies = armies.filter(a => a.cityId === currentCity.id);
  for (const army of cityArmies) {
    if (army.units) {
      for (const unit of army.units) {
        const unitDef = unitsData.find(u => u.key === unit.unitKey);
        // Upkeep par tier: base=5, inter=10, elite=15, siege=20
        const upkeep = unitDef?.tier === 'base' ? 5 : 
                       unitDef?.tier === 'intermediate' ? 10 : 
                       unitDef?.tier === 'elite' ? 15 : 20;
        foodConsumption += unit.count * upkeep;
      }
    }
  }
  
  // Net food production
  const netFood = foodProd - foodConsumption;
  
  document.getElementById('prod-wood').textContent = `+${formatNum(woodProd)}`;
  document.getElementById('prod-stone').textContent = `+${formatNum(stoneProd)}`;
  document.getElementById('prod-iron').textContent = `+${formatNum(ironProd)}`;
  
  // Food display with consumption
  const foodEl = document.getElementById('prod-food');
  if (netFood >= 0) {
    foodEl.textContent = `+${formatNum(netFood)}`;
    foodEl.style.color = '';
    foodEl.title = `Production: +${foodProd}/h | Consommation: -${foodConsumption}/h`;
  } else {
    foodEl.textContent = `${formatNum(netFood)}`;
    foodEl.style.color = '#e74c3c'; // Rouge si déficit
    foodEl.title = `⚠️ DÉFICIT! Production: +${foodProd}/h | Consommation: -${foodConsumption}/h`;
  }
  
  // Render 2.5D city canvas
  renderCityCanvas();
  
  // Render queues
  renderBuildQueue();
  renderRecruitQueue();
  renderMovingArmies();
}

// ========== CITY CANVAS 2.5D CIRCULAR ==========
let cityCanvas, cityCtx;
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
  
  // Resize to container
  const container = cityCanvas.parentElement;
  cityCanvas.width = container.clientWidth;
  cityCanvas.height = container.clientHeight;
  
  // Events
  cityCanvas.addEventListener('mousemove', onCityMouseMove);
  cityCanvas.addEventListener('click', onCityClick);
  cityCanvas.addEventListener('mouseleave', () => {
    cityHoveredSlot = null;
    renderCityCanvas();
    hideCityTooltip();
  });
  
  // Calculate slot positions
  calculateCitySlots();
}

function calculateCitySlots() {
  if (!cityCanvas) return;
  
  const w = cityCanvas.width;
  const h = cityCanvas.height;
  const centerX = w / 2;
  const centerY = h / 2 + 20;
  
  const innerRadius = Math.min(w, h) * 0.15;
  const outerRadius = Math.min(w, h) * 0.28;
  const slotSize = Math.min(w, h) * 0.07;
  
  citySlots = [];
  
  // Centre (Main Hall) - slot 0
  citySlots.push({
    slot: 0,
    x: centerX,
    y: centerY,
    size: slotSize * 1.5,
    fixed: true,
    fixedKey: 'MAIN_HALL'
  });
  
  // Anneau intérieur (6 slots) - slots 1-6
  CITY_LAYOUT.innerRing.forEach(s => {
    const rad = (s.angle - 90) * Math.PI / 180;
    citySlots.push({
      slot: s.slot,
      x: centerX + Math.cos(rad) * innerRadius,
      y: centerY + Math.sin(rad) * innerRadius * 0.55, // Écrasement pour effet 2.5D
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
      y: centerY + Math.sin(rad) * outerRadius * 0.55,
      size: slotSize * 0.9,
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

function animateCityView() {
  if (!cityAnimationRunning) return;
  
  // Only animate if city tab is visible
  const cityTab = document.getElementById('tab-city');
  if (!cityTab || !cityTab.classList.contains('active')) {
    cityAnimationFrame = requestAnimationFrame(animateCityView);
    return;
  }
  
  renderCityCanvas();
  cityAnimationFrame = requestAnimationFrame(animateCityView);
}

function renderCityCanvas() {
  if (!cityCtx || !cityCanvas) {
    initCityCanvas();
    if (!cityCtx) return;
  }
  
  // Recalculer les slots selon la vue
  if (currentCityView === 'city') {
    calculateCitySlots();
    renderCityView();
  } else {
    calculateFieldSlots();
    renderFieldsView();
  }
  
  // Mettre à jour l'indicateur (pas à chaque frame pour perf)
  if (!cityAnimationRunning || Math.random() < 0.02) {
    updateViewIndicator();
  }
}

function updateViewIndicator() {
  const indicator = document.getElementById('view-indicator');
  if (!indicator) return;
  
  if (currentCityView === 'city') {
    indicator.innerHTML = `
      <span class="view-label">🏰 Vue Ville</span>
      <span class="view-slots">20 emplacements</span>
    `;
  } else {
    indicator.innerHTML = `
      <span class="view-label">🌾 Vue Champs</span>
      <span class="view-slots">18 champs de ressources</span>
    `;
  }
}

function switchCityView(view) {
  currentCityView = view;
  
  // Update button states
  document.getElementById('btn-view-city').classList.toggle('active', view === 'city');
  document.getElementById('btn-view-fields').classList.toggle('active', view === 'fields');
  
  // Re-render
  renderCityCanvas();
}

function renderCityView() {
  const w = cityCanvas.width;
  const h = cityCanvas.height;
  const centerX = w / 2;
  const centerY = h / 2 + 20;
  
  // Clear
  cityCtx.clearRect(0, 0, w, h);
  
  // ========== SKY ==========
  const skyGrad = cityCtx.createLinearGradient(0, 0, 0, h * 0.5);
  skyGrad.addColorStop(0, '#4a90c2');
  skyGrad.addColorStop(0.5, '#7bb8e0');
  skyGrad.addColorStop(1, '#a8d4f0');
  cityCtx.fillStyle = skyGrad;
  cityCtx.fillRect(0, 0, w, h * 0.5);
  
  // Sun with rays
  drawSun(w - 100, 70, 35);
  
  // Clouds
  drawCloud(cityCtx, 80, 45, 45);
  drawCloud(cityCtx, 250, 75, 35);
  drawCloud(cityCtx, w - 250, 55, 40);
  drawCloud(cityCtx, w / 2, 40, 50);
  
  // ========== DISTANT MOUNTAINS ==========
  drawMountains(w, h);
  
  // ========== PLAINS / GROUND ==========
  const groundY = h * 0.45;
  
  // Far grass (lighter)
  const farGrassGrad = cityCtx.createLinearGradient(0, groundY, 0, h);
  farGrassGrad.addColorStop(0, '#6a9a4a');
  farGrassGrad.addColorStop(0.3, '#5a8a3a');
  farGrassGrad.addColorStop(0.7, '#4a7a2a');
  farGrassGrad.addColorStop(1, '#3a6a1a');
  cityCtx.fillStyle = farGrassGrad;
  cityCtx.fillRect(0, groundY, w, h - groundY);
  
  // ========== DISTANT TREES (forest line) ==========
  drawForestLine(w, groundY);
  
  // ========== RIVER ==========
  drawRiver(w, h, groundY);
  
  // ========== SCATTERED TREES ==========
  drawScatteredTrees(w, h, groundY, centerX, centerY);
  
  // ========== FIELDS / CROPS around city ==========
  drawCropFields(w, h, centerX, centerY);
  
  // ========== PATHS leading to city ==========
  drawPaths(w, h, centerX, centerY);
  
  // ========== CITY CIRCLE ==========
  const cityRadius = Math.min(w, h) * 0.32;
  
  // Outer wall shadow
  cityCtx.fillStyle = 'rgba(0,0,0,0.35)';
  cityCtx.beginPath();
  cityCtx.ellipse(centerX + 8, centerY + 12, cityRadius + 15, (cityRadius + 15) * 0.5, 0, 0, Math.PI * 2);
  cityCtx.fill();
  
  // Moat (water around city)
  const moatGrad = cityCtx.createRadialGradient(centerX, centerY, cityRadius - 5, centerX, centerY, cityRadius + 20);
  moatGrad.addColorStop(0, '#4a8ab0');
  moatGrad.addColorStop(0.5, '#3a7aa0');
  moatGrad.addColorStop(1, '#5a9ac0');
  cityCtx.fillStyle = moatGrad;
  cityCtx.beginPath();
  cityCtx.ellipse(centerX, centerY, cityRadius + 15, (cityRadius + 15) * 0.5, 0, 0, Math.PI * 2);
  cityCtx.fill();
  
  // City ground (dirt/cobblestone)
  const dirtGrad = cityCtx.createRadialGradient(centerX, centerY - 20, 0, centerX, centerY, cityRadius);
  dirtGrad.addColorStop(0, '#d4b896');
  dirtGrad.addColorStop(0.4, '#c4a876');
  dirtGrad.addColorStop(0.8, '#a48856');
  dirtGrad.addColorStop(1, '#846838');
  cityCtx.fillStyle = dirtGrad;
  cityCtx.beginPath();
  cityCtx.ellipse(centerX, centerY, cityRadius - 5, (cityRadius - 5) * 0.5, 0, 0, Math.PI * 2);
  cityCtx.fill();
  
  // Stone wall ring
  drawCityWall(centerX, centerY, cityRadius);
  
  // Draw roads inside city
  drawCityRoads(centerX, centerY);
  
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

function drawMountains(w, h) {
  const mountainY = h * 0.45;
  
  // Far mountains (blue/purple)
  cityCtx.fillStyle = '#8090a8';
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

function drawForestLine(w, groundY) {
  cityCtx.fillStyle = '#3a5a2a';
  
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

function drawRiver(w, h, groundY) {
  cityCtx.strokeStyle = '#5090c0';
  cityCtx.lineWidth = 20;
  cityCtx.lineCap = 'round';
  
  cityCtx.beginPath();
  cityCtx.moveTo(-20, groundY + 30);
  cityCtx.bezierCurveTo(w * 0.2, groundY + 60, w * 0.15, h * 0.65, w * 0.08, h + 20);
  cityCtx.stroke();
  
  // River highlight
  cityCtx.strokeStyle = 'rgba(150,200,230,0.5)';
  cityCtx.lineWidth = 8;
  cityCtx.beginPath();
  cityCtx.moveTo(-15, groundY + 28);
  cityCtx.bezierCurveTo(w * 0.18, groundY + 55, w * 0.13, h * 0.63, w * 0.06, h + 15);
  cityCtx.stroke();
}

function drawScatteredTrees(w, h, groundY, centerX, centerY) {
  const trees = [
    { x: 60, y: groundY + 80, size: 35 },
    { x: 120, y: groundY + 120, size: 40 },
    { x: w - 80, y: groundY + 90, size: 38 },
    { x: w - 150, y: groundY + 140, size: 42 },
    { x: w - 60, y: h - 100, size: 35 },
    { x: 80, y: h - 80, size: 30 },
    { x: w / 2 - 200, y: groundY + 60, size: 32 },
    { x: w / 2 + 200, y: groundY + 70, size: 36 }
  ];
  
  trees.forEach(tree => {
    // Skip if too close to city
    const dx = tree.x - centerX;
    const dy = tree.y - centerY;
    if (Math.sqrt(dx*dx + dy*dy) < 200) return;
    
    drawTree(tree.x, tree.y, tree.size);
  });
}

function drawTree(x, y, size) {
  // Shadow
  cityCtx.fillStyle = 'rgba(0,0,0,0.2)';
  cityCtx.beginPath();
  cityCtx.ellipse(x + 3, y + 5, size * 0.4, size * 0.15, 0, 0, Math.PI * 2);
  cityCtx.fill();
  
  // Trunk
  cityCtx.fillStyle = '#5a4030';
  cityCtx.fillRect(x - size * 0.08, y - size * 0.3, size * 0.16, size * 0.35);
  
  // Foliage layers
  const colors = ['#2a5a1a', '#3a6a2a', '#4a7a3a'];
  
  for (let i = 0; i < 3; i++) {
    cityCtx.fillStyle = colors[i];
    cityCtx.beginPath();
    cityCtx.moveTo(x, y - size * (0.6 + i * 0.25));
    cityCtx.lineTo(x - size * (0.4 - i * 0.08), y - size * (0.2 + i * 0.15));
    cityCtx.lineTo(x + size * (0.4 - i * 0.08), y - size * (0.2 + i * 0.15));
    cityCtx.closePath();
    cityCtx.fill();
  }
}

function drawCropFields(w, h, centerX, centerY) {
  // Wheat fields (golden rectangles around city)
  const fields = [
    { x: 50, y: h * 0.55, w: 80, h: 50, color: '#c4a030' },
    { x: w - 130, y: h * 0.58, w: 90, h: 45, color: '#d4b040' },
    { x: 30, y: h - 120, w: 70, h: 40, color: '#b49020' },
    { x: w - 100, y: h - 110, w: 60, h: 35, color: '#c4a030' }
  ];
  
  fields.forEach(field => {
    // Field base
    cityCtx.fillStyle = field.color;
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
    cityCtx.strokeStyle = 'rgba(0,0,0,0.15)';
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

function drawPaths(w, h, centerX, centerY) {
  cityCtx.strokeStyle = '#a08050';
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
  
  // Road highlight
  cityCtx.strokeStyle = '#c0a070';
  cityCtx.lineWidth = 4;
  
  cityCtx.beginPath();
  cityCtx.moveTo(w / 2 + 32, h + 10);
  cityCtx.quadraticCurveTo(w / 2 + 2, h * 0.8, centerX + 2, centerY + 100);
  cityCtx.stroke();
}

function drawCityWall(centerX, centerY, radius) {
  const wallRadius = radius - 3;
  
  // Stone wall base
  cityCtx.strokeStyle = '#5a5a5a';
  cityCtx.lineWidth = 18;
  cityCtx.beginPath();
  cityCtx.ellipse(centerX, centerY, wallRadius, wallRadius * 0.5, 0, 0, Math.PI * 2);
  cityCtx.stroke();
  
  // Wall detail (bricks pattern)
  cityCtx.strokeStyle = '#4a4a4a';
  cityCtx.lineWidth = 2;
  for (let angle = 0; angle < 360; angle += 15) {
    const rad = angle * Math.PI / 180;
    const x1 = centerX + Math.cos(rad) * (wallRadius - 8);
    const y1 = centerY + Math.sin(rad) * (wallRadius - 8) * 0.5;
    const x2 = centerX + Math.cos(rad) * (wallRadius + 8);
    const y2 = centerY + Math.sin(rad) * (wallRadius + 8) * 0.5;
    cityCtx.beginPath();
    cityCtx.moveTo(x1, y1);
    cityCtx.lineTo(x2, y2);
    cityCtx.stroke();
  }
  
  // Wall top highlight
  cityCtx.strokeStyle = '#8a8a8a';
  cityCtx.lineWidth = 4;
  cityCtx.beginPath();
  cityCtx.ellipse(centerX, centerY, wallRadius, wallRadius * 0.5, 0, Math.PI, Math.PI * 2);
  cityCtx.stroke();
  
  // Towers (4 corners)
  const towerAngles = [45, 135, 225, 315];
  towerAngles.forEach(angle => {
    const rad = angle * Math.PI / 180;
    const tx = centerX + Math.cos(rad) * wallRadius;
    const ty = centerY + Math.sin(rad) * wallRadius * 0.5;
    drawTower(tx, ty, 18);
  });
  
  // Main gate (south)
  const gateX = centerX;
  const gateY = centerY + wallRadius * 0.5;
  drawGate(gateX, gateY);
}

function drawTower(x, y, size) {
  // Tower base
  cityCtx.fillStyle = '#6a6a6a';
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, size, size * 0.5, 0, 0, Math.PI * 2);
  cityCtx.fill();
  
  // Tower body
  cityCtx.fillStyle = '#5a5a5a';
  cityCtx.fillRect(x - size * 0.7, y - size * 1.5, size * 1.4, size * 1.5);
  
  // Tower top
  cityCtx.fillStyle = '#7a7a7a';
  cityCtx.beginPath();
  cityCtx.ellipse(x, y - size * 1.5, size * 0.8, size * 0.4, 0, 0, Math.PI * 2);
  cityCtx.fill();
  
  // Battlements
  cityCtx.fillStyle = '#5a5a5a';
  for (let i = 0; i < 4; i++) {
    const bx = x - size * 0.6 + i * size * 0.4;
    cityCtx.fillRect(bx, y - size * 1.9, size * 0.25, size * 0.4);
  }
  
  // Flag
  cityCtx.fillStyle = '#c44';
  cityCtx.beginPath();
  cityCtx.moveTo(x, y - size * 2.2);
  cityCtx.lineTo(x + size * 0.5, y - size * 2);
  cityCtx.lineTo(x, y - size * 1.8);
  cityCtx.fill();
  
  cityCtx.strokeStyle = '#444';
  cityCtx.lineWidth = 2;
  cityCtx.beginPath();
  cityCtx.moveTo(x, y - size * 1.5);
  cityCtx.lineTo(x, y - size * 2.3);
  cityCtx.stroke();
}

function drawGate(x, y) {
  // Gate house
  cityCtx.fillStyle = '#5a5a5a';
  cityCtx.fillRect(x - 25, y - 40, 50, 45);
  
  // Gate opening (dark)
  cityCtx.fillStyle = '#1a1a1a';
  cityCtx.beginPath();
  cityCtx.moveTo(x - 15, y + 5);
  cityCtx.lineTo(x - 15, y - 20);
  cityCtx.arc(x, y - 20, 15, Math.PI, 0);
  cityCtx.lineTo(x + 15, y + 5);
  cityCtx.closePath();
  cityCtx.fill();
  
  // Gate bars
  cityCtx.strokeStyle = '#4a3020';
  cityCtx.lineWidth = 3;
  for (let i = -10; i <= 10; i += 5) {
    cityCtx.beginPath();
    cityCtx.moveTo(x + i, y - 30);
    cityCtx.lineTo(x + i, y + 5);
    cityCtx.stroke();
  }
  
  // Battlements
  cityCtx.fillStyle = '#6a6a6a';
  for (let i = 0; i < 5; i++) {
    cityCtx.fillRect(x - 23 + i * 10, y - 50, 8, 12);
  }
}

function drawDecorations(w, h, centerX, centerY) {
  const time = Date.now() / 1000;
  
  // ========== ANIMATED BIRDS ==========
  drawAnimatedBirds(w, h, time);
  
  // ========== ANIMATED WATER (moat reflections) ==========
  drawWaterAnimation(centerX, centerY, time);
  
  // ========== ANIMATED VILLAGERS ==========
  drawAnimatedVillagers(centerX, centerY, time);
  
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
  
  // ========== PARTICLE EFFECTS (leaves, dust) ==========
  drawParticleEffects(w, h, time);
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

// Old smoke function (keep for compatibility)
function drawSmoke(x, y) {
  drawAnimatedSmoke(x, y, Date.now() / 1000, 1);
}

// ========== VUE CHAMPS DE RESSOURCES ==========
function renderFieldsView() {
  const w = cityCanvas.width;
  const h = cityCanvas.height;
  const centerX = w / 2;
  const centerY = h / 2 + 30;
  
  // Clear
  cityCtx.clearRect(0, 0, w, h);
  
  // ========== SKY ==========
  const skyGrad = cityCtx.createLinearGradient(0, 0, 0, h * 0.45);
  skyGrad.addColorStop(0, '#5a9ac2');
  skyGrad.addColorStop(0.5, '#7bc8e0');
  skyGrad.addColorStop(1, '#a8e4f0');
  cityCtx.fillStyle = skyGrad;
  cityCtx.fillRect(0, 0, w, h * 0.45);
  
  // Sun
  drawSun(w - 100, 70, 35);
  
  // Clouds
  drawCloud(cityCtx, 100, 55, 40);
  drawCloud(cityCtx, w - 180, 70, 45);
  
  // ========== GROUND - FARMLAND ==========
  const groundY = h * 0.42;
  
  // Background hills
  cityCtx.fillStyle = '#5a8a4a';
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
  groundGrad.addColorStop(0, '#6a9a5a');
  groundGrad.addColorStop(0.3, '#5a8a4a');
  groundGrad.addColorStop(0.7, '#4a7a3a');
  groundGrad.addColorStop(1, '#3a6a2a');
  cityCtx.fillStyle = groundGrad;
  cityCtx.fillRect(0, groundY, w, h - groundY);
  
  // ========== SCATTERED TREES AROUND ==========
  const treesPos = [
    { x: 40, y: groundY + 50, size: 35 },
    { x: w - 50, y: groundY + 60, size: 38 },
    { x: 30, y: h - 60, size: 30 },
    { x: w - 40, y: h - 50, size: 32 }
  ];
  treesPos.forEach(t => drawTree(t.x, t.y, t.size));
  
  // ========== PATHS TO FIELDS ==========
  cityCtx.strokeStyle = '#8a7050';
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
  
  // ========== ANIMATED BIRDS ==========
  drawAnimatedBirds(w, h, time);
  
  // ========== ANIMATED WHEAT WAVES ==========
  drawWheatWaves(w, h, time);
  
  // ========== FARM ANIMALS (chickens, cows) ==========
  drawFarmAnimals(w, h, time);
  
  // ========== BUTTERFLIES ==========
  drawButterflies(w, h, time);
  
  // ========== DUST PARTICLES ==========
  drawFieldDust(w, h, time);
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

function drawFieldSlot(slot, building, isHovered, isBuilding) {
  const { x, y, size, fieldType } = slot;
  const level = building?.level || 0;
  
  // Field colors by type
  const fieldStyles = {
    FARM: { bg: '#c4a030', detail: '#a48020', icon: '🌾', name: 'Ferme' },
    LUMBER: { bg: '#4a6a3a', detail: '#3a5a2a', icon: '🌲', name: 'Bûcheron' },
    QUARRY: { bg: '#8a8a8a', detail: '#6a6a6a', icon: '⛰️', name: 'Carrière' },
    IRON_MINE: { bg: '#6a6a7a', detail: '#5a5a6a', icon: '⛏️', name: 'Mine' }
  };
  
  const style = fieldStyles[fieldType] || fieldStyles.FARM;
  
  // Shadow
  cityCtx.fillStyle = 'rgba(0,0,0,0.3)';
  cityCtx.beginPath();
  cityCtx.ellipse(x + 3, y + 5, size * 0.7, size * 0.35, 0, 0, Math.PI * 2);
  cityCtx.fill();
  
  // Hover glow
  if (isHovered) {
    cityCtx.shadowColor = '#ffd700';
    cityCtx.shadowBlur = 20;
  }
  
  // Field base
  cityCtx.fillStyle = style.bg;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, size * 0.65, size * 0.35, 0, 0, Math.PI * 2);
  cityCtx.fill();
  
  // Field detail (inner)
  cityCtx.fillStyle = style.detail;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, size * 0.5, size * 0.25, 0, 0, Math.PI * 2);
  cityCtx.fill();
  
  cityCtx.shadowBlur = 0;
  
  // Border
  cityCtx.strokeStyle = isHovered ? '#ffd700' : style.detail;
  cityCtx.lineWidth = isHovered ? 3 : 2;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, size * 0.65, size * 0.35, 0, 0, Math.PI * 2);
  cityCtx.stroke();
  
  if (level > 0) {
    // Draw field-specific elements based on type
    if (fieldType === 'FARM') {
      // Wheat rows
      cityCtx.strokeStyle = '#8a7020';
      cityCtx.lineWidth = 2;
      for (let i = -2; i <= 2; i++) {
        cityCtx.beginPath();
        cityCtx.moveTo(x - size * 0.35, y + i * 6);
        cityCtx.lineTo(x + size * 0.35, y + i * 6);
        cityCtx.stroke();
      }
    } else if (fieldType === 'LUMBER') {
      // Mini trees
      for (let i = -1; i <= 1; i++) {
        drawMiniTree(x + i * size * 0.25, y - 5, size * 0.2);
      }
    } else if (fieldType === 'QUARRY') {
      // Rock piles
      cityCtx.fillStyle = '#9a9a9a';
      cityCtx.beginPath();
      cityCtx.arc(x - size * 0.15, y, size * 0.12, 0, Math.PI * 2);
      cityCtx.arc(x + size * 0.15, y, size * 0.1, 0, Math.PI * 2);
      cityCtx.arc(x, y - size * 0.08, size * 0.08, 0, Math.PI * 2);
      cityCtx.fill();
    } else if (fieldType === 'IRON_MINE') {
      // Mine entrance
      cityCtx.fillStyle = '#2a2a2a';
      cityCtx.beginPath();
      cityCtx.arc(x, y, size * 0.15, Math.PI, 0);
      cityCtx.lineTo(x + size * 0.15, y + size * 0.1);
      cityCtx.lineTo(x - size * 0.15, y + size * 0.1);
      cityCtx.closePath();
      cityCtx.fill();
    }
  }
  
  // Icon
  cityCtx.font = `${size * 0.5}px Arial`;
  cityCtx.textAlign = 'center';
  cityCtx.textBaseline = 'middle';
  cityCtx.fillText(style.icon, x, y - size * 0.1);
  
  // Level badge
  if (level > 0) {
    const badgeX = x + size * 0.5;
    const badgeY = y - size * 0.15;
    
    cityCtx.fillStyle = 'rgba(0,0,0,0.8)';
    cityCtx.beginPath();
    cityCtx.arc(badgeX, badgeY, 14, 0, Math.PI * 2);
    cityCtx.fill();
    
    cityCtx.strokeStyle = '#ffd700';
    cityCtx.lineWidth = 2;
    cityCtx.stroke();
    
    cityCtx.fillStyle = '#ffd700';
    cityCtx.font = 'bold 12px Cinzel, serif';
    cityCtx.fillText(level, badgeX, badgeY + 1);
  } else {
    // Empty slot indicator
    cityCtx.fillStyle = 'rgba(255,255,255,0.5)';
    cityCtx.font = `bold ${size * 0.3}px Arial`;
    cityCtx.fillText('+', x, y + size * 0.15);
  }
  
  // Construction indicator
  if (isBuilding) {
    cityCtx.fillStyle = 'rgba(255,165,0,0.9)';
    cityCtx.font = '18px Arial';
    cityCtx.fillText('🔨', x, y - size * 0.4);
  }
}

function drawMiniTree(x, y, size) {
  cityCtx.fillStyle = '#3a5a2a';
  cityCtx.beginPath();
  cityCtx.moveTo(x, y - size);
  cityCtx.lineTo(x - size * 0.5, y);
  cityCtx.lineTo(x + size * 0.5, y);
  cityCtx.closePath();
  cityCtx.fill();
  
  cityCtx.fillStyle = '#5a4030';
  cityCtx.fillRect(x - size * 0.1, y, size * 0.2, size * 0.3);
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
  cityCtx.strokeStyle = '#8a7050';
  cityCtx.lineWidth = 8;
  cityCtx.lineCap = 'round';
  
  // Roads from center to inner ring
  citySlots.filter(s => s.ring === 'inner').forEach(slot => {
    cityCtx.beginPath();
    cityCtx.moveTo(centerX, centerY);
    cityCtx.lineTo(slot.x, slot.y);
    cityCtx.stroke();
  });
  
  // Road highlight
  cityCtx.strokeStyle = '#a09070';
  cityCtx.lineWidth = 3;
  citySlots.filter(s => s.ring === 'inner').forEach(slot => {
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

function draw25DBuilding(x, y, size, key, level, isHovered, isBuilding) {
  const buildingStyles = {
    MAIN_HALL: { base: '#c4a060', roof: '#8b4513', height: 1.8, icon: '🏛️' },
    BARRACKS: { base: '#8b7355', roof: '#c44', height: 1.3, icon: '⚔️' },
    STABLE: { base: '#a08060', roof: '#6b4423', height: 1.2, icon: '🐎' },
    WORKSHOP: { base: '#6a5a4a', roof: '#444', height: 1.4, icon: '⚙️' },
    ACADEMY: { base: '#d4c4b4', roof: '#4682B4', height: 1.5, icon: '📚' },
    FORGE: { base: '#5a4a3a', roof: '#333', height: 1.3, icon: '🔨' },
    MARKET: { base: '#c4a484', roof: '#c44', height: 1.0, icon: '🏪' },
    WAREHOUSE: { base: '#8b7355', roof: '#5a4a3a', height: 1.3, icon: '📦' },
    SILO: { base: '#c4a484', roof: '#c44', height: 1.6, icon: '🏺' },
    WALL: { base: '#7a7a7a', roof: '#5a5a5a', height: 1.2, icon: '🏰' },
    HEALING_TENT: { base: '#f0f0e0', roof: '#fff', height: 1.0, icon: '⛺' },
    RALLY_POINT: { base: '#6a5a4a', roof: '#c44', height: 0.8, icon: '🚩' },
    HIDEOUT: { base: '#5a4a3a', roof: '#3a3a2a', height: 0.6, icon: '🕳️' },
    MOAT: { base: '#4682B4', roof: '#4682B4', height: 0.3, icon: '💧' }
  };
  
  const style = buildingStyles[key] || { base: '#a08060', roof: '#6b4423', height: 1.2, icon: '🏠' };
  const buildingHeight = size * style.height;
  
  // Hover glow
  if (isHovered) {
    cityCtx.shadowColor = '#ffd700';
    cityCtx.shadowBlur = 25;
  }
  
  // Building animation for construction
  if (isBuilding) {
    cityCtx.globalAlpha = 0.5 + Math.sin(Date.now() / 200) * 0.3;
  }
  
  // Base (ellipse)
  cityCtx.fillStyle = style.base;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, size * 0.55, size * 0.3, 0, 0, Math.PI * 2);
  cityCtx.fill();
  
  // Walls (left side)
  cityCtx.fillStyle = shadeColor(style.base, -20);
  cityCtx.beginPath();
  cityCtx.moveTo(x - size * 0.55, y);
  cityCtx.lineTo(x - size * 0.55, y - buildingHeight);
  cityCtx.lineTo(x, y - buildingHeight - size * 0.15);
  cityCtx.lineTo(x, y - size * 0.3);
  cityCtx.closePath();
  cityCtx.fill();
  
  // Walls (right side)
  cityCtx.fillStyle = shadeColor(style.base, -40);
  cityCtx.beginPath();
  cityCtx.moveTo(x + size * 0.55, y);
  cityCtx.lineTo(x + size * 0.55, y - buildingHeight);
  cityCtx.lineTo(x, y - buildingHeight - size * 0.15);
  cityCtx.lineTo(x, y - size * 0.3);
  cityCtx.closePath();
  cityCtx.fill();
  
  // Roof
  cityCtx.fillStyle = style.roof;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y - buildingHeight, size * 0.55, size * 0.3, 0, 0, Math.PI * 2);
  cityCtx.fill();
  
  // Roof top (pointed)
  if (style.height > 0.5) {
    cityCtx.fillStyle = shadeColor(style.roof, -20);
    cityCtx.beginPath();
    cityCtx.moveTo(x, y - buildingHeight - size * 0.5);
    cityCtx.lineTo(x - size * 0.4, y - buildingHeight + size * 0.1);
    cityCtx.lineTo(x + size * 0.4, y - buildingHeight + size * 0.1);
    cityCtx.closePath();
    cityCtx.fill();
  }
  
  cityCtx.shadowBlur = 0;
  cityCtx.globalAlpha = 1;
  
  // Icon on front
  cityCtx.font = `${size * 0.4}px Arial`;
  cityCtx.textAlign = 'center';
  cityCtx.textBaseline = 'middle';
  cityCtx.fillText(style.icon, x, y - buildingHeight / 2);
  
  // Level badge
  if (level > 0) {
    const badgeX = x + size * 0.4;
    const badgeY = y - buildingHeight - size * 0.3;
    
    cityCtx.fillStyle = 'rgba(0,0,0,0.8)';
    cityCtx.beginPath();
    cityCtx.arc(badgeX, badgeY, 12, 0, Math.PI * 2);
    cityCtx.fill();
    
    cityCtx.strokeStyle = '#ffd700';
    cityCtx.lineWidth = 2;
    cityCtx.stroke();
    
    cityCtx.fillStyle = '#ffd700';
    cityCtx.font = 'bold 11px Cinzel, serif';
    cityCtx.fillText(level, badgeX, badgeY + 1);
  }
  
  // Construction indicator
  if (isBuilding) {
    cityCtx.fillStyle = 'rgba(255,165,0,0.8)';
    cityCtx.font = '16px Arial';
    cityCtx.fillText('🔨', x, y - buildingHeight - size * 0.6);
  }
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
    
    if (foundSlot !== null) {
      showCityTooltip(e.clientX, e.clientY, foundSlot);
    } else {
      hideCityTooltip();
    }
  }
}

function onCityClick(e) {
  if (cityHoveredSlot !== null) {
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
    // Vue champs
    if (slot?.isVillageCenter) {
      html = `
        <h4>🏰 Centre du Village</h4>
        <p class="tt-hint">Cliquez pour voir les bâtiments</p>
      `;
    } else if (slot?.isField) {
      const fieldNames = { 
        FARM: 'Champ de blé', 
        LUMBER: 'Forêt', 
        QUARRY: 'Carrière de pierre', 
        IRON_MINE: 'Mine de fer' 
      };
      const building = getFieldBuildingAtSlot(slot.slot, slot.fieldType);
      const level = building?.level || 0;
      
      html = `
        <h4>${fieldNames[slot.fieldType] || 'Ressource'}</h4>
        <p class="tt-level">Niveau ${level}</p>
        <p class="tt-hint">${level === 0 ? 'Cliquez pour construire' : 'Cliquez pour améliorer'}</p>
      `;
    }
  } else {
    // Vue ville
    const building = getBuildingAtSlot(slotNum);
    
    if (building) {
      html = `
        <h4>${BUILDING_ICONS[building.key] || '🏠'} ${getBuildingName(building.key)}</h4>
        <p class="tt-level">Niveau ${building.level}</p>
        <p class="tt-hint">Cliquez pour améliorer</p>
      `;
    } else if (slot?.fixed) {
      const mainHall = getBuildingAtSlot(0);
      html = `
        <h4>🏛️ Hôtel de Ville</h4>
        <p class="tt-level">Niveau ${mainHall?.level || 1}</p>
        <p class="tt-hint">Bâtiment principal</p>
      `;
    } else {
      html = `
        <h4>Emplacement vide</h4>
        <p class="tt-hint">Cliquez pour construire</p>
      `;
    }
  }
  
  tooltip.innerHTML = html;
  tooltip.style.display = 'block';
  
  const canvasRect = cityCanvas.parentElement.getBoundingClientRect();
  tooltip.style.left = `${mouseX - canvasRect.left + 15}px`;
  tooltip.style.top = `${mouseY - canvasRect.top - 10}px`;
}

function hideCityTooltip() {
  const tooltip = document.getElementById('city-tooltip');
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
    // ===== EXISTING BUILDING - DETAILED CARD (Travian Style) =====
    const key = building?.key || slot?.fixedKey;
    const level = building?.level || 1;
    const def = buildingsData.find(b => b.key === key);
    const maxLevel = def?.maxLevel || 20;
    const canUpgrade = level < maxLevel;
    const nextLevel = level + 1;
    
    // ===== MILITARY BUILDINGS - RECRUITMENT PANEL =====
    const isMilitaryBuilding = ['BARRACKS', 'STABLE', 'WORKSHOP'].includes(key);
    
    if (isMilitaryBuilding) {
      // Open recruitment panel for this building
      openRecruitmentPanel(key, level, slotNum);
      return;
    }
    
    // Calculate costs for next level (exponential scaling)
    const costMultiplier = Math.pow(1.3, level);
    const nextCost = {
      wood: Math.floor((def?.costL1?.wood || 50) * costMultiplier),
      stone: Math.floor((def?.costL1?.stone || 50) * costMultiplier),
      iron: Math.floor((def?.costL1?.iron || 50) * costMultiplier),
      food: Math.floor((def?.costL1?.food || 30) * costMultiplier)
    };
    
    // Calculate build time
    const baseDuration = def?.timeL1Sec || 60;
    const buildTime = Math.floor(baseDuration * Math.pow(1.4, level));
    const timeStr = formatDuration(buildTime);
    
    // Get building bonus/effect
    const bonus = getBuildingBonus(key, level);
    const nextBonus = getBuildingBonus(key, nextLevel);
    
    // Check if player has enough resources
    const hasResources = currentCity && 
      currentCity.wood >= nextCost.wood &&
      currentCity.stone >= nextCost.stone &&
      currentCity.iron >= nextCost.iron &&
      currentCity.food >= nextCost.food;
    
    title.innerHTML = `<span class="building-detail-icon">${BUILDING_ICONS[key] || '🏠'}</span> ${getBuildingName(key)}`;
    
    content.innerHTML = `
      <div class="building-detail-card">
        <!-- Header avec niveau et image -->
        <div class="building-detail-header">
          <div class="building-level-display">
            <div class="level-circle">${level}</div>
            <span class="level-label">Niveau</span>
          </div>
          <div class="building-image-container">
            <div class="building-image">${BUILDING_ICONS[key] || '🏠'}</div>
            ${building?.prodPerHour ? `<div class="production-badge">+${formatNum(building.prodPerHour)}/h</div>` : ''}
          </div>
          <div class="building-max-level">
            <span class="max-label">Max</span>
            <div class="max-circle">${maxLevel}</div>
          </div>
        </div>
        
        <!-- Description -->
        <div class="building-description">
          <p>${getBuildingDescription(key)}</p>
        </div>
        
        <!-- Bonus actuel -->
        <div class="building-bonus-section">
          <h4>📊 Bonus actuel</h4>
          <div class="bonus-display">${bonus}</div>
        </div>
        
        ${canUpgrade ? `
          <!-- Section Amélioration -->
          <div class="upgrade-section">
            <div class="upgrade-header">
              <h4>⬆️ Améliorer au niveau ${nextLevel}</h4>
              ${nextBonus !== bonus ? `<div class="next-bonus">→ ${nextBonus}</div>` : ''}
            </div>
            
            <!-- Coûts détaillés -->
            <div class="cost-grid">
              <div class="cost-item ${currentCity?.wood >= nextCost.wood ? 'available' : 'missing'}">
                <span class="cost-icon">🪵</span>
                <span class="cost-value">${formatNum(nextCost.wood)}</span>
                <span class="cost-label">Bois</span>
                <div class="cost-bar">
                  <div class="cost-bar-fill" style="width: ${Math.min(100, (currentCity?.wood / nextCost.wood) * 100)}%"></div>
                </div>
              </div>
              <div class="cost-item ${currentCity?.stone >= nextCost.stone ? 'available' : 'missing'}">
                <span class="cost-icon">🪨</span>
                <span class="cost-value">${formatNum(nextCost.stone)}</span>
                <span class="cost-label">Pierre</span>
                <div class="cost-bar">
                  <div class="cost-bar-fill" style="width: ${Math.min(100, (currentCity?.stone / nextCost.stone) * 100)}%"></div>
                </div>
              </div>
              <div class="cost-item ${currentCity?.iron >= nextCost.iron ? 'available' : 'missing'}">
                <span class="cost-icon">⛏️</span>
                <span class="cost-value">${formatNum(nextCost.iron)}</span>
                <span class="cost-label">Fer</span>
                <div class="cost-bar">
                  <div class="cost-bar-fill" style="width: ${Math.min(100, (currentCity?.iron / nextCost.iron) * 100)}%"></div>
                </div>
              </div>
              <div class="cost-item ${currentCity?.food >= nextCost.food ? 'available' : 'missing'}">
                <span class="cost-icon">🌾</span>
                <span class="cost-value">${formatNum(nextCost.food)}</span>
                <span class="cost-label">Nourriture</span>
                <div class="cost-bar">
                  <div class="cost-bar-fill" style="width: ${Math.min(100, (currentCity?.food / nextCost.food) * 100)}%"></div>
                </div>
              </div>
            </div>
            
            <!-- Temps et bouton -->
            <div class="upgrade-footer">
              <div class="build-time">
                <span class="time-icon">⏱️</span>
                <span class="time-value">${timeStr}</span>
              </div>
              <button class="upgrade-btn ${hasResources ? '' : 'disabled'}" 
                      onclick="upgradeBuilding('${key}', ${slotNum})"
                      ${hasResources ? '' : 'disabled'}>
                ${hasResources ? '🔨 Améliorer' : '❌ Ressources insuffisantes'}
              </button>
            </div>
          </div>
        ` : `
          <div class="max-level-notice">
            <span class="max-icon">🏆</span>
            <p>Niveau maximum atteint !</p>
          </div>
        `}
        
        <!-- Prérequis (si applicable) -->
        ${def?.prereq && def.prereq.length > 0 ? `
          <div class="prerequisites-section">
            <h4>📋 Prérequis</h4>
            <div class="prereq-list">
              ${def.prereq.map(p => {
                const prereqBuilding = currentCity?.buildings?.find(b => b.key === p.key);
                const met = prereqBuilding && prereqBuilding.level >= p.level;
                return `
                  <div class="prereq-item ${met ? 'met' : 'unmet'}">
                    <span>${BUILDING_ICONS[p.key] || '🏠'}</span>
                    <span>${getBuildingName(p.key)} Niv.${p.level}</span>
                    <span class="prereq-status">${met ? '✓' : '✗'}</span>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : ''}
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
        
        <button class="build-field-btn" onclick="buildAtSlot('${fieldKey}', ${slotNum})">
          🏗️ Construire ${getBuildingName(fieldKey)}
        </button>
      </div>
    `;
  } else {
    // ===== EMPTY SLOT - BUILDING LIST =====
    title.textContent = '🏗️ Construire un bâtiment';
    
    const availableBuildings = buildingsData.filter(b => 
      !['FARM', 'LUMBER', 'QUARRY', 'IRON_MINE', 'MAIN_HALL'].includes(b.key)
    );
    
    // Group by category
    const categories = {
      'BASE': { name: 'Ressources', icon: '📦', buildings: [] },
      'INTERMEDIATE': { name: 'Militaire', icon: '⚔️', buildings: [] },
      'ADVANCED': { name: 'Avancé', icon: '🏰', buildings: [] }
    };
    
    availableBuildings.forEach(b => {
      const cat = b.category || 'INTERMEDIATE';
      if (categories[cat]) categories[cat].buildings.push(b);
    });
    
    content.innerHTML = `
      <div class="building-categories">
        ${Object.entries(categories).map(([key, cat]) => cat.buildings.length > 0 ? `
          <div class="building-category">
            <h4 class="category-title">${cat.icon} ${cat.name}</h4>
            <div class="buildings-list">
              ${cat.buildings.map(b => {
                const hasResources = currentCity && 
                  currentCity.wood >= (b.costL1?.wood || 0) &&
                  currentCity.stone >= (b.costL1?.stone || 0) &&
                  currentCity.iron >= (b.costL1?.iron || 0);
                return `
                  <div class="build-option-card ${hasResources ? '' : 'insufficient'}" onclick="buildAtSlot('${b.key}', ${slotNum})">
                    <div class="build-option-icon-large">${BUILDING_ICONS[b.key] || '🏠'}</div>
                    <div class="build-option-details">
                      <h5>${b.name}</h5>
                      <p class="build-option-desc">${getBuildingDescription(b.key)}</p>
                      <div class="build-option-costs">
                        <span class="${currentCity?.wood >= (b.costL1?.wood || 0) ? '' : 'missing'}">🪵${formatNum(b.costL1?.wood || 0)}</span>
                        <span class="${currentCity?.stone >= (b.costL1?.stone || 0) ? '' : 'missing'}">🪨${formatNum(b.costL1?.stone || 0)}</span>
                        <span class="${currentCity?.iron >= (b.costL1?.iron || 0) ? '' : 'missing'}">⛏️${formatNum(b.costL1?.iron || 0)}</span>
                      </div>
                    </div>
                    <div class="build-option-action">
                      <button class="mini-build-btn">${hasResources ? '🔨' : '❌'}</button>
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
  
  panel.style.display = 'block';
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
    FARM: `Production nourriture: +${formatNum(20 + level * 60)}/h`,
    LUMBER: `Production bois: +${formatNum(20 + level * 60)}/h`,
    QUARRY: `Production pierre: +${formatNum(20 + level * 60)}/h`,
    IRON_MINE: `Production fer: +${formatNum(20 + level * 60)}/h`,
    WALL: `Bonus défense: +${level}%, Régénération mur: +${level}%`,
    MOAT: `Bonus ATK/DEF défenseur: +${(level * 0.5).toFixed(1)}%`,
    HEALING_TENT: `Capacité de soins: ${level * 3} blessés`,
    RALLY_POINT: `Armées max: ${Math.min(1 + Math.floor(level / 5), 3)}`,
    HIDEOUT: `Ressources cachées: ${level}%`
  };
  return bonuses[key] || 'Aucun bonus spécial';
}

function closeBuildPanel() {
  document.getElementById('build-panel').style.display = 'none';
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
          Production: +${level * 30}/h
        </p>
      </div>
      ${canUpgrade ? `
        <div class="upgrade-info">
          <h5>Améliorer au niveau ${level + 1}</h5>
          <p style="font-size:12px;color:#666;margin-bottom:10px">
            Production: +${(level + 1) * 30}/h (+30/h)
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
          <p style="font-size:11px;color:#888">+30/h au niveau 1</p>
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
  
  panel.style.display = 'block';
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
  
  // Determine which units can be recruited here
  const buildingNames = {
    BARRACKS: 'Caserne',
    STABLE: 'Écurie', 
    WORKSHOP: 'Atelier'
  };
  
  const buildingIcons = {
    BARRACKS: '⚔️',
    STABLE: '🐎',
    WORKSHOP: '⚙️'
  };
  
  // Filter units by building type and player faction
  const allowedClasses = {
    BARRACKS: ['INFANTRY', 'ARCHER'],
    STABLE: ['CAVALRY'],
    WORKSHOP: ['SIEGE']
  };
  
  const classes = allowedClasses[buildingKey] || [];
  
  // Filter by tier based on building level
  // Level 1-8: base only, Level 9-14: base + intermediate, Level 15+: all (base + inter + elite)
  const availableUnits = unitsData.filter(u => {
    if (u.faction !== player?.faction) return false;
    if (!classes.includes(u.class)) return false;
    
    // Check tier requirements based on building level
    if (u.tier === 'intermediate' && buildingLevel < 9) return false;
    if (u.tier === 'elite' && buildingLevel < 15) return false;
    
    return true;
  });
  
  // Check current recruitment queue for this building
  const currentQueue = currentCity?.recruitQueue?.filter(q => q.buildingKey === buildingKey) || [];
  const isRecruiting = currentQueue.some(q => q.status === 'RUNNING');
  
  title.innerHTML = `<span class="building-detail-icon">${buildingIcons[buildingKey]}</span> ${buildingNames[buildingKey]} (Niv.${buildingLevel})`;
  
  content.innerHTML = `
    <div class="recruitment-panel">
      <!-- Building info header -->
      <div class="recruit-building-header">
        <div class="building-icon-large">${buildingIcons[buildingKey]}</div>
        <div class="building-info">
          <h3>${buildingNames[buildingKey]}</h3>
          <p class="building-level">Niveau ${buildingLevel}</p>
          <p class="tier-info">
            ${buildingLevel < 9 ? '🔹 Unités de base (Niv.1+)' : 
              buildingLevel < 15 ? '🔹 Base + Intermédiaires (Niv.9+)' : 
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
      
      <!-- Available units -->
      <div class="available-units">
        <h4>🎖️ Recruter des unités</h4>
        ${availableUnits.length > 0 ? `
          <div class="units-recruit-grid">
            ${availableUnits.map(u => {
              const tierColor = TIER_COLORS[u.tier] || '#aaa';
              const tierMultiplier = u.tier === 'base' ? 1.3 : u.tier === 'intermediate' ? 1.7 : u.tier === 'elite' ? 1.9 : 1;
              const unitCost = {
                wood: Math.ceil(50 * tierMultiplier),
                stone: Math.ceil(30 * tierMultiplier),
                iron: Math.ceil(60 * tierMultiplier),
                food: Math.ceil(30 * tierMultiplier)
              };
              const canAfford = currentCity && 
                currentCity.wood >= unitCost.wood &&
                currentCity.stone >= unitCost.stone &&
                currentCity.iron >= unitCost.iron &&
                currentCity.food >= unitCost.food;
              
              return `
                <div class="unit-recruit-card ${isRecruiting ? 'disabled' : ''}" onclick="${!isRecruiting ? `openUnitRecruitModal('${u.key}', '${buildingKey}')` : ''}">
                  <div class="unit-recruit-header" style="border-color: ${tierColor}">
                    <span class="unit-icon">${UNIT_ICONS[u.class] || '⚔️'}</span>
                    <span class="tier-badge" style="background: ${tierColor}">${u.tier.charAt(0).toUpperCase()}</span>
                  </div>
                  <div class="unit-recruit-body">
                    <h5>${u.name}</h5>
                    <div class="unit-mini-stats">
                      <span>⚔️${u.stats?.attack}</span>
                      <span>🛡️${u.stats?.defense}</span>
                    </div>
                    <div class="unit-mini-cost ${canAfford ? '' : 'insufficient'}">
                      <span>🪵${unitCost.wood}</span>
                      <span>⛏️${unitCost.iron}</span>
                    </div>
                  </div>
                  ${isRecruiting ? '<div class="unit-blocked">⏳ En cours...</div>' : ''}
                </div>
              `;
            }).join('')}
          </div>
        ` : `
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
  
  panel.style.display = 'block';
}

// Open unit recruit modal (from recruitment panel)
function openUnitRecruitModal(unitKey, buildingKey) {
  const unit = unitsData.find(u => u.key === unitKey);
  if (!unit) return;
  
  closeBuildPanel();
  
  const modal = document.getElementById('modal');
  const tierColor = TIER_COLORS[unit.tier] || '#aaa';
  
  // Calculate costs
  const tierMultiplier = unit.tier === 'base' ? 1.3 : unit.tier === 'intermediate' ? 1.7 : unit.tier === 'elite' ? 1.9 : 1;
  const unitCost = {
    wood: Math.ceil(50 * tierMultiplier),
    stone: Math.ceil(30 * tierMultiplier),
    iron: Math.ceil(60 * tierMultiplier),
    food: Math.ceil(30 * tierMultiplier)
  };
  
  // Training time
  let baseTime = unit.tier === 'base' ? 60 : unit.tier === 'intermediate' ? 120 : unit.tier === 'elite' ? 180 : 600;
  if (unit.class === 'CAVALRY') baseTime = Math.floor(baseTime * 1.25);
  
  // Upkeep
  const foodUpkeep = unit.tier === 'base' ? 5 : unit.tier === 'intermediate' ? 10 : unit.tier === 'elite' ? 15 : 20;
  
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

// Recruit from building
async function recruitFromBuilding(unitKey, buildingKey) {
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
  const canUpgrade = level < maxLevel;
  const nextLevel = level + 1;
  
  let overlay = document.querySelector('.build-panel-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'build-panel-overlay';
    overlay.onclick = closeBuildPanel;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'block';
  
  const costMultiplier = Math.pow(1.3, level);
  const nextCost = {
    wood: Math.floor((def?.costL1?.wood || 50) * costMultiplier),
    stone: Math.floor((def?.costL1?.stone || 50) * costMultiplier),
    iron: Math.floor((def?.costL1?.iron || 50) * costMultiplier),
    food: Math.floor((def?.costL1?.food || 30) * costMultiplier)
  };
  
  const baseDuration = def?.timeL1Sec || 60;
  const buildTime = Math.floor(baseDuration * Math.pow(1.4, level));
  
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
          <div class="max-circle">${maxLevel}</div>
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
            <button class="upgrade-btn ${hasResources ? '' : 'disabled'}" 
                    onclick="upgradeBuilding('${buildingKey}', ${slotNum})"
                    ${hasResources ? '' : 'disabled'}>
              ${hasResources ? '🔨 Améliorer' : '❌ Ressources insuffisantes'}
            </button>
          </div>
        </div>
      ` : `
        <div class="max-level-notice">
          <span class="max-icon">🏆</span>
          <p>Niveau maximum atteint!</p>
        </div>
      `}
      
      <button class="back-to-recruit-btn" onclick="closeBuildPanel(); openBuildPanel(${slotNum})">
        ← Retour au recrutement
      </button>
    </div>
  `;
  
  panel.style.display = 'block';
}

// Get unit name helper
function getUnitName(unitKey) {
  const unit = unitsData.find(u => u.key === unitKey);
  return unit?.name || unitKey;
}

async function buildField(buildingKey, slot) {
  const res = await fetch(`${API}/api/city/${currentCity.id}/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ buildingKey, slot })
  });
  
  const data = await res.json();
  closeBuildPanel();
  
  if (res.ok) {
    showToast(`Construction de ${getBuildingName(buildingKey)} lancée!`, 'success');
    await loadCities();
    renderCity();
  } else {
    showToast(data.error || 'Erreur', 'error');
  }
}

async function buildAtSlot(buildingKey, slot) {
  const res = await fetch(`${API}/api/city/${currentCity.id}/build`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ buildingKey, slot })
  });
  
  const data = await res.json();
  closeBuildPanel();
  
  if (res.ok) {
    showToast(`Construction de ${getBuildingName(buildingKey)} lancée!`, 'success');
    await loadCities();
    renderCity();
  } else {
    showToast(data.error || 'Erreur', 'error');
  }
}

async function upgradeBuilding(buildingKey, slot) {
  await buildAtSlot(buildingKey, slot);
}

function getBuildingDescription(key) {
  const descriptions = {
    BARRACKS: 'Entraîne l\'infanterie',
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
    MOAT: 'Douves défensives'
  };
  return descriptions[key] || 'Bâtiment';
}

// Handle window resize for city canvas
window.addEventListener('resize', () => {
  if (cityCanvas && document.getElementById('tab-city').classList.contains('active')) {
    const container = cityCanvas.parentElement;
    cityCanvas.width = container.clientWidth;
    cityCanvas.height = container.clientHeight;
    calculateCitySlots();
    renderCityCanvas();
  }
});

// Animation loop for construction
setInterval(() => {
  if (document.getElementById('tab-city')?.classList.contains('active') && 
      currentCity?.buildQueue?.some(q => q.status === 'RUNNING')) {
    renderCityCanvas();
  }
}, 100);

function renderBuildingSlots() {
  // Legacy function - now handled by renderCityCanvas
  renderCityCanvas();
}

function renderBuildQueue() {
  const el = document.getElementById('build-queue');
  const queue = currentCity.buildQueue || [];
  
  const running = queue.filter(q => q.status === 'RUNNING').sort((a, b) => new Date(a.endsAt) - new Date(b.endsAt));
  const queued = queue.filter(q => q.status === 'QUEUED').sort((a, b) => a.slot - b.slot);
  
  let html = '';
  
  // Header avec slots
  html += `<div class="build-slots-header">
    <span>🔨 En cours: ${running.length}/2</span>
    <span>⏳ En attente: ${queued.length}/2</span>
  </div>`;
  
  if (queue.length === 0) {
    html += '<p style="padding:10px;color:var(--text-muted);font-size:12px;text-align:center;">Aucune construction</p>';
  } else {
    // Running items (green)
    running.forEach(q => {
      html += `
        <div class="queue-item queue-running">
          <span class="queue-status-icon">🔨</span>
          <span class="queue-name">${BUILDING_ICONS[q.buildingKey] || '🏠'} ${getBuildingName(q.buildingKey)} Niv.${q.targetLevel}</span>
          <span class="queue-time">${formatTime(q.endsAt)}</span>
        </div>
      `;
    });
    
    // Queued items (orange)
    queued.forEach(q => {
      html += `
        <div class="queue-item queue-waiting">
          <span class="queue-status-icon">⏳</span>
          <span class="queue-name">${BUILDING_ICONS[q.buildingKey] || '🏠'} ${getBuildingName(q.buildingKey)} Niv.${q.targetLevel}</span>
          <span class="queue-time">En attente</span>
        </div>
      `;
    });
  }
  
  el.innerHTML = html;
}

function renderRecruitQueue() {
  const el = document.getElementById('recruit-queue');
  if (!currentCity.recruitQueue || currentCity.recruitQueue.length === 0) {
    el.innerHTML = '<p style="padding:10px;color:var(--text-muted);font-size:12px;">Aucun recrutement</p>';
    return;
  }
  
  el.innerHTML = currentCity.recruitQueue.map(q => `
    <div class="queue-item">
      <span class="queue-name">${q.count}x ${q.unitKey}</span>
      <span class="queue-time">${formatTime(q.endsAt)}</span>
    </div>
  `).join('');
}

function renderMovingArmies() {
  const el = document.getElementById('moving-armies');
  const moving = armies.filter(a => a.status !== 'IDLE');
  
  if (moving.length === 0) {
    el.innerHTML = '<p style="padding:10px;color:var(--text-muted);font-size:12px;">Aucune armée en mouvement</p>';
    return;
  }
  
  el.innerHTML = moving.map(a => `
    <div class="queue-item">
      <span class="queue-name">${a.name} (${a.status})</span>
      <span class="queue-time">${a.arrivalAt ? formatTime(a.arrivalAt) : '-'}</span>
    </div>
  `).join('');
}

// ========== TABS ==========
function showTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  
  document.getElementById(`tab-${tabName}`).classList.add('active');
  document.querySelector(`[data-tab="${tabName}"]`)?.classList.add('active');
  
  // Start/stop animations based on tab
  if (tabName === 'city') {
    startCityAnimation();
  } else {
    stopCityAnimation();
  }
  
  // Stop map animation if not on map
  if (tabName !== 'map' && typeof stopMapAnimation === 'function') {
    stopMapAnimation();
  }
  
  // Load tab content
  switch(tabName) {
    case 'city': renderCity(); break;
    case 'buildings': loadBuildings(); break;
    case 'army': renderArmies(); break;
    case 'recruit': loadUnits(); break;
    case 'hero': loadHero(); break;
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

async function loadBuildings() {
  // Utiliser le cache si disponible
  const cached = cache.get('buildings');
  if (cached) {
    buildingsData = cached;
    renderBuildings('all');
    return;
  }
  
  try {
    const res = await requestManager.fetchWithRetry(`${API}/api/buildings`, { 
      headers: { Authorization: `Bearer ${token}` } 
    });
    if (res.ok) {
      buildingsData = await res.json();
      cache.set('buildings', buildingsData);
    }
  } catch (e) {
    console.warn('loadBuildings error:', e);
  }
  renderBuildings('all');
}

function filterBuildings(category) {
  document.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  renderBuildings(category);
}

function renderBuildings(filter) {
  const grid = document.getElementById('buildings-grid');
  let buildings = buildingsData;
  
  if (filter !== 'all') {
    buildings = buildings.filter(b => b.category === filter);
  }
  
  grid.innerHTML = buildings.map(b => {
    const existing = currentCity?.buildings?.find(cb => cb.key === b.key);
    const level = existing?.level || 0;
    const nextLevel = level + 1;
    const canBuild = nextLevel <= b.maxLevel;
    
    return `
      <div class="card">
        <h3>${BUILDING_ICONS[b.key] || '🏠'} ${b.name}</h3>
        <p>Niveau actuel: ${level} / ${b.maxLevel}</p>
        <div class="stats">
          Coût: 🪵${formatNum(b.costL1?.wood || 50)} 🪨${formatNum(b.costL1?.stone || 50)} ⛏️${formatNum(b.costL1?.iron || 50)} 🌾${formatNum(b.costL1?.food || 50)}
        </div>
        ${canBuild ? `<button onclick="build('${b.key}')">Construire Niv.${nextLevel}</button>` : '<p style="padding:10px;color:var(--gold);">Niveau max</p>'}
      </div>
    `;
  }).join('');
}

async function build(buildingKey) {
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
      unitsData = await res.json();
      cache.set('units', unitsData);
    }
  } catch (e) {
    console.warn('loadUnits error:', e);
  }
  renderUnits('all');
}

function filterUnits(classFilter) {
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');
  renderUnits(classFilter);
}

function renderUnits(filter) {
  const grid = document.getElementById('units-grid');
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
  
  // Calculate costs with tier multipliers (same formula as server!)
  const tierMultiplier = unit.tier === 'base' ? 1.3 : unit.tier === 'intermediate' ? 1.7 : unit.tier === 'elite' ? 1.9 : 1;
  // Coûts de base serveur: wood: 50, stone: 30, iron: 60, food: 30
  const baseCost = { wood: 50, stone: 30, iron: 60, food: 30 };
  const unitCost = {
    wood: Math.ceil(baseCost.wood * tierMultiplier),
    stone: Math.ceil(baseCost.stone * tierMultiplier),
    iron: Math.ceil(baseCost.iron * tierMultiplier),
    food: Math.ceil(baseCost.food * tierMultiplier)
  };
  
  // Consommation de céréales par heure (upkeep)
  const foodUpkeep = unit.tier === 'base' ? 5 : unit.tier === 'intermediate' ? 10 : unit.tier === 'elite' ? 15 : 20;
  
  // Training time
  let baseTime = unit.tier === 'base' ? 60 : unit.tier === 'intermediate' ? 120 : unit.tier === 'elite' ? 180 : 600;
  if (unit.class === 'CAVALRY') baseTime = Math.floor(baseTime * 1.25);
  const trainTime = baseTime;
  
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
  
  // Render garrison summary header (compact)
  garrisonSummary.innerHTML = `
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
                  <div class="garrison-unit-compact" title="${unit?.name || u.unitKey}">
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
    'GARRISON': { icon: '🏰', label: 'Garnison', cls: 'garrison' }
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
      
      <!-- Actions -->
      <div class="army-actions-row">
        ${army.status === 'IDLE' ? `
          <button class="army-btn primary" onclick="openArmyComposition('${army.id}')" title="Composer">
            📋 Composer
          </button>
          <button class="army-btn icon-only" onclick="showArmyActionsMenu('${army.id}')" title="Actions">
            ⚙️
          </button>
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
  
  const modal = document.getElementById('modal');
  document.getElementById('modal-body').innerHTML = `
    <div class="army-actions-modal">
      <h3>⚙️ Actions - ${army.name}</h3>
      <div class="actions-grid">
        <button class="action-card" onclick="closeModal(); showMoveModal('${armyId}')">
          <span class="action-icon">🚶</span>
          <span class="action-label">Déplacer</span>
        </button>
        <button class="action-card" onclick="closeModal(); showAttackModal('${armyId}')">
          <span class="action-icon">⚔️</span>
          <span class="action-label">Attaquer</span>
        </button>
        <button class="action-card" onclick="closeModal(); showRaidModal('${armyId}')">
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

// Open modal to add units to army
function openAddUnitsModal(armyId) {
  const garrison = getGarrisonUnits();
  
  if (garrison.length === 0) {
    showToast('Aucune unité en garnison!', 'error');
    return;
  }
  
  const modal = document.getElementById('modal');
  
  document.getElementById('modal-body').innerHTML = `
    <div class="add-units-modal">
      <h3>➕ Ajouter des unités à l'armée</h3>
      <div class="add-units-grid">
        ${garrison.map(g => {
          const unit = unitsData.find(u => u.key === g.unitKey);
          const tierColor = TIER_COLORS[unit?.tier] || '#888';
          return `
            <div class="add-unit-row">
              <div class="add-unit-info">
                <span class="add-unit-icon" style="border-color: ${tierColor}">${UNIT_ICONS[unit?.class] || '⚔️'}</span>
                <span class="add-unit-name">${unit?.name || g.unitKey}</span>
                <span class="add-unit-available">(${g.count} dispo)</span>
              </div>
              <div class="add-unit-controls">
                <input type="number" id="add-${g.unitKey}" min="0" max="${g.count}" value="0" class="add-unit-input">
                <button class="btn-max" onclick="document.getElementById('add-${g.unitKey}').value = ${g.count}">Max</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
        <button class="btn btn-primary" onclick="confirmAddUnits('${armyId}')">Ajouter</button>
      </div>
    </div>
  `;
  
  modal.style.display = 'flex';
}

// Confirm adding units
async function confirmAddUnits(armyId) {
  const garrison = getGarrisonUnits();
  const unitsToAdd = [];
  
  garrison.forEach(g => {
    const input = document.getElementById(`add-${g.unitKey}`);
    const count = parseInt(input?.value) || 0;
    if (count > 0) {
      unitsToAdd.push({ unitKey: g.unitKey, count });
    }
  });
  
  if (unitsToAdd.length === 0) {
    showToast('Sélectionnez au moins une unité', 'warning');
    return;
  }
  
  try {
    const res = await fetch(`${API}/api/army/${armyId}/add-units`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ units: unitsToAdd })
    });
    
    closeModal();
    
    if (res.ok) {
      showToast('Unités ajoutées!', 'success');
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
}

async function returnArmy(armyId) {
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
}

// ========== HERO ==========
async function loadHero() {
  const res = await fetch(`${API}/api/hero`, { headers: { Authorization: `Bearer ${token}` } });
  const panel = document.getElementById('hero-panel');
  
  if (res.ok) {
    const hero = await res.json();
    if (hero) {
      const xpPct = (hero.xp / hero.xpToNextLevel) * 100;
      panel.innerHTML = `
        <div class="hero-card">
          <div class="hero-header">
            <div class="hero-portrait">⚔️</div>
            <div class="hero-info">
              <h3>${hero.name}</h3>
              <div class="hero-level">Niveau ${hero.level}</div>
              <div class="hero-xp">
                <div class="xp-bar"><div class="xp-fill" style="width:${xpPct}%"></div></div>
                <div class="xp-text">${hero.xp} / ${hero.xpToNextLevel} XP</div>
              </div>
            </div>
          </div>
          <div class="hero-stats">
            <div class="stat-item"><span class="stat-name">⚔️ Attaque</span><span class="stat-value">${hero.atkPoints}</span></div>
            <div class="stat-item"><span class="stat-name">🛡️ Défense</span><span class="stat-value">${hero.defPoints}</span></div>
            <div class="stat-item"><span class="stat-name">🏃 Vitesse</span><span class="stat-value">${hero.spdPoints}</span></div>
            <div class="stat-item"><span class="stat-name">📦 Logistique</span><span class="stat-value">${hero.logPoints}</span></div>
          </div>
          ${hero.statPoints > 0 ? `
            <div class="hero-points">
              <div class="points-available">Points disponibles: ${hero.statPoints}</div>
              <div class="points-grid">
                <button class="point-btn" onclick="assignPoint('atk')">+ATK</button>
                <button class="point-btn" onclick="assignPoint('def')">+DEF</button>
                <button class="point-btn" onclick="assignPoint('spd')">+SPD</button>
                <button class="point-btn" onclick="assignPoint('log')">+LOG</button>
              </div>
            </div>
          ` : ''}
        </div>
      `;
    } else {
      panel.innerHTML = '<p style="color:var(--text-muted)">Aucun héros</p>';
    }
  }
}

async function assignPoint(stat) {
  const body = { atk: 0, def: 0, spd: 0, log: 0 };
  body[stat] = 1;
  
  const res = await fetch(`${API}/api/hero/assign-points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body)
  });
  
  if (res.ok) {
    showToast('Point assigné!', 'success');
    loadHero();
  }
}

// ========== EXPEDITIONS ==========
async function loadExpeditions() {
  const res = await fetch(`${API}/api/expeditions`, { headers: { Authorization: `Bearer ${token}` } });
  
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
}

// ========== MAP - Rise of Kingdoms Style Canvas ==========
let mapCanvas, mapCtx, minimapCanvas, minimapCtx;
let mapData = [];
let mapZoomLevel = 1;
let mapOffsetX = 0, mapOffsetY = 0;
let mapDragging = false;
let mapDragStart = { x: 0, y: 0 };
let mapHoveredTile = null;
let mapSelectedTile = null;
const TILE_SIZE = 40;
const WORLD_SIZE = 200; // 200x200 world

// ========== ISOMETRIC MAP SYSTEM - Rise of Kingdoms Style ==========
// ========== 3 BIOMES: FOREST (center), DESERT (middle ring), SNOW (outer ring) ==========
const ISO_TILE_WIDTH = 64;
const ISO_TILE_HEIGHT = 32;
const WORLD_CENTER = 250; // Center of the 500x500 map

// BIOME CONFIGURATION
const BIOMES = {
  // TIER 1: Forest/Grassland (center, radius 0-120)
  forest: {
    ground: ['#5a8c3a', '#4e7a32', '#62943e', '#568838', '#4a7230'],
    groundDark: ['#4a7830', '#3e6a28', '#527e34', '#466c2c', '#3a6224'],
    features: ['tree', 'mountain', 'water'],
    skyTop: '#87CEEB',
    skyBottom: '#5a8c3a'
  },
  // TIER 2: Desert (middle ring, radius 120-200)
  desert: {
    ground: ['#d4c4a0', '#c9b896', '#ddd0aa', '#c4b48a', '#d9c99e'],
    groundDark: ['#c4b490', '#b9a886', '#cdc09a', '#b4a47a', '#c9b98e'],
    features: ['ruins', 'oasis', 'dunes', 'rocks'],
    skyTop: '#f4e8d0',
    skyBottom: '#d4c4a0'
  },
  // TIER 3: Snow/Tundra (outer ring, radius 200+)
  snow: {
    ground: ['#e8e8e8', '#dcdcdc', '#f0f0f0', '#d8d8d8', '#eaeaea'],
    groundDark: ['#c8c8c8', '#bcbcbc', '#d0d0d0', '#b8b8b8', '#cacaca'],
    features: ['snowtree', 'icemountain', 'frozen'],
    skyTop: '#b8c8d8',
    skyBottom: '#8898a8'
  }
};

const TILE_COLORS = {
  myCity: { fill: '#d4a84b', stroke: '#8b6914', glow: '#ffd700', banner: '#ffd700' },
  enemyCity: { fill: '#c44444', stroke: '#822222', glow: '#ff6060', banner: '#ff4444' },
  allyCity: { fill: '#44aa88', stroke: '#228866', glow: '#66ffcc', banner: '#44ff88' },
  neutralCity: { fill: '#888888', stroke: '#666666', glow: '#aaaaaa', banner: '#cccccc' },
  wood: { fill: '#2d5a1e', stroke: '#1e4a12' },
  stone: { fill: '#7a7a7a', stroke: '#5a5a5a' },
  iron: { fill: '#5a6a7a', stroke: '#4a5a6a' },
  food: { fill: '#8aaa40', stroke: '#6a8a20' },
  gold: { fill: '#ffd700', stroke: '#b8860b' }
};

// ========== TERRAIN MOVEMENT SYSTEM ==========
// Multiplicateurs de temps de trajet pour les armées/héros
// terrain infranchissable = Infinity
const TERRAIN_MOVEMENT = {
  // Terrains de base
  grass: 1.0,        // Normal
  tree: 1.3,         // Forêt ralentit légèrement
  mountain: Infinity, // Infranchissable
  water: Infinity,    // Infranchissable (lac/rivière)
  // Désert
  sand: 1.2,         // Sable ralentit un peu
  dunes: 1.5,        // Dunes difficiles
  oasis: 1.0,        // Oasis = terrain facile
  ruins: 1.1,        // Ruines légèrement difficiles
  rocks: 1.4,        // Rochers
  // Neige
  snow: 1.4,         // Neige ralentit
  ice: 1.6,          // Glace très lente
  frozen: Infinity,   // Lac gelé infranchissable
  icemountain: Infinity, // Montagne de glace infranchissable
  snowtree: 1.3      // Sapin enneigé
};

// Vérifie si une case est traversable
function isTerrainPassable(x, y) {
  const terrain = getTerrainType(x, y);
  if (!terrain.feature) return true;
  const mult = TERRAIN_MOVEMENT[terrain.feature];
  return mult !== Infinity;
}

// Calcule le multiplicateur de temps pour une case
function getTerrainMovementMultiplier(x, y) {
  const terrain = getTerrainType(x, y);
  if (!terrain.feature) {
    // Terrain de base selon le biome
    if (terrain.biome === 'desert') return TERRAIN_MOVEMENT.sand;
    if (terrain.biome === 'snow') return TERRAIN_MOVEMENT.snow;
    return TERRAIN_MOVEMENT.grass;
  }
  return TERRAIN_MOVEMENT[terrain.feature] || 1.0;
}

// Pseudo-random based on coordinates for consistent terrain
function seededRandom(x, y, seed = 12345) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

// Get biome based on distance from center
function getBiome(x, y) {
  const dx = x - WORLD_CENTER;
  const dy = y - WORLD_CENTER;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 120) return 'forest';
  if (dist < 200) return 'desert';
  return 'snow';
}

// Check if tile has features based on noise and biome
function getTerrainType(x, y) {
  const biome = getBiome(x, y);
  const noise = seededRandom(x, y);
  const noise2 = seededRandom(x * 2, y * 2, 54321);

  if (biome === 'forest') {
    if (noise > 0.92 && noise2 > 0.5) return { biome, feature: 'mountain' };
    if (noise > 0.60 && noise2 > 0.3) return { biome, feature: 'tree' };
    if (noise < 0.03 && noise2 < 0.5) return { biome, feature: 'water' };
  } else if (biome === 'desert') {
    if (noise > 0.93) return { biome, feature: 'ruins' };
    if (noise > 0.85 && noise2 > 0.5) return { biome, feature: 'rocks' };
    if (noise > 0.70 && noise2 > 0.6) return { biome, feature: 'dunes' };
    if (noise < 0.05 && noise2 < 0.4) return { biome, feature: 'oasis' };
  } else if (biome === 'snow') {
    if (noise > 0.90 && noise2 > 0.4) return { biome, feature: 'icemountain' };
    if (noise > 0.55 && noise2 > 0.3) return { biome, feature: 'snowtree' };
    if (noise < 0.04 && noise2 < 0.5) return { biome, feature: 'frozen' };
  }

  return { biome, feature: null };
}

function initMapCanvas() {
  mapCanvas = document.getElementById('world-canvas');
  mapCtx = mapCanvas?.getContext('2d');
  minimapCanvas = document.getElementById('minimap-canvas');
  minimapCtx = minimapCanvas?.getContext('2d');
  
  if (!mapCanvas || !mapCtx) return;
  
  // Resize canvas to container
  const container = mapCanvas.parentElement;
  mapCanvas.width = container.clientWidth;
  mapCanvas.height = container.clientHeight;
  
  // Event listeners
  mapCanvas.addEventListener('mousedown', onMapMouseDown);
  mapCanvas.addEventListener('mousemove', onMapMouseMove);
  mapCanvas.addEventListener('mouseup', onMapMouseUp);
  mapCanvas.addEventListener('mouseleave', onMapMouseUp);
  mapCanvas.addEventListener('wheel', onMapWheel, { passive: false });
  mapCanvas.addEventListener('click', onMapClick);
  
  // Touch events for mobile
  mapCanvas.addEventListener('touchstart', onMapTouchStart, { passive: false });
  mapCanvas.addEventListener('touchmove', onMapTouchMove, { passive: false });
  mapCanvas.addEventListener('touchend', onMapTouchEnd);
  
  // Keyboard shortcuts for zoom (when map tab is active)
  document.addEventListener('keydown', onMapKeyDown);
  
  // Center on capital initially
  centerOnCapital();
}

// ========== TRAVIAN-STYLE KEYBOARD SHORTCUTS ==========
// Global keyboard shortcuts (works everywhere)
document.addEventListener('keydown', onGlobalKeyDown);

function onGlobalKeyDown(e) {
  // Don't capture if typing in input/textarea
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  // Don't capture if modal is open
  const modal = document.getElementById('modal');
  if (modal && modal.style.display !== 'none') return;
  
  // ===== TRAVIAN ACCESS KEYS (1-9) =====
  switch(e.key) {
    case '1': // Champs (Resources)
      e.preventDefault();
      showTab('fields');
      showToast('🌾 Vue Champs', 'info');
      break;
    case '2': // Ville (Buildings)
      e.preventDefault();
      showTab('city');
      showToast('🏛️ Vue Ville', 'info');
      break;
    case '3': // Carte
      e.preventDefault();
      showTab('map');
      showToast('🗺️ Carte', 'info');
      break;
    case '4': // Statistiques (Classement)
      e.preventDefault();
      showTab('ranking');
      showToast('📊 Classement', 'info');
      break;
    case '5': // Rapports
      e.preventDefault();
      showTab('reports');
      showToast('📜 Rapports', 'info');
      break;
    case '6': // Messages (Alliance)
      e.preventDefault();
      showTab('alliance');
      showToast('⚔️ Alliance', 'info');
      break;
    case '7': // Armée
      e.preventDefault();
      showTab('army');
      showToast('🗡️ Armée', 'info');
      break;
    case '8': // Héros
      e.preventDefault();
      showTab('hero');
      showToast('🦸 Héros', 'info');
      break;
    case '9': // Marché
      e.preventDefault();
      showTab('market');
      showToast('🏪 Marché', 'info');
      break;
    
    // ===== VILLAGE NAVIGATION (B/N like Travian) =====
    case 'b':
    case 'B':
      e.preventDefault();
      switchToPreviousCity();
      break;
    case 'n':
    case 'N':
      e.preventDefault();
      switchToNextCity();
      break;
    
    // ===== HELP OVERLAY =====
    case '?':
    case '/':
      e.preventDefault();
      toggleHelpOverlay();
      break;
    
    // ===== ESCAPE closes panels =====
    case 'Escape':
      closeAllPanels();
      break;
      
    // ===== PROFILE =====
    case 'p':
    case 'P':
      if (!e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        showPlayerProfile();
        showToast('👤 Profil', 'info');
      }
      break;
  }
}

// Keyboard shortcuts for map (WASD + arrows + zoom)
function onMapKeyDown(e) {
  // Only when map tab is visible
  const mapTab = document.getElementById('tab-map');
  if (!mapTab || mapTab.style.display === 'none') return;
  
  // Don't capture if typing in input
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  const moveSpeed = e.shiftKey ? 15 : 5; // Shift = faster
  
  switch(e.key.toLowerCase()) {
    // ===== ZOOM =====
    case '+':
    case '=':
      e.preventDefault();
      mapZoom(1);
      break;
    case '-':
    case '_':
      e.preventDefault();
      mapZoom(-1);
      break;
    case '0':
      e.preventDefault();
      mapZoomLevel = 1;
      renderMap();
      renderMinimap();
      updateMapUI();
      showToast('Zoom réinitialisé', 'info');
      break;
    
    // ===== HOME (center on capital) =====
    case 'home':
    case 'h':
      e.preventDefault();
      centerOnCapital();
      renderMap();
      renderMinimap();
      updateMapUI();
      showToast('🏠 Capitale', 'info');
      break;
    
    // ===== WASD MOVEMENT (Travian style) =====
    case 'w':
    case 'arrowup':
      e.preventDefault();
      mapOffsetY = Math.max(0, mapOffsetY - moveSpeed);
      renderMap();
      renderMinimap();
      updateMapUI();
      break;
    case 's':
    case 'arrowdown':
      e.preventDefault();
      mapOffsetY = Math.min(WORLD_SIZE, mapOffsetY + moveSpeed);
      renderMap();
      renderMinimap();
      updateMapUI();
      break;
    case 'a':
    case 'arrowleft':
      e.preventDefault();
      mapOffsetX = Math.max(0, mapOffsetX - moveSpeed);
      renderMap();
      renderMinimap();
      updateMapUI();
      break;
    case 'd':
    case 'arrowright':
      e.preventDefault();
      mapOffsetX = Math.min(WORLD_SIZE, mapOffsetX + moveSpeed);
      renderMap();
      renderMinimap();
      updateMapUI();
      break;
    
    // ===== GRID TOGGLE (G like Travian) =====
    case 'g':
      e.preventDefault();
      toggleMapGrid();
      break;
    
    // ===== MINIMAP TOGGLE (M like Travian) =====
    case 'm':
      e.preventDefault();
      toggleMinimap();
      break;
  }
}

// ===== CITY NAVIGATION =====
function switchToPreviousCity() {
  if (!cities || cities.length <= 1) {
    showToast('Une seule ville', 'warning');
    return;
  }
  const currentIndex = cities.findIndex(c => c.id === currentCity?.id);
  const prevIndex = (currentIndex - 1 + cities.length) % cities.length;
  selectCity(cities[prevIndex].id);
  showToast(`⬅️ ${cities[prevIndex].name}`, 'info');
}

function switchToNextCity() {
  if (!cities || cities.length <= 1) {
    showToast('Une seule ville', 'warning');
    return;
  }
  const currentIndex = cities.findIndex(c => c.id === currentCity?.id);
  const nextIndex = (currentIndex + 1) % cities.length;
  selectCity(cities[nextIndex].id);
  showToast(`➡️ ${cities[nextIndex].name}`, 'info');
}

// ===== MAP GRID TOGGLE =====
let showMapGrid = true;
function toggleMapGrid() {
  showMapGrid = !showMapGrid;
  renderMap();
  showToast(showMapGrid ? '📐 Grille activée' : '📐 Grille désactivée', 'info');
}

// ===== MINIMAP TOGGLE =====
let showMinimapPanel = true;
function toggleMinimap() {
  showMinimapPanel = !showMinimapPanel;
  const minimapContainer = document.querySelector('.minimap-container');
  if (minimapContainer) {
    minimapContainer.style.display = showMinimapPanel ? 'block' : 'none';
  }
  showToast(showMinimapPanel ? '🗺️ Minimap visible' : '🗺️ Minimap masquée', 'info');
}

// ===== CLOSE ALL PANELS =====
function closeAllPanels() {
  closeModal();
  const actionPanel = document.getElementById('action-panel');
  if (actionPanel) actionPanel.style.display = 'none';
}

// ===== HELP OVERLAY =====
function toggleHelpOverlay() {
  let overlay = document.getElementById('help-overlay');
  
  if (overlay) {
    overlay.style.display = overlay.style.display === 'none' ? 'flex' : 'none';
    return;
  }
  
  // Create help overlay
  overlay = document.createElement('div');
  overlay.id = 'help-overlay';
  overlay.className = 'help-overlay';
  overlay.innerHTML = `
    <div class="help-content">
      <h2>⌨️ Raccourcis Clavier</h2>
      <button class="close-help" onclick="toggleHelpOverlay()">✕</button>
      
      <div class="help-columns">
        <div class="help-column">
          <h3>📋 Navigation (Style Travian)</h3>
          <div class="shortcut"><kbd>1</kbd> Vue Champs</div>
          <div class="shortcut"><kbd>2</kbd> Vue Ville</div>
          <div class="shortcut"><kbd>3</kbd> Carte</div>
          <div class="shortcut"><kbd>4</kbd> Classement</div>
          <div class="shortcut"><kbd>5</kbd> Rapports</div>
          <div class="shortcut"><kbd>6</kbd> Alliance</div>
          <div class="shortcut"><kbd>7</kbd> Armée</div>
          <div class="shortcut"><kbd>8</kbd> Héros</div>
          <div class="shortcut"><kbd>9</kbd> Marché</div>
        </div>
        
        <div class="help-column">
          <h3>🏘️ Villes</h3>
          <div class="shortcut"><kbd>B</kbd> Ville précédente</div>
          <div class="shortcut"><kbd>N</kbd> Ville suivante</div>
          <div class="shortcut"><kbd>P</kbd> Profil joueur</div>
          <div class="shortcut"><kbd>Esc</kbd> Fermer panels</div>
        </div>
        
        <div class="help-column">
          <h3>🗺️ Carte</h3>
          <div class="shortcut"><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> Déplacement</div>
          <div class="shortcut"><kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd> Déplacement</div>
          <div class="shortcut"><kbd>Shift</kbd>+Flèches Rapide</div>
          <div class="shortcut"><kbd>+</kbd><kbd>-</kbd> Zoom</div>
          <div class="shortcut"><kbd>Molette</kbd> Zoom intelligent</div>
          <div class="shortcut"><kbd>0</kbd> Reset zoom</div>
          <div class="shortcut"><kbd>H</kbd> Centre capitale</div>
          <div class="shortcut"><kbd>G</kbd> Toggle grille</div>
          <div class="shortcut"><kbd>M</kbd> Toggle minimap</div>
        </div>
      </div>
      
      <p class="help-footer">Appuyez sur <kbd>?</kbd> pour fermer</p>
    </div>
  `;
  
  document.body.appendChild(overlay);
  
  // Close on click outside
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) toggleHelpOverlay();
  });
}

async function loadMap() {
  initMapCanvas();

  // Center map on player's first city if not already positioned
  if (mapOffsetX === 0 && mapOffsetY === 0 && currentCity) {
    mapOffsetX = currentCity.x;
    mapOffsetY = currentCity.y;
  }

  // Load all visible tiles from server
  const viewSize = Math.ceil(60 / mapZoomLevel);
  const radius = Math.ceil(viewSize / 2);

  try {
    const res = await fetch(
      `${API}/api/map/viewport?x=${Math.floor(mapOffsetX)}&y=${Math.floor(mapOffsetY)}&radius=${radius}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );

    if (res.ok) {
      const data = await res.json();
      // Combine cities and resourceNodes into mapData array
      mapData = [];

      // Add cities
      if (data.cities) {
        data.cities.forEach(c => {
          mapData.push({
            x: c.x,
            y: c.y,
            type: 'CITY',
            playerId: c.playerId || c.player?.id,
            name: c.name,
            isCapital: c.isCapital,
            allianceId: c.player?.allianceId
          });
        });
      }

      // Add resource nodes
      if (data.resourceNodes) {
        data.resourceNodes.forEach(r => {
          mapData.push({
            x: r.x,
            y: r.y,
            type: 'RESOURCE',
            resourceType: r.resourceType
          });
        });
      }

      // Always include player's cities even if not in viewport
      cities.forEach(c => {
        if (!mapData.find(d => d.x === c.x && d.y === c.y)) {
          mapData.push({
            x: c.x,
            y: c.y,
            type: 'CITY',
            playerId: player?.id,
            name: c.name,
            isCapital: c.isCapital
          });
        }
      });
    }
  } catch (e) {
    console.warn('Could not load map data:', e);
    // Generate fake data for demo including player cities
    mapData = generateFakeMapData(Math.floor(mapOffsetX), Math.floor(mapOffsetY), viewSize);
  }

  renderMap();
  renderMinimap();
  updateMapUI();
}

function generateFakeMapData(startX, startY, size) {
  const data = [];
  const seed = 12345;
  
  // Add player cities
  cities.forEach(c => {
    data.push({ x: c.x, y: c.y, type: 'CITY', playerId: player?.id, name: c.name, isCapital: c.isCapital });
  });
  
  // Add some random resources and enemy cities
  for (let i = 0; i < 50; i++) {
    const x = startX + Math.floor(Math.random() * size);
    const y = startY + Math.floor(Math.random() * size);
    const types = ['WOOD', 'STONE', 'IRON', 'FOOD'];
    
    if (Math.random() < 0.1) {
      data.push({ x, y, type: 'CITY', playerId: 'enemy', name: `Ville ${i}` });
    } else {
      data.push({ x, y, type: 'RESOURCE', resourceType: types[Math.floor(Math.random() * 4)] });
    }
  }
  
  return data;
}

function renderMap() {
  if (!mapCtx) return;

  const w = mapCanvas.width;
  const h = mapCanvas.height;

  // Tile size based on zoom
  const tileW = ISO_TILE_WIDTH * mapZoomLevel;
  const tileH = ISO_TILE_HEIGHT * mapZoomLevel;

  // Get current biome for sky gradient (based on center of view)
  const centerBiome = getBiome(Math.floor(mapOffsetX), Math.floor(mapOffsetY));
  const biomeColors = BIOMES[centerBiome];

  // Clear canvas with sky gradient based on biome
  const gradient = mapCtx.createLinearGradient(0, 0, 0, h);
  gradient.addColorStop(0, biomeColors.skyTop);
  gradient.addColorStop(1, biomeColors.skyBottom);
  mapCtx.fillStyle = gradient;
  mapCtx.fillRect(0, 0, w, h);

  // Calculate visible tiles
  const tilesX = Math.ceil(w / tileW) + 4;
  const tilesY = Math.ceil(h / tileH) + 4;

  // Convert world to isometric screen coordinates
  function worldToScreen(wx, wy) {
    const dx = wx - mapOffsetX;
    const dy = wy - mapOffsetY;
    return {
      x: w / 2 + (dx - dy) * tileW / 2,
      y: h / 2 + (dx + dy) * tileH / 2
    };
  }

  // Convert screen to world coordinates
  function screenToWorld(sx, sy) {
    const dx = sx - w / 2;
    const dy = sy - h / 2;
    return {
      x: Math.floor(mapOffsetX + (dx / tileW + dy / tileH)),
      y: Math.floor(mapOffsetY + (dy / tileH - dx / tileW))
    };
  }

  // Store for click detection
  window.mapScreenToWorld = screenToWorld;

  // Draw isometric terrain grid
  const drawOrder = [];

  for (let i = -tilesY; i < tilesY; i++) {
    for (let j = -tilesX; j < tilesX; j++) {
      const wx = Math.floor(mapOffsetX) + j;
      const wy = Math.floor(mapOffsetY) + i;
      const pos = worldToScreen(wx, wy);

      if (pos.x < -tileW * 2 || pos.x > w + tileW * 2 ||
          pos.y < -tileH * 2 || pos.y > h + tileH * 2) continue;

      drawOrder.push({ wx, wy, x: pos.x, y: pos.y, type: 'terrain' });
    }
  }

  // Sort by Y for proper layering (painter's algorithm)
  drawOrder.sort((a, b) => a.y - b.y || a.x - b.x);

  // Draw terrain tiles
  drawOrder.forEach(tile => {
    drawIsoTile(tile.x, tile.y, tileW, tileH, tile.wx, tile.wy);
  });

  // Draw objects (cities, resources) with proper layering
  const objectsOrder = [];

  mapData.forEach(obj => {
    const pos = worldToScreen(obj.x, obj.y);
    if (pos.x >= -tileW * 2 && pos.x <= w + tileW * 2 &&
        pos.y >= -tileH * 2 && pos.y <= h + tileH * 2) {
      objectsOrder.push({ ...obj, screenX: pos.x, screenY: pos.y });
    }
  });

  // Add armies to draw order
  armies.forEach(army => {
    const pos = worldToScreen(army.x, army.y);
    if (pos.x >= -tileW * 2 && pos.x <= w + tileW * 2 &&
        pos.y >= -tileH * 2 && pos.y <= h + tileH * 2) {
      objectsOrder.push({ ...army, type: 'ARMY', screenX: pos.x, screenY: pos.y });
    }
  });

  // Sort objects by Y position
  objectsOrder.sort((a, b) => a.screenY - b.screenY);

  // Draw all objects
  objectsOrder.forEach(obj => {
    if (obj.type === 'CITY') {
      drawIsoCity(obj.screenX, obj.screenY, tileW, tileH, obj);
    } else if (obj.type === 'RESOURCE') {
      drawIsoResource(obj.screenX, obj.screenY, tileW, tileH, obj);
    } else if (obj.type === 'ARMY') {
      drawIsoArmy(obj.screenX, obj.screenY, tileW, tileH, obj);
    }
  });

  // Draw hover highlight
  if (mapHoveredTile) {
    const pos = worldToScreen(mapHoveredTile.x, mapHoveredTile.y);
    drawIsoHighlight(pos.x, pos.y, tileW, tileH, '#ffd700', 2);
  }

  // Draw selected tile
  if (mapSelectedTile) {
    const pos = worldToScreen(mapSelectedTile.x, mapSelectedTile.y);
    drawIsoHighlight(pos.x, pos.y, tileW, tileH, '#00ff00', 3);
  }
}

// Draw a single isometric tile with biome support
function drawIsoTile(x, y, tw, th, wx, wy) {
  const terrain = getTerrainType(wx, wy);
  const biome = terrain.biome;
  const feature = terrain.feature;
  const colorVariant = Math.floor(seededRandom(wx, wy, 99999) * 5);
  const biomeColors = BIOMES[biome];

  // Draw diamond shape (base tile)
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - th / 2);        // Top
  mapCtx.lineTo(x + tw / 2, y);        // Right
  mapCtx.lineTo(x, y + th / 2);        // Bottom
  mapCtx.lineTo(x - tw / 2, y);        // Left
  mapCtx.closePath();

  // Fill based on biome and feature
  if (feature === 'water' || feature === 'frozen') {
    mapCtx.fillStyle = feature === 'frozen' ? '#a8c8d8' : '#3a6a8a';
  } else if (feature === 'oasis') {
    mapCtx.fillStyle = '#4a9a6a';
  } else {
    mapCtx.fillStyle = biomeColors.ground[colorVariant];
  }
  mapCtx.fill();

  // Subtle grid lines
  if (mapZoomLevel > 0.5 && showMapGrid) {
    mapCtx.strokeStyle = 'rgba(0,0,0,0.1)';
    mapCtx.lineWidth = 0.5;
    mapCtx.stroke();
  }

  // Draw terrain features based on biome
  if (biome === 'forest') {
    if (feature === 'tree') {
      drawIsoTree(x, y - th * 0.3, tw * 0.4, th * 0.8);
    } else if (feature === 'mountain') {
      drawIsoMountain(x, y - th * 0.5, tw * 0.6, th * 1.2);
    } else if (feature === 'water') {
      drawIsoWater(x, y, tw, th);
    }
  } else if (biome === 'desert') {
    if (feature === 'dunes') {
      drawDesertDunes(x, y, tw, th);
    } else if (feature === 'ruins') {
      drawDesertRuins(x, y - th * 0.3, tw * 0.5, th * 0.8);
    } else if (feature === 'oasis') {
      drawDesertOasis(x, y, tw, th);
    } else if (feature === 'rocks') {
      drawDesertRocks(x, y - th * 0.2, tw * 0.4, th * 0.6);
    }
  } else if (biome === 'snow') {
    if (feature === 'snowtree') {
      drawSnowTree(x, y - th * 0.3, tw * 0.4, th * 0.8);
    } else if (feature === 'icemountain') {
      drawIceMountain(x, y - th * 0.5, tw * 0.6, th * 1.2);
    } else if (feature === 'frozen') {
      drawFrozenLake(x, y, tw, th);
    }
  }
}

// Draw isometric tree (pine/fir)
function drawIsoTree(x, y, w, h) {
  const treeH = h * (0.8 + seededRandom(x, y) * 0.4);

  // Trunk
  mapCtx.fillStyle = '#4a3020';
  mapCtx.fillRect(x - w * 0.05, y, w * 0.1, treeH * 0.3);

  // Foliage layers (triangles)
  mapCtx.fillStyle = '#1e4a12';
  for (let i = 0; i < 3; i++) {
    const layerY = y - treeH * 0.2 * i;
    const layerW = w * (0.8 - i * 0.15);
    mapCtx.beginPath();
    mapCtx.moveTo(x, layerY - treeH * 0.35);
    mapCtx.lineTo(x + layerW / 2, layerY);
    mapCtx.lineTo(x - layerW / 2, layerY);
    mapCtx.closePath();
    mapCtx.fill();
  }

  // Darker side for 3D effect
  mapCtx.fillStyle = '#0e3a08';
  for (let i = 0; i < 3; i++) {
    const layerY = y - treeH * 0.2 * i;
    const layerW = w * (0.8 - i * 0.15);
    mapCtx.beginPath();
    mapCtx.moveTo(x, layerY - treeH * 0.35);
    mapCtx.lineTo(x + layerW / 2, layerY);
    mapCtx.lineTo(x, layerY);
    mapCtx.closePath();
    mapCtx.fill();
  }
}

// Draw isometric mountain
function drawIsoMountain(x, y, w, h) {
  // Base (dark)
  mapCtx.fillStyle = '#5a5a5a';
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - h);
  mapCtx.lineTo(x + w / 2, y);
  mapCtx.lineTo(x - w / 2, y);
  mapCtx.closePath();
  mapCtx.fill();

  // Light side
  mapCtx.fillStyle = '#8a8a8a';
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - h);
  mapCtx.lineTo(x - w / 2, y);
  mapCtx.lineTo(x - w * 0.1, y - h * 0.3);
  mapCtx.closePath();
  mapCtx.fill();

  // Snow cap
  mapCtx.fillStyle = '#e8e8e8';
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - h);
  mapCtx.lineTo(x + w * 0.15, y - h * 0.7);
  mapCtx.lineTo(x - w * 0.15, y - h * 0.7);
  mapCtx.closePath();
  mapCtx.fill();
}

// ========== WATER/LAKE ==========
function drawIsoWater(x, y, tw, th) {
  // Water ripples effect
  mapCtx.strokeStyle = 'rgba(255,255,255,0.3)';
  mapCtx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const offset = (Date.now() / 1000 + i * 0.3) % 1;
    mapCtx.beginPath();
    mapCtx.ellipse(x, y, tw * 0.2 * (1 + offset * 0.3), th * 0.1 * (1 + offset * 0.3), 0, 0, Math.PI * 2);
    mapCtx.stroke();
  }
}

// ========== DESERT BIOME FEATURES ==========
// Desert sand dunes
function drawDesertDunes(x, y, tw, th) {
  const duneH = th * 0.4;

  // Back dune
  mapCtx.fillStyle = '#c9b896';
  mapCtx.beginPath();
  mapCtx.moveTo(x - tw * 0.3, y);
  mapCtx.quadraticCurveTo(x - tw * 0.15, y - duneH * 0.6, x, y - duneH * 0.3);
  mapCtx.quadraticCurveTo(x + tw * 0.15, y, x + tw * 0.3, y);
  mapCtx.closePath();
  mapCtx.fill();

  // Front dune (lighter)
  mapCtx.fillStyle = '#ddd0aa';
  mapCtx.beginPath();
  mapCtx.moveTo(x - tw * 0.2, y + th * 0.1);
  mapCtx.quadraticCurveTo(x, y - duneH * 0.4, x + tw * 0.25, y);
  mapCtx.lineTo(x - tw * 0.2, y + th * 0.1);
  mapCtx.closePath();
  mapCtx.fill();
}

// Desert ancient ruins
function drawDesertRuins(x, y, w, h) {
  const pillarH = h * 0.8;
  const pillarW = w * 0.15;

  // Broken pillars
  mapCtx.fillStyle = '#a89880';

  // Left pillar (broken)
  mapCtx.fillRect(x - w * 0.3, y, pillarW, -pillarH * 0.6);
  mapCtx.beginPath();
  mapCtx.moveTo(x - w * 0.3, y - pillarH * 0.6);
  mapCtx.lineTo(x - w * 0.3 + pillarW * 0.3, y - pillarH * 0.7);
  mapCtx.lineTo(x - w * 0.3 + pillarW, y - pillarH * 0.55);
  mapCtx.lineTo(x - w * 0.3 + pillarW, y - pillarH * 0.6);
  mapCtx.closePath();
  mapCtx.fill();

  // Middle pillar (tallest)
  mapCtx.fillStyle = '#b8a890';
  mapCtx.fillRect(x - pillarW / 2, y, pillarW, -pillarH);

  // Capital on top
  mapCtx.fillStyle = '#c8b8a0';
  mapCtx.fillRect(x - pillarW * 0.7, y - pillarH, pillarW * 1.4, pillarH * 0.15);

  // Right pillar (fallen pieces)
  mapCtx.fillStyle = '#a89880';
  mapCtx.fillRect(x + w * 0.15, y, pillarW, -pillarH * 0.3);

  // Fallen stone blocks
  mapCtx.fillStyle = '#9a8870';
  mapCtx.fillRect(x + w * 0.2, y + h * 0.1, w * 0.2, h * 0.1);
  mapCtx.fillRect(x - w * 0.1, y + h * 0.15, w * 0.15, h * 0.08);
}

// Desert oasis with palm trees
function drawDesertOasis(x, y, tw, th) {
  // Water pool
  mapCtx.fillStyle = '#4a8a9a';
  mapCtx.beginPath();
  mapCtx.ellipse(x, y, tw * 0.3, th * 0.15, 0, 0, Math.PI * 2);
  mapCtx.fill();

  // Water shine
  mapCtx.fillStyle = 'rgba(255,255,255,0.3)';
  mapCtx.beginPath();
  mapCtx.ellipse(x - tw * 0.1, y - th * 0.02, tw * 0.08, th * 0.03, -0.3, 0, Math.PI * 2);
  mapCtx.fill();

  // Palm trees around oasis
  drawPalmTree(x - tw * 0.25, y - th * 0.15, tw * 0.15, th * 0.5);
  drawPalmTree(x + tw * 0.2, y - th * 0.1, tw * 0.12, th * 0.4);
}

// Palm tree for oasis
function drawPalmTree(x, y, w, h) {
  const trunkH = h * 0.6;

  // Curved trunk
  mapCtx.strokeStyle = '#6a5040';
  mapCtx.lineWidth = w * 0.25;
  mapCtx.lineCap = 'round';
  mapCtx.beginPath();
  mapCtx.moveTo(x, y);
  mapCtx.quadraticCurveTo(x + w * 0.2, y - trunkH * 0.5, x + w * 0.1, y - trunkH);
  mapCtx.stroke();

  // Palm fronds
  const frondColors = ['#3a7a30', '#4a8a40', '#2a6a20'];
  const frondX = x + w * 0.1;
  const frondY = y - trunkH;

  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * Math.PI * 2;
    const frondLen = h * 0.5;
    mapCtx.strokeStyle = frondColors[i % 3];
    mapCtx.lineWidth = w * 0.15;
    mapCtx.beginPath();
    mapCtx.moveTo(frondX, frondY);
    mapCtx.quadraticCurveTo(
      frondX + Math.cos(angle) * frondLen * 0.5,
      frondY + Math.sin(angle) * frondLen * 0.3 - frondLen * 0.2,
      frondX + Math.cos(angle) * frondLen,
      frondY + Math.sin(angle) * frondLen * 0.4
    );
    mapCtx.stroke();
  }
}

// Desert rocks
function drawDesertRocks(x, y, w, h) {
  // Large rock
  mapCtx.fillStyle = '#8a7a6a';
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - h);
  mapCtx.lineTo(x + w * 0.4, y - h * 0.3);
  mapCtx.lineTo(x + w * 0.3, y);
  mapCtx.lineTo(x - w * 0.3, y);
  mapCtx.lineTo(x - w * 0.4, y - h * 0.4);
  mapCtx.closePath();
  mapCtx.fill();

  // Light side
  mapCtx.fillStyle = '#a89a8a';
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - h);
  mapCtx.lineTo(x - w * 0.4, y - h * 0.4);
  mapCtx.lineTo(x - w * 0.1, y - h * 0.6);
  mapCtx.closePath();
  mapCtx.fill();

  // Small rocks nearby
  mapCtx.fillStyle = '#7a6a5a';
  mapCtx.beginPath();
  mapCtx.arc(x + w * 0.35, y - h * 0.1, w * 0.15, 0, Math.PI * 2);
  mapCtx.fill();
}

// ========== SNOW BIOME FEATURES ==========
// Snow-covered pine tree
function drawSnowTree(x, y, w, h) {
  const treeH = h * (0.8 + seededRandom(x, y) * 0.4);

  // Trunk
  mapCtx.fillStyle = '#4a3a30';
  mapCtx.fillRect(x - w * 0.05, y, w * 0.1, treeH * 0.3);

  // Foliage layers with snow
  for (let i = 0; i < 3; i++) {
    const layerY = y - treeH * 0.2 * i;
    const layerW = w * (0.8 - i * 0.15);

    // Dark green base
    mapCtx.fillStyle = '#1a3a12';
    mapCtx.beginPath();
    mapCtx.moveTo(x, layerY - treeH * 0.35);
    mapCtx.lineTo(x + layerW / 2, layerY);
    mapCtx.lineTo(x - layerW / 2, layerY);
    mapCtx.closePath();
    mapCtx.fill();

    // Snow on top
    mapCtx.fillStyle = '#e8f0f8';
    mapCtx.beginPath();
    mapCtx.moveTo(x, layerY - treeH * 0.35);
    mapCtx.lineTo(x + layerW * 0.35, layerY - treeH * 0.15);
    mapCtx.lineTo(x - layerW * 0.35, layerY - treeH * 0.15);
    mapCtx.closePath();
    mapCtx.fill();
  }
}

// Ice mountain
function drawIceMountain(x, y, w, h) {
  // Base (dark ice)
  mapCtx.fillStyle = '#8a9aaa';
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - h);
  mapCtx.lineTo(x + w / 2, y);
  mapCtx.lineTo(x - w / 2, y);
  mapCtx.closePath();
  mapCtx.fill();

  // Light side (ice blue)
  mapCtx.fillStyle = '#a8c8d8';
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - h);
  mapCtx.lineTo(x - w / 2, y);
  mapCtx.lineTo(x - w * 0.1, y - h * 0.3);
  mapCtx.closePath();
  mapCtx.fill();

  // Snow/ice cap (white-blue)
  mapCtx.fillStyle = '#e8f4ff';
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - h);
  mapCtx.lineTo(x + w * 0.2, y - h * 0.6);
  mapCtx.lineTo(x - w * 0.2, y - h * 0.6);
  mapCtx.closePath();
  mapCtx.fill();

  // Ice crystals shine
  mapCtx.fillStyle = 'rgba(255,255,255,0.6)';
  mapCtx.beginPath();
  mapCtx.moveTo(x - w * 0.1, y - h * 0.8);
  mapCtx.lineTo(x - w * 0.05, y - h * 0.7);
  mapCtx.lineTo(x - w * 0.15, y - h * 0.7);
  mapCtx.closePath();
  mapCtx.fill();
}

// Frozen lake
function drawFrozenLake(x, y, tw, th) {
  // Ice cracks
  mapCtx.strokeStyle = 'rgba(100,140,160,0.5)';
  mapCtx.lineWidth = 1;

  // Random crack pattern
  const cracks = [
    [[0, 0], [0.2, -0.1], [0.3, 0.05]],
    [[0, 0], [-0.15, 0.1], [-0.25, -0.05]],
    [[0.1, 0.05], [0.2, 0.15], [0.1, 0.2]]
  ];

  cracks.forEach(crack => {
    mapCtx.beginPath();
    crack.forEach((point, i) => {
      const px = x + point[0] * tw;
      const py = y + point[1] * th;
      if (i === 0) mapCtx.moveTo(px, py);
      else mapCtx.lineTo(px, py);
    });
    mapCtx.stroke();
  });

  // Shine spots
  mapCtx.fillStyle = 'rgba(255,255,255,0.4)';
  mapCtx.beginPath();
  mapCtx.ellipse(x - tw * 0.1, y - th * 0.05, tw * 0.1, th * 0.04, 0, 0, Math.PI * 2);
  mapCtx.fill();
}

// Draw isometric highlight (diamond outline)
function drawIsoHighlight(x, y, tw, th, color, lineWidth) {
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - th / 2);
  mapCtx.lineTo(x + tw / 2, y);
  mapCtx.lineTo(x, y + th / 2);
  mapCtx.lineTo(x - tw / 2, y);
  mapCtx.closePath();
  mapCtx.strokeStyle = color;
  mapCtx.lineWidth = lineWidth;
  mapCtx.stroke();
}

// Draw isometric city (Rise of Kingdoms style)
function drawIsoCity(x, y, tw, th, tile) {
  const isMyCity = tile.playerId === player?.id;
  const isAlly = tile.allianceId && tile.allianceId === player?.allianceId;
  const colors = isMyCity ? TILE_COLORS.myCity : isAlly ? TILE_COLORS.allyCity : TILE_COLORS.enemyCity;

  const citySize = Math.min(tw, th * 2) * 0.8;

  // Shadow
  mapCtx.fillStyle = 'rgba(0,0,0,0.3)';
  mapCtx.beginPath();
  mapCtx.ellipse(x + 3, y + 5, citySize * 0.5, citySize * 0.25, 0, 0, Math.PI * 2);
  mapCtx.fill();

  // City base (circular wall)
  mapCtx.fillStyle = '#5a4a3a';
  mapCtx.beginPath();
  mapCtx.ellipse(x, y, citySize * 0.45, citySize * 0.25, 0, 0, Math.PI * 2);
  mapCtx.fill();

  // Inner ground
  mapCtx.fillStyle = isMyCity ? '#c4a060' : isAlly ? '#70a080' : '#a07060';
  mapCtx.beginPath();
  mapCtx.ellipse(x, y - 2, citySize * 0.38, citySize * 0.2, 0, 0, Math.PI * 2);
  mapCtx.fill();

  // Main building
  const bh = citySize * 0.6;
  const bw = citySize * 0.3;

  // Building shadow side
  mapCtx.fillStyle = shadeColor(colors.fill, -30);
  mapCtx.beginPath();
  mapCtx.moveTo(x + bw / 2, y - 5);
  mapCtx.lineTo(x + bw / 2, y - 5 - bh);
  mapCtx.lineTo(x, y - 5 - bh - bw * 0.3);
  mapCtx.lineTo(x, y - 5 - bw * 0.15);
  mapCtx.closePath();
  mapCtx.fill();

  // Building light side
  mapCtx.fillStyle = colors.fill;
  mapCtx.beginPath();
  mapCtx.moveTo(x - bw / 2, y - 5);
  mapCtx.lineTo(x - bw / 2, y - 5 - bh);
  mapCtx.lineTo(x, y - 5 - bh - bw * 0.3);
  mapCtx.lineTo(x, y - 5 - bw * 0.15);
  mapCtx.closePath();
  mapCtx.fill();

  // Roof
  mapCtx.fillStyle = colors.stroke;
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - 5 - bh - bw * 0.5);
  mapCtx.lineTo(x + bw / 2 + 3, y - 5 - bh + 3);
  mapCtx.lineTo(x, y - 5 - bh + bw * 0.15);
  mapCtx.lineTo(x - bw / 2 - 3, y - 5 - bh + 3);
  mapCtx.closePath();
  mapCtx.fill();

  // Side towers
  if (mapZoomLevel > 0.7) {
    drawMiniTower(x - citySize * 0.3, y + 3, citySize * 0.15);
    drawMiniTower(x + citySize * 0.3, y + 3, citySize * 0.15);
  }

  // Banner/flag on top
  const flagY = y - 5 - bh - bw * 0.5 - 8;
  mapCtx.fillStyle = colors.banner;
  mapCtx.fillRect(x - 1, flagY - 12, 2, 15);
  mapCtx.beginPath();
  mapCtx.moveTo(x + 1, flagY - 12);
  mapCtx.lineTo(x + 10, flagY - 8);
  mapCtx.lineTo(x + 1, flagY - 4);
  mapCtx.closePath();
  mapCtx.fill();

  // City name label
  if (mapZoomLevel > 0.6 && tile.name) {
    mapCtx.font = `bold ${10 * mapZoomLevel}px Arial, sans-serif`;
    mapCtx.textAlign = 'center';
    mapCtx.textBaseline = 'top';
    mapCtx.fillStyle = '#fff';
    mapCtx.shadowColor = '#000';
    mapCtx.shadowBlur = 3;
    mapCtx.fillText(tile.name, x, y + citySize * 0.3);
    mapCtx.shadowBlur = 0;
  }

  // Power level badge
  if (mapZoomLevel > 0.8 && tile.population) {
    const badgeX = x + citySize * 0.35;
    const badgeY = y - citySize * 0.4;
    mapCtx.fillStyle = 'rgba(0,0,0,0.7)';
    mapCtx.beginPath();
    mapCtx.arc(badgeX, badgeY, 12, 0, Math.PI * 2);
    mapCtx.fill();
    mapCtx.fillStyle = '#fff';
    mapCtx.font = 'bold 9px Arial';
    mapCtx.textAlign = 'center';
    mapCtx.textBaseline = 'middle';
    mapCtx.fillText(formatNum(tile.population || 0), badgeX, badgeY);
  }
}

// Mini tower for city decoration
function drawMiniTower(x, y, size) {
  mapCtx.fillStyle = '#6a5a4a';
  mapCtx.fillRect(x - size / 2, y - size * 1.5, size, size * 1.5);
  mapCtx.fillStyle = '#5a4a3a';
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - size * 2.2);
  mapCtx.lineTo(x + size / 2 + 2, y - size * 1.5);
  mapCtx.lineTo(x - size / 2 - 2, y - size * 1.5);
  mapCtx.closePath();
  mapCtx.fill();
}

// Draw isometric resource node
function drawIsoResource(x, y, tw, th, tile) {
  const resType = tile.resourceType?.toLowerCase() || 'wood';
  const size = Math.min(tw, th * 2) * 0.5;

  if (resType === 'wood') {
    // Forest clearing with lumber
    mapCtx.fillStyle = '#3a5a2a';
    mapCtx.beginPath();
    mapCtx.ellipse(x, y, size * 0.6, size * 0.3, 0, 0, Math.PI * 2);
    mapCtx.fill();

    // Multiple trees
    drawIsoTree(x - size * 0.3, y - size * 0.1, size * 0.3, size * 0.5);
    drawIsoTree(x + size * 0.2, y - size * 0.05, size * 0.25, size * 0.4);
    drawIsoTree(x, y - size * 0.2, size * 0.35, size * 0.6);

  } else if (resType === 'stone') {
    // Quarry
    mapCtx.fillStyle = '#6a6a6a';
    mapCtx.beginPath();
    mapCtx.ellipse(x, y, size * 0.5, size * 0.25, 0, 0, Math.PI * 2);
    mapCtx.fill();

    // Rock formations
    drawIsoRock(x - size * 0.2, y - size * 0.1, size * 0.25);
    drawIsoRock(x + size * 0.15, y - size * 0.05, size * 0.2);
    drawIsoRock(x, y - size * 0.2, size * 0.3);

  } else if (resType === 'iron') {
    // Mine entrance
    mapCtx.fillStyle = '#5a5a6a';
    mapCtx.beginPath();
    mapCtx.ellipse(x, y, size * 0.5, size * 0.25, 0, 0, Math.PI * 2);
    mapCtx.fill();

    // Mine structure
    mapCtx.fillStyle = '#4a4a5a';
    mapCtx.fillRect(x - size * 0.25, y - size * 0.4, size * 0.5, size * 0.35);
    mapCtx.fillStyle = '#2a2a3a';
    mapCtx.beginPath();
    mapCtx.arc(x, y - size * 0.2, size * 0.15, Math.PI, 0);
    mapCtx.fill();

  } else if (resType === 'food') {
    // Farm/oasis
    mapCtx.fillStyle = '#7a9a40';
    mapCtx.beginPath();
    mapCtx.ellipse(x, y, size * 0.6, size * 0.3, 0, 0, Math.PI * 2);
    mapCtx.fill();

    // Crop rows
    mapCtx.strokeStyle = '#6a8a30';
    mapCtx.lineWidth = 2;
    for (let i = -2; i <= 2; i++) {
      mapCtx.beginPath();
      mapCtx.moveTo(x - size * 0.4, y + i * size * 0.08);
      mapCtx.lineTo(x + size * 0.4, y + i * size * 0.08);
      mapCtx.stroke();
    }

    // Small barn
    mapCtx.fillStyle = '#8a6a4a';
    mapCtx.fillRect(x - size * 0.15, y - size * 0.35, size * 0.3, size * 0.25);
    mapCtx.fillStyle = '#6a4a2a';
    mapCtx.beginPath();
    mapCtx.moveTo(x, y - size * 0.5);
    mapCtx.lineTo(x + size * 0.2, y - size * 0.35);
    mapCtx.lineTo(x - size * 0.2, y - size * 0.35);
    mapCtx.closePath();
    mapCtx.fill();

  } else if (resType === 'gold') {
    // Gold mine with treasure
    mapCtx.fillStyle = '#6a5a3a';
    mapCtx.beginPath();
    mapCtx.ellipse(x, y, size * 0.5, size * 0.25, 0, 0, Math.PI * 2);
    mapCtx.fill();

    // Mine entrance (cave)
    mapCtx.fillStyle = '#3a3020';
    mapCtx.beginPath();
    mapCtx.arc(x, y - size * 0.1, size * 0.2, Math.PI, 0);
    mapCtx.fill();

    // Gold veins/sparkles around
    mapCtx.fillStyle = '#ffd700';
    const sparkles = [
      [-0.25, -0.15], [0.2, -0.1], [-0.1, 0.1], [0.15, 0.05], [0, -0.25]
    ];
    sparkles.forEach(([ox, oy]) => {
      mapCtx.beginPath();
      mapCtx.arc(x + size * ox, y + size * oy, size * 0.05, 0, Math.PI * 2);
      mapCtx.fill();
    });

    // Gold pile at entrance
    mapCtx.fillStyle = '#ffd700';
    mapCtx.beginPath();
    mapCtx.moveTo(x - size * 0.15, y + size * 0.1);
    mapCtx.lineTo(x, y - size * 0.05);
    mapCtx.lineTo(x + size * 0.15, y + size * 0.1);
    mapCtx.closePath();
    mapCtx.fill();

    // Gold coins
    mapCtx.fillStyle = '#b8860b';
    mapCtx.beginPath();
    mapCtx.ellipse(x - size * 0.05, y + size * 0.05, size * 0.08, size * 0.04, 0, 0, Math.PI * 2);
    mapCtx.fill();
    mapCtx.fillStyle = '#ffd700';
    mapCtx.beginPath();
    mapCtx.ellipse(x + size * 0.05, y + size * 0.02, size * 0.07, size * 0.035, 0, 0, Math.PI * 2);
    mapCtx.fill();

    // Shine effect
    mapCtx.fillStyle = 'rgba(255,255,200,0.6)';
    mapCtx.beginPath();
    mapCtx.arc(x, y - size * 0.02, size * 0.03, 0, Math.PI * 2);
    mapCtx.fill();
  }

  // Resource amount badge
  if (mapZoomLevel > 0.7 && tile.amount) {
    mapCtx.fillStyle = 'rgba(0,0,0,0.6)';
    mapCtx.beginPath();
    mapCtx.roundRect(x - 15, y + size * 0.35, 30, 14, 3);
    mapCtx.fill();
    mapCtx.fillStyle = '#fff';
    mapCtx.font = 'bold 9px Arial';
    mapCtx.textAlign = 'center';
    mapCtx.textBaseline = 'middle';
    mapCtx.fillText(formatNum(tile.amount), x, y + size * 0.35 + 7);
  }
}

// Draw small rock for quarry
function drawIsoRock(x, y, size) {
  mapCtx.fillStyle = '#7a7a7a';
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - size);
  mapCtx.lineTo(x + size * 0.5, y - size * 0.3);
  mapCtx.lineTo(x + size * 0.3, y);
  mapCtx.lineTo(x - size * 0.3, y);
  mapCtx.lineTo(x - size * 0.5, y - size * 0.3);
  mapCtx.closePath();
  mapCtx.fill();

  mapCtx.fillStyle = '#9a9a9a';
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - size);
  mapCtx.lineTo(x - size * 0.5, y - size * 0.3);
  mapCtx.lineTo(x - size * 0.2, y - size * 0.5);
  mapCtx.closePath();
  mapCtx.fill();
}

// Draw isometric army marker
function drawIsoArmy(x, y, tw, th, army) {
  const size = Math.min(tw, th * 2) * 0.4;
  const isMoving = army.status !== 'IDLE';

  // Army marker background
  mapCtx.fillStyle = isMoving ? '#ffaa00' : '#4488ff';
  mapCtx.beginPath();
  mapCtx.arc(x, y - size * 0.5, size * 0.4, 0, Math.PI * 2);
  mapCtx.fill();

  // Border
  mapCtx.strokeStyle = '#fff';
  mapCtx.lineWidth = 2;
  mapCtx.stroke();

  // Army icon
  mapCtx.fillStyle = '#fff';
  mapCtx.font = `${size * 0.5}px Arial`;
  mapCtx.textAlign = 'center';
  mapCtx.textBaseline = 'middle';
  mapCtx.fillText('⚔', x, y - size * 0.5);

  // Army name
  if (mapZoomLevel > 0.8 && army.name) {
    mapCtx.font = 'bold 9px Arial';
    mapCtx.fillStyle = '#fff';
    mapCtx.shadowColor = '#000';
    mapCtx.shadowBlur = 2;
    mapCtx.fillText(army.name, x, y + size * 0.2);
    mapCtx.shadowBlur = 0;
  }

  // Movement line if moving
  if (isMoving && army.targetX !== undefined && army.targetY !== undefined) {
    const targetPos = window.mapScreenToWorld ? null : { x: army.targetX, y: army.targetY };
    // Draw dashed line to target (simplified)
    mapCtx.strokeStyle = 'rgba(255,170,0,0.5)';
    mapCtx.lineWidth = 2;
    mapCtx.setLineDash([5, 5]);
    mapCtx.beginPath();
    mapCtx.moveTo(x, y);
    // We'd need worldToScreen here, simplified for now
    mapCtx.setLineDash([]);
  }
}

// Keep old drawCity for compatibility (renamed)
function drawCity(x, y, size, tile) {
  const isMyCity = tile.playerId === player?.id;
  const isAlly = tile.allianceId && tile.allianceId === player?.allianceId;
  
  const colors = isMyCity ? TILE_COLORS.myCity : isAlly ? TILE_COLORS.allyCity : TILE_COLORS.enemyCity;
  
  // Shadow
  mapCtx.fillStyle = 'rgba(0,0,0,0.3)';
  mapCtx.beginPath();
  mapCtx.ellipse(x + 2, y + 4, size * 0.4, size * 0.2, 0, 0, Math.PI * 2);
  mapCtx.fill();
  
  // Glow effect for hover
  if (mapHoveredTile && mapHoveredTile.x === tile.x && mapHoveredTile.y === tile.y) {
    mapCtx.shadowColor = colors.glow;
    mapCtx.shadowBlur = 20;
  }
  
  // City wall (ellipse base)
  mapCtx.fillStyle = '#6a6a6a';
  mapCtx.beginPath();
  mapCtx.ellipse(x, y, size * 0.45, size * 0.25, 0, 0, Math.PI * 2);
  mapCtx.fill();
  mapCtx.shadowBlur = 0;
  
  // City ground inside wall
  mapCtx.fillStyle = isMyCity ? '#c4a060' : isAlly ? '#80a080' : '#a08080';
  mapCtx.beginPath();
  mapCtx.ellipse(x, y, size * 0.38, size * 0.2, 0, 0, Math.PI * 2);
  mapCtx.fill();
  
  // Draw mini 2.5D buildings if zoomed enough
  if (mapZoomLevel > 0.6) {
    // Main building (center)
    drawMapBuilding(x, y - size * 0.08, size * 0.25, colors.fill, colors.stroke);
    
    // Side buildings
    if (mapZoomLevel > 0.9) {
      drawMapBuilding(x - size * 0.18, y + size * 0.02, size * 0.15, '#8b7355', '#5a4030');
      drawMapBuilding(x + size * 0.18, y + size * 0.02, size * 0.15, '#8b7355', '#5a4030');
    }
    
    // Towers on wall
    if (mapZoomLevel > 0.8) {
      drawMapTower(x - size * 0.35, y, size * 0.08);
      drawMapTower(x + size * 0.35, y, size * 0.08);
      drawMapTower(x, y - size * 0.2, size * 0.08);
      drawMapTower(x, y + size * 0.2, size * 0.08);
    }
  } else {
    // Simple icon for far zoom
    mapCtx.font = `${size * 0.4}px Arial`;
    mapCtx.textAlign = 'center';
    mapCtx.textBaseline = 'middle';
    mapCtx.fillText('🏰', x, y);
  }
  
  // Capital crown
  if (tile.isCapital && isMyCity) {
    mapCtx.font = `${size * 0.35}px Arial`;
    mapCtx.textAlign = 'center';
    mapCtx.fillText('👑', x, y - size * 0.35);
  }
  
  // Name label (if zoomed in enough)
  if (mapZoomLevel > 0.7 && tile.name) {
    mapCtx.font = `bold ${10 * mapZoomLevel}px Cinzel, serif`;
    mapCtx.fillStyle = '#fff';
    mapCtx.shadowColor = '#000';
    mapCtx.shadowBlur = 3;
    mapCtx.fillText(tile.name, x, y + size * 0.5);
    mapCtx.shadowBlur = 0;
  }
}

function drawMapBuilding(x, y, size, fillColor, strokeColor) {
  const height = size * 1.2;
  
  // Building base
  mapCtx.fillStyle = fillColor;
  mapCtx.beginPath();
  mapCtx.ellipse(x, y, size * 0.5, size * 0.25, 0, 0, Math.PI * 2);
  mapCtx.fill();
  
  // Left wall
  mapCtx.fillStyle = shadeColor(fillColor, -15);
  mapCtx.beginPath();
  mapCtx.moveTo(x - size * 0.5, y);
  mapCtx.lineTo(x - size * 0.5, y - height);
  mapCtx.lineTo(x, y - height - size * 0.15);
  mapCtx.lineTo(x, y - size * 0.25);
  mapCtx.closePath();
  mapCtx.fill();
  
  // Right wall
  mapCtx.fillStyle = shadeColor(fillColor, -30);
  mapCtx.beginPath();
  mapCtx.moveTo(x + size * 0.5, y);
  mapCtx.lineTo(x + size * 0.5, y - height);
  mapCtx.lineTo(x, y - height - size * 0.15);
  mapCtx.lineTo(x, y - size * 0.25);
  mapCtx.closePath();
  mapCtx.fill();
  
  // Roof
  mapCtx.fillStyle = strokeColor;
  mapCtx.beginPath();
  mapCtx.ellipse(x, y - height, size * 0.5, size * 0.25, 0, 0, Math.PI * 2);
  mapCtx.fill();
  
  // Roof point
  mapCtx.fillStyle = shadeColor(strokeColor, -20);
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - height - size * 0.5);
  mapCtx.lineTo(x - size * 0.35, y - height + size * 0.1);
  mapCtx.lineTo(x + size * 0.35, y - height + size * 0.1);
  mapCtx.closePath();
  mapCtx.fill();
}

function drawMapTower(x, y, size) {
  // Tower base
  mapCtx.fillStyle = '#5a5a5a';
  mapCtx.beginPath();
  mapCtx.arc(x, y, size, 0, Math.PI * 2);
  mapCtx.fill();
  
  // Tower body
  mapCtx.fillRect(x - size * 0.7, y - size * 2, size * 1.4, size * 2);
  
  // Tower top
  mapCtx.fillStyle = '#7a7a7a';
  mapCtx.beginPath();
  mapCtx.arc(x, y - size * 2, size * 0.8, 0, Math.PI * 2);
  mapCtx.fill();
  
  // Flag
  mapCtx.fillStyle = '#c44';
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - size * 3);
  mapCtx.lineTo(x + size, y - size * 2.7);
  mapCtx.lineTo(x, y - size * 2.4);
  mapCtx.fill();
}

function drawResource(x, y, size, tile) {
  const resType = tile.resourceType?.toLowerCase() || 'wood';
  const colors = TILE_COLORS[resType] || TILE_COLORS.wood;
  
  // Resource circle
  mapCtx.fillStyle = colors.fill;
  mapCtx.beginPath();
  mapCtx.arc(x, y, size * 0.25, 0, Math.PI * 2);
  mapCtx.fill();
  
  mapCtx.strokeStyle = colors.stroke;
  mapCtx.lineWidth = 1;
  mapCtx.stroke();
  
  // Resource icon
  if (mapZoomLevel > 0.6) {
    mapCtx.font = `${size * 0.35}px Arial`;
    mapCtx.textAlign = 'center';
    mapCtx.textBaseline = 'middle';
    mapCtx.fillText(colors.icon, x, y);
  }
}

function drawArmy(x, y, size, army) {
  const isMoving = army.status !== 'IDLE';
  
  // Army marker
  mapCtx.fillStyle = isMoving ? '#ff8800' : '#4488ff';
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - size * 0.3);
  mapCtx.lineTo(x - size * 0.2, y + size * 0.15);
  mapCtx.lineTo(x + size * 0.2, y + size * 0.15);
  mapCtx.closePath();
  mapCtx.fill();
  
  mapCtx.strokeStyle = '#fff';
  mapCtx.lineWidth = 1;
  mapCtx.stroke();
  
  // Draw movement line
  if (isMoving && army.targetX !== undefined) {
    const targetScreenX = (army.targetX - mapOffsetX) * size + mapCanvas.width / 2;
    const targetScreenY = (army.targetY - mapOffsetY) * size + mapCanvas.height / 2;
    
    mapCtx.strokeStyle = 'rgba(255,136,0,0.5)';
    mapCtx.lineWidth = 2;
    mapCtx.setLineDash([5, 5]);
    mapCtx.beginPath();
    mapCtx.moveTo(x, y);
    mapCtx.lineTo(targetScreenX, targetScreenY);
    mapCtx.stroke();
    mapCtx.setLineDash([]);
  }
}

function renderMinimap() {
  if (!minimapCtx) return;
  
  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  const scale = w / WORLD_SIZE;
  
  // Clear
  minimapCtx.fillStyle = '#1a2a1a';
  minimapCtx.fillRect(0, 0, w, h);
  
  // Draw objects
  mapData.forEach(tile => {
    const x = tile.x * scale;
    const y = tile.y * scale;
    
    if (tile.type === 'CITY') {
      minimapCtx.fillStyle = tile.playerId === player?.id ? '#ffd700' : '#c44';
      minimapCtx.fillRect(x - 2, y - 2, 4, 4);
    } else if (tile.type === 'RESOURCE') {
      minimapCtx.fillStyle = '#4a8';
      minimapCtx.fillRect(x - 1, y - 1, 2, 2);
    }
  });
  
  // Draw viewport rectangle
  const viewportEl = document.getElementById('minimap-viewport');
  if (viewportEl) {
    const viewSize = (mapCanvas.width / (TILE_SIZE * mapZoomLevel)) / WORLD_SIZE * 100;
    const left = ((mapOffsetX / WORLD_SIZE) * 100);
    const top = ((mapOffsetY / WORLD_SIZE) * 100);
    
    viewportEl.style.width = `${viewSize}%`;
    viewportEl.style.height = `${viewSize}%`;
    viewportEl.style.left = `${50 + left - viewSize/2}%`;
    viewportEl.style.top = `${50 + top - viewSize/2}%`;
  }
}

function updateMapUI() {
  document.getElementById('map-x').textContent = Math.round(mapOffsetX);
  document.getElementById('map-y').textContent = Math.round(mapOffsetY);
  
  const zoomEl = document.getElementById('zoom-level');
  zoomEl.textContent = `${Math.round(mapZoomLevel * 100)}%`;
  
  // Animation pulse
  zoomEl.classList.add('zooming');
  setTimeout(() => zoomEl.classList.remove('zooming'), 200);
}

// Mouse handlers
function onMapMouseDown(e) {
  mapDragging = true;
  mapDragStart = { x: e.clientX, y: e.clientY };
  mapCanvas.style.cursor = 'grabbing';
}

function onMapMouseMove(e) {
  const rect = mapCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  if (mapDragging) {
    const dx = (e.clientX - mapDragStart.x) / (TILE_SIZE * mapZoomLevel);
    const dy = (e.clientY - mapDragStart.y) / (TILE_SIZE * mapZoomLevel);
    
    mapOffsetX -= dx;
    mapOffsetY -= dy;
    
    mapDragStart = { x: e.clientX, y: e.clientY };
    renderMap();
    renderMinimap();
    updateMapUI();
  } else {
    // Update hovered tile
    const tileSize = TILE_SIZE * mapZoomLevel;
    const tileX = Math.floor(mapOffsetX + (mouseX - mapCanvas.width / 2) / tileSize);
    const tileY = Math.floor(mapOffsetY + (mouseY - mapCanvas.height / 2) / tileSize);
    
    mapHoveredTile = { x: tileX, y: tileY };
    renderMap();
  }
}

function onMapMouseUp() {
  mapDragging = false;
  mapCanvas.style.cursor = 'grab';
}

function onMapClick(e) {
  if (mapDragging) return;
  
  const rect = mapCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  const tileSize = TILE_SIZE * mapZoomLevel;
  const tileX = Math.floor(mapOffsetX + (mouseX - mapCanvas.width / 2) / tileSize);
  const tileY = Math.floor(mapOffsetY + (mouseY - mapCanvas.height / 2) / tileSize);
  
  // Find what's at this tile
  const tile = mapData.find(t => t.x === tileX && t.y === tileY);
  
  mapSelectedTile = { x: tileX, y: tileY };
  showMapInfoPanel(tileX, tileY, tile);
  renderMap();
}

// Touch handlers for mobile
let touchStartDist = 0;
let touchStartZoom = 1;

function onMapTouchStart(e) {
  e.preventDefault();
  
  if (e.touches.length === 2) {
    // Pinch zoom start
    touchStartDist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    touchStartZoom = mapZoomLevel;
  } else if (e.touches.length === 1) {
    mapDragging = true;
    mapDragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
}

function onMapTouchMove(e) {
  e.preventDefault();
  
  if (e.touches.length === 2) {
    // Pinch zoom
    const dist = Math.hypot(
      e.touches[0].clientX - e.touches[1].clientX,
      e.touches[0].clientY - e.touches[1].clientY
    );
    
    mapZoomLevel = Math.max(0.3, Math.min(3, touchStartZoom * (dist / touchStartDist)));
    renderMap();
    renderMinimap();
    updateMapUI();
  } else if (e.touches.length === 1 && mapDragging) {
    const dx = (e.touches[0].clientX - mapDragStart.x) / (TILE_SIZE * mapZoomLevel);
    const dy = (e.touches[0].clientY - mapDragStart.y) / (TILE_SIZE * mapZoomLevel);
    
    mapOffsetX -= dx;
    mapOffsetY -= dy;
    
    mapDragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    renderMap();
    renderMinimap();
    updateMapUI();
  }
}

function onMapTouchEnd() {
  mapDragging = false;
}

// Wheel zoom
function onMapWheel(e) {
  e.preventDefault();
  
  const canvas = mapCanvas;
  const rect = canvas.getBoundingClientRect();
  
  // Position du curseur sur le canvas
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  // Position du monde sous le curseur avant zoom
  const tileSize = BASE_TILE_SIZE * mapZoomLevel;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  
  const worldXBefore = mapOffsetX + (mouseX - centerX) / tileSize;
  const worldYBefore = mapOffsetY + (mouseY - centerY) / tileSize;
  
  // Appliquer le zoom (plus fluide)
  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  const oldZoom = mapZoomLevel;
  mapZoomLevel = Math.max(0.3, Math.min(3, mapZoomLevel * zoomFactor));
  
  // Recalculer pour garder le point sous le curseur fixe
  const newTileSize = BASE_TILE_SIZE * mapZoomLevel;
  const worldXAfter = mapOffsetX + (mouseX - centerX) / newTileSize;
  const worldYAfter = mapOffsetY + (mouseY - centerY) / newTileSize;
  
  // Ajuster l'offset pour compenser
  mapOffsetX += (worldXBefore - worldXAfter);
  mapOffsetY += (worldYBefore - worldYAfter);
  
  // Limiter aux bornes du monde
  mapOffsetX = Math.max(0, Math.min(WORLD_SIZE, mapOffsetX));
  mapOffsetY = Math.max(0, Math.min(WORLD_SIZE, mapOffsetY));
  
  renderMap();
  renderMinimap();
  updateMapUI();
}

// Zoom buttons
function mapZoom(delta) {
  const zoomFactor = delta > 0 ? 1.2 : 0.8;
  mapZoomLevel = Math.max(0.3, Math.min(3, mapZoomLevel * zoomFactor));
  renderMap();
  renderMinimap();
  updateMapUI();
}

function centerOnCapital() {
  const capital = cities.find(c => c.isCapital);
  if (capital) {
    mapOffsetX = capital.x;
    mapOffsetY = capital.y;
  } else {
    mapOffsetX = WORLD_SIZE / 2;
    mapOffsetY = WORLD_SIZE / 2;
  }
  loadMap();
}

function showMapInfoPanel(x, y, tile) {
  const panel = document.getElementById('map-info-panel');
  const content = document.getElementById('map-panel-content');
  
  if (!tile) {
    content.innerHTML = `
      <h3>Terrain vide</h3>
      <p>Position: (${x}, ${y})</p>
      <p style="color:#888">Aucun objet à cet emplacement</p>
    `;
    panel.style.display = 'block';
  } else if (tile.type === 'CITY') {
    const isMyCity = tile.playerId === player?.id;
    const hasArmy = armies.some(a => a.status === 'IDLE' && a.units?.length > 0);
    
    if (isMyCity) {
      content.innerHTML = `
        <h3>${tile.isCapital ? '👑 ' : '🏰 '}${tile.name || 'Ville'}</h3>
        <p>Position: (${x}, ${y})</p>
        <p style="color:#4caf50">Votre ville</p>
        <div class="panel-actions">
          <button class="btn btn-primary" onclick="goToCity('${tile.id}')">🏠 Visiter</button>
        </div>
      `;
      panel.style.display = 'block';
    } else {
      // Other player's city - check diplomacy first
      showMapInfoPanelWithDiplomacy(x, y, tile, hasArmy, panel, content);
      return; // async
    }
  } else if (tile.type === 'RESOURCE') {
    content.innerHTML = `
      <h3>${tile.resourceType === 'WOOD' ? '🌲 Forêt' : tile.resourceType === 'STONE' ? '⛰️ Carrière' : tile.resourceType === 'IRON' ? '⚒️ Mine' : '🌾 Oasis'}</h3>
      <p>Position: (${x}, ${y})</p>
      <p>Type: ${tile.resourceType}</p>
      <div class="panel-actions">
        <button class="btn btn-secondary" onclick="sendArmyTo(${x}, ${y})">🚶 Envoyer armée</button>
      </div>
    `;
    panel.style.display = 'block';
  }
}

// Async version to check diplomacy
async function showMapInfoPanelWithDiplomacy(x, y, tile, hasArmy, panel, content) {
  // Check diplomatic status
  let diplomacyStatus = 'NEUTRAL';
  let canTransport = true;
  let canAttack = true;
  
  try {
    const res = await fetch(`${API}/api/diplomacy/player/${tile.playerId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const data = await res.json();
      diplomacyStatus = data.status;
      canTransport = data.canTransport;
      canAttack = data.canAttack;
    }
  } catch (e) {
    console.error('Error checking diplomacy:', e);
  }
  
  // Status display
  const statusColors = {
    'ALLY': '#4caf50',
    'NEUTRAL': '#9e9e9e', 
    'ENEMY': '#f44336',
    'SAME_ALLIANCE': '#2196f3'
  };
  const statusLabels = {
    'ALLY': '🤝 Allié',
    'NEUTRAL': '⚪ Neutre',
    'ENEMY': '⚔️ Ennemi',
    'SAME_ALLIANCE': '🛡️ Même alliance'
  };
  
  const statusColor = statusColors[diplomacyStatus] || '#9e9e9e';
  const statusLabel = statusLabels[diplomacyStatus] || 'Inconnu';
  
  content.innerHTML = `
    <h3>${tile.isCapital ? '👑 ' : '🏰 '}${tile.name || 'Ville'}</h3>
    <p>Position: (${x}, ${y})</p>
    <p>Propriétaire: <strong>${tile.playerName || 'Inconnu'}</strong></p>
    <p>Statut: <span style="color:${statusColor};font-weight:bold">${statusLabel}</span></p>
    <div class="panel-actions player-actions">
      <button class="btn btn-info" onclick="viewPlayerProfile('${tile.playerId}')">👤 Profil</button>
      <button class="btn btn-warning" onclick="spyFromMap('${tile.id}')" ${!hasArmy ? 'disabled' : ''}>🔍 Espionner</button>
      ${canAttack ? `
        <button class="btn btn-danger" onclick="attackFromMap('${tile.id}', ${x}, ${y})" ${!hasArmy ? 'disabled' : ''}>⚔️ Attaquer</button>
        <button class="btn btn-raid" onclick="raidFromMap('${tile.id}')" ${!hasArmy ? 'disabled' : ''}>💰 Piller</button>
      ` : `
        <button class="btn btn-danger" disabled title="Impossible d'attaquer un allié">⚔️ Attaquer</button>
        <button class="btn btn-raid" disabled title="Impossible de piller un allié">💰 Piller</button>
      `}
      ${canTransport ? `
        <button class="btn btn-success" onclick="sendResourcesFromMap('${tile.id}', '${tile.name}')" ${!hasArmy ? 'disabled' : ''}>📦 Envoyer ressources</button>
      ` : `
        <button class="btn btn-success" disabled title="Impossible d'envoyer des ressources à un ennemi">📦 Envoyer</button>
      `}
    </div>
    ${!hasArmy ? '<p style="font-size:11px;color:#888;margin-top:8px">⚠️ Aucune armée disponible</p>' : ''}
  `;
  panel.style.display = 'block';
}

// View player profile
async function viewPlayerProfile(playerId) {
  const res = await fetch(`${API}/api/player/${playerId}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  
  if (!res.ok) {
    showToast('Erreur chargement profil', 'error');
    return;
  }
  
  const p = await res.json();
  
  document.getElementById('modal-body').innerHTML = `
    <div class="player-profile">
      <h2>👤 ${p.name}</h2>
      <div class="profile-info">
        <div class="profile-stat"><span>Faction:</span> <strong>${p.faction}</strong></div>
        <div class="profile-stat"><span>Population:</span> <strong>${formatNum(p.population)}</strong></div>
        <div class="profile-stat"><span>Villes:</span> <strong>${p.citiesCount}</strong></div>
        ${p.alliance ? `<div class="profile-stat"><span>Alliance:</span> <strong>[${p.alliance.tag}] ${p.alliance.name}</strong></div>` : ''}
        ${p.hero ? `<div class="profile-stat"><span>Héros:</span> <strong>${p.hero.name} (Niv.${p.hero.level})</strong></div>` : ''}
        ${p.stats ? `
          <div class="profile-stat"><span>Attaques gagnées:</span> <strong>${p.stats.attacksWon}</strong></div>
          <div class="profile-stat"><span>Défenses gagnées:</span> <strong>${p.stats.defensesWon}</strong></div>
        ` : ''}
      </div>
      <h4>🏰 Villes</h4>
      <div class="profile-cities">
        ${p.cities.map(c => `
          <div class="profile-city">
            ${c.isCapital ? '👑' : '🏰'} ${c.name} (${c.x}, ${c.y})
          </div>
        `).join('')}
      </div>
      <div class="profile-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Fermer</button>
      </div>
    </div>
  `;
  document.getElementById('modal').style.display = 'flex';
}

// Spy from map
function spyFromMap(cityId) {
  const army = armies.find(a => a.status === 'IDLE' && a.units?.length > 0);
  if (!army) {
    showToast('Aucune armée disponible', 'error');
    return;
  }
  
  document.getElementById('modal-body').innerHTML = `
    <h3>🔍 Espionner</h3>
    <p>Envoyer <strong>${army.name}</strong> espionner cette ville ?</p>
    <p style="font-size:12px;color:#888">L'espionnage révèle les bâtiments, armées et ressources de l'ennemi.</p>
    <div style="margin-top:15px">
      <button onclick="confirmSpyFromMap('${army.id}', '${cityId}')" class="btn btn-warning">🔍 Espionner</button>
      <button onclick="closeModal()" class="btn btn-secondary">Annuler</button>
    </div>
  `;
  document.getElementById('modal').style.display = 'flex';
}

async function confirmSpyFromMap(armyId, cityId) {
  const res = await fetch(`${API}/api/army/${armyId}/spy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ targetCityId: cityId })
  });
  
  closeModal();
  closeMapPanel();
  
  if (res.ok) {
    const data = await res.json();
    showToast(`Espions envoyés vers ${data.target}!`, 'success');
    await loadArmies();
    loadMap();
  } else {
    const data = await res.json();
    showToast(data.error || 'Erreur', 'error');
  }
}

// Send resources from map
function sendResourcesFromMap(cityId, cityName) {
  const army = armies.find(a => a.status === 'IDLE' && a.units?.length > 0);
  if (!army) {
    showToast('Aucune armée disponible', 'error');
    return;
  }
  
  // Calculate carry capacity
  const capacity = army.units.reduce((sum, u) => {
    const unitDef = window.unitsData?.find(ud => ud.key === u.unitKey);
    return sum + (unitDef?.stats?.transport || 50) * u.count;
  }, 0);
  
  document.getElementById('modal-body').innerHTML = `
    <h3>📦 Envoyer des ressources</h3>
    <p>Vers: <strong>${cityName}</strong></p>
    <p>Armée: <strong>${army.name}</strong></p>
    <p>Capacité: <strong>${formatNum(capacity)}</strong></p>
    
    <div class="resource-inputs">
      <div class="resource-input">
        <label>🪵 Bois</label>
        <input type="number" id="send-wood" value="0" min="0" max="${Math.floor(currentCity?.wood || 0)}">
      </div>
      <div class="resource-input">
        <label>🪨 Pierre</label>
        <input type="number" id="send-stone" value="0" min="0" max="${Math.floor(currentCity?.stone || 0)}">
      </div>
      <div class="resource-input">
        <label>⛏️ Fer</label>
        <input type="number" id="send-iron" value="0" min="0" max="${Math.floor(currentCity?.iron || 0)}">
      </div>
      <div class="resource-input">
        <label>🌾 Nourriture</label>
        <input type="number" id="send-food" value="0" min="0" max="${Math.floor(currentCity?.food || 0)}">
      </div>
    </div>
    
    <div style="margin-top:15px">
      <button onclick="confirmSendResources('${army.id}', '${cityId}')" class="btn btn-success">📦 Envoyer</button>
      <button onclick="closeModal()" class="btn btn-secondary">Annuler</button>
    </div>
  `;
  document.getElementById('modal').style.display = 'flex';
}

async function confirmSendResources(armyId, cityId) {
  const wood = parseInt(document.getElementById('send-wood').value) || 0;
  const stone = parseInt(document.getElementById('send-stone').value) || 0;
  const iron = parseInt(document.getElementById('send-iron').value) || 0;
  const food = parseInt(document.getElementById('send-food').value) || 0;
  
  if (wood + stone + iron + food === 0) {
    showToast('Sélectionnez des ressources à envoyer', 'error');
    return;
  }
  
  const res = await fetch(`${API}/api/army/${armyId}/transport`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ targetCityId: cityId, wood, stone, iron, food })
  });
  
  closeModal();
  closeMapPanel();
  
  if (res.ok) {
    const data = await res.json();
    showToast(data.message, 'success');
    await loadArmies();
    await loadCity();
    loadMap();
  } else {
    const data = await res.json();
    showToast(data.error || 'Erreur', 'error');
  }
}

function closeMapPanel() {
  document.getElementById('map-info-panel').style.display = 'none';
  mapSelectedTile = null;
  renderMap();
}

function goToCity(cityId) {
  const city = cities.find(c => c.id === cityId);
  if (city) {
    currentCity = city;
    showTab('city');
  }
}

function attackFromMap(cityId, x, y) {
  const army = armies.find(a => a.status === 'IDLE' && a.units?.length > 0);
  if (!army) {
    showToast('Aucune armée disponible', 'error');
    return;
  }
  
  document.getElementById('modal-body').innerHTML = `
    <h3>Confirmer l'attaque</h3>
    <p>Envoyer <strong>${army.name}</strong> attaquer la ville à (${x}, ${y}) ?</p>
    <button onclick="confirmAttackFromMap('${army.id}', '${cityId}')" class="btn btn-danger">Attaquer!</button>
    <button onclick="closeModal()" class="btn btn-secondary">Annuler</button>
  `;
  document.getElementById('modal').style.display = 'flex';
}

async function confirmAttackFromMap(armyId, cityId) {
  const res = await fetch(`${API}/api/army/${armyId}/attack`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ targetCityId: cityId })
  });
  
  closeModal();
  closeMapPanel();
  
  if (res.ok) {
    showToast('Attaque lancée!', 'success');
    await loadArmies();
    loadMap();
  } else {
    const data = await res.json();
    showToast(data.error || 'Erreur', 'error');
  }
}

function raidFromMap(cityId) {
  const army = armies.find(a => a.status === 'IDLE' && a.units?.length > 0);
  if (army) {
    document.getElementById('modal-body').innerHTML = `
      <h3>Confirmer le raid</h3>
      <p>Envoyer <strong>${army.name}</strong> piller cette ville ?</p>
      <button onclick="confirmRaidFromMap('${army.id}', '${cityId}')" class="btn" style="background:linear-gradient(180deg,orange,#c70)">Piller!</button>
      <button onclick="closeModal()" class="btn btn-secondary">Annuler</button>
    `;
    document.getElementById('modal').style.display = 'flex';
  }
}

async function confirmRaidFromMap(armyId, cityId) {
  const res = await fetch(`${API}/api/army/${armyId}/raid`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ targetCityId: cityId })
  });
  
  closeModal();
  closeMapPanel();
  
  if (res.ok) {
    showToast('Raid lancé!', 'success');
    await loadArmies();
    loadMap();
  }
}

async function sendArmyTo(x, y) {
  const army = armies.find(a => a.status === 'IDLE');
  if (!army) {
    showToast('Aucune armée disponible', 'error');
    return;
  }
  
  const res = await fetch(`${API}/api/army/${army.id}/move`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ x, y })
  });
  
  closeMapPanel();
  
  if (res.ok) {
    showToast('Armée en route!', 'success');
    await loadArmies();
    loadMap();
  }
}

// Resize handler
window.addEventListener('resize', () => {
  if (mapCanvas && document.getElementById('tab-map').classList.contains('active')) {
    const container = mapCanvas.parentElement;
    mapCanvas.width = container.clientWidth;
    mapCanvas.height = container.clientHeight;
    renderMap();
  }
});

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
        
        content.innerHTML = `
          <div class="alliance-container">
            <div class="alliance-section">
              <div class="alliance-header">
                <div class="alliance-emblem">🛡️</div>
                <div class="alliance-info">
                  <h3>[${myAlliance.tag}] ${myAlliance.name}</h3>
                  <div class="alliance-tag">${myAlliance.members.length} membres</div>
                </div>
              </div>
              <div class="alliance-members">
                <h4>👥 Membres</h4>
                ${myAlliance.members.map(m => `
                  <div class="member-row">
                    <span class="member-name">${m.player.name}</span>
                    <span class="member-role ${m.role.toLowerCase()}">${m.role === 'LEADER' ? '👑 Leader' : m.role === 'OFFICER' ? '⭐ Officier' : '🛡️ Membre'}</span>
                  </div>
                `).join('')}
              </div>
              <button onclick="leaveAlliance()" class="btn btn-danger" style="margin-top:20px">Quitter l'alliance</button>
            </div>
            
            ${isLeaderOrOfficer ? `
            <div class="alliance-section">
              <h4>🤝 Diplomatie</h4>
              <p style="font-size:12px;color:var(--text-muted);margin-bottom:15px">Définissez vos relations avec les autres alliances (max 3 alliés)</p>
              
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
                          <option value="ALLY" ${dipStatus === 'ALLY' ? 'selected' : ''}>🤝 Allié</option>
                          <option value="ENEMY" ${dipStatus === 'ENEMY' ? 'selected' : ''}>⚔️ Ennemi</option>
                        </select>
                      </div>
                    </div>
                  `;
                }).join('') || '<p style="color:var(--text-muted)">Aucune autre alliance</p>'}
              </div>
            </div>
            ` : ''}
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
  const name = document.getElementById('alliance-name').value;
  const tag = document.getElementById('alliance-tag').value;
  
  const res = await fetch(`${API}/api/alliance/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ name, tag })
  });
  
  if (res.ok) {
    showToast('Alliance créée!', 'success');
    loadAlliance();
  } else {
    const data = await res.json();
    showToast(data.error || 'Erreur', 'error');
  }
}

async function joinAlliance(id) {
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

function getBuildingName(key) {
  const names = {
    MAIN_HALL: 'Hôtel de ville', BARRACKS: 'Caserne', STABLE: 'Écurie', WORKSHOP: 'Atelier',
    FARM: 'Ferme', LUMBER: 'Scierie', QUARRY: 'Carrière', IRON_MINE: 'Mine',
    WAREHOUSE: 'Entrepôt', SILO: 'Silo', MARKET: 'Marché', ACADEMY: 'Académie',
    FORGE: 'Forge', WALL: 'Mur', MOAT: 'Douves', HEALING_TENT: 'Infirmerie',
    RALLY_POINT: 'Point de ralliement', HIDEOUT: 'Cachette'
  };
  return names[key] || key;
}

function showBuildingInfo(key, level) {
  showToast(`${getBuildingName(key)} niveau ${level}`, 'info');
}

function closeModal() {
  document.getElementById('modal').style.display = 'none';
}

function showToast(msg, type = 'info') {
  const toast = document.getElementById('toast');
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
    if (mapTab?.classList.contains('active') && typeof renderMapCanvas === 'function') {
      renderMapCanvas();
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
  
  // Refresh toutes les 10 secondes
  refreshInterval = setInterval(() => refreshData(), 10000);
  
  // Refresh immédiat au démarrage
  refreshData(true);
}

function stopRefresh() {
  if (refreshInterval) {
    clearInterval(refreshInterval);
    refreshInterval = null;
  }
}

// Refresh quand la fenêtre redevient visible
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && token) {
    refreshData(true);
  }
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
  const sellResource = document.getElementById('market-sell-resource').value;
  const sellAmount = parseInt(document.getElementById('market-sell-amount').value);
  const buyResource = document.getElementById('market-buy-resource').value;
  const buyAmount = parseInt(document.getElementById('market-buy-amount').value);
  
  if (!sellAmount || !buyAmount || sellAmount <= 0 || buyAmount <= 0) {
    showToast('Quantités invalides', 'error');
    return;
  }
  
  if (sellResource === buyResource) {
    showToast('Sélectionnez des ressources différentes', 'error');
    return;
  }
  
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
      await loadCity();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur réseau', 'error');
  }
}

async function acceptMarketOffer(offerId) {
  try {
    const res = await fetch(`${API}/api/market/offer/${offerId}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ cityId: currentCity?.id })
    });
    
    if (res.ok) {
      showToast('Échange effectué!', 'success');
      await loadMarket();
      await loadCity();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur réseau', 'error');
  }
}

async function cancelMarketOffer(offerId) {
  try {
    const res = await fetch(`${API}/api/market/offer/${offerId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    
    if (res.ok) {
      showToast('Offre annulée', 'success');
      await loadMarket();
      await loadCity();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur réseau', 'error');
  }
}

// ========== RAPPORTS ESPIONNAGE ==========
let spyReports = [];
let currentReportTab = 'battles';

function showReportsTab(tab) {
  currentReportTab = tab;
  document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`.report-tab[onclick*="${tab}"]`)?.classList.add('active');
  
  if (tab === 'battles') {
    loadReports();
  } else if (tab === 'spy') {
    loadSpyReports();
  }
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
  const names = {
    MAIN_HALL: 'Hôtel de ville', BARRACKS: 'Caserne', STABLE: 'Écurie', WORKSHOP: 'Atelier',
    WAREHOUSE: 'Entrepôt', SILO: 'Silo', MARKET: 'Marché', ACADEMY: 'Académie',
    FARM: 'Ferme', LUMBER: 'Bûcheron', QUARRY: 'Carrière', IRON_MINE: 'Mine de fer',
    WALL: 'Muraille', MOAT: 'Douves', HIDEOUT: 'Cachette', HEALING_TENT: 'Tente de soins',
    RALLY_POINT: 'Point de ralliement', FORGE: 'Forge'
  };
  return names[key] || key;
}

function getUnitName(key) {
  const unit = window.unitsData?.find(u => u.key === key);
  return unit?.name || key;
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
