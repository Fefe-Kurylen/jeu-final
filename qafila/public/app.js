/* Qafila — interface de recherche (style Qwant). Vanilla JS, aucun pisteur, aucun appel tiers depuis le navigateur :
   vignettes et favicons passent par le serveur Qafila. Fonctionne en site web, en PWA et dans la coque mobile Capacitor. */
(() => {
  'use strict';

  // Base de l'API : vide = même origine. Dans l'appli mobile, pointer vers l'instance déployée.
  const API_BASE = window.QAFILA_API || (window.Capacitor?.isNativePlatform?.() ? 'https://qafila.example.com' : '');
  const TYPES = ['web', 'images', 'videos', 'news'];

  const $ = s => document.querySelector(s);
  const el = {
    body: document.body, form: $('#searchform'), q: $('#q'), clear: $('#clear'), suggest: $('#suggest'),
    home: $('#home'), view: $('#resultsview'), results: $('#results'), side: $('#side'), pager: $('#pager'),
    tabs: document.querySelectorAll('.tab'), shortcuts: $('#shortcuts'), settings: $('#settings'), filters: $('#filtersPanel'),
  };

  const SETTINGS_KEY = 'qafila.settings';
  const HISTORY_KEY = 'qafila.history';
  const settings = Object.assign({ lang: 'fr-FR', newTab: false, suggest: true, history: false, theme: '' }, load(SETTINGS_KEY));
  const state = { q: '', type: 'web', page: 1, controller: null, hasMore: false };

  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null') || {}; } catch { return {}; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* stockage indisponible */ } }

  /* ---------- Thème ---------- */
  function isDark() { return settings.theme ? settings.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; }
  function applyTheme() {
    if (settings.theme) document.documentElement.dataset.theme = settings.theme; else delete document.documentElement.dataset.theme;
    document.querySelector('meta[name="theme-color"]').content = isDark() ? '#17191c' : '#ffffff';
  }
  $('#themebtn').addEventListener('click', () => { settings.theme = isDark() ? 'light' : 'dark'; save(SETTINGS_KEY, settings); applyTheme(); });

  /* ---------- Raccourcis ("bangs") ---------- */
  const BANGS = {
    w: 'https://fr.wikipedia.org/w/index.php?search=%s', wiki: 'https://fr.wikipedia.org/w/index.php?search=%s',
    yt: 'https://www.youtube.com/results?search_query=%s', maps: 'https://www.openstreetmap.org/search?query=%s',
    g: 'https://www.google.com/search?q=%s', gh: 'https://github.com/search?q=%s', amz: 'https://www.amazon.fr/s?k=%s',
    lbc: 'https://www.leboncoin.fr/recherche?text=%s', ddg: 'https://duckduckgo.com/?q=%s',
    img: '!type=images', actus: '!type=news', video: '!type=videos', videos: '!type=videos',
  };
  function handleBang(q) {
    const m = q.match(/(?:^|\s)!([a-z]+)(?:\s|$)/i);
    if (!m) return false;
    const target = BANGS[m[1].toLowerCase()];
    if (!target) return false;
    const rest = q.replace(m[0], ' ').trim();
    if (target.startsWith('!type=')) { state.type = target.slice(6); if (rest) runSearch(rest, 1); return true; }
    openUrl(target.replace('%s', encodeURIComponent(rest)));
    return true;
  }

  /* ---------- Ouverture des liens (web / appli mobile) ---------- */
  function openUrl(url) {
    const iab = window.Capacitor?.Plugins?.InAppBrowser;
    if (iab) { iab.openWebView({ url, title: 'Qafila', toolbarType: 'navigation', showReloadButton: true }).catch(() => window.open(url, '_blank')); return; }
    if (settings.newTab) window.open(url, '_blank', 'noopener'); else location.href = url;
  }
  document.addEventListener('click', e => {
    const a = e.target.closest('a[data-ext]');
    if (!a) return;
    e.preventDefault();
    remember(state.q);
    openUrl(a.href);
  });

  /* ---------- Historique local (opt-in) ---------- */
  function remember(q) {
    if (!settings.history || !q) return;
    const h = (load(HISTORY_KEY).list || []).filter(x => x !== q);
    h.unshift(q); save(HISTORY_KEY, { list: h.slice(0, 50) });
  }
  function historyMatches(prefix) {
    if (!settings.history) return [];
    return (load(HISTORY_KEY).list || []).filter(x => x.toLowerCase().startsWith(prefix.toLowerCase())).slice(0, 3);
  }

  /* ---------- Suggestions ---------- */
  const ICON_SEARCH = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" stroke-width="2" fill="none"/><path d="M16.5 16.5L21 21" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
  const ICON_CLOCK = '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="12" cy="12" r="8" stroke="currentColor" stroke-width="2" fill="none"/><path d="M12 8v4l3 2" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"/></svg>';
  let sugTimer, sugIndex = -1, sugItems = [];
  el.q.addEventListener('input', () => {
    el.clear.hidden = !el.q.value;
    clearTimeout(sugTimer);
    const v = el.q.value.trim();
    if (!settings.suggest || v.length < 2 || v.startsWith('!')) return hideSuggest();
    sugTimer = setTimeout(async () => {
      const local = historyMatches(v);
      let remote = [];
      try { remote = await (await fetch(`${API_BASE}/api/suggest?q=${encodeURIComponent(v)}`)).json(); } catch { /* hors ligne */ }
      if (el.q.value.trim() !== v) return;
      sugItems = [...local.map(t => ({ t, hist: true })), ...remote.filter(t => !local.includes(t)).map(t => ({ t }))].slice(0, 8);
      renderSuggest(v);
    }, 140);
  });
  function renderSuggest(v) {
    if (!sugItems.length) return hideSuggest();
    sugIndex = -1;
    el.suggest.innerHTML = sugItems.map(({ t, hist }, i) => {
      const idx = t.toLowerCase().indexOf(v.toLowerCase());
      const html = idx >= 0 ? esc(t.slice(0, idx)) + '<b>' + esc(t.slice(idx, idx + v.length)) + '</b>' + esc(t.slice(idx + v.length)) : esc(t);
      return `<li role="option" data-i="${i}">${hist ? ICON_CLOCK : ICON_SEARCH}<span>${html}</span>${hist ? '<span class="hist">historique</span>' : ''}</li>`;
    }).join('');
    el.suggest.hidden = false;
  }
  function hideSuggest() { el.suggest.hidden = true; el.suggest.innerHTML = ''; sugItems = []; sugIndex = -1; }
  el.suggest.addEventListener('mousedown', e => {
    const li = e.target.closest('li'); if (!li) return;
    e.preventDefault(); el.q.value = sugItems[li.dataset.i].t; hideSuggest(); submit();
  });
  el.q.addEventListener('keydown', e => {
    if (el.suggest.hidden) return;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      sugIndex = (sugIndex + (e.key === 'ArrowDown' ? 1 : -1) + sugItems.length) % sugItems.length;
      [...el.suggest.children].forEach((li, i) => li.setAttribute('aria-selected', i === sugIndex));
      el.q.value = sugItems[sugIndex].t;
    } else if (e.key === 'Escape') hideSuggest();
  });
  document.addEventListener('click', e => { if (!el.form.contains(e.target)) hideSuggest(); });
  el.clear.addEventListener('click', () => { el.q.value = ''; el.clear.hidden = true; hideSuggest(); el.q.focus(); });

  /* ---------- Soumission et navigation ---------- */
  el.form.addEventListener('submit', e => { e.preventDefault(); submit(); });
  function submit() {
    const q = el.q.value.trim();
    hideSuggest();
    if (!q) return;
    if (handleBang(q)) return;
    runSearch(q, 1);
  }
  el.tabs.forEach(t => t.addEventListener('click', () => { state.type = t.dataset.type; runSearch(state.q, 1); }));

  function runSearch(q, page, { replace = false } = {}) {
    if (!q) return;
    state.q = q; state.page = page; el.q.value = q; el.clear.hidden = false;
    const url = `/?q=${encodeURIComponent(q)}${state.type !== 'web' ? `&t=${state.type}` : ''}`;
    history[replace ? 'replaceState' : 'pushState']({ q, type: state.type }, '', url);
    remember(q);
    render();
  }
  window.addEventListener('popstate', () => readUrl());
  function readUrl() {
    const p = new URLSearchParams(location.search);
    const q = (p.get('q') || '').trim();
    if (!q) { showHome(); return; }
    state.type = TYPES.includes(p.get('t')) ? p.get('t') : 'web';
    state.q = q; state.page = 1; el.q.value = q; el.clear.hidden = false;
    render();
  }

  function showHome() {
    state.q = ''; el.body.dataset.view = 'home'; el.home.hidden = false; el.view.hidden = true;
    el.q.value = ''; el.clear.hidden = true; document.title = 'Qafila — Le moteur de recherche qui ne vous regarde pas';
    el.home.querySelector('.hero').after(el.form);
    el.q.focus();
  }
  function placeSearchboxTop() {
    const header = $('.topbar');
    if (el.form.parentElement !== header) header.insertBefore(el.form, header.querySelector('.top-actions'));
  }

  /* ---------- Rendu des résultats ---------- */
  async function render({ append = false } = {}) {
    el.body.dataset.view = 'results'; el.home.hidden = true; el.view.hidden = false;
    placeSearchboxTop();
    el.tabs.forEach(t => t.classList.toggle('active', t.dataset.type === state.type));
    el.view.dataset.type = state.type;
    document.title = `${state.q} – Recherche Qafila`;
    if (!append) {
      el.results.innerHTML = '<div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div>';
      el.side.innerHTML = ''; el.pager.innerHTML = '';
      window.scrollTo({ top: 0 });
    } else {
      el.pager.querySelector('.more')?.setAttribute('disabled', '');
    }

    state.controller?.abort();
    const ctrl = state.controller = new AbortController();
    const params = new URLSearchParams({ q: state.q, type: state.type, page: state.page, lang: settings.lang });
    let data;
    try {
      const res = await fetch(`${API_BASE}/api/search?${params}`, { signal: ctrl.signal });
      data = await res.json();
      if (!res.ok) throw new Error(data.error || `Erreur ${res.status}`);
    } catch (e) {
      if (e.name === 'AbortError') return;
      const msg = `<p class="error">${esc(e.message)}<br><small>Vérifiez la connexion ou réessayez dans un instant.</small></p>`;
      if (append) el.results.insertAdjacentHTML('beforeend', msg); else el.results.innerHTML = msg;
      el.pager.innerHTML = '';
      return;
    }
    if (ctrl.signal.aborted) return;

    const parts = [];
    if (!append) {
      parts.push(`<p class="status">${data.results.length} résultats · ${data.took} ms · ${esc(data.provider)}${data.cached ? ' · cache' : ''}</p>`);
      if (data.instant) parts.push(`<section class="card instant"><p class="big">${esc(data.instant.title)}</p><p class="sub">${esc(data.instant.text)}</p></section>`);
    }
    if (state.type === 'images') {
      parts.push(`<div class="grid">${data.results.map(r => `
        <figure class="img" data-full="${esc(r.image.full)}" data-page="${esc(r.url)}" title="${esc(r.title)}">
          <img loading="lazy" src="${proxied(r.image.thumb)}" alt="${esc(r.title)}">
          <figcaption>${esc(r.host)}</figcaption>
        </figure>`).join('')}</div>`);
    } else if (state.type === 'videos') {
      parts.push(data.results.map(r => `
        <article class="v">
          <a class="v-thumb" href="${esc(r.url)}" data-ext>${r.thumbnail ? `<img loading="lazy" src="${proxied(r.thumbnail)}" alt="">` : ''}${r.duration ? `<span class="v-dur">${esc(r.duration)}</span>` : ''}</a>
          <div>
            <a class="v-title" href="${esc(r.url)}" data-ext>${esc(r.title)}</a>
            <p class="v-meta"><span class="r-site">${favicon(r.host)}${esc(r.source || r.host)}</span>${r.channel ? ` <span class="r-dot">·</span> ${esc(r.channel)}` : ''}${r.views ? ` <span class="r-dot">·</span> ${esc(r.views)}` : ''}${r.date ? ` <span class="r-dot">·</span> ${esc(relDate(r.date))}` : ''}</p>
          </div>
        </article>`).join(''));
    } else {
      parts.push(data.results.map(r => {
        const news = state.type === 'news';
        const meta = news ? `<span class="r-date">${esc(relDate(r.date))}</span>` : `<span class="r-path">${esc(prettyUrl(r.url))}</span>`;
        return `
        <article class="r${news && r.thumbnail ? ' has-thumb' : ''}">
          <a class="r-head" href="${esc(r.url)}" data-ext>${favicon(r.host)}<span class="r-site">${esc(news ? (r.source || r.host) : r.host)}</span>${meta ? `<span class="r-dot">·</span>${meta}` : ''}</a>
          <div class="r-body">
            <a class="r-title" href="${esc(r.url)}" data-ext>${esc(r.title)}</a>
            ${r.snippet ? `<p class="r-snippet">${highlight(r.snippet)}</p>` : ''}
          </div>
          ${news && r.thumbnail ? `<img class="r-thumb" loading="lazy" src="${proxied(r.thumbnail)}" alt="" >` : ''}
        </article>`;
      }).join(''));
    }
    if (!data.results.length && !append) parts.push('<p class="empty">Aucun résultat. Essayez d\'autres mots ou une autre catégorie.</p>');
    if (!append && data.suggestions?.length) parts.push('<div class="chips">' + data.suggestions.slice(0, 6).map(s => `<button class="chip" data-q="${esc(s)}">${esc(s)}</button>`).join('') + '</div>');

    if (append) {
      const grid = el.results.querySelector('.grid');
      if (state.type === 'images' && grid) { const tmp = document.createElement('div'); tmp.innerHTML = parts.join(''); grid.append(...tmp.querySelector('.grid').children); }
      else el.results.insertAdjacentHTML('beforeend', parts.join(''));
    } else {
      el.results.innerHTML = parts.join('');
      if (data.infobox?.title) {
        const ib = data.infobox;
        el.side.innerHTML = `<section class="card infobox">${ib.image ? `<img src="${proxied(ib.image)}" alt="">` : ''}<h2>${esc(ib.title)}</h2><p>${esc((ib.text || '').slice(0, 600))}</p>${ib.url ? `<a href="${esc(ib.url)}" data-ext>En savoir plus</a>` : ''}</section>`;
      }
    }

    state.hasMore = data.results.length >= (state.type === 'images' ? 20 : 8) && state.page < 10;
    el.pager.innerHTML = state.hasMore ? '<button class="more" id="more">Plus de résultats</button>' : '';
    $('#more')?.addEventListener('click', () => { state.page += 1; render({ append: true }); });
  }
  el.results.addEventListener('click', e => {
    const chip = e.target.closest('.chip'); if (chip) { runSearch(chip.dataset.q, 1); return; }
    const fig = e.target.closest('figure.img'); if (fig) lightbox(fig.dataset.full, fig.dataset.page, fig.title);
  });

  function lightbox(full, page, title) {
    let d = $('#lightbox');
    if (!d) { d = document.createElement('dialog'); d.id = 'lightbox'; d.className = 'lightbox'; document.body.append(d); d.addEventListener('click', e => { if (e.target === d) d.close(); }); }
    d.innerHTML = `<img src="${proxied(full)}" alt="${esc(title)}"><div class="lb-bar"><a href="${esc(page)}" data-ext>Voir la page</a><a href="${esc(full)}" data-ext>Image d'origine</a><a href="#" id="lbclose">Fermer</a></div>`;
    d.querySelector('#lbclose').addEventListener('click', e => { e.preventDefault(); d.close(); });
    d.showModal();
  }

  /* ---------- Images cassées / chargées (gestion déléguée : la CSP interdit les gestionnaires inline) ---------- */
  document.addEventListener('error', e => {
    const img = e.target; if (!(img instanceof HTMLImageElement)) return;
    if (img.closest('figure.img')) img.closest('figure.img').remove();
    else if (img.classList.contains('r-thumb')) { img.closest('article')?.classList.remove('has-thumb'); img.remove(); }
    else img.remove();
  }, true);
  document.addEventListener('load', e => {
    const img = e.target; if (!(img instanceof HTMLImageElement)) return;
    const fig = img.closest('figure.img');
    if (fig && img.naturalHeight) { const w = Math.round(img.naturalWidth / img.naturalHeight * (innerWidth <= 760 ? 140 : 190)); fig.style.width = `${w}px`; fig.style.flexGrow = w; }
    if (img.parentElement?.classList.contains('fav') && !img.naturalWidth) img.remove();
  }, true);

  /* ---------- Filtres (sous les onglets) ---------- */
  $('#filtersbtn').addEventListener('click', () => {
    el.filters.hidden = !el.filters.hidden;
    if (!el.filters.hidden) { $('#fLang').innerHTML = $('#setLang').innerHTML; $('#fLang').value = settings.lang; $('#fTab').value = settings.newTab ? 'new' : 'same'; }
  });
  $('#fLang').addEventListener('change', e => { settings.lang = e.target.value; save(SETTINGS_KEY, settings); runSearch(state.q, 1, { replace: true }); });
  $('#fTab').addEventListener('change', e => { settings.newTab = e.target.value === 'new'; save(SETTINGS_KEY, settings); });

  /* ---------- Utilitaires ---------- */
  function esc(s = '') { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  function proxied(u) { return u ? `${API_BASE}/api/img?u=${encodeURIComponent(u)}` : ''; }
  function prettyUrl(u) { try { const x = new URL(u); return decodeURIComponent(x.pathname).replace(/\/$/, '').replace(/^\//, '').replace(/\//g, ' › ').slice(0, 60); } catch { return ''; } }
  function highlight(text = '') {
    const terms = state.q.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
    let html = esc(text);
    for (const t of new Set(terms)) html = html.replace(new RegExp(`(${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'), '<b>$1</b>');
    return html;
  }
  function favicon(host = '') {
    const h = host.replace(/^www\./, '');
    // Si la favicon est introuvable (204), l'image est retirée et le globe en arrière-plan de .fav reste visible.
    return `<span class="fav"><img src="${API_BASE}/api/fav?host=${encodeURIComponent(h)}" alt="" loading="lazy"></span>`;
  }
  function relDate(d) {
    if (!d) return ''; const t = new Date(d); if (isNaN(t)) return d;
    const diff = (Date.now() - t) / 60000;
    if (diff < 60) return `il y a ${Math.max(1, Math.round(diff))} min`;
    if (diff < 60 * 24) return `il y a ${Math.round(diff / 60)} h`;
    if (diff < 60 * 24 * 7) return `il y a ${Math.round(diff / 1440)} jour${diff >= 2880 ? 's' : ''}`;
    if (diff < 60 * 24 * 60) return `il y a ${Math.round(diff / 10080)} semaine${diff >= 20160 ? 's' : ''}`;
    return t.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }
  /* ---------- Accueil : raccourcis ---------- */
  const SHORTCUTS = [
    ['Wikipédia', 'https://fr.wikipedia.org', '#3a3a3a', 'W'], ['YouTube', 'https://www.youtube.com', '#e62117', '▶'], ['Leboncoin', 'https://www.leboncoin.fr', '#ff6e14', 'L'],
    ['Météo', 'https://meteofrance.com', '#1e88e5', '☀'], ['Plans', 'https://www.openstreetmap.org', '#43a047', '◎'], ['Actualités', '!actus actualités', '#0561ff', 'A'], ['Amazon', 'https://www.amazon.fr', '#232f3e', 'a'],
  ];
  el.shortcuts.innerHTML = SHORTCUTS.map(([n, u, c, l]) => `<a class="shortcut" href="${u.startsWith('!') ? '#' : esc(u)}" ${u.startsWith('!') ? `data-bang="${esc(u)}"` : 'data-ext'}><span class="sc-ico" style="background:${c}">${l}</span>${n}</a>`).join('');
  document.addEventListener('click', e => { const a = e.target.closest('[data-bang]'); if (a) { e.preventDefault(); const b = a.dataset.bang.trim(); el.q.value = b.includes(' ') ? b : `${b} ${state.q || ''}`.trim(); if (el.q.value !== b) submit(); else { el.q.value = ''; showHome(); el.q.value = b + ' '; el.q.focus(); } } });

  /* ---------- Réglages / à propos ---------- */
  $('#settingsbtn').addEventListener('click', async () => {
    $('#setLang').value = settings.lang; $('#setNewTab').checked = settings.newTab; $('#setSuggest').checked = settings.suggest; $('#setHistory').checked = settings.history;
    try {
      const st = await (await fetch(`${API_BASE}/api/status`)).json();
      $('#providerInfo').textContent = 'Sources actives : ' + st.providers.filter(p => p.available && p.enabled).map(p => p.name).join(', ');
    } catch { $('#providerInfo').textContent = ''; }
    el.settings.showModal();
  });
  el.settings.addEventListener('close', () => {
    if (el.settings.returnValue !== 'save') return;
    settings.lang = $('#setLang').value; settings.newTab = $('#setNewTab').checked; settings.suggest = $('#setSuggest').checked;
    settings.history = $('#setHistory').checked; if (!settings.history) localStorage.removeItem(HISTORY_KEY);
    save(SETTINGS_KEY, settings);
    if (state.q) render();
  });
  const ABOUT = 'Qafila ne conserve ni vos recherches, ni votre adresse IP, ni aucun profil. Les résultats proviennent de moteurs tiers interrogés par le serveur Qafila, qui ne leur transmet jamais votre identité. Vignettes et favicons passent par Qafila pour masquer votre IP. L\'historique local, s\'il est activé, reste sur cet appareil.';
  for (const sel of ['#aboutlink', '#aboutlink2', '.about']) document.querySelector(sel)?.addEventListener('click', e => { e.preventDefault(); alert(ABOUT); });
  $('#addEngine').addEventListener('click', e => {
    if (window.external?.AddSearchProvider) { e.preventDefault(); window.external.AddSearchProvider(location.origin + '/opensearch.xml'); }
  });

  /* ---------- Démarrage ---------- */
  applyTheme();
  readUrl();
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('/sw.js').catch(() => {});
})();
