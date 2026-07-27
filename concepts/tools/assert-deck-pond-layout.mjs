#!/usr/bin/env node
// concepts/tools/assert-deck-pond-layout.mjs
//
// Machine-checkable layout + MOTION gate for firefly-summer-pond-deck-v1.html
// against firefly-summer-deck-spec.md's locked spec. Extends the meadow file's
// assert-firefly-layout.mjs approach (real getBoundingClientRect() geometry,
// not eyeballed) with the one addition the spec explicitly calls out as
// mandatory: a rotation-ANGLE-over-time check for both lanterns, sampled in
// degrees, not x/y position. Position-based checks are exactly what let the
// meadow swing pass 27/27 while never visibly moving enough to read as
// hanging — see the spec's own "Why this exists" section. Do not regress to
// a position-only check here.
//
// Static geometry is measured with .rm-force applied (freezes every .sd-anim
// animation at rest — rotate(0) for the lanterns) so bounding boxes reflect
// the LOCKED rest-pose numbers, not a mid-swing skewed box. The rotation
// check runs on a SEPARATE, un-frozen page load and samples real elapsed
// time against the CSS animation's own wall-clock progress.
//
// Usage: node assert-deck-pond-layout.mjs
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

const FILE = resolve(HERE, '..', 'firefly-summer-pond-deck-v1.html');
const SHOT_DIR = resolve(HERE, '..', '.audit-shots');
mkdirSync(SHOT_DIR, { recursive: true });

const TOL = 2; // ±2% of stage dimension, per spec (geometry checks)
const ANGLE_TOL = 1; // ±1deg, per spec (rotation checks)

function within(actual, expected, tol = TOL) { return Math.abs(actual - expected) <= tol; }
function withinAngle(actual, expected) { return Math.abs(actual - expected) <= ANGLE_TOL; }

const rows = [];
const add = (name, expectedLabel, actual, pass, note = '') => rows.push({ name, expectedLabel, actual, pass, note });

// ── PASS 1: static geometry, animations frozen at rest ──
{
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  await page.goto(`file://${FILE}`, { waitUntil: 'load' });
  await page.evaluate(() => document.getElementById('stage').classList.add('rm-force'));
  await page.waitForTimeout(150);

  const shotPath = resolve(SHOT_DIR, `deck-pond-static-${Date.now()}.png`);
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
    const bboxAll = (sel) => [...document.querySelectorAll(sel)].map(el => pct(el.getBoundingClientRect()));
    const minTop = (sel) => { const els = bboxAll(sel); return els.length ? Math.min(...els.map(r => r.yT)) : null; };
    const dbg = window.__SCENE_DEBUG__ || {};
    return {
      sky: bbox('#sky'),
      hillFarTop: minTop('#hillFar path'),
      hillMidTop: minTop('#hillMid path'),
      hillNearTop: minTop('#hillNear path'),
      pondWater: bbox('#pondWater'),
      pondShoreline: bbox('#pondShoreline'),
      reflColL: bbox('#reflColL'),
      reflColR: bbox('#reflColR'),
      railCap: bbox('#railCap'),
      balusters: bboxAll('.baluster'),
      deckFloor: bbox('#deckFloor'),
      pivotL: bbox('#pivotL'),
      pivotR: bbox('#pivotR'),
      chainL: bbox('#chainL'),
      chainR: bbox('#chainR'),
      lanternBodyL: bbox('#lanternBodyL'),
      lanternBodyR: bbox('#lanternBodyR'),
      glowL: bbox('#glowL'),
      glowR: bbox('#glowR'),
      glowLBlur: (() => { const el = document.getElementById('glowL'); return el ? parseFloat(getComputedStyle(el).filter.match(/blur\(([\d.]+)px\)/)?.[1] || '0') : 0; })(),
      glowRBlur: (() => { const el = document.getElementById('glowR'); return el ? parseFloat(getComputedStyle(el).filter.match(/blur\(([\d.]+)px\)/)?.[1] || '0') : 0; })(),
      lightPoolL: bbox('#lightPoolL'),
      lightPoolR: bbox('#lightPoolR'),
      lightPoolLBlur: (() => { const el = document.getElementById('lightPoolL'); return el ? parseFloat(getComputedStyle(el).filter.match(/blur\(([\d.]+)px\)/)?.[1] || '0') : 0; })(),
      lightPoolLAnimated: (() => { const el = document.getElementById('lightPoolL'); return el ? getComputedStyle(el).animationName !== 'none' : null; })(),
      fireflies: bboxAll('.firefly'),
      fireflyRefl: bboxAll('.fireflyRefl'),
      hillColors: dbg.hillColors || null,
      deckFloorLum: dbg.deckFloorLum ?? null,
      minBlurPx: dbg.minBlurPx ?? null,
      pondWaterIsAmber: dbg.pondWaterIsAmber ?? null,
    };
  });
  await browser.close();

  // SKY
  if (data.sky) {
    add('sky top', '0%', data.sky.yT.toFixed(2) + '%', within(data.sky.yT, 0));
    add('sky bottom', '43%', data.sky.yB.toFixed(2) + '%', within(data.sky.yB, 43));
  } else add('sky', '#sky present', 'MISSING', false);

  // HILLS
  const hillChecks = [['hillFar', data.hillFarTop, 43], ['hillMid', data.hillMidTop, 47], ['hillNear', data.hillNearTop, 51]];
  for (const [name, actual, expected] of hillChecks) {
    if (actual == null) add(`${name} ridgeline top`, `${expected}%`, 'MISSING', false);
    else add(`${name} ridgeline top`, `${expected}%`, actual.toFixed(2) + '%', within(actual, expected));
  }
  if (data.hillColors) {
    const { far, mid, near } = data.hillColors;
    add('hills darken far->near (measurable)', 'far > mid > near luminance', `${far?.toFixed(3)} > ${mid?.toFixed(3)} > ${near?.toFixed(3)}`, far > mid && mid > near);
  } else add('hill darkness ordering', 'window.__SCENE_DEBUG__.hillColors present', 'MISSING', false);

  // POND
  if (data.pondWater) {
    add('pond x-span start', '6%', data.pondWater.xL.toFixed(2) + '%', within(data.pondWater.xL, 6));
    add('pond x-span end', '94%', data.pondWater.xR.toFixed(2) + '%', within(data.pondWater.xR, 94));
    add('pond far shore y', '53%', data.pondWater.yT.toFixed(2) + '%', within(data.pondWater.yT, 53));
    add('pond near waterline y', '80%', data.pondWater.yB.toFixed(2) + '%', within(data.pondWater.yB, 80));
  } else add('pond', '#pondWater present', 'MISSING', false);

  if (data.pondShoreline) {
    add('shoreline band top', '52.6%', data.pondShoreline.yT.toFixed(2) + '%', within(data.pondShoreline.yT, 52.6, 0.5));
    add('shoreline band height', '0.7%', data.pondShoreline.hPct.toFixed(2) + '%', within(data.pondShoreline.hPct, 0.7, 0.5));
  } else add('shoreline', '#pondShoreline present', 'MISSING', false);

  if (data.pondWaterIsAmber != null) {
    add('water lit by sky only (no warm spill)', 'false', String(data.pondWaterIsAmber), data.pondWaterIsAmber === false);
  } else add('water-amber check', 'window.__SCENE_DEBUG__.pondWaterIsAmber present', 'MISSING', false);

  // REFLECTION COLUMNS
  [['reflColL', data.reflColL, 14], ['reflColR', data.reflColR, 86]].forEach(([name, r, expectedX]) => {
    if (!r) { add(name, 'present', 'MISSING', false); return; }
    const width = r.wPct, centerX = (r.xL + r.xR) / 2;
    add(`${name} width`, '4%', width.toFixed(2) + '%', within(width, 4));
    add(`${name} centered on lantern x`, `${expectedX}%`, centerX.toFixed(2) + '%', within(centerX, expectedX));
    add(`${name} y-span`, '53-80%', `${r.yT.toFixed(2)}-${r.yB.toFixed(2)}%`, within(r.yT, 53) && within(r.yB, 80));
  });

  // DECK / RAIL
  if (data.railCap) {
    add('rail cap y-span', '72-73.5%', `${data.railCap.yT.toFixed(2)}-${data.railCap.yB.toFixed(2)}%`, within(data.railCap.yT, 72) && within(data.railCap.yB, 73.5));
    add('rail cap x-span (full width)', '0-100%', `${data.railCap.xL.toFixed(2)}-${data.railCap.xR.toFixed(2)}%`, within(data.railCap.xL, 0) && within(data.railCap.xR, 100));
  } else add('rail cap', '#railCap present', 'MISSING', false);

  add('baluster count', '7', String(data.balusters.length), data.balusters.length === 7);
  const expectedBalusterX = [8, 22, 36, 50, 64, 78, 92];
  data.balusters.forEach((b, i) => {
    const centerX = (b.xL + b.xR) / 2;
    const expX = expectedBalusterX[i];
    add(`baluster[${i}] x / width`, `x=${expX ?? '?'}%, w=1%`, `x=${centerX.toFixed(2)}%, w=${b.wPct.toFixed(2)}%`, expX != null && within(centerX, expX) && within(b.wPct, 1, 0.5));
  });

  if (data.deckFloor) {
    add('deck floor y-span', '84-100%', `${data.deckFloor.yT.toFixed(2)}-${data.deckFloor.yB.toFixed(2)}%`, within(data.deckFloor.yT, 84) && within(data.deckFloor.yB, 100));
  } else add('deck floor', '#deckFloor present', 'MISSING', false);
  if (data.deckFloorLum != null && data.hillColors) {
    add('deck floor is darkest fill', 'deckFloorLum < hillNear', `${data.deckFloorLum.toFixed(3)} < ${data.hillColors.near?.toFixed(3)}`, data.deckFloorLum < data.hillColors.near);
  }

  // LANTERNS (static/rest geometry)
  if (data.pivotL) add('pivotL position', '(14%,1%)', `(${((data.pivotL.xL + data.pivotL.xR) / 2).toFixed(2)}%,${data.pivotL.yT.toFixed(2)}%)`, within((data.pivotL.xL + data.pivotL.xR) / 2, 14) && within(data.pivotL.yT, 1, 0.6));
  else add('pivotL', '#pivotL present', 'MISSING', false);
  if (data.pivotR) add('pivotR position', '(86%,1.5%)', `(${((data.pivotR.xL + data.pivotR.xR) / 2).toFixed(2)}%,${data.pivotR.yT.toFixed(2)}%)`, within((data.pivotR.xL + data.pivotR.xR) / 2, 86) && within(data.pivotR.yT, 1.5, 0.6));
  else add('pivotR', '#pivotR present', 'MISSING', false);

  [['chainL', data.chainL], ['chainR', data.chainR]].forEach(([name, c]) => {
    if (!c) { add(name, 'present', 'MISSING', false); return; }
    add(`${name} vertical (near-zero x-span)`, '<1.2% width', c.wPct.toFixed(2) + '%', c.wPct < 1.2);
  });

  if (data.lanternBodyL) {
    add('lanternBodyL top y', '14%', data.lanternBodyL.yT.toFixed(2) + '%', within(data.lanternBodyL.yT, 14));
    add('lanternBodyL center x', '14%', ((data.lanternBodyL.xL + data.lanternBodyL.xR) / 2).toFixed(2) + '%', within((data.lanternBodyL.xL + data.lanternBodyL.xR) / 2, 14));
    add('lanternBodyL width', '5.5%', data.lanternBodyL.wPct.toFixed(2) + '%', within(data.lanternBodyL.wPct, 5.5));
    add('lanternBodyL height', '7.5%', data.lanternBodyL.hPct.toFixed(2) + '%', within(data.lanternBodyL.hPct, 7.5));
  } else add('lanternBodyL', '#lanternBodyL present', 'MISSING', false);
  if (data.lanternBodyR) {
    add('lanternBodyR top y', '11.5%', data.lanternBodyR.yT.toFixed(2) + '%', within(data.lanternBodyR.yT, 11.5));
    add('lanternBodyR center x', '86%', ((data.lanternBodyR.xL + data.lanternBodyR.xR) / 2).toFixed(2) + '%', within((data.lanternBodyR.xL + data.lanternBodyR.xR) / 2, 86));
    add('lanternBodyR width', '4.8%', data.lanternBodyR.wPct.toFixed(2) + '%', within(data.lanternBodyR.wPct, 4.8));
    add('lanternBodyR height', '6.8%', data.lanternBodyR.hPct.toFixed(2) + '%', within(data.lanternBodyR.hPct, 6.8));
  } else add('lanternBodyR', '#lanternBodyR present', 'MISSING', false);

  if (data.glowL && data.lanternBodyL) {
    const expectedDiam = 2.2 * data.lanternBodyL.wPct * 2;
    add('glowL diameter (2.2x body width radius)', expectedDiam.toFixed(2) + '%', data.glowL.wPct.toFixed(2) + '%', within(data.glowL.wPct, expectedDiam, expectedDiam * 0.15));
    add('glowL blur', '>=8px', data.glowLBlur.toFixed(1) + 'px', data.glowLBlur >= 8);
  } else add('glowL', 'present', 'MISSING', false);
  if (data.glowR && data.lanternBodyR) {
    const expectedDiam = 2.2 * data.lanternBodyR.wPct * 2;
    add('glowR diameter (2.2x body width radius)', expectedDiam.toFixed(2) + '%', data.glowR.wPct.toFixed(2) + '%', within(data.glowR.wPct, expectedDiam, expectedDiam * 0.15));
    add('glowR blur', '>=8px', data.glowRBlur.toFixed(1) + 'px', data.glowRBlur >= 8);
  } else add('glowR', 'present', 'MISSING', false);

  [['lightPoolL', data.lightPoolL, 14], ['lightPoolR', data.lightPoolR, 86]].forEach(([name, p, expX]) => {
    if (!p) { add(name, 'present', 'MISSING', false); return; }
    add(`${name} width`, '15%', p.wPct.toFixed(2) + '%', within(p.wPct, 15));
    add(`${name} centered under lantern`, `${expX}%`, ((p.xL + p.xR) / 2).toFixed(2) + '%', within((p.xL + p.xR) / 2, expX));
  });
  add('lightPoolL blur', '>=7px', data.lightPoolLBlur.toFixed(1) + 'px', data.lightPoolLBlur >= 7);
  if (data.lightPoolLAnimated != null) add('lightPoolL is static (no swing)', 'no animation', data.lightPoolLAnimated ? 'animated' : 'static', data.lightPoolLAnimated === false);

  // FIREFLIES
  add('firefly count', '14', String(data.fireflies.length), data.fireflies.length === 14);
  const fliesOutOfBounds = data.fireflies.filter(f => {
    const cx = (f.xL + f.xR) / 2, cy = (f.yT + f.yB) / 2;
    return cx < 16 - TOL || cx > 84 + TOL || cy < 56 - TOL || cy > 76 + TOL;
  });
  add('fireflies within x16-84/y56-76', '0 out of bounds', `${fliesOutOfBounds.length} out of bounds`, fliesOutOfBounds.length === 0);
  const aboveLine = data.fireflies.filter(f => (f.yT + f.yB) / 2 < 56 - TOL);
  add('none above y56', '0', String(aboveLine.length), aboveLine.length === 0);
  add('firefly reflection count', '5', String(data.fireflyRefl.length), data.fireflyRefl.length === 5);

  if (data.minBlurPx != null) add('blur floor (every element)', '>=1.5px', data.minBlurPx.toFixed(2) + 'px', data.minBlurPx >= 1.5);
  else add('blur floor check', 'window.__SCENE_DEBUG__.minBlurPx present', 'MISSING', false);

  rows.push({ __shot: shotPath });
}

// ── PASS 2: rotation-angle-over-time, animations running live (no rm-force) ──
{
  const browser = await chromium.launch({ args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  const navStart = Date.now();
  await page.goto(`file://${FILE}`, { waitUntil: 'load' });

  const HOLD = 0.6, PERIOD_L = 6.2, PERIOD_R = 7.4, AMP_L = 9, AMP_R = 7;
  const expectedAngle = (t, amp, period) => (t < HOLD ? 0 : amp * Math.sin(2 * Math.PI * (t - HOLD) / period));
  const sampleTimesSec = [0.3, 2.15, 2.45, 3.7, 4.3, 5.25, 6.15, 6.8, 8.0];

  const samples = [];
  for (const targetSec of sampleTimesSec) {
    const wait = targetSec * 1000 - (Date.now() - navStart);
    if (wait > 0) await page.waitForTimeout(wait);
    const realSec = (Date.now() - navStart) / 1000;
    const angles = await page.evaluate(() => {
      const angleOf = (id) => {
        const el = document.getElementById(id);
        if (!el) return null;
        const t = getComputedStyle(el).transform;
        if (!t || t === 'none') return 0;
        const mtx = t.match(/matrix\(([^)]+)\)/);
        if (!mtx) return 0;
        const parts = mtx[1].split(',').map(Number);
        return Math.atan2(parts[1], parts[0]) * 180 / Math.PI;
      };
      return { L: angleOf('lanternSwayL'), R: angleOf('lanternSwayR') };
    });
    samples.push({ requestedSec: targetSec, realSec, angles });
  }
  await browser.close();

  for (const s of samples) {
    if (s.angles.L == null) { add(`lanternSwayL angle @${s.requestedSec}s`, 'element present', 'MISSING', false); continue; }
    const expL = expectedAngle(s.realSec, AMP_L, PERIOD_L);
    add(`lanternSwayL angle @t=${s.realSec.toFixed(2)}s`, expL.toFixed(2) + 'deg', s.angles.L.toFixed(2) + 'deg', withinAngle(s.angles.L, expL));
  }
  for (const s of samples) {
    if (s.angles.R == null) { add(`lanternSwayR angle @${s.requestedSec}s`, 'element present', 'MISSING', false); continue; }
    const expR = expectedAngle(s.realSec, AMP_R, PERIOD_R);
    add(`lanternSwayR angle @t=${s.realSec.toFixed(2)}s`, expR.toFixed(2) + 'deg', s.angles.R.toFixed(2) + 'deg', withinAngle(s.angles.R, expR));
  }
  // Never-in-phase check: normalized phase (angle/amplitude) should differ meaningfully
  // at at least one sample past the hold — proves distinct periods, not just distinct
  // amplitudes swinging in lockstep.
  const pastHold = samples.filter(s => s.realSec > HOLD + 0.5 && s.angles.L != null && s.angles.R != null);
  const phaseDiverges = pastHold.some(s => Math.abs(s.angles.L / AMP_L - s.angles.R / AMP_R) > 0.15);
  add('lanterns never in phase (normalized angle diverges)', 'true', String(phaseDiverges), phaseDiverges);
}

// ── PRINT TABLE ──
const shotEntry = rows.find(r => r.__shot);
const dataRows = rows.filter(r => !r.__shot);
const nameW = Math.max(...dataRows.map(r => r.name.length), 10);
const expW = Math.max(...dataRows.map(r => String(r.expectedLabel).length), 8);
const actW = Math.max(...dataRows.map(r => String(r.actual).length), 6);
let passCount = 0, failCount = 0;
if (shotEntry) console.log(`\nScreenshot: ${shotEntry.__shot}\n`);
console.log('ITEM'.padEnd(nameW) + '  ' + 'EXPECTED'.padEnd(expW) + '  ' + 'ACTUAL'.padEnd(actW) + '  RESULT');
console.log('-'.repeat(nameW + expW + actW + 20));
for (const r of dataRows) {
  const status = r.pass ? 'PASS' : 'FAIL';
  if (r.pass) passCount++; else failCount++;
  console.log(r.name.padEnd(nameW) + '  ' + String(r.expectedLabel).padEnd(expW) + '  ' + String(r.actual).padEnd(actW) + '  ' + status);
  if (r.note) console.log('  note: ' + r.note);
}
console.log('-'.repeat(nameW + expW + actW + 20));
console.log(`${passCount} PASS / ${failCount} FAIL / ${dataRows.length} total\n`);

process.exit(failCount > 0 ? 1 : 0);
