#!/usr/bin/env node
// concepts/tools/assert-performance-budget.mjs
//
// Third leg of the design-verification stool, added 2026-07-27 — but NOT as
// a third VLM critic. Research (game-art pipelines, broadcast QC, digital
// signage soak-testing, WebAIM contrast guidance — see the Fable review this
// tool is built from) converges on the same answer: the axis beyond
// "correct" and "well-crafted" that real pipelines actually check is
// deterministic budget validation, not another judgment pass. The two
// existing critics already need up to 6 model calls per Stop and 9 revision
// rounds to close holes in just two panels; a third critic multiplies that
// fragility. A script adds none of it, and this is the one failure mode
// that can happen LIVE, hours into an actual show, that nothing else here
// would ever catch: a scene that's correct and beautiful and has dropped to
// 12fps by hour two.
//
// This is a SHORT-SAMPLE PROXY for a true multi-hour soak test, not the
// genuine article — say so plainly rather than oversell it. A short run
// catches a fast leak or an obviously escalating frame cost; it cannot
// prove a scene holds up over a real multi-hour show the way an actual
// overnight soak run would. If a scene ever fails in production after
// passing this, that's a real gap to escalate, not a bug in this tool.
//
// Checks, in two families:
//   STATIC (no browser, fast, geometry-lint-style):
//     1. Animated-property lint — @keyframes/transition declarations that
//        touch layout-triggering properties (top/left/width/height/margin/
//        padding/background-position) instead of transform/opacity force
//        the browser off the compositor thread and onto main-thread
//        layout, which is exactly what degrades over a long-running show.
//     2. DOM node count budget — a blunt proxy for both layout cost and
//        overall scene complexity.
//   DYNAMIC (headless render, short soak-proxy window):
//     3. FPS floor + trend — samples actual frame rate via
//        requestAnimationFrame over a short window; fails on a hard floor
//        breach OR a real downward trend within the sample (the trend
//        catches "this is already getting worse," even if the instantaneous
//        floor hasn't been crossed yet in a short run).
//     4. JS heap trend — samples performance.memory.usedJSHeapSize (Chromium
//        only, real headless Chrome has it); a heap that keeps climbing
//        rather than plateauing after initial warmup is the classic
//        long-running-HTML-content leak signature signage vendors warn
//        about.
//
// Usage as a library:
//   import { assertPerformanceBudget } from './assert-performance-budget.mjs';
//   const result = await assertPerformanceBudget(htmlFilePath, { sampleSeconds: 25 });
//
// Usage standalone (CLI): node assert-performance-budget.mjs <htmlFile> [sampleSeconds]

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ── STATIC CHECK 1: animated-property lint ──
const LAYOUT_TRIGGERING_PROPS = [
  'top', 'left', 'right', 'bottom', 'width', 'height',
  'margin', 'margin-top', 'margin-left', 'margin-right', 'margin-bottom',
  'padding', 'padding-top', 'padding-left', 'padding-right', 'padding-bottom',
  'background-position', 'font-size', 'line-height',
];
// filter/box-shadow are compositor-expensive but not layout-triggering, and
// this project deliberately uses blur(filter) for depth-of-field — WARN,
// not FAIL, so a real design choice doesn't get blocked by this tool.
const EXPENSIVE_BUT_ALLOWED_PROPS = ['filter', 'box-shadow', 'clip-path'];

function extractAnimationBlocks(cssText) {
  // @keyframes NAME { ... } — balanced-brace extraction, same technique as
  // geometry-lint's extractCalls(), for the same reason (regex alone can't
  // safely span nested braces).
  const blocks = [];
  const re = /@keyframes\s+([\w-]+)\s*\{/g;
  let m;
  while ((m = re.exec(cssText))) {
    let depth = 1, i = re.lastIndex;
    const start = i;
    while (i < cssText.length && depth > 0) {
      if (cssText[i] === '{') depth++;
      else if (cssText[i] === '}') depth--;
      i++;
    }
    blocks.push({ name: m[1], body: cssText.slice(start, i - 1) });
  }
  return blocks;
}

function lintAnimatedProperties(cssText) {
  const findings = [];
  for (const { name, body } of extractAnimationBlocks(cssText)) {
    // properties inside each keyframe step, e.g. `0% { top: 10px; opacity: 0; }`
    const propRe = /([a-zA-Z-]+)\s*:/g;
    const seen = new Set();
    let pm;
    while ((pm = propRe.exec(body))) {
      const prop = pm[1].toLowerCase();
      if (LAYOUT_TRIGGERING_PROPS.includes(prop) && !seen.has(`fail:${prop}`)) {
        seen.add(`fail:${prop}`);
        findings.push({ severity: 'FAIL', keyframe: name, prop,
          note: `animates '${prop}', a layout-triggering property — forces main-thread layout on every frame instead of compositor-only work. Use transform (translate/scale) or opacity instead.` });
      } else if (EXPENSIVE_BUT_ALLOWED_PROPS.includes(prop) && !seen.has(`warn:${prop}`)) {
        seen.add(`warn:${prop}`);
        findings.push({ severity: 'WARN', keyframe: name, prop,
          note: `animates '${prop}' — compositor-expensive but not layout-triggering; fine for a deliberate depth-of-field/glow effect, worth confirming it's intentional.` });
      }
    }
  }
  return findings;
}

// ── STATIC CHECK 2: DOM node budget ──
function countDomNodesStatic(htmlText) {
  // Rough static proxy (tag-open count) for the pre-browser fast path; the
  // dynamic check below gets the real number from the live DOM. This static
  // count exists so a wildly oversized file fails fast without paying for
  // a browser launch.
  const matches = htmlText.match(/<[a-zA-Z][\w-]*(\s|>|\/)/g) || [];
  return matches.length;
}

const DOM_NODE_WARN = 800;
const DOM_NODE_FAIL = 1500;

// ── DYNAMIC CHECKS: FPS + heap, sampled from a live headless render ──
async function sampleRuntime(htmlFile, sampleSeconds) {
  const { chromium } = await import('playwright');
  const browser = await chromium.launch({
    args: ['--no-sandbox', '--enable-precise-memory-info'],
  });
  const page = await browser.newPage();
  await page.goto(`file://${htmlFile}`, { waitUntil: 'load' });
  await page.waitForTimeout(1000); // let initial layout/animation settle before sampling

  const domNodeCount = await page.evaluate(() => document.querySelectorAll('*').length);

  // In-page sampler: counts frames via requestAnimationFrame and records
  // performance.memory at 1-second intervals. Runs entirely in-page so the
  // sample isn't polluted by IPC/round-trip latency between samples.
  const raw = await page.evaluate(async (seconds) => {
    return await new Promise((resolvePromise) => {
      const samples = []; // { second, frames, heapBytes|null }
      let frameCount = 0;
      let currentSecond = 0;
      let lastSecondStart = performance.now();
      let rafId;

      function tick() {
        frameCount++;
        const now = performance.now();
        if (now - lastSecondStart >= 1000) {
          samples.push({
            second: currentSecond,
            frames: frameCount,
            heapBytes: (performance).memory ? (performance).memory.usedJSHeapSize : null,
          });
          frameCount = 0;
          currentSecond++;
          lastSecondStart = now;
          if (currentSecond >= seconds) {
            cancelAnimationFrame(rafId);
            resolvePromise(samples);
            return;
          }
        }
        rafId = requestAnimationFrame(tick);
      }
      rafId = requestAnimationFrame(tick);
    });
  }, sampleSeconds);

  await browser.close();
  return { domNodeCount, samples: raw };
}

// Simple linear regression slope — used for both the FPS trend and the heap
// trend. Positive slope on heap = growing (bad). Negative slope on FPS =
// degrading (bad). No external stats dependency, same "don't add a
// dependency for one function" call assert-rotation-over-time.mjs already made.
function slope(points) {
  const n = points.length;
  if (n < 2) return 0;
  const xMean = points.reduce((s, p) => s + p.x, 0) / n;
  const yMean = points.reduce((s, p) => s + p.y, 0) / n;
  let num = 0, den = 0;
  for (const p of points) {
    num += (p.x - xMean) * (p.y - yMean);
    den += (p.x - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

const FPS_FLOOR = 24; // below this, motion reads as visibly stuttering, not just "a bit slow"
const FPS_DEGRADE_SLOPE_FAIL = -0.5; // fps lost per second of sample — a real, ongoing decline
const HEAP_GROWTH_WARN_BYTES_PER_SEC = 200_000; // ~0.2MB/s sustained — early warning
const HEAP_GROWTH_FAIL_BYTES_PER_SEC = 1_000_000; // ~1MB/s sustained — a real leak signature in a short window

export async function assertPerformanceBudget(htmlFile, { sampleSeconds = 25 } = {}) {
  const abs = resolve(htmlFile);
  const cssText = readFileSync(abs, 'utf8');
  const problems = [];
  const warnings = [];

  // Static checks first — cheap, no browser needed, fail fast.
  for (const f of lintAnimatedProperties(cssText)) {
    const line = `[${f.keyframe}] ${f.note}`;
    if (f.severity === 'FAIL') problems.push(line); else warnings.push(line);
  }
  const staticNodeCount = countDomNodesStatic(cssText);
  if (staticNodeCount > DOM_NODE_FAIL) {
    problems.push(`Static tag count ${staticNodeCount} exceeds hard budget ${DOM_NODE_FAIL} — likely to cost real layout/paint time over a long-running show.`);
  } else if (staticNodeCount > DOM_NODE_WARN) {
    warnings.push(`Static tag count ${staticNodeCount} exceeds soft budget ${DOM_NODE_WARN} — worth a look, not yet blocking.`);
  }

  // Dynamic checks — only pay for a browser launch if static checks didn't already fail outright.
  let domNodeCount = null, fpsRows = [], heapRows = [];
  if (problems.length === 0) {
    const { domNodeCount: liveCount, samples } = await sampleRuntime(abs, sampleSeconds);
    domNodeCount = liveCount;
    if (liveCount > DOM_NODE_FAIL) problems.push(`Live DOM node count ${liveCount} exceeds hard budget ${DOM_NODE_FAIL}.`);
    else if (liveCount > DOM_NODE_WARN) warnings.push(`Live DOM node count ${liveCount} exceeds soft budget ${DOM_NODE_WARN}.`);

    fpsRows = samples.map(s => ({ second: s.second, fps: s.frames }));
    const minFps = Math.min(...fpsRows.map(r => r.fps));
    const fpsSlope = slope(fpsRows.map(r => ({ x: r.second, y: r.fps })));
    if (minFps < FPS_FLOOR) problems.push(`FPS dropped to ${minFps} at some point in the sample, below the ${FPS_FLOOR}fps floor.`);
    if (fpsSlope < FPS_DEGRADE_SLOPE_FAIL) problems.push(`FPS is trending down ${Math.abs(fpsSlope).toFixed(2)} frames/sec over the sample window — a real, ongoing decline, not noise.`);

    if (samples.some(s => s.heapBytes != null)) {
      heapRows = samples.filter(s => s.heapBytes != null).map(s => ({ second: s.second, heapBytes: s.heapBytes }));
      // Drop the first 3 seconds from the heap trend — initial load/GC churn
      // is expected noise, not the leak signature this check exists to catch.
      const steadyState = heapRows.filter(r => r.second >= 3);
      const heapSlope = slope(steadyState.map(r => ({ x: r.second, y: r.heapBytes })));
      if (heapSlope > HEAP_GROWTH_FAIL_BYTES_PER_SEC) {
        problems.push(`JS heap growing ~${(heapSlope / 1_000_000).toFixed(2)}MB/sec after warmup — leak signature. A scene that leaks will degrade over a real multi-hour show even if this short sample never crosses the FPS floor.`);
      } else if (heapSlope > HEAP_GROWTH_WARN_BYTES_PER_SEC) {
        warnings.push(`JS heap growing ~${(heapSlope / 1_000_000).toFixed(2)}MB/sec after warmup — below the fail threshold but worth watching; this is a short sample, not a real soak test.`);
      }
    } else {
      warnings.push('performance.memory unavailable in this browser context — heap-trend check skipped. Chromium with --enable-precise-memory-info should expose it; if this keeps happening, the flag or browser may not be wired correctly.');
    }
  }

  return {
    pass: problems.length === 0,
    problems, warnings,
    domNodeCount: domNodeCount ?? staticNodeCount,
    fpsRows, heapRows,
    note: 'This is a short-sample proxy for a true multi-hour soak test, not a substitute for one. A scene passing this can still degrade over a real show; treat a production failure as a real gap to escalate, not a bug here.',
  };
}

// ── CLI mode ──
if (import.meta.url === `file://${process.argv[1]}`) {
  const [, , htmlFile, sampleSecondsArg] = process.argv;
  if (!htmlFile) {
    console.error('Usage: node assert-performance-budget.mjs <htmlFile> [sampleSeconds=25]');
    process.exit(1);
  }
  const sampleSeconds = sampleSecondsArg ? parseInt(sampleSecondsArg, 10) : 25;
  const result = await assertPerformanceBudget(htmlFile, { sampleSeconds });

  console.log(`\nPerformance budget: ${htmlFile} (${sampleSeconds}s sample)\n`);
  if (result.fpsRows.length) {
    console.log('FPS by second:', result.fpsRows.map(r => r.fps).join(', '));
  }
  if (result.heapRows.length) {
    console.log('Heap (MB) by second:', result.heapRows.map(r => (r.heapBytes / 1_000_000).toFixed(2)).join(', '));
  }
  console.log(`\nDOM node count: ${result.domNodeCount}`);
  if (result.warnings.length) {
    console.log('\nWARNINGS:');
    for (const w of result.warnings) console.log(`  - ${w}`);
  }
  if (result.problems.length) {
    console.log('\nFAIL:');
    for (const p of result.problems) console.log(`  - ${p}`);
  } else {
    console.log('\nPASS — within budget for this short sample.');
  }
  console.log(`\n(${result.note})\n`);
  process.exit(result.pass ? 0 : 1);
}
