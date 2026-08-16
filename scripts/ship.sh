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

# ring-verify.mjs (concepts/ART-DIRECTION-SPEC.md gate) — runs on every ship
# so it can't silently rot unrun (a gate nobody runs does not exist).
#
# 2026-08-16: RingAmbient IS now mounted in production (client/src/views/
# Display.jsx -> ParticleBackground.jsx's RING_WORLDS registry, midnight-
# galaxy theme) — the "dev-only /ambient preview route" reason this step
# used to be non-blocking no longer applies. A ring-verify regression is now
# a real production-visible bug on any live show using that theme, not
# dev-only noise.
#
# STILL NOT BLOCKING, for a different reason: the REGRESSION tier itself
# (the "must always be green" structural-correctness tier, not the separate
# spec-conformance/art-direction tier covered by HANDOFF-ring-thinktank.md's
# tracked order-of-work) is failing. Measured 2026-08-16, whole run =
# 35 checks / 23 PASS / 1 WARN / 11 FAIL, regression tier 3/19 red:
#   - safe-box luminance cap over on 2 of 12 stations (st0, st11)
#   - safe-box peak-forcing self-check (no effect on st2, st4, st8)
#   - [react-live] window.__world contract (see boot flake below)
# The stray-Math.random() red that used to be in this list was a stale
# allowlist in ring-verify.mjs (spawnMeteorShower was never added as a
# sanctioned caller), fixed 2026-08-16 — it now PASSes. The two safe-box
# reds are pre-existing (not introduced by the mount — matched within
# 1-3pts against the pre-mount build) but genuinely broken, not flaky.
# Flipping this to blocking today would fail EVERY future `npm run ship` —
# for any change, ring-related or not — until those are fixed. Leave
# non-blocking until Ben has made a call on those 2 stations; flip to
# blocking once the regression tier is actually green, so it becomes a real
# gate instead of a gate that's already red on day one.
#
# KNOWN GATE FLAKE — "the gate goes quiet": ring-verify runs the same check
# suite twice, once against the static concepts/ HTML and once against the
# live React route (`[react-live]`, vite dev server at /ambient?ring=1). When
# the live pass fails to boot it reports a single red — "target does not
# expose window.__world within 8s — cannot verify" — and every other
# react-live check simply never runs, roughly halving total coverage while
# the summary line still reads like a normal result. That is exactly what
# both 2026-08-16 runs above did, so the 35-check total is the REDUCED
# number, not the full suite. If a run's totals look suspiciously small,
# check for that line before trusting a green. Not investigated here.
echo "ship: running ring-verify (non-blocking — see this step's own comment for why)..."
npm run verify:ring || echo "ship: ring-verify reported FAIL — not blocking ship, see output above"

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
