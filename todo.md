# Skyline Signal – Feature and Quality Tracker

## Current release work

- [x] Restore exact player-drawn routes with no automated waypoint replacement.
- [x] Add live landing-lock validation and clearance feedback during route drawing.
- [x] Correct the initial touch-pickup point so a straight drag cannot cause a U-turn.
- [x] Add PWA launch-screen and optimized mobile scenery loading.
- [x] Add level-specific browser scenery: coastal training, crosswind coast, alpine peak, and superstorm radar.
- [x] Make traffic pressure rise gently during a sector and increase across stages.
- [x] Draw aircraft-to-destination guide beams, approach beacons, and runway callouts.
- [x] Upgrade aircraft visual signatures: jet exhaust, supersonic afterburners, and propeller animation.
- [x] Add staged collision feedback: flash, fireball, shockwave, debris, smoke, and layered impact audio.
- [ ] Verify stage transitions, collision playback, and iPhone viewport presentation after the integrated build.

## Aircraft hierarchy refinement

- [x] Make the helicopter the smallest and slowest active aircraft.
- [x] Reinforce original-style visual and speed hierarchy: helicopter → propeller → seaplane → commercial jet → supersonic.
- [ ] Validate the revised flight profile in the browser build.

## Deep game experience review

- [x] Make route editing transactional so a tap, cancellation, or interrupted gesture preserves the existing player-drawn path exactly.
- [x] Use a primary pointer with pointer capture to prevent multi-touch and off-canvas gesture confusion on iPhone browsers.
- [x] Add visible draft-route feedback for a single fast stroke and retain selected-aircraft context after lift-off.
- [x] Cap active traffic by sector and freeze spawning and physics behind the level-complete screen.
- [x] Auto-pause and safely cancel an active gesture when the PWA is hidden or loses focus.
- [x] Reflow live aircraft paths during a material viewport size change instead of silently separating paths from destinations.
- [x] Show only destinations active in the current sector, improve control target sizes, and use one focused conflict overlay.
- [x] Use one authoritative score value for the HUD, game-over record, high score, and leaderboard.
- [ ] Publish and verify the reviewed PWA release on GitHub Pages.
