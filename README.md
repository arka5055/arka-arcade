# Skyline Signal

**Skyline Signal** is a touch-first air-traffic-control game built as an Expo web application and installable Progressive Web App (PWA). It is optimized for iPhone Pro Max portrait play, while remaining runnable in a desktop browser for development and debugging.

The game uses a Canvas-based tactical board, player-drawn flight routes, finite approach-gate validation, aircraft-specific landing destinations, campaign progression, local score persistence, and a service-worker update flow designed not to interrupt an active session.

## Live PWA

The game is at [amber-brick-glow-nova.grok.me](https://amber-brick-glow-nova.grok.me/). Add that URL to the iPhone Home Screen from Safari.

## Local development

### Prerequisites

Install Node.js 22+ and pnpm 9+.

### Run the project

```bash
git clone https://github.com/arka5055/skyline-signal.git
cd skyline-signal
pnpm install
pnpm dev
```

Open the Expo web development URL shown in the terminal. For a mobile-sized test, use a 440 × 956 viewport or open the local network URL on an iPhone.

## Quality checks

Before committing gameplay or PWA changes, run:

```bash
pnpm check
pnpm test
npx expo export --platform web --output-dir /tmp/skyline-web-build
```

The gameplay suite contains route, destination, runway, helipad, finite-gate, landing-continuity, traffic, campaign, and release-marker regression tests.

## Project structure

| Area | Purpose |
|---|---|
| `app/(tabs)/index.tsx` | Game shell, HUD, campaign controls, modals, and score presentation |
| `components/AirTrafficCanvas.tsx` | Browser canvas renderer, touch routing, flight simulation, and visual effects |
| `constants/game-types.ts` | Aircraft, destinations, levels, and campaign data |
| `lib/` | Testable gameplay rules: landing geometry, route editing, missions, conflict detection, persistence, and PWA behavior |
| `tests/game.test.ts` | Deterministic game-rule regression suite |
| `public/` | PWA manifest, service worker, app icons, and static scenery |

## Touch and landing design

A player selects an aircraft and draws its route. The game preserves the player-authored line rather than replacing it with an invisible auto-route. Directional runways use finite approach gates: a route locks only when it crosses the correct coloured gate in the correct direction. Vertical destinations such as H1 use a small visible circular capture boundary, so a green capture point is always visually associated with the landing pad.

## Publishing

Publish from Grok so the live app stays at [amber-brick-glow-nova.grok.me](https://amber-brick-glow-nova.grok.me/). Do not publish a second PWA to GitHub Pages.

## Contribution workflow

Use feature branches and pull requests for isolated work. Keep gameplay rules testable in `lib/`, add a regression test for every input or routing defect, and verify the build label matches the manifest version before publishing.

## License

No open-source license has been selected yet. The repository is public for source access and collaboration; do not reuse the code or assets outside the owner’s authorization until a license is added.
