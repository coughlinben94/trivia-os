#!/usr/bin/env node
// One-off targeted spot-check, supplementary to visual-audit.mjs's generic
// sampler — this file's new sub-beats (touchdown, debris, drone launch/
// hover/return) all share the single 'gasHold' phaseLabel, so the generic
// phase-change-driven dense-sampling window can't target them specifically.
// Real-time polling, same self-correcting-per-iteration technique as
// visual-audit.mjs (never a running tally), targeting exact known timestamps.
import { chromium } from 'playwright';
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = dirname(fileURLToPath(import.meta.url));
const exportLine = execSync(`"${HERE}/ensure-xdamage-stub.sh"`, { encoding: 'utf8' }).trim();
const m = exportLine.match(/LD_LIBRARY_PATH="([^$"]+)/);
if (m) process.env.LD_LIBRARY_PATH = `${m[1]}${process.env.LD_LIBRARY_PATH?':'+process.env.LD_LIBRARY_PATH:''}`;

const FILE = resolve(HERE, '..', 'space-road-trip-v5.html');
const OUT = resolve(HERE, '..', '.audit-shots', `spot-check-${Date.now()}`);
mkdirSync(OUT, { recursive: true });

// Retargeted 2026-07-22 for the v4 camera-POV rework — same absolute
// timestamps as the v3 run (gasHold's own start time and every derived
// sub-beat constant are unchanged by this pass), only the labels updated to
// reflect what's actually being checked now (camera push-in, not ship flight).
const targets = [
  { t: 21300, label: 'camera-mid-push' },
  { t: 22600, label: 'camera-near-settle' },
  { t: 24100, label: 'touchdown-jolt-flare' },
  { t: 24500, label: 'debris-settling' },
  { t: 26000, label: 'drone-launched' },
  { t: 26900, label: 'drone-hover-delivery' },
  { t: 27900, label: 'drone-returning' },
  { t: 30000, label: 'settled-idle' },
];

const browser = await chromium.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
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
await browser.close();
writeFileSync(resolve(OUT, 'index.json'), JSON.stringify(shots, null, 2));
console.log(OUT);
for (const s of shots) console.log(`requested=${s.requested} real=${s.real}  ${s.label}  ${s.path}`);
