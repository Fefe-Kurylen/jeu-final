// ============================================================
// 07-army.js — Armées : gestion, composition, envoi
// Découpé depuis app.js (lignes 6770-7753) — portée globale partagée,
// l'ordre de chargement dans index.html doit être respecté.
// ============================================================
// ========== ARMIES ==========
// ========== ARMY MANAGEMENT SYSTEM ==========
// Max armées selon la Place de rassemblement, comme le serveur : 1 au niv. 1, +1 tous les 5 niveaux, 5 au niv. 20
const ARMY_SLOTS = [1, 2, 3, 4, 5];
function maxArmiesAtRallyLevel(level) {
  if (level <= 0) return 0;   // pas de Place de rassemblement = pas d'armée
  const pts = window.buildingsData?.find(b => b.key === 'RALLY_POINT')?.effects?.maxArmies || { l1: 1, l20: 5 };
  return Math.min(pts.l20 || 5, (pts.l1 || 1) + Math.floor(level / 5));
}
function getMaxArmies() {
  return maxArmiesAtRallyLevel(currentCity?.buildings?.find(b => b.key === 'RALLY_POINT')?.level || 0);
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
  // le héros ne combat que joint à une armée (la garnison comprise), depuis le panneau de l'armée (décision du 29 octobre 2026)
  const heroAssignedToArmy = armies.find(a => a.heroId && a.heroId === heroData?.id);
  const cityGarrison = armies.find(a => a.cityId === currentCity?.id && a.isGarrison);
  const heroCityName = (cities || []).find(c => c.id === heroData?.cityId)?.name;

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
          ${ARMY_SLOTS.map(slotNum => {
            const army = cityArmies.find(a => a.slot === slotNum);
            const isLocked = slotNum > maxArmies && !army;   // an army above the Rally Point limit stays reachable
            return renderArmyCardNew(slotNum, army, isLocked, heroData);
          }).join('')}
          ${(() => {   // armies not shown in a slot above (army taken over from a razed colony, slot beyond the Rally Point): still reachable
            const shown = new Set(ARMY_SLOTS.map(n => cityArmies.find(a => a.slot === n)?.id).filter(Boolean));
            return cityArmies.filter(a => !shown.has(a.id) && !a.isGarrison).map(a => renderArmyCardNew(a.slot, a, false, heroData)).join('');
          })()}
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
              ? `<span class="assigned-to">→ ${escapeHtml(heroAssignedToArmy.name)}${heroAssignedToArmy.cityId !== currentCity?.id ? ` <small>(${escapeHtml((cities || []).find(c => c.id === heroAssignedToArmy.cityId)?.name || '')})</small>` : ''}</span>
                 ${heroAssignedToArmy.status === 'IDLE' && heroAssignedToArmy.cityId === currentCity?.id ? `<button class="btn-unassign-small" onclick="unassignHero('${heroAssignedToArmy.id}')">Retirer</button>` : ''}`
              : heroData?.diedAt
                ? `<span class="hero-available">Tombé : ressuscitez-le au Domus</span>`
                : `<span class="hero-free">En ville${heroCityName ? ` à ${escapeHtml(heroCityName)}` : ''}, joint à aucune armée : il ne combat pas.</span>
                   ${cityGarrison && (!heroData?.cityId || heroData.cityId === currentCity?.id || (currentCity?.isCapital && !(cities || []).some(c => c.id === heroData.cityId))) ? `<button class="btn-unassign-small" onclick="assignHeroToArmy('${cityGarrison.id}')">Joindre à la garnison</button>` : ''}`
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
  if (typeof renderSupportReceived === 'function') renderSupportReceived(container);   // renforts alliés reçus (09d-alliance.js)
  if (typeof renderSpiesSection === 'function') renderSpiesSection(container);   // espions (09f-spies.js)
}

// New compact army card
function renderArmyCardNew(slotNum, army, isLocked, heroData) {
  // Locked slot
  if (isLocked) {
    const requiredLevel = slotNum <= 1 ? 1 : (slotNum - 1) * 5;   // rallyLevelForArmies du serveur
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
    'ATTACKING': { icon: '<img class="ico" src="assets/images/3d/ui/attack.webp" alt="">', label: army.missionType === 'BREAK_SIEGE' ? 'Sortie' : 'Attaque', cls: 'attacking' },
    'BESIEGING': { icon: '<img class="ico" src="assets/images/3d/ui/attack.webp" alt="">', label: 'Siège', cls: 'attacking' },
    'RETURNING': { icon: '<img class="ico" src="assets/images/3d/ui/home.webp" alt="">', label: 'Retour', cls: 'returning' },
    'RAIDING': { icon: '<img class="ico" src="assets/images/3d/ui/gold.webp" alt="">', label: 'Pillage', cls: 'raiding' },
    'SPYING': { icon: '<img class="ico" src="assets/images/3d/ui/spy.webp" alt="">', label: 'Espionnage', cls: 'moving' },
    'TRANSPORTING': { icon: '<img class="ico" src="assets/images/3d/ui/item_crate.webp" alt="">', label: 'Transport', cls: 'moving' },
    'EXPEDITION': { icon: '<img class="ico" src="assets/images/3d/ui/expedition.webp" alt="">', label: 'Expédition', cls: 'moving' },
    'HARVESTING': { icon: '<img class="ico" src="assets/images/3d/ui/iron.webp" alt="">', label: 'Récolte', cls: 'harvesting' },
    'FOUNDING': { icon: '<img class="ico" src="assets/images/3d/ui/city.webp" alt="">', label: 'Fondation', cls: 'moving' },
    'SUPPORTING': { icon: '<img class="ico" src="assets/images/3d/ui/defense.webp" alt="">', label: 'Renfort en route', cls: 'moving' },
    'STATIONED': { icon: '<img class="ico" src="assets/images/3d/ui/defense.webp" alt="">', label: 'En renfort', cls: 'idle' },
    'MARKET': { icon: '<img class="ico" src="assets/images/3d/ui/market.webp" alt="">', label: 'Offre du marché', cls: 'idle' },
    // rassemblement d'alliance contre un donjon (09l-rally.js)
    'RALLY_JOIN': { icon: '<img class="ico" src="assets/images/3d/ui/rally.webp" alt="">', label: 'Rejoint un rassemblement', cls: 'moving' },
    'RALLY_WAIT': { icon: '<img class="ico" src="assets/images/3d/ui/rally.webp" alt="">', label: 'Rassemblement (attente)', cls: 'idle' },
    'RALLY_MARCH': { icon: '<img class="ico" src="assets/images/3d/ui/attack.webp" alt="">', label: 'Rassemblement en route', cls: 'attacking' }
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
        ` : army.status === 'BESIEGING' ? `
          <button class="army-btn secondary" onclick="returnArmy('${army.id}')">↩️ Lever le camp</button>
          <span class="destination-badge" title="L'armée campe 1 h devant la ville, puis le combat démarre tout seul ; le mur sert de bouclier et seuls vos engins l'abîment ; l'armée rentre ensuite chez elle">Combat dans ${siegeTimeLeft(new Date(army.arrivalAt) - serverNow())}</span>
        ` : army.status === 'EXPEDITION' ? `
          <span class="destination-badge"><img class="ico" src="assets/images/3d/ui/expedition.webp" alt=""> En expédition, retour automatique</span>
        ` : army.status === 'TRANSPORTING' && army.missionType === 'MARKET_DELIVERY' ? `
          <span class="destination-badge" title="Convoi d'un échange du marché : il livre puis rentre tout seul, on ne peut pas le rappeler">${resIconHtml('market')} Livraison d'un échange</span>
          <span class="destination-badge"><img class="ico" src="assets/images/3d/ui/pin.webp" alt=""> (${army.targetX ?? '?'}, ${army.targetY ?? '?'})</span>
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

// Army power like the server: (attack + defense) × tier coefficient (SHEET_RULES.tierCoeff, 10b-sheets.js) × count
function unitPower(unit, count) {
  return count * ((unit?.stats?.attack || 0) + (unit?.stats?.defense || 0)) * (SHEET_RULES.tierCoeff[unit?.tier] || 1);
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
        <button class="action-card ${!canMove ? 'disabled' : ''}" ${canMove ? `onclick="closeModal(); showArmyMissionModal('${armyId}', 'ATTACK')"` : 'disabled'}>
          <span class="action-icon"><img class="ico" src="assets/images/3d/ui/attack.webp" alt=""></span>
          <span class="action-label">Attaquer</span>
        </button>
        <button class="action-card ${!canMove ? 'disabled' : ''}" ${canMove ? `onclick="closeModal(); showArmyMissionModal('${armyId}', 'RAID')"` : 'disabled'}>
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
        
        ${siegeCapLine(army, availableUnits)}
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

// Engins de siège : sans plafond ; il en faut au moins un pour assiéger (règle du serveur, décision du 25 octobre 2026)
function siegeCapLine(army, availableUnits) {
  if (!availableUnits.some(u => u.unit?.class === 'SIEGE')) return '';
  const inArmy = (army.units || []).filter(u => unitsData.find(d => d.key === u.unitKey)?.class === 'SIEGE').reduce((t, u) => t + u.count, 0);
  return `<p class="comp-siege-cap" style="font-size:12px;margin:4px 0 8px">Engins de siège : <strong id="comp-siege-count">${formatNum(inArmy)}</strong> (au moins 1 pour assiéger ; au combat, seuls les engins abîment le mur)</p>`;
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
      return data;
    } else {
      // The server may clamp: align with its answer, then refresh armies data silently
      if (Number.isInteger(data.newCount) && data.newCount !== newValue) {
        input.value = data.newCount; input.dataset.inArmy = data.newCount;
        if (garrisonSpan) garrisonSpan.textContent = total - data.newCount;
        updateCompositionSummary();
      }
      await loadArmies();
      return data;
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
  const siegeEl = document.getElementById('comp-siege-count');
  if (siegeEl) {
    let siege = 0;
    document.querySelectorAll('.comp-unit-row').forEach(row => {
      if (unitsData.find(u => u.key === row.dataset.unit)?.class === 'SIEGE') siege += parseInt(row.querySelector('.comp-input')?.value) || 0;
    });
    siegeEl.textContent = formatNum(siege);
  }
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
  
  // same rule as the server: an unlocked slot that is free (an army re-homed from a razed colony may sit beyond the limit)
  if (slotNum > maxArmies) {
    showToast('Emplacement non débloqué (améliorez la Place de rassemblement)', 'error');
    return;
  }
  if (cityArmies.some(a => a.slot === slotNum)) {
    showToast(`Emplacement ${slotNum} déjà occupé`, 'error');
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

// Confirm disband army
function confirmDisbandArmy(armyId) {
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

// Attaque ou pillage d'une ville par ses coordonnées, pour n'importe quelle armée à l'arrêt (même envoi que l'onglet Envoyer)
function showArmyMissionModal(armyId, mission) {
  const raid = mission === 'RAID';
  document.getElementById('modal-body').innerHTML = `
    <h3>${raid ? 'Piller une ville' : 'Attaquer une ville'}</h3>
    <p style="margin-bottom:10px;color:var(--text-muted)">${raid ? 'Volez des ressources à l\'ennemi ! ' : ''}Coordonnées de la ville cible</p>
    <input type="number" id="mission-x" placeholder="X" style="width:48%;display:inline-block">
    <input type="number" id="mission-y" placeholder="Y" style="width:48%;display:inline-block">
    ${raid
      ? `<button onclick="sendArmyMission('${armyId}', 'RAID')" class="btn" style="background:linear-gradient(180deg,orange,#c70)">Piller !</button>`
      : `<button onclick="sendArmyMission('${armyId}', 'ATTACK')" class="btn btn-danger">Attaquer !</button>`}
  `;
  document.getElementById('modal').style.display = 'flex';
}

async function sendArmyMission(armyId, mission) {
  const x = document.getElementById('mission-x')?.value.trim(), y = document.getElementById('mission-y')?.value.trim();
  if (!x || !y) { showToast('Veuillez entrer les coordonnées de la cible', 'error'); return; }
  try {
    const res = await fetch(`${API}/api/armies/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ armyId, targetX: parseInt(x), targetY: parseInt(y), mission })
    });

    const data = await res.json();
    closeModal();

    if (res.ok) {
      showToast(data.message || 'Armée envoyée !', 'success');
      await loadArmies();
      renderArmies();
    } else {
      showToast(data.error || 'Erreur', 'error');
    }
  } catch (e) {
    console.error('sendArmyMission error:', e);
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


// ========== SIÈGES ==========
// Une attaque arrivée campe 1 h devant la ville, puis le combat démarre (le mur sert de bouclier). Pendant l'heure, la
// ville vit normalement et n'importe quel joueur peut attaquer le camp (décision du 25 octobre 2026).
function siegeTimeLeft(ms) {
  const t = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60);
  return h ? `${h} h ${String(m).padStart(2, '0')}` : `${Math.max(1, m)} min`;
}

async function openBreakSiege(cityId) {
  let siege;
  try {
    const r = await fetch(`${API}/api/city/${cityId}/siege`, { headers: { Authorization: `Bearer ${token}` } });
    siege = await r.json();
    if (!r.ok) throw new Error(siege.error || 'Erreur');
  } catch (e) { showToast(e.message || 'Erreur réseau', 'error'); return; }
  if (!siege.besieged) { showToast('Cette ville n\'est pas assiégée', 'info'); return; }
  const now = serverNow();
  const idle = (armies || []).filter(a => a.status === 'IDLE' && !a.isGarrison && a.units?.length > 0);
  // same rules as the server: an army of this city waiting outside fights every camp outside its alliance; any other
  // army (a sortie from the walls included) only the camps the diplomacy lets it attack
  const ready = idle.filter(a => (a.cityId === siege.cityId && !(a.x === siege.x && a.y === siege.y)) ? siege.canForce : siege.canSortie);
  const wall = siege.wallLevel > 0
    ? `<p>Mur niveau ${siege.wallLevel} : <strong>${formatNum(siege.wallHp)} / ${formatNum(siege.wallMaxHp)} PV</strong> au prochain combat. Tant qu'il tient, les coups de l'attaquant tombent sur lui et seuls les engins l'abîment ; une fois tombé, le combat dure encore au moins 5 rounds.</p>`
    : '<p>Pas de mur : rien ne protège les défenseurs au combat.</p>';
  const lives = siege.livesLeft, livesTotal = siege.livesTotal;
  document.getElementById('modal-body').innerHTML = `
    <div class="siege-modal">
      <h3>${resIconHtml('attack')} Siège de ${escapeHtml(siege.cityName)}</h3>
      ${wall}
      <p>Vies de la ville : <strong>${lives} / ${livesTotal}</strong> avant la chute (${siege.fate === 'RELOCATED' ? 'la capitale serait déplacée près du bord de la carte' : 'la ville serait détruite'}). Chaque combat gagné par l'attaquant ôte une vie, la même part des PV du mur et pille un quart du stock hors cachette (dans la limite de ce que l'armée porte) ; tout remonte en 48 h.</p>
      <ul class="siege-camp" style="margin:6px 0 10px;padding-left:18px">${siege.besiegers.map(b => `<li><strong>${escapeHtml(b.owner || '?')}</strong>, ${escapeHtml(b.name || 'Armée')} : ${formatNum(b.soldiers)} soldats dont ${formatNum(b.engines)} engins de siège${b.assaultAt ? ` · combat dans <strong>${siegeTimeLeft(new Date(b.assaultAt) - now)}</strong>` : ''}</li>`).join('')}</ul>
      <p style="font-size:12px;opacity:.85">Le camp attend 1 h avant le combat ; la ville vit normalement mais ses armées ne sortent que pour attaquer le camp. N'importe quel joueur peut attaquer le camp (sauf ceux de son alliance ou d'une alliance alliée) : il combat tous les camps à la fois, et s'il gagne il reste devant la ville pour la garder.</p>
      ${siege.canBreak ? (ready.length ? `
        <label for="break-army" style="display:block;margin-top:8px">Armée envoyée</label>
        <select id="break-army">${ready.map(a => `<option value="${a.id}">${escapeHtml(a.name || 'Armée')} (force ${formatNum(a.power ?? calculateArmyPower(a))})</option>`).join('')}</select>
        <button class="btn btn-danger" onclick="confirmBreakSiege('${siege.cityId}')">${resIconHtml('attack')} Attaquer l'armée qui assiège</button>
      ` : idle.length ? '<p class="warning-text">Vos armées disponibles ne peuvent pas attaquer ce camp : il est de votre alliance ou d\'une alliance alliée.</p>'
        : '<p class="warning-text">Aucune armée disponible : formez une armée au point de ralliement avec les troupes présentes.</p>') : ''}
      <button class="btn btn-secondary" onclick="closeModal()">Fermer</button>
    </div>`;
  document.getElementById('modal').style.display = 'flex';
}

async function confirmBreakSiege(cityId) {
  const armyId = document.getElementById('break-army')?.value;
  if (!armyId) return;
  try {
    const res = await fetch(`${API}/api/army/${armyId}/break-siege`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ targetCityId: cityId }) });
    const data = await res.json().catch(() => ({}));
    closeModal();
    if (!res.ok) { showToast(data.error || 'Erreur', 'error'); return; }
    showToast(data.message || 'Armée en route', 'success');
    await loadArmies();
    renderArmies();
  } catch (e) { closeModal(); showToast('Erreur réseau', 'error'); }
}
