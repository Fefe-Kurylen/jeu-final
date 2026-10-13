// ============================================================
// 02-city-render.js — Rendu 2.5D de la ville : canvas, nuit, murs, tours, portes, animations
// Découpé depuis app.js (lignes 582-2465) — portée globale partagée,
// l'ordre de chargement dans index.html doit être respecté.
// ============================================================
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
  // Anneau 1 : 12 champs espacés de 30°, anneau 2 : 6 champs espacés de 60° (décalés de 15°)
  // Les numéros de slot correspondent aux emplacements typés du serveur (101-118)
  fields: [
    // Bois (forêt) - 4 emplacements
    { slot: 1, type: 'LUMBER', angle: 30, ring: 1 },
    { slot: 2, type: 'LUMBER', angle: 75, ring: 2 },
    { slot: 3, type: 'LUMBER', angle: 330, ring: 1 },
    { slot: 4, type: 'LUMBER', angle: 315, ring: 2 },

    // Pierre (carrière) - 4 emplacements
    { slot: 5, type: 'QUARRY', angle: 150, ring: 1 },
    { slot: 6, type: 'QUARRY', angle: 135, ring: 2 },
    { slot: 7, type: 'QUARRY', angle: 210, ring: 1 },
    { slot: 8, type: 'QUARRY', angle: 195, ring: 2 },

    // Fer (mine) - 4 emplacements
    { slot: 9, type: 'IRON_MINE', angle: 15, ring: 2 },
    { slot: 10, type: 'IRON_MINE', angle: 90, ring: 1 },
    { slot: 11, type: 'IRON_MINE', angle: 255, ring: 2 },
    { slot: 12, type: 'IRON_MINE', angle: 270, ring: 1 },

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
  cityViewW = Math.max(width, 300);
  cityViewH = Math.max(height, 200);
  sizeCanvasForDpr(cityCanvas, cityCtx, cityViewW, cityViewH);   // net sur écrans haute densité

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
    // Tactile : géré par les Pointer Events de 04b-iso-scene.js (tap, déplacement, pincement)
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

  // Économie de batterie : 20 i/s seulement quand quelque chose bouge (construction en cours, geste en
  // cours) ; sinon un rafraîchissement toutes les 2 s suffit (les sprites sont statiques)
  const busy = (currentCity?.buildQueue?.some(q => q.status === 'RUNNING')) || (typeof cityGesture !== 'undefined' && cityGesture.pointers.size > 0);
  const interval = busy ? CITY_FRAME_INTERVAL : 2000;
  const now = performance.now();
  if (now - lastCityFrameTime >= interval) {
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



// ========== NIGHT MODE DRAWING FUNCTIONS ==========












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
  const cityRadius = Math.min(cityViewW, cityViewH) * 0.25;
  
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
  const cityRadius = Math.min(cityViewW, cityViewH) * 0.20;
  
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
  
  const cityRadius = Math.min(cityViewW, cityViewH) * 0.20;
  
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
  const cityRadius = Math.min(cityViewW, cityViewH) * 0.25;
  
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

