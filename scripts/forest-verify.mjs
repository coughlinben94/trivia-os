// Forest verifier (Halloween forest spec §3 gates 2, 3, 3b, 5, 6-subset, 7-core; plan 3b-4, metric-free part).
//   node scripts/forest-verify.mjs probe-api | safebox | census [--freeze-baseline] | perf | covered-cut | reduced-motion | strobe [--walk A>B] | all | selftest
// census compares against scripts/forest-census.frozen.json: a REGRESSION baseline captured from the current
// build (census --freeze-baseline), not a design threshold.
// Prints PASS / FAIL / INFO lines with measured values; exits 1 on any FAIL, 3 on POISONED (the sampler
// is not deterministic, so no probe result can be trusted), 2 on usage/infra error.
//
// WHAT PAGE: /ambient?ring=1&world=haunted-october (AmbientAudit mounts ForestAmbient at 1920x1080).
// The REAL /display route needs a live Supabase show and is the later gate 9 (and gate 6's "measured on
// real /display with a slide transition running"); nothing here measures /display.
//
// NOT HERE (deliberately): gate 4 FIDELITY vs v3 (metric + tolerance are Ben's,
// STAYS-HUMAN), the covered-cut tolerance (NOT DECIDED; a PROVISIONAL line uses the critique suggestion), gate 7's
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
import { SAFE_BOX, lumaStats, contrastRatio, easeInOut, compositeStack, diffStats, quantile, edgeSpeeds, strobeVerdict, layerContrast, STROBE_SPEED_PX, STROBE_CONTRAST, STROBE_MIN_PX } from '../client/src/lib/forestVerifyMath.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = 5206, BASE = `http://localhost:${PORT}`
// FOREST_QUERY="nostrobe=1&dur=7000&step=14" appends preview switches (AmbientAudit) so the gates can be run on a variant.
const URL_PATH = '/ambient?ring=1&world=haunted-october' + (process.env.FOREST_QUERY ? '&' + process.env.FOREST_QUERY : '')
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

async function openPage({ fakeClock = true, reducedMotion = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.errors = []
  page.on('pageerror', e => page.errors.push(e.message))
  if (reducedMotion) await page.emulateMedia({ reducedMotion: 'reduce' })
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
  // a WALK frame from this long-running page vs a brand-new page at the same frozen fraction
  const Wl = await walkShot(page, 5, 0.5)
  const fresh = await openPage()
  const Wf = await walkShot(fresh, 5, 0.5)
  const wd = diffStats(Wl, Wf)
  out(wd.differing === 0 ? 'PASS' : 'FAIL', `(e) walk 5>6 @50%: long-running page vs fresh page: ${wd.differing} px differ (max ${wd.max}) [want 0]`)
  // independent oracle: computed scale/opacity of animated items vs their generated keyframes at 37%
  await rest(fresh, 5)
  await fresh.evaluate(() => { window.__forest.freeze(0); window.__forest.turn() })
  await freeze(fresh, 0.37 * fresh.durMs)
  const orc = await fresh.evaluate(t => {
    const items = [...document.querySelectorAll('.fs-world .it')].filter(e => e.getAnimations().length)
    const pick = items.filter((e, i) => i % Math.max(1, Math.floor(items.length / 8)) === 0).slice(0, 8)
    const at = (kfs, p, get) => {
      const ks = kfs.filter(k => get(k) != null)
      for (let i = 0; i < ks.length - 1; i++) {
        const a = ks[i], b = ks[i + 1]
        if (p >= a.computedOffset && p <= b.computedOffset) { const f = (p - a.computedOffset) / ((b.computedOffset - a.computedOffset) || 1); return get(a) + (get(b) - get(a)) * f }
      }
      return get(ks[ks.length - 1])
    }
    let ds = 0, dop = 0
    for (const e of pick) {
      const a = e.getAnimations()[0], kfs = a.effect.getKeyframes(), p = t / a.effect.getTiming().duration
      const sc = at(kfs, p, k => { const m = /scale\(([-\d.e]+)\)/.exec(k.transform || ''); return m ? +m[1] : null })
      const op = at(kfs, p, k => (k.opacity != null ? +k.opacity : null))
      const cs = getComputedStyle(e), m = /matrix\(([^,]+)/.exec(cs.transform)
      ds = Math.max(ds, Math.abs((m ? +m[1] : 1) - sc)); dop = Math.max(dop, Math.abs(+cs.opacity - op))
    }
    return { n: pick.length, of: items.length, ds, dop }
  }, 0.37 * fresh.durMs)
  out('INFO', `oracle walk 5>6 @37% (between keyframe stops): ${orc.n}/${orc.of} animated items, max |computed scale - keyframe interpolation| ${orc.ds.toExponential(2)}, max |opacity diff| ${orc.dop.toExponential(2)}`)
  await fresh.context().close()
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
  // later rest times: 5 s (creep part way), 41 s (creep done, idle sway running; freeze(41000) also sets
  // the idle animation to 41000 ms of its own time: a valid sway pose, not its exact live phase). INFO
  // unless over the locked caps.
  for (let k = 0; k < NS; k++) {
    for (const t of [5000, 41000]) {
      await rest(page, k)
      if (t > 40000) await page.clock.runFor(41000)
      await freeze(page, t)
      const r = safeboxCheck(await shot(page), `rest ${k} @${t / 1000}s`)
      out(r.pass ? 'INFO' : 'FAIL', r.line)
    }
  }
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
  // element identity: child-index path from .fs-stage (rest rendering is deterministic per station + seed)
  const pathOf = el => { const p = []; while (el && el !== stage) { p.unshift([...el.parentElement.children].indexOf(el)); el = el.parentElement } return p.join('/') }
  return stage.getAnimations({ subtree: true }).map(a => {
    const e = a.effect, tg = e.target, tm = e.getTiming()
    const kfs = e.getKeyframes()
    const props = [...new Set(kfs.flatMap(k => Object.keys(k).filter(p => !['offset', 'computedOffset', 'easing', 'composite'].includes(p))))]
    const op = kfs.map(k => k.opacity).filter(v => v != null).map(Number)
    return {
      name: a.transitionProperty ? `transition:${a.transitionProperty}` : (a.animationName || 'web-animation'), path: pathOf(tg),
      cls: (tg.className && tg.className.baseVal === undefined ? tg.className : '').toString().trim(),
      isRig: tg === rig, isClone: !!tg.closest('[data-forest-clone]'), iterations: tm.iterations, duration: tm.duration, props,
      opMin: op.length ? Math.min(...op) : null, opMax: op.length ? Math.max(...op) : null, onScreen: vis(tg),
    }
  })
}
// expectIdle: false at rest start (must be absent), true after 40 s (must be present and the rig's only one)
// base: this station's entry of the frozen census baseline ({ drift:[paths], flick:[{path,onScreen}] }) or null
function judgeCensus(list, expectIdle, base) {
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
  const snap = censusSnap(list)
  if (!base) bad.push('no frozen census baseline for this station (run: census --freeze-baseline)')
  else {
    const miss = base.drift.filter(p => !snap.drift.includes(p)), extra = snap.drift.filter(p => !base.drift.includes(p))
    if (miss.length || extra.length) bad.push(`fog drift ${snap.drift.length} vs baseline ${base.drift.length}: missing [${miss.join(' ')}] extra [${extra.join(' ')}]`)
    const fk = f => `${f.path}${f.onScreen ? '' : '(off)'}`
    if (snap.flick.map(fk).join() !== base.flick.map(fk).join()) bad.push(`flicker targets [${snap.flick.map(fk).join(' ')}] vs baseline [${base.flick.map(fk).join(' ')}]`)
  }
  return { pass: !bad.length, bad, counts, flickOn, snap }
}
const censusSnap = list => ({
  drift: list.filter(a => a.name === 'fs-drift').map(a => a.path).sort(),
  flick: list.filter(a => a.name === 'fs-flick').map(a => ({ path: a.path, onScreen: a.onScreen })).sort((x, y) => (x.path < y.path ? -1 : 1)),
})
const BASELINE = path.join(ROOT, 'scripts/forest-census.frozen.json')
const loadBaseline = () => { try { return JSON.parse(fs.readFileSync(BASELINE, 'utf8')) } catch { return null } }
const fmtCounts = c => Object.entries(c).map(([k, v]) => `${k}x${v}`).join(' ')

async function censusAt(page, k, base) {
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
  const r0 = judgeCensus(await page.evaluate(censusRaw), false, base)
  await page.clock.runFor(40000)
  const r1 = judgeCensus(await page.evaluate(censusRaw), true, base)
  return { r0, r1 }
}

async function census() {
  console.log('== census (spec 2.3: allowed at rest = fs-drift(transform), <=1 on-screen fs-flick (opacity, amp<=12%, period>333ms), 2 creep transitions (40 s), fs-idle on the rig only after 40 s)')
  const freezeBase = process.argv.includes('--freeze-baseline')
  const baseline = freezeBase ? null : loadBaseline()
  if (!freezeBase) out(baseline ? 'INFO' : 'FAIL', baseline ? `baseline ${path.relative(ROOT, BASELINE)} (${baseline.capturedFrom})` : `no baseline at ${BASELINE}: run census --freeze-baseline`)
  const page = await openPage()
  let driftMissing = 0
  const snaps = {}
  for (let k = 0; k < NS; k++) {
    const { r0, r1 } = await censusAt(page, k, freezeBase ? null : baseline?.stations?.[k])
    if (freezeBase) { // only the baseline-independent checks decide whether this run may be frozen
      const own = r0.bad.concat(r1.bad).filter(b => !b.startsWith('no frozen census baseline'))
      if (own.length) out('FAIL', `station ${k}: not freezing a baseline from a failing census :: ${own.join('; ')}`)
      snaps[k] = r0.snap
    }
    if (!r0.counts['fs-drift']) driftMissing++
    if (!freezeBase) out(r0.pass ? 'PASS' : 'FAIL', `station ${k} rest start: ${fmtCounts(r0.counts)} (flicker on screen ${r0.flickOn})${r0.bad.length ? ' :: ' + r0.bad.join('; ') : ''}`)
    if (!freezeBase) out(r1.pass ? 'PASS' : 'FAIL', `station ${k} +40 s: ${fmtCounts(r1.counts)}${r1.bad.length ? ' :: ' + r1.bad.join('; ') : ''}`)
    // walk keyframes (spec 2.3c): transform/opacity only
    await rest(page, k)
    await page.evaluate(() => { window.__forest.freeze(0); window.__forest.turn() })
    const w = await page.evaluate(censusRaw)
    const nonTO = [...new Set(w.flatMap(a => a.props.filter(p => p !== 'transform' && p !== 'opacity').map(p => `${a.name}:${p}`)))]
    out(nonTO.length ? 'FAIL' : 'PASS', `walk ${k}>${(k + 1) % NS}: ${w.length} animations, non transform/opacity properties: ${nonTO.join(',') || 'none'}`)
  }
  out('INFO', `stations with no fog drift at rest: ${driftMissing}/13`)
  if (freezeBase) {
    if (fails) out('FAIL', 'baseline NOT written (census failed)')
    else {
      fs.writeFileSync(BASELINE, JSON.stringify({
        note: 'Regression baseline captured from the current build by `node scripts/forest-verify.mjs census --freeze-baseline`, NOT a design threshold. Per station: element paths (child indexes from .fs-stage) running fs-drift, and fs-flick targets with on-screen status, at rest start. Re-freeze only after a deliberate, reviewed change to the forest.',
        capturedFrom: `seed ${await page.evaluate(() => window.__forest.seed)}, ${new Date().toISOString().slice(0, 10)}, ${URL_PATH}`,
        stations: snaps,
      }, null, 1) + '\n')
      out('INFO', `wrote ${path.relative(ROOT, BASELINE)}: ` + Object.entries(snaps).map(([k, v]) => `${k}:drift${v.drift.length}/flick${v.flick.map(f => (f.onScreen ? 'on' : 'off')).join('') || '-'}`).join(' '))
    }
  }
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
// Expected frame model: the browser paints the live destination layer, then each clone in DOM order,
// each source-over at its own computed opacity (read from the DOM at that frozen step). Layer images:
//   destination = rest(dest) re-rendered via jumpTo, creep not started, frozen at the same u (independent
//     of the cut's own live layer, so a wrong live station is caught);
//   clone 1 = the cut's OWN first frame (u=0: clone 1 opaque at opacity 1 covers everything);
//   clone 2 = the in-between rest frame it snapshots (rest 2 at u=200, creep not started).
// The first-cut-instant step (live walk frame vs clone 1's first frame: Chrome rasterizes the animated
// layer at a different scale than the frozen inline-transform clone) is reported SEPARATELY.
// GRAIN: .fs-grain (overlay blend, opacity .035) is hidden for every fit capture so the linear model is
// exact; its contribution is reported separately as a residual on one real frame.
// Tolerance: NOT DECIDED (Ben). The PROVISIONAL line uses the critique's suggested numbers only.
const FRAME_MS = 1000 / 60, FADE = 400
const PROV = { max: 8, mae: 1.2, stepMae: 0.6 } // critique's suggestion, PROVISIONAL, not a gate
const provisionalFrame = d => d.max <= PROV.max && d.mae <= PROV.mae
const fmtD = d => `MAE ${f2(d.mae)} max ${d.max} >=8:${d.ge8} >=12:${d.ge12} >=16:${d.ge16}`
const clonesInfo = page => page.evaluate(() => [...document.querySelector('.fs-rig').children]
  .filter(e => e.hasAttribute('data-forest-clone')).map(e => ({ tag: e.getAttribute('data-fv') || '?', a: parseFloat(getComputedStyle(e).opacity) })))
const setGrain = (page, visible) => page.evaluate(v => { document.querySelector('.fs-grain').style.visibility = v ? '' : 'hidden' }, visible)

async function coveredCut() {
  console.log('== covered-cut (gate 7 core: walk 0>1, retarget at +1000 ms, retarget again at +200 ms)')
  const page = await openPage()
  await setGrain(page, false)
  const restNoCreep = async (k, u) => { await rest(page, k, { creep: false }); await freeze(page, u); return shotPng(page) }
  const grid1 = [], grid2 = []
  for (let u = 0; u <= 200 + 1e-6; u += FRAME_MS) grid1.push(u)
  for (let u = 0; u <= FADE + 1e-6; u += FRAME_MS) grid2.push(u)
  const D1 = [], D2 = []
  for (const u of grid1) D1.push(await restNoCreep(2, u))
  for (const u of grid2) D2.push(await restNoCreep(3, u))
  const C2 = decode(await restNoCreep(2, 200)) // what clone 2 snapshots
  const FAULT_K = 4 // 66.7 ms: between a 50 ms sampler's looks at 50 and 100 ms
  const wrongPng = await restNoCreep(7, grid2[FAULT_K])

  // the scenario
  await rest(page, 0)
  await page.evaluate(() => { window.__forest.freeze(0); window.__forest.turn() })
  await page.clock.runFor(1000)
  await freeze(page, 1000)
  const W1000 = await shot(page) // the live walk frame just before cut 1
  await page.evaluate(() => { window.__forest.turn(); document.querySelector('[data-forest-clone]').setAttribute('data-fv', 'c1') })
  let sc = await scene(page); if (sc !== 'cut:2') throw new Error(`after retarget 1 expected cut:2, got ${sc}`)
  await freeze(page, 0)
  const C1 = await shot(page) // clone 1's own first frame
  const step = diffStats(W1000, C1)
  const series1 = [], opDev = []
  const expectedAt = async (D, layerOf) => {
    const cl = await clonesInfo(page)
    return { cl, exp: compositeStack(D, cl.map(c => ({ rgba: layerOf(c.tag), a: c.a }))) }
  }
  for (let i = 0; i < grid1.length; i++) {
    await freeze(page, grid1[i])
    const { cl, exp } = await expectedAt(decode(D1[i]), () => C1)
    opDev.push(Math.abs(cl[0].a - (1 - easeInOut(grid1[i] / FADE))))
    series1.push(diffStats(await shot(page), exp))
  }
  await page.clock.runFor(200)
  await freeze(page, 200)
  const held = (await clonesInfo(page))[0].a
  await page.evaluate(() => {
    window.__forest.turn()
    for (const e of document.querySelectorAll('[data-forest-clone]')) if (!e.hasAttribute('data-fv')) e.setAttribute('data-fv', 'c2')
  })
  sc = await scene(page); if (sc !== 'cut:3') throw new Error(`after retarget 2 expected cut:3, got ${sc}`)
  const order = (await clonesInfo(page)).map(c => c.tag).join('<')
  const series2 = []
  const probes = {}
  const layer = tag => (tag === 'c1' ? C1 : tag === 'c2' ? C2 : null)
  let grainRes = null
  for (let i = 0; i < grid2.length; i++) {
    await freeze(page, grid2[i])
    const { cl, exp } = await expectedAt(decode(D2[i]), layer)
    if (cl.some(c => !layer(c.tag))) throw new Error(`unknown clone in stack: ${JSON.stringify(cl)}`)
    const e = 1 - easeInOut(grid2[i] / FADE)
    for (const c of cl) opDev.push(Math.abs(c.a - (c.tag === 'c1' ? held * e : e)))
    const F = await shot(page)
    series2.push(diffStats(F, exp))
    if (i === 12) { await setGrain(page, true); grainRes = diffStats(await shot(page), F); await setGrain(page, false) }
    if (i === FAULT_K) {
      // ONE-FRAME faults, each injected in the page at this instant only, judged by the same functions
      const inject = async css => {
        await page.evaluate(c => { const d = document.createElement('div'); d.id = 'fv-fault'; d.style.cssText = c; document.body.appendChild(d) }, css)
        const r = diffStats(await shot(page), exp)
        await page.evaluate(() => document.getElementById('fv-fault').remove())
        return r
      }
      probes.blank = await inject('position:fixed;inset:0;background:#000;z-index:2147483647')
      probes.pop = await inject('position:fixed;left:1000px;top:600px;width:120px;height:80px;background:rgba(255,255,255,.2);z-index:2147483647')
      probes.wrong = diffStats(decode(wrongPng), exp)
    }
  }
  await setGrain(page, true)
  await page.clock.runFor(500)
  const end = await scene(page), st = await page.evaluate(() => window.__forest.station)
  const clones = await page.evaluate(() => document.querySelectorAll('[data-forest-clone]').length)

  out('INFO', `first-cut-instant step (live walk frame @1000 ms vs clone 1's own first frame): ${fmtD(step)} (${step.differing} px differ)`)
  out(step.mae <= PROV.stepMae ? 'PASS' : 'FAIL', `PROVISIONAL first-cut step: MAE ${f2(step.mae)} vs suggested ${PROV.stepMae}; ${step.ge16} px >= 16 (critique: "a few hundred", reported not judged)`)
  out('INFO', `cut 2 stack paint order (bottom<top): live<${order}; clone 1 held at opacity ${held.toFixed(4)}; max |DOM opacity - ease-in-out prediction| = ${Math.max(...opDev).toFixed(4)}`)
  for (const [n, s] of [['cut 1 (dest rest 2)', series1], ['cut 2 (dest rest 3)', series2]]) {
    out('INFO', `${n}, ${s.length} frames, per frame MAE/max/>=8/>=12/>=16: ${s.map((d, i) => `${i}:${f2(d.mae)}/${d.max}/${d.ge8}/${d.ge12}/${d.ge16}`).join(' ')}`)
  }
  out('INFO', `grain residual (cut-2 frame 12, grain shown vs hidden; NOT in the fit): ${fmtD(grainRes)}`)
  out(end === 'rest:3' && st === 3 && clones === 0 ? 'PASS' : 'FAIL', `after the fade: scene=${end} station=${st} clones=${clones} (want rest:3, 3, 0)`)
  console.log('tolerance: NOT DECIDED (Ben)')
  out('INFO', `critique's suggestion (not a gate): max channel ~${PROV.max} from frame 1 on, MAE ~${PROV.mae}; first-cut step MAE ~${PROV.stepMae} and a few hundred px >= 16`)
  const judged = [...series1.slice(1), ...series2.slice(1)]
  const bad = judged.filter(d => !provisionalFrame(d))
  const wMax = Math.max(...judged.map(d => d.max)), wMae = Math.max(...judged.map(d => d.mae))
  out(bad.length ? 'FAIL' : 'PASS', `PROVISIONAL fade fit (frames >= 1 of both cuts, max <= ${PROV.max} and MAE <= ${PROV.mae}): ${bad.length}/${judged.length} frames outside; worst max ${wMax}, worst MAE ${f2(wMae)}; frame 0s: cut1 ${fmtD(series1[0])}, cut2 ${fmtD(series2[0])}`)
  const sampled = grid2.map((u, i) => i).filter(i => Math.abs((grid2[i] / 50) - Math.round(grid2[i] / 50)) < 1e-6)
  out('INFO', `a 50 ms sampler looks at cut-2 frames ${sampled.join(',')}: fault frame ${FAULT_K} (${f1(grid2[FAULT_K])} ms) is ${sampled.includes(FAULT_K) ? 'SAMPLED (probe invalid)' : 'between its looks'}`)
  for (const [name, d] of [['blank (black) frame', probes.blank], ['wrong-station frame (rest 7)', probes.wrong], ['small-area pop (120x80 patch, +20% white)', probes.pop]]) {
    const flagged = !provisionalFrame(d)
    out(flagged ? 'PASS' : 'FAIL', `probe ${name} at cut-2 frame ${FAULT_K}: ${fmtD(d)} -> ${flagged ? 'FLAGGED' : 'NOT detected'} by the provisional frame check`)
  }
  out(probes.pop.mae <= PROV.mae ? 'PASS' : 'FAIL', `probe small-area pop: whole-frame MAE ${f2(probes.pop.mae)} is within MAE ${PROV.mae} (flat MAE alone would miss it; max-channel/over-threshold count catches it)`)
  if (page.errors.length) out('FAIL', `page errors: ${page.errors.slice(0, 3).join(' | ')}`)
  await page.context().close()
}

// ---------------------------------------------------------------- 6. reduced-motion (spec 2.2 / 2.3d)
// phase 'rest' and 'late': nothing animates; 'cut': exactly one 400 ms opacity transition, on a clone
function judgeRM(list, phase) {
  const bad = []
  if (phase === 'cut') {
    const ok = list.length === 1 && list[0].name === 'transition:opacity' && list[0].duration === 400 && list[0].isClone && list[0].props.join() === 'opacity'
    if (!ok) bad.push(`want exactly one 400 ms opacity transition on a clone, got [${list.map(a => `${a.name}@${a.duration}ms on .${a.cls}${a.isClone ? '(clone)' : ''}`).join(', ')}]`)
  } else if (list.length) bad.push(`${list.length} animating: ${list.map(a => `${a.name} on .${a.cls || '?'}`).join(', ')}`)
  return { pass: !bad.length, bad, line: `${phase}: ${list.length} animation(s)${bad.length ? ' :: ' + bad.join('; ') : ''}` }
}
async function reducedMotion() {
  console.log('== reduced-motion (prefers-reduced-motion: reduce emulated)')
  const page = await openPage({ reducedMotion: true })
  const rm = await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)
  out(rm ? 'PASS' : 'FAIL', `matchMedia reduce = ${rm}`)
  await rest(page, 0)
  let r = judgeRM(await page.evaluate(censusRaw), 'rest'); out(r.pass ? 'PASS' : 'FAIL', `rest 0 ${r.line}`)
  await page.evaluate(() => { window.__forest.freeze(0); window.__forest.turn() })
  const sc = await scene(page)
  r = judgeRM(await page.evaluate(censusRaw), 'cut'); out(r.pass && sc === 'cut:1' ? 'PASS' : 'FAIL', `turn(): scene ${sc}, ${r.line}`)
  await page.clock.runFor(500)
  const sc2 = await scene(page)
  r = judgeRM(await page.evaluate(censusRaw), 'late'); out(r.pass && sc2 === 'rest:1' ? 'PASS' : 'FAIL', `+500 ms: scene ${sc2}, ${r.line}`)
  await page.clock.runFor(41000)
  r = judgeRM(await page.evaluate(censusRaw), 'late'); out(r.pass ? 'PASS' : 'FAIL', `+41 s: ${r.line}`)
  if (page.errors.length) out('FAIL', `page errors: ${page.errors.slice(0, 3).join(' | ')}`)
  await page.context().close()
}

// ---------------------------------------------------------------- 6b. strobe (spec §3 gate 6 STROBE)
// LOCKED rule (spec; constants live in forestVerifyMath.js, never flags): a layer faster than
// STROBE_SPEED_PX = 8 px/frame at 60 Hz must have effective Michelson contrast <= STROBE_CONTRAST = 0.10.
// LAYER = each separately animated unit of a walk: every .it item wrapper, every .ly sub-layer inside it
//   (v3 animates sub-layer opacity for lit bark / lantern glass), and .fs-ground.
// SPEED = freeze(t) stepped every 16.667 ms across the whole walk; each layer's getBoundingClientRect,
//   clipped to the 1920x1080 viewport (the ON-SCREEN box); per step the largest |delta| of its four edges.
//   Known limit: a layer larger than the screen (the ground, a near trunk) has clipped edges that do not
//   move, so its INTERNAL motion is not seen by this box method.
// CONTRAST = for each layer over the speed lock, at the frame ending its fastest step (first if tied):
//   capture the frozen frame (retake-until-identical sampler), capture again with THAT layer
//   visibility:hidden, restore. Its pixels = pixels that differ; Lin / Lout = mean luma (Rec.709 on sRGB
//   bytes, as safebox) of those pixels with / without it; contrast = |Lin-Lout|/(Lin+Lout). Fewer than
//   STROBE_MIN_PX = 25 changed pixels = invisible in that frame: INFO, skipped. Only the peak-speed frame
//   is measured (not the worst-contrast frame among all over-lock frames). Every over-lock layer is
//   measured: no sampling.
const STEP_MS = 1000 / 60
function speedSample(tEnd, step) {
  const stage = document.querySelector('.fs-stage')
  const layers = [...stage.querySelectorAll('.fs-world .it, .fs-world .it .ly, .fs-ground, [data-fv-layer]')]
  layers.forEach((e, i) => e.setAttribute('data-fv-sid', String(i)))
  const kind = e => (e.hasAttribute('data-fv-layer') ? 'fixture' : e.classList.contains('fs-ground') ? 'ground' : e.classList.contains('it') ? 'item' : 'sublayer')
  const rects = layers.map(() => [])
  const n = Math.round(tEnd / step)
  for (let k = 0; k <= n; k++) {
    window.__forest.freeze(k * step)
    layers.forEach((e, i) => {
      const r = e.getBoundingClientRect()
      const l = Math.max(0, r.left), t = Math.max(0, r.top), R = Math.min(innerWidth, r.right), B = Math.min(innerHeight, r.bottom)
      rects[i].push(R > l && B > t ? [l, t, R, B].map(v => Math.round(v * 100) / 100) : null)
    })
  }
  return layers.map((e, i) => ({
    sid: i, kind: kind(e), cls: e.className.toString().trim(), ownAnim: e.getAnimations().length > 0,
    item: e.closest('.it') ? [...e.closest('.fs-world').children].indexOf(e.closest('.it')) : -1, rects: rects[i],
  }))
}
// speeds -> over-lock layers -> raster contrast. Returns rows (one per over-lock layer) + stats.
async function strobeRun(page, tEnd, label) {
  const layers = await page.evaluate(`(${speedSample})(${tEnd}, ${STEP_MS})`)
  const fast = []
  let maxSpeed = 0
  for (const L of layers) {
    const sp = edgeSpeeds(L.rects)
    let pk = -1
    sp.forEach((v, i) => { if (v != null && (pk < 0 || v > sp[pk])) pk = i })
    if (pk < 0) continue
    maxSpeed = Math.max(maxSpeed, sp[pk])
    if (sp[pk] > STROBE_SPEED_PX) fast.push({ ...L, speed: sp[pk], t: (pk + 1) * STEP_MS, rects: undefined })
  }
  // group by peak time: one "with" capture per time, one "hidden" capture per layer
  const rows = [], byT = new Map()
  for (const f of fast) { const k = f.t.toFixed(3); if (!byT.has(k)) byT.set(k, []); byT.get(k).push(f) }
  let captures = 0
  for (const group of byT.values()) {
    await freeze(page, group[0].t)
    const withF = await shot(page); captures++
    for (const f of group) {
      // effective opacity = product of computed opacities up to the stage (INFO, helps read invisible layers)
      const op = await page.evaluate(sid => {
        const e = document.querySelector(`[data-fv-sid="${sid}"]`); let o = 1
        for (let x = e; x && !x.classList.contains('fs-stage'); x = x.parentElement) o *= +getComputedStyle(x).opacity
        e.style.visibility = 'hidden'; return Math.round(o * 1e4) / 1e4
      }, f.sid)
      const without = await shot(page); captures++
      await page.evaluate(sid => { document.querySelector(`[data-fv-sid="${sid}"]`).style.visibility = '' }, f.sid)
      const c = layerContrast(withF, without)
      rows.push({ ...f, ...c, opacity: +op, label, pass: c.visible ? strobeVerdict(f.speed, c.contrast) : true })
    }
  }
  return { rows, layers: layers.length, fast: fast.length, maxSpeed, captures }
}
const strobeLine = r => `${r.label} t=${f1(r.t)}ms ${r.kind}${r.item >= 0 ? ` item#${r.item}` : ''} .${r.cls || '?'}${r.ownAnim ? ' (own anim)' : ''}: speed ${f2(r.speed)} px/frame, ` +
  (r.visible ? `contrast ${r.contrast.toFixed(3)} (Lin ${f1(r.Lin)} Lout ${f1(r.Lout)}, ${r.n} px` : `invisible (${r.n} px changed < ${STROBE_MIN_PX}`) + `, effective opacity ${r.opacity})`

async function strobe() {
  const t0 = Date.now()
  const wi = process.argv.indexOf('--walk')
  let walks = [...Array(NS).keys()]
  if (wi > 0) {
    const m = /^(\d+)>(\d+)$/.exec(process.argv[wi + 1] || '')
    if (!m || +m[2] !== (+m[1] + 1) % NS) throw new Error('usage: strobe --walk A>B with B = A+1 mod 13')
    walks = [+m[1]]
  }
  console.log(`== strobe (gate 6, LOCKED: speed > ${STROBE_SPEED_PX} px/frame at 60 Hz needs Michelson contrast <= ${STROBE_CONTRAST}; ${walks.length} walk(s))`)
  const page = await openPage()
  const all = []
  let captures = 0
  for (const a of walks) {
    const label = `walk ${a}>${(a + 1) % NS}`
    await rest(page, a)
    await page.evaluate(() => { window.__forest.freeze(0); window.__forest.turn() })
    const r = await strobeRun(page, page.durMs, label)
    captures += r.captures
    const vis = r.rows.filter(x => x.visible), bad = vis.filter(x => !x.pass)
    out(bad.length ? 'FAIL' : 'PASS', `${label}: ${r.layers} layers, ${r.fast} over ${STROBE_SPEED_PX} px/frame (max speed ${f2(r.maxSpeed)}), ${vis.length} measured, ${r.rows.length - vis.length} invisible, ${bad.length} over contrast ${STROBE_CONTRAST}`)
    for (const x of bad) out('FAIL', '  ' + strobeLine(x))
    for (const x of r.rows.filter(y => !y.visible)) out('INFO', '  ' + strobeLine(x))
    all.push(...r.rows)
  }
  const vis = all.filter(x => x.visible)
  const worst = vis.reduce((w, x) => (!w || x.contrast > w.contrast ? x : w), null)
  out('INFO', `worst layer over the speed lock (speed, contrast): ${worst ? `(${f2(worst.speed)}, ${worst.contrast.toFixed(3)}) ${strobeLine(worst)}` : 'none measured'}`)
  out('INFO', `raster contrast measurements: ${vis.length}; invisible-skipped: ${all.length - vis.length}; captures: ${captures}; runtime ${f1((Date.now() - t0) / 1000)} s`)
  if (page.errors.length) out('FAIL', `page errors: ${page.errors.slice(0, 3).join(' | ')}`)
  await page.context().close()
}

// ---------------------------------------------------------------- 7. selftest (gate 3b fixtures)
async function selftest() {
  console.log('== selftest (gate 3b: each check must FAIL on its fixture)')
  // want: the failure must be for the fixture's own reason, not an unrelated one
  const expectFail = (r, what, want) => {
    const why = r.line ?? r.bad?.join('; ')
    const caught = !r.pass && (!want || want.test(why))
    out(caught ? 'PASS' : 'FAIL', `${what}: check says ${r.pass ? 'PASS (fixture NOT caught)' : caught ? 'FAIL (caught)' : 'FAIL but not for the fixture reason'} :: ${why}`)
  }
  const expectPass = (r, what) => out(r.pass ? 'PASS' : 'FAIL', `${what}: check says ${r.pass ? 'PASS' : 'FAIL'} :: ${r.line ?? r.bad?.join('; ')}`)
  const page = await openPage()
  const base = await restShot(page, 0)
  expectPass(safeboxCheck(base, 'control: real rest 0'), 'safebox control')
  await page.evaluate(() => { const d = document.createElement('div'); d.id = 'fv-patch'; d.style.cssText = 'position:fixed;left:900px;top:500px;width:200px;height:60px;background:#fff;z-index:2147483647'; document.body.appendChild(d) })
  const patched = await shot(page)
  await page.evaluate(() => document.getElementById('fv-patch').remove())
  expectFail(safeboxCheck(patched, 'bright patch 200x60 inside the box'), 'safebox bright-patch fixture', /p99\.5 2\d\d/)
  expectFail(safeboxCheck(base, 'zero-size crop', { left: 0.5, top: 0.5, width: 0, height: 0.2 }), 'safebox empty-crop fixture')
  expectFail(safeboxCheck(new Uint8Array(0), 'zero-length frame'), 'safebox empty-frame fixture')
  expectPass(contrastCheck(themeTextColor(), 68, 'control: theme text vs the 68 cap'), 'contrast control')
  expectFail(contrastCheck('#5a5048', 30, 'low-contrast fixture #5a5048 on luma 30'), 'contrast low-contrast fixture')
  // census (against the frozen baseline): controls, then each fixture must FAIL
  const bl = loadBaseline()
  if (!bl) out('FAIL', 'census fixtures need scripts/forest-census.frozen.json (run census --freeze-baseline)')
  const cen = async (k, idle = false) => judgeCensus(await page.evaluate(censusRaw), idle, bl?.stations?.[k])
  await rest(page, 0); expectPass(await cen(0), 'census control (station 0)')
  await rest(page, 1); expectPass(await cen(1), 'census control (station 1, has a lantern flicker)')
  await page.evaluate(() => {
    const s = document.createElement('style'); s.id = 'fv-kf'; s.textContent = '@keyframes fv-pulse{from{left:0}to{left:40px}}'; document.head.appendChild(s)
    const d = document.createElement('div'); d.id = 'fv-anim'; d.style.cssText = 'position:absolute;width:10px;height:10px;animation:fv-pulse 2s linear infinite'
    document.querySelector('.fs-world').appendChild(d)
  })
  expectFail(await cen(1), 'census unexpected-animation fixture', /unexpected: fv-pulse/)
  await page.evaluate(() => { document.getElementById('fv-anim').remove(); document.getElementById('fv-kf').remove() })
  await rest(page, 0)
  await page.evaluate(() => { document.querySelector('.fs-stage .drift').style.animation = 'none' })
  expectFail(await cen(0), 'census one-fog-drift-removed fixture', /fog drift 17 vs baseline 18: missing \[\S+\] extra \[\]/)
  await rest(page, 0)
  await page.evaluate(() => {
    const e = [...document.querySelectorAll('.fs-world .it')].find(x => !x.querySelector('.drift'))
    e.classList.add('drift'); e.style.setProperty('--d', '5s'); e.style.setProperty('--dx', '3px'); e.style.setProperty('--dl', '0s')
  })
  expectFail(await cen(0), 'census drift-on-wrong-element fixture', /extra \[\S+\]/)
  await rest(page, 1)
  await page.evaluate(() => {
    const f = document.querySelector('.fs-stage .flick'); f.classList.remove('flick')
    const other = [...document.querySelectorAll('.fs-world .ly')].find(x => x !== f && !x.classList.contains('drift') && !x.classList.contains('flick'))
    other.classList.add('flick')
  })
  expectFail(await cen(1), 'census flicker-moved-to-wrong-element fixture', /flicker targets/)
  await rest(page, 0)
  await page.evaluate(() => document.querySelectorAll('.fs-stage .creep')[0].remove())
  expectFail(await cen(0), 'census removed-layer fixture (one .creep layer gone)', /creep transitions 1, want 2/)
  // synthetic lists: idle running at rest start; a second on-screen flicker
  const creeps2 = [1, 2].map(() => ({ name: 'transition:transform', cls: 'creep', props: ['transform'], duration: 40000, iterations: 1 }))
  expectFail(judgeCensus([{ name: 'fs-idle', isRig: true, cls: 'fs-rig idle', props: ['transform'], iterations: Infinity, duration: 7300 }, ...creeps2], false, { drift: [], flick: [] }), 'census idle-at-rest-start fixture', /^idle sway running at rest start[^;]*$/)
  expectFail(judgeCensus([...[1, 2].map((x, i) => ({ name: 'fs-flick', path: `x/${i}`, cls: 'ly flick', props: ['opacity'], opMin: 0.88, opMax: 1, duration: 2700, onScreen: true })), ...creeps2], false, { drift: [], flick: [{ path: 'x/0', onScreen: true }, { path: 'x/1', onScreen: true }] }), 'census two-flickers-on-screen fixture', /^2 lantern flickers on screen at once \(max 1\)$/)
  await page.context().close()
  // reduced motion: control, then an animation injected under reduced motion must FAIL
  const rp = await openPage({ reducedMotion: true })
  await rest(rp, 0)
  expectPass(judgeRM(await rp.evaluate(censusRaw), 'rest'), 'reduced-motion control (rest 0)')
  await rp.evaluate(() => { const d = document.createElement('div'); document.querySelector('.fs-world').appendChild(d); d.animate([{ transform: 'none' }, { transform: 'scale(2)' }], { duration: 1000, iterations: Infinity }) })
  expectFail(judgeRM(await rp.evaluate(censusRaw), 'rest'), 'reduced-motion injected-animation fixture', /web-animation/)
  await rp.context().close()
  // strobe: the spec's four known-answer fixtures through the production verdict
  for (const [sp, c, want] of [[7.5, 0.09, true], [8.5, 0.11, false], [8.5, 0.09, true], [7.5, 0.11, true]]) {
    const got = strobeVerdict(sp, c)
    out(got === want ? 'PASS' : 'FAIL', `strobe spec fixture (${sp} px/frame, ${c}): verdict ${got ? 'PASS' : 'FAIL'} (spec: ${want ? 'PASS' : 'FAIL'})`)
  }
  // strobe raster fixtures through the production path (speed sampler + hide-and-compare + verdict)
  const sp = await openPage()
  const strobeFixture = async (bg, label) => {
    await rest(sp, 0)
    await sp.evaluate(bg => {
      const s = document.createElement('style'); s.id = 'fv-skf'; s.textContent = '@keyframes fv-slide{from{transform:translateX(0)}to{transform:translateX(1600px)}}'; document.head.appendChild(s)
      const d = document.createElement('div'); d.id = 'fv-sl'; d.setAttribute('data-fv-layer', '')
      d.style.cssText = `position:absolute;left:100px;top:420px;width:300px;height:200px;background:${bg};animation:fv-slide 1600ms linear infinite`
      document.querySelector('.fs-world').appendChild(d)
    }, bg)
    const r = await strobeRun(sp, 1000, label)
    await sp.evaluate(() => { document.getElementById('fv-sl').remove(); document.getElementById('fv-skf').remove() })
    const row = r.rows.find(x => x.kind === 'fixture')
    return { row, others: r.rows.filter(x => x.kind !== 'fixture' && x.visible && !x.pass).length }
  }
  const bright = await strobeFixture('#fff', 'fixture bright')
  const bOk = bright.row && bright.row.visible && bright.row.speed > STROBE_SPEED_PX && !bright.row.pass
  out(bOk ? 'PASS' : 'FAIL', `strobe raster fixture: fast BRIGHT layer must FAIL the gate: ${bright.row ? strobeLine(bright.row) + ` -> ${bright.row.pass ? 'PASS (NOT caught)' : 'FAIL (caught)'}` : 'fixture layer not over the speed lock (NOT measured)'}`)
  const dim = await strobeFixture('rgba(255,255,255,.012)', 'fixture dim')
  const dOk = dim.row && dim.row.visible && dim.row.speed > STROBE_SPEED_PX && dim.row.pass && dim.others === 0
  out(dOk ? 'PASS' : 'FAIL', `strobe raster fixture: same-speed DIM layer must PASS: ${dim.row ? strobeLine(dim.row) + ` -> ${dim.row.pass ? 'PASS' : 'FAIL'}` : 'fixture layer not measured'}`)
  // stale / unfrozen frame: something moving that freeze() cannot hold must be rejected, never measured
  await rest(sp, 0)
  await sp.evaluate(() => {
    const s = document.createElement('style'); s.id = 'fv-skf'; s.textContent = '@keyframes fv-slide{from{transform:translateX(0)}to{transform:translateX(1600px)}}'; document.head.appendChild(s)
    const d = document.createElement('div'); d.id = 'fv-live'; d.style.cssText = 'position:fixed;left:0;top:420px;width:300px;height:200px;background:#fff;z-index:2147483647;animation:fv-slide 1600ms linear infinite'
    document.body.appendChild(d) // outside .fs-stage: freeze() does not reach it, so it keeps moving
  })
  let stale = 'measured (NOT rejected)'
  const wasPoisoned = poisoned
  try { await shot(sp) } catch (e) { stale = /POISONED/.test(e.message) ? 'rejected: POISONED' : `error: ${e.message}` }
  poisoned = wasPoisoned // the deliberate fixture must not poison the run
  await sp.evaluate(() => { document.getElementById('fv-live').remove(); document.getElementById('fv-skf').remove() })
  out(stale === 'rejected: POISONED' ? 'PASS' : 'FAIL', `strobe stale-frame fixture (unfrozen moving layer): ${stale}`)
  await sp.context().close()
}

// ---------------------------------------------------------------- main
const CMDS = { 'probe-api': probeApi, safebox, census, perf, 'covered-cut': coveredCut, 'reduced-motion': reducedMotion, strobe, selftest }
const cmd = process.argv[2]
// strobe is OFF in `all` (Ben, 2026-10-01: "turn it off for now"): the forest fails it with 7 dark layers (worst 8.57 px/frame,
// Michelson 0.287) and he will judge it by eye on the real TV. Still runnable on its own: `strobe [--walk A>B]`; selftest still
// proves the gate itself works. Put 'strobe' back here when the decision is made.
const run = cmd === 'all' ? ['probe-api', 'safebox', 'census', 'perf', 'covered-cut', 'reduced-motion'] : [cmd]
if (!run.every(c => CMDS[c])) { console.error('usage: node scripts/forest-verify.mjs probe-api|safebox|census [--freeze-baseline]|perf|covered-cut|reduced-motion|strobe [--walk A>B]|all|selftest'); process.exit(2) }
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
