#!/usr/bin/env node
// One-off verification for task-1 acceptance: does the occluder/planet's
// own extent metric MOVE when fill changes, and does it clear a readable
// floor at minimum fill? Same formula ring-verify.mjs uses for headline
// perceptibility (extent = %box brighter than surround-median+k), scoped to
// the occluder's own bounding circle instead of a station's headline box.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = '/Users/bencoughlin/Projects/baynes-trivia/trivia-os';
const TOOLS_DIR = path.join(REPO_ROOT, 'concepts', 'tools');
const exportLine = execSync(`"${TOOLS_DIR}/ensure-xdamage-stub.sh"`, { encoding: 'utf8' }).trim();
const ldMatch = exportLine.match(/LD_LIBRARY_PATH="([^$"]+)/);
if (ldMatch) process.env.LD_LIBRARY_PATH = `${ldMatch[1]}${process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : ''}`;

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
function startStaticServer(rootDir) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const filePath = path.join(rootDir, path.normalize(urlPath));
        if (!filePath.startsWith(rootDir)) { res.writeHead(403); res.end(); return; }
        const data = await readFile(filePath);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      } catch { res.writeHead(404); res.end('Not found'); }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

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
  if (total === 0) return { median: 0 };
  let cum = 0, median = 255;
  for (let v = 0; v < 256; v++) { cum += hist[v]; if (cum >= total / 2) { median = v; break; } }
  return { median };
}
function countAbove({ hist }, threshold) {
  let c = 0;
  for (let v = Math.max(0, threshold + 1); v < 256; v++) c += hist[v];
  return c;
}
const K = 20; // same margin ring-verify.mjs's perceptibility check uses

const server = await startStaticServer(REPO_ROOT);
const port = server.address().port;
const targetUrl = `http://127.0.0.1:${port}/concepts/world-07-ring.html`;
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.goto(targetUrl, { waitUntil: 'load' });
await page.waitForFunction(() => window.__world && typeof window.__world.jumpTo === 'function');

// per-station fill, computed the same way fillOf() does (client/src/lib/ringEngine.js)
const fillByStation = await page.evaluate(() => {
  const { ARC, ENGINE } = window.__world;
  const { ref, fillMin, fillMax } = ENGINE.ARC;
  return ARC.map(v => Math.min(fillMax, Math.max(fillMin, v / ref)));
});

const results = [];
for (let s = 0; s < 12; s++) {
  await page.evaluate((st) => window.__world.jumpTo(st), s);
  await page.waitForTimeout(50);
  const occInfo = await page.evaluate(() => {
    const design = document.getElementById('design');
    const dRect = design.getBoundingClientRect();
    const scale = dRect.width / 1920 || 1;
    const occs = [...document.querySelectorAll('.occ')];
    for (const occ of occs) {
      const r = occ.getBoundingClientRect();
      const x = (r.left - dRect.left) / scale;
      if (x > -20 && x < 1920 + 20) return { left: r.left, top: r.top, width: r.width, height: r.height };
    }
    return null;
  });
  if (!occInfo) continue;
  const buf = await page.screenshot();
  const png = PNG.sync.read(buf);
  const m = 40; // surround margin, px, screenshot-space
  const bx0 = occInfo.left, by0 = occInfo.top, bx1 = occInfo.left + occInfo.width, by1 = occInfo.top + occInfo.height;
  const ex0 = Math.max(0, bx0 - m), ey0 = Math.max(0, by0 - m), ex1 = Math.min(png.width, bx1 + m), ey1 = Math.min(png.height, by1 + m);
  const boxHist = histOf(png, bx0, by0, bx1, by1);
  const expandedHist = histOf(png, ex0, ey0, ex1, ey1);
  const surroundHist = { hist: expandedHist.hist.map((v, i) => v - boxHist.hist[i]), total: expandedHist.total - boxHist.total };
  const surroundMedian = statsFromHist(surroundHist).median;
  const extent = boxHist.total > 0 ? countAbove(boxHist, surroundMedian + K) / boxHist.total : 0;
  results.push({ station: s, fill: fillByStation[s], extent, surroundMedian, boxPx: occInfo.width.toFixed(0) });
  await page.screenshot({ path: `${HERE}/occ-st${s}.png`, clip: { x: Math.max(0,bx0-m), y: Math.max(0,by0-m), width: Math.min(png.width,bx1+m)-Math.max(0,bx0-m), height: Math.min(png.height,by1+m)-Math.max(0,by0-m) } });
}

await browser.close();
await new Promise((resolve) => server.close(resolve));

console.log('station  fill    extent   surroundMedian  boxPx');
for (const r of results) console.log(`st${r.station}     ${r.fill.toFixed(2)}   ${(r.extent*100).toFixed(1)}%    ${r.surroundMedian}             ${r.boxPx}`);
