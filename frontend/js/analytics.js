// ========== ANALYTICS INTERNES (entonnoir d'activation) ==========
// Les événements partent par lots vers notre propre serveur : aucun SDK tiers, rien ne quitte le jeu.
(function () {
  'use strict';
  const queue = [];
  let timer = null;
  const platform = () => (window.Capacitor && window.Capacitor.getPlatform ? window.Capacitor.getPlatform() : 'web');
  function flush() {
    if (!queue.length) return;
    const batch = queue.splice(0, 50);
    const token = (window.safeStorage || localStorage).getItem('token');
    const base = window.API_SERVER || '';
    fetch(`${base}/api/analytics/events`, {
      method: 'POST', keepalive: true,
      headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: `Bearer ${token}` } : {}),
      body: JSON.stringify({ events: batch })
    }).catch(() => {});
  }
  window.track = function (event, props) {
    queue.push({ event, props: props || null, platform: platform() });
    if (queue.length >= 20) { clearTimeout(timer); timer = null; flush(); }
    else if (!timer) timer = setTimeout(() => { timer = null; flush(); }, 8000);
  };
  // Une seule fois par appareil (première construction, premier recrutement, première attaque…)
  window.trackOnce = function (event, props) {
    try {
      const key = 'track_once_' + event;
      if ((window.safeStorage || localStorage).getItem(key)) return;
      (window.safeStorage || localStorage).setItem(key, '1');
    } catch (e) { /* stockage indisponible : on envoie quand même */ }
    window.track(event, props);
  };
  window.flushAnalytics = flush;
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  window.addEventListener('pagehide', flush);
  window.track('app_open');
})();
