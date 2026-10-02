// REAL-GPU, REAL-CLOCK recording of the v4 haunted route (wander mode). Headless Chromium's default renderer is
// SwiftShader (software, 5-9 fps): never judge smoothness from it. This launches with Metal ANGLE + GPU raster.
//
//   node concepts/v4/record.mjs --seed 7 --out <dir> [--walks 12] [--wait 1200] [--url <page>]
//
// Writes <dir>/video/*.webm (1280x720), <dir>/events.json: per-quicken {k, kind, t0, T, peakAnims, peakMpx},
// u(t) samples (arc metres vs ms since page creation) and rAF frame gaps (test harness only; the page has no rAF).
// Then run concepts/v4/analyze.py <dir> to cut frames and diff them.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1] }
const SEED = opt('--seed', '7'), OUT = path.resolve(opt('--out', 'v4rec')), WALKS = +opt('--walks', '12'), WAIT = +opt('--wait', '1200')
const base = opt('--url', pathToFileURL(path.join(ROOT, 'concepts/haunted-forest-route-v4.html')).href)
const URL = `${base}?seed=${SEED}&bare${args.includes('--noq') ? '&noq' : ''}`
export const GPU_ARGS = ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--force-gpu-mem-available-mb=4096']

fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ args: GPU_ARGS })
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, recordVideo: { dir: path.join(OUT, 'video'), size: { width: 1280, height: 720 } } })
await ctx.addInitScript(() => {
  window.__fd = []; let last = 0
  const f = t => { if (last) window.__fd.push(+(t - last).toFixed(2)); last = t; requestAnimationFrame(f) }; requestAnimationFrame(f)
})
const T0 = Date.now()
const page = await ctx.newPage()
const errors = []; page.on('pageerror', e => errors.push(e.message))
await page.goto(URL); await page.waitForFunction(() => window.__route)
// live layer budget, measured from the DOM: elements + their own animated sub-layers, area at drawn size
const probe = () => page.evaluate(() => {
  const st = window.__route.stats(); let px = 0
  for (const el of document.querySelectorAll('#world > *, #ground > *')) { px += el.offsetWidth * el.offsetHeight + [...el.querySelectorAll(':scope > .ly')].reduce((s, l) => s + l.offsetWidth * l.offsetHeight, 0) }
  return { anims: st.anims, mpx: +(px / 1e6).toFixed(1), u: st.u, el: st.elements }
})
const us = [], walks = []
const sample = async () => { const s = await probe(); us.push([Date.now() - T0, s.u]); return s }
const idle = async ms => { const end = Date.now() + ms; let pk = { anims: 0, mpx: 0 }; while (Date.now() < end) { const s = await sample(); pk = { anims: Math.max(pk.anims, s.anims), mpx: Math.max(pk.mpx, s.mpx) }; await page.waitForTimeout(150) } return pk }
await idle(3000)
const route = await page.evaluate(() => ({ route: window.__route.route.map(r => r.kind), S: window.__route.S, L: window.__route.L, interiors: window.__route.interiors || null }))
for (let i = 0; i < WALKS; i++) {
  const from = await page.evaluate(() => window.__route.station), t0 = Date.now() - T0
  const T = await page.evaluate(() => window.__route.advance())
  const pk = await idle(T + WAIT)
  const to = (from + 1) % 13
  walks.push({ from, to, kind: route.route[to], exit: route.route[from] === 'barn' || route.route[from] === 'house', t0, T, peakAnims: pk.anims, peakMpx: pk.mpx })
  console.log(JSON.stringify(walks[walks.length - 1]))
}
const fd = await page.evaluate(() => window.__fd)
await ctx.close(); await browser.close()
const g = [...fd].sort((a, b) => a - b), q = p => g[Math.min(g.length - 1, Math.floor(p * g.length))]
const summary = { url: URL, seed: SEED, errors, frames: fd.length, gapP50: q(0.5), gapP99: q(0.99), gapMax: g[g.length - 1], over50: fd.filter(x => x > 50).length,
  peakAnims: Math.max(...walks.map(w => w.peakAnims)), peakMpx: Math.max(...walks.map(w => w.peakMpx)) }
fs.writeFileSync(path.join(OUT, 'events.json'), JSON.stringify({ ...summary, route, walks, us, fd }))
console.log(JSON.stringify(summary))
