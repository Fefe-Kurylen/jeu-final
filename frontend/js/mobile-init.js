// ========== CAPACITOR MOBILE INITIALIZATION ==========
(function() {
  'use strict';

  const isMobileApp = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();
  const isMobileBrowser = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isSmallScreen = window.innerWidth <= 768 || window.innerHeight <= 500;
  const isMobile = isMobileApp || isMobileBrowser || isSmallScreen;

  if (!isMobile) return;

  document.body.classList.add('mobile-device');
  if (isMobileApp) {
    document.body.classList.add('capacitor-app');
  }

  // Initialize Capacitor plugins when running as native app
  if (isMobileApp) {
    initCapacitorPlugins();
  }

  // Prevent pull-to-refresh and double-tap zoom on the game area
  let lastTouchEnd = 0;
  document.addEventListener('touchend', function(e) {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
      // Prevent double-tap zoom but not on inputs
      if (e.target.tagName !== 'INPUT' && e.target.tagName !== 'TEXTAREA') {
        e.preventDefault();
      }
    }
    lastTouchEnd = now;
  }, { passive: false });

  // Prevent pinch zoom on document (but allow on canvas)
  document.addEventListener('gesturestart', function(e) {
    if (e.target.tagName !== 'CANVAS') {
      e.preventDefault();
    }
  }, { passive: false });

  // Handle keyboard visibility on mobile browsers
  if ('virtualKeyboard' in navigator) {
    navigator.virtualKeyboard.overlaysContent = true;
  }

  // Auto-scroll input into view when focused
  document.addEventListener('focusin', function(e) {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      setTimeout(function() {
        e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300);
    }
  });

  // Handle back button on Android (Capacitor only)
  if (isMobileApp) {
    document.addEventListener('backbutton', function(e) {
      e.preventDefault();

      // Close build panel overlay first
      const overlay = document.querySelector('.build-panel-overlay.fade-in');
      if (overlay) {
        const closeBtn = document.querySelector('.panel-close');
        if (closeBtn) closeBtn.click();
        return;
      }

      // Close any open modal
      const modal = document.getElementById('modal');
      if (modal && modal.style.display !== 'none' && modal.style.display !== '') {
        if (typeof closeModal === 'function') closeModal();
        return;
      }

      // Close build panel
      const buildPanel = document.getElementById('build-panel');
      if (buildPanel && buildPanel.style.display !== 'none' && buildPanel.style.display !== '') {
        if (typeof closeBuildPanel === 'function') closeBuildPanel();
        return;
      }

      // Close map info panel
      const mapPanel = document.getElementById('map-info-panel');
      if (mapPanel && mapPanel.style.display !== 'none' && mapPanel.style.display !== '') {
        mapPanel.style.display = 'none';
        return;
      }

      // Confirm exit
      if (confirm('Quitter le jeu ?')) {
        if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
          window.Capacitor.Plugins.App.exitApp();
        }
      }
    });
  }

  // Fix 100vh on mobile browsers (iOS Safari address bar)
  function setMobileVh() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', vh + 'px');
  }
  setMobileVh();
  window.addEventListener('resize', setMobileVh);
  window.addEventListener('orientationchange', function() {
    setTimeout(setMobileVh, 100);
  });

  // Handle orientation changes - resize canvases
  window.addEventListener('orientationchange', function() {
    setTimeout(function() {
      // Trigger canvas resize for all active canvases
      if (typeof initCityCanvas === 'function') initCityCanvas();
      if (typeof initFieldsCanvas === 'function') initFieldsCanvas();
      if (typeof initMapCanvas === 'function') initMapCanvas();
    }, 300);
  });

  // Optimize canvas rendering for mobile - reduce pixel ratio on slow devices
  window.mobilePixelRatio = Math.min(window.devicePixelRatio || 1, 2);

  async function initCapacitorPlugins() {
    try {
      if (window.Capacitor.Plugins.StatusBar) {
        const { StatusBar } = window.Capacitor.Plugins;
        await StatusBar.setBackgroundColor({ color: '#1a1a2e' });
        await StatusBar.setStyle({ style: 'DARK' });
      }
    } catch (e) {
      console.log('StatusBar plugin not available:', e.message);
    }

    try {
      if (window.Capacitor.Plugins.SplashScreen) {
        const { SplashScreen } = window.Capacitor.Plugins;
        await SplashScreen.hide();
      }
    } catch (e) {
      console.log('SplashScreen plugin not available:', e.message);
    }

    try {
      if (window.Capacitor.Plugins.Keyboard) {
        const { Keyboard } = window.Capacitor.Plugins;
        Keyboard.addListener('keyboardWillShow', function(info) {
          document.body.classList.add('keyboard-open');
          document.body.style.paddingBottom = info.keyboardHeight + 'px';
          // Hide bottom nav when keyboard is open
          const nav = document.querySelector('.bottom-nav');
          if (nav) nav.style.display = 'none';
        });
        Keyboard.addListener('keyboardWillHide', function() {
          document.body.classList.remove('keyboard-open');
          document.body.style.paddingBottom = '0px';
          const nav = document.querySelector('.bottom-nav');
          if (nav) nav.style.display = '';
        });
      }
    } catch (e) {
      console.log('Keyboard plugin not available:', e.message);
    }

    // Keep screen awake during gameplay (if plugin available)
    try {
      if (window.Capacitor.Plugins.KeepAwake) {
        await window.Capacitor.Plugins.KeepAwake.keepAwake();
      }
    } catch (e) {
      // Plugin not installed, ignore
    }
  }
})();
