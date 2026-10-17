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
  tierCoeff: { base: 1, intermediate: 1.1, elite: 1.21, siege: 0.75 },
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
  const fn = kind === 'unit' ? 'showUnitInfoModal' : 'showBuildingInfoModal';
  const name = kind === 'unit' ? getUnitName(k) : getBuildingName(k);
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
  return { pct, base, seconds: Math.max(1, Math.round(base * (1 - pct / 100))) };
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
    } else if (req.building) {
      status = `<p class="sheet-status warn">${getBuildingName(req.building.key)} niveau ${req.level} requis (actuellement niveau ${req.building.level}).</p>`;
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
        <div class="sheet-figure">${unitFigureHtml(unit.key, 'unit-figure unit-figure-lg', unit.name)}</div>
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
        <div class="sheet-figure">${buildingIconHtml(key, 'b-ico-md')}</div>
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
      ${cityLine}

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
