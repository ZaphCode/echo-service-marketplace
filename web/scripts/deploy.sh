#!/usr/bin/env bash
# Publica la PWA en GitHub Pages: copia web/dist a la carpeta app/ de la rama gh-pages, junto a la
# página del proyecto (que no se toca). Uso: npm run deploy
set -euo pipefail

WEB_DIR="$(cd "$(dirname "$0")/.." && pwd)"
REPO_DIR="$(cd "$WEB_DIR/.." && pwd)"
WORKTREE="$(mktemp -d)/gh-pages"

cd "$WEB_DIR"
npm test
npm run build

cd "$REPO_DIR"
git fetch origin gh-pages
git worktree add "$WORKTREE" origin/gh-pages --detach
trap 'git -C "$REPO_DIR" worktree remove --force "$WORKTREE"' EXIT

rm -rf "$WORKTREE/app"
cp -R "$WEB_DIR/dist" "$WORKTREE/app"

cd "$WORKTREE"
git add app
if git diff --cached --quiet; then
  echo "Sin cambios que publicar."
  exit 0
fi
git commit -m "PWA: publica la versión $(node -p "require('$WEB_DIR/package.json').version") ($(git -C "$REPO_DIR" rev-parse --short HEAD))"
git push origin HEAD:gh-pages
echo "Publicada en https://zaphcode.github.io/echo-service-marketplace/app/"
