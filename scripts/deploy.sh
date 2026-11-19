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
webroot=${SPLASH_ONE_WEBROOT:?Set the deployment webroot}
transfer=(rsync -rtz --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r -e 'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15')
# Publish dependencies before the page that references them and switch the old URL last.
"${transfer[@]}" "${flags[@]}" --exclude='.DS_Store' -- src styles assets "$webroot/splash-one/"
"${transfer[@]}" "${flags[@]}" --no-times --checksum -- "$release_page" "$webroot/splash-one/index.html"
"${transfer[@]}" "${flags[@]}" -- deploy/patrol-redirect.conf "$webroot/patrol/.htaccess"
