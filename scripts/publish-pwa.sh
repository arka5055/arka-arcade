#!/usr/bin/env bash
set -euo pipefail

# Publish Skyline Signal to its public GitHub Pages PWA:
# https://arka5055.github.io/
# Thought Tracks remains the Grok app at:
# https://amber-brick-glow-nova.grok.me/
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO="arka5055/arka5055.github.io"
OUTPUT_DIR="$ROOT/.pwa-release"
WORK_DIR="$(mktemp -d -t skyline-pages.XXXXXX)"

cleanup() {
  rm -rf "$WORK_DIR"
}
trap cleanup EXIT

cd "$ROOT"
node scripts/bump-pwa-cache.mjs
npx tsc --noEmit --pretty false --skipLibCheck
npx vitest run tests/game.test.ts
rm -rf "$OUTPUT_DIR"
npx expo export --platform web --output-dir "$OUTPUT_DIR"
cp -f "$ROOT/public/service-worker.js" "$OUTPUT_DIR/service-worker.js"
cp -f "$ROOT/public/manifest.json" "$OUTPUT_DIR/manifest.json"
cp -f "$ROOT/public/icons/skyline-180.png" "$OUTPUT_DIR/apple-touch-icon.png"
touch "$OUTPUT_DIR/.nojekyll"

gh auth setup-git >/dev/null
gh repo view "$REPO" >/dev/null
TOKEN="$(gh auth token)"
git clone --depth 1 --branch gh-pages "https://x-access-token:${TOKEN}@github.com/${REPO}.git" "$WORK_DIR"

find "$WORK_DIR" -mindepth 1 -maxdepth 1 \
  ! -name '.git' ! -name '.github' \
  -exec rm -rf {} +
cp -a "$OUTPUT_DIR"/. "$WORK_DIR"/
touch "$WORK_DIR/.nojekyll"

cd "$WORK_DIR"
git config user.name 'Ariel via Grok'
git config user.email 'noreply@users.noreply.github.com'
git add -A
if git diff --cached --quiet; then
  echo "No PWA asset changes to publish."
else
  git commit -m "Publish Skyline Signal air-traffic PWA v1.3.0"
  git push origin gh-pages
fi

gh api "repos/$REPO/pages" --jq '.html_url'
