// ========== MAP - Rise of Kingdoms Style Canvas ==========
let mapCanvas, mapCtx, minimapCanvas, minimapCtx;
let mapViewW = 0, mapViewH = 0;   // CSS size of the map canvas (the backing store is scaled by the device pixel ratio)
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

// ========== MAP SPRITES (WebP rendus en 3D par tools/build-3d.cjs) ==========
// assets/images/3d/map/manifest.json liste les sprites disponibles ; sans manifest ou sans image,
// le rendu procédural (formes géométriques) prend le relais sprite par sprite.
let tilesetLoaded = false;       // manifest lu et images chargées
let tilesetLoadFailed = false;   // manifest absent : ne jamais retenter
let mapSpriteAnchor = { x: 0.5, y: 0.8 };   // point de l'image posé sur le centre de la tuile

const tileImages = {
  cities: {},      // rome gaul greek egypt hun sultan capital default
  units: {},       // hoplite archer cavalry catapult merchant
  resources: {},   // wood stone iron food gold (+ variantes <nom>_<biome>)
  terrain: {},     // <biome>_<élément> : forest_tree, desert_dunes, snow_icemountain…
  camps: {},       // camps barbares peints : camp1..3[_desert|_snow], ruins[_desert|_snow], foundation[_desert|_snow] (pas de rendu 3D)
  fx: {}           // effets peints de la carte (guide § A7) : fire_0..3 (ville en feu), battle_0..3, campfire_0..3
};
// Sprites de camps attendus (registre tools/repaint/targets.cjs) : chargés seulement quand ils sont peints
const CAMP_SPRITES = [1, 2, 3].flatMap(l => ['', '_desert', '_snow'].map(b => `camp${l}${b}`)).concat(['ruins', 'ruins_desert', 'ruins_snow'], ['foundation', 'foundation_desert', 'foundation_snow']);
// Icône « tribu locale » peinte (guide § S14) quand elle existe, sinon l'icône de défense
function tribeIconHtml() { return typeof paintedSet !== 'undefined' && paintedSet.has('ui/tribe.webp') ? '<img class="ico" src="assets/images/painted/ui/tribe.webp" alt="">' : resIconHtml('defense'); }
const TRIBE_PREFIX = { ROM: 'ROME', GAU: 'GAUL', GRE: 'GREEK', EGY: 'EGYPT', HUN: 'HUN', SUL: 'SULTAN' };
function tribeFactionOfUnits(units) { const k = Object.keys(units || {}).find(x => TRIBE_PREFIX[x.slice(0, 3)]); return k ? TRIBE_PREFIX[k.slice(0, 3)] : null; }

// Single-flight : quel que soit le nombre d'appels concurrents (pan/zoom), un seul chargement réel
let _tilesetAssetsPromise = null;
function loadTilesetAssets() {
  if (!_tilesetAssetsPromise) _tilesetAssetsPromise = _loadTilesetAssetsOnce();
  return _tilesetAssetsPromise;
}

async function _loadTilesetAssetsOnce() {
  if (typeof loadPaintedManifest === 'function') await loadPaintedManifest();   // sprites peints par IA quand ils existent
  let manifest;
  try {
    const res = await fetch('assets/images/3d/map/manifest.json');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    manifest = await res.json();
  } catch (e) {
    tilesetLoadFailed = true;
    console.log('🎨 Pas de sprites de carte (manifest absent), rendu procédural');
    return;
  }
  if (manifest.anchor && typeof manifest.anchor.y === 'number') mapSpriteAnchor = manifest.anchor;
  const ext = manifest.format || 'png';
  const jobs = [];
  // Camps barbares : uniquement les sprites peints présents dans le manifeste des images peintes
  if (typeof paintedSet !== 'undefined' && typeof art === 'function') {
    for (const name of CAMP_SPRITES) {
      if (!paintedSet.has(`map/camps/${name}.webp`)) continue;
      jobs.push(new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { tileImages.camps[name] = img; tileImagePainted.add('camps/' + name); resolve(); };
        img.onerror = () => resolve();
        img.src = art(`map/camps/${name}.webp`);
      }));
    }
  }
  for (const category of Object.keys(tileImages)) {
    if (category === 'camps') continue;
    for (const name of manifest[category] || []) {
      jobs.push(new Promise((resolve) => {
        const img = new Image();
        img.onload = () => { tileImages[category][name] = img; if (typeof paintedSet !== 'undefined' && paintedSet.has(`map/${category}/${name}.webp`)) tileImagePainted.add(category + '/' + name); resolve(); };
        img.onerror = () => resolve();   // image absente : fallback procédural pour ce sprite
        img.src = typeof art === 'function' ? art(`map/${category}/${name}.${ext}`) : `assets/images/3d/map/${category}/${name}.${ext}`;
      }));
    }
  }
  // Sprites de carte peints sans rendu 3D (colonies, cortège de colons, guide § S12) : chargés depuis le manifeste des images peintes
  if (typeof paintedSet !== 'undefined' && typeof art === 'function') {
    for (const p of paintedSet) {
      const m = p.match(/^map\/(cities|units|resources|terrain|fx)\/([\w-]+)\.webp$/);
      if (!m || (manifest[m[1]] || []).includes(m[2])) continue;
      if (m[1] === 'units' && /_(walk|attack|hit)_\d+$/.test(m[2])) continue;   // cycles de marche chargés à la demande (armyWalkBase) ; poses du replay pas encore jouées
      jobs.push(new Promise((resolve) => { const img = new Image(); img.onload = () => { tileImages[m[1]][m[2]] = img; tileImagePainted.add(m[1] + '/' + m[2]); resolve(); }; img.onerror = () => resolve(); img.src = art(p); }));
    }
  }
  await Promise.all(jobs);
  tilesetLoaded = true;
  const loadedCount = Object.values(tileImages).reduce((sum, cat) => sum + Object.keys(cat).length, 0);
  console.log(`🎨 ${loadedCount}/${jobs.length} sprites de carte chargés`);
}

// Dessine un sprite de carte : son ancre (centre du losange au sol) est posée en (destX, destY)
// (image peinte au cadrage de la carte de référence : son losange d'une case est plus petit dans l'image, map-world.js)
const tileImagePainted = new Set();   // "catégorie/nom" chargés depuis painted/
function drawTileImage(ctx, category, name, destX, destY, destW, destH) {
  const img = tileImages[category]?.[name];
  if (!img) return false;
  if (category !== 'fx' && tileImagePainted.has(category + '/' + name)) {
    const k = category === 'units' ? WORLD_ARMY_SCALE : WORLD_SPRITE_SCALE;   // le losange de l'image = une case
    ctx.drawImage(img, destX - destW * k * 0.5, destY - destH * k * WORLD_OBJECT_CENTER_Y, destW * k, destH * k);
    return true;
  }

  ctx.drawImage(img, destX - destW * mapSpriteAnchor.x, destY - destH * mapSpriteAnchor.y, destW, destH);
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
    features: ['ruins', 'oasis', 'dunes', 'rocks', 'mesa'],
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

// Vitesse de marche selon le terrain (gué, forêt) : Terrain.moveCost, la même règle que le serveur

// ========== TERRAIN ==========
// The procedural terrain (biomes, rivers, lakes, ranges, scattered features) lives in js/shared/terrain.js,
// shared with the server so that armies walk the same world the player sees.
const seededRandom = Terrain.seededRandom;
const smoothNoise = Terrain.smoothNoise;
const hillNoise = Terrain.hillNoise;
const getBiome = Terrain.getBiome;
const isOnRiver = Terrain.isOnRiver;
const isOnLake = Terrain.isOnLake;
const isOnMountainRange = Terrain.isOnMountainRange;
const computeTerrainType = Terrain.computeTerrainType;
const getTerrainType = Terrain.getTerrainType;
const multiTileTerrainCache = Terrain._cache;
const terrainSpriteCache = new Map();

let _mapCanvasInitialized = false;
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
  mapViewW = Math.max(width, 300);
  mapViewH = Math.max(height, 200);
  sizeCanvasForDpr(mapCanvas, mapCtx, mapViewW, mapViewH);   // net sur écrans haute densité

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

  // Centrage initial UNE SEULE FOIS, sans loadMap (l'appelant loadMap continue son fetch juste après)
  // Bug fix : centerOnCapital() appelait loadMap() -> initMapCanvas() -> centerOnCapital() en boucle infinie
  if (!_mapCanvasInitialized) {
    _mapCanvasInitialized = true;
    const capital = cities.find(c => c.isCapital) || currentCity;
    if (capital) { mapOffsetX = capital.x; mapOffsetY = capital.y; }
  }
}

// ========== TRAVIAN-STYLE KEYBOARD SHORTCUTS ==========
// Global keyboard shortcuts (works everywhere)
document.addEventListener('keydown', onGlobalKeyDown);

function onGlobalKeyDown(e) {
  // Don't capture if typing in input/textarea
  if (e.isComposing || (e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable]'))) return;
  
  if (e.key === 'Escape') { closeAllPanels(); return; }

  // Don't capture if modal is open
  const modal = document.getElementById('modal');
  if (modal && modal.style.display !== 'none') return;
  // pas d'onglet de jeu avant d'être connecté (ni de carte avant de connaître celle du serveur)
  if (!token || !player || typeof worldSeedKnown === 'undefined' || !worldSeedKnown) return;
  
  // ===== TRAVIAN ACCESS KEYS (1-9) =====
  switch(e.key) {
    case '1': // Champs (Resources)
      e.preventDefault();
      showTab('fields');
      showToast('Vue Champs', 'info');
      break;
    case '2': // Ville (Buildings)
      e.preventDefault();
      showTab('city');
      showToast('Vue Ville', 'info');
      break;
    case '3': // Carte
      e.preventDefault();
      showTab('map');
      showToast('Carte', 'info');
      break;
    case '4': // Statistiques (Classement)
      e.preventDefault();
      showTab('ranking');
      showToast('Classement', 'info');
      break;
    case '5': // Rapports
      e.preventDefault();
      showTab('reports');
      showToast('Rapports', 'info');
      break;
    case '6': // Messages (Alliance)
      e.preventDefault();
      showTab('alliance');
      showToast('Alliance', 'info');
      break;
    case '7': // Inventaire
      e.preventDefault();
      showTab('inventory');
      showToast('Inventaire', 'info');
      break;
    case '8': // Héros
      e.preventDefault();
      showTab('hero');
      showToast('Héros', 'info');
      break;
    case '9': // Marché
      e.preventDefault();
      showTab('market');
      showToast('Marché', 'info');
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
  if (!mapTab || !mapTab.classList.contains('active')) return;
  
  // Don't capture if typing in input
  if (e.isComposing || (e.target && e.target.closest && e.target.closest('input, textarea, select, [contenteditable]'))) return;
  
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
      showToast('Capitale', 'info');
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
  showToast(`${cities[prevIndex].name}`, 'info');
}

function switchToNextCity() {
  if (!cities || cities.length <= 1) {
    showToast('Une seule ville', 'warning');
    return;
  }
  const currentIndex = cities.findIndex(c => c.id === currentCity?.id);
  const nextIndex = (currentIndex + 1) % cities.length;
  selectCity(cities[nextIndex].id);
  showToast(`${cities[nextIndex].name}`, 'info');
}

// ===== MAP GRID TOGGLE =====
let showMapGrid = true;
function toggleMapGrid() {
  showMapGrid = !showMapGrid;
  renderMap();
  showToast(showMapGrid ? 'Grille activée' : 'Grille désactivée', 'info');
}

// ===== MINIMAP TOGGLE =====
let showMinimapPanel = true;
function toggleMinimap() {
  showMinimapPanel = !showMinimapPanel;
  const minimapContainer = document.querySelector('.minimap');
  if (minimapContainer) {
    minimapContainer.style.display = showMinimapPanel ? 'block' : 'none';
  }
  showToast(showMinimapPanel ? 'Minimap visible' : 'Minimap masquée', 'info');
}

// ===== CLOSE ALL PANELS =====
function closeAllPanels() {
  closeModal();
  if (typeof closeBuildPanel === 'function') closeBuildPanel();
  if (typeof closeMapPanel === 'function') closeMapPanel();
  const help = document.getElementById('help-overlay');
  if (help) help.style.display = 'none';
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
  const radius = Math.min(60, Math.ceil(viewSize / 2));   // the server answers in full detail up to 60; beyond, cities only

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
            mainHallLevel: c.mainHallLevel || 1,
            cityTier: c.cityTier || 0,
            cityTierName: c.cityTierName || 'Village',
            isSieged: !!c.isSieged,
            siegedBy: c.siegedBy || null,
            wallDamage: c.wallDamage || 0,
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
            holders: r.holders || [],   // armées qui tiennent le point (joueur, nom, alliance)
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
          // Nos propres armées sont dessinées depuis la liste `armies` (plus fraîche) : éviter le doublon
          if (a.ownerId !== player?.id && !mapData.find(d => d.type === 'ARMY' && d.id === a.id)) {
            mapData.push({
              x: a.x,
              y: a.y,
              type: 'ARMY',
              id: a.id,
              name: a.name,
              status: a.status,
              missionType: a.missionType,
              mainUnit: a.mainUnit,
              targetX: a.targetX,
              targetY: a.targetY,
              arrivalAt: a.arrivalAt,
              departedAt: a.departedAt,
              ownerId: a.ownerId,
              ownerName: a.owner?.name || 'Inconnu',
              faction: a.owner?.faction || 'ROME',
              squads: a.squads || 1
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
            mainHallLevel: c.mainHallLevel || 1,
            cityTier: c.cityTier || (typeof cityTierFromMainHall === 'function' ? cityTierFromMainHall(c.mainHallLevel || 1) : 1),
            isSieged: !!c.isSieged,
            wallDamage: wallLevel > 0 && c.wallMaxHp > 0 ? Math.max(0, Math.min(100, Math.round((1 - (c.wallHp ?? c.wallMaxHp) / c.wallMaxHp) * 10) * 10)) : 0,
            population: player?.population || 0
          });
        }
      });
    }
  } catch (e) {
    console.warn('Could not load map data:', e);
    // Keep the last known tiles rather than inventing cities
    showToast('Carte indisponible, nouvel essai au prochain déplacement', 'warning');
  }

  renderMap();
  renderMinimap();
  updateMapUI();
}

// Armées en marche : animation (pas cadencé, nuage de poussière) tant qu'une armée en mouvement est à l'écran
// Ambiance (bateaux qui glissent, nuages qui passent, map-world.js) : même boucle, plus lente (environ 5 images par seconde)
let mapMovingOnScreen = false, mapAmbientOnScreen = false, mapAnimTimer = null;
function scheduleArmyAnim(delay = 110) {
  if (mapAnimTimer) return;
  mapAnimTimer = setTimeout(() => { mapAnimTimer = null; if (token && document.visibilityState === 'visible' && document.getElementById('tab-map')?.classList.contains('active')) scheduleMapRender(); }, delay);
}
function renderMap() {
  mapMovingOnScreen = false; mapAmbientOnScreen = false;
  renderMapCore();
  if (mapMovingOnScreen) scheduleArmyAnim();
  else if (mapAmbientOnScreen) scheduleArmyAnim(220);
}
function renderMapCore() {
  if (!mapCtx) return;
  armyRouteBudget = 3; armyRouteUntil = performance.now() + 25;
  mapLabelQueue = null;

  const w = mapViewW;
  const h = mapViewH;
  const nightMode = isNightMode();

  // Tile size based on zoom
  const tileW = ISO_TILE_WIDTH * mapZoomLevel;
  const tileH = ISO_TILE_HEIGHT * mapZoomLevel;

  // Le sol couvre tout l'écran (map-world.js) ; un fond uni dessous, pour qu'aucun reste de l'image précédente ne transparaisse
  mapCtx.fillStyle = nightMode ? '#10161c' : '#5f7a3c';
  mapCtx.fillRect(0, 0, w, h);


  // Convert world to isometric screen coordinates
  function worldToScreen(wx, wy) {
    const dx = wx - mapOffsetX;
    const dy = wy - mapOffsetY;
    return {
      x: w / 2 + (dx - dy) * tileW / 2,
      y: h / 2 + (dx + dy) * tileH / 2
    };
  }

  // Convert screen to world coordinates (tiles are drawn centred on integer coordinates)
  function screenToWorld(sx, sy) {
    const dx = sx - w / 2;
    const dy = sy - h / 2;
    return {
      x: Math.round(mapOffsetX + (dx / tileW + dy / tileH)),
      y: Math.round(mapOffsetY + (dy / tileH - dx / tileW))
    };
  }

  // Store for click detection and army movement lines
  window.mapScreenToWorld = screenToWorld;
  window.mapWorldToScreen = worldToScreen;

  // Cases visibles : tout le rectangle du monde qui couvre l'écran (un écran vertical en voit plus en hauteur), marge pour
  // les reliefs et les arbres qui dépassent de leur case
  const screenToWorldRaw = (sx, sy) => { const dx = sx - w / 2, dy = sy - h / 2; return { x: Math.floor(mapOffsetX + dx / tileW + dy / tileH), y: Math.floor(mapOffsetY + dy / tileH - dx / tileW) }; };
  const bounds = mapVisibleBounds(screenToWorldRaw, w, h);
  const drawOrder = [];
  for (let wy = bounds.y0; wy <= bounds.y1; wy++) {
    for (let wx = bounds.x0; wx <= bounds.x1; wx++) {
      const pos = worldToScreen(wx, wy);
      if (pos.x < -tileW * 2 || pos.x > w + tileW * 2 || pos.y < -tileH * 2 || pos.y > h + tileH * 4) continue;
      drawOrder.push({ wx, wy, x: pos.x, y: pos.y, type: 'terrain' });
    }
  }

  // Sort by Y for proper layering (painter's algorithm)
  drawOrder.sort((a, b) => a.y - b.y || a.x - b.x);

  // Le sol (textures et fondus), la grille, puis les éléments posés de haut en bas (map-world.js)
  rebuildMapObjectCells();
  drawMapGround(worldToScreen, bounds, w, h, tileW, tileH, nightMode);
  drawMapGrid(worldToScreen, bounds, nightMode);
  drawMapRoads(worldToScreen, tileW, nightMode);
  drawOrder.forEach(tile => {
    drawMapCellFeature(tile.x, tile.y, tileW, tileH, tile.wx, tile.wy);
  });

  // Draw objects (cities, resources) with proper layering
  const objectsOrder = [];

  mapData.forEach(obj => {
    // the armies of other players walk along their route too (same route as the server's, from the shared terrain)
    const marching = obj.type === 'ARMY' && MOVING_STATUSES[obj.status] && obj.departedAt && obj.arrivalAt && obj.targetX !== null && obj.targetX !== undefined;
    const cur = marching ? armyCurrentPosition(obj) : null;
    if (obj.type === 'ARMY') { obj.drawX = cur ? cur.x : obj.x; obj.drawY = cur ? cur.y : obj.y; }   // le clic la trouve là où elle est dessinée
    const pos = obj.type === 'CITY' ? worldToScreen(obj.x + 0.5, obj.y + 0.5) : cur ? worldToScreen(cur.x, cur.y) : worldToScreen(obj.x, obj.y);   // a city: centre of its 2 × 2 block
    const m = obj.type === 'CITY' ? tileW * 3 : tileW * 2;   // a 2 × 2 city rises about 2.4 tiles above its centre
    if (pos.x >= -m && pos.x <= w + m && pos.y >= -m && pos.y <= h + m) {
      objectsOrder.push({ ...obj, screenX: pos.x, screenY: pos.y, ...(cur ? { walkDir: cur.dir, walkVec: cur.vec } : {}) });
    }
  });

  // Routes of the player's own moving armies (seen by nobody else), drawn on the ground before every object
  for (const army of armies) {
    if (army.isGarrison || !MOVING_STATUSES[army.status]) continue;
    if (army.ownerId && player && army.ownerId !== player.id) continue;
    drawArmyRoute(army, worldToScreen, tileW);
    mapMovingOnScreen = true;
  }
  // Add armies to draw order, each at its current point on its route
  armies.forEach(army => {
    if (army.isGarrison) return;   // la garnison ne quitte jamais la ville : le sprite de ville la représente
    const cur = armyCurrentPosition(army);
    army.drawX = cur.x; army.drawY = cur.y;
    const pos = worldToScreen(cur.x, cur.y);
    if (pos.x >= -tileW * 2 && pos.x <= w + tileW * 2 &&
        pos.y >= -tileH * 2 && pos.y <= h + tileW * 1.6) {   // a painted army rises about 1.4 tiles above its feet
      objectsOrder.push({ ...army, type: 'ARMY', screenX: pos.x, screenY: pos.y, walkDir: cur.dir, walkVec: cur.vec });
    }
  });

  // Sort objects by Y position
  objectsOrder.sort((a, b) => a.screenY - b.screenY);

  // Draw all objects
  mapLabelQueue = [];
  objectsOrder.forEach(obj => {
    if (obj.type === 'CITY') {
      drawIsoCity(obj.screenX, obj.screenY, tileW * 2, tileH * 2, obj);   // 2 × 2 cases
    } else if (obj.type === 'RESOURCE') {
      drawIsoResource(obj.screenX, obj.screenY, tileW, tileH, obj);
    } else if (obj.type === 'ARMY') {
      drawIsoArmy(obj.screenX, obj.screenY, tileW, tileH, obj);
    }
  });

  drawMapClouds(worldToScreen, w, h, tileW, nightMode);   // quelques nuages qui passent, au-dessus de tout (map-world.js)
  const labels = mapLabelQueue || []; mapLabelQueue = null;
  labels.forEach(f => f());   // noms des villes par-dessus tout

  // Draw hover highlight
  const highlight = (t, color, lw) => {
    const city = mapData.find(o => o.type === 'CITY' && t.x >= o.x && t.x <= o.x + 1 && t.y >= o.y && t.y <= o.y + 1);
    const pos = city ? worldToScreen(city.x + 0.5, city.y + 0.5) : worldToScreen(t.x, t.y);
    drawIsoHighlight(pos.x, pos.y, city ? tileW * 2 : tileW, city ? tileH * 2 : tileH, color, lw);
  };
  if (mapHoveredTile) highlight(mapHoveredTile, '#ffd700', 2);
  if (mapSelectedTile) highlight(mapSelectedTile, '#00ff00', 3);
}

// Draw a single isometric tile with biome support
// Variante de raccordement d'un élément de relief : les tuiles voisines portant le même élément allongent le
// sprite le long de x, de y, ou en massif ; sans voisin, version isolée. Repli sur la version isolée si absente.
const WATER_FEATURES = { water: 1, frozen: 1, oasis: 1 };
// Rivières (décision du 25 octobre 2026) : l'eau fait partie du sol ; ponts et gués sont des éléments posés (map-world.js)
const RIVER_FEATURES = { river: 1, bridge: 1, ford: 1 };
let mapObjectCells = new Map();   // "x,y" -> type ('CITY' | 'RESOURCE'), reconstruit à chaque rendu
function rebuildMapObjectCells() {
  terrainSpriteCache.clear();   // sprite variants depend on which cells carry a city or a resource
  mapObjectCells = new Map();
  // a city covers 2 × 2 cells (Terrain.cityCells)
  const markCity = (c) => { for (const [x, y] of Terrain.cityCells(c.x, c.y)) mapObjectCells.set(x + ',' + y, 'CITY'); };
  for (const o of mapData) if (o.type === 'RESOURCE') mapObjectCells.set(o.x + ',' + o.y, o.type); else if (o.type === 'CITY') markCity(o);
  for (const c of cities) markCity(c);
  rebuildMapCityRings();   // map-world.js : champs et chemins autour des villes
}
function terrainBlockedAt(wx, wy) {
  if (mapObjectCells.has(wx + ',' + wy)) return true;
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (mapObjectCells.get((wx + dx) + ',' + (wy + dy)) === 'CITY') return true;
  return false;
}
function terrainSpriteName(wx, wy, biome, feature) {
  const k = wx + ',' + wy;
  if (terrainSpriteCache.has(k)) return terrainSpriteCache.get(k);
  const name = computeTerrainSpriteName(wx, wy, biome, feature);
  if (terrainSpriteCache.size > 250000) terrainSpriteCache.clear();
  terrainSpriteCache.set(k, name);
  return name;
}
function computeTerrainSpriteName(wx, wy, biome, feature) {
  if (terrainBlockedAt(wx, wy) || WATER_FEATURES[feature] || RIVER_FEATURES[feature]) return null;   // l'eau fait partie du sol
  const base = `${biome}_${feature}`;
  if (!tileImages.terrain[base]) return null;
  const same = (dx, dy) => { if (terrainBlockedAt(wx + dx, wy + dy)) return false; return getTerrainType(wx + dx, wy + dy).feature === feature; };
  const ex = same(1, 0) || same(-1, 0), ey = same(0, 1) || same(0, -1);
  const suffix = ex && ey ? '_xy' : ex ? '_x' : ey ? '_y' : '';
  return suffix && tileImages.terrain[base + suffix] ? base + suffix : base;
}
// Rendu d'avant d'un élément posé (sprite 3D d'une case ou dessin), tant que l'image peinte de la carte de référence
// n'est pas livrée (map-world.js choisit l'image peinte d'abord)
function drawLegacyFeature(x, y, tw, th, wx, wy, terrain) {
  const biome = terrain.biome;
  const feature = terrain.feature;
  if (feature === 'bridge' || feature === 'ford') { drawLegacyCrossing(x, y, tw, th, wx, wy, feature, biome, isNightMode()); return; }
  if (feature === 'mesa') {   // chaîne de mesas du désert (infranchissable) : rochers du désert serrés, en attendant ses images
    const s = Math.max(tw, th * 2), j = (seed) => Terrain.seededRandom(wx, wy, seed) - 0.5;
    if (tileImages.terrain.desert_rocks) { drawTileImage(mapCtx, 'terrain', 'desert_rocks', x + j(5171) * tw * 0.3, y + j(5172) * th * 0.3, s * 1.7, s * 1.7); return; }
    drawDesertRocks(x, y - th * 0.3, tw * 0.75, th * 1.1);
    return;
  }
  const featureSprite = terrainSpriteName(wx, wy, biome, feature);
  if (featureSprite) {
    const big = feature === 'mountain' || feature === 'icemountain';
    const joined = /_(x|y|xy)$/.test(featureSprite), massif = /_xy$/.test(featureSprite);
    const k = big ? (massif ? 2.0 : joined ? 1.85 : 1.4) : (joined ? 1.6 : 1.15);
    const fsize = Math.max(tw, th * 2) * k;
    drawTileImage(mapCtx, 'terrain', featureSprite, x, y, fsize, fsize);
    return;
  }
  if (feature === 'boulders') {   // amas de rochers (tempéré)
    drawIsoRock(x - tw * 0.12, y + th * 0.05, th * 0.75); drawIsoRock(x + tw * 0.14, y + th * 0.12, th * 0.55); drawIsoRock(x + tw * 0.02, y - th * 0.12, th * 0.45);
    return;
  }
  if (biome === 'forest') {
    if (feature === 'tree') {
      const sd = (k) => Terrain.seededRandom(wx, wy, 6170 + k);
      drawIsoTree(x - tw * 0.16, y - th * 0.3, tw * 0.34, th * 0.75, sd(0)); drawIsoTree(x + tw * 0.14, y - th * 0.2, tw * 0.3, th * 0.7, sd(1)); drawIsoTree(x, y - th * 0.05, tw * 0.36, th * 0.8, sd(2));
    } else if (feature === 'mountain') {
      drawIsoMountain(x, y - th * 0.5, tw * 0.6, th * 1.2);
    }
  } else if (biome === 'desert') {
    if (feature === 'dunes') {
      drawDesertDunes(x, y, tw, th);
    } else if (feature === 'ruins') {
      drawDesertRuins(x, y - th * 0.3, tw * 0.5, th * 0.8);
    } else if (feature === 'rocks') {
      drawDesertRocks(x, y - th * 0.2, tw * 0.4, th * 0.6);
    }
  } else if (biome === 'snow') {
    if (feature === 'snowtree') {
      drawSnowTree(x - tw * 0.15, y - th * 0.3, tw * 0.32, th * 0.75); drawSnowTree(x + tw * 0.13, y - th * 0.18, tw * 0.3, th * 0.7); drawSnowTree(x, y - th * 0.05, tw * 0.34, th * 0.8);
    } else if (feature === 'icemountain') {
      drawIceMountain(x, y - th * 0.5, tw * 0.6, th * 1.2);
    }
  }
}

// Pont ou gué dessinés (l'eau est dans le sol) : planches en travers de la rivière, pierres de gué
function drawLegacyCrossing(x, y, tw, th, wx, wy, feature, biome, night) {
  const frozen = biome === 'snow';
  if (feature === 'bridge') {
    const alongX = mapCrossingAlongX(wx, wy);
    const ux = alongX ? tw / 2 : -tw / 2, uy = th / 2, w = 0.5;
    mapCtx.fillStyle = night ? '#4a3420' : '#8a5a30';
    mapCtx.beginPath();
    mapCtx.moveTo(x - ux * 0.95 - (alongX ? -1 : 1) * tw * w * 0.5 * 0.5, y - uy * 0.95 - th * w * 0.25);
    mapCtx.lineTo(x + ux * 0.95 - (alongX ? -1 : 1) * tw * w * 0.5 * 0.5, y + uy * 0.95 - th * w * 0.25);
    mapCtx.lineTo(x + ux * 0.95 + (alongX ? -1 : 1) * tw * w * 0.5 * 0.5, y + uy * 0.95 + th * w * 0.25);
    mapCtx.lineTo(x - ux * 0.95 + (alongX ? -1 : 1) * tw * w * 0.5 * 0.5, y - uy * 0.95 + th * w * 0.25);
    mapCtx.closePath(); mapCtx.fill();
    mapCtx.strokeStyle = 'rgba(40,24,10,0.6)'; mapCtx.lineWidth = 1; mapCtx.stroke();
  } else {
    mapCtx.fillStyle = frozen ? '#e8eef2' : '#b8b0a0';
    for (let i = -2; i <= 2; i++) { mapCtx.beginPath(); mapCtx.ellipse(x + i * tw * 0.12, y + i * th * 0.06 * ((wx + wy) % 2 ? 1 : -1), tw * 0.045, th * 0.06, 0, 0, Math.PI * 2); mapCtx.fill(); }
  }
}

// Draw isometric tree (pine/fir)
function drawIsoTree(x, y, w, h, seed) {   // seed : tiré de la case du monde (sinon la hauteur changerait en déplaçant la carte)
  const treeH = h * (0.8 + (seed ?? seededRandom(x, y)) * 0.4);

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
// Plaque de nom façon Travian : parchemin arrondi, liseré, texte brun en Crimson Text
function drawMapNamePlate(x, top, text, px, border) {
  mapCtx.font = `700 ${px}px 'Crimson Text', Georgia, serif`;
  mapCtx.textAlign = 'center'; mapCtx.textBaseline = 'middle';
  const w = mapCtx.measureText(text).width + px * 1.2, h = px * 1.5;
  mapCtx.fillStyle = 'rgba(240,224,186,0.92)';
  mapCtx.strokeStyle = border; mapCtx.lineWidth = 1.2;
  mapCtx.beginPath(); mapCtx.roundRect(x - w / 2, top, w, h, h / 2); mapCtx.fill(); mapCtx.stroke();
  mapCtx.fillStyle = '#2e2010';
  mapCtx.fillText(text, x, top + h / 2 + 0.5);
}
// Phase courante de l'animation de siège, null tant qu'elle n'est pas livrée : villes de départ map/cities/siege_<CIV>_t<1|2|3>_<0..3>,
// villes secondaires map/cities/siege_colony_<CIV>_<normal|fortified>_<0..3>
const SIEGE_FRAMES = 4, SIEGE_FRAME_MS = 220;
function siegeFrameName(faction, tier, colony = false) {
  const t = Math.max(1, Math.min(3, tier || 1)), F = String(faction || 'ROME').toUpperCase();
  const base = colony ? `siege_colony_${F}_${t >= 3 ? 'fortified' : 'normal'}` : `siege_${F}_t${t}`;
  if (!tileImages.cities[`${base}_0`]) return null;
  const name = `${base}_${Math.floor(Date.now() / SIEGE_FRAME_MS) % SIEGE_FRAMES}`;
  return tileImages.cities[name] ? name : `${base}_0`;
}

function drawCityLabels(x, y, tw, th, tile, isMyCity, isAlly, siegeAnimated = false) {
  const citySize = Math.min(tw, th * 2) * 0.8;

  // Drapeau planté devant la ville : or pour les nôtres, bleu pour les alliés, couleurs de la faction sinon (sprite 3D, phase fixe)
  const flagY = y - citySize * 0.55;
  const kind = isMyCity ? 'gold' : isAlly ? 'ally' : String(tile.faction || 'ROME').toUpperCase();
  const flag = typeof getSprite === 'function' ? getSprite(`assets/images/3d/props/flag_${kind}_0.webp`) : null;
  if (flag) { const fh = citySize * 0.55, fw = fh * 64 / 96; mapCtx.drawImage(flag, x - fw / 2, flagY - fh * 0.92, fw, fh); }
  else { mapCtx.fillStyle = isMyCity ? '#ffd700' : isAlly ? '#44ff88' : '#ff4444'; mapCtx.fillRect(x - 1, flagY - 12, 2, 15); }

  // Ville assiégée : anneau rouge en pointillés autour de la ville et emblème d'épées (en attendant le campement peint)
  if (tile.isSieged && !siegeAnimated) drawSiegeMarker(x, y, citySize);
  // Mur abîmé par un siège : fumée (et feu au-delà de 50 %) jusqu'à ce que le mur soit réparé ; l'animation de siège a la sienne
  if ((tile.wallDamage || 0) >= 10 && !siegeAnimated) drawDamagedCitySmoke(x, y, citySize, tile.wallDamage, tile.id);
  if (tile.isSieged && tile.siegedBy) drawSiegeBanner(x, y, citySize, tile.siegedBy);

  // Étiquette du nom (plaque de parchemin au liseré brun, doré pour nos villes) et pastille de population : dessinées après
  // tous les éléments de la carte (mapLabelQueue), pour qu'un point de ressource ou une armée devant la ville ne les cache pas
  const plates = () => {
    if (mapZoomLevel > 0.5 && tile.name) drawMapNamePlate(x, y + citySize * 0.35, tile.name, Math.max(9, 10 * mapZoomLevel), isMyCity ? '#c9a227' : isAlly ? '#3a7a9c' : '#6a4a2a');
    if (mapZoomLevel > 0.7 && tile.population) {
      const badgeX = x + citySize * 0.4;
      const badgeY = y - citySize * 0.5;
      mapCtx.fillStyle = '#e8c547'; mapCtx.strokeStyle = '#5a4010'; mapCtx.lineWidth = 1.2;
      mapCtx.beginPath(); mapCtx.arc(badgeX, badgeY, 11, 0, Math.PI * 2); mapCtx.fill(); mapCtx.stroke();
      mapCtx.fillStyle = '#2e2010';
      mapCtx.font = "700 9px 'Crimson Text', Georgia, serif";
      mapCtx.textAlign = 'center'; mapCtx.textBaseline = 'middle';
      mapCtx.fillText(formatNum(tile.population || 0), badgeX, badgeY + 0.5);
    }
  };
  if (mapLabelQueue) mapLabelQueue.push(plates); else plates();
}
let mapLabelQueue = null;   // étiquettes des villes en attente, pendant le dessin de la carte

// Colonne de fumée au-dessus d'une ville au mur abîmé : plus dense avec les dégâts ; feu peint (map/fx/fire_0..3) quand
// il est livré et que le mur a perdu plus de la moitié de ses PV, sinon des bouffées de fumée 3D qui montent
function drawDamagedCitySmoke(x, y, size, damage, seed) {
  mapMovingOnScreen = true;   // garde la carte animée tant que la fumée est à l'écran
  const t = performance.now() / 1000, ph = (String(seed || '').charCodeAt(0) || 0) * 0.29;
  if (damage > 50 && tileImages.fx.fire_0) {
    const f = tileImages.fx[`fire_${Math.floor(t * 6) % 4}`] || tileImages.fx.fire_0, s = size * 0.5;
    mapCtx.drawImage(f, x - s / 2 + size * 0.12, y - size * 0.55, s, s);
  }
  const n = 3 + Math.round(damage / 20);   // 3 à 8 bouffées
  mapCtx.save();
  if ('filter' in mapCtx) mapCtx.filter = `brightness(${Math.round(55 - damage * 0.3)}%)`;   // fumée sombre, plus noire avec les dégâts
  for (let k = 0; k < n; k++) {
    const life = (t * 0.35 + k / n + ph) % 1;
    const puff = typeof getSprite === 'function' ? getSprite(art(`props/puff_${k % 4}.webp`)) : null;
    if (!puff) break;
    const ps = size * (0.2 + life * 0.38);
    mapCtx.globalAlpha = Math.min(0.9, 0.5 + damage / 200) * (1 - life * 0.85);
    mapCtx.drawImage(puff, x + size * (0.08 + Math.sin(life * 3 + k) * 0.06 + life * 0.14) - ps / 2, y - size * (0.3 + life * 0.8) - ps / 2, ps, ps);
  }
  mapCtx.restore();
}

// Bannière de la civilisation qui assiège, plantée devant la ville (drapeau 3D existant, phase fixe)
function drawSiegeBanner(x, y, size, faction) {
  const flag = typeof getSprite === 'function' ? getSprite(`assets/images/3d/props/flag_${String(faction).toUpperCase()}_0.webp`) : null;
  if (!flag) return;
  const fh = size * 0.42, fw = fh * 64 / 96;
  mapCtx.drawImage(flag, x + size * 0.42 - fw / 2, y + size * 0.05 - fh * 0.92, fw, fh);
}

function drawSiegeMarker(x, y, size) {
  mapCtx.save();
  mapCtx.strokeStyle = 'rgba(190,30,20,0.9)'; mapCtx.lineWidth = 2.5; mapCtx.setLineDash([6, 4]);
  mapCtx.beginPath(); mapCtx.ellipse(x, y + size * 0.05, size * 0.66, size * 0.34, 0, 0, Math.PI * 2); mapCtx.stroke();
  mapCtx.setLineDash([]);
  const r = Math.max(8, size * 0.16), ix = x - size * 0.5, iy = y - size * 0.45;
  mapCtx.fillStyle = '#7a1410'; mapCtx.strokeStyle = '#f0d9a0'; mapCtx.lineWidth = 1.2;
  mapCtx.beginPath(); mapCtx.arc(ix, iy, r, 0, Math.PI * 2); mapCtx.fill(); mapCtx.stroke();
  const icon = typeof getSprite === 'function' ? getSprite('assets/images/3d/ui/attack.webp') : null;
  if (icon) mapCtx.drawImage(icon, ix - r * 0.8, iy - r * 0.8, r * 1.6, r * 1.6);
  mapCtx.restore();
}

// Draw isometric city with culture-specific style and walls
function drawIsoCity(x, y, tw, th, tile) {
  const isMyCity = tile.playerId === player?.id;
  const isAlly = tile.allianceId && tile.allianceId === player?.allianceId;
  const faction = tile.faction || 'ROME';
  const wallLevel = tile.wallLevel || 0;
  const cultureStyle = CULTURE_STYLES[faction] || CULTURE_STYLES.ROME;

  // Try to draw from tileset image first
  // Sprite de la faction ; une ville fortifiée (palier 3 : Bâtiment principal ≥ 20) prend le sprite « capital » (enceinte à tours).
  // Toute première ville est une capitale : la capitale est signalée par le drapeau des étiquettes, pas par le sprite.
  const fortified = (tile.cityTier || 0) >= 3;
  const cityImageSize = Math.max(tw * 1.5, th * 3) * (fortified ? 1.2 : 1);
  // Ville secondaire : deux apparences peintes, normale puis fortifiée (Bâtiment principal ≥ 20) ; sinon les sprites de ville
  const isColony = tile.isCapital === false, fl = faction.toLowerCase();
  const colonyType = !isColony ? null : fortified ? (tileImages.cities[`colony_${fl}_fortified`] ? `colony_${fl}_fortified` : null) : (tileImages.cities['colony_' + fl] ? 'colony_' + fl : null);   // guide § S12
  // palier 2 « Ville » : sprite <civ>_t2 quand il est livré, sinon celui du village
  const townType = (tile.cityTier || 0) === 2 && tileImages.cities[faction.toLowerCase() + '_t2'] ? faction.toLowerCase() + '_t2' : faction.toLowerCase();
  const cityType = colonyType || (fortified ? (tileImages.cities['capital_' + faction.toLowerCase()] ? 'capital_' + faction.toLowerCase() : 'capital') : townType);   // forteresse aux couleurs de la faction

  // Sprite de ville (manifest) : halo d'appartenance sous le sprite, puis étiquettes par-dessus
  if (tileImages.cities[cityType] || tileImages.cities.default) {
    if (isMyCity || isAlly) {
      mapCtx.fillStyle = isMyCity ? 'rgba(255,215,0,0.35)' : 'rgba(90,200,130,0.35)';
      mapCtx.beginPath();
      mapCtx.ellipse(x, y, tw * 0.52, th * 0.52, 0, 0, Math.PI * 2);
      mapCtx.fill();
    }
    // Ville assiégée : animation peinte de la ville sous le siège (civilisation × palier, 4 phases en boucle) à la place du sprite
    const siegeFrame = tile.isSieged ? ((isColony && siegeFrameName(faction, tile.cityTier, true)) || siegeFrameName(faction, tile.cityTier)) : null;
    if (siegeFrame) mapMovingOnScreen = true;   // garde la carte animée tant que le siège est à l'écran
    const cityName = siegeFrame || (tileImages.cities[cityType] ? cityType : 'default');
    if (tileImagePainted.has('cities/' + cityName)) drawWorldCityImage(tileImages.cities[cityName], x, y, tw);   // cadrage 2 × 2 de la carte de référence
    else drawTileImage(mapCtx, 'cities', cityName, x, y, cityImageSize, cityImageSize);
    drawCityLabels(x, y, tw, th, tile, isMyCity, isAlly, !!siegeFrame);
    return;
  }

  // Fallback to procedural rendering
  // Palier de l'API (Village=1, Ville=2, Ville Fortifiée=3), fixé par le Bâtiment principal ; sans mur, pas d'enceinte dessinée
  const cityTier = wallLevel === 0 ? 0 : (tile.cityTier || (typeof cityTierFromMainHall === 'function' ? cityTierFromMainHall(tile.mainHallLevel || 1) : 1));

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

// Stock d'un point : affiché par quarts seulement (le serveur arrondit déjà), comme le veut le GDD
function stockRatio(amount, max) { return max > 0 ? Math.max(0, Math.min(1, (Number(amount) || 0) / max)) : 0; }
function stockLabel(amount, max) {
  const r = stockRatio(amount, max);
  return r >= 0.95 ? 'plein' : r >= 0.6 ? 'bien garni' : r >= 0.35 ? 'à moitié' : r > 0.1 ? 'entamé' : r > 0 ? 'presque vide' : 'vide';
}
// Petite jauge de remplissage sous le point (remplace l'ancien « 2k »)
function drawStockGauge(x, y, size, tile) {
  const w = Math.max(14, size * 0.9), h = 3, r = stockRatio(tile.amount, tile.maxAmount);
  mapCtx.fillStyle = 'rgba(0,0,0,0.55)';
  mapCtx.fillRect(x - w / 2, y, w, h);
  mapCtx.fillStyle = r >= 0.6 ? '#8bc34a' : r >= 0.35 ? '#ffc107' : '#e57373';
  mapCtx.fillRect(x - w / 2, y, Math.round(w * r), h);
}

// Draw isometric resource node
function drawIsoResource(x, y, tw, th, tile) {
  const resType = tile.resourceType?.toLowerCase() || 'wood';
  const size = Math.min(tw, th * 2) * 0.5;
  const imgSize = Math.max(tw, th * 2) * 1.3;

  // Camp barbare peint (niveau, biome) tant que la tribu tient le point, ruines après sa défaite ; l'icône de ressource,
  // en petit, garde le type lisible. Sans sprite peint, l'icône de ressource seule (rendu d'origine).
  const biome = getBiome(tile.x, tile.y);
  // comme sur la carte de référence : un visuel par ressource, terrain et richesse (map/resources/<type>_<biome>_<niveau>),
  // sans couleur de civilisation ; repli sur l'image du biome puis sur celle de la ressource
  const level = Math.max(1, Math.min(3, Number(tile.level) || 1));
  const biomeVariant = `${resType}_${biome}`;
  const resName = [`${resType}_${biome}_${level}`, biomeVariant, resType].find(n => tileImages.resources[n]) || resType;
  // Campement de fondation peint (guide § S12) tant qu'une ville est en fondation sur le point, bannière du fondateur
  const founder = (tile.holders || []).find(h => h.founding);
  const foundName = founder ? (tileImages.camps[`foundation_${biome}`] ? `foundation_${biome}` : (tileImages.camps.foundation ? 'foundation' : null)) : null;
  if (foundName && drawTileImage(mapCtx, 'camps', foundName, x, y, imgSize, imgSize)) return;
  const campBase = tile.hasDefenders ? `camp${Math.max(1, Math.min(3, Number(tile.level) || 1))}` : (tile.lastDefeat ? 'ruins' : null);
  const campName = campBase ? (tileImages.camps[`${campBase}_${biome}`] ? `${campBase}_${biome}` : (tileImages.camps[campBase] ? campBase : null)) : null;
  if (campName && drawTileImage(mapCtx, 'camps', campName, x, y, imgSize, imgSize)) {
    drawTileImage(mapCtx, 'resources', resName, x - imgSize * 0.32, y + imgSize * 0.02, imgSize * 0.38, imgSize * 0.38);
    if (mapZoomLevel > 0.6) drawStockGauge(x, y + size * 0.5, size, tile);
    return;
  }
  // Try to draw from individual image first (biome variant when it exists: wood_desert, stone_snow…)
  if (drawTileImage(mapCtx, 'resources', resName, x, y, imgSize, imgSize)) {
    // Draw resource level indicator
    if (mapZoomLevel > 0.6) drawStockGauge(x, y + size * 0.5, size, tile);
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
    const sd = (k) => Terrain.seededRandom(tile.x, tile.y, 6180 + k);
    drawIsoTree(x - size * 0.3, y - size * 0.1, size * 0.3, size * 0.5, sd(0));
    drawIsoTree(x + size * 0.2, y - size * 0.05, size * 0.25, size * 0.4, sd(1));
    drawIsoTree(x, y - size * 0.2, size * 0.35, size * 0.6, sd(2));

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
  if (mapZoomLevel > 0.7) drawStockGauge(x, y + size * 0.35 + 4, size, tile);
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

// ========== ARMY ROUTES ==========
// A moving army follows the same route the server computed (shared terrain): the sprite walks along it
// between departedAt and arrivalAt, and the owner sees the route as a discreet light-green dotted line.
const MOVING_STATUSES = { MOVING: 1, ATTACKING: 1, RAIDING: 1, RETURNING: 1, SPYING: 1, TRANSPORTING: 1 };
const armyRouteCache = new Map();   // "id|x,y>tx,ty" -> [[x, y], ...] (null when no route)
// Chemins des armées : un trajet court se calcule tout de suite (au plus 3 par image et pendant 25 ms au plus) ; un long
// trajet part dans route-worker.js, hors du fil principal, pour que la carte ne se fige pas. En attendant, l'armée marche
// en ligne droite. Le départ et l'arrivée comptent comme des cases d'objets (ville de 2 × 2 cases, point de ressource),
// même hors de la zone chargée.
let armyRouteBudget = 3, armyRouteUntil = 0;
const ARMY_ROUTE_FAR = 40;   // cases (plus grand écart en x ou en y) au-delà desquelles le trajet est calculé à part
let _armyRouteWorker, _armyRouteSeq = 0;
const _armyRoutePending = new Map();   // numéro de demande -> clé du cache
function armyRouteWorker() {
  if (_armyRouteWorker !== undefined) return _armyRouteWorker;
  _armyRouteWorker = null;
  try {
    if (typeof Worker === 'function') {
      const w = new Worker('js/route-worker.js');
      w.onmessage = (e) => {
        const key = _armyRoutePending.get(e.data?.id);
        if (!key) return;
        _armyRoutePending.delete(e.data.id);
        armyRouteCache.set(key.key, e.data.path || key.straight);
        if (typeof scheduleMapRender === 'function') scheduleMapRender();
      };
      w.onerror = () => { _armyRouteWorker = null; _armyRoutePending.clear(); };   // pas de fil à part : calcul sur place
      _armyRouteWorker = w;
    }
  } catch (e) { _armyRouteWorker = null; }
  return _armyRouteWorker;
}
function armyRoute(army) {
  if (army.targetX === null || army.targetX === undefined || army.targetY === null || army.targetY === undefined) return null;
  const key = `${Terrain.epoch}|${army.id}|${army.x},${army.y}>${army.targetX},${army.targetY}`;   // epoch : la carte du serveur
  if (armyRouteCache.has(key)) return armyRouteCache.get(key);
  const straight = [[army.x, army.y], [army.targetX, army.targetY]];
  const base = typeof mapObjectCells !== 'undefined' ? mapObjectCells : new Map();
  const extra = new Map([[army.x + ',' + army.y, 'RESOURCE']]);
  const toCity = army.targetCityId || ['ATTACKING', 'RAIDING', 'SPYING', 'TRANSPORTING', 'RETURNING'].includes(army.status);
  if (toCity) for (const [cx, cy] of Terrain.cityCells(army.targetX, army.targetY)) extra.set(cx + ',' + cy, 'CITY');
  else extra.set(army.targetX + ',' + army.targetY, 'RESOURCE');
  const faction = army.owner?.faction || army.faction || (army.ownerId === player?.id ? player?.faction : null);
  if (armyRouteCache.size > 300) armyRouteCache.clear();
  const far = Math.max(Math.abs(army.targetX - army.x), Math.abs(army.targetY - army.y)) > ARMY_ROUTE_FAR;
  const worker = far ? armyRouteWorker() : null;
  if (worker) {
    for (const v of _armyRoutePending.values()) if (v.key === key) { mapMovingOnScreen = true; return straight; }   // déjà demandé
    const id = ++_armyRouteSeq;
    _armyRoutePending.set(id, { key, straight });
    worker.postMessage({ id, seed: Terrain.worldSeed, from: [army.x, army.y], to: [army.targetX, army.targetY], objects: [...base.entries(), ...extra.entries()], faction });
    mapMovingOnScreen = true;
    return straight;
  }
  if (armyRouteBudget <= 0 || (armyRouteBudget < 3 && performance.now() > armyRouteUntil)) { mapMovingOnScreen = true; return straight; }   // calculé à une prochaine image
  armyRouteBudget--;
  const objects = { has: (k) => extra.has(k) || base.has(k), get: (k) => extra.get(k) || base.get(k) };
  const r = Terrain.findPath(army.x, army.y, army.targetX, army.targetY, objects, undefined, { faction });
  const path = r ? r.path : straight;
  armyRouteCache.set(key, path);
  return path;
}
function armyProgress(army) {
  if (!army.arrivalAt) return 0;
  const now = typeof serverNow === 'function' ? serverNow() : Date.now();
  const end = new Date(army.arrivalAt).getTime();
  const start = army.departedAt ? new Date(army.departedAt).getTime() : null;
  if (!start || end <= start) return now >= end ? 1 : 0;
  return Math.max(0, Math.min(1, (now - start) / (end - start)));
}
function pointAlongRoute(path, fraction) {
  if (!path || !path.length) return null;
  if (path.length === 1 || fraction <= 0) return { x: path[0][0], y: path[0][1] };
  if (fraction >= 1) { const l = path[path.length - 1]; return { x: l[0], y: l[1] }; }
  let total = 0; const seg = [];
  for (let i = 1; i < path.length; i++) { const d = Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]); seg.push(d); total += d; }
  let target = fraction * total;
  for (let i = 1; i < path.length; i++) {
    if (target <= seg[i - 1]) { const t = seg[i - 1] ? target / seg[i - 1] : 0; return { x: path[i - 1][0] + (path[i][0] - path[i - 1][0]) * t, y: path[i - 1][1] + (path[i][1] - path[i - 1][1]) * t }; }
    target -= seg[i - 1];
  }
  const l = path[path.length - 1]; return { x: l[0], y: l[1] };
}
// Where the army is right now (world coordinates, fractional) and which way it walks
function armyCurrentPosition(army) {
  if (!MOVING_STATUSES[army.status]) return { x: army.x, y: army.y, dir: 1 };
  const path = armyRoute(army);
  const p = armyProgress(army);
  const at = pointAlongRoute(path, p) || { x: army.x, y: army.y };
  const ahead = pointAlongRoute(path, Math.min(1, p + 0.02)) || at;
  // screen direction: +x on screen when (dx - dy) grows, +y when (dx + dy) grows (iso 2:1)
  const sx = (ahead.x - ahead.y) - (at.x - at.y), sy = ((ahead.x + ahead.y) - (at.x + at.y)) / 2, n = Math.hypot(sx, sy);
  const dir = sx < -1e-6 ? -1 : 1;
  return { x: at.x, y: at.y, dir, vec: n > 1e-9 ? { x: sx / n, y: sy / n } : { x: dir, y: 0.5 } };
}
// Dotted light-green route with an arrow head, for the player's own armies only
function drawArmyRoute(army, worldToScreen, tileW) {
  const path = armyRoute(army);
  if (!path || path.length < 2) return;
  const pts = path.map(([x, y]) => worldToScreen(x, y));
  mapCtx.save();
  mapCtx.lineCap = 'round'; mapCtx.lineJoin = 'round';
  mapCtx.strokeStyle = 'rgba(150, 235, 140, 0.75)';
  mapCtx.lineWidth = Math.max(1.5, tileW * 0.045);
  mapCtx.setLineDash([tileW * 0.18, tileW * 0.16]);
  mapCtx.lineDashOffset = -((performance.now() / 60) % (tileW * 0.34));   // marching ants, slow
  mapCtx.shadowColor = 'rgba(0, 40, 0, 0.5)'; mapCtx.shadowBlur = 2;
  mapCtx.beginPath();
  pts.forEach((p, i) => (i ? mapCtx.lineTo(p.x, p.y) : mapCtx.moveTo(p.x, p.y)));
  mapCtx.stroke();
  mapCtx.setLineDash([]);
  // arrow head at the destination, pointing along the last segment
  const a = pts[pts.length - 2], b = pts[pts.length - 1];
  const ang = Math.atan2(b.y - a.y, b.x - a.x), L = Math.max(6, tileW * 0.22);
  mapCtx.fillStyle = 'rgba(150, 235, 140, 0.85)';
  mapCtx.beginPath();
  mapCtx.moveTo(b.x, b.y);
  mapCtx.lineTo(b.x - L * Math.cos(ang - 0.45), b.y - L * Math.sin(ang - 0.45));
  mapCtx.lineTo(b.x - L * Math.cos(ang + 0.45), b.y - L * Math.sin(ang + 0.45));
  mapCtx.closePath(); mapCtx.fill();
  mapCtx.restore();
}

// Nom du sprite de carte d'une armée : marchand pour les transports, sinon la classe de
// l'unité la plus nombreuse (hoplite / archer / cavalry / catapult)
const ARMY_CLASS_SPRITE = { SIEGE: 'catapult', CAVALRY: 'cavalry', ARCHER: 'archer', INFANTRY: 'hoplite' };
function armySpriteName(army) {
  if (army.missionType === 'FOUND' || army.status === 'FOUNDING' || (army.settlers || 0) > 0) return 'settler';   // cortège de colons
  if (army.mainUnit) return String(army.mainUnit).toLowerCase();
  if (army.status === 'TRANSPORTING' || army.missionType === 'TRANSPORT') return 'merchant';
  let best = null;
  for (const u of army.units || []) if (!best || (u.count || 0) > (best.count || 0)) best = u;
  const def = best && typeof unitsData !== 'undefined' ? unitsData.find(d => d.key === best.unitKey) : null;
  return (def && ARMY_CLASS_SPRITE[def.class]) || 'hoplite';
}

// Draw isometric army marker
// Taille de la colonne de ses propres armées (1 à 3 groupes), d'après leur effectif ; même règle que le serveur pour les
// armées des autres (/api/map/viewport : squads)
function armySquads(army) {
  const n = (army.units || []).reduce((t, u) => t + (u.count || 0), 0);
  return n < 100 ? 1 : n < 500 ? 2 : 3;
}
// Cycle de marche peint d'un sprite d'armée (6 poses <nom>_walk_0..5) : celui de la civilisation, sinon le cycle commun.
// Chargé à la première demande (pas avec le reste de la carte), joué seulement quand ses 6 poses sont là.
const armyWalkLoading = new Set();
function armyWalkBase(name) {
  for (const n of [name, name.replace(/_[A-Z]+$/, '')]) {
    const files = [0, 1, 2, 3, 4, 5].map(i => `map/units/${n}_walk_${i}.webp`);
    if (typeof paintedSet === 'undefined' || !files.every(f => paintedSet.has(f))) continue;   // cycle non livré (ou incomplet)
    if ([0, 1, 2, 3, 4, 5].every(i => tileImages.units[`${n}_walk_${i}`])) return `${n}_walk_`;
    if (!armyWalkLoading.has(n)) {
      armyWalkLoading.add(n);
      files.forEach((f, i) => { const img = new Image(); img.onload = () => { tileImages.units[`${n}_walk_${i}`] = img; tileImagePainted.add(`units/${n}_walk_${i}`); if (typeof queueSpriteRedraw === 'function') queueSpriteRedraw(); }; img.src = art(f); });
    }
    return null;   // il trottine le temps du chargement
  }
  return null;
}
function drawIsoArmy(x, y, tw, th, army) {
  const size = Math.min(tw, th * 2) * 0.4;
  const isMoving = !!MOVING_STATUSES[army.status] && armyProgress(army) < 1;   // en marche ; récolte, fondation, siège : à l'arrêt
  const imgSize = Math.max(tw, th * 2) * 1.2;

  // Sprite d'unité : fourni par la carte (mainUnit) ou déduit de la composition de nos propres armées,
  // aux couleurs de la faction quand la variante existe (hoplite_ROME, cavalry_HUN…)
  let mainUnitType = armySpriteName(army);
  const faction = String(army.faction || player?.faction || '').toUpperCase();
  if (faction && tileImages.units[mainUnitType + '_' + faction]) mainUnitType += '_' + faction;
  if (mainUnitType.startsWith('settler') && !tileImages.units[mainUnitType] && !(isMoving && armyWalkBase(mainUnitType))) mainUnitType = tileImages.units['merchant_' + faction] ? 'merchant_' + faction : 'merchant';   // cortège de colons : charrette tant que le sprite n'est pas livré
  const troopType = mainUnitType;   // les groupes qui suivent le héros gardent l'image de leur troupe
  if ((army.hasHero || army.heroId) && faction && (tileImages.units['hero_' + faction] || (isMoving && armyWalkBase('hero_' + faction)))) mainUnitType = 'hero_' + faction;   // héros en tête d'armée (guide § S18)
  if ((army.status === 'SPYING' || army.missionType === 'SPY') && (tileImages.units.spy || (isMoving && armyWalkBase('spy')))) mainUnitType = 'spy';   // espion en mission
  const walkLead = isMoving ? armyWalkBase(mainUnitType) : null;
  const hasSprite = !!tileImages.units[mainUnitType] || !!walkLead;
  // comme sur la carte de référence, une grosse armée est une colonne de plusieurs groupes de soldats (1 à 3)
  const squads = Math.max(1, Math.min(3, army.squads || armySquads(army)));
  const groupType = (q) => (q === 0 ? mainUnitType : tileImages.units[troopType] || armyWalkBase(troopType) ? troopType : mainUnitType);   // le héros ou l'espion devant, la troupe derrière
  if (hasSprite && isMoving) {
    // marche : l'armée regarde vers sa destination ; avec son cycle de marche peint (6 poses), chaque groupe marche au
    // pas ; sinon il trottine (petits bonds cadencés, léger balancement) ; la poussière se lève derrière la colonne
    mapMovingOnScreen = true;
    const t = performance.now() / 1000, ph = (String(army.id || '').charCodeAt(0) || 0) * 0.37;
    const dir = army.walkDir || (army.targetX !== undefined && army.targetX !== null ? Math.sign((army.targetX - army.targetY) - (army.x - army.y)) || 1 : 1);
    const vec = army.walkVec || { x: dir, y: 0.5 };
    // les groupes suivants se placent en arrière, à l'opposé du sens de la marche sur l'écran
    const back = (q) => ({ x: x - vec.x * q * imgSize * 0.22, y: y - vec.y * q * imgSize * 0.22 });
    const tail = back(squads - 1);
    for (let k = 0; k < 3 + squads; k++) {   // poussière derrière la colonne
      const life = (t * 0.9 + k / (3 + squads) + ph) % 1;
      const puff = typeof getSprite === 'function' ? getSprite(art(`props/puff_${k % 4}.webp`)) : null;
      if (!puff) break;
      const ps = imgSize * (0.1 + life * 0.14) * (1 + squads * 0.15);
      mapCtx.globalAlpha = 0.45 * (1 - life);
      mapCtx.drawImage(puff, tail.x - vec.x * imgSize * (0.12 + life * 0.22) - ps / 2, tail.y - vec.y * imgSize * (0.12 + life * 0.22) - imgSize * 0.02 - ps / 2, ps, ps);
    }
    mapCtx.globalAlpha = 1;
    const order = Array.from({ length: squads }, (_, q) => ({ q, at: back(q) })).sort((a, b) => a.at.y - b.at.y);   // de haut en bas de l'écran
    for (const { q, at } of order) {
      const type = groupType(q), walk = armyWalkBase(type), phq = ph + q * 1.7;
      mapCtx.save();
      if (walk) {
        const frame = walk + (Math.floor(t * 6 + phq * 3) % 6);   // 6 poses par seconde : sous le rythme de dessin, pas de pose sautée
        mapCtx.translate(at.x, at.y); if (dir < 0) mapCtx.scale(-1, 1);
        drawTileImage(mapCtx, 'units', frame, 0, 0, imgSize, imgSize);
      } else if (tileImages.units[type]) {
        const hop = Math.abs(Math.sin(t * 7 + phq)) * imgSize * 0.035, lean = Math.sin(t * 7 + phq) * 0.045;
        mapCtx.translate(at.x, at.y - hop); mapCtx.rotate(lean); if (dir < 0) mapCtx.scale(-1, 1);
        drawTileImage(mapCtx, 'units', type, 0, 0, imgSize, imgSize);
      }
      mapCtx.restore();
    }
  }
  if (hasSprite && !isMoving) {   // à l'arrêt : les groupes en carré, le premier devant
    const spots = [[0, 0], [-0.2, -0.08], [0.2, -0.08]].slice(0, squads).map((p, q) => ({ p, q })).reverse();
    for (const { p: [ox, oy], q } of spots) { const type = tileImages.units[groupType(q)] ? groupType(q) : mainUnitType; if (tileImages.units[type]) drawTileImage(mapCtx, 'units', type, x + ox * imgSize, y + oy * imgSize, imgSize, imgSize); }
  }
  if (hasSprite) {
    // Draw army name label
    if (mapZoomLevel > 0.8 && army.name) drawMapNamePlate(x, y + size * 0.45, army.name, 9, army.ownerId && player && army.ownerId !== player.id ? '#8a2a1a' : '#c9a227');
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

function drawMapBuilding(x, y, size, fillColor, strokeColor, ctx) {
  // Bug fix : appelée depuis la vue ville (cityCtx) alors qu'elle utilisait mapCtx (indéfini hors carte)
  const _c = ctx || (typeof cityCtx !== 'undefined' && cityCtx) || (typeof mapCtx !== 'undefined' && mapCtx);
  if (!_c) return;
  const height = size * 1.2;
  
  // Building base
  _c.fillStyle = fillColor;
  _c.beginPath();
  _c.ellipse(x, y, size * 0.5, size * 0.25, 0, 0, Math.PI * 2);
  _c.fill();
  
  // Left wall
  _c.fillStyle = shadeColor(fillColor, -15);
  _c.beginPath();
  _c.moveTo(x - size * 0.5, y);
  _c.lineTo(x - size * 0.5, y - height);
  _c.lineTo(x, y - height - size * 0.15);
  _c.lineTo(x, y - size * 0.25);
  _c.closePath();
  _c.fill();
  
  // Right wall
  _c.fillStyle = shadeColor(fillColor, -30);
  _c.beginPath();
  _c.moveTo(x + size * 0.5, y);
  _c.lineTo(x + size * 0.5, y - height);
  _c.lineTo(x, y - height - size * 0.15);
  _c.lineTo(x, y - size * 0.25);
  _c.closePath();
  _c.fill();
  
  // Roof
  _c.fillStyle = strokeColor;
  _c.beginPath();
  _c.ellipse(x, y - height, size * 0.5, size * 0.25, 0, 0, Math.PI * 2);
  _c.fill();
  
  // Roof point
  _c.fillStyle = shadeColor(strokeColor, -20);
  _c.beginPath();
  _c.moveTo(x, y - height - size * 0.5);
  _c.lineTo(x - size * 0.35, y - height + size * 0.1);
  _c.lineTo(x + size * 0.35, y - height + size * 0.1);
  _c.closePath();
  _c.fill();
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
    const visTilesX = mapViewW / tileW;
    const visTilesY = mapViewH / tileH;
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
  navigateMinimapToPosition(e, false);
}

function onMinimapMouseUp(e) {
  if (!minimapDragging) return;
  minimapDragging = false;
  clearTimeout(mapReloadTimeout);
  mapReloadTimeout = setTimeout(() => loadMap(), 150);
}

function navigateMinimapToPosition(e, reload = true) {
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

  // Draw at once with what is loaded; the viewport is fetched when the gesture ends
  if (reload) loadMap(); else scheduleMapRender(true);
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
      try {
        renderMap();
        if (includeMinimapAndUI) {
          renderMinimap();
          updateMapUI();
        }
      } finally {
        mapRenderScheduled = false;   // une erreur de dessin ne bloque jamais les images suivantes
      }
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
    const pick = pickMapTile(mouseX, mouseY);   // the same cell (or city) a click would pick
    mapHoveredTile = { x: pick.x, y: pick.y };
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

// Tile under a canvas point. Cities, resources and armies are drawn above their ground diamond,
// so a click on a sprite lands on the tile behind it: the neighbours whose sprite covers the
// point are checked before reporting empty terrain.
// Where the drawing of a 2 × 2 city reaches above its block centre (as drawIsoCity draws it): painted city 2 × 2 framing,
// or the old sprite (taller for a fortified city)
function cityHitBox(t, tileW) {
  const fl = String(t.faction || 'ROME').toLowerCase(), fortified = (t.cityTier || 0) >= 3;
  const painted = typeof tileImagePainted !== 'undefined' && [...tileImagePainted].some(k => k.startsWith('cities/') && k.includes(fl));
  if (painted) return { half: tileW * 1.0, top: (2 * tileW / WORLD_CITY_FOOTPRINT) * WORLD_CITY_CENTER_Y };
  const size = 3 * tileW * (fortified ? 1.2 : 1);   // cityImageSize for a 2 × 2 block
  return { half: size * 0.32, top: size * mapSpriteAnchor.y };
}
function pickMapTile(mouseX, mouseY) {
  const tileW = ISO_TILE_WIDTH * mapZoomLevel;
  const tileH = ISO_TILE_HEIGHT * mapZoomLevel;
  const dx = mouseX - mapViewW / 2;
  const dy = mouseY - mapViewH / 2;
  const tileX = Math.round(mapOffsetX + (dx / tileW + dy / tileH));
  const tileY = Math.round(mapOffsetY + (dy / tileH - dx / tileW));
  const entityAt = (x, y) => mapData.find(t => t.type === 'CITY' ? (x >= t.x && x <= t.x + 1 && y >= t.y && y <= t.y + 1)
    : t.type === 'ARMY' ? (Math.round(t.drawX ?? t.x) === x && Math.round(t.drawY ?? t.y) === y)   // une armée : là où elle est dessinée
    : (t.x === x && t.y === y && t.type === 'RESOURCE'))   // a city: any of its 2 × 2 cells
    || ((typeof armies !== 'undefined' ? armies : []).filter(a => !a.isGarrison && MOVING_STATUSES[a.status] && Math.round(a.drawX ?? a.x) === x && Math.round(a.drawY ?? a.y) === y)
      .map(a => ({ ...a, type: 'ARMY', ownerId: player?.id }))[0]);   // nos armées en marche (celles à l'arrêt laissent le clic à la ville)
  let tile = entityAt(tileX, tileY);   // what stands on the touched cell itself
  if (!tile && typeof window.mapWorldToScreen === 'function') {
    // otherwise the drawing that covers the touch, the front-most one (drawn last, lowest on the screen) first: a tall
    // sprite whose cell is just below (resource, army), or the walls and roofs of a 2 × 2 city that rise above its block
    const cands = [];
    for (const [ox, oy] of [[1, 1], [1, 0], [0, 1], [2, 2]]) {
      const t = entityAt(tileX + ox, tileY + oy);
      if (t && t.type !== 'CITY') cands.push({ t, y: window.mapWorldToScreen(t.drawX ?? t.x, t.drawY ?? t.y).y });
    }
    for (const t of mapData) {
      if (t.type !== 'CITY') continue;
      const p = window.mapWorldToScreen(t.x + 0.5, t.y + 0.5), box = cityHitBox(t, tileW);
      if (Math.abs(mouseX - p.x) <= box.half && mouseY <= p.y + tileH && mouseY >= p.y - box.top) cands.push({ t, y: p.y });
    }
    cands.sort((a, b) => b.y - a.y);
    if (cands.length) tile = cands[0].t;
  }
  return tile ? { x: tile.x, y: tile.y, tile } : { x: tileX, y: tileY, tile: null };
}

function onMapClick(e) {
  // Prevent click if user dragged the map (threshold: 5 pixels)
  const wasDrag = mapDragDistance > 5;
  mapDragDistance = 0; // Always reset after click evaluation
  if (wasDrag) return;

  const rect = mapCanvas.getBoundingClientRect();
  const picked = pickMapTile(e.clientX - rect.left, e.clientY - rect.top);
  mapSelectedTile = { x: picked.x, y: picked.y };
  showMapInfoPanel(picked.x, picked.y, picked.tile);
  renderMap();
}

// Touch handlers for mobile
let touchStartDist = 0;
let touchStartZoom = 1;
let touchPinched = false;
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

    mapZoomLevel = Math.max(0.3, Math.min(3, touchStartZoom * (dist / touchStartDist)));
    touchPinched = true;
    scheduleMapRender(true);
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
    scheduleMapRender(true);
  }
}

function onMapTouchEnd(e) {
  mapDragging = false;

  // Simulate click/tap if no significant drag (never at the end of a pinch, nor while another finger still touches)
  if (touchDragDistance < 10 && touchStartPos && !touchPinched && !(e.touches && e.touches.length)) {
    const rect = mapCanvas.getBoundingClientRect();
    const picked = pickMapTile(touchStartPos.x - rect.left, touchStartPos.y - rect.top);
    mapSelectedTile = { x: picked.x, y: picked.y };
    showMapInfoPanel(picked.x, picked.y, picked.tile);
    renderMap();
  }

  // Reload map data after a significant drag or a pinch (debounced)
  if (touchDragDistance >= 10 || touchPinched) {
    clearTimeout(mapReloadTimeout);
    mapReloadTimeout = setTimeout(() => loadMap(), 300);
  }

  touchPinched = false;
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
  const centerX = mapViewW / 2;
  const centerY = mapViewH / 2;
  const dx = mouseX - centerX;
  const dy = mouseY - centerY;

  // Position du monde sous le curseur avant zoom (conversion isométrique)
  const worldXBefore = mapOffsetX + (dx / tileW + dy / tileH);
  const worldYBefore = mapOffsetY + (dy / tileH - dx / tileW);

  // Appliquer le zoom (plus fluide)
  const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
  mapZoomLevel = Math.max(0.3, Math.min(3, mapZoomLevel * zoomFactor));

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
  mapZoomLevel = Math.max(0.3, Math.min(3, mapZoomLevel * zoomFactor));
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
    const hasArmy = armies.some(a => a.status === 'IDLE' && !a.isGarrison && a.units?.length > 0);
    
    if (isMyCity) {
      content.innerHTML = `
        <h3>${tile.isCapital ? resIconHtml('crown') : resIconHtml('city')} ${escapeHtml(tile.name || 'Ville')}</h3>
        <p>Position: (${x}, ${y})</p>
        <p style="color:#4caf50">Votre ville</p>
        ${tile.isSieged ? `<p style="color:#e53935;font-weight:bold">${resIconHtml('attack')} Ville assiégée</p>` : ''}
        <div class="panel-actions">
          <button class="btn btn-primary" onclick="goToCity('${tile.id}')">${resIconHtml('home')} Visiter</button>
          ${tile.isSieged ? `<button class="btn btn-danger" onclick="closeMapPanel(); openBreakSiege('${tile.id}')">${resIconHtml('attack')} Briser le siège</button>` : ''}
          ${mapShareButton(tile.x, tile.y)}
        </div>
      `;
      panel.style.display = 'flex';
    } else {
      // Other player's city - check diplomacy first
      showMapInfoPanelWithDiplomacy(x, y, tile, hasArmy, panel, content);
      return; // async
    }
  } else if (tile.type === 'ARMY') {
    const mine = tile.ownerId === player?.id;
    const what = { MOVING: 'en marche', ATTACKING: 'en route pour attaquer', RAIDING: 'en route pour piller', RETURNING: 'sur le chemin du retour', SPYING: 'en mission d\'espionnage', TRANSPORTING: 'convoi en route', HARVESTING: 'récolte un point', FOUNDING: 'fonde une ville', BESIEGING: 'assiège une ville', IDLE: 'à l\'arrêt' }[tile.status] || '';
    content.innerHTML = `
      <h3>${resIconHtml('army')} ${escapeHtml(tile.name || 'Armée')}</h3>
      <p>${mine ? 'Votre armée' : `Armée de ${escapeHtml(tile.ownerName || 'un autre joueur')}`}${what ? ' — ' + what : ''}</p>
      ${mine ? `<div class="panel-actions"><button class="btn btn-primary" onclick="closeMapPanel(); openNotificationLink({ to: 'army', armyId: '${String(tile.id).replace(/[^\w-]/g, '')}' })">${resIconHtml('army')} Voir l'armée</button></div>` : ''}
    `;
    panel.style.display = 'flex';
  } else if (tile.type === 'RESOURCE') {
    const resourceIcons = {
      'WOOD': `${resIconHtml('wood')} Forêt`,
      'STONE': `${resIconHtml('stone')} Carrière`,
      'IRON': `${resIconHtml('iron')} Mine de fer`,
      'FOOD': `${resIconHtml('food')} Oasis`,
      'GOLD': `${resIconHtml('gold')} Mine d'or`
    };
    const resourceName = resourceIcons[tile.resourceType] || `${resIconHtml('item_crate')} Ressource`;
    const hasArmy = armies.some(a => a.status === 'IDLE' && !a.isGarrison && a.units?.length > 0);

    // Check if tribe is defeated (respawning)
    const isDefeated = tile.lastDefeat && !tile.hasDefenders;
    const respawnTime = tile.lastDefeat ? new Date(new Date(tile.lastDefeat).getTime() + tile.respawnMinutes * 60000) : null;
    const canRaid = respawnTime ? new Date() > respawnTime : true;

    // Build defenders display
    let defendersHtml = '';
    if (tile.hasDefenders && tile.defenderUnits && Object.keys(tile.defenderUnits).length > 0) {
      const unitNames = {
        warrior: 'Guerriers',
        archer: 'Archers',
        cavalry: 'Cavalerie',
        elite: 'Élite'
      };
      defendersHtml = `
        <div style="margin: 8px 0; padding: 8px; background: rgba(139,69,19,0.3); border-radius: 4px; border-left: 3px solid #c44;">
          <p style="margin: 0 0 5px 0; color: #f44;"><strong>${tribeIconHtml()} Tribu locale</strong></p>
          <p style="margin: 2px 0; font-size: 12px;">Puissance: <strong style="color:#ff6b6b">${tile.defenderPower}</strong></p>
          ${Object.entries(tile.defenderUnits).map(([unit, count]) =>
            `<p style="margin: 2px 0; font-size: 11px; color: #ccc;">${unitNames[unit] || escapeHtml(getUnitName(unit))}: ${count}</p>`
          ).join('')}
        </div>
      `;
    } else if (isDefeated && !canRaid) {
      const timeLeft = Math.max(0, Math.ceil((respawnTime - new Date()) / 60000));
      defendersHtml = `
        <div style="margin: 8px 0; padding: 8px; background: rgba(76,175,80,0.2); border-radius: 4px; border-left: 3px solid #4caf50;">
          <p style="margin: 0; color: #4caf50;">${resIconHtml('skull')} Tribu vaincue</p>
          <p style="margin: 2px 0; font-size: 11px; color: #888;">Respawn dans ${timeLeft} min</p>
        </div>
      `;
    }

    // Armées qui tiennent le point : les siennes et celles de son alliance partagent la récolte, les autres se combattent
    const holders = tile.holders || [];
    const heldByOthers = holders.length > 0 && !holders.every(h => h.playerId === player?.id || (player?.allianceId && h.allianceId === player.allianceId));
    const holdersHtml = holders.length ? `
        <div style="margin: 8px 0; padding: 8px; background: rgba(33,150,243,0.15); border-radius: 4px; border-left: 3px solid ${heldByOthers ? '#f44' : '#4caf50'};">
          <p style="margin: 0; font-size: 12px;"><strong>${resIconHtml('army')} ${holders.some(h => h.founding) ? 'Ville en fondation par' : 'Tenu par'}</strong> ${[...new Set(holders.map(h => h.name || 'un joueur'))].map(escapeHtml).join(', ')}${heldByOthers ? ' (adversaire)' : ' (vous ou votre alliance)'}</p>
        </div>` : '';
    content.innerHTML = `
      <h3>${resourceName}</h3>
      <p>Position: (${x}, ${y})</p>
      <p>Niveau: <strong style="color:#ffd700">★${'★'.repeat(Math.max(0, Math.min(2, tile.level - 1)))}<span class="star-empty">${'☆'.repeat(Math.max(0, 3 - tile.level))}</span></strong> (${tile.level}/3)</p>
      <p>Stock : <strong>${stockLabel(tile.amount, tile.maxAmount)}</strong> <span class="stock-bar"><span style="width:${Math.round(stockRatio(tile.amount, tile.maxAmount) * 100)}%"></span></span></p>
      <p>Biome: ${tile.biome === 'forest' ? `${resIconHtml('tree')} Forêt` : tile.biome === 'desert' ? 'Désert' : 'Neige'}</p>
      ${defendersHtml}
      ${holdersHtml}
      <div class="panel-actions player-actions">
        ${tile.hasDefenders ? `
          <button class="btn btn-danger" onclick="raidResource('${tile.id}', ${x}, ${y})" ${!hasArmy ? 'disabled title="Aucune armée disponible"' : ''}>${resIconHtml('attack')} Attaquer la tribu</button>
        ` : heldByOthers ? `
          <button class="btn btn-danger" onclick="raidResource('${tile.id}', ${x}, ${y})" ${!hasArmy ? 'disabled title="Aucune armée disponible"' : ''}>${resIconHtml('attack')} Attaquer l'armée qui tient le point</button>
        ` : holders.some(h => h.founding) ? `
          <p style="margin: 0; font-size: 12px; opacity: .85;">Fondation en cours : le point ne peut plus être récolté.</p>
        ` : `
          <button class="btn btn-success" onclick="collectResource('${tile.id}', ${x}, ${y})" ${!hasArmy ? 'disabled title="Aucune armée disponible"' : ''}>${resIconHtml('item_crate')} ${holders.length ? 'Collecter (point partagé)' : 'Collecter'}</button>
          ${!holders.length && tile.resourceType !== 'GOLD' && typeof foundCityAt === 'function' ? `<button class="btn btn-primary" onclick="foundCityAt('${tile.id}', ${x}, ${y})" title="Un colon et 3 000 de chaque ressource ; 24 h sur place">${settlerIcon()} Fonder une ville</button>` : ''}
        `}
        <button class="btn btn-secondary" onclick="sendArmyTo(${x}, ${y})" ${!hasArmy ? 'disabled' : ''}>${resIconHtml('send')} Envoyer une armée</button>
        ${mapShareButton(x, y)}
      </div>
    `;
    panel.style.display = 'flex';
  }
}
// Partager une position dans la messagerie (alliance, global, amis, message privé)
function mapShareButton(x, y) {
  return typeof openSharePicker === 'function' ? `<button class="btn btn-secondary" onclick="closeMapPanel(); openSharePicker({ type: 'position', x: ${Number(x)}, y: ${Number(y)} })">${resIconHtml('pin')} Partager la position</button>` : '';
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
    'ALLY': `${resIconHtml('alliance')} Allié`,
    'NEUTRAL': 'Neutre',
    'ENEMY': `${resIconHtml('attack')} Ennemi`,
    'SAME_ALLIANCE': `${resIconHtml('defense')} Même alliance`
  };
  
  const statusColor = statusColors[diplomacyStatus] || '#9e9e9e';
  const statusLabel = statusLabels[diplomacyStatus] || 'Inconnu';
  
  content.innerHTML = `
    <h3>${tile.isCapital ? resIconHtml('crown') : resIconHtml('city')} ${escapeHtml(tile.name || 'Ville')}</h3>
    <p>Position: (${x}, ${y})</p>
    <p>Propriétaire: <strong>${escapeHtml(tile.playerName || 'Inconnu')}</strong></p>
    <p>Statut: <span style="color:${statusColor};font-weight:bold">${statusLabel}</span></p>
    ${tile.isSieged ? `<p style="color:#e53935;font-weight:bold">${resIconHtml('attack')} Ville assiégée</p>` : ''}
    <div class="panel-actions player-actions">
      ${tile.isSieged ? `<button class="btn btn-danger" onclick="closeMapPanel(); openBreakSiege('${tile.id}')">${resIconHtml('attack')} Briser le siège</button>` : ''}
      <button class="btn btn-info" onclick="viewPlayerProfile('${tile.playerId}')">${resIconHtml('player')} Profil</button>
      ${typeof openChatWith === 'function' && tile.playerId ? `<button class="btn btn-secondary" onclick="closeMapPanel(); openChatWith('${String(tile.playerId).replace(/[^\w-]/g, '')}', ${chatJsArg(tile.playerName || '')})">${resIconHtml('send')} Écrire</button>` : ''}
      ${mapShareButton(tile.x, tile.y)}
      <button class="btn btn-warning" onclick="spyFromMap('${tile.id}')" ${!hasArmy ? 'disabled' : ''}>${resIconHtml('spy')} Espionner</button>
      ${canAttack ? `
        <button class="btn btn-danger" onclick="attackFromMap('${tile.id}', ${x}, ${y})" ${!hasArmy ? 'disabled' : ''}>${resIconHtml('attack')} Attaquer</button>
        <button class="btn btn-raid" onclick="raidFromMap('${tile.id}')" ${!hasArmy ? 'disabled' : ''}>${resIconHtml('gold')} Piller</button>
      ` : `
        <button class="btn btn-danger" disabled title="Impossible d'attaquer un allié">${resIconHtml('attack')} Attaquer</button>
        <button class="btn btn-raid" disabled title="Impossible de piller un allié">${resIconHtml('gold')} Piller</button>
      `}
      ${canTransport ? `
        <button class="btn btn-success" onclick="sendResourcesFromMap('${tile.id}', ${escapeHtml(JSON.stringify(tile.name || ''))})" ${!hasArmy ? 'disabled' : ''}>${resIconHtml('send')} Envoyer ressources</button>
      ` : `
        <button class="btn btn-success" disabled title="Impossible d'envoyer des ressources à un ennemi">${resIconHtml('send')} Envoyer</button>
      `}
    </div>
    ${!hasArmy ? '<p style="font-size:11px;color:#888;margin-top:8px">Aucune armée disponible</p>' : ''}
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
      <h2>${resIconHtml('player')} ${escapeHtml(p.name)}</h2>
      <div class="profile-info">
        <div class="profile-stat"><span>Faction:</span> <strong>${p.faction}</strong></div>
        <div class="profile-stat"><span>Population:</span> <strong>${formatNum(p.population)}</strong></div>
        <div class="profile-stat"><span>Villes:</span> <strong>${p.citiesCount}</strong></div>
        ${p.alliance ? `<div class="profile-stat"><span>Alliance:</span> <strong>[${escapeHtml(p.alliance.tag)}] ${escapeHtml(p.alliance.name)}</strong></div>` : ''}
        ${p.hero ? `<div class="profile-stat"><span>Héros:</span> <strong>${escapeHtml(p.hero.name)} (Niv.${p.hero.level})</strong></div>` : ''}
        ${p.stats ? `
          <div class="profile-stat"><span>Attaques gagnées:</span> <strong>${p.stats.attacksWon}</strong></div>
          <div class="profile-stat"><span>Défenses gagnées:</span> <strong>${p.stats.defensesWon}</strong></div>
        ` : ''}
      </div>
      <h4>${resIconHtml('city')} Villes</h4>
      <div class="profile-cities">
        ${(p.cities || []).map(c => `
          <div class="profile-city">
            ${c.isCapital ? resIconHtml('crown') : resIconHtml('city')} ${escapeHtml(c.name)} (${c.x}, ${c.y})
          </div>
        `).join('')}
      </div>
      <div class="profile-actions">
        ${profileSocialButtons(p)}
        <button class="btn btn-secondary" onclick="closeModal()">Fermer</button>
      </div>
    </div>
  `;
  document.getElementById('modal').style.display = 'flex';
}
// Écrire, amitié, blocage depuis le profil d'un joueur (messagerie, 09c-chat.js)
function profileSocialButtons(p) {
  const r = p.relation;
  if (!r || r.self || typeof openChatWith !== 'function') return '';
  const id = String(p.id).replace(/[^\w-]/g, ''), name = chatJsArg(p.name);
  const after = `closeModal(); setTimeout(() => viewPlayerProfile('${id}'), 300)`;
  const friend = r.friend === 'friends' ? `<button class="btn btn-secondary" onclick="removeFriend('${id}', ${name}, false); ${after}">Retirer des amis</button>`
    : r.friend === 'sent' ? `<button class="btn btn-secondary" onclick="declineFriend('${String(r.requestId).replace(/[^\w-]/g, '')}', false); ${after}">Annuler la demande d'ami</button>`
    : r.friend === 'received' ? `<button class="btn btn-primary" onclick="acceptFriend('${String(r.requestId).replace(/[^\w-]/g, '')}', false); ${after}">Accepter son amitié</button>`
    : r.blocked ? '' : `<button class="btn btn-secondary" onclick="sendFriendRequest({ playerId: '${id}' }, false); ${after}">${resIconHtml('population')} Ajouter en ami</button>`;
  return `
    ${r.blocked ? '' : `<button class="btn btn-primary" onclick="closeModal(); openChatWith('${id}', ${name})">${resIconHtml('send')} Écrire</button>`}
    ${friend}
    ${r.blocked ? `<button class="btn btn-secondary" onclick="unblockPlayer('${id}'); ${after}">Débloquer</button>` : `<button class="btn btn-danger" onclick="closeModal(); blockPlayer('${id}', ${name})">${resIconHtml('lock')} Bloquer</button>`}`;
}

// Spy from map
function spyFromMap(cityId) {
  const army = armies.find(a => a.status === 'IDLE' && !a.isGarrison && a.units?.length > 0);
  if (!army) {
    showToast('Aucune armée disponible', 'error');
    return;
  }
  
  document.getElementById('modal-body').innerHTML = `
    <h3>${resIconHtml('spy')} Espionner</h3>
    <p>Envoyer <strong>${escapeHtml(army.name)}</strong> espionner cette ville ?</p>
    <p style="font-size:12px;color:#888">L'espionnage révèle les bâtiments, armées et ressources de l'ennemi.</p>
    <div style="margin-top:15px">
      <button onclick="confirmSpyFromMap('${army.id}', '${cityId}')" class="btn btn-warning">${resIconHtml('spy')} Espionner</button>
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
  const army = armies.find(a => a.status === 'IDLE' && !a.isGarrison && a.units?.length > 0);
  if (!army) {
    showToast('Aucune armée disponible', 'error');
    return;
  }
  
  // Carry capacity: unit transport stats × faction bonus (EGYPT +10%), like the server
  const transportBonus = player?.faction === 'EGYPT' ? 1.10 : 1;
  const capacity = Math.floor(army.units.reduce((sum, u) => {
    const unitDef = unitsData.find(ud => ud.key === u.unitKey);
    return sum + (unitDef?.stats?.transport || 50) * u.count;
  }, 0) * transportBonus);
  
  document.getElementById('modal-body').innerHTML = `
    <h3>${resIconHtml('send')} Envoyer des ressources</h3>
    <p>Vers: <strong>${escapeHtml(cityName)}</strong></p>
    <p>Armée: <strong>${escapeHtml(army.name)}</strong></p>
    <p>Capacité: <strong>${formatNum(capacity)}</strong></p>
    
    <div class="resource-inputs">
      <div class="resource-input">
        <label>${resIconHtml('wood')} Bois</label>
        <input type="number" id="map-send-wood" value="0" min="0" max="${Math.floor(currentCity?.wood || 0)}" inputmode="numeric">
      </div>
      <div class="resource-input">
        <label>${resIconHtml('stone')} Pierre</label>
        <input type="number" id="map-send-stone" value="0" min="0" max="${Math.floor(currentCity?.stone || 0)}" inputmode="numeric">
      </div>
      <div class="resource-input">
        <label>${resIconHtml('iron')} Fer</label>
        <input type="number" id="map-send-iron" value="0" min="0" max="${Math.floor(currentCity?.iron || 0)}" inputmode="numeric">
      </div>
      <div class="resource-input">
        <label>${resIconHtml('food')} Nourriture</label>
        <input type="number" id="map-send-food" value="0" min="0" max="${Math.floor(currentCity?.food || 0)}" inputmode="numeric">
      </div>
    </div>
    
    <div style="margin-top:15px">
      <button onclick="confirmSendResources('${army.id}', '${cityId}')" class="btn btn-success">${resIconHtml('send')} Envoyer</button>
      <button onclick="closeModal()" class="btn btn-secondary">Annuler</button>
    </div>
  `;
  document.getElementById('modal').style.display = 'flex';
}

async function confirmSendResources(armyId, cityId) {
  const wood = parseInt(document.getElementById('map-send-wood')?.value) || 0;
  const stone = parseInt(document.getElementById('map-send-stone')?.value) || 0;
  const iron = parseInt(document.getElementById('map-send-iron')?.value) || 0;
  const food = parseInt(document.getElementById('map-send-food')?.value) || 0;

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
  const army = armies.find(a => a.status === 'IDLE' && !a.isGarrison && a.units?.length > 0);
  if (!army) {
    showToast('Aucune armée disponible', 'error');
    return;
  }
  
  document.getElementById('modal-body').innerHTML = `
    <h3>Confirmer l'attaque</h3>
    <p>Envoyer <strong>${escapeHtml(army.name)}</strong> attaquer la ville à (${x}, ${y}) ?</p>
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
  const army = armies.find(a => a.status === 'IDLE' && !a.isGarrison && a.units?.length > 0);
  if (army) {
    document.getElementById('modal-body').innerHTML = `
      <h3>Confirmer le raid</h3>
      <p>Envoyer <strong>${escapeHtml(army.name)}</strong> piller cette ville ?</p>
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
  const availableArmies = armies.filter(a => a.status === 'IDLE' && !a.isGarrison && a.units?.length > 0);
  if (availableArmies.length === 0) {
    showToast('Aucune armée disponible', 'error');
    return;
  }

  // Find the resource tile to show defender info
  const tile = mapData.find(t => t.id === nodeId);
  const defenderInfo = tile && tile.defenderUnits && Object.keys(tile.defenderUnits).length ? Object.entries(tile.defenderUnits)
    .map(([unit, count]) => `<span class="unit-chip">${unitIconHtml(unit, 'unit-ico-sm')} ${escapeHtml(getUnitName(unit))} ×${formatNum(count)} ${infoBtnHtml('unit', unit, 'info-btn-sm')}</span>`).join(' ') : 'Inconnu';

  // Build army selection
  const armyOptions = availableArmies.map(a => {
    const totalUnits = a.units?.reduce((sum, u) => sum + u.count, 0) || 0;
    return `<option value="${a.id}">${escapeHtml(a.name)} (${totalUnits} unités)</option>`;
  }).join('');

  document.getElementById('modal-body').innerHTML = `
    <h3>${resIconHtml('attack')} Attaquer la tribu locale</h3>
    <div style="background:rgba(244,67,54,0.1); padding:10px; border-radius:8px; margin:10px 0; border-left:3px solid #f44;">
      <p style="margin:0;"><strong>${resIconHtml('defense')} Défenseurs :</strong> ${defenderInfo}</p>
      <p style="margin:5px 0 0 0; color:#f44;"><strong>Puissance:</strong> ${tile?.defenderPower || '?'}</p>
    </div>
    <p>Position: (${x}, ${y})</p>
    <label style="display:block; margin:10px 0 5px;">Sélectionner une armée:</label>
    <select id="raid-army-select" style="width:100%; padding:8px; margin-bottom:15px; background:#2a2418; color:#f5e6c8; border:1px solid #8b6914; border-radius:4px;">
      ${armyOptions}
    </select>
    <div style="display:flex; gap:10px;">
      <button onclick="confirmRaidResource('${nodeId}')" class="btn btn-danger" style="flex:1;">${resIconHtml('attack')} Attaquer</button>
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

  closeModal();
  closeMapPanel();
  try {
    const res = await fetch(`${API}/api/army/${armyId}/raid-resource`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ resourceNodeId: nodeId })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(data.error || 'Erreur lors du raid', 'error'); return; }
    if (data.combatResult) showRaidResourceResult(data);
    else showToast('Armée en route vers la ressource', 'success');
    await loadArmies();
    loadMap();
  } catch (e) {
    showToast('Erreur réseau', 'error');
  }
}

function showRaidResourceResult(data) {
  const result = data.combatResult;
  const won = result.winner === 'attacker';

  document.getElementById('modal-body').innerHTML = `
    <h3>${won ? resIconHtml('medal') + ' Victoire' : resIconHtml('skull') + ' Défaite'}</h3>
    <div style="background:${won ? 'rgba(76,175,80,0.2)' : 'rgba(244,67,54,0.2)'}; padding:15px; border-radius:8px; margin:10px 0;">
      <p><strong>Résultat:</strong> ${won ? 'Tribu vaincue!' : 'Votre armée a été repoussée'}</p>
      <p><strong>Vos pertes:</strong> ${result.attackerLosses || 0} unités</p>
      <p><strong>Pertes ennemies:</strong> ${result.defenderLosses || 0} unités</p>
      ${won && data.loot ? `
        <div style="margin-top:10px; padding-top:10px; border-top:1px solid rgba(255,255,255,0.2);">
          <p><strong>${resIconHtml('gold')} Butin récupéré :</strong></p>
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
  const availableArmies = armies.filter(a => a.status === 'IDLE' && !a.isGarrison && a.units?.length > 0);
  if (availableArmies.length === 0) {
    showToast('Aucune armée disponible', 'error');
    return;
  }

  const tile = mapData.find(t => t.id === nodeId);
  const armyOptions = availableArmies.map(a => {
    const carryCapacity = (a.units || []).reduce((sum, u) => sum + u.count * (unitsData.find(d => d.key === u.unitKey)?.stats?.transport || 50), 0);
    return `<option value="${a.id}">${escapeHtml(a.name)} (capacité: ${formatNum(carryCapacity)})</option>`;
  }).join('');

  document.getElementById('modal-body').innerHTML = `
    <h3>${resIconHtml('tools')} Récolter des ressources</h3>
    <div style="background:rgba(76,175,80,0.2); padding:10px; border-radius:8px; margin:10px 0; border-left:3px solid #4caf50;">
      <p style="margin:0;"><strong>${tile?.resourceType || 'Ressource'} :</strong> stock ${tile ? stockLabel(tile.amount, tile.maxAmount) : 'inconnu'}</p>
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
      <button onclick="confirmCollectResource('${nodeId}')" class="btn btn-success" style="flex:1;">${resIconHtml('tools')} Démarrer la récolte</button>
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

  closeModal();
  closeMapPanel();
  let res, data;
  try {
    res = await fetch(`${API}/api/army/${armyId}/collect-resource`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ resourceNodeId: nodeId })
    });
    data = await res.json().catch(() => ({}));
  } catch (e) {
    showToast('Erreur réseau', 'error');
    return;
  }

  if (res.ok) {
    if (data.status === 'HARVESTING') {
      // Récolte progressive
      showToast(`Récolte démarrée! ${data.harvestRate}/min - Capacité: ${formatNum(data.carryCapacity)}`, 'success');
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
    showToast(data.error || 'Erreur lors de la collecte', 'error');
  }
}

async function sendArmyTo(x, y) {
  const army = armies.find(a => a.status === 'IDLE' && !a.isGarrison && a.units?.length > 0);
  if (!army) {
    showToast('Aucune armée disponible', 'error');
    return;
  }
  closeMapPanel();
  try {
    const res = await fetch(`${API}/api/army/${army.id}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ x, y })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { showToast(data.error || 'Déplacement impossible', 'error'); return; }
    showToast('Armée en route!', 'success');
    await loadArmies();
    loadMap();
  } catch (e) {
    showToast('Erreur réseau', 'error');
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
        mapViewW = Math.max(container.clientWidth, 300);
        mapViewH = Math.max(container.clientHeight, 200);
        sizeCanvasForDpr(mapCanvas, mapCtx, mapViewW, mapViewH);
      }
      renderMap();
      renderMinimap();
    }
    // Resize city/fields canvas
    if (cityCanvas) {
      const container = cityCanvas.parentElement;
      if (container && container.clientWidth > 0) {
        cityViewW = Math.max(container.clientWidth, 300);
        cityViewH = Math.max(container.clientHeight, 200);
        sizeCanvasForDpr(cityCanvas, cityCtx, cityViewW, cityViewH);
      }
      calculateCitySlots();
      if (currentCityView === 'fields') calculateFieldSlots();
      renderCityCanvas();
    }
  }, 150);
});

