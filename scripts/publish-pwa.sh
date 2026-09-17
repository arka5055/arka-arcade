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
pnpm check
pnpm test
rm -rf "$OUTPUT_DIR"
npx expo export --platform web --output-dir "$OUTPUT_DIR"

# Always deploy to the existing gh-pages branch. The URL stays:
# https://arka5055.github.io/ — so prior Home Screen installations stay valid.
gh repo view "$REPO" >/dev/null
git clone --depth 1 --branch gh-pages "https://github.com/$REPO.git" "$WORK_DIR"

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
  git commit -m "Publish Skyline Signal PWA update"
  git push origin gh-pages
fi

gh api "repos/$REPO/pages" --jq '.html_url'
