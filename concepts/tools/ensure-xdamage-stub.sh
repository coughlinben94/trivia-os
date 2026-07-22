#!/usr/bin/env bash
# concepts/tools/ensure-xdamage-stub.sh
#
# Compiles concepts/tools/xdamage-stub.c into concepts/tools/.cache/libXdamage.so.1
# if it isn't already there. Idempotent, sub-second, safe to call every run.
#
# Why this exists: headless Chromium (via Playwright) fails its dependency check
# in this sandbox on exactly one missing shared library, libXdamage.so.1 — every
# other X11 lib it needs is already present, and apt-get/sudo are both hard-
# blocked here (no root, "no new privileges" set). See xdamage-stub.c's header
# comment for the full story and why a stub is safe (headless rendering never
# exercises the real X Damage extension).
#
# Usage: eval "$(./concepts/tools/ensure-xdamage-stub.sh)"
# Prints an `export LD_LIBRARY_PATH=...` line on stdout — eval it, or just read
# $LD_LIBRARY_PATH_XDAMAGE_STUB_DIR yourself from the last line if you'd rather
# merge it manually. Playwright/Chromium need this directory on LD_LIBRARY_PATH
# at launch time.
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CACHE_DIR="$HERE/.cache"
STUB="$CACHE_DIR/libXdamage.so.1"

if [ ! -f "$STUB" ]; then
  mkdir -p "$CACHE_DIR"
  gcc -shared -fPIC -o "$STUB" "$HERE/xdamage-stub.c" -Wl,-soname,libXdamage.so.1
fi

echo "export LD_LIBRARY_PATH=\"$CACHE_DIR\${LD_LIBRARY_PATH:+:\$LD_LIBRARY_PATH}\""
