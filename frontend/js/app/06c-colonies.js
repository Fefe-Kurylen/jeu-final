// ========== VILLES SECONDAIRES (colons, fondation, gisements, « Mes villes », « Sites libres ») ==========
// GDD : la Résidence de la capitale forme des colons (1 au niveau 10, 2 au 15, 3 au 20) ; une armée emmène un colon et
// 3 000 de chaque ressource (prises dans la capitale d'abord, puis dans les autres villes : stock partagé, décision du
// 30 octobre 2026) sur un point de ressource libre, la ville est fondée 24 h après l'arrivée et produit +20 %, plus le
// bonus de son gisement sur sa ressource.
// Les règles affichées sont celles du serveur (routes/cities.js, routes/armies.js, utils/buildingEffects.js).
const COLONY_RULES = { foundationTransport: 3000, maxSecondaryCities: 2, mainHallMax: 20 };
// Plafond du Bâtiment principal hors capitale (règle du serveur : config.city.secondaryMainHallMaxLevel, transmise par /api/world/info)
function colonyMainHallMax() { return Number(window.worldRules?.secondaryMainHallMaxLevel) || COLONY_RULES.mainHallMax; }
// Palier de ville (Village / Ville / Ville Fortifiée) d'après le niveau du Bâtiment principal, comme le serveur
function cityTierFromMainHall(level) {
  const tiers = (window.worldRules?.cityTiers || [{ minMainHall: 0, tier: 1 }, { minMainHall: 10, tier: 2 }, { minMainHall: 20, tier: 3 }]);
  let t = 1; for (const x of tiers) if ((level || 1) >= x.minMainHall) t = x.tier; return t;
}

// Icône du colon : version peinte `ui/settler.webp` dès qu'elle est livrée, sinon l'icône de ville
function settlerIcon(cls = 'ico') { return typeof paintedSet !== 'undefined' && paintedSet.has('ui/settler.webp') ? `<img class="${cls}" src="assets/images/painted/ui/settler.webp" alt="">` : resIconHtml('city', cls); }

// Portrait peint du colon (busts/SETTLER_<CIV>, guide § S12) dès qu'il est livré
function settlerPortrait(cls = 'unit-ico') { const p = `busts/SETTLER_${player?.faction || 'ROME'}.webp`; return typeof paintedSet !== 'undefined' && paintedSet.has(p) ? `<img class="${cls}" src="assets/images/painted/${p}" alt="">` : ''; }

const residenceEffects = () => (window.buildingsData?.find(b => b.key === 'RESIDENCE')?.effects) || {};

// ---- Gisement d'une colonie (décision du 30 octobre 2026) ----
// Une colonie fondée sur un gisement de bois, de pierre, de fer ou de céréales produit, sur cette seule ressource, un bonus
// par niveau du gisement (1 à 3 ; RESIDENCE.effects.colonyNodeBonusPctPerNodeLevel), en plus du bonus des colonies. Ni la
// capitale ni la Ville Merveille n'en ont. Le serveur donne le gisement de chaque ville (GET /api/cities : site) et celui
// des sites libres ; pour un point de la carte, le bonus se calcule avec la même donnée.
const SITE_NAMES = { wood: 'bois', stone: 'pierre', iron: 'fer', food: 'céréales' };
const siteBonusPct = (level) => (Number(level) || 0) * (Number(residenceEffects().colonyNodeBonusPctPerNodeLevel) || 0);
// « Gisement de fer niveau 3 : +45 % de fer dans une colonie » ('' pour un point où l'on ne fonde pas : or, plan…)
function siteText(type, level, where = 'dans une colonie', pct = siteBonusPct(level)) {
  const name = SITE_NAMES[SITE_RESOURCE[type]];
  return name ? `Gisement de ${name} niveau ${level} : +${pct} % de ${name} ${where}` : '';
}
// Pastille courte du gisement d'une ville (« Mes villes », sites libres) : icône, ressource, niveau, bonus ; texte complet en info-bulle
function siteBadgeHtml(site, where = 'dans cette colonie') {
  const res = SITE_RESOURCE[site?.type];
  if (!res) return '';
  const pct = site.bonusPct ?? siteBonusPct(site.level);
  return `<span class="site-badge" title="${escapeHtml(siteText(site.type, site.level, where, pct))}">${resIconHtml(res)} ${SITE_NAMES[res]} niv. ${site.level} · +${pct} %</span>`;
}
// Pastille du gisement sur la vue de la ville (colonie seulement) ; la toucher affiche la phrase complète
function updateCitySiteBadge() {
  const el = document.getElementById('city-site-badge');
  if (!el) return;
  const html = siteBadgeHtml(currentCity?.site);
  el.style.display = html ? '' : 'none';
  if (html && el.innerHTML !== html) el.innerHTML = html;
}
function showCitySiteInfo() {
  const site = currentCity?.site;
  if (site) showToast(siteText(site.type, site.level, 'dans cette colonie', site.bonusPct), 'info');
}
function settlerSlotsFor(level) {
  const fx = residenceEffects();
  if (level >= 20) return fx.unlockSettlerL20 || 3;
  if (level >= 15) return fx.unlockSettlerL15 || 2;
  if (level >= 10) return fx.unlockSettlerL10 || 1;
  return 0;
}
const capitalCity = () => (cities || []).find(c => c.isCapital) || null;
// Ordre stable des villes (le serveur ne trie pas, et l'ordre de la base change au fil des mises à jour) : la capitale,
// puis les autres dans l'ordre de leur fondation
const byFounding = (a, b) => Number(!!b.isCapital) - Number(!!a.isCapital) || String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
// la Ville Merveille n'est pas une colonie : hors quota (routes/cities.js, décision du 28 octobre 2026)
const secondaryCities = () => (cities || []).filter(c => !c.isCapital && !c.isWonder).sort(byFounding);
const settlersTravelling = () => (armies || []).reduce((s, a) => s + (a.settlers || 0), 0);

// Onglet « Colons » du panneau de la Résidence
function colonyTabHtml(level) {
  const slots = Math.min(COLONY_RULES.maxSecondaryCities, settlerSlotsFor(level));
  const colonies = secondaryCities();
  const training = (currentCity?.recruitQueue || []).filter(q => q.unitKey === 'SETTLER');
  const available = currentCity?.settlers || 0;
  const used = colonies.length + available + settlersTravelling() + training.length;
  const fx = residenceEffects();
  const trainH = Math.round((fx.settlerTrainTimeSec || 10800) / 3600), foundH = Math.round((fx.cityFoundationTimeSec || 86400) / 3600), bonus = fx.secondaryCityBonusPct || 20;
  const sitePct = siteBonusPct(1);
  // un colon de plus pour la Ville Merveille quand toutes les places sont des colonies fondées et qu'aucun colon n'attend
  const forWonder = used >= slots && colonies.length >= slots && used === colonies.length && !(cities || []).some(c => c.isWonder);
  const canTrain = currentCity?.isCapital && slots > 0 && (used < slots || forWonder);
  const nextLevel = slots >= 3 ? null : slots === 2 ? 20 : slots === 1 ? 15 : 10;
  return `
    <div class="special-tab-content">
      <h4>${settlerPortrait('unit-ico-sm') || settlerIcon()} Colons et villes secondaires</h4>
      <p>Résidence niveau <strong>${level}</strong> : <strong>${slots}</strong> colon${slots > 1 ? 's' : ''} (1 au niveau 10, 2 au niveau 15, 3 au niveau 20)${nextLevel ? ` · le suivant au niveau ${nextLevel}` : ''}.</p>
      <p>Villes secondaires : <strong>${colonies.length}</strong>${colonies.length ? ' (' + colonies.map(c => escapeHtml(c.name)).join(', ') + ')' : ''} · colons prêts dans la capitale : <strong>${available}</strong> · en route : <strong>${settlersTravelling()}</strong> · en formation : <strong>${training.length}</strong></p>
      ${training.length ? `<div class="research-queue">${training.map(q => `<div class="research-queue-item running"><span class="rq-name">Colon en formation</span><span class="rq-state"><span class="qd-timer" data-ends-at="${q.endsAt}">${formatTime(q.endsAt)}</span></span><button type="button" class="btn-small" onclick="cancelRecruit('${q.id}')" title="Annuler" aria-label="Annuler">✕</button></div>`).join('')}</div>` : ''}
      <button type="button" class="btn-primary" ${canTrain ? '' : 'disabled'} onclick="trainSettler()">${canTrain ? `Former un colon${forWonder ? ' pour la Ville Merveille' : ''} (${trainH} h)` : !currentCity?.isCapital ? 'Capitale seulement' : slots === 0 ? 'Résidence niveau 10 requise' : 'Tous les colons sont engagés'}</button>
      <p class="research-empty" style="margin-top:8px">Pour fonder une ville : une armée de la capitale emmène un colon et ${formatNum(COLONY_RULES.foundationTransport)} de chaque ressource (prises dans la capitale, puis dans vos autres villes) sur un point de ressource libre (bulle du point sur la carte, « Fonder une ville »). La fondation dure ${foundH} h sur place ; la colonie produit +${bonus} %, et son gisement lui donne encore +${sitePct} % par niveau du gisement (1 à 3) sur sa seule ressource. Le colon est perdu si l'armée est battue en chemin. Le bouton « Sites libres » de la carte liste les gisements où fonder.</p>
    </div>`;
}

async function trainSettler() {
  if (!currentCity) return;
  try {
    const res = await fetch(`${API}/api/city/${currentCity.id}/settlers`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    showToast(res.ok ? (data.message || 'Formation lancée') : (data.error || 'Formation impossible'), res.ok ? 'success' : 'error');
  } catch (e) { showToast('Erreur réseau', 'error'); }
  await loadCities();
  if (typeof openBuildPanel === 'function' && currentCity) { const r = (currentCity.buildings || []).find(b => b.key === 'RESIDENCE'); if (r) { openBuildPanel(r.slot); const btn = Array.from(document.querySelectorAll('.building-tab')).find(b => /Colons/.test(b.textContent)); if (btn) btn.click(); } }
}

// Depuis la bulle d'un point libre ou la liste des sites libres : choisir l'armée de la capitale qui part fonder.
// `type`, `level` : le gisement du point (rien pour un site de Merveille : la Ville Merveille n'a pas de bonus de gisement)
function foundCityAt(nodeId, x, y, type = null, level = 0) {
  const capital = capitalCity();
  if (!capital) { showToast('Aucune capitale', 'error'); return; }
  if ((capital.settlers || 0) < 1) { showToast('Aucun colon disponible : formez-en un à la Résidence de la capitale', 'error'); return; }
  const candidates = (armies || []).filter(a => a.status === 'IDLE' && !a.isGarrison && a.cityId === capital.id && a.x === capital.x && a.y === capital.y && (a.units || []).length > 0);
  if (!candidates.length) { showToast('Aucune armée disponible dans la capitale', 'error'); return; }
  const fx = residenceEffects();
  // ce qui manque dans toutes les villes réunies pour les ressources de la fondation (recommandation 14)
  const short = costShortfall(Object.fromEntries(RES_KEYS.map(r => [r, COLONY_RULES.foundationTransport])));
  document.getElementById('modal-body').innerHTML = `
    <h3>${settlerPortrait('unit-ico-sm') || settlerIcon()} Fonder une ville en (${x}, ${y})</h3>
    ${siteText(type, level) ? `<p class="site-line">${resIconHtml(SITE_RESOURCE[type])} ${siteText(type, level)}</p>` : ''}
    <p>Un colon part avec l'armée choisie et ${formatNum(COLONY_RULES.foundationTransport)} de chaque ressource (prises dans la capitale, puis dans vos autres villes) ; la ville est prête ${Math.round((fx.cityFoundationTimeSec || 86400) / 3600)} h après l'arrivée. Le point ne doit plus avoir de tribu ni d'armée.</p>
    ${short ? `<p class="missing">${escapeHtml(short)} (toutes vos villes comprises)</p>` : ''}
    <label style="display:block; margin:10px 0 5px;">Armée :</label>
    <select id="found-army-select" style="width:100%; padding:8px; margin-bottom:10px;">${candidates.map(a => `<option value="${a.id}">${escapeHtml(a.name)} (${(a.units || []).reduce((s, u) => s + u.count, 0)} unités)</option>`).join('')}</select>
    <label style="display:block; margin:10px 0 5px;">Nom de la ville (facultatif) :</label>
    <input id="found-city-name" type="text" maxlength="40" style="width:100%; padding:8px; margin-bottom:15px;" placeholder="Colonie de ${escapeHtml(player?.name || '')}">
    <div style="display:flex; gap:10px;">
      <button onclick="confirmFoundCity('${nodeId}')" class="btn btn-primary" style="flex:1;">${settlerIcon()} Fonder</button>
      <button onclick="closeModal()" class="btn btn-secondary" style="flex:1;">Annuler</button>
    </div>`;
  document.getElementById('modal').style.display = 'flex';
}

async function confirmFoundCity(nodeId) {
  const armyId = document.getElementById('found-army-select')?.value;
  const name = document.getElementById('found-city-name')?.value || '';
  if (!armyId) { showToast('Sélectionnez une armée', 'error'); return; }
  closeModal();
  if (typeof closeMapPanel === 'function') closeMapPanel();
  try {
    const res = await fetch(`${API}/api/army/${armyId}/found-city`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ resourceNodeId: nodeId, name }) });
    const data = await res.json().catch(() => ({}));
    showToast(res.ok ? (data.message || 'Colon en route') : (data.error || 'Fondation impossible'), res.ok ? 'success' : 'error');
  } catch (e) { showToast('Erreur réseau', 'error'); }
  await Promise.all([loadArmies(), loadCities()]);
  if (typeof loadMap === 'function') loadMap();
}

// ========== VUE « MES VILLES » (décision du 30 octobre 2026 : moins de micro-gestion) ==========
// Une ligne par ville, tirée de GET /api/cities (déjà en mémoire, aucune requête en plus) : gisement, les 4 stocks avec
// « plein dans … », la file de construction (« File vide » en rouge), le recrutement, les armées stationnées, les vies et
// l'attaque en approche ; en tête, les totaux de toutes les villes et le bilan de nourriture commun (l'entretien de toutes
// les troupes puise dans tous les greniers). Toucher une ligne ouvre la ville.
const lastEndOf = (queue) => (queue || []).reduce((m, q) => Math.max(m, new Date(q.endsAt).getTime() || 0), 0);
const countdownHtml = (ms) => `<span class="qd-timer" data-ends-at="${new Date(ms).toISOString()}">${formatTime(ms)}</span>`;
// Un stock : barre, quantité et plafond, puis quand il sera plein (ou vide, pour une nourriture en baisse)
function stockBarHtml(res, amount, cap, perHour) {
  let when = '';
  if (amount >= cap) when = '<span class="mv-full">plein</span>';
  else if (perHour > 0) when = `plein dans ${formatDuration(Math.round((cap - amount) / perHour * 3600))}`;
  else if (perHour < 0) when = `<span class="mv-warn">vide dans ${formatDuration(Math.round(amount / -perHour * 3600))}</span>`;
  return `<div class="mv-stock">${resIconHtml(res)}<div class="storage-bar${res === 'food' ? ' food' : ''}"><div style="width:${cap > 0 ? Math.min(100, amount / cap * 100) : 0}%"></div></div>`
    + `<span class="mv-amount">${formatNum(amount)} / ${formatNum(cap)}</span><span class="mv-when">${when}</span></div>`;
}
function myCityRowHtml(city, nowMs) {
  // production de la ville (gisement compris) ; nourriture : son bilan à elle, entretien de ses propres troupes déduit
  const prod = getCityProduction(city), net = Number(city.foodBalance?.net);
  const perHour = { ...prod, food: Number.isFinite(net) ? net : prod.food };
  const stocks = RES_KEYS.map(r => stockBarHtml(r, Math.floor(city[r] || 0), (r === 'food' ? city.maxFoodStorage : city.maxStorage) || 0, perHour[r])).join('');
  const builds = city.buildQueue || [], recruits = city.recruitQueue || [];
  const buildHtml = builds.length
    ? `${resIconHtml('build')} ${builds.length} chantier${builds.length > 1 ? 's' : ''} · file vide dans ${countdownHtml(lastEndOf(builds))}`
    : `<span class="mv-idle">${resIconHtml('build')} File vide</span>`;
  const training = recruits.reduce((s, q) => s + (q.count || 0), 0);
  const recruitHtml = recruits.length ? `${resIconHtml('recruit')} ${formatNum(training)} en formation · fin dans ${countdownHtml(lastEndOf(recruits))}` : `${resIconHtml('recruit')} Aucun recrutement`;
  // armées du joueur posées dans la ville (la garnison de la capitale, celles envoyées défendre une colonie)
  const here = (armies || []).filter(a => a.status === 'IDLE' && a.x === city.x && a.y === city.y && (a.units || []).length);
  const soldiers = here.reduce((s, a) => s + a.units.reduce((t, u) => t + u.count, 0), 0);
  const armyHtml = `${resIconHtml('army')} ${here.length ? `${here.length} armée${here.length > 1 ? 's' : ''} · ${formatNum(soldiers)} soldats` : 'Aucune armée'}`;
  const livesHtml = city.lives ? `<span class="mv-lives${city.lives.left < city.lives.total ? ' mv-warn' : ''}">${resIconHtml('defense')} Vies ${city.lives.left}/${city.lives.total}</span>` : '';
  const attack = (incomingAttacks || []).filter(a => a.targetCityId === city.id && (a.type === 'SIEGE' || new Date(a.arrivalAt).getTime() > nowMs))
    .sort((a, b) => new Date(a.arrivalAt) - new Date(b.arrivalAt))[0];
  const attackHtml = attack ? `<span class="mv-attack">${resIconHtml('attack')} ${attack.type === 'SIEGE' ? 'Siège : assaut dans' : 'Attaque dans'} ${countdownHtml(new Date(attack.arrivalAt).getTime())}</span>` : '';
  return `
    <div class="village-list-item mv-row${city.id === currentCity?.id ? ' active' : ''}${attack ? ' mv-threat' : ''}" onclick="selectCity('${city.id}'); closeModal();">
      <div class="mv-head">
        <span class="village-icon">${resIconHtml(city.isCapital ? 'crown' : 'city')}</span>
        <span class="village-name">${escapeHtml(city.name)}</span>
        <span class="village-coords">(${city.x}|${city.y})</span>
        <span class="village-pop">${escapeHtml(city.cityTierName || '')}</span>
        ${siteBadgeHtml(city.site)}
        ${livesHtml}
        ${attackHtml}
      </div>
      <div class="mv-stocks">${stocks}</div>
      <div class="mv-lines"><span>${buildHtml}</span><span>${recruitHtml}</span><span>${armyHtml}</span></div>
    </div>`;
}
function myCitiesTotalsHtml() {
  const t = playerStock(), fb = t.foodBalance;
  const stocks = RES_KEYS.map(r => `<span>${resIconHtml(r)} ${formatNum(t[r] || 0)} / ${formatNum((r === 'food' ? t.maxFoodStorage : t.maxStorage) || 0)}</span>`).join('');
  const food = fb ? `<div class="mv-food${fb.net < 0 ? ' mv-warn' : ''}">${resIconHtml('food')} Nourriture de toutes vos villes : ${fb.net < 0 ? '−' : '+'}${formatNum(Math.abs(fb.net))}/h`
    + `${fb.hoursLeft === null || fb.hoursLeft === undefined ? '' : ` · greniers vides dans ${formatDuration(Math.round(fb.hoursLeft * 3600))}`}`
    + ' <small>(l\'entretien de toutes vos troupes puise dans tous vos greniers)</small></div>' : '';
  return `<div class="mv-totals"><div class="mv-totals-title">Toutes vos villes</div><div class="mv-totals-stocks">${stocks}</div>${food}</div>`;
}
function openVillageList() {
  if (!cities || cities.length === 0) {
    showToast('Aucune ville', 'warning');
    return;
  }
  const now = serverNow();
  const rows = [...cities].sort(byFounding).map(c => myCityRowHtml(c, now)).join('');
  showModal('Mes villes', `<div class="village-list my-cities">${myCitiesTotalsHtml()}${rows}</div>`);
}

// ========== « SITES LIBRES » (décision du 30 octobre 2026) ==========
// Les gisements où fonder une colonie, du plus proche au plus lointain de la capitale (GET /api/map/free-sites) : ressource,
// niveau, bonus dans une colonie, temps de marche depuis la capitale, force de la tribu à chasser d'abord, et un
// avertissement pour le cercle du centre, disputé. Filtres : ressource et niveau du gisement.
const FREE_SITES_FETCH = 100;   // le serveur en rend au plus 100 (routes/map.js)
const freeSites = { list: [], type: '', minLevel: 0 };
async function openFreeSites() {
  showModal('Sites libres', '<p class="empty-state">Chargement…</p>');
  try {
    const res = await fetch(`${API}/api/map/free-sites?limit=${FREE_SITES_FETCH}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => null);
    if (!res.ok) { showModal('Sites libres', `<p class="empty-state">${escapeHtml(data?.error || 'Liste indisponible')}</p>`); return; }
    freeSites.list = Array.isArray(data) ? data : [];
  } catch (e) {
    showModal('Sites libres', '<p class="empty-state">Liste indisponible (hors ligne ?)</p>');
    return;
  }
  renderFreeSites();
}
function setFreeSitesFilter(key, value) {
  freeSites[key] = value;
  renderFreeSites();
}
function freeSiteRowHtml(s) {
  const tribe = s.tribePower > 0;
  return `
    <div class="fs-row">
      <div class="fs-main">${siteBadgeHtml(s, 'dans une colonie')} <span class="village-coords">(${s.x}|${s.y})</span></div>
      <div class="fs-info">${resIconHtml('clock')} ${formatDuration(s.travelSec)} depuis la capitale · ${tribe ? `${resIconHtml('defense')} tribu : force ${formatNum(s.tribePower)}, à chasser avant de fonder` : 'pas de tribu'}</div>
      ${s.central ? `<div class="fs-central">${resIconHtml('attack')} Centre de la carte : site disputé, vos voisins le visent aussi</div>` : ''}
      <div class="fs-actions">
        <button type="button" class="btn-secondary btn-small" onclick="closeModal(); showTab('map'); centerMapOn(${s.x}, ${s.y})">Voir</button>
        ${tribe ? '' : `<button type="button" class="btn-primary btn-small" onclick="closeModal(); foundCityAt('${escapeHtml(s.id)}', ${s.x}, ${s.y}, '${escapeHtml(s.type)}', ${s.level})">Fonder</button>`}
      </div>
    </div>`;
}
function renderFreeSites() {
  const chip = (key, value, label) => `<button type="button" class="fs-chip${freeSites[key] === value ? ' active' : ''}" onclick="setFreeSitesFilter('${key}', ${typeof value === 'number' ? value : `'${value}'`})">${label}</button>`;
  const levels = [...new Set(freeSites.list.map(s => s.level))].sort((a, b) => a - b);
  const filters = `<div class="fs-filters">${chip('type', '', 'Toutes')}${Object.entries(SITE_RESOURCE).map(([type, res]) => chip('type', type, `${resIconHtml(res)} ${SITE_NAMES[res]}`)).join('')}</div>`
    + `<div class="fs-filters">${chip('minLevel', 0, 'Tous niveaux')}${levels.slice(1).map(l => chip('minLevel', l, `Niveau ${l}${l < levels.at(-1) ? ' et plus' : ''}`)).join('')}</div>`;
  const shown = freeSites.list.filter(s => (!freeSites.type || s.type === freeSites.type) && s.level >= freeSites.minLevel);
  const rows = shown.length ? shown.map(freeSiteRowHtml).join('') : '<p class="empty-state">Aucun site libre avec ces filtres près de votre capitale.</p>';
  showModal('Sites libres', `<div class="free-sites"><p class="fs-intro">Les gisements où fonder une colonie, du plus proche au plus lointain de votre capitale.</p>${filters}<div class="fs-list">${rows}</div></div>`);
}
