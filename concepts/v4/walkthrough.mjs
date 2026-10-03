// REAL-GPU, REAL-CLOCK walkthrough of the v4 route with instrumentation (test harness only: the page has no rAF).
//
//   node concepts/v4/walkthrough.mjs --seed 7 --mode next --out <dir> [--laps 2] [--rm] [--mem 4096] [--vp 1920x1080]
//        [--secs 900] [--novideo] [--url <page>] [--wander 0.42] [--hide]
// modes: next  = one advance() per stretch, waiting the quicken + 1.2 s, for --laps laps (13 stretches a lap)
//        idle  = no input for --secs (default: --laps laps at the wander pace)
//        press = per lap, a cycle of: Next; 5 rapid Next mid-walk; Back mid-walk; jump to station+6; Next  (repeated)
//        hide  = idle with the page hidden for 20 s then shown, then a 40 s sleep-like main-thread gap (timers + rAF
//                blocked by a busy loop), then idle (does the clock jump, stall, leave holes?)
// Writes <dir>/events.json: presses, per-frame [pageMs, u] from rAF (the arc the schedule says), rAF gaps, longtasks,
// animation-time corrections (each time the page re-sets an animation's currentTime, how far it moved, in metres),
// probes every 500 ms (anims, elements, DOM nodes, <style> count/bytes, JS heap, drawn layer area, schedule drift),
// CDP layer-tree snapshots, and <dir>/video/*.webm (1280x720). Then: python3 concepts/v4/walkthrough.py <dir>
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1] }
const has = k => args.includes(k)
const SEED = opt('--seed', '7'), MODE = opt('--mode', 'next'), LAPS = +opt('--laps', '2'), OUT = path.resolve(opt('--out', 'v4walk'))
const [VW, VH] = opt('--vp', '1920x1080').split('x').map(Number)
const base = opt('--url', pathToFileURL(path.join(ROOT, 'concepts/haunted-forest-route-v4.html')).href)
const URL = `${base}?seed=${SEED}&bare&noq${opt('--wander', null) ? '&wander=' + opt('--wander') : ''}`
const GPU = ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', `--force-gpu-mem-available-mb=${opt('--mem', '4096')}`, '--enable-precise-memory-info']

fs.rmSync(OUT, { recursive: true, force: true }); fs.mkdirSync(OUT, { recursive: true })
const browser = await chromium.launch({ args: GPU })
const ctx = await browser.newContext({ viewport: { width: VW, height: VH }, reducedMotion: has('--rm') ? 'reduce' : 'no-preference',
  })
await ctx.addInitScript(() => {
  const H = window.__h = { fr: [], lt: [], corr: [], seen: new WeakSet() }
  const f = t => { const r = window.__route; H.fr.push([+t.toFixed(2), r ? +r.u().toFixed(4) : null]); requestAnimationFrame(f) }; requestAnimationFrame(f)
  try { new PerformanceObserver(l => { for (const e of l.getEntries()) H.lt.push([+e.startTime.toFixed(1), +e.duration.toFixed(1)]) }).observe({ type: 'longtask', buffered: true }) } catch (e) {}
  // every currentTime write on a route animation: how far it moved the animation (ms of animation time = mm of arc)
  const d = Object.getOwnPropertyDescriptor(Animation.prototype, 'currentTime')
  Object.defineProperty(Animation.prototype, 'currentTime', { configurable: true, get() { return d.get.call(this) },
    set(v) { const n = this.animationName || ''; if (/^a\d/.test(n) && this.playState === 'running' && H.seen.has(this)) { const o = d.get.call(this); if (o !== null && v !== null) { const dm = v - o; if (Math.abs(dm) > 2) H.corr.push([+performance.now().toFixed(1), +dm.toFixed(1), n, +o.toFixed(0), this.playbackRate, +this.effect.getComputedTiming().duration.toFixed(0)]) } }
      H.seen.add(this); d.set.call(this, v) } })
})
const T0 = Date.now()
const page = await ctx.newPage()
const cdp = await ctx.newCDPSession(page)
// frames: CDP screencast = the compositor's own output, time-stamped (Playwright's webm encoder smears dark detail and
// showed pops that the compositor never drew). Every Nth compositor frame (120 Hz headless: 6 -> 20 fps), 1280 wide.
const CAST = !has('--novideo'), castDir = path.join(OUT, 'cast'); let casting = 0
if (CAST) { fs.mkdirSync(castDir); const cast = await ctx.newCDPSession(page)
  cast.on('Page.screencastFrame', f => { fs.writeFileSync(path.join(castDir, `${f.metadata.timestamp.toFixed(4)}.jpg`), Buffer.from(f.data, 'base64')); casting++; cast.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {}) })
  page.once('load', () => {}); globalThis.__cast = cast }
const errors = []; page.on('pageerror', e => errors.push(e.message)); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto(URL); await page.waitForFunction(() => window.__route)
if (CAST) await globalThis.__cast.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1280, maxHeight: 720, everyNthFrame: +opt('--nth', '6') })
const epochOff = await page.evaluate(() => performance.timeOrigin)   // page ms = epoch ms - timeOrigin
const pageAt = await page.evaluate(() => performance.now()), wallAt = Date.now() - T0   // page ms <-> wall ms since T0
const info = await page.evaluate(() => { const r = window.__route; return { route: r.route.map(x => x.kind + x.variant), S: r.S, L: r.L, walk: [...Array(13)].map((_, k) => r.walkDur(k)) } })
const ev = [], probes = [], layers = []
const log = async (what, extra = {}) => { const s = await page.evaluate(() => ({ pt: performance.now(), u: window.__route.u(), st: window.__route.station, goal: window.__route.goal })); ev.push({ what, ...s, ...extra }); return s }
const probe = () => page.evaluate(() => {
  const r = window.__route, st = r.stats(); let px = 0
  for (const el of document.querySelectorAll('#world > *, #ground > *')) px += el.offsetWidth * el.offsetHeight + [...el.querySelectorAll(':scope > .ly')].reduce((s, l) => s + l.offsetWidth * l.offsetHeight, 0)
  // drift: for every live element, the arc its main animation shows vs the arc the schedule says now
  let drift = 0; const u = r.u()
  for (const rec of r.internals.LIVE.values()) for (const a of rec.anims) { if (a.currentTime === null) continue; const ua = rec.ue + a.currentTime / 1000; if (a.currentTime > 0 && ua < rec.ux - 0.01) drift = Math.max(drift, Math.abs(ua - u)) }
  const sty = [...document.head.querySelectorAll('style')]
  return { pt: performance.now(), anims: st.anims, el: st.elements, u: st.u, v: st.v, nodes: document.getElementsByTagName('*').length, styles: sty.length, styleKB: Math.round(sty.reduce((s, x) => s + x.textContent.length, 0) / 1024),
    heapMB: performance.memory ? +(performance.memory.usedJSHeapSize / 1048576).toFixed(1) : null, mpx: +(px / 1e6).toFixed(2), drift: +drift.toFixed(4), life: r.internals.LIFE.size, hidden: document.hidden }
})
let probing = true
const prober = (async () => { while (probing) { try { probes.push(await probe()) } catch (e) {} await new Promise(r => setTimeout(r, 500)) } })()
// composited layers (CDP LayerTree): count and drawn area of layers that paint content
const layerSnap = async tag => {
  try {
    await cdp.send('LayerTree.enable'); const got = await new Promise(res => { const h = e => { cdp.off('LayerTree.layerTreeDidChange', h); res(e.layers || []) }; cdp.on('LayerTree.layerTreeDidChange', h); setTimeout(() => res(null), 3000) })
    await cdp.send('LayerTree.disable')
    if (got) { const draws = got.filter(l => l.drawsContent); layers.push({ tag, pt: (await page.evaluate(() => performance.now())), total: got.length, drawing: draws.length, mpx: +(draws.reduce((s, l) => s + l.width * l.height, 0) / 1e6).toFixed(2), maxLayer: draws.reduce((m, l) => Math.max(m, l.width * l.height), 0) }) }
  } catch (e) { layers.push({ tag, err: e.message }) }
}
const wait = ms => page.waitForTimeout(ms)
const R = (f, a) => page.evaluate(f, a)
const lapSecs = info.L / (+opt('--wander', '0.42'))
await wait(2500); await log('start')
if (MODE === 'next') {
  for (let i = 0; i < 13 * LAPS; i++) {
    const s = await log('next'); const T = await R(() => window.__route.advance()); ev[ev.length - 1].T = T
    if (i % 5 === 2) { await wait(T / 2); await layerSnap('midwalk' + i); await wait(T / 2 + 1200) } else await wait(T + 1200)
  }
} else if (MODE === 'idle') {
  const secs = +opt('--secs', String(Math.ceil(lapSecs * LAPS))), end = Date.now() + secs * 1000; let n = 0
  while (Date.now() < end) { await wait(Math.min(30000, end - Date.now())); await layerSnap('idle' + n++); await log('mark') }
} else if (MODE === 'press') {
  for (let lap = 0; lap < LAPS; lap++) for (let c = 0; c < 4; c++) {
    let s = await log('next'); let T = await R(() => window.__route.advance()); await wait(1800)
    await log('next5'); for (let i = 0; i < 5; i++) { await R(() => window.__route.advance()); await wait(110) }
    await wait(1500); await layerSnap('rapid' + lap + c)
    await page.waitForFunction(() => window.__route.goal === null || window.__route.v() < 0.5, null, { timeout: 30000, polling: 200 }).catch(() => {}); await wait(1500)
    await log('next'); await R(() => window.__route.advance()); await wait(1500); await log('back'); await R(() => window.__route.back())
    await page.waitForFunction(() => window.__route.v() < 0.45, null, { timeout: 30000, polling: 200 }).catch(() => {}); await wait(1200)
    s = await log('jump'); await R(k => window.__route.jump(k), (s.st + 6) % 13); await wait(3000)
    await log('next'); T = await R(() => window.__route.advance()); await wait(T + 1200)
  }
} else if (MODE === 'hide') {
  await wait(5000); await log('hide')
  // headless never hides a tab: emulate it = document.hidden true + visibilitychange, and the page FROZEN (no timers,
  // no frames) for 20 s, then shown again. Then a 15 s main-thread stall (compositor keeps animating through it).
  const vis = h => R(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => h ? 'hidden' : 'visible' }); document.dispatchEvent(new Event('visibilitychange')) }, h)
  const uh = (await vis(true), await R(() => window.__route.u()))
  await cdp.send('Page.setWebLifecycleState', { state: 'frozen' }); await wait(20000); await cdp.send('Page.setWebLifecycleState', { state: 'active' })
  await vis(false); const us = await R(() => window.__route.u()); await log('shown', { uHidden: uh, uShown: us })
  await wait(8000); await log('gap'); await R(() => { const e = performance.now() + 15000; while (performance.now() < e); }); await log('gapEnd')
  await wait(15000); await log('end')
}
probing = false; await prober; await layerSnap('end'); if (CAST) await globalThis.__cast.send('Page.stopScreencast').catch(() => {})
const h = await R(() => ({ fr: window.__h.fr, lt: window.__h.lt, corr: window.__h.corr }))
await ctx.close(); await browser.close()
const gaps = []; for (let i = 1; i < h.fr.length; i++) gaps.push(h.fr[i][0] - h.fr[i - 1][0])
const g = [...gaps].sort((a, b) => a - b), q = p => +g[Math.min(g.length - 1, Math.floor(p * g.length))].toFixed(1)
const P = k => probes.map(p => p[k]).filter(x => x !== null && x !== undefined)
const summary = { url: URL, mode: MODE, rm: has('--rm'), mem: opt('--mem', '4096'), seed: SEED, errors, secs: +((Date.now() - T0) / 1000).toFixed(0), frames: gaps.length,
  gap: { p50: q(0.5), p95: q(0.95), p99: q(0.99), max: +g[g.length - 1].toFixed(1), over25: gaps.filter(x => x > 25).length, over33: gaps.filter(x => x > 33.4).length },
  longtasks: { n: h.lt.length, total: Math.round(h.lt.reduce((s, x) => s + x[1], 0)), max: Math.max(0, ...h.lt.map(x => x[1])) },
  corr: { n: h.corr.length, maxM: +(Math.max(0, ...h.corr.map(c => Math.abs(c[1]))) / 1000).toFixed(3) },
  peak: { anims: Math.max(...P('anims')), el: Math.max(...P('el')), mpx: Math.max(...P('mpx')), drift: Math.max(...P('drift')) },
  growth: ['nodes', 'styles', 'styleKB', 'heapMB', 'life'].reduce((o, k) => { const a = P(k); o[k] = [a[0], Math.max(...a), a[a.length - 1]]; return o }, {}),
  layers: layers.length ? { maxDrawing: Math.max(...layers.map(l => l.drawing || 0)), maxMpx: Math.max(...layers.map(l => l.mpx || 0)) } : null }
fs.writeFileSync(path.join(OUT, 'events.json'), JSON.stringify({ summary, info, pageAt, wallAt, epochOff, castFrames: casting, ev, probes, layers, fr: h.fr, lt: h.lt, corr: h.corr }))
console.log(JSON.stringify(summary))
