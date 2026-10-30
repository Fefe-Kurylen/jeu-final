// ============================================================
// 09c-chat.js — Messagerie (décision du 26 octobre 2026) : messages privés, chat d'alliance, chat global, canal des amis.
// Relevé toutes les 2,5 s quand l'onglet est ouvert, toutes les 15 s sinon (badge) ; partage de rapports et de positions ;
// traduction automatique (DeepL côté serveur) ; signaler, bloquer ; amis sur demande acceptée.
// ============================================================
const chatState = {
  overview: null, settings: { lang: null, autoTranslate: true, translation: false }, languages: {},
  active: null, messages: [], lastAt: null, oldestAt: null, noOlder: false, timer: null, tick: 0,
  translations: {}, showOriginal: {}, attachment: null, langSent: false, maxLength: 500
};
const CHAT_POLL_MS = 2500;
const chatSafeId = (v) => String(v || '').replace(/[^\w:-]/g, '');
// un texte passé à une fonction dans un attribut onclick : chaîne JavaScript (JSON), puis échappée pour l'attribut
const chatJsArg = (v) => escapeHtml(JSON.stringify(String(v ?? '')));
const chatHeaders = () => ({ Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });
async function chatFetch(path, opts = {}) {
  const res = await fetch(`${API}${path}`, { ...opts, headers: chatHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw Object.assign(new Error(data.error || 'Erreur réseau'), { status: res.status });
  return data;
}
// langue du joueur : celle de ses réglages, sinon celle de l'appareil
function chatMyLang() {
  const nav = String((navigator.languages && navigator.languages[0]) || navigator.language || 'fr').toLowerCase().split(/[-_]/)[0];
  return chatState.settings.lang || (chatState.languages[nav] ? nav : 'fr');
}
function chatTime(iso) {
  const d = new Date(iso), now = new Date();
  const hm = d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  return d.toDateString() === now.toDateString() ? hm : `${d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' })} ${hm}`;
}
function chatChannelTitle(key) {
  if (key === 'global') return 'Chat global';
  if (key === 'alliance') { const a = chatState.overview?.channels.find(c => c.key === 'alliance')?.alliance; return a ? `Alliance [${escapeHtml(a.tag)}]` : 'Alliance'; }
  if (key === 'friends') return 'Amis';
  const c = chatState.overview?.conversations.find(x => x.key === key);
  return c ? `${c.player.tag ? `[${escapeHtml(c.player.tag)}] ` : ''}${escapeHtml(c.player.name)}` : escapeHtml(chatState.pendingName || 'Message privé');
}

// ---- vue d'ensemble et badge (setBadge : 09d-alliance.js) ----
async function refreshChatOverview() {
  try {
    const o = await chatFetch('/api/chat/overview');
    chatState.overview = o;
    chatState.settings = o.settings || chatState.settings;
    chatState.languages = o.languages || {};
    chatState.maxLength = o.maxLength || 500;
    setBadge('chat-badge', (o.unread || 0) + (o.friendRequests || 0));
    // première visite : la langue des messages du joueur est celle de son appareil
    if (!chatState.langSent && !o.settings?.lang) {
      chatState.langSent = true;
      const lang = chatMyLang();
      chatFetch('/api/chat/settings', { method: 'PUT', body: JSON.stringify({ lang }) }).then(() => { chatState.settings.lang = lang; }).catch(() => {});
    }
    return o;
  } catch (e) { return null; }
}
// appelé par le rafraîchissement du jeu (toutes les 15 s) : le badge, et la liste quand l'onglet est ouvert
async function refreshChatBadge() {
  if (!token) return;
  await refreshChatOverview();
  if (chatTabActive()) renderChatList();
}
const chatTabActive = () => !!document.getElementById('tab-messages')?.classList.contains('active');

// ---- onglet ----
async function loadChat() {
  const list = document.getElementById('chat-list');
  if (list && !chatState.overview) list.innerHTML = '<p class="empty-state">Chargement…</p>';
  await refreshChatOverview();
  renderChatList();
  const wide = window.matchMedia && window.matchMedia('(min-width: 761px)').matches;
  if (chatState.active) openChatChannel(chatState.active);
  else if (wide) openChatChannel(chatState.overview?.channels.some(c => c.key === 'alliance') ? 'alliance' : 'global');
  else showChatList();
  startChatPolling();
}
function startChatPolling() {
  clearInterval(chatState.timer);
  chatState.timer = setInterval(() => {
    if (!chatTabActive() || document.visibilityState !== 'visible') { if (!chatTabActive()) { clearInterval(chatState.timer); chatState.timer = null; } return; }
    chatState.tick++;
    if (chatState.active) pollChat();
    if (chatState.tick % 4 === 0) refreshChatOverview().then(renderChatList);   // la liste et les non-lus toutes les 10 s
  }, CHAT_POLL_MS);
}
function showChatList() { document.getElementById('chat-layout')?.classList.remove('show-thread'); }

function renderChatList() {
  const el = document.getElementById('chat-list');
  const o = chatState.overview;
  if (!el) return;
  if (!o) { el.innerHTML = '<p class="empty-state">Messagerie indisponible (hors ligne ?)</p>'; return; }
  const badge = (n) => (n ? `<span class="chat-unread">${n > 99 ? '99+' : n}</span>` : '');
  const item = (key, icon, title, sub, unread) => `
    <button class="chat-item${chatState.active === key ? ' active' : ''}" onclick="openChatChannel('${chatSafeId(key)}')">
      ${icon}<span class="chat-item-text"><span class="chat-item-title">${title}</span>${sub ? `<span class="chat-item-sub">${sub}</span>` : ''}</span>${badge(unread)}
    </button>`;
  const ch = (k) => o.channels.find(c => c.key === k);
  el.innerHTML = `
    <div class="chat-list-head">
      <button class="btn btn-primary" onclick="openNewChat()">${resIconHtml('send')} Nouveau message</button>
      <button class="btn btn-secondary chat-icon-btn" onclick="openChatSettings()" title="Réglages" aria-label="Réglages">${resIconHtml('settings')}</button>
    </div>
    <h4 class="chat-list-title">Salons</h4>
    ${ch('alliance') ? item('alliance', resIconHtml('alliance'), chatChannelTitle('alliance'), escapeHtml(ch('alliance').alliance.name), ch('alliance').unread) : ''}
    ${item('global', resIconHtml('map'), 'Chat global', 'Tout le serveur', ch('global')?.unread)}
    ${item('friends', resIconHtml('population'), 'Amis', `${ch('friends')?.friends || 0} ami${(ch('friends')?.friends || 0) > 1 ? 's' : ''}${o.friendRequests ? ` · ${o.friendRequests} demande${o.friendRequests > 1 ? 's' : ''}` : ''}`, (ch('friends')?.unread || 0) + (o.friendRequests || 0))}
    <h4 class="chat-list-title">Messages privés</h4>
    ${o.conversations.length ? o.conversations.map(c => item(c.key, resIconHtml('player'),
      `${c.player.tag ? `[${escapeHtml(c.player.tag)}] ` : ''}${escapeHtml(c.player.name)}`,
      `${c.last.mine ? 'Vous : ' : ''}${c.last.text ? escapeHtml(c.last.text.slice(0, 60)) : 'Partage'} · ${chatTime(c.last.createdAt)}`, c.unread)).join('')
      : '<p class="chat-hint">Écrivez à un joueur depuis son profil (carte, classement) ou avec « Nouveau message ».</p>'}
  `;
}

// ---- fil d'un canal ----
async function openChatChannel(key) {
  key = chatSafeId(key);
  const changed = chatState.active !== key;
  chatState.active = key;
  if (changed) { chatState.messages = []; chatState.lastAt = null; chatState.oldestAt = null; chatState.noOlder = false; chatState.attachment = null; }
  document.getElementById('chat-layout')?.classList.add('show-thread');
  renderChatThreadFrame();
  renderChatList();
  try {
    const { messages } = await chatFetch(`/api/chat/messages?channel=${encodeURIComponent(key)}`);
    if (chatState.active !== key) return;
    chatState.messages = messages;
    chatState.lastAt = messages.length ? messages[messages.length - 1].createdAt : new Date(Date.now() - 1000).toISOString();
    chatState.oldestAt = messages.length ? messages[0].createdAt : null;
    chatState.noOlder = messages.length < 50;
    renderChatMessages({ scroll: 'bottom' });
    markChatRead(key);
    chatTranslateVisible();
  } catch (e) {
    const box = document.getElementById('chat-messages');
    if (box) box.innerHTML = `<p class="empty-state">${escapeHtml(e.message)}</p>`;
  }
  if (!chatState.timer) startChatPolling();
}
function renderChatThreadFrame() {
  const el = document.getElementById('chat-thread');
  if (!el) return;
  const key = chatState.active;
  const other = key?.startsWith('private:') ? key.slice(8) : null;
  const actions = key === 'friends' ? `<button class="btn btn-secondary" onclick="openFriendsManager()">${resIconHtml('population')} Mes amis</button>`
    : other ? `<button class="btn btn-secondary" onclick="viewPlayerProfile('${chatSafeId(other)}')">${resIconHtml('player')} Profil</button>` : '';
  const hint = key === 'global' ? 'Visible par tous les joueurs du serveur. Restez courtois : les messages peuvent être signalés.'
    : key === 'friends' ? 'Vos messages ici ne sont lus que par vos amis.' : '';
  el.innerHTML = `
    <div class="chat-thread-head">
      <button class="btn btn-secondary chat-back" onclick="showChatList()" aria-label="Retour">‹</button>
      <h3>${chatChannelTitle(key)}</h3>
      <div class="chat-thread-actions">${actions}</div>
    </div>
    ${hint ? `<p class="chat-hint">${hint}</p>` : ''}
    <div class="chat-messages" id="chat-messages" onscroll="if(this.scrollTop < 40) loadOlderChat()"><p class="empty-state">Chargement…</p></div>
    <div class="chat-attachment" id="chat-attachment" style="display:none"></div>
    <form class="chat-composer" onsubmit="event.preventDefault(); sendChatMessage()">
      <button type="button" class="btn btn-secondary chat-icon-btn" onclick="openComposerShare()" title="Partager" aria-label="Partager">${resIconHtml('pin')}</button>
      <textarea id="chat-input" rows="1" maxlength="${chatState.maxLength}" placeholder="Votre message…" onkeydown="if(event.key==='Enter' && !event.shiftKey){event.preventDefault(); sendChatMessage();}" oninput="this.style.height='auto'; this.style.height=Math.min(this.scrollHeight, 120)+'px'"></textarea>
      <button type="submit" class="btn btn-primary" id="chat-send">Envoyer</button>
    </form>`;
  renderChatAttachment();
}

function chatShareHtml(m) {
  const s = m.share;
  if (!s) return '';
  const sm = s.summary || {};
  const at = Number.isFinite(sm.x) ? ` (${sm.x}|${sm.y})` : '';
  let label;
  if (s.type === 'position') label = `${resIconHtml('pin')} ${escapeHtml(sm.label || 'Position')}${at}`;
  else if (s.type === 'battle') {
    const who = sm.attackerName && sm.defenderName ? `${escapeHtml(sm.attackerName)} contre ${escapeHtml(sm.defenderName)}` : escapeHtml(sm.cityName || 'Bataille');
    label = `${resIconHtml('attack')} Rapport de bataille : ${who}${at}${sm.result ? ` · ${sm.result === 'WIN' ? 'victoire' : 'défaite'} de ${m.mine ? 'votre côté' : escapeHtml(m.sender?.name || '')}` : ''}`;
  } else if (s.type === 'spy') label = `${resIconHtml('spy')} Rapport d'espionnage : ${escapeHtml(sm.cityName || sm.targetName || 'cible')}${at}${sm.success === false ? ' · échec' : ''}`;
  else return '';
  return `<button class="chat-share" onclick="openChatShare('${chatSafeId(m.id)}')">${label}</button>`;
}
function chatMessageHtml(m) {
  const tr = chatState.translations[m.id];
  const showTr = tr && !chatState.showOriginal[m.id] && tr.text !== m.text;
  const text = showTr ? tr.text : m.text;
  const langName = (l) => chatState.languages[l] || (l || '').toUpperCase();
  return `
    <div class="chat-msg${m.mine ? ' mine' : ''}" data-msg-id="${chatSafeId(m.id)}">
      <div class="chat-meta">
        ${m.mine ? '<span class="chat-author">Vous</span>' : `<button class="chat-author" onclick="viewPlayerProfile('${chatSafeId(m.sender?.id)}')">${m.sender?.tag ? `[${escapeHtml(m.sender.tag)}] ` : ''}${escapeHtml(m.sender?.name || '?')}</button>`}
        <span class="chat-time">${chatTime(m.createdAt)}</span>
        <button class="chat-more" onclick="openChatMessageMenu('${chatSafeId(m.id)}')" aria-label="Actions">⋯</button>
      </div>
      ${text ? `<div class="chat-text">${escapeHtml(text)}</div>` : ''}
      ${tr && tr.text !== m.text ? `<button class="chat-translated" onclick="toggleChatOriginal('${chatSafeId(m.id)}')">${showTr ? `Traduit${tr.from && tr.from !== 'xx' ? ` (${escapeHtml(langName(tr.from))})` : ''} · voir l'original` : 'Voir la traduction'}</button>` : ''}
      ${chatShareHtml(m)}
    </div>`;
}
function renderChatMessages({ scroll } = {}) {
  const box = document.getElementById('chat-messages');
  if (!box) return;
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  const prevHeight = box.scrollHeight, prevTop = box.scrollTop;
  box.innerHTML = chatState.messages.length
    ? (chatState.noOlder ? '' : '<p class="chat-hint chat-older">Remontez pour voir les messages plus anciens</p>') + chatState.messages.map(chatMessageHtml).join('')
    : `<p class="empty-state">${chatState.active === 'friends' && !(chatState.overview?.channels.find(c => c.key === 'friends')?.friends) ? 'Ajoutez des amis pour discuter avec eux ici.' : 'Aucun message pour l\'instant. Lancez la conversation !'}</p>`;
  if (scroll === 'bottom' || (scroll === 'keep-bottom' && atBottom)) box.scrollTop = box.scrollHeight;
  else if (scroll === 'older') box.scrollTop = box.scrollHeight - prevHeight + prevTop;
  else box.scrollTop = prevTop;
}
// Relevé : ajoute les nouveaux messages en bas et retire du haut ceux qui dépassent 300, sans reconstruire le fil
function appendChatMessages(fresh, trimmed) {
  const box = document.getElementById('chat-messages');
  if (!box) return;
  const nodes = box.getElementsByClassName('chat-msg');
  // fil vide (texte d'accueil) ou différent de l'état : rendu complet
  if (!nodes.length || nodes.length !== chatState.messages.length - fresh.length + trimmed) { renderChatMessages({ scroll: 'keep-bottom' }); return; }
  const atBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  box.insertAdjacentHTML('beforeend', fresh.map(chatMessageHtml).join(''));
  for (let i = 0; i < trimmed && nodes.length; i++) nodes[0].remove();
  if (trimmed && !box.querySelector('.chat-older')) box.insertAdjacentHTML('afterbegin', '<p class="chat-hint chat-older">Remontez pour voir les messages plus anciens</p>');
  if (atBottom) box.scrollTop = box.scrollHeight;
}
// Remplace seulement les messages donnés (traduction reçue, original affiché) ; keepBottom : reste en bas s'il y était
function refreshChatMessageNodes(ids, keepBottom = false) {
  const box = document.getElementById('chat-messages');
  if (!box) return;
  const atBottom = keepBottom && box.scrollHeight - box.scrollTop - box.clientHeight < 60;
  const byId = new Map(chatState.messages.map(m => [m.id, m]));
  for (const id of ids) {
    const m = byId.get(id);
    const el = m && box.querySelector(`[data-msg-id="${chatSafeId(id)}"]`);
    if (el) el.outerHTML = chatMessageHtml(m);
  }
  if (atBottom) box.scrollTop = box.scrollHeight;
}
async function pollChat() {
  const key = chatState.active;
  if (!key || chatState.polling) return;
  chatState.polling = true;
  try {
    const { messages } = await chatFetch(`/api/chat/messages?channel=${encodeURIComponent(key)}&after=${encodeURIComponent(chatState.lastAt || new Date(0).toISOString())}`);
    if (chatState.active !== key || !messages.length) return;
    const known = new Set(chatState.messages.map(m => m.id));
    const fresh = messages.filter(m => !known.has(m.id));
    if (!fresh.length) return;
    chatState.messages.push(...fresh);
    let trimmed = 0;
    if (chatState.messages.length > 300) { trimmed = chatState.messages.length - 300; chatState.messages = chatState.messages.slice(-300); chatState.noOlder = false; chatState.oldestAt = chatState.messages[0].createdAt; }
    chatState.lastAt = messages[messages.length - 1].createdAt;
    appendChatMessages(fresh, trimmed);
    markChatRead(key);
    chatTranslateVisible();
  } catch (e) { /* le prochain relevé réessaiera */ } finally { chatState.polling = false; }
}
async function loadOlderChat() {
  const key = chatState.active;
  if (!key || chatState.noOlder || chatState.loadingOlder || !chatState.oldestAt) return;
  chatState.loadingOlder = true;
  try {
    const { messages } = await chatFetch(`/api/chat/messages?channel=${encodeURIComponent(key)}&before=${encodeURIComponent(chatState.oldestAt)}`);
    if (chatState.active !== key) return;
    if (messages.length < 50) chatState.noOlder = true;
    if (messages.length) { chatState.messages = [...messages, ...chatState.messages]; chatState.oldestAt = messages[0].createdAt; }
    renderChatMessages({ scroll: 'older' });
    chatTranslateVisible();
  } catch (e) { /* réessayé au prochain défilement */ } finally { chatState.loadingOlder = false; }
}
let _chatReadTimer = null;
function markChatRead(key) {
  clearTimeout(_chatReadTimer);
  _chatReadTimer = setTimeout(async () => {
    try { await chatFetch('/api/chat/read', { method: 'POST', body: JSON.stringify({ channel: key }) }); } catch (e) { return; }
    const o = chatState.overview;
    if (!o) return;
    const c = o.channels.find(x => x.key === key) || o.conversations.find(x => x.key === key);
    if (c && c.unread) { o.unread = Math.max(0, (o.unread || 0) - (key === 'global' ? 0 : c.unread)); c.unread = 0; setBadge('chat-badge', o.unread + (o.friendRequests || 0)); renderChatList(); }
  }, 600);
}

// ---- envoi ----
async function sendChatMessage() {
  const input = document.getElementById('chat-input');
  const key = chatState.active;
  if (!input || !key) return;
  const text = input.value.trim();
  if (!text && !chatState.attachment) return;
  const btn = document.getElementById('chat-send');
  if (btn) btn.disabled = true;
  try {
    const { message } = await chatFetch('/api/chat/messages', { method: 'POST', body: JSON.stringify({ channel: key, text, share: chatState.attachment || undefined }) });
    input.value = ''; input.style.height = 'auto';
    chatState.attachment = null; renderChatAttachment();
    if (!chatState.messages.some(m => m.id === message.id)) chatState.messages.push(message);
    chatState.lastAt = message.createdAt;
    renderChatMessages({ scroll: 'bottom' });
    if (key.startsWith('private:') && !chatState.overview?.conversations.some(c => c.key === key)) refreshChatOverview().then(renderChatList);
  } catch (e) {
    showToast(e.message, 'error');
  } finally { if (btn) btn.disabled = false; input.focus(); }
}

// ---- traduction automatique ----
async function chatTranslateVisible() {
  const s = chatState.settings;
  if (!s.translation || !s.autoTranslate) return;
  const lang = chatMyLang();
  const ids = chatState.messages.filter(m => !m.mine && m.text && m.lang !== lang && !chatState.translations[m.id]).map(m => m.id).slice(-50);
  if (!ids.length) return;
  ids.forEach(id => { chatState.translations[id] = chatState.translations[id] || null; });
  try {
    const { translations } = await chatFetch('/api/chat/translate', { method: 'POST', body: JSON.stringify({ ids, lang }) });
    Object.assign(chatState.translations, translations || {});
    refreshChatMessageNodes(ids, true);
  } catch (e) { ids.forEach(id => { delete chatState.translations[id]; }); }
}
function toggleChatOriginal(id) { chatState.showOriginal[id] = !chatState.showOriginal[id]; refreshChatMessageNodes([id]); }
async function translateChatMessage(id) {
  closeModal();
  try {
    const { translations, enabled } = await chatFetch('/api/chat/translate', { method: 'POST', body: JSON.stringify({ ids: [id], lang: chatMyLang() }) });
    if (!enabled) { showToast('La traduction n\'est pas en service sur ce serveur', 'info'); return; }
    if (translations?.[id]) { chatState.translations[id] = translations[id]; chatState.showOriginal[id] = false; refreshChatMessageNodes([id]); }
    else showToast('Ce message est déjà dans votre langue', 'info');
  } catch (e) { showToast(e.message, 'error'); }
}

// ---- actions sur un message ----
function openChatMessageMenu(id) {
  const m = chatState.messages.find(x => x.id === id);
  if (!m) return;
  const sid = chatSafeId(m.sender?.id), mid = chatSafeId(m.id);
  document.getElementById('modal-body').innerHTML = `
    <h3>${m.mine ? 'Votre message' : `Message de ${escapeHtml(m.sender?.name || '?')}`}</h3>
    <div class="chat-menu">
      ${m.text ? `<button class="btn btn-secondary" onclick="copyChatText('${mid}')">Copier le texte</button>` : ''}
      ${!m.mine && m.text && chatState.settings.translation ? `<button class="btn btn-secondary" onclick="translateChatMessage('${mid}')">Traduire</button>` : ''}
      ${!m.mine ? `
        ${chatState.active.startsWith('private:') ? '' : `<button class="btn btn-secondary" onclick="closeModal(); openChatWith('${sid}')">${resIconHtml('send')} Répondre en privé</button>`}
        <button class="btn btn-secondary" onclick="closeModal(); viewPlayerProfile('${sid}')">${resIconHtml('player')} Voir le profil</button>
        <button class="btn btn-warning" onclick="reportChatMessage('${mid}')">Signaler à la modération</button>
        <button class="btn btn-danger" onclick="closeModal(); blockPlayer('${sid}', ${chatJsArg(m.sender?.name || '')})">${resIconHtml('lock')} Bloquer ce joueur</button>` : ''}
      <button class="btn btn-secondary" onclick="closeModal()">Fermer</button>
    </div>`;
  document.getElementById('modal').style.display = 'flex';
}
function copyChatText(id) {
  const m = chatState.messages.find(x => x.id === id);
  closeModal();
  if (m?.text && navigator.clipboard) navigator.clipboard.writeText(m.text).then(() => showToast('Texte copié', 'success')).catch(() => {});
}
function reportChatMessage(id) {
  document.getElementById('modal-body').innerHTML = `
    <h3>Signaler ce message</h3>
    <p>La modération le lira et pourra le supprimer ou suspendre son auteur.</p>
    <div class="chat-menu">
      ${[['insulte', 'Insulte ou harcèlement'], ['haine', 'Propos haineux ou discriminatoires'], ['spam', 'Spam ou publicité'], ['triche', 'Triche ou vente de compte'], ['autre', 'Autre contenu choquant']].map(([k, l]) => `<button class="btn btn-secondary" onclick="sendChatReport('${chatSafeId(id)}', '${k}')">${l}</button>`).join('')}
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
    </div>`;
}
async function sendChatReport(id, reason) {
  closeModal();
  try { const r = await chatFetch(`/api/chat/messages/${encodeURIComponent(id)}/report`, { method: 'POST', body: JSON.stringify({ reason }) }); showToast(r.message, 'success'); }
  catch (e) { showToast(e.message, 'error'); }
}
async function blockPlayer(id, name) {
  if (!confirm(`Bloquer ${name || 'ce joueur'} ? Ses messages seront cachés et il ne pourra plus vous écrire (vous pourrez le débloquer dans les réglages de la messagerie).`)) return;
  try {
    const r = await chatFetch(`/api/chat/blocks/${encodeURIComponent(id)}`, { method: 'POST' });
    showToast(r.message, 'success');
    chatState.messages = chatState.messages.filter(m => m.sender?.id !== id);
    if (chatState.active === `private:${id}`) chatState.active = null;
    await refreshChatOverview();
    if (chatTabActive()) { renderChatList(); if (chatState.active) renderChatMessages(); else showChatList(); }
  } catch (e) { showToast(e.message, 'error'); }
}
async function unblockPlayer(id) {
  try { const r = await chatFetch(`/api/chat/blocks/${encodeURIComponent(id)}`, { method: 'DELETE' }); showToast(r.message, 'success'); openChatSettings(); }
  catch (e) { showToast(e.message, 'error'); }
}

// ---- nouveau message, conversation avec un joueur ----
function openChatWith(playerId, name) {
  chatState.pendingName = name || null;
  if (!chatTabActive()) showTab('messages');
  openChatChannel(`private:${chatSafeId(playerId)}`);
}
function openNewChat() {
  document.getElementById('modal-body').innerHTML = `
    <h3>${resIconHtml('send')} Nouveau message</h3>
    <p>À qui voulez-vous écrire ?</p>
    <input type="text" id="chat-search" class="input" placeholder="Début du pseudo" autocomplete="off" oninput="searchChatPlayers(this.value)">
    <div id="chat-search-results" class="chat-menu"></div>
    <div class="chat-menu"><button class="btn btn-secondary" onclick="closeModal()">Annuler</button></div>`;
  document.getElementById('modal').style.display = 'flex';
  setTimeout(() => document.getElementById('chat-search')?.focus(), 50);
}
let _chatSearchTimer = null;
function searchChatPlayers(q) {
  clearTimeout(_chatSearchTimer);
  _chatSearchTimer = setTimeout(async () => {
    const box = document.getElementById('chat-search-results');
    if (!box) return;
    if (String(q).trim().length < 2) { box.innerHTML = ''; return; }
    try {
      const { players } = await chatFetch(`/api/chat/players?q=${encodeURIComponent(q.trim())}`);
      box.innerHTML = players.length ? players.map(p => `<button class="btn btn-secondary" onclick="closeModal(); openChatWith('${chatSafeId(p.id)}', ${chatJsArg(p.name)})">${p.tag ? `[${escapeHtml(p.tag)}] ` : ''}${escapeHtml(p.name)}</button>`).join('') : '<p class="chat-hint">Aucun joueur trouvé</p>';
    } catch (e) { box.innerHTML = `<p class="chat-hint">${escapeHtml(e.message)}</p>`; }
  }, 250);
}

// ---- amis ----
async function openFriendsManager() {
  document.getElementById('modal-body').innerHTML = `<h3>${resIconHtml('population')} Mes amis</h3><p>Chargement…</p>`;
  document.getElementById('modal').style.display = 'flex';
  try {
    const f = await chatFetch('/api/friends');
    const seen = (p) => { const min = (Date.now() - new Date(p.lastSeenAt).getTime()) / 60000; return min < 15 ? 'en ligne' : min < 60 * 24 ? `vu il y a ${min < 60 ? Math.round(min) + ' min' : Math.round(min / 60) + ' h'}` : `vu le ${new Date(p.lastSeenAt).toLocaleDateString('fr-FR')}`; };
    const who = (p) => `${p.tag ? `[${escapeHtml(p.tag)}] ` : ''}${escapeHtml(p.name)}`;
    document.getElementById('modal-body').innerHTML = `
      <h3>${resIconHtml('population')} Mes amis</h3>
      <form class="chat-add-friend" onsubmit="event.preventDefault(); sendFriendRequest({ name: document.getElementById('friend-name').value })">
        <input type="text" id="friend-name" class="input" placeholder="Pseudo du joueur" autocomplete="off" maxlength="20">
        <button type="submit" class="btn btn-primary">Ajouter</button>
      </form>
      ${f.incoming.length ? `<h4>Demandes reçues</h4>${f.incoming.map(r => `<div class="chat-friend"><span>${who(r.player)}</span><span><button class="btn btn-primary" onclick="acceptFriend('${chatSafeId(r.id)}')">Accepter</button> <button class="btn btn-secondary" onclick="declineFriend('${chatSafeId(r.id)}')">Refuser</button></span></div>`).join('')}` : ''}
      <h4>Amis (${f.friends.length})</h4>
      ${f.friends.length ? f.friends.map(p => `<div class="chat-friend"><span>${who(p)} <small>${seen(p)}</small></span><span><button class="btn btn-secondary" onclick="closeModal(); openChatWith('${chatSafeId(p.id)}', ${chatJsArg(p.name)})">Écrire</button> <button class="btn btn-secondary" onclick="removeFriend('${chatSafeId(p.id)}', ${chatJsArg(p.name)})">Retirer</button></span></div>`).join('') : '<p class="chat-hint">Pas encore d\'amis : ajoutez un joueur par son pseudo, ou depuis son profil.</p>'}
      ${f.outgoing.length ? `<h4>Demandes envoyées</h4>${f.outgoing.map(r => `<div class="chat-friend"><span>${who(r.player)}</span><button class="btn btn-secondary" onclick="declineFriend('${chatSafeId(r.id)}')">Annuler</button></div>`).join('')}` : ''}
      <div class="chat-menu"><button class="btn btn-secondary" onclick="closeModal()">Fermer</button></div>`;
  } catch (e) { document.getElementById('modal-body').innerHTML = `<p>${escapeHtml(e.message)}</p>`; }
}
async function friendAction(path, opts, reopen = true) {
  try { const r = await chatFetch(path, opts); showToast(r.message, 'success'); await refreshChatOverview(); if (chatTabActive()) renderChatList(); if (reopen) openFriendsManager(); return r; }
  catch (e) { showToast(e.message, 'error'); return null; }
}
function sendFriendRequest(target, reopen = true) {
  if (!target.playerId && !String(target.name || '').trim()) return null;
  return friendAction('/api/friends/requests', { method: 'POST', body: JSON.stringify(target) }, reopen);
}
const acceptFriend = (id, reopen = true) => friendAction(`/api/friends/requests/${encodeURIComponent(id)}/accept`, { method: 'POST' }, reopen);
const declineFriend = (id, reopen = true) => friendAction(`/api/friends/requests/${encodeURIComponent(id)}`, { method: 'DELETE' }, reopen);
function removeFriend(id, name, reopen = true) {
  if (!confirm(`Retirer ${name || 'ce joueur'} de vos amis ?`)) return;
  friendAction(`/api/friends/${encodeURIComponent(id)}`, { method: 'DELETE' }, reopen);
}

// ---- réglages : langue, traduction, joueurs bloqués ----
async function openChatSettings() {
  const s = chatState.settings;
  let blocks = [];
  try { blocks = (await chatFetch('/api/chat/blocks')).blocks || []; } catch (e) { /* liste vide */ }
  const lang = chatMyLang();
  document.getElementById('modal-body').innerHTML = `
    <h3>${resIconHtml('settings')} Réglages de la messagerie</h3>
    <label class="chat-setting">Langue de mes messages
      <select id="chat-lang">${Object.entries(chatState.languages).map(([k, v]) => `<option value="${k}"${k === lang ? ' selected' : ''}>${escapeHtml(v)}</option>`).join('')}</select>
    </label>
    ${s.translation ? `<label class="chat-setting chat-check"><input type="checkbox" id="chat-auto"${s.autoTranslate ? ' checked' : ''}> Traduire automatiquement les messages écrits dans une autre langue</label>`
      : '<p class="chat-hint">La traduction automatique n\'est pas en service sur ce serveur.</p>'}
    <h4>Joueurs bloqués (${blocks.length})</h4>
    ${blocks.length ? blocks.map(p => `<div class="chat-friend"><span>${escapeHtml(p.name)}</span><button class="btn btn-secondary" onclick="unblockPlayer('${chatSafeId(p.id)}')">Débloquer</button></div>`).join('') : '<p class="chat-hint">Aucun joueur bloqué.</p>'}
    <div class="chat-menu">
      <button class="btn btn-primary" onclick="saveChatSettings()">Enregistrer</button>
      <button class="btn btn-secondary" onclick="closeModal()">Fermer</button>
    </div>`;
  document.getElementById('modal').style.display = 'flex';
}
async function saveChatSettings() {
  const lang = document.getElementById('chat-lang')?.value;
  const auto = document.getElementById('chat-auto');
  try {
    await chatFetch('/api/chat/settings', { method: 'PUT', body: JSON.stringify({ lang, ...(auto ? { autoTranslate: auto.checked } : {}) }) });
    chatState.settings.lang = lang;
    if (auto) chatState.settings.autoTranslate = auto.checked;
    chatState.translations = {};
    closeModal();
    showToast('Réglages enregistrés', 'success');
    if (chatState.active) { renderChatMessages(); chatTranslateVisible(); }
  } catch (e) { showToast(e.message, 'error'); }
}

// ---- partages ----
// Depuis un rapport ou la carte : choisir où partager, puis l'envoyer
async function openSharePicker(share) {
  if (!chatState.overview) await refreshChatOverview();
  const o = chatState.overview;
  if (!o) { showToast('Messagerie indisponible', 'error'); return; }
  window._pendingShare = share;
  const dest = (key, label) => `<button class="btn btn-secondary" onclick="shareTo('${chatSafeId(key)}')">${label}</button>`;
  document.getElementById('modal-body').innerHTML = `
    <h3>${resIconHtml('send')} Partager</h3>
    <div class="chat-menu">
      ${o.channels.some(c => c.key === 'alliance') ? dest('alliance', `${resIconHtml('alliance')} Chat d'alliance`) : ''}
      ${dest('global', `${resIconHtml('map')} Chat global`)}
      ${dest('friends', `${resIconHtml('population')} Mes amis`)}
      ${o.conversations.slice(0, 8).map(c => dest(c.key, `${resIconHtml('player')} ${escapeHtml(c.player.name)}`)).join('')}
      <button class="btn btn-secondary" onclick="closeModal()">Annuler</button>
    </div>`;
  document.getElementById('modal').style.display = 'flex';
}
async function shareTo(key) {
  const share = window._pendingShare;
  closeModal();
  if (!share) return;
  try {
    await chatFetch('/api/chat/messages', { method: 'POST', body: JSON.stringify({ channel: key, text: '', share }) });
    showToast('Partagé', 'success');
    if (chatTabActive() && chatState.active === key) pollChat();
  } catch (e) { showToast(e.message, 'error'); }
}
// Depuis le message en cours d'écriture : joindre un rapport ou une position
async function openComposerShare() {
  document.getElementById('modal-body').innerHTML = `<h3>${resIconHtml('pin')} Joindre</h3><p>Chargement…</p>`;
  document.getElementById('modal').style.display = 'flex';
  let battles = [], spies = [];
  try { [battles, spies] = await Promise.all([chatFetch('/api/reports/battles'), chatFetch('/api/reports/spy')]); } catch (e) { /* listes vides */ }
  const date = (d) => new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
  const city = typeof currentCity !== 'undefined' ? currentCity : null;
  document.getElementById('modal-body').innerHTML = `
    <h3>${resIconHtml('pin')} Joindre au message</h3>
    <div class="chat-menu">
      ${city ? `<button class="btn btn-secondary" onclick="attachChatShare({ type: 'position', x: ${Number(city.x)}, y: ${Number(city.y)} })">${resIconHtml('city')} Ma ville : ${escapeHtml(city.name)} (${city.x}|${city.y})</button>` : ''}
      <form class="chat-add-friend" onsubmit="event.preventDefault(); attachChatShare({ type: 'position', x: Number(document.getElementById('share-x').value), y: Number(document.getElementById('share-y').value) })">
        <input type="number" id="share-x" class="input" placeholder="x"><input type="number" id="share-y" class="input" placeholder="y">
        <button type="submit" class="btn btn-secondary">${resIconHtml('pin')} Position</button>
      </form>
    </div>
    ${battles.length ? `<h4>Rapports de bataille</h4><div class="chat-menu">${battles.slice(0, 10).map(r => `<button class="btn btn-secondary" onclick="attachChatShare({ type: 'battle', reportId: '${chatSafeId(r.id)}' }, ${chatJsArg(r.loot?.cityName || `(${r.x}|${r.y})`)})">${resIconHtml('attack')} ${escapeHtml(r.loot?.cityName || `(${r.x}|${r.y})`)} · ${r.result === 'WIN' ? 'victoire' : 'défaite'} · ${date(r.createdAt)}</button>`).join('')}</div>` : ''}
    ${spies.filter(r => r.targetType !== 'COUNTER_SPY').length ? `<h4>Rapports d'espionnage</h4><div class="chat-menu">${spies.filter(r => r.targetType !== 'COUNTER_SPY').slice(0, 10).map(r => `<button class="btn btn-secondary" onclick="attachChatShare({ type: 'spy', reportId: '${chatSafeId(r.id)}' }, ${chatJsArg(r.cityName || '')})">${resIconHtml('spy')} ${escapeHtml(r.cityName || r.targetName || 'Cible')} (${r.targetX}|${r.targetY}) · ${date(r.createdAt)}</button>`).join('')}</div>` : ''}
    <div class="chat-menu"><button class="btn btn-secondary" onclick="closeModal()">Annuler</button></div>`;
}
function attachChatShare(share, label) {
  if (share.type === 'position' && (!Number.isInteger(share.x) || !Number.isInteger(share.y))) { showToast('Coordonnées invalides', 'error'); return; }
  chatState.attachment = share;
  chatState.attachmentLabel = share.type === 'position' ? `Position (${share.x}|${share.y})` : `${share.type === 'battle' ? 'Rapport de bataille' : 'Rapport d\'espionnage'}${label ? ` : ${label}` : ''}`;
  closeModal();
  renderChatAttachment();
  document.getElementById('chat-input')?.focus();
}
function renderChatAttachment() {
  const el = document.getElementById('chat-attachment');
  if (!el) return;
  if (!chatState.attachment) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = '';
  el.innerHTML = `${resIconHtml('pin')} <span>${escapeHtml(chatState.attachmentLabel || 'Pièce jointe')}</span> <button class="chat-more" onclick="chatState.attachment = null; renderChatAttachment()" aria-label="Retirer">✕</button>`;
}
// Ouvrir ce qui a été partagé : la carte sur la position, ou le rapport (avec son replay)
async function openChatShare(id) {
  const m = chatState.messages.find(x => x.id === id);
  if (!m?.share) return;
  const sm = m.share.summary || {};
  if (m.share.type === 'position') { showTab('map'); if (typeof centerMapOn === 'function') centerMapOn(Number(sm.x), Number(sm.y)); return; }
  try {
    const s = await chatFetch(`/api/chat/messages/${encodeURIComponent(id)}/share`);
    const by = m.mine ? 'vous' : escapeHtml(m.sender?.name || '?');
    let html;
    if (s.type === 'battle' && typeof renderBattleReportCard === 'function') {
      window.battleReports = window.battleReports || [];
      const idx = window.battleReports.push(s.data) - 1;
      html = renderBattleReportCard(s.data, idx, { asPlayerId: s.data.playerId, shared: true });
    } else if (s.type === 'spy' && typeof renderSpyReportCard === 'function') html = renderSpyReportCard(s.data, { shared: true });
    else return;
    document.getElementById('modal-body').innerHTML = `<p class="chat-hint">Partagé par ${by} · ${chatTime(m.createdAt)}</p>${html}<div class="chat-menu"><button class="btn btn-secondary" onclick="showTab('map'); closeModal(); centerMapOn(${Number(sm.x)}, ${Number(sm.y)})">${resIconHtml('map')} Voir sur la carte</button><button class="btn btn-secondary" onclick="closeModal()">Fermer</button></div>`;
    document.getElementById('modal').style.display = 'flex';
  } catch (e) { showToast(e.message, 'error'); }
}
