// ============================================================
// 04-buildings-render.js — Bâtiments de la vue ville : sprite 3D, badge de niveau, chantier, couche
// d'overlay, clic et survol (infobulle), effets des bâtiments
// Découpé depuis app.js (lignes 3458-4648) — portée globale partagée,
// l'ordre de chargement dans index.html doit être respecté.
// ============================================================
// ========== BÂTIMENT 2.5D (sprite rendu en 3D : assets/images/3d/buildings/<faction>/<key>[_snow].webp) ==========
// Le losange de parcelle du sprite (100/130 de sa largeur) recouvre la cellule ; l'ombre portée fait partie du
// rendu. Tant que l'image n'est pas chargée, seule la parcelle est visible (le rendu est relancé au chargement).
function draw25DBuilding(x, y, size, key, level, isHovered, isBuilding) {
  const bw = size * 0.55;
  if (isHovered) {   // halo doré au sol
    cityCtx.shadowColor = '#ffd700'; cityCtx.shadowBlur = 30; cityCtx.fillStyle = 'rgba(255,215,0,0.15)';
    cityCtx.beginPath(); cityCtx.ellipse(x, y, bw + 10, (bw + 10) * 0.55, 0, 0, Math.PI * 2); cityCtx.fill();
    cityCtx.shadowBlur = 0;
  }
  if (isBuilding) cityCtx.globalAlpha = 0.6 + Math.sin(Date.now() / 150) * 0.2;   // chantier : le bâtiment pulse
  const sprite = getSprite(buildingSpriteUrl(key, level));
  if (sprite) drawSprite(cityCtx, sprite, x, y, size * 1.7, spriteVariant(isHovered));
  cityCtx.globalAlpha = 1;
  // Badge de niveau au coin droit de la parcelle, dans la couche d'overlay (jamais masqué par un voisin)
  if (level > 0) isoOverlay(() => drawTravianLevelBadge(x, y, bw, 0, level, isHovered, true, typeof isoBadgeSpec === 'function' ? isoBadgeSpec(x, y, size * 0.78, size * 0.39) : { x: x + size * 0.62, y: y + size * 0.1, radius: Math.max(8, Math.min(13, size * 0.3)) }));
  if (isBuilding) isoOverlay(() => drawBuildIndicator(cityCtx, x, y - size * 1.05 + Math.sin(Date.now() / 200) * 3, Math.max(16, size * 0.36)));
}

// Indicateur de chantier : icône 3D du marteau (assets/images/3d/ui/build.webp), flottante
function drawBuildIndicator(ctx, x, y, s) {
  const img = getSprite('assets/images/3d/ui/build.webp');
  if (img) ctx.drawImage(img, x - s / 2, y - s / 2, s, s);
}

// Couche d'overlay de la scène iso : les badges et indicateurs sont dessinés après tous les bâtiments
let isoOverlayQueue = null;
function isoOverlay(fn) { if (isoOverlayQueue) isoOverlayQueue.push(fn); else fn(); }

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
  if (e && e.type === 'click' && typeof isoIgnoreClick === 'function' && isoIgnoreClick()) return;   // tap déjà traité ou déplacement
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
        <h4><span class="tt-icon">${resIconHtml('city')}</span> Centre du Village</h4>
        <p class="tt-hint">Cliquez pour voir les bâtiments</p>
      `;
    } else if (slot?.isField) {
      const fieldIcons = { FARM: resIconHtml('food'), LUMBER: resIconHtml('wood'), QUARRY: resIconHtml('stone'), IRON_MINE: resIconHtml('iron') };
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
        <h4><span class="tt-icon">${fieldIcons[slot.fieldType] || resIconHtml('fields')}</span> ${fieldNames[slot.fieldType] || 'Ressource'}</h4>
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
        <h4><span class="tt-icon">${buildingIconHtml(building.key)}</span> ${getBuildingName(building.key)}</h4>
        <p class="tt-level">Niveau ${building.level}/${ttEffectiveMax}</p>
        ${production > 0 ? `<p class="tt-production">+${formatNum(production)} par heure</p>` : ''}
        ${effect ? `<div class="tt-stats"><span class="tt-stat">${effect}</span></div>` : ''}
        <p class="tt-hint">${building.level < ttEffectiveMax ? 'Cliquez pour améliorer' : building.level >= maxLevel ? 'Niveau maximum atteint' : `Limité par Bât. principal (Niv.${ttMainHallLevel})`}</p>
      `;
    } else if (slot?.fixed) {
      const mainHall = getBuildingAtSlot(0);
      const level = mainHall?.level || 1;
      html = `
        <h4><span class="tt-icon"><img class="ico" src="assets/images/3d/ui/city.webp" alt=""></span> Bâtiment principal</h4>
        <p class="tt-level">Niveau ${level}/30</p>
        <p class="tt-hint">Cliquez pour améliorer</p>
      `;
    } else {
      html = `
        <h4><span class="tt-icon"><img class="ico" src="assets/images/3d/ui/build.webp" alt=""></span> Emplacement libre</h4>
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

