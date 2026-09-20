declare const __BUILD_TIMESTAMP__: string;

const BUILD_VERSION = typeof __BUILD_TIMESTAMP__ !== 'undefined' ? __BUILD_TIMESTAMP__ : 'dev';

const shouldSkipRegistration = () => {
  if (!import.meta.env.PROD) return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  const url = new URL(window.location.href);
  if (url.searchParams.get('sw') === 'off') return true;
  if (host.startsWith('id-preview--') || host.startsWith('preview--')) return true;
  if (host === 'lovableproject.com' || host.endsWith('.lovableproject.com')) return true;
  if (host === 'lovableproject-dev.com' || host.endsWith('.lovableproject-dev.com')) return true;
  if (host === 'beta.lovable.dev' || host.endsWith('.beta.lovable.dev')) return true;
  if (host.endsWith('.lovable.app')) return true;
  return false;
};

const unregisterExisting = async () => {
  if (!('serviceWorker' in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(
      regs
        .filter((r) => r.active?.scriptURL.endsWith('/sw.js') || r.installing?.scriptURL.endsWith('/sw.js') || r.waiting?.scriptURL.endsWith('/sw.js'))
        .map((r) => r.unregister())
    );
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }
    console.log('[SW] Skipped registration in preview/dev and cleared old SW + caches');
  } catch (e) {
    console.warn('[SW] Cleanup failed', e);
  }
};

export const registerServiceWorker = async () => {
  if (shouldSkipRegistration()) {
    await unregisterExisting();
    return;
  }
  if ('serviceWorker' in navigator) {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      
      console.log('[SW] Registered, build version:', BUILD_VERSION);
      
      registration.update();
      
      const sendVersion = (sw: ServiceWorker) => {
        sw.postMessage({ type: 'SET_VERSION', version: BUILD_VERSION });
      };

      if (registration.active) {
        sendVersion(registration.active);
      }

      const checkForUpdate = () => { registration.update(); };
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') checkForUpdate();
      });
      window.addEventListener('focus', checkForUpdate);
      
      navigator.serviceWorker.addEventListener('message', (event) => {
        if (event.data?.type === 'NEW_VERSION_AVAILABLE') {
          console.log('[SW] New content available, reloading...');
          window.location.reload();
        }
      });
      
      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (newWorker) {
          newWorker.addEventListener('statechange', () => {
            if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
              console.log('[SW] New SW installed, activating...');
              newWorker.postMessage({ type: 'SKIP_WAITING' });
            }
            if (newWorker.state === 'activated') {
              sendVersion(newWorker);
            }
          });
        }
      });
      
      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          console.log('[SW] Controller changed, refreshing...');
          window.location.reload();
        }
      });
      
    } catch (error) {
      console.error('Service Worker registration failed:', error);
    }
  }
};
