// ============================================================
// 09i-world.js — Cycle du serveur et Merveille (décision du 28 octobre 2026) : calendrier du monde, sites de Merveille
// et plans gardés par les Immortels sur la carte, Ville Merveille (niveaux, chantier), onglet Classement › Monde
// (calendrier, Merveilles, plans, Panthéon), monde terminé, rejoindre le monde suivant.
// Serveur : src/services/wonderService.js, hallOfFameService.js, routes src/routes/wonder.js.
// ============================================================
let worldStateCache = null, worldStateAt = 0;
async function loadWorldState(force = false) {
  if (!force && worldStateCache && Date.now() - worldStateAt < 60000) return worldStateCache;
  try { worldStateCache = await fetchJson('/api/world/state'); worldStateAt = Date.now(); } catch (e) { /* garde le dernier */ }
  return worldStateCache;
}
const frDate = (d) => d ? new Date(d).toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '—';
const WONDER_RES = [['wood', 'bois'], ['stone', 'pierre'], ['iron', 'fer'], ['food', 'nourriture']];

// ---- carte : site de Merveille, plan ----
function drawWonderNode(x, y, tw, th, tile) {
  const site = tile.resourceType === 'WONDER';
  const imgSize = Math.max(tw, th * 2) * 1.6;
  const painted = site ? (tile.hasDefenders ? 'wonder_site_immortals' : 'wonder_site') : 'immortals_plan';
  if (!(tileImages.camps?.[painted] && drawTileImage(mapCtx, 'camps', painted, x, y, imgSize, imgSize))) {
    // en attendant l'image peinte : la forteresse du Sultanat (Immortels) en bronze, ruines quand ils sont vaincus
    mapCtx.save();
    if (!tile.hasDefenders) mapCtx.globalAlpha = 0.45;
    if (!(tileImages.cities?.capital_sultan && drawTileImage(mapCtx, 'cities', 'capital_sultan', x, y, imgSize * (site ? 1 : 0.7), imgSize * (site ? 1 : 0.7)))) {
      mapCtx.fillStyle = site ? '#b8860b' : '#7a5a2a';
      mapCtx.beginPath(); mapCtx.ellipse(x, y, tw * 0.45, th * 0.45, 0, 0, Math.PI * 2); mapCtx.fill();
    }
    mapCtx.restore();
  }
  const draw = () => {
    if (mapZoomLevel <= 0.4) return;
    const px = Math.max(9, 10 * mapZoomLevel);
    drawMapNamePlate(x, y + th * 0.5, site ? (tile.hasDefenders ? 'Site de Merveille · Immortels' : 'Site de Merveille libre') : 'Plan de construction', px, '#c9a227', true, 'gold');
  };
  if (mapLabelQueue) mapLabelQueue.push(draw); else draw();
}
function renderWonderNodePanel(tile, content) {
  const site = tile.resourceType === 'WONDER';
  const id = chatSafeId(tile.id);
  const hasArmy = (armies || []).some(a => a.status === 'IDLE' && !a.isGarrison && (a.units || []).length > 0);
  const guard = tile.hasDefenders ? `<p>${resIconHtml('defense')} Garnison des Immortels : <strong>${formatNum(tile.defenderPower || 0)}</strong> de puissance</p>` : `<p class="diplo-help">Les Immortels sont vaincus${tile.lastDefeat ? ` : ils reviennent ${formatTime(new Date(new Date(tile.lastDefeat).getTime() + 86400000).toISOString())} après leur défaite si personne n'y fonde de ville` : ''}.</p>`;
  content.innerHTML = `
    <h3>${resIconHtml(site ? 'crown' : 'reports')} ${site ? 'Site de Merveille' : 'Plan de construction'}</h3>
    <p>Position : (${tile.x}, ${tile.y})</p>
    ${guard}
    <p class="diplo-help">${site
      ? 'Battez la garnison des Immortels, puis fondez-y une ville avec un colon : elle devient la Ville Merveille de votre alliance (une par joueur). La première alliance qui monte sa Merveille au niveau 100 gagne le monde.'
      : 'Battez la garnison des Immortels pour prendre le plan : il reste dans votre capitale et permet à votre alliance de monter sa Merveille au-delà du niveau 50. Un assaut gagné contre votre capitale l\'emporterait.'}</p>
    <div class="panel-actions">
      ${tile.hasDefenders ? `<button class="btn btn-danger" onclick="raidResource('${id}', ${tile.x}, ${tile.y})" ${hasArmy ? '' : 'disabled title="Aucune armée disponible"'}>${resIconHtml('attack')} Attaquer les Immortels</button>` : ''}
      ${site && !tile.hasDefenders && typeof foundCityAt === 'function' ? `<button class="btn btn-primary" onclick="foundCityAt('${id}', ${tile.x}, ${tile.y})">${resIconHtml('crown')} Fonder la Ville Merveille</button>` : ''}
      ${typeof openSpyMission === 'function' ? `<button class="btn btn-warning" onclick="closeMapPanel(); openSpyMission({ nodeId: '${id}', label: '${site ? 'le site de Merveille' : 'le plan'} (${tile.x}, ${tile.y})' })">${resIconHtml('spy')} Espionner</button>` : ''}
      ${typeof mapShareButton === 'function' ? mapShareButton(tile.x, tile.y) : ''}
    </div>`;
}

// ---- Ville Merveille ----
async function openWonderPanel(cityId) {
  let w;
  try { w = await fetchJson(`/api/wonder/${encodeURIComponent(cityId)}`); } catch (e) { showToast('Merveille indisponible', 'error'); return; }
  const pct = Math.round(100 * w.level / w.maxLevel);
  const next = w.next;
  const enough = next ? WONDER_RES.every(([k]) => (w.stock[k] || 0) >= next.cost[k]) : false;
  const planOk = !next?.needsPlan || w.hasPlan;
  openSheetModal(`Merveille de ${escapeHtml(w.name)}`, `
    <div class="wonder-head">${resIconHtml('crown')} <strong>Niveau ${w.level} / ${w.maxLevel}</strong> · ${escapeHtml(w.alliance ? `[${w.alliance.tag}] ${w.alliance.name}` : w.owner.name)}</div>
    <div class="bastion-bar wonder-bar-fill"><i style="width:${pct}%"></i></div>
    ${w.buildEndsAt ? `<p>${resIconHtml('build')} Niveau ${w.level + 1} en construction : <span class="qd-timer" data-ends-at="${w.buildEndsAt}">${formatTime(w.buildEndsAt)}</span></p>` : ''}
    <h4>Stock du chantier</h4>
    <div class="wonder-stock">${WONDER_RES.map(([k, l]) => `<span>${resIconHtml(k)} ${formatNum(w.stock[k] || 0)}${next ? ` <small>/ ${formatNum(next.cost[k])}</small>` : ''}</span>`).join('')}</div>
    <p class="diplo-help">Les membres de l'alliance remplissent ce stock en envoyant leurs convois à la Ville Merveille (sans plafond).</p>
    ${next ? `<p>Niveau ${next.level} : ${formatDuration(next.seconds)}${next.needsPlan ? ` · ${w.hasPlan ? `${resIconHtml('star')} plan détenu par l'alliance` : `${resIconHtml('lock')} il faut un plan de construction dans l'alliance`}` : ''}</p>` : '<p><strong>Merveille achevée.</strong></p>'}
    ${w.nextWaveAt ? `<p class="diplo-help">${resIconHtml('attack')} Prochaine vague d'Immortels : <span class="qd-timer" data-ends-at="${w.nextWaveAt}">${formatTime(w.nextWaveAt)}</span>. Un assaut perdu fait perdre des niveaux ; la ville ne peut pas être rasée.</p>` : ''}
    <div class="profile-actions">
      ${w.mine && next && !w.buildEndsAt ? `<button class="btn btn-primary" ${enough && planOk ? '' : 'disabled'} onclick="buildWonderLevel('${chatSafeId(w.cityId)}')">${resIconHtml('build')} Construire le niveau ${next.level}</button>` : ''}
      <button class="btn btn-secondary" onclick="closeModal()">Fermer</button>
    </div>`);
}
async function buildWonderLevel(cityId) {
  const ok = await allianceRequestNoReload(`/api/wonder/${cityId}/build`, 'POST');
  if (ok) { closeModal(); if (typeof loadCities === 'function') await loadCities(); openWonderPanel(cityId); }
}
// bandeau sur l'écran de la ville quand c'est la Ville Merveille
function updateWonderBar() {
  let el = document.getElementById('wonder-banner');
  if (!currentCity?.isWonder) { if (el) el.style.display = 'none'; return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'wonder-banner'; el.className = 'wonder-banner';
    const anchor = document.getElementById('famine-banner') || document.querySelector('header.top-bar');
    anchor.parentNode.insertBefore(el, anchor.nextSibling);
  }
  el.style.display = '';
  el.innerHTML = `${resIconHtml('crown')} <strong>Ville Merveille</strong> · niveau ${currentCity.wonderLevel || 0} / 100 <button class="btn btn-primary btn-sm" onclick="openWonderPanel('${chatSafeId(currentCity.id)}')">Ouvrir la Merveille</button>`;
}

// ---- onglet Classement › Monde ----
async function renderWorldTab(content) {
  const [st, wl, hof] = await Promise.all([loadWorldState(true), fetchJson('/api/wonder').catch(() => null), fetchJson('/api/world/hall-of-fame').catch(() => [])]);
  if (!st) { content.innerHTML = '<p class="empty-state">Calendrier indisponible.</p>'; return; }
  const step = (label, at, done) => `<li class="${done ? 'done' : ''}">${done ? resIconHtml('star') : resIconHtml('clock')} <strong>${label}</strong> <small>${frDate(at)}</small></li>`;
  const catName = { WONDER: 'Merveille', POPULATION: 'Population', ATTACK: 'Attaquants', DEFENSE: 'Défenseurs', ALLIANCE: 'Alliances' };
  content.innerHTML = `
    <div class="world-card">
      <h4>${resIconHtml('map')} Monde ${st.world} · jour ${st.day}</h4>
      ${st.ended ? `<p class="bastion-fallen">${resIconHtml('crown')} Monde terminé le ${frDate(st.endedAt)} : ${escapeHtml(st.winner || '')}. Un nouveau monde ouvre bientôt.</p>` : ''}
      <ul class="world-steps">
        ${step(`Inscriptions ouvertes (${formatNum(st.registration.players)} / ${formatNum(st.registration.maxPlayers)} joueurs)`, st.openedAt, true)}
        ${step(st.registration.open ? 'Fin des inscriptions' : 'Inscriptions closes', st.registration.endsAt, !st.registration.open)}
        ${step('Sites de Merveille gardés par les Immortels', st.wonderSitesAt, st.sitesOpen)}
        ${step('Plans de construction (au-delà du niveau 50)', st.wonderPlansAt, st.plansOpen)}
        ${step('Une Merveille au niveau 100 : fin du monde', st.endedAt, st.ended)}
      </ul>
    </div>
    ${wl?.wonders?.length ? `<h4>${resIconHtml('crown')} Merveilles</h4><div class="ranking-list">${wl.wonders.map((w, i) => `<div class="ranking-row" onclick="openWonderPanel('${chatSafeId(w.cityId)}')"><span class="ranking-position">${i + 1}</span><span class="ranking-name">${escapeHtml(w.name)} <small>${w.alliance ? `[${escapeHtml(w.alliance.tag)}]` : escapeHtml(w.owner.name)}${w.building ? ' · en construction' : ''}</small></span><span class="ranking-value">niv. ${w.level}</span></div>`).join('')}</div>` : ''}
    ${wl?.plans?.length ? `<h4>${resIconHtml('reports')} Plans de construction</h4><p>${wl.plans.map(p => `${escapeHtml(p.holder || '—')}${p.allianceTag ? ` [${escapeHtml(p.allianceTag)}]` : ''}${p.mine ? ' (vous)' : ''}`).join(' · ')}</p>` : ''}
    <h4>${resIconHtml('medal')} Panthéon</h4>
    ${hof.length ? hof.map(w => `<div class="world-card"><strong>Monde ${w.world}</strong> <small>terminé le ${frDate(w.endedAt)}</small>
      ${Object.entries(w.categories).map(([c, rows]) => `<div class="hof-cat"><em>${catName[c] || c}</em> ${rows.slice(0, c === 'WONDER' ? 1 : 3).map(r => `${r.rank}. ${escapeHtml(r.name)} <small>(${formatNum(r.value)})</small>`).join(' · ')}</div>`).join('')}</div>`).join('') : '<p class="empty-state">Aucun monde terminé pour l\'instant.</p>'}`;
}

// ---- monde terminé, rejoindre le monde suivant ----
async function checkWorldStatus() {
  const st = await loadWorldState();
  let el = document.getElementById('world-ended-banner');
  if (!st?.ended) { if (el) el.style.display = 'none'; return; }
  if (!el) {
    el = document.createElement('div'); el.id = 'world-ended-banner'; el.className = 'famine-banner world-ended';
    const anchor = document.querySelector('header.top-bar');
    if (!anchor) return;
    anchor.parentNode.insertBefore(el, anchor.nextSibling);
  }
  el.style.display = '';
  el.innerHTML = `${resIconHtml('crown')} <strong>Ce monde est terminé</strong> : ${escapeHtml(st.winner || '')}. Le jeu est figé jusqu'au nouveau monde. <button class="btn btn-secondary btn-sm" onclick="showTab('ranking'); showRanking('world')">Panthéon</button>`;
}
let joinShown = false;
function openJoinWorld() {
  if (joinShown) return;
  joinShown = true;
  const factions = ['ROME', 'GAUL', 'GREEK', 'EGYPT', 'HUN', 'SULTAN'];
  const label = { ROME: 'Rome', GAUL: 'Gaule', GREEK: 'Grèce', EGYPT: 'Égypte', HUN: 'Huns', SULTAN: 'Sultanat' };
  openSheetModal('Un nouveau monde', `
    <p>Un nouveau monde a commencé. Vous gardez votre compte, vos achats, vos cosmétiques, vos médailles et vos titres ; choisissez votre civilisation pour recevoir votre capitale.</p>
    <div class="join-factions">${factions.map(f => `<label class="support-option"><input type="radio" name="join-faction" value="${f}" ${f === (player?.faction || 'ROME') ? 'checked' : ''}> ${typeof heroPortraitHtml === 'function' ? heroPortraitHtml(f, 'hero-ico-sm') : ''} <strong>${label[f]}</strong></label>`).join('')}</div>
    <div class="profile-actions"><button class="btn btn-primary" onclick="confirmJoinWorld()">Rejoindre le monde</button></div>`);
}
async function confirmJoinWorld() {
  const faction = document.querySelector('input[name="join-faction"]:checked')?.value || 'ROME';
  const ok = await allianceRequestNoReload('/api/world/join', 'POST', { faction });
  if (ok) { closeModal(); joinShown = false; if (typeof loadPlayer === 'function') await loadPlayer(); if (typeof loadCities === 'function') await loadCities(); if (typeof loadArmies === 'function') loadArmies(); }
  else joinShown = false;
}
