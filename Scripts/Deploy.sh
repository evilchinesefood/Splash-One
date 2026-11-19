#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

case "${1:-}" in
  "") flags=(--itemize-changes --dry-run) ;;
  --live) flags=(--itemize-changes) ;;
  *) echo "Usage: Scripts/Deploy.sh [--live]" >&2; exit 2 ;;
esac

assets=(art.js audio.js bindings.js deck.js deck.css game.js hangar.js main.js upgrades.js world.js patrol.css upgrades.css pause-loadout.css pause-preferences.css
        patrol.png favicon.png apple-touch-icon.png)
for file in "${assets[@]}" index.html; do
  [[ -f "$file" ]] || { echo "Missing release file: $file" >&2; exit 1; }
done

# The host already has the parent webroot. rsync creates the patrol directory on first upload.
destination=${SPLASH_ONE_DESTINATION:?Set the deployment destination}
transfer=(rsync -rtz --chmod=Du=rwx,Dgo=rx,Fu=rw,Fgo=r -e 'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=15')
"${transfer[@]}" "${flags[@]}" "${assets[@]}" "$destination"
"${transfer[@]}" "${flags[@]}" index.html "$destination"
