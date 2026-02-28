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
  async function initNativePlugins() {
    // Status Bar
    try {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#1a1510' });
      await StatusBar.setOverlaysWebView({ overlay: false });
    } catch (e) {}

    // Splash Screen - cacher apres initialisation
    try {
      const { SplashScreen } = await import('@capacitor/splash-screen');
      // Attendre que l'app soit prete avant de cacher
      setTimeout(() => SplashScreen.hide(), 500);
    } catch (e) {}

    // Keyboard
    try {
      const { Keyboard } = await import('@capacitor/keyboard');
      Keyboard.addListener('keyboardWillShow', (info) => {
        document.body.classList.add('keyboard-open');
        document.body.style.setProperty('--keyboard-height', info.keyboardHeight + 'px');
      });
      Keyboard.addListener('keyboardWillHide', () => {
        document.body.classList.remove('keyboard-open');
        document.body.style.removeProperty('--keyboard-height');
      });
    } catch (e) {}

    // Back Button (Android)
    try {
      const { App: CapApp } = await import('@capacitor/app');
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

      // Refresh quand l'app revient au premier plan
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive && localStorage.getItem('token')) {
          if (typeof refreshData === 'function') refreshData(true);
        }
      });
    } catch (e) {}

    // Network - detection connexion
    try {
      const { Network } = await import('@capacitor/network');
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

  // ========== PERFORMANCE ==========

  // Limiter a 30fps pour economiser la batterie
  let lastFrameTime = 0;
  const FRAME_INTERVAL = 33; // ~30fps
  const originalRAF = window.requestAnimationFrame;
  window.requestAnimationFrame = function(callback) {
    return originalRAF(function(timestamp) {
      if (timestamp - lastFrameTime >= FRAME_INTERVAL) {
        lastFrameTime = timestamp;
        callback(timestamp);
      } else {
        originalRAF(callback);
      }
    });
  };

  // ========== HAPTICS ==========
  window.haptic = async function(style) {
    try {
      const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
      const map = { light: ImpactStyle.Light, heavy: ImpactStyle.Heavy, medium: ImpactStyle.Medium };
      await Haptics.impact({ style: map[style] || ImpactStyle.Medium });
    } catch (e) {}
  };

  // ========== INIT ==========
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNativePlugins);
  } else {
    initNativePlugins();
  }
})();
