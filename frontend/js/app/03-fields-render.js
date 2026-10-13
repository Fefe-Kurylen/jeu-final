// ============================================================
// 03-fields-render.js — Vue champs de ressources : rendu et animations des champs
// Découpé depuis app.js (lignes 2466-3457) — portée globale partagée,
// l'ordre de chargement dans index.html doit être respecté.
// ============================================================
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
      q.buildingKey === slot.fieldType && q.slot === slot.slot + 100 && q.status === 'RUNNING'
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

  // ========== SPRITE (assets/images/fields/<TYPE>_<palier>.svg, généré par tools/build-assets.cjs) ==========
  // Largeur 1.5·size : losange au sol de ±0.577·size en x et ±0.288·size en y ; sinon rendu procédural
  const sprite = level > 0 ? getSprite(fieldSpriteUrl(fieldType, level)) : null;

  // ========== SHADOW ==========
  cityCtx.fillStyle = 'rgba(0,0,0,0.35)';
  cityCtx.beginPath();
  if (sprite) cityCtx.ellipse(x + 4, y + 5, size * 0.6, size * 0.3, 0, 0, Math.PI * 2);
  else cityCtx.ellipse(x + 4, y + 6, size * 0.72, size * 0.38, 0, 0, Math.PI * 2);
  cityCtx.fill();

  if (sprite) {
    drawSprite(cityCtx, sprite, x, y, size * 1.5, spriteVariant(isHovered));

    // ========== HOVER BORDER (contour doré du losange au sol) ==========
    if (isHovered) {
      cityCtx.strokeStyle = '#ffd700';
      cityCtx.lineWidth = 3;
      cityCtx.shadowColor = '#ffd700';
      cityCtx.shadowBlur = 15;
      cityCtx.beginPath();
      cityCtx.moveTo(x - size * 0.577, y);
      cityCtx.lineTo(x, y - size * 0.288);
      cityCtx.lineTo(x + size * 0.577, y);
      cityCtx.lineTo(x, y + size * 0.288);
      cityCtx.closePath();
      cityCtx.stroke();
      cityCtx.shadowBlur = 0;
    }
  } else if (level === 0) {
    // ========== EMPTY PLOT (losange de terre, même gabarit que les sprites) ==========
    const night = isNightMode();
    cityCtx.fillStyle = night ? 'rgba(40,36,30,0.75)' : 'rgba(110,88,60,0.55)';
    cityCtx.beginPath();
    cityCtx.moveTo(x - size * 0.577, y);
    cityCtx.lineTo(x, y - size * 0.288);
    cityCtx.lineTo(x + size * 0.577, y);
    cityCtx.lineTo(x, y + size * 0.288);
    cityCtx.closePath();
    cityCtx.fill();
    if (isHovered) {
      cityCtx.shadowColor = '#ffd700';
      cityCtx.shadowBlur = 15;
    }
    cityCtx.strokeStyle = isHovered ? '#ffd700' : 'rgba(255,255,255,0.45)';
    cityCtx.lineWidth = isHovered ? 3 : 2;
    cityCtx.setLineDash([5, 5]);
    cityCtx.stroke();
    cityCtx.setLineDash([]);
    cityCtx.shadowBlur = 0;
  } else {
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
  }

  // ========== PRODUCTION INDICATOR (animated) ==========
  if (level > 0 && !isBuilding) {
    const prodY = y - size * (sprite ? 0.75 : 0.5) + Math.sin(time * 2) * 3;
    cityCtx.globalAlpha = 0.7 + Math.sin(time * 3) * 0.2;
    cityCtx.font = '16px Arial';
    cityCtx.textAlign = 'center';
    cityCtx.fillText(style.productIcon, x, prodY);
    cityCtx.globalAlpha = 1;
  }

  // ========== EMPTY SLOT INDICATOR ==========
  if (level === 0) {
    // Plus sign
    cityCtx.fillStyle = isHovered ? '#ffd700' : 'rgba(255,255,255,0.6)';
    cityCtx.font = `bold ${size * 0.4}px Arial`;
    cityCtx.textAlign = 'center';
    cityCtx.textBaseline = 'middle';
    cityCtx.fillText('+', x, y);
  }

  // ========== LEVEL BADGE (Travian-style) ==========
  if (level > 0) {
    // Au coin droit du losange au sol, taille proportionnelle à l'emplacement
    const badgeR = Math.max(8, Math.min(13, size * 0.26));
    const badgeX = x + size * (sprite ? 0.6 : 0.55);
    const badgeY = y + size * (sprite ? 0.08 : -0.2);

    // Badge shadow
    cityCtx.fillStyle = 'rgba(0,0,0,0.5)';
    cityCtx.beginPath();
    cityCtx.arc(badgeX + 2, badgeY + 2, badgeR, 0, Math.PI * 2);
    cityCtx.fill();

    // Badge background
    cityCtx.fillStyle = isHovered ? '#2a2a2a' : '#1a1a1a';
    cityCtx.beginPath();
    cityCtx.arc(badgeX, badgeY, badgeR, 0, Math.PI * 2);
    cityCtx.fill();

    // Gold ring
    cityCtx.strokeStyle = isHovered ? '#ffd700' : '#c9a227';
    cityCtx.lineWidth = isHovered ? 3 : 2;
    cityCtx.stroke();

    // Level number
    cityCtx.fillStyle = isHovered ? '#ffd700' : '#e8c547';
    cityCtx.font = `bold ${Math.round(badgeR * 0.85)}px Cinzel, serif`;
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

