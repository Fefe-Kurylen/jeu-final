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

    // Splash Screen - hide once the web layer is up
    try {
      if (SplashScreen) setTimeout(() => SplashScreen.hide(), 500);
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

          if (modal && modal.style.display !== 'none') {
            closeModal();
          } else if (buildPanel && buildPanel.style.display !== 'none') {
            closeBuildPanel();
          } else if (mapPanel && mapPanel.style.display !== 'none') {
            closeMapPanel();
          } else if (canGoBack) {
            window.history.back();
          } else {
            CapApp.exitApp();
          }
        });

        CapApp.addListener('appStateChange', ({ isActive }) => {
          if (isActive && localStorage.getItem('token')) {
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
            if (localStorage.getItem('token') && typeof refreshData === 'function') {
              refreshData(true);
            }
          }
        });
      }
    } catch (e) {}
  }

  // ========== TOUCH OPTIMIZATIONS ==========

  // Empecher double-tap zoom
  let lastTouchEnd = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouchEnd < 300 && !e.target.matches('input, textarea, select')) {
      e.preventDefault();
    }
    lastTouchEnd = now;
  }, { passive: false });

  // Empecher pull-to-refresh / overscroll
  document.addEventListener('touchmove', (e) => {
    const gameScreen = document.getElementById('game-screen');
    if (gameScreen && gameScreen.style.display === 'flex') {
      const scrollable = e.target.closest('.tab-inner, .list-container, .panel-body, .modal-body, .buildings-grid, .army-content, .hero-content, .market-content, .inventory-content');
      if (!scrollable && !e.target.matches('canvas')) {
        e.preventDefault();
      }
    }
  }, { passive: false });

  // Gerer changement d'orientation
  window.addEventListener('orientationchange', () => {
    setTimeout(() => window.dispatchEvent(new Event('resize')), 250);
  });

  // ========== HAPTICS ==========
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
