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

## Original-game fidelity audit

- [x] Benchmark documented Planes Control rules, feature breadth, missions, progression, and presentation against first-party sources.
- [x] Audit Skyline Signal PWA touch mechanics, aircraft/destination model, stage content, feedback, accessibility, and PWA lifecycle.
- [x] Produce a source-cited Hebrew fidelity scorecard and a three-horizon parity roadmap.

## Comprehensive parity upgrade

- [x] Define an original 18-sector campaign with explicit difficulty, unlock-score, map-layout, fleet, and mission data.
- [x] Expand the fleet into distinct tactical roles: fighter, heavy cargo, tiltrotor, and airship mooring, alongside the existing aircraft.
- [x] Connect active weather, terrain, moving-object, wildfire, and fuel-priority rules to canvas physics and player feedback.
- [x] Add a selectable, locked/unlocked campaign map and sector achievements to the PWA interface.
- [x] Improve tactical readability, semantic status announcements, and safe PWA update handling.
- [x] Validate the complete campaign and publish it to the existing permanent PWA URL.

## Landing handoff reliability (v1.2.2)

- [x] Replace threshold-centre steering with a continuous final-glide aim point beyond the runway threshold.
- [x] Block staged landing animation from starting after a runway threshold overshoot.
- [x] Add regression coverage for forward-only final glide and touchdown entry.

## Anchor-free landing capture (v1.2.3)

- [x] Arm landing when a player line crosses the matching coloured approach corridor, rather than requiring release at an anchor point.
- [x] Preserve the player route up to the first valid corridor crossing and discard only the excess line beyond it.
- [x] Show the exact captured crossing point during the active green route preview.

## Finite-gate landing QA fix (v1.2.4)

- [x] Replace broad corridor-area capture with an exact finite approach-gate intersection.
- [x] Reject off-runway and parallel near-miss routes while retaining one-swipe gate crossing.
- [x] Run independent QA scenarios for R34, diagonal R28, vertical landing, overdraw, and nearby false positives.

## Helipad capture clarity (v1.2.5)

- [x] Restrict H1/M1 capture to a small pad-adjacent radius instead of a visually detached halo.
- [x] Guarantee the rendered vertical landing halo never shrinks below the valid capture boundary.
- [x] Independently recheck valid H1 arrival, a 50px near miss, and directional runway regression behavior.
