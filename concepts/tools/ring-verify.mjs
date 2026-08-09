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
// ─────────────────────────────────────────────────────────────────────────
// B1 REBASELINE (2026-08-08, gate audit). The prior version of this file
// gated its seven §1/§2 content checks against CONTENT_BASELINE — an object
// whose values were the build's OWN measured badness at the moment the
// two-tier split landed. That is a gate calibrated to its subject: with
// `headlineInk: 11` recorded, a build where 11 of 12 stations sit outside the
// spec's 4–9% headline-ink band printed PASS, and headline ink is the exact
// number ART-DIRECTION-SPEC.md §1 names as the cause of "it feels small."
// CONTENT_BASELINE is deleted. Every threshold now comes from SPEC below,
// each entry carrying a `src` citation into the spec text. A target that is
// genuinely unreachable goes in KNOWN_DEVIATIONS — dated, reasoned, self-
// expiring, and it downgrades FAIL to WARN, never to PASS.
// ─────────────────────────────────────────────────────────────────────────
//
// Usage:
//   node concepts/tools/ring-verify.mjs <path-to-html>
//
// Requires the target file (and, for the live pass, RingAmbient.jsx) to expose
// window.__world = { ENGINE, WORLD, ARC, cylinderOf, authorPeriodOf, station, jumpTo,
// turn, offset }.

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, readFileSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
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

// This gate has never once written a screenshot to disk — every PNG it reads
// was a Playwright buffer that died with the process. Five rounds of
// "rendered and looked" claims sourced from this file were therefore
// unverifiable after the fact (2026-08-09 review). Same convention
// visual-audit.mjs/spot-check.mjs already use: a fresh, gitignored,
// never-deleted directory per run (concepts/.audit-shots/ — deleting inside
// concepts/ is blocked for an unattended run, so "write to a new dir" is the
// actual fix, not a workaround). Printed once at the end of this run.
const RUN_DIR = path.resolve(REPO_ROOT, 'concepts', '.audit-shots', `ring-verify-${Date.now()}`);
mkdirSync(RUN_DIR, { recursive: true });
function saveShot(buf, name) { writeFileSync(path.join(RUN_DIR, `${name}.png`), buf); }

const results = []; // { name, status: PASS|WARN|FAIL, detail, tier: 'regression'|'content' }
function report(name, status, detail, tier = 'regression') { results.push({ name, status, detail, tier }); }

// ═══════════════════════════════════════════════════════════════════════
// SPEC THRESHOLDS — the only place a number lives.
//
// RULE: every value in this object is transcribed from
// concepts/ART-DIRECTION-SPEC.md and carries a `src` citation naming the
// file, line and section it came from. NOTHING in here may be derived from,
// copied out of, or "recorded from" a measurement of the build under test.
// A gate whose pass criterion is its subject's own current reading cannot
// detect that its subject is broken — that is the defect this rebaseline
// exists to remove. See NO-SELF-BASELINE at the foot of this file for the
// mechanical form of the rule.
// ═══════════════════════════════════════════════════════════════════════
// inkPerStation.lo (2026-08-08 amendment to ART-DIRECTION-SPEC.md:55): was a
// flat 6% floor applied to all twelve stations, on a ring whose entire value
// arc exists so quiet stations legitimately carry less. `lo` is now the
// CEILING of a per-station floor — floor(i) = lo * (arc[i]/ENGINE.ARC.hi) —
// reached only near the arc's loud end; see check 11 below for the formula
// applied. `hi` (18%) is unchanged and stays flat: no station has ever
// measured over it, and nothing argues a quiet station should be allowed
// MORE ink than a loud one.
const SPEC = Object.freeze({
  inkPerStation:      { lo: 0.06, hi: 0.18,                 src: 'ART-DIRECTION-SPEC.md:55 §1' },
  midShare:           { min: 0.55,                          src: 'ART-DIRECTION-SPEC.md:56 §1' },
  headlineInk:        { lo: 0.04, hi: 0.09,                 src: 'ART-DIRECTION-SPEC.md:59 §1' },
  elementsPerStation: { lo: 2, hi: 5,                       src: 'ART-DIRECTION-SPEC.md:62 §1' },
  // p995Max retargeted 72 -> 68 (2026-08-09): st0 measured EXACTLY 72/72 at
  // the old cap — a threshold shipped with zero headroom is not a
  // threshold, it's a coin flip against the next content change. warnMargin
  // makes the gate WARN (not silently PASS) inside 4 points of whatever the
  // current cap is, so the next zero-headroom ship gets flagged before it
  // ships, not measured after.
  safeBox:            { meanMax: 34, p995Max: 68, warnMargin: 4, src: 'ART-DIRECTION-SPEC.md:76 §2' },
  quadrant:           { lo: 2, hi: 4,                       src: 'ART-DIRECTION-SPEC.md:85 §2' },
  balance:            { centre: 960, tol: 96,               src: 'ART-DIRECTION-SPEC.md:87 §2' },
  vertSpread:         { areaFrac: 0.15, minStations: 6,     src: 'ART-DIRECTION-SPEC.md:94 §2' },
  bleed:              { cropLo: 0.10, cropHi: 0.35, lo: 3, hi: 5, src: 'ART-DIRECTION-SPEC.md:98 §2' },
  arcBand:            { quietLo: 8, quietHi: 13, loudLo: 26, loudHi: 34, src: 'ART-DIRECTION-SPEC.md:130 §3' },
  arcSpan:            { lo: 2.2, hi: 4.0,                   src: 'ART-DIRECTION-SPEC.md:131 §3' },
  // B2-luminance.md sec 4.1: per-station tolerance alone can't catch a
  // flattened arc — if every station sits within +/-30% of a 3.1x-span
  // target, the worst PERMISSIBLE rendered span is only 1.67x (barely above
  // the 1.56x the defect produced). These two are the aggregate checks that
  // actually gate contrast and ordering, not just per-station level.
  arcSpanRealised:    { minFrac: 0.80,                      src: 'B2-luminance.md §4.1 (ART-DIRECTION-SPEC.md:131 §3)' },
  arcRankCorrelation: { min: 0.90,                          src: 'B2-luminance.md §4.1 (ART-DIRECTION-SPEC.md:149 §3)' },
  adjGap:             { frac: 0.06,                         src: 'ART-DIRECTION-SPEC.md:133 §3' },
  troughSpread:       { frac: 0.12,                         src: 'ART-DIRECTION-SPEC.md:133 §3' },
  arcRealised:        { tol: 0.30,                          src: 'ART-DIRECTION-SPEC.md:149 §3' },
  stars:              { lo: 150, hi: 260,                   src: 'ART-DIRECTION-SPEC.md:214 §5' },
  // bottomThirdFrac: how many of the 12 stations (by loudness rank, ascending)
  // are ineligible for a subtractive element. 1/3 matches the rule's own name.
  occluderPlacement:  { bottomThirdFrac: 1 / 3,              src: 'ART-DIRECTION-SPEC.md:345 §7.2' },
  // perceptibility, redefined 2026-08-09 (st6 sprite test): median(box) vs
  // median(surround) is blind to any shape covering less than ~50% of its
  // own bounding box, by construction of what a median measures — proven,
  // not inferred: a drawn sprite covering 7.2% of its box at peak luma 194
  // (vs a glow covering 0.8% at the same peak 194) scored 1.0 vs 0.0 under
  // the old formula, indistinguishable from noise despite a real 9x
  // coverage gain. Every glow primitive in this build is similarly sparse in
  // its own box, so the old metric was blind to all of them, not just the
  // sprite case — the two numbers below replace it:
  //   signal: p95(headline box) - median(80px surround) — the box's own
  //     brightest ~5%, immune to sparse coverage (a shape 1px wide at full
  //     brightness still registers).
  //   extent: fraction of the box's pixels brighter than
  //     median(surround) + k — how much of the box actually carries that
  //     signal, which is exactly what the old metric couldn't see.
  // k reuses this same file's own ink-threshold rule (paneMedianLuma + 20,
  // ART-DIRECTION-SPEC.md §1, used unchanged at the frame-ink check below)
  // applied to the LOCAL surround instead of the whole frame's median — the
  // same "how much brighter than its own background counts as ink" rule,
  // not a new number invented for this check.
  // No floor is set for either number this round — the old floor=10 doesn't
  // transfer (p95-median is systematically >= the old median-median value,
  // so reapplying it would silently pass stations that never improved).
  // Reported as measurement only until a floor is deliberately re-derived.
  perceptibility:     { k: 20, marginPx: 80,                 src: 'ART-DIRECTION-SPEC.md:72 §1' },
  // drawn-subject: a station's headline primitive must be a drawn (opaque,
  // closed-path) kind, never one of the seven glow kinds. Rule, not a
  // per-station patch (ART-DIRECTION-SPEC.md §6.0) — the st6 fix simply
  // promoted st10 into the same defect's worst slot, because a glow-only
  // headline structurally covers far less of its own box than a drawn one.
  drawnSubject:       { kinds: ['sprite', 'ring', 'ground'],  src: 'ART-DIRECTION-SPEC.md:294 §6.0' },
});

// ═══════════════════════════════════════════════════════════════════════
// KNOWN DEVIATIONS — the ONLY sanctioned way to not meet a spec target.
//
// A deviation never turns a FAIL into a PASS. It turns it into a WARN that
// prints the reason, the date it was opened, and the date it expires. Past
// its `review` date it reverts to a hard FAIL automatically, so a deviation
// cannot quietly become permanent. Add one only where the spec target is
// genuinely unreachable in this harness — never because the build currently
// misses it. "The build currently misses it" is what FAIL is for.
// ═══════════════════════════════════════════════════════════════════════
// 'react-live/safe-box-cap-no-scrim' (opened 2026-08-07, retired 2026-08-09):
// RingAmbient.jsx now renders its own scrim (.ring-scrim) — its premise
// ("deliberately does not render a scrim") is false as of that fix. Removed
// rather than left to expire naturally: per this file's own rule, a
// deviation is only for a target genuinely unreachable in this harness,
// never "the build currently misses it" — and once the premise is false,
// leaving the entry in place would itself be the self-serving-gate defect
// this table exists to prevent.
const KNOWN_DEVIATIONS = {};

// Integrity guards on the two tables above. These run at import time and hard-
// exit: a malformed threshold table is worse than no gate, because it looks green.
for (const [k, v] of Object.entries(SPEC)) {
  if (!v.src || !/:\d+/.test(v.src)) {
    console.error(`ring-verify: SPEC.${k} has no file:line citation. Every threshold must name where in the spec it came from.`);
    process.exit(3);
  }
}
const TODAY = new Date();
for (const [k, d] of Object.entries(KNOWN_DEVIATIONS)) {
  for (const f of ['opened', 'review', 'spec', 'reason']) {
    if (!d[f]) { console.error(`ring-verify: KNOWN_DEVIATIONS['${k}'] is missing "${f}".`); process.exit(3); }
  }
  d.expired = new Date(d.review) < TODAY;
}

// specCheck — absolute pass/fail against SPEC. `devKey` optionally names a
// KNOWN_DEVIATIONS entry; a live (unexpired) deviation downgrades FAIL->WARN
// and prints the reason. It can never produce PASS.
function specCheck(P, name, ok, detail, src, tier = 'spec', devKey = null) {
  const dev = devKey ? KNOWN_DEVIATIONS[devKey] : null;
  let status = ok ? 'PASS' : 'FAIL';
  let note = `[${src}]`;
  if (!ok && dev && !dev.expired) {
    status = 'WARN';
    note = `[${src}] KNOWN DEVIATION (opened ${dev.opened}, reverts to FAIL after ${dev.review}): ${dev.reason}`;
  } else if (!ok && dev && dev.expired) {
    note = `[${src}] DEVIATION EXPIRED ${dev.review} — reverted to FAIL: ${dev.reason}`;
  }
  report(P(name), status, `${detail} ${note}`, tier);
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

// ── drawn-subject (ART-DIRECTION-SPEC.md §6.0, added 2026-08-09): every
//    station's headline primitive must be a drawn kind, never glow-only.
//    Reads st.prim directly per file, in array order (station index =
//    position in the stations array) — no render needed. Re-parses the world
//    files rather than reaching into the parity check's block-scoped
//    `primUses` above (kept as two independent checks on purpose). ──
{
  const worldsDir = path.join(REPO_ROOT, 'client/src/worlds');
  const worldFiles = readdirSync(worldsDir).filter(f => f.endsWith('.ring.js'));
  const primUses = [];
  for (const f of worldFiles) {
    const txt = readFileSync(path.join(worldsDir, f), 'utf8');
    const re = /\bprim\s*:\s*'([^']+)'/g;
    let m;
    while ((m = re.exec(txt))) primUses.push({ prim: m[1], file: f });
  }
  const drawnKinds = new Set(SPEC.drawnSubject.kinds);
  const byFile = {};
  for (const u of primUses) { (byFile[u.file] ||= []).push(u.prim); }
  const violations = [];
  for (const [f, prims] of Object.entries(byFile)) {
    prims.forEach((prim, i) => { if (!drawnKinds.has(prim)) violations.push(`${f}:st${i}(${prim})`); });
  }
  const total = primUses.length;
  report(`every station's headline is a drawn primitive (${[...drawnKinds].join('/')})`,
    violations.length === 0 ? 'PASS' : 'FAIL',
    (violations.length === 0
      ? `all ${total} station(s) across ${Object.keys(byFile).length} world file(s) use a drawn headline primitive`
      : `${violations.length}/${total} station(s) still glow-only: ${violations.join(', ')}`) +
    ` [${SPEC.drawnSubject.src}]`,
    'spec');
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
  if (total === 0) return { median: 0, mean: 0, p95: 0, p995: 0, total: 0 };
  let cum = 0, sum = 0, median = 255, medianSet = false;
  for (let v = 0; v < 256; v++) {
    sum += v * hist[v];
    cum += hist[v];
    if (!medianSet && cum >= total / 2) { median = v; medianSet = true; }
  }
  const mean = sum / total;
  let cum2 = 0, p95 = 255;
  const p95Target = total * 0.95;
  for (let v = 0; v < 256; v++) { cum2 += hist[v]; if (cum2 >= p95Target) { p95 = v; break; } }
  let cum3 = 0, p995 = 255;
  const p995Target = total * 0.995;
  for (let v = 0; v < 256; v++) { cum3 += hist[v]; if (cum3 >= p995Target) { p995 = v; break; } }
  return { median, mean, p95, p995, total };
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

  // 6a. arc ABSOLUTE band (spec §3): quietest station target 14-22, loudest 40-66.
  //     Missing from the gate before the 2026-08-08 rebaseline — the span ratio
  //     alone can be satisfied by an arc that sits entirely in the wrong place.
  {
    const S = SPEC.arcBand;
    const q = Math.min(...world.ARC), l = Math.max(...world.ARC);
    const ok = q >= S.quietLo && q <= S.quietHi && l >= S.loudLo && l <= S.loudHi;
    specCheck(P, `arc absolute band (quietest ${S.quietLo}-${S.quietHi}, loudest ${S.loudLo}-${S.loudHi})`, ok,
      `quietest ${q.toFixed(1)} (want ${S.quietLo}-${S.quietHi}), loudest ${l.toFixed(1)} (want ${S.loudLo}-${S.loudHi})`,
      S.src);
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
  // #qScrim (html reference build) or .{prefix}scrim (RingAmbient.jsx, which
  // has no id — see ringDom()'s el() in ringPrimitives.js). Checking only
  // #qScrim here (pre-2026-08-09) is what let the react-live pass's safe-box
  // check ride the WARN/KNOWN_DEVIATIONS path after RingAmbient grew a real
  // scrim — the deviation's premise went false and nothing caught it.
  const hasScrim = await page.evaluate((prefix) =>
    !!document.getElementById('qScrim') || !!document.querySelector('.' + prefix + 'scrim'), prefix);
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
      // Every onscreen headline, not just the current station's own — the
      // mid layer holds all 12 stations' headlines at once (plus cylinder-
      // wraparound duplicates), jumpTo() only pans. Picking the one closest
      // to the viewport's own centre (960) is more robust than "first in
      // DOM order" once more than one primitive is a bright, opaque sprite:
      // a DOM-order pick is silently wrong the moment two are onscreen
      // together, and .find() alone gives no way to notice that happened.
      const onscreenHeadlines = midLyr
        ? [...midLyr.querySelectorAll('.' + prefix + 'pf-breathe')].map(el => toDesign(el.getBoundingClientRect())).filter(onScreen)
        : [];
      const headlineD = onscreenHeadlines.length
        ? onscreenHeadlines.slice().sort((a, b) => Math.abs((a.x0 + a.x1) / 2 - 960) - Math.abs((b.x0 + b.x1) / 2 - 960))[0]
        : null;
      const otherHeadlines = headlineD ? onscreenHeadlines.filter(h => h !== headlineD) : [];

      let starCount = 0;
      document.querySelectorAll('.' + prefix + 'star').forEach(el => { if (onScreen(toDesign(el.getBoundingClientRect()))) starCount++; });

      return {
        scale,
        elementCount: pfEls.length + occEls.length,
        occCount: occEls.length,
        headline: headlineD,
        otherHeadlines,
        starCount,
      };
    }, prefix);
    const scale = dom.scale;

    // screenshot #1: natural composited frame (all layers, resting/frozen state)
    const pngNaturalBuf = await design.screenshot();
    saveShot(pngNaturalBuf, `${label}-st${s}-natural`);
    const pngNatural = PNG.sync.read(pngNaturalBuf);

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
    const pngMidBuf = await design.screenshot();
    saveShot(pngMidBuf, `${label}-st${s}-mid`);
    const pngMid = PNG.sync.read(pngMidBuf);
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
    const pngSafeNaturalBuf = await design.screenshot();
    saveShot(pngSafeNaturalBuf, `${label}-st${s}-safenatural`);
    const pngSafeNatural = PNG.sync.read(pngSafeNaturalBuf);

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
    const pngPeakBuf = await design.screenshot();
    saveShot(pngPeakBuf, `${label}-st${s}-peak`);
    const pngPeak = PNG.sync.read(pngPeakBuf);
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

    let headlineInkFrac = null, midShare = null, bleedFrac = null, centroid = null, quadrant = null, vertSpreadFrac = null, signal = null, extent = null, contaminatedBy = 0;
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

      // vertical-spread (spec §2): overlap with the horizontal BAND y302-778
      // only (full frame width) — not the SAFE box's x-range, which is a
      // separate, narrower rule (the luminance-cap crop above). Presence by
      // AREA, not centroid, so this can hold simultaneously with the
      // centroid rule instead of fighting it (spec's own stated reasoning).
      const bandTop = world.ENGINE.SAFE.y * world.ENGINE.H, bandBot = (world.ENGINE.SAFE.y + world.ENGINE.SAFE.h) * world.ENGINE.H;
      const vy0 = Math.max(h.y0, bandTop), vy1 = Math.min(h.y1, bandBot);
      vertSpreadFrac = fullArea > 0 ? (Math.max(0, h.x1 - h.x0) * Math.max(0, vy1 - vy0)) / fullArea : 0;

      // perceptibility (spec §1, redefined 2026-08-09 — see SPEC.perceptibility
      // above for why median-vs-median was replaced): headline box vs an 80px
      // band immediately outside it, on the FORCED-PEAK frame (pngPeak — same
      // peak-forcing the safe-box cap uses below, worst-case brightest
      // reading). Histograms are additive: surround = (expanded box) -
      // (headline box itself), same subtraction technique as outsideMeanLuma
      // above.
      const mPx = SPEC.perceptibility.marginPx * scale;
      const ex0 = Math.max(0, sx0 - mPx), ey0 = Math.max(0, sy0 - mPx);
      const ex1 = Math.min(pngPeak.width, sx1 + mPx), ey1 = Math.min(pngPeak.height, sy1 + mPx);
      const headHistPeak = histOf(pngPeak, sx0, sy0, sx1, sy1);
      const expandedHistPeak = histOf(pngPeak, ex0, ey0, ex1, ey1);

      // Contamination guard (2026-08-09, added once a second station carried
      // an opaque sprite): a bright neighbour's headline landing inside THIS
      // station's 80px surround band would raise the surround median and
      // deflate `signal` — a false negative the metric can't see on its own.
      // Clip every other onscreen headline to the expanded region and
      // subtract its pixels from the surround the same way the own headline
      // already is. contamination stays [] (and this is a no-op) unless two
      // headlines are ever close enough to actually overlap.
      const contamination = [];
      const excludeHist = { hist: new Uint32Array(256), total: 0 };
      for (const oh of dom.otherHeadlines) {
        const ox0 = oh.x0 * scale, oy0 = oh.y0 * scale, ox1 = oh.x1 * scale, oy1 = oh.y1 * scale;
        const ix0 = Math.max(ex0, ox0), iy0 = Math.max(ey0, oy0);
        const ix1 = Math.min(ex1, ox1), iy1 = Math.min(ey1, oy1);
        if (ix1 > ix0 && iy1 > iy0) {
          contamination.push({ ox0, oy0, ox1, oy1 });
          const eh = histOf(pngPeak, ix0, iy0, ix1, iy1);
          for (let v = 0; v < 256; v++) excludeHist.hist[v] += eh.hist[v];
          excludeHist.total += eh.total;
        }
      }
      const surroundHistPeak = {
        hist: expandedHistPeak.hist.map((v, i) => v - headHistPeak.hist[i] - excludeHist.hist[i]),
        total: expandedHistPeak.total - headHistPeak.total - excludeHist.total,
      };
      const surroundMedianPeak = statsFromHist(surroundHistPeak).median;
      signal = statsFromHist(headHistPeak).p95 - surroundMedianPeak;
      extent = headHistPeak.total > 0
        ? countAbove(headHistPeak, surroundMedianPeak + SPEC.perceptibility.k) / headHistPeak.total
        : 0;
      contaminatedBy = contamination.length;
    }

    // safe box: design x 384-1536, y 302-778 — measured on the FORCED-PEAK frame,
    // plus the pre-forcing NATURAL reading at the same crop for the self-check below.
    const safeStats = statsFromHist(histOf(pngPeak, 384 * scale, 302 * scale, 1536 * scale, 778 * scale));
    const safeStatsNatural = statsFromHist(histOf(pngSafeNatural, 384 * scale, 302 * scale, 1536 * scale, 778 * scale));

    // outside-safe-box mean luma (2026-08-08 gate fix): the scrim (spec §2.6)
    // exists specifically to SUPPRESS contrast under the safe box — measuring
    // the arc's span/rank-correlation over the whole frame runs the check
    // through a filter built to cancel exactly what it's measuring. The
    // luminance CAP stays on the safe box (that's its job); span/rank move
    // outside it. Histograms are additive, so "outside" = full frame minus
    // the same safe-box crop the cap check above already uses, on the same
    // NATURAL frame frameHist itself came from — no new pixel pass needed.
    const safeBoxHistNatural = histOf(pngNatural, 384 * scale, 302 * scale, 1536 * scale, 778 * scale);
    const outsideHist = {
      hist: frameHist.hist.map((v, i) => v - safeBoxHistNatural.hist[i]),
      total: frameHist.total - safeBoxHistNatural.total,
    };
    const outsideStatsNatural = statsFromHist(outsideHist);

    stationMetrics.push({
      s, starCount: dom.starCount, elementCount: dom.elementCount, occCount: dom.occCount,
      inkFrac, headlineInkFrac, midShare, bleedFrac, centroid, quadrant, vertSpreadFrac, signal, extent, contaminatedBy, safeStats, safeStatsNatural,
      meanLuma: frameStatsNatural.mean,
      outsideMeanLuma: outsideStatsNatural.mean,
      hasHeadline: !!dom.headline,
    });
  }

  // 9a. scrim boundary alpha (ART-DIRECTION-SPEC.md sec 2, amended
  //     2026-08-09: "the scrim's alpha must reach exactly zero strictly
  //     inside its own element bounds, on every axis"). Renders the loudest
  //     station (peak scrim alpha — worst case for a residual edge, since
  //     the whole gradient scales linearly with it) twice, scrim shown vs
  //     hidden, and diffs raw pixels along all four frame edges. This is
  //     exactly what the prior (2026-08-08) fitted-box geometry failed —
  //     caught there only by rendering and looking; caught here by a gate
  //     so it can't ship unnoticed again.
  if (hasScrim) {
    const loudestStation = world.ARC.indexOf(Math.max(...world.ARC));
    await page.evaluate((st) => window.__world.jumpTo(st), loudestStation);
    await page.waitForTimeout(50);
    const scrimSelector = await page.evaluate((pfx) =>
      document.getElementById('qScrim') ? '#qScrim' : '.' + pfx + 'scrim', prefix);
    const pngScrimOnBuf = await design.screenshot();
    saveShot(pngScrimOnBuf, `${label}-st${loudestStation}-scrimOn`);
    const pngScrimOn = PNG.sync.read(pngScrimOnBuf);
    await page.evaluate((sel) => { document.querySelector(sel).style.display = 'none'; }, scrimSelector);
    const pngScrimOffBuf = await design.screenshot();
    saveShot(pngScrimOffBuf, `${label}-st${loudestStation}-scrimOff`);
    const pngScrimOff = PNG.sync.read(pngScrimOffBuf);
    await page.evaluate((sel) => { document.querySelector(sel).style.display = ''; }, scrimSelector);

    const bw = pngScrimOn.width, bh = pngScrimOn.height;
    let maxDiff = 0, worstAt = null;
    const sample = (x, y) => {
      const idx = (bw * y + x) << 2;
      const d = Math.abs(lumaAt(pngScrimOn.data, idx) - lumaAt(pngScrimOff.data, idx));
      if (d > maxDiff) { maxDiff = d; worstAt = `(${x},${y})`; }
    };
    for (let x = 0; x < bw; x++) { sample(x, 0); sample(x, bh - 1); }
    for (let y = 0; y < bh; y++) { sample(0, y); sample(bw - 1, y); }

    const EPS = 1; // 8-bit rounding tolerance — same convention as the peak-forcing self-check above
    specCheck(P, `scrim alpha reaches zero at its own element boundary (station ${loudestStation}, peak alpha)`,
      maxDiff <= EPS,
      maxDiff <= EPS
        ? `max boundary luma diff ${maxDiff.toFixed(1)} (scrim on vs off), station ${loudestStation} (peak scrim alpha) — indistinguishable from no scrim at the edge`
        : `max boundary luma diff ${maxDiff.toFixed(1)} at ${worstAt}, station ${loudestStation} — scrim is still visibly nonzero at its own edge`,
      'ART-DIRECTION-SPEC.md:88 §2');
  }

  // 10. visible stars per frame across all 12 stations, target 150-260
  {
    const counts = stationMetrics.map(m => m.starCount);
    const mean = counts.reduce((a, b) => a + b, 0) / counts.length;
    const status = mean >= 150 && mean <= 260 ? 'PASS' : mean >= 120 && mean <= 300 ? 'WARN' : 'FAIL';
    report(P('visible stars per frame (target 150-260)'), status, `mean ${mean.toFixed(0)} — per-station ${counts.join(',')}`);
  }

  // 11. ink per station (spec §1, amended 2026-08-08 — see SPEC.inkPerStation
  //     above for the rationale). Lower bound scales with each station's own
  //     arc target: floor(i) = S.lo * (arc[i] / ENGINE.ARC.hi), i.e. S.lo
  //     (today's 6%) is the ceiling of the floor, reached only by a station
  //     at (or near) the arc's own loud end. Upper bound (18%) stays flat —
  //     no station has ever measured over it, and there's no design reason a
  //     quiet station should be ALLOWED more ink than a loud one, only less.
  {
    const S = SPEC.inkPerStation;
    const floorOf = (m) => S.lo * (world.ARC[m.s] / world.ENGINE.ARC.hi);
    const bad = stationMetrics.filter(m => m.inkFrac < floorOf(m) || m.inkFrac > S.hi);
    specCheck(P, `ink per station (floor scales with arc target, ceiling ${pct(S.hi)})`, bad.length === 0,
      `${stationMetrics.map(m => `st${m.s}=${pct(m.inkFrac)}(floor${pct(floorOf(m))})`).join(' ')}` +
      (bad.length ? ` — ${bad.length}/12 OUT OF SPEC BAND: ${bad.map(m => `st${m.s}`).join(',')}` : ' — all 12 in spec band'),
      S.src);
  }

  // 11a. realised arc (spec §3, "close the loop"): rendered station mean luma
  //      must land within +/-30% of that station's own arc target. A target
  //      that is written but never measured is a target that is wrong — this is
  //      named in the spec as the exact defect that produced world-06's flat
  //      panes. Enforced by nothing before the 2026-08-08 rebaseline.
  {
    const S = SPEC.arcRealised;
    const rows = stationMetrics.map(m => ({ s: m.s, got: m.meanLuma, want: world.ARC[m.s] }));
    const bad = rows.filter(r => Math.abs(r.got - r.want) / r.want > S.tol);
    specCheck(P, 'realised arc: rendered mean luma within +/-30% of arc target', bad.length === 0,
      `${rows.map(r => `st${r.s}=${r.got.toFixed(1)}/want${r.want.toFixed(1)}`).join(' ')}` +
      (bad.length ? ` — ${bad.length}/12 OFF TARGET: ${bad.map(r => `st${r.s}(${((r.got - r.want) / r.want * 100).toFixed(0)}%)`).join(',')}` : ''),
      S.src);
  }

  // 11b. realised SPAN (B2-luminance.md sec 4.1, gate fix 2026-08-08): the
  //      check above is a per-station LEVEL check and cannot catch a globally
  //      flattened arc — if every station individually sits within +/-30% of
  //      a target whose own span is ~3.1x, the worst PERMISSIBLE rendered
  //      span is only 1.67x (min*1.30 to max*0.70), barely above the 1.56x
  //      the original defect produced. This is the check that actually gates
  //      contrast. Measured OUTSIDE the safe box (outsideMeanLuma), NOT
  //      frame-wide: the scrim (spec §2.6) exists specifically to suppress
  //      contrast under the safe box, so a frame-wide measurement runs the
  //      arc check through a filter built to cancel it. The luminance CAP
  //      (separate check, above) is correctly measured INSIDE the safe box —
  //      that's what the scrim is FOR. This check is about what the ring
  //      itself does outside that box.
  {
    const S = SPEC.arcSpanRealised;
    const lumas = stationMetrics.map(m => m.outsideMeanLuma);
    const renderedSpan = Math.max(...lumas) / Math.min(...lumas);
    const targetSpan = Math.max(...world.ARC) / Math.min(...world.ARC);
    const frac = renderedSpan / targetSpan;
    specCheck(P, `realised span outside safe box >= ${(S.minFrac * 100).toFixed(0)}% of target span`, frac >= S.minFrac,
      `rendered ${renderedSpan.toFixed(2)}x / target ${targetSpan.toFixed(2)}x = ${(frac * 100).toFixed(0)}% of intended contrast reaches the screen`,
      S.src);
  }

  // 11c. rank correlation (B2-luminance.md sec 4.1, gate fix 2026-08-08):
  //      guards the span rule above against a build that "buys" span by
  //      reordering stations instead of genuinely widening contrast — a
  //      build could satisfy 11b by making the wrong station the brightest.
  //      Spearman rank correlation between rendered mean luma and arc
  //      target, per station. Same outside-safe-box measurement as 11b, for
  //      the same reason. NOTE this check already passes on an unfixed
  //      build (order reaches the screen even when contrast doesn't) —
  //      that's expected; it exists to stop 11b's fix from being gamed, not
  //      to detect the original defect.
  {
    const S = SPEC.arcRankCorrelation;
    const n = stationMetrics.length;
    const rankOf = (vals) => {
      const idx = vals.map((v, i) => i).sort((a, b) => vals[a] - vals[b]);
      const ranks = new Array(n);
      idx.forEach((origIdx, rank) => { ranks[origIdx] = rank; });
      return ranks;
    };
    const gotRanks = rankOf(stationMetrics.map(m => m.outsideMeanLuma));
    const wantRanks = rankOf(world.ARC.slice(0, n));
    const dSquaredSum = gotRanks.reduce((sum, r, i) => sum + (r - wantRanks[i]) ** 2, 0);
    const rho = 1 - (6 * dSquaredSum) / (n * (n * n - 1));
    specCheck(P, `Spearman rank correlation (rendered vs arc target) >= ${S.min}`, rho >= S.min,
      `rho = ${rho.toFixed(3)}`, S.src);
  }

  // 12. headline ink, when present: 4-9% of the frame (spec §1) — content-budget.
  {
    const S = SPEC.headlineInk;
    const withHeadline = stationMetrics.filter(m => m.hasHeadline);
    const missing = stationMetrics.filter(m => !m.hasHeadline);
    const bad = withHeadline.filter(m => m.headlineInkFrac < S.lo || m.headlineInkFrac > S.hi);
    specCheck(P, 'headline ink, when present (4-9% of frame)', bad.length === 0 && missing.length === 0,
      `${withHeadline.map(m => `st${m.s}=${pct(m.headlineInkFrac)}`).join(' ')}` +
      (bad.length ? ` — ${bad.length}/12 OUT OF SPEC BAND: ${bad.map(m => `st${m.s}`).join(',')}` : '') +
      (missing.length ? ` — NO HEADLINE FOUND: ${missing.map(m => `st${m.s}`).join(',')}` : ''),
      S.src);
  }

  // 13. largest element supplies >=55% of the MID layer's own ink (spec §1) —
  //     content-budget. Threshold bug (natural-frame median applied to the
  //     mid-only screenshot) fixed above — see the midThreshold comment.
  {
    const S = SPEC.midShare;
    const withHeadline = stationMetrics.filter(m => m.hasHeadline && m.midShare != null);
    const missing = stationMetrics.length - withHeadline.length;
    const bad = withHeadline.filter(m => m.midShare < S.min);
    specCheck(P, 'largest element supplies >=55% of mid-layer ink', bad.length === 0 && missing === 0,
      `${withHeadline.map(m => `st${m.s}=${pct(m.midShare)}`).join(' ')}` +
      (bad.length ? ` — ${bad.length}/12 BELOW 55%: ${bad.map(m => `st${m.s}`).join(',')}` : '') +
      (missing ? ` — ${missing} station(s) with no measurable largest element` : ''),
      S.src);
  }

  // 14. elements per station, excluding atmosphere: 2-5 (spec §1) — content-budget.
  {
    const S = SPEC.elementsPerStation;
    const bad = stationMetrics.filter(m => m.elementCount < S.lo || m.elementCount > S.hi);
    specCheck(P, 'elements per station, excl. atmosphere (2-5)', bad.length === 0,
      `${stationMetrics.map(m => `st${m.s}=${m.elementCount}`).join(' ')}` +
      (bad.length ? ` — ${bad.length}/12 OUT OF SPEC BAND: ${bad.map(m => `st${m.s}(${m.elementCount})`).join(',')}` : ''),
      S.src);
  }

  // 14a. occluder placement (spec §7.2, amended 2026-08-09): no subtractive
  //      element on a station in the bottom third of the arc BY LOUDNESS
  //      RANK. A subtractive element on an already-quiet station is the
  //      worst pairing available — st6 carried both and rendered/judged as
  //      an empty pane, not a deliberately quiet one.
  {
    const S = SPEC.occluderPlacement;
    const n = world.ARC.length;
    const bottomCount = Math.floor(n * S.bottomThirdFrac);
    const quietestStations = new Set(
      [...Array(n).keys()].sort((a, b) => world.ARC[a] - world.ARC[b]).slice(0, bottomCount)
    );
    const violations = stationMetrics.filter(m => m.occCount > 0 && quietestStations.has(m.s));
    specCheck(P, `no occluder on a bottom-third-by-arc station (quietest ${bottomCount}/${n})`,
      violations.length === 0,
      `quietest stations: ${[...quietestStations].sort((a, b) => a - b).map(s => `st${s}`).join(',')} — occluders: ${stationMetrics.filter(m => m.occCount > 0).map(m => `st${m.s}`).join(',') || 'none'}` +
      (violations.length ? ` — VIOLATION: ${violations.map(m => `st${m.s}`).join(',')}` : ''),
      S.src);
  }

  // 14b. perceptibility (spec §1, redefined 2026-08-09 — see SPEC.perceptibility
  //      above): signal = p95(box) - median(surround), extent = fraction of
  //      the box brighter than median(surround)+k. MEASUREMENT ONLY this
  //      round — no floor is asserted. The old floor (10) doesn't transfer to
  //      p95-median (systematically >= the old median-median value, so
  //      reapplying it would silently pass stations that never improved,
  //      exactly the "moving the threshold" failure mode this project's own
  //      standing rules forbid). Report tier only; always WARN, never FAIL,
  //      until a floor is deliberately re-derived against these two numbers.
  //
  //      KNOWN LIMITATION, not fixed: p95 is maxed out by any bright speck
  //      covering as little as ~5% of the box — a hot-cored glow (blob/lens/
  //      spikes's own `s-core` element) can clear a high `signal` reading
  //      without reading as a drawn object at all. signal alone cannot tell
  //      "opaque sprite" from "glow with a bright pinpoint center" apart;
  //      only extent does that. Left open per 2026-08-09 review — do not
  //      infer object-ness from signal alone.
  {
    const S = SPEC.perceptibility;
    const withHeadline = stationMetrics.filter(m => m.hasHeadline);
    const missing = stationMetrics.length - withHeadline.length;
    const contaminated = withHeadline.filter(m => m.contaminatedBy > 0);
    report(P(`perceptibility (signal=p95(box)-median(surround), extent=%box>median(surround)+${S.k}, ${S.marginPx}px surround) — measurement only, no floor set`),
      'WARN',
      `${withHeadline.map(m => `st${m.s}=signal:${m.signal.toFixed(1)},extent:${(m.extent * 100).toFixed(1)}%${m.contaminatedBy ? `[CONTAMINATED by ${m.contaminatedBy} neighbour(s), excluded]` : ''}`).join(' ')}` +
      (missing ? ` — ${missing} station(s) with no measurable headline` : '') +
      (contaminated.length ? ` — ${contaminated.length}/12 surround band(s) overlapped another station's headline; those pixels were excluded before computing signal/extent above` : ' — no surround-band contamination detected across all 12 stations') +
      ` [${S.src}]`,
      'spec');
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

  // 15. safe-box luminance cap, mean <=34 / p99.5 <=S.p995Max, measured at
  //     forced peak (spec §2). Three-tier, not binary (2026-08-09): st0
  //     shipped once at EXACTLY 72/72, the old cap — zero headroom is not a
  //     margin, it's a coin flip against the next content change. Any
  //     passing station within warnMargin points of the cap prints WARN
  //     (visible, not silently green) instead of PASS; only the cap itself
  //     is a hard FAIL.
  {
    const S = SPEC.safeBox;
    const bad = stationMetrics.filter(m => m.safeStats.mean > S.meanMax || m.safeStats.p995 > S.p995Max);
    const thin = stationMetrics.filter(m =>
      m.safeStats.mean <= S.meanMax && m.safeStats.p995 <= S.p995Max &&
      (S.p995Max - m.safeStats.p995 < S.warnMargin || S.meanMax - m.safeStats.mean < S.warnMargin));
    const detail = `${stationMetrics.map(m => `st${m.s}=mean${m.safeStats.mean.toFixed(1)}/p99.5-${m.safeStats.p995}`).join(' ')}` +
      (bad.length ? ` — OVER CAP: ${bad.map(m => `st${m.s}`).join(',')}` : '') +
      (thin.length ? ` — WITHIN ${S.warnMargin}pt OF CAP: ${thin.map(m => `st${m.s}`).join(',')}` : '');
    const label = `safe-box luminance cap at breathe/twinkle peak, under scrim (mean<=${S.meanMax}, p99.5<=${S.p995Max})`;
    if (hasScrim) {
      const status = bad.length > 0 ? 'FAIL' : thin.length > 0 ? 'WARN' : 'PASS';
      report(P(label), status, `[${S.src}] ${detail}`, 'regression');
    } else {
      // Both builds render a scrim as of 2026-08-09, so this branch shouldn't
      // fire in practice — a hard FAIL (no accepted deviation) if it ever
      // does, since a route with no scrim measuring under the spec's
      // "under the scrim" cap is a real regression, not an unreachable target.
      specCheck(P, 'safe-box luminance cap at breathe/twinkle peak (NO SCRIM IN THIS ROUTE)', false,
        `bare-frame approximation, not the spec's under-the-scrim measurement — scrim element missing. ${detail}`,
        S.src, 'regression');
    }
  }

  // 16. bleed: 3-5 of 12 stations' largest element cropped 10-35% by a frame edge,
  //     post-rotation (spec §2). Any station cropped >35% is a real violation
  //     regardless of the 3-5 count. Content-budget.
  {
    const S = SPEC.bleed;
    const withHeadline = stationMetrics.filter(m => m.hasHeadline);
    const bleeding = withHeadline.filter(m => m.bleedFrac >= S.cropLo && m.bleedFrac <= S.cropHi);
    const overCropped = withHeadline.filter(m => m.bleedFrac > S.cropHi);
    const ok = overCropped.length === 0 && bleeding.length >= S.lo && bleeding.length <= S.hi;
    specCheck(P, 'bleed: 3-5/12 stations cropped 10-35% by frame edge', ok,
      `${withHeadline.map(m => `st${m.s}=${pct(m.bleedFrac)}`).join(' ')} — ${bleeding.length} station(s) in 10-35% band (target ${S.lo}-${S.hi})` +
      (overCropped.length ? `; ACCIDENTAL CLIP (>35%): ${overCropped.map(m => `st${m.s}`).join(',')}` : ''),
      S.src);
  }

  // 16a. vertical spread (spec §2): at least 6 of 12 stations must place >=15%
  //      of their largest element's AREA inside the horizontal band y302-778
  //      (still governed by the luminance cap above — this only checks
  //      presence). Missing from the gate until 2026-08-08 — its absence is
  //      how a full-bbox safe-box exclusion (commit 3304681) shipped a
  //      structural violation of this rule (measured 1/12 at that commit)
  //      with nothing catching it. Content-budget: this is a genuine spec
  //      absolute target, not a tracked-backlog metric, so the baseline is
  //      "clears the >=6 floor," not "no worse than a known gap."
  {
    const S = SPEC.vertSpread;
    const withHeadline = stationMetrics.filter(m => m.hasHeadline);
    const meeting = withHeadline.filter(m => m.vertSpreadFrac >= S.areaFrac);
    specCheck(P, 'vertical spread: >=6/12 stations place >=15% of largest element in y302-778',
      meeting.length >= S.minStations,
      `${withHeadline.map(m => `st${m.s}=${pct(m.vertSpreadFrac)}`).join(' ')} — ${meeting.length}/12 stations place >=15% area in band (target >=${S.minStations})`,
      S.src);
  }

  // 17 & 18. quadrant rotation (2-4 per quadrant over 12) + horizontal balance
  //          (mean centroid x within 960+/-96) — both derived from the same
  //          per-station headline centroid, spec §2. Content-budget.
  {
    const withHeadline = stationMetrics.filter(m => m.hasHeadline && m.centroid);
    const missing = stationMetrics.length - withHeadline.length;
    const counts = { LT: 0, RT: 0, LB: 0, RB: 0 };
    withHeadline.forEach(m => { counts[m.quadrant] = (counts[m.quadrant] || 0) + 1; });
    const Q = SPEC.quadrant;
    const quadBad = Object.entries(counts).filter(([, c]) => c < Q.lo || c > Q.hi);
    specCheck(P, 'quadrant rotation (largest element, 2-4x per quadrant/12)',
      quadBad.length === 0 && missing === 0,
      `LT=${counts.LT} RT=${counts.RT} LB=${counts.LB} RB=${counts.RB} (target ${Q.lo}-${Q.hi} each)` +
      (quadBad.length ? ` — OUT OF BAND: ${quadBad.map(([q, c]) => `${q}=${c}`).join(',')}` : '') +
      (missing ? ` — ${missing} station(s) with no largest element` : ''),
      Q.src);

    const B = SPEC.balance;
    const meanX = withHeadline.reduce((a, m) => a + m.centroid.x, 0) / withHeadline.length;
    specCheck(P, 'horizontal balance (mean centroid x within 960+/-96)',
      Math.abs(meanX - B.centre) <= B.tol,
      `mean centroid x = ${meanX.toFixed(1)} (target ${B.centre - B.tol}-${B.centre + B.tol}, off by ${Math.max(0, Math.abs(meanX - B.centre) - B.tol).toFixed(1)}px) — per-station ${withHeadline.map(m => `st${m.s}=${m.centroid.x.toFixed(0)}`).join(' ')}`,
      B.src);
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
  console.log(`\nscreenshots: ${RUN_DIR}`);
  const width = Math.max(...results.map(r => r.name.length));
  const regression = results.filter(r => r.tier === 'regression');
  const content = results.filter(r => r.tier === 'spec');

  printTier('REGRESSION TIER — must always be green (structural/engine correctness)', regression, width);
  const regFails = regression.filter(r => r.status === 'FAIL');
  const regWarns = regression.filter(r => r.status === 'WARN');
  console.log(regFails.length === 0
    ? `\nregression tier: all ${regression.length} checks green (${regWarns.length} WARN)`
    : `\nregression tier: ${regFails.length}/${regression.length} FAIL — ${regFails.map(r => r.name).join(', ')}`);

  printTier('SPEC-CONFORMANCE TIER — absolute targets from ART-DIRECTION-SPEC.md. Every threshold cites its spec line. No value here is derived from a measurement of the build under test.', content, width);
  const contentFails = content.filter(r => r.status === 'FAIL');
  const contentWarns = content.filter(r => r.status === 'WARN');
  console.log(contentFails.length === 0
    ? `\nspec-conformance tier: all ${content.length} checks meet their absolute spec target (${contentWarns.length} known deviation(s))`
    : `\nspec-conformance tier: ${contentFails.length}/${content.length} BELOW SPEC — ${contentFails.map(r => r.name).join(', ')}`);

  const fails = results.filter(r => r.status === 'FAIL');
  const warns = results.filter(r => r.status === 'WARN');
  console.log(`\n${results.length} checks — ${results.length - fails.length - warns.length} PASS, ${warns.length} WARN, ${fails.length} FAIL`);
  process.exit(fails.length > 0 ? 2 : 0);
}

// ═══════════════════════════════════════════════════════════════════════
// NO-SELF-BASELINE — the rule this file exists to enforce on itself.
//
//   A gate may never encode, as a pass criterion, a value it obtained by
//   measuring the artefact it gates.
//
// Mechanically enforceable form (three parts, all cheap to check in CI):
//
//   1. Every numeric threshold lives in a single frozen SPEC-shaped object,
//      and every entry carries `src: '<spec-file>:<line> §<section>'`.
//      Enforced at import time above (exit 3 if a citation is missing).
//
//   2. A CI lint rejects any numeric literal used in a comparison inside a
//      check body. Grep form, run over concepts/tools/*verify*.mjs:
//        rg -n '(?<![\w.])[<>]=?\s*-?\d' <gate> | rg -v 'SPEC\.'
//      Any hit is a threshold that escaped the table.
//
//   3. A CI lint rejects the words "baseline", "measured", "observed",
//      "current build", "as of <date>" inside any object literal that feeds
//      a comparison. The prior CONTENT_BASELINE said so in its own comment
//      ("the actual measured badness ... at the moment this split landed") —
//      the defect was legible in plain English for a month and shipped
//      anyway, because nothing read it.
//
// Corollary, for the case that produced the prior defect: "a permanently red
// gate trains people to ignore FAIL" is a real problem, and the answer to it
// is KNOWN_DEVIATIONS — dated, reasoned, self-expiring, WARN not PASS — never
// moving the line to wherever the build happens to stand.
// ═══════════════════════════════════════════════════════════════════════
