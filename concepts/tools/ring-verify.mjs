#!/usr/bin/env node
// concepts/tools/ring-verify.mjs
//
// The verification gate for the "ring" world build (concepts/SCAFFOLD-world-ring.md,
// concepts/ART-DIRECTION-SPEC.md). Drives the world deterministically through 3 full
// cylinders (36 turns) and checks every MEASURABLE spec rule with a number attached.
// Emits PASS/WARN/FAIL per check, exit 2 on any FAIL, exit 0 otherwise.
//
// Task 8 rewrite (2026-08-06/07) — three structural changes from the prior version:
//
// 1. TWO DYNAMIC PASSES, not one. The gate used to only file://-load (well, serve
//    over a local static server) concepts/world-07-ring.html — it NEVER touched the
//    React code that actually ships (RingAmbient.jsx + client/src/worlds/*.ring.js).
//    It now also drives the real Vite dev server's /ambient?ring=1 route, using the
//    same window.__world contract, which RingAmbient.jsx now exposes for exactly this
//    purpose (see that file's mount effect). Every dynamic check below runs against
//    BOTH passes, parameterized by a `prefix` (''  for the HTML reference build's
//    unprefixed classes, 'ring-' for RingAmbient's ringCss('ring-')-prefixed ones) —
//    see client/src/lib/ringPrimitives.js's ringDom()/ringCss() for why the prefix
//    exists at all. Set RING_VERIFY_SKIP_LIVE=1 to skip the live pass (e.g. no network
//    to resolve a local vite binary) — it still runs by default, because the whole
//    point of this rewrite is to stop the gate from being static-file-only.
//
// 2. THE DEPRECATED ARC CHECK IS GONE. The old "no-flat-neighbours" check (adjacent
//    RANK distance >=2 for >=8/12 steps) is exactly the check ART-DIRECTION-SPEC.md
//    §3 calls out as broken — it passes the defect it was written to catch, because
//    any single-peaked arc naturally interleaves rise/fall by rank almost everywhere,
//    trough included. It was re-confirmed still present (unreplaced) in this file
//    before this rewrite — nothing in this repo had actually swapped it out despite
//    a plan note claiming otherwise. Replaced with the spec's real absolute measure:
//    adjacent stations (checked cyclically, station 12->1 included) must differ by
//    >=6% of the arc's own (hi-lo), plus the three stations nearest the trough must
//    span >=12% of the full range in normalized loudness.
//
// 3. NEW §1/§2 CHECKS + A STATIC PRIMITIVE-PARITY CHECK. Ink-per-station, headline
//    ink, largest-element's share of mid-layer ink, elements-per-station, safe-box
//    luminance cap (measured at forced breathe/twinkle PEAK, not a resting frame —
//    see forceAnimationPeaks() for how "peak" is forced directly via the animation's
//    own custom properties rather than guessed at a wall-clock time), bleed, quadrant
//    rotation, horizontal balance. Plus a static source-text scan (no render needed)
//    that every `prim:` value used in any client/src/worlds/*.ring.js file has a
//    matching `kind === '...'` branch in ringPrimitives.js's makePrim — the exact bug
//    class that once rendered two stations as empty divs.
//
// Usage:
//   node concepts/tools/ring-verify.mjs <path-to-html>
//
// Requires the target file (and, for the live pass, RingAmbient.jsx) to expose
// window.__world = { ENGINE, WORLD, ARC, cylinderOf, authorPeriodOf, station, jumpTo,
// turn, offset }.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readFileSync, readdirSync } from 'node:fs';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { PNG } from 'pngjs';

const readFileAsync = promisify(readFile);

const target = process.argv[2];
if (!target) {
  console.error('Usage: node ring-verify.mjs <path-to-html>');
  process.exit(2);
}
const absPath = path.resolve(target);
const source = readFileSync(absPath, 'utf8');

const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const results = []; // { name, status: PASS|WARN|FAIL, detail, tier: 'regression'|'content' }
function report(name, status, detail, tier = 'regression') { results.push({ name, status, detail, tier }); }

// ═══════════════════════════════════════════════════════════════════════
// CONTENT-BUDGET BASELINE — Task 8 hardening pass split the report into two
// tiers (design-consultant sign-off: "a gate that is permanently red is a
// gate people stop reading"). The seven checks below (ink-per-station,
// headline-ink, largest-element mid-share, elements-per-station, bleed,
// quadrant-rotation, horizontal-balance) are real, known content gaps
// against ART-DIRECTION-SPEC.md §1/§2's absolute targets — closing them is
// real design work, out of scope for the verify-gate task itself. Gating
// the whole script red on them forever just trains people to ignore FAIL.
//
// Instead: each metric below is the actual measured badness (station/
// quadrant count out of band, or points outside the balance band) at the
// moment this two-tier split landed (2026-08-07, ring-scaffold-absorption,
// same commit that fixed the mid-share threshold bug — see the midShare
// section above). The content-budget tier's pass criterion is "not WORSE
// than this," not "meets the spec target" — the spec target and the real
// absolute numbers still print in every check's detail string, they just
// don't gate the tier. Lower is always better for every metric here.
// Update this object (with a comment explaining why) whenever real content
// work closes one of these gaps for good — don't bump it to silence a
// regression.
// ═══════════════════════════════════════════════════════════════════════
const CONTENT_BASELINE = {
  html: { inkPerStation: 10, headlineInk: 11, midShare: 1, elementsPerStation: 4, bleed: 0, quadrant: 2, balance: 34.3 },
  'react-live': { inkPerStation: 11, headlineInk: 11, midShare: 1, elementsPerStation: 4, bleed: 0, quadrant: 2, balance: 34.3 },
};
// current-badness score is compared against CONTENT_BASELINE[label][key];
// worse (higher) than the recorded baseline reports FAIL ("regressed"),
// equal-or-better reports PASS ("no worse than the known backlog").
function contentReport(P, label, key, name, badness, spec, tier = 'content') {
  const base = CONTENT_BASELINE[label][key];
  const status = badness > base ? 'FAIL' : 'PASS';
  const note = badness > base ? `REGRESSED (baseline ${base}, now ${badness})` : `no worse than baseline (baseline ${base}, now ${badness})`;
  report(P(name), status, `${spec} — ${note}`, tier);
}

// ═══════════════════════════════════════════════════════════════════════
// STATIC CHECKS — no browser needed, run once regardless of either pass.
// ═══════════════════════════════════════════════════════════════════════

// ── no stray Math.random() in the HTML reference build's world construction ──
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
  const scriptMatch = source.match(/<script[^>]*>([\s\S]*?)<\/script>/);
  const script = scriptMatch ? scriptMatch[1] : source;
  const sanctioned = ['spawnShoot', 'shootLoop']
    .map(n => functionBody(script, n))
    .filter(Boolean);
  const randIdx = [];
  let idx = script.indexOf('Math.random(');
  while (idx !== -1) { randIdx.push(idx); idx = script.indexOf('Math.random(', idx + 1); }
  const stray = randIdx.filter(i => !sanctioned.some(s => i >= s.start && i < s.end));
  report('[static] no-stray-math-random', stray.length === 0 ? 'PASS' : 'FAIL',
    stray.length === 0
      ? `all ${randIdx.length} Math.random() call(s) confined to spawnShoot/shootLoop`
      : `${stray.length} Math.random() call(s) outside spawnShoot/shootLoop (world construction must use the seeded hash)`);
}

// ── primitive-name parity: every `prim:` value used by any world data file must
//    have a matching `kind === '...'` branch in ringPrimitives.js's makePrim. Pure
//    source-text scan, per the task's own explicit sign-off that a regex pass over
//    the two texts is sufficient (no render needed) — this is the exact bug class
//    that once rendered a station as an empty div because RingAmbient's OWN copy of
//    makePrim (before the client/src/lib/ringPrimitives.js extraction) had no branch
//    for a primitive the world data required. ──
{
  const worldsDir = path.join(REPO_ROOT, 'client/src/worlds');
  const worldFiles = readdirSync(worldsDir).filter(f => f.endsWith('.ring.js'));
  const primUses = []; // { prim, file }
  for (const f of worldFiles) {
    const txt = readFileSync(path.join(worldsDir, f), 'utf8');
    const re = /\bprim\s*:\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(txt))) primUses.push({ prim: m[1], file: f });
  }
  const primitivesPath = path.join(REPO_ROOT, 'client/src/lib/ringPrimitives.js');
  const primitivesSrc = readFileSync(primitivesPath, 'utf8');
  const branchRe = /\bkind\s*===\s*'([^']+)'/g;
  const branches = new Set();
  let bm;
  while ((bm = branchRe.exec(primitivesSrc))) branches.add(bm[1]);
  const distinctPrims = [...new Set(primUses.map(u => u.prim))];
  const missing = distinctPrims.filter(p => !branches.has(p));
  report('[static] primitive-name parity (world data vs makePrim)',
    missing.length === 0 ? 'PASS' : 'FAIL',
    missing.length === 0
      ? `${distinctPrims.length} distinct prim value(s) across ${worldFiles.length} world file(s) [${distinctPrims.join(',')}] all have a matching kind==='...' branch (${branches.size} branches in ringPrimitives.js)`
      : `${missing.length} prim value(s) with NO makePrim branch: ${missing.join(',')} — would render as an empty div`);
}

// ═══════════════════════════════════════════════════════════════════════
// PIXEL HELPERS — shared by every dynamic check that reads real screenshots.
// ═══════════════════════════════════════════════════════════════════════

function lumaAt(data, idx) { return 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2]; }

// Histogram over an axis-aligned pixel rect, clamped to the PNG's own bounds.
// A 256-bucket luma histogram is enough precision for median/mean/percentile and is
// far cheaper than sorting ~2M pixels per screenshot.
function histOf(png, x0, y0, x1, y1) {
  const hist = new Uint32Array(256);
  let total = 0;
  const X0 = Math.max(0, Math.floor(x0)), Y0 = Math.max(0, Math.floor(y0));
  const X1 = Math.min(png.width, Math.ceil(x1)), Y1 = Math.min(png.height, Math.ceil(y1));
  for (let y = Y0; y < Y1; y++) {
    const rowBase = png.width * y;
    for (let x = X0; x < X1; x++) {
      const idx = (rowBase + x) << 2;
      const l = Math.max(0, Math.min(255, Math.round(lumaAt(png.data, idx))));
      hist[l]++;
      total++;
    }
  }
  return { hist, total };
}
function statsFromHist({ hist, total }) {
  if (total === 0) return { median: 0, mean: 0, p995: 0, total: 0 };
  let cum = 0, sum = 0, median = 255, medianSet = false;
  for (let v = 0; v < 256; v++) {
    sum += v * hist[v];
    cum += hist[v];
    if (!medianSet && cum >= total / 2) { median = v; medianSet = true; }
  }
  const mean = sum / total;
  let cum2 = 0, p995 = 255;
  const p995Target = total * 0.995;
  for (let v = 0; v < 256; v++) { cum2 += hist[v]; if (cum2 >= p995Target) { p995 = v; break; } }
  return { median, mean, p995, total };
}
function countAbove({ hist }, threshold) {
  let c = 0;
  for (let v = Math.max(0, threshold + 1); v < 256; v++) c += hist[v];
  return c;
}
const pct = (x) => (x * 100).toFixed(1) + '%';

// ═══════════════════════════════════════════════════════════════════════
// DYNAMIC PASS — everything that needs a real browser. Runs once per target
// (HTML reference, live React route), parameterized by `prefix`.
// ═══════════════════════════════════════════════════════════════════════

async function runDynamicPass({ label, prefix, page, gotoUrl }) {
  const P = (name) => `[${label}] ${name}`;
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  await page.goto(gotoUrl);
  try {
    await page.waitForFunction(() => !!window.__world, null, { timeout: 8000 });
  } catch {
    report(P('window.__world contract'), 'FAIL', `target does not expose window.__world within 8s — cannot verify (${gotoUrl})`);
    return;
  }
  await page.waitForTimeout(500);

  const world = await page.evaluate(() => {
    const w = window.__world;
    return {
      ENGINE: w.ENGINE, WORLD: w.WORLD, ARC: w.ARC,
      layers: w.ENGINE.LAYERS.filter(L => L.id !== 'sky').map(L => ({
        id: L.id, surge: L.surge, m: L.m,
        cylinder: w.cylinderOf(L), authorPeriod: w.authorPeriodOf(L),
      })),
    };
  });

  // 1. layer arithmetic
  for (const L of world.layers) {
    const expectCyl = world.ENGINE.PANES * L.surge;
    const expectAuthor = expectCyl / L.m;
    const ok = L.cylinder === expectCyl && L.authorPeriod === expectAuthor;
    report(P(`layer arithmetic: ${L.id}`), ok ? 'PASS' : 'FAIL',
      `surge=${L.surge} m=${L.m} cylinder=${L.cylinder} (want ${expectCyl}) authorPeriod=${L.authorPeriod} (want ${expectAuthor})`);
  }

  // 2. real parallax
  {
    const surges = world.layers.map(L => L.surge);
    const allDiffer = new Set(surges).size === surges.length;
    const base = Math.min(...surges);
    const ratio = surges.map(s => (s / base).toFixed(2)).join(' : ');
    report(P('parallax is real'), allDiffer ? 'PASS' : 'FAIL',
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
    report(P('integer arithmetic (no float reaches a transform)'), nonInt.length === 0 ? 'PASS' : 'FAIL',
      nonInt.length === 0 ? `all offsets integer across ${driveLog.length} turns`
        : `${nonInt.length} turn(s) produced a non-integer offset, e.g. turn ${nonInt[0].t}: ${JSON.stringify(nonInt[0].offset)}`);
  }
  {
    const wrapPoints = [wrapTurns, wrapTurns * 2, wrapTurns * 3];
    const bad = wrapPoints.filter(t => {
      const e = driveLog.find(e => e.t === t);
      return !e || Object.values(e.offset).some(v => v !== 0);
    });
    report(P('all layers hit phase 0 together at turns 12/24/36'), bad.length === 0 ? 'PASS' : 'FAIL',
      bad.length === 0 ? 'offsets {far:0,mid:0,near:0} at every wrap point'
        : `wrap point(s) ${bad.join(',')} did not land on {0,0,0}`);
  }

  // 5. content coverage — each layer's rendered strip >= cylinder + one frame
  {
    const coverage = await page.evaluate((prefix) => {
      const sized = [...document.querySelectorAll('.' + prefix + 'surge')].filter(el => el.style.width !== '');
      const nonSkyIds = window.__world.ENGINE.LAYERS.filter(L => L.id !== 'sky').map(L => L.id);
      const out = {};
      nonSkyIds.forEach((id, i) => { out[id] = sized[i] ? parseFloat(sized[i].style.width) : null; });
      return out;
    }, prefix);
    const bad = world.layers.filter(L => !Number.isFinite(coverage[L.id]) || coverage[L.id] < L.cylinder + world.ENGINE.W);
    report(P('content coverage >= cylinder + 1 frame'), bad.length === 0 ? 'PASS' : 'FAIL',
      bad.length === 0 ? JSON.stringify(coverage)
        : `short: ${bad.map(L => `${L.id} has ${coverage[L.id]}, needs >=${L.cylinder + world.ENGINE.W}`).join('; ')}`);
  }

  // 6. value arc span, target 2.2-4.0x
  {
    const span = Math.max(...world.ARC) / Math.min(...world.ARC);
    const status = span >= 2.2 && span <= 4.0 ? 'PASS' : 'FAIL';
    report(P('value arc span (target 2.2-4.0x)'), status, `${span.toFixed(2)}x — ARC ${world.ARC.map(v => v.toFixed(1)).join(',')}`);
  }

  // 7. cyclic adjacent-gap (REPLACES the deprecated rank-based no-flat-neighbours
  //    check — see file header). Adjacent stations, checked cyclically, must differ
  //    by >=6% of the arc's own (hi-lo). Plus the trough-3 spread check, which is the
  //    number that actually verifies "not visually flat" (the rank check never did).
  {
    const ARC = world.ARC;
    const n = ARC.length;
    const { lo, hi } = world.ENGINE.ARC;
    const gapFloor = 0.06 * (hi - lo);
    const gaps = [];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      gaps.push({ i, j, delta: Math.abs(ARC[i] - ARC[j]) });
    }
    const failing = gaps.filter(g => g.delta < gapFloor);
    report(P(`cyclic adjacent-gap (each pair >=6% of hi-lo = ${gapFloor.toFixed(2)})`),
      failing.length === 0 ? 'PASS' : 'FAIL',
      failing.length === 0 ? `all ${n} cyclic adjacent pairs clear the gap floor`
        : `${failing.length}/${n} adjacent pair(s) below floor: ${failing.map(g => `${g.i}->${g.j}=${g.delta.toFixed(2)}`).join(', ')}`);

    const troughIdx = ARC.indexOf(Math.min(...ARC));
    const near3 = [(troughIdx - 1 + n) % n, troughIdx, (troughIdx + 1) % n];
    const normed = near3.map(i => (ARC[i] - lo) / (hi - lo));
    const troughSpan = Math.max(...normed) - Math.min(...normed);
    report(P('trough-3 spread (>=12% of normalized range)'), troughSpan >= 0.12 ? 'PASS' : 'FAIL',
      `stations [${near3.join(',')}] normalized [${normed.map(v => v.toFixed(3)).join(',')}] span ${(troughSpan * 100).toFixed(1)}%`);
  }

  // 8. WORLD.type is a required, valid field
  {
    const validTypes = ['space', 'terrestrial', 'aquatic', 'aerial', 'interior'];
    const ok = validTypes.includes(world.WORLD.type);
    report(P('WORLD.type is required and valid'), ok ? 'PASS' : 'FAIL',
      ok ? `type: ${world.WORLD.type}` : `type "${world.WORLD.type}" not in ${validTypes.join('|')}`);
  }

  // 9. space worlds ban vertical gradients
  if (world.WORLD.type === 'space') {
    const skyBg = await page.evaluate((prefix) => getComputedStyle(document.querySelector('.' + prefix + 'void')).backgroundImage, prefix);
    const ok = /radial-gradient/.test(skyBg) && !/linear-gradient/.test(skyBg);
    report(P('space world sky is radial-only'), ok ? 'PASS' : 'FAIL', skyBg.slice(0, 80) + (skyBg.length > 80 ? '…' : ''));
  }

  // ── per-station content pass: star count, ink, headline ink, mid-layer ink share,
  //    element count, safe-box luminance peak, bleed, quadrant, horizontal balance.
  //    Reduced motion is emulated for this whole section so every non-forced
  //    screenshot is a stable single-frame read (the arithmetic/drive checks above
  //    ran WITHOUT it, on purpose, so the real animated turn transition stays
  //    exercised there). ──
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const design = page.locator('#design');
  const hasScrim = await page.evaluate(() => !!document.getElementById('qScrim'));
  const stationMetrics = [];

  for (let s = 0; s < world.ENGINE.PANES; s++) {
    await page.evaluate((st) => window.__world.jumpTo(st), s);

    const dom = await page.evaluate((prefix) => {
      const designEl = document.getElementById('design');
      const dRect = designEl.getBoundingClientRect();
      const scale = dRect.width / 1920 || 1;
      const toDesign = (r) => ({
        x0: (r.left - dRect.left) / scale, y0: (r.top - dRect.top) / scale,
        x1: (r.right - dRect.left) / scale, y1: (r.bottom - dRect.top) / scale,
      });
      const onScreen = (d) => d.x1 > -20 && d.x0 < 1940 && d.y1 > -20 && d.y0 < 1100;

      // "elements per station" and "the largest element" are both scoped to the
      // MID (composition) layer specifically — the far layer's own wash blobs/
      // anchor/drift also carry the shared `.pf` class, and would contaminate an
      // unscoped count. #design > .lyr is [sky, far, mid, near] in DOM order.
      // Deliberately NOT counted: `.pair-bridge` (spec §7.5's "connecting
      // bridge"). §1 says "every element belongs to exactly one tier," and
      // the four tiers (Headline/Feature/Detail/Atmosphere, spec §1) size
      // and gate the nine primitive NOUNS from §6's vocabulary
      // (blob/dots/spikes/lens/streak/ribbon/ring/binary/sprite) — the
      // bridge is not one of those nouns. §7.5 lists it as one of several
      // interchangeable ways to SIGNAL a declared pair ("a common halo, an
      // aligned axis, a colour echo, a connecting bridge") — the other three
      // options (reusing an existing element's halo, an alignment, a hue
      // choice) obviously aren't separately-counted elements either, so the
      // bridge shouldn't be singled out just because it happens to be its
      // own DOM node. It's relational scaffolding between two already-
      // counted elements, not a third noun. Verified against §6's own
      // primitive list before writing this comment (2026-08-07 review).
      const lyrs = [...document.querySelectorAll('#design > .' + prefix + 'lyr')];
      const midLyr = lyrs[2];
      const pfEls = midLyr ? [...midLyr.querySelectorAll('.' + prefix + 'pf')].map(el => toDesign(el.getBoundingClientRect())).filter(onScreen) : [];
      const occEls = midLyr ? [...midLyr.querySelectorAll('.' + prefix + 'occ')].map(el => toDesign(el.getBoundingClientRect())).filter(onScreen) : [];
      const headlineD = midLyr
        ? ([...midLyr.querySelectorAll('.' + prefix + 'pf-breathe')].map(el => toDesign(el.getBoundingClientRect())).find(onScreen) || null)
        : null;

      let starCount = 0;
      document.querySelectorAll('.' + prefix + 'star').forEach(el => { if (onScreen(toDesign(el.getBoundingClientRect()))) starCount++; });

      return {
        scale,
        elementCount: pfEls.length + occEls.length,
        headline: headlineD,
        starCount,
      };
    }, prefix);
    const scale = dom.scale;

    // screenshot #1: natural composited frame (all layers, resting/frozen state)
    const pngNatural = PNG.sync.read(await design.screenshot());

    // screenshot #2: mid-layer only (sky/far/near AND #qLayer hidden) — for the
    // "largest element supplies >=55% of MID-layer ink" rule, which is explicitly
    // scoped to the composition layer (far-layer washes and the star field both
    // add ink at every station and would make the rule unmeasurable otherwise —
    // spec §1). #qLayer must be hidden here too, for the same reason it's hidden
    // for the forced-peak safe-box shot below: the HTML reference build renders
    // real (bright, near-white/orange) demo question text in #qLayer, sitting
    // outside any `.lyr` layer entirely, so it survived the sky/far/near hiding
    // untouched and quietly became the largest single source of "mid-layer ink"
    // in this screenshot — RingAmbient has no #qLayer at all, so this bug only
    // ever hit the HTML pass, and only ever polluted the DENOMINATOR (total
    // mid-layer ink), never the headline's own numerator (the text sits well
    // outside every station's headline box). That's what produced station 1's
    // reported 8.6% (HTML) vs 43.8% (React) mid-share gap: found by rendering
    // both mid-only screenshots and visually comparing them (2026-08-07) — the
    // HTML one had the demo question plainly visible; confirmed the fix below
    // collapses the gap (see this task's session notes for the before/after).
    await page.evaluate((prefix) => {
      [...document.querySelectorAll('#design > .' + prefix + 'lyr')].forEach((l, i) => {
        l.dataset.ringVerifySavedDisplay = l.style.display;
        l.style.display = i === 2 ? '' : 'none';
      });
      const qLayer = document.getElementById('qLayer');
      if (qLayer) { qLayer.dataset.ringVerifySavedDisplay = qLayer.style.display; qLayer.style.display = 'none'; }
    }, prefix);
    const pngMid = PNG.sync.read(await design.screenshot());
    await page.evaluate((prefix) => {
      [...document.querySelectorAll('#design > .' + prefix + 'lyr')].forEach((l) => {
        l.style.display = l.dataset.ringVerifySavedDisplay || '';
        delete l.dataset.ringVerifySavedDisplay;
      });
      const qLayer = document.getElementById('qLayer');
      if (qLayer) { qLayer.style.display = qLayer.dataset.ringVerifySavedDisplay || ''; delete qLayer.dataset.ringVerifySavedDisplay; }
    }, prefix);

    // screenshot #3: forced breathe/twinkle PEAK. Per-element `--pd`/`--td`
    // animation-delay is randomized, so sampling at any fixed wall-clock time can
    // land at an arbitrary phase for a given element — this instead collapses each
    // animated element's own keyframe range directly (the low custom property is
    // temporarily set equal to the high one), so opacity is at that element's true
    // peak regardless of where its paused animation happened to freeze. This is
    // the "worst frame" the safe-box cap actually needs to be measured against.
    // The safe-box cap protects the BACKGROUND the question text sits on top of
    // (spec §9 governs the text itself separately) — the HTML reference build
    // renders real (bright, near-white) demo question text inside #qLayer, which
    // would otherwise swamp this measurement with the text's own luminance rather
    // than the background it needs to contrast against. Hidden for this one
    // screenshot only. RingAmbient has no such element (its question rendering is
    // explicitly out of scope for that component — see its file header), so this
    // is a no-op there.
    await page.evaluate(() => {
      const qLayer = document.getElementById('qLayer');
      if (qLayer) { qLayer.dataset.ringVerifySavedDisplay = qLayer.style.display; qLayer.style.display = 'none'; }
    });

    // screenshot #3a: safe-box NATURAL baseline — same qLayer masking as the
    // forced-peak shot below, but BEFORE any --pa/--ob forcing. This exists
    // solely so the peak-forcing has a self-check (see safeStatsNatural
    // below): the safe box's natural luma (mean ~12-19) sits so far under
    // the 34 cap that if forcing silently no-op'd (selector typo, wrong
    // custom-property name, browser quirk swallowing the mutation), the cap
    // check would still read PASS and nothing would notice. Comparing this
    // reading against the forced-peak one below is what would catch that.
    const pngSafeNatural = PNG.sync.read(await design.screenshot());

    await page.evaluate((prefix) => {
      document.querySelectorAll('.' + prefix + 'star').forEach(el => {
        const cs = getComputedStyle(el);
        el.style.setProperty('--ring-verify-ob-save', cs.getPropertyValue('--ob'));
        el.style.setProperty('--ob', cs.getPropertyValue('--op').trim());
      });
      document.querySelectorAll('.' + prefix + 'pf-breathe').forEach(el => {
        const cs = getComputedStyle(el);
        el.style.setProperty('--ring-verify-pa-save', cs.getPropertyValue('--pa'));
        el.style.setProperty('--pa', cs.getPropertyValue('--pa2').trim());
      });
    }, prefix);
    const pngPeak = PNG.sync.read(await design.screenshot());
    await page.evaluate((prefix) => {
      document.querySelectorAll('.' + prefix + 'star').forEach(el => {
        const saved = getComputedStyle(el).getPropertyValue('--ring-verify-ob-save');
        if (saved) el.style.setProperty('--ob', saved.trim());
      });
      document.querySelectorAll('.' + prefix + 'pf-breathe').forEach(el => {
        const saved = getComputedStyle(el).getPropertyValue('--ring-verify-pa-save');
        if (saved) el.style.setProperty('--pa', saved.trim());
      });
    }, prefix);
    await page.evaluate(() => {
      const qLayer = document.getElementById('qLayer');
      if (qLayer) { qLayer.style.display = qLayer.dataset.ringVerifySavedDisplay || ''; delete qLayer.dataset.ringVerifySavedDisplay; }
    });

    // ── derive every pixel-based metric for this station ──
    const frameHist = histOf(pngNatural, 0, 0, pngNatural.width, pngNatural.height);
    const frameStatsNatural = statsFromHist(frameHist);
    const threshold = frameStatsNatural.median + 20; // spec §1: "paneMedianLuma + 20"
    const inkFrac = countAbove(frameHist, threshold) / frameHist.total;

    let headlineInkFrac = null, midShare = null, bleedFrac = null, centroid = null, quadrant = null;
    if (dom.headline) {
      const h = dom.headline;
      const sx0 = Math.max(0, h.x0 * scale), sy0 = Math.max(0, h.y0 * scale);
      const sx1 = Math.min(pngNatural.width, h.x1 * scale), sy1 = Math.min(pngNatural.height, h.y1 * scale);

      const headHistNatural = histOf(pngNatural, sx0, sy0, sx1, sy1);
      headlineInkFrac = countAbove(headHistNatural, threshold) / frameHist.total; // fraction of the WHOLE frame

      // mid-share threshold must come from the MID-ONLY frame's own median,
      // not the natural (sky+far+mid+near composited) frame's. pngMid is a
      // materially different background (sky/far/near hidden — mostly the
      // page's own dark backdrop instead of nebula wash + star field), so
      // naturalMedian+20 is the wrong cap for it: whichever build's far/sky
      // layers happen to be brighter pushes naturalMedian (and therefore the
      // threshold) up or down, which changes how many mid-layer pixels clear
      // it — a pure measurement artifact, not a real content difference.
      //
      // This alone did NOT fully explain the originally-reported 8.6%
      // (HTML) vs 43.8% (React) station-1 gap, though — most of that came
      // from a second, bigger bug in the pngMid capture itself (screenshot
      // #2 above): the HTML build's #qLayer demo question text sits outside
      // every `.lyr` layer, so it survived the old sky/far/near-only hiding
      // and got counted as "mid-layer ink" — the largest single contributor
      // to the HTML pass's midInkCount denominator, present in NO React
      // measurement since RingAmbient has no #qLayer at all. Fixed by also
      // hiding #qLayer for this screenshot (see above). With both fixes,
      // station 1 lands at 40.7% (HTML) vs 45.9% (React) — a normal ~5pp
      // build-to-build gap, not the original 5x. All 12 stations moved
      // into similarly close alignment (e.g. st0 96.5% vs 97.3%, st6 67.9%
      // vs 69.2%) once #qLayer stopped polluting the HTML pass's
      // denominator. Confirmed by rendering both mid-only screenshots to
      // PNG and comparing them directly (2026-08-07).
      const midHist = histOf(pngMid, 0, 0, pngMid.width, pngMid.height);
      const midThreshold = statsFromHist(midHist).median + 20;
      const midInkCount = countAbove(midHist, midThreshold);
      const hx1m = Math.min(pngMid.width, h.x1 * scale), hy1m = Math.min(pngMid.height, h.y1 * scale);
      const headHistMid = histOf(pngMid, sx0, sy0, hx1m, hy1m);
      const headCountMid = countAbove(headHistMid, midThreshold);
      midShare = midInkCount > 0 ? headCountMid / midInkCount : null;

      const ox0 = Math.max(h.x0, 0), oy0 = Math.max(h.y0, 0), ox1 = Math.min(h.x1, 1920), oy1 = Math.min(h.y1, 1080);
      const overlapArea = Math.max(0, ox1 - ox0) * Math.max(0, oy1 - oy0);
      const fullArea = Math.max(0, h.x1 - h.x0) * Math.max(0, h.y1 - h.y0);
      bleedFrac = fullArea > 0 ? 1 - overlapArea / fullArea : 0;

      const cx = (h.x0 + h.x1) / 2, cy = (h.y0 + h.y1) / 2;
      centroid = { x: cx, y: cy };
      quadrant = (cx < 960 ? 'L' : 'R') + (cy < 540 ? 'T' : 'B');
    }

    // safe box: design x 384-1536, y 302-778 — measured on the FORCED-PEAK frame,
    // plus the pre-forcing NATURAL reading at the same crop for the self-check below.
    const safeStats = statsFromHist(histOf(pngPeak, 384 * scale, 302 * scale, 1536 * scale, 778 * scale));
    const safeStatsNatural = statsFromHist(histOf(pngSafeNatural, 384 * scale, 302 * scale, 1536 * scale, 778 * scale));

    stationMetrics.push({
      s, starCount: dom.starCount, elementCount: dom.elementCount,
      inkFrac, headlineInkFrac, midShare, bleedFrac, centroid, quadrant, safeStats, safeStatsNatural,
      hasHeadline: !!dom.headline,
    });
  }

  // 10. visible stars per frame across all 12 stations, target 150-260
  {
    const counts = stationMetrics.map(m => m.starCount);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const status = mean >= 150 && mean <= 260 ? 'PASS' : mean >= 120 && mean <= 300 ? 'WARN' : 'FAIL';
    report(P('visible stars per frame (target 150-260)'), status, `mean ${mean.toFixed(0)} — per-station ${counts.join(',')}`);
  }

  // 11. ink per station: 6-18% of the frame (spec §1) — CONTENT-BUDGET tier:
  //     gated against the recorded baseline (CONTENT_BASELINE), not the
  //     absolute spec band — see that object's comment for why.
  {
    const bad = stationMetrics.filter(m => m.inkFrac < 0.06 || m.inkFrac > 0.18);
    const spec = `${stationMetrics.map(m => `st${m.s}=${pct(m.inkFrac)}`).join(' ')}` +
      (bad.length ? ` — OUT OF SPEC BAND (6-18%): ${bad.map(m => `st${m.s}`).join(',')}` : ' — all in spec band');
    contentReport(P, label, 'inkPerStation', 'ink per station (6-18% of frame)', bad.length, spec);
  }

  // 12. headline ink, when present: 4-9% of the frame (spec §1) — content-budget.
  {
    const withHeadline = stationMetrics.filter(m => m.hasHeadline);
    const missing = stationMetrics.filter(m => !m.hasHeadline);
    const bad = withHeadline.filter(m => m.headlineInkFrac < 0.04 || m.headlineInkFrac > 0.09);
    const badness = bad.length + missing.length;
    const spec = `${withHeadline.map(m => `st${m.s}=${pct(m.headlineInkFrac)}`).join(' ')}` +
      (bad.length ? ` — OUT OF SPEC BAND (4-9%): ${bad.map(m => `st${m.s}`).join(',')}` : '') +
      (missing.length ? ` — NO HEADLINE FOUND: ${missing.map(m => `st${m.s}`).join(',')}` : '');
    contentReport(P, label, 'headlineInk', 'headline ink, when present (4-9% of frame)', badness, spec);
  }

  // 13. largest element supplies >=55% of the MID layer's own ink (spec §1) —
  //     content-budget. Threshold bug (natural-frame median applied to the
  //     mid-only screenshot) fixed above — see the midThreshold comment.
  {
    const withHeadline = stationMetrics.filter(m => m.hasHeadline && m.midShare != null);
    const missing = stationMetrics.length - withHeadline.length;
    const bad = withHeadline.filter(m => m.midShare < 0.55);
    const badness = bad.length + missing;
    const spec = `${withHeadline.map(m => `st${m.s}=${pct(m.midShare)}`).join(' ')}` +
      (bad.length ? ` — BELOW 55%: ${bad.map(m => `st${m.s}`).join(',')}` : '');
    contentReport(P, label, 'midShare', 'largest element supplies >=55% of mid-layer ink', badness, spec);
  }

  // 14. elements per station, excluding atmosphere: 2-5 (spec §1) — content-budget.
  {
    const bad = stationMetrics.filter(m => m.elementCount < 2 || m.elementCount > 5);
    const spec = `${stationMetrics.map(m => `st${m.s}=${m.elementCount}`).join(' ')}` +
      (bad.length ? ` — OUT OF SPEC BAND (2-5): ${bad.map(m => `st${m.s}(${m.elementCount})`).join(',')}` : '');
    contentReport(P, label, 'elementsPerStation', 'elements per station, excl. atmosphere (2-5)', bad.length, spec);
  }

  // 15a. peak-forcing self-check. The safe box's natural (unforced) luma sits
  //      so far under the 34 cap (mean ~12-19) that if the --pa/--ob forcing
  //      above silently no-op'd — selector typo, wrong custom-property name,
  //      a browser quirk swallowing the mutation — the cap check below would
  //      still read PASS and nothing would notice it isn't actually testing
  //      peak state anymore. This asserts the forced reading is measurably
  //      brighter than the natural one at the identical crop/qLayer-masking,
  //      so a silently-broken forcing mechanism fails loud instead of quiet.
  //
  //      EPS is deliberately tiny (float-tie guard only), NOT a magnitude
  //      bar: the safe box is mostly static, non-animated background (sky
  //      wash + companion/detail primitives with no breathe animation), so
  //      only a handful of stars plus, at some stations, a sliver of the
  //      one animated headline element actually respond to forcing — real,
  //      confirmed-working forcing only moves the box's aggregate MEAN by
  //      ~0.1-0.7 luma (measured directly: an isolated .pf-breathe element's
  //      own opacity jumps from a resting 0.78 to a forced 0.88, exactly its
  //      --pa2 peak, every time — see 2026-08-07 review notes). An EPS of 1+
  //      would false-FAIL on that genuine small effect and defeat the point.
  {
    const EPS = 0.01;
    const bad = stationMetrics.filter(m => m.safeStats.mean <= m.safeStatsNatural.mean + EPS);
    const detail = `${stationMetrics.map(m => `st${m.s}=natural(mean${m.safeStatsNatural.mean.toFixed(1)}/p99.5-${m.safeStatsNatural.p995})->peak(mean${m.safeStats.mean.toFixed(1)}/p99.5-${m.safeStats.p995})`).join(' ')}`;
    report(P('safe-box peak-forcing self-check (peak must be measurably brighter than natural)'),
      bad.length === 0 ? 'PASS' : 'FAIL',
      bad.length === 0 ? `peak-forcing measurably raises safe-box luma at every station — ${detail}`
        : `peak-forcing had no effect — safe-box measurement is not actually testing peak state. NO EFFECT: ${bad.map(m => `st${m.s}`).join(',')} — ${detail}`);
  }

  // 15. safe-box luminance cap, mean <=34 / p99.5 <=72, measured at forced peak (spec §2)
  {
    const bad = stationMetrics.filter(m => m.safeStats.mean > 34 || m.safeStats.p995 > 72);
    const detail = `${stationMetrics.map(m => `st${m.s}=mean${m.safeStats.mean.toFixed(1)}/p99.5-${m.safeStats.p995}`).join(' ')}` +
      (bad.length ? ` — OVER CAP: ${bad.map(m => `st${m.s}`).join(',')}` : '');
    if (hasScrim) {
      report(P('safe-box luminance cap at breathe/twinkle peak (mean<=34, p99.5<=72)'), bad.length === 0 ? 'PASS' : 'FAIL', detail);
    } else {
      // RingAmbient.jsx deliberately does not port qScrim/qLayer/qText — Trivia OS's
      // real question overlay is a separate component composited elsewhere in
      // production. Measuring the bare frame here is a genuinely different (and
      // easier) test than the spec's "under the scrim" — WARN, not PASS/FAIL, so
      // this doesn't silently read as spec compliance it hasn't earned.
      report(P('safe-box luminance cap at breathe/twinkle peak (NO SCRIM IN THIS ROUTE — bare-frame approximation)'), 'WARN',
        `no #qScrim in this route; RingAmbient's question overlay lives in a different component. ${detail}`);
    }
  }

  // 16. bleed: 3-5 of 12 stations' largest element cropped 10-35% by a frame edge,
  //     post-rotation (spec §2). Any station cropped >35% is a real violation
  //     regardless of the 3-5 count. Content-budget.
  {
    const withHeadline = stationMetrics.filter(m => m.hasHeadline);
    const bleeding = withHeadline.filter(m => m.bleedFrac >= 0.10 && m.bleedFrac <= 0.35);
    const overCropped = withHeadline.filter(m => m.bleedFrac > 0.35);
    const bandMiss = bleeding.length < 3 ? 3 - bleeding.length : bleeding.length > 5 ? bleeding.length - 5 : 0;
    const badness = overCropped.length + bandMiss;
    const spec = `${withHeadline.map(m => `st${m.s}=${pct(m.bleedFrac)}`).join(' ')} — ${bleeding.length} station(s) in 10-35% band (target 3-5)` +
      (overCropped.length ? `; ACCIDENTAL CLIP (>35%): ${overCropped.map(m => `st${m.s}`).join(',')}` : '');
    contentReport(P, label, 'bleed', 'bleed: 3-5/12 stations cropped 10-35% by frame edge', badness, spec);
  }

  // 17 & 18. quadrant rotation (2-4 per quadrant over 12) + horizontal balance
  //          (mean centroid x within 960+/-96) — both derived from the same
  //          per-station headline centroid, spec §2. Content-budget.
  {
    const withHeadline = stationMetrics.filter(m => m.hasHeadline && m.centroid);
    const missing = stationMetrics.length - withHeadline.length;
    const counts = { LT: 0, RT: 0, LB: 0, RB: 0 };
    withHeadline.forEach(m => { counts[m.quadrant] = (counts[m.quadrant] || 0) + 1; });
    const quadBad = Object.entries(counts).filter(([, c]) => c < 2 || c > 4);
    const quadBadness = quadBad.length + missing;
    const quadSpec = `LT=${counts.LT} RT=${counts.RT} LB=${counts.LB} RB=${counts.RB} (target 2-4 each)` +
      (quadBad.length ? ` — OUT OF BAND: ${quadBad.map(([q, c]) => `${q}=${c}`).join(',')}` : '');
    contentReport(P, label, 'quadrant', 'quadrant rotation (largest element, 2-4x per quadrant/12)', quadBadness, quadSpec);

    const meanX = withHeadline.reduce((a, m) => a + m.centroid.x, 0) / withHeadline.length;
    const balBadness = meanX < 864 ? 864 - meanX : meanX > 1056 ? meanX - 1056 : 0;
    const balSpec = `mean centroid x = ${meanX.toFixed(1)} (target 864-1056) — per-station ${withHeadline.map(m => `st${m.s}=${m.centroid.x.toFixed(0)}`).join(' ')}`;
    contentReport(P, label, 'balance', 'horizontal balance (mean centroid x within 960+/-96)', balBadness, balSpec);
  }

  // 19. console clean across the entire pass (arithmetic drive + content measurement)
  report(P('console clean'), consoleErrors.length === 0 ? 'PASS' : 'FAIL',
    consoleErrors.length === 0 ? 'no console errors or page errors across boot + 36 turns + 12-station measurement pass'
      : consoleErrors.slice(0, 5).join(' | '));
}

// ═══════════════════════════════════════════════════════════════════════
// HTML-file static server (unchanged mechanism — CORS on file:// ES module
// imports otherwise blocks concepts/world-07-ring.html's <script type="module">).
// ═══════════════════════════════════════════════════════════════════════

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
function startStaticServer(rootDir) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const filePath = path.join(rootDir, path.normalize(urlPath));
        if (!filePath.startsWith(rootDir)) { res.writeHead(403); res.end(); return; }
        const data = await readFileAsync(filePath);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      } catch {
        res.writeHead(404); res.end('Not found');
      }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// ═══════════════════════════════════════════════════════════════════════
// LIVE VITE DEV SERVER for the react-live pass — reuses one already running on
// vite.config.js's configured port 5173 if present, otherwise spawns one and
// tears it down when this script exits.
// ═══════════════════════════════════════════════════════════════════════

const VITE_PORT = 5173;
async function isUp(url) { try { const r = await fetch(url); return r.ok; } catch { return false; } }
async function ensureViteServer() {
  const base = `http://localhost:${VITE_PORT}`;
  if (await isUp(base + '/')) return { proc: null, url: base + '/ambient?ring=1' };
  const proc = spawn('npx', ['vite', '--port', String(VITE_PORT), '--strictPort'], { cwd: REPO_ROOT, stdio: 'ignore' });
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    if (await isUp(base + '/')) return { proc, url: base + '/ambient?ring=1' };
    await new Promise(r => setTimeout(r, 400));
  }
  proc.kill();
  throw new Error(`vite dev server on port ${VITE_PORT} did not become ready within 20s`);
}

// ═══════════════════════════════════════════════════════════════════════
// RUN both passes.
// ═══════════════════════════════════════════════════════════════════════

const browser = await chromium.launch();

// pass 1: the HTML reference build, served over a local static server.
{
  const server = await startStaticServer(REPO_ROOT);
  const port = server.address().port;
  const relPath = path.relative(REPO_ROOT, absPath).split(path.sep).join('/');
  const targetUrl = `http://127.0.0.1:${port}/${relPath}`;
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  try {
    await runDynamicPass({ label: 'html', prefix: '', page, gotoUrl: targetUrl });
  } catch (err) {
    report('[html] pass', 'FAIL', `threw: ${err.message}`);
  } finally {
    await page.close();
    await new Promise((resolve) => server.close(resolve));
  }
}

// pass 2: the live React route — the code that actually ships. Skippable via
// RING_VERIFY_SKIP_LIVE=1 for an environment with no vite binary reachable.
if (process.env.RING_VERIFY_SKIP_LIVE === '1') {
  report('[react-live] pass', 'WARN', 'skipped — RING_VERIFY_SKIP_LIVE=1');
} else {
  let vite = null;
  try {
    vite = await ensureViteServer();
    const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
    try {
      await runDynamicPass({ label: 'react-live', prefix: 'ring-', page, gotoUrl: vite.url });
    } finally {
      await page.close();
    }
  } catch (err) {
    report('[react-live] pass', 'FAIL', `threw: ${err.message}`);
  } finally {
    if (vite && vite.proc) vite.proc.kill();
  }
}

await browser.close();
finish();

function printTier(label, rows, width) {
  console.log(`\n── ${label} ──`);
  for (const r of rows) {
    console.log(`${r.status.padEnd(4)} ${r.name.padEnd(width)}  ${r.detail}`);
  }
}

function finish() {
  const width = Math.max(...results.map(r => r.name.length));
  const regression = results.filter(r => r.tier === 'regression');
  const content = results.filter(r => r.tier === 'content');

  printTier('REGRESSION TIER — must always be green (structural/engine correctness)', regression, width);
  const regFails = regression.filter(r => r.status === 'FAIL');
  const regWarns = regression.filter(r => r.status === 'WARN');
  console.log(regFails.length === 0
    ? `\nregression tier: all ${regression.length} checks green (${regWarns.length} WARN)`
    : `\nregression tier: ${regFails.length}/${regression.length} FAIL — ${regFails.map(r => r.name).join(', ')}`);

  printTier('CONTENT-BUDGET TIER — known gaps vs ART-DIRECTION-SPEC.md §1/§2, gated against a recorded baseline, not the absolute target', content, width);
  const contentFails = content.filter(r => r.status === 'FAIL');
  console.log(contentFails.length === 0
    ? `\ncontent-budget tier: ${content.length} known gap(s), none regressed from baseline`
    : `\ncontent-budget tier: ${contentFails.length} REGRESSED from baseline — ${contentFails.map(r => r.name).join(', ')}`);

  const fails = results.filter(r => r.status === 'FAIL');
  const warns = results.filter(r => r.status === 'WARN');
  console.log(`\n${results.length} checks — ${results.length - fails.length - warns.length} PASS, ${warns.length} WARN, ${fails.length} FAIL`);
  process.exit(fails.length > 0 ? 2 : 0);
}
