#!/usr/bin/env node
// concepts/tools/ring-st6-sprite-check.mjs
//
// One-off diagnostic, not a gate: does an opaque `sprite` primitive raise
// station 6's perceptibility (headline-vs-80px-surround local contrast,
// ART-DIRECTION-SPEC.md:72 §1, floor 10) where the glow-only `ribbon`
// primitive at that same station does not? Same metric ring-verify.mjs uses
// (histOf/statsFromHist/countAbove, forced-peak frame), duplicated here in
// ~25 lines rather than importing ring-verify.mjs, which executes top-to-
// bottom against process.argv on load and isn't set up to be imported.
//
// Run once with WORLD.stations[6].prim==='ribbon' (before), once with it
// swapped to 'sprite' (after) — run manually before/after the edit, label
// passed on the command line.
//
// Persists every screenshot to disk under concepts/.audit-shots/ (gitignored,
// never deleted — see visual-audit.mjs's header comment on why: concepts/'s
// own delete-permission wall blocks unlink/rmdir there for an unattended
// run) and prints the run directory. ring-verify.mjs itself never writes a
// screenshot to disk — every "rendered and looked" claim from it is
// currently unverifiable after the process exits. That's the standing
// complaint this script is written to not repeat; it does NOT fix
// ring-verify.mjs itself (out of scope here, flagged separately).
//
// Usage: node concepts/tools/ring-st6-sprite-check.mjs <label e.g. before|after>

import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdirSync, writeFileSync } from 'node:fs';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { PNG } from 'pngjs';

const readFileAsync = promisify(readFile);
const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = fileURLToPath(new URL('../../', import.meta.url));

const label = process.argv[2];
if (!label) { console.error('Usage: node ring-st6-sprite-check.mjs <label>'); process.exit(2); }

// same xdamage-stub fix visual-audit.mjs/spot-check.mjs already use — Chromium
// otherwise fails to launch here (missing libXdamage.so.1, no root to install).
const exportLine = execSync(`"${HERE}/ensure-xdamage-stub.sh"`, { encoding: 'utf8' }).trim();
const m = exportLine.match(/LD_LIBRARY_PATH="([^$"]+)/);
if (m) process.env.LD_LIBRARY_PATH = `${m[1]}${process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : ''}`;

const RUN_DIR = path.resolve(HERE, '..', '.audit-shots', `st6-sprite-${label}-${Date.now()}`);
mkdirSync(RUN_DIR, { recursive: true });

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
      } catch { res.writeHead(404); res.end('Not found'); }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

// ── same pixel helpers as ring-verify.mjs (duplicated on purpose — see header) ──
function lumaAt(data, idx) { return 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2]; }
function histOf(png, x0, y0, x1, y1) {
  const hist = new Uint32Array(256); let total = 0;
  const X0 = Math.max(0, Math.floor(x0)), Y0 = Math.max(0, Math.floor(y0));
  const X1 = Math.min(png.width, Math.ceil(x1)), Y1 = Math.min(png.height, Math.ceil(y1));
  for (let y = Y0; y < Y1; y++) {
    const rowBase = png.width * y;
    for (let x = X0; x < X1; x++) {
      const idx = (rowBase + x) << 2;
      const l = Math.max(0, Math.min(255, Math.round(lumaAt(png.data, idx))));
      hist[l]++; total++;
    }
  }
  return { hist, total };
}
function statsFromHist({ hist, total }) {
  if (total === 0) return { median: 0, mean: 0 };
  let cum = 0, sum = 0, median = 255, medianSet = false;
  for (let v = 0; v < 256; v++) {
    sum += v * hist[v]; cum += hist[v];
    if (!medianSet && cum >= total / 2) { median = v; medianSet = true; }
  }
  return { median, mean: sum / total };
}
const MARGIN_PX = 80; // ART-DIRECTION-SPEC.md:72 §1
const FLOOR = 10;      // ART-DIRECTION-SPEC.md:72 §1

const server = await startStaticServer(REPO_ROOT);
const port = server.address().port;
const targetUrl = `http://127.0.0.1:${port}/concepts/world-07-ring.html`;

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(targetUrl);
await page.waitForFunction(() => !!window.__world, null, { timeout: 8000 });
await page.evaluate(() => window.__world.jumpTo(6));
await page.emulateMedia({ reducedMotion: 'reduce' });

const design = page.locator('#design');
await page.evaluate(() => {
  const qLayer = document.getElementById('qLayer');
  if (qLayer) { qLayer.dataset.savedDisplay = qLayer.style.display; qLayer.style.display = 'none'; }
});

// natural (what a human sees) — kept for the "render and look" record
const pngNaturalBuf = await design.screenshot();
writeFileSync(path.join(RUN_DIR, 'st6-natural.png'), pngNaturalBuf);
const pngNatural = PNG.sync.read(pngNaturalBuf);

// forced-peak (same technique ring-verify.mjs uses) — the worst-case frame
// the perceptibility floor is actually measured against
await page.evaluate(() => {
  document.querySelectorAll('.star').forEach(el => {
    const cs = getComputedStyle(el);
    el.style.setProperty('--ob', cs.getPropertyValue('--op').trim());
  });
  document.querySelectorAll('.pf-breathe').forEach(el => {
    const cs = getComputedStyle(el);
    el.style.setProperty('--pa', cs.getPropertyValue('--pa2').trim());
  });
});
const pngPeakBuf = await design.screenshot();
writeFileSync(path.join(RUN_DIR, 'st6-peak.png'), pngPeakBuf);
const pngPeak = PNG.sync.read(pngPeakBuf);

const dom = await page.evaluate(() => {
  const designEl = document.getElementById('design');
  const dRect = designEl.getBoundingClientRect();
  const scale = dRect.width / 1920 || 1;
  const toDesign = (r) => ({
    x0: (r.left - dRect.left) / scale, y0: (r.top - dRect.top) / scale,
    x1: (r.right - dRect.left) / scale, y1: (r.bottom - dRect.top) / scale,
  });
  const onScreen = (d) => d.x1 > -20 && d.x0 < 1940 && d.y1 > -20 && d.y0 < 1100;
  const midLyr = [...document.querySelectorAll('#design > .lyr')][2];
  // all 12 stations' headlines coexist in the DOM at once (this is a
  // continuously-scrolling cylinder, not a per-station rebuild) — jumpTo()
  // only pans the layer transform, so the on-screen filter is load-bearing,
  // not cosmetic: without it this picks whichever station is DOM-first,
  // silently measuring the wrong element (caught by re-checking the "before"
  // and "after" screenshots by eye after both readings came back identical).
  const headlineD = midLyr
    ? [...midLyr.querySelectorAll('.pf-breathe')].map(el => toDesign(el.getBoundingClientRect())).find(onScreen) || null
    : null;
  return { scale, headline: headlineD, prim: window.__world.WORLD.stations[6].prim };
});

await browser.close();
await new Promise((resolve) => server.close(resolve));

if (!dom.headline) {
  console.error(`st6 (${label}): no headline element found — cannot measure. prim=${dom.prim}`);
  console.error(`screenshots: ${RUN_DIR}`);
  process.exit(2);
}

const { scale } = dom;
const h = dom.headline;
const sx0 = Math.max(0, h.x0 * scale), sy0 = Math.max(0, h.y0 * scale);
const sx1 = Math.min(pngPeak.width, h.x1 * scale), sy1 = Math.min(pngPeak.height, h.y1 * scale);
const mPx = MARGIN_PX * scale;
const ex0 = Math.max(0, sx0 - mPx), ey0 = Math.max(0, sy0 - mPx);
const ex1 = Math.min(pngPeak.width, sx1 + mPx), ey1 = Math.min(pngPeak.height, sy1 + mPx);
const headHistPeak = histOf(pngPeak, sx0, sy0, sx1, sy1);
const expandedHistPeak = histOf(pngPeak, ex0, ey0, ex1, ey1);
const surroundHistPeak = {
  hist: expandedHistPeak.hist.map((v, i) => v - headHistPeak.hist[i]),
  total: expandedHistPeak.total - headHistPeak.total,
};
const localContrast = statsFromHist(headHistPeak).median - statsFromHist(surroundHistPeak).median;

console.log(`st6 (${label}): prim=${dom.prim} localContrast=${localContrast.toFixed(1)} (floor ${FLOOR}, margin ${MARGIN_PX}px)`);
console.log(`screenshots: ${RUN_DIR}`);
writeFileSync(path.join(RUN_DIR, 'result.json'), JSON.stringify({ label, prim: dom.prim, localContrast, floor: FLOOR, marginPx: MARGIN_PX }, null, 2));
