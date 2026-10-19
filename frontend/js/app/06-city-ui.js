// ============================================================
// 06-city-ui.js — UI ville : blessés, stats, onglets, listes bâtiments/unités, modale unité
// Découpé depuis app.js (lignes 6231-6769) — portée globale partagée,
// l'ordre de chargement dans index.html doit être respecté.
// ============================================================
// ========== WOUNDED UNITS ==========
async function loadWounded() {
  if (!currentCity) return;

  try {
    const res = await fetch(`${API}/api/city/${currentCity.id}/wounded`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.ok) {
      const wounded = await res.json();
      renderWounded(wounded);
    }
  } catch (e) {
    console.warn('Could not load wounded:', e);
  }
}

function renderWounded(wounded) {
  const el = document.getElementById('wounded-list');
  if (!el) return;

  if (!wounded || wounded.length === 0) {
    el.innerHTML = '<p style="color:var(--text-muted);font-size:11px;text-align:center;">Aucun blessé</p>';
    return;
  }

  // Lits de la Tente (règle du serveur, /api/world/info) ; les blessés au-delà attendent en file
  const tentLevel = (currentCity?.buildings || []).find(b => b.key === 'HEALING_TENT')?.level || 0;
  const beds = tentLevel * (Number(window.worldRules?.healingBedsPerLevel) || 200);
  const inBeds = wounded.reduce((s, w) => s + (w.count || 0), 0), waiting = wounded.reduce((s, w) => s + (w.waiting || 0), 0);
  const besieged = wounded.some(w => w.besieged);
  el.innerHTML = (besieged ? '<p style="font-size:11px;margin:0 0 6px;color:#b03020"><strong>Ville assiégée</strong> : l\'armée ennemie est sur la ville, aucun soin ni recrutement ; les soins reprendront d\'eux-mêmes à la levée du siège.</p>' : '') + `<p style="font-size:11px;margin:0 0 6px">Lits : <strong>${formatNum(inBeds)} / ${formatNum(beds)}</strong>${waiting ? ` · <strong>${formatNum(waiting)}</strong> en attente d'un lit` : ''}</p>` + wounded.map(w => {
    const timeLeft = Math.max(0, w.timeToHeal || 0);
    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);

    return `
      <div class="wounded-item">
        <span class="wounded-icon"><img class="ico" src="assets/images/3d/ui/endurance.webp" alt=""></span>
        <span class="wounded-count">${w.count}x ${w.unitName || w.unitKey}${w.waiting ? ` <small>+ ${w.waiting} en attente</small>` : ''}</span>
        <span class="wounded-time">${w.count > 0 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : 'en attente'}</span>
        ${w.count > 0 && !w.besieged ? `<button class="btn-small" onclick="healWounded('${w.unitKey}')" title="Soigner les blessés au lit (${w.count} or)"><img class="ico" src="assets/images/3d/ui/gold.webp" alt=""></button>` : ''}
      </div>
    `;
  }).join('');
}

async function healWounded(unitKey) {
  if (!currentCity) return;
  if (_actionInProgress) return;
  _actionInProgress = true;
  try {
    const res = await fetch(`${API}/api/city/${currentCity.id}/wounded/heal`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ unitKey })
    });

    const data = await res.json();
    if (res.ok) {
      showToast(`${data.healed} unités soignées! (-${data.goldSpent} or)`, 'success');
      loadWounded();
      loadPlayer(); // Refresh gold
    } else {
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur réseau', 'error');
  } finally {
    _actionInProgress = false;
  }
}

// ========== CITY STATS SIDEBAR ==========
function updateCityStats() {
  if (!currentCity) return;

  // Get building levels
  const warehouse = currentCity.buildings?.find(b => b.key === 'WAREHOUSE');
  const silo = currentCity.buildings?.find(b => b.key === 'SILO');
  const wall = currentCity.buildings?.find(b => b.key === 'WALL');

  const maxStorage = currentCity.maxStorage || 1000;
  const currentStorage = Math.floor((currentCity.wood || 0) + (currentCity.stone || 0) + (currentCity.iron || 0));
  const maxSilo = currentCity.maxFoodStorage || 1000;
  const currentSilo = Math.floor(currentCity.food || 0);

  // Wall HP
  const wallLevel = wall?.level || 0;
  const maxWallHp = currentCity.wallMaxHp || wallLevel * 1000;
  const currentWallHp = currentCity.wallHp || maxWallHp;

  // Update display
  const storageEl = document.getElementById('city-storage');
  const siloEl = document.getElementById('city-silo');
  const wallsEl = document.getElementById('city-walls');

  if (storageEl) storageEl.textContent = `${formatNum(currentStorage)}/${formatNum(maxStorage)}`;
  if (siloEl) siloEl.textContent = `${formatNum(currentSilo)}/${formatNum(maxSilo)}`;
  if (wallsEl) wallsEl.textContent = wallLevel > 0 ? `${currentWallHp}/${maxWallHp}` : 'Pas de mur';
}

// ========== TABS ==========
function showTab(tabName) {
  if (typeof track === 'function') track('tab_view', { tab: String(tabName) });
  if (typeof hideCityActions === 'function') hideCityActions();
  if (typeof cityHoveredSlot !== 'undefined') cityHoveredSlot = null;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.bnav-tab').forEach(b => b.classList.remove('active'));

  const tabEl = document.getElementById(`tab-${tabName}`);
  if (tabEl) tabEl.classList.add('active');
  // Activate both old nav-tab and new bnav-tab
  document.querySelector(`.nav-tab[data-tab="${tabName}"]`)?.classList.add('active');
  const bnavActive = document.querySelector(`.bnav-tab[data-tab="${tabName}"]`);
  if (bnavActive) { bnavActive.classList.add('active'); try { bnavActive.scrollIntoView({ inline: 'center', block: 'nearest' }); } catch (e) {} }
  
  // Start/stop animations based on tab
  if (tabName === 'city' || tabName === 'fields') {
    startCityAnimation();
  } else {
    stopCityAnimation();
  }

  // Special handling for fields/city tabs - they share the city-canvas
  if (tabName === 'fields' || tabName === 'city') {
    // Show city tab container (both use city-canvas)
    document.getElementById('tab-fields')?.classList.remove('active');
    document.getElementById('tab-city')?.classList.add('active');
    currentCityView = tabName;
    // Init canvas if not yet done (ensures event handlers are attached)
    if (!cityCanvas || !cityCtx) initCityCanvas();
    // Ensure canvas is properly sized (may have been hidden)
    if (cityCanvas) {
      const container = cityCanvas.parentElement;
      if (container && container.clientWidth > 0) {
        cityViewW = Math.max(container.clientWidth, 300);
        cityViewH = Math.max(container.clientHeight, 200);
        sizeCanvasForDpr(cityCanvas, cityCtx, cityViewW, cityViewH);
      }
    }
    if (tabName === 'fields') calculateFieldSlots();
    else calculateCitySlots();
    renderCityCanvas();
    return;
  }

  // Load tab content
  switch(tabName) {
    case 'buildings': loadBuildings(); break;
    case 'army': renderArmies(); break;
    case 'recruit': loadUnits(); break;
    case 'hero': loadHero(); break;
    case 'inventory': loadInventory(); break;
    case 'expeditions': loadExpeditions(); break;
    case 'map': loadMap(); break;
    case 'alliance': loadAlliance(); break;
    case 'market': loadMarket(); break;
    case 'ranking': loadRanking('players'); break;
    case 'reports': loadReports(); break;
  }
}

// ========== BUILDINGS ==========
let buildingsData = [];
window.buildingsData = buildingsData; // Rendre accessible globalement

async function loadBuildings() {
  // Utiliser le cache si disponible
  const cached = cache.get('buildings');
  if (cached) {
    buildingsData = cached;
    window.buildingsData = buildingsData;
    renderBuildings('all');
    return;
  }

  try {
    const res = await requestManager.fetchWithRetry(`${API}/api/buildings`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (res.ok) {
      const raw = await res.json();
      buildingsData = Array.isArray(raw) ? raw : (raw.buildings || []);
      window.buildingsData = buildingsData;
      cache.set('buildings', buildingsData);
    }
  } catch (e) {
    console.warn('loadBuildings error:', e);
  }
  renderBuildings('all');
}

function renderBuildings(filter) {
  const grid = document.getElementById('buildings-grid');
  let buildings = buildingsData.filter(b => {
    // Filter faction buildings: only show those matching player faction
    if (b.category === 'FACTION' && b.faction && player?.faction && b.faction !== player.faction) return false;
    return true;
  });

  if (filter !== 'all') {
    buildings = buildings.filter(b => b.category === filter);
  }
  
  const rbMainHall = currentCity?.buildings?.find(cb => cb.key === 'MAIN_HALL');
  const rbMainHallLevel = rbMainHall?.level || 1;

  grid.innerHTML = buildings.map(b => {
    const existing = currentCity?.buildings?.find(cb => cb.key === b.key);
    const level = existing?.level || 0;
    const nextLevel = level + 1;
    const rbEffectiveMax = b.key === 'MAIN_HALL' ? b.maxLevel : Math.min(b.maxLevel, rbMainHallLevel);
    const canBuild = nextLevel <= rbEffectiveMax;
    const blockedByMainHall = !canBuild && level < b.maxLevel && b.key !== 'MAIN_HALL';

    return `
      <div class="card">
        <h3>${buildingIconHtml(b.key)} ${b.name} ${infoBtnHtml('building', b.key)}</h3>
        <p>Niveau actuel: ${level} / ${rbEffectiveMax}</p>
        <div class="stats">
          Coût: <img class="ico" src="assets/images/3d/ui/wood.webp" alt="">${formatNum(b.costL1?.wood || 50)} <img class="ico" src="assets/images/3d/ui/stone.webp" alt="">${formatNum(b.costL1?.stone || 50)} <img class="ico" src="assets/images/3d/ui/iron.webp" alt="">${formatNum(b.costL1?.iron || 50)} <img class="ico" src="assets/images/3d/ui/food.webp" alt="">${formatNum(b.costL1?.food || 50)}
        </div>
        ${isBuildQueueFull() ? '<p style="padding:10px;color:var(--error);"><img class="ico" src="assets/images/3d/ui/clock.webp" alt=""> File de construction pleine (4/4)</p>' :
          canBuild ? `<button onclick="build('${b.key}')">Construire Niv.${nextLevel}</button>` :
          blockedByMainHall ? `<p style="padding:10px;color:#e67e22;"><img class="ico" src="assets/images/3d/ui/lock.webp" alt=""> Bat. principal Niv.${rbMainHallLevel} requis</p>` :
          '<p style="padding:10px;color:var(--gold);">Niveau max</p>'}
      </div>
    `;
  }).join('');
}

async function build(buildingKey) {
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
      body: JSON.stringify({ buildingKey })
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Construction lancée!', 'success');
      await loadCities();
      renderCity();
      loadBuildings();
    } else {
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    console.error('build error:', e);
    showToast('Erreur réseau', 'error');
  } finally {
    _buildInProgress = false;
  }
}

// ========== UNITS ==========
let unitsData = [];

async function loadUnits() {
  // Utiliser le cache si disponible
  const cached = cache.get('units');
  if (cached) {
    unitsData = cached;
    renderUnits('all');
    return;
  }
  
  try {
    const res = await requestManager.fetchWithRetry(`${API}/api/units`, { 
      headers: { Authorization: `Bearer ${token}` } 
    });
    if (res.ok) {
      const raw = await res.json();
      unitsData = Array.isArray(raw) ? raw : (raw.units || []);
      cache.set('units', unitsData);
    }
  } catch (e) {
    console.warn('loadUnits error:', e);
  }
  renderUnits('all');
}

function renderUnits(filter) {
  const grid = document.getElementById('units-grid');
  if (!grid) return;
  if (!currentCity?.buildings?.some(b => ['BARRACKS', 'STABLE', 'WORKSHOP', 'GREAT_BARRACKS', 'GREAT_STABLE'].includes(b.key))) {
    grid.innerHTML = '<div class="empty-state">Construisez une Caserne, une Écurie ou un Atelier pour recruter.</div>';
    return;
  }
  let units = unitsData.filter(u => u.faction === player?.faction);
  
  if (filter !== 'all') {
    units = units.filter(u => u.class === filter);
  }
  
  grid.innerHTML = units.map(u => `
    <div class="unit-card" onclick="showUnitDetail('${u.key}')">
      <div class="unit-card-header" style="border-color: ${TIER_COLORS[u.tier]}">
        <span class="unit-class-icon">${unitFigureHtml(u.key, 'unit-figure', u.name)}</span>
        ${infoBtnHtml('unit', u.key, 'info-btn-corner')}
        <div class="unit-tier-badge" style="background: ${TIER_COLORS[u.tier]}">${u.tier.charAt(0).toUpperCase()}</div>
      </div>
      <div class="unit-card-body">
        <h3 class="unit-name">${u.name}</h3>
        <div class="unit-stats-mini">
          <span title="Attaque"><img class="ico" src="assets/images/3d/ui/attack.webp" alt="">${u.stats?.attack || 0}</span>
          <span title="Défense"><img class="ico" src="assets/images/3d/ui/defense.webp" alt="">${u.stats?.defense || 0}</span>
          <span title="Endurance"><img class="ico" src="assets/images/3d/ui/endurance.webp" alt="">${u.stats?.endurance || 0}</span>
          <span title="Vitesse"><img class="ico" src="assets/images/3d/ui/expedition.webp" alt="">${u.stats?.speed || 0}</span>
        </div>
      </div>
      <div class="unit-card-footer">
        <button class="recruit-btn" onclick="event.stopPropagation(); showRecruitModal('${u.key}', '${u.name}')">
          Recruter
        </button>
      </div>
    </div>
  `).join('');
}

// ===== UNIT DETAIL MODAL (Travian Style) =====
function showUnitDetail(unitKey) {
  const unit = unitsData.find(u => u.key === unitKey);
  if (!unit) return;
  
  const modal = document.getElementById('modal');
  const tierColor = TIER_COLORS[unit.tier] || '#aaa';
  
  // Use per-unit GDD costs from units data (class-specific + tier multiplier)
  const unitCost = unit.recruitCost || { wood: 50, stone: 30, iron: 60, food: 30 };

  // Upkeep (GDD economy_config.json values)
  const foodUpkeep = unit.tier === 'base' ? 5 : unit.tier === 'intermediate' ? 10 : unit.tier === 'elite' ? 15 : 15;

  // Training time from GDD data
  const trainTime = unit.recruitTimeSec || 360;
  
  // Helper function to check and color resources
  const getResourceClass = (needed, available) => needed <= available ? 'res-available' : 'res-missing';
  const wood = currentCity?.wood || 0;
  const stone = currentCity?.stone || 0;
  const iron = currentCity?.iron || 0;
  const food = currentCity?.food || 0;
  
  // Check if can afford 1 unit
  const canAffordOne = wood >= unitCost.wood && stone >= unitCost.stone && iron >= unitCost.iron && food >= unitCost.food;
  
  document.getElementById('modal-body').innerHTML = `
    <div class="unit-detail-modal">
      <!-- Header avec couleur tier -->
      <div class="unit-detail-header" style="background: linear-gradient(135deg, ${tierColor}33 0%, transparent 100%); border-left: 4px solid ${tierColor}">
        <div class="unit-detail-icon">${unitIconHtml(unit.key, 'unit-ico-lg')}</div>
        <div class="unit-detail-title">
          <h2>${unit.name} ${infoBtnHtml('unit', unit.key)}</h2>
          <div class="unit-badges">
            <span class="tier-badge" style="background: ${tierColor}">${SHEET_TIER_NAMES[unit.tier] || unit.tier}</span>
            <span class="class-badge">${SHEET_CLASS_NAMES[unit.class] || unit.class}</span>
            <span class="faction-badge">${SHEET_FACTION_NAMES[unit.faction] || unit.faction}</span>
          </div>
        </div>
      </div>
      
      <!-- Stats complètes -->
      <div class="unit-stats-full">
        <h4><img class="ico" src="assets/images/3d/ui/stats.webp" alt=""> Statistiques</h4>
        <div class="stats-grid">
          <div class="stat-item attack">
            <span class="stat-icon"><img class="ico" src="assets/images/3d/ui/attack.webp" alt=""></span>
            <span class="stat-label">Attaque</span>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width: ${Math.min(100, unit.stats?.attack || 0)}%; background: #e74c3c"></div>
            </div>
            <span class="stat-value">${unit.stats?.attack || 0}</span>
          </div>
          <div class="stat-item defense">
            <span class="stat-icon"><img class="ico" src="assets/images/3d/ui/defense.webp" alt=""></span>
            <span class="stat-label">Défense</span>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width: ${Math.min(100, unit.stats?.defense || 0)}%; background: #3498db"></div>
            </div>
            <span class="stat-value">${unit.stats?.defense || 0}</span>
          </div>
          <div class="stat-item endurance">
            <span class="stat-icon"><img class="ico" src="assets/images/3d/ui/endurance.webp" alt=""></span>
            <span class="stat-label">Endurance</span>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width: ${Math.min(100, unit.stats?.endurance || 0)}%; background: #2ecc71"></div>
            </div>
            <span class="stat-value">${unit.stats?.endurance || 0}</span>
          </div>
          <div class="stat-item speed">
            <span class="stat-icon"><img class="ico" src="assets/images/3d/ui/expedition.webp" alt=""></span>
            <span class="stat-label">Vitesse</span>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width: ${Math.min(100, unit.stats?.speed || 0)}%; background: #f39c12"></div>
            </div>
            <span class="stat-value">${unit.stats?.speed || 0}</span>
          </div>
          <div class="stat-item transport">
            <span class="stat-icon"><img class="ico" src="assets/images/3d/ui/item_crate.webp" alt=""></span>
            <span class="stat-label">Transport</span>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width: ${Math.min(100, unit.stats?.transport || 0)}%; background: #9b59b6"></div>
            </div>
            <span class="stat-value">${unit.stats?.transport || 0}</span>
          </div>
        </div>
      </div>
      
      <!-- Coûts d'entraînement (avec couleurs selon ressources) -->
      <div class="unit-costs">
        <h4><img class="ico" src="assets/images/3d/ui/gold.webp" alt=""> Coût par unité</h4>
        <div class="cost-row">
          <span class="cost-item ${getResourceClass(unitCost.wood, wood)}"><img class="ico" src="assets/images/3d/ui/wood.webp" alt=""> ${unitCost.wood}</span>
          <span class="cost-item ${getResourceClass(unitCost.stone, stone)}"><img class="ico" src="assets/images/3d/ui/stone.webp" alt=""> ${unitCost.stone}</span>
          <span class="cost-item ${getResourceClass(unitCost.iron, iron)}"><img class="ico" src="assets/images/3d/ui/iron.webp" alt=""> ${unitCost.iron}</span>
          <span class="cost-item ${getResourceClass(unitCost.food, food)}"><img class="ico" src="assets/images/3d/ui/food.webp" alt=""> ${unitCost.food}</span>
        </div>
      </div>
      
      <!-- Temps et consommation -->
      <div class="unit-info-row">
        <div class="info-box">
          <span class="info-icon"><img class="ico" src="assets/images/3d/ui/clock.webp" alt=""></span>
          <span class="info-label">Formation</span>
          <span class="info-value">${formatDuration(trainTime)}</span>
        </div>
        <div class="info-box upkeep">
          <span class="info-icon"><img class="ico" src="assets/images/3d/ui/food.webp" alt=""></span>
          <span class="info-label">Céréales/h</span>
          <span class="info-value">${foodUpkeep}</span>
        </div>
        <div class="info-box">
          <span class="info-icon"><img class="ico" src="assets/images/3d/ui/population.webp" alt=""></span>
          <span class="info-label">Pop. (score)</span>
          <span class="info-value">${unit.tier === 'siege' ? 4 : unit.tier === 'elite' ? 3 : unit.tier === 'intermediate' ? 2 : 1}</span>
        </div>
      </div>
      
      <!-- Info consommation céréales -->
      <div class="upkeep-info">
        <span class="upkeep-icon">${resIconHtml('food')}</span>
        <span>Chaque unité consomme <strong>${foodUpkeep} céréales/h</strong>. Si la production de nourriture est insuffisante, vos troupes mourront de faim!</span>
      </div>
      
      <!-- Section recrutement -->
      <div class="recruit-section">
        <h4><img class="ico" src="assets/images/3d/ui/medal.webp" alt=""> Recruter</h4>
        <div class="recruit-row">
          <input type="number" id="recruit-count" value="10" min="1" max="1000" class="recruit-input" 
                 data-wood="${unitCost.wood}" data-stone="${unitCost.stone}" 
                 data-iron="${unitCost.iron}" data-food="${unitCost.food}">
          <button id="recruit-btn" onclick="recruit('${unit.key}')" class="recruit-action-btn ${canAffordOne ? '' : 'disabled'}">
            Recruter
          </button>
        </div>
        <div class="recruit-total" id="recruit-total"></div>
      </div>
    </div>
  `;
  
  // Update total cost and button state on input change
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
      <span class="${totalWood <= wood ? 'res-available' : 'res-missing'}"><img class="ico" src="assets/images/3d/ui/wood.webp" alt=""> ${formatNum(totalWood)}</span>
      <span class="${totalStone <= stone ? 'res-available' : 'res-missing'}"><img class="ico" src="assets/images/3d/ui/stone.webp" alt=""> ${formatNum(totalStone)}</span>
      <span class="${totalIron <= iron ? 'res-available' : 'res-missing'}"><img class="ico" src="assets/images/3d/ui/iron.webp" alt=""> ${formatNum(totalIron)}</span>
      <span class="${totalFood <= food ? 'res-available' : 'res-missing'}"><img class="ico" src="assets/images/3d/ui/food.webp" alt=""> ${formatNum(totalFood)}</span>
    `;
    
    btn.classList.toggle('disabled', !canAfford);
    btn.title = canAfford ? '' : 'Ressources insuffisantes';
  };
  
  setTimeout(() => {
    updateRecruitTotal();
    const input = document.getElementById('recruit-count');
    if (input) input.oninput = updateRecruitTotal;
  }, 50);
  
  modal.style.display = 'flex';
}

function showRecruitModal(unitKey, unitName) {
  // Use the detailed modal instead
  showUnitDetail(unitKey);
}

async function recruit(unitKey) {
  if (typeof trackOnce === 'function') trackOnce('first_recruit', { unit: String(unitKey) });
  if (_actionInProgress) return;
  _actionInProgress = true;
  try {
    const count = parseInt(document.getElementById('recruit-count').value) || 1;

    const res = await fetch(`${API}/api/city/${currentCity.id}/recruit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ unitKey, count })
    });

    const data = await res.json();
    closeModal();

    if (res.ok) {
      showToast(`Recrutement de ${count}x ${getUnitName(unitKey)} lancé !`, 'success');
      await loadCities();
      renderCity();
    } else {
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur réseau', 'error');
  } finally {
    _actionInProgress = false;
  }
}

