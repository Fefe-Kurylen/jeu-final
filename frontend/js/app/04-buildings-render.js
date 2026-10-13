// ============================================================
// 04-buildings-render.js — Graphismes des bâtiments : styles par culture, toits, portes, badges
// Découpé depuis app.js (lignes 3458-4648) — portée globale partagée,
// l'ordre de chargement dans index.html doit être respecté.
// ============================================================
// ========== CULTURE-SPECIFIC BUILDING STYLES ==========
const CULTURE_THEMES = {
  ROME: {
    name: 'Roman',
    stone: '#c9b896', stoneDark: '#a08060', stoneLight: '#e4d4b0',
    roof: '#c45a20', roofDark: '#8a3010', roofLight: '#d47030',
    accent: '#8b0000', trim: '#5a4010', wood: '#6a4a2a'
  },
  GAUL: {
    name: 'Gaulois',
    stone: '#8a7a5a', stoneDark: '#6a5a3a', stoneLight: '#a89a7a',
    roof: '#4a6a2a', roofDark: '#2a4a1a', roofLight: '#6a8a4a',
    accent: '#2a5a1a', trim: '#4a3a20', wood: '#5a4020'
  },
  GREEK: {
    name: 'Greek',
    stone: '#e8e0d0', stoneDark: '#c8c0b0', stoneLight: '#f8f0e0',
    roof: '#4a6a8a', roofDark: '#2a4a6a', roofLight: '#6a8aaa',
    accent: '#3a5a7a', trim: '#8a8070', wood: '#7a6a5a'
  },
  EGYPT: {
    name: 'Egyptian',
    stone: '#d4c4a0', stoneDark: '#b4a480', stoneLight: '#f4e4c0',
    roof: '#3a8a8a', roofDark: '#1a6a6a', roofLight: '#5aaaaa',
    accent: '#c9a227', trim: '#8a7040', wood: '#8a6a30'
  },
  HUN: {
    name: 'Hun',
    stone: '#7a6a5a', stoneDark: '#5a4a3a', stoneLight: '#9a8a7a',
    roof: '#6a4030', roofDark: '#4a2010', roofLight: '#8a5040',
    accent: '#8a2a10', trim: '#4a3020', wood: '#5a3a20'
  },
  SULTAN: {
    name: 'Sultanat',
    stone: '#e4d4b4', stoneDark: '#c4b494', stoneLight: '#f4e4d4',
    roof: '#2a6a5a', roofDark: '#1a4a3a', roofLight: '#4a8a7a',
    accent: '#c9a227', trim: '#6a5a40', wood: '#6a5030'
  }
};

function getCultureTheme() {
  const faction = player?.faction || 'ROME';
  return CULTURE_THEMES[faction] || CULTURE_THEMES.ROME;
}

// ========== TRAVIAN-STYLE BUILDING GRAPHICS ==========
function draw25DBuilding(x, y, size, key, level, isHovered, isBuilding) {
  const culture = getCultureTheme();

  // Detailed Travian-style building definitions with culture colors
  const buildingStyles = {
    MAIN_HALL: {
      base: culture.stoneDark, roof: culture.roof, roofType: 'dome',
      height: 2.0, windows: 4, hasColumns: true, hasFlag: true,
      wallColor: culture.stone, trimColor: culture.trim
    },
    BARRACKS: {
      base: culture.stoneDark, roof: culture.accent, roofType: 'pointed',
      height: 1.5, windows: 2, hasBanner: true, hasWeaponRack: true,
      wallColor: culture.stone, trimColor: culture.accent
    },
    STABLE: {
      base: culture.wood, roof: culture.roofDark, roofType: 'barn',
      height: 1.3, windows: 1, hasHorseshoe: true, hasDoors: true,
      wallColor: culture.stone, trimColor: culture.wood
    },
    WORKSHOP: {
      base: '#5a4a3a', roof: '#444444', roofType: 'flat',
      height: 1.5, windows: 2, hasChimney: true, hasGears: true,
      wallColor: '#6a5a4a', trimColor: '#333333'
    },
    ACADEMY: {
      base: culture.stoneLight, roof: culture.roof, roofType: 'temple',
      height: 1.7, windows: 3, hasColumns: true, hasScrolls: true,
      wallColor: culture.stoneLight, trimColor: culture.trim
    },
    FORGE: {
      base: '#4a3a2a', roof: '#2a2a2a', roofType: 'pointed',
      height: 1.4, windows: 1, hasChimney: true, hasAnvil: true,
      wallColor: '#5a4a3a', trimColor: '#1a1a1a'
    },
    MARKET: {
      base: culture.stone, roof: culture.accent, roofType: 'tent',
      height: 1.1, windows: 0, hasAwning: true, hasCrates: true,
      wallColor: culture.stoneLight, trimColor: culture.accent
    },
    WAREHOUSE: {
      base: culture.wood, roof: culture.roofDark, roofType: 'barn',
      height: 1.4, windows: 1, hasDoors: true, hasCrates: true,
      wallColor: culture.stone, trimColor: culture.wood
    },
    SILO: {
      base: culture.stone, roof: culture.roof, roofType: 'cone',
      height: 1.8, windows: 0, isRound: true, hasWheat: true,
      wallColor: culture.stoneLight, trimColor: culture.roofDark
    },
    WALL: {
      base: culture.stoneDark, roof: culture.stoneDark, roofType: 'crenelated',
      height: 1.3, windows: 0, hasTorches: true, isWall: true,
      wallColor: culture.stone, trimColor: culture.trim
    },
    HEALING_TENT: {
      base: '#f5f5e5', roof: '#ffffff', roofType: 'tent',
      height: 1.0, windows: 0, hasCross: true, isTent: true,
      wallColor: '#ffffff', trimColor: '#cc0000'
    },
    RALLY_POINT: {
      base: culture.stoneDark, roof: culture.accent, roofType: 'flag',
      height: 0.9, windows: 0, hasFlag: true, hasTorch: true,
      wallColor: culture.stone, trimColor: culture.accent
    },
    HIDEOUT: {
      base: '#4a3a2a', roof: '#3a3a2a', roofType: 'underground',
      height: 0.5, windows: 0, isUnderground: true,
      wallColor: '#5a4a3a', trimColor: '#2a2a1a'
    },
    MOAT: {
      base: '#4a7a9a', roof: '#3a6a8a', roofType: 'water',
      height: 0.2, windows: 0, isWater: true,
      wallColor: '#5a8aaa', trimColor: '#2a5a7a'
    },
    HERO_HOME: {
      base: culture.stoneLight, roof: culture.roof, roofType: 'temple',
      height: 1.6, windows: 2, hasColumns: true, hasStatue: true,
      wallColor: culture.stoneLight, trimColor: culture.trim
    },
    // ===== NOUVEAUX BÂTIMENTS (21) =====
    MILL: {
      base: culture.wood, roof: culture.roofDark, roofType: 'pointed',
      height: 1.8, windows: 1, hasWindmill: true,
      wallColor: culture.stone, trimColor: culture.wood
    },
    BAKERY: {
      base: culture.stone, roof: culture.roof, roofType: 'pointed',
      height: 1.3, windows: 2, hasChimney: true,
      wallColor: culture.stoneLight, trimColor: culture.trim
    },
    SAWMILL: {
      base: culture.wood, roof: culture.roofDark, roofType: 'barn',
      height: 1.2, windows: 1, hasDoors: true,
      wallColor: '#8B4513', trimColor: culture.wood
    },
    STONEMASON: {
      base: culture.stoneDark, roof: culture.roofDark, roofType: 'flat',
      height: 1.3, windows: 1, hasAnvil: true,
      wallColor: culture.stone, trimColor: '#555555'
    },
    FOUNDRY: {
      base: '#3a2a1a', roof: '#1a1a1a', roofType: 'pointed',
      height: 1.5, windows: 1, hasChimney: true, hasAnvil: true,
      wallColor: '#4a3a2a', trimColor: '#ff4400'
    },
    GREAT_SILO: {
      base: culture.stone, roof: culture.roof, roofType: 'dome',
      height: 2.0, windows: 0, isRound: true,
      wallColor: culture.stoneLight, trimColor: culture.trim
    },
    GREAT_WAREHOUSE: {
      base: culture.stoneDark, roof: culture.roofDark, roofType: 'barn',
      height: 1.6, windows: 2, hasDoors: true, hasCrates: true,
      wallColor: culture.stone, trimColor: culture.wood
    },
    GREAT_BARRACKS: {
      base: culture.stoneDark, roof: culture.accent, roofType: 'pointed',
      height: 1.7, windows: 3, hasBanner: true, hasWeaponRack: true,
      wallColor: culture.stone, trimColor: culture.accent
    },
    GREAT_STABLE: {
      base: culture.wood, roof: culture.roofDark, roofType: 'barn',
      height: 1.5, windows: 2, hasHorseshoe: true, hasDoors: true,
      wallColor: culture.stone, trimColor: culture.wood
    },
    WATCHTOWER: {
      base: culture.stoneDark, roof: culture.roof, roofType: 'pointed',
      height: 2.2, windows: 4, hasTorches: true, hasFlag: true,
      wallColor: culture.stone, trimColor: culture.trim
    },
    EMBASSY: {
      base: culture.stoneLight, roof: culture.accent, roofType: 'dome',
      height: 1.6, windows: 3, hasColumns: true, hasFlag: true,
      wallColor: culture.stoneLight, trimColor: culture.accent
    },
    TREASURE_CHAMBER: {
      base: '#4a3a1a', roof: '#ffd700', roofType: 'dome',
      height: 1.4, windows: 1, hasColumns: true,
      wallColor: '#5a4a2a', trimColor: '#ffd700'
    },
    HERO_MANSION: {
      base: culture.stoneLight, roof: culture.roof, roofType: 'temple',
      height: 1.8, windows: 3, hasColumns: true, hasStatue: true,
      wallColor: culture.stoneLight, trimColor: culture.trim
    },
    RESIDENCE: {
      base: culture.stone, roof: culture.roof, roofType: 'pointed',
      height: 1.5, windows: 3, hasColumns: true,
      wallColor: culture.stoneLight, trimColor: culture.trim
    },
    TRADE_OFFICE: {
      base: culture.stone, roof: culture.accent, roofType: 'tent',
      height: 1.3, windows: 2, hasAwning: true, hasCrates: true,
      wallColor: culture.stoneLight, trimColor: culture.accent
    },
    // Faction buildings
    ROMAN_THERMAE: {
      base: '#e8e0d0', roof: '#b8a090', roofType: 'dome',
      height: 1.4, windows: 2, hasColumns: true, isWater: true,
      wallColor: '#f0e8e0', trimColor: '#8b7355'
    },
    GALLIC_BREWERY: {
      base: culture.wood, roof: '#8B4513', roofType: 'barn',
      height: 1.4, windows: 1, hasChimney: true, hasDoors: true,
      wallColor: '#a08060', trimColor: culture.wood
    },
    GREEK_TEMPLE: {
      base: '#f5f5f5', roof: '#e0d8c8', roofType: 'temple',
      height: 1.8, windows: 0, hasColumns: true,
      wallColor: '#ffffff', trimColor: '#d4af37'
    },
    EGYPTIAN_IRRIGATION: {
      base: '#c9b896', roof: '#a08b6e', roofType: 'flat',
      height: 1.0, windows: 0, isWater: true,
      wallColor: '#d4c4a8', trimColor: '#8b7355'
    },
    HUN_WAR_TENT: {
      base: '#8b7355', roof: '#6b5344', roofType: 'tent',
      height: 1.2, windows: 0, isTent: true, hasFlag: true,
      wallColor: '#9b8365', trimColor: '#5b4334'
    },
    SULTAN_DESERT_OUTPOST: {
      base: '#d4b896', roof: '#c4a886', roofType: 'dome',
      height: 1.4, windows: 2, hasFlag: true,
      wallColor: '#e4c8a6', trimColor: '#8b7355'
    }
  };

  const style = buildingStyles[key] || {
    base: '#a08060', roof: '#6b4423', roofType: 'pointed',
    height: 1.2, windows: 1, wallColor: '#b09070', trimColor: '#5b3413'
  };

  const bh = size * style.height;
  const bw = size * 0.55;

  // ========== HOVER EFFECT (Travian-style golden glow) ==========
  if (isHovered) {
    // Outer glow
    cityCtx.shadowColor = '#ffd700';
    cityCtx.shadowBlur = 30;
    cityCtx.fillStyle = 'rgba(255,215,0,0.15)';
    cityCtx.beginPath();
    cityCtx.ellipse(x, y, bw + 10, (bw + 10) * 0.55, 0, 0, Math.PI * 2);
    cityCtx.fill();
    cityCtx.shadowBlur = 0;
  }

  // ========== CONSTRUCTION ANIMATION ==========
  if (isBuilding) {
    cityCtx.globalAlpha = 0.6 + Math.sin(Date.now() / 150) * 0.2;
  }

  // ========== SHADOW ==========
  cityCtx.fillStyle = 'rgba(0,0,0,0.4)';
  cityCtx.beginPath();
  cityCtx.ellipse(x + 5, y + 8, bw * 0.9, bw * 0.45, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // ========== SPRITE (assets/images/buildings/<faction>/<key>.svg, généré par tools/build-assets.cjs) ==========
  // Le losange au sol du sprite (±0.56·size × ±0.28·size) recouvre l'emplacement ; sinon rendu procédural
  const sprite = getSprite(buildingSpriteUrl(key));
  if (sprite) {
    drawSprite(cityCtx, sprite, x, y, size * 1.7, spriteVariant(isHovered));
  } else {
    // ========== BASE PLATFORM ==========
    cityCtx.fillStyle = '#6a5a4a';
    cityCtx.beginPath();
    cityCtx.ellipse(x, y + 3, bw + 5, (bw + 5) * 0.5, 0, 0, Math.PI * 2);
    cityCtx.fill();

    // Draw building based on type
    if (style.isWater) {
      drawWaterBuilding(x, y, bw, style);
    } else if (style.isUnderground) {
      drawUndergroundBuilding(x, y, bw, style);
    } else if (style.isTent) {
      drawTentBuilding(x, y, bw, bh, style);
    } else if (style.isRound) {
      drawRoundBuilding(x, y, bw, bh, style, level);
    } else if (style.isWall) {
      drawWallBuilding(x, y, bw, bh, style, level);
    } else {
      drawStandardBuilding(x, y, bw, bh, style, key, level);
    }
  }

  cityCtx.globalAlpha = 1;

  // ========== LEVEL BADGE (Travian-style) ==========
  if (level > 0) {
    // Avec un sprite : badge au coin droit du losange au sol, taille proportionnelle à l'emplacement
    if (sprite) drawTravianLevelBadge(x, y, bw, bh, level, isHovered, true, { x: x + size * 0.62, y: y + size * 0.08, radius: Math.max(7, Math.min(12, size * 0.24)) });
    else drawTravianLevelBadge(x, y, bw, bh, level, isHovered);
  }

  // ========== CONSTRUCTION INDICATOR ==========
  if (isBuilding) {
    const hammerY = y - bh - 15;
    cityCtx.fillStyle = '#ffa500';
    cityCtx.font = 'bold 18px Arial';
    cityCtx.textAlign = 'center';
    cityCtx.fillText('⚒️', x, hammerY + Math.sin(Date.now() / 200) * 3);
  }
}

// ========== TRAVIAN-STYLE STANDARD BUILDING ==========
function drawStandardBuilding(x, y, bw, bh, style, key, level) {
  // Foundation
  cityCtx.fillStyle = style.base;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, bw, bw * 0.5, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Left wall (lit side)
  const wallGrad = cityCtx.createLinearGradient(x - bw, y, x, y);
  wallGrad.addColorStop(0, style.wallColor);
  wallGrad.addColorStop(1, shadeColor(style.wallColor, -15));
  cityCtx.fillStyle = wallGrad;
  cityCtx.beginPath();
  cityCtx.moveTo(x - bw, y);
  cityCtx.lineTo(x - bw * 0.9, y - bh);
  cityCtx.lineTo(x, y - bh - bw * 0.2);
  cityCtx.lineTo(x, y - bw * 0.5);
  cityCtx.closePath();
  cityCtx.fill();

  // Right wall (shadow side)
  cityCtx.fillStyle = shadeColor(style.wallColor, -30);
  cityCtx.beginPath();
  cityCtx.moveTo(x + bw, y);
  cityCtx.lineTo(x + bw * 0.9, y - bh);
  cityCtx.lineTo(x, y - bh - bw * 0.2);
  cityCtx.lineTo(x, y - bw * 0.5);
  cityCtx.closePath();
  cityCtx.fill();

  // Wall details (stones/bricks pattern)
  drawWallPattern(x, y, bw, bh, style);

  // Windows
  if (style.windows > 0) {
    drawWindows(x, y, bw, bh, style.windows);
  }

  // Door
  drawDoor(x, y, bw);

  // Roof based on type
  drawRoof(x, y, bw, bh, style);

  // Columns for temple/academy
  if (style.hasColumns) {
    drawColumns(x, y, bw, bh);
  }

  // Chimney
  if (style.hasChimney) {
    drawChimney(x, y, bw, bh);
  }

  // Flag
  if (style.hasFlag) {
    drawBuildingFlag(x, y, bw, bh, key);
  }

  // Decorative elements
  if (style.hasAnvil) drawAnvil(x, y, bw);
  if (style.hasGears) drawGears(x, y, bw, bh);
  if (style.hasWeaponRack) drawWeaponRack(x, y, bw);
  if (style.hasCrates) drawCrates(x, y, bw);
  if (style.hasStatue) drawStatue(x, y, bw, bh);
}

// ========== WALL PATTERN ==========
function drawWallPattern(x, y, bw, bh, style) {
  cityCtx.strokeStyle = shadeColor(style.wallColor, -20);
  cityCtx.lineWidth = 0.5;

  // Horizontal lines (brick rows)
  for (let i = 1; i < 5; i++) {
    const rowY = y - (bh * i / 5);
    cityCtx.beginPath();
    cityCtx.moveTo(x - bw * 0.85 + (i * 2), rowY);
    cityCtx.lineTo(x, rowY - bw * 0.1);
    cityCtx.stroke();
  }
}

// ========== WINDOWS ==========
function drawWindows(x, y, bw, bh, count) {
  const winW = bw * 0.15;
  const winH = bh * 0.12;
  const nightMode = isNightMode();

  for (let i = 0; i < count; i++) {
    const winX = x - bw * 0.4 + (i % 2) * bw * 0.3;
    const winY = y - bh * 0.5 - Math.floor(i / 2) * bh * 0.25;

    // Night mode: warm glow around window
    if (nightMode) {
      const glowGrad = cityCtx.createRadialGradient(winX, winY, 0, winX, winY, winW * 2);
      glowGrad.addColorStop(0, 'rgba(255, 200, 100, 0.4)');
      glowGrad.addColorStop(0.5, 'rgba(255, 180, 80, 0.2)');
      glowGrad.addColorStop(1, 'rgba(255, 150, 50, 0)');
      cityCtx.fillStyle = glowGrad;
      cityCtx.beginPath();
      cityCtx.arc(winX, winY, winW * 2, 0, Math.PI * 2);
      cityCtx.fill();
    }

    // Window frame
    cityCtx.fillStyle = nightMode ? '#1a1510' : '#3a2a1a';
    cityCtx.fillRect(winX - winW / 2 - 1, winY - winH / 2 - 1, winW + 2, winH + 2);

    // Window glass
    if (nightMode) {
      // Warm candlelight at night
      const glassGrad = cityCtx.createLinearGradient(winX, winY - winH / 2, winX, winY + winH / 2);
      glassGrad.addColorStop(0, '#ffcc66');
      glassGrad.addColorStop(0.5, '#ffaa33');
      glassGrad.addColorStop(1, '#ff8800');
      cityCtx.fillStyle = glassGrad;
    } else {
      // Daytime reflections
      const glassGrad = cityCtx.createLinearGradient(winX, winY - winH / 2, winX, winY + winH / 2);
      glassGrad.addColorStop(0, '#87ceeb');
      glassGrad.addColorStop(0.5, '#ffd700');
      glassGrad.addColorStop(1, '#4682b4');
      cityCtx.fillStyle = glassGrad;
    }
    cityCtx.fillRect(winX - winW / 2, winY - winH / 2, winW, winH);

    // Window cross
    cityCtx.strokeStyle = nightMode ? '#1a1008' : '#2a1a0a';
    cityCtx.lineWidth = 1;
    cityCtx.beginPath();
    cityCtx.moveTo(winX, winY - winH / 2);
    cityCtx.lineTo(winX, winY + winH / 2);
    cityCtx.moveTo(winX - winW / 2, winY);
    cityCtx.lineTo(winX + winW / 2, winY);
    cityCtx.stroke();
  }
}

// ========== DOOR ==========
function drawDoor(x, y, bw) {
  const doorW = bw * 0.25;
  const doorH = bw * 0.35;
  const doorX = x;
  const doorY = y - bw * 0.3;

  // Door frame
  cityCtx.fillStyle = '#3a2a1a';
  cityCtx.beginPath();
  cityCtx.moveTo(doorX - doorW / 2 - 2, doorY + 2);
  cityCtx.lineTo(doorX - doorW / 2 - 2, doorY - doorH);
  cityCtx.arc(doorX, doorY - doorH, doorW / 2 + 2, Math.PI, 0, false);
  cityCtx.lineTo(doorX + doorW / 2 + 2, doorY + 2);
  cityCtx.closePath();
  cityCtx.fill();

  // Door wood
  cityCtx.fillStyle = '#6b4423';
  cityCtx.beginPath();
  cityCtx.moveTo(doorX - doorW / 2, doorY);
  cityCtx.lineTo(doorX - doorW / 2, doorY - doorH);
  cityCtx.arc(doorX, doorY - doorH, doorW / 2, Math.PI, 0, false);
  cityCtx.lineTo(doorX + doorW / 2, doorY);
  cityCtx.closePath();
  cityCtx.fill();

  // Door handle
  cityCtx.fillStyle = '#ffd700';
  cityCtx.beginPath();
  cityCtx.arc(doorX + doorW * 0.25, doorY - doorH * 0.4, 2, 0, Math.PI * 2);
  cityCtx.fill();
}

// ========== ROOF TYPES ==========
function drawRoof(x, y, bw, bh, style) {
  const roofY = y - bh;

  switch (style.roofType) {
    case 'pointed':
      // Triangular roof
      cityCtx.fillStyle = style.roof;
      cityCtx.beginPath();
      cityCtx.moveTo(x, roofY - bw * 0.6);
      cityCtx.lineTo(x - bw * 1.1, roofY + bw * 0.15);
      cityCtx.lineTo(x + bw * 1.1, roofY + bw * 0.15);
      cityCtx.closePath();
      cityCtx.fill();

      // Roof shadow
      cityCtx.fillStyle = shadeColor(style.roof, -25);
      cityCtx.beginPath();
      cityCtx.moveTo(x, roofY - bw * 0.6);
      cityCtx.lineTo(x + bw * 1.1, roofY + bw * 0.15);
      cityCtx.lineTo(x, roofY + bw * 0.05);
      cityCtx.closePath();
      cityCtx.fill();
      break;

    case 'dome':
      // Domed roof
      cityCtx.fillStyle = style.roof;
      cityCtx.beginPath();
      cityCtx.ellipse(x, roofY, bw, bw * 0.5, 0, 0, Math.PI * 2);
      cityCtx.fill();

      cityCtx.fillStyle = shadeColor(style.roof, 15);
      cityCtx.beginPath();
      cityCtx.arc(x, roofY - bw * 0.2, bw * 0.6, Math.PI, 0, false);
      cityCtx.closePath();
      cityCtx.fill();

      // Dome pinnacle
      cityCtx.fillStyle = '#ffd700';
      cityCtx.beginPath();
      cityCtx.arc(x, roofY - bw * 0.5, 4, 0, Math.PI * 2);
      cityCtx.fill();
      break;

    case 'temple':
      // Greek temple roof
      cityCtx.fillStyle = style.roof;
      cityCtx.beginPath();
      cityCtx.moveTo(x, roofY - bw * 0.5);
      cityCtx.lineTo(x - bw * 1.2, roofY + bw * 0.1);
      cityCtx.lineTo(x + bw * 1.2, roofY + bw * 0.1);
      cityCtx.closePath();
      cityCtx.fill();

      // Pediment (triangular facade)
      cityCtx.fillStyle = '#f5f0e5';
      cityCtx.beginPath();
      cityCtx.moveTo(x, roofY - bw * 0.35);
      cityCtx.lineTo(x - bw * 0.8, roofY + bw * 0.05);
      cityCtx.lineTo(x + bw * 0.8, roofY + bw * 0.05);
      cityCtx.closePath();
      cityCtx.fill();
      break;

    case 'barn':
      // Gambrel/barn roof
      cityCtx.fillStyle = style.roof;
      cityCtx.beginPath();
      cityCtx.moveTo(x, roofY - bw * 0.4);
      cityCtx.lineTo(x - bw * 0.6, roofY);
      cityCtx.lineTo(x - bw * 1.0, roofY + bw * 0.2);
      cityCtx.lineTo(x + bw * 1.0, roofY + bw * 0.2);
      cityCtx.lineTo(x + bw * 0.6, roofY);
      cityCtx.closePath();
      cityCtx.fill();
      break;

    case 'flat':
      // Flat roof
      cityCtx.fillStyle = style.roof;
      cityCtx.beginPath();
      cityCtx.ellipse(x, roofY, bw * 1.05, bw * 0.55, 0, 0, Math.PI * 2);
      cityCtx.fill();
      break;

    case 'tent':
      // Tent/awning roof
      cityCtx.fillStyle = style.roof;
      cityCtx.beginPath();
      cityCtx.moveTo(x, roofY - bw * 0.5);
      cityCtx.quadraticCurveTo(x - bw * 0.5, roofY - bw * 0.2, x - bw * 1.2, roofY + bw * 0.2);
      cityCtx.lineTo(x + bw * 1.2, roofY + bw * 0.2);
      cityCtx.quadraticCurveTo(x + bw * 0.5, roofY - bw * 0.2, x, roofY - bw * 0.5);
      cityCtx.closePath();
      cityCtx.fill();

      // Stripes
      cityCtx.strokeStyle = shadeColor(style.roof, -30);
      cityCtx.lineWidth = 2;
      for (let i = 0; i < 4; i++) {
        cityCtx.beginPath();
        const sx = x - bw * 0.8 + i * bw * 0.4;
        cityCtx.moveTo(sx, roofY + bw * 0.15);
        cityCtx.lineTo(x, roofY - bw * 0.45);
        cityCtx.stroke();
      }
      break;

    case 'cone':
      // Conical roof (silo)
      cityCtx.fillStyle = style.roof;
      cityCtx.beginPath();
      cityCtx.moveTo(x, roofY - bw * 0.7);
      cityCtx.lineTo(x - bw * 0.7, roofY + bw * 0.1);
      cityCtx.arc(x, roofY + bw * 0.1, bw * 0.7, Math.PI, 0, false);
      cityCtx.closePath();
      cityCtx.fill();
      break;

    case 'crenelated':
      // Castle wall crenelations
      cityCtx.fillStyle = style.roof;
      for (let i = 0; i < 5; i++) {
        const cx = x - bw * 0.8 + i * bw * 0.4;
        cityCtx.fillRect(cx - 4, roofY - 8, 8, 12);
      }
      break;
  }
}

// ========== COLUMNS ==========
function drawColumns(x, y, bw, bh) {
  const colW = bw * 0.08;
  const positions = [-0.6, -0.3, 0.3, 0.6];

  positions.forEach(pos => {
    const colX = x + bw * pos;

    // Column base
    cityCtx.fillStyle = '#d4c4b4';
    cityCtx.fillRect(colX - colW * 1.2, y - bw * 0.35, colW * 2.4, 6);

    // Column shaft
    const colGrad = cityCtx.createLinearGradient(colX - colW, 0, colX + colW, 0);
    colGrad.addColorStop(0, '#f0e8e0');
    colGrad.addColorStop(0.5, '#ffffff');
    colGrad.addColorStop(1, '#d4c4b4');
    cityCtx.fillStyle = colGrad;
    cityCtx.fillRect(colX - colW, y - bh * 0.85, colW * 2, bh * 0.55);

    // Column capital
    cityCtx.fillStyle = '#d4c4b4';
    cityCtx.fillRect(colX - colW * 1.3, y - bh * 0.85 - 4, colW * 2.6, 6);
  });
}

// ========== CHIMNEY ==========
function drawChimney(x, y, bw, bh) {
  const chimX = x + bw * 0.3;
  const chimY = y - bh - bw * 0.2;

  // Chimney body
  cityCtx.fillStyle = '#6a5a4a';
  cityCtx.fillRect(chimX - 6, chimY - 20, 12, 25);

  // Chimney top
  cityCtx.fillStyle = '#5a4a3a';
  cityCtx.fillRect(chimX - 8, chimY - 22, 16, 5);

  // Smoke
  const time = Date.now() / 1000;
  cityCtx.fillStyle = 'rgba(150,150,150,0.5)';
  for (let i = 0; i < 3; i++) {
    const smokeY = chimY - 30 - i * 12 - Math.sin(time * 2 + i) * 5;
    const smokeX = chimX + Math.sin(time * 1.5 + i * 2) * 8;
    cityCtx.beginPath();
    cityCtx.arc(smokeX, smokeY, 5 + i * 2, 0, Math.PI * 2);
    cityCtx.fill();
  }
}

// ========== BUILDING FLAG ==========
function drawBuildingFlag(x, y, bw, bh, key) {
  const flagX = x;
  const flagY = y - bh - bw * 0.5;

  // Pole
  cityCtx.strokeStyle = '#4a3a2a';
  cityCtx.lineWidth = 3;
  cityCtx.beginPath();
  cityCtx.moveTo(flagX, flagY + 15);
  cityCtx.lineTo(flagX, flagY - 15);
  cityCtx.stroke();

  // Flag
  const time = Date.now() / 1000;
  const wave = Math.sin(time * 3) * 2;
  cityCtx.fillStyle = key === 'MAIN_HALL' ? '#ffd700' : '#c44';
  cityCtx.beginPath();
  cityCtx.moveTo(flagX, flagY - 15);
  cityCtx.quadraticCurveTo(flagX + 10 + wave, flagY - 10, flagX + 15, flagY - 8 + wave);
  cityCtx.quadraticCurveTo(flagX + 10 + wave, flagY - 3, flagX, flagY - 3);
  cityCtx.closePath();
  cityCtx.fill();
}

// ========== DECORATIVE ELEMENTS ==========
function drawAnvil(x, y, bw) {
  cityCtx.fillStyle = '#333';
  cityCtx.fillRect(x + bw * 0.5, y - 8, 15, 8);
  cityCtx.fillRect(x + bw * 0.5 - 3, y - 12, 21, 5);
}

function drawGears(x, y, bw, bh) {
  const time = Date.now() / 1000;
  cityCtx.save();
  cityCtx.translate(x - bw * 0.7, y - bh * 0.6);
  cityCtx.rotate(time);
  cityCtx.fillStyle = '#666';
  for (let i = 0; i < 6; i++) {
    cityCtx.fillRect(-8, -2, 16, 4);
    cityCtx.rotate(Math.PI / 3);
  }
  cityCtx.beginPath();
  cityCtx.arc(0, 0, 5, 0, Math.PI * 2);
  cityCtx.fill();
  cityCtx.restore();
}

function drawWeaponRack(x, y, bw) {
  // Swords
  cityCtx.strokeStyle = '#888';
  cityCtx.lineWidth = 2;
  cityCtx.beginPath();
  cityCtx.moveTo(x + bw * 0.6, y - 5);
  cityCtx.lineTo(x + bw * 0.6, y - 20);
  cityCtx.moveTo(x + bw * 0.75, y - 5);
  cityCtx.lineTo(x + bw * 0.75, y - 18);
  cityCtx.stroke();
}

function drawCrates(x, y, bw) {
  cityCtx.fillStyle = '#8b7355';
  cityCtx.fillRect(x + bw * 0.5, y - 10, 12, 10);
  cityCtx.fillStyle = '#7a6345';
  cityCtx.fillRect(x + bw * 0.6, y - 18, 10, 8);
}

function drawStatue(x, y, bw, bh) {
  // Small hero statue
  cityCtx.fillStyle = '#c9a86c';
  cityCtx.fillRect(x - bw * 0.7 - 5, y - 8, 10, 8);
  cityCtx.fillStyle = '#d4b896';
  cityCtx.beginPath();
  cityCtx.arc(x - bw * 0.7, y - 20, 6, 0, Math.PI * 2);
  cityCtx.fill();
  cityCtx.fillRect(x - bw * 0.7 - 4, y - 16, 8, 12);
}

// ========== SPECIAL BUILDING TYPES ==========
function drawRoundBuilding(x, y, bw, bh, style, level) {
  // Silo-style round building
  cityCtx.fillStyle = style.base;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, bw * 0.8, bw * 0.4, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Cylindrical body
  const bodyGrad = cityCtx.createLinearGradient(x - bw * 0.8, 0, x + bw * 0.8, 0);
  bodyGrad.addColorStop(0, style.wallColor);
  bodyGrad.addColorStop(0.3, shadeColor(style.wallColor, 20));
  bodyGrad.addColorStop(0.7, shadeColor(style.wallColor, -10));
  bodyGrad.addColorStop(1, shadeColor(style.wallColor, -30));
  cityCtx.fillStyle = bodyGrad;
  cityCtx.beginPath();
  cityCtx.moveTo(x - bw * 0.8, y);
  cityCtx.lineTo(x - bw * 0.8, y - bh);
  cityCtx.ellipse(x, y - bh, bw * 0.8, bw * 0.4, 0, Math.PI, 0, true);
  cityCtx.lineTo(x + bw * 0.8, y);
  cityCtx.closePath();
  cityCtx.fill();

  // Conical roof
  cityCtx.fillStyle = style.roof;
  cityCtx.beginPath();
  cityCtx.moveTo(x, y - bh - bw * 0.8);
  cityCtx.lineTo(x - bw * 0.9, y - bh + bw * 0.1);
  cityCtx.ellipse(x, y - bh, bw * 0.9, bw * 0.45, 0, Math.PI, 0, false);
  cityCtx.closePath();
  cityCtx.fill();

  // Wheat decoration
  if (style.hasWheat) {
    cityCtx.fillStyle = '#daa520';
    cityCtx.font = '14px Arial';
    cityCtx.fillText('🌾', x, y - bh * 0.5);
  }
}

function drawWallBuilding(x, y, bw, bh, style, level) {
  // Wall segment
  cityCtx.fillStyle = style.wallColor;
  cityCtx.fillRect(x - bw * 0.8, y - bh, bw * 1.6, bh);

  // Stone texture
  cityCtx.strokeStyle = shadeColor(style.wallColor, -15);
  cityCtx.lineWidth = 1;
  for (let row = 0; row < 4; row++) {
    const rowY = y - row * (bh / 4);
    for (let col = 0; col < 3; col++) {
      const stoneX = x - bw * 0.7 + col * bw * 0.5 + (row % 2) * bw * 0.25;
      cityCtx.strokeRect(stoneX, rowY - bh / 4, bw * 0.45, bh / 4.5);
    }
  }

  // Crenellations
  for (let i = 0; i < 5; i++) {
    const cx = x - bw * 0.6 + i * bw * 0.3;
    cityCtx.fillStyle = style.wallColor;
    cityCtx.fillRect(cx - 5, y - bh - 10, 10, 12);
  }

  // Torches
  if (style.hasTorches && level >= 5) {
    const time = Date.now() / 1000;
    [-0.5, 0.5].forEach(pos => {
      const tx = x + bw * pos;
      cityCtx.fillStyle = '#4a3a2a';
      cityCtx.fillRect(tx - 2, y - bh * 0.7, 4, 15);
      cityCtx.fillStyle = `rgba(255,${150 + Math.sin(time * 10) * 50},0,0.8)`;
      cityCtx.beginPath();
      cityCtx.arc(tx, y - bh * 0.75, 5 + Math.sin(time * 8) * 2, 0, Math.PI * 2);
      cityCtx.fill();
    });
  }
}

function drawTentBuilding(x, y, bw, bh, style) {
  // Tent fabric
  cityCtx.fillStyle = style.wallColor;
  cityCtx.beginPath();
  cityCtx.moveTo(x, y - bh - bw * 0.3);
  cityCtx.quadraticCurveTo(x - bw * 0.5, y - bh * 0.3, x - bw, y);
  cityCtx.lineTo(x + bw, y);
  cityCtx.quadraticCurveTo(x + bw * 0.5, y - bh * 0.3, x, y - bh - bw * 0.3);
  cityCtx.closePath();
  cityCtx.fill();

  // Tent pole
  cityCtx.strokeStyle = '#5a4a3a';
  cityCtx.lineWidth = 4;
  cityCtx.beginPath();
  cityCtx.moveTo(x, y);
  cityCtx.lineTo(x, y - bh - bw * 0.3);
  cityCtx.stroke();

  // Cross (healing tent)
  if (style.hasCross) {
    cityCtx.fillStyle = '#cc0000';
    cityCtx.fillRect(x - 8, y - bh * 0.6 - 3, 16, 6);
    cityCtx.fillRect(x - 3, y - bh * 0.6 - 8, 6, 16);
  }
}

function drawUndergroundBuilding(x, y, bw, style) {
  // Trapdoor/underground entrance
  cityCtx.fillStyle = '#3a3a2a';
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, bw * 0.6, bw * 0.35, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Dark hole
  cityCtx.fillStyle = '#1a1a1a';
  cityCtx.beginPath();
  cityCtx.ellipse(x, y - 3, bw * 0.45, bw * 0.25, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Wooden trapdoor edge
  cityCtx.strokeStyle = '#5a4a3a';
  cityCtx.lineWidth = 3;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, bw * 0.6, bw * 0.35, 0, 0, Math.PI * 2);
  cityCtx.stroke();
}

function drawWaterBuilding(x, y, bw, style) {
  // Moat/water feature
  const time = Date.now() / 1000;
  cityCtx.fillStyle = style.wallColor;
  cityCtx.beginPath();
  cityCtx.ellipse(x, y, bw * 0.8, bw * 0.45, 0, 0, Math.PI * 2);
  cityCtx.fill();

  // Water shine
  cityCtx.fillStyle = 'rgba(255,255,255,0.3)';
  cityCtx.beginPath();
  cityCtx.ellipse(x - bw * 0.2, y - bw * 0.1, bw * 0.2, bw * 0.1, -0.3, 0, Math.PI * 2);
  cityCtx.fill();

  // Ripples
  cityCtx.strokeStyle = 'rgba(255,255,255,0.4)';
  cityCtx.lineWidth = 1;
  for (let i = 0; i < 2; i++) {
    const rippleSize = (time * 0.5 + i * 0.5) % 1;
    cityCtx.beginPath();
    cityCtx.ellipse(x, y, bw * 0.3 * (1 + rippleSize), bw * 0.15 * (1 + rippleSize), 0, 0, Math.PI * 2);
    cityCtx.stroke();
  }
}

// ========== TRAVIAN-STYLE LEVEL BADGE ==========
function drawTravianLevelBadge(x, y, bw, bh, level, isHovered, canUpgrade = true, place = null) {
  const badgeX = place ? place.x : x + bw * 0.6;
  const badgeY = place ? place.y : y - bh * 0.3;
  const badgeRadius = place ? place.radius : 12;
  const fontPx = Math.round(badgeRadius * (level >= 10 ? 0.92 : 1.08));

  // Travian Legends style: blue circle with white text (like screenshot)
  const bgColor = isHovered ? '#4a9ad8' : '#3a8ac8';

  // Badge shadow
  cityCtx.fillStyle = 'rgba(0,0,0,0.5)';
  cityCtx.beginPath();
  cityCtx.arc(badgeX + 1, badgeY + 2, badgeRadius + 1, 0, Math.PI * 2);
  cityCtx.fill();

  // Badge background (Travian blue circle)
  const badgeGrad = cityCtx.createRadialGradient(badgeX - 2, badgeY - 2, 0, badgeX, badgeY, badgeRadius);
  badgeGrad.addColorStop(0, isHovered ? '#6ab8f0' : '#5aa8e0');
  badgeGrad.addColorStop(0.6, bgColor);
  badgeGrad.addColorStop(1, '#2a6aa0');
  cityCtx.fillStyle = badgeGrad;
  cityCtx.beginPath();
  cityCtx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
  cityCtx.fill();

  // Badge border (white like Travian)
  cityCtx.strokeStyle = isHovered ? '#ffffff' : 'rgba(255,255,255,0.8)';
  cityCtx.lineWidth = 2;
  cityCtx.stroke();

  // Inner highlight (shine)
  cityCtx.strokeStyle = 'rgba(255,255,255,0.4)';
  cityCtx.lineWidth = 1;
  cityCtx.beginPath();
  cityCtx.arc(badgeX, badgeY, badgeRadius - 3, Math.PI * 1.1, Math.PI * 1.9);
  cityCtx.stroke();

  // Level number (white, bold)
  cityCtx.fillStyle = '#ffffff';
  cityCtx.font = `bold ${fontPx}px Arial, sans-serif`;
  cityCtx.textAlign = 'center';
  cityCtx.textBaseline = 'middle';
  cityCtx.fillText(level.toString(), badgeX, badgeY + 1);
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
  const buildings = currentCity?.buildings || [];
  // The centre slot always holds the Main Hall, wherever older data stored it
  if (slotNum === 0) return buildings.find(b => b.key === 'MAIN_HALL') || buildings.find(b => b.slot === 0);
  return buildings.find(b => b.slot === slotNum && b.key !== 'MAIN_HALL');
}

function onCityMouseMove(e) {
  const rect = cityCanvas.getBoundingClientRect();
  const mouseX = (e.clientX - rect.left) * (cityViewW / rect.width);
  const mouseY = (e.clientY - rect.top) * (cityViewH / rect.height);

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

    // Curseur pointer dynamique
    cityCanvas.style.cursor = foundSlot !== null ? 'pointer' : 'default';

    if (foundSlot !== null) {
      showCityTooltip(e.clientX, e.clientY, foundSlot);
    } else {
      hideCityTooltip();
    }
  } else if (foundSlot !== null) {
    // Mettre à jour la position du tooltip même si le slot n'a pas changé
    const tooltip = document.getElementById('city-tooltip');
    if (tooltip && tooltip.style.display !== 'none') {
      const canvasRect = cityCanvas.parentElement.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      let left = e.clientX - canvasRect.left + 10;
      let top = e.clientY - canvasRect.top + 20;
      if (left + tooltipRect.width > canvasRect.width - 10) {
        left = e.clientX - canvasRect.left - tooltipRect.width - 10;
      }
      if (top + tooltipRect.height > canvasRect.height - 10) {
        top = e.clientY - canvasRect.top - tooltipRect.height - 20;
      }
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }
  }
}

// Animation de clic (ripple effect)
function showClickRipple(x, y) {
  const ripple = document.createElement('div');
  ripple.className = 'click-ripple';
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;
  cityCanvas.parentElement.appendChild(ripple);
  setTimeout(() => ripple.remove(), 500);
}

function onCityClick(e) {
  if (!currentCity) return; // Guard: city data not loaded yet
  if (cityHoveredSlot !== null) {
    // Feedback visuel de clic
    const canvasRect = cityCanvas.getBoundingClientRect();
    showClickRipple(e.clientX - canvasRect.left, e.clientY - canvasRect.top);

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
    // Vue champs - style Travian
    if (slot?.isVillageCenter) {
      html = `
        <h4><span class="tt-icon">🏰</span> Centre du Village</h4>
        <p class="tt-hint">Cliquez pour voir les bâtiments</p>
      `;
    } else if (slot?.isField) {
      const fieldIcons = {
        FARM: '🌾',
        LUMBER: '🪵',
        QUARRY: '🪨',
        IRON_MINE: '⛏️'
      };
      const fieldNames = {
        FARM: 'Champ de blé',
        LUMBER: 'Scierie',
        QUARRY: 'Carrière de pierre',
        IRON_MINE: 'Mine de fer'
      };
      const building = getFieldBuildingAtSlot(slot.slot, slot.fieldType);
      const level = building?.level || 0;
      const production = level > 0 ? getProductionAtLevel(slot.fieldType, level) : 0;
      const cvMainHall = currentCity?.buildings?.find(b => b.key === 'MAIN_HALL');
      const cvMainHallLevel = cvMainHall?.level || 1;
      const cvFieldDef = buildingsData?.find(b => b.key === slot.fieldType);
      const cvFieldMax = cvFieldDef?.maxLevel || 20;
      const cvEffectiveMax = Math.min(cvFieldMax, cvMainHallLevel);

      html = `
        <h4><span class="tt-icon">${fieldIcons[slot.fieldType] || '🏭'}</span> ${fieldNames[slot.fieldType] || 'Ressource'}</h4>
        <p class="tt-level">Niveau ${level}/${cvEffectiveMax}</p>
        ${production > 0 ? `<p class="tt-production">+${formatNum(production)} par heure</p>` : ''}
        <p class="tt-hint">${level === 0 ? 'Cliquez pour construire' : level >= cvEffectiveMax ? (level >= cvFieldMax ? 'Niveau maximum atteint' : `Limité par Bât. principal (Niv.${cvMainHallLevel})`) : 'Cliquez pour améliorer'}</p>
      `;
    }
  } else {
    // Vue ville - style Travian
    const building = getBuildingAtSlot(slotNum);

    if (building) {
      const def = buildingsData?.find(b => b.key === building.key);
      const maxLevel = def?.maxLevel || 20;
      const ttMainHall = currentCity?.buildings?.find(b => b.key === 'MAIN_HALL');
      const ttMainHallLevel = ttMainHall?.level || 1;
      const ttEffectiveMax = building.key === 'MAIN_HALL' ? maxLevel : Math.min(maxLevel, ttMainHallLevel);
      const production = ['LUMBER', 'QUARRY', 'IRON_MINE', 'FARM'].includes(building.key) ? getProductionAtLevel(building.key, building.level) : 0;
      const effect = getBuildingEffect(building.key, building.level);

      html = `
        <h4><span class="tt-icon">${BUILDING_ICONS[building.key] || '🏠'}</span> ${getBuildingName(building.key)}</h4>
        <p class="tt-level">Niveau ${building.level}/${ttEffectiveMax}</p>
        ${production > 0 ? `<p class="tt-production">+${formatNum(production)} par heure</p>` : ''}
        ${effect ? `<div class="tt-stats"><span class="tt-stat">${effect}</span></div>` : ''}
        <p class="tt-hint">${building.level < ttEffectiveMax ? 'Cliquez pour améliorer' : building.level >= maxLevel ? 'Niveau maximum atteint' : `Limité par Bât. principal (Niv.${ttMainHallLevel})`}</p>
      `;
    } else if (slot?.fixed) {
      const mainHall = getBuildingAtSlot(0);
      const level = mainHall?.level || 1;
      html = `
        <h4><span class="tt-icon">🏛️</span> Bâtiment principal</h4>
        <p class="tt-level">Niveau ${level}/30</p>
        <p class="tt-hint">Cliquez pour améliorer</p>
      `;
    } else {
      html = `
        <h4><span class="tt-icon">🔨</span> Emplacement libre</h4>
        <p class="tt-hint">Cliquez pour construire un bâtiment</p>
      `;
    }
  }

  tooltip.innerHTML = html;
  tooltip.style.display = 'block';

  // Positionner le tooltip sous le curseur avec animation
  const canvasRect = cityCanvas.parentElement.getBoundingClientRect();
  const tooltipRect = tooltip.getBoundingClientRect();

  let left = mouseX - canvasRect.left + 10;
  let top = mouseY - canvasRect.top + 20;

  // Éviter que le tooltip sorte de l'écran
  if (left + tooltipRect.width > canvasRect.width - 10) {
    left = mouseX - canvasRect.left - tooltipRect.width - 10;
  }
  if (top + tooltipRect.height > canvasRect.height - 10) {
    top = mouseY - canvasRect.top - tooltipRect.height - 20;
  }

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

// Helper pour obtenir l'effet d'un bâtiment (39 bâtiments)
function getBuildingEffect(key, level) {
  const effects = {
    // Base & Intermediate
    'MAIN_HALL': `Réduction construction: ${(level * 2.5).toFixed(1)}%`,
    'BARRACKS': `Réduction entraînement: ${(level * 0.5).toFixed(1)}%`,
    'STABLE': `Réduction entraînement: ${(level * 0.5).toFixed(1)}%`,
    'WORKSHOP': `Réduction entraînement: ${(level * 4).toFixed(1)}%`,
    'ACADEMY': `Réduction recherche: ${(level * 1).toFixed(1)}%`,
    'FORGE': `Bonus défense global: ${(level * 0.5).toFixed(1)}%`,
    'WALL': `Bonus défense: ${(level * 1).toFixed(1)}%`,
    'MOAT': `Bonus ATK/DEF: ${(level * 0.5).toFixed(1)}%`,
    'HIDEOUT': `Ressources cachées: ${Math.min(level * 1, 20)}%`,
    'HEALING_TENT': `Capacité soins: ${level * 3} unités`,
    'HERO_HOME': `Bonus XP héros: ${(level * 2).toFixed(0)}%`,
    'HERO_MANSION': `Résurrection: -${(level * 2).toFixed(0)}% temps`,
    'MARKET': `Taxe réduite: ${(30 - level).toFixed(0)}%`,
    'RALLY_POINT': `Armées max: ${Math.min(1 + Math.floor(level / 5), 3)}`,
    'WAREHOUSE': `Capacité: ${formatNum(1200 + (160000 - 1200) * (level - 1) / 19)}`,
    'SILO': `Capacité: ${formatNum(1200 + (160000 - 1200) * (level - 1) / 19)}`,
    // Production bonus
    'MILL': `Bonus céréales: +${(4 + (level - 1) * 4).toFixed(0)}%`,
    'BAKERY': `Bonus céréales: +${(4 + (level - 1) * 4).toFixed(0)}%`,
    'SAWMILL': `Bonus bois: +${(5 * level).toFixed(0)}%`,
    'STONEMASON': `Bonus pierre: +${(5 * level).toFixed(0)}%`,
    'FOUNDRY': `Bonus fer: +${(5 * level).toFixed(0)}%`,
    // Protected storage
    'GREAT_SILO': `Protégé: ${formatNum(3600 + (600000 - 3600) * (level - 1) / 19)}`,
    'GREAT_WAREHOUSE': `Protégé: ${formatNum(3600 + (600000 - 3600) * (level - 1) / 19)}`,
    // Military advanced
    'GREAT_BARRACKS': `Réduction: -${(level * 4).toFixed(0)}% temps`,
    'GREAT_STABLE': `Réduction: -${(level * 4).toFixed(0)}% temps`,
    'WATCHTOWER': `Vision: ${5 + level * 6} cases`,
    // Special buildings
    'EMBASSY': `Aide alliance: ${Math.min(level, 20)} max`,
    'TREASURE_CHAMBER': `Or/jour: ${10 + (level - 1) * 10}`,
    'RESIDENCE': `Colons: ${level >= 20 ? 3 : level >= 15 ? 2 : level >= 10 ? 1 : 0}`,
    'TRADE_OFFICE': `Taxe P2P: -${level}%`,
    // Faction buildings
    'ROMAN_THERMAE': `Soins: -${(level * 1.5).toFixed(1)}% temps`,
    'GALLIC_BREWERY': `Défense siège: +${level}%`,
    'GREEK_TEMPLE': `Recherche: -${level}%`,
    'EGYPTIAN_IRRIGATION': `Production: +${level}%`,
    'HUN_WAR_TENT': `Entretien: -${(level * 0.5).toFixed(1)}%`,
    'SULTAN_DESERT_OUTPOST': `Taxe inter-villes: -${(level * 0.5).toFixed(1)}%`
  };
  return effects[key] || null;
}

function hideCityTooltip() {
  const tooltip = document.getElementById('city-tooltip');
  if (tooltip) tooltip.style.display = 'none';
}

