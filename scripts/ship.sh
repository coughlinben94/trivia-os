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
# so it can't silently rot unrun (a gate nobody runs does not exist). NOT
# blocking yet: RingAmbient.jsx is not mounted in production (dev-only
# /ambient preview route), and known spec-conformance gaps are open, tracked
# work (concepts/HANDOFF-ring-thinktank.md order-of-work, steps 5-11).
# Regression-tier failures (structural/engine correctness, not art-direction
# polish) are worth eyeballing here even so — this step never fails the ship.
echo "ship: running ring-verify (non-blocking, see concepts/HANDOFF-ring-thinktank.md)..."
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
