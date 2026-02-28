// ========== IMPERIUM ANTIQUITAS - Mobile Bridge (Capacitor) ==========
// Handles native mobile features: status bar, keyboard, back button, network, haptics

(function() {
  'use strict';

  // Detect if running inside Capacitor native app
  const isCapacitor = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || isCapacitor;

  // Set API URL for Capacitor native apps (must point to your production server)
  if (isCapacitor && !window.CAPACITOR_API_URL) {
    // In production, set this to your actual server URL
    // e.g., 'https://imperium-antiquitas.onrender.com'
    window.CAPACITOR_API_URL = '';
  }

  // Add body class for CSS targeting
  if (isCapacitor) {
    document.body.classList.add('capacitor-app');
  }
  if (isMobile) {
    document.body.classList.add('is-mobile');
  }

  // ========== CAPACITOR PLUGIN INITIALIZATION ==========
  async function initCapacitorPlugins() {
    if (!isCapacitor) return;

    try {
      // Status Bar - dark style for the game theme
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      await StatusBar.setStyle({ style: Style.Dark });
      await StatusBar.setBackgroundColor({ color: '#1a1510' });
    } catch (e) {
      // StatusBar plugin not available (web)
    }

    try {
      // Splash Screen - hide after app is ready
      const { SplashScreen } = await import('@capacitor/splash-screen');
      await SplashScreen.hide();
    } catch (e) {
      // SplashScreen plugin not available
    }

    try {
      // Keyboard - handle keyboard show/hide for better UX
      const { Keyboard } = await import('@capacitor/keyboard');
      Keyboard.addListener('keyboardWillShow', () => {
        document.body.classList.add('keyboard-open');
      });
      Keyboard.addListener('keyboardWillHide', () => {
        document.body.classList.remove('keyboard-open');
      });
    } catch (e) {
      // Keyboard plugin not available
    }

    try {
      // App - handle back button and app state
      const { App: CapApp } = await import('@capacitor/app');
      CapApp.addListener('backButton', ({ canGoBack }) => {
        // Close open panels/modals first
        const modal = document.getElementById('modal');
        const buildPanel = document.getElementById('build-panel');

        if (modal && modal.style.display !== 'none') {
          if (typeof closeModal === 'function') closeModal();
        } else if (buildPanel && buildPanel.style.display !== 'none') {
          if (typeof closeBuildPanel === 'function') closeBuildPanel();
        } else if (canGoBack) {
          window.history.back();
        } else {
          CapApp.exitApp();
        }
      });

      // Refresh data when app comes back to foreground
      CapApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive && typeof refreshData === 'function') {
          const tkn = localStorage.getItem('token');
          if (tkn) refreshData(true);
        }
      });
    } catch (e) {
      // App plugin not available
    }

    try {
      // Network - show offline indicator
      const { Network } = await import('@capacitor/network');
      Network.addListener('networkStatusChange', (status) => {
        if (!status.connected) {
          if (typeof showToast === 'function') {
            showToast('Connexion perdue - mode hors ligne', 'error');
          }
        } else {
          if (typeof showToast === 'function') {
            showToast('Connexion retablie', 'success');
          }
          // Auto-refresh on reconnect
          const tkn = localStorage.getItem('token');
          if (tkn && typeof refreshData === 'function') {
            refreshData(true);
          }
        }
      });
    } catch (e) {
      // Network plugin not available
    }
  }

  // ========== MOBILE TOUCH OPTIMIZATIONS ==========
  if (isMobile) {
    // Prevent double-tap zoom on game elements
    document.addEventListener('touchend', (e) => {
      const now = Date.now();
      if (now - (window._lastTouchEnd || 0) < 300) {
        // Only prevent if not on an input/textarea
        if (!e.target.matches('input, textarea, select')) {
          e.preventDefault();
        }
      }
      window._lastTouchEnd = now;
    }, { passive: false });

    // Prevent pull-to-refresh in the game view
    document.addEventListener('touchmove', (e) => {
      if (document.getElementById('game-screen')?.style.display === 'flex') {
        // Allow scrolling inside scrollable containers
        const scrollable = e.target.closest('.tab-inner, .list-container, .panel-body, .modal-body, .buildings-grid');
        if (!scrollable) {
          // Prevent overscroll on the main body
          if (e.touches.length === 1) {
            const touch = e.touches[0];
            if (touch.clientY > 0 && document.scrollingElement.scrollTop <= 0) {
              // Don't prevent on canvas elements (let map.js handle)
              if (!e.target.matches('canvas')) {
                e.preventDefault();
              }
            }
          }
        }
      }
    }, { passive: false });

    // Orientation change handler
    window.addEventListener('orientationchange', () => {
      // Small delay to let the browser update dimensions
      setTimeout(() => {
        // Trigger resize for canvases
        window.dispatchEvent(new Event('resize'));
      }, 200);
    });
  }

  // ========== PERFORMANCE: REQUEST ANIMATION FRAME THROTTLE ==========
  // Reduce canvas rendering on mobile to save battery
  if (isMobile) {
    let lastRenderTime = 0;
    const MIN_RENDER_INTERVAL = 33; // ~30fps cap on mobile (vs 60fps desktop)

    const originalRAF = window.requestAnimationFrame;
    window.requestAnimationFrame = function(callback) {
      return originalRAF(function(timestamp) {
        if (timestamp - lastRenderTime >= MIN_RENDER_INTERVAL) {
          lastRenderTime = timestamp;
          callback(timestamp);
        } else {
          // Reschedule
          originalRAF(callback);
        }
      });
    };
  }

  // ========== INIT ==========
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initCapacitorPlugins);
  } else {
    initCapacitorPlugins();
  }

  // Expose mobile utils globally
  window.MobileUtils = {
    isCapacitor,
    isMobile,
    async vibrate(style) {
      if (!isCapacitor) return;
      try {
        const { Haptics, ImpactStyle } = await import('@capacitor/haptics');
        if (style === 'light') {
          await Haptics.impact({ style: ImpactStyle.Light });
        } else if (style === 'heavy') {
          await Haptics.impact({ style: ImpactStyle.Heavy });
        } else {
          await Haptics.impact({ style: ImpactStyle.Medium });
        }
      } catch (e) { /* Haptics not available */ }
    }
  };
})();
