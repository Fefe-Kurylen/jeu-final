// ============================================================
// 05-panels.js — Panneaux : clic champs, construction, recrutement, barre de file
// Découpé depuis app.js (lignes 4649-6230) — portée globale partagée,
// l'ordre de chargement dans index.html doit être respecté.
// ============================================================
// ========== FIELDS CANVAS HANDLERS ==========
function onFieldsMouseMove(e) {
  if (!fieldsCanvas) return;

  const rect = fieldsCanvas.getBoundingClientRect();
  const mouseX = (e.clientX - rect.left) * (fieldsCanvas.width / rect.width);
  const mouseY = (e.clientY - rect.top) * (fieldsCanvas.height / rect.height);

  // Find hovered slot
  let foundSlot = null;
  for (const slot of citySlots) {
    const dx = mouseX - slot.x;
    const dy = mouseY - slot.y;
    const rx = slot.size * 0.6;
    const ry = slot.size * 0.35;
    const normalizedDist = (dx * dx) / (rx * rx) + (dy * dy) / (ry * ry);

    if (normalizedDist <= 1) {
      foundSlot = slot.slot;
      break;
    }
  }

  if (foundSlot !== cityHoveredSlot) {
    cityHoveredSlot = foundSlot;
    renderFieldsCanvas();

    fieldsCanvas.style.cursor = foundSlot !== null ? 'pointer' : 'default';

    if (foundSlot !== null) {
      showFieldsTooltip(e.clientX, e.clientY, foundSlot);
    } else {
      hideFieldsTooltip();
    }
  }
}

function onFieldsClick(e) {
  if (!currentCity) return; // Guard: city data not loaded yet
  if (cityHoveredSlot !== null) {
    if (cityHoveredSlot === -1) {
      // Click on village center -> switch to city tab
      showTab('city');
    } else {
      // Click on a field -> open field build panel
      openFieldBuildPanel(cityHoveredSlot);
    }
  }
}

function showFieldsTooltip(mouseX, mouseY, slotNum) {
  const tooltip = document.getElementById('fields-tooltip');
  if (!tooltip) return;

  const slot = citySlots.find(s => s.slot === slotNum);
  let html = '';

  if (slot?.isVillageCenter) {
    html = `
      <h4><span class="tt-icon">🏰</span> Centre du Village</h4>
      <p class="tt-hint">Cliquez pour voir les bâtiments</p>
    `;
  } else if (slot?.isField) {
    const fieldIcons = { FARM: '🌾', LUMBER: '🪵', QUARRY: '🪨', IRON_MINE: '⛏️' };
    const fieldNames = { FARM: 'Champ de blé', LUMBER: 'Scierie', QUARRY: 'Carrière de pierre', IRON_MINE: 'Mine de fer' };
    const building = getFieldBuildingAtSlot(slot.slot, slot.fieldType);
    const level = building?.level || 0;
    const production = getProductionAtLevel(slot.fieldType, level);
    const fMainHall = currentCity?.buildings?.find(b => b.key === 'MAIN_HALL');
    const fMainHallLevel = fMainHall?.level || 1;
    const fieldDef = buildingsData?.find(b => b.key === slot.fieldType);
    const fieldMax = fieldDef?.maxLevel || 20;
    const fEffectiveMax = Math.min(fieldMax, fMainHallLevel);

    html = `
      <h4><span class="tt-icon">${fieldIcons[slot.fieldType] || '🏭'}</span> ${fieldNames[slot.fieldType] || 'Ressource'}</h4>
      <p class="tt-level">Niveau ${level}/${fEffectiveMax}</p>
      ${level > 0 ? `<p class="tt-production">+${formatNum(production)} par heure</p>` : ''}
      <p class="tt-hint">${level === 0 ? 'Cliquez pour construire' : level >= fEffectiveMax ? (level >= fieldMax ? 'Niveau maximum atteint' : `Limité par Bât. principal (Niv.${fMainHallLevel})`) : 'Cliquez pour améliorer'}</p>
    `;
  }

  tooltip.innerHTML = html;
  tooltip.style.display = 'block';

  // Position tooltip
  const canvasRect = fieldsCanvas.parentElement.getBoundingClientRect();
  let left = mouseX - canvasRect.left + 10;
  let top = mouseY - canvasRect.top + 20;

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function hideFieldsTooltip() {
  const tooltip = document.getElementById('fields-tooltip');
  if (tooltip) tooltip.style.display = 'none';
}

// ========== BUILD PANEL ==========
let selectedBuildSlot = null;

function openBuildPanel(slotNum) {
  selectedBuildSlot = slotNum;
  const panel = document.getElementById('build-panel');
  const content = document.getElementById('build-panel-content');
  const title = document.getElementById('build-panel-title');
  
  const slot = citySlots.find(s => s.slot === slotNum);
  const building = getBuildingAtSlot(slotNum);
  
  // Create overlay with animation
  let overlay = document.querySelector('.build-panel-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'build-panel-overlay';
    overlay.onclick = closeBuildPanel;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'block';
  overlay.classList.add('fade-in');
  
  if (building || slot?.fixed) {
    // ===== EXISTING BUILDING - TABBED INTERFACE (Travian Style) =====
    const key = building?.key || slot?.fixedKey;
    const level = building?.level || 1;
    const def = buildingsData.find(b => b.key === key);
    const maxLevel = def?.maxLevel || 20;
    // Other buildings cannot exceed MAIN_HALL level
    const mainHall = currentCity?.buildings?.find(b => b.key === 'MAIN_HALL');
    const mainHallLevel = mainHall?.level || 1;
    const effectiveMax = key === 'MAIN_HALL' ? maxLevel : Math.min(maxLevel, mainHallLevel);
    const canUpgrade = level < effectiveMax;
    const nextLevel = level + 1;

    // ===== MILITARY BUILDINGS - RECRUITMENT PANEL =====
    const isMilitaryBuilding = ['BARRACKS', 'STABLE', 'WORKSHOP'].includes(key);

    if (isMilitaryBuilding) {
      openRecruitmentPanel(key, level, slotNum);
      return;
    }

    // ===== HERO HOME - HERO MANAGEMENT PANEL =====
    if (key === 'HERO_HOME' || key === 'HERO_MANSION') {
      openHeroManagementPanel(level, slotNum);
      return;
    }

    // Calculate costs for next level - must match backend formula
    const costMultiplier = Math.pow(1.28, level);
    const nextCost = {
      wood: Math.floor((def?.costL1?.wood || 50) * costMultiplier),
      stone: Math.floor((def?.costL1?.stone || 50) * costMultiplier),
      iron: Math.floor((def?.costL1?.iron || 50) * costMultiplier),
      food: Math.floor((def?.costL1?.food || 30) * costMultiplier)
    };

    // Time formula must match backend
    const baseDuration = def?.timeL1Sec || 60;
    const buildTime = Math.floor(baseDuration * Math.pow(1.2, level));
    const timeStr = formatDuration(buildTime);

    const bonus = getBuildingBonus(key, level);
    const nextBonus = getBuildingBonus(key, nextLevel);

    const hasResources = currentCity &&
      currentCity.wood >= nextCost.wood &&
      currentCity.stone >= nextCost.stone &&
      currentCity.iron >= nextCost.iron &&
      currentCity.food >= nextCost.food;

    // Determine special tabs based on building type
    const specialTabs = getBuildingSpecialTabs(key, level, slotNum);

    title.innerHTML = `
      <div class="building-title-header">
        <span class="building-detail-icon">${BUILDING_ICONS[key] || '🏠'}</span>
        <span>${getBuildingName(key)}</span>
        <span class="building-level-badge">Niv. ${level}/${maxLevel}</span>
      </div>
    `;

    content.innerHTML = `
      <div class="building-tabbed-card">
        <!-- Tabs Navigation -->
        <div class="building-tabs">
          <button class="building-tab active" onclick="switchBuildingTab('upgrade', this)">⬆️ Améliorer</button>
          <button class="building-tab" onclick="switchBuildingTab('info', this)">📖 Information</button>
          ${specialTabs.map(t => `<button class="building-tab" onclick="switchBuildingTab('${t.id}', this)">${t.icon} ${t.name}</button>`).join('')}
        </div>

        <!-- Tab Content: Upgrade -->
        <div class="building-tab-content" id="tab-upgrade">
          ${canUpgrade ? `
            <div class="upgrade-preview">
              <div class="upgrade-comparison">
                <div class="level-current">
                  <span class="level-num">${level}</span>
                  <span class="level-label">Actuel</span>
                  <p class="bonus-text">${bonus}</p>
                </div>
                <div class="level-arrow">→</div>
                <div class="level-next">
                  <span class="level-num">${nextLevel}</span>
                  <span class="level-label">Suivant</span>
                  <p class="bonus-text">${nextBonus}</p>
                </div>
              </div>
            </div>
            <div class="upgrade-costs">
              <h4>Coût d'amélioration</h4>
              <div class="cost-grid">
                <div class="cost-item ${currentCity?.wood >= nextCost.wood ? 'available' : 'missing'}">
                  <span class="cost-icon">🪵</span>
                  <span class="cost-value">${formatNum(nextCost.wood)}</span>
                  <div class="cost-bar"><div class="cost-bar-fill" style="width:${Math.min(100, (currentCity?.wood / nextCost.wood) * 100)}%"></div></div>
                </div>
                <div class="cost-item ${currentCity?.stone >= nextCost.stone ? 'available' : 'missing'}">
                  <span class="cost-icon">🪨</span>
                  <span class="cost-value">${formatNum(nextCost.stone)}</span>
                  <div class="cost-bar"><div class="cost-bar-fill" style="width:${Math.min(100, (currentCity?.stone / nextCost.stone) * 100)}%"></div></div>
                </div>
                <div class="cost-item ${currentCity?.iron >= nextCost.iron ? 'available' : 'missing'}">
                  <span class="cost-icon">⛏️</span>
                  <span class="cost-value">${formatNum(nextCost.iron)}</span>
                  <div class="cost-bar"><div class="cost-bar-fill" style="width:${Math.min(100, (currentCity?.iron / nextCost.iron) * 100)}%"></div></div>
                </div>
                <div class="cost-item ${currentCity?.food >= nextCost.food ? 'available' : 'missing'}">
                  <span class="cost-icon">🌾</span>
                  <span class="cost-value">${formatNum(nextCost.food)}</span>
                  <div class="cost-bar"><div class="cost-bar-fill" style="width:${Math.min(100, (currentCity?.food / nextCost.food) * 100)}%"></div></div>
                </div>
              </div>
            </div>
            <div class="upgrade-action">
              <div class="build-time"><span class="time-icon">⏱️</span> ${timeStr}</div>
              <button class="upgrade-btn ${hasResources && !isBuildQueueFull() ? '' : 'disabled'}" onclick="upgradeBuilding('${key}', ${slotNum})" ${hasResources && !isBuildQueueFull() ? '' : 'disabled'}>
                ${isBuildQueueFull() ? '⏳ File de construction pleine' : hasResources ? '🔨 Ameliorer' : '❌ Ressources insuffisantes'}
              </button>
            </div>
          ` : `
            <div class="max-level-notice">
              <span class="max-icon">${level >= maxLevel ? '🏆' : '🔒'}</span>
              <p>${level >= maxLevel ? 'Niveau maximum atteint !' : `Limité par le Bâtiment principal (Niv.${mainHallLevel})`}</p>
              ${level < maxLevel ? `<p class="bonus-hint">Améliorez le Bâtiment principal pour débloquer les niveaux suivants</p>` : ''}
              <p class="bonus-max">${bonus}</p>
            </div>
          `}
        </div>

        <!-- Tab Content: Information -->
        <div class="building-tab-content" id="tab-info" style="display:none">
          <div class="info-section">
            <h4>📜 Description</h4>
            <p class="info-description">${getBuildingDescription(key)}</p>
          </div>
          <div class="info-section">
            <h4>📊 Bonus actuel (Niveau ${level})</h4>
            <div class="info-bonus">${bonus}</div>
          </div>
          ${building?.prodPerHour ? `
            <div class="info-section">
              <h4>📈 Production</h4>
              <p class="info-production">+${formatNum(building.prodPerHour)} par heure</p>
            </div>
          ` : ''}
          ${def?.prereq && def.prereq.length > 0 ? `
            <div class="info-section">
              <h4>📋 Prérequis</h4>
              <div class="prereq-list">
                ${def.prereq.map(p => {
                  const prereqBuilding = currentCity?.buildings?.find(b => b.key === p.key);
                  const met = prereqBuilding && prereqBuilding.level >= p.level;
                  return `<div class="prereq-item ${met ? 'met' : 'unmet'}">
                    <span>${BUILDING_ICONS[p.key] || '🏠'}</span>
                    <span>${getBuildingName(p.key)} Niv.${p.level}</span>
                    <span class="prereq-status">${met ? '✓' : '✗'}</span>
                  </div>`;
                }).join('')}
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Special Tabs Content -->
        ${specialTabs.map(t => `
          <div class="building-tab-content" id="tab-${t.id}" style="display:none">
            ${t.content}
          </div>
        `).join('')}
      </div>
    `;
  } else if (slot?.isField) {
    // ===== RESOURCE FIELD - DETAILED CARD =====
    const fieldKey = slot.fieldType;
    const def = buildingsData.find(b => b.key === fieldKey);
    const resourceType = fieldKey === 'FARM' ? 'nourriture' : fieldKey === 'LUMBER' ? 'bois' : fieldKey === 'QUARRY' ? 'pierre' : 'fer';
    const resourceIcon = fieldKey === 'FARM' ? '🌾' : fieldKey === 'LUMBER' ? '🪵' : fieldKey === 'QUARRY' ? '🪨' : '⛏️';
    
    title.innerHTML = `<span class="building-detail-icon">${BUILDING_ICONS[fieldKey] || '🌾'}</span> ${getBuildingName(fieldKey)}`;
    
    content.innerHTML = `
      <div class="building-detail-card field-card">
        <div class="field-header">
          <div class="field-icon-large">${BUILDING_ICONS[fieldKey]}</div>
          <div class="field-info">
            <h3>${getBuildingName(fieldKey)}</h3>
            <p class="field-type">Champ de ${resourceType}</p>
          </div>
        </div>
        
        <div class="field-production-preview">
          <span class="prod-icon">${resourceIcon}</span>
          <span class="prod-text">Production: <strong>+${def?.effects?.[fieldKey.toLowerCase() + 'ProdL1'] || 20}/h</strong> au niveau 1</span>
        </div>
        
        <div class="cost-grid compact">
          <div class="cost-item">
            <span class="cost-icon">🪵</span>
            <span class="cost-value">${formatNum(def?.costL1?.wood || 50)}</span>
          </div>
          <div class="cost-item">
            <span class="cost-icon">🪨</span>
            <span class="cost-value">${formatNum(def?.costL1?.stone || 50)}</span>
          </div>
          <div class="cost-item">
            <span class="cost-icon">⛏️</span>
            <span class="cost-value">${formatNum(def?.costL1?.iron || 50)}</span>
          </div>
          <div class="cost-item">
            <span class="cost-icon">🌾</span>
            <span class="cost-value">${formatNum(def?.costL1?.food || 0)}</span>
          </div>
        </div>
        
        <button class="build-field-btn ${isBuildQueueFull() ? 'disabled' : ''}" onclick="buildAtSlot('${fieldKey}', ${slotNum})" ${isBuildQueueFull() ? 'disabled' : ''}>
          ${isBuildQueueFull() ? '⏳ File de construction pleine' : `🏗️ Construire ${getBuildingName(fieldKey)}`}
        </button>
      </div>
    `;
  } else {
    // ===== EMPTY SLOT - BUILDING LIST (Travian Style) =====
    title.textContent = '🏗️ Construire un bâtiment';

    const availableBuildings = buildingsData.filter(b => {
      if (['FARM', 'LUMBER', 'QUARRY', 'IRON_MINE', 'MAIN_HALL'].includes(b.key)) return false;
      // Filter faction buildings: only show those matching player faction
      if (b.category === 'FACTION' && b.faction && player?.faction && b.faction !== player.faction) return false;
      return true;
    });

    // Group by category
    const categories = {
      'BASE': { name: 'Infrastructure', icon: '🏛️', buildings: [] },
      'INTERMEDIATE': { name: 'Militaire', icon: '⚔️', buildings: [] },
      'ADVANCED': { name: 'Avancé', icon: '🏰', buildings: [] },
      'FACTION': { name: 'Bâtiment de faction', icon: '🏟️', buildings: [] }
    };

    availableBuildings.forEach(b => {
      const cat = b.category || 'INTERMEDIATE';
      if (categories[cat]) categories[cat].buildings.push(b);
    });

    content.innerHTML = `
      <div class="building-categories travian-style">
        ${Object.entries(categories).map(([key, cat]) => cat.buildings.length > 0 ? `
          <div class="building-category">
            <h4 class="category-title">${cat.icon} ${cat.name}</h4>
            <div class="buildings-list">
              ${cat.buildings.map(b => {
                // Check prerequisites
                const prereqStatus = checkBuildingPrerequisites(b);
                const hasPrereqs = prereqStatus.met;
                const hasResources = currentCity &&
                  currentCity.wood >= (b.costL1?.wood || 0) &&
                  currentCity.stone >= (b.costL1?.stone || 0) &&
                  currentCity.iron >= (b.costL1?.iron || 0) &&
                  currentCity.food >= (b.costL1?.food || 0);
                const canBuild = hasPrereqs && hasResources;
                const alreadyBuilt = currentCity?.buildings?.some(existing => existing.key === b.key);
                const isUnique = b.maxPerCity === 1 || !b.maxPerCity;
                const blocked = alreadyBuilt && isUnique;

                return `
                  <div class="build-option-card ${!hasPrereqs ? 'locked' : ''} ${!hasResources ? 'insufficient' : ''} ${blocked ? 'already-built' : ''}"
                       onclick="${canBuild && !blocked ? `buildAtSlot('${b.key}', ${slotNum})` : ''}"
                       ${!canBuild || blocked ? 'style="cursor: not-allowed"' : ''}>
                    <div class="build-option-icon-large">${BUILDING_ICONS[b.key] || '🏠'}</div>
                    <div class="build-option-details">
                      <h5>${b.name}</h5>
                      ${blocked ? `
                        <p class="build-option-status already">✓ Déjà construit</p>
                      ` : !hasPrereqs ? `
                        <p class="build-option-prereq">⚠️ ${prereqStatus.missing}</p>
                      ` : `
                        <p class="build-option-desc">${getBuildingDescription(b.key)}</p>
                      `}
                      <div class="build-option-costs ${!hasPrereqs ? 'dimmed' : ''}">
                        <span class="${currentCity?.wood >= (b.costL1?.wood || 0) ? '' : 'missing'}">🪵${formatNum(b.costL1?.wood || 0)}</span>
                        <span class="${currentCity?.stone >= (b.costL1?.stone || 0) ? '' : 'missing'}">🪨${formatNum(b.costL1?.stone || 0)}</span>
                        <span class="${currentCity?.iron >= (b.costL1?.iron || 0) ? '' : 'missing'}">⛏️${formatNum(b.costL1?.iron || 0)}</span>
                        <span class="${currentCity?.food >= (b.costL1?.food || 0) ? '' : 'missing'}">🌾${formatNum(b.costL1?.food || 0)}</span>
                      </div>
                      <div class="build-option-time">⏱️ ${formatDuration(b.timeL1Sec || 60)}</div>
                    </div>
                    <div class="build-option-action">
                      ${blocked ? `<span class="built-badge">✓</span>` :
                        canBuild ? `<button class="mini-build-btn">🔨</button>` :
                        `<button class="mini-build-btn disabled">🔒</button>`}
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        ` : '').join('')}
      </div>
    `;
  }
  
  panel.style.display = 'flex';
  panel.classList.add('slide-in');
}

// Helper: Format duration in seconds to readable string
function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  return `${days}j ${hours % 24}h`;
}

// Helper: Get building bonus text
function getBuildingBonus(key, level) {
  const bonuses = {
    MAIN_HALL: `Réduction temps construction: -${(level * 2.5).toFixed(1)}%`,
    BARRACKS: `Réduction temps entraînement: -${(level * 0.5).toFixed(1)}%`,
    STABLE: `Réduction temps entraînement cavalerie: -${(level * 0.5).toFixed(1)}%`,
    WORKSHOP: `Réduction temps entraînement siège: -${(level * 4).toFixed(1)}%`,
    ACADEMY: `Réduction temps recherche: -${level}%`,
    FORGE: `Bonus défense globale: +${(level * 0.5).toFixed(1)}%`,
    MARKET: `Réduction taxe marché: -${level}%, Capacité transport: +${level * 5}%`,
    WAREHOUSE: `Stockage ressources: ${formatNum(1200 + level * 8000)}`,
    SILO: `Stockage nourriture: ${formatNum(1200 + level * 8000)}`,
    FARM: `Production nourriture: +${formatNum(getProductionAtLevel('FARM', level))}/h`,
    LUMBER: `Production bois: +${formatNum(getProductionAtLevel('LUMBER', level))}/h`,
    QUARRY: `Production pierre: +${formatNum(getProductionAtLevel('QUARRY', level))}/h`,
    IRON_MINE: `Production fer: +${formatNum(getProductionAtLevel('IRON_MINE', level))}/h`,
    WALL: `Bonus défense: +${level}%, Régénération mur: +${level}%`,
    MOAT: `Bonus ATK/DEF défenseur: +${(level * 0.5).toFixed(1)}%`,
    HEALING_TENT: `Capacité de soins: ${level * 3} blessés`,
    RALLY_POINT: `Armées max: ${Math.min(1 + Math.floor(level / 5), 3)}`,
    HIDEOUT: `Ressources cachées: ${level}%`
  };
  return bonuses[key] || 'Aucun bonus spécial';
}

// Helper: Switch building panel tabs
function switchBuildingTab(tabId, btn) {
  // Hide all tab contents
  document.querySelectorAll('.building-tab-content').forEach(c => c.style.display = 'none');
  // Remove active from all tabs
  document.querySelectorAll('.building-tab').forEach(t => t.classList.remove('active'));
  // Show selected tab and mark button active
  const tabEl = document.getElementById(`tab-${tabId}`);
  if (tabEl) tabEl.style.display = 'block';
  if (btn) btn.classList.add('active');
}

// Helper: Get special tabs for specific building types
function getBuildingSpecialTabs(buildingKey, level, slotNum) {
  const tabs = [];

  switch (buildingKey) {
    case 'MARKET':
      tabs.push({
        id: 'trade',
        icon: '📦',
        name: 'Commerce',
        content: `
          <div class="special-tab-content">
            <h4>🏪 Place du marché</h4>
            <p>Capacité de transport: <strong>${100 + level * 50}</strong> unités</p>
            <p>Marchands disponibles: <strong>${Math.floor(level / 5) + 1}</strong></p>
            <button class="btn-primary" onclick="showTab('market'); closeBuildPanel();">Accéder au marché</button>
          </div>
        `
      });
      break;

    case 'ACADEMY':
      tabs.push({
        id: 'research',
        icon: '🔬',
        name: 'Recherche',
        content: `
          <div class="special-tab-content">
            <h4>🎓 Académie</h4>
            <p>Bonus recherche: <strong>-${level}%</strong> temps</p>
            <p>Technologies disponibles selon le niveau de l'académie.</p>
            <button class="btn-secondary" onclick="showToast('Recherches bientôt disponibles', 'info')">Voir les recherches</button>
          </div>
        `
      });
      break;

    case 'EMBASSY':
      tabs.push({
        id: 'diplomacy',
        icon: '🤝',
        name: 'Diplomatie',
        content: `
          <div class="special-tab-content">
            <h4>🏛️ Ambassade</h4>
            <p>Permet de créer ou rejoindre une alliance.</p>
            ${level >= 3 ? `<p>Niveau ${level}: Peut accueillir jusqu'à <strong>${level * 3}</strong> membres.</p>` : ''}
            <button class="btn-primary" onclick="showTab('alliance'); closeBuildPanel();">Accéder à l'alliance</button>
          </div>
        `
      });
      break;

    case 'RALLY_POINT':
      tabs.push({
        id: 'armies',
        icon: '⚔️',
        name: 'Armées',
        content: `
          <div class="special-tab-content">
            <h4>🎯 Point de ralliement</h4>
            <p>Armées simultanées: <strong>${Math.min(1 + Math.floor(level / 5), 5)}</strong></p>
            <p>Gérez vos troupes et envoyez des missions depuis ici.</p>
            <button class="btn-primary" onclick="showTab('army'); closeBuildPanel();">Gérer les armées</button>
          </div>
        `
      });
      break;

    case 'HEALING_TENT':
      tabs.push({
        id: 'heal',
        icon: '💊',
        name: 'Soins',
        content: `
          <div class="special-tab-content">
            <h4>🏥 Tente de soins</h4>
            <p>Capacité: <strong>${level * 3}</strong> blessés</p>
            <p>Les troupes blessées peuvent être soignées ici après une bataille défensive.</p>
            <button class="btn-success" onclick="healWounded()">Soigner les blessés</button>
          </div>
        `
      });
      break;

    case 'WAREHOUSE':
    case 'GREAT_WAREHOUSE':
      tabs.push({
        id: 'storage',
        icon: '📦',
        name: 'Stockage',
        content: `
          <div class="special-tab-content">
            <h4>🏪 Capacité de stockage</h4>
            <div class="storage-bars">
              <div class="storage-row">
                <span>🪵 Bois:</span>
                <div class="storage-bar"><div style="width:${Math.min(100, (currentCity?.wood / (1200 + level * 8000)) * 100)}%"></div></div>
                <span>${formatNum(currentCity?.wood || 0)} / ${formatNum(1200 + level * 8000)}</span>
              </div>
              <div class="storage-row">
                <span>🪨 Pierre:</span>
                <div class="storage-bar"><div style="width:${Math.min(100, (currentCity?.stone / (1200 + level * 8000)) * 100)}%"></div></div>
                <span>${formatNum(currentCity?.stone || 0)} / ${formatNum(1200 + level * 8000)}</span>
              </div>
              <div class="storage-row">
                <span>⛏️ Fer:</span>
                <div class="storage-bar"><div style="width:${Math.min(100, (currentCity?.iron / (1200 + level * 8000)) * 100)}%"></div></div>
                <span>${formatNum(currentCity?.iron || 0)} / ${formatNum(1200 + level * 8000)}</span>
              </div>
            </div>
          </div>
        `
      });
      break;

    case 'SILO':
    case 'GREAT_SILO':
      tabs.push({
        id: 'food-storage',
        icon: '🌾',
        name: 'Stockage',
        content: `
          <div class="special-tab-content">
            <h4>🌾 Capacité de stockage nourriture</h4>
            <div class="storage-bars">
              <div class="storage-row">
                <span>🌾 Nourriture:</span>
                <div class="storage-bar food"><div style="width:${Math.min(100, (currentCity?.food / (1200 + level * 8000)) * 100)}%"></div></div>
                <span>${formatNum(currentCity?.food || 0)} / ${formatNum(1200 + level * 8000)}</span>
              </div>
            </div>
          </div>
        `
      });
      break;

    case 'WATCHTOWER':
      tabs.push({
        id: 'watch',
        icon: '👁️',
        name: 'Surveillance',
        content: `
          <div class="special-tab-content">
            <h4>🗼 Tour de guet</h4>
            <p>Portée de détection: <strong>${level * 2}</strong> cases</p>
            <p>Temps d'alerte: <strong>${Math.max(1, 10 - level)}</strong> minutes avant l'arrivée</p>
            <p class="info-note">Les attaques ennemies seront détectées à l'avance.</p>
          </div>
        `
      });
      break;
  }

  return tabs;
}

// Helper: Check building prerequisites
function checkBuildingPrerequisites(buildingDef) {
  if (!buildingDef.prereq || buildingDef.prereq.length === 0) {
    return { met: true, missing: '' };
  }

  const missingPrereqs = [];

  for (const prereq of buildingDef.prereq) {
    const existingBuilding = currentCity?.buildings?.find(b => b.key === prereq.key);
    const currentLevel = existingBuilding?.level || 0;

    if (currentLevel < prereq.level) {
      const prereqDef = buildingsData?.find(b => b.key === prereq.key);
      const prereqName = prereqDef?.name || prereq.key;
      missingPrereqs.push(`${prereqName} niv.${prereq.level}`);
    }
  }

  if (missingPrereqs.length > 0) {
    return { met: false, missing: `Requis: ${missingPrereqs.join(', ')}` };
  }

  return { met: true, missing: '' };
}

function closeBuildPanel() {
  const panel = document.getElementById('build-panel');
  if (panel) panel.style.display = 'none';
  const overlay = document.querySelector('.build-panel-overlay');
  if (overlay) overlay.style.display = 'none';
  selectedBuildSlot = null;
}

function openFieldBuildPanel(slotNum) {
  const slot = citySlots.find(s => s.slot === slotNum);
  if (!slot || !slot.isField) return;
  
  selectedBuildSlot = slotNum;
  const panel = document.getElementById('build-panel');
  const content = document.getElementById('build-panel-content');
  const title = document.getElementById('build-panel-title');
  
  const fieldType = slot.fieldType;
  const building = getFieldBuildingAtSlot(slotNum, fieldType);
  const level = building?.level || 0;
  const def = buildingsData.find(b => b.key === fieldType);
  
  const fieldNames = { 
    FARM: 'Ferme', 
    LUMBER: 'Bûcheron', 
    QUARRY: 'Carrière de pierre', 
    IRON_MINE: 'Mine de fer' 
  };
  
  const fieldIcons = {
    FARM: '🌾',
    LUMBER: '🌲',
    QUARRY: '⛰️',
    IRON_MINE: '⛏️'
  };
  
  // Create overlay
  let overlay = document.querySelector('.build-panel-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'build-panel-overlay';
    overlay.onclick = closeBuildPanel;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'block';
  
  if (level > 0) {
    // Existing field - show upgrade
    const maxLevel = def?.maxLevel || 20;
    const canUpgrade = level < maxLevel;
    
    title.textContent = 'Améliorer';
    content.innerHTML = `
      <div class="current-building">
        <div class="current-building-icon">${fieldIcons[fieldType]}</div>
        <h4>${fieldNames[fieldType]}</h4>
        <span class="level-badge">Niveau ${level}</span>
        <p style="margin-top:10px;font-size:12px;color:#666">
          Production: +${getProductionAtLevel(fieldType, level)}/h
        </p>
      </div>
      ${canUpgrade ? `
        <div class="upgrade-info">
          <h5>Améliorer au niveau ${level + 1}</h5>
          <p style="font-size:12px;color:#666;margin-bottom:10px">
            Production: +${getProductionAtLevel(fieldType, level + 1)}/h (+${getProductionAtLevel(fieldType, level + 1) - getProductionAtLevel(fieldType, level)}/h)
          </p>
          <div class="upgrade-cost">
            <span>🪵 ${formatNum((def?.costL1?.wood || 50) * (level + 1))}</span>
            <span>🪨 ${formatNum((def?.costL1?.stone || 50) * (level + 1))}</span>
            <span>⛏️ ${formatNum((def?.costL1?.iron || 50) * (level + 1))}</span>
          </div>
          <button class="build-option-btn" onclick="buildField('${fieldType}', ${slotNum + 100})">
            Améliorer
          </button>
        </div>
      ` : `<p style="text-align:center;color:#666;">Niveau maximum atteint</p>`}
    `;
  } else {
    // Empty field - show build option
    title.textContent = 'Construire';
    content.innerHTML = `
      <div class="build-option" onclick="buildField('${fieldType}', ${slotNum + 100})">
        <div class="build-option-icon">${fieldIcons[fieldType]}</div>
        <div class="build-option-info">
          <h4>${fieldNames[fieldType]}</h4>
          <p>Production de ${fieldType === 'FARM' ? 'nourriture' : fieldType === 'LUMBER' ? 'bois' : fieldType === 'QUARRY' ? 'pierre' : 'fer'}</p>
          <p style="font-size:11px;color:#888">+${getProductionAtLevel(fieldType, 1)}/h au niveau 1</p>
          <div class="build-option-cost">
            <span>🪵 ${def?.costL1?.wood || 50}</span>
            <span>🪨 ${def?.costL1?.stone || 50}</span>
            <span>⛏️ ${def?.costL1?.iron || 50}</span>
          </div>
        </div>
        <button class="build-option-btn">Construire</button>
      </div>
    `;
  }
  
  panel.style.display = 'flex';
}

// ========== RECRUITMENT PANEL (via Military Buildings) ==========
function openRecruitmentPanel(buildingKey, buildingLevel, slotNum) {
  const panel = document.getElementById('build-panel');
  const content = document.getElementById('build-panel-content');
  const title = document.getElementById('build-panel-title');

  // Create overlay
  let overlay = document.querySelector('.build-panel-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'build-panel-overlay';
    overlay.onclick = closeBuildPanel;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'block';
  overlay.classList.add('fade-in');

  // Building configurations
  const buildingNames = { BARRACKS: 'Caserne', STABLE: 'Écurie', WORKSHOP: 'Atelier' };
  const buildingIcons = { BARRACKS: '⚔️', STABLE: '🐎', WORKSHOP: '⚙️' };
  const allowedClasses = {
    BARRACKS: ['INFANTRY', 'ARCHER'],
    STABLE: ['CAVALRY'],
    WORKSHOP: ['SIEGE']
  };

  const classes = allowedClasses[buildingKey] || [];

  // Filter units by tier based on building level
  const availableUnits = unitsData.filter(u => {
    if (u.faction !== player?.faction) return false;
    if (!classes.includes(u.class)) return false;
    if (u.tier === 'intermediate' && buildingLevel < 9) return false;
    if (u.tier === 'elite' && buildingLevel < 15) return false;
    return true;
  });

  // Group units by class for BARRACKS (separate Infantry and Archers)
  const unitsByClass = {};
  availableUnits.forEach(u => {
    if (!unitsByClass[u.class]) unitsByClass[u.class] = [];
    unitsByClass[u.class].push(u);
  });

  // Check current recruitment queue
  const currentQueue = currentCity?.recruitQueue?.filter(q => q.buildingKey === buildingKey) || [];
  const isRecruiting = currentQueue.some(q => q.status === 'RUNNING');

  title.innerHTML = `<span class="building-detail-icon">${buildingIcons[buildingKey]}</span> ${buildingNames[buildingKey]} (Niv.${buildingLevel})`;

  // Helper function to render a unit card
  const renderUnitCard = (u, isRecruiting, buildingKey) => {
    const tierColor = TIER_COLORS[u.tier] || '#aaa';
    // Use per-unit GDD costs from units data (class-specific + tier multiplier)
    const unitCost = u.recruitCost || { wood: 50, stone: 30, iron: 60, food: 30 };
    const canAfford = currentCity &&
      currentCity.wood >= unitCost.wood &&
      currentCity.stone >= unitCost.stone &&
      currentCity.iron >= unitCost.iron &&
      currentCity.food >= unitCost.food;

    return `
      <div class="unit-recruit-card ${isRecruiting ? 'disabled' : ''}">
        <div class="unit-recruit-header" style="border-color: ${tierColor}">
          <span class="unit-icon clickable" onclick="event.stopPropagation(); showUnitStatsPopup('${u.key}')" title="Voir les stats détaillées">${UNIT_ICONS[u.class] || '⚔️'}</span>
          <span class="tier-badge" style="background: ${tierColor}">${u.tier.charAt(0).toUpperCase()}</span>
        </div>
        <div class="unit-recruit-body" onclick="${!isRecruiting ? `openUnitRecruitModal('${u.key}', '${buildingKey}')` : ''}">
          <h5>${u.name}</h5>
          <div class="unit-mini-stats">
            <span>⚔️${u.stats?.attack}</span>
            <span>🛡️${u.stats?.defense}</span>
            <span>🏃${u.stats?.speed}</span>
          </div>
          <div class="unit-mini-cost ${canAfford ? '' : 'insufficient'}">
            <span>🪵${unitCost.wood}</span>
            <span>⛏️${unitCost.iron}</span>
          </div>
        </div>
        ${isRecruiting ? '<div class="unit-blocked">⏳ En cours...</div>' : ''}
      </div>
    `;
  };

  // Helper function to render a class section
  const renderClassSection = (className, classLabel, classIcon, units) => {
    if (!units || units.length === 0) return '';
    return `
      <div class="unit-class-section">
        <div class="class-section-header">
          <span class="class-icon">${classIcon}</span>
          <span class="class-label">${classLabel}</span>
          <span class="class-count">(${units.length})</span>
        </div>
        <div class="units-recruit-grid">
          ${units.map(u => renderUnitCard(u, isRecruiting, buildingKey)).join('')}
        </div>
      </div>
    `;
  };

  // Build sections based on building type
  let unitsHtml = '';
  if (buildingKey === 'BARRACKS') {
    // Separate Infantry and Archers
    unitsHtml += renderClassSection('INFANTRY', 'Infanterie', '⚔️', unitsByClass['INFANTRY']);
    unitsHtml += renderClassSection('ARCHER', 'Archers', '🏹', unitsByClass['ARCHER']);
  } else if (buildingKey === 'STABLE') {
    unitsHtml += renderClassSection('CAVALRY', 'Cavalerie', '🐎', unitsByClass['CAVALRY']);
  } else if (buildingKey === 'WORKSHOP') {
    unitsHtml += renderClassSection('SIEGE', 'Machines de siège', '⚙️', unitsByClass['SIEGE']);
  }

  content.innerHTML = `
    <div class="recruitment-panel">
      <!-- Building info header -->
      <div class="recruit-building-header">
        <div class="building-icon-large">${buildingIcons[buildingKey]}</div>
        <div class="building-info">
          <h3>${buildingNames[buildingKey]}</h3>
          <p class="building-level">Niveau ${buildingLevel}</p>
          <p class="tier-info">
            ${buildingLevel < 9 ? '🔹 Unités de base (Niv.1-8)' :
              buildingLevel < 15 ? '🔹 Base + Intermédiaires (Niv.9-14)' :
              '🔹 Toutes les unités (Niv.15+)'}
          </p>
        </div>
        <button class="upgrade-building-btn" onclick="closeBuildPanel(); openBuildPanelUpgrade('${buildingKey}', ${slotNum})">
          ⬆️ Améliorer
        </button>
      </div>

      <!-- Current recruitment queue -->
      ${currentQueue.length > 0 ? `
        <div class="current-recruitment">
          <h4>🔄 En cours de recrutement</h4>
          <div class="recruit-queue-items">
            ${currentQueue.map(q => `
              <div class="recruit-queue-item ${q.status === 'RUNNING' ? 'running' : 'queued'}">
                <span class="queue-unit">${q.count}x ${getUnitName(q.unitKey)}</span>
                <span class="queue-time">${q.status === 'RUNNING' ? formatTime(q.endsAt) : 'En attente'}</span>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}

      <!-- Available units by class -->
      <div class="available-units">
        <h4>🎖️ Recruter des unités</h4>
        <p class="recruit-hint">💡 Cliquez sur l'icône d'une unité pour voir ses statistiques détaillées</p>
        ${unitsHtml || `
          <div class="no-units-available">
            <p>Aucune unité disponible</p>
            <p class="hint">Améliorez le bâtiment pour débloquer plus d'unités</p>
          </div>
        `}
      </div>

      ${isRecruiting ? `
        <div class="recruitment-warning">
          <span>⚠️</span>
          <span>Un recrutement est déjà en cours. Attendez qu'il se termine.</span>
        </div>
      ` : ''}
    </div>
  `;

  panel.style.display = 'flex';
}

// Open unit recruit modal (from recruitment panel)
function openUnitRecruitModal(unitKey, buildingKey) {
  const unit = unitsData.find(u => u.key === unitKey);
  if (!unit) return;
  
  closeBuildPanel();
  
  const modal = document.getElementById('modal');
  const tierColor = TIER_COLORS[unit.tier] || '#aaa';
  
  // Use per-unit GDD costs from units data (class-specific + tier multiplier)
  const unitCost = unit.recruitCost || { wood: 50, stone: 30, iron: 60, food: 30 };

  // Training time from GDD data
  const baseTime = unit.recruitTimeSec || 360;

  // Upkeep (GDD economy_config.json values)
  const foodUpkeep = unit.tier === 'base' ? 5 : unit.tier === 'intermediate' ? 10 : unit.tier === 'elite' ? 15 : 15;
  
  const wood = currentCity?.wood || 0;
  const stone = currentCity?.stone || 0;
  const iron = currentCity?.iron || 0;
  const food = currentCity?.food || 0;
  
  const getResourceClass = (needed, available) => needed <= available ? 'res-available' : 'res-missing';
  const canAffordOne = wood >= unitCost.wood && stone >= unitCost.stone && iron >= unitCost.iron && food >= unitCost.food;
  
  document.getElementById('modal-body').innerHTML = `
    <div class="unit-detail-modal">
      <div class="unit-detail-header" style="background: linear-gradient(135deg, ${tierColor}33 0%, transparent 100%); border-left: 4px solid ${tierColor}">
        <div class="unit-detail-icon">${UNIT_ICONS[unit.class] || '⚔️'}</div>
        <div class="unit-detail-title">
          <h2>${unit.name}</h2>
          <div class="unit-badges">
            <span class="tier-badge" style="background: ${tierColor}">${unit.tier.toUpperCase()}</span>
            <span class="class-badge">${unit.class}</span>
          </div>
        </div>
      </div>
      
      <div class="unit-stats-full">
        <h4>📊 Statistiques</h4>
        <div class="stats-grid">
          <div class="stat-item">
            <span class="stat-icon">⚔️</span>
            <span class="stat-label">Attaque</span>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width: ${Math.min(100, unit.stats?.attack || 0)}%; background: #e74c3c"></div>
            </div>
            <span class="stat-value">${unit.stats?.attack || 0}</span>
          </div>
          <div class="stat-item">
            <span class="stat-icon">🛡️</span>
            <span class="stat-label">Défense</span>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width: ${Math.min(100, unit.stats?.defense || 0)}%; background: #3498db"></div>
            </div>
            <span class="stat-value">${unit.stats?.defense || 0}</span>
          </div>
          <div class="stat-item">
            <span class="stat-icon">🏃</span>
            <span class="stat-label">Vitesse</span>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width: ${Math.min(100, unit.stats?.speed || 0)}%; background: #f39c12"></div>
            </div>
            <span class="stat-value">${unit.stats?.speed || 0}</span>
          </div>
        </div>
      </div>
      
      <div class="unit-costs">
        <h4>💰 Coût par unité</h4>
        <div class="cost-row">
          <span class="cost-item ${getResourceClass(unitCost.wood, wood)}">🪵 ${unitCost.wood}</span>
          <span class="cost-item ${getResourceClass(unitCost.stone, stone)}">🪨 ${unitCost.stone}</span>
          <span class="cost-item ${getResourceClass(unitCost.iron, iron)}">⛏️ ${unitCost.iron}</span>
          <span class="cost-item ${getResourceClass(unitCost.food, food)}">🌾 ${unitCost.food}</span>
        </div>
      </div>
      
      <div class="unit-info-row">
        <div class="info-box">
          <span class="info-icon">⏱️</span>
          <span class="info-label">Formation</span>
          <span class="info-value">${formatDuration(baseTime)}</span>
        </div>
        <div class="info-box upkeep">
          <span class="info-icon">🌾</span>
          <span class="info-label">Céréales/h</span>
          <span class="info-value">${foodUpkeep}</span>
        </div>
      </div>
      
      <div class="recruit-section">
        <h4>🎖️ Recruter</h4>
        <div class="recruit-row">
          <input type="number" id="recruit-count" value="10" min="1" max="1000" class="recruit-input"
                 data-wood="${unitCost.wood}" data-stone="${unitCost.stone}" 
                 data-iron="${unitCost.iron}" data-food="${unitCost.food}">
          <button id="recruit-btn" onclick="recruitFromBuilding('${unit.key}', '${buildingKey}')" 
                  class="recruit-action-btn ${canAffordOne ? '' : 'disabled'}">
            Recruter
          </button>
        </div>
        <div class="recruit-total" id="recruit-total"></div>
      </div>
    </div>
  `;
  
  // Update total cost dynamically
  const updateRecruitTotal = () => {
    const input = document.getElementById('recruit-count');
    const totalDiv = document.getElementById('recruit-total');
    const btn = document.getElementById('recruit-btn');
    if (!input || !totalDiv || !btn) return;
    
    const count = Math.max(1, parseInt(input.value) || 1);
    const totalWood = unitCost.wood * count;
    const totalStone = unitCost.stone * count;
    const totalIron = unitCost.iron * count;
    const totalFood = unitCost.food * count;
    
    const canAfford = wood >= totalWood && stone >= totalStone && iron >= totalIron && food >= totalFood;
    
    totalDiv.innerHTML = `
      <span class="cost-label">Coût total:</span>
      <span class="${totalWood <= wood ? 'res-available' : 'res-missing'}">🪵 ${formatNum(totalWood)}</span>
      <span class="${totalStone <= stone ? 'res-available' : 'res-missing'}">🪨 ${formatNum(totalStone)}</span>
      <span class="${totalIron <= iron ? 'res-available' : 'res-missing'}">⛏️ ${formatNum(totalIron)}</span>
      <span class="${totalFood <= food ? 'res-available' : 'res-missing'}">🌾 ${formatNum(totalFood)}</span>
    `;
    
    btn.classList.toggle('disabled', !canAfford);
  };
  
  setTimeout(() => {
    updateRecruitTotal();
    const input = document.getElementById('recruit-count');
    if (input) input.oninput = updateRecruitTotal;
  }, 50);
  
  modal.style.display = 'flex';
}

// Global action guard to prevent double-click on any resource-modifying action
let _actionInProgress = false;

// Recruit from building
async function recruitFromBuilding(unitKey, buildingKey) {
  if (_actionInProgress) return;
  _actionInProgress = true;
  const countInput = document.getElementById('recruit-count');
  const count = parseInt(countInput?.value) || 1;
  
  if (count < 1) {
    showToast('Nombre invalide', 'error');
    return;
  }
  
  try {
    const res = await fetch(`${API}/api/city/${currentCity.id}/recruit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ unitKey, count, buildingKey })
    });
    
    const data = await res.json();
    closeModal();
    
    if (res.ok) {
      showToast(`Recrutement de ${count}x ${getUnitName(unitKey)} lancé!`, 'success');
      await loadCities();
      renderCity();
    } else {
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur de connexion', 'error');
  } finally {
    _actionInProgress = false;
  }
}

// Open upgrade panel for military building
function openBuildPanelUpgrade(buildingKey, slotNum) {
  selectedBuildSlot = slotNum;
  const panel = document.getElementById('build-panel');
  const content = document.getElementById('build-panel-content');
  const title = document.getElementById('build-panel-title');
  
  const building = currentCity?.buildings?.find(b => b.key === buildingKey);
  const level = building?.level || 1;
  const def = buildingsData.find(b => b.key === buildingKey);
  const maxLevel = def?.maxLevel || 20;
  // Other buildings cannot exceed MAIN_HALL level
  const upMainHall = currentCity?.buildings?.find(b => b.key === 'MAIN_HALL');
  const upMainHallLevel = upMainHall?.level || 1;
  const upEffectiveMax = buildingKey === 'MAIN_HALL' ? maxLevel : Math.min(maxLevel, upMainHallLevel);
  const canUpgrade = level < upEffectiveMax;
  const nextLevel = level + 1;
  
  let overlay = document.querySelector('.build-panel-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'build-panel-overlay';
    overlay.onclick = closeBuildPanel;
    document.body.appendChild(overlay);
  }
  overlay.style.display = 'block';
  
  // Cost formula must match backend: Math.pow(1.5, targetLevel - 1) where targetLevel = level + 1
  const costMultiplier = Math.pow(1.28, level);
  const nextCost = {
    wood: Math.floor((def?.costL1?.wood || 50) * costMultiplier),
    stone: Math.floor((def?.costL1?.stone || 50) * costMultiplier),
    iron: Math.floor((def?.costL1?.iron || 50) * costMultiplier),
    food: Math.floor((def?.costL1?.food || 30) * costMultiplier)
  };

  // Time formula must match backend: Math.pow(1.8, targetLevel - 1)
  const baseDuration = def?.timeL1Sec || 60;
  const buildTime = Math.floor(baseDuration * Math.pow(1.2, level));
  
  const hasResources = currentCity && 
    currentCity.wood >= nextCost.wood &&
    currentCity.stone >= nextCost.stone &&
    currentCity.iron >= nextCost.iron &&
    currentCity.food >= nextCost.food;
  
  title.innerHTML = `${BUILDING_ICONS[buildingKey]} ${getBuildingName(buildingKey)} - Amélioration`;
  
  content.innerHTML = `
    <div class="building-detail-card">
      <div class="building-detail-header">
        <div class="building-level-display">
          <div class="level-circle">${level}</div>
          <span class="level-label">Niveau</span>
        </div>
        <div class="building-image-container">
          <div class="building-image">${BUILDING_ICONS[buildingKey]}</div>
        </div>
        <div class="building-max-level">
          <span class="max-label">Max</span>
          <div class="max-circle">${upEffectiveMax}</div>
        </div>
      </div>
      
      <div class="tier-unlock-info">
        <h4>🎖️ Unités débloquées</h4>
        <div class="tier-list">
          <div class="tier-item ${level >= 1 ? 'unlocked' : 'locked'}">
            <span>Niv. 1+</span> Base
          </div>
          <div class="tier-item ${level >= 9 ? 'unlocked' : 'locked'}">
            <span>Niv. 9+</span> Intermédiaire
          </div>
          <div class="tier-item ${level >= 15 ? 'unlocked' : 'locked'}">
            <span>Niv. 15+</span> Elite
          </div>
        </div>
      </div>
      
      ${canUpgrade ? `
        <div class="upgrade-section">
          <h4>⬆️ Améliorer au niveau ${nextLevel}</h4>
          <div class="cost-grid">
            <div class="cost-item ${currentCity?.wood >= nextCost.wood ? 'available' : 'missing'}">
              <span class="cost-icon">🪵</span>
              <span class="cost-value">${formatNum(nextCost.wood)}</span>
              <div class="cost-bar"><div class="cost-bar-fill" style="width: ${Math.min(100, (currentCity?.wood / nextCost.wood) * 100)}%"></div></div>
            </div>
            <div class="cost-item ${currentCity?.stone >= nextCost.stone ? 'available' : 'missing'}">
              <span class="cost-icon">🪨</span>
              <span class="cost-value">${formatNum(nextCost.stone)}</span>
              <div class="cost-bar"><div class="cost-bar-fill" style="width: ${Math.min(100, (currentCity?.stone / nextCost.stone) * 100)}%"></div></div>
            </div>
            <div class="cost-item ${currentCity?.iron >= nextCost.iron ? 'available' : 'missing'}">
              <span class="cost-icon">⛏️</span>
              <span class="cost-value">${formatNum(nextCost.iron)}</span>
              <div class="cost-bar"><div class="cost-bar-fill" style="width: ${Math.min(100, (currentCity?.iron / nextCost.iron) * 100)}%"></div></div>
            </div>
            <div class="cost-item ${currentCity?.food >= nextCost.food ? 'available' : 'missing'}">
              <span class="cost-icon">🌾</span>
              <span class="cost-value">${formatNum(nextCost.food)}</span>
              <div class="cost-bar"><div class="cost-bar-fill" style="width: ${Math.min(100, (currentCity?.food / nextCost.food) * 100)}%"></div></div>
            </div>
          </div>
          <div class="upgrade-footer">
            <div class="build-time">⏱️ ${formatDuration(buildTime)}</div>
            <button class="upgrade-btn ${hasResources && !isBuildQueueFull() ? '' : 'disabled'}"
                    onclick="upgradeBuilding('${buildingKey}', ${slotNum})"
                    ${hasResources && !isBuildQueueFull() ? '' : 'disabled'}>
              ${isBuildQueueFull() ? '⏳ File pleine' : hasResources ? '🔨 Ameliorer' : '❌ Ressources insuffisantes'}
            </button>
          </div>
        </div>
      ` : `
        <div class="max-level-notice">
          <span class="max-icon">${level >= maxLevel ? '🏆' : '🔒'}</span>
          <p>${level >= maxLevel ? 'Niveau maximum atteint!' : `Limité par le Bâtiment principal (Niv.${upMainHallLevel})`}</p>
          ${level < maxLevel ? `<p class="bonus-hint">Améliorez le Bâtiment principal pour débloquer les niveaux suivants</p>` : ''}
        </div>
      `}

      <button class="back-to-recruit-btn" onclick="closeBuildPanel(); openBuildPanel(${slotNum})">
        ← Retour au recrutement
      </button>
    </div>
  `;
  
  panel.style.display = 'flex';
}

// Get unit name helper
function getUnitName(unitKey) {
  const unit = unitsData.find(u => u.key === unitKey);
  return unit?.name || unitKey;
}

let _buildInProgress = false;

function isBuildQueueFull() {
  const queueSize = currentCity?.buildQueue?.length || 0;
  return queueSize >= 4;
}

async function buildField(buildingKey, slot) {
  if (_buildInProgress) return;
  if (isBuildQueueFull()) {
    showToast('File de construction pleine (4/4)', 'error');
    return;
  }
  _buildInProgress = true;
  try {
    const res = await fetch(`${API}/api/city/${currentCity.id}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ buildingKey, slot })
    });

    const data = await res.json();

    if (res.ok) {
      closeBuildPanel();
      showToast(`Construction de ${getBuildingName(buildingKey)} lancee!`, 'success');
      await loadCities();
      renderCity();
    } else {
      showToast(data.error || 'Erreur de construction', 'error');
    }
  } catch (e) {
    console.error('buildField error:', e);
    showToast('Erreur reseau', 'error');
  } finally {
    _buildInProgress = false;
  }
}

async function buildAtSlot(buildingKey, slot) {
  if (_buildInProgress) return;
  if (isBuildQueueFull()) {
    showToast('File de construction pleine (4/4)', 'error');
    return;
  }
  _buildInProgress = true;
  try {
    const res = await fetch(`${API}/api/city/${currentCity.id}/build`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ buildingKey, slot })
    });

    const data = await res.json();

    if (res.ok) {
      closeBuildPanel();
      showToast(`Construction de ${getBuildingName(buildingKey)} lancee!`, 'success');
      await loadCities();
      renderCity();
    } else {
      showToast(data.error || 'Erreur de construction', 'error');
    }
  } catch (e) {
    console.error('buildAtSlot error:', e);
    showToast('Erreur reseau', 'error');
  } finally {
    _buildInProgress = false;
  }
}

async function upgradeBuilding(buildingKey, slot) {
  await buildAtSlot(buildingKey, slot);
}

function getBuildingDescription(key) {
  // Chercher dans buildingsData d'abord (contient les descriptions des 39 bâtiments)
  const building = window.buildingsData?.find(b => b.key === key);
  if (building?.description) return building.description;

  const descriptions = {
    MAIN_HALL: 'Réduit le temps de construction',
    BARRACKS: 'Entraîne l\'infanterie et les archers',
    STABLE: 'Entraîne la cavalerie',
    WORKSHOP: 'Construit des machines de siège',
    ACADEMY: 'Recherche et formation',
    FORGE: 'Améliore l\'équipement',
    MARKET: 'Commerce et échanges',
    WAREHOUSE: 'Stocke les ressources',
    SILO: 'Stocke la nourriture',
    WALL: 'Défense de la ville',
    HEALING_TENT: 'Soigne les blessés',
    RALLY_POINT: 'Rassemblement des armées',
    HIDEOUT: 'Cache des ressources',
    MOAT: 'Douves défensives',
    FARM: 'Produit de la nourriture',
    LUMBER: 'Produit du bois',
    QUARRY: 'Produit de la pierre',
    IRON_MINE: 'Produit du fer',
    MILL: 'Augmente production céréales',
    BAKERY: 'Augmente production céréales',
    SAWMILL: 'Augmente production bois',
    STONEMASON: 'Augmente production pierre',
    FOUNDRY: 'Augmente production fer',
    GREAT_SILO: 'Stockage protégé nourriture',
    GREAT_WAREHOUSE: 'Stockage protégé ressources',
    GREAT_BARRACKS: 'Recrutement hors capitale',
    GREAT_STABLE: 'Cavalerie hors capitale',
    WATCHTOWER: 'Détection et espionnage',
    EMBASSY: 'Gestion des alliances',
    TREASURE_CHAMBER: 'Produit de l\'or',
    HERO_MANSION: 'Gestion du héros',
    RESIDENCE: 'Formation de colons',
    TRADE_OFFICE: 'Bonus commerce',
    ROMAN_THERMAE: 'Soins rapides (Rome)',
    GALLIC_BREWERY: 'Défense siège (Gaule)',
    GREEK_TEMPLE: 'Recherche bonus (Grèce)',
    EGYPTIAN_IRRIGATION: 'Production bonus (Égypte)',
    HUN_WAR_TENT: 'Entretien réduit (Huns)',
    SULTAN_DESERT_OUTPOST: 'Commerce bonus (Sultanat)',
    HERO_HOME: 'Gestion du héros'
  };
  return descriptions[key] || 'Bâtiment';
}

// (resize handler consolidated below in map section)

// Animation loop for construction (250ms = 4 FPS, sufficient for progress bars)
let constructionAnimInterval = null;
function startConstructionAnimation() {
  if (constructionAnimInterval) return;
  constructionAnimInterval = setInterval(() => {
    if (document.visibilityState !== 'visible') return;
    if (document.getElementById('tab-city')?.classList.contains('active') &&
        currentCity?.buildQueue?.some(q => q.status === 'RUNNING')) {
      renderCityCanvas();
    }
  }, 250);
}
startConstructionAnimation();

// ========== QUEUE STATUS BAR & DROPDOWNS ==========
function toggleQueueDropdown(type) {
  const dropdown = document.getElementById(`${type}-queue-dropdown`);
  const statusItem = document.getElementById(`${type}-status`);
  const otherType = type === 'build' ? 'recruit' : 'build';
  const otherDropdown = document.getElementById(`${otherType}-queue-dropdown`);
  const otherStatus = document.getElementById(`${otherType}-status`);

  // Close the other dropdown
  if (otherDropdown) otherDropdown.classList.remove('open');
  if (otherStatus) otherStatus.classList.remove('open');

  // Toggle this dropdown
  if (dropdown) dropdown.classList.toggle('open');
  if (statusItem) statusItem.classList.toggle('open');
}

// Close dropdowns when clicking outside
document.addEventListener('click', function(e) {
  const bar = document.getElementById('queue-status-bar');
  const buildDD = document.getElementById('build-queue-dropdown');
  const recruitDD = document.getElementById('recruit-queue-dropdown');
  if (bar && !bar.contains(e.target) &&
      buildDD && !buildDD.contains(e.target) &&
      recruitDD && !recruitDD.contains(e.target)) {
    buildDD.classList.remove('open');
    recruitDD.classList.remove('open');
    document.getElementById('build-status')?.classList.remove('open');
    document.getElementById('recruit-status')?.classList.remove('open');
  }
});

function renderBuildQueue() {
  const queue = currentCity?.buildQueue || [];
  const running = queue.filter(q => q.status === 'RUNNING').sort((a, b) => new Date(a.endsAt) - new Date(b.endsAt));
  const queued = queue.filter(q => q.status === 'QUEUED').sort((a, b) => a.slot - b.slot);

  // Update status bar text
  const statusItem = document.getElementById('build-status');
  const statusText = document.getElementById('build-status-text');
  const statusTimer = document.getElementById('build-status-timer');

  if (statusText) {
    const total = running.length + queued.length;
    if (running.length > 0) {
      const suffix = total > 1 ? ` (+${total - 1})` : '';
      statusText.textContent = `${getBuildingName(running[0].buildingKey)} Niv.${running[0].targetLevel}${suffix}`;
      if (statusTimer) {
        statusTimer.textContent = formatTime(running[0].endsAt);
        statusTimer.dataset.endsAt = running[0].endsAt;
      }
      statusItem?.classList.add('active');
    } else if (queued.length > 0) {
      statusText.textContent = `${queued.length} en attente`;
      if (statusTimer) { statusTimer.textContent = ''; statusTimer.dataset.endsAt = ''; }
      statusItem?.classList.add('active');
    } else {
      statusText.textContent = 'Aucune construction';
      if (statusTimer) { statusTimer.textContent = ''; statusTimer.dataset.endsAt = ''; }
      statusItem?.classList.remove('active');
    }
  }

  // Update dropdown content
  const listEl = document.getElementById('build-queue-list');
  if (listEl) {
    if (running.length > 0 || queued.length > 0) {
      let html = '';
      if (running.length > 0) {
        html += '<div class="qd-section-header">🔨 En cours (${running.length}/2)</div>'.replace('${running.length}', running.length);
        running.forEach((q, i) => {
          html += `<div class="qd-item running">
            <span class="qd-num">${i + 1}</span>
            <span class="qd-name">${BUILDING_ICONS[q.buildingKey] || '🏠'} ${getBuildingName(q.buildingKey)}</span>
            <span class="qd-level">Niv.${q.targetLevel}</span>
            <span class="qd-timer" data-ends-at="${q.endsAt}">${formatTime(q.endsAt)}</span>
          </div>`;
        });
      }
      if (queued.length > 0) {
        html += '<div class="qd-section-header">⏳ En attente (${queued.length}/2)</div>'.replace('${queued.length}', queued.length);
        queued.forEach((q, i) => {
          html += `<div class="qd-item queued">
            <span class="qd-num">${i + 1}</span>
            <span class="qd-name">${BUILDING_ICONS[q.buildingKey] || '🏠'} ${getBuildingName(q.buildingKey)}</span>
            <span class="qd-level">Niv.${q.targetLevel}</span>
            <span class="qd-status">En attente</span>
          </div>`;
        });
      }
      listEl.innerHTML = html;
    } else {
      listEl.innerHTML = '<div class="qd-empty">Aucune construction en cours</div>';
    }
  }
}

function renderRecruitQueue() {
  const queue = currentCity?.recruitQueue || [];

  // Update status bar text
  const statusItem = document.getElementById('recruit-status');
  const statusText = document.getElementById('recruit-status-text');
  const statusTimer = document.getElementById('recruit-status-timer');

  if (statusText) {
    if (queue.length > 0) {
      const first = queue[0];
      statusText.textContent = `${first.count}x ${getUnitName(first.unitKey)}`;
      if (statusTimer) {
        statusTimer.textContent = formatTime(first.endsAt);
        statusTimer.dataset.endsAt = first.endsAt;
      }
      statusItem?.classList.add('active');
    } else {
      statusText.textContent = 'Aucun recrutement';
      if (statusTimer) { statusTimer.textContent = ''; statusTimer.dataset.endsAt = ''; }
      statusItem?.classList.remove('active');
    }
  }

  // Update dropdown content
  const listEl = document.getElementById('recruit-queue-list');
  if (listEl) {
    if (queue.length > 0) {
      listEl.innerHTML = queue.map(q => `
        <div class="qd-item running">
          <span>⚔️</span>
          <span class="qd-name">${q.count}x ${getUnitName(q.unitKey)}</span>
          <span class="qd-timer" data-ends-at="${q.endsAt}">${formatTime(q.endsAt)}</span>
        </div>
      `).join('');
    } else {
      listEl.innerHTML = '<div class="qd-empty">Aucun recrutement en cours</div>';
    }
  }
}

function renderMovingArmies() {
  const moving = armies.filter(a => a.status !== 'IDLE');

  const missionIcons = {
    'ATTACK': '⚔️',
    'RAID': '💰',
    'SUPPORT': '🛡️',
    'SPY': '🔍',
    'TRANSPORT': '📦',
    'RETURNING': '🏠',
    'MOVING': '🚶'
  };

  // Update activity bar
  const activityEl = document.getElementById('movement-activity');
  if (activityEl) {
    if (moving.length > 0) {
      const first = moving[0];
      const icon = missionIcons[first.missionType] || missionIcons[first.status] || '🚶';
      activityEl.classList.add('active');
      activityEl.innerHTML = `
        <span class="activity-icon">${icon}</span>
        <span class="activity-text">${first.name || 'Armée'}</span>
        <span class="activity-timer" data-ends-at="${first.arrivalAt || ''}">${first.arrivalAt ? formatTime(first.arrivalAt) : '-'}</span>
        ${moving.length > 1 ? `<span class="activity-more">+${moving.length - 1}</span>` : ''}
      `;
    } else {
      activityEl.classList.remove('active');
      activityEl.innerHTML = `
        <span class="activity-icon">🚶</span>
        <span class="activity-text">Aucun mouvement</span>
      `;
    }
  }

  // Also update legacy moving-armies element if it exists
  const legacyEl = document.getElementById('movement-queue') || document.getElementById('moving-armies');
  if (legacyEl) {
    if (moving.length === 0) {
      legacyEl.innerHTML = '<p style="color:var(--text-muted);font-size:11px;text-align:center;">Aucun mouvement</p>';
    } else {
      legacyEl.innerHTML = moving.map(a => `
        <div class="queue-item">
          <span class="queue-icon">${missionIcons[a.missionType] || missionIcons[a.status] || '🚶'}</span>
          <div class="queue-info">
            <span class="queue-name">${a.name || 'Armée'}</span>
            <span class="queue-time">${a.arrivalAt ? formatTime(a.arrivalAt) : '-'}</span>
          </div>
        </div>
      `).join('');
    }
  }
}

