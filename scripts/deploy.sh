#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  "") flags=(--itemize-changes --dry-run) ;;
  --live) flags=(--itemize-changes) ;;
  *) echo "Usage: scripts/deploy.sh [--live]" >&2; exit 2 ;;
esac

release_page=$(mktemp)
trap 'rm -f "$release_page"' EXIT
node scripts/release-page.cjs > "$release_page"
config="${XDG_CONFIG_HOME:-$HOME/.config}/splash-one/deploy.conf"
game=$(git config --file "$config" --get deploy.game) || { echo "Set deploy.game in $config" >&2; exit 1; }
redirect=$(git config --file "$config" --get deploy.redirect) || { echo "Set deploy.redirect in $config" >&2; exit 1; }
[[ -n "$game" && -n "$redirect" ]] || { echo "Deployment destinations must be nonempty" >&2; exit 1; }
transfer=(rsync -rtz --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r -e 'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15')
# Publish dependencies before the page that references them and switch the old URL last.
"${transfer[@]}" "${flags[@]}" --exclude='.DS_Store' -- src styles assets "${game%/}/"
"${transfer[@]}" "${flags[@]}" --no-times --checksum -- "$release_page" "${game%/}/index.html"
"${transfer[@]}" "${flags[@]}" -- deploy/patrol-redirect.conf "$redirect"
