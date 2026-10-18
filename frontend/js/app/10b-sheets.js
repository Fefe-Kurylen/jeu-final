// ============================================================
// 10b-sheets.js — Fiches d'information des unités et des bâtiments, bouton « i »
// Portée globale partagée (ordre de chargement dans index.html). Les règles affichées sont celles du serveur :
// routes/cities.js (coûts, temps, prérequis de recrutement), services/combatService.js (triangle, paliers),
// utils/buildingEffects.js (effets des bâtiments), config (entretien, vitesse de marche).
// ============================================================

const SHEET_CLASS_NAMES = { INFANTRY: 'Infanterie', ARCHER: 'Archers', CAVALRY: 'Cavalerie', SIEGE: 'Siège' };
const SHEET_TIER_NAMES = { base: 'Base', intermediate: 'Intermédiaire', elite: 'Élite', siege: 'Siège' };
const SHEET_FACTION_NAMES = { ROME: 'Rome', GAUL: 'Gaule', GREEK: 'Grèce', EGYPT: 'Égypte', HUN: 'Huns', SULTAN: 'Sultanat' };
const SHEET_CATEGORY_NAMES = { BASE: 'Infrastructure', INTERMEDIATE: 'Militaire', ADVANCED: 'Avancé', FACTION: 'Bâtiment de faction' };
// Règles du serveur reprises à l'identique (config/index.js, combatService.js, routes/cities.js, utils/buildingEffects.js)
const SHEET_RULES = {
  beats: { INFANTRY: 'CAVALRY', CAVALRY: 'ARCHER', ARCHER: 'INFANTRY' },
  triangleBonusPct: 20,
  tierCoeff: { base: 1, intermediate: 1.25, elite: 1.55, siege: 0.75 },
  upkeep: { base: 5, intermediate: 10, elite: 15, siege: 15 },
  siegeWallDamage: 40,
  tilesPerHourFactor: 2.4, // 1 case en 30 s à vitesse 50 → 2,4 × vitesse cases par heure (calculations.js)
  trainBuildings: { INFANTRY: ['BARRACKS', 'GREAT_BARRACKS'], ARCHER: ['BARRACKS', 'GREAT_BARRACKS'], CAVALRY: ['STABLE', 'GREAT_STABLE'], SIEGE: ['WORKSHOP'] },
  siegeWorkshopLevel: 5,
  trainReductionMaxPct: 60
};
const sheetKey = (k) => String(k || '').replace(/[^A-Za-z0-9_]/g, '');
const sheetUnits = () => (typeof unitsData !== 'undefined' && Array.isArray(unitsData) ? unitsData : []);
const sheetBuildings = () => (typeof buildingsData !== 'undefined' && Array.isArray(buildingsData) ? buildingsData : []);

// Bouton « i » : ouvre la fiche sans déclencher l'action de la carte qui le contient
function infoBtnHtml(kind, key, cls = '') {
  const k = sheetKey(key);
  const fn = kind === 'unit' ? 'showUnitInfoModal' : kind === 'tech' ? 'showTechInfoModal' : 'showBuildingInfoModal';
  const name = kind === 'unit' ? getUnitName(k) : kind === 'tech' ? (typeof techByKey === 'function' && techByKey(k)?.name) || k : getBuildingName(k);
  return `<button type="button" class="info-btn ${cls}" onclick="event.stopPropagation(); ${fn}('${k}')" title="Fiche : ${escapeHtml(name)}" aria-label="Informations sur ${escapeHtml(name)}">i</button>`;
}

function openSheetModal(title, html) {
  const modal = document.getElementById('modal');
  const body = document.getElementById('modal-body');
  if (!modal || !body) return;
  const titleEl = document.getElementById('modal-title');
  const footer = document.getElementById('modal-footer');
  if (titleEl) titleEl.textContent = title;
  if (footer) footer.innerHTML = '';
  body.innerHTML = html;
  body.scrollTop = 0;
  modal.style.display = 'flex';
}

const SHEET_RES = ['wood', 'stone', 'iron', 'food'];
const SHEET_MAP_UNIT = { INFANTRY: 'hoplite', ARCHER: 'archer', CAVALRY: 'cavalry', SIEGE: 'catapult' };
// Aperçu visuel d'un bâtiment ou d'un champ : grande image du palier concerné et les trois paliers (niveaux 1-6, 7-13, 14-20)
function sheetBuildingGallery(key, level, isField) {
  const url = (lvl) => isField ? fieldSpriteUrl(key, Math.max(1, lvl)) : buildingSpriteUrl(key, Math.max(1, lvl));
  const tiers = [[1, 'Niv. 1-6'], [10, 'Niv. 7-13'], [20, 'Niv. 14-20']];
  const cur = level <= 0 ? 1 : level <= 6 ? 1 : level <= 13 ? 10 : 20;
  return `<div class="sheet-gallery">
    <div class="sheet-gallery-main"><img id="sheet-gallery-main" class="sheet-gallery-img" src="${url(cur)}" alt=""></div>
    <div class="sheet-tiers">${tiers.map(([lvl, label]) => `<button type="button" class="sheet-tier${lvl === cur ? ' current' : ''}" onclick="sheetGalleryShow(this, '${url(lvl)}')" title="${label}"><img src="${url(lvl)}" alt=""><span>${label}</span></button>`).join('')}</div>
  </div>`;
}
function sheetGalleryShow(btn, src) {
  const main = document.getElementById('sheet-gallery-main');
  if (main) main.src = src;
  btn.parentElement.querySelectorAll('.sheet-tier').forEach(b => b.classList.toggle('current', b === btn));
}
// Aperçu d'une unité : figurine en pied, jeton des listes et marqueur tel qu'il marche sur la carte
function sheetUnitGallery(unit) {
  const mapName = SHEET_MAP_UNIT[unit.class] || 'hoplite';
  const mapUrl = `assets/images/3d/map/units/${mapName}_${unit.faction}.webp`;
  return `<div class="sheet-gallery unit">
    <div class="sheet-gallery-main">${unitFigureHtml(unit.key, 'sheet-gallery-img unit-figure', unit.name)}</div>
    <div class="sheet-tiers">
      <span class="sheet-tier static">${unitIconHtml(unit.key, 'unit-ico-lg', unit.name)}<span>Jeton</span></span>
      <span class="sheet-tier static"><img src="${mapUrl}" alt="" onerror="this.style.display='none'"><span>Sur la carte</span></span>
    </div>
  </div>`;
}
// « Voir dans la ville » : ferme la fiche, affiche la ville, recentre sur le bâtiment et ouvre sa bulle
function locateBuildingInCity(key) {
  const b = key === 'MAIN_HALL' ? { slot: 0 } : (currentCity?.buildings || []).filter(x => x.key === key).sort((a, c) => c.level - a.level)[0];
  if (!b) { showToast('Ce bâtiment n\'est pas construit dans cette ville', 'info'); return; }
  closeModal();
  if (typeof closeBuildPanel === 'function') closeBuildPanel();
  showTab('city');
  setTimeout(() => { if (typeof focusCitySlot === 'function') focusCitySlot(b.slot); }, 60);
}
function sheetCostHtml(cost, city) {
  return SHEET_RES.map(r => `<span class="sheet-cost${city && (city[r] || 0) < (cost[r] || 0) ? ' missing' : ''}">${resIconHtml(r)} ${formatNum(cost[r] || 0)}</span>`).join('');
}
const sheetKv = (k, v) => `<div class="sheet-kv"><span class="k">${k}</span><span class="v">${v}</span></div>`;

// ========== UNITÉS ==========
// Bâtiment d'entraînement et niveau exigé pour ce palier (mêmes seuils que routes/cities.js : données des bâtiments)
function unitSheetRequirement(unit) {
  const keys = SHEET_RULES.trainBuildings[unit.class] || ['BARRACKS'];
  const fx = sheetBuildings().find(b => b.key === keys[0])?.effects || {};
  let level = fx.unlockBaseTier || 1;
  if (unit.class === 'SIEGE') level = SHEET_RULES.siegeWorkshopLevel;
  else if (unit.tier === 'intermediate') level = fx.unlockIntermediateTier || 7;
  else if (unit.tier === 'elite') level = fx.unlockEliteTier || 15;
  const inCity = (currentCity?.buildings || []).filter(b => keys.includes(b.key));
  const building = inCity.reduce((best, b) => (b.level > (best?.level || 0) ? b : best), null);
  return { keys, level, building, ok: !!building && building.level >= level };
}

// Temps de formation d'une unité dans la ville courante (réductions des bâtiments d'entraînement, max 60 %)
function unitTrainTimeInCity(unit) {
  const keys = SHEET_RULES.trainBuildings[unit.class] || ['BARRACKS'];
  let pct = 0;
  for (const b of (currentCity?.buildings || [])) {
    if (!keys.includes(b.key)) continue;
    pct += b.level * (sheetBuildings().find(d => d.key === b.key)?.effects?.trainTimeReductionPctPerLevel || 0);
  }
  pct = Math.min(SHEET_RULES.trainReductionMaxPct, pct);
  const base = unit.recruitTimeSec || 360;
  // Entraînement (technologie) : −1 % par niveau, après les bâtiments, comme sur le serveur
  const techPct = typeof techPctClient === 'function' ? techPctClient('trainTimeReductionPct') : 0;
  return { pct, techPct, base, seconds: Math.max(1, Math.round(base * (1 - pct / 100) * Math.max(0, 1 - techPct / 100))) };
}

// Alias historique (panneau de recrutement)
function showUnitStatsPopup(unitKey) { showUnitInfoModal(unitKey); }

function showUnitInfoModal(unitKey) {
  const unit = sheetUnits().find(u => u.key === unitKey);
  if (!unit) { showToast('Unité non trouvée', 'error'); return; }
  const s = unit.stats || {};
  const attack = s.attack || 0, defense = s.defense || 0, endurance = s.endurance || 0, speed = s.speed || 0, transport = s.transport || s.carry || 0;
  const tierColor = TIER_COLORS[unit.tier] || '#888';
  const coeff = SHEET_RULES.tierCoeff[unit.tier] || 1;
  const power = Math.round((attack + defense) * coeff);
  const beats = SHEET_RULES.beats[unit.class];
  const beatenBy = Object.keys(SHEET_RULES.beats).find(k => SHEET_RULES.beats[k] === unit.class);
  const req = unitSheetRequirement(unit);
  const train = unitTrainTimeInCity(unit);
  const cost = unit.recruitCost || { wood: 0, stone: 0, iron: 0, food: 0 };
  const upkeep = SHEET_RULES.upkeep[unit.tier] || 5;
  const mine = !player?.faction || player.faction === unit.faction;
  const reqName = req.keys.map(k => getBuildingName(k)).join(' ou ');
  const pct = SHEET_RULES.triangleBonusPct;

  let status = '', action = '';
  if (!mine) {
    status = `<p class="sheet-status muted">Unité de ${SHEET_FACTION_NAMES[unit.faction] || unit.faction} : votre civilisation ne peut pas la recruter.</p>`;
  } else if (currentCity) {
    if (req.ok) {
      status = `<p class="sheet-status ok">Recrutable à ${escapeHtml(currentCity.name || 'votre ville')} — ${getBuildingName(req.building.key)} niveau ${req.building.level}.</p>`;
      if (typeof openUnitRecruitModal === 'function') action = `<button type="button" class="btn-primary" onclick="openUnitRecruitModal('${sheetKey(unit.key)}', '${sheetKey(req.building.key)}')">Recruter</button>`;
      action = `<button type="button" class="btn-secondary" onclick="locateBuildingInCity('${sheetKey(req.building.key)}')">Voir ${escapeHtml(getBuildingName(req.building.key))} dans la ville</button>` + action;
    } else if (req.building) {
      status = `<p class="sheet-status warn">${getBuildingName(req.building.key)} niveau ${req.level} requis (actuellement niveau ${req.building.level}).</p>`;
      action = `<button type="button" class="btn-secondary" onclick="locateBuildingInCity('${sheetKey(req.building.key)}')">Voir ${escapeHtml(getBuildingName(req.building.key))} dans la ville</button>`;
    } else {
      status = `<p class="sheet-status warn">Construisez ${reqName} (niveau ${req.level}) pour recruter cette unité.</p>`;
    }
  }

  const bar = (label, icon, value, cls) => `
    <div class="stat-bar-row">
      <span class="stat-icon">${icon}</span>
      <span class="stat-label">${label}</span>
      <div class="stat-bar-container"><div class="stat-bar ${cls}" style="width: ${Math.min(100, value)}%"></div></div>
      <span class="stat-value">${value}</span>
    </div>`;

  const html = `
    <div class="sheet unit-sheet">
      <div class="sheet-head" style="--tier: ${tierColor}">
        <div class="sheet-title">
          <h3>${escapeHtml(unit.name)}</h3>
          <div class="sheet-badges">
            <span class="sheet-badge tier" style="background: ${tierColor}">${SHEET_TIER_NAMES[unit.tier] || unit.tier}</span>
            <span class="sheet-badge">${SHEET_CLASS_NAMES[unit.class] || unit.class}</span>
            <span class="sheet-badge">${SHEET_FACTION_NAMES[unit.faction] || unit.faction}</span>
          </div>
          ${unit.description ? `<p class="sheet-desc">${escapeHtml(unit.description)}</p>` : ''}
        </div>
      </div>
      ${sheetUnitGallery(unit)}

      <div class="sheet-section">
        <h4>${resIconHtml('stats')} Statistiques</h4>
        <div class="unit-stats-bars">
          ${bar('Attaque', resIconHtml('attack'), attack, 'attack')}
          ${bar('Défense', resIconHtml('defense'), defense, 'defense')}
          ${bar('Endurance', resIconHtml('endurance'), endurance, 'endurance')}
          ${bar('Vitesse', resIconHtml('expedition'), speed, 'speed')}
          ${bar('Transport', resIconHtml('item_crate'), transport, 'transport')}
        </div>
        <div class="sheet-grid">
          ${sheetKv('Puissance par unité', `${power} <small>(attaque + défense) × ${coeff}</small>`)}
          ${sheetKv('Marche', `≈ ${Math.round(speed * SHEET_RULES.tilesPerHourFactor)} cases/h <small>l'armée va à la vitesse de son unité la plus lente</small>`)}
          ${sheetKv('Butin transporté', `${transport} <small>ressources par unité</small>`)}
          ${sheetKv('Entretien', `${upkeep} <small>céréales par heure</small>`)}
        </div>
      </div>

      <div class="sheet-section">
        <h4>${resIconHtml('attack')} Au combat</h4>
        <div class="sheet-matchups">
          ${beats ? `<div class="sheet-matchup strong"><span class="mk">Fort contre</span> ${unitIconHtml(beats, 'unit-ico-sm')} <b>${SHEET_CLASS_NAMES[beats]}</b><small>+${pct} % de dégâts infligés à cette classe</small></div>` : ''}
          ${beatenBy ? `<div class="sheet-matchup weak"><span class="mk">Vulnérable face à</span> ${unitIconHtml(beatenBy, 'unit-ico-sm')} <b>${SHEET_CLASS_NAMES[beatenBy]}</b><small>+${pct} % de dégâts subis de cette classe</small></div>` : ''}
          ${unit.class === 'SIEGE' ? `<div class="sheet-matchup siege"><span class="mk">Siège</span> <b>Abat la muraille</b><small>${SHEET_RULES.siegeWallDamage} points de mur par engin et par assaut ; pris pour cible en dernier, inutile sans escorte.</small></div>` : ''}
          ${unit.tier === 'elite' ? `<div class="sheet-matchup"><span class="mk">Ciblage</span> <b>Visée en premier</b><small>L'ennemi concentre ses coups sur les unités d'élite, puis intermédiaires, de base, et enfin les engins.</small></div>` : ''}
        </div>
      </div>

      <div class="sheet-section">
        <h4>${resIconHtml('recruit')} Recrutement</h4>
        <div class="sheet-grid">
          ${sheetKv('Coût par unité', `<span class="sheet-costs">${sheetCostHtml(cost, currentCity)}</span>`)}
          ${sheetKv('Formation', train.pct > 0 ? `${formatDuration(train.seconds)} <small>${formatDuration(train.base)} − ${train.pct.toFixed(1).replace(/\.0$/, '')} % (bâtiments de cette ville)</small>` : `${formatDuration(train.base)} <small>par unité</small>`)}
          ${sheetKv('Entraînée dans', `${reqName} <small>niveau ${req.level} minimum</small>`)}
          ${sheetKv('Palier', `${SHEET_TIER_NAMES[unit.tier] || unit.tier} <small>coefficient de combat × ${coeff}</small>`)}
        </div>
        ${status}
      </div>
      ${action ? `<div class="sheet-actions">${action}</div>` : ''}
    </div>
  `;
  openSheetModal(unit.name, html);
}

// ========== BÂTIMENTS ==========
// Fonctions de chaque bâtiment et niveau auquel elles s'activent (mêmes seuils que le serveur), avec le raccourci qui
// l'ouvre quand elle est disponible. `fx` = effets du bâtiment dans les données.
function buildingFunctions(key, fx) {
  const tab = (t) => () => showTab(t);
  const F = {
    MAIN_HALL: [['Construction plus rapide (−2,5 % par niveau, plafond 60 %)', 1], ['Fixe le niveau maximal des autres bâtiments', 1]],
    RALLY_POINT: [['1 armée en campagne', 1, tab('army')], ['2 armées', 5], ['3 armées', 10], ['4 armées', 15], ['5 armées', 20]],
    BARRACKS: [['Recruter infanterie et archers de base', fx.unlockBaseTier || 1, 'recruit'], ['Unités intermédiaires', fx.unlockIntermediateTier || 7], ['Unités d\'élite', fx.unlockEliteTier || 15], ['Entraînement plus rapide (−0,5 % par niveau)', 1]],
    STABLE: [['Recruter la cavalerie de base', fx.unlockBaseTier || 1, 'recruit'], ['Cavalerie intermédiaire', fx.unlockIntermediateTier || 7], ['Cavalerie d\'élite', fx.unlockEliteTier || 15], ['Entraînement plus rapide (−0,5 % par niveau)', 1]],
    WORKSHOP: [['Engins de siège', SHEET_RULES.siegeWorkshopLevel, 'recruit'], ['Fabrication plus rapide (−4 % par niveau)', 1]],
    ACADEMY: [['Construction plus rapide (−1 % par niveau)', 1], ['Recherche de technologies (une technologie ne dépasse pas le niveau de l\'Académie)', 1, 'panel'], ['Recherche plus rapide (−1 % par niveau)', 1]],
    FORGE: [['Défense de toutes les troupes de la ville (+0,5 % par niveau)', 1]],
    FARM: [['Production de céréales', 1]], LUMBER: [['Production de bois', 1]], QUARRY: [['Production de pierre', 1]], IRON_MINE: [['Production de fer', 1]],
    SILO: [['Capacité de stockage des céréales', 1]], WAREHOUSE: [['Capacité de stockage du bois, de la pierre et du fer', 1]],
    HIDEOUT: [['Ressources à l\'abri des pillages (1 % par niveau, max 20 %)', 1]],
    HEALING_TENT: [['Blessés récupérés après chaque combat (30 % + 3 % par niveau)', 1], ['Soigner les blessés', 1, 'panel']],
    MARKET: [['Échanges avec le marchand itinérant', 1, tab('market')], ['Échanges entre joueurs', 1, tab('market')], ['Envoi de ressources par armée', 1, tab('army')], ['Convois plus grands (+5 % par niveau)', 1]],
    WALL: [['Défense des troupes (+1 % par niveau) et points de mur (1 000 par niveau)', 1], ['Réparation plus rapide', 1]],
    MOAT: [['Attaque et défense des défenseurs (+0,5 % par niveau)', 1]],
    MILL: [['Céréales +5 % par niveau', 1]], BAKERY: [['Céréales +5 % par niveau', 1]], SAWMILL: [['Bois +5 % par niveau', 1]], STONEMASON: [['Pierre +5 % par niveau', 1]], FOUNDRY: [['Fer +5 % par niveau', 1]],
    GREAT_SILO: [['Céréales impossibles à piller', 1]], GREAT_WAREHOUSE: [['Bois, pierre et fer impossibles à piller', 1]],
    GREAT_BARRACKS: [['Recruter infanterie et archers', 1, 'recruit'], ['Entraînement plus rapide (−4 % par niveau)', 1]], GREAT_STABLE: [['Recruter la cavalerie', 1, 'recruit'], ['Entraînement plus rapide (−4 % par niveau)', 1]],
    EMBASSY: [['Rejoindre une alliance', fx.joinAllianceLevel || 5, tab('alliance')], ['Fonder une alliance', fx.createAllianceLevel || 7, tab('alliance')], ['Aide d\'alliance', null]],
    TREASURE_CHAMBER: [['Or chaque jour (10 → 200)', 1, tab('inventory')]],
    HERO_MANSION: [['Écran du héros : équipement, expéditions', 1, tab('hero')]],
    WATCHTOWER: [['Alertes des attaques en approche', 1, tab('reports')], ['Attaquant révélé', fx.alertArmyWhoWhenLevel || 10], ['Effectifs révélés', fx.alertArmyDetailsLevel || 15], ['Contre-espionnage (3,5 % par niveau)', 1], ['Espions et portée de vision', null]],
    RESIDENCE: [['Construction plus rapide (−0,25 % par niveau)', 1], ['Colons et villes secondaires', null]],
    TRADE_OFFICE: [['Convois et transport par armée (+1 % par niveau)', 1]],
    ROMAN_THERMAE: [['Soins plus rapides (−1,5 % par niveau)', 1, 'panel'], ['Plus de blessés sauvés (+0,5 % par niveau)', 1]],
    GALLIC_BREWERY: [['Défense de la ville (+1 % par niveau)', 1]],
    GREEK_TEMPLE: [['Blessés au lieu de morts (+0,5 % par niveau)', 1], ['Recherche plus rapide (−1 % par niveau)', 1]],
    EGYPTIAN_IRRIGATION: [['Toute la production (+1 % par niveau)', 1], ['Vitesse de marche', null]],
    HUN_WAR_TENT: [['Entretien réduit (−0,5 % par niveau)', 1], ['Plus de blessés sauvés (+0,5 % par niveau)', 1]],
    SULTAN_DESERT_OUTPOST: [['Entretien réduit (−0,5 % par niveau)', 1], ['Taxe entre villes', null]]
  };
  return F[key] || [];
}
function sheetFunctionsHtml(key, level, existing, fx) {
  const list = buildingFunctions(key, fx);
  if (!list.length) return '';
  const rows = list.map(([label, at, run]) => {
    const soon = at === null;
    const active = !soon && existing && level >= at;
    const state = soon ? '<span class="sheet-fn-state soon">à venir</span>' : active ? '<span class="sheet-fn-state on">active</span>' : `<span class="sheet-fn-state off">niveau ${at}</span>`;
    let btn = '';
    if (active && run) {
      if (run === 'recruit') btn = `<button type="button" class="info-btn-text" onclick="closeModal(); openRecruitmentPanel('${sheetKey(key)}', ${level}, ${existing.slot})">Recruter</button>`;
      else if (run === 'panel') btn = `<button type="button" class="info-btn-text" onclick="closeModal(); openBuildPanel(${existing.slot})">Ouvrir</button>`;
      else if (typeof run === 'function') { const id = 'fn' + Math.random().toString(36).slice(2, 8); window[id] = () => { closeModal(); run(); }; btn = `<button type="button" class="info-btn-text" onclick="${id}()">Ouvrir</button>`; }
    }
    return `<li class="sheet-fn${active ? ' active' : ''}${soon ? ' soon' : ''}"><span class="sheet-fn-label">${escapeHtml(label)}</span>${state}${btn}</li>`;
  }).join('');
  return `<div class="sheet-section"><h4>${resIconHtml('build')} Fonctions et activation</h4><ul class="sheet-fns">${rows}</ul></div>`;
}

function showBuildingInfoModal(buildingKey) {
  const def = sheetBuildings().find(b => b.key === buildingKey);
  if (!def) { showToast('Bâtiment non trouvé', 'error'); return; }
  const key = def.key;
  const cityBuildings = currentCity?.buildings || [];
  // Plusieurs champs du même type peuvent exister : la fiche suit le mieux développé
  const sameKey = cityBuildings.filter(b => b.key === key);
  const existing = sameKey.reduce((best, b) => (b.level > (best?.level || 0) ? b : best), null);
  const level = existing?.level || (key === 'MAIN_HALL' ? 1 : 0);
  const maxLevel = def.maxLevel || 20;
  const mainHallLevel = cityBuildings.find(b => b.key === 'MAIN_HALL')?.level || 1;
  const effectiveMax = key === 'MAIN_HALL' ? maxLevel : Math.min(maxLevel, mainHallLevel);
  const prereqs = def.prereq || [];
  const faction = player?.faction || 'ROME';
  const description = def.description || getBuildingDescription(key);

  // Prérequis (état dans la ville courante)
  const prereqHtml = prereqs.length ? `<div class="sheet-chips">${prereqs.map(p => {
    const met = !currentCity ? null : ((p.key === 'MAIN_HALL' && p.level <= 1) || cityBuildings.some(b => b.key === p.key && b.level >= p.level));
    return `<span class="sheet-chip ${met === null ? '' : met ? 'met' : 'unmet'}">${buildingIconHtml(p.key, 'b-ico-xs')} ${escapeHtml(getBuildingName(p.key))} niv. ${p.level}${met === null ? '' : ` <span class="st">${met ? '✓' : '✗'}</span>`} ${infoBtnHtml('building', p.key, 'info-btn-sm')}</span>`;
  }).join('')}</div>` : '<p class="sheet-note">Aucun prérequis.</p>';

  // Ce que ce bâtiment débloque : bâtiments qui l'exigent, unités qu'il entraîne (par palier)
  const unlocksBuildings = sheetBuildings().filter(b => (b.prereq || []).some(p => p.key === key) && (!b.faction || b.faction === faction));
  const unlockBuildingsHtml = unlocksBuildings.length ? `<div class="sheet-chips">${unlocksBuildings.map(b => {
    const need = b.prereq.find(p => p.key === key).level;
    return `<span class="sheet-chip">${buildingIconHtml(b.key, 'b-ico-xs')} ${escapeHtml(b.name)} <small>dès le niv. ${need}</small> ${infoBtnHtml('building', b.key, 'info-btn-sm')}</span>`;
  }).join('')}</div>` : '';
  const trainClasses = Object.keys(SHEET_RULES.trainBuildings).filter(c => SHEET_RULES.trainBuildings[c].includes(key));
  const fx = def.effects || {};
  const tierLevel = { base: fx.unlockBaseTier || 1, intermediate: fx.unlockIntermediateTier || 7, elite: fx.unlockEliteTier || 15, siege: SHEET_RULES.siegeWorkshopLevel };
  const unitRowsHtml = trainClasses.length ? ['base', 'intermediate', 'elite', 'siege'].map(tier => {
    const list = sheetUnits().filter(u => u.faction === faction && trainClasses.includes(u.class) && u.tier === tier);
    if (!list.length) return '';
    return `<div class="sheet-unlock-row"><span class="sheet-lvl">Niv. ${tierLevel[tier]}</span><span class="sheet-chips">${list.map(u => `<span class="sheet-chip">${unitIconHtml(u.key, 'unit-ico-sm')} ${escapeHtml(u.name)} ${infoBtnHtml('unit', u.key, 'info-btn-sm')}</span>`).join('')}</span></div>`;
  }).join('') : '';

  // Table des niveaux : effet, coût (même formule que le serveur) et temps (réductions de cette ville)
  const rows = [];
  for (let L = 1; L <= maxLevel; L++) {
    const c = getBuildCost(def, L);
    const eff = getBuildingEffect(key, L) || '—';
    const cls = (L === level ? ' is-current' : L === level + 1 && level > 0 ? ' is-next' : '') + (currentCity && L > effectiveMax && L > level ? ' is-locked' : '');
    rows.push(`<tr class="${cls.trim()}"><td class="lvl">${L}${L === level ? ' <small>actuel</small>' : ''}</td><td class="eff">${eff}</td><td>${formatNum(c.wood)}</td><td>${formatNum(c.stone)}</td><td>${formatNum(c.iron)}</td><td>${formatNum(c.food)}</td><td class="time">${formatDuration(getBuildTime(def, L))}</td></tr>`);
  }

  let cityLine = '';
  if (currentCity) {
    cityLine = existing || key === 'MAIN_HALL'
      ? `<p class="sheet-status ok">À ${escapeHtml(currentCity.name || 'votre ville')} : niveau ${level} / ${maxLevel}${sameKey.length > 1 ? ` (le plus développé des ${sameKey.length})` : ''}${level < maxLevel && level >= effectiveMax && key !== 'MAIN_HALL' ? ` — limité par le Bâtiment principal (niv. ${mainHallLevel})` : ''}.<br><b>${getBuildingEffect(key, level) || ''}</b></p>`
      : `<p class="sheet-status muted">Pas encore construit à ${escapeHtml(currentCity.name || 'votre ville')}.</p>`;
  }

  const html = `
    <div class="sheet building-sheet">
      <div class="sheet-head">
        <div class="sheet-title">
          <h3>${escapeHtml(def.name)}</h3>
          <div class="sheet-badges">
            <span class="sheet-badge">${SHEET_CATEGORY_NAMES[def.category] || def.category || ''}</span>
            ${def.faction ? `<span class="sheet-badge">${SHEET_FACTION_NAMES[def.faction] || def.faction}</span>` : ''}
            <span class="sheet-badge">Niveau max ${maxLevel}</span>
          </div>
          <p class="sheet-desc">${escapeHtml(description)}</p>
        </div>
      </div>
      ${sheetBuildingGallery(key, level, ['FARM', 'LUMBER', 'QUARRY', 'IRON_MINE'].includes(key))}
      ${cityLine}
      ${currentCity && (existing || key === 'MAIN_HALL') ? `<div class="sheet-actions"><button type="button" class="btn-secondary" onclick="locateBuildingInCity('${sheetKey(key)}')">Voir dans la ville</button></div>` : ''}
      ${sheetFunctionsHtml(key, level, existing || (key === 'MAIN_HALL' ? { slot: 0 } : null), fx)}

      <div class="sheet-section">
        <h4>${resIconHtml('list')} Prérequis</h4>
        ${prereqHtml}
        ${key !== 'MAIN_HALL' ? '<p class="sheet-note">Un bâtiment ne dépasse jamais le niveau du Bâtiment principal.</p>' : ''}
      </div>

      ${unitRowsHtml || unlockBuildingsHtml ? `
      <div class="sheet-section">
        <h4>${resIconHtml('star')} Débloque</h4>
        ${unitRowsHtml}
        ${unlockBuildingsHtml}
      </div>` : ''}

      <div class="sheet-section">
        <h4>${resIconHtml('ranking')} Niveaux, effets et coûts</h4>
        <div class="sheet-table-wrap">
          <table class="sheet-table">
            <thead><tr><th class="lvl">Niv.</th><th class="eff">Effet</th><th>${resIconHtml('wood')}</th><th>${resIconHtml('stone')}</th><th>${resIconHtml('iron')}</th><th>${resIconHtml('food')}</th><th>${resIconHtml('clock')}</th></tr></thead>
            <tbody>${rows.join('')}</tbody>
          </table>
        </div>
        <p class="sheet-note">Temps avec les réductions de cette ville (Bâtiment principal, Académie, Résidence${player?.faction === 'GREEK' ? ', bonus grec' : ''}).</p>
      </div>
    </div>
  `;
  openSheetModal(def.name, html);
}

// ========== TECHNOLOGIES ==========
// Fiche d'une technologie : effet par niveau, prérequis, table des niveaux (coût, temps dans la ville courante)
function showTechInfoModal(techKey) {
  const t = typeof techByKey === 'function' ? techByKey(techKey) : null;
  if (!t) { showToast('Technologie non trouvée', 'error'); return; }
  const branch = (technologiesData?.branches || []).find(b => b.key === t.branch);
  const level = player?.techLevels?.[t.key] || 0;
  const max = techMaxLevel(t);
  const rules = technologiesData?.rules || {};
  const academyLevel = (currentCity?.buildings || []).reduce((m, b) => (b.key === 'ACADEMY' && b.level > m ? b.level : m), 0);
  const prereq = (t.prereq || []).map(p => {
    const pt = techByKey(p.key);
    const ok = (player?.techLevels?.[p.key] || 0) >= p.level;
    return `<li class="${ok ? 'met' : 'unmet'}">${escapeHtml(pt?.name || p.key)} niveau ${p.level} ${ok ? '✓' : '✗'}</li>`;
  }).join('');
  const rows = [];
  for (let L = 1; L <= max; L++) {
    const c = techCostAt(t, L);
    const cls = L <= level ? 'done' : L === level + 1 ? 'next' : '';
    rows.push(`<tr class="${cls}"><td class="lvl">${L}${L === level ? ' <small>actuel</small>' : ''}</td><td class="eff">${escapeHtml(techEffectText(t, L))}</td><td>${formatNum(c.wood)}</td><td>${formatNum(c.stone)}</td><td>${formatNum(c.iron)}</td><td>${formatNum(c.food)}</td><td class="time">${formatDuration(techTimeAt(t, L))}</td></tr>`);
  }
  const html = `
    <div class="sheet sheet-tech">
      <p class="sheet-desc">${escapeHtml(t.description || '')}</p>
      <div class="sheet-kv">
        ${sheetKv('Branche', `${resIconHtml(branch?.icon || 'reports')} ${escapeHtml(branch?.name || t.branch)}`)}
        ${sheetKv('Niveau', `${level} / ${max}`)}
        ${sheetKv('Par niveau', escapeHtml(techPerLevelText(t)))}
        ${sheetKv('Au maximum', escapeHtml(techEffectText(t, max)))}
        ${sheetKv('Où', `Académie (niveau ${academyLevel} dans cette ville) : une technologie ne dépasse pas le niveau de l'Académie`)}
        ${sheetKv('Temps de recherche', `−${fmtTechPct(techTimeReductionPct())} % dans cette ville (Académie, Temple grec, plafond ${rules.timeReductionMaxPct || 60} %)`)}
      </div>
      ${prereq ? `<div class="sheet-section sheet-fn-tech"><h4>${resIconHtml('list')} Prérequis</h4><ul class="sheet-prereqs">${prereq}</ul></div>` : ''}
      <div class="sheet-section"><h4>${resIconHtml('clock')} Niveaux</h4>
        <div class="sheet-table-wrap"><table class="sheet-table"><thead><tr><th>Niv.</th><th>Effet</th><th>${resIconHtml('wood')}</th><th>${resIconHtml('stone')}</th><th>${resIconHtml('iron')}</th><th>${resIconHtml('food')}</th><th>Temps</th></tr></thead><tbody>${rows.join('')}</tbody></table></div>
      </div>
    </div>`;
  openSheetModal(t.name, html);
}
