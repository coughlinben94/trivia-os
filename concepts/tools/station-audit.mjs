import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const HERE = path.resolve('concepts/tools');
const exportLine = execSync(`"${HERE}/ensure-xdamage-stub.sh"`, { encoding: 'utf8' }).trim();
const ldMatch = exportLine.match(/LD_LIBRARY_PATH="([^$"]+)/);
if (ldMatch) process.env.LD_LIBRARY_PATH = `${ldMatch[1]}${process.env.LD_LIBRARY_PATH ? ':' + process.env.LD_LIBRARY_PATH : ''}`;
const REPO_ROOT = process.cwd();
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
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`http://127.0.0.1:${port}/concepts/world-07-ring.html`, { waitUntil: 'load' });
await page.waitForFunction(() => window.__world && window.__world.WORLD);
const stations = await page.evaluate(() => window.__world.WORLD.stations.map(s => ({ key: s.key, prim: s.prim, hue: s.hue, accent: s.accent })));
stations.forEach((s,i) => console.log(`st${i}: ${s.key} — prim:${s.prim} hue:${s.hue}${s.accent?' [accent]':''}`));
await browser.close();
await new Promise(r => server.close(r));
