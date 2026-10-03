// Frozen-time frame grabber for diagnosing one moment (Playwright fake clock + window.__route.freeze()).
//   node concepts/v4/grab.mjs --seed 7 --from 1 --u0 17.6 --u1 18.4 --step 0.04 --out <dir> [--advance] [--url <page>] [--color]
// Loads at station --from, (optionally presses Next at once), runs the page clock until the arc reaches u0, then grabs a
// frame every --step metres of arc until u1. Writes <dir>/f<u>.png and <dir>/meta.json (u, live elements per frame).
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1] }
const OUT = path.resolve(opt('--out', 'v4grab')), u0 = +opt('--u0'), u1 = +opt('--u1'), step = +opt('--step', '0.05')
const base = opt('--url', pathToFileURL(path.join(ROOT, 'concepts/haunted-forest-route-v4.html')).href)
fs.mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--force-gpu-mem-available-mb=4096'] })
const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } }), p = await ctx.newPage()
const t0 = Date.now(); await p.clock.install({ time: t0 }); await p.clock.pauseAt(t0 + 1000)
await p.goto(`${base}?seed=${opt('--seed', '7')}&bare&noq#s=${opt('--from', '0')}`); await p.waitForFunction(() => window.__route)
await p.evaluate(() => window.__route.freeze())   // stay frozen: the page clock is then performance.now (faked), never the timeline
if (args.includes('--advance')) await p.evaluate(() => window.__route.advance())
const U = () => p.evaluate(() => window.__route.u())
while (await U() < u0 - 0.002) { const u = await U(), v = await p.evaluate(() => window.__route.v()) || 0.42; await p.clock.runFor(Math.max(5, Math.min(100, (u0 - u) / v * 1000))) }
const meta = []
for (let target = u0; target <= u1 + 1e-9; target += step) {
  while (await U() < target - 0.002) { const u = await U(), v = await p.evaluate(() => window.__route.v()) || 0.42; await p.clock.runFor(Math.max(1, Math.min(100, Math.round((target - u) / v * 1000)))) }
  await p.evaluate(() => window.__route.freeze()); await p.waitForTimeout(400)
  let prev = await p.screenshot(); for (let i = 0; i < 8; i++) { await p.waitForTimeout(150); const c = await p.screenshot(); if (c.equals(prev)) break; prev = c }
  const u = await U(); const name = `f${u.toFixed(3)}.png`; fs.writeFileSync(path.join(OUT, name), prev)
  meta.push({ name, u, live: await p.evaluate(() => [...window.__route.internals.LIVE.keys()]) })
}
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta)); await b.close(); console.log(meta.length, 'frames')
