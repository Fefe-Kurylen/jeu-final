// ============================================================
// 02-city-render.js — Canvas de la ville : initialisation, boucle d'animation, bascule ville/champs
// (la scène isométrique et le dessin sont dans 04b-iso-scene.js, 03-fields-render.js, 04-buildings-render.js)
// Découpé depuis app.js (lignes 582-2465) — portée globale partagée,
// l'ordre de chargement dans index.html doit être respecté.
// ============================================================
let cityCanvas, cityCtx;
let fieldsCanvas, fieldsCtx;
let cityHoveredSlot = null;
let citySlots = [];
let currentCityView = 'city'; // 'city' ou 'fields'

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
  const gesture = typeof cityGesture !== 'undefined' && cityGesture.pointers.size > 0;
  const visible = document.visibilityState === 'visible';
  const interval = !visible ? 2000 : gesture ? CITY_FRAME_INTERVAL : 83;   // 12 i/s : fumée, reflets, oiseaux
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
  cityHoveredSlot = null;

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
