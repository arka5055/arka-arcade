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

function card(game) {
  const img = el("img", { src: game.cover, alt: "", width: "800", height: "420" });
  const shot = el("div", { class: "shot" }, [img]);
  const copy = el("div", { class: "copy" }, [
    el("p", { class: "kind", text: game.kind }),
    el("h2", { text: game.title }),
    el("p", { class: "blurb", text: game.blurb }),
    el("span", { class: "cta", text: "Play" }),
  ]);
  const link = el("a", { class: `game ${game.id}`, href: game.path }, [shot, copy]);
  if (game.tone) link.style.background = game.tone;
  return link;
}

const catalog = await fetch("/games.json").then((res) => res.json());
document.title = `${catalog.product} — ${catalog.studio}`;
const kicker = document.querySelector(".arka-kicker");
const title = document.querySelector("h1");
const lede = document.querySelector(".lede");
const stamp = document.querySelector(".arka-stamp");
const list = document.querySelector(".games");
if (kicker) kicker.textContent = catalog.studio;
if (title) title.textContent = catalog.product;
if (lede) lede.textContent = catalog.tagline;
if (stamp) stamp.textContent = `${catalog.studio} · ${catalog.games.length} games`;
if (list) {
  list.replaceChildren(...catalog.games.map(card));
  list.setAttribute("aria-label", catalog.games.map((game) => game.title).join(", "));
}
