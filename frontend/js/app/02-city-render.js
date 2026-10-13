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
    // Touch support for mobile
    cityCanvas.addEventListener('touchend', (e) => {
      if (e.changedTouches.length === 1) {
        const touch = e.changedTouches[0];
        const rect = cityCanvas.getBoundingClientRect();
        const fakeEvent = { offsetX: touch.clientX - rect.left, offsetY: touch.clientY - rect.top };
        onCityClick(fakeEvent);
      }
    }, { passive: true });
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
    // Touch support for mobile
    fieldsCanvas.addEventListener('touchend', (e) => {
      if (e.changedTouches.length === 1) {
        const touch = e.changedTouches[0];
        const rect = fieldsCanvas.getBoundingClientRect();
        const fakeEvent = { offsetX: touch.clientX - rect.left, offsetY: touch.clientY - rect.top };
        onFieldsClick(fakeEvent);
      }
    }, { passive: true });
  }

  // Calculate field slot positions
  calculateFieldSlots();
}

function calculateCitySlots() {
  if (!cityCanvas) return;
  
  const w = cityViewW;
  const h = cityViewH;
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
  
  const w = cityViewW;
  const h = cityViewH;
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
  const w = cityViewW;
  const h = cityViewH;
  const centerX = w / 2;
  const centerY = h / 2 + 20;
  const nightMode = isNightMode();
  const biome = cityBiome();
  const scene = biomeScene(biome);

  // Clear
  cityCtx.clearRect(0, 0, w, h);

  // ========== SKY (Day/Night, biome tint by day) ==========
  const skyGrad = cityCtx.createLinearGradient(0, 0, 0, h * 0.5);
  if (nightMode) {
    // Night sky - deep blue/purple
    skyGrad.addColorStop(0, '#0a1020');
    skyGrad.addColorStop(0.3, '#152040');
    skyGrad.addColorStop(0.7, '#203050');
    skyGrad.addColorStop(1, '#304060');
  } else {
    skyGrad.addColorStop(0, scene.sky[0]);
    skyGrad.addColorStop(0.5, scene.sky[1]);
    skyGrad.addColorStop(1, scene.sky[2]);
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
  drawMountains(w, h, nightMode, biome);

  // ========== PLAINS / GROUND ==========
  const groundY = h * 0.45;

  // Far ground: prairie, sand or snow according to the city's biome (texture + day/night gradient)
  const farGrassGrad = biomeGroundGradient(cityCtx, 0, groundY, 0, h, biome, nightMode);
  cityCtx.beginPath();
  cityCtx.rect(0, groundY, w, h - groundY);
  fillTextured(cityCtx, scene.texture, farGrassGrad, nightMode ? 0.88 : 0.5);

  // ========== DISTANT TREES (forest line) ==========
  if (biome !== 'desert') drawForestLine(w, groundY, nightMode);

  // ========== RIVER (none in the desert) ==========
  if (biome !== 'desert') drawRiver(w, h, groundY, nightMode);

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

  // Step 1: Draw the city ground (grass, sand or snow by biome, textured)
  const grassGrad = biomeInnerGradient(cityCtx, centerX, centerY, innerRadius, biome, nightMode);
  cityCtx.beginPath();
  cityCtx.ellipse(centerX, centerY, innerRadius, innerRadius * 0.5, 0, 0, Math.PI * 2);
  fillTextured(cityCtx, scene.texture, grassGrad, nightMode ? 0.88 : 0.45);

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

  // Road surface (beaten earth texture under the colour)
  cityCtx.lineWidth = pathWidth;
  cityCtx.beginPath();
  cityCtx.ellipse(centerX, centerY, roadRadius, roadRadius * 0.5, 0, 0, Math.PI * 2);
  strokeTextured(cityCtx, 'dirt', roadColor, nightMode ? 0.85 : 0.4);

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
  cityCtx.beginPath();
  cityCtx.rect(centerX - pw / 2, centerY - roadRadius * 0.5, pw, roadRadius);
  // Horizontal path (E-W)
  cityCtx.rect(centerX - roadRadius, centerY - pw * 0.35, roadRadius * 2, pw * 0.7);
  fillTextured(cityCtx, 'dirt', pathColor, nightMode ? 0.85 : 0.4);

  // Center plaza (circular platform)
  const plazaGrad = cityCtx.createRadialGradient(centerX, centerY, 0, centerX, centerY, pathWidth * 2);
  plazaGrad.addColorStop(0, pathLight);
  plazaGrad.addColorStop(0.7, pathColor);
  plazaGrad.addColorStop(1, roadDark);
  cityCtx.beginPath();
  cityCtx.ellipse(centerX, centerY, pathWidth * 2, pathWidth * 1.1, 0, 0, Math.PI * 2);
  fillTextured(cityCtx, 'dirt', plazaGrad, nightMode ? 0.85 : 0.5);
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

function drawMountains(w, h, nightMode = false, biome = 'forest') {
  const mountainY = h * 0.45;

  // Far mountains (blue/purple, sandy in the desert, pale in the snow - darker at night)
  const dayColor = biome === 'desert' ? '#b89a6a' : biome === 'snow' ? '#b9c7d6' : '#8090a8';
  cityCtx.fillStyle = nightMode ? '#2a3040' : dayColor;
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

  // Sprites de décor du biome (assets/images/props) quand ils sont chargés, dessin procédural sinon
  const variant = spriteVariant(false);
  const props = biomeScene(cityBiome()).props;
  rocks.forEach(rock => {
    const dx = rock.x - centerX;
    const dy = rock.y - centerY;
    if (Math.sqrt(dx*dx + dy*dy) < 200) return;
    if (!drawProp(cityCtx, props.rock, rock.x, rock.y + 3, rock.size * 1.5, variant)) drawRock(rock.x, rock.y, rock.size, nightMode);
  });

  trees.forEach(tree => {
    const dx = tree.x - centerX;
    const dy = tree.y - centerY;
    if (Math.sqrt(dx*dx + dy*dy) < 200) return;
    if (!drawProp(cityCtx, tree.type === 'pine' ? props.trees[0] : props.trees[1], tree.x, tree.y + 4, tree.size * 1.6, variant)) drawTree(tree.x, tree.y, tree.size, nightMode);
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

  // Sprite de champ de blé (même style que les champs de ressources) quand il est chargé
  const cropSprite = getSprite(fieldSpriteUrl('FARM', 8));
  fields.forEach(field => {
    if (cropSprite) {
      drawSprite(cityCtx, cropSprite, field.x + field.w / 2, field.y + field.h / 2, field.w * 1.35, spriteVariant(false));
      return;
    }
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

