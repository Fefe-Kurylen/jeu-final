// ============================================================
// 07-army.js — Armées : gestion, composition, envoi
// Découpé depuis app.js (lignes 6770-7753) — portée globale partagée,
// l'ordre de chargement dans index.html doit être respecté.
// ============================================================
// ========== ARMIES ==========
// ========== ARMY MANAGEMENT SYSTEM ==========
// Max armées selon niveau Rally Point (1 à niv.1, 2 à niv.5, 3 à niv.10)
function getMaxArmies() {
  const rallyPoint = currentCity?.buildings?.find(b => b.key === 'RALLY_POINT');
  const level = rallyPoint?.level || 0;
  if (level >= 10) return 3;
  if (level >= 5) return 2;
  if (level >= 1) return 1;
  return 0; // Pas de Rally Point = pas d'armée
}

function renderArmies() {
  const container = document.getElementById('armies-management');
  const garrisonSummary = document.getElementById('garrison-summary');
  
  if (!container) return;

  // Get garrison units (units in city, not assigned to any army)
  const garrisonUnits = getGarrisonUnits();
  const cityArmies = armies.filter(a => a.cityId === currentCity?.id && !a.isGarrison);
  const maxArmies = getMaxArmies();
  const heroData = player?.hero;
  const heroAssignedToArmy = cityArmies.find(a => a.heroId === heroData?.id);

  // Rally Point info
  const rallyPoint = currentCity?.buildings?.find(b => b.key === 'RALLY_POINT');
  const rallyLevel = rallyPoint?.level || 0;

  // Total garrison count
  const totalGarrison = garrisonUnits.reduce((sum, u) => sum + u.count, 0);

  // Create garrison-summary if it doesn't exist
  if (!garrisonSummary) {
    const gs = document.createElement('div');
    gs.id = 'garrison-summary';
    container.parentNode.insertBefore(gs, container);
  }
  const gsSummary = document.getElementById('garrison-summary');
  if (!gsSummary) return;

  // Render garrison summary header (compact)
  gsSummary.innerHTML = `
    <div class="army-header-compact">
      <div class="header-left-info">
        <span class="rally-badge"><img class="ico" src="assets/images/3d/ui/rally.webp" alt=""> Rally Niv.${rallyLevel}</span>
        <span class="army-count-badge">${cityArmies.length}/${maxArmies} armées</span>
      </div>
      <div class="header-right-info">
        <span class="garrison-badge-compact"><img class="ico" src="assets/images/3d/ui/city.webp" alt=""> ${totalGarrison} en garnison</span>
      </div>
    </div>
  `;
  
  // Build main content - Two column layout
  let html = `
    <div class="army-management-layout">
      <!-- Left: Armies Grid -->
      <div class="armies-column">
        <div class="column-header">
          <h3><img class="ico" src="assets/images/3d/ui/attack.webp" alt=""> Mes Armées</h3>
        </div>
        <div class="armies-list">
          ${[1, 2, 3].map(slotNum => {
            const army = cityArmies.find(a => a.slot === slotNum);
            const isLocked = slotNum > maxArmies;
            return renderArmyCardNew(slotNum, army, isLocked, heroData);
          }).join('')}
        </div>
      </div>
      
      <!-- Right: Hero + Garrison -->
      <div class="garrison-column">
        <!-- Hero Card -->
        <div class="hero-assignment-card">
          <div class="hero-card-header">
            <span class="hero-icon-mini">${heroPortraitHtml(player?.faction, 'hero-ico-sm')}</span>
            <span class="hero-name-mini">${escapeHtml(heroData?.name || 'Héros')}</span>
            <span class="hero-level-mini">Niv.${heroData?.level || 1}</span>
          </div>
          <div class="hero-stats-row">
            <span><img class="ico" src="assets/images/3d/ui/attack.webp" alt="">${(heroData?.attack || 5) + (heroData?.atkPoints || 0)}</span>
            <span><img class="ico" src="assets/images/3d/ui/defense.webp" alt="">${(heroData?.defense || 5) + (heroData?.defPoints || 0)}</span>
            <span><img class="ico" src="assets/images/3d/ui/bolt.webp" alt="">${(heroData?.speed || 5) + (heroData?.spdPoints || 0)}</span>
          </div>
          <div class="hero-assign-status">
            ${heroAssignedToArmy 
              ? `<span class="assigned-to">→ ${escapeHtml(heroAssignedToArmy.name)}</span>
                 <button class="btn-unassign-small" onclick="unassignHero('${heroAssignedToArmy.id}')">Retirer</button>`
              : `<span class="hero-available">✓ Disponible</span>`
            }
          </div>
        </div>
        
        <!-- Garrison Panel -->
        <div class="garrison-panel-compact">
          <div class="garrison-header-compact">
            <span><img class="ico" src="assets/images/3d/ui/city.webp" alt=""> Garnison</span>
            <span class="garrison-count-compact">${totalGarrison} unités</span>
          </div>
          ${garrisonUnits.length > 0 ? `
            <div class="garrison-units-grid">
              ${garrisonUnits.map(u => {
                const unit = unitsData.find(ud => ud.key === u.unitKey);
                const tierColor = TIER_COLORS[unit?.tier] || '#888';
                return `
                  <div class="garrison-unit-compact" title="${unit?.name || u.unitKey}" onclick="showUnitInfoModal('${u.unitKey}')">
                    <span class="g-unit-icon" style="border-color: ${tierColor}">${unitIconHtml(u.unitKey, 'unit-ico', unit?.name || '')}</span>
                    <span class="g-unit-count">×${u.count}</span>
                  </div>
                `;
              }).join('')}
            </div>
          ` : `
            <div class="garrison-empty-compact">
              <p>Aucune unité</p>
              <p class="hint-small">Recrutez via bâtiments militaires</p>
            </div>
          `}
        </div>
      </div>
    </div>
  `;
  
  container.innerHTML = html;
}

// New compact army card
function renderArmyCardNew(slotNum, army, isLocked, heroData) {
  // Locked slot
  if (isLocked) {
    const requiredLevel = slotNum === 1 ? 1 : slotNum === 2 ? 5 : 10;
    return `
      <div class="army-card-new locked">
        <div class="army-card-top locked">
          <span class="slot-num">#${slotNum}</span>
          <span class="lock-icon"><img class="ico" src="assets/images/3d/ui/lock.webp" alt=""></span>
        </div>
        <div class="army-card-body-locked">
          <p>Rally Niv.${requiredLevel} requis</p>
        </div>
      </div>
    `;
  }
  
  // Empty slot
  if (!army) {
    return `
      <div class="army-card-new empty" onclick="createArmy(${slotNum})">
        <div class="army-card-top empty">
          <span class="slot-num">#${slotNum}</span>
          <span class="empty-label">Vide</span>
        </div>
        <div class="army-card-body-empty">
          <span class="create-plus">+</span>
          <p>Créer une armée</p>
        </div>
      </div>
    `;
  }
  
  // Existing army
  const hasHero = army.heroId === heroData?.id;
  const totalUnits = army.units?.reduce((s, u) => s + u.count, 0) || 0;
  const armyPower = army.power ?? calculateArmyPower(army);
  
  const statusMap = {
    'IDLE': { icon: '<img class="ico" src="assets/images/3d/ui/home.webp" alt="">', label: 'En ville', cls: 'idle' },
    'MOVING': { icon: '<img class="ico" src="assets/images/3d/ui/expedition.webp" alt="">', label: 'En route', cls: 'moving' },
    'ATTACKING': { icon: '<img class="ico" src="assets/images/3d/ui/attack.webp" alt="">', label: 'Attaque', cls: 'attacking' },
    'RETURNING': { icon: '<img class="ico" src="assets/images/3d/ui/home.webp" alt="">', label: 'Retour', cls: 'returning' },
    'RAIDING': { icon: '<img class="ico" src="assets/images/3d/ui/gold.webp" alt="">', label: 'Pillage', cls: 'raiding' },
    'SPYING': { icon: '<img class="ico" src="assets/images/3d/ui/spy.webp" alt="">', label: 'Espionnage', cls: 'moving' },
    'TRANSPORTING': { icon: '<img class="ico" src="assets/images/3d/ui/item_crate.webp" alt="">', label: 'Transport', cls: 'moving' },
    'EXPEDITION': { icon: '<img class="ico" src="assets/images/3d/ui/expedition.webp" alt="">', label: 'Expédition', cls: 'moving' },
    'HARVESTING': { icon: '<img class="ico" src="assets/images/3d/ui/iron.webp" alt="">', label: 'Récolte', cls: 'harvesting' },
    'FOUNDING': { icon: '<img class="ico" src="assets/images/3d/ui/city.webp" alt="">', label: 'Fondation', cls: 'moving' }
  };
  const status = statusMap[army.status] || { icon: '', label: army.status, cls: 'unknown' };
  
  return `
    <div class="army-card-new active ${status.cls}" data-army-id="${army.id}">
      <!-- Header -->
      <div class="army-card-top">
        <div class="army-name-section">
          <span class="slot-num">#${slotNum}</span>
          <input type="text" class="army-name-input-new" value="${escapeHtml(army.name || `Armée ${slotNum}`)}" 
                 onchange="renameArmy('${army.id}', this.value)" onclick="event.stopPropagation()">
        </div>
        <span class="status-pill ${status.cls}">${status.icon} ${status.label}</span>
      </div>
      
      <!-- Hero Row -->
      <div class="army-hero-row ${hasHero ? 'has-hero' : 'no-hero'}" 
           onclick="${!hasHero && army.status === 'IDLE' ? `assignHeroToArmy('${army.id}')` : ''}">
        ${hasHero ? `
          <span class="hero-mini-icon">${heroPortraitHtml(player?.faction, 'hero-ico-xs')}</span>
          <span class="hero-mini-name">${escapeHtml(heroData?.name || 'Héros')}</span>
          ${army.status === 'IDLE' ? `<button class="btn-x-small" onclick="event.stopPropagation(); unassignHero('${army.id}')" title="Retirer">✕</button>` : ''}
        ` : `
          <span class="hero-placeholder-text">${army.status === 'IDLE' ? '+ Ajouter héros' : 'Sans héros'}</span>
        `}
      </div>
      
      <!-- Units Summary -->
      <div class="army-units-row">
        <div class="units-stat">
          <span class="stat-label">Unités</span>
          <span class="stat-value">${totalUnits}</span>
        </div>
        <div class="units-stat">
          <span class="stat-label">Force</span>
          <span class="stat-value"><img class="ico" src="assets/images/3d/ui/attack.webp" alt="">${formatNum(armyPower)}</span>
        </div>
        ${army.units?.length > 0 ? `
          <div class="units-icons-mini">
            ${army.units.slice(0, 4).map(u => {
              const unit = unitsData.find(ud => ud.key === u.unitKey);
              return `<span class="unit-icon-tiny clickable" title="${unit?.name}: ${u.count}" onclick="event.stopPropagation(); showUnitInfoModal('${sheetKey(u.unitKey)}')">${unitIconHtml(u.unitKey, 'unit-ico-sm')}<b>${u.count}</b></span>`;
            }).join('')}
            ${army.units.length > 4 ? `<span class="more-badge">+${army.units.length - 4}</span>` : ''}
          </div>
        ` : `<span class="no-units-badge">Aucune</span>`}
      </div>
      
      <!-- Harvest Progress (if harvesting) -->
      ${army.status === 'HARVESTING' ? `
        <div class="harvest-progress-row">
          <div class="harvest-info">
            <span class="harvest-type"><img class="ico" src="assets/images/3d/ui/iron.webp" alt=""> ${army.harvestResourceType || '?'}</span>
            <span class="harvest-rate">+100/min</span>
          </div>
          <div class="harvest-carry">
            <span class="carry-label">Transporté:</span>
            ${(army.woundedCarry || []).reduce((t, w) => t + (w.count || 0), 0) > 0 ? `<span class="carry-value" title="Blessés qui rentrent avec l'armée : ils iront à la Tente de soins au retour">${resIconHtml('endurance')} ${formatNum((army.woundedCarry || []).reduce((t, w) => t + (w.count || 0), 0))} blessés</span>` : ''}
            ${(army.settlers || 0) > 0 ? `<span class="carry-value">${typeof settlerIcon === 'function' ? settlerIcon() : resIconHtml('city')} ${army.settlers} colon${army.settlers > 1 ? 's' : ''}</span>` : ''}
            <span class="carry-value">${formatNum((army.carryWood || 0) + (army.carryStone || 0) + (army.carryIron || 0) + (army.carryFood || 0))}${army.carryGold ? ` + <img class="ico" src="assets/images/3d/ui/gold.webp" alt=""> ${formatNum(army.carryGold)}` : ''}</span>
          </div>
        </div>
      ` : ''}

      <!-- Actions -->
      <div class="army-actions-row">
        ${army.status === 'IDLE' ? `
          <button class="army-btn primary" onclick="openArmyComposition('${army.id}')" title="Composer">
            ${resIconHtml('list')} Composer
          </button>
          <button class="army-btn icon-only" onclick="showArmyActionsMenu('${army.id}')" title="Actions">
            ${resIconHtml('settings')}
          </button>
        ` : army.status === 'HARVESTING' ? `
          <button class="army-btn secondary" onclick="returnArmy('${army.id}')">
            ↩️ Arrêter & Rentrer
          </button>
          <span class="destination-badge"><img class="ico" src="assets/images/3d/ui/pin.webp" alt=""> (${army.targetX ?? army.x ?? '?'}, ${army.targetY ?? army.y ?? '?'})</span>
        ` : army.status === 'EXPEDITION' ? `
          <span class="destination-badge"><img class="ico" src="assets/images/3d/ui/expedition.webp" alt=""> En expédition, retour automatique</span>
        ` : `
          <button class="army-btn secondary" onclick="returnArmy('${army.id}')">
            ↩️ Rappeler
          </button>
          <span class="destination-badge"><img class="ico" src="assets/images/3d/ui/pin.webp" alt=""> (${army.targetX ?? '?'}, ${army.targetY ?? '?'})</span>
        `}
      </div>
    </div>
  `;
}

// Army power like the server: (attack + defense) × tier coefficient × count
const TIER_POWER = { base: 1.0, intermediate: 1.25, elite: 1.55, siege: 0.75 };   // = config.combat.tierCoefficients
function unitPower(unit, count) {
  return count * ((unit?.stats?.attack || 0) + (unit?.stats?.defense || 0)) * (TIER_POWER[unit?.tier] || 1);
}
function calculateArmyPower(army) {
  if (!army?.units) return 0;
  return army.units.reduce((sum, u) => sum + unitPower(unitsData.find(ud => ud.key === u.unitKey), u.count), 0);
}

// Show actions menu for army
function showArmyActionsMenu(armyId) {
  const army = armies.find(a => a.id === armyId);
  if (!army) return;

  // Check if army can move (needs at least 1 unit)
  const totalUnits = army.units?.reduce((s, u) => s + u.count, 0) || 0;
  const hasHero = army.heroId;
  const canMove = totalUnits > 0;
  const disabledReason = !canMove ? (hasHero ? 'Le héros nécessite au moins 1 soldat' : 'Armée vide') : '';

  const modal = document.getElementById('modal');
  document.getElementById('modal-body').innerHTML = `
    <div class="army-actions-modal">
      <h3><img class="ico" src="assets/images/3d/ui/settings.webp" alt=""> Actions - ${escapeHtml(army.name)}</h3>
      ${!canMove ? `<p class="warning-text" style="color:#ff6b6b;text-align:center;margin-bottom:10px">${disabledReason}</p>` : ''}
      <div class="actions-grid">
        <button class="action-card ${!canMove ? 'disabled' : ''}" ${canMove ? `onclick="closeModal(); showMoveModal('${armyId}')"` : 'disabled'}>
          <span class="action-icon"><img class="ico" src="assets/images/3d/ui/expedition.webp" alt=""></span>
          <span class="action-label">Déplacer</span>
        </button>
        <button class="action-card ${!canMove ? 'disabled' : ''}" ${canMove ? `onclick="closeModal(); showAttackModal('${armyId}')"` : 'disabled'}>
          <span class="action-icon"><img class="ico" src="assets/images/3d/ui/attack.webp" alt=""></span>
          <span class="action-label">Attaquer</span>
        </button>
        <button class="action-card ${!canMove ? 'disabled' : ''}" ${canMove ? `onclick="closeModal(); showRaidModal('${armyId}')"` : 'disabled'}>
          <span class="action-icon"><img class="ico" src="assets/images/3d/ui/gold.webp" alt=""></span>
          <span class="action-label">Piller</span>
        </button>
        <button class="action-card danger" onclick="closeModal(); confirmDisbandArmy('${armyId}')">
          <span class="action-icon">${resIconHtml('skull')}</span>
          <span class="action-label">Dissoudre</span>
        </button>
      </div>
      <button class="btn-close-modal" onclick="closeModal()">Fermer</button>
    </div>
  `;
  modal.style.display = 'flex';
}

// ========== ARMY COMPOSITION SYSTEM ==========
function openArmyComposition(armyId) {
  const army = armies.find(a => a.id === armyId);
  if (!army) {
    showToast('Armée introuvable', 'error');
    return;
  }
  
  if (army.status !== 'IDLE') {
    showToast('L\'armée doit être en ville pour modifier sa composition', 'warning');
    return;
  }
  
  const garrisonUnits = getGarrisonUnits();
  const heroData = player?.hero;
  const hasHero = army.heroId === heroData?.id;
  
  // Merge garrison + army units for total available
  const allUnitsMap = {};
  
  // Add garrison units
  garrisonUnits.forEach(u => {
    allUnitsMap[u.unitKey] = { garrison: u.count, inArmy: 0 };
  });
  
  // Add army units
  army.units?.forEach(u => {
    if (!allUnitsMap[u.unitKey]) {
      allUnitsMap[u.unitKey] = { garrison: 0, inArmy: 0 };
    }
    allUnitsMap[u.unitKey].inArmy = u.count;
  });
  
  // Filter units that exist (garrison or in army)
  const availableUnits = Object.entries(allUnitsMap)
    .filter(([key, data]) => data.garrison > 0 || data.inArmy > 0)
    .map(([unitKey, data]) => {
      const unit = unitsData.find(u => u.key === unitKey);
      return {
        unitKey,
        unit,
        garrison: data.garrison,
        inArmy: data.inArmy,
        total: data.garrison + data.inArmy
      };
    })
    .sort((a, b) => {
      // Sort by class then tier
      const classOrder = { 'INFANTRY': 0, 'ARCHER': 1, 'CAVALRY': 2, 'SIEGE': 3 };
      const tierOrder = { 'base': 0, 'intermediate': 1, 'elite': 2, 'siege': 3 };
      const classA = classOrder[a.unit?.class] ?? 99;
      const classB = classOrder[b.unit?.class] ?? 99;
      if (classA !== classB) return classA - classB;
      return (tierOrder[a.unit?.tier] ?? 99) - (tierOrder[b.unit?.tier] ?? 99);
    });
  
  const modal = document.getElementById('modal');
  
  document.getElementById('modal-body').innerHTML = `
    <div class="army-composition-modal">
      <!-- Header -->
      <div class="comp-header">
        <div class="comp-header-left">
          <span class="comp-slot-badge">#${army.slot}</span>
          <h2>${escapeHtml(army.name)}</h2>
        </div>
        <div class="comp-header-right">
          <span class="comp-power" id="comp-power"><img class="ico" src="assets/images/3d/ui/attack.webp" alt=""> ${formatNum(calculateArmyPower(army))}</span>
        </div>
      </div>
      
      <!-- Hero Assignment -->
      <div class="comp-hero-section">
        <div class="comp-hero-card ${hasHero ? 'assigned' : ''}">
          <span class="hero-icon-comp"><img class="ico" src="assets/images/3d/ui/player.webp" alt=""></span>
          <div class="hero-info-comp">
            ${hasHero ? `
              <span class="hero-name-comp">${escapeHtml(heroData?.name || 'Héros')}</span>
              <span class="hero-stats-comp"><img class="ico" src="assets/images/3d/ui/attack.webp" alt="">${(heroData?.attack || 5) + (heroData?.atkPoints || 0)} <img class="ico" src="assets/images/3d/ui/defense.webp" alt="">${(heroData?.defense || 5) + (heroData?.defPoints || 0)} <img class="ico" src="assets/images/3d/ui/bolt.webp" alt="">${(heroData?.speed || 5) + (heroData?.spdPoints || 0)}</span>
            ` : `
              <span class="hero-placeholder-comp">Aucun héros assigné</span>
            `}
          </div>
          <div class="hero-action-comp">
            ${hasHero 
              ? `<button class="btn-hero-action remove" onclick="unassignHeroFromComposition('${armyId}')">Retirer</button>`
              : `<button class="btn-hero-action assign" onclick="assignHeroFromComposition('${armyId}')">Assigner</button>`
            }
          </div>
        </div>
      </div>
      
      <!-- Units Composition -->
      <div class="comp-units-section">
        <div class="comp-units-header">
          <h3><img class="ico" src="assets/images/3d/ui/list.webp" alt=""> Composition</h3>
          <div class="comp-actions">
            <button class="comp-btn" onclick="setAllUnitsToArmy('${armyId}')">Tout ajouter</button>
            <button class="comp-btn" onclick="removeAllUnitsFromArmy('${armyId}')">Tout retirer</button>
          </div>
        </div>
        
        ${availableUnits.length > 0 ? `
          <div class="comp-units-list" id="comp-units-list">
            ${availableUnits.map(u => renderCompositionUnitRow(armyId, u)).join('')}
          </div>
        ` : `
          <div class="comp-no-units">
            <p>Aucune unité disponible</p>
            <p class="hint">Recrutez des troupes dans vos bâtiments militaires!</p>
          </div>
        `}
      </div>
      
      <!-- Footer -->
      <div class="comp-footer">
        <div class="comp-summary">
          <span class="summary-item" id="comp-total-units">
            <strong>${army.units?.reduce((s, u) => s + u.count, 0) || 0}</strong> unités dans l'armée
          </span>
          <span class="summary-item" id="comp-garrison-left">
            <strong>${garrisonUnits.reduce((s, u) => s + u.count, 0)}</strong> en garnison
          </span>
        </div>
        <button class="btn-done" onclick="closeModal(); renderArmies();">✓ Terminé</button>
      </div>
    </div>
  `;
  
  modal.style.display = 'flex';
}

// Render a unit row in composition modal
function renderCompositionUnitRow(armyId, unitData) {
  const { unitKey, unit, garrison, inArmy, total } = unitData;
  const tierColor = TIER_COLORS[unit?.tier] || '#888';
  
  return `
    <div class="comp-unit-row" data-unit="${unitKey}">
      <div class="comp-unit-info">
        <span class="comp-unit-icon" style="border-color: ${tierColor}">${unitIconHtml(unitKey || unit?.key || '', 'unit-ico')}</span>
        <div class="comp-unit-details">
          <span class="comp-unit-name">${unit?.name || unitKey} ${infoBtnHtml('unit', unitKey, 'info-btn-sm')}</span>
          <span class="comp-unit-tier" style="color: ${tierColor}">${unit?.tier?.toUpperCase() || ''}</span>
        </div>
      </div>
      
      <div class="comp-unit-controls">
        <div class="comp-available">
          <span class="available-label">Garnison:</span>
          <span class="available-count" id="garrison-${unitKey}">${garrison}</span>
        </div>
        
        <div class="comp-slider-group">
          <button class="comp-btn-adjust" onclick="adjustComposition('${armyId}', '${unitKey}', -10)">−10</button>
          <button class="comp-btn-adjust" onclick="adjustComposition('${armyId}', '${unitKey}', -1)">−</button>
          <input type="number" class="comp-input" id="comp-${unitKey}" data-in-army="${inArmy}"
                 value="${inArmy}" min="0" max="${total}" 
                 onchange="setComposition('${armyId}', '${unitKey}', this.value)">
          <button class="comp-btn-adjust" onclick="adjustComposition('${armyId}', '${unitKey}', 1)">+</button>
          <button class="comp-btn-adjust" onclick="adjustComposition('${armyId}', '${unitKey}', 10)">+10</button>
        </div>
        
        <button class="comp-btn-max" onclick="setMaxComposition('${armyId}', '${unitKey}', ${total})">MAX</button>
      </div>
    </div>
  `;
}

// Adjust composition (add/remove units)
async function adjustComposition(armyId, unitKey, delta) {
  const input = document.getElementById(`comp-${unitKey}`);
  const garrisonSpan = document.getElementById(`garrison-${unitKey}`);
  if (!input) return;
  
  // data-in-army holds the last confirmed value: the input itself may contain a value being typed
  const currentInArmy = parseInt(input.dataset.inArmy) || 0;
  const currentGarrison = parseInt(garrisonSpan?.textContent) || 0;
  const total = currentInArmy + currentGarrison;
  
  let newValue = currentInArmy + delta;
  newValue = Math.max(0, Math.min(total, newValue));
  
  if (newValue === currentInArmy) { input.value = currentInArmy; return; }
  
  const actualDelta = newValue - currentInArmy;
  
  // Optimistic UI update
  input.value = newValue;
  input.dataset.inArmy = newValue;
  if (garrisonSpan) {
    garrisonSpan.textContent = currentGarrison - actualDelta;
  }
  updateCompositionSummary();
  
  // Send to server
  try {
    const res = await fetch(`${API}/api/army/${armyId}/set-unit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ unitKey, count: newValue })
    });
    
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Revert on error
      input.value = currentInArmy;
      input.dataset.inArmy = currentInArmy;
      if (garrisonSpan) garrisonSpan.textContent = currentGarrison;
      updateCompositionSummary();
      showToast(data.error || 'Erreur', 'error');
    } else {
      // The server may clamp: align with its answer, then refresh armies data silently
      if (Number.isInteger(data.newCount) && data.newCount !== newValue) {
        input.value = data.newCount; input.dataset.inArmy = data.newCount;
        if (garrisonSpan) garrisonSpan.textContent = total - data.newCount;
        updateCompositionSummary();
      }
      await loadArmies();
    }
  } catch (e) {
    input.value = currentInArmy;
    input.dataset.inArmy = currentInArmy;
    if (garrisonSpan) garrisonSpan.textContent = currentGarrison;
    updateCompositionSummary();
    showToast('Erreur de connexion', 'error');
  }
}

// Set exact composition (typed value), clamped to what the garrison can provide
async function setComposition(armyId, unitKey, value) {
  const input = document.getElementById(`comp-${unitKey}`);
  const garrisonSpan = document.getElementById(`garrison-${unitKey}`);
  if (!input) return;
  const currentInArmy = parseInt(input.dataset.inArmy) || 0;
  const currentGarrison = parseInt(garrisonSpan?.textContent) || 0;
  const target = Math.max(0, Math.min(currentInArmy + currentGarrison, parseInt(value) || 0));
  input.value = currentInArmy;
  if (target !== currentInArmy) await adjustComposition(armyId, unitKey, target - currentInArmy);
}

// Set max units
async function setMaxComposition(armyId, unitKey, total) {
  const input = document.getElementById(`comp-${unitKey}`);
  const currentInArmy = parseInt(input?.dataset.inArmy) || 0;
  const delta = total - currentInArmy;
  
  if (delta !== 0) {
    await adjustComposition(armyId, unitKey, delta);
  }
}

// Update summary in composition modal
function updateCompositionSummary() {
  const totalUnitsSpan = document.getElementById('comp-total-units');
  const garrisonLeftSpan = document.getElementById('comp-garrison-left');
  const powerSpan = document.getElementById('comp-power');
  
  if (!totalUnitsSpan) return;
  
  let totalInArmy = 0;
  let totalGarrison = 0;
  let totalPower = 0;
  
  document.querySelectorAll('.comp-unit-row').forEach(row => {
    const unitKey = row.dataset.unit;
    const input = row.querySelector('.comp-input');
    const garrisonSpan = row.querySelector('.available-count');
    
    const inArmy = parseInt(input?.value) || 0;
    const garrison = parseInt(garrisonSpan?.textContent) || 0;
    
    totalInArmy += inArmy;
    totalGarrison += garrison;
    
    totalPower += unitPower(unitsData.find(u => u.key === unitKey), inArmy);
  });
  
  totalUnitsSpan.innerHTML = `<strong>${totalInArmy}</strong> unités dans l'armée`;
  garrisonLeftSpan.innerHTML = `<strong>${totalGarrison}</strong> en garnison`;
  if (powerSpan) powerSpan.textContent = `${formatNum(totalPower)}`;
}

// Add all units to army
async function setAllUnitsToArmy(armyId) {
  const rows = document.querySelectorAll('.comp-unit-row');
  for (const row of rows) {
    const unitKey = row.dataset.unit;
    const input = row.querySelector('.comp-input');
    const garrisonSpan = row.querySelector('.available-count');
    
    const currentInArmy = parseInt(input?.value) || 0;
    const currentGarrison = parseInt(garrisonSpan?.textContent) || 0;
    const total = currentInArmy + currentGarrison;
    
    if (currentInArmy < total) {
      await adjustComposition(armyId, unitKey, total - currentInArmy);
    }
  }
  showToast('Toutes les unités ajoutées', 'success');
}

// Remove all units from army
async function removeAllUnitsFromArmy(armyId) {
  const rows = document.querySelectorAll('.comp-unit-row');
  for (const row of rows) {
    const unitKey = row.dataset.unit;
    const input = row.querySelector('.comp-input');
    const currentInArmy = parseInt(input?.value) || 0;
    
    if (currentInArmy > 0) {
      await adjustComposition(armyId, unitKey, -currentInArmy);
    }
  }
  showToast('Toutes les unités retirées', 'success');
}

// Hero assignment from composition modal
async function assignHeroFromComposition(armyId) {
  await assignHeroToArmy(armyId);
  // Refresh modal
  openArmyComposition(armyId);
}

async function unassignHeroFromComposition(armyId) {
  await unassignHero(armyId);
  // Refresh modal
  openArmyComposition(armyId);
}

// Get garrison units (not in any army)
function getGarrisonUnits() {
  // For now, get from the "garrison" army (slot 0) or first IDLE army in city
  const garrisonArmy = armies.find(a => a.cityId === currentCity?.id && a.isGarrison);
  if (garrisonArmy?.units) {
    return garrisonArmy.units;
  }
  
  // Fallback: aggregate all idle army units in city
  const cityArmies = armies.filter(a => a.cityId === currentCity?.id && a.status === 'IDLE');
  const unitMap = {};
  cityArmies.forEach(army => {
    army.units?.forEach(u => {
      if (!unitMap[u.unitKey]) unitMap[u.unitKey] = 0;
      unitMap[u.unitKey] += u.count;
    });
  });
  
  return Object.entries(unitMap).map(([unitKey, count]) => ({ unitKey, count }));
}

// Create new army
async function createArmy(slotNum) {
  const maxArmies = getMaxArmies();
  const cityArmies = armies.filter(a => a.cityId === currentCity?.id && !a.isGarrison);
  
  if (maxArmies === 0) {
    showToast('Construisez une Place de rassemblement!', 'error');
    return;
  }
  
  if (cityArmies.length >= maxArmies) {
    showToast(`Maximum ${maxArmies} armées! (Améliorez le Rally Point)`, 'error');
    return;
  }
  
  try {
    const res = await fetch(`${API}/api/army/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ 
        cityId: currentCity.id, 
        slot: slotNum,
        name: `Armée ${slotNum}`
      })
    });
    
    const data = await res.json();
    
    if (res.ok) {
      showToast(`Armée ${slotNum} créée!`, 'success');
      await loadArmies();
      renderArmies();
    } else {
      showToast(data.error || 'Erreur création armée', 'error');
    }
  } catch (e) {
    showToast('Erreur de connexion', 'error');
  }
}

// Rename army
async function renameArmy(armyId, newName) {
  try {
    const res = await fetch(`${API}/api/army/${armyId}/rename`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name: newName })
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      showToast(data.error || 'Nom refusé', 'error');
      renderArmies();
      return;
    }
    const army = armies.find(a => a.id === armyId);
    if (army) army.name = data.name || newName;
  } catch (e) {
    console.error('Rename error', e);
    showToast('Erreur réseau', 'error');
  }
}

// Assign hero to army
async function assignHeroToArmy(armyId) {
  if (!player?.hero) {
    showToast('Aucun héros disponible', 'error');
    return;
  }
  
  // The server moves the hero between armies of the same city; it can't be pulled out of a mission
  const armyWithHero = armies.find(a => a.heroId && a.id !== armyId && a.status !== 'IDLE');
  if (armyWithHero) {
    showToast(`Le héros est en mission avec ${armyWithHero.name}.`, 'warning');
    return;
  }
  
  try {
    const res = await fetch(`${API}/api/army/${armyId}/assign-hero`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ heroId: player.hero.id })
    });
    
    if (res.ok) {
      showToast('Héros assigné!', 'success');
      await loadArmies();
      renderArmies();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur de connexion', 'error');
  }
}

// Unassign hero from army
async function unassignHero(armyId) {
  try {
    const res = await fetch(`${API}/api/army/${armyId}/unassign-hero`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    });
    
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      showToast('Héros retiré de l\'armée', 'success');
      await loadArmies();
      renderArmies();
    } else {
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur réseau', 'error');
  }
}

// Adjust unit count in army
async function adjustArmyUnit(armyId, unitKey, delta) {
  const army = armies.find(a => a.id === armyId);
  if (!army || army.status !== 'IDLE') {
    showToast('Armée non disponible', 'error');
    return;
  }
  
  const currentUnit = army.units?.find(u => u.unitKey === unitKey);
  const currentCount = currentUnit?.count || 0;
  const newCount = Math.max(0, currentCount + delta);
  
  // Check garrison has enough units if adding
  if (delta > 0) {
    const garrison = getGarrisonUnits();
    const garrisonUnit = garrison.find(u => u.unitKey === unitKey);
    const available = garrisonUnit?.count || 0;
    if (delta > available) {
      showToast('Pas assez d\'unités en garnison', 'error');
      return;
    }
  }
  
  try {
    const res = await fetch(`${API}/api/army/${armyId}/adjust-unit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ unitKey, delta })
    });
    
    if (res.ok) {
      await loadArmies();
      renderArmies();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur', 'error');
  }
}

// Confirm disband army
function confirmDisbandArmy(armyId) {
  const army = armies.find(a => a.id === armyId);
  
  document.getElementById('modal-body').innerHTML = `
    <div class="disband-confirm">
      <h3>Dissoudre l'armée ?</h3>
      <p>Les unités retourneront en garnison.</p>
      <p class="warning">Cette action est irréversible!</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
        <button class="btn btn-danger" onclick="disbandArmy('${armyId}')">Dissoudre</button>
      </div>
    </div>
  `;
  
  document.getElementById('modal').style.display = 'flex';
}

// Disband army
async function disbandArmy(armyId) {
  try {
    const res = await fetch(`${API}/api/army/${armyId}/disband`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    
    closeModal();
    
    if (res.ok) {
      showToast('Armée dissoute', 'success');
      await loadArmies();
      renderArmies();
    } else {
      const data = await res.json();
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    showToast('Erreur', 'error');
  }
}

function showMoveModal(armyId) {
  document.getElementById('modal-body').innerHTML = `
    <h3>Déplacer l'armée</h3>
    <input type="number" id="move-x" placeholder="X" style="width:48%;display:inline-block">
    <input type="number" id="move-y" placeholder="Y" style="width:48%;display:inline-block">
    <button onclick="moveArmy('${armyId}')" class="btn">Déplacer</button>
  `;
  document.getElementById('modal').style.display = 'flex';
}

async function moveArmy(armyId) {
  try {
    const x = parseInt(document.getElementById('move-x').value);
    const y = parseInt(document.getElementById('move-y').value);

    const res = await fetch(`${API}/api/army/${armyId}/move`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ x, y })
    });

    const data = await res.json();
    closeModal();

    if (res.ok) {
      showToast('Armée en mouvement!', 'success');
      await loadArmies();
      renderArmies();
    } else {
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    console.error('moveArmy error:', e);
    closeModal();
    showToast('Erreur réseau', 'error');
  }
}

function showAttackModal(armyId) {
  document.getElementById('modal-body').innerHTML = `
    <h3>Attaquer une ville</h3>
    <p style="margin-bottom:10px;color:var(--wood-medium)">Entrez l'ID de la ville cible</p>
    <input type="text" id="attack-city" placeholder="ID de la ville cible">
    <button onclick="attackCity('${armyId}')" class="btn btn-danger">Attaquer!</button>
  `;
  document.getElementById('modal').style.display = 'flex';
}

async function attackCity(armyId) {
  try {
    const targetCityId = document.getElementById('attack-city').value;

    const res = await fetch(`${API}/api/army/${armyId}/attack`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ targetCityId })
    });

    const data = await res.json();
    closeModal();

    if (res.ok) {
      showToast(`Attaque lancée contre ${data.target}!`, 'success');
      await loadArmies();
      renderArmies();
    } else {
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    console.error('attackCity error:', e);
    closeModal();
    showToast('Erreur réseau', 'error');
  }
}

function showRaidModal(armyId) {
  document.getElementById('modal-body').innerHTML = `
    <h3>Piller une ville</h3>
    <p style="margin-bottom:10px;color:var(--wood-medium)">Volez des ressources à l'ennemi!</p>
    <input type="text" id="raid-city" placeholder="ID de la ville cible">
    <button onclick="raidCity('${armyId}')" class="btn" style="background:linear-gradient(180deg,orange,#c70)">Piller!</button>
  `;
  document.getElementById('modal').style.display = 'flex';
}

async function raidCity(armyId) {
  try {
    const targetCityId = document.getElementById('raid-city').value;

    const res = await fetch(`${API}/api/army/${armyId}/raid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ targetCityId })
    });

    const data = await res.json();
    closeModal();

    if (res.ok) {
      showToast(`Raid lancé contre ${data.target}!`, 'success');
      await loadArmies();
      renderArmies();
    } else {
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    console.error('raidCity error:', e);
    closeModal();
    showToast('Erreur réseau', 'error');
  }
}

async function returnArmy(armyId) {
  try {
    const res = await fetch(`${API}/api/army/${armyId}/return`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await res.json();
    if (res.ok) {
      showToast('Armée rappelée!', 'success');
      await loadArmies();
      renderArmies();
    } else {
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    console.error('returnArmy error:', e);
    showToast('Erreur réseau', 'error');
  }
}

