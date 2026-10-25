// ========== FIL DE NOTIFICATIONS (décision du 25 octobre 2026) ==========
// Chaque alerte du jeu est d'abord un message ici, avec un lien vers ce qu'elle concerne ; le push mobile en découle.
// Lien (serveur : services/pushService.normalizeLink) : { to: 'map'|'report'|'spy'|'army'|'siege'|'city', x, y,
// cityId, reportId, armyId }.

let notifItems = [];
let notifLatestSeen = null;   // id of the newest notification already known (a newer one shows a toast)

function setNotifBadge(n) {
  const el = document.getElementById('notif-badge');
  if (!el) return;
  el.textContent = n > 99 ? '99+' : String(n);
  el.style.display = n > 0 ? '' : 'none';
}

// Polled with the game refresh: the badge, and a toast for a notification that just arrived
async function refreshNotificationBadge() {
  if (typeof token === 'undefined' || !token) return;
  try {
    const res = await fetch(`${API}/api/notifications/unread`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return;
    const { unread, latest } = await res.json();
    setNotifBadge(unread || 0);
    if (latest && notifLatestSeen !== null && latest.id !== notifLatestSeen && !latest.readAt) showToast(`🔔 ${latest.title}`, 'info');
    notifLatestSeen = latest?.id || '';
  } catch (e) { /* offline: the next refresh tries again */ }
}

function notifTimeAgo(date) {
  const s = Math.max(0, Math.floor((serverNow() - new Date(date).getTime()) / 1000));
  if (s < 60) return 'à l\'instant';
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return new Date(date).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

const NOTIF_LINK_LABEL = { map: 'Voir sur la carte', report: 'Voir le rapport', spy: 'Voir le rapport', army: 'Voir l\'armée', siege: 'Voir le siège', city: 'Voir la ville' };

async function openNotifications() {
  try {
    const res = await fetch(`${API}/api/notifications?limit=50`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Erreur');
    notifItems = data.items || [];
    setNotifBadge(data.unread || 0);
    if (notifItems[0]) notifLatestSeen = notifItems[0].id;
  } catch (e) { showToast(e.message || 'Erreur réseau', 'error'); return; }
  const rows = notifItems.map(n => `
    <li class="notif-item${n.readAt ? '' : ' unread'}" role="button" tabindex="0" onclick="openNotification('${n.id}')" onkeydown="if(event.key==='Enter')openNotification('${n.id}')">
      <div class="notif-head"><strong>${escapeHtml(n.title)}</strong><span class="notif-time">${notifTimeAgo(n.createdAt)}</span></div>
      <div class="notif-body">${escapeHtml(n.body)}</div>
      ${n.link?.to ? `<span class="notif-link">${NOTIF_LINK_LABEL[n.link.to] || 'Ouvrir'} ›</span>` : ''}
    </li>`).join('');
  document.getElementById('modal-body').innerHTML = `
    <div class="notif-panel">
      <h3><img class="ico" src="assets/images/3d/ui/reports.webp" alt=""> Notifications</h3>
      ${notifItems.length ? `<ul class="notif-list">${rows}</ul>` : '<p class="empty-state">Aucune notification pour l\'instant.</p>'}
      <div class="notif-actions">
        ${notifItems.some(n => !n.readAt) ? '<button class="btn btn-secondary" onclick="markAllNotificationsRead()">Tout marquer comme lu</button>' : ''}
        <button class="btn btn-secondary" onclick="closeModal()">Fermer</button>
      </div>
    </div>`;
  document.getElementById('modal').style.display = 'flex';
}

async function markNotificationsRead(body) {
  try {
    const res = await fetch(`${API}/api/notifications/read`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    if (res.ok) setNotifBadge(data.unread || 0);
  } catch (e) { /* the badge is fixed by the next refresh */ }
}

async function markAllNotificationsRead() {
  await markNotificationsRead({ all: true });
  notifItems.forEach(n => { n.readAt = n.readAt || new Date().toISOString(); });
  document.querySelectorAll('.notif-item.unread').forEach(el => el.classList.remove('unread'));
}

async function openNotification(id) {
  const n = notifItems.find(x => x.id === id);
  if (!n) return;
  if (!n.readAt) markNotificationsRead({ ids: [id] });
  closeModal();
  openNotificationLink(n.link);
}

// Scroll to a card of a list that is still loading, and light it up for a moment; `onMissing` runs when it never shows
function focusCard(selector, tries = 30, onMissing = null) {
  const el = document.querySelector(selector);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.add('notif-focus');
    setTimeout(() => el.classList.remove('notif-focus'), 2500);
    return;
  }
  if (tries > 0) setTimeout(() => focusCard(selector, tries - 1, onMissing), 150);
  else if (onMissing) onMissing();
}

// A report older than the loaded list: fetched by id and put at the top of the list
async function showReportById(kind, id) {
  try {
    const res = await fetch(`${API}/api/reports/${kind === 'spy' ? 'spy' : 'battles'}/${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) { showToast('Ce rapport n\'existe plus (les rapports sont gardés 30 jours)', 'info'); return; }
    const r = await res.json();
    if (kind === 'spy') {
      if (typeof spyReports !== 'undefined' && Array.isArray(spyReports) && typeof renderSpyReports === 'function') { spyReports.unshift(r); renderSpyReports(); }
    } else {
      const list = document.getElementById('reports-list');
      if (!list || typeof renderBattleReportCard !== 'function') return;
      window.battleReports = window.battleReports || [];
      const idx = window.battleReports.push(r) - 1;
      list.insertAdjacentHTML('afterbegin', renderBattleReportCard(r, idx));
    }
    focusCard(`[data-report-id="${String(id).replace(/[^\w-]/g, '')}"]`, 5);
  } catch (e) { showToast('Erreur réseau', 'error'); }
}

function centerMapOn(x, y) {
  if (typeof mapOffsetX === 'undefined' || !Number.isFinite(x) || !Number.isFinite(y)) return;
  mapOffsetX = Math.max(MIN_COORD, Math.min(MAX_COORD, x));
  mapOffsetY = Math.max(MIN_COORD, Math.min(MAX_COORD, y));
  if (typeof loadMap === 'function') loadMap();
}

// Opens what a notification is about. The link comes from the server or from a push (whose values are strings).
function openNotificationLink(link) {
  if (!link) return;
  const num = (v) => (v === undefined || v === null || v === '' ? NaN : Number(v));
  const x = num(link.x), y = num(link.y);
  switch (link.to) {
    case 'map':
      showTab('map');
      centerMapOn(x, y);
      break;
    case 'siege':
      showTab('map');
      centerMapOn(x, y);
      if (link.cityId && typeof openBreakSiege === 'function') openBreakSiege(link.cityId);
      break;
    case 'report':
    case 'spy':
      showTab('reports');
      if (typeof showReportsTab === 'function') showReportsTab(link.to === 'spy' ? 'spy' : 'battles');
      if (link.reportId) focusCard(`[data-report-id="${String(link.reportId).replace(/[^\w-]/g, '')}"]`, 30, () => showReportById(link.to, link.reportId));
      break;
    case 'army': {
      const army = (typeof armies !== 'undefined' ? armies : []).find(a => a.id === link.armyId);
      if (army && army.cityId && currentCity?.id !== army.cityId && typeof selectCity === 'function') selectCity(army.cityId);
      showTab('army');
      if (link.armyId) focusCard(`[data-army-id="${String(link.armyId).replace(/[^\w-]/g, '')}"]`);
      break;
    }
    case 'city':
      if (link.cityId && typeof cities !== 'undefined' && cities.some(c => c.id === link.cityId) && typeof selectCity === 'function') selectCity(link.cityId);
      showTab('city');
      break;
    default:
      showTab(link.tab || 'city');
  }
}
