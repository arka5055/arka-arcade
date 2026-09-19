import { useEffect } from 'react';

const CACHE_RESET_KEY = 'skyline-cache-reset-v1.3.1';
const APP_BASE = process.env.EXPO_PUBLIC_BASE_URL || '';
const SW_URL = `${APP_BASE}/service-worker.js?v=${CACHE_RESET_KEY}`;
const SW_SCOPE = APP_BASE ? `${APP_BASE}/` : '/';

async function purgeStaleClients() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const alreadyReset = window.localStorage.getItem(CACHE_RESET_KEY) === '1';
  if (!alreadyReset) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.all(registrations.map((registration) => registration.unregister()));
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
    window.localStorage.setItem(CACHE_RESET_KEY, '1');
  }
}

/** Registers the offline app shell only in secure browser contexts. */
export function PwaLifecycle() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    let reloadingForUpdate = false;
    let registrationRef: ServiceWorkerRegistration | undefined;
    const announceUpdate = () => {
      window.dispatchEvent(new Event('skyline-pwa-update-ready'));
    };
    const watchInstallingWorker = (worker: ServiceWorker) => {
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          worker.postMessage({ type: 'SKIP_WAITING' });
          announceUpdate();
        }
      });
    };
    const onControllerChange = () => {
      if (reloadingForUpdate) window.location.reload();
    };
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    purgeStaleClients()
      .then(() => navigator.serviceWorker.register(SW_URL, { updateViaCache: 'none', scope: SW_SCOPE }))
      .then(async (registration) => {
        registrationRef = registration;
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          announceUpdate();
        }
        if (registration.installing) watchInstallingWorker(registration.installing);
        registration.addEventListener('updatefound', () => {
          if (registration.installing) watchInstallingWorker(registration.installing);
        });
        await registration.update();
      })
      .catch(() => {
        // Offline caching is an enhancement; gameplay remains available over the network.
      });

    const applyUpdate = () => {
      const waiting = registrationRef?.waiting;
      if (!waiting || reloadingForUpdate) return;
      reloadingForUpdate = true;
      waiting.postMessage({ type: 'SKIP_WAITING' });
    };
    window.addEventListener('skyline-apply-pwa-update', applyUpdate);

    return () => {
      window.removeEventListener('skyline-apply-pwa-update', applyUpdate);
      navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
    };
  }, []);

  useEffect(() => {
    const launchScreen = document.getElementById('skyline-launch-screen');
    if (!launchScreen) return;
    let hasDismissed = false;
    const dismiss = () => {
      if (hasDismissed) return;
      hasDismissed = true;
      launchScreen.style.transition = 'opacity 180ms ease-out';
      launchScreen.style.opacity = '0';
      window.setTimeout(() => launchScreen.remove(), 210);
    };
    const readyWindow = window as typeof window & { __skylineInteractive?: boolean };
    if (readyWindow.__skylineInteractive) dismiss();
    window.addEventListener('skyline-interactive', dismiss, { once: true });
    const safetyFallback = window.setTimeout(dismiss, 2200);
    return () => {
      window.removeEventListener('skyline-interactive', dismiss);
      window.clearTimeout(safetyFallback);
    };
  }, []);

  return null;
}
