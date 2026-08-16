#!/usr/bin/env node
// Isolated A/B render + signal/extent check for a headline-tier makePrim
// kind, min fill (0.35) vs max fill (1.00), same size/hue/position otherwise.
// Usage: node concepts/tools/headline-isolated-check.mjs <kind> [hue] [w]
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const exportLine = execSync(`"${HERE}/ensure-xdamage-stub.sh"`, { encoding: 'utf8' }).trim();
const ldMatch = exportLine.match(/LD_LIBRARY_PATH="([^$"]+)/);
if (ldMatch) process.env.LD_LIBRARY_PATH = `${ldMatch[1]}${process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : ''}`;

const KIND = process.argv[2] || 'planet';
const HUE = process.argv[3] || '150';
const W = process.argv[4] || '700';

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
function countAbove({ hist }, threshold) {
  let c = 0;
  for (let v = Math.max(0, threshold + 1); v < 256; v++) c += hist[v];
  return c;
}
function p95Of({ hist, total }) {
  if (total === 0) return 0;
  let cum = 0;
  const target = total * 0.95;
  for (let v = 0; v < 256; v++) { cum += hist[v]; if (cum >= target) return v; }
  return 255;
}

const server = await startStaticServer(REPO_ROOT);
const port = server.address().port;
const targetUrl = `http://127.0.0.1:${port}/concepts/tools/headline-isolated.html?kind=${KIND}&hue=${HUE}&w=${W}`;
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const H = Math.round(Number(W) * 0.62);
const boxW = Number(W) + 160, boxH = H + 160;
const page = await browser.newPage({ viewport: { width: boxW * 2, height: boxH } });
await page.goto(targetUrl, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true);
await page.screenshot({ path: `${HERE}/headline-isolated-${KIND}.png` });

const boxes = await page.evaluate(() => {
  const lo = document.getElementById('lo').getBoundingClientRect();
  const hi = document.getElementById('hi').getBoundingClientRect();
  return { lo: { x0: lo.left, y0: lo.top, x1: lo.right, y1: lo.bottom }, hi: { x0: hi.left, y0: hi.top, x1: hi.right, y1: hi.bottom } };
});
const buf = await page.screenshot();
const png = PNG.sync.read(buf);
await browser.close();
await new Promise((resolve) => server.close(resolve));

const K = 8;
console.log(`kind=${KIND} hue=${HUE} w=${W}`);
for (const [label, b] of [['fill=0.35 (min)', boxes.lo], ['fill=1.00 (max)', boxes.hi]]) {
  const h = histOf(png, b.x0, b.y0, b.x1, b.y1);
  const extent = h.total > 0 ? countAbove(h, K) / h.total : 0;
  const signal = p95Of(h) - 0; // solid black surround -> median=0
  console.log(`${label}: signal=${signal.toFixed(1)}  extent(>${K} luma)=${(extent * 100).toFixed(1)}%  (box ${h.total}px)`);
}
