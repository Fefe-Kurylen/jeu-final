// ========== MAP - Rise of Kingdoms Style Canvas ==========
let mapCanvas, mapCtx, minimapCanvas, minimapCtx;
let mapData = [];
let mapZoomLevel = 1;
let mapOffsetX = 0, mapOffsetY = 0;
let mapInitialized = false;
let mapDragging = false;
let mapDragStart = { x: 0, y: 0 };
let mapHoveredTile = null;
let mapSelectedTile = null;
const TILE_SIZE = 40;
const BASE_TILE_SIZE = 48; // Base tile size for zoom calculations (average of ISO_TILE_WIDTH/HEIGHT)

// ========== WORLD COORDINATE SYSTEM ==========
// Map uses centered coordinates: -187 to +186 (374x374)
// Center of map is (0, 0) - richest resources
// Players spawn on EDGES (borders of the map)
const BASE_WORLD_SIZE = 374;
const MIN_COORD = -Math.floor(BASE_WORLD_SIZE / 2);  // -187
const MAX_COORD = MIN_COORD + BASE_WORLD_SIZE - 1;   // +186
let WORLD_SIZE = BASE_WORLD_SIZE;
const WORLD_CENTER = 0; // Center is always 0,0

// Update world size based on player count
function updateWorldSize(playerCount, serverWorldSize) {
  if (serverWorldSize && serverWorldSize > WORLD_SIZE) {
    WORLD_SIZE = serverWorldSize;
  }
  console.log(`🗺️ World: ${WORLD_SIZE}x${WORLD_SIZE} (coords ${MIN_COORD} to ${MAX_COORD}) - ${playerCount} players`);
}

// ========== ISOMETRIC MAP SYSTEM - Rise of Kingdoms Style ==========
// ========== 3 BIOMES: FOREST (center), DESERT (middle ring), SNOW (outer ring) ==========
const ISO_TILE_WIDTH = 64;
const ISO_TILE_HEIGHT = 32;

// ========== TILESET IMAGE SYSTEM ==========
let tilesetImage = null;
let tilesetConfig = null;
let tilesetLoaded = false;
let tilesetLoadFailed = false;

// Individual tile images for cities, units, resources
const tileImages = {
  cities: {},      // city type -> Image
  units: {},       // unit type -> Image
  resources: {},   // resource type -> Image
  terrain: {},     // terrain type -> Image
  buildings: {}    // building type -> Image
};

// Load tileset configuration and images
async function loadTilesetAssets() {
  console.log('🎨 Loading tileset assets...');

  try {
    // Try to load tileset config
    const configResponse = await fetch('/assets/tileset-config.json');
    if (configResponse.ok) {
      tilesetConfig = await configResponse.json();
      console.log('📋 Tileset config loaded:', tilesetConfig);

      // Try to load the main tileset image
      const tilesetPath = `/assets/images/map/${tilesetConfig.image}`;
      tilesetImage = new Image();
      tilesetImage.src = tilesetPath;

      await new Promise((resolve, reject) => {
        tilesetImage.onload = () => {
          tilesetLoaded = true;
          console.log('✅ Tileset image loaded:', tilesetPath);
          resolve();
        };
        tilesetImage.onerror = () => {
          console.warn('⚠️ Tileset image not found:', tilesetPath);
          tilesetLoadFailed = true;
          resolve(); // Don't reject, just use fallback
        };
      });
    }
  } catch (e) {
    console.warn('⚠️ Could not load tileset config, using procedural rendering');
    tilesetLoadFailed = true;
  }

  // Load individual tile images (cities, units, etc.)
  await loadIndividualTileImages();
}

// Load individual images for specific game objects
async function loadIndividualTileImages() {
  const imagesToLoad = [
    // Cities
    { category: 'cities', name: 'rome', path: '/assets/images/map/cities/rome.png' },
    { category: 'cities', name: 'gaul', path: '/assets/images/map/cities/gaul.png' },
    { category: 'cities', name: 'default', path: '/assets/images/map/cities/default.png' },
    { category: 'cities', name: 'capital', path: '/assets/images/map/cities/capital.png' },

    // Units
    { category: 'units', name: 'hoplite', path: '/assets/images/map/units/hoplite.png' },
    { category: 'units', name: 'archer', path: '/assets/images/map/units/archer.png' },
    { category: 'units', name: 'cavalry', path: '/assets/images/map/units/cavalry.png' },
    { category: 'units', name: 'catapult', path: '/assets/images/map/units/catapult.png' },
    { category: 'units', name: 'trireme', path: '/assets/images/map/units/trireme.png' },
    { category: 'units', name: 'merchant', path: '/assets/images/map/units/merchant.png' },
    { category: 'units', name: 'settler', path: '/assets/images/map/units/settler.png' },

    // Resources
    { category: 'resources', name: 'wood', path: '/assets/images/map/resources/wood.png' },
    { category: 'resources', name: 'stone', path: '/assets/images/map/resources/stone.png' },
    { category: 'resources', name: 'iron', path: '/assets/images/map/resources/iron.png' },
    { category: 'resources', name: 'food', path: '/assets/images/map/resources/food.png' },

    // Terrain tiles
    { category: 'terrain', name: 'grass', path: '/assets/images/map/terrain/grass.png' },
    { category: 'terrain', name: 'desert', path: '/assets/images/map/terrain/desert.png' },
    { category: 'terrain', name: 'snow', path: '/assets/images/map/terrain/snow.png' },
    { category: 'terrain', name: 'water', path: '/assets/images/map/terrain/water.png' },
    { category: 'terrain', name: 'forest', path: '/assets/images/map/terrain/forest.png' },
    { category: 'terrain', name: 'mountain', path: '/assets/images/map/terrain/mountain.png' }
  ];

  const loadPromises = imagesToLoad.map(({ category, name, path }) => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        tileImages[category][name] = img;
        console.log(`✅ Loaded: ${category}/${name}`);
        resolve();
      };
      img.onerror = () => {
        // Image not found, will use procedural fallback
        resolve();
      };
      img.src = path;
    });
  });

  await Promise.all(loadPromises);

  const loadedCount = Object.values(tileImages).reduce((sum, cat) => sum + Object.keys(cat).length, 0);
  console.log(`🎨 Loaded ${loadedCount}/${imagesToLoad.length} tile images`);
}

// Helper function to draw a tile from the tileset
function drawTileFromTileset(ctx, tileKey, destX, destY, destW, destH) {
  if (!tilesetLoaded || !tilesetConfig || !tilesetConfig.tiles[tileKey]) {
    return false; // Fallback to procedural
  }

  const tile = tilesetConfig.tiles[tileKey];
  const srcX = tile.col * tilesetConfig.tileWidth;
  const srcY = tile.row * tilesetConfig.tileHeight;

  ctx.drawImage(
    tilesetImage,
    srcX, srcY, tilesetConfig.tileWidth, tilesetConfig.tileHeight,
    destX, destY, destW, destH
  );

  return true;
}

// Helper function to draw an individual tile image
function drawTileImage(ctx, category, name, destX, destY, destW, destH) {
  const img = tileImages[category]?.[name];
  if (!img) return false;

  ctx.drawImage(img, destX - destW/2, destY - destH, destW, destH);
  return true;
}

// BIOME CONFIGURATION
const BIOMES = {
  // TIER 1: Forest/Grassland (center, radius 0-120)
  forest: {
    ground: ['#5a8c3a', '#4e7a32', '#62943e', '#568838', '#4a7230'],
    groundDark: ['#4a7830', '#3e6a28', '#527e34', '#466c2c', '#3a6224'],
    groundNight: ['#1a3018', '#152810', '#1c3520', '#182c18', '#122510'],
    features: ['tree', 'mountain', 'water'],
    skyTop: '#87CEEB',
    skyBottom: '#5a8c3a',
    skyTopNight: '#0a1525',
    skyBottomNight: '#152535'
  },
  // TIER 2: Desert (middle ring, radius 120-200)
  desert: {
    ground: ['#d4c4a0', '#c9b896', '#ddd0aa', '#c4b48a', '#d9c99e'],
    groundDark: ['#c4b490', '#b9a886', '#cdc09a', '#b4a47a', '#c9b98e'],
    groundNight: ['#3a3530', '#352f2a', '#3f3935', '#332d28', '#3d3732'],
    features: ['ruins', 'oasis', 'dunes', 'rocks'],
    skyTop: '#f4e8d0',
    skyBottom: '#d4c4a0',
    skyTopNight: '#151020',
    skyBottomNight: '#201a2a'
  },
  // TIER 3: Snow/Tundra (outer ring, radius 200+)
  snow: {
    ground: ['#e8e8e8', '#dcdcdc', '#f0f0f0', '#d8d8d8', '#eaeaea'],
    groundDark: ['#c8c8c8', '#bcbcbc', '#d0d0d0', '#b8b8b8', '#cacaca'],
    groundNight: ['#404858', '#3a424f', '#454d5e', '#383f4c', '#424a5a'],
    features: ['snowtree', 'icemountain', 'frozen'],
    skyTop: '#b8c8d8',
    skyBottom: '#8898a8',
    skyTopNight: '#0a1020',
    skyBottomNight: '#1a2535'
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

// Pseudo-random based on coordinates for consistent terrain
function seededRandom(x, y, seed = 12345) {
  const n = Math.sin(x * 12.9898 + y * 78.233 + seed) * 43758.5453;
  return n - Math.floor(n);
}

// Get biome based on DISTANCE from center (concentric rings)
// Center = Forest (rich), Middle ring = Desert, Outer ring = Snow (harsh)
function getBiome(x, y) {
  const dx = x - WORLD_CENTER;
  const dy = y - WORLD_CENTER;
  const distance = Math.sqrt(dx * dx + dy * dy);

  // Max distance is ~265 (corner of 374x374 map from center)
  const maxDist = WORLD_SIZE / 2 * 1.4; // ~262
  const normalizedDist = distance / maxDist;

  // Concentric rings: Forest (0-35%), Desert (35-70%), Snow (70-100%)
  if (normalizedDist < 0.35) return 'forest';
  if (normalizedDist < 0.70) return 'desert';
  return 'snow';
}

// ========== MULTI-TILE TERRAIN GENERATION ==========
// Rivers, lakes, and mountain ranges that span multiple tiles (max 30 length)

// Cache for multi-tile terrain to avoid recalculating
const multiTileTerrainCache = new Map();

// Generate river paths (sinuous lines across the map)
function isOnRiver(x, y) {
  // Multiple river sources spread across the map
  const riverSeeds = [
    { sx: -100, sy: -50, dir: 0.3, length: 30 },
    { sx: 50, sy: -120, dir: -0.2, length: 25 },
    { sx: -80, sy: 80, dir: 0.4, length: 28 },
    { sx: 120, sy: 30, dir: -0.35, length: 22 },
    { sx: -30, sy: 100, dir: 0.25, length: 20 }
  ];

  for (const river of riverSeeds) {
    let rx = river.sx;
    let ry = river.sy;
    let dir = river.dir;

    for (let i = 0; i < river.length; i++) {
      // River width of 1-2 tiles
      if (Math.abs(x - Math.round(rx)) <= 1 && Math.abs(y - Math.round(ry)) <= 1) {
        const dist = Math.sqrt((x - rx) ** 2 + (y - ry) ** 2);
        if (dist < 1.2) return true;
      }

      // Move river forward with some meandering
      rx += Math.cos(dir * Math.PI) * 2;
      ry += Math.sin(dir * Math.PI) * 2;
      dir += (seededRandom(Math.floor(rx), Math.floor(ry), 11111) - 0.5) * 0.3;
    }
  }
  return false;
}

// Generate lake clusters (circular formations)
function isOnLake(x, y) {
  // Lake centers
  const lakeSeeds = [
    { cx: -60, cy: -30, radius: 8 },
    { cx: 80, cy: -70, radius: 6 },
    { cx: -90, cy: 60, radius: 10 },
    { cx: 40, cy: 90, radius: 7 },
    { cx: 100, cy: -20, radius: 5 },
    { cx: -20, cy: -100, radius: 9 }
  ];

  for (const lake of lakeSeeds) {
    const dist = Math.sqrt((x - lake.cx) ** 2 + (y - lake.cy) ** 2);
    // Irregular lake shape using noise
    const irregularity = seededRandom(x, y, 22222) * 3;
    if (dist < lake.radius + irregularity - 2) {
      return true;
    }
  }
  return false;
}

// Generate mountain ranges (linear chains with branches)
function isOnMountainRange(x, y) {
  // Mountain range spines
  const mountainRanges = [
    { sx: -150, sy: 0, ex: -50, ey: -80, width: 4 },
    { sx: 50, sy: -150, ex: 100, ey: -50, width: 3 },
    { sx: -100, sy: 100, ex: 0, ey: 150, width: 5 },
    { sx: 80, sy: 50, ex: 150, ey: 100, width: 4 }
  ];

  for (const range of mountainRanges) {
    // Calculate distance to line segment
    const dx = range.ex - range.sx;
    const dy = range.ey - range.sy;
    const len = Math.sqrt(dx * dx + dy * dy);

    const t = Math.max(0, Math.min(1,
      ((x - range.sx) * dx + (y - range.sy) * dy) / (len * len)
    ));

    const nearX = range.sx + t * dx;
    const nearY = range.sy + t * dy;
    const dist = Math.sqrt((x - nearX) ** 2 + (y - nearY) ** 2);

    // Add some width variation using noise
    const widthVar = seededRandom(x, y, 33333) * 2;
    if (dist < range.width + widthVar) {
      return true;
    }
  }
  return false;
}

// Check if tile has features based on noise, biome, and multi-tile formations
function getTerrainType(x, y) {
  const biome = getBiome(x, y);
  const noise = seededRandom(x, y);
  const noise2 = seededRandom(x * 2, y * 2, 54321);

  // Check multi-tile terrain first (rivers, lakes, mountains)
  // These override normal terrain generation

  // Rivers in forest and desert biomes
  if ((biome === 'forest' || biome === 'desert') && isOnRiver(x, y)) {
    return { biome, feature: biome === 'desert' ? 'oasis' : 'water', isMultiTile: true };
  }

  // Lakes - different types per biome
  if (isOnLake(x, y)) {
    if (biome === 'snow') return { biome, feature: 'frozen', isMultiTile: true };
    if (biome === 'desert') return { biome, feature: 'oasis', isMultiTile: true };
    return { biome, feature: 'water', isMultiTile: true };
  }

  // Mountain ranges
  if (isOnMountainRange(x, y)) {
    if (biome === 'snow') return { biome, feature: 'icemountain', isMultiTile: true };
    if (biome === 'desert') return { biome, feature: 'rocks', isMultiTile: true };
    return { biome, feature: 'mountain', isMultiTile: true };
  }

  // Normal terrain generation (scattered features)
  if (biome === 'forest') {
    if (noise > 0.94 && noise2 > 0.6) return { biome, feature: 'mountain' };
    if (noise > 0.55 && noise2 > 0.4) return { biome, feature: 'tree' };
    if (noise < 0.02) return { biome, feature: 'water' };
  } else if (biome === 'desert') {
    if (noise > 0.95) return { biome, feature: 'ruins' };
    if (noise > 0.88 && noise2 > 0.5) return { biome, feature: 'rocks' };
    if (noise > 0.72 && noise2 > 0.6) return { biome, feature: 'dunes' };
    if (noise < 0.03) return { biome, feature: 'oasis' };
  } else if (biome === 'snow') {
    if (noise > 0.92 && noise2 > 0.5) return { biome, feature: 'icemountain' };
    if (noise > 0.50 && noise2 > 0.35) return { biome, feature: 'snowtree' };
    if (noise < 0.03) return { biome, feature: 'frozen' };
  }

  return { biome, feature: null };
}

function initMapCanvas() {
  mapCanvas = document.getElementById('world-canvas');
  mapCtx = mapCanvas?.getContext('2d');
  minimapCanvas = document.getElementById('minimap-canvas');
  minimapCtx = minimapCanvas?.getContext('2d');

  if (!mapCanvas || !mapCtx) return;

  // Resize canvas to container with fallback dimensions
  const container = mapCanvas.parentElement;
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;
  mapCanvas.width = Math.max(width, 300);
  mapCanvas.height = Math.max(height, 200);

  // Only add events once
  if (!mapCanvas.hasAttribute('data-events-attached')) {
    mapCanvas.setAttribute('data-events-attached', 'true');
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
  }

  // Add minimap click events for navigation
  if (minimapCanvas && !minimapCanvas.hasAttribute('data-events-attached')) {
    minimapCanvas.setAttribute('data-events-attached', 'true');
    minimapCanvas.addEventListener('click', onMinimapClick);
    minimapCanvas.addEventListener('mousedown', onMinimapMouseDown);
    minimapCanvas.addEventListener('mousemove', onMinimapMouseMove);
    minimapCanvas.addEventListener('mouseup', onMinimapMouseUp);
    minimapCanvas.addEventListener('mouseleave', onMinimapMouseUp);
  }

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
    case '7': // Inventaire
      e.preventDefault();
      showTab('inventory');
      showToast('🎒 Inventaire', 'info');
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
        showTab('hero');
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
      mapOffsetY = Math.max(MIN_COORD, mapOffsetY - moveSpeed);
      renderMap();
      renderMinimap();
      updateMapUI();
      break;
    case 's':
    case 'arrowdown':
      e.preventDefault();
      mapOffsetY = Math.min(MAX_COORD, mapOffsetY + moveSpeed);
      renderMap();
      renderMinimap();
      updateMapUI();
      break;
    case 'a':
    case 'arrowleft':
      e.preventDefault();
      mapOffsetX = Math.max(MIN_COORD, mapOffsetX - moveSpeed);
      renderMap();
      renderMinimap();
      updateMapUI();
      break;
    case 'd':
    case 'arrowright':
      e.preventDefault();
      mapOffsetX = Math.min(MAX_COORD, mapOffsetX + moveSpeed);
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
          <div class="shortcut"><kbd>7</kbd> Inventaire</div>
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
  // Load tileset assets if not already loaded
  if (!tilesetLoaded && !tilesetLoadFailed) {
    await loadTilesetAssets();
  }

  initMapCanvas();

  // Center map on player's first city on first load
  if (!mapInitialized && currentCity) {
    mapOffsetX = currentCity.x;
    mapOffsetY = currentCity.y;
    mapInitialized = true;
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
            id: c.id,
            playerId: c.playerId || c.player?.id,
            playerName: c.player?.name || c.playerName || 'Inconnu',
            name: c.name,
            isCapital: c.isCapital || false,
            allianceId: c.player?.allianceId || null,
            allianceTag: c.player?.allianceTag || null,
            faction: c.player?.faction || 'ROME',
            wallLevel: c.wallLevel || 0,
            cityTier: c.cityTier || 0,
            cityTierName: c.cityTierName || 'Village',
            population: c.player?.population || 0
          });
        });
      }

      // Add resource nodes with tribe defenders info
      if (data.resourceNodes) {
        data.resourceNodes.forEach(r => {
          mapData.push({
            x: r.x,
            y: r.y,
            type: 'RESOURCE',
            id: r.id,
            resourceType: r.resourceType,
            level: r.level || 1,
            amount: r.amount || 0,
            maxAmount: r.maxAmount || 1000,
            biome: r.biome || 'forest',
            // Tribe defenders info
            hasDefenders: r.hasDefenders !== false,
            defenderPower: r.defenderPower || 0,
            defenderUnits: r.defenderUnits || {},
            lastDefeat: r.lastDefeat,
            respawnMinutes: r.respawnMinutes || 60
          });
        });
      }

      // Add moving armies from server
      if (data.armies) {
        data.armies.forEach(a => {
          // Avoid duplicating player's own armies already shown
          if (!mapData.find(d => d.type === 'ARMY' && d.id === a.id)) {
            mapData.push({
              x: a.x,
              y: a.y,
              type: 'ARMY',
              id: a.id,
              name: a.name,
              status: a.status,
              missionType: a.missionType,
              targetX: a.targetX,
              targetY: a.targetY,
              arrivalAt: a.arrivalAt,
              ownerId: a.ownerId,
              ownerName: a.owner?.name || 'Inconnu',
              faction: a.owner?.faction || 'ROME'
            });
          }
        });
      }

      // Always include player's cities even if not in viewport
      cities.forEach(c => {
        if (!mapData.find(d => d.x === c.x && d.y === c.y && d.type === 'CITY')) {
          const wallBuilding = c.buildings?.find(b => b.key === 'WALL');
          const wallLevel = c.wallLevel || wallBuilding?.level || 0;

          mapData.push({
            x: c.x,
            y: c.y,
            type: 'CITY',
            id: c.id,
            playerId: player?.id,
            playerName: player?.name || 'Vous',
            name: c.name,
            isCapital: c.isCapital || false,
            allianceId: player?.allianceId || null,
            faction: player?.faction || 'ROME',
            wallLevel: wallLevel,
            cityTier: c.cityTier || (wallLevel >= 15 ? 3 : wallLevel >= 10 ? 2 : wallLevel >= 1 ? 1 : 0),
            population: player?.population || 0
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
  const fakePlayerNames = ['Marcus', 'Julia', 'Gaius', 'Livia', 'Brutus', 'Helena', 'Nero', 'Octavia', 'Titus', 'Cornelia'];
  const fakeFactions = ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN'];

  // Add player cities with full data
  cities.forEach(c => {
    const wallBuilding = c.buildings?.find(b => b.key === 'WALL');
    data.push({
      x: c.x,
      y: c.y,
      type: 'CITY',
      id: c.id,
      playerId: player?.id,
      playerName: player?.name || 'Vous',
      name: c.name,
      isCapital: c.isCapital,
      faction: player?.faction || 'ROME',
      wallLevel: wallBuilding?.level || 0,
      population: player?.population || 100
    });
  });

  // Add some random resources and enemy cities
  for (let i = 0; i < 50; i++) {
    const x = startX + Math.floor(Math.random() * size);
    const y = startY + Math.floor(Math.random() * size);
    const types = ['WOOD', 'STONE', 'IRON', 'FOOD'];

    // Avoid collision with player cities
    if (data.find(d => d.x === x && d.y === y)) continue;

    if (Math.random() < 0.15) {
      // Enemy city with proper data
      const fakePlayerId = `fake-player-${i}`;
      const fakePlayerName = fakePlayerNames[i % fakePlayerNames.length];
      const fakeFaction = fakeFactions[Math.floor(Math.random() * fakeFactions.length)];
      data.push({
        x,
        y,
        type: 'CITY',
        id: `fake-city-${i}`,
        playerId: fakePlayerId,
        playerName: fakePlayerName,
        name: `${fakePlayerName}'s Village`,
        isCapital: Math.random() < 0.3,
        faction: fakeFaction,
        wallLevel: Math.floor(Math.random() * 10),
        population: Math.floor(Math.random() * 1000) + 50
      });
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
  const nightMode = isNightMode();

  // Tile size based on zoom
  const tileW = ISO_TILE_WIDTH * mapZoomLevel;
  const tileH = ISO_TILE_HEIGHT * mapZoomLevel;

  // Get current biome for sky gradient (based on center of view)
  const centerBiome = getBiome(Math.floor(mapOffsetX), Math.floor(mapOffsetY));
  const biomeColors = BIOMES[centerBiome];

  // Clear canvas with sky gradient based on biome and day/night
  const gradient = mapCtx.createLinearGradient(0, 0, 0, h);
  if (nightMode) {
    gradient.addColorStop(0, biomeColors.skyTopNight || '#0a1020');
    gradient.addColorStop(1, biomeColors.skyBottomNight || '#152030');
  } else {
    gradient.addColorStop(0, biomeColors.skyTop);
    gradient.addColorStop(1, biomeColors.skyBottom);
  }
  mapCtx.fillStyle = gradient;
  mapCtx.fillRect(0, 0, w, h);

  // Draw stars at night
  if (nightMode) {
    drawMapStars(w, h);
  }

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

  // Store for click detection and army movement lines
  window.mapScreenToWorld = screenToWorld;
  window.mapWorldToScreen = worldToScreen;

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
  const nightMode = isNightMode();

  // Draw diamond shape (base tile)
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - th / 2);        // Top
  mapCtx.lineTo(x + tw / 2, y);        // Right
  mapCtx.lineTo(x, y + th / 2);        // Bottom
  mapCtx.lineTo(x - tw / 2, y);        // Left
  mapCtx.closePath();

  // Fill based on biome, feature and day/night
  if (feature === 'water' || feature === 'frozen') {
    if (nightMode) {
      mapCtx.fillStyle = feature === 'frozen' ? '#404858' : '#1a2a3a';
    } else {
      mapCtx.fillStyle = feature === 'frozen' ? '#a8c8d8' : '#3a6a8a';
    }
  } else if (feature === 'oasis') {
    mapCtx.fillStyle = nightMode ? '#1a3a2a' : '#4a9a6a';
  } else {
    // Use night ground colors if available
    const groundColors = nightMode && biomeColors.groundNight
      ? biomeColors.groundNight
      : biomeColors.ground;
    mapCtx.fillStyle = groundColors[colorVariant];
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

// Draw stars on map at night
function drawMapStars(w, h) {
  // Use seeded random for consistent star positions
  const seed = 54321;
  const random = (i) => {
    const x = Math.sin(seed + i) * 10000;
    return x - Math.floor(x);
  };

  for (let i = 0; i < 60; i++) {
    const x = random(i) * w;
    const y = random(i + 100) * h * 0.5; // Only upper half
    const size = random(i + 200) * 1.5 + 0.5;
    const brightness = random(i + 300) * 0.5 + 0.5;

    // Twinkling effect
    const twinkle = Math.sin(Date.now() / 600 + i) * 0.3 + 0.7;

    mapCtx.fillStyle = `rgba(255, 255, 255, ${brightness * twinkle})`;
    mapCtx.beginPath();
    mapCtx.arc(x, y, size, 0, Math.PI * 2);
    mapCtx.fill();
  }
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

// Culture-specific city styles
const CULTURE_STYLES = {
  ROME: {
    wallColor: '#8B7355',      // Brown stone
    wallDark: '#5C4033',
    roofColor: '#8B0000',      // Red tiles
    buildingColor: '#D4A574',  // Terracotta
    accent: '#FFD700'          // Gold
  },
  GAUL: {
    wallColor: '#6B8E23',      // Olive/wood
    wallDark: '#4A5D16',
    roofColor: '#8B4513',      // Brown thatch
    buildingColor: '#DEB887',  // Burlywood
    accent: '#228B22'          // Forest green
  },
  GREEK: {
    wallColor: '#E8E8E8',      // White marble
    wallDark: '#B8B8B8',
    roofColor: '#4682B4',      // Blue tiles
    buildingColor: '#F5F5DC',  // Beige
    accent: '#4169E1'          // Royal blue
  },
  EGYPT: {
    wallColor: '#D2B48C',      // Tan sandstone
    wallDark: '#A0826D',
    roofColor: '#DAA520',      // Goldenrod
    buildingColor: '#F4E4BC',  // Light sand
    accent: '#1E90FF'          // Dodger blue
  },
  HUN: {
    wallColor: '#4A3728',      // Dark wood
    wallDark: '#2F1F14',
    roofColor: '#696969',      // Gray felt
    buildingColor: '#8B7355',  // Brown
    accent: '#FF4500'          // Orange red
  },
  SULTAN: {
    wallColor: '#CD853F',      // Peru (clay)
    wallDark: '#8B5A2B',
    roofColor: '#20B2AA',      // Light sea green (domes)
    buildingColor: '#F5DEB3',  // Wheat
    accent: '#FF6347'          // Tomato red
  }
};

// Draw city labels (name, flag, population badge) - used for both image and procedural rendering
function drawCityLabels(x, y, tw, th, tile, isMyCity, isAlly) {
  const citySize = Math.min(tw, th * 2) * 0.8;

  // Banner/flag
  const flagY = y - citySize * 0.55;
  const bannerColor = isMyCity ? '#ffd700' : isAlly ? '#44ff88' : '#ff4444';
  mapCtx.fillStyle = bannerColor;
  mapCtx.fillRect(x - 1, flagY - 12, 2, 15);
  mapCtx.beginPath();
  mapCtx.moveTo(x + 1, flagY - 12);
  mapCtx.lineTo(x + 10, flagY - 8);
  mapCtx.lineTo(x + 1, flagY - 4);
  mapCtx.closePath();
  mapCtx.fill();

  // City name label
  if (mapZoomLevel > 0.5 && tile.name) {
    mapCtx.font = `bold ${10 * mapZoomLevel}px Arial, sans-serif`;
    mapCtx.textAlign = 'center';
    mapCtx.textBaseline = 'top';
    mapCtx.fillStyle = '#fff';
    mapCtx.shadowColor = '#000';
    mapCtx.shadowBlur = 3;
    mapCtx.fillText(tile.name, x, y + citySize * 0.35);
    mapCtx.shadowBlur = 0;
  }

  // Power level badge
  if (mapZoomLevel > 0.7 && tile.population) {
    const badgeX = x + citySize * 0.4;
    const badgeY = y - citySize * 0.5;
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

// Draw isometric city with culture-specific style and walls
function drawIsoCity(x, y, tw, th, tile) {
  const isMyCity = tile.playerId === player?.id;
  const isAlly = tile.allianceId && tile.allianceId === player?.allianceId;
  const faction = tile.faction || 'ROME';
  const wallLevel = tile.wallLevel || 0;
  const cultureStyle = CULTURE_STYLES[faction] || CULTURE_STYLES.ROME;

  // Try to draw from tileset image first
  const cityImageSize = Math.max(tw * 1.5, th * 3);
  const cityType = tile.isCapital ? 'capital' : faction.toLowerCase();

  // Try individual city image
  if (drawTileImage(mapCtx, 'cities', cityType, x, y, cityImageSize, cityImageSize)) {
    // Image drawn successfully, add labels on top
    drawCityLabels(x, y, tw, th, tile, isMyCity, isAlly);
    return;
  }

  // Try tileset mapping
  const tilesetMapping = {
    'ROME': ['TEMPLE_ROAD', 'TEMPLE_SMALL', 'ARENA'],
    'GAUL': ['VILLAGE_CENTER', 'VILLAGE_ROAD_CURVE'],
    'GREEK': ['ARENA', 'TEMPLE_SMALL'],
    'EGYPT': ['DESERT_RUINS', 'TEMPLE_ROAD'],
    'HUN': ['ROAD_L_DIRT', 'VILLAGE_CENTER'],
    'SULTAN': ['WALL_RIVER', 'CASTLE']
  };

  const tileKeys = tilesetMapping[faction] || ['VILLAGE_CENTER'];
  const tileKey = tileKeys[Math.abs(tile.x + tile.y) % tileKeys.length];

  if (drawTileFromTileset(mapCtx, tileKey, x - cityImageSize/2, y - cityImageSize, cityImageSize, cityImageSize)) {
    drawCityLabels(x, y, tw, th, tile, isMyCity, isAlly);
    return;
  }

  // Fallback to procedural rendering
  // Use cityTier from API (Village=1, Ville=2, Ville Fortifiée=3) or calculate from wallLevel
  // Village: wall 1-9, Ville: wall 10-14, Ville Fortifiée: wall 15+
  const cityTier = tile.cityTier || (wallLevel === 0 ? 0 : wallLevel < 10 ? 1 : wallLevel < 15 ? 2 : 3);

  const citySize = Math.min(tw, th * 2) * 0.8;

  // Shadow
  mapCtx.fillStyle = 'rgba(0,0,0,0.3)';
  mapCtx.beginPath();
  mapCtx.ellipse(x + 3, y + 5, citySize * 0.5, citySize * 0.25, 0, 0, Math.PI * 2);
  mapCtx.fill();

  // Draw walls based on city tier (only if cityTier > 0)
  if (cityTier > 0) {
    drawCityWalls(x, y, citySize, cityTier, cultureStyle);
  }

  // City base ground - size varies by city tier
  mapCtx.fillStyle = isMyCity ? '#c4a060' : isAlly ? '#70a080' : '#a07060';
  mapCtx.beginPath();
  const groundSize = cityTier > 0 ? 0.35 : 0.42;
  mapCtx.ellipse(x, y - (cityTier > 0 ? 3 : 0), citySize * groundSize, citySize * groundSize * 0.55, 0, 0, Math.PI * 2);
  mapCtx.fill();

  // Draw culture-specific buildings (no central tower)
  drawCultureBuildings(x, y, citySize, faction, cultureStyle, isMyCity, isAlly, tile.isCapital);

  // Banner/flag on main building
  const flagY = y - citySize * 0.55;
  const bannerColor = isMyCity ? '#ffd700' : isAlly ? '#44ff88' : '#ff4444';
  mapCtx.fillStyle = bannerColor;
  mapCtx.fillRect(x - 1, flagY - 12, 2, 15);
  mapCtx.beginPath();
  mapCtx.moveTo(x + 1, flagY - 12);
  mapCtx.lineTo(x + 10, flagY - 8);
  mapCtx.lineTo(x + 1, flagY - 4);
  mapCtx.closePath();
  mapCtx.fill();

  // City name label
  if (mapZoomLevel > 0.5 && tile.name) {
    mapCtx.font = `bold ${10 * mapZoomLevel}px Arial, sans-serif`;
    mapCtx.textAlign = 'center';
    mapCtx.textBaseline = 'top';
    mapCtx.fillStyle = '#fff';
    mapCtx.shadowColor = '#000';
    mapCtx.shadowBlur = 3;
    mapCtx.fillText(tile.name, x, y + citySize * 0.35);

    // City tier label (Village/Ville/Ville Fortifiée)
    if (mapZoomLevel > 0.8) {
      const tierName = tile.cityTierName || (cityTier === 3 ? 'Ville Fortifiée' : cityTier === 2 ? 'Ville' : 'Village');
      const tierColor = cityTier === 3 ? '#ffd700' : cityTier === 2 ? '#87ceeb' : '#90ee90';
      mapCtx.font = `${8 * mapZoomLevel}px Arial, sans-serif`;
      mapCtx.fillStyle = tierColor;
      mapCtx.fillText(tierName, x, y + citySize * 0.35 + 12 * mapZoomLevel);
    }
    mapCtx.shadowBlur = 0;
  }

  // Power level badge
  if (mapZoomLevel > 0.7 && tile.population) {
    const badgeX = x + citySize * 0.4;
    const badgeY = y - citySize * 0.5;
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

// Draw city walls with 3 visual tiers
function drawCityWalls(x, y, size, tier, style) {
  const wallHeight = size * (0.08 + tier * 0.04); // Taller walls for higher tiers
  const wallRadius = size * 0.45;
  const wallRadiusY = size * 0.25;

  // Wall base (outer)
  mapCtx.fillStyle = style.wallDark;
  mapCtx.beginPath();
  mapCtx.ellipse(x, y + 2, wallRadius, wallRadiusY, 0, 0, Math.PI * 2);
  mapCtx.fill();

  // Wall top
  mapCtx.fillStyle = style.wallColor;
  mapCtx.beginPath();
  mapCtx.ellipse(x, y - wallHeight, wallRadius, wallRadiusY, 0, 0, Math.PI * 2);
  mapCtx.fill();

  // Wall sides (visible part)
  mapCtx.fillStyle = style.wallDark;
  mapCtx.beginPath();
  mapCtx.moveTo(x - wallRadius, y + 2);
  mapCtx.lineTo(x - wallRadius, y - wallHeight);
  mapCtx.ellipse(x, y - wallHeight, wallRadius, wallRadiusY, 0, Math.PI, 0, true);
  mapCtx.lineTo(x + wallRadius, y + 2);
  mapCtx.ellipse(x, y + 2, wallRadius, wallRadiusY, 0, 0, Math.PI, true);
  mapCtx.closePath();
  mapCtx.fill();

  // Light side of wall
  mapCtx.fillStyle = style.wallColor;
  mapCtx.beginPath();
  mapCtx.moveTo(x - wallRadius, y - wallHeight);
  mapCtx.lineTo(x - wallRadius, y + 2);
  mapCtx.ellipse(x, y + 2, wallRadius, wallRadiusY, 0, Math.PI, Math.PI * 0.5, true);
  mapCtx.lineTo(x, y - wallHeight - wallRadiusY);
  mapCtx.ellipse(x, y - wallHeight, wallRadius, wallRadiusY, 0, Math.PI * 1.5, Math.PI, true);
  mapCtx.closePath();
  mapCtx.fill();

  // Crenellations for tier 2+
  if (tier >= 2 && mapZoomLevel > 0.5) {
    const crenelCount = 8 + tier * 2;
    mapCtx.fillStyle = style.wallColor;
    for (let i = 0; i < crenelCount; i++) {
      const angle = (i / crenelCount) * Math.PI * 2;
      const cx = x + Math.cos(angle) * wallRadius * 0.95;
      const cy = y - wallHeight + Math.sin(angle) * wallRadiusY * 0.95 - 2;
      mapCtx.fillRect(cx - 2, cy - 4, 4, 4);
    }
  }

  // Towers for tier 3
  if (tier >= 3 && mapZoomLevel > 0.4) {
    const towerPositions = [
      { angle: Math.PI * 0.25 },
      { angle: Math.PI * 0.75 },
      { angle: Math.PI * 1.25 },
      { angle: Math.PI * 1.75 }
    ];
    towerPositions.forEach(pos => {
      const tx = x + Math.cos(pos.angle) * wallRadius;
      const ty = y - wallHeight + Math.sin(pos.angle) * wallRadiusY;
      drawWallTower(tx, ty, size * 0.12, style);
    });
  }
}

// Draw wall tower
function drawWallTower(x, y, size, style) {
  // Tower body
  mapCtx.fillStyle = style.wallDark;
  mapCtx.fillRect(x - size / 2, y - size * 2, size, size * 2);

  // Tower light side
  mapCtx.fillStyle = style.wallColor;
  mapCtx.fillRect(x - size / 2, y - size * 2, size / 2, size * 2);

  // Tower top
  mapCtx.fillStyle = style.wallColor;
  mapCtx.beginPath();
  mapCtx.arc(x, y - size * 2, size / 2, 0, Math.PI * 2);
  mapCtx.fill();

  // Tower roof
  mapCtx.fillStyle = style.wallDark;
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - size * 2.8);
  mapCtx.lineTo(x + size * 0.6, y - size * 2);
  mapCtx.lineTo(x - size * 0.6, y - size * 2);
  mapCtx.closePath();
  mapCtx.fill();
}

// Draw culture-specific buildings (no central tower)
function drawCultureBuildings(x, y, size, faction, style, isMyCity, isAlly, isCapital) {
  const bh = size * 0.4;
  const bw = size * 0.25;

  // Main hall (culture-specific shape)
  if (faction === 'ROME' || faction === 'GREEK') {
    // Classical temple style - rectangular with columns
    drawClassicalBuilding(x, y - 5, bw, bh, style, isCapital);
  } else if (faction === 'EGYPT') {
    // Pyramid/obelisk style
    drawEgyptianBuilding(x, y - 5, bw, bh, style, isCapital);
  } else if (faction === 'SULTAN') {
    // Dome style
    drawIslamicBuilding(x, y - 5, bw, bh, style, isCapital);
  } else if (faction === 'HUN') {
    // Tent/yurt style
    drawNomadBuilding(x, y - 5, bw, bh, style, isCapital);
  } else {
    // GAUL - Wooden hall
    drawCelticBuilding(x, y - 5, bw, bh, style, isCapital);
  }

  // Side buildings (smaller, culture-appropriate)
  if (mapZoomLevel > 0.6) {
    drawSmallBuilding(x - size * 0.25, y + 2, size * 0.1, style);
    drawSmallBuilding(x + size * 0.25, y + 2, size * 0.1, style);
  }
}

// Classical building (Rome, Greek)
function drawClassicalBuilding(x, y, w, h, style, isCapital) {
  // Base
  mapCtx.fillStyle = style.buildingColor;
  mapCtx.fillRect(x - w, y - h, w * 2, h);

  // Columns effect (stripes)
  mapCtx.fillStyle = shadeColor(style.buildingColor, -15);
  for (let i = 0; i < 4; i++) {
    mapCtx.fillRect(x - w + i * w * 0.5 + 2, y - h, 3, h);
  }

  // Triangular roof (pediment)
  mapCtx.fillStyle = style.roofColor;
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - h - w * 0.6);
  mapCtx.lineTo(x + w + 3, y - h);
  mapCtx.lineTo(x - w - 3, y - h);
  mapCtx.closePath();
  mapCtx.fill();

  // Capital crown
  if (isCapital) {
    mapCtx.fillStyle = style.accent;
    mapCtx.beginPath();
    mapCtx.arc(x, y - h - w * 0.6 - 5, 4, 0, Math.PI * 2);
    mapCtx.fill();
  }
}

// Egyptian building
function drawEgyptianBuilding(x, y, w, h, style, isCapital) {
  // Pyramid shape
  mapCtx.fillStyle = style.buildingColor;
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - h * 1.3);
  mapCtx.lineTo(x + w, y);
  mapCtx.lineTo(x - w, y);
  mapCtx.closePath();
  mapCtx.fill();

  // Shadow side
  mapCtx.fillStyle = shadeColor(style.buildingColor, -20);
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - h * 1.3);
  mapCtx.lineTo(x + w, y);
  mapCtx.lineTo(x, y - h * 0.3);
  mapCtx.closePath();
  mapCtx.fill();

  // Gold cap
  mapCtx.fillStyle = style.roofColor;
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - h * 1.3 - 3);
  mapCtx.lineTo(x + w * 0.15, y - h * 1.1);
  mapCtx.lineTo(x - w * 0.15, y - h * 1.1);
  mapCtx.closePath();
  mapCtx.fill();

  // Obelisk for capital
  if (isCapital) {
    mapCtx.fillStyle = style.accent;
    mapCtx.fillRect(x + w * 0.6, y - h * 0.8, 3, h * 0.6);
    mapCtx.beginPath();
    mapCtx.moveTo(x + w * 0.6 + 1.5, y - h * 0.9);
    mapCtx.lineTo(x + w * 0.6 + 4, y - h * 0.8);
    mapCtx.lineTo(x + w * 0.6 - 1, y - h * 0.8);
    mapCtx.closePath();
    mapCtx.fill();
  }
}

// Islamic building (Sultan)
function drawIslamicBuilding(x, y, w, h, style, isCapital) {
  // Base building
  mapCtx.fillStyle = style.buildingColor;
  mapCtx.fillRect(x - w, y - h * 0.7, w * 2, h * 0.7);

  // Dome
  mapCtx.fillStyle = style.roofColor;
  mapCtx.beginPath();
  mapCtx.arc(x, y - h * 0.7, w * 0.8, Math.PI, 0, false);
  mapCtx.closePath();
  mapCtx.fill();

  // Dome highlight
  mapCtx.fillStyle = shadeColor(style.roofColor, 20);
  mapCtx.beginPath();
  mapCtx.arc(x - w * 0.2, y - h * 0.9, w * 0.25, Math.PI, 0, false);
  mapCtx.closePath();
  mapCtx.fill();

  // Crescent on top
  mapCtx.fillStyle = style.accent;
  mapCtx.beginPath();
  mapCtx.arc(x, y - h * 1.2, 4, 0, Math.PI * 2);
  mapCtx.fill();

  // Minarets for capital
  if (isCapital) {
    mapCtx.fillStyle = style.buildingColor;
    mapCtx.fillRect(x - w * 1.2, y - h * 1.1, 4, h * 1.1);
    mapCtx.fillRect(x + w * 1.2 - 4, y - h * 1.1, 4, h * 1.1);
    mapCtx.fillStyle = style.roofColor;
    mapCtx.beginPath();
    mapCtx.arc(x - w * 1.2 + 2, y - h * 1.1, 4, 0, Math.PI * 2);
    mapCtx.arc(x + w * 1.2 - 2, y - h * 1.1, 4, 0, Math.PI * 2);
    mapCtx.fill();
  }
}

// Nomad building (Hun)
function drawNomadBuilding(x, y, w, h, style, isCapital) {
  // Yurt/tent shape
  mapCtx.fillStyle = style.buildingColor;
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - h * 1.1);
  mapCtx.quadraticCurveTo(x + w * 1.2, y - h * 0.5, x + w, y);
  mapCtx.lineTo(x - w, y);
  mapCtx.quadraticCurveTo(x - w * 1.2, y - h * 0.5, x, y - h * 1.1);
  mapCtx.closePath();
  mapCtx.fill();

  // Dark side
  mapCtx.fillStyle = shadeColor(style.buildingColor, -25);
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - h * 1.1);
  mapCtx.quadraticCurveTo(x + w * 1.2, y - h * 0.5, x + w, y);
  mapCtx.lineTo(x, y);
  mapCtx.closePath();
  mapCtx.fill();

  // Roof ring
  mapCtx.fillStyle = style.roofColor;
  mapCtx.beginPath();
  mapCtx.ellipse(x, y - h * 1.1, w * 0.3, w * 0.15, 0, 0, Math.PI * 2);
  mapCtx.fill();

  // Smoke hole
  mapCtx.fillStyle = '#333';
  mapCtx.beginPath();
  mapCtx.ellipse(x, y - h * 1.1, w * 0.15, w * 0.08, 0, 0, Math.PI * 2);
  mapCtx.fill();

  // War banner for capital
  if (isCapital) {
    mapCtx.fillStyle = style.accent;
    mapCtx.fillRect(x + w * 0.8, y - h * 1.3, 2, h * 0.8);
    // Skull/horse tail decoration
    mapCtx.beginPath();
    mapCtx.arc(x + w * 0.8 + 1, y - h * 1.35, 4, 0, Math.PI * 2);
    mapCtx.fill();
  }
}

// Celtic building (Gaul)
function drawCelticBuilding(x, y, w, h, style, isCapital) {
  // Wooden hall base
  mapCtx.fillStyle = style.buildingColor;
  mapCtx.fillRect(x - w, y - h * 0.6, w * 2, h * 0.6);

  // Log texture
  mapCtx.strokeStyle = shadeColor(style.buildingColor, -30);
  mapCtx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    mapCtx.beginPath();
    mapCtx.moveTo(x - w, y - h * 0.1 - i * h * 0.15);
    mapCtx.lineTo(x + w, y - h * 0.1 - i * h * 0.15);
    mapCtx.stroke();
  }

  // Thatched roof
  mapCtx.fillStyle = style.roofColor;
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - h * 1.2);
  mapCtx.lineTo(x + w * 1.3, y - h * 0.6);
  mapCtx.lineTo(x - w * 1.3, y - h * 0.6);
  mapCtx.closePath();
  mapCtx.fill();

  // Roof texture
  mapCtx.strokeStyle = shadeColor(style.roofColor, -20);
  for (let i = 0; i < 3; i++) {
    mapCtx.beginPath();
    mapCtx.moveTo(x, y - h * 1.2 + i * h * 0.15);
    mapCtx.lineTo(x + w * (1.3 - i * 0.15), y - h * 0.6);
    mapCtx.stroke();
    mapCtx.beginPath();
    mapCtx.moveTo(x, y - h * 1.2 + i * h * 0.15);
    mapCtx.lineTo(x - w * (1.3 - i * 0.15), y - h * 0.6);
    mapCtx.stroke();
  }

  // Druid stone for capital
  if (isCapital) {
    mapCtx.fillStyle = '#666';
    mapCtx.fillRect(x + w * 0.9, y - h * 0.3, 6, h * 0.3);
    mapCtx.fillStyle = style.accent;
    mapCtx.beginPath();
    mapCtx.arc(x + w * 0.9 + 3, y - h * 0.35, 4, 0, Math.PI * 2);
    mapCtx.fill();
  }
}

// Small side building
function drawSmallBuilding(x, y, size, style) {
  mapCtx.fillStyle = shadeColor(style.buildingColor, -10);
  mapCtx.fillRect(x - size, y - size * 1.5, size * 2, size * 1.5);
  mapCtx.fillStyle = style.roofColor;
  mapCtx.beginPath();
  mapCtx.moveTo(x, y - size * 2.2);
  mapCtx.lineTo(x + size * 1.2, y - size * 1.5);
  mapCtx.lineTo(x - size * 1.2, y - size * 1.5);
  mapCtx.closePath();
  mapCtx.fill();
}

// Draw isometric resource node
function drawIsoResource(x, y, tw, th, tile) {
  const resType = tile.resourceType?.toLowerCase() || 'wood';
  const size = Math.min(tw, th * 2) * 0.5;
  const imgSize = Math.max(tw, th * 2);

  // Try to draw from individual image first
  if (drawTileImage(mapCtx, 'resources', resType, x, y, imgSize, imgSize)) {
    // Draw resource level indicator
    if (tile.amount && mapZoomLevel > 0.6) {
      mapCtx.font = 'bold 9px Arial';
      mapCtx.textAlign = 'center';
      mapCtx.fillStyle = '#fff';
      mapCtx.shadowColor = '#000';
      mapCtx.shadowBlur = 2;
      mapCtx.fillText(`${Math.round(tile.amount / 1000)}k`, x, y + size * 0.5);
      mapCtx.shadowBlur = 0;
    }
    return;
  }

  // Try tileset mapping
  const tilesetMapping = {
    'wood': 'FOREST_ROCKS',
    'stone': 'DIRT_ROCKS',
    'iron': 'DESERT_MINE',
    'food': 'GRASS_TREES',
    'gold': 'DESERT_ROCKS'
  };

  if (drawTileFromTileset(mapCtx, tilesetMapping[resType], x - imgSize/2, y - imgSize, imgSize, imgSize)) {
    return;
  }

  // Fallback to procedural rendering
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
  const imgSize = Math.max(tw, th * 2) * 0.8;

  // Try to draw unit image based on army composition
  const mainUnitType = army.mainUnit?.toLowerCase() || 'hoplite';
  if (drawTileImage(mapCtx, 'units', mainUnitType, x, y, imgSize, imgSize)) {
    // Draw army name label
    if (mapZoomLevel > 0.8 && army.name) {
      mapCtx.font = 'bold 9px Arial';
      mapCtx.textAlign = 'center';
      mapCtx.fillStyle = '#fff';
      mapCtx.shadowColor = '#000';
      mapCtx.shadowBlur = 2;
      mapCtx.fillText(army.name, x, y + size * 0.5);
      mapCtx.shadowBlur = 0;
    }
    // Movement indicator
    if (isMoving) {
      mapCtx.fillStyle = '#ffaa00';
      mapCtx.beginPath();
      mapCtx.arc(x + imgSize * 0.3, y - imgSize * 0.4, 5, 0, Math.PI * 2);
      mapCtx.fill();
    }
    return;
  }

  // Fallback to procedural rendering
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

  // Movement line if moving - use worldToScreen stored globally
  if (isMoving && army.targetX !== undefined && army.targetY !== undefined && window.mapWorldToScreen) {
    const targetScreenPos = window.mapWorldToScreen(army.targetX, army.targetY);
    mapCtx.strokeStyle = 'rgba(255,170,0,0.5)';
    mapCtx.lineWidth = 2;
    mapCtx.setLineDash([5, 5]);
    mapCtx.beginPath();
    mapCtx.moveTo(x, y);
    mapCtx.lineTo(targetScreenPos.x, targetScreenPos.y);
    mapCtx.stroke();
    mapCtx.setLineDash([]);
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

function renderMinimap() {
  if (!minimapCtx) return;
  
  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  const scale = w / WORLD_SIZE;
  
  // Clear
  minimapCtx.fillStyle = '#1a2a1a';
  minimapCtx.fillRect(0, 0, w, h);
  
  // Draw objects (world coords are centered: -187 to +186)
  const centerX = w / 2;
  const centerY = h / 2;
  mapData.forEach(tile => {
    const x = centerX + tile.x * scale;
    const y = centerY + tile.y * scale;

    if (tile.type === 'CITY') {
      minimapCtx.fillStyle = tile.playerId === player?.id ? '#ffd700' : '#c44';
      minimapCtx.fillRect(x - 2, y - 2, 4, 4);
    } else if (tile.type === 'RESOURCE') {
      minimapCtx.fillStyle = '#4a8';
      minimapCtx.fillRect(x - 1, y - 1, 2, 2);
    }
  });

  // Draw viewport rectangle directly on canvas
  if (mapCanvas) {
    const tileW = ISO_TILE_WIDTH * mapZoomLevel;
    const tileH = ISO_TILE_HEIGHT * mapZoomLevel;
    // Estimate visible tiles in each direction
    const visTilesX = mapCanvas.width / tileW;
    const visTilesY = mapCanvas.height / tileH;
    // Convert to minimap pixels
    const vpW = visTilesX * scale;
    const vpH = visTilesY * scale;
    const vpX = centerX + mapOffsetX * scale - vpW / 2;
    const vpY = centerY + mapOffsetY * scale - vpH / 2;

    minimapCtx.strokeStyle = '#ffd700';
    minimapCtx.lineWidth = 2;
    minimapCtx.strokeRect(vpX, vpY, vpW, vpH);
  }
}

// ========== MINIMAP CLICK/DRAG HANDLERS ==========
let minimapDragging = false;

function onMinimapClick(e) {
  e.stopPropagation(); // Prevent click from reaching the main canvas
  navigateMinimapToPosition(e);
}

function onMinimapMouseDown(e) {
  e.stopPropagation();
  minimapDragging = true;
  navigateMinimapToPosition(e);
}

function onMinimapMouseMove(e) {
  if (!minimapDragging) return;
  e.stopPropagation();
  navigateMinimapToPosition(e);
}

function onMinimapMouseUp(e) {
  minimapDragging = false;
}

function navigateMinimapToPosition(e) {
  if (!minimapCanvas) return;

  const rect = minimapCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Convert minimap coordinates to world coordinates
  // Minimap center (75, 75 for 150x150) = world center (0, 0)
  const minimapCenterX = minimapCanvas.width / 2;
  const minimapCenterY = minimapCanvas.height / 2;
  const scale = minimapCanvas.width / WORLD_SIZE;

  // Calculate world position from minimap click
  const worldX = (mouseX - minimapCenterX) / scale;
  const worldY = (mouseY - minimapCenterY) / scale;

  // Update map offset to center on clicked position (clamped to world bounds)
  mapOffsetX = Math.max(MIN_COORD, Math.min(MAX_COORD, worldX));
  mapOffsetY = Math.max(MIN_COORD, Math.min(MAX_COORD, worldY));

  // Re-render
  loadMap(); // Reload map data for new viewport
}

function updateMapUI() {
  const mapXEl = document.getElementById('map-x');
  const mapYEl = document.getElementById('map-y');
  if (mapXEl) mapXEl.textContent = Math.round(mapOffsetX);
  if (mapYEl) mapYEl.textContent = Math.round(mapOffsetY);

  const zoomEl = document.getElementById('zoom-level');
  if (zoomEl) {
    zoomEl.textContent = `${Math.round(mapZoomLevel * 100)}%`;
    // Animation pulse
    zoomEl.classList.add('zooming');
    setTimeout(() => zoomEl.classList.remove('zooming'), 200);
  }
}

// Mouse handlers
let mapDragDistance = 0; // Track total drag distance to distinguish click vs drag

function onMapMouseDown(e) {
  mapDragging = true;
  mapDragDistance = 0; // Reset drag distance
  mapDragStart = { x: e.clientX, y: e.clientY };
  mapCanvas.style.cursor = 'grabbing';
}

// Use requestAnimationFrame to batch map renders
let mapRenderScheduled = false;
function scheduleMapRender(includeMinimapAndUI = false) {
  if (!mapRenderScheduled) {
    mapRenderScheduled = true;
    requestAnimationFrame(() => {
      renderMap();
      if (includeMinimapAndUI) {
        renderMinimap();
        updateMapUI();
      }
      mapRenderScheduled = false;
    });
  }
}

function onMapMouseMove(e) {
  const rect = mapCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Use isometric tile dimensions
  const tileW = ISO_TILE_WIDTH * mapZoomLevel;
  const tileH = ISO_TILE_HEIGHT * mapZoomLevel;

  if (mapDragging) {
    // Track drag distance for click vs drag detection
    const pixelDx = e.clientX - mapDragStart.x;
    const pixelDy = e.clientY - mapDragStart.y;
    mapDragDistance += Math.abs(pixelDx) + Math.abs(pixelDy);

    // Convert pixel drag to isometric world offset
    mapOffsetX -= (pixelDx / tileW + pixelDy / tileH);
    mapOffsetY -= (pixelDy / tileH - pixelDx / tileW);

    // Clamp to world bounds
    mapOffsetX = Math.max(MIN_COORD, Math.min(MAX_COORD, mapOffsetX));
    mapOffsetY = Math.max(MIN_COORD, Math.min(MAX_COORD, mapOffsetY));

    mapDragStart = { x: e.clientX, y: e.clientY };
    scheduleMapRender(true);
  } else {
    // Update hovered tile using isometric conversion
    const centerX = mapCanvas.width / 2;
    const centerY = mapCanvas.height / 2;
    const dx = mouseX - centerX;
    const dy = mouseY - centerY;
    const tileX = Math.floor(mapOffsetX + (dx / tileW + dy / tileH));
    const tileY = Math.floor(mapOffsetY + (dy / tileH - dx / tileW));

    mapHoveredTile = { x: tileX, y: tileY };
    scheduleMapRender(false);
  }
}

let mapReloadTimeout = null;
function onMapMouseUp() {
  const wasDragging = mapDragging;
  mapDragging = false;
  if (mapCanvas) mapCanvas.style.cursor = 'grab';
  // Reload map data after drag ends (debounced)
  if (wasDragging && mapDragDistance > 5) {
    clearTimeout(mapReloadTimeout);
    mapReloadTimeout = setTimeout(() => loadMap(), 300);
  }
}

function onMapClick(e) {
  // Prevent click if user dragged the map (threshold: 5 pixels)
  const wasDrag = mapDragDistance > 5;
  mapDragDistance = 0; // Always reset after click evaluation
  if (wasDrag) return;

  const rect = mapCanvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Use isometric coordinate conversion
  const tileW = ISO_TILE_WIDTH * mapZoomLevel;
  const tileH = ISO_TILE_HEIGHT * mapZoomLevel;
  const centerX = mapCanvas.width / 2;
  const centerY = mapCanvas.height / 2;

  // Screen to isometric world coordinates
  const dx = mouseX - centerX;
  const dy = mouseY - centerY;
  const tileX = Math.floor(mapOffsetX + (dx / tileW + dy / tileH));
  const tileY = Math.floor(mapOffsetY + (dy / tileH - dx / tileW));

  // Find what's at this tile
  const tile = mapData.find(t => t.x === tileX && t.y === tileY);

  mapSelectedTile = { x: tileX, y: tileY };
  showMapInfoPanel(tileX, tileY, tile);
  renderMap();
}

// Touch handlers for mobile
let touchStartDist = 0;
let touchStartZoom = 1;
let touchDragDistance = 0;
let touchStartPos = null;

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
    mapDragDistance = 0;
    touchDragDistance = 0;
    touchStartPos = { x: e.touches[0].clientX, y: e.touches[0].clientY };
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

    mapZoomLevel = Math.max(0.15, Math.min(3, touchStartZoom * (dist / touchStartDist)));
    renderMap();
    renderMinimap();
    updateMapUI();
  } else if (e.touches.length === 1 && mapDragging) {
    // Use isometric tile dimensions
    const tileW = ISO_TILE_WIDTH * mapZoomLevel;
    const tileH = ISO_TILE_HEIGHT * mapZoomLevel;
    const pixelDx = e.touches[0].clientX - mapDragStart.x;
    const pixelDy = e.touches[0].clientY - mapDragStart.y;
    touchDragDistance += Math.abs(pixelDx) + Math.abs(pixelDy);
    mapDragDistance = touchDragDistance;

    // Convert pixel drag to isometric world offset
    mapOffsetX -= (pixelDx / tileW + pixelDy / tileH);
    mapOffsetY -= (pixelDy / tileH - pixelDx / tileW);

    // Clamp to world bounds
    mapOffsetX = Math.max(MIN_COORD, Math.min(MAX_COORD, mapOffsetX));
    mapOffsetY = Math.max(MIN_COORD, Math.min(MAX_COORD, mapOffsetY));

    mapDragStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    renderMap();
    renderMinimap();
    updateMapUI();
  }
}

function onMapTouchEnd(e) {
  mapDragging = false;

  // Simulate click/tap if no significant drag
  if (touchDragDistance < 10 && touchStartPos) {
    const rect = mapCanvas.getBoundingClientRect();
    const mouseX = touchStartPos.x - rect.left;
    const mouseY = touchStartPos.y - rect.top;

    const tileW = ISO_TILE_WIDTH * mapZoomLevel;
    const tileH = ISO_TILE_HEIGHT * mapZoomLevel;
    const centerX = mapCanvas.width / 2;
    const centerY = mapCanvas.height / 2;

    const dx = mouseX - centerX;
    const dy = mouseY - centerY;
    const tileX = Math.floor(mapOffsetX + (dx / tileW + dy / tileH));
    const tileY = Math.floor(mapOffsetY + (dy / tileH - dx / tileW));

    const tile = mapData.find(t => t.x === tileX && t.y === tileY);
    mapSelectedTile = { x: tileX, y: tileY };
    showMapInfoPanel(tileX, tileY, tile);
    renderMap();
  }

  // Reload map data after significant touch drag (debounced)
  if (touchDragDistance >= 10) {
    clearTimeout(mapReloadTimeout);
    mapReloadTimeout = setTimeout(() => loadMap(), 300);
  }

  touchDragDistance = 0;
  touchStartPos = null;
}

// Wheel zoom
function onMapWheel(e) {
  e.preventDefault();
  
  const canvas = mapCanvas;
  const rect = canvas.getBoundingClientRect();

  // Position du curseur sur le canvas
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  // Dimensions de tuile isométrique avant zoom
  const tileW = ISO_TILE_WIDTH * mapZoomLevel;
  const tileH = ISO_TILE_HEIGHT * mapZoomLevel;
  const centerX = canvas.width / 2;
  const centerY = canvas.height / 2;
  const dx = mouseX - centerX;
  const dy = mouseY - centerY;

  // Position du monde sous le curseur avant zoom (conversion isométrique)
  const worldXBefore = mapOffsetX + (dx / tileW + dy / tileH);
  const worldYBefore = mapOffsetY + (dy / tileH - dx / tileW);

  // Appliquer le zoom (plus fluide)
  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  mapZoomLevel = Math.max(0.15, Math.min(3, mapZoomLevel * zoomFactor));

  // Dimensions de tuile isométrique après zoom
  const newTileW = ISO_TILE_WIDTH * mapZoomLevel;
  const newTileH = ISO_TILE_HEIGHT * mapZoomLevel;

  // Recalculer pour garder le point sous le curseur fixe
  const worldXAfter = mapOffsetX + (dx / newTileW + dy / newTileH);
  const worldYAfter = mapOffsetY + (dy / newTileH - dx / newTileW);

  // Ajuster l'offset pour compenser
  mapOffsetX += (worldXBefore - worldXAfter);
  mapOffsetY += (worldYBefore - worldYAfter);
  
  // Limiter aux bornes du monde
  mapOffsetX = Math.max(MIN_COORD, Math.min(MAX_COORD, mapOffsetX));
  mapOffsetY = Math.max(MIN_COORD, Math.min(MAX_COORD, mapOffsetY));
  
  renderMap();
  renderMinimap();
  updateMapUI();
}

// Zoom buttons
function mapZoom(delta) {
  const zoomFactor = delta > 0 ? 1.2 : 0.8;
  mapZoomLevel = Math.max(0.15, Math.min(3, mapZoomLevel * zoomFactor));
  // Debounced reload to get data for new zoom level
  clearTimeout(mapReloadTimeout);
  mapReloadTimeout = setTimeout(() => loadMap(), 400);
  renderMap();
  renderMinimap();
  updateMapUI();
}

function centerOnCapital() {
  const capital = cities.find(c => c.isCapital);
  if (capital) {
    mapOffsetX = capital.x;
    mapOffsetY = capital.y;
  } else if (currentCity) {
    mapOffsetX = currentCity.x;
    mapOffsetY = currentCity.y;
  } else {
    mapOffsetX = 0;
    mapOffsetY = 0;
  }
  loadMap();
}

// Go to specific coordinates on map
function gotoCoords() {
  const xInput = document.getElementById('goto-x');
  const yInput = document.getElementById('goto-y');
  const x = parseInt(xInput?.value);
  const y = parseInt(yInput?.value);

  if (!isNaN(x) && !isNaN(y)) {
    mapOffsetX = Math.max(MIN_COORD, Math.min(MAX_COORD, x));
    mapOffsetY = Math.max(MIN_COORD, Math.min(MAX_COORD, y));
    loadMap(); // Reload map data for new viewport
    showToast(`Position: (${mapOffsetX}, ${mapOffsetY})`, 'info');
  } else {
    showToast('Coordonnées invalides', 'error');
  }
}

function showMapInfoPanel(x, y, tile) {
  const panel = document.getElementById('map-info-panel');
  const content = document.getElementById('map-panel-content');
  if (!panel || !content) return;

  if (!tile) {
    content.innerHTML = `
      <h3>Terrain vide</h3>
      <p>Position: (${x}, ${y})</p>
      <p style="color:#888">Aucun objet à cet emplacement</p>
    `;
    panel.style.display = 'flex';
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
      panel.style.display = 'flex';
    } else {
      // Other player's city - check diplomacy first
      showMapInfoPanelWithDiplomacy(x, y, tile, hasArmy, panel, content);
      return; // async
    }
  } else if (tile.type === 'RESOURCE') {
    const resourceIcons = {
      'WOOD': '🌲 Forêt',
      'STONE': '⛰️ Carrière',
      'IRON': '⚒️ Mine de fer',
      'FOOD': '🌾 Oasis',
      'GOLD': '💰 Mine d\'or'
    };
    const resourceName = resourceIcons[tile.resourceType] || '📦 Ressource';
    const hasArmy = armies.some(a => a.status === 'IDLE' && a.units?.length > 0);

    // Check if tribe is defeated (respawning)
    const isDefeated = tile.lastDefeat && !tile.hasDefenders;
    const respawnTime = tile.lastDefeat ? new Date(new Date(tile.lastDefeat).getTime() + tile.respawnMinutes * 60000) : null;
    const canRaid = respawnTime ? new Date() > respawnTime : true;

    // Build defenders display
    let defendersHtml = '';
    if (tile.hasDefenders && tile.defenderUnits && Object.keys(tile.defenderUnits).length > 0) {
      const unitNames = {
        warrior: '⚔️ Guerriers',
        archer: '🏹 Archers',
        cavalry: '🐎 Cavalerie',
        elite: '👑 Élite'
      };
      defendersHtml = `
        <div style="margin: 8px 0; padding: 8px; background: rgba(139,69,19,0.3); border-radius: 4px; border-left: 3px solid #c44;">
          <p style="margin: 0 0 5px 0; color: #f44;"><strong>🛡️ Tribu locale</strong></p>
          <p style="margin: 2px 0; font-size: 12px;">Puissance: <strong style="color:#ff6b6b">${tile.defenderPower}</strong></p>
          ${Object.entries(tile.defenderUnits).map(([unit, count]) =>
            `<p style="margin: 2px 0; font-size: 11px; color: #ccc;">${unitNames[unit] || unit}: ${count}</p>`
          ).join('')}
        </div>
      `;
    } else if (isDefeated && !canRaid) {
      const timeLeft = Math.max(0, Math.ceil((respawnTime - new Date()) / 60000));
      defendersHtml = `
        <div style="margin: 8px 0; padding: 8px; background: rgba(76,175,80,0.2); border-radius: 4px; border-left: 3px solid #4caf50;">
          <p style="margin: 0; color: #4caf50;">✅ Tribu vaincue</p>
          <p style="margin: 2px 0; font-size: 11px; color: #888;">Respawn dans ${timeLeft} min</p>
        </div>
      `;
    }

    content.innerHTML = `
      <h3>${resourceName}</h3>
      <p>Position: (${x}, ${y})</p>
      <p>Niveau: <strong style="color:#ffd700">★${'★'.repeat(tile.level - 1)}${'☆'.repeat(3 - tile.level)}</strong> (${tile.level}/3)</p>
      <p>Ressources: <strong>${formatNum(tile.amount)}</strong> / ${formatNum(tile.maxAmount)}</p>
      <p>Biome: ${tile.biome === 'forest' ? '🌳 Forêt' : tile.biome === 'desert' ? '🏜️ Désert' : '❄️ Neige'}</p>
      ${defendersHtml}
      <div class="panel-actions player-actions">
        ${tile.hasDefenders ? `
          <button class="btn btn-danger" onclick="raidResource('${tile.id}', ${x}, ${y})" ${!hasArmy ? 'disabled title="Aucune armée disponible"' : ''}>⚔️ Attaquer tribu</button>
        ` : `
          <button class="btn btn-success" onclick="collectResource('${tile.id}', ${x}, ${y})" ${!hasArmy ? 'disabled title="Aucune armée disponible"' : ''}>📦 Collecter</button>
        `}
        <button class="btn btn-secondary" onclick="sendArmyTo(${x}, ${y})" ${!hasArmy ? 'disabled' : ''}>🚶 Envoyer armée</button>
      </div>
    `;
    panel.style.display = 'flex';
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
  panel.style.display = 'flex';
}

// View player profile
async function viewPlayerProfile(playerId) {
  let res;
  try {
    res = await fetch(`${API}/api/player/${playerId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
  } catch (e) {
    console.error('viewPlayerProfile error:', e);
    showToast('Erreur réseau', 'error');
    return;
  }

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
  try {
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
  } catch (e) {
    console.error('confirmSpyFromMap error:', e);
    closeModal();
    showToast('Erreur réseau', 'error');
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
  const wood = parseInt(document.getElementById('send-wood')?.value) || 0;
  const stone = parseInt(document.getElementById('send-stone')?.value) || 0;
  const iron = parseInt(document.getElementById('send-iron')?.value) || 0;
  const food = parseInt(document.getElementById('send-food')?.value) || 0;

  if (wood + stone + iron + food === 0) {
    showToast('Sélectionnez des ressources à envoyer', 'error');
    return;
  }

  try {
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
      await loadCities();
      loadMap();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    console.error('confirmSendResources error:', e);
    closeModal();
    showToast('Erreur réseau', 'error');
  }
}

function closeMapPanel() {
  const panel = document.getElementById('map-info-panel');
  if (panel) panel.style.display = 'none';
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
  try {
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
  } catch (e) {
    console.error('confirmAttackFromMap error:', e);
    closeModal();
    showToast('Erreur réseau', 'error');
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
  try {
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
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    console.error('confirmRaidFromMap error:', e);
    closeModal();
    showToast('Erreur réseau', 'error');
  }
}

// ========== RESOURCE NODE RAID (TRIBE COMBAT) ==========
function raidResource(nodeId, x, y) {
  const availableArmies = armies.filter(a => a.status === 'IDLE' && a.units?.length > 0);
  if (availableArmies.length === 0) {
    showToast('Aucune armée disponible', 'error');
    return;
  }

  // Find the resource tile to show defender info
  const tile = mapData.find(t => t.id === nodeId);
  const defenderInfo = tile && tile.defenderUnits ? Object.entries(tile.defenderUnits)
    .map(([unit, count]) => `${unit}: ${count}`).join(', ') : 'Inconnu';

  // Build army selection
  const armyOptions = availableArmies.map(a => {
    const totalUnits = a.units?.reduce((sum, u) => sum + u.quantity, 0) || 0;
    return `<option value="${a.id}">${a.name} (${totalUnits} unités)</option>`;
  }).join('');

  document.getElementById('modal-body').innerHTML = `
    <h3>⚔️ Attaquer la tribu locale</h3>
    <div style="background:rgba(244,67,54,0.1); padding:10px; border-radius:8px; margin:10px 0; border-left:3px solid #f44;">
      <p style="margin:0;"><strong>🛡️ Défenseurs:</strong> ${defenderInfo}</p>
      <p style="margin:5px 0 0 0; color:#f44;"><strong>Puissance:</strong> ${tile?.defenderPower || '?'}</p>
    </div>
    <p>Position: (${x}, ${y})</p>
    <label style="display:block; margin:10px 0 5px;">Sélectionner une armée:</label>
    <select id="raid-army-select" style="width:100%; padding:8px; margin-bottom:15px; background:#2a2418; color:#f5e6c8; border:1px solid #8b6914; border-radius:4px;">
      ${armyOptions}
    </select>
    <div style="display:flex; gap:10px;">
      <button onclick="confirmRaidResource('${nodeId}')" class="btn btn-danger" style="flex:1;">⚔️ Attaquer!</button>
      <button onclick="closeModal()" class="btn btn-secondary" style="flex:1;">Annuler</button>
    </div>
  `;
  document.getElementById('modal').style.display = 'flex';
}

async function confirmRaidResource(nodeId) {
  const armyId = document.getElementById('raid-army-select').value;
  if (!armyId) {
    showToast('Sélectionnez une armée', 'error');
    return;
  }

  const res = await fetch(`${API}/api/army/${armyId}/raid-resource`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ resourceNodeId: nodeId })
  });

  closeModal();
  closeMapPanel();

  if (res.ok) {
    const data = await res.json();
    if (data.combatResult) {
      showRaidResourceResult(data);
    } else {
      showToast('Armée en route vers la ressource', 'success');
    }
    await loadArmies();
    loadMap();
  } else {
    const data = await res.json();
    showToast(data.error || 'Erreur lors du raid', 'error');
  }
}

function showRaidResourceResult(data) {
  const result = data.combatResult;
  const won = result.winner === 'attacker';

  document.getElementById('modal-body').innerHTML = `
    <h3>${won ? '🎉 Victoire!' : '💀 Défaite!'}</h3>
    <div style="background:${won ? 'rgba(76,175,80,0.2)' : 'rgba(244,67,54,0.2)'}; padding:15px; border-radius:8px; margin:10px 0;">
      <p><strong>Résultat:</strong> ${won ? 'Tribu vaincue!' : 'Votre armée a été repoussée'}</p>
      <p><strong>Vos pertes:</strong> ${result.attackerLosses || 0} unités</p>
      <p><strong>Pertes ennemies:</strong> ${result.defenderLosses || 0} unités</p>
      ${won && data.loot ? `
        <div style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.2);">
          <p><strong>💰 Butin récupéré:</strong></p>
          ${Object.entries(data.loot).map(([res, amount]) =>
            `<p style="margin:2px 0; font-size:12px;">${res}: +${formatNum(amount)}</p>`
          ).join('')}
        </div>
      ` : ''}
    </div>
    <button onclick="closeModal()" class="btn btn-primary" style="width:100%;">Fermer</button>
  `;
  document.getElementById('modal').style.display = 'flex';
}

function collectResource(nodeId, x, y) {
  const availableArmies = armies.filter(a => a.status === 'IDLE' && a.units?.length > 0);
  if (availableArmies.length === 0) {
    showToast('Aucune armée disponible', 'error');
    return;
  }

  const tile = mapData.find(t => t.id === nodeId);
  const armyOptions = availableArmies.map(a => {
    const totalUnits = a.units?.reduce((sum, u) => sum + u.quantity, 0) || 0;
    const carryCapacity = totalUnits * 50; // Assume 50 carry per unit
    return `<option value="${a.id}">${a.name} (capacité: ${formatNum(carryCapacity)})</option>`;
  }).join('');

  document.getElementById('modal-body').innerHTML = `
    <h3>⛏️ Récolter des ressources</h3>
    <div style="background:rgba(76,175,80,0.2); padding:10px; border-radius:8px; margin:10px 0; border-left:3px solid #4caf50;">
      <p style="margin:0;"><strong>${tile?.resourceType || 'Ressource'}:</strong> ${formatNum(tile?.amount || 0)} disponibles</p>
    </div>
    <div style="background:rgba(255,215,0,0.1); padding:10px; border-radius:8px; margin:10px 0; border-left:3px solid #ffd700;">
      <p style="margin:0; font-size:12px; color:#c9a227;">
        ⏱️ <strong>Récolte progressive:</strong> L'armée restera sur place et récoltera <strong>100 ressources/minute</strong> jusqu'à capacité max ou ressource épuisée.
      </p>
    </div>
    <p>Position: (${x}, ${y})</p>
    <label style="display:block; margin:10px 0 5px;">Sélectionner une armée:</label>
    <select id="collect-army-select" style="width:100%; padding:8px; margin-bottom:15px; background:#2a2418; color:#f5e6c8; border:1px solid #8b6914; border-radius:4px;">
      ${armyOptions}
    </select>
    <div style="display:flex; gap:10px;">
      <button onclick="confirmCollectResource('${nodeId}')" class="btn btn-success" style="flex:1;">⛏️ Démarrer la récolte</button>
      <button onclick="closeModal()" class="btn btn-secondary" style="flex:1;">Annuler</button>
    </div>
  `;
  document.getElementById('modal').style.display = 'flex';
}

async function confirmCollectResource(nodeId) {
  const armyId = document.getElementById('collect-army-select').value;
  if (!armyId) {
    showToast('Sélectionnez une armée', 'error');
    return;
  }

  const res = await fetch(`${API}/api/army/${armyId}/collect-resource`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ resourceNodeId: nodeId })
  });

  closeModal();
  closeMapPanel();

  if (res.ok) {
    const data = await res.json();
    if (data.status === 'HARVESTING') {
      // Récolte progressive
      showToast(`⛏️ Récolte démarrée! ${data.harvestRate}/min - Capacité: ${formatNum(data.carryCapacity)}`, 'success');
    } else if (data.travelTime) {
      // Armée en route
      showToast(`Armée en route pour récolter (${Math.round(data.travelTime)}s)`, 'success');
    } else {
      // Ancien système (fallback)
      showToast(`Collecté ${formatNum(data.collected || 0)} ${data.resourceType}!`, 'success');
    }
    await loadArmies();
    loadMap();
  } else {
    const data = await res.json();
    showToast(data.error || 'Erreur lors de la collecte', 'error');
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

// Resize handler (debounced)
let mapResizeTimeout;
window.addEventListener('resize', () => {
  clearTimeout(mapResizeTimeout);
  mapResizeTimeout = setTimeout(() => {
    // Resize map canvas
    const mapTab = document.getElementById('tab-map');
    if (mapCanvas && mapTab && mapTab.classList.contains('active')) {
      const container = mapCanvas.parentElement;
      if (container && container.clientWidth > 0) {
        mapCanvas.width = Math.max(container.clientWidth, 300);
        mapCanvas.height = Math.max(container.clientHeight, 200);
      }
      renderMap();
      renderMinimap();
    }
    // Resize city/fields canvas
    if (cityCanvas) {
      const container = cityCanvas.parentElement;
      if (container && container.clientWidth > 0) {
        cityCanvas.width = Math.max(container.clientWidth, 300);
        cityCanvas.height = Math.max(container.clientHeight, 200);
      }
      calculateCitySlots();
      if (currentCityView === 'fields') calculateFieldSlots();
      renderCityCanvas();
    }
  }, 150);
});

