// ========== RECHERCHE (Académie) ==========
// Arbre de technologies façon Travian : petits bonus par niveau, une recherche à la fois (une seconde en attente),
// niveau d'une technologie limité par celui de l'Académie. L'état (niveaux, file, disponibilité et coûts dans la
// ville courante) vient du serveur (/api/research) ; les formules reproduites ici (fiches, coûts affichés) sont celles
// de src/utils/techEffects.js. Académie et Temple grec sont ceux de la capitale ; le prix vient de toutes les villes
// (décision du 30 octobre 2026).
let technologiesData = { rules: {}, branches: [], technologies: [] };
let research = { levels: {}, queue: [], rules: {}, city: null };

const TECH_RESOURCES = ['wood', 'stone', 'iron', 'food'];
const fmtTechPct = (v) => String(Math.round(v * 100) / 100).replace('.', ',');
const TECH_EFFECT_LABELS = {
  productionBonusPct: v => `+${fmtTechPct(v)} % de production des champs`,
  buildCostReductionPct: v => `−${fmtTechPct(v)} % de coût de construction`,
  trainTimeReductionPct: v => `−${fmtTechPct(v)} % de temps de recrutement`,
  attackBonusPct: v => `+${fmtTechPct(v)} % d'attaque`,
  defenseBonusPct: v => `+${fmtTechPct(v)} % de défense`,
  woundedBonusPct: v => `+${fmtTechPct(v)} point${v >= 2 ? 's' : ''} de blessés sauvés`,
  armySpeedBonusPct: v => `+${fmtTechPct(v)} % de vitesse des armées`,
  upkeepReductionPct: v => `−${fmtTechPct(v)} % d'entretien des troupes`
};

// Icônes peintes quand elles existent (ui/tech_<KEY>, ui/branch_<KEY>) ; sinon rien pour la technologie, l'icône de ressource pour la branche
const techIconHtml = (key) => (typeof paintedSet !== 'undefined' && paintedSet.has(`ui/tech_${key}.webp`) ? `<img class="ico tc-ico" src="${art(`ui/tech_${key}.webp`)}" alt="">` : '');
const branchIconHtml = (b) => (typeof paintedSet !== 'undefined' && paintedSet.has(`ui/branch_${b.key}.webp`) ? `<img class="ico" src="${art(`ui/branch_${b.key}.webp`)}" alt="">` : resIconHtml(b.icon || 'reports'));
const techList = () => technologiesData?.technologies || [];
const techByKey = (key) => techList().find(t => t.key === key) || null;
const techMaxLevel = (t) => t?.maxLevel || 10;

// Σ niveau × effet des technologies du joueur (points de %), comme utils/techEffects.js côté serveur
function techPctClient(effect, levels = player?.techLevels) {
  let total = 0;
  for (const t of techList()) {
    const per = t.effects?.[effect];
    const lvl = Math.min(levels?.[t.key] || 0, techMaxLevel(t));
    if (typeof per === 'number' && lvl > 0) total += lvl * per;
  }
  return total;
}
function techEffectText(tech, level) {
  return Object.entries(tech.effects || {}).map(([k, per]) => (TECH_EFFECT_LABELS[k] ? TECH_EFFECT_LABELS[k](per * level) : `${k} ${per * level}`)).join(', ');
}
function techPerLevelText(tech) {
  return Object.entries(tech.effects || {}).map(([k, per]) => (TECH_EFFECT_LABELS[k] ? TECH_EFFECT_LABELS[k](per) : `${k} ${per}`) + ' par niveau').join(', ');
}
// Coût et temps d'un niveau (mêmes formules que le serveur ; le temps tient compte des bâtiments de la ville courante)
function techCostAt(tech, level) {
  const mult = Math.pow(technologiesData.rules?.costGrowth || 1.45, level - 1);
  return Object.fromEntries(TECH_RESOURCES.map(r => [r, Math.floor((tech.costL1?.[r] || 0) * mult)]));
}
function techTimeReductionPct() {
  let total = 0;
  for (const b of effectBuildings(currentCity)) {
    const per = window.buildingsData?.find(d => d.key === b.key)?.effects?.researchTimeReductionPctPerLevel;
    if (per) total += b.level * per;
  }
  return Math.min(technologiesData.rules?.timeReductionMaxPct || 60, total);
}
function techTimeAt(tech, level) {
  const base = Math.floor((tech.timeL1Sec || 600) * Math.pow(technologiesData.rules?.timeGrowth || 1.5, level - 1));
  return Math.max(1, Math.floor(base * (1 - techTimeReductionPct() / 100)));
}

async function loadTechnologies() {
  const cached = cache.get('technologies');
  if (cached) { technologiesData = cached; return; }
  try {
    const res = await requestManager.fetchWithRetry(`${API}/api/technologies`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) { technologiesData = await res.json(); cache.set('technologies', technologiesData); }
  } catch (e) { console.warn('loadTechnologies error:', e); }
}

// État de recherche du joueur (et disponibilité dans la ville courante), puis rendu de l'onglet s'il est ouvert
async function loadResearch() {
  if (!token) return;
  try {
    const q = currentCity?.id ? `?cityId=${encodeURIComponent(currentCity.id)}` : '';
    const res = await requestManager.fetchWithRetry(`${API}/api/research${q}`, { headers: { Authorization: `Bearer ${token}` } });
    if (res.ok) {
      research = await res.json();
      if (player) player.techLevels = research.levels || {};
    }
  } catch (e) { console.warn('loadResearch error:', e); }
  renderResearchTab();
}

function techCardHtml(t, a, level) {
  const max = techMaxLevel(t);
  const next = a?.nextLevel || null;
  const cost = a?.cost || null;
  const canPay = canPayCost(cost);   // stock de toutes les villes
  const blocker = a ? a.blocker : 'Chargement…';
  const startable = !!a && !blocker && canPay;
  const reason = blocker || (cost && !canPay ? costShortfall(cost) : '');
  const costHtml = cost
    ? TECH_RESOURCES.map(r => `<span class="tc-cost ${stockOf(r) >= (cost[r] || 0) ? 'ok' : 'missing'}">${resIconHtml(r)} ${formatNum(cost[r] || 0)}</span>`).join('')
    : '<span class="tc-cost">Niveau maximum atteint</span>';
  return `<div class="tech-card${level >= max ? ' maxed' : ''}" data-tech="${t.key}">
    <div class="tc-head">${techIconHtml(t.key)}<span class="tc-name">${escapeHtml(t.name)}</span>${infoBtnHtml('tech', t.key, 'info-btn-sm')}<span class="tc-level">niv. ${level}/${max}</span></div>
    <div class="tc-bar"><div class="tc-bar-fill" style="width:${Math.round(level / max * 100)}%"></div></div>
    <p class="tc-effect">${level > 0 ? `Actuel : ${escapeHtml(techEffectText(t, level))}` : escapeHtml(techPerLevelText(t))}${next ? `<br><strong>Niveau ${next} : ${escapeHtml(techEffectText(t, next))}</strong>` : ''}</p>
    <div class="tc-costs">${costHtml}${a?.timeSec ? `<span class="tc-time">${resIconHtml('clock')} ${formatDuration(a.timeSec)}</span>` : ''}</div>
    ${next ? `<button type="button" class="btn-primary tc-btn" ${startable ? '' : 'disabled'} onclick="startResearch('${t.key}')">${startable ? 'Rechercher' : escapeHtml(reason)}</button>` : ''}
  </div>`;
}

function renderResearchTab() {
  const el = document.getElementById('research-panel');
  if (!el) return;
  const techs = techList();
  if (!techs.length) { el.innerHTML = '<p class="research-empty">Chargement…</p>'; return; }
  const city = research?.city || null;
  const avail = Object.fromEntries((city?.technologies || []).map(a => [a.key, a]));
  const rules = research?.rules || technologiesData.rules || {};
  const queue = research?.queue || [];
  const academyLevel = city?.academyLevel ?? effectBuildings(currentCity).reduce((m, b) => (b.key === 'ACADEMY' && b.level > m ? b.level : m), 0);
  const head = `<div class="research-head"><p>Académie niveau <strong>${academyLevel}</strong> : une technologie ne dépasse jamais ce niveau. Temps de recherche <strong>−${fmtTechPct(city?.timeReductionPct ?? techTimeReductionPct())} %</strong> (Académie, Temple grec). File : <strong>${queue.length}/${rules.maxQueue || 2}</strong>, une recherche à la fois.</p></div>`;
  const queueHtml = queue.length ? `<div class="research-queue">${queue.map(q => {
    const t = techByKey(q.techKey);
    const state = q.status === 'RUNNING' ? `<span class="qd-timer" data-ends-at="${q.endsAt}">${formatTime(q.endsAt)}</span>` : 'en attente';
    return `<div class="research-queue-item ${q.status === 'RUNNING' ? 'running' : 'queued'}"><span class="rq-name">${escapeHtml(t?.name || q.techKey)} <small>niveau ${q.targetLevel}</small></span><span class="rq-state">${state}</span>${q.status === 'RUNNING' && typeof helpAskButton === 'function' ? helpAskButton('RESEARCH', q.id) : ''}<button type="button" class="btn-small" onclick="cancelResearch('${q.id}')" title="Annuler (${q.status === 'RUNNING' ? 'remboursement de moitié' : 'remboursement intégral'})" aria-label="Annuler">✕</button></div>`;
  }).join('')}</div>` : '<p class="research-empty">Aucune recherche en cours.</p>';
  const branches = (technologiesData.branches || []).map(b => {
    const cards = techs.filter(t => t.branch === b.key).map(t => techCardHtml(t, avail[t.key], research?.levels?.[t.key] || 0)).join('');
    return `<div class="research-branch"><h5>${branchIconHtml(b)} ${escapeHtml(b.name)} <small>${escapeHtml(b.description || '')}</small></h5><div class="tech-cards">${cards}</div></div>`;
  }).join('');
  el.innerHTML = head + queueHtml + branches;
}

async function startResearch(techKey) {
  if (!currentCity) return;
  const btn = document.querySelector(`.tech-card[data-tech="${techKey}"] .tc-btn`);
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${API}/api/research/start`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ cityId: currentCity.id, techKey }) });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) showToast(data.error || 'Recherche impossible', 'error');
    else showToast(data.message || 'Recherche lancée', 'success');
  } catch (e) { showToast('Erreur réseau', 'error'); }
  await Promise.all([loadCities(), loadResearch()]);
}

async function cancelResearch(itemId) {
  try {
    const res = await fetch(`${API}/api/research/${encodeURIComponent(itemId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) showToast(data.error || 'Annulation impossible', 'error');
    else showToast(data.message || 'Recherche annulée', 'info');
  } catch (e) { showToast('Erreur réseau', 'error'); }
  await Promise.all([loadCities(), loadResearch()]);
}
