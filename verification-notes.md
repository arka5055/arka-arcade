# Browser Release Verification Notes

## Current control and startup fix

The browser initially served a stale WebGL release from an already registered sandbox service worker. The stale sandbox registration and its caches were cleared during verification, confirming the update path must use a new cache version for installed PWA sessions. The current service worker uses cache version `skyline-signal-v4`, applies network-first navigation, precaches the 92 KB progressive airport image, and caches same-origin assets after their first fetch.

The active browser build restores the high-fidelity HTML Canvas renderer. Its pointer handler stores every sampled point from the user's finger path and now assigns that exact sequence via `preservePlayerDrawnRoute`; the obsolete `buildAssistedRoute` function was removed. The landscape asset was reduced from 213 KB to 92 KB, preloaded from HTML, and gameplay spawns the initial aircraft after 180 ms. TypeScript, 15 game tests, and static web export passed before browser cache validation.

## Graphics and stage upgrade verification

The browser preview was cleared of its old service worker and cache before reopening. The current training-sector board loads with the upgraded aircraft, bright runway thresholds, per-aircraft destination guide-beam system, and current coastal scenery. The staged scenes are supplied as independently cached progressive JPEGs: crosswind coast (135 KB), alpine peak (176 KB), and superstorm radar (101 KB). The browser build passed TypeScript validation and static web export before this preview.
