#!/usr/bin/env bash
# design-sync CSS prep — run after `npm run build`, before the converter.
#
# The Vite build emits the compiled Tailwind stylesheet as dist/assets/index-<hash>.css
# with absolute font URLs (url(/assets/*.woff2)). The converter resolves font url()s
# relative to the stylesheet's own directory, so absolute /assets/ paths don't resolve
# and every @font-face dangles. Strip the /assets/ prefix → URLs resolve against
# dist/assets/ (where the woff2 live) → fonts copy into the bundle's fonts/.
#
# Output is the STABLE path cfg.cssEntry points at (dist/assets/index.ds.css), which
# also sidesteps the per-build hash changing in the source filename.
set -euo pipefail
cd "$(dirname "$0")/.."
src=$(ls dist/assets/index-*.css | head -1)
[ -n "$src" ] || { echo "no dist/assets/index-*.css — run 'npm run build' first" >&2; exit 1; }
sed 's#url(/assets/#url(#g' "$src" > dist/assets/index.ds.css
echo "wrote dist/assets/index.ds.css from $src"
