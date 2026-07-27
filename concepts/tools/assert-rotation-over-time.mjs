#!/usr/bin/env node
// concepts/tools/assert-rotation-over-time.mjs
//
// Generalizes the rotation-angle-over-time sampling proven in
// assert-deck-pond-layout.mjs into a reusable function, per the audit's
// finding that a position-only bounding-box check missed the meadow swing's
// near-motionless sway for 27 straight rounds — small-angle rotation can
// move a bounding box only 1-2% of stage width, inside typical position
// tolerance, while being clearly wrong to a human eye.
//
// No external matrix-decomposition dependency (transformation-matrix was
// the researched recommendation, but this repo doesn't have it installed
// and adding a dependency for one function felt like more risk than value
// here) — `matrix(a,b,c,d,e,f)`'s rotation angle is just `atan2(b,a)`, and
// the one real trap (atan2 wraps at ±180°) is handled below by unwrapping
// consecutive samples rather than comparing raw absolute angles.
//
// Usage as a library:
//   import { assertRotationOverTime } from './assert-rotation-over-time.mjs';
//   const result = await assertRotationOverTime(page, '#lanternLeft', {
//     amplitude: 9, period: 6.2, holdBeforeStart: 0.6, sampleCount: 12, toleranceDeg: 1,
//   });
//   // result = { rows: [...], passCount, failCount }
//
// Usage standalone (CLI): node assert-rotation-over-time.mjs <htmlFile> <selector> <amplitudeDeg> <periodSec>

function matrixToDeg(transformStr) {
  const m = transformStr.match(/matrix\(([^)]+)\)/);
  if (!m) return 0; // 'none' or unparseable — treat as 0deg, not a crash
  const [a, b] = m[1].split(',').map(Number);
  return Math.atan2(b, a) * (180 / Math.PI);
}

// Unwrap a sequence of raw atan2 angles so consecutive samples don't jump by
// ~360° across the ±180° seam — compares each sample to the PREVIOUS
// unwrapped value and shifts by the multiple of 360° that minimizes the
// jump, same idea decomposeTSR-based libraries handle internally.
function unwrap(rawDegs) {
  const out = [rawDegs[0]];
  for (let i = 1; i < rawDegs.length; i++) {
    let d = rawDegs[i] - out[i - 1];
    while (d > 180) d -= 360;
    while (d < -180) d += 360;
    out.push(out[i - 1] + d);
  }
  return out;
}

export async function assertRotationOverTime(page, selector, {
  amplitude, period, holdBeforeStart = 0, sampleCount = 12, toleranceDeg = 1,
}) {
  const rawSamples = [];
  const totalWindow = period; // sample across one full period
  const startedAt = Date.now();
  for (let i = 0; i < sampleCount; i++) {
    const t = holdBeforeStart + (i / (sampleCount - 1)) * totalWindow;
    const targetElapsed = t * 1000;
    const elapsedSoFar = Date.now() - startedAt;
    const waitMs = Math.max(0, targetElapsed - elapsedSoFar);
    if (waitMs > 0) await page.waitForTimeout(waitMs);
    const transformStr = await page.$eval(selector, el => getComputedStyle(el).transform).catch(() => 'none');
    rawSamples.push({ t, rawDeg: matrixToDeg(transformStr) });
  }
  const unwrapped = unwrap(rawSamples.map(s => s.rawDeg));
  const rows = rawSamples.map((s, i) => {
    const tSinceMotionStart = Math.max(0, s.t - holdBeforeStart);
    const expected = s.t < holdBeforeStart
      ? 0
      : amplitude * Math.sin((2 * Math.PI * tSinceMotionStart) / period);
    const actual = unwrapped[i];
    const diff = Math.abs(actual - expected);
    return { t: s.t.toFixed(2), expectedDeg: expected.toFixed(2), actualDeg: actual.toFixed(2),
      diffDeg: diff.toFixed(2), pass: diff <= toleranceDeg };
  });
  return { rows, passCount: rows.filter(r => r.pass).length, failCount: rows.filter(r => !r.pass).length };
}

// ── CLI mode ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const { chromium } = await import('playwright');
  const [, , htmlFile, selector, ampStr, periodStr] = process.argv;
  if (!htmlFile || !selector || !ampStr || !periodStr) {
    console.error('Usage: node assert-rotation-over-time.mjs <htmlFile> <selector> <amplitudeDeg> <periodSec>');
    process.exit(1);
  }
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage();
  await page.goto(`file://${htmlFile}`, { waitUntil: 'load' });
  const result = await assertRotationOverTime(page, selector, { amplitude: parseFloat(ampStr), period: parseFloat(periodStr) });
  await browser.close();
  console.log(`\nRotation-angle-over-time: ${selector}\n`);
  console.log('t(s)   expected(deg)  actual(deg)  diff(deg)  RESULT');
  for (const r of result.rows) {
    console.log(`${r.t.padEnd(6)} ${r.expectedDeg.padEnd(14)} ${r.actualDeg.padEnd(12)} ${r.diffDeg.padEnd(10)} ${r.pass ? 'PASS' : 'FAIL'}`);
  }
  console.log(`\n${result.passCount} PASS / ${result.failCount} FAIL\n`);
  process.exit(result.failCount > 0 ? 1 : 0);
}
