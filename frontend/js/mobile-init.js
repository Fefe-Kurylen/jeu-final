// ========== CAPACITOR MOBILE INITIALIZATION ==========
(function() {
  'use strict';

  const isMobileApp = typeof window.Capacitor !== 'undefined' && window.Capacitor.isNativePlatform();
  const isMobileBrowser = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
  const isMobile = isMobileApp || isMobileBrowser;

  if (!isMobile) return;

  document.body.classList.add('mobile-device');
  if (isMobileApp) {
    document.body.classList.add('capacitor-app');
  }

  // Initialize Capacitor plugins when running as native app
  if (isMobileApp) {
    initCapacitorPlugins();
  }

  // Prevent pull-to-refresh on mobile
  document.body.addEventListener('touchmove', function(e) {
    if (document.scrollingElement.scrollTop === 0 && e.touches[0].clientY > 0) {
      // Allow scroll inside scrollable elements
      let el = e.target;
      while (el !== document.body) {
        if (el.scrollHeight > el.clientHeight) return;
        el = el.parentElement;
        if (!el) break;
      }
    }
  }, { passive: true });

  // Handle keyboard visibility on mobile
  if ('virtualKeyboard' in navigator) {
    navigator.virtualKeyboard.overlaysContent = true;
  }

  // Handle back button on Android
  if (isMobileApp) {
    document.addEventListener('backbutton', function(e) {
      e.preventDefault();
      // Close any open modal first
      const openModal = document.querySelector('.modal[style*="flex"], .modal[style*="block"]');
      if (openModal) {
        openModal.style.display = 'none';
        return;
      }
      // If on game screen, show confirm exit
      const gameScreen = document.getElementById('game-screen');
      if (gameScreen && gameScreen.style.display !== 'none') {
        if (confirm('Quitter le jeu ?')) {
          if (window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App) {
            window.Capacitor.Plugins.App.exitApp();
          }
        }
      }
    });
  }

  // Fix 100vh on mobile browsers
  function setMobileVh() {
    const vh = window.innerHeight * 0.01;
    document.documentElement.style.setProperty('--vh', vh + 'px');
  }
  setMobileVh();
  window.addEventListener('resize', setMobileVh);

  async function initCapacitorPlugins() {
    try {
      // Status bar
      if (window.Capacitor.Plugins.StatusBar) {
        const { StatusBar } = window.Capacitor.Plugins;
        await StatusBar.setBackgroundColor({ color: '#1a1a2e' });
        await StatusBar.setStyle({ style: 'DARK' });
      }
    } catch (e) {
      console.log('StatusBar plugin not available:', e.message);
    }

    try {
      // Splash screen
      if (window.Capacitor.Plugins.SplashScreen) {
        const { SplashScreen } = window.Capacitor.Plugins;
        await SplashScreen.hide();
      }
    } catch (e) {
      console.log('SplashScreen plugin not available:', e.message);
    }

    try {
      // Keyboard
      if (window.Capacitor.Plugins.Keyboard) {
        const { Keyboard } = window.Capacitor.Plugins;
        Keyboard.addListener('keyboardWillShow', (info) => {
          document.body.style.paddingBottom = info.keyboardHeight + 'px';
        });
        Keyboard.addListener('keyboardWillHide', () => {
          document.body.style.paddingBottom = '0px';
        });
      }
    } catch (e) {
      console.log('Keyboard plugin not available:', e.message);
    }
  }
})();
