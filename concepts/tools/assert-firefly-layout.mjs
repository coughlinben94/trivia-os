#!/usr/bin/env node
// concepts/tools/assert-firefly-layout.mjs
//
// Machine-checkable layout gate for firefly-summer-meadow.html against the
// 2026-07-26 locked layout spec. Loads the file headless, forces rm-force
// (strips all .sd-anim animation so every measurement is taken at REST pose,
// not mid-sway/mid-flash), reads real getBoundingClientRect() geometry off
// the actual rendered DOM, and prints a PASS/FAIL table. This is the
// authority — "does it match" is this script's output, not a visual opinion.
//
// Tolerance: ±2% of stage dimension (spec's own number), applied as absolute
// percentage points. Range-type spec values (e.g. "26-30%") pass if the
// measured value falls within [min-2, max+2].
//
// One row-class is marked (resolved): the oak canopy-width/total-height
// spec conflict (a fixed 540x365 raster can't hit both numbers at once
// without distorting or clipping it — see the conversation this script was
// authored in). User chose "match canopy width, let height float" — those
// rows compare against the RESOLVED target, not the original literal spec
// number, and are labeled so a reader never mistakes them for literal
// spec compliance.
//
// Usage: node assert-firefly-layout.mjs
// Exit code 0 = all PASS, 1 = any FAIL.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdirSync } from 'node:fs';

const HERE = dirname(fileURLToPath(import.meta.url));
const exportLine = execSync(`"${HERE}/ensure-xdamage-stub.sh"`, { encoding: 'utf8' }).trim();
const m = exportLine.match(/LD_LIBRARY_PATH="([^$"]+)/);
if (m) process.env.LD_LIBRARY_PATH = `${m[1]}${process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : ''}`;

const FILE = resolve(HERE, '..', 'firefly-summer-meadow.html');
const SHOT_DIR = resolve(HERE, '..', '.audit-shots');
mkdirSync(SHOT_DIR, { recursive: true });

const TOL = 2; // ±2% of stage dimension, per spec

function within(actual, expected, tol = TOL) {
  return Math.abs(actual - expected) <= tol;
}
function withinRange(actual, lo, hi, tol = TOL) {
  return actual >= lo - tol && actual <= hi + tol;
}

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
await page.goto(`file://${FILE}`, { waitUntil: 'load' });

// Freeze every .sd-anim animation at rest pose before measuring anything.
await page.evaluate(() => document.getElementById('stage').classList.add('rm-force'));
await page.waitForTimeout(150);

const shotPath = resolve(SHOT_DIR, `layout-${Date.now()}.png`);
await page.screenshot({ path: shotPath });

const data = await page.evaluate(() => {
  const stage = document.getElementById('stage');
  const sRect = stage.getBoundingClientRect();
  const pct = (rect) => rect && ({
    xL: (rect.left - sRect.left) / sRect.width * 100,
    xR: (rect.right - sRect.left) / sRect.width * 100,
    yT: (rect.top - sRect.top) / sRect.height * 100,
    yB: (rect.bottom - sRect.top) / sRect.height * 100,
    wPct: rect.width / sRect.width * 100,
    hPct: rect.height / sRect.height * 100,
  });
  const bbox = (sel) => { const el = document.querySelector(sel); return el ? pct(el.getBoundingClientRect()) : null; };
  const minTopAmong = (sel) => {
    const els = [...document.querySelectorAll(sel)];
    if (!els.length) return null;
    let min = Infinity;
    for (const el of els) { const r = pct(el.getBoundingClientRect()); if (r.yT < min) min = r.yT; }
    return min;
  };
  const dbg = window.__SCENE_DEBUG__ || {};
  return {
    oak: bbox('#oakImg'),
    swingSeat: bbox('#swingSeat'),
    rope1: bbox('#rope1'),
    rope2: bbox('#rope2'),
    jar: bbox('#jarImg'),
    pondWater: bbox('#pondWater'),
    hill1Top: minTopAmong('#hill1 path'),
    hill2Top: minTopAmong('#hill2 path'),
    hill3Top: minTopAmong('#hill3 path'),
    horizonTop: minTopAmong('#treeBack path'),
    hillColors: dbg.hillColors || null, // {horizon,hill1,hill2,hill3}: relative luminance 0-1
    oakHue: dbg.oakHue ?? null,
    branchHue: dbg.branchHue ?? null,
    reflOakCount: document.querySelectorAll('#pond .reflOak').length,
    reflFireflyCount: document.querySelectorAll('#pond .reflFirefly').length,
    shoreline: !!document.querySelector('#pondShoreline'),
  };
});

await browser.close();

const rows = [];
const add = (name, expectedLabel, actual, pass, note = '') =>
  rows.push({ name, expectedLabel, actual, pass, note });

// ── OAK ──
if (data.oak) {
  const width = data.oak.wPct, height = data.oak.hPct;
  const trunkCenterX = (data.oak.xL + data.oak.xR) / 2;
  const canopyTopY = data.oak.yT, trunkBaseY = data.oak.yB;
  add('oak canopy width', '26-30%', width.toFixed(2) + '%', withinRange(width, 26, 30));
  add('oak trunk base y', '68%', trunkBaseY.toFixed(2) + '%', within(trunkBaseY, 68));
  add('oak trunk centre x', '33%', trunkCenterX.toFixed(2) + '%', within(trunkCenterX, 33));
  add('oak canopy top y', '≈34.3% (resolved)', canopyTopY.toFixed(2) + '%', within(canopyTopY, 34.35, 3),
    'literal spec=22% is geometrically incompatible with this 540x365 raster at 26-30% width — user chose width-priority, see header comment');
  add('oak total height', '≈33.7% (resolved)', height.toFixed(2) + '%', within(height, 33.65, 3),
    'literal spec=~46% not achievable alongside 26-30% width with this asset — see header comment');
} else {
  add('oak', 'element #oakImg present', 'MISSING', false);
}

// ── SWING ──
if (data.swingSeat) {
  const seatTopY = data.swingSeat.yT;
  const seatSpanX = data.swingSeat.wPct;
  const seatBottomY = data.swingSeat.yB;
  const trunkBaseY = data.oak ? data.oak.yB : 68;
  add('swing seat top y', '55%', seatTopY.toFixed(2) + '%', within(seatTopY, 55));
  add('swing seat x-span', '14%', seatSpanX.toFixed(2) + '%', within(seatSpanX, 14));
  const clearance = trunkBaseY - seatBottomY;
  add('swing seat ground clearance', '>=6% stage height', clearance.toFixed(2) + '%', clearance >= 6 - TOL);
} else {
  add('swing seat', 'element #swingSeat present', 'MISSING', false);
}
if (data.rope1 && data.rope2) {
  const r1Vertical = data.rope1.wPct < 1.2;
  const r2Vertical = data.rope2.wPct < 1.2;
  const tieSeparation = Math.abs(((data.rope1.xL + data.rope1.xR) / 2) - ((data.rope2.xL + data.rope2.xR) / 2));
  add('rope1 vertical (near-zero x-span)', '<1.2% width', data.rope1.wPct.toFixed(2) + '%', r1Vertical);
  add('rope2 vertical (near-zero x-span)', '<1.2% width', data.rope2.wPct.toFixed(2) + '%', r2Vertical);
  add('two distinct tie points (separation)', '>5% stage width', tieSeparation.toFixed(2) + '%', tieSeparation > 5);
} else {
  add('ropes', 'elements #rope1 and #rope2 present', 'MISSING', false);
}
if (data.oakHue != null && data.branchHue != null) {
  let diff = Math.abs(data.oakHue - data.branchHue);
  if (diff > 180) diff = 360 - diff;
  add('branch hue vs oak hue (same family)', '<=35deg', diff.toFixed(1) + 'deg', diff <= 35,
    `oakHue=${data.oakHue.toFixed(1)} branchHue=${data.branchHue.toFixed(1)}`);
} else {
  add('branch/oak hue', 'window.__SCENE_DEBUG__.{oakHue,branchHue} present', 'MISSING', false);
}

// ── JAR ──
if (data.jar) {
  add('jar height', '4% stage height', data.jar.hPct.toFixed(2) + '%', within(data.jar.hPct, 4));
  if (data.oak) {
    const clearOfCanopy = data.jar.xL >= data.oak.xR - TOL;
    const rightOfTrunk = data.jar.xL >= 33 - TOL;
    add('jar clear of oak canopy/trunk', 'jar.left >= oak.right', `jar.left=${data.jar.xL.toFixed(2)} oak.right=${data.oak.xR.toFixed(2)}`, clearOfCanopy);
    add('jar right of trunk (x33%)', 'jar.left >= 33%', data.jar.xL.toFixed(2) + '%', rightOfTrunk);
  }
} else {
  add('jar', 'element #jarImg present', 'MISSING', false);
}

// ── POND ──
if (data.pondWater) {
  add('pond x-span start', '38%', data.pondWater.xL.toFixed(2) + '%', within(data.pondWater.xL, 38));
  add('pond x-span end', '72%', data.pondWater.xR.toFixed(2) + '%', within(data.pondWater.xR, 72));
  add('pond far shore y', '66%', data.pondWater.yT.toFixed(2) + '%', within(data.pondWater.yT, 66));
  add('pond waterline y', '72%', data.pondWater.yB.toFixed(2) + '%', within(data.pondWater.yB, 72));
  add('pond shoreline edge element', 'present, distinct from fade', data.shoreline ? 'present' : 'MISSING', data.shoreline);
  add('pond reflects oak', '>=1 .reflOak element', data.reflOakCount, data.reflOakCount >= 1);
  add('pond reflects fireflies', '>=2 .reflFirefly elements', data.reflFireflyCount, data.reflFireflyCount >= 2);
} else {
  add('pond', 'element #pondWater present', 'MISSING', false);
}

// ── HILLS ──
const hillSpec = [['hill1', data.hill1Top, 64], ['hill2', data.hill2Top, 71], ['hill3', data.hill3Top, 78]];
for (const [name, actual, expected] of hillSpec) {
  if (actual == null) { add(`${name} top`, `${expected}%`, 'MISSING', false); continue; }
  add(`${name} silhouette top`, `${expected}%`, actual.toFixed(2) + '%', within(actual, expected));
}
if (data.hillColors) {
  const { horizon, hill1, hill2, hill3 } = data.hillColors;
  const order = horizon > hill1 && hill1 > hill2 && hill2 > hill3;
  add('hills darken front-to-back (measurable)', 'horizon > hill1 > hill2 > hill3 luminance', `${horizon?.toFixed(3)} > ${hill1?.toFixed(3)} > ${hill2?.toFixed(3)} > ${hill3?.toFixed(3)}`, order);
} else {
  add('hill darkness ordering', 'window.__SCENE_DEBUG__.hillColors present', 'MISSING', false);
}
if (data.horizonTop != null) {
  add('horizon (far treeline base)', '62%', data.horizonTop.toFixed(2) + '%', within(data.horizonTop, 62));
} else {
  add('horizon', 'path present in #treeBack', 'MISSING', false);
}

// ── PRINT TABLE ──
const nameW = Math.max(...rows.map(r => r.name.length), 10);
const expW = Math.max(...rows.map(r => String(r.expectedLabel).length), 8);
const actW = Math.max(...rows.map(r => String(r.actual).length), 6);
let passCount = 0, failCount = 0;
console.log(`\nScreenshot: ${shotPath}\n`);
console.log(
  'ITEM'.padEnd(nameW) + '  ' + 'EXPECTED'.padEnd(expW) + '  ' + 'ACTUAL'.padEnd(actW) + '  RESULT'
);
console.log('-'.repeat(nameW + expW + actW + 20));
for (const r of rows) {
  const status = r.pass ? 'PASS' : 'FAIL';
  if (r.pass) passCount++; else failCount++;
  console.log(
    r.name.padEnd(nameW) + '  ' + String(r.expectedLabel).padEnd(expW) + '  ' + String(r.actual).padEnd(actW) + '  ' + status
  );
  if (r.note) console.log('  note: ' + r.note);
}
console.log('-'.repeat(nameW + expW + actW + 20));
console.log(`${passCount} PASS / ${failCount} FAIL / ${rows.length} total\n`);

process.exit(failCount > 0 ? 1 : 0);
