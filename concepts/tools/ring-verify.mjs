#!/usr/bin/env node
// concepts/tools/ring-verify.mjs
//
// The verification gate for a "ring" world build (concepts/SCAFFOLD-world-ring.md,
// concepts/HANDOFF-world-07-ring.md). Loads a world in real headless Chromium,
// drives it deterministically through 3 full cylinders (36 turns — the wrap
// happens at turn 12, so this also proves periodicity, not just one wrap),
// and checks every MEASURABLE rule from the handoff doc with a number
// attached. Emits PASS/WARN/FAIL per check, exit 2 on any FAIL (Claude Code
// hook blocking convention, same as .claude/hooks/geometry-lint.mjs), exit 0
// otherwise.
//
// This is deliberately a SEPARATE tool from geometry-lint.mjs and
// visual-audit.mjs, not a mode bolted onto either:
//   - geometry-lint.mjs is a static, no-DOM check for gradient/glow bugs,
//     generic across every concepts/*.html and display/*.jsx file. The ring
//     engine's vocabulary (stations, cylinders, surge, the value arc) means
//     nothing to a campfire or a diner scene, so it doesn't belong there.
//   - visual-audit.mjs walks an animation's own timeline via a #phaseLabel
//     convention. A ring world has no timeline to poll — it's a deterministic
//     state machine (station 0-11, offsets, ARC) queried directly via the
//     window.__world contract the engine already exposes.
// Per the handoff doc: "Scope it to work, not to a pipeline." This script is
// the work. It IS wired into design-done-gate.mjs's Stop-hook (see that
// file's RING_FILE_RE), scoped to concepts/world-*.html only — this tool
// needs a standalone page exposing window.__world, which a bare ES module
// like client/src/worlds/midnightGalaxy.ring.js structurally can't do. The
// React port (RingAmbient.jsx + *.ring.js world data) has NO automated
// regression gate yet beyond ringEngine.js's vitest coverage — a future
// task, not this one.
//
// Usage:
//   node concepts/tools/ring-verify.mjs <path-to-html>
//
// Requires the target file to expose window.__world = { ENGINE, WORLD, ARC,
// cylinderOf, authorPeriodOf, station, jumpTo, turn, offset } — the contract
// concepts/world-07-ring.html already exports at the bottom of its script.

import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const target = process.argv[2];
if (!target) {
  console.error('Usage: node ring-verify.mjs <path-to-html>');
  process.exit(2);
}
const absPath = path.resolve(target);
const source = readFileSync(absPath, 'utf8');

const results = []; // { name, status: PASS|WARN|FAIL, detail }
function report(name, status, detail) { results.push({ name, status, detail }); }

// ── static check: no Math.random outside the sanctioned shooting-star
//    functions (spawnShoot, shootLoop) — the rest of world construction must
//    be reachable only through the one seeded hash. ──
function functionBody(src, name) {
  const m = src.match(new RegExp(`function\\s+${name}\\s*\\([^)]*\\)\\s*{`));
  if (!m) return null;
  let i = m.index + m[0].length, depth = 1;
  const start = i;
  while (depth > 0 && i < src.length) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') depth--;
    i++;
  }
  return { start: m.index, end: i };
}
{
  const scriptMatch = source.match(/<script>([\s\S]*?)<\/script>/);
  const script = scriptMatch ? scriptMatch[1] : source;
  const sanctioned = ['spawnShoot', 'shootLoop']
    .map(n => functionBody(script, n))
    .filter(Boolean);
  const randIdx = [];
  let idx = script.indexOf('Math.random(');
  while (idx !== -1) { randIdx.push(idx); idx = script.indexOf('Math.random(', idx + 1); }
  const stray = randIdx.filter(i => !sanctioned.some(s => i >= s.start && i < s.end));
  report('no-stray-math-random', stray.length === 0 ? 'PASS' : 'FAIL',
    stray.length === 0
      ? `all ${randIdx.length} Math.random() call(s) confined to spawnShoot/shootLoop`
      : `${stray.length} Math.random() call(s) outside spawnShoot/shootLoop (world construction must use the seeded hash)`);
}

// ── dynamic checks: drive the real thing in real Chromium ──
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const consoleErrors = [];
page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

await page.goto('file://' + absPath);
await page.waitForTimeout(500);

const world = await page.evaluate(() => {
  const w = window.__world;
  if (!w) return null;
  return {
    ENGINE: w.ENGINE, WORLD: w.WORLD, ARC: w.ARC,
    layers: w.ENGINE.LAYERS.filter(L => L.id !== 'sky').map(L => ({
      id: L.id, surge: L.surge, m: L.m,
      cylinder: w.cylinderOf(L), authorPeriod: w.authorPeriodOf(L),
    })),
  };
});
if (!world) {
  report('window.__world contract', 'FAIL', 'target does not expose window.__world — cannot verify');
  await browser.close();
  finish();
}

// 1. layer arithmetic — cylinder = PANES*surge, authorPeriod = cylinder/m
for (const L of world.layers) {
  const expectCyl = world.ENGINE.PANES * L.surge;
  const expectAuthor = expectCyl / L.m;
  const ok = L.cylinder === expectCyl && L.authorPeriod === expectAuthor;
  report(`layer arithmetic: ${L.id}`, ok ? 'PASS' : 'FAIL',
    `surge=${L.surge} m=${L.m} cylinder=${L.cylinder} (want ${expectCyl}) authorPeriod=${L.authorPeriod} (want ${expectAuthor})`);
}

// 2. real parallax — surge strictly differs across layers, ratio reported
{
  const surges = world.layers.map(L => L.surge);
  const allDiffer = new Set(surges).size === surges.length;
  const base = Math.min(...surges);
  const ratio = surges.map(s => (s / base).toFixed(2)).join(' : ');
  report('parallax is real', allDiffer ? 'PASS' : 'FAIL',
    `${world.layers.map(L => L.id).join(':')} surge ratio ${ratio}`);
}

// 3 & 4. phase-0 sync + integer arithmetic — drive 3 full cylinders (36 turns)
const wrapTurns = world.ENGINE.PANES; // 12
const driveLog = [];
for (let t = 1; t <= wrapTurns * 3; t++) {
  await page.evaluate(() => window.__world.turn());
  await page.waitForTimeout(world.ENGINE.SURGE_MS ? world.ENGINE.SURGE_MS + 200 : 2000);
  const st = await page.evaluate(() => ({ station: window.__world.station, offset: { ...window.__world.offset } }));
  driveLog.push({ t, ...st });
}
{
  const nonInt = driveLog.filter(e => Object.values(e.offset).some(v => !Number.isInteger(v)));
  report('integer arithmetic (no float reaches a transform)', nonInt.length === 0 ? 'PASS' : 'FAIL',
    nonInt.length === 0 ? `all offsets integer across ${driveLog.length} turns`
      : `${nonInt.length} turn(s) produced a non-integer offset, e.g. turn ${nonInt[0].t}: ${JSON.stringify(nonInt[0].offset)}`);
}
{
  const wrapPoints = [wrapTurns, wrapTurns * 2, wrapTurns * 3]; // 12, 24, 36
  const bad = wrapPoints.filter(t => {
    const e = driveLog.find(e => e.t === t);
    return !e || Object.values(e.offset).some(v => v !== 0);
  });
  report('all layers hit phase 0 together at turns 12/24/36', bad.length === 0 ? 'PASS' : 'FAIL',
    bad.length === 0 ? 'offsets {far:0,mid:0,near:0} at every wrap point'
      : `wrap point(s) ${bad.join(',')} did not land on {0,0,0}`);
}

// 5. content coverage — each layer's rendered strip >= cylinder + one frame
{
  const coverage = await page.evaluate(() => {
    // the sky layer's .surge never sets an explicit inline width (it's the
    // bare CSS 100%) — filtering to elements that DO carries exactly the
    // far/mid/near surges, in DOM order, with no index bookkeeping needed.
    const sized = [...document.querySelectorAll('.surge')].filter(el => el.style.width !== '');
    const nonSkyIds = window.__world.ENGINE.LAYERS.filter(L => L.id !== 'sky').map(L => L.id);
    const out = {};
    nonSkyIds.forEach((id, i) => { out[id] = sized[i] ? parseFloat(sized[i].style.width) : null; });
    return out;
  });
  const bad = world.layers.filter(L => !Number.isFinite(coverage[L.id]) || coverage[L.id] < L.cylinder + world.ENGINE.W);
  report('content coverage >= cylinder + 1 frame', bad.length === 0 ? 'PASS' : 'FAIL',
    bad.length === 0 ? JSON.stringify(coverage)
      : `short: ${bad.map(L => `${L.id} has ${coverage[L.id]}, needs >=${L.cylinder + world.ENGINE.W}`).join('; ')}`);
}

// 6. value arc span, target 2.2-4.0x
{
  const span = Math.max(...world.ARC) / Math.min(...world.ARC);
  const status = span >= 2.2 && span <= 4.0 ? 'PASS' : 'FAIL';
  report('value arc span (target 2.2-4.0x)', status, `${span.toFixed(2)}x — ARC ${world.ARC.map(v => v.toFixed(1)).join(',')}`);
}

// 7. no-flat-neighbours — adjacent rank distance >=2 for at least 8/12 steps
{
  const ARC = world.ARC;
  const ranked = ARC.map((v, i) => ({ v, i })).sort((a, b) => a.v - b.v).map((o, rank) => ({ i: o.i, rank }));
  const rankOf = new Array(ARC.length);
  ranked.forEach(({ i, rank }) => { rankOf[i] = rank; });
  let ok = 0;
  for (let i = 0; i < ARC.length; i++) {
    const j = (i + 1) % ARC.length;
    if (Math.abs(rankOf[i] - rankOf[j]) >= 2) ok++;
  }
  report('no-flat-neighbours (need >=8/12)', ok >= 8 ? 'PASS' : 'FAIL', `${ok}/${ARC.length} adjacent steps differ by >=2 ranks`);
}

// 8. world.type is a required, valid field
{
  const validTypes = ['space', 'terrestrial', 'aquatic', 'aerial', 'interior'];
  const ok = validTypes.includes(world.WORLD.type);
  report('WORLD.type is required and valid', ok ? 'PASS' : 'FAIL',
    ok ? `type: ${world.WORLD.type}` : `type "${world.WORLD.type}" not in ${validTypes.join('|')}`);
}

// 9. space worlds ban vertical gradients (a vertical ramp always implies a horizon)
if (world.WORLD.type === 'space') {
  const skyBg = await page.evaluate(() => getComputedStyle(document.querySelector('.void')).backgroundImage);
  const ok = /radial-gradient/.test(skyBg) && !/linear-gradient/.test(skyBg);
  report('space world sky is radial-only', ok ? 'PASS' : 'FAIL', skyBg.slice(0, 80) + (skyBg.length > 80 ? '…' : ''));
}

// 10. visible star count per frame across all 12 stations, target 150-260
{
  await page.evaluate(() => window.__world.jumpTo(0));
  const counts = [];
  for (let s = 0; s < world.ENGINE.PANES; s++) {
    await page.evaluate((station) => window.__world.jumpTo(station), s);
    const n = await page.evaluate(() => {
      const design = document.getElementById('design');
      const dRect = design.getBoundingClientRect();
      const scale = dRect.width / 1920 || 1;
      let visible = 0;
      document.querySelectorAll('.star').forEach(el => {
        const r = el.getBoundingClientRect();
        const x = (r.left - dRect.left) / scale, y = (r.top - dRect.top) / scale;
        if (x > -20 && x < 1940 && y > -20 && y < 1100) visible++;
      });
      return visible;
    });
    counts.push(n);
  }
  const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
  const status = mean >= 150 && mean <= 260 ? 'PASS' : mean >= 120 && mean <= 300 ? 'WARN' : 'FAIL';
  report('visible stars per frame (target 150-260)', status, `mean ${mean.toFixed(0)} — per-station ${counts.join(',')}`);
}

// 11. console clean across the entire drive
report('console clean', consoleErrors.length === 0 ? 'PASS' : 'FAIL',
  consoleErrors.length === 0 ? 'no console errors or page errors across boot + 36 turns'
    : consoleErrors.slice(0, 5).join(' | '));

await browser.close();
finish();

function finish() {
  const width = Math.max(...results.map(r => r.name.length));
  for (const r of results) {
    console.log(`${r.status.padEnd(4)} ${r.name.padEnd(width)}  ${r.detail}`);
  }
  const fails = results.filter(r => r.status === 'FAIL');
  const warns = results.filter(r => r.status === 'WARN');
  console.log(`\n${results.length} checks — ${results.length - fails.length - warns.length} PASS, ${warns.length} WARN, ${fails.length} FAIL`);
  process.exit(fails.length > 0 ? 2 : 0);
}
