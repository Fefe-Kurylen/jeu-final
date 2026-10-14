// ========== IMPERIUM ANTIQUITAS - Native Mobile App Bridge ==========
// Application mobile native uniquement - pas de fallback navigateur

(function() {
  'use strict';

  // ========== API SERVER URL ==========
  // IMPORTANT: Mettre l'URL de votre serveur de production ici
  // Exemple: 'https://imperium-antiquitas.onrender.com'
  window.API_SERVER = window.API_SERVER || 'https://imperium-antiquitas.onrender.com';

  // Force native app mode
  document.body.classList.add('native-app');

  // ========== CAPACITOR PLUGINS ==========
  // The page is not bundled: plugins come from the native bridge (window.Capacitor.Plugins),
  // bare `import('@capacitor/...')` specifiers cannot resolve in a WebView.
  const Plugins = () => (window.Capacitor && window.Capacitor.Plugins) || {};
  const isNative = () => !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());

  let lastBackPress = 0;
  async function initNativePlugins() {
    if (!isNative()) return;
    const { StatusBar, SplashScreen, Keyboard, App: CapApp, Network } = Plugins();

    // Status Bar
    try {
      if (StatusBar) {
        await StatusBar.setStyle({ style: 'DARK' });
        await StatusBar.setBackgroundColor({ color: '#1a1510' });
        await StatusBar.setOverlaysWebView({ overlay: false });
      }
    } catch (e) {}

    // Splash Screen : masqué au premier rendu du jeu (window.onGameReady), au plus tard après 4 s
    try {
      if (SplashScreen) {
        let hidden = false;
        const hide = () => { if (!hidden) { hidden = true; SplashScreen.hide().catch(() => {}); } };
        window.onGameReady = hide;
        setTimeout(hide, 4000);
      }
    } catch (e) {}

    // Keyboard
    try {
      if (Keyboard) {
        Keyboard.addListener('keyboardWillShow', (info) => {
          document.body.classList.add('keyboard-open');
          document.body.style.setProperty('--keyboard-height', info.keyboardHeight + 'px');
        });
        Keyboard.addListener('keyboardWillHide', () => {
          document.body.classList.remove('keyboard-open');
          document.body.style.removeProperty('--keyboard-height');
        });
      }
    } catch (e) {}

    // Back Button (Android) + foreground refresh
    try {
      if (CapApp) {
        CapApp.addListener('backButton', ({ canGoBack }) => {
          const modal = document.getElementById('modal');
          const buildPanel = document.getElementById('build-panel');
          const mapPanel = document.getElementById('map-info-panel');

          const activeTab = document.querySelector('.tab.active')?.id || '';
          if (modal && modal.style.display !== 'none') {
            closeModal();
          } else if (buildPanel && buildPanel.style.display !== 'none') {
            closeBuildPanel();
          } else if (mapPanel && mapPanel.style.display !== 'none') {
            closeMapPanel();
          } else if (document.getElementById('game-screen')?.style.display === 'flex' && activeTab && activeTab !== 'tab-city') {
            showTab('city');   // retour : d'abord vers le village
          } else if (Date.now() - lastBackPress < 2000) {
            CapApp.exitApp();
          } else {
            lastBackPress = Date.now();
            showToast('Appuyez encore pour quitter', 'info');
          }
        });

        CapApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive && (window.safeStorage || localStorage).getItem('token')) {
            if (typeof refreshData === 'function') refreshData(true);
          }
        });
      }
    } catch (e) {}

    // Network - detection connexion
    try {
      if (Network) {
        Network.addListener('networkStatusChange', (status) => {
          if (!status.connected) {
            showToast('Connexion perdue', 'error');
            document.body.classList.add('offline');
          } else {
            document.body.classList.remove('offline');
            showToast('Connexion retablie', 'success');
            if ((window.safeStorage || localStorage).getItem('token') && typeof refreshData === 'function') {
              refreshData(true);
            }
          }
        });
      }
    } catch (e) {}
  }

  // ========== TOUCH ==========
  // Le zoom au double-tap et le rebond sont déjà neutralisés par le viewport (user-scalable=no),
  // touch-action: manipulation et overscroll-behavior: none (CSS) : aucun handler global qui
  // avalerait un tap rapide ou bloquerait le défilement des listes et de la barre d'onglets.

  // Gerer changement d'orientation
  window.addEventListener('orientationchange', () => {
    setTimeout(() => window.dispatchEvent(new Event('resize')), 250);
  });

  // ========== NOTIFICATIONS PUSH ==========
  // Le jeton de l'appareil est envoyé au serveur (POST /api/push/register) ; le serveur l'oublie à la
  // déconnexion, à la désactivation ou à la suppression du compte.
  let pushListenersReady = false;
  async function sendPushToken(token) {
    try {
      const res = await fetch(`${window.API_SERVER}/api/push/register`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (window.safeStorage || localStorage).getItem('token') }, body: JSON.stringify({ token, platform: window.Capacitor.getPlatform() }) });
      if (res.ok) (window.safeStorage || localStorage).setItem('push_token', token);
    } catch (e) {}
  }
  window.registerPush = async function () {
    if (!isNative()) return false;
    const { PushNotifications } = Plugins();
    if (!PushNotifications) return false;
    try {
      let perm = await PushNotifications.checkPermissions();
      if (perm.receive === 'prompt' || perm.receive === 'prompt-with-rationale') perm = await PushNotifications.requestPermissions();
      if (perm.receive !== 'granted') return false;
      if (!pushListenersReady) {
        pushListenersReady = true;
        await PushNotifications.addListener('registration', (t) => sendPushToken(t.value));
        await PushNotifications.addListener('registrationError', (e) => console.warn('push registration', e));
        await PushNotifications.addListener('pushNotificationReceived', (n) => { if (n.title) showToast(n.title, 'info'); if (typeof refreshData === 'function') refreshData(true); });
        await PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
          const tab = a.notification?.data?.tab;
          if (typeof refreshData === 'function') refreshData(true);
          if (tab && typeof showTab === 'function') showTab(tab);
        });
      }
      await PushNotifications.register();
      return true;
    } catch (e) { console.warn('push:', e.message); return false; }
  };
  window.unregisterPush = async function () {
    const t = (window.safeStorage || localStorage).getItem('push_token');
    if (!t) return;
    (window.safeStorage || localStorage).removeItem('push_token');
    try { await fetch(`${window.API_SERVER}/api/push/register`, { method: 'DELETE', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + (window.safeStorage || localStorage).getItem('token') }, body: JSON.stringify({ token: t }) }); } catch (e) {}
  };
  window.togglePush = async function () {
    if ((window.safeStorage || localStorage).getItem('push_token')) { await window.unregisterPush(); showToast('Notifications désactivées', 'info'); }
    else { const ok = await window.registerPush(); showToast(ok ? 'Notifications activées' : 'Autorisation refusée : activez-les dans les réglages du téléphone', ok ? 'success' : 'error'); }
    if (typeof openSettings === 'function') openSettings();
  };

  // Quand le joueur est chargé : boutique (RevenueCat) et notifications
  window.onPlayerReady = function (player) {
    if (window.Store) window.Store.configure(player.id);
    if ((window.safeStorage || localStorage).getItem('push_token') || !(window.safeStorage || localStorage).getItem('push_asked')) {
      (window.safeStorage || localStorage).setItem('push_asked', '1');
      window.registerPush();
    }
  };

  // ========== HAPTICS ==========
  window.hapticNotify = async function(type) {
    try { const { Haptics } = Plugins(); if (Haptics) await Haptics.notification({ type: type || 'SUCCESS' }); } catch (e) {}
  };
  window.haptic = async function(style) {
    try {
      const { Haptics } = Plugins();
      if (!Haptics) return;
      const map = { light: 'LIGHT', heavy: 'HEAVY', medium: 'MEDIUM' };
      await Haptics.impact({ style: map[style] || 'MEDIUM' });
    } catch (e) {}
  };

  // ========== INIT ==========
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNativePlugins);
  } else {
    initNativePlugins();
  }
})();
