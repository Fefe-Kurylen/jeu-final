// ============================================================
// 09e-quests.js — Quêtes façon Travian (décision du 26 octobre 2026) : bouton flottant « Quêtes » au-dessus de la
// barre du bas (pastille des récompenses à prendre), panneau à onglets (tutoriel, tâches, jour, semaine, succès),
// bandeau de l'étape du tutoriel avec « Aller » (ouvre le bon écran et un doigt montre où toucher) et « Récupérer ».
// Récompenses : ressources, livrées dans la ville affichée. Portée globale partagée (ordre de index.html).
// ============================================================
let questsData = null, questsLoadedAt = 0, questTab = 'tutorial';

async function loadQuests(force = false) {
  if (!token) return null;
  if (!force && questsData && Date.now() - questsLoadedAt < 15000) return questsData;
  try {
    questsData = await fetchJson('/api/quests');
    questsLoadedAt = Date.now();
    if (player) player.questsClaimable = questsData.claimable;
  } catch (e) { /* garde la dernière vue */ }
  updateQuestBadge();
  renderTutorialBar();
  return questsData;
}
// rafraîchi avec le jeu (toutes les 15 s) : la pastille vient de /api/player/me, le bandeau du tutoriel relit ses quêtes
function refreshQuestsLight() {
  updateQuestBadge();
  if (questsData && !questsData.tutorial?.finished && Date.now() - questsLoadedAt > 20000) loadQuests(true);
}
function updateQuestBadge() {
  const n = questsData && Date.now() - questsLoadedAt < 20000 ? questsData.claimable : (player?.questsClaimable || 0);
  if (typeof setBadge === 'function') setBadge('quest-badge', n);
  document.getElementById('quest-fab')?.classList.toggle('has-reward', n > 0);
}

// ---- affichage commun ----
function questRewardHtml(r) {
  return `<span class="quest-reward">${TECH_RESOURCES.filter(k => r?.[k] > 0).map(k => `<span>${resIconHtml(k)} ${formatNum(r[k])}</span>`).join('')}</span>`;
}
function questBar(q) {
  const pct = Math.min(100, Math.round(100 * (q.progress || 0) / Math.max(1, q.target || 1)));
  return `<span class="quest-bar"><span style="width:${pct}%"></span></span><small class="quest-count">${formatNum(q.progress || 0)} / ${formatNum(q.target || 1)}</small>`;
}
function questActions(q) {
  if (q.claimed) return '<span class="quest-done-tag">Récupérée</span>';
  if (q.claimable) return `<button class="btn btn-primary btn-sm" onclick="claimQuest('${chatSafeId(q.key).replace(/[^\w:]/g, '')}', this)">Récupérer</button>`;
  return q.go ? `<button class="btn btn-secondary btn-sm" onclick="questGoTo('${chatSafeId(q.key).replace(/[^\w:]/g, '')}')">Aller</button>` : '';
}
function questCard(q) {
  return `<div class="quest-card${q.claimable ? ' ready' : ''}${q.claimed ? ' claimed' : ''}${q.bonus ? ' bonus' : ''}">
    <div class="quest-head"><strong>${escapeHtml(q.title)}</strong>${q.steps ? `<small> · palier ${q.step}/${q.steps}</small>` : ''}</div>
    <div class="quest-text">${escapeHtml(q.text)}</div>
    <div class="quest-progress">${questBar(q)}</div>
    <div class="quest-foot">${questRewardHtml(q.reward)}<span class="quest-actions">${questActions(q)}</span></div>
  </div>`;
}
function questByKey(key) {
  const d = questsData;
  if (!d) return null;
  return [d.tutorial?.current, ...(d.tasks || []), ...(d.daily?.quests || []), d.daily?.bonus, ...(d.weekly?.quests || []), d.weekly?.bonus, ...(d.achievements || [])].find(q => q && q.key === key) || null;
}
const questLeft = (iso) => { const ms = new Date(iso) - (typeof serverNow === 'function' ? serverNow() : Date.now()); const h = Math.max(0, Math.floor(ms / 3600000)); return h >= 24 ? `${Math.floor(h / 24)} j ${h % 24} h` : `${h} h ${Math.max(0, Math.floor(ms % 3600000 / 60000))} min`; };

// ---- panneau ----
async function openQuests(tab) {
  await loadQuests(true);
  const d = questsData;
  if (!d) { showToast('Quêtes indisponibles pour le moment', 'error'); return; }
  if (tab) questTab = tab;
  if (questTab === 'tutorial' && d.tutorial.finished) questTab = 'tasks';
  const count = (list) => list.filter(q => q && q.claimable).length;
  const tabs = [
    !d.tutorial.finished && ['tutorial', 'Tutoriel', d.tutorial.current?.claimable ? 1 : 0],
    ['tasks', 'Tâches', count(d.tasks)],
    ['daily', 'Du jour', count([...d.daily.quests, d.daily.bonus])],
    ['weekly', 'Semaine', count([...d.weekly.quests, d.weekly.bonus])],
    ['achievements', 'Succès', count(d.achievements)]
  ].filter(Boolean);
  const body = {
    tutorial: () => d.tutorial.current ? `
      <p class="diplo-help">Étape ${d.tutorial.current.index} sur ${d.tutorial.total}. Le tutoriel vous guide pendant vos premières heures ; chaque étape rapporte des ressources.</p>
      ${questCard(d.tutorial.current)}
      <button class="btn btn-secondary btn-sm quest-skip" onclick="skipTutorial()">Passer le tutoriel</button>` : '<p class="empty-state">Tutoriel terminé.</p>',
    tasks: () => `<p class="diplo-help">Les tâches suivent la croissance de votre capitale, palier après palier ; la récompense aide à payer le palier suivant.</p>${d.tasks.map(questCard).join('') || '<p class="empty-state">Toutes les tâches sont accomplies.</p>'}`,
    daily: () => `<p class="diplo-help">Nouvelles quêtes dans ${questLeft(d.daily.resetsAt)}. Récompense : une demi-heure de production de vos villes par quête, une heure pour la journée accomplie.</p>${[...d.daily.quests, d.daily.bonus].map(questCard).join('')}`,
    weekly: () => `<p class="diplo-help">Nouvelles quêtes dans ${questLeft(d.weekly.resetsAt)} (chaque lundi). Récompense : une heure et demie de production par quête, deux heures pour la semaine accomplie.</p>${[...d.weekly.quests, d.weekly.bonus].map(questCard).join('')}`,
    achievements: () => `<p class="diplo-help">Les succès comptent tout ce que vous avez accompli depuis le début ; chaque palier rapporte un peu plus.</p>${d.achievements.map(questCard).join('') || '<p class="empty-state">Tous les succès sont obtenus.</p>'}`
  };
  openSheetModal('Quêtes', `
    <div class="quests-panel">
      <div class="quest-tabs">${tabs.map(([k, label, n]) => `<button class="quest-tab${k === questTab ? ' active' : ''}" onclick="openQuests('${k}')">${label}${n ? ` <span class="tab-badge">${n}</span>` : ''}</button>`).join('')}</div>
      <div class="quest-list">${body[questTab]()}</div>
      <p class="diplo-help">Les ressources arrivent dans la ville affichée (${escapeHtml(currentCity?.name || 'votre capitale')}), dans la limite de son entrepôt et de son grenier.</p>
    </div>`);
}

async function claimQuest(key, btn) {
  if (btn) btn.disabled = true;
  try {
    const res = await fetch(`${API}/api/quests/${encodeURIComponent(key)}/claim`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ cityId: currentCity?.id || null }) });
    const data = await res.json().catch(() => ({}));
    showToast(res.ok ? data.message : (data.error || 'Erreur'), res.ok ? 'success' : 'error');
    if (res.ok && typeof track === 'function') track('quest_claim', { key });
    if (res.ok && typeof refreshData === 'function') refreshData(true);
  } catch (e) { showToast('Erreur réseau', 'error'); }
  await loadQuests(true);
  if (document.querySelector('#modal .quests-panel') && document.getElementById('modal').style.display !== 'none') openQuests();
}

async function skipTutorial() {
  if (!(await confirmModal('Passer le tutoriel ? Les tâches, les quêtes du jour et les succès restent dans le panneau Quêtes.', { title: 'Passer le tutoriel', okLabel: 'Passer' }))) return;
  try {
    const res = await fetch(`${API}/api/quests/tutorial/skip`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json().catch(() => ({}));
    showToast(res.ok ? data.message : (data.error || 'Erreur'), res.ok ? 'info' : 'error');
  } catch (e) { showToast('Erreur réseau', 'error'); }
  stopQuestFinger();
  await loadQuests(true);
  openQuests('tasks');
}

// ---- bandeau du tutoriel ----
let tutorialBarHidden = false;
function renderTutorialBar() {
  let bar = document.getElementById('tutorial-bar');
  const t = questsData?.tutorial;
  const step = t && !t.finished ? t.current : null;
  if (!step || tutorialBarHidden || !document.getElementById('game-screen')?.offsetParent) { if (bar) bar.style.display = 'none'; document.body.classList.remove('has-tutorial-bar'); return; }
  document.body.classList.add('has-tutorial-bar');
  if (!bar) { bar = document.createElement('div'); bar.id = 'tutorial-bar'; bar.className = 'tutorial-bar'; document.body.appendChild(bar); }
  bar.style.display = '';
  bar.innerHTML = `
    <div class="tb-step">${step.index}/${t.total}</div>
    <div class="tb-main"><strong>${escapeHtml(step.title)}</strong><span>${escapeHtml(step.text)}</span>${questBar(step)}</div>
    <div class="tb-actions">
      ${step.claimable ? `<button class="btn btn-primary btn-sm" onclick="claimQuest('${step.key}', this)">Récupérer</button>` : `<button class="btn btn-primary btn-sm" onclick="questGoTo('${step.key}')">Aller</button>`}
      <button class="tb-close" aria-label="Masquer le tutoriel" title="Masquer (le tutoriel reste dans Quêtes)" onclick="tutorialBarHidden = true; renderTutorialBar(); stopQuestFinger()">×</button>
    </div>`;
  placeQuestUi();
  document.documentElement.style.setProperty('--tb-h', `${bar.offsetHeight}px`);
}
// le bouton flottant et le bandeau se posent au-dessus de la barre du bas
function placeQuestUi() {
  const h = document.getElementById('bottom-nav')?.offsetHeight || 0;
  document.documentElement.style.setProperty('--bnav-h', `${h}px`);
}
window.addEventListener('resize', () => placeQuestUi());

// ---- « Aller » : ouvre l'écran et montre où toucher ----
function questGoTo(key) {
  const q = questByKey(key);
  const go = q?.go;
  if (!go) return;
  closeModal();
  if (typeof closeBuildPanel === 'function') closeBuildPanel();
  const citySel = ['#city-actions .ca-btn.primary'];
  if (go.field) {
    showTab('city');
    const fields = (typeof citySlots !== 'undefined' ? citySlots : []).filter(s => s.isField && (go.field === 'ANY' ? true : s.fieldType === go.field));
    const levelOf = (s) => (typeof getFieldBuildingAtSlot === 'function' ? getFieldBuildingAtSlot(s.slot, s.fieldType)?.level || 0 : 0);
    const target = go.field === 'ANY' ? fields.filter(s => levelOf(s) > 0).sort((a, b) => levelOf(b) - levelOf(a))[0] : fields.sort((a, b) => levelOf(a) - levelOf(b))[0];
    if (target) setTimeout(() => { focusCitySlot(target.slot); pointQuestFinger([...citySel, '#build-panel .build-option-btn:not([disabled]), #build-panel .upgrade-btn:not([disabled])']); }, 120);
    return;
  }
  if (go.building) {
    showTab('city');
    const b = (currentCity?.buildings || []).filter(x => x.key === go.building).sort((a, c) => c.level - a.level)[0];
    const slots = typeof citySlots !== 'undefined' ? citySlots : [];
    let slot = go.building === 'MAIN_HALL' ? 0 : b?.slot;
    let chain = [...citySel, ...(go.recruit ? ['.unit-recruit-body', '#recruit-btn'] : ['#build-panel .upgrade-btn:not([disabled])'])];
    if (slot === undefined || slot === null) {
      const empty = slots.find(s => !s.isField && !s.fixed && !getBuildingAtSlot(s.slot));
      if (!empty) { showToast('Aucun emplacement libre dans cette ville', 'info'); return; }
      slot = empty.slot;
      chain = [...citySel, `#build-panel .build-option-card[onclick*="'${go.building}'"]`];
    }
    setTimeout(() => { focusCitySlot(slot); pointQuestFinger(chain); }, 120);
    return;
  }
  if (go.tab === 'map' && go.tribe) {
    showTab('map');
    showToast('Touchez un point de ressource gardé par une tribu près de votre ville, puis « Attaquer » avec une armée', 'info');
    return;
  }
  if (go.tab) {
    showTab(go.tab);
    const hints = { army: ['#armies-management .army-card-new.empty', '#armies-management button[onclick*="createArmy"]'], hero: ['button[onclick*="startExpedition"]', '.expedition-card button'] }[go.tab];
    if (hints) setTimeout(() => pointQuestFinger(hints), 400);
  }
}

// Le doigt : un anneau qui pulse autour de l'élément à toucher et une flèche qui rebondit au-dessus ; une chaîne de
// sélecteurs (la bulle, puis le bouton du panneau qu'elle ouvre…), chacun attendu jusqu'à 12 s, passé au suivant au toucher
let questFinger = null;
function stopQuestFinger() {
  if (!questFinger) return;
  cancelAnimationFrame(questFinger.raf);
  clearTimeout(questFinger.wait);
  questFinger.el?.remove();
  questFinger.target?.removeEventListener('click', questFinger.onClick, true);
  questFinger = null;
}
const visibleEl = (sel) => [...document.querySelectorAll(sel)].find(e => e.offsetParent !== null && e.getBoundingClientRect().width > 0);
function pointQuestFinger(chain, i = 0, tries = 0) {
  stopQuestFinger();
  if (i >= chain.length) return;
  const target = visibleEl(chain[i]);
  if (!target) {
    if (tries < 60) questFinger = { wait: setTimeout(() => pointQuestFinger(chain, i, tries + 1), 200) };
    else pointQuestFinger(chain, i + 1);
    return;
  }
  const el = document.createElement('div');
  el.className = 'quest-finger';
  el.innerHTML = '<span class="qf-ring"></span><span class="qf-arrow"></span>';
  document.body.appendChild(el);
  const onClick = () => setTimeout(() => pointQuestFinger(chain, i + 1), 250);
  target.addEventListener('click', onClick, true);
  questFinger = { el, target, onClick, until: Date.now() + 30000 };
  const follow = () => {
    if (!questFinger || questFinger.el !== el) return;
    if (!document.body.contains(target) || target.offsetParent === null || Date.now() > questFinger.until) { pointQuestFinger(chain, i + 1); return; }
    const r = target.getBoundingClientRect();
    el.style.left = `${r.left + r.width / 2}px`; el.style.top = `${r.top + r.height / 2}px`;
    el.style.setProperty('--qf-w', `${Math.max(44, r.width + 14)}px`); el.style.setProperty('--qf-h', `${Math.max(44, r.height + 14)}px`);
    questFinger.raf = requestAnimationFrame(follow);
  };
  follow();
}
