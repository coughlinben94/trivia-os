// Forest verifier (Halloween forest spec §3 gates 2, 3, 3b, 5, 6-subset, 7-core; plan 3b-4, metric-free part).
//   node scripts/forest-verify.mjs probe-api | safebox | census | perf | covered-cut | all | selftest
// Prints PASS / FAIL / INFO lines with measured values; exits 1 on any FAIL, 3 on POISONED (the sampler
// is not deterministic, so no probe result can be trusted), 2 on usage/infra error.
//
// WHAT PAGE: /ambient?ring=1&world=haunted-october (AmbientAudit mounts ForestAmbient at 1920x1080).
// The REAL /display route needs a live Supabase show and is the later gate 9 (and gate 6's "measured on
// real /display with a slide transition running"); nothing here measures /display.
//
// NOT HERE (deliberately): gate 6 STROBE, gate 4 FIDELITY vs v3 (metric + tolerance are Ben's,
// STAYS-HUMAN), the covered-cut pass/fail tolerance (printed as PROPOSED, PROVISIONAL), gate 7's
// state checks other than the covered cut.
//
// SERVER: starts its own `npx vite --strictPort --port 5206` and kills it on exit, error, or signal.
// Bundled Chromium only (Playwright's own build; never the user's Chrome).
//
// FROZEN-TIME METHOD (pinned): window.__forest.freeze(t) pauses EVERY animation and transition under
// .fs-stage (getAnimations({subtree:true})) and sets currentTime = t ms on each. Page timers
// (setTimeout: walk end, cut end, 30 ms creep start, 40 s idle) run on Playwright's fake clock, paused
// after load and advanced only by page.clock.runFor(), so a capture can never race a timer.
// Canonical states (all subcommands except perf, which needs the real clock for performance.now):
//   rest(k): freeze(0); jumpTo(k); runFor(100)  -> rest frame, 40 s creep transition started
//   freeze(0) before every jumpTo/turn: every creep transition then starts from exactly scale(1)
//     (a jump otherwise eases the creep back from wherever it was: history, not station content).
//   walk A>B at fraction f: rest(A); freeze(0); turn(); freeze(f * walk.durMs)
// Rest frames for safebox/probe-api are frozen at REST_T = 1000 ms of rest time.
import { chromium } from '@playwright/test'
import { PNG } from 'pngjs'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { SAFE_BOX, lumaStats, contrastRatio, easeInOut, composite, diffStats, quantile } from '../client/src/lib/forestVerifyMath.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 5206, BASE = `http://localhost:${PORT}`
const URL_PATH = '/ambient?ring=1&world=haunted-october'
const W = 1920, H = 1080, NS = 13, REST_T = 1000
const MEAN_CAP = 34, P995_CAP = 68, P995_HEADROOM = 62 // spec §2.5, LOCKED
const CONTRAST_MIN = 7 // spec gate 5
const FRACS = [0.25, 0.5, 0.75]
const API_KEYS = ['freeze', 'jumpTo', 'seed', 'setSeed', 'station', 'turn', 'unfreeze']

let fails = 0, poisoned = false
const out = (tag, msg) => { if (tag === 'FAIL') fails++; console.log(`${tag.padEnd(5)} ${msg}`) }
const f1 = n => n.toFixed(1), f2 = n => n.toFixed(2)

// ---------------------------------------------------------------- server + browser
let server = null, browser = null
function killServer() {
  if (server && server.exitCode == null) { try { process.kill(-server.pid, 'SIGTERM') } catch { /* gone */ } }
  server = null
}
process.on('exit', killServer)
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { killServer(); process.exit(130) })

async function startServer() {
  server = spawn('npx', ['vite', '--strictPort', '--port', String(PORT)], { cwd: ROOT, detached: true, stdio: ['ignore', 'pipe', 'pipe'] })
  let log = ''
  server.stdout.on('data', d => { log += d }); server.stderr.on('data', d => { log += d })
  for (let i = 0; i < 150; i++) {
    if (server.exitCode != null) throw new Error(`vite exited (${server.exitCode}): ${log.slice(-400)}`)
    try { const r = await fetch(BASE + '/'); if (r.ok) return } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error('vite did not come up on ' + PORT)
}

async function openPage({ fakeClock = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.errors = []
  page.on('pageerror', e => page.errors.push(e.message))
  if (fakeClock) { const t0 = Date.now(); await page.clock.install({ time: t0 }); await page.clock.pauseAt(t0 + 1000) }
  await page.goto(BASE + URL_PATH, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__forest && document.querySelector('.fs-stage'), null, { polling: 50, timeout: 20000 })
  await page.evaluate(() => document.fonts.ready)
  // hide AmbientAudit's Turn/Auto-play overlay so only the world is measured
  await page.evaluate(() => document.querySelectorAll('button').forEach(b => { b.parentElement.style.visibility = 'hidden' }))
  page.durMs = await page.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.fs-stage')).getPropertyValue('--walk')))
  if (!(page.durMs > 0)) throw new Error('could not read walk duration (--walk) from .fs-stage')
  return page
}

// ---------------------------------------------------------------- page helpers
const scene = page => page.evaluate(() => document.querySelector('.fs-stage').dataset.scene)
async function rest(page, k, { creep = true } = {}) {
  await page.evaluate(k => { window.__forest.freeze(0); window.__forest.jumpTo(k) }, k)
  if (creep) await page.clock.runFor(100)
}
const freeze = (page, t) => page.evaluate(t => window.__forest.freeze(t), t)
// STABLE capture: a screenshot taken right after freeze() can show a stale composited frame (measured
// 2026-10-01: one walk frame read p99.5 64.5, the same frozen frame 500 ms later 50.2, 692k px apart).
// So every capture is repeated until two consecutive PNGs are byte-identical; never stable = POISONED.
let unstable = 0
async function shotPng(page) {
  let prev = await page.screenshot({ type: 'png', caret: 'hide' })
  for (let i = 0; i < 8; i++) {
    await page.waitForTimeout(150)
    const cur = await page.screenshot({ type: 'png', caret: 'hide' })
    if (cur.equals(prev)) return cur
    unstable++; prev = cur
  }
  poisoned = true
  throw new Error('POISONED: frozen frame never produced two identical captures in a row')
}
const decode = buf => { const p = PNG.sync.read(buf); if (p.width !== W || p.height !== H) throw new Error(`capture ${p.width}x${p.height}`); return p.data }
async function shot(page) { return decode(await shotPng(page)) }
async function restShot(page, k, t = REST_T) { await rest(page, k); await freeze(page, t); return shot(page) }
async function walkShot(page, a, frac) {
  await rest(page, a)
  await page.evaluate(() => { window.__forest.freeze(0); window.__forest.turn() })
  const want = `walk:${a}>${(a + 1) % NS}`
  await freeze(page, frac * page.durMs)
  const sc = await scene(page)
  if (sc !== want) throw new Error(`expected scene ${want}, got ${sc}`)
  return shot(page)
}

// ---------------------------------------------------------------- 1. probe-api (gates 2, 3)
async function probeApi() {
  console.log('== probe-api (gates 2/3)')
  const page = await openPage()
  const keys = await page.evaluate(() => Object.keys(window.__forest).sort())
  out(JSON.stringify(keys) === JSON.stringify(API_KEYS) ? 'PASS' : 'FAIL', `window.__forest keys = ${keys.join(',')} (want exactly ${API_KEYS.join(',')})`)
  const A1 = await restShot(page, 0)
  const A2 = await shot(page) // same frozen scene, nothing touched
  const self = diffStats(A1, A2)
  if (self.differing) { out('FAIL', `POISONED: two captures of the same frozen scene differ (${self.differing} px, max ${self.max})`); poisoned = true; return page.context().close() }
  out('PASS', `sampler self-check: same frozen scene captured twice, ${self.differing} px differ`)
  const B = await restShot(page, 1)
  const A3 = await restShot(page, 0)
  const a = diffStats(A1, A3), b = diffStats(A1, B)
  out(a.differing === 0 ? 'PASS' : 'FAIL', `(a) station 0 twice at t=${REST_T} ms: ${a.differing} px differ (max ${a.max}) [want 0]`)
  out(b.differing > 0 ? 'PASS' : 'FAIL', `(b) station 0 vs 1: ${b.differing} px differ (max ${b.max}) [want > 0]`)
  for (let k = 1; k < NS; k++) { // every k vs k+1, not only 0/1
    const x = await restShot(page, k), y = await restShot(page, (k + 1) % NS)
    const d = diffStats(x, y)
    out(d.differing > 0 ? 'PASS' : 'FAIL', `(b) station ${k} vs ${(k + 1) % NS}: ${d.differing} px differ`)
  }
  const seed = await page.evaluate(() => window.__forest.seed)
  await page.evaluate(s => window.__forest.setSeed(s + 1), seed)
  const C = await restShot(page, 0)
  await page.evaluate(s => window.__forest.setSeed(s), seed)
  const A4 = await restShot(page, 0)
  const c = diffStats(A1, C), back = diffStats(A1, A4)
  out(c.differing > 0 ? 'PASS' : 'FAIL', `(c) setSeed(${seed}+1) vs seed ${seed}, station 0: ${c.differing} px differ [want > 0]`)
  out(back.differing === 0 ? 'PASS' : 'FAIL', `(c') setSeed back to ${seed} reproduces the original: ${back.differing} px differ [want 0]`)
  await rest(page, 0)
  for (let i = 0; i < NS; i++) {
    await page.evaluate(() => { window.__forest.freeze(0); window.__forest.turn() })
    await page.clock.runFor(page.durMs + 100) // the walk timer fires: rest render + creep start
  }
  const st = await page.evaluate(() => window.__forest.station), sc = await scene(page)
  await freeze(page, REST_T)
  const D = await shot(page)
  const d = diffStats(A1, D)
  out(st === 0 && sc === 'rest:0' ? 'PASS' : 'FAIL', `(d) after 13 turn()s: station=${st} scene=${sc}`)
  out(d.differing === 0 ? 'PASS' : 'FAIL', `(d) station 0 after 13 finished walks vs fresh station 0 at t=${REST_T} ms: ${d.differing} px differ (max ${d.max}) [want 0]`)
  if (page.errors.length) out('FAIL', `page errors: ${page.errors.slice(0, 3).join(' | ')}`)
  await page.context().close()
}

// ---------------------------------------------------------------- 2. safebox + contrast (gate 5)
function safeboxCheck(rgba, label, box = SAFE_BOX) {
  let s
  try { s = lumaStats(rgba, W, H, box) } catch (e) { return { pass: false, line: `${label}: ${e.message}` } }
  const pass = s.mean <= MEAN_CAP && s.p995 <= P995_CAP
  return { pass, s, line: `${label}: mean ${f1(s.mean)} p99.5 ${f1(s.p995)}${s.p995 > P995_HEADROOM && pass ? ' [HEADROOM: above 62]' : ''}` }
}
function themeTextColor() {
  const src = fs.readFileSync(path.join(ROOT, 'client/src/themes/index.js'), 'utf8')
  const i = src.indexOf("id: 'haunted-october'"); if (i < 0) throw new Error('haunted-october theme not found')
  const m = /text:\s*'(#[0-9a-fA-F]{6})'/.exec(src.slice(i, i + 2000)); if (!m) throw new Error('haunted-october colors.text not found')
  return m[1]
}
function contrastCheck(textHex, p995, label) {
  const r = contrastRatio(textHex, p995)
  return { pass: r >= CONTRAST_MIN, r, line: `${label}: text ${textHex} vs safe-box p99.5 luma ${f1(p995)} (as a grey) = ${f2(r)}:1 [want >= ${CONTRAST_MIN}:1]` }
}

async function safebox() {
  console.log(`== safebox (gate 5; luma = 0.2126R+0.7152G+0.0722B on sRGB bytes; box L20% T28% W60% H44%; caps mean<=${MEAN_CAP} p99.5<=${P995_CAP}, headroom ${P995_HEADROOM})`)
  const page = await openPage()
  const rows = []
  for (let k = 0; k < NS; k++) rows.push(safeboxCheck(await restShot(page, k), `rest ${k} @${REST_T}ms`))
  for (let k = 0; k < NS; k++) for (const f of FRACS) rows.push(safeboxCheck(await walkShot(page, k, f), `walk ${k}>${(k + 1) % NS} @${f * 100}%`))
  for (const r of rows) out(r.pass ? 'PASS' : 'FAIL', r.line)
  const ok = rows.filter(r => r.s)
  const worst = ok.reduce((a, r) => (!a || r.s.p995 > a.s.p995 ? r : a), null)
  const worstMean = ok.reduce((a, r) => (!a || r.s.mean > a.s.mean ? r : a), null)
  const head = ok.filter(r => r.pass && r.s.p995 > P995_HEADROOM)
  out('INFO', `${rows.length} frames; worst p99.5 frame = ${worst.line}; worst mean frame = ${worstMean.line}`)
  out('INFO', `frames between ${P995_HEADROOM} and ${P995_CAP} (pass, listed): ${head.length ? head.map(r => r.line.split(':')[0]).join('; ') : 'none'}`)
  const c = contrastCheck(themeTextColor(), worst.s.p995, 'contrast (worst frame)')
  out(c.pass ? 'PASS' : 'FAIL', c.line)
  if (page.errors.length) out('FAIL', `page errors: ${page.errors.slice(0, 3).join(' | ')}`)
  await page.context().close()
}

// ---------------------------------------------------------------- 3. census (spec 2.3)
// In-page: every animation/transition under .fs-stage, classified. Pure data out; judged in Node.
function censusRaw() {
  const stage = document.querySelector('.fs-stage'), rig = stage.querySelector('.fs-rig')
  const vis = el => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.right > 0 && r.bottom > 0 && r.left < innerWidth && r.top < innerHeight }
  return stage.getAnimations({ subtree: true }).map(a => {
    const e = a.effect, tg = e.target, tm = e.getTiming()
    const kfs = e.getKeyframes()
    const props = [...new Set(kfs.flatMap(k => Object.keys(k).filter(p => !['offset', 'computedOffset', 'easing', 'composite'].includes(p))))]
    const op = kfs.map(k => k.opacity).filter(v => v != null).map(Number)
    return {
      name: a.transitionProperty ? `transition:${a.transitionProperty}` : a.animationName,
      cls: (tg.className && tg.className.baseVal === undefined ? tg.className : '').toString().trim(),
      isRig: tg === rig, iterations: tm.iterations, duration: tm.duration, props,
      opMin: op.length ? Math.min(...op) : null, opMax: op.length ? Math.max(...op) : null, onScreen: vis(tg),
    }
  })
}
// expectIdle: false at rest start (must be absent), true after 40 s (must be present and the rig's only one)
function judgeCensus(list, expectIdle) {
  const bad = [], counts = {}
  for (const a of list) counts[a.name] = (counts[a.name] || 0) + 1
  for (const a of list) {
    const nonTO = a.props.filter(p => p !== 'transform' && p !== 'opacity')
    if (nonTO.length) bad.push(`${a.name} on .${a.cls} animates ${nonTO.join(',')}`)
    if (a.name === 'fs-drift') { if (a.props.join() !== 'transform') bad.push(`drift animates ${a.props}`) }
    else if (a.name === 'fs-flick') {
      const amp = a.opMax - a.opMin
      if (!(amp <= 0.12 + 1e-9)) bad.push(`flicker amplitude ${f2(amp)} > 0.12`)
      if (!(a.duration > 1000 / 3)) bad.push(`flicker period ${a.duration} ms <= 333 ms`)
    } else if (a.name === 'transition:transform' && /\bcreep\b/.test(a.cls)) {
      if (a.duration !== 40000) bad.push(`creep transition ${a.duration} ms, want 40000`)
    } else if (a.name === 'fs-idle' && a.isRig) {
      if (!expectIdle) bad.push('idle sway running at rest start (must wait 40 s)')
    } else bad.push(`unexpected: ${a.name} on .${a.cls || '?'} iterations=${a.iterations} ${a.duration} ms`)
  }
  const flickOn = list.filter(a => a.name === 'fs-flick' && a.onScreen).length
  if (flickOn > 1) bad.push(`${flickOn} lantern flickers on screen at once (max 1)`)
  const creep = list.filter(a => a.name === 'transition:transform' && /\bcreep\b/.test(a.cls)).length
  if (creep !== 2) bad.push(`creep transitions ${creep}, want 2 (one per .creep layer)`)
  const rigA = list.filter(a => a.isRig)
  if (expectIdle && !(rigA.length === 1 && rigA[0].name === 'fs-idle')) bad.push(`after 40 s the rig runs [${rigA.map(a => a.name).join(',') || 'nothing'}], want exactly fs-idle`)
  return { pass: !bad.length, bad, counts, flickOn }
}
const fmtCounts = c => Object.entries(c).map(([k, v]) => `${k}x${v}`).join(' ')

async function censusAt(page, k) {
  await rest(page, k)
  // a jump out of the previous station's idle sway starts a 700 ms rig settle transition (CSS time,
  // real clock), and rest()'s freeze(0) would hold it paused forever: unfreeze and let that transient
  // finish so the census sees the rest state, not the jump
  await page.evaluate(() => window.__forest.unfreeze())
  for (let i = 0; i < 50; i++) { // up to 5 s real time
    const busy = await page.evaluate(() => document.querySelector('.fs-rig').getAnimations().length)
    if (!busy) break
    await page.waitForTimeout(100)
  }
  const r0 = judgeCensus(await page.evaluate(censusRaw), false)
  await page.clock.runFor(40000)
  const r1 = judgeCensus(await page.evaluate(censusRaw), true)
  return { r0, r1 }
}

async function census() {
  console.log('== census (spec 2.3: allowed at rest = fs-drift(transform), <=1 on-screen fs-flick (opacity, amp<=12%, period>333ms), 2 creep transitions (40 s), fs-idle on the rig only after 40 s)')
  const page = await openPage()
  let driftMissing = 0
  for (let k = 0; k < NS; k++) {
    const { r0, r1 } = await censusAt(page, k)
    if (!r0.counts['fs-drift']) driftMissing++
    out(r0.pass ? 'PASS' : 'FAIL', `station ${k} rest start: ${fmtCounts(r0.counts)} (flicker on screen ${r0.flickOn})${r0.bad.length ? ' :: ' + r0.bad.join('; ') : ''}`)
    out(r1.pass ? 'PASS' : 'FAIL', `station ${k} +40 s: ${fmtCounts(r1.counts)}${r1.bad.length ? ' :: ' + r1.bad.join('; ') : ''}`)
    // walk keyframes (spec 2.3c): transform/opacity only
    await rest(page, k)
    await page.evaluate(() => { window.__forest.freeze(0); window.__forest.turn() })
    const w = await page.evaluate(censusRaw)
    const nonTO = [...new Set(w.flatMap(a => a.props.filter(p => p !== 'transform' && p !== 'opacity').map(p => `${a.name}:${p}`)))]
    out(nonTO.length ? 'FAIL' : 'PASS', `walk ${k}>${(k + 1) % NS}: ${w.length} animations, non transform/opacity properties: ${nonTO.join(',') || 'none'}`)
  }
  out('INFO', `stations with no fog drift at rest: ${driftMissing}/13`)
  if (page.errors.length) out('FAIL', `page errors: ${page.errors.slice(0, 3).join(' | ')}`)
  await page.context().close()
}

// ---------------------------------------------------------------- 4. perf (gate 6 subset)
async function perf() {
  console.log('== perf (gate 6 subset; AmbientAudit page, NOT real /display, NOT the real rig)')
  const files = ['client/src/worlds/forest/forestScene.js', 'client/src/components/display/ForestAmbient.jsx', 'client/src/worlds/forest/forestGen.js']
  for (const f of files) {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
    const hits = ['requestAnimationFrame', '<canvas', 'getContext', 'Math.random'].filter(p => src.includes(p))
    out(hits.length ? 'FAIL' : 'PASS', `grep ${f}: ${hits.length ? 'found ' + hits.join(',') : 'no requestAnimationFrame/<canvas/getContext/Math.random'}`)
  }
  const page = await openPage({ fakeClock: false })
  const iw = await page.evaluate(() => window.innerWidth)
  out(iw === 1920 ? 'PASS' : 'FAIL', `window.innerWidth = ${iw} (want 1920)`)
  const sync = [], flushed = [], perWalk = []
  for (let i = 0; i < 30; i++) {
    const from = i % NS
    await page.evaluate(k => window.__forest.jumpTo(k), from)
    await page.waitForTimeout(150)
    const r = await page.evaluate(() => {
      const stage = document.querySelector('.fs-stage')
      const t0 = performance.now(); window.__forest.turn(); const t1 = performance.now()
      void document.body.offsetWidth; const t2 = performance.now() // + forced style/layout of the new walk DOM
      return { js: t1 - t0, flush: t2 - t0, items: stage.querySelectorAll('.fs-world .it').length, anims: stage.getAnimations({ subtree: true }).length, scene: stage.dataset.scene }
    })
    sync.push(r.js); flushed.push(r.flush)
    if (i < NS) perWalk.push(`${from}>${(from + 1) % NS}: ${r.items} items / ${r.anims} anims`)
    await page.waitForTimeout(page.durMs + 150) // let the walk finish
  }
  out('INFO', `per walk: ${perWalk.join('; ')}`)
  out('INFO', `turn() main-thread JS (30 runs): median ${f2(quantile(sync, 0.5))} ms, p95 ${f2(quantile(sync, 0.95))} ms; with forced style+layout: median ${f2(quantile(flushed, 0.5))} ms, p95 ${f2(quantile(flushed, 0.95))} ms (target ~10 ms median is for the real rig: INFO only)`)
  if (page.errors.length) out('FAIL', `page errors: ${page.errors.slice(0, 3).join(' | ')}`)
  await page.context().close()
}

// ---------------------------------------------------------------- 5. covered-cut (gate 7 core)
const FRAME_MS = 1000 / 60, FADE = 400
async function coveredCut() {
  console.log('== covered-cut (gate 7 core: walk 0>1, retarget at +1000 ms, retarget again at +200 ms)')
  const page = await openPage()
  // Destination rest frames as the cut shows them: jumpTo with the creep NOT started (the cut's live
  // layer has the creep held at scale(1)), frozen at the cut's own time u. Kept as PNG, decoded on use.
  const restNoCreep = async (k, u) => { await rest(page, k, { creep: false }); await freeze(page, u); return shotPng(page) }
  const grid1 = [], grid2 = []
  for (let u = 0; u <= 200 + 1e-6; u += FRAME_MS) grid1.push(u)
  for (let u = 0; u <= FADE + 1e-6; u += FRAME_MS) grid2.push(u)
  const D1 = [], D2 = []
  for (const u of grid1) D1.push(await restNoCreep(2, u))
  for (const u of grid2) D2.push(await restNoCreep(3, u))
  const FAULT_K = 4 // 66.7 ms: between a 50 ms sampler's looks at 50 and 100 ms
  const wrongPng = await restNoCreep(7, grid2[FAULT_K])
  const reRender = diffStats(decode(D2[12]), decode(await restNoCreep(3, grid2[12])))

  // the scenario
  await rest(page, 0)
  await page.evaluate(() => { window.__forest.freeze(0); window.__forest.turn() })
  await page.clock.runFor(1000)
  await freeze(page, 1000)
  const W1000 = await shot(page) // source of cut 1: the walk frame just before it
  await page.evaluate(() => window.__forest.turn())
  let sc = await scene(page); if (sc !== 'cut:2') throw new Error(`after retarget 1 expected cut:2, got ${sc}`)
  const series1 = []
  for (let i = 0; i < grid1.length; i++) {
    await freeze(page, grid1[i])
    const a = 1 - easeInOut(grid1[i] / FADE)
    series1.push(diffStats(await shot(page), composite(W1000, decode(D1[i]), a)))
  }
  await page.clock.runFor(200)
  await freeze(page, 200)
  const S = await shot(page) // source of cut 2: the frame just before it
  await page.evaluate(() => window.__forest.turn())
  sc = await scene(page); if (sc !== 'cut:3') throw new Error(`after retarget 2 expected cut:3, got ${sc}`)
  const series2 = [], frames2 = []
  let noise = null, blankErr = null
  for (let i = 0; i < grid2.length; i++) {
    await freeze(page, grid2[i])
    const png = await shotPng(page)
    if (i === 12) noise = diffStats(decode(png), await shot(page)) // identical frame captured twice
    const exp = composite(S, decode(D2[i]), 1 - easeInOut(grid2[i] / FADE))
    series2.push(diffStats(decode(png), exp)); frames2.push(png)
    if (i === FAULT_K) { // ONE-FRAME blank fault, injected in the page at this instant only
      await page.evaluate(() => { const d = document.createElement('div'); d.id = 'fv-blank'; d.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483647'; document.body.appendChild(d) })
      blankErr = diffStats(await shot(page), exp)
      await page.evaluate(() => document.getElementById('fv-blank').remove())
    }
  }
  const wrongErr = diffStats(decode(wrongPng), composite(S, decode(D2[FAULT_K]), 1 - easeInOut(grid2[FAULT_K] / FADE)))
  await page.clock.runFor(500)
  const end = await scene(page), st = await page.evaluate(() => window.__forest.station)
  const clones = await page.evaluate(() => document.querySelectorAll('[data-forest-clone]').length)

  const fmt = s => s.map((d, i) => `${i}:${f2(d.mae)}/${d.max}`).join(' ')
  out('INFO', `cut 1 (source = walk frame @1000 ms, dest = rest 2), ${series1.length} frames, per frame MAE/max-channel: ${fmt(series1)}`)
  out('INFO', `cut 2 (source = frame before retarget, dest = rest 3), ${series2.length} frames, per frame MAE/max-channel: ${fmt(series2)}`)
  out('INFO', `cut 2 differing-pixel counts: ${series2.map(d => d.differing).join(',')}`)
  out('INFO', `noise floor (same frozen frame captured twice): MAE ${noise.mae.toFixed(4)}, max ${noise.max}, ${noise.differing} px; re-render of the same rest frame: MAE ${reRender.mae.toFixed(4)}, ${reRender.differing} px`)
  out(end === 'rest:3' && st === 3 && clones === 0 ? 'PASS' : 'FAIL', `after the fade: scene=${end} station=${st} clones=${clones} (want rest:3, 3, 0)`)
  const tol = 3 * noise.mae
  console.log(`PROPOSED tolerance = 3 x noise floor = ${tol.toFixed(4)} MAE (needs Ben; the metric, MAE per frame, is also a proposal)`)
  const all = [...series1, ...series2], worst = Math.max(...all.map(d => d.mae))
  const over = all.map((d, i) => [i, d]).filter(([, d]) => d.mae > tol)
  out(over.length ? 'FAIL' : 'PASS', `PROVISIONAL covered-cut vs proposed tolerance: ${over.length}/${all.length} frames above ${tol.toFixed(4)}; worst frame MAE ${f2(worst)}`)
  const sampled = grid2.map((u, i) => i).filter(i => Math.abs((grid2[i] / 50) - Math.round(grid2[i] / 50)) < 1e-6)
  out('INFO', `a 50 ms sampler looks at cut-2 frames ${sampled.join(',')}: fault frame ${FAULT_K} (${f1(grid2[FAULT_K])} ms) is ${sampled.includes(FAULT_K) ? 'SAMPLED (probe invalid)' : 'between its looks'}`)
  // flagged = above the proposed tolerance AND above every real frame of the cut it is injected into
  // (so the flag cannot come from a tolerance that already fails everything); the all-cuts comparison is INFO
  const worst2 = Math.max(...series2.map(d => d.mae))
  for (const [name, e] of [['blank (black) frame', blankErr], ['wrong-station frame (rest 7)', wrongErr]]) {
    const flagged = e.mae > tol && e.mae > worst2
    out(flagged ? 'PASS' : 'FAIL', `probe ${name} at cut-2 frame ${FAULT_K}: MAE ${f2(e.mae)} (${e.differing} px) vs tolerance ${tol.toFixed(4)} and worst real cut-2 frame ${f2(worst2)}: ${flagged ? 'FLAGGED' : 'NOT detected'}`)
    out('INFO', `  same fault vs worst real frame of BOTH cuts (${f2(worst)}): ${e.mae > worst ? 'above' : 'NOT above (cut-1 real error is as large as this fault)'}`)
  }
  if (page.errors.length) out('FAIL', `page errors: ${page.errors.slice(0, 3).join(' | ')}`)
  await page.context().close()
}

// ---------------------------------------------------------------- 7. selftest (gate 3b fixtures)
async function selftest() {
  console.log('== selftest (gate 3b: each check must FAIL on its fixture)')
  const expectFail = (r, what) => out(r.pass ? 'FAIL' : 'PASS', `${what}: check says ${r.pass ? 'PASS (fixture NOT caught)' : 'FAIL (caught)'} :: ${r.line ?? r.bad?.join('; ')}`)
  const expectPass = (r, what) => out(r.pass ? 'PASS' : 'FAIL', `${what}: check says ${r.pass ? 'PASS' : 'FAIL'} :: ${r.line ?? r.bad?.join('; ')}`)
  const page = await openPage()
  const base = await restShot(page, 0)
  expectPass(safeboxCheck(base, 'control: real rest 0'), 'safebox control')
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'fv-patch'; d.style.cssText = 'position:fixed;left:900px;top:500px;width:200px;height:60px;background:#fff;z-index:2147483647'; document.body.appendChild(d) })
  const patched = await shot(page)
  await page.evaluate(() => document.getElementById('fv-patch').remove())
  expectFail(safeboxCheck(patched, 'bright patch 200x60 inside the box'), 'safebox bright-patch fixture')
  expectFail(safeboxCheck(base, 'zero-size crop', { left: 0.5, top: 0.5, width: 0, height: 0.2 }), 'safebox empty-crop fixture')
  expectFail(safeboxCheck(new Uint8Array(0), 'zero-length frame'), 'safebox empty-frame fixture')
  expectPass(contrastCheck(themeTextColor(), 68, 'control: theme text vs the 68 cap'), 'contrast control')
  expectFail(contrastCheck('#5a5048', 30, 'low-contrast fixture #5a5048 on luma 30'), 'contrast low-contrast fixture')
  // census: control, injected unexpected continuous animation, removed layer
  await rest(page, 0)
  expectPass(judgeCensus(await page.evaluate(censusRaw), false), 'census control (station 0)')
  await page.evaluate(() => {
    const s = document.createElement('style'); s.id = 'fv-kf'; s.textContent = '@keyframes fv-pulse{from{left:0}to{left:40px}}'; document.head.appendChild(s)
    const d = document.createElement('div'); d.id = 'fv-anim'; d.style.cssText = 'position:absolute;width:10px;height:10px;animation:fv-pulse 2s linear infinite'
    document.querySelector('.fs-world').appendChild(d)
  })
  expectFail(judgeCensus(await page.evaluate(censusRaw), false), 'census unexpected-animation fixture')
  await page.evaluate(() => { document.getElementById('fv-anim').remove(); document.getElementById('fv-kf').remove() })
  await rest(page, 0)
  await page.evaluate(() => document.querySelectorAll('.fs-stage .creep')[0].remove())
  expectFail(judgeCensus(await page.evaluate(censusRaw), false), 'census removed-layer fixture (one .creep layer gone)')
  // census: idle running at rest start must fail; a second on-screen flicker must fail
  const idleEarly = judgeCensus([{ name: 'fs-idle', isRig: true, cls: 'fs-rig idle', props: ['transform'], iterations: Infinity, duration: 7300 },
    ...[1, 2].map(() => ({ name: 'transition:transform', cls: 'creep', props: ['transform'], duration: 40000, iterations: 1 }))], false)
  expectFail(idleEarly, 'census idle-at-rest-start fixture')
  const twoFlick = judgeCensus([...[1, 2].map(() => ({ name: 'fs-flick', cls: 'ly flick', props: ['opacity'], opMin: 0.88, opMax: 1, duration: 2700, onScreen: true })),
    ...[1, 2].map(() => ({ name: 'transition:transform', cls: 'creep', props: ['transform'], duration: 40000, iterations: 1 }))], false)
  expectFail(twoFlick, 'census two-flickers-on-screen fixture')
  await page.context().close()
}

// ---------------------------------------------------------------- main
const CMDS = { 'probe-api': probeApi, safebox, census, perf, 'covered-cut': coveredCut, selftest }
const cmd = process.argv[2]
const run = cmd === 'all' ? ['probe-api', 'safebox', 'census', 'perf', 'covered-cut'] : [cmd]
if (!run.every(c => CMDS[c])) { console.error('usage: node scripts/forest-verify.mjs probe-api|safebox|census|perf|covered-cut|all|selftest'); process.exit(2) }
let code = 0
try {
  await startServer()
  browser = await chromium.launch()
  const summary = []
  for (const c of run) {
    const before = fails
    try { await CMDS[c]() } catch (e) { out('FAIL', `${c} crashed: ${e.stack || e}`) }
    summary.push(`${c}: ${poisoned ? 'POISONED' : fails > before ? `${fails - before} FAIL` : 'PASS'}`)
    if (poisoned) break
  }
  console.log(`INFO  captures that needed a retake before two identical PNGs in a row: ${unstable}`)
  if (run.length > 1) console.log('== summary\n' + summary.join('\n'))
  code = poisoned ? 3 : fails ? 1 : 0
} catch (e) { console.error('infra error:', e.stack || e); code = 2 }
finally { await browser?.close().catch(() => {}); killServer() }
process.exit(code)
