# Arcade

One repository for the launcher and both games.

- **Launcher** — pick a game
- **Skyline Signal** — touch-first air-traffic control
- **Thought Tracks** — divided-attention train routing

## Play

**[https://amber-brick-glow-nova.grok.me/](https://amber-brick-glow-nova.grok.me/)**

| | Play | Install |
| --- | --- | --- |
| Arcade | [amber-brick-glow-nova.grok.me](https://amber-brick-glow-nova.grok.me/) | Open, then Add to Home Screen |
| Skyline Signal | [/skyline/](https://amber-brick-glow-nova.grok.me/skyline/) | Open that page, then Add to Home Screen |
| Thought Tracks | [/tracks/](https://amber-brick-glow-nova.grok.me/tracks/) | Open that page, then Add to Home Screen |

Skyline Signal also remains on GitHub Pages at [https://arka5055.github.io/](https://arka5055.github.io/).

## Layout

```
arcade/            launcher PWA (served at /)
arcade/skyline/    Skyline Signal static PWA (served at /skyline/)
thought-tracks/    Thought Tracks PWA (served at /tracks/)
app/               Skyline Signal Expo source
```

## Local development

```bash
git clone https://github.com/arka5055/skyline-signal.git
cd skyline-signal
pnpm install
pnpm dev
```

`pnpm dev` serves the launcher. `pnpm run build` exports both games into the static PWA used for Grok publish.

## Source

Everything lives in this repo: [github.com/arka5055/skyline-signal](https://github.com/arka5055/skyline-signal)
