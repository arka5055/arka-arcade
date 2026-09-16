import { useEffect } from 'react';

/** Registers the offline app shell only in secure browser contexts. */
export function PwaLifecycle() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      // Offline caching is an enhancement; gameplay remains available over the network.
    });
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
