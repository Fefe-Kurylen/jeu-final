// ============================================================
// 06-city-ui.js — UI ville : blessés, onglets, listes bâtiments/unités, modale unité
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
  const askHelp = inBeds > 0 && currentCity && typeof helpAskButton === 'function' ? helpAskButton('HEAL', currentCity.id) : '';
  el.innerHTML = `<p style="font-size:11px;margin:0 0 6px">Lits : <strong>${formatNum(inBeds)} / ${formatNum(beds)}</strong>${waiting ? ` · <strong>${formatNum(waiting)}</strong> en attente d'un lit` : ''} ${askHelp}</p>` + wounded.map(w => {
    const timeLeft = Math.max(0, w.timeToHeal || 0);
    const minutes = Math.floor(timeLeft / 60000);
    const seconds = Math.floor((timeLeft % 60000) / 1000);

    return `
      <div class="wounded-item">
        <span class="wounded-icon">${resIconHtml('endurance')}</span>
        <span class="wounded-count">${w.count}x ${w.unitName || w.unitKey}${w.waiting ? ` <small>+ ${w.waiting} en attente</small>` : ''}</span>
        <span class="wounded-time">${w.count > 0 ? `${minutes}:${seconds.toString().padStart(2, '0')}` : 'en attente'}</span>
        ${w.count > 0 ? `<button class="btn-small" onclick="healWounded('${w.unitKey}')" title="Soigner les blessés au lit (${w.count} or)">${resIconHtml('gold')}</button>` : ''}
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

// ========== TABS ==========
function showTab(tabName) {
  // a deep link to an unknown tab (old push notifications said 'armies') never leaves a blank screen
  if (!document.getElementById(`tab-${tabName}`)) tabName = tabName === 'armies' ? 'army' : 'city';
  if (typeof track === 'function') track('tab_view', { tab: String(tabName) });
  if (typeof hideCityActions === 'function') hideCityActions();
  if (typeof cityHoveredSlot !== 'undefined') cityHoveredSlot = null;
  if (tabName !== 'map' && typeof releaseMapGround === 'function') releaseMapGround();   // la mémoire du sol de la carte
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.bnav-tab').forEach(b => b.classList.remove('active'));

  const tabEl = document.getElementById(`tab-${tabName}`);
  if (tabEl) tabEl.classList.add('active');
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
    renderCityCanvas();   // calcule aussi les emplacements
    return;
  }

  // Load tab content
  switch(tabName) {
    case 'buildings': loadBuildings(); break;
    case 'army': renderArmies(); break;
    case 'hero': loadHero(); break;
    case 'inventory': loadInventory(); break;
    case 'map': loadMap(); break;
    case 'alliance': loadAlliance(); break;
    case 'market': loadMarket(); break;
    case 'ranking': loadRanking('players'); break;
    case 'reports': if (typeof showReportsTab === 'function') showReportsTab(typeof currentReportTab !== 'undefined' ? currentReportTab : 'battles'); else loadReports(); break;
    case 'messages': loadChat(); break;
    case 'admin': if (typeof loadAdmin === 'function') loadAdmin(); break;   // écran d'administration (09j-admin.js)
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
          Coût: ${resIconHtml('wood')}${formatNum(b.costL1?.wood || 50)} ${resIconHtml('stone')}${formatNum(b.costL1?.stone || 50)} ${resIconHtml('iron')}${formatNum(b.costL1?.iron || 50)} ${resIconHtml('food')}${formatNum(b.costL1?.food || 50)}
        </div>
        ${isBuildQueueFull() ? `<p style="padding:10px;color:var(--error);">${resIconHtml('clock')} File de construction pleine (4/4)</p>` :
          canBuild ? `<button onclick="build('${b.key}')">Construire Niv.${nextLevel}</button>` :
          blockedByMainHall ? `<p style="padding:10px;color:#e67e22;">${resIconHtml('lock')} Bat. principal Niv.${rbMainHallLevel} requis</p>` :
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
          <span title="Attaque">${resIconHtml('attack')}${u.stats?.attack || 0}</span>
          <span title="Défense">${resIconHtml('defense')}${u.stats?.defense || 0}</span>
          <span title="Endurance">${resIconHtml('endurance')}${u.stats?.endurance || 0}</span>
          <span title="Vitesse">${resIconHtml('expedition')}${u.stats?.speed || 0}</span>
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
        <h4>${resIconHtml('stats')} Statistiques</h4>
        <div class="stats-grid">
          <div class="stat-item attack">
            <span class="stat-icon">${resIconHtml('attack')}</span>
            <span class="stat-label">Attaque</span>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width: ${Math.min(100, unit.stats?.attack || 0)}%; background: #e74c3c"></div>
            </div>
            <span class="stat-value">${unit.stats?.attack || 0}</span>
          </div>
          <div class="stat-item defense">
            <span class="stat-icon">${resIconHtml('defense')}</span>
            <span class="stat-label">Défense</span>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width: ${Math.min(100, unit.stats?.defense || 0)}%; background: #3498db"></div>
            </div>
            <span class="stat-value">${unit.stats?.defense || 0}</span>
          </div>
          <div class="stat-item endurance">
            <span class="stat-icon">${resIconHtml('endurance')}</span>
            <span class="stat-label">Endurance</span>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width: ${Math.min(100, unit.stats?.endurance || 0)}%; background: #2ecc71"></div>
            </div>
            <span class="stat-value">${unit.stats?.endurance || 0}</span>
          </div>
          <div class="stat-item speed">
            <span class="stat-icon">${resIconHtml('expedition')}</span>
            <span class="stat-label">Vitesse</span>
            <div class="stat-bar-container">
              <div class="stat-bar" style="width: ${Math.min(100, unit.stats?.speed || 0)}%; background: #f39c12"></div>
            </div>
            <span class="stat-value">${unit.stats?.speed || 0}</span>
          </div>
          <div class="stat-item transport">
            <span class="stat-icon">${resIconHtml('item_crate')}</span>
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
        <h4>${resIconHtml('gold')} Coût par unité</h4>
        <div class="cost-row">
          <span class="cost-item ${getResourceClass(unitCost.wood, wood)}">${resIconHtml('wood')} ${unitCost.wood}</span>
          <span class="cost-item ${getResourceClass(unitCost.stone, stone)}">${resIconHtml('stone')} ${unitCost.stone}</span>
          <span class="cost-item ${getResourceClass(unitCost.iron, iron)}">${resIconHtml('iron')} ${unitCost.iron}</span>
          <span class="cost-item ${getResourceClass(unitCost.food, food)}">${resIconHtml('food')} ${unitCost.food}</span>
        </div>
      </div>
      
      <!-- Temps et consommation -->
      <div class="unit-info-row">
        <div class="info-box">
          <span class="info-icon">${resIconHtml('clock')}</span>
          <span class="info-label">Formation</span>
          <span class="info-value">${formatDuration(trainTime)}</span>
        </div>
        <div class="info-box upkeep">
          <span class="info-icon">${resIconHtml('food')}</span>
          <span class="info-label">Céréales/h</span>
          <span class="info-value">${foodUpkeep}</span>
        </div>
        <div class="info-box">
          <span class="info-icon">${resIconHtml('population')}</span>
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
        <h4>${resIconHtml('medal')} Recruter</h4>
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
      <span class="${totalWood <= wood ? 'res-available' : 'res-missing'}">${resIconHtml('wood')} ${formatNum(totalWood)}</span>
      <span class="${totalStone <= stone ? 'res-available' : 'res-missing'}">${resIconHtml('stone')} ${formatNum(totalStone)}</span>
      <span class="${totalIron <= iron ? 'res-available' : 'res-missing'}">${resIconHtml('iron')} ${formatNum(totalIron)}</span>
      <span class="${totalFood <= food ? 'res-available' : 'res-missing'}">${resIconHtml('food')} ${formatNum(totalFood)}</span>
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

