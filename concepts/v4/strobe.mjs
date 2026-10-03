// STROBE measurement for the v4 page (the earlier spec's locked rule, measured, not changed): a layer moving faster
// than 8 px/frame at 60 Hz must have Michelson contrast <= 0.10 against what is behind it.
//   node concepts/v4/strobe.mjs --seed 7 --from 3 [--presses 1|5] [--frames 30] [--url <page>]
// Method (as scripts/forest-verify.mjs strobe, simplified for v4): fake clock + freeze(); press Next (or 5 rapid Nexts),
// run the page clock to the PEAK of the quicken's speed, then step 1/60 s for --frames frames. LAYER = every element
// under #world and #ground and every .ly sub-layer. SPEED = largest per-frame move of the four edges of its on-screen
// (viewport-clipped) box. For each layer over 8 px/frame, at its fastest frame: capture, capture with the layer
// visibility:hidden; its pixels = those that differ; Lin/Lout = mean Rec.709 luma there with/without;
// contrast = |Lin-Lout|/(Lin+Lout); < 25 changed px = invisible (skipped). Box method limit: a layer bigger than the
// frame (ground tiles, near trunks) has clipped edges that do not move, so its speed is under-read.
import { chromium } from '@playwright/test'
import { PNG } from 'pngjs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1] }
const base = opt('--url', pathToFileURL(path.join(ROOT, 'concepts/haunted-forest-route-v4.html')).href)
const NF = +opt('--frames', '30'), STEP = 1000 / 60
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--force-gpu-mem-available-mb=4096'] })
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } })
const t0 = Date.now(); await p.clock.install({ time: t0 }); await p.clock.pauseAt(t0 + 1000)
await p.goto(`${base}?seed=${opt('--seed', '7')}&bare&noq#s=${opt('--from', '3')}`); await p.waitForFunction(() => window.__route)
await p.evaluate(() => window.__route.freeze())
for (let i = 0; i < +opt('--presses', '1'); i++) { await p.evaluate(() => window.__route.advance()); await p.clock.runFor(110) }
// run to peak speed
let best = 0, bestT = 0, t = 0
for (; t < 14000; t += 100) { await p.clock.runFor(100); const v = await p.evaluate(() => window.__route.v()); if (v > best) { best = v; bestT = t } else if (v < best * 0.97) break }
const shot = async () => { await p.evaluate(() => window.__route.freeze()); await p.waitForTimeout(250); let a = await p.screenshot(); for (let i = 0; i < 10; i++) { await p.waitForTimeout(120); const c = await p.screenshot(); if (c.equals(a)) return PNG.sync.read(c).data; a = c } return PNG.sync.read(a).data }
const rects = []
for (let k = 0; k <= NF; k++) {
  if (k) await p.clock.runFor(STEP)
  if (args.includes('--debug') && k < 4) console.log('step', k, await p.evaluate(() => [window.__route.u(), window.__route.v(), document.querySelectorAll('#world > *').length]))
  rects.push(await p.evaluate(() => { window.__route.freeze(); const L = [...document.querySelectorAll('#world > *, #ground > *, #world .ly')]
    L.forEach((e, i) => e.dataset.sid = i)
    return L.map(e => { const r = e.getBoundingClientRect(), l = Math.max(0, r.left), t = Math.max(0, r.top), R = Math.min(1920, r.right), B = Math.min(1080, r.bottom); return R > l && B > t ? [l, t, R, B] : null }) }))
}
if (args.includes('--debug')) console.log(JSON.stringify(rects[0].slice(0, 3)), JSON.stringify(rects[1].slice(0, 3)), rects.map(r => r.length).join(','))
// layers keep their order between steps only if none mounted/retired: compare by sid within consecutive equal-length lists
const fast = []; let maxAll = 0
for (let i = 0; i < rects[0].length; i++) { let pk = 0, pf = -1
  for (let k = 1; k <= NF; k++) { if (rects[k].length !== rects[k - 1].length) continue; const a = rects[k - 1][i], c = rects[k][i]; if (!a || !c) continue
    const s = Math.max(...a.map((v, j) => Math.abs(v - c[j]))); if (s > pk) { pk = s; pf = k } }
  maxAll = Math.max(maxAll, pk); if (pk > 8) fast.push({ sid: i, speed: +pk.toFixed(1), k: pf }) }
// contrast at each fast layer's peak frame: rewind is not possible, so measure all at the window's last frame instead,
// using the speed of that layer (a conservative pairing: the layer's own peak frame is within the 0.5 s window)
const withF = await shot(); const rows = []
for (const f of fast) {
  const info = await p.evaluate(sid => { const e = document.querySelector(`[data-sid="${sid}"]`); if (!e) return null; e.style.visibility = 'hidden'; return (e.dataset.z || e.className) + '' }, f.sid)
  if (info === null) continue
  const wo = await shot(); await p.evaluate(sid => { document.querySelector(`[data-sid="${sid}"]`).style.visibility = '' }, f.sid)
  let n = 0, li = 0, lo = 0; const Y = (d, i) => 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2]
  for (let i = 0; i < withF.length; i += 4) { const a = Y(withF, i), c = Y(wo, i); if (Math.abs(a - c) > 1) { n++; li += a; lo += c } }
  if (n < 25) { rows.push({ ...f, what: info, n, invisible: true }); continue }
  li /= n; lo /= n; rows.push({ ...f, what: info, n, Lin: +li.toFixed(1), Lout: +lo.toFixed(1), contrast: +(Math.abs(li - lo) / (li + lo)).toFixed(3) })
}
const vis = rows.filter(r => !r.invisible), bad = vis.filter(r => r.contrast > 0.1)
console.log(JSON.stringify({ seed: opt('--seed', '7'), from: opt('--from', '3'), presses: +opt('--presses', '1'), peakV: +best.toFixed(2), layers: rects[0].length, overSpeed: fast.length, measured: vis.length,
  maxSpeed: +maxAll.toFixed(1), overContrast: bad.length, worst: bad.sort((a, c) => c.contrast - a.contrast).slice(0, 6), worstByContrast: vis.sort((a, c) => c.contrast - a.contrast).slice(0, 3) }))
await b.close()
