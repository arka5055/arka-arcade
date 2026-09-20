import { summary } from "/progress.js?v=2";

const LAST_KEY = "arka-arcade-last";

function el(tag, attrs = {}, kids = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value);
  }
  for (const kid of kids) node.append(kid);
  return node;
}

function readJson(key) {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}

function scoreLine(game) {
  const fromHub = summary(game.id);
  if (fromHub) return fromHub;
  const spec = game.score;
  if (!spec) return "";
  try {
    if (spec.kind === "number") {
      const value = Number(localStorage.getItem(spec.key) || 0);
      return `${spec.label} ${value > 0 ? value : "—"}`;
    }
    const data = readJson(spec.key);
    if (spec.kind === "json") {
      const value = Number(data?.[spec.field] || 0);
      return `${spec.label} ${value > 0 ? value : "—"}`;
    }
    if (spec.kind === "vs") {
      const you = Number(data?.[spec.you] ?? data?.cpu?.[spec.you] ?? 0);
      const them = Number(data?.[spec.them] ?? data?.cpu?.[spec.them] ?? 0);
      return `${spec.label} ${you}–${them}`;
    }
  } catch {
    return spec.label;
  }
  return "";
}

function lastId() {
  const saved = readJson(LAST_KEY);
  return saved?.id || "";
}

function openGame(game, event) {
  event.preventDefault();
  localStorage.setItem(LAST_KEY, JSON.stringify({ id: game.id, at: Date.now() }));
  window.location.assign(game.path);
}

function card(game, resumeId) {
  const line = scoreLine(game);
  const img = el("img", { src: game.cover, alt: "", width: "800", height: "420" });
  const shot = el("div", { class: "shot" }, [img]);
  const meta = [
    el("p", { class: "kind", text: game.kind }),
    el("h2", { text: game.title }),
    el("p", { class: "best", text: line || "Best —" }),
  ];
  if (game.id === resumeId) meta.push(el("p", { class: "resume-tag", text: "Resume" }));
  const copy = el("div", { class: "copy" }, meta);
  const link = el("a", { class: `game ${game.id}`, href: game.path }, [shot, copy]);
  if (game.tone) link.style.background = game.tone;
  if (game.id === resumeId) link.classList.add("is-resume");
  link.addEventListener("click", (event) => openGame(game, event));
  return link;
}

function resumeBar(game) {
  const line = scoreLine(game);
  const bar = el("a", { class: "resume", href: game.path }, [
    el("span", { class: "resume-kicker", text: "Continue" }),
    el("b", { text: game.title }),
    el("span", { class: "resume-score", text: line || "Play" }),
  ]);
  bar.addEventListener("click", (event) => openGame(game, event));
  return bar;
}

function paint(catalog) {
  const resumeId = lastId();
  const byId = Object.fromEntries(catalog.games.map((game) => [game.id, game]));
  const ordered = catalog.games;

  const kicker = document.querySelector(".arka-kicker");
  const title = document.querySelector("h1");
  const lede = document.querySelector(".lede");
  const stamp = document.querySelector(".arka-stamp");
  const list = document.querySelector(".games");
  const resumeSlot = document.querySelector(".resume-slot");

  document.title = `${catalog.product} — ${catalog.studio}`;
  if (kicker) kicker.textContent = catalog.studio;
  if (title) title.textContent = catalog.product;
  if (lede) lede.textContent = catalog.tagline;
  if (stamp) stamp.textContent = `${catalog.studio} · ${catalog.games.length} games`;
  if (resumeSlot) {
    resumeSlot.replaceChildren();
    if (resumeId && byId[resumeId]) resumeSlot.append(resumeBar(byId[resumeId]));
  }
  if (list) {
    list.replaceChildren(...ordered.map((game) => card(game, resumeId)));
    list.setAttribute("aria-label", ordered.map((game) => game.title).join(", "));
  }
}

const catalog = await fetch("/games.json").then((res) => res.json());
paint(catalog);
window.addEventListener("pageshow", () => paint(catalog));
