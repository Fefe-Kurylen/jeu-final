// ============================================================
// 07-army.js — Armées : gestion, composition, envoi
// Découpé depuis app.js (lignes 6770-7753) — portée globale partagée,
// l'ordre de chargement dans index.html doit être respecté.
// ============================================================
// ========== ARMIES ==========
// ========== ARMY MANAGEMENT SYSTEM ==========
// Max armées de chaque ville selon la Place de rassemblement, comme le serveur : 1 au niv. 1, +1 tous les 5 niveaux, 5 au
// niv. 20. Elle est réservée à la capitale (décision du 30 octobre 2026) : son niveau vaut pour toutes les villes
const ARMY_SLOTS = [1, 2, 3, 4, 5];
function maxArmiesAtRallyLevel(level) {
  if (level <= 0) return 0;   // pas de Place de rassemblement = pas d'armée
  const pts = window.buildingsData?.find(b => b.key === 'RALLY_POINT')?.effects?.maxArmies || { l1: 1, l20: 5 };
  return Math.min(pts.l20 || 5, (pts.l1 || 1) + Math.floor(level / 5));
}
const rallyPointLevel = () => effectBuildings(currentCity).reduce((m, b) => (b.key === 'RALLY_POINT' && b.level > m ? b.level : m), 0);
function getMaxArmies() {
  return maxArmiesAtRallyLevel(rallyPointLevel());
}
// Taille d'un rassemblement d'alliance (décision du 31 octobre 2026) : la Place de rassemblement du lanceur en permet
// rallyMaxArmiesBase + rallyMaxArmiesPerLevel × niveau, la sienne comprise (fx.rallyMaxArmies du serveur : 25 au niveau 20)
const rallyMaxArmiesAt = (level) => buildingEffectOf('RALLY_POINT', 'rallyMaxArmiesBase') + buildingEffectOf('RALLY_POINT', 'rallyMaxArmiesPerLevel') * Math.max(0, level);
// Forge de la capitale (décision du 31 octobre 2026) : son bonus d'attaque et de défense, dans tous les combats, sous la
// force affichée d'une armée (la force elle-même reste attaque + défense des unités, comme le serveur)
function forgeNoteHtml() {
  const atk = forgeBonusPct('attack'), def = forgeBonusPct('defense');
  return atk || def ? `<span class="forge-note" title="Forge de la capitale : vaut dans tous les combats (attaque, défense, renfort, camps, donjons, Bastion)">${resIconHtml('attack')} Forge : +${fmtTechPct(atk)} % d'attaque et +${fmtTechPct(def)} % de défense au combat</span>` : '';
}

// ---- Armées rattachées aux colonies (décision du 1er novembre 2026, simulation de 200 jours, E2) ----
// Une armée à l'arrêt dans une de vos colonies peut lui être rattachée : elle prend une place d'armée de la colonie (autant
// que la Place de rassemblement de la capitale en permet), la défend et y rentre après chaque mission. Pas de réserve en
// colonie : on n'y prend ni n'y pose de soldats ; une armée de la capitale posée dans la colonie lui en donne par
// « Échanger » (décision du 2 novembre 2026, deuxième simulation de 200 jours, G9) ; « Renvoyer à la capitale » la ramène
// (il faut une place libre dans la capitale). La Ville Merveille n'est pas une colonie (serveur : config.army.colonyArmies).
const COLONY_ARMY_RULE = 'Rattachée à une colonie, une armée la défend (attaques, raids, sièges) et y rentre après chaque mission. Pas de réserve en colonie : on n\'y prend ni n\'y pose de soldats. Pour la renforcer, amenez une armée de la capitale dans la colonie et échangez leurs soldats (onglet Armée › Échanger), ou renvoyez-la à la capitale.';
// Colonie (ou Ville Merveille) de l'armée, null pour une armée de la capitale (attachedColony de GET /api/armies)
function armyColonyOf(army) {
  if (!army || army.isGarrison) return null;
  if (army.attachedColony !== undefined) return army.attachedColony;
  const city = (cities || []).find(c => c.id === army.cityId);
  return city && !city.isCapital ? { id: city.id, name: city.name, isWonder: !!city.isWonder } : null;
}
// Colonie du joueur où se tient une armée à l'arrêt d'une autre ville : on peut l'y rattacher (null sinon)
function colonyToAttach(army) {
  if (!army || army.isGarrison || army.status !== 'IDLE') return null;
  return (cities || []).find(c => !c.isCapital && !c.isWonder && c.x === army.x && c.y === army.y && c.id !== army.cityId) || null;
}
// Armées du joueur venues d'une autre ville et posées dans cette colonie (à rattacher)
const armiesToAttachIn = (city) => (armies || []).filter(a => colonyToAttach(a)?.id === city?.id);

async function attachArmyToColony(armyId) {
  try {
    const res = await fetch(`${API}/api/army/${armyId}/attach-colony`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    showToast(res.ok ? (data.message || 'Armée rattachée à la colonie') : (data.error || 'Rattachement impossible'), res.ok ? 'success' : 'error');
  } catch (e) { showToast('Erreur réseau', 'error'); }
  closeModal();
  await loadArmies();
  renderArmies();
}

async function sendArmyBackToCapital(armyId) {
  const army = (armies || []).find(a => a.id === armyId);
  const ok = await confirmModal(`Renvoyer ${army?.name || 'cette armée'} à la capitale ? Elle quitte la colonie et reprend tout de suite une place d'armée de la capitale.`, { title: 'Renvoyer à la capitale', okLabel: 'Renvoyer' });
  if (!ok) return;
  try {
    const res = await fetch(`${API}/api/army/${armyId}/detach-colony`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    showToast(res.ok ? (data.message || 'Armée en route vers la capitale') : (data.error || 'Renvoi impossible'), res.ok ? 'success' : 'error');
  } catch (e) { showToast('Erreur réseau', 'error'); }
  await loadArmies();
  renderArmies();
}

// Liste des armées posées dans la colonie affichée, à rattacher (onglet Armée d'une colonie, place libre touchée)
function colonyGuestsHtml(city, freeSlots) {
  if (!city || city.isCapital) return '';
  if (city.isWonder) return `<p class="hint-small colony-guests-note">${resIconHtml('defense')} La Ville Merveille n'est pas une colonie : ses défenseurs restent des armées de la capitale.</p>`;
  const guests = armiesToAttachIn(city);
  const rows = guests.map(a => {
    const home = (cities || []).find(c => c.id === a.cityId);
    const soldiers = (a.units || []).reduce((s, u) => s + u.count, 0);
    // la garde déjà rattachée, à l'arrêt ici : on lui donne des soldats sans prendre de place (G9)
    const guard = (typeof exchangePartners === 'function' ? exchangePartners(a) : []).find(p => p.cityId === city.id);
    return `<div class="colony-guest-row">
        <span class="cg-name">${escapeHtml(a.name)}${home ? ` <small>(${escapeHtml(home.name)})</small>` : ''}</span>
        <span class="cg-units">${resIconHtml('army')} ${formatNum(soldiers)} soldats</span>
        <button type="button" class="army-btn primary" ${freeSlots > 0 ? '' : 'disabled title="Aucune place d\'armée libre dans la colonie"'} onclick="attachArmyToColony('${a.id}')">${resIconHtml('defense')} Rattacher à cette colonie</button>
        ${guard ? `<button type="button" class="army-btn secondary" onclick="openArmyExchange('${a.id}', '${guard.id}')" title="Donner des soldats à ${escapeHtml(guard.name)}, la garde de la colonie, sans prendre de place d'armée">${resIconHtml('army')} Échanger avec ${escapeHtml(guard.name)}</button>` : ''}
      </div>`;
  }).join('');
  return `<div class="colony-guests">
      <div class="column-header"><h3>${resIconHtml('defense')} Armées posées dans la colonie</h3></div>
      <p class="hint-small">${escapeHtml(COLONY_ARMY_RULE)} Rattacher une armée libère sa place dans la capitale ; échanger avec la garde ne prend aucune place.</p>
      ${rows || '<p class="hint-small">Aucune armée à rattacher ici : déplacez une armée de la capitale jusqu\'à la colonie, puis rattachez-la.</p>'}
    </div>`;
}

// ---- Seules les armées défendent une ville (décision du 2 novembre 2026, deuxième simulation de 200 jours, G10) ----
// La réserve d'une ville (les soldats formés mais dans aucune armée : son armée « garnison ») ne combat plus quand la ville
// est attaquée, pillée ou assiégée : ni tuée ni blessée, elle reste en ville. Défendent : les armées de la ville à la maison,
// celles du joueur venues d'une autre de ses villes, les armées rattachées à une colonie et les renforts alliés postés
// (armyProcessor.defendingArmies du serveur). Le héros ne combat que dans une armée : joint à la réserve, il ne défend pas.
const RESERVE_NOTICE = 'Vos soldats en réserve ne défendent pas : mettez-les dans une armée.';
const reserveNoticeText = (n) => n > 0 ? `Vos ${formatNum(n)} soldats en réserve ne défendent pas : mettez-les dans une armée.` : RESERVE_NOTICE;
const armySoldiers = (army) => (army?.units || []).reduce((t, u) => t + (u.count || 0), 0);
// Ce qui défend une ville du joueur : ses armées à l'arrêt dans la ville (hors réserve), et sa réserve comptée à part
function cityDefenceOf(city) {
  if (!city) return { armies: [], soldiers: 0, reserve: 0 };
  const here = (armies || []).filter(a => !a.isGarrison && a.status === 'IDLE' && a.x === city.x && a.y === city.y && armySoldiers(a) > 0);
  const reserve = (armies || []).filter(a => a.isGarrison && a.cityId === city.id).reduce((t, a) => t + armySoldiers(a), 0);
  return { armies: here, soldiers: here.reduce((t, a) => t + armySoldiers(a), 0), reserve };
}
// Résumé de la défense d'une ville (onglet Armée, panneau de sa ville sur la carte, siège)
function cityDefenceHtml(city) {
  const d = cityDefenceOf(city);
  const who = d.armies.length ? `${d.armies.length} armée${d.armies.length > 1 ? 's' : ''} · ${formatNum(d.soldiers)} soldats` : 'aucune armée';
  return `<p class="city-defence${d.armies.length ? '' : ' warning-text'}">${resIconHtml('defense')} Seules les armées défendent la ville : <strong>${who}</strong> ici, plus les renforts alliés postés.${d.reserve > 0 ? ` <strong>${reserveNoticeText(d.reserve)}</strong>` : ''}</p>`;
}
// Ce qui défendra la ville visée par une attaque (texte de l'alerte d'attaque)
function attackDefenceNote(cityId) {
  const city = (cities || []).find(c => c.id === cityId);
  if (!city) return '';
  const d = cityDefenceOf(city);
  const who = d.armies.length ? `Défendront : ${d.armies.length} armée${d.armies.length > 1 ? 's' : ''} (${formatNum(d.soldiers)} soldats) et les renforts alliés postés.` : 'Aucune armée dans la ville : seules les armées défendent.';
  return d.reserve > 0 ? `${who} ${reserveNoticeText(d.reserve)}` : who;
}
// Avertissement d'une attaque contre une ville où des soldats attendent en réserve ('' sinon) : affiché une fois par attaque
function reserveAttackWarning(attack) {
  const city = (cities || []).find(c => c.id === attack?.targetCityId);
  if (!city || cityDefenceOf(city).reserve <= 0) return '';
  return `${attack.type === 'SIEGE' ? 'Siège' : 'Attaque'} contre ${attack.targetCity || city.name} : ${attackDefenceNote(city.id)}`;
}

function renderArmies() {
  const container = document.getElementById('armies-management');
  const garrisonSummary = document.getElementById('garrison-summary');

  if (!container) return;

  // Get garrison units (units in city, not assigned to any army)
  const garrisonUnits = getGarrisonUnits();
  const cityArmies = armies.filter(a => a.cityId === currentCity?.id && !a.isGarrison);
  const maxArmies = getMaxArmies();
  const inColony = !!currentCity && !currentCity.isCapital;   // ses armées sont rattachées (E2)
  const freeColonySlots = ARMY_SLOTS.filter(n => n <= maxArmies && !cityArmies.some(a => a.slot === n)).length;
  const heroData = player?.hero;
  // le héros ne combat que joint à une armée, depuis le panneau de l'armée (décision du 29 octobre 2026) ; joint à la
  // réserve, il ne défend plus (G10)
  const heroAssignedToArmy = armies.find(a => a.heroId && a.heroId === heroData?.id);
  const heroCityName = (cities || []).find(c => c.id === heroData?.cityId)?.name;

  // Rally Point info (celle de la capitale)
  const rallyLevel = rallyPointLevel();

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
        <span class="army-count-badge"${inColony ? ` title="${escapeHtml(COLONY_ARMY_RULE)}"` : ''}>${cityArmies.length}/${maxArmies} armées${inColony ? ' rattachées' : ''}</span>
        ${forgeNoteHtml()}
      </div>
      <div class="header-right-info">
        <span class="garrison-badge-compact" title="${escapeHtml(RESERVE_NOTICE)}"><img class="ico" src="assets/images/3d/ui/city.webp" alt=""> ${formatNum(totalGarrison)} en réserve (ne défend pas)</span>
      </div>
    </div>
    ${currentCity ? cityDefenceHtml(currentCity) : ''}
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
        ${inColony ? colonyGuestsHtml(currentCity, freeColonySlots) : ''}
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
              ? `<span class="assigned-to">→ ${heroAssignedToArmy.isGarrison ? 'Réserve : il ne combat pas, joignez-le à une armée' : escapeHtml(heroAssignedToArmy.name)}${heroAssignedToArmy.cityId !== currentCity?.id ? ` <small>(${escapeHtml((cities || []).find(c => c.id === heroAssignedToArmy.cityId)?.name || '')})</small>` : ''}</span>
                 ${heroAssignedToArmy.status === 'IDLE' && heroAssignedToArmy.cityId === currentCity?.id ? `<button class="btn-unassign-small" onclick="unassignHero('${heroAssignedToArmy.id}')">Retirer</button>` : ''}`
              : heroData?.diedAt
                ? `<span class="hero-available">Tombé : ressuscitez-le au Domus</span>`
                : `<span class="hero-free">En ville${heroCityName ? ` à ${escapeHtml(heroCityName)}` : ''}, joint à aucune armée : il ne combat pas. Joignez-le à une armée (« + Ajouter héros » sur sa carte).</span>`
            }
          </div>
        </div>
        
        <!-- Réserve : soldats formés dans aucune armée, qui ne défendent pas la ville (G10) -->
        <div class="garrison-panel-compact">
          <div class="garrison-header-compact">
            <span title="${escapeHtml(RESERVE_NOTICE)}"><img class="ico" src="assets/images/3d/ui/city.webp" alt=""> Réserve (ne défend pas)</span>
            <span class="garrison-count-compact">${formatNum(totalGarrison)} unités</span>
          </div>
          ${garrisonUnits.length > 0 ? `
            <p class="hint-small reserve-notice">${resIconHtml('defense')} ${reserveNoticeText(totalGarrison)} Touchez « Composer » sur une armée de la ville pour les y mettre.</p>
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
              <p>Aucun soldat en réserve</p>
              <p class="hint-small">${inColony ? 'Pas de réserve en colonie : rattachez-y une armée de la capitale' : 'Les soldats formés arrivent ici : mettez-les dans une armée, seules les armées défendent'}</p>
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
          <p>${currentCity && !currentCity.isCapital ? 'Rattacher une armée' : 'Créer une armée'}</p>
        </div>
      </div>
    `;
  }
  
  // Existing army
  const hasHero = army.heroId === heroData?.id;
  const totalUnits = army.units?.reduce((s, u) => s + u.count, 0) || 0;
  const armyPower = army.power ?? calculateArmyPower(army);
  // rattachée à une colonie (E2) : elle la défend et y rentre ; à l'arrêt dans une autre colonie : on peut l'y rattacher
  const colony = typeof armyColonyOf === 'function' ? armyColonyOf(army) : null;
  const attachTo = typeof colonyToAttach === 'function' ? colonyToAttach(army) : null;
  const atColony = colony && army.status === 'IDLE' && (cities || []).some(c => c.id === colony.id && c.x === army.x && c.y === army.y);
  
  const statusMap = {
    'IDLE': { icon: '<img class="ico" src="assets/images/3d/ui/home.webp" alt="">', label: 'En ville', cls: 'idle' },
    'MOVING': { icon: '<img class="ico" src="assets/images/3d/ui/expedition.webp" alt="">', label: 'En route', cls: 'moving' },
    'ATTACKING': { icon: '<img class="ico" src="assets/images/3d/ui/attack.webp" alt="">', label: army.missionType === 'BREAK_SIEGE' ? 'Sortie' : 'Attaque', cls: 'attacking' },
    'BESIEGING': { icon: '<img class="ico" src="assets/images/3d/ui/attack.webp" alt="">', label: 'Siège', cls: 'attacking' },
    'RETURNING': { icon: '<img class="ico" src="assets/images/3d/ui/home.webp" alt="">', label: 'Retour', cls: 'returning' },
    'RAIDING': { icon: '<img class="ico" src="assets/images/3d/ui/bolt.webp" alt="">', label: 'Raid', cls: 'raiding' },
    'SPYING': { icon: '<img class="ico" src="assets/images/3d/ui/spy.webp" alt="">', label: 'Espionnage', cls: 'moving' },
    'TRANSPORTING': { icon: '<img class="ico" src="assets/images/3d/ui/item_crate.webp" alt="">', label: 'Transport', cls: 'moving' },
    'EXPEDITION': { icon: '<img class="ico" src="assets/images/3d/ui/expedition.webp" alt="">', label: 'Expédition', cls: 'moving' },
    'HARVESTING': { icon: '<img class="ico" src="assets/images/3d/ui/iron.webp" alt="">', label: 'Récolte', cls: 'harvesting' },
    'FOUNDING': { icon: '<img class="ico" src="assets/images/3d/ui/city.webp" alt="">', label: 'Fondation', cls: 'moving' },
    'SUPPORTING': { icon: '<img class="ico" src="assets/images/3d/ui/defense.webp" alt="">', label: 'Renfort en route', cls: 'moving' },
    'STATIONED': { icon: '<img class="ico" src="assets/images/3d/ui/defense.webp" alt="">', label: 'En renfort', cls: 'idle' },
    // armée réservée par une offre du marché : elle attend en ville avec les marchandises (11-market.js)
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
      
      ${colony ? `<div class="army-attach-row" title="${escapeHtml(COLONY_ARMY_RULE)}">${resIconHtml('defense')} Rattachée à ${escapeHtml(colony.name)} : elle la défend et y rentre</div>` : ''}

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
        ${army.status === 'IDLE' && (atColony || attachTo) ? `
          ${atColony
            ? `<button class="army-btn primary" ${totalUnits > 0 ? `onclick="sendArmyBackToCapital('${army.id}')" title="Elle quitte la colonie et reprend une place d'armée de la capitale"` : 'disabled title="Armée vide : dissolvez-la dans la colonie"'}>${resIconHtml('home')} Renvoyer à la capitale</button>`
            : `<button class="army-btn primary" onclick="attachArmyToColony('${army.id}')" title="Elle défendra ${escapeHtml(attachTo.name)} et y rentrera après chaque mission">${resIconHtml('defense')} Rattacher à ${escapeHtml(attachTo.name)}</button>`}
          <button class="army-btn icon-only" onclick="showArmyActionsMenu('${army.id}')" title="Actions">
            ${resIconHtml('settings')}
          </button>
        ` : army.status === 'IDLE' ? `
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
        ` : army.status === 'MARKET' ? `
          <button class="army-btn secondary" onclick="showTab('market'); showMarketTab('offers')" title="Annulez l'offre au marché pour libérer l'armée">${resIconHtml('market')} Voir l'offre</button>
          <span class="destination-badge">Attend en ville avec les marchandises d'une offre</span>
        ` : army.status === 'TRANSPORTING' && army.missionType === 'MARKET_DELIVERY' ? `
          <span class="destination-badge" title="Armée d'un échange du marché : elle livre puis rentre toute seule, on ne peut pas la rappeler">${resIconHtml('market')} Livraison d'un échange</span>
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
  // armée rattachée à une colonie (E2) : elle rentre à la capitale avec « Renvoyer », se dissout seulement vide ;
  // une armée à l'arrêt dans une autre de vos colonies peut lui être rattachée
  const colony = armyColonyOf(army), attachTo = colonyToAttach(army);
  const canDisband = !colony || totalUnits === 0;
  const colonyCards = (colony && army.status === 'IDLE' ? `
        <button class="action-card ${canMove ? '' : 'disabled'}" ${canMove ? `onclick="closeModal(); sendArmyBackToCapital('${armyId}')"` : 'disabled'}>
          <span class="action-icon">${resIconHtml('home')}</span>
          <span class="action-label">Renvoyer à la capitale</span>
        </button>` : '') + (attachTo ? `
        <button class="action-card" onclick="attachArmyToColony('${armyId}')">
          <span class="action-icon">${resIconHtml('defense')}</span>
          <span class="action-label">Rattacher à ${escapeHtml(attachTo.name)}</span>
        </button>` : '');
  // échanger des soldats avec une autre de vos armées au même endroit (G9)
  const partners = exchangePartners(army);
  const exchangeCard = `
        <button class="action-card ${partners.length ? '' : 'disabled'}" ${partners.length ? `onclick="openArmyExchange('${armyId}')"` : 'disabled title="Aucune autre de vos armées à l\'arrêt au même endroit"'}>
          <span class="action-icon">${resIconHtml('army')}</span>
          <span class="action-label">Échanger</span>
        </button>`;

  const modal = document.getElementById('modal');
  document.getElementById('modal-body').innerHTML = `
    <div class="army-actions-modal">
      <h3><img class="ico" src="assets/images/3d/ui/settings.webp" alt=""> Actions - ${escapeHtml(army.name)}</h3>
      ${!canMove ? `<p class="warning-text" style="color:#ff6b6b;text-align:center;margin-bottom:10px">${disabledReason}</p>` : ''}
      ${colony ? `<p class="hint-small">${resIconHtml('defense')} Rattachée à ${escapeHtml(colony.name)}. ${escapeHtml(COLONY_ARMY_RULE)}</p>` : ''}
      <div class="actions-grid">${colonyCards}${exchangeCard}
        <button class="action-card ${!canMove ? 'disabled' : ''}" ${canMove ? `onclick="closeModal(); showMoveModal('${armyId}')"` : 'disabled'}>
          <span class="action-icon"><img class="ico" src="assets/images/3d/ui/expedition.webp" alt=""></span>
          <span class="action-label">Déplacer</span>
        </button>
        <button class="action-card ${!canMove ? 'disabled' : ''}" ${canMove ? `onclick="closeModal(); showArmyMissionModal('${armyId}', 'ATTACK')"` : 'disabled'}>
          <span class="action-icon"><img class="ico" src="assets/images/3d/ui/attack.webp" alt=""></span>
          <span class="action-label">Attaquer</span>
        </button>
        <button class="action-card ${!canMove ? 'disabled' : ''}" ${canMove ? `onclick="closeModal(); showArmyMissionModal('${armyId}', 'RAID')"` : 'disabled'}>
          <span class="action-icon"><img class="ico" src="assets/images/3d/ui/bolt.webp" alt=""></span>
          <span class="action-label">Raid</span>
        </button>
        <button class="action-card danger ${canDisband ? '' : 'disabled'}" ${canDisband ? `onclick="closeModal(); confirmDisbandArmy('${armyId}')"` : 'disabled title="Une armée rattachée à une colonie se dissout vide, ou une fois revenue à la capitale"'}>
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
  if (armyColonyOf(army)) {   // rattachée à une colonie : pas de garnison où prendre ou poser des troupes (E2)
    showToast(COLONY_ARMY_RULE, 'warning');
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
          ${forgeNoteHtml()}
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
            <p>Aucun soldat en réserve</p>
            <p class="hint">Recrutez des troupes dans vos bâtiments militaires : elles arrivent dans la réserve, puis mettez-les dans une armée pour qu'elles défendent.</p>
          </div>
        `}
      </div>
      
      <!-- Footer -->
      <div class="comp-footer">
        <div class="comp-summary">
          <span class="summary-item" id="comp-total-units">
            <strong>${army.units?.reduce((s, u) => s + u.count, 0) || 0}</strong> unités dans l'armée
          </span>
          <span class="summary-item" id="comp-garrison-left" title="${escapeHtml(RESERVE_NOTICE)}">
            <strong>${garrisonUnits.reduce((s, u) => s + u.count, 0)}</strong> en réserve (ne défend pas)
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
          <span class="available-label">Réserve :</span>
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
  garrisonLeftSpan.innerHTML = `<strong>${totalGarrison}</strong> en réserve (ne défend pas)`;
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

// Réserve de la ville affichée (soldats dans aucune armée) : les unités de son armée « Garnison », qui ne défend plus la
// ville (G10). Une colonie n'en a pas (décision du 30 octobre 2026 : pas de troupes propres en colonie, toute unité formée
// arrive dans la capitale) ; ses armées ne sont jamais comptées dans la réserve
function getGarrisonUnits() {
  return armies.find(a => a.cityId === currentCity?.id && a.isGarrison)?.units || [];
}

// Place libre d'une colonie touchée : pas de troupes propres en colonie, on y rattache une armée posée là (E2)
function openColonyAttach() {
  if (currentCity?.isWonder) { showToast('La Ville Merveille n\'est pas une colonie : ses défenseurs restent des armées de la capitale', 'info'); return; }
  showModal('Rattacher une armée', colonyGuestsHtml(currentCity, 1));
}

// Create new army
async function createArmy(slotNum) {
  if (currentCity && !currentCity.isCapital) { openColonyAttach(); return; }   // colonie : on rattache, on ne crée pas
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
      <p>Ses soldats retournent dans la réserve de sa ville, qui ne défend pas : mettez-les ensuite dans une autre armée.</p>
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

// Règles du raid du serveur, reprises pour les textes (config.combat, config.hideout) : le combat passe par le moteur de
// bataille et s'arrête dès qu'un camp a perdu stopLossPct % de ses soldats (G3) ; vainqueur, le raid emporte jusqu'à
// lootPctOfCarry % de ce que portent ses soldats survivants (décision du 2 novembre 2026 (deuxième simulation de 200 jours),
// G4 ; 30 % avant), pris sur au plus stealPctOutsideHideout % de ce qui dépasse la cachette ; un raid par jour sur une ville
const RAID_RULES = { stopLossPct: 30, lootPctOfCarry: 100, stealPctOutsideHideout: 50, cooldownHours: 24 };
function raidRuleText() {
  const R = RAID_RULES;
  const carry = R.lootPctOfCarry >= 100 ? 'tout ce que ses soldats survivants peuvent porter' : `${R.lootPctOfCarry} % de ce que ses soldats survivants peuvent porter`;
  return `Un raid pille sans assiéger : le combat s'arrête dès qu'un camp a perdu ${R.stopLossPct} % de ses soldats. Vainqueur, il emporte jusqu'à ${carry}, pris sur ${R.stealPctOutsideHideout} % au plus de ce qui dépasse la cachette de la ville. Un seul raid toutes les ${R.cooldownHours} h de votre part sur une même ville. Seules les armées de la ville se défendent : sa réserve ne combat pas.`;
}

// Attaque ou raid d'une ville par ses coordonnées, pour n'importe quelle armée à l'arrêt (même envoi que l'onglet Envoyer)
function showArmyMissionModal(armyId, mission) {
  const raid = mission === 'RAID';
  document.getElementById('modal-body').innerHTML = `
    <h3>${raid ? 'Raid sur une ville' : 'Attaquer une ville'}</h3>
    ${raid ? `<p class="diplo-help">${raidRuleText()}</p>` : ''}
    <p style="margin-bottom:10px;color:var(--text-muted)">Coordonnées de la ville cible</p>
    <input type="number" id="mission-x" placeholder="X" style="width:48%;display:inline-block">
    <input type="number" id="mission-y" placeholder="Y" style="width:48%;display:inline-block">
    ${raid
      ? `<button onclick="sendArmyMission('${armyId}', 'RAID')" class="btn" style="background:linear-gradient(180deg,orange,#c70)">Lancer le raid</button>`
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


// ========== ÉCHANGER DES SOLDATS (décision du 2 novembre 2026, deuxième simulation de 200 jours, G9) ==========
// Deux de vos armées au même endroit (même ville ou même case), toutes deux à l'arrêt, ou toutes deux en garnison dans le
// même Bastion, s'échangent des soldats dans les deux sens : POST /api/army/:id/exchange { toArmyId, units, back } (`units`
// passe de l'armée de gauche à celle de droite, `back` dans l'autre sens, en une fois). Ni la réserve, ni une armée réservée
// par le marché, ni une armée prise dans un combat. Le héros reste dans son armée. Une armée vidée dans sa ville y reste (on
// peut l'y dissoudre) ; vidée ailleurs, elle rentre aussitôt chez elle, sauf celle du héros, qui doit garder un soldat. Une
// armée de la capitale posée dans une colonie remplit ainsi la garde rattachée sans place d'armée à la capitale (E2).
// État de l'écran : les deux armées choisies et, pour chaque unité, les soldats qui finiront à gauche
let armyExchange = { fromId: null, toId: null, left: {}, busy: false };
// Endroit où une armée peut échanger (null sinon) : la case d'une armée à l'arrêt, ou son Bastion pour une garnison
function exchangePlaceKey(army) {
  if (!army || army.isGarrison || army.claimedAt) return null;
  if (army.status === 'IDLE') return `${army.x}:${army.y}`;
  if (army.status === 'STATIONED' && army.targetBastionId) return `B:${army.targetBastionId}`;
  return null;
}
// Vos autres armées au même endroit qu'une armée
function exchangePartners(army) {
  const key = exchangePlaceKey(army);
  return key ? (armies || []).filter(a => a.id !== army.id && exchangePlaceKey(a) === key) : [];
}
// Ville de l'armée (celle où elle rentre) et si elle s'y tient (isHome du serveur)
const exchangeHomeOf = (army) => (cities || []).find(c => c.id === army?.cityId) || army?.city || null;
function isArmyHome(army) {
  const home = exchangeHomeOf(army);
  return !!home && army.x === home.x && army.y === home.y;
}
// Nom de l'endroit : la garnison du Bastion, votre ville, ou la case
function exchangePlaceLabel(army) {
  if (army.status === 'STATIONED') return `Garnison du Bastion (${army.x}, ${army.y})`;
  const city = (cities || []).find(c => c.x === army.x && c.y === army.y);
  return city ? city.name : `Case (${army.x}, ${army.y})`;
}
// Endroits où au moins deux de vos armées peuvent échanger : [{ key, label, armies }]
function exchangePlaces() {
  const groups = new Map();
  for (const a of armies || []) {
    const key = exchangePlaceKey(a);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, { key, label: exchangePlaceLabel(a), armies: [] });
    groups.get(key).armies.push(a);
  }
  return [...groups.values()].filter(g => g.armies.length >= 2);
}
// Une ligne par unité de l'une ou l'autre armée : ce qu'ont la gauche (a) et la droite (b), triée comme la composition
function exchangeRows(from, to) {
  const count = (army, key) => (army?.units || []).find(u => u.unitKey === key)?.count || 0;
  const keys = [...new Set([...(from?.units || []), ...(to?.units || [])].filter(u => u.count > 0).map(u => u.unitKey))];
  const classOrder = { INFANTRY: 0, ARCHER: 1, CAVALRY: 2, SIEGE: 3 }, tierOrder = { base: 0, intermediate: 1, elite: 2, siege: 3 };
  return keys.map(unitKey => {
    const unit = (unitsData || []).find(u => u.key === unitKey);
    const a = count(from, unitKey), b = count(to, unitKey);
    return { unitKey, unit, a, b, total: a + b };
  }).sort((x, y) => (classOrder[x.unit?.class] ?? 99) - (classOrder[y.unit?.class] ?? 99) || (tierOrder[x.unit?.tier] ?? 99) - (tierOrder[y.unit?.tier] ?? 99));
}
// Soldats d'une unité qui finiront à gauche (le choix du joueur, borné ; sinon rien ne bouge)
const exchangeKeep = (row, left) => Math.max(0, Math.min(row.total, Math.floor(Number(left?.[row.unitKey] ?? row.a)) || 0));
// Ce que donnerait l'échange, comme le serveur le vérifie : la requête, le refus éventuel, les soldats déplacés et ce qui
// arrive à une armée vidée
function exchangePreview(from, to, left) {
  const units = [], back = [];
  for (const r of exchangeRows(from, to)) {
    const keep = exchangeKeep(r, left);
    if (keep < r.a) units.push({ unitKey: r.unitKey, count: r.a - keep });
    else if (keep > r.a) back.push({ unitKey: r.unitKey, count: keep - r.a });
  }
  const sum = (list) => list.reduce((t, l) => t + l.count, 0);
  const gave = sum(units), took = sum(back);
  const request = { toArmyId: to?.id, units, back };
  const out = { request, gave, took, refusal: null, notes: [] };
  if (!from || !to) { out.refusal = 'Choisissez deux armées'; return out; }
  if (from.id === to.id) { out.refusal = 'Choisissez deux armées différentes'; return out; }
  if (from.isGarrison || to.isGarrison) { out.refusal = 'Les soldats en réserve ne sont pas une armée : ajoutez-les depuis la composition d\'une armée de la capitale'; return out; }
  const market = [from, to].find(a => a.status === 'MARKET');
  if (market) { out.refusal = `${market.name} attend avec les marchandises d'une offre du marché : annulez l'offre pour la libérer`; return out; }
  if (!exchangePlaceKey(from) || exchangePlaceKey(from) !== exchangePlaceKey(to)) { out.refusal = 'Les deux armées doivent être à l\'arrêt au même endroit (même ville ou même case), ou toutes deux en garnison dans le même Bastion'; return out; }
  if (!gave && !took) { out.refusal = 'Choisissez au moins un soldat à échanger'; return out; }
  const after = [[from, armySoldiers(from) - gave + took], [to, armySoldiers(to) + gave - took]];
  for (const [a, n] of after) {
    if (n > 0) continue;
    const home = exchangeHomeOf(a);
    if (a.heroId && !isArmyHome(a)) { out.refusal = `Le héros reste avec son armée : laissez au moins un soldat à ${a.name} pour qu'elle puisse rentrer`; return out; }
    out.notes.push(isArmyHome(a)
      ? `${a.name} n'aura plus de soldats : elle reste à ${home.name}, où vous pourrez la dissoudre.`
      : `${a.name} n'aura plus de soldats : elle rentrera aussitôt à ${home?.name || 'sa ville'}${a.status === 'STATIONED' ? ' et libérera sa place au Bastion' : ''}.`);
  }
  return out;
}

// Onglet Armée › Échanger
function renderArmyExchange() {
  const container = document.getElementById('armies-management');
  if (!container) return;
  const intro = `<div class="column-header"><h3>${resIconHtml('army')} Échanger des soldats</h3></div>
    <p class="hint-small">Choisissez deux de vos armées au même endroit (même ville ou même case), toutes deux à l'arrêt, ou toutes deux en garnison dans le même Bastion, puis faites passer des soldats d'une armée à l'autre, dans un sens ou dans l'autre. Le héros reste dans son armée. Une armée de la capitale posée dans une colonie peut ainsi renforcer la garde rattachée, sans place d'armée à la capitale.</p>`;
  const places = exchangePlaces();
  if (!places.length) {
    armyExchange = { fromId: null, toId: null, left: {}, busy: false };
    container.innerHTML = `<div class="army-exchange">${intro}<p class="empty-state">Aucun endroit où deux de vos armées se tiennent ensemble. Amenez deux armées au même endroit (« Déplacer »), par exemple une armée de la capitale dans une colonie, à côté de sa garde, puis revenez ici.</p></div>`;
    return;
  }
  // armées choisies : celles de l'écran si elles sont encore ensemble, sinon les deux premières du premier endroit
  let from = armies.find(a => a.id === armyExchange.fromId), to = armies.find(a => a.id === armyExchange.toId);
  const place = places.find(p => p.armies.includes(from)) || places[0];
  if (!place.armies.includes(from)) from = place.armies[0];
  if (!place.armies.includes(to) || to === from) to = place.armies.find(a => a !== from);
  if (armyExchange.fromId !== from.id || armyExchange.toId !== to.id) armyExchange = { fromId: from.id, toId: to.id, left: {}, busy: false };
  const preview = exchangePreview(from, to, armyExchange.left);
  const option = (a, selected) => `<option value="${a.id}" ${a.id === selected ? 'selected' : ''}>${escapeHtml(a.name)} (${formatNum(armySoldiers(a))} soldats${a.heroId ? ', héros' : ''})</option>`;
  const rows = exchangeRows(from, to).map(r => {
    const keep = exchangeKeep(r, armyExchange.left), name = r.unit?.name || r.unitKey;
    return `<div class="exchange-row" data-unit="${r.unitKey}" style="display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:6px 0;border-bottom:1px solid rgba(0,0,0,.12)">
        <span class="comp-unit-name" style="flex:1 1 140px">${unitIconHtml(r.unitKey, 'unit-ico-sm')} ${escapeHtml(name)} ${infoBtnHtml('unit', r.unitKey, 'info-btn-sm')}</span>
        <input type="number" class="comp-input" style="width:72px" min="0" max="${r.total}" value="${keep}" aria-label="${escapeHtml(name)} dans ${escapeHtml(from.name)}" onchange="setExchangeLeft('${r.unitKey}', this.value)">
        <span class="exchange-arrows">
          <button type="button" class="comp-btn-adjust" onclick="shiftExchange('${r.unitKey}', -${r.total})" title="Tout dans ${escapeHtml(from.name)}">«</button>
          <button type="button" class="comp-btn-adjust" onclick="shiftExchange('${r.unitKey}', -1)" title="Un de plus dans ${escapeHtml(from.name)}">‹</button>
          <button type="button" class="comp-btn-adjust" onclick="shiftExchange('${r.unitKey}', 1)" title="Un de plus dans ${escapeHtml(to.name)}">›</button>
          <button type="button" class="comp-btn-adjust" onclick="shiftExchange('${r.unitKey}', ${r.total})" title="Tout dans ${escapeHtml(to.name)}">»</button>
        </span>
        <strong class="exchange-right" style="min-width:56px;text-align:right">${formatNum(r.total - keep)}</strong>
      </div>`;
  }).join('');
  const moves = [preview.gave ? `${formatNum(preview.gave)} soldat${preview.gave > 1 ? 's' : ''} de ${escapeHtml(from.name)} vers ${escapeHtml(to.name)}` : '', preview.took ? `${formatNum(preview.took)} soldat${preview.took > 1 ? 's' : ''} de ${escapeHtml(to.name)} vers ${escapeHtml(from.name)}` : ''].filter(Boolean);
  const nothing = !preview.gave && !preview.took;
  container.innerHTML = `<div class="army-exchange">${intro}
      <div class="form-row"><label for="exchange-place">Endroit</label>
        <select id="exchange-place" onchange="pickExchangePlace(this.value)">${places.map(p => `<option value="${escapeHtml(p.key)}" ${p === place ? 'selected' : ''}>${escapeHtml(p.label)} · ${p.armies.length} armées</option>`).join('')}</select></div>
      <div class="exchange-armies" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <label>À gauche <select id="exchange-from" onchange="pickExchangeArmy('from', this.value)">${place.armies.map(a => option(a, from.id)).join('')}</select></label>
        <label>À droite <select id="exchange-to" onchange="pickExchangeArmy('to', this.value)">${place.armies.filter(a => a !== from).map(a => option(a, to.id)).join('')}</select></label>
      </div>
      <div class="exchange-head" style="display:flex;justify-content:space-between;font-size:12px;margin-top:8px"><span>Unité · soldats dans ${escapeHtml(from.name)}</span><span>dans ${escapeHtml(to.name)}</span></div>
      <div class="exchange-rows">${rows || '<p class="empty-state">Ces deux armées n\'ont aucun soldat.</p>'}</div>
      <p class="exchange-summary">${nothing ? 'Aucun soldat ne change d\'armée : utilisez les flèches ou tapez combien en garder à gauche.' : `Passent : ${moves.join(' ; ')}.`}</p>
      ${!nothing && preview.refusal ? `<p class="warning-text">${escapeHtml(preview.refusal)}</p>` : ''}
      ${preview.notes.map(n => `<p class="hint-small">${escapeHtml(n)}</p>`).join('')}
      <div class="modal-actions">
        <button type="button" class="btn btn-secondary" onclick="resetArmyExchange()" ${nothing ? 'disabled' : ''}>Remettre comme avant</button>
        <button type="button" class="btn btn-primary" onclick="submitArmyExchange()" ${preview.refusal || armyExchange.busy ? 'disabled' : ''}>${resIconHtml('army')} Échanger</button>
      </div>
    </div>`;
}
// Ouvre l'écran avec cette armée à gauche et un partenaire (donné, ou le premier au même endroit) à droite
function openArmyExchange(armyId, partnerId) {
  const army = (armies || []).find(a => a.id === armyId);
  const partner = (armies || []).find(a => a.id === partnerId) || exchangePartners(army)[0];
  armyExchange = { fromId: armyId, toId: partner?.id || null, left: {}, busy: false };
  closeModal();
  if (!document.getElementById('tab-army')?.classList.contains('active')) showTab('army');
  showArmyTab('exchange');
}
function pickExchangePlace(key) {
  const group = exchangePlaces().find(p => p.key === key);
  if (group) armyExchange = { fromId: group.armies[0].id, toId: group.armies[1].id, left: {}, busy: false };
  renderArmyExchange();
}
function pickExchangeArmy(side, armyId) {
  const other = side === 'from' ? armyExchange.toId : armyExchange.fromId;
  if (side === 'from') armyExchange = { fromId: armyId, toId: other === armyId ? null : other, left: {}, busy: false };
  else armyExchange = { ...armyExchange, toId: armyId, left: {} };
  renderArmyExchange();
}
// Soldats d'une unité gardés à gauche (saisie), ou `n` soldats passés à droite (n > 0) ou à gauche (n < 0)
function setExchangeLeft(unitKey, value) {
  armyExchange.left[unitKey] = Math.max(0, Math.floor(Number(value)) || 0);
  renderArmyExchange();
}
function shiftExchange(unitKey, n) {
  const from = armies.find(a => a.id === armyExchange.fromId), to = armies.find(a => a.id === armyExchange.toId);
  const row = exchangeRows(from, to).find(r => r.unitKey === unitKey);
  if (!row) return;
  armyExchange.left[unitKey] = Math.max(0, Math.min(row.total, exchangeKeep(row, armyExchange.left) - n));
  renderArmyExchange();
}
function resetArmyExchange() {
  armyExchange.left = {};
  renderArmyExchange();
}
async function submitArmyExchange() {
  if (armyExchange.busy) return;
  const from = armies.find(a => a.id === armyExchange.fromId), to = armies.find(a => a.id === armyExchange.toId);
  const preview = exchangePreview(from, to, armyExchange.left);
  if (preview.refusal) { showToast(preview.refusal, 'error'); return; }
  armyExchange.busy = true;
  renderArmyExchange();
  try {
    const res = await fetch(`${API}/api/army/${from.id}/exchange`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(preview.request)
    });
    const data = await res.json().catch(() => ({}));
    showToast(res.ok ? (data.message || 'Échange fait') : (data.error || 'Échange impossible'), res.ok ? 'success' : 'error');
    if (res.ok) armyExchange.left = {};
  } catch (e) {
    showToast('Erreur réseau', 'error');
  }
  armyExchange.busy = false;
  await loadArmies();
  if (document.querySelector('#armies-management .army-exchange')) renderArmyExchange();   // l'écran est encore ouvert
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
  // sa propre ville : seules ses armées défendent, pas la réserve (G10)
  const ownCity = (cities || []).find(c => c.id === siege.cityId);
  document.getElementById('modal-body').innerHTML = `
    <div class="siege-modal">
      <h3>${resIconHtml('attack')} Siège de ${escapeHtml(siege.cityName)}</h3>
      ${wall}
      ${ownCity ? cityDefenceHtml(ownCity) : ''}
      <p>Vies de la ville : <strong>${lives} / ${livesTotal}</strong> avant la chute (${siege.fate === 'RELOCATED' ? 'la capitale serait déplacée près du bord de la carte' : 'la ville serait détruite'}). Chaque combat gagné par l'attaquant ôte une vie, la même part des PV du mur et pille un quart du stock hors cachette (dans la limite de ce que l'armée porte) ; tout remonte en 48 h.</p>
      <ul class="siege-camp" style="margin:6px 0 10px;padding-left:18px">${siege.besiegers.map(b => `<li><strong>${escapeHtml(b.owner || '?')}</strong>, ${escapeHtml(b.name || 'Armée')} : ${formatNum(b.soldiers)} soldats dont ${formatNum(b.engines)} engins de siège${b.assaultAt ? ` · combat dans <strong>${siegeTimeLeft(new Date(b.assaultAt) - now)}</strong>` : ''}</li>`).join('')}</ul>
      <p style="font-size:12px;opacity:.85">Le camp attend 1 h avant le combat ; la ville vit normalement mais ses armées ne sortent que pour attaquer le camp. N'importe quel joueur peut attaquer le camp (sauf ceux de son alliance ou d'une alliance alliée) : il combat tous les camps à la fois, et s'il gagne il reste devant la ville pour la garder.</p>
      ${siege.canBreak ? (ready.length ? `
        <label for="break-army" style="display:block;margin-top:8px">Armée envoyée</label>
        <select id="break-army">${ready.map(a => `<option value="${a.id}">${escapeHtml(a.name || 'Armée')} (force ${formatNum(a.power ?? calculateArmyPower(a))})</option>`).join('')}</select>
        <button class="btn btn-danger" onclick="confirmBreakSiege('${siege.cityId}')">${resIconHtml('attack')} Attaquer l'armée qui assiège</button>
      ` : idle.length ? '<p class="warning-text">Vos armées disponibles ne peuvent pas attaquer ce camp : il est de votre alliance ou d\'une alliance alliée.</p>'
        : `<p class="warning-text">Aucune armée disponible : mettez vos soldats en réserve dans une armée (onglet Armée › Composer). ${RESERVE_NOTICE}</p>`) : ''}
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
