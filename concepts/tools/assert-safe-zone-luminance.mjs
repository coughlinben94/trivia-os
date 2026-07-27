#!/usr/bin/env node
// concepts/tools/assert-safe-zone-luminance.mjs
//
// Deterministic, live-render luminance gate for the question safe-area
// (x20-80%, y28-72% of the stage) in campfire-sing-along-v1.html — the
// round-3 fix for a bug two independent design-critic passes found in
// round 2: #reflectionScrim's dimming was inconsistent ACROSS THE WIDTH of
// the reflection streak (bright at some x-positions, dim at others),
// because a radial gradient decays outward from one center point and
// mathematically cannot hold a flat level across a wide horizontal band.
//
// This tool does not re-check "is the CSS a radial or linear gradient" —
// that's a source-code question. It checks the thing that actually matters:
// does the RENDERED PIXEL DATA inside the safe-area ever get too bright,
// anywhere, at any moment? That makes it independent of which specific fix
// was applied and which element caused it — it would catch a bright star,
// a mistimed ember, or a future new element nobody thought to safe-zone-
// check, not just re-verify the one bug that was reported.
//
// ── Method ──
// Rather than sampling a handful of hand-picked (x,y) points (which is
// exactly the "single sampled point looked fine" mistake that let round 2's
// bug through review), this takes a real screenshot CLIPPED TO THE SAFE-AREA
// RECTANGLE at each timepoint and scans EVERY PIXEL in it via pngjs — this
// is a strict superset of "sample multiple x-positions spanning the full
// band width," not an approximation of it.
//
// ── Time coverage ──
// Sampled continuously from t=0 to t=10s in TIMESTEP increments, all in one
// page load:
//   - flameFlicker/glowPulse/corePulse/poolPulse all run on a 2.6s cycle —
//     10s covers ~3.8 full periods at shifting phase alignment relative to
//     the sample grid, so the true peak (not just the sampled peak) is
//     unlikely to be missed by more than half a timestep.
//   - embers (.ember) run 4.65s-7.37s cycles with negative animation-delays
//     (already mid-cycle at page load) — 10s exceeds the longest single
//     ember's own period, so every ember completes at least one full lap
//     through every keyframe percentage within the window.
//   - #shootingStar has a 34s period but only a ~6s animation-delay before
//     its one 34s cycle begins, and is only visible (opacity>0) for
//     roughly keyframe 2%-9%, i.e. real seconds ~6.68-9.06 — entirely
//     inside this same 0-10s window, so its one real transit is captured
//     without needing a second, separately-timed page load.
// TIMESTEP=0.2s -> 51 samples, chosen so the 2.6s pulse cycle gets ~13
// samples per period (fine enough to catch a sinusoidal peak within a few
// percent) while keeping total real wall-clock wait near 10s.
//
// ── Threshold ──
// Rec.709 relative luminance (0.2126 R + 0.7152 G + 0.0722 B), the same
// formula this project's own hand pixel-checks already used (confirms
// against DESIGN-WORKER-LESSONS.md's logged numbers: rgb(144,116,98) ->
// 120.6 by this formula, matching the "~120.7" the lessons file records).
//
// LUMINANCE_THRESHOLD = 110 (of 255). Reasoning, not a round number picked
// blind:
//   - The undimmed reflection fill (249,178,110) is ~192 by this formula —
//     the threshold must sit clearly below that or it certifies nothing.
//   - Round 2's radial fix measured ~120.7 luminance at its ONE sampled
//     point, yet still FAILED two independent critic passes because OTHER
//     x-positions across the same streak were measurably brighter (the
//     radial's un-decayed near-center alpha). A threshold at exactly 120
//     would have let that same failure slip through again at any x-position
//     that happened to land under it; 110 gives real margin below the
//     specific number that already fooled one review pass, on the theory
//     that "just under the number that already produced a false pass" is
//     not real margin.
//   - The safe-area's own text is rendered in a light cream (~245,230,211,
//     luminance ~231.8 by this formula). Keeping every background pixel
//     under 110 preserves a >120-point luminance gap to text at all times —
//     well past typical minimum-contrast guidance — while still being high
//     enough (roughly 4-5x the scene's own darkest ambient tones, e.g. the
//     treeline's rgb(4,8,27) at ~8.5) that a dimmed reflection or ember can
///     still read as "present, just quiet," not erased to pure black.
// This is a single global threshold, not per-element — the whole point of
// scanning raw pixels instead of asserting per-element opacity values is
// that the tool shouldn't need to know which element produced a bright
// pixel to flag it as a problem.
//
// Usage: node assert-safe-zone-luminance.mjs
// Exit code 0 = all samples under threshold, 1 = any sample at/over it.

import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const exportLine = execSync(`"${HERE}/ensure-xdamage-stub.sh"`, { encoding: 'utf8' }).trim();
const m = exportLine.match(/LD_LIBRARY_PATH="([^$"]+)/);
if (m) process.env.LD_LIBRARY_PATH = `${m[1]}${process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : ''}`;

const FILE = resolve(HERE, '..', 'campfire-sing-along-v1.html');
const SHOT_DIR = resolve(HERE, '..', '.audit-shots');
mkdirSync(SHOT_DIR, { recursive: true });

const SAFE_X_L = 0.20, SAFE_X_R = 0.80, SAFE_Y_T = 0.28, SAFE_Y_B = 0.72; // fractions of stage
const LUMINANCE_THRESHOLD = 110; // see header comment for full reasoning
const WINDOW_SEC = 10;
const TIMESTEP_SEC = 0.2;

function luminance(r, g, b) { return 0.2126 * r + 0.7152 * g + 0.0722 * b; }

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
const navStart = Date.now();
await page.goto(`file://${FILE}`, { waitUntil: 'load' });

const stageBox = await page.evaluate(() => {
  const r = document.getElementById('stage').getBoundingClientRect();
  return { x: r.left, y: r.top, width: r.width, height: r.height };
});

const clip = {
  x: Math.round(stageBox.x + SAFE_X_L * stageBox.width),
  y: Math.round(stageBox.y + SAFE_Y_T * stageBox.height),
  width: Math.round((SAFE_X_R - SAFE_X_L) * stageBox.width),
  height: Math.round((SAFE_Y_B - SAFE_Y_T) * stageBox.height),
};

const sampleTimes = [];
for (let t = 0; t <= WINDOW_SEC; t += TIMESTEP_SEC) sampleTimes.push(t);

let worst = null; // { lum, xPct, yPct, tSec, rgb }
let worstBuf = null; // raw PNG buffer for the worst frame, saved to disk after the loop
const perTimepointWorst = [];

for (const targetSec of sampleTimes) {
  const wait = targetSec * 1000 - (Date.now() - navStart);
  if (wait > 0) await page.waitForTimeout(wait);
  const realSec = (Date.now() - navStart) / 1000;

  const buf = await page.screenshot({ clip });
  const png = PNG.sync.read(buf);
  const { width, height, data } = png;

  let frameWorst = null;
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      const idx = (width * py + px) << 2;
      const lum = luminance(data[idx], data[idx + 1], data[idx + 2]);
      if (!frameWorst || lum > frameWorst.lum) {
        frameWorst = {
          lum, r: data[idx], g: data[idx + 1], b: data[idx + 2],
          xPct: SAFE_X_L * 100 + (px / width) * (SAFE_X_R - SAFE_X_L) * 100,
          yPct: SAFE_Y_T * 100 + (py / height) * (SAFE_Y_B - SAFE_Y_T) * 100,
        };
      }
    }
  }
  perTimepointWorst.push({ tSec: realSec, ...frameWorst });
  if (!worst || frameWorst.lum > worst.lum) {
    worst = { ...frameWorst, tSec: realSec };
    worstBuf = buf;
  }
}
await browser.close();

let worstShotPath = null;
if (worstBuf) {
  worstShotPath = resolve(SHOT_DIR, `safe-zone-luminance-worst-${Date.now()}.png`);
  writeFileSync(worstShotPath, worstBuf);
}

console.log(`\nSafe-zone luminance scan: ${FILE}`);
console.log(`Zone: x${(SAFE_X_L * 100).toFixed(0)}-${(SAFE_X_R * 100).toFixed(0)}%, y${(SAFE_Y_T * 100).toFixed(0)}-${(SAFE_Y_B * 100).toFixed(0)}% of stage`);
console.log(`Threshold: ${LUMINANCE_THRESHOLD} (Rec.709 luminance, 0-255)`);
console.log(`Sampled ${sampleTimes.length} timepoints x every pixel (${clip.width}x${clip.height}) over ${WINDOW_SEC}s\n`);

const failures = perTimepointWorst.filter(f => f.lum >= LUMINANCE_THRESHOLD);

console.log('t(s)   maxLum   at (x%,y%)         rgb              RESULT');
console.log('-'.repeat(70));
for (const f of perTimepointWorst) {
  const status = f.lum >= LUMINANCE_THRESHOLD ? 'FAIL' : 'PASS';
  console.log(
    `${f.tSec.toFixed(2).padEnd(6)} ${f.lum.toFixed(1).padEnd(8)} ` +
    `(${f.xPct.toFixed(1)},${f.yPct.toFixed(1)})`.padEnd(19) + ' ' +
    `${f.r},${f.g},${f.b}`.padEnd(16) + ` ${status}`
  );
}
console.log('-'.repeat(70));
console.log(`\nWorst overall: lum=${worst.lum.toFixed(1)} at (${worst.xPct.toFixed(1)}%,${worst.yPct.toFixed(1)}%), t=${worst.tSec.toFixed(2)}s, rgb(${worst.r},${worst.g},${worst.b})`);
console.log(`Worst-frame screenshot: ${worstShotPath}`);
console.log(`${perTimepointWorst.length - failures.length} PASS / ${failures.length} FAIL timepoints\n`);

process.exit(failures.length > 0 ? 1 : 0);
