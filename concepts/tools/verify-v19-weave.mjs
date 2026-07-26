#!/usr/bin/env node
// One-off verification for v19's planet-weave redesign (stop 3), same
// real-time-polling technique as spot-check.mjs. Targets: stop3 start
// (baseline), each of the 3 new planets' own peak, the purple finale/flare
// peak, and a late frame. Deleted after use — not part of the shipped
// prototype.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const exportLine = execSync(`"${HERE}/ensure-xdamage-stub.sh"`, { encoding: 'utf8' }).trim();
const m = exportLine.match(/LD_LIBRARY_PATH="([^$"]+)/);
if (m) process.env.LD_LIBRARY_PATH = `${m[1]}${process.env.LD_LIBRARY_PATH?':'+process.env.LD_LIBRARY_PATH:''}`;

const FILE = resolve(HERE, '..', 'space-road-trip-v14.html');
const OUT = resolve(HERE, '..', '.audit-shots', `v19-weave-${Date.now()}`);
mkdirSync(OUT, { recursive: true });

// stop3 hold starts at GAL_HOLD(10000)+BR1(600)+MS_HOLD(2900)+MS_OUT(6500)+BR2(600) = 20600ms
const STOP3 = 20600;
const targets = [
  { t: STOP3 + 100,  label: 'baseline-all-4-visible' },
  { t: STOP3 + 1400, label: 'blue-left-peak' },
  { t: STOP3 + 4000, label: 'rose-right-peak' },
  { t: STOP3 + 6600, label: 'amber-left-peak' },
  { t: STOP3 + 9200, label: 'purple-finale-flare-peak' },
  { t: STOP3 + 10400, label: 'stop3-late' },
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
page.on('console', msg => { if (msg.type() === 'error') console.log('PAGE ERROR:', msg.text()); });
page.on('pageerror', err => console.log('PAGE EXCEPTION:', err.message));
const navStart = Date.now();
await page.goto(`file://${FILE}`, { waitUntil: 'load' });
const shots = [];
for (const target of targets) {
  const wait = target.t - (Date.now() - navStart);
  if (wait > 0) await page.waitForTimeout(wait);
  const real = Date.now() - navStart;
  const path = resolve(OUT, `t${String(target.t).padStart(6,'0')}-${target.label}.png`);
  await page.screenshot({ path });
  shots.push({ requested: target.t, real, label: target.label, path });
}

// also check the actual reduced-motion branch (checkbox, not context option)
await page.check('#reducedToggle');
await page.click('#replay');
const rNavStart = Date.now();
const rWait = STOP3 + 500 - (Date.now() - rNavStart);
if (rWait > 0) await page.waitForTimeout(rWait);
const reducedPath = resolve(OUT, 'reduced-motion-stop3.png');
await page.screenshot({ path: reducedPath });
shots.push({ requested: 'reduced', real: Date.now()-rNavStart, label: 'reduced-motion-stop3', path: reducedPath });

await browser.close();
writeFileSync(resolve(OUT, 'index.json'), JSON.stringify(shots, null, 2));
console.log(OUT);
for (const s of shots) console.log(`requested=${s.requested} real=${s.real}  ${s.label}  ${s.path}`);
