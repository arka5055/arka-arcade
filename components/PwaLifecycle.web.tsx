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
    const fade = window.setTimeout(() => {
      launchScreen.style.transition = 'opacity 180ms ease-out';
      launchScreen.style.opacity = '0';
      window.setTimeout(() => launchScreen.remove(), 210);
    }, 80);
    return () => window.clearTimeout(fade);
  }, []);

  return null;
}
