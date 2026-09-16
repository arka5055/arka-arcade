import { useEffect } from 'react';

/** Registers the offline app shell only in secure browser contexts. */
export function PwaLifecycle() {
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
    navigator.serviceWorker.register('/service-worker.js').catch(() => {
      // Offline caching is an enhancement; gameplay remains available over the network.
    });
  }, []);
  return null;
}
