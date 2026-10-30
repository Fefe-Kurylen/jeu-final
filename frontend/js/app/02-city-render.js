// ============================================================
// 02-city-render.js — Canvas de la ville : initialisation et boucle d'animation (onglets Ville et Champs)
// (la scène isométrique et le dessin sont dans 04b-iso-scene.js, 03-fields-render.js, 04-buildings-render.js)
// Découpé depuis app.js (lignes 582-2465) — portée globale partagée,
// l'ordre de chargement dans index.html doit être respecté.
// ============================================================
let cityCanvas, cityCtx;
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

// Animation loop state
let cityAnimationRunning = false;
let cityAnimationFrame = null;
let cityAnimationTimer = null;

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
  if (cityAnimationTimer) {
    clearTimeout(cityAnimationTimer);
    cityAnimationTimer = null;
  }
}

let lastCityFrameTime = 0;
const CITY_FRAME_INTERVAL = 50;   // 20 i/s pendant un geste (déplacement, pincement)
const CITY_IDLE_INTERVAL = 83;    // 12 i/s au repos : fumée, drapeaux, reflets, oiseaux

// Image suivante dans `delay` ms : un minuteur puis requestAnimationFrame (calé sur l'affichage) ; entre deux images,
// le fil principal dort au lieu de se réveiller à chaque rafraîchissement de l'écran
function scheduleCityFrame(delay) {
  cityAnimationTimer = setTimeout(() => {
    cityAnimationTimer = null;
    if (cityAnimationRunning) cityAnimationFrame = requestAnimationFrame(animateCityView);
  }, Math.max(0, delay));
}

function animateCityView() {
  cityAnimationFrame = null;
  if (!cityAnimationRunning) return;

  // Only animate if city tab is visible
  const cityTab = document.getElementById('tab-city');
  if (!cityTab || !cityTab.classList.contains('active')) {
    scheduleCityFrame(CITY_IDLE_INTERVAL);
    return;
  }

  // 12 i/s au repos, 20 i/s pendant un geste ; page masquée : une image toutes les 2 s
  const gesture = typeof cityGesture !== 'undefined' && cityGesture.pointers.size > 0;
  const visible = document.visibilityState === 'visible';
  const interval = !visible ? 2000 : gesture ? CITY_FRAME_INTERVAL : CITY_IDLE_INTERVAL;
  const now = performance.now();
  const elapsed = now - lastCityFrameTime;
  if (elapsed >= interval) {
    lastCityFrameTime = now;
    renderCityCanvas();
    scheduleCityFrame(interval);
  } else {
    scheduleCityFrame(interval - elapsed);
  }
}

function renderCityCanvas() {
  if (!cityCtx || !cityCanvas) {
    initCityCanvas();
    if (!cityCtx) return;
  }

  // Une seule scène : l'onglet Champs cadre la même ville (renderCityView calcule les emplacements)
  renderCityView();
}
