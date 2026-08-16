#!/usr/bin/env node
// Counts actual rendered DOM elements + SVG path/circle/ellipse node points
// for a makePrim kind, from the real DOM (not hand-counted from source).
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(HERE, '..', '..');
const exportLine = execSync(`"${HERE}/ensure-xdamage-stub.sh"`, { encoding: 'utf8' }).trim();
const ldMatch = exportLine.match(/LD_LIBRARY_PATH="([^$"]+)/);
if (ldMatch) process.env.LD_LIBRARY_PATH = `${ldMatch[1]}${process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : ''}`;

const KIND = process.argv[2];
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' };
function startStaticServer(rootDir) {
  return new Promise((resolve) => {
    const server = createServer(async (req, res) => {
      try {
        const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
        const filePath = path.join(rootDir, path.normalize(urlPath));
        const data = await readFile(filePath);
        res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' });
        res.end(data);
      } catch { res.writeHead(404); res.end('Not found'); }
    });
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}
const server = await startStaticServer(REPO_ROOT);
const port = server.address().port;
const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 900, height: 700 } });
await page.goto(`http://127.0.0.1:${port}/concepts/tools/headline-isolated.html?kind=${KIND}&hue=200&w=700`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__ready === true);

const counts = await page.evaluate(() => {
  const root = document.getElementById('hi').querySelector('.pf, [class]'); // the makePrim-returned element
  const f = document.getElementById('hi').firstElementChild;
  const allEls = f.querySelectorAll('*');
  let pathNodes = 0;
  const pathD = [];
  f.querySelectorAll('path').forEach(p => {
    const d = p.getAttribute('d') || '';
    // count M/L/A/C/Q command letters as "nodes" (anchor/control points), same
    // convention used to report the planet's own node count earlier.
    const cmds = (d.match(/[MLACQmlacq]/g) || []).length;
    pathNodes += cmds;
    pathD.push(d.length);
  });
  return {
    topLevelChildren: f.children.length,
    totalDescendants: allEls.length,
    pathCount: f.querySelectorAll('path').length,
    pathNodes,
    circleCount: f.querySelectorAll('circle').length,
    svgCount: f.querySelectorAll('svg').length,
  };
});
console.log(`kind=${KIND}`, JSON.stringify(counts));
await browser.close();
await new Promise(r => server.close(r));
