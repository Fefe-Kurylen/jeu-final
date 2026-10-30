// ============================================================
// 09j-admin.js — Écran d'administration (décision du 29 octobre 2026), réservé à l'équipe (rôle Modérateur ou
// Administrateur), ouvert depuis Paramètres › Administration. Onglets : Tableau de bord, Monde (administrateur),
// Signalements, Joueurs (fiche, sanctions, rôle), Équipe, Journal. Serveur : src/routes/admin.js, services/adminService.js.
// ============================================================
let adminState = { view: 'overview', me: null, q: '', filter: '', logBefore: null };
const isStaffRole = (r) => r === 'MODERATOR' || r === 'ADMIN';
const ROLE_LABEL = { PLAYER: 'Joueur', MODERATOR: 'Modérateur', ADMIN: 'Administrateur' };
const ACTION_LABEL = {
  ROLE: 'Rôle', MUTE: 'Silence', SUSPEND: 'Suspension', BAN: 'Bannissement', LIFT_MUTE: 'Silence levé', LIFT_SUSPEND: 'Suspension levée', LIFT_BAN: 'Bannissement levé',
  REPORT_DELETE: 'Message supprimé', REPORT_DISMISS: 'Signalement classé', WORLD_SETTINGS: 'Calendrier', WORLD_SHIFT: 'Calendrier décalé', WORLD_END: 'Monde terminé',
  WORLD_NEXT: 'Monde suivant demandé', WORLD_OPENED: 'Monde suivant ouvert', ANNOUNCE: 'Annonce', ANNOUNCE_END: 'Bandeau retiré', INVASION_START: 'Invasion lancée', INVASION_END: 'Invasion terminée'
};
const frDateTime = (d) => d ? new Date(d).toLocaleString('fr-FR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
const adminCan = (perm) => !!adminState.me?.perms?.includes(perm);
async function adminPost(path, body) { return allianceRequestNoReload(`/api/admin${path}`, 'POST', body || {}); }

// un autre compte connecté sur la même page (déconnexion puis connexion, sans rechargement) : rien de la session d'avant
// (rôle, droits, vue, recherche)
function adminSession() {
  if (adminState.token !== token) adminState = { view: 'overview', me: null, q: '', filter: '', logBefore: null, token };
}
function openAdmin(view) {
  if (typeof closeModal === 'function') closeModal();
  adminSession();
  adminState.me = null;   // rôle et droits relus à chaque ouverture : un rôle changé entre-temps est pris en compte
  if (view) adminState.view = view;   // avant showTab, qui charge la vue choisie
  showTab('admin');
}
async function loadAdmin(view) {
  adminSession();
  view = view || adminState.view;
  adminState.view = view;
  const content = document.getElementById('admin-content');
  if (!content) return;
  document.querySelectorAll('#tab-admin .toolbar-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  try {
    if (!adminState.me) adminState.me = await fetchJson('/api/admin/me');
    document.querySelectorAll('#tab-admin .toolbar-btn[data-perm]').forEach(b => { b.style.display = adminCan(b.dataset.perm) ? '' : 'none'; });
    if (view === 'world') { const [w, inv] = await Promise.all([fetchJson('/api/admin/world'), fetchJson('/api/invasion').catch(() => null)]); return renderAdminWorld(content, w, inv); }
    if (view === 'reports') return renderAdminReports(content, await fetchJson('/api/admin/reports'));
    if (view === 'players') return renderAdminPlayers(content);
    if (view === 'team') return renderAdminTeam(content, await fetchJson('/api/admin/team'));
    if (view === 'log') { adminState.logBefore = null; return renderAdminLog(content, await fetchJson('/api/admin/log')); }
    if (view === 'announce') return await renderAdminAnnounce(content);   // await : une erreur passe par le catch ci-dessous
    if (view === 'stats') return await renderAdminStats(content);
    renderAdminOverview(content, await fetchJson('/api/admin/overview'));
  } catch (e) {
    console.warn('loadAdmin', e);
    if (/-> 403/.test(String(e?.message))) { content.innerHTML = '<div class="empty-state">Réservé à l\'équipe du jeu.</div>'; return; }
    renderLoadError(content, `loadAdmin('${view}')`);
  }
}

// ---- tableau de bord ----
function renderAdminOverview(content, d) {
  const card = (ico, label, value, onclick) => `<div class="admin-stat" ${onclick ? `onclick="${onclick}"` : ''}>${resIconHtml(ico)}<strong>${formatNum(value || 0)}</strong><small>${label}</small></div>`;
  const st = d.world;
  content.innerHTML = `
    <p class="diplo-help">Connecté en tant que <strong>${ROLE_LABEL[adminState.me.role]}</strong>${adminState.me.role === 'MODERATOR' ? ' : signalements, silence, suspensions jusqu\'à 7 jours, fiches des joueurs.' : '.'}</p>
    <div class="admin-stats">
      ${card('reports', 'signalements en attente', d.reports, "loadAdmin('reports')")}
      ${card('player', 'joueurs', d.players)}
      ${card('clock', 'actifs (24 h)', d.activeDay)}
      ${card('population', 'actifs (7 jours)', d.activeWeek)}
      ${card('lock', 'suspendus', d.suspended, "adminState.filter='sanctioned';loadAdmin('players')")}
      ${card('skull', 'bannis', d.banned, "adminState.filter='sanctioned';loadAdmin('players')")}
      ${card('spy', 'en silence', d.muted, "adminState.filter='sanctioned';loadAdmin('players')")}
      ${card('alliance', 'membres de l\'équipe', d.team, "loadAdmin('team')")}
    </div>
    ${st ? `<div class="world-card"><h4>${resIconHtml('map')} Monde ${st.world} · jour ${st.day}</h4>
      <p>${st.ended ? `Terminé le ${frDate(st.endedAt)} : ${escapeHtml(st.winner || '')}` : `Inscriptions ${st.registration.open ? 'ouvertes' : 'closes'} · sites de Merveille ${st.sitesOpen ? 'apparus' : `le ${frDate(st.wonderSitesAt)}`} · plans ${st.plansOpen ? 'apparus' : `le ${frDate(st.wonderPlansAt)}`}`}</p>
      ${adminCan('world') ? `<button class="btn btn-secondary btn-sm" onclick="loadAdmin('world')">Gérer le monde</button>` : ''}</div>` : ''}`;
}

// ---- monde (administrateur) ----
function renderAdminWorld(content, d, inv) {
  const st = d.state, S = d.settings, D = d.defaults;
  const field = (id, label, value, def, disabled, hint) => `<label class="admin-field"><span>${label}</span><input type="number" id="${id}" min="1" max="730" value="${value ?? ''}" placeholder="${def}" ${disabled ? 'disabled' : ''}><small>${hint}</small></label>`;
  content.innerHTML = `
    <div class="world-card">
      <h4>${resIconHtml('map')} Monde ${st.world} · jour ${st.day}</h4>
      <p>Ouvert le ${frDate(st.openedAt)} · ${st.registration.players.toLocaleString('fr-FR')} joueurs · ${formatNum(d.wonders)} Ville${d.wonders > 1 ? 's' : ''} Merveille</p>
      ${st.ended ? `<p class="bastion-fallen">${resIconHtml('crown')} Terminé le ${frDate(st.endedAt)} : ${escapeHtml(st.winner || '')}</p>` : ''}
      ${d.resetRequestedAt ? `<p class="famine-banner world-ended">${resIconHtml('clock')} Monde suivant demandé par ${escapeHtml(d.resetRequestedBy || '?')} le ${frDateTime(d.resetRequestedAt)} : il s'ouvre au prochain tour de jeu.</p>` : ''}
    </div>
    ${st.ended ? '' : `
    <h4>${resIconHtml('clock')} Calendrier</h4>
    <p class="diplo-help">Laissez vide pour la valeur par défaut (en gris). Les Immortels apparaissent au tour de jeu suivant le jour choisi.</p>
    <div class="admin-form">
      ${field('aw-reg', 'Inscriptions (jours)', S.registrationDays, D.registrationDays, false, `fin le ${frDate(st.registration.endsAt)}`)}
      ${field('aw-sites', 'Sites de Merveille (jour)', S.wonderSitesDay, D.wonderSitesDay, st.sitesOpen, st.sitesOpen ? 'déjà apparus' : `le ${frDate(st.wonderSitesAt)}`)}
      ${field('aw-plans', 'Plans de construction (jour)', S.wonderPlansDay, D.wonderPlansDay, st.plansOpen, st.plansOpen ? 'déjà apparus' : `le ${frDate(st.wonderPlansAt)}`)}
    </div>
    <div class="profile-actions">
      <button class="btn btn-primary" onclick="adminSaveCalendar()">Enregistrer le calendrier</button>
      ${!st.sitesOpen ? `<button class="btn btn-secondary" onclick="adminSpawnNow('sites', ${st.day})">Sites de Merveille maintenant</button>` : ''}
      ${st.sitesOpen && !st.plansOpen ? `<button class="btn btn-secondary" onclick="adminSpawnNow('plans', ${st.day})">Plans maintenant</button>` : ''}
    </div>
    <h4>${resIconHtml('player')} Inscriptions</h4>
    <p>${S.registrationClosed ? 'Fermées à la main.' : st.registration.open ? `Ouvertes jusqu'au ${frDate(st.registration.endsAt)} (${st.registration.players.toLocaleString('fr-FR')} / ${st.registration.maxPlayers.toLocaleString('fr-FR')}).` : 'Closes (durée écoulée ou monde complet).'}</p>
    <div class="profile-actions"><button class="btn btn-secondary" onclick="adminPost('/world/settings', { registrationClosed: ${!S.registrationClosed} }).then(r => r && loadAdmin('world'))">${S.registrationClosed ? 'Rouvrir les inscriptions' : 'Fermer les inscriptions'}</button></div>
    <h4>${resIconHtml('clock')} Décaler tout le calendrier</h4>
    <p class="diplo-help">Avancer de 3 jours : le monde passe du jour ${st.day} au jour ${st.day + 3} (inscriptions, sites et plans arrivent plus tôt). Repousser : l'inverse.</p>
    <div class="admin-inline"><input type="number" id="aw-shift" value="1" min="-60" max="60"> jours
      <button class="btn btn-secondary btn-sm" onclick="adminShift(1)">Avancer</button>
      <button class="btn btn-secondary btn-sm" onclick="adminShift(-1)">Repousser</button></div>`}
    <h4>${resIconHtml('skull')} Invasion barbare</h4>
    <p>${inv?.active ? `En cours jusqu'au ${frDateTime(inv.invasion.endsAt)} : ${inv.invasion.destroyed} donjon${inv.invasion.destroyed > 1 ? 's' : ''} détruit${inv.invasion.destroyed > 1 ? 's' : ''} sur ${inv.invasion.total}.` : `Chaque week-end (vendredi 18 h → dimanche 23 h)${inv?.nextStart ? ` ; la prochaine le ${frDateTime(inv.nextStart)}` : ''}.`}</p>
    <div class="admin-inline">${inv?.active
      ? `<button class="btn btn-secondary btn-sm" onclick="adminInvasion('end')">Terminer l'invasion</button>`
      : `<select id="aw-inv-hours">${[2, 12, 24, 48, 72].map(h => `<option value="${h}" ${h === 48 ? 'selected' : ''}>${h} h</option>`).join('')}</select> <button class="btn btn-secondary btn-sm" onclick="adminInvasion('start')">Lancer une invasion maintenant</button>`}</div>
    <div class="admin-danger">
      <h4>${resIconHtml('skull')} Fin du monde</h4>
      ${st.ended ? '' : `<p class="diplo-help">Terminer le monde maintenant : la Merveille la plus haute l'emporte s'il y en a une, le Panthéon et les titres sont donnés, le jeu se fige.</p>
      <button class="btn btn-danger" onclick="adminEndWorld()">Terminer le monde…</button>`}
      <p class="diplo-help">Ouvrir le monde suivant : tout le jeu repart à zéro sur une nouvelle carte ; les comptes, achats, cosmétiques, médailles, titres, sanctions et le Panthéon sont gardés. Les joueurs le rejoignent en choisissant leur civilisation.</p>
      ${st.ended ? '' : `<label class="admin-check"><input type="checkbox" id="aw-force"> Remettre à zéro sans terminer ce monde (pas de Panthéon pour lui)</label>`}
      <button class="btn btn-danger" ${d.resetRequestedAt ? 'disabled' : ''} onclick="adminNextWorld()">Ouvrir le monde suivant…</button>
    </div>`;
}
async function adminInvasion(action) {
  if (action === 'start') {
    const hours = Number(document.getElementById('aw-inv-hours')?.value) || 48;
    if (!(await confirmModal(`Lancer une invasion barbare de ${hours} h ? Les donjons apparaissent tout de suite et tous les joueurs sont prévenus.`, { title: 'Invasion', okLabel: 'Lancer' }))) return;
    if (await adminPost('/invasion/start', { hours })) loadAdmin('world');
  } else {
    if (!(await confirmModal('Terminer l\'invasion ? Les donjons restants repartent ; ceux déjà détruits ont donné leur trésor.', { title: 'Invasion', okLabel: 'Terminer', danger: true }))) return;
    if (await adminPost('/invasion/end')) loadAdmin('world');
  }
}
async function adminSaveCalendar() {
  const v = (id) => { const el = document.getElementById(id); return !el || el.disabled ? undefined : (el.value === '' ? null : Number(el.value)); };
  const body = {};
  for (const [id, k] of [['aw-reg', 'registrationDays'], ['aw-sites', 'wonderSitesDay'], ['aw-plans', 'wonderPlansDay']]) { const x = v(id); if (x !== undefined) body[k] = x; }
  if (await adminPost('/world/settings', body)) loadAdmin('world');
}
async function adminSpawnNow(kind, day) {
  const label = kind === 'sites' ? 'les 12 sites de Merveille' : 'les 13 plans de construction';
  if (!(await confirmModal(`Faire apparaître ${label} au prochain tour de jeu ? Tous les joueurs sont prévenus.`, { title: 'Immortels', okLabel: 'Faire apparaître' }))) return;
  if (await adminPost('/world/settings', kind === 'sites' ? { wonderSitesDay: day } : { wonderPlansDay: day })) loadAdmin('world');
}
async function adminShift(sign) {
  const n = Math.abs(Math.round(Number(document.getElementById('aw-shift')?.value) || 0));
  if (!n) return showToast('Indiquez un nombre de jours', 'error');
  if (!(await confirmModal(`${sign > 0 ? 'Avancer' : 'Repousser'} tout le calendrier de ${n} jour${n > 1 ? 's' : ''} ?`, { title: 'Calendrier' }))) return;
  if (await adminPost('/world/shift', { days: sign * n })) loadAdmin('world');
}
async function adminEndWorld() {
  const v = await promptModal('Le monde se fige : Panthéon, titres, plus aucune action de jeu. Tapez TERMINER pour confirmer.', { title: 'Terminer le monde', placeholder: 'TERMINER', maxLength: 12, okLabel: 'Terminer le monde' });
  if (!v) return;
  if (await adminPost('/world/end', { confirm: v })) { if (typeof loadWorldState === 'function') loadWorldState(true); loadAdmin('world'); }
}
async function adminNextWorld() {
  const force = !!document.getElementById('aw-force')?.checked;
  const v = await promptModal(`Tout le jeu repart à zéro sur une nouvelle carte${force ? ', sans Panthéon pour le monde en cours' : ''}. Tapez NOUVEAU MONDE pour confirmer.`, { title: 'Monde suivant', placeholder: 'NOUVEAU MONDE', maxLength: 16, okLabel: 'Ouvrir le monde suivant' });
  if (!v) return;
  if (await adminPost('/world/next', { confirm: v, force })) loadAdmin('world');
}

// ---- signalements ----
function renderAdminReports(content, d) {
  if (!d.reports.length) { content.innerHTML = '<div class="empty-state">Aucun signalement en attente.</div>'; return; }
  content.innerHTML = `<div class="admin-list">${d.reports.map(r => {
    const m = r.message, id = chatSafeId(r.id);
    return `<div class="admin-card">
      <div class="admin-card-head"><strong>${escapeHtml(m.sender?.name || '?')}</strong> <small>${escapeHtml(m.channel)} · ${frDateTime(m.createdAt)} · ${r.count} signalement${r.count > 1 ? 's' : ''}</small></div>
      <blockquote>${escapeHtml(m.text)}</blockquote>
      ${r.reasons.length ? `<small>Motifs : ${r.reasons.map(escapeHtml).join(' · ')}</small>` : ''}
      <div class="profile-actions">
        <button class="btn btn-secondary btn-sm" onclick="adminReport('${id}', 'dismiss')">Classer</button>
        <button class="btn btn-danger btn-sm" onclick="adminReport('${id}', 'delete')">Supprimer le message</button>
        <button class="btn btn-danger btn-sm" onclick="adminReport('${id}', 'mute')">Supprimer + silence 24 h</button>
        ${m.sender ? `<button class="btn btn-secondary btn-sm" onclick="openAdminPlayer('${chatSafeId(m.sender.id)}')">Fiche</button>` : ''}
      </div></div>`;
  }).join('')}</div>`;
}
async function adminReport(id, action) {
  if (await adminPost(`/reports/${id}`, { action, hours: 24 })) loadAdmin('reports');
}

// ---- joueurs ----
function sanctionBadges(s) {
  const out = [];
  if (s?.bannedAt) out.push(`<span class="admin-badge ban">Banni</span>`);
  if (s?.suspendedUntil) out.push(`<span class="admin-badge suspend">Suspendu → ${frDateTime(s.suspendedUntil)}</span>`);
  if (s?.mutedUntil) out.push(`<span class="admin-badge mute">Silence → ${frDateTime(s.mutedUntil)}</span>`);
  return out.join(' ');
}
function renderAdminPlayers(content) {
  content.innerHTML = `
    <div class="admin-inline">
      <input type="search" id="admin-q" placeholder="Pseudo${adminCan('email') ? ' ou e-mail' : ''} (2 lettres au moins)" value="${escapeHtml(adminState.q)}" onkeydown="if(event.key==='Enter'){adminState.filter='';adminSearch();}">
      <button class="btn btn-primary btn-sm" onclick="adminState.filter='';adminSearch()">Chercher</button>
      <button class="btn btn-secondary btn-sm" onclick="adminState.filter='sanctioned';adminSearch()">Sanctionnés</button>
    </div>
    <div id="admin-results" class="admin-list"></div>`;
  if (adminState.q || adminState.filter) adminSearch();
}
async function adminSearch() {
  adminState.q = (document.getElementById('admin-q')?.value || '').trim();
  const box = document.getElementById('admin-results');
  if (!box) return;
  if (!adminState.filter && adminState.q.length < 2) { box.innerHTML = '<p class="diplo-help">Tapez au moins 2 lettres du pseudo.</p>'; return; }
  try {
    const d = await fetchJson(`/api/admin/players?q=${encodeURIComponent(adminState.q)}&filter=${adminState.filter}`);
    box.innerHTML = d.players.length ? d.players.map(p => `
      <div class="ranking-row" onclick="openAdminPlayer('${chatSafeId(p.id)}')">
        <span class="ranking-name">${p.alliance ? `[${escapeHtml(p.alliance.tag)}] ` : ''}${escapeHtml(p.name)} ${p.role !== 'PLAYER' ? `<span class="admin-badge staff">${ROLE_LABEL[p.role]}</span>` : ''} ${sanctionBadges(p.sanctions)}
          <small>${escapeHtml(p.faction)} · ${formatNum(p.population)} hab. · vu ${frDateTime(p.lastSeenAt)}${p.email ? ` · ${escapeHtml(p.email)}` : ''}</small></span>
      </div>`).join('') : '<div class="empty-state">Aucun joueur trouvé.</div>';
  } catch (e) { renderLoadError(box, 'adminSearch()'); }
}
async function openAdminPlayer(id) {
  let d;
  try { d = await fetchJson(`/api/admin/players/${encodeURIComponent(id)}`); } catch (e) { showToast('Fiche indisponible', 'error'); return; }
  const p = d.player, s = p.sanctions, pid = chatSafeId(p.id), lim = adminState.me?.limits || {};
  const staffTarget = p.role !== 'PLAYER' && (p.role === 'ADMIN' || adminState.me?.role !== 'ADMIN');
  const histo = d.history.length ? d.history.map(h => `<li><strong>${ACTION_LABEL[h.action] || h.action}</strong> · ${frDateTime(h.createdAt)} · par ${escapeHtml(h.actorName)}${h.details?.reason ? ` : ${escapeHtml(h.details.reason)}` : ''}${h.details?.days ? ` (${h.details.days} j)` : h.details?.hours ? ` (${h.details.hours} h)` : ''}${h.details?.to ? ` → ${ROLE_LABEL[h.details.to] || h.details.to}` : ''}</li>`).join('') : '<li>Aucune action de l\'équipe.</li>';
  openSheetModal(`Fiche de ${escapeHtml(p.name)}`, `
    <div class="admin-sheet">
      <p>${p.alliance ? `[${escapeHtml(p.alliance.tag)}] ${escapeHtml(p.alliance.name)} · ` : ''}${escapeHtml(p.faction)} · ${formatNum(p.population)} hab. · ${p.cities} ville${p.cities > 1 ? 's' : ''}</p>
      <p><small>Compte créé le ${frDate(p.accountCreatedAt)} · vu ${frDateTime(p.lastSeenAt)}${p.email ? ` · ${escapeHtml(p.email)}` : ''} · ${ROLE_LABEL[p.role]} · ${d.reported} message${d.reported > 1 ? 's' : ''} signalé${d.reported > 1 ? 's' : ''}</small></p>
      <h4>Sanctions en cours</h4>
      <div class="admin-current">
        ${s.bannedAt ? `<div>${sanctionBadges({ bannedAt: s.bannedAt })} ${escapeHtml(s.banReason || '')} ${adminCan('ban') && !staffTarget ? `<button class="btn btn-secondary btn-sm" onclick="adminLift('${pid}', 'BAN')">Lever</button>` : ''}</div>` : ''}
        ${s.suspendedUntil ? `<div>${sanctionBadges({ suspendedUntil: s.suspendedUntil })} ${escapeHtml(s.suspendReason || '')} ${staffTarget ? '' : `<button class="btn btn-secondary btn-sm" onclick="adminLift('${pid}', 'SUSPEND')">Lever</button>`}</div>` : ''}
        ${s.mutedUntil ? `<div>${sanctionBadges({ mutedUntil: s.mutedUntil })} ${staffTarget ? '' : `<button class="btn btn-secondary btn-sm" onclick="adminLift('${pid}', 'MUTE')">Lever</button>`}</div>` : ''}
        ${!s.bannedAt && !s.suspendedUntil && !s.mutedUntil ? '<p>Aucune.</p>' : ''}
      </div>
      ${staffTarget ? '<p class="diplo-help">Membre de l\'équipe : sanction et levée impossibles.</p>' : `
      <h4>Sanctionner</h4>
      <textarea id="ap-reason" maxlength="300" rows="2" placeholder="Motif (le joueur le verra)"></textarea>
      <div class="admin-inline">
        <select id="ap-mute">${[1, 6, 24, 72, 168, 720].filter(h => h <= (lim.muteHours || 720)).map(h => `<option value="${h}" ${h === 24 ? 'selected' : ''}>${h < 24 ? `${h} h` : `${h / 24} j`}</option>`).join('')}</select>
        <button class="btn btn-secondary btn-sm" onclick="adminSanction('${pid}', 'MUTE')">Couper la messagerie</button>
      </div>
      <div class="admin-inline">
        <select id="ap-suspend">${[1, 3, 7, 14, 30].filter(x => x <= (lim.suspendDays || 7)).map(x => `<option value="${x}">${x} jour${x > 1 ? 's' : ''}</option>`).join('')}</select>
        <button class="btn btn-danger btn-sm" onclick="adminSanction('${pid}', 'SUSPEND')">Suspendre</button>
      </div>
      ${adminCan('ban') ? `<div class="admin-inline"><button class="btn btn-danger btn-sm" onclick="adminSanction('${pid}', 'BAN')">Bannir définitivement…</button></div>` : ''}`}
      ${adminCan('team') ? `<h4>Rôle</h4><div class="admin-inline"><select id="ap-role">${['PLAYER', 'MODERATOR', 'ADMIN'].map(r => `<option value="${r}" ${r === p.role ? 'selected' : ''}>${ROLE_LABEL[r]}</option>`).join('')}</select>
        <button class="btn btn-secondary btn-sm" onclick="adminSetRole('${pid}')">Changer le rôle</button></div>` : ''}
      <h4>Historique</h4><ul class="admin-history">${histo}</ul>
      ${d.recentMessages.length ? `<h4>Derniers messages</h4><ul class="admin-history">${d.recentMessages.map(m => `<li><small>${escapeHtml(m.channel)} · ${frDateTime(m.createdAt)}</small> ${escapeHtml(m.text)}</li>`).join('')}</ul>` : ''}
      <div class="profile-actions"><button class="btn btn-secondary" onclick="closeModal()">Fermer</button></div>
    </div>`);
}
async function adminSanction(id, kind) {
  const reason = (document.getElementById('ap-reason')?.value || '').trim();
  if (reason.length < 3) return showToast('Indiquez un motif (3 caractères au moins)', 'error');
  const body = { kind, reason };
  if (kind === 'MUTE') body.hours = Number(document.getElementById('ap-mute')?.value);
  if (kind === 'SUSPEND') body.days = Number(document.getElementById('ap-suspend')?.value);
  if (kind === 'BAN' && !(await confirmModal('Bannir définitivement ce compte ? Il ne pourra plus se connecter, dans aucun monde.', { title: 'Bannissement', okLabel: 'Bannir', danger: true }))) return;
  if (await adminPost(`/players/${id}/sanction`, body)) { openAdminPlayer(id); if (adminState.view === 'players') adminSearch(); }
}
async function adminLift(id, kind) {
  if (await adminPost(`/players/${id}/lift`, { kind })) { openAdminPlayer(id); if (adminState.view === 'players') adminSearch(); }
}
async function adminSetRole(id) {
  const role = document.getElementById('ap-role')?.value;
  if (role !== 'PLAYER' && !(await confirmModal(`Nommer ce joueur ${ROLE_LABEL[role].toLowerCase()} ? Il aura accès à l'écran d'administration.`, { title: 'Équipe' }))) return;
  if (await adminPost(`/players/${id}/role`, { role })) openAdminPlayer(id);
}

// ---- équipe, journal ----
function renderAdminTeam(content, d) {
  content.innerHTML = `
    <p class="diplo-help">${adminCan('team') ? 'Pour nommer ou retirer un membre, ouvrez sa fiche depuis l\'onglet Joueurs.' : 'Seuls les administrateurs gèrent l\'équipe.'}</p>
    <div class="ranking-list">${d.team.map(t => `<div class="ranking-row" onclick="openAdminPlayer('${chatSafeId(t.id)}')"><span class="ranking-name">${escapeHtml(t.name)} <small>vu ${frDateTime(t.lastSeenAt)}</small></span><span class="ranking-value">${ROLE_LABEL[t.role]}</span></div>`).join('') || '<div class="empty-state">Aucun membre.</div>'}</div>`;
}
const logLine = (l) => `<li><strong>${ACTION_LABEL[l.action] || escapeHtml(l.action)}</strong>${l.targetName ? ` · ${escapeHtml(l.targetName)}` : ''} <small>${frDateTime(l.createdAt)} · ${escapeHtml(l.actorName)}${l.details?.reason ? ` · ${escapeHtml(l.details.reason)}` : ''}${l.details?.days !== undefined && l.action === 'WORLD_SHIFT' ? ` · ${l.details.days > 0 ? '+' : ''}${l.details.days} j` : ''}</small></li>`;
function renderAdminLog(content, d) {
  adminState.logBefore = d.log.length === 50 ? d.log[d.log.length - 1].createdAt : null;
  content.innerHTML = `<ul class="admin-history" id="admin-log">${d.log.map(logLine).join('') || '<li>Journal vide.</li>'}</ul>
    <div class="profile-actions" id="admin-log-more">${adminState.logBefore ? '<button class="btn btn-secondary btn-sm" onclick="adminMoreLog()">Plus ancien</button>' : ''}</div>`;
}
async function adminMoreLog() {
  if (!adminState.logBefore) return;
  try {
    const d = await fetchJson(`/api/admin/log?before=${encodeURIComponent(adminState.logBefore)}`);
    document.getElementById('admin-log')?.insertAdjacentHTML('beforeend', d.log.map(logLine).join(''));
    adminState.logBefore = d.log.length === 50 ? d.log[d.log.length - 1].createdAt : null;
    if (!adminState.logBefore) document.getElementById('admin-log-more').innerHTML = '';
  } catch (e) { showToast('Journal indisponible', 'error'); }
}

// ---- annonces (administrateur) ----
async function renderAdminAnnounce(content) {
  const d = await fetchJson('/api/admin/announcements');
  const live = (a) => a.bannerUntil && new Date(a.bannerUntil) > new Date();
  content.innerHTML = `
    <div class="admin-card">
      <h4>${resIconHtml('send')} Nouvelle annonce à tous les joueurs</h4>
      <input type="text" id="an-title" maxlength="80" placeholder="Titre (maintenance ce soir, événement…)" class="admin-input">
      <textarea id="an-body" maxlength="500" rows="3" placeholder="Texte (500 caractères au plus)" class="admin-input"></textarea>
      <div class="admin-inline">
        <label>Bandeau en haut de l'écran <select id="an-banner">${[[0, 'aucun'], [6, '6 h'], [24, '24 h'], [72, '3 jours'], [168, '7 jours'], [720, '30 jours']].map(([h, l]) => `<option value="${h}" ${h === 24 ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="admin-check"><input type="checkbox" id="an-push" ${d.pushConfigured ? '' : 'disabled'}> Push sur les téléphones${d.pushConfigured ? '' : ' (push non configuré sur ce serveur)'}</label>
      </div>
      <p class="diplo-help">Chaque joueur la reçoit dans son fil de notifications ; le bandeau reste affiché jusqu'à la date choisie (chaque joueur peut le fermer).</p>
      <div class="profile-actions"><button class="btn btn-primary" onclick="adminSendAnnouncement()">Envoyer à tous les joueurs</button></div>
    </div>
    <h4>${resIconHtml('list')} Annonces envoyées</h4>
    <div class="admin-list">${d.announcements.map(a => `
      <div class="admin-card">
        <div class="admin-card-head"><strong>${escapeHtml(a.title)}</strong> <small>${frDateTime(a.createdAt)} · ${escapeHtml(a.authorName)} · ${a.recipients.toLocaleString('fr-FR')} joueurs${a.push ? ' · push' : ''}</small></div>
        <p>${escapeHtml(a.body)}</p>
        ${live(a) ? `<small>Bandeau jusqu'au ${frDateTime(a.bannerUntil)}</small> <button class="btn btn-secondary btn-sm" onclick="adminEndBanner('${chatSafeId(a.id)}')">Retirer le bandeau</button>` : ''}
      </div>`).join('') || '<div class="empty-state">Aucune annonce envoyée.</div>'}</div>`;
}
async function adminSendAnnouncement() {
  const title = (document.getElementById('an-title')?.value || '').trim(), body = (document.getElementById('an-body')?.value || '').trim();
  if (title.length < 3 || body.length < 3) return showToast('Titre et texte requis (3 caractères au moins)', 'error');
  const push = !!document.getElementById('an-push')?.checked;
  if (!(await confirmModal(`Envoyer « ${title} » à tous les joueurs${push ? ', avec un push sur leurs téléphones' : ''} ?`, { title: 'Annonce', okLabel: 'Envoyer' }))) return;
  if (await adminPost('/announcements', { title, body, bannerHours: Number(document.getElementById('an-banner')?.value) || 0, push })) { loadAdmin('announce'); loadAnnouncements(); }
}
async function adminEndBanner(id) {
  if (await adminPost(`/announcements/${id}/end`)) { loadAdmin('announce'); loadAnnouncements(); }
}

// ---- bandeau des annonces, pour tous les joueurs (fermé par le joueur : retenu sur l'appareil) ----
let announcementsTimer = null;
async function loadAnnouncements() {
  if (!token) return;
  let list = [];
  try { list = (await fetchJson('/api/announcements')).announcements || []; } catch (e) { return; }
  let closed = [];
  try { closed = JSON.parse(safeStorage.getItem('closed_announcements') || '[]'); } catch (e) { closed = []; }
  const show = list.filter(a => !closed.includes(a.id));
  let el = document.getElementById('announcement-banner');
  if (!show.length) { if (el) el.style.display = 'none'; }
  else {
    if (!el) {
      el = document.createElement('div'); el.id = 'announcement-banner';
      const anchor = document.querySelector('header.top-bar');
      if (!anchor) return;
      anchor.parentNode.insertBefore(el, anchor.nextSibling);
    }
    el.style.display = '';
    el.innerHTML = show.map(a => `<div class="announcement-item">${resIconHtml('send')} <strong>${escapeHtml(a.title)}</strong> <span>${escapeHtml(a.body)}</span><button class="banner-close" aria-label="Fermer" onclick="closeAnnouncement('${chatSafeId(a.id)}')">×</button></div>`).join('');
  }
  if (!announcementsTimer) announcementsTimer = setInterval(loadAnnouncements, 5 * 60 * 1000);
}
function closeAnnouncement(id) {
  let closed = [];
  try { closed = JSON.parse(safeStorage.getItem('closed_announcements') || '[]'); } catch (e) { closed = []; }
  closed = [...closed.filter(x => x !== id), id].slice(-30);
  try { safeStorage.setItem('closed_announcements', JSON.stringify(closed)); } catch (e) { /* stockage indisponible : fermé pour cette session */ }
  loadAnnouncements();
}

// ---- statistiques (administrateur) : une couleur par graphique, titre qui le nomme, infobulle, tableau des valeurs ----
const shortDay = (d) => new Date(d + 'T12:00:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
function barChart(title, points, unit) {
  const max = Math.max(1, ...points.map(p => p.v));
  const total = points.reduce((t, p) => t + p.v, 0);
  const last = points[points.length - 1];
  const peak = points.reduce((a, b) => (b.v > a.v ? b : a), points[0]);
  return `<figure class="admin-chart">
    <figcaption><strong>${title}</strong> <small>${formatNum(total)} sur 30 jours · aujourd'hui ${formatNum(last?.v || 0)}</small></figcaption>
    <div class="admin-bars" role="img" aria-label="${escapeHtml(title)} : ${formatNum(total)} sur 30 jours">
      ${points.map(p => `<div class="admin-bar-col" data-tip="${shortDay(p.d)} : ${p.v.toLocaleString('fr-FR')} ${unit}"><span class="admin-bar" style="height:${p.v ? Math.max(2, Math.round(100 * p.v / max)) : 0}%"></span>${p === peak && p.v ? `<em class="admin-bar-label">${formatNum(p.v)}</em>` : ''}</div>`).join('')}
    </div>
    <div class="admin-axis"><span>${shortDay(points[0].d)}</span><span>${shortDay(last.d)}</span></div>
    <details><summary>Tableau</summary><table class="admin-table">${points.slice().reverse().map(p => `<tr><td>${shortDay(p.d)}</td><td>${p.v.toLocaleString('fr-FR')}</td></tr>`).join('')}</table></details>
  </figure>`;
}
function hBars(title, rows, total) {
  const max = Math.max(1, ...rows.map(r => r.n));
  return `<figure class="admin-chart"><figcaption><strong>${title}</strong></figcaption>
    ${rows.map(r => `<div class="admin-hbar-row" data-tip="${escapeHtml(r.label)} : ${r.n.toLocaleString('fr-FR')}${total ? ` (${Math.round(100 * r.n / Math.max(1, total))} %)` : ''}"><span class="admin-hbar-label">${escapeHtml(r.label)}</span><span class="admin-hbar-track"><span class="admin-hbar" style="width:${r.n ? Math.max(1, Math.round(100 * r.n / max)) : 0}%"></span></span><span class="admin-hbar-value">${r.n.toLocaleString('fr-FR')}${total ? ` · ${Math.round(100 * r.n / Math.max(1, total))} %` : ''}</span></div>`).join('') || '<p class="diplo-help">Rien sur la période.</p>'}
  </figure>`;
}
const pct = (x) => (x === null || x === undefined ? '—' : `${Math.round(100 * x)} %`);
async function renderAdminStats(content) {
  const s = await fetchJson('/api/admin/stats');
  const factionName = { ROME: 'Rome', GAUL: 'Gaule', GREEK: 'Grèce', EGYPT: 'Égypte', HUN: 'Huns', SULTAN: 'Sultanat' };
  const players = s.factions.reduce((t, f) => t + f.n, 0);
  const tile = (label, value, sub) => `<div class="admin-stat"><strong>${value}</strong><small>${label}</small>${sub ? `<small>${sub}</small>` : ''}</div>`;
  content.innerHTML = `
    <p class="diplo-help">30 derniers jours, jours de Paris. Joueur actif : au moins une ouverture du jeu dans la journée.</p>
    <div class="admin-stats">
      ${tile('inscriptions', formatNum(s.signups.reduce((t, p) => t + p.v, 0)))}
      ${tile('rétention J1', pct(s.retention.d1), `sur ${formatNum(s.retention.n1)} comptes`)}
      ${tile('rétention J7', pct(s.retention.d7), `sur ${formatNum(s.retention.n7)} comptes`)}
      ${tile('achats', formatNum(s.purchases.days.reduce((t, p) => t + p.v, 0)))}
      ${tile('ressources échangées', formatNum(s.tradeVolume))}
    </div>
    <div class="admin-charts">
      ${barChart('Inscriptions par jour', s.signups, 'comptes')}
      ${barChart('Joueurs actifs par jour', s.active, 'joueurs')}
      ${barChart('Achats par jour', s.purchases.days, 'achats')}
      ${barChart('Combats par jour', s.battles, 'combats')}
      ${barChart('Échanges au marché par jour', s.trades, 'échanges')}
    </div>
    <div class="admin-charts">
      ${hBars('Entonnoir du tutoriel (nouveaux joueurs)', s.funnel.map(f => ({ label: f.label, n: f.n })), s.funnel[0]?.n || 0)}
      ${hBars('Achats par produit', s.purchases.products.map(p => ({ label: p.name, n: p.n })))}
      ${hBars('Civilisations', s.factions.map(f => ({ label: factionName[f.faction] || f.faction, n: f.n })), players)}
    </div>`;
}
