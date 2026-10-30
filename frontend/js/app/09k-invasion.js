// ============================================================
// 09k-invasion.js — Invasions barbares (décision du 29 octobre 2026) : donjons d'alliance à 3 étages sur la carte
// chaque week-end (vendredi 18 h → dimanche 23 h). Carte (donjon, étage, barre de vie), panneau du donjon (étages,
// garnison, trésor, contributeurs, attaquer), carte « Invasion » de l'onglet Classement › Monde.
// Serveur : src/services/hordeService.js, src/routes/invasion.js.
// ============================================================

// ---- carte ----
function drawHordeNode(x, y, tw, th, tile) {
  const level = Math.max(1, Math.min(5, Number(tile.horde?.level || tile.level) || 1));
  const biome = typeof getBiome === 'function' ? getBiome(tile.x, tile.y) : 'grass';
  const imgSize = Math.max(tw, th * 2) * (1.35 + level * 0.08);
  const painted = [`horde_${level}_${biome}`, `horde_${level}`, 'horde'].find(n => tileImages.camps?.[n]);
  if (!(painted && drawTileImage(mapCtx, 'camps', painted, x, y, imgSize, imgSize))) {
    // en attendant l'image peinte : le grand camp barbare, sur un halo rouge
    mapCtx.save();
    mapCtx.fillStyle = 'rgba(150, 25, 20, 0.35)';
    mapCtx.beginPath(); mapCtx.ellipse(x, y + th * 0.1, tw * 0.6, th * 0.6, 0, 0, Math.PI * 2); mapCtx.fill();
    mapCtx.restore();
    // la forteresse des Huns (les hordes), sinon le grand camp barbare
    const fort = ['capital_hun', 'capital'].find(n => tileImages.cities?.[n]);
    const camp = [`camp3_${biome}`, 'camp3'].find(n => tileImages.camps?.[n]);
    if (!(fort && drawTileImage(mapCtx, 'cities', fort, x, y, imgSize * 0.9, imgSize * 0.9)) && !(camp && drawTileImage(mapCtx, 'camps', camp, x, y, imgSize, imgSize))) {
      mapCtx.fillStyle = '#7a1f14';
      mapCtx.beginPath(); mapCtx.moveTo(x, y - th * 0.8); mapCtx.lineTo(x + tw * 0.35, y + th * 0.2); mapCtx.lineTo(x - tw * 0.35, y + th * 0.2); mapCtx.closePath(); mapCtx.fill();
    }
  }
  // barre de vie de l'étage en cours
  const w = Math.max(20, tw * 0.9), h = 4, r = Math.max(0, Math.min(1, (Number(tile.defenderPower) || 0) / (tile.horde?.floorPower || 1)));
  const by = y + th * 0.42;
  mapCtx.fillStyle = 'rgba(0,0,0,0.65)'; mapCtx.fillRect(x - w / 2, by, w, h);
  mapCtx.fillStyle = '#d64535'; mapCtx.fillRect(x - w / 2, by, Math.round(w * r), h);
  const draw = () => {
    if (mapZoomLevel <= 0.4) return;
    const px = Math.max(9, 10 * mapZoomLevel);
    drawMapNamePlate(x, by + h + 3, `Donjon niv. ${level} · étage ${tile.horde?.floor || 1}/3`, px, '#d64535', true);
  };
  if (mapLabelQueue) mapLabelQueue.push(draw); else draw();
}

async function renderHordeNodePanel(tile, content) {
  // cible affichée (map.js) : si le joueur touche autre chose ou ferme la fenêtre pendant le chargement, la réponse est jetée
  const seq = mapPanelSeq;
  // pas de .diplo-help ici : la fenêtre repliée le cacherait et n'afficherait qu'un cadre vide
  content.innerHTML = '<p class="empty-state">Chargement du donjon…</p>';
  let d;
  try { d = await fetchJson(`/api/invasion/horde/${encodeURIComponent(tile.id)}`); }
  catch (e) { if (seq === mapPanelSeq) content.innerHTML = '<p class="empty-state">Ce donjon est détruit ou reparti.</p>'; return; }
  if (seq !== mapPanelSeq) return;
  const rallies = d.inAlliance && !d.destroyed && typeof hordeRalliesHtml === 'function' ? await hordeRalliesHtml(d.nodeId) : '';
  if (seq !== mapPanelSeq) return;
  const id = chatSafeId(d.nodeId);
  const hasArmy = (armies || []).some(a => a.status === 'IDLE' && !a.isGarrison && (a.units || []).length > 0);
  const floors = d.floors.map((f, i) => {
    const pct = f.power ? Math.round(100 * f.left / f.power) : 0;
    return `<div class="horde-floor ${f.done ? 'done' : f.current ? 'current' : ''}">
      <span class="horde-floor-name">${i + 1}. ${escapeHtml(f.name)}</span>
      <span class="horde-floor-bar"><i style="width:${f.done ? 0 : pct}%"></i></span>
      <small>${f.done ? 'vaincu' : `${formatNum(f.left)} / ${formatNum(f.power)}`}</small></div>`;
  }).join('');
  const garrison = Object.entries(d.garrison || {}).filter(([, n]) => n > 0).map(([k, n]) => `<span class="unit-chip">${unitIconHtml(k, 'unit-ico-sm')} ${escapeHtml(getUnitName(k))} ×${formatNum(n)}</span>`).join(' ');
  const contrib = d.contributors.length ? `<ol class="horde-contrib">${d.contributors.map(c => `<li class="${c.me ? 'me' : ''}">${c.tag ? `[${escapeHtml(c.tag)}] ` : ''}${escapeHtml(c.name)} <small>${formatNum(c.points)} pts · ${Math.round(c.share * 100)} % · ${c.attacks} attaque${c.attacks > 1 ? 's' : ''}</small></li>`).join('')}</ol>` : '<p class="diplo-help">Personne n\'a encore attaqué ce donjon.</p>';
  content.innerHTML = `
    <h3 data-horde-node="${id}">${resIconHtml('skull')} Donjon barbare · niveau ${d.level}</h3>
    <p>Position : (${d.x}, ${d.y})${d.endsAt && !d.destroyed ? ` · repart <span class="qd-timer" data-ends-at="${d.endsAt}">${formatTime(d.endsAt)}</span>` : ''}</p>
    ${d.destroyed ? '<p class="bastion-fallen">Donjon détruit : le trésor a été partagé.</p>' : ''}
    <div class="horde-floors">${floors}</div>
    ${!d.destroyed && garrison ? `<p><small>Garnison de l'étage :</small><br>${garrison}</p>` : ''}
    <p class="diplo-help">Trésor du donjon, partagé selon les dégâts : ${formatNum(d.treasure.wood)} de chaque ressource, ${formatNum(d.treasure.gold)} or, ${formatNum(d.treasure.alliancePoints)} points d'alliance ; ${Math.round(d.treasure.itemChance * 100)} % de chance d'objet pour le héros du dernier coup. Les étages se battent dans l'ordre ; un donjon ne s'attaque qu'en rassemblement d'alliance ; une attaque repoussée use quand même la garnison.</p>
    ${rallies}
    <h4>${resIconHtml('ranking')} Dégâts</h4>${contrib}
    ${d.inAlliance && d.myAlliancePoints ? `<p><small>Votre alliance : ${formatNum(d.myAlliancePoints)} points sur ${formatNum(d.totalPoints)}</small></p>` : ''}
    <div class="panel-actions">
      ${d.destroyed ? '' : d.inAlliance ? `<button class="btn btn-danger" onclick="openRallyLaunch('${id}', ${d.x}, ${d.y}, ${d.level})" ${hasArmy ? '' : 'disabled title="Aucune armée disponible"'}>${resIconHtml('rally')} Lancer un rassemblement</button>` : '<p class="diplo-help">Rejoignez une alliance pour attaquer les donjons.</p>'}
      ${typeof openSpyMission === 'function' && !d.destroyed ? `<button class="btn btn-warning" onclick="closeMapPanel(); openSpyMission({ nodeId: '${id}', label: 'le donjon (${d.x}, ${d.y})' })">${resIconHtml('spy')} Espionner</button>` : ''}
      ${typeof mapShareButton === 'function' ? mapShareButton(d.x, d.y) : ''}
    </div>`;
  content.scrollTop = 0;   // le panneau s'ouvre en haut (titre, étages)
  if (content.parentElement) content.parentElement.scrollTop = 0;
}

// ---- onglet Classement › Monde : la carte de l'invasion ----
async function invasionCardHtml() {
  let s;
  try { s = await fetchJson('/api/invasion'); } catch (e) { return ''; }
  const inv = s.invasion;
  if (!s.active) {
    return `<div class="world-card"><h4>${resIconHtml('skull')} Invasions barbares</h4>
      <p>Chaque week-end, du vendredi 18 h au dimanche 23 h, des donjons de hordes apparaissent sur la carte : abattez leurs trois étages avec votre alliance pour partager leur trésor. Les hordes n'attaquent pas les villes.</p>
      ${s.nextStart ? `<p><strong>Prochaine invasion</strong> : ${new Date(s.nextStart).toLocaleString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}</p>` : ''}
      ${inv?.endedAt ? `<p><small>Dernière invasion : ${inv.destroyed} donjon${inv.destroyed > 1 ? 's' : ''} détruit${inv.destroyed > 1 ? 's' : ''} sur ${inv.total}${inv.alliances[0] ? ` · meilleure alliance [${escapeHtml(inv.alliances[0].tag)}]` : ''}</small></p>` : ''}</div>`;
  }
  return `<div class="world-card invasion-live"><h4>${resIconHtml('skull')} Invasion barbare en cours</h4>
    <p>Fin <span class="qd-timer" data-ends-at="${inv.endsAt}">${formatTime(inv.endsAt)}</span> · ${inv.destroyed} donjon${inv.destroyed > 1 ? 's' : ''} détruit${inv.destroyed > 1 ? 's' : ''} sur ${inv.total}${inv.myPoints ? ` · vos dégâts : ${formatNum(inv.myPoints)} pts` : ''}</p>
    <div class="invasion-levels">${inv.byLevel.map(l => `<span><strong>Niv. ${l.level}</strong> ${l.left} restant${l.left > 1 ? 's' : ''} sur ${l.total}</span>`).join('')}</div>
    ${!inv.inAlliance ? '<p class="diplo-help">Rejoignez une alliance pour attaquer les donjons.</p>' : ''}
    ${inv.hordes.length ? `<div class="profile-actions"><button class="btn btn-primary btn-sm" onclick="invasionGoNearest()">${resIconHtml('map')} Donjon le plus proche</button></div>` : ''}
    ${inv.alliances.length ? `<h4>${resIconHtml('alliance')} Alliances</h4><div class="ranking-list">${inv.alliances.map((a, i) => `<div class="ranking-row ${a.mine ? 'me' : ''}"><span class="ranking-position">${i + 1}</span><span class="ranking-name">[${escapeHtml(a.tag)}] ${escapeHtml(a.name)} <small>${a.hordes} donjon${a.hordes > 1 ? 's' : ''}</small></span><span class="ranking-value">${formatNum(a.points)} pts</span></div>`).join('')}</div>` : ''}
  </div>`;
}
async function invasionGoNearest() {
  let s; try { s = await fetchJson('/api/invasion'); } catch (e) { return; }
  const list = s.invasion?.hordes || [];
  if (!list.length || !currentCity) return;
  const near = list.slice().sort((a, b) => Math.hypot(a.x - currentCity.x, a.y - currentCity.y) - Math.hypot(b.x - currentCity.x, b.y - currentCity.y))[0];
  showTab('map');
  if (typeof centerMapOn === 'function') centerMapOn(near.x, near.y);
}
