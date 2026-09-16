# Browser Release Verification Notes

The browser renderer was verified in an iPhone 16 Pro Max-sized 440×956 viewport. The WebGL 2 game board displayed the realistic coastal airport texture, GPU-rendered runway overlays, and active aircraft geometry. The cloud-shadow shader includes four octave-style value-noise layers whose combined darkening is capped at 26%, preserving runway visibility while the field drifts slowly across the scene.

The PWA manifest is served at `/manifest.json` with `display: "standalone"`, portrait orientation, a root start URL, and 192 px/512 px install icons. The service worker is also served at `/service-worker.js`; it caches the app shell and same-origin assets for repeat launches. TypeScript and all automated game tests are pending final execution after this change.
