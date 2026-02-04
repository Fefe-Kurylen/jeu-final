// ============================================================================
// MAP.JS - World Map Renderer v2.0
// Style: Rise of Kingdoms / Travian
// ============================================================================

const mapState = {
  canvas: null,
  ctx: null,
  centerX: 50,
  centerY: 50,
  zoom: 1.0,
  minZoom: 0.5,
  maxZoom: 3.0,
  tileSize: 48,
  data: null,
  isDragging: false,
  dragStart: { x: 0, y: 0 },
  lastMouse: { x: 0, y: 0 },
  selectedTile: null,
  hoveredTile: null,
  animationFrame: null,
  lastUpdate: 0,
  particles: [],
  fog: true,
};

// Enhanced terrain with gradients and textures
const TERRAIN_CONFIG = {
  PLAIN: {
    base: '#4a7c4e',
    light: '#5d9960',
    dark: '#3a6340',
    pattern: 'grass',
  },
  FOREST: {
    base: '#2d5a3a',
    light: '#3a7048',
    dark: '#1f4028',
    pattern: 'trees',
  },
  HILL: {
    base: '#8b7355',
    light: '#a08968',
    dark: '#725f45',
    pattern: 'hills',
  },
  ROCKY: {
    base: '#6b6b6b',
    light: '#808080',
    dark: '#505050',
    pattern: 'rocks',
  },
  DESERT: {
    base: '#c2a679',
    light: '#d4bb8e',
    dark: '#a08860',
    pattern: 'sand',
  },
  SNOW: {
    base: '#e8e8e8',
    light: '#ffffff',
    dark: '#c8c8c8',
    pattern: 'snow',
  },
  MOUNTAIN: {
    base: '#5a5a5a',
    light: '#707070',
    dark: '#404040',
    pattern: 'mountain',
  },
  LAKE: {
    base: '#4a90a4',
    light: '#5aa8c0',
    dark: '#3a7080',
    pattern: 'water',
  },
  RIVER: {
    base: '#5aa4b8',
    light: '#70bcd0',
    dark: '#4a8498',
    pattern: 'water',
  },
};

const RESOURCE_CONFIG = {
  wood: { icon: '🪵', color: '#8B4513', glow: '#a0522d' },
  stone: { icon: '🪨', color: '#708090', glow: '#8899aa' },
  iron: { icon: '⛏️', color: '#4682b4', glow: '#5a9fd4' },
  food: { icon: '🌾', color: '#228B22', glow: '#32cd32' },
  gold: { icon: '💰', color: '#ffd700', glow: '#ffec8b' },
};

// ============================================================================
// INITIALIZATION
// ============================================================================

function initMap() {
  const canvas = document.getElementById('map-canvas');
  if (!canvas) return;

  mapState.canvas = canvas;
  mapState.ctx = canvas.getContext('2d');
  
  // Enable smooth rendering
  mapState.ctx.imageSmoothingEnabled = true;
  mapState.ctx.imageSmoothingQuality = 'high';

  resizeCanvas();
  window.addEventListener('resize', resizeCanvas);
  
  setupMapControls();
  loadMapData();
  
  // Start render loop
  requestAnimationFrame(renderLoop);
}

function resizeCanvas() {
  const container = document.getElementById('world-map');
  if (!container || !mapState.canvas) return;

  const dpr = window.devicePixelRatio || 1;
  const rect = container.getBoundingClientRect();
  
  mapState.canvas.width = rect.width * dpr;
  mapState.canvas.height = rect.height * dpr;
  mapState.canvas.style.width = rect.width + 'px';
  mapState.canvas.style.height = rect.height + 'px';
  
  mapState.ctx.scale(dpr, dpr);
  mapState.displayWidth = rect.width;
  mapState.displayHeight = rect.height;
}

// ============================================================================
// CONTROLS
// ============================================================================

function setupMapControls() {
  const canvas = mapState.canvas;
  if (!canvas) return;

  // Mouse drag
  canvas.addEventListener('mousedown', onMouseDown);
  canvas.addEventListener('mousemove', onMouseMove);
  canvas.addEventListener('mouseup', onMouseUp);
  canvas.addEventListener('mouseleave', onMouseLeave);
  
  // Touch support
  canvas.addEventListener('touchstart', onTouchStart, { passive: false });
  canvas.addEventListener('touchmove', onTouchMove, { passive: false });
  canvas.addEventListener('touchend', onTouchEnd);
  
  // Zoom
  canvas.addEventListener('wheel', onWheel, { passive: false });
  
  // Click
  canvas.addEventListener('click', onMapClick);
  canvas.addEventListener('dblclick', onMapDoubleClick);

  // Keyboard
  document.addEventListener('keydown', onKeyDown);

  // Go to button
  document.getElementById('map-goto-btn')?.addEventListener('click', () => {
    const x = parseInt(document.getElementById('map-goto-x')?.value) || 0;
    const y = parseInt(document.getElementById('map-goto-y')?.value) || 0;
    goToCoords(x, y, true);
  });
}

function onMouseDown(e) {
  mapState.isDragging = true;
  mapState.dragStart = { x: e.clientX, y: e.clientY };
  mapState.lastMouse = { x: e.clientX, y: e.clientY };
  mapState.canvas.style.cursor = 'grabbing';
}

function onMouseMove(e) {
  mapState.lastMouse = { x: e.clientX, y: e.clientY };
  
  if (mapState.isDragging) {
    const dx = e.clientX - mapState.dragStart.x;
    const dy = e.clientY - mapState.dragStart.y;
    
    const scaledTileSize = mapState.tileSize * mapState.zoom;
    mapState.centerX -= dx / scaledTileSize;
    mapState.centerY -= dy / scaledTileSize;
    
    mapState.dragStart = { x: e.clientX, y: e.clientY };
    
    // Load more data if needed
    throttledLoadMapData();
  } else {
    updateHoveredTile(e);
  }
}

function onMouseUp() {
  mapState.isDragging = false;
  mapState.canvas.style.cursor = 'grab';
}

function onMouseLeave() {
  mapState.isDragging = false;
  mapState.hoveredTile = null;
  mapState.canvas.style.cursor = 'grab';
  hideTooltip();
}

function onTouchStart(e) {
  e.preventDefault();
  if (e.touches.length === 1) {
    const touch = e.touches[0];
    mapState.isDragging = true;
    mapState.dragStart = { x: touch.clientX, y: touch.clientY };
  }
}

function onTouchMove(e) {
  e.preventDefault();
  if (e.touches.length === 1 && mapState.isDragging) {
    const touch = e.touches[0];
    const dx = touch.clientX - mapState.dragStart.x;
    const dy = touch.clientY - mapState.dragStart.y;
    
    const scaledTileSize = mapState.tileSize * mapState.zoom;
    mapState.centerX -= dx / scaledTileSize;
    mapState.centerY -= dy / scaledTileSize;
    
    mapState.dragStart = { x: touch.clientX, y: touch.clientY };
    throttledLoadMapData();
  }
}

function onTouchEnd() {
  mapState.isDragging = false;
}

function onWheel(e) {
  e.preventDefault();
  
  const rect = mapState.canvas.getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;
  
  // Zoom toward mouse position
  const worldBefore = screenToWorld(mouseX, mouseY);
  
  const zoomDelta = e.deltaY > 0 ? -0.1 : 0.1;
  mapState.zoom = Math.max(mapState.minZoom, Math.min(mapState.maxZoom, mapState.zoom + zoomDelta));
  
  const worldAfter = screenToWorld(mouseX, mouseY);
  
  // Adjust center to zoom toward mouse
  mapState.centerX += worldBefore.x - worldAfter.x;
  mapState.centerY += worldBefore.y - worldAfter.y;
  
  throttledLoadMapData();
}

function onMapClick(e) {
  if (Math.abs(e.clientX - mapState.dragStart.x) > 5 || Math.abs(e.clientY - mapState.dragStart.y) > 5) {
    return; // Was dragging
  }
  
  const rect = mapState.canvas.getBoundingClientRect();
  const coords = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  
  mapState.selectedTile = coords;
  handleTileClick(coords);
}

function onMapDoubleClick(e) {
  const rect = mapState.canvas.getBoundingClientRect();
  const coords = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  goToCoords(coords.x, coords.y, true);
}

function onKeyDown(e) {
  const moveSpeed = 5;
  switch(e.key) {
    case 'ArrowUp': case 'w': case 'W':
      mapState.centerY -= moveSpeed;
      throttledLoadMapData();
      break;
    case 'ArrowDown': case 's': case 'S':
      mapState.centerY += moveSpeed;
      throttledLoadMapData();
      break;
    case 'ArrowLeft': case 'a': case 'A':
      mapState.centerX -= moveSpeed;
      throttledLoadMapData();
      break;
    case 'ArrowRight': case 'd': case 'D':
      mapState.centerX += moveSpeed;
      throttledLoadMapData();
      break;
    case '+': case '=':
      mapState.zoom = Math.min(mapState.maxZoom, mapState.zoom + 0.1);
      break;
    case '-': case '_':
      mapState.zoom = Math.max(mapState.minZoom, mapState.zoom - 0.1);
      break;
  }
}

// ============================================================================
// DATA LOADING
// ============================================================================

let loadTimeout = null;
function throttledLoadMapData() {
  if (loadTimeout) clearTimeout(loadTimeout);
  loadTimeout = setTimeout(loadMapData, 100);
}

async function loadMapData() {
  try {
    const viewRadius = Math.ceil(20 / mapState.zoom);
    const data = await api.getMapViewport(
      Math.floor(mapState.centerX),
      Math.floor(mapState.centerY),
      viewRadius
    );
    mapState.data = data;
  } catch (error) {
    console.error('Error loading map:', error);
  }
}

// ============================================================================
// RENDERING
// ============================================================================

function renderLoop(timestamp) {
  const deltaTime = timestamp - mapState.lastUpdate;
  mapState.lastUpdate = timestamp;
  
  updateParticles(deltaTime);
  renderMap();
  
  mapState.animationFrame = requestAnimationFrame(renderLoop);
}

function renderMap() {
  const { canvas, ctx, zoom, tileSize, centerX, centerY } = mapState;
  if (!canvas || !ctx) return;

  const width = mapState.displayWidth;
  const height = mapState.displayHeight;
  const scaledTileSize = tileSize * zoom;

  // Clear with dark background
  ctx.fillStyle = '#0d0b09';
  ctx.fillRect(0, 0, width, height);

  // Calculate visible tiles
  const tilesX = Math.ceil(width / scaledTileSize) + 2;
  const tilesY = Math.ceil(height / scaledTileSize) + 2;
  const startX = Math.floor(centerX - tilesX / 2);
  const startY = Math.floor(centerY - tilesY / 2);

  // Draw terrain tiles
  for (let y = 0; y < tilesY; y++) {
    for (let x = 0; x < tilesX; x++) {
      const worldX = startX + x;
      const worldY = startY + y;
      const screenPos = worldToScreen(worldX, worldY);
      
      drawTerrainTile(screenPos.x, screenPos.y, scaledTileSize, worldX, worldY);
    }
  }

  // Draw grid overlay
  drawGrid(startX, startY, tilesX, tilesY, scaledTileSize);

  // Draw entities
  if (mapState.data) {
    // Resources first (below cities)
    (mapState.data.resources || []).forEach(node => {
      const pos = worldToScreen(node.x, node.y);
      drawResourceNode(pos.x, pos.y, scaledTileSize, node);
    });

    // Cities
    (mapState.data.cities || []).forEach(city => {
      const pos = worldToScreen(city.x, city.y);
      const isOwn = city.ownerId === gameState?.player?.id;
      const isAlly = city.allianceId && city.allianceId === gameState?.player?.allianceId;
      drawCity(pos.x, pos.y, scaledTileSize, city, isOwn, isAlly);
    });

    // Armies
    (mapState.data.armies || []).forEach(army => {
      const pos = worldToScreen(army.x, army.y);
      drawArmy(pos.x, pos.y, scaledTileSize, army);
    });
  }

  // Draw particles
  drawParticles();

  // Draw selection highlight
  if (mapState.selectedTile) {
    drawSelection(mapState.selectedTile, scaledTileSize);
  }

  // Draw hover highlight
  if (mapState.hoveredTile && !mapState.isDragging) {
    drawHover(mapState.hoveredTile, scaledTileSize);
  }

  // Draw UI overlay
  drawMapUI(width, height);
}

function drawTerrainTile(x, y, size, worldX, worldY) {
  const { ctx, data } = mapState;
  
  const tile = getTileAt(worldX, worldY);
  const config = tile ? TERRAIN_CONFIG[tile.terrain] : TERRAIN_CONFIG.PLAIN;
  
  // Create gradient for 3D effect
  const gradient = ctx.createLinearGradient(x, y, x + size, y + size);
  gradient.addColorStop(0, config.light);
  gradient.addColorStop(0.5, config.base);
  gradient.addColorStop(1, config.dark);
  
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, size, size);
  
  // Add texture pattern
  drawTerrainPattern(x, y, size, config.pattern, worldX, worldY);
  
  // Add subtle noise for texture
  if (size > 20) {
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.random() * 0.02})`;
    ctx.fillRect(x, y, size, size);
  }
}

function drawTerrainPattern(x, y, size, pattern, worldX, worldY) {
  const { ctx } = mapState;
  
  // Seed random based on position for consistency
  const seed = (worldX * 1000 + worldY) % 100;
  
  ctx.save();
  ctx.globalAlpha = 0.3;
  
  switch(pattern) {
    case 'grass':
      // Small grass tufts
      ctx.fillStyle = '#2d5a3a';
      for (let i = 0; i < 3; i++) {
        const px = x + ((seed + i * 30) % 100) / 100 * size;
        const py = y + ((seed + i * 50) % 100) / 100 * size;
        ctx.beginPath();
        ctx.arc(px, py, size * 0.05, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
      
    case 'trees':
      // Tree icons
      ctx.fillStyle = '#1a4028';
      const treeX = x + size * 0.5;
      const treeY = y + size * 0.5;
      ctx.beginPath();
      ctx.moveTo(treeX, treeY - size * 0.3);
      ctx.lineTo(treeX + size * 0.2, treeY + size * 0.1);
      ctx.lineTo(treeX - size * 0.2, treeY + size * 0.1);
      ctx.closePath();
      ctx.fill();
      break;
      
    case 'water':
      // Wave lines
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.lineWidth = 1;
      const waveOffset = (Date.now() / 1000 + seed) % (Math.PI * 2);
      ctx.beginPath();
      ctx.moveTo(x, y + size * 0.5 + Math.sin(waveOffset) * 3);
      ctx.quadraticCurveTo(x + size/2, y + size * 0.5 + Math.sin(waveOffset + 1) * 3, x + size, y + size * 0.5 + Math.sin(waveOffset + 2) * 3);
      ctx.stroke();
      break;
      
    case 'mountain':
      // Mountain peak
      ctx.fillStyle = '#404040';
      ctx.beginPath();
      ctx.moveTo(x + size * 0.5, y + size * 0.2);
      ctx.lineTo(x + size * 0.8, y + size * 0.8);
      ctx.lineTo(x + size * 0.2, y + size * 0.8);
      ctx.closePath();
      ctx.fill();
      // Snow cap
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.beginPath();
      ctx.moveTo(x + size * 0.5, y + size * 0.2);
      ctx.lineTo(x + size * 0.6, y + size * 0.4);
      ctx.lineTo(x + size * 0.4, y + size * 0.4);
      ctx.closePath();
      ctx.fill();
      break;
  }
  
  ctx.restore();
}

function drawGrid(startX, startY, tilesX, tilesY, tileSize) {
  const { ctx } = mapState;
  
  ctx.strokeStyle = 'rgba(212, 165, 74, 0.1)';
  ctx.lineWidth = 1;
  
  for (let y = 0; y <= tilesY; y++) {
    for (let x = 0; x <= tilesX; x++) {
      const pos = worldToScreen(startX + x, startY + y);
      
      // Vertical line
      if (x < tilesX) {
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(pos.x + tileSize, pos.y);
        ctx.stroke();
      }
      
      // Horizontal line
      if (y < tilesY) {
        ctx.beginPath();
        ctx.moveTo(pos.x, pos.y);
        ctx.lineTo(pos.x, pos.y + tileSize);
        ctx.stroke();
      }
    }
  }
}

function drawCity(x, y, size, city, isOwn, isAlly) {
  const { ctx } = mapState;
  
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  const radius = size * 0.35;
  
  // Glow effect
  const glowColor = isOwn ? 'rgba(212, 165, 74, 0.6)' : isAlly ? 'rgba(92, 184, 92, 0.6)' : 'rgba(217, 83, 79, 0.4)';
  const gradient = ctx.createRadialGradient(centerX, centerY, radius * 0.5, centerX, centerY, radius * 1.5);
  gradient.addColorStop(0, glowColor);
  gradient.addColorStop(1, 'transparent');
  ctx.fillStyle = gradient;
  ctx.fillRect(x, y, size, size);
  
  // City base circle
  ctx.fillStyle = isOwn ? '#d4a54a' : isAlly ? '#5cb85c' : '#d9534f';
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  
  // Inner highlight
  const innerGradient = ctx.createRadialGradient(centerX - radius * 0.3, centerY - radius * 0.3, 0, centerX, centerY, radius);
  innerGradient.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
  innerGradient.addColorStop(1, 'transparent');
  ctx.fillStyle = innerGradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
  ctx.fill();
  
  // Border
  ctx.strokeStyle = isOwn ? '#ffd700' : isAlly ? '#90ee90' : '#ff6b6b';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Castle icon
  if (size > 30) {
    ctx.font = `${size * 0.35}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(city.type === 'CAPITAL' ? '🏰' : '🏘️', centerX, centerY);
  }
  
  // City name
  if (size > 35) {
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${Math.max(10, size * 0.2)}px "Cinzel", serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 3;
    ctx.fillText(city.name.slice(0, 12), centerX, y + size + 2);
    ctx.shadowBlur = 0;
  }
}

function drawResourceNode(x, y, size, node) {
  const { ctx } = mapState;
  const config = RESOURCE_CONFIG[node.kind] || RESOURCE_CONFIG.wood;
  
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  
  // Glow
  const gradient = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, size * 0.4);
  gradient.addColorStop(0, config.glow + '40');
  gradient.addColorStop(1, 'transparent');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(centerX, centerY, size * 0.4, 0, Math.PI * 2);
  ctx.fill();
  
  // Icon
  ctx.font = `${size * 0.5}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(config.icon, centerX, centerY);
  
  // Fill indicator
  if (size > 30 && node.filledPct !== undefined) {
    const barWidth = size * 0.6;
    const barHeight = 4;
    const barX = centerX - barWidth / 2;
    const barY = y + size - 8;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(barX, barY, barWidth, barHeight);
    
    ctx.fillStyle = config.color;
    ctx.fillRect(barX, barY, barWidth * node.filledPct, barHeight);
  }
}

function drawArmy(x, y, size, army) {
  const { ctx } = mapState;
  const isOwn = army.ownerId === gameState?.player?.id;
  
  const centerX = x + size / 2;
  const centerY = y + size / 2;
  
  // Movement trail (if moving)
  if (army.status === 'MOVING') {
    ctx.strokeStyle = isOwn ? 'rgba(91, 192, 222, 0.3)' : 'rgba(240, 173, 78, 0.3)';
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    // Draw toward target if known
    ctx.lineTo(centerX - size * 0.5, centerY - size * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  
  // Army triangle
  const triSize = size * 0.3;
  ctx.fillStyle = isOwn ? '#5bc0de' : '#f0ad4e';
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - triSize);
  ctx.lineTo(centerX + triSize, centerY + triSize * 0.5);
  ctx.lineTo(centerX - triSize, centerY + triSize * 0.5);
  ctx.closePath();
  ctx.fill();
  
  // Border
  ctx.strokeStyle = isOwn ? '#2a9fd6' : '#d58512';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Pulse animation for moving armies
  if (army.status === 'MOVING') {
    const pulse = Math.sin(Date.now() / 200) * 0.5 + 0.5;
    ctx.strokeStyle = isOwn ? `rgba(91, 192, 222, ${pulse * 0.5})` : `rgba(240, 173, 78, ${pulse * 0.5})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(centerX, centerY, triSize * 1.5, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function drawSelection(tile, tileSize) {
  const { ctx } = mapState;
  const pos = worldToScreen(tile.x, tile.y);
  
  // Animated selection
  const pulse = Math.sin(Date.now() / 300) * 0.3 + 0.7;
  
  ctx.strokeStyle = `rgba(212, 165, 74, ${pulse})`;
  ctx.lineWidth = 3;
  ctx.strokeRect(pos.x + 2, pos.y + 2, tileSize - 4, tileSize - 4);
  
  // Corner accents
  const cornerSize = tileSize * 0.15;
  ctx.fillStyle = '#d4a54a';
  
  // Top-left
  ctx.fillRect(pos.x, pos.y, cornerSize, 3);
  ctx.fillRect(pos.x, pos.y, 3, cornerSize);
  
  // Top-right
  ctx.fillRect(pos.x + tileSize - cornerSize, pos.y, cornerSize, 3);
  ctx.fillRect(pos.x + tileSize - 3, pos.y, 3, cornerSize);
  
  // Bottom-left
  ctx.fillRect(pos.x, pos.y + tileSize - 3, cornerSize, 3);
  ctx.fillRect(pos.x, pos.y + tileSize - cornerSize, 3, cornerSize);
  
  // Bottom-right
  ctx.fillRect(pos.x + tileSize - cornerSize, pos.y + tileSize - 3, cornerSize, 3);
  ctx.fillRect(pos.x + tileSize - 3, pos.y + tileSize - cornerSize, 3, cornerSize);
}

function drawHover(tile, tileSize) {
  const { ctx } = mapState;
  const pos = worldToScreen(tile.x, tile.y);
  
  ctx.fillStyle = 'rgba(212, 165, 74, 0.15)';
  ctx.fillRect(pos.x, pos.y, tileSize, tileSize);
  
  ctx.strokeStyle = 'rgba(212, 165, 74, 0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(pos.x, pos.y, tileSize, tileSize);
}

function drawMapUI(width, height) {
  const { ctx, centerX, centerY, zoom } = mapState;
  
  // Coordinates display
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(8, 8, 120, 50);
  ctx.strokeStyle = '#4a4035';
  ctx.lineWidth = 1;
  ctx.strokeRect(8, 8, 120, 50);
  
  ctx.fillStyle = '#d4a54a';
  ctx.font = 'bold 12px "Cinzel", serif';
  ctx.textAlign = 'left';
  ctx.fillText('Position', 16, 26);
  
  ctx.fillStyle = '#f4e9d8';
  ctx.font = '14px "Roboto Condensed", sans-serif';
  ctx.fillText(`X: ${Math.floor(centerX)}  Y: ${Math.floor(centerY)}`, 16, 46);
  
  // Zoom indicator
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.fillRect(width - 80, 8, 72, 30);
  ctx.strokeStyle = '#4a4035';
  ctx.strokeRect(width - 80, 8, 72, 30);
  
  ctx.fillStyle = '#d4a54a';
  ctx.font = '12px "Roboto Condensed", sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(`Zoom: ${(zoom * 100).toFixed(0)}%`, width - 44, 28);
  
  // Mini compass
  const compassX = width - 40;
  const compassY = height - 40;
  const compassR = 25;
  
  ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.beginPath();
  ctx.arc(compassX, compassY, compassR, 0, Math.PI * 2);
  ctx.fill();
  
  ctx.strokeStyle = '#4a4035';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // North arrow
  ctx.fillStyle = '#d4a54a';
  ctx.beginPath();
  ctx.moveTo(compassX, compassY - compassR + 8);
  ctx.lineTo(compassX - 6, compassY);
  ctx.lineTo(compassX + 6, compassY);
  ctx.closePath();
  ctx.fill();
  
  ctx.fillStyle = '#666';
  ctx.beginPath();
  ctx.moveTo(compassX, compassY + compassR - 8);
  ctx.lineTo(compassX - 6, compassY);
  ctx.lineTo(compassX + 6, compassY);
  ctx.closePath();
  ctx.fill();
  
  ctx.fillStyle = '#d4a54a';
  ctx.font = 'bold 10px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('N', compassX, compassY - compassR + 18);
}

// ============================================================================
// PARTICLES
// ============================================================================

function updateParticles(deltaTime) {
  // Add occasional sparkle particles
  if (Math.random() < 0.02 && mapState.particles.length < 20) {
    mapState.particles.push({
      x: Math.random() * mapState.displayWidth,
      y: Math.random() * mapState.displayHeight,
      size: Math.random() * 3 + 1,
      alpha: 1,
      speed: Math.random() * 0.02 + 0.01,
    });
  }
  
  // Update existing particles
  mapState.particles = mapState.particles.filter(p => {
    p.alpha -= p.speed;
    return p.alpha > 0;
  });
}

function drawParticles() {
  const { ctx, particles } = mapState;
  
  particles.forEach(p => {
    ctx.fillStyle = `rgba(212, 165, 74, ${p.alpha * 0.5})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
}

// ============================================================================
// UTILITIES
// ============================================================================

function worldToScreen(worldX, worldY) {
  const { centerX, centerY, tileSize, zoom, displayWidth, displayHeight } = mapState;
  const scaledTileSize = tileSize * zoom;
  
  return {
    x: (worldX - centerX) * scaledTileSize + displayWidth / 2,
    y: (worldY - centerY) * scaledTileSize + displayHeight / 2,
  };
}

function screenToWorld(screenX, screenY) {
  const { centerX, centerY, tileSize, zoom, displayWidth, displayHeight } = mapState;
  const scaledTileSize = tileSize * zoom;
  
  return {
    x: Math.floor((screenX - displayWidth / 2) / scaledTileSize + centerX),
    y: Math.floor((screenY - displayHeight / 2) / scaledTileSize + centerY),
  };
}

function getTileAt(x, y) {
  if (!mapState.data?.tiles) return null;
  return mapState.data.tiles.find(t => t.x === x && t.y === y);
}

function updateHoveredTile(e) {
  const rect = mapState.canvas.getBoundingClientRect();
  const coords = screenToWorld(e.clientX - rect.left, e.clientY - rect.top);
  
  mapState.hoveredTile = coords;
  showTooltip(e.clientX - rect.left, e.clientY - rect.top, coords);
}

function showTooltip(x, y, coords) {
  const tooltip = document.getElementById('map-tooltip');
  if (!tooltip) return;
  
  let content = `📍 ${coords.x}, ${coords.y}`;
  
  if (mapState.data) {
    const city = mapState.data.cities?.find(c => c.x === coords.x && c.y === coords.y);
    if (city) {
      const isOwn = city.ownerId === gameState?.player?.id;
      content = `🏰 ${city.name}<br><small>${isOwn ? 'Votre ville' : 'Ennemi'}</small>`;
    }
    
    const resource = mapState.data.resources?.find(r => r.x === coords.x && r.y === coords.y);
    if (resource) {
      const config = RESOURCE_CONFIG[resource.kind];
      content = `${config?.icon || '❓'} ${resource.kind}<br><small>Niv.${resource.level} - ${Math.round((resource.filledPct || 0) * 100)}%</small>`;
    }
    
    const tile = getTileAt(coords.x, coords.y);
    if (tile && !city && !resource) {
      content += `<br><small>${tile.terrain}</small>`;
    }
  }
  
  tooltip.innerHTML = content;
  tooltip.style.left = `${x + 15}px`;
  tooltip.style.top = `${y + 15}px`;
  tooltip.classList.remove('hidden');
}

function hideTooltip() {
  const tooltip = document.getElementById('map-tooltip');
  if (tooltip) tooltip.classList.add('hidden');
}

function goToCoords(x, y, animate = false) {
  if (animate) {
    const startX = mapState.centerX;
    const startY = mapState.centerY;
    const duration = 500;
    const startTime = Date.now();
    
    function animateMove() {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // Ease out cubic
      
      mapState.centerX = startX + (x - startX) * eased;
      mapState.centerY = startY + (y - startY) * eased;
      
      if (progress < 1) {
        requestAnimationFrame(animateMove);
      } else {
        loadMapData();
      }
    }
    
    animateMove();
  } else {
    mapState.centerX = x;
    mapState.centerY = y;
    loadMapData();
  }
}

function handleTileClick(coords) {
  const { data } = mapState;
  if (!data) return;
  
  const city = data.cities?.find(c => c.x === coords.x && c.y === coords.y);
  if (city) {
    openTileModal(coords.x, coords.y, 'city', city);
    return;
  }
  
  const resource = data.resources?.find(r => r.x === coords.x && r.y === coords.y);
  if (resource) {
    openTileModal(coords.x, coords.y, 'resource', resource);
    return;
  }
  
  openTileModal(coords.x, coords.y, 'empty', null);
}

function openTileModal(x, y, type, data) {
  let title = `Case (${x}, ${y})`;
  let content = '';
  let buttons = [];

  if (type === 'city' && data) {
    title = `🏰 ${data.name}`;
    const isOwn = data.ownerId === gameState?.player?.id;
    content = `
      <div class="tile-info">
        <p><strong>Coordonnées:</strong> ${x}, ${y}</p>
        <p><strong>Type:</strong> ${data.type === 'CAPITAL' ? 'Capitale' : 'Avant-poste'}</p>
        <p><strong>Propriétaire:</strong> ${isOwn ? 'Vous' : 'Joueur adverse'}</p>
      </div>
    `;
    if (!isOwn) {
      buttons = [
        { text: '⚔️ Attaquer', class: 'btn-danger', action: () => openAttackTargetModal && openAttackTargetModal(x, y) },
        { text: '🕵️ Espionner', class: 'btn-secondary', action: () => openSpyModal && openSpyModal(x, y, 'CITY') },
      ];
    } else {
      buttons = [
        { text: '🏠 Voir la ville', class: 'btn-primary', action: () => { if (typeof switchView === 'function') switchView('city'); } },
      ];
    }
  } else if (type === 'resource' && data) {
    const config = RESOURCE_CONFIG[data.kind];
    title = `${config?.icon || '❓'} Nœud de ${data.kind}`;
    content = `
      <div class="tile-info">
        <p><strong>Coordonnées:</strong> ${x}, ${y}</p>
        <p><strong>Niveau:</strong> ${data.level}</p>
        <p><strong>Remplissage:</strong> ${Math.round((data.filledPct || 0) * 100)}%</p>
      </div>
    `;
    buttons = [
      { text: '⚔️ Raid', class: 'btn-primary', action: () => openRaidModal && openRaidModal(x, y) },
    ];
  } else {
    const tile = getTileAt(x, y);
    content = `
      <div class="tile-info">
        <p><strong>Coordonnées:</strong> ${x}, ${y}</p>
        <p><strong>Terrain:</strong> ${tile?.terrain || 'Inconnu'}</p>
        <p>Case vide - aucune structure</p>
      </div>
    `;
    buttons = [
      { text: '🚶 Déplacer armée', class: 'btn-secondary', action: () => openMoveTargetModal && openMoveTargetModal(x, y) },
    ];
  }

  if (typeof showModal === 'function') {
    showModal(title, content, buttons);
  }
}

// Export for global access
window.initMap = initMap;
window.goToCoords = goToCoords;
window.mapState = mapState;
