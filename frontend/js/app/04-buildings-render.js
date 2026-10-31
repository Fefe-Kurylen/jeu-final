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
  // Chantier peint (guide § S10-S11) : nouveau bâtiment → sprite du chantier de la civilisation ; amélioration → bâtiment
  // + échafaudage de la civilisation ; sans image livrée, le bâtiment clignote comme avant
  const siteUrl = isBuilding && level === 0 ? buildingSiteUrl(key) : null;
  const site = siteUrl ? getSprite(siteUrl) : null;
  const scaffoldSrc = isBuilding && !site ? scaffoldUrl(level || 1) : null;
  const scaffold = scaffoldSrc ? getSprite(scaffoldSrc) : null;
  if (isBuilding && !site && !scaffold) cityCtx.globalAlpha = 0.6 + Math.sin(Date.now() / 150) * 0.2;   // chantier : le bâtiment pulse
  const sprite = site || getSprite(buildingSpriteUrl(key, level));
  if (sprite) drawSprite(cityCtx, sprite, x, y, size * 1.7, spriteVariant(isHovered));
  cityCtx.globalAlpha = 1;
  if (scaffold) drawSprite(cityCtx, scaffold, x, y, size * 1.7, spriteVariant(false));
  // Badge de niveau au coin droit de la parcelle, dans la couche d'overlay (jamais masqué par un voisin)
  if (level > 0 && isoShowBadges(isHovered)) { const badge = isoBadgeSpec(x, y, size * 0.78, size * 0.39); isoOverlay(() => drawTravianLevelBadge(level, isHovered, badge)); }
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

// Badge de niveau ; place = { x, y, radius } (isoBadgeSpec)
function drawTravianLevelBadge(level, isHovered, place) {
  const badgeX = place.x, badgeY = place.y, badgeRadius = place.radius;
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
  // Le Mur est sur l'enceinte, à sa place fixe (cityWallSlot) : jamais sur un emplacement de l'anneau
  if (slotNum === cityWallSlot()) return buildings.find(b => b.key === 'WALL');
  return buildings.find(b => b.slot === slotNum && b.key !== 'MAIN_HALL' && b.key !== 'WALL');
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
  if (e && e.type === 'click' && isoIgnoreClick()) return;   // tap déjà traité ou déplacement
  if (cityHoveredSlot === null) { hideCityActions(); return; }   // toucher sur le terrain : referme la bulle
  // Feedback visuel de clic
  const canvasRect = cityCanvas.getBoundingClientRect();
  showClickRipple(e.clientX - canvasRect.left, e.clientY - canvasRect.top);
  // Bulles d'action au-dessus de l'emplacement (Améliorer / Construire, Recruter, Infos…), façon Rise of Kingdoms
  showCityActions(cityHoveredSlot);
}

// Infobulle de survol (souris) : contenu et taille recalculés seulement quand l'emplacement ou les données de la ville
// changent ; sur le même emplacement, les mouvements suivants ne font que la déplacer (une écriture par image, sans
// relire la mise en page)
const cityTip = { slot: null, city: null, w: 0, h: 0, box: null, x: 0, y: 0, raf: 0 };
function showCityTooltip(mouseX, mouseY, slotNum) {
  const tooltip = document.getElementById('city-tooltip');
  if (!tooltip) return;
  cityTip.x = mouseX; cityTip.y = mouseY;
  if (cityTip.slot !== slotNum || cityTip.city !== currentCity || tooltip.style.display === 'none') {
    tooltip.innerHTML = cityTooltipHtml(slotNum);
    tooltip.style.display = 'block';
    const r = tooltip.getBoundingClientRect();
    cityTip.slot = slotNum; cityTip.city = currentCity; cityTip.w = r.width; cityTip.h = r.height;
    cityTip.box = cityCanvas.parentElement.getBoundingClientRect();
    placeCityTooltip(tooltip);
    return;
  }
  if (!cityTip.raf) cityTip.raf = requestAnimationFrame(() => { cityTip.raf = 0; if (cityTip.slot !== null) placeCityTooltip(tooltip); });
}

// Positionner le tooltip sous le curseur, sans sortir du cadre de la vue
function placeCityTooltip(tooltip) {
  const box = cityTip.box;
  let left = cityTip.x - box.left + 10;
  let top = cityTip.y - box.top + 20;
  if (left + cityTip.w > box.width - 10) left = cityTip.x - box.left - cityTip.w - 10;
  if (top + cityTip.h > box.height - 10) top = cityTip.y - box.top - cityTip.h - 20;
  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function cityTooltipHtml(slotNum) {
  const slot = citySlots.find(s => s.slot === slotNum);

  if (slot?.isField) {
    // Champ (même scène que la ville)
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

    return `
      <h4><span class="tt-icon">${fieldIcons[slot.fieldType] || resIconHtml('fields')}</span> ${fieldNames[slot.fieldType] || 'Ressource'}</h4>
      <p class="tt-level">Niveau ${level}/${cvEffectiveMax}</p>
      ${production > 0 ? `<p class="tt-production">+${formatNum(production)} par heure</p>` : ''}
      <p class="tt-hint">${level === 0 ? 'Cliquez pour construire' : level >= cvEffectiveMax ? (level >= cvFieldMax ? 'Niveau maximum atteint' : `Limité par Bât. principal (Niv.${cvMainHallLevel})`) : 'Cliquez pour améliorer'}</p>
    `;
  }

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

    return `
      <h4><span class="tt-icon">${buildingIconHtml(building.key)}</span> ${getBuildingName(building.key)}</h4>
      <p class="tt-level">Niveau ${building.level}/${ttEffectiveMax}</p>
      ${production > 0 ? `<p class="tt-production">+${formatNum(production)} par heure</p>` : ''}
      ${effect ? `<div class="tt-stats"><span class="tt-stat">${effect}</span></div>` : ''}
      ${def?.effects?.capitalOnly ? '<p class="tt-hint">Bâtiment de la capitale : son bonus vaut pour toutes vos villes</p>' : ''}
      <p class="tt-hint">${building.level < ttEffectiveMax ? 'Cliquez pour améliorer' : building.level >= maxLevel ? 'Niveau maximum atteint' : `Limité par Bât. principal (Niv.${ttMainHallLevel})`}</p>
    `;
  }
  if (slot?.wall) {
    return `
      <h4><span class="tt-icon">${buildingIconHtml('WALL')}</span> ${getBuildingName('WALL')}</h4>
      <p class="tt-hint">Pas encore bâti : touchez l'enceinte pour construire le Mur</p>
    `;
  }
  if (slot?.fixed) {
    const mainHall = getBuildingAtSlot(0);
    const level = mainHall?.level || 1;
    return `
      <h4><span class="tt-icon">${resIconHtml('city')}</span> Bâtiment principal</h4>
      <p class="tt-level">Niveau ${level}/20</p>
      <p class="tt-hint">Cliquez pour améliorer</p>
    `;
  }
  return `
    <h4><span class="tt-icon">${resIconHtml('build')}</span> Emplacement libre</h4>
    <p class="tt-hint">Cliquez pour construire un bâtiment</p>
  `;
}

// Helper pour obtenir l'effet d'un bâtiment (38 bâtiments)
function getBuildingEffect(key, level) {
  const curve = (l1, l20) => (level <= 0 ? 0 : level >= 20 ? l20 : Math.round(l1 * Math.pow(l20 / l1, (level - 1) / 19)));
  const office = window.buildingsData?.find(b => b.key === 'TRADE_OFFICE')?.effects || {};
  const effects = {
    // Construction and training
    'MAIN_HALL': `Construction: -${Math.min(60, level * 2.5).toFixed(1)}% de temps${level * 2.5 >= 60 ? ' (plafond 60 %)' : ''}`,
    'ACADEMY': `Construction: -${(level * 1).toFixed(0)}% de temps`,
    'RESIDENCE': `Construction: -${(level * 0.25).toFixed(2)}% de temps · colons aux niv. 10 et 20 · gisement d'une colonie : +${siteBonusPct(1)} % par niveau sur sa ressource, ${String(siteOtherPct()).replace('-', '−')} % sur les autres`,
    'BARRACKS': `Entraînement: -${(level * 0.5).toFixed(1)}% · élite au niv. 15`,
    'STABLE': `Entraînement: -${(level * 0.5).toFixed(1)}% · élite au niv. 15`,
    'WORKSHOP': `Entraînement: -${(level * 4).toFixed(0)}% de temps`,
    'GREAT_BARRACKS': `Entraînement: -${(level * 4).toFixed(0)}% de temps`,
    'GREAT_STABLE': `Entraînement: -${(level * 4).toFixed(0)}% de temps`,
    // Defence
    'FORGE': `Défense de toutes vos villes: +${(level * 0.5).toFixed(1)}%`,
    'WALL': `Défense: +${level}% · ${formatNum(Math.round(level * 1000 * (1 + factionBonusPct(player?.faction, 'wallHealth', player?.faction === 'EGYPT' ? 25 : 0) / 100)))} PV${factionBonusPct(player?.faction, 'wallHealth', player?.faction === 'EGYPT' ? 25 : 0) ? ` (dont +${factionBonusPct(player?.faction, 'wallHealth', 25)} % de bonus de civilisation)` : ''} · seuls les engins l'abîment`,
    // la cachette seule protège du pillage (Gaule : +15 %, 20 % au plus) ; Grand silo et Grand dépôt : du stockage
    'HIDEOUT': `Ressources à l'abri des pillages: ${+Math.min(20, level * (1 + factionBonusPct(player?.faction, 'hideoutCapacity', player?.faction === 'GAUL' ? 15 : 0) / 100)).toFixed(1)}%`,
    'GREAT_SILO': `Capacité: +${formatNum(getStorageAtLevel(level, 'GREAT_SILO'))} (3 × un silo)`,
    'GREAT_WAREHOUSE': `Capacité: +${formatNum(getStorageAtLevel(level, 'GREAT_WAREHOUSE'))} (3 × un dépôt)`,
    'HEALING_TENT': `Blessés récupérés: ${Math.min(70, 30 + level * 3)}% des pertes`,
    'WATCHTOWER': `${level >= 10 ? '2 espions' : level >= 5 ? '1 espion' : 'Espion au niv. 5'} · espions ennemis : ${level >= 15 ? 'qui et quand' : level >= 10 ? 'quand' : level >= 5 ? 'passage' : 'niv. 5'} · attaquant révélé niv. 10, effectifs niv. 15`,
    // Resource fields
    'FARM': `Céréales: +${formatNum(getProductionAtLevel('FARM', level))}/h`,
    'LUMBER': `Bois: +${formatNum(getProductionAtLevel('LUMBER', level))}/h`,
    'QUARRY': `Pierre: +${formatNum(getProductionAtLevel('QUARRY', level))}/h`,
    'IRON_MINE': `Fer: +${formatNum(getProductionAtLevel('IRON_MINE', level))}/h`,
    // Economy
    'WAREHOUSE': `Capacité: ${formatNum(getStorageAtLevel(level, 'WAREHOUSE'))}`,
    'SILO': `Capacité: ${formatNum(getStorageAtLevel(level, 'SILO'))}`,
    'MARKET': `Taxe du marchand: ${Math.max(5, 30 - Math.max(0, level - 1))}% · convois +${level * 5}%`,
    // le meilleur Comptoir des colonies vaut pour toutes les villes du joueur (décision du 30 octobre 2026)
    'TRADE_OFFICE': `Taxe des échanges: -${level * (office.p2pTaxReductionPctPerLevel || 0)}% · transport: +${level * (office.armyTransportCapacityBonusPctPerLevel || 0)}% · pour toutes vos villes`,
    'MILL': `Céréales: +${level * 5}%`,
    'BAKERY': `Céréales: +${level * 5}%`,
    'SAWMILL': `Bois: +${level * 5}%`,
    'STONEMASON': `Pierre: +${level * 5}%`,
    'FOUNDRY': `Fer: +${level * 5}%`,
    'TREASURE_CHAMBER': `Or: ${curve(10, 200)} par jour`,
    // Military and social
    'RALLY_POINT': `Armées en campagne par ville: ${level <= 0 ? 0 : Math.min(5, 1 + Math.floor(level / 5))}`,
    'EMBASSY': `Alliance: rejoindre dès le niv. 5, fonder dès le niv. 7`,
    'HERO_MANSION': 'Accès au héros depuis la ville (pas de bonus par niveau)',
    // Faction buildings
    'ROMAN_THERMAE': `Soins: -${(level * 1.5).toFixed(1)}% de temps · blessés +${(level * 0.5).toFixed(1)}%`,
    'GALLIC_BREWERY': `Défense de toutes vos villes: +${level}%`,
    'GREEK_TEMPLE': `Blessés au lieu de morts: +${(level * 0.5).toFixed(1)}%`,
    'EGYPTIAN_IRRIGATION': `Production de toutes vos villes: +${level}% · marche des armées: +${+(level * 0.5).toFixed(1)}%`,
    'HUN_WAR_TENT': `Entretien: -${(level * 0.5).toFixed(1)}% · blessés +${(level * 0.5).toFixed(1)}%`,
    'SULTAN_DESERT_OUTPOST': `Entretien: -${(level * 0.5).toFixed(1)}% · transport: +${level}%`
  };
  return effects[key] || null;
}

function hideCityTooltip() {
  const tooltip = document.getElementById('city-tooltip');
  if (tooltip) tooltip.style.display = 'none';
  cityTip.slot = null;
}

