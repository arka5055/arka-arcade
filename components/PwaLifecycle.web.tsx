import { useEffect } from 'react';

/** Registers the offline app shell only in secure browser contexts. */
export function PwaLifecycle() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    let reloadingForUpdate = false;
    const reloadForUpdate = () => {
      if (reloadingForUpdate) return;
      reloadingForUpdate = true;
      window.location.reload();
    };
    const watchInstallingWorker = (worker: ServiceWorker) => {
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          reloadForUpdate();
        }
      });
    };
    const onControllerChange = () => reloadForUpdate();
    navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);

    navigator.serviceWorker.register('/service-worker.js', { updateViaCache: 'none' })
      .then(async (registration) => {
        if (registration.waiting) reloadForUpdate();
        if (registration.installing) watchInstallingWorker(registration.installing);
        registration.addEventListener('updatefound', () => {
          if (registration.installing) watchInstallingWorker(registration.installing);
        });
        // Check on every launch rather than waiting for the browser's periodic SW update check.
        await registration.update();
      })
      .catch(() => {
        // Offline caching is an enhancement; gameplay remains available over the network.
      });

    return () => navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange);
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
    // Avoid a permanent overlay if the browser rejects canvas rendering for any reason.
    const safetyFallback = window.setTimeout(dismiss, 2200);
    return () => {
      window.removeEventListener('skyline-interactive', dismiss);
      window.clearTimeout(safetyFallback);
    };
  }, []);

  return null;
}
