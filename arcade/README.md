# My Arkade

One studio. One launcher. Every game in this repo.

Agents: open **`.grok/skills/arka-arcade/SKILL.md`** before adding or polishing a game.

Add a game by editing **one file**, then dropping a folder.

## Add a game

1. Put a portrait iPhone web game in `arcade/<id>/index.html`.
2. Add a cover at `arcade/media/<id>.jpg`.
3. Add an entry to [`games.json`](games.json).

The launcher reads `games.json`, shows every title in a two-column grid that fits an iPhone, and pulls **best scores** from each game’s `localStorage` key (declared on the catalog entry). Last played becomes a Continue bar. ALL GAMES on every title returns here.

If the game source lives outside `arcade/<id>/` (Thought Tracks does), set `"root"` to that folder. The build copies it to `/<id>/`.

## House bar

Same producer, same craft. Every game should:

- Show the **ARKA** kicker on its title screen
- Keep **ALL GAMES** on screen (`/arcade-home.css`, href `/`)
- Let the player restart without reloading the site
- Open straight into play — no extra PLAY gate after the launcher
- **Pause on leave** — `visibilitychange` + `pagehide` via [`leave-pause.js`](leave-pause.js). Realtime games show Resume. Do not use `window.blur`.
- Be portrait, 44px taps, iPhone-first
- Never register a service worker at `/`

Art can differ. The chrome cannot.

## Files

| File | Role |
| --- | --- |
| `games.json` | Catalog |
| `brand.css` | Shared type and ARKA stamp |
| `arcade-home.css` | ALL GAMES chip |
| `leave-pause.js` | iPhone app-switch pause |
| `launcher.js` | Renders the picker from the catalog |
| `scripts/arcade-catalog.mjs` | Server + publish read this |