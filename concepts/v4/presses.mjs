// Behaviour checks for the v4 page (real clock, GPU flags): presses never dropped, Back retargets, reduced motion
// agrees, ?bare letterboxes at any window size, bad seeds warn once.   node concepts/v4/presses.mjs [--shots <dir>]
import { chromium } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const PAGE = pathToFileURL(path.join(ROOT, 'concepts/haunted-forest-route-v4.html')).href
const args = process.argv.slice(2), shots = args.includes('--shots') ? args[args.indexOf('--shots') + 1] : null
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--force-gpu-mem-available-mb=4096'] })
let fails = 0; const check = (ok, msg) => { console.log((ok ? 'PASS ' : 'FAIL ') + msg); if (!ok) fails++ }
const open = async (q, vp = { width: 1920, height: 1080 }) => {
  const ctx = await b.newContext({ viewport: vp }); const p = await ctx.newPage(); p.warns = []
  p.on('console', m => { if (m.type() === 'warning') p.warns.push(m.text()) }); p.on('pageerror', e => p.warns.push('ERR ' + e.message))
  await p.goto(PAGE + q); await p.waitForFunction(() => window.__route); return p
}
const R = (p, f, a) => p.evaluate(f, a)
// 1. 30 Next presses in 3 s: goal = start + 30, and the walk arrives there
for (const rm of [false, true]) {
  const p = await open('?seed=7&bare&noq')
  if (rm) await p.evaluate(() => { const c = document.getElementById('cRm'); c.checked = true; c.dispatchEvent(new Event('change')) })
  const s0 = await R(p, () => window.__route.station)
  for (let i = 0; i < 30; i++) { await R(p, () => window.__route.advance()); await p.waitForTimeout(100) }
  const goal = await R(p, () => window.__route.goal)
  check(goal === (s0 + 30) % 13, `${rm ? 'reduced motion' : 'wander'}: 30 presses in 3 s from station ${s0} -> goal ${goal} (want ${(s0 + 30) % 13})`)
  await p.waitForTimeout(rm ? 1500 : 14000)
  const st = await R(p, () => window.__route.station)
  check(st === (s0 + 30) % 13, `${rm ? 'reduced motion' : 'wander'}: arrived at station ${st}`)
  await p.context().close()
}
// 2. Back mid-quicken: target one earlier, motion continues (no cut); Back with no pending press = covered cut
{
  const p = await open('?seed=7&bare&noq'); const s0 = await R(p, () => window.__route.station)
  await R(p, () => { window.__route.advance(); window.__route.advance() }); await p.waitForTimeout(500)
  await R(p, () => window.__route.back())
  check(await R(p, () => window.__route.goal) === (s0 + 1) % 13, `Next,Next,Back mid-walk: goal ${await R(p, () => window.__route.goal)} (want ${(s0 + 1) % 13})`)
  await p.waitForTimeout(9000)
  check(await R(p, () => window.__route.station) === (s0 + 1) % 13, `...arrived at ${await R(p, () => window.__route.station)}`)
  const before = await R(p, () => window.__route.station); await R(p, () => window.__route.back()); await p.waitForTimeout(600)
  check(await R(p, () => window.__route.station) === (before + 12) % 13, `Back at rest: covered cut to ${await R(p, () => window.__route.station)}`)
  // Back then Next within 30 ms: no stray timer keeps anything running (all animations follow the schedule speed)
  await R(p, () => { window.__route.back(); setTimeout(() => window.__route.advance(), 30) }); await p.waitForTimeout(400)
  const odd = await R(p, () => document.getElementById('stage').getAnimations({ subtree: true }).filter(a => /^(creep|idle)/.test(a.animationName || '')).length)
  check(odd === 0, `Back+Next in 30 ms: no creep/zoom animation left running (${odd})`)
  await p.context().close()
}
// 3. ?bare at other window sizes: the 16:9 frame fits inside the window, centred, no overflow
for (const [w, h] of [[1366, 768], [1440, 900], [1080, 1920], [3840, 2160], [1920, 1080]]) {
  const p = await open('?seed=7&bare', { width: w, height: h })
  const r = await R(p, () => { const f = document.getElementById('fit').getBoundingClientRect(), s = document.getElementById('stage').getBoundingClientRect(); return { fw: f.width, fh: f.height, fx: f.x, fy: f.y, sw: s.width } })
  const want = Math.min(w, h * 16 / 9)
  check(Math.abs(r.fw - want) < 2 && Math.abs(r.sw - want) < 2 && r.fx >= -1 && r.fy >= -1 && r.fx + r.fw <= w + 1 && r.fy + r.fh <= h + 1, `bare ${w}x${h}: frame ${r.fw.toFixed(0)}x${r.fh.toFixed(0)} at ${r.fx.toFixed(0)},${r.fy.toFixed(0)}, stage ${r.sw.toFixed(0)}`)
  if (shots) await p.screenshot({ path: path.join(shots, `bare-${w}x${h}.png`) })
  await p.context().close()
}
// 4. bad seeds: fall back to 1031 with exactly one warning
for (const q of ['abc', 'NaN', '', '-5', '4294967296', '1.5']) {
  const p = await open(`?seed=${q}&bare`); const seed = await R(p, () => window.__route.seed)
  check(seed === 1031 && p.warns.length === 1, `?seed=${q}: seed ${seed}, warnings ${p.warns.length}`)
  await p.context().close()
}
{ const p = await open('?seed=4294967295&bare'); check(await R(p, () => window.__route.seed) === 4294967295 && !p.warns.length, '?seed=4294967295 accepted silently'); await p.context().close() }
await b.close(); console.log(fails ? `${fails} FAILED` : 'all passed'); process.exit(fails ? 1 : 0)
