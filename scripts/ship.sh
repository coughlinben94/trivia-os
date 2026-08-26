#!/usr/bin/env bash
# scripts/ship.sh — Tier 3 pre-push gate for trivia-os.
#
# Builds, serves the build locally, and runs host-smoke.spec.js against it.
# Only pushes to main on a pass. Blocks on any failure — nothing reaches
# main that hasn't at least loaded /host and /display with zero JS errors.
#
# Post-deploy health-check/rollback is NOT this script's job. That lives in
# Davos's independent deploy watchdog (davos/src/deploy-watchdog.ts), which
# watches every production deploy directly via the Vercel API regardless of
# how it reached main — a raw `git push`, a manual push, or this script.
# Keeping that logic out of here means there's exactly one place a rollback
# can be triggered from, not two racing copies.
set -euo pipefail

cd "$(dirname "$0")/.."

if [ -n "$(git status --porcelain)" ]; then
  echo "SHIP_BLOCKED: working tree has uncommitted changes — commit everything before shipping, so what gets tested is exactly what gets pushed."
  exit 1
fi

# 2026-08-16: this script only ever ran e2e smoke (host-smoke.spec.js) and
# non-blocking ring-verify — the entire vitest unit suite (pure-logic files:
# wagerScoring.test.js, skyRegions.test.js, scoreboardMath.test.js, etc.)
# never ran as part of shipping at all. A gate that skips the fast, cheap
# checks and only runs the slow e2e one catches "the app loads" but not "the
# scoring math is right" — exactly the class of bug the wager tier-collision
# fix and its adversarial critique found tonight. Blocking: it's fast
# (~200ms) and runs before the expensive build/preview/e2e steps, so a
# logic regression fails in under a second instead of after a full build.
echo "ship: running unit tests..."
npm run test:unit

# ring-verify.mjs (concepts/ART-DIRECTION-SPEC.md gate) — runs on every ship
# so it can't silently rot unrun (a gate nobody runs does not exist).
#
# 2026-08-16: RingAmbient IS mounted in production (client/src/views/
# Display.jsx -> ParticleBackground.jsx's RING_WORLDS registry, midnight-
# galaxy theme) — a ring-verify regression is a real production-visible bug
# on any live show using that theme, not dev-only noise.
#
# 2026-08-26: REGRESSION TIER NOW BLOCKS. Re-measured 3x today after the
# 2026-08-16 note below named 2 real (non-flaky) safe-box luminance reds at
# st0/st11 as the reason to stay non-blocking: both are now PASSing (st0
# mean6.1/p99.5-61, st11 mean11.3/p99.5-43, cap is mean<=34/p99.5<=68) —
# fixed sometime between 2026-08-16 and today, not re-diagnosed here, just
# confirmed gone. 3 runs: 34/34 green, 34/34 green, 1/31 FAIL (the known
# [react-live] boot flake below, on the 3rd run only) — read as flaky per
# the existing KNOWN GATE FLAKE note, not a new regression. This satisfies
# the 2026-08-16 note's own stated bar ("flip once regression tier is
# actually green"), so this step now fails the ship on any REGRESSION-tier
# red. It intentionally does NOT fail on the separate SPEC-CONFORMANCE tier
# (still 16-17/31 below spec as of today — tracked separately per
# HANDOFF-ring-thinktank.md's order-of-work, not a shipping blocker; that
# tier is about art-direction quality, not structural correctness). This
# only reads ring-verify.mjs's own printed "regression tier:" summary line
# to decide — ring-verify.mjs's pass/fail logic and thresholds are not
# touched here (STAYS-HUMAN, references/ring-world-continuity.md §4).
#
# KNOWN GATE FLAKE — "the gate goes quiet": ring-verify runs the same check
# suite twice, once against the static concepts/ HTML and once against the
# live React route (`[react-live]`, vite dev server at /ambient?ring=1). When
# the live pass fails to boot it reports a single red — "target does not
# expose window.__world within 8s — cannot verify" — and every other
# react-live check simply never runs, roughly halving total coverage while
# the summary line still reads like a normal result. If a run's totals look
# suspiciously small, check for that line before trusting a green. If this
# step starts blocking ship on a flake rather than a real regression, that's
# the first thing to check — re-run `npm run verify:ring` once by hand.
echo "ship: running ring-verify..."
set +e
RING_OUTPUT="$(npm run verify:ring 2>&1)"
set -e
echo "$RING_OUTPUT"
if echo "$RING_OUTPUT" | grep -q "^regression tier: [0-9]*/[0-9]* FAIL"; then
  echo "SHIP_BLOCKED: ring-verify regression tier has structural-correctness failures — see REGRESSION TIER section above. (Spec-conformance-tier failures alone do not block — see this step's own comment.) If this looks like the documented [react-live] boot flake, re-run 'npm run verify:ring' by hand to confirm before spending time on a fix."
  exit 1
fi

PREVIEW_PORT=4173
PREVIEW_URL="http://localhost:${PREVIEW_PORT}"

echo "ship: building..."
npm run build

echo "ship: starting local preview on ${PREVIEW_URL}..."
npx vite preview --port "${PREVIEW_PORT}" --strictPort &
PREVIEW_PID=$!
trap 'kill "${PREVIEW_PID}" 2>/dev/null || true' EXIT

echo "ship: waiting for preview server..."
UP=0
for i in $(seq 1 30); do
  if curl -sf "${PREVIEW_URL}" > /dev/null; then
    UP=1
    break
  fi
  sleep 0.5
done
if [ "${UP}" -ne 1 ]; then
  echo "SHIP_BLOCKED: local preview server never came up on ${PREVIEW_URL}"
  exit 1
fi

echo "ship: running smoke test against local build..."
if PLAYWRIGHT_BASE_URL="${PREVIEW_URL}" npm run test:smoke; then
  echo "ship: smoke test passed, pushing to main..."
  kill "${PREVIEW_PID}" 2>/dev/null || true
  trap - EXIT
  git push origin main
  echo "SHIP_OK"
else
  echo "SHIP_BLOCKED: host-smoke.spec.js failed against the local build — nothing was pushed."
  exit 1
fi
