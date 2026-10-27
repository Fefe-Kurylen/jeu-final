// ============================================================
// 09h-ranking.js — Classements (décision du 27 octobre 2026) : joueurs (population, attaque, défense, pillage), alliances
// (population, attaque, défense), top 10 de la semaine, médailles. Serveur : src/routes/ranking.js,
// src/services/rankingService.js.
// ============================================================
let rankingState = { view: 'players', sort: 'population', page: 1, allianceSort: 'population', weekCat: 'ATTACK' };
const RANK_SORTS = [['population', 'Population', 'population'], ['attack', 'Attaque', 'attack'], ['defense', 'Défense', 'defense'], ['loot', 'Pillage', 'item_crate']];
const ALLIANCE_SORTS_UI = [['population', 'Population', 'population'], ['attack', 'Attaque', 'attack'], ['defense', 'Défense', 'defense']];
const WEEK_CATS = [['ATTACK', 'Attaquants', 'attack'], ['DEFENSE', 'Défenseurs', 'defense'], ['LOOT', 'Pilleurs', 'item_crate'], ['CLIMB', 'Progression', 'population'], ['ALLIANCE_ATTACK', 'Alliances (attaque)', 'alliance'], ['ALLIANCE_DEFENSE', 'Alliances (défense)', 'alliance']];
const MEDAL_LABEL = { ATTACK: 'Attaquants', DEFENSE: 'Défenseurs', LOOT: 'Pilleurs', CLIMB: 'Progression', ALLIANCE_ATTACK: 'Alliances en attaque', ALLIANCE_DEFENSE: 'Alliances en défense' };
const VALUE_UNIT = { population: 'hab.', attack: 'pts', defense: 'pts', loot: 'ress.' };

function medalIcon(rank) {
  const f = rank === 1 ? 'medal' : rank === 2 ? 'medal_silver' : rank === 3 ? 'medal_bronze' : null;
  return f ? `<img class="ico" src="assets/images/3d/ui/${f}.webp" alt="">` : `<span class="rank-num">${rank}</span>`;
}
const chips = (list, current, onclick) => `<div class="ranking-chips">${list.map(([k, l, ico]) => `<button class="chip ${k === current ? 'active' : ''}" onclick="${onclick}('${k}')">${resIconHtml(ico)} ${l}</button>`).join('')}</div>`;
const rowHtml = (rank, name, value, unit, { me = false, onclick = '' } = {}) => `
  <div class="ranking-row ${me ? 'me' : ''}" ${onclick ? `onclick="${onclick}"` : ''}>
    <span class="ranking-position ${rank <= 3 ? 'top' + rank : ''}">${medalIcon(rank)}</span>
    <span class="ranking-name">${name}</span>
    <span class="ranking-value">${formatNum(value || 0)} ${unit}</span>
  </div>`;
const playerName = (r) => `${r.allianceTag || r.alliance?.alliance?.tag ? `[${escapeHtml(r.allianceTag || r.alliance.alliance.tag)}] ` : ''}${escapeHtml(r.name)}`;

function showRanking(view) {
  rankingState.view = view;
  document.querySelectorAll('#tab-ranking .toolbar-btn').forEach(t => t.classList.remove('active'));
  document.querySelector(`#tab-ranking .toolbar-btn[onclick*="'${view}'"]`)?.classList.add('active');
  loadRanking(view);
}
async function loadRanking(view = rankingState.view) {
  if (['attackers', 'defenders'].includes(view)) { rankingState.sort = view === 'attackers' ? 'attack' : 'defense'; view = 'players'; }
  rankingState.view = view;
  const content = document.getElementById('ranking-content');
  if (!content) return;
  const ticket = (rankingState.ticket = (rankingState.ticket || 0) + 1);   // seule la dernière demande s'affiche
  const fetchJson = async (p) => { const d = await window.fetchJson(p); if (ticket !== rankingState.ticket) throw { stale: true }; return d; };
  try {
    if (view === 'alliances') return renderAllianceRanking(content, await fetchJson(`/api/ranking/alliances?sort=${rankingState.allianceSort}`));
    if (view === 'week') return renderWeekRanking(content, await fetchJson(`/api/ranking/week?category=${rankingState.weekCat}`));
    if (view === 'medals') return renderMedals(content, await fetchJson('/api/ranking/medals'));
    renderPlayerRanking(content, await fetchJson(`/api/ranking/players?sort=${rankingState.sort}&page=${rankingState.page}`));
  } catch (e) {
    if (e?.stale) return;
    console.warn('loadRanking error:', e);
    renderLoadError(content, `loadRanking('${view}')`);
  }
}
function setRankSort(k) { rankingState.sort = k; rankingState.page = 1; loadRanking('players'); }
function setRankPage(p) { rankingState.page = Math.max(1, p); loadRanking('players'); }
function setAllianceSort(k) { rankingState.allianceSort = k; loadRanking('alliances'); }
function setWeekCat(k) { rankingState.weekCat = k; loadRanking('week'); }

function renderPlayerRanking(content, d) {
  const unit = VALUE_UNIT[d.sort];
  content.innerHTML = `
    ${chips(RANK_SORTS, d.sort, 'setRankSort')}
    <p class="diplo-help">${d.sort === 'population' ? 'Population de toutes vos villes.' : d.sort === 'loot' ? 'Ressources prises aux autres joueurs (raids, pillage de siège).' : 'Points de combat façon Travian : chaque ennemi tué vaut son entretien en nourriture (5 de base, 10 intermédiaire, 15 élite et siège).'}</p>
    ${d.me ? `<div class="ranking-me">Votre rang : <strong>${formatNum(d.me.rank)}</strong> sur ${formatNum(d.total)} · ${formatNum(d.me.value)} ${unit} ${d.me.rank > (d.page - 1) * 50 + d.rows.length || d.me.rank <= (d.page - 1) * 50 ? `<button class="btn btn-secondary btn-sm" onclick="setRankPage(${Math.ceil(d.me.rank / 50)})">Voir ma place</button>` : ''}</div>` : ''}
    <div class="ranking-list">${d.rows.length ? d.rows.map(r => rowHtml(r.rank, playerName(r), r.value, unit, { me: r.id === player?.id, onclick: `viewPlayerProfile('${chatSafeId(r.id)}')` })).join('') : '<div class="empty-state">Aucun classement pour le moment</div>'}</div>
    ${d.pages > 1 ? `<div class="ranking-pages"><button class="btn btn-secondary btn-sm" ${d.page <= 1 ? 'disabled' : ''} onclick="setRankPage(${d.page - 1})">‹</button> Page ${d.page} / ${d.pages} <button class="btn btn-secondary btn-sm" ${d.page >= d.pages ? 'disabled' : ''} onclick="setRankPage(${d.page + 1})">›</button></div>` : ''}`;
}
function renderAllianceRanking(content, d) {
  const unit = VALUE_UNIT[d.sort];
  content.innerHTML = `
    ${chips(ALLIANCE_SORTS_UI, d.sort, 'setAllianceSort')}
    ${d.me ? `<div class="ranking-me">Votre alliance : <strong>${formatNum(d.me.rank)}</strong>e · ${formatNum(d.me.value)} ${unit}</div>` : ''}
    <div class="ranking-list">${d.rows.length ? d.rows.map(r => rowHtml(r.rank, `[${escapeHtml(r.tag)}] ${escapeHtml(r.name)} <small>${r.members} membre${r.members > 1 ? 's' : ''}</small>`, r.value, unit, { me: r.id === d.me?.id, onclick: typeof openAllianceSheet === 'function' ? `openAllianceSheet('${chatSafeId(r.id)}')` : '' })).join('') : '<div class="empty-state">Aucune alliance classée</div>'}</div>`;
}
function renderWeekRanking(content, d) {
  const isAlliance = d.category.startsWith('ALLIANCE');
  const unit = d.category === 'LOOT' ? 'ress.' : d.category === 'CLIMB' ? 'hab.' : 'pts';
  const me = d.me ? `<div class="ranking-me">Votre semaine : ${resIconHtml('attack')} ${formatNum(d.me.attackPoints)} · ${resIconHtml('defense')} ${formatNum(d.me.defensePoints)} · ${resIconHtml('item_crate')} ${formatNum(d.me.loot)} · ${resIconHtml('population')} +${formatNum(d.me.climb)}</div>` : '';
  content.innerHTML = `
    ${chips(WEEK_CATS, d.category, 'setWeekCat')}
    <p class="diplo-help">Semaine du ${new Date(d.week + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' })}, close dans <span class="qd-timer" data-ends-at="${d.endsAt}">${formatTime(d.endsAt)}</span> (lundi 0 h, heure de Paris). Les 10 premiers joueurs de chaque catégorie et les 3 premières alliances en attaque et en défense reçoivent une médaille.</p>
    ${me}
    <div class="ranking-list">${d.rows.length ? d.rows.map((r, i) => rowHtml(i + 1, isAlliance ? `[${escapeHtml(r.tag)}] ${escapeHtml(r.name)}` : escapeHtml(r.name), r.value, unit, { me: !isAlliance && r.playerId === player?.id, onclick: isAlliance ? '' : `viewPlayerProfile('${chatSafeId(r.playerId)}')` })).join('') : '<div class="empty-state">Personne encore cette semaine</div>'}</div>`;
}
function medalsHtml(medals) {
  if (!medals?.length) return '<p class="empty-state">Aucune médaille pour l\'instant.</p>';
  return `<div class="medal-grid">${medals.map(m => `<div class="medal-card rank-${Math.min(m.rank, 4)}">${medalIcon(m.rank)}<div><strong>${m.rank}${m.rank === 1 ? 'er' : 'e'} · ${MEDAL_LABEL[m.category] || m.category}</strong><small>Semaine du ${new Date(m.week + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })} · ${formatNum(m.value)}</small></div></div>`).join('')}</div>`;
}
function renderMedals(content, d) {
  content.innerHTML = `<h4>${resIconHtml('medal')} Vos médailles</h4>${medalsHtml(d.medals)}
    ${d.allianceMedals?.length ? `<h4>${resIconHtml('alliance')} Médailles de votre alliance</h4>${medalsHtml(d.allianceMedals)}` : ''}
    <p class="diplo-help">Honorifiques, façon Travian : elles restent sur le profil.</p>`;
}
