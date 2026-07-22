/* GRIDIRON DYNASTY 2.0 - install, update, and connectivity experience. */
(function () {
  'use strict';
  var deferredInstall = null, registration = null;
  function notice(text, action, onAction) {
    var old = document.querySelector('.pwa-notice'); if (old) old.remove();
    var bar = document.createElement('div'); bar.className = 'pwa-notice';
    var label = document.createElement('span'); label.textContent = text; bar.appendChild(label);
    if (action) { var b = document.createElement('button'); b.className = 'btn'; b.textContent = action; b.onclick = onAction; bar.appendChild(b); }
    document.body.appendChild(bar); return bar;
  }
  function updateConnectivity() {
    document.documentElement.classList.toggle('is-offline', !navigator.onLine);
    if (!navigator.onLine) notice('Offline mode - your dynasty remains available.');
    else { var n = document.querySelector('.pwa-notice'); if (n && /Offline/.test(n.textContent)) n.remove(); }
  }
  var PWA = {
    init: function () {
      if (window.GameEngine && window.GameEngine.state) document.documentElement.classList.toggle('reduced-motion', !!window.GameEngine.state.settings.reducedMotion);
      window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredInstall = e; document.documentElement.classList.add('can-install'); });
      window.addEventListener('online', updateConnectivity); window.addEventListener('offline', updateConnectivity); updateConnectivity();
      if (!('serviceWorker' in navigator)) return Promise.resolve(null);
      return navigator.serviceWorker.register('sw.js').then(function (reg) {
        registration = reg;
        reg.addEventListener('updatefound', function () {
          var worker = reg.installing; if (!worker) return;
          worker.addEventListener('statechange', function () {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              notice('Gridiron Dynasty 2.2 update ready.', 'Update', function () { worker.postMessage({ type: 'SKIP_WAITING' }); });
            }
          });
        });
        navigator.serviceWorker.addEventListener('controllerchange', function () { location.reload(); });
        return reg;
      }).catch(function () { return null; });
    },
    canInstall: function () { return !!deferredInstall; },
    install: function () { if (!deferredInstall) return Promise.resolve(false); deferredInstall.prompt(); return deferredInstall.userChoice.then(function (choice) { deferredInstall = null; return choice.outcome === 'accepted'; }); },
    checkForUpdate: function () { return registration ? registration.update() : Promise.resolve(null); }
  };
  window.GamePWA = PWA;
})();
