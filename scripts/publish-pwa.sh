#!/usr/bin/env bash
set -euo pipefail

# Publish Skyline Signal to its permanent GitHub Pages address without changing
# the PWA's manifest identity, Home Screen icon, start URL, or repository.
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
touch "$OUTPUT_DIR/.nojekyll"

# Always deploy to the existing gh-pages branch. The URL stays:
# https://arka5055.github.io/ — so prior Home Screen installations stay valid.
gh auth setup-git >/dev/null
gh repo view "$REPO" >/dev/null
TOKEN="$(gh auth token)"
git clone --depth 1 --branch gh-pages "https://x-access-token:${TOKEN}@github.com/${REPO}.git" "$WORK_DIR"

# Preserve the repository's Pages workflow while replacing every published asset.
find "$WORK_DIR" -mindepth 1 -maxdepth 1 \
  ! -name '.git' ! -name '.github' \
  -exec rm -rf {} +
cp -a "$OUTPUT_DIR"/. "$WORK_DIR"/
touch "$WORK_DIR/.nojekyll"

cd "$WORK_DIR"
git config user.name 'Ariel via Manus'
git config user.email 'noreply@users.noreply.github.com'
git add -A
if git diff --cached --quiet; then
  echo "No PWA asset changes to publish."
else
  git commit -m "Publish Skyline Signal PWA v1.3.0"
  git push origin gh-pages
fi

gh api "repos/$REPO/pages" --jq '.html_url'
