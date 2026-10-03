// LOCALIZED-change sampler for the haunted forest walks (spec 2026-10-01 section 3: "no frame in a walk may change
// by a localized blob"). The older checks averaged change over the whole frame, which cannot see one tree popping.
//
//   node scripts/forest-blob-check.mjs [--url <page>] [--seed N] --walk A [--walk B ...] [--frames <dir>] [--json <file>]
//   node scripts/forest-blob-check.mjs --probes [--url <page>]
//
// --url defaults to concepts/haunted-forest-route-v4.html (file://); "?bare&noq" is added. Works on any page that
// exposes window.__route (v4) or window.__forest (v3) with jump(k) / advance().
//
// FROZEN-TIME METHOD (as scripts/forest-verify.mjs): Playwright's fake clock is installed and paused, so the page's
// timers never fire on their own. Every animation and transition under #stage is paused and its currentTime set to
// t (getAnimations({subtree:true})). Each capture waits to settle, then is retaken until two consecutive PNGs are
// byte-identical (headless Chromium was measured needing > 1 s to raster a freshly built walk's layers: two
// identical BLANK captures 120 ms apart passed the old retake rule). A walk A>A+1 is sampled as: rest(A) frozen at
// 0; advance(); t = 0, 100, ... dur; then the clock runs past the walk's end timer (the rest rebuild) and the new
// rest frame is frozen at 0. So the pairs cover the rest->walk rebuild, every 100 ms step, and the walk->rest rebuild.
//
// METRIC per consecutive frame pair i:
//   mean    = mean over pixels of the max-channel |delta| (the old whole-frame number)
//   cnt     = per 16 px cell, pixels whose max-channel |delta| > 24
//   raw blobs: cells with cnt >= 25% of 256 joined 8-connected (area = changed px, fill = area / bbox area)
//   POP blobs: the same on the EXCESS grid  ex_i = max(0, cnt_i - min(dil(cnt_i-1), dil(cnt_i+1)))  where dil is a
//     max over +-10 cells (160 px). A moving edge changes pixels in the step before and after it too, close by; a
//     pop changes them in one step from nothing (or vanishes into nothing). The rebuild pairs (rest->0, end->rest+)
//     have no outer neighbour (counted as 0): those two frames should be identical, any solid change there is a pop.
//   A POP blob is FLAGGED when it is compact and solid and big (LINE) and does not touch the frame edge. A solid blob
//   touching the edge is an item leaving by the edge (the designed exit): reported as edgeExits, not flagged.
// Known blind spots: a pop right next to fast motion (within 160 px, in the steps around it) is masked; a dark item
// vanishing against an equally dark patch changes no pixel by > 24.
import { chromium } from '@playwright/test'
import { PNG } from 'pngjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const W = 1920, H = 1080, CELL = 16, GW = W / CELL, GH = Math.ceil(H / CELL), DTH = 24, ON = CELL * CELL * 0.25, STEP = 100, DIL = 10
// PROVISIONAL flag line (Ben's call; proposed from the measured walks and probes, see the report): a POP blob with
// bbox >= 40x40 px, fill >= 0.5 and >= 6000 changed px. Change it here only.
const LINE = { minSide: 40, fill: 0.5, area: 6000 }

const args = process.argv.slice(2)
const opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1] }
const many = k => args.flatMap((a, i) => a === k ? [args[i + 1]] : [])
const pageUrl = (() => {
  const u = opt('--url', path.join(ROOT, 'concepts/haunted-forest-route-v4.html'))
  const base = /^(https?|file):/.test(u) ? u : pathToFileURL(path.resolve(u)).href
  const [p, h] = base.split('#'), seed = opt('--seed', null)
  return p + (p.includes('?') ? '&' : '?') + 'bare&noq' + (seed !== null ? '&seed=' + seed : '') + (h ? '#' + h : '')
})()

// ---------------------------------------------------------------- image math
function decode(buf) { const p = PNG.sync.read(buf); if (p.width !== W || p.height !== H) throw new Error(`capture ${p.width}x${p.height}`); return p.data }
function diffGrid(a, b) {
  const cnt = new Int32Array(GW * GH); let sum = 0
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4
    const d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]))
    sum += d; if (d > DTH) cnt[((y / CELL) | 0) * GW + ((x / CELL) | 0)]++
  }
  return { mean: +(sum / (W * H)).toFixed(3), cnt }
}
function dilate(g) {
  if (!g) return new Int32Array(GW * GH)
  const h = new Int32Array(GW * GH), o = new Int32Array(GW * GH)
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { let m = 0; for (let k = Math.max(0, x - DIL); k <= Math.min(GW - 1, x + DIL); k++) m = Math.max(m, g[y * GW + k]); h[y * GW + x] = m }
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { let m = 0; for (let k = Math.max(0, y - DIL); k <= Math.min(GH - 1, y + DIL); k++) m = Math.max(m, h[k * GW + x]); o[y * GW + x] = m }
  return o
}
function blobsOf(g) {
  const seen = new Uint8Array(GW * GH), out = []
  for (let s = 0; s < g.length; s++) {
    if (g[s] < ON || seen[s]) continue
    const st = [s]; seen[s] = 1; let area = 0, x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1
    while (st.length) {
      const c = st.pop(), cx = c % GW, cy = (c / GW) | 0
      area += g[c]; x0 = Math.min(x0, cx); x1 = Math.max(x1, cx); y0 = Math.min(y0, cy); y1 = Math.max(y1, cy)
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = cx + dx, ny = cy + dy, n = ny * GW + nx
        if (nx >= 0 && ny >= 0 && nx < GW && ny < GH && g[n] >= ON && !seen[n]) { seen[n] = 1; st.push(n) }
      }
    }
    const bbox = [x0 * CELL, y0 * CELL, Math.min(W, (x1 + 1) * CELL), Math.min(H, (y1 + 1) * CELL)], w = bbox[2] - bbox[0], h = bbox[3] - bbox[1]
    out.push({ area, bbox, w, h, fill: +(area / (w * h)).toFixed(3) })
  }
  return out.sort((p, q) => q.area - p.area)
}
const edge = b => b.bbox[0] <= 0 || b.bbox[1] <= 0 || b.bbox[2] >= W || b.bbox[3] >= H
const solid = b => b.w >= LINE.minSide && b.h >= LINE.minSide && b.fill >= LINE.fill && b.area >= LINE.area
// grids: per-pair change grids in time order; a missing neighbour counts as no change (ends:true)
function analyse(grids, means, labels, { ends = true } = {}) {
  return grids.map((g, i) => {
    const prev = i > 0 ? grids[i - 1] : (ends ? null : grids[i + 1]), next = i < grids.length - 1 ? grids[i + 1] : (ends ? null : grids[i - 1])
    const dp = dilate(prev), dn = dilate(next), ex = new Int32Array(GW * GH)
    for (let c = 0; c < ex.length; c++) ex[c] = Math.max(0, g[c] - Math.min(dp[c], dn[c]))
    const raw = blobsOf(g), pop = blobsOf(ex), pops = pop.filter(solid)
    return { pair: labels[i], mean: means[i], rawLargest: raw[0] || null, rawBig: raw.filter(b => b.w >= 40 && b.h >= 40).length,
      popLargest: pop[0] || null, flagged: pops.filter(b => !edge(b)), edgeExits: pops.filter(edge) }
  })
}

// ---------------------------------------------------------------- page driving
let browser
// v4 (wander mode, window.__route.clk): no rest/walk rebuild. Load at station A's arc, wander 1 s, advance() (the
// quicken), sample every 100 ms of the page clock until 1.5 s after the quicken has eased back. freeze() pins every
// animation to the fake clock; page.clock.runFor(100) moves it on (and fires the page's own speed-step timer).
async function sampleWander(a, framesDir) {
  const page = await openPage(`#s=${a}`)
  await page.evaluate(() => window.__route.freeze())
  const shots = [{ t: 0, png: await shotPng(page, REBUILD_SETTLE) }]
  let t = 0
  const step = async () => { await page.clock.runFor(STEP); t += STEP; await page.evaluate(() => window.__route.freeze()); shots.push({ t, png: await shotPng(page) }) }
  for (let i = 0; i < 10; i++) await step()
  const T = await page.evaluate(() => window.__route.advance()), adv = t
  const stats = await page.evaluate(() => window.__route.stats())
  while (t < adv + T + 1500) await step()
  if (page.errors.length) throw new Error('page errors: ' + page.errors.join('; '))
  const speed = await page.evaluate(() => window.__route.stats().v)
  await page.context().close()
  if (framesDir) { fs.mkdirSync(framesDir, { recursive: true }); shots.forEach((f, i) => fs.writeFileSync(path.join(framesDir, `f${String(i).padStart(3, '0')}_${f.t}.png`), f.png)) }
  const grids = [], means = [], labels = []; let prev = decode(shots[0].png)
  for (let i = 1; i < shots.length; i++) { const cur = decode(shots[i].png), d = diffGrid(prev, cur); grids.push(d.cnt); means.push(d.mean); labels.push(`${shots[i - 1].t}->${shots[i].t}`); prev = cur }
  return { walk: `${a}>${(a + 1) % 13} (advance at ${adv} ms, quicken ${T} ms, wander after: ${speed} m/s)`, dur: T, stats, pairs: analyse(grids, means, labels, { ends: false }) }
}
// idle: no input for `secs` seconds of page clock; every 10 s one 100 ms pair, measured INSIDE the text box
// (60% x 45%, centred): mean max-channel delta and pixels over 24, per 100 ms and per 60 Hz frame (/6)
async function idleBox(secs) {
  const page = await openPage('#s=2'), BX = [384, 297, 1536, 783], out = []
  await page.evaluate(() => window.__route.freeze()); await shotPng(page, REBUILD_SETTLE)
  const box = buf => { const d = decode(buf); return d }
  for (let s = 0; s < secs; s += 10) {
    await page.clock.runFor(s ? 9900 : 0); await page.evaluate(() => window.__route.freeze()); const a = box(await shotPng(page, 600))
    await page.clock.runFor(100); await page.evaluate(() => window.__route.freeze()); const b = box(await shotPng(page))
    let sum = 0, n = 0, over = 0
    for (let y = BX[1]; y < BX[3]; y++) for (let x = BX[0]; x < BX[2]; x++) { const i = (y * W + x) * 4, d = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2])); sum += d; n++; if (d > DTH) over++ }
    out.push({ t: s, meanPer100ms: +(sum / n).toFixed(3), over24: over, u: await page.evaluate(() => window.__route.u()) })
  }
  await page.context().close()
  return out
}
async function openPage(hash = '') {
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  const page = await ctx.newPage()
  page.errors = []; page.on('pageerror', e => page.errors.push(e.message))
  const t0 = Date.now(); await page.clock.install({ time: t0 }); await page.clock.pauseAt(t0 + 1000)
  await page.goto(pageUrl + hash, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__route || window.__forest, null, { timeout: 20000 })
  page.api = await page.evaluate(() => window.__route ? '__route' : '__forest')
  return page
}
const freeze = (page, t) => page.evaluate(t => { for (const a of document.getElementById('stage').getAnimations({ subtree: true })) { a.pause(); a.currentTime = t } }, t)
let unstable = 0
async function shotPng(page, settle = 300) {
  await page.waitForTimeout(settle)
  let prev = await page.screenshot({ type: 'png' })
  for (let i = 0; i < 12; i++) {
    await page.waitForTimeout(150)
    const cur = await page.screenshot({ type: 'png' })
    if (cur.equals(prev)) return cur
    unstable++; prev = cur
  }
  throw new Error('POISONED: frozen frame never produced two identical captures in a row')
}
const REBUILD_SETTLE = 3000

async function sampleWalk(a, framesDir) {
  const page = await openPage(), api = page.api
  await page.evaluate(([api, a]) => window[api].jump(a), [api, a])
  await freeze(page, 0)
  const dur = await page.evaluate(([api, a]) => api === '__route' ? window.__route.walkDur((a + 1) % window.__route.stations)
    : parseFloat(getComputedStyle(document.getElementById('stage')).getPropertyValue('--walk')), [api, a])
  const shots = [{ t: 'rest', png: await shotPng(page, REBUILD_SETTLE) }]
  await page.evaluate(api => window[api].advance(), api)
  const stats = api === '__route' ? await page.evaluate(() => window.__route.stats())
    : await page.evaluate(() => ({ items: document.querySelectorAll('#world .it').length, anims: document.getElementById('stage').getAnimations({ subtree: true }).length }))
  const ts = []; for (let t = 0; t < dur; t += STEP) ts.push(t); ts.push(dur)
  for (const t of ts) { await freeze(page, t); shots.push({ t, png: await shotPng(page, t ? 300 : REBUILD_SETTLE) }) }
  await page.clock.runFor(dur + 100)          // the walk's end timer: rebuild as the rest frame of station a+1
  await freeze(page, 0)
  shots.push({ t: 'rest+', png: await shotPng(page, REBUILD_SETTLE) })
  if (page.errors.length) throw new Error('page errors: ' + page.errors.join('; '))
  await page.context().close()
  if (framesDir) { fs.mkdirSync(framesDir, { recursive: true }); shots.forEach((f, i) => fs.writeFileSync(path.join(framesDir, `f${String(i).padStart(3, '0')}_${f.t}.png`), f.png)) }
  const grids = [], means = [], labels = []; let prev = decode(shots[0].png)
  for (let i = 1; i < shots.length; i++) { const cur = decode(shots[i].png), d = diffGrid(prev, cur); grids.push(d.cnt); means.push(d.mean); labels.push(`${shots[i - 1].t}->${shots[i].t}`); prev = cur }
  return { walk: `${a}>${(a + 1) % 13}`, dur, stats, pairs: analyse(grids, means, labels) }
}

function summarize(w) {
  const by = k => w.pairs.flatMap(p => p[k] ? [{ ...p[k], at: p.pair }] : []).sort((p, q) => q.area - p.area)[0] || null
  return {
    walk: w.walk, dur: w.dur, ...w.stats, maxMean: Math.max(...w.pairs.map(p => p.mean)),
    worstRawBlob: by('rawLargest'), maxRawBig: Math.max(...w.pairs.map(p => p.rawBig)), worstPopBlob: by('popLargest'),
    flagged: w.pairs.flatMap(p => p.flagged.map(b => ({ at: p.pair, area: b.area, bbox: b.bbox, fill: b.fill }))),
    edgeExits: w.pairs.flatMap(p => p.edgeExits.map(b => ({ at: p.pair, area: b.area, bbox: b.bbox }))).length,
  }
}

// ---------------------------------------------------------------- probes: can it see a pop?
async function probes() {
  const page = await openPage()
  if (await page.evaluate(() => !!(window.__route && window.__route.clk))) await page.evaluate(() => window.__route.freeze())
  else { await page.evaluate(api => window[api].jump(0), page.api); await freeze(page, 0) }
  const put = css => page.evaluate(css => {
    let el = document.getElementById('probe'); if (!el) { el = document.createElement('div'); el.id = 'probe'; document.getElementById('stage').appendChild(el) }
    el.style.cssText = 'position:absolute;z-index:99;' + css
  }, css)
  const clear = () => page.evaluate(() => document.getElementById('probe')?.remove())
  const cap = async (settle = 300) => decode(await shotPng(page, settle))
  const RECT = 'left:1300px;top:240px;width:160px;height:200px;background:#8a7a62;'
  // a near trunk's size, placed where a dark trunk would be visible at all: the 130x700 window (x step 40) whose pixels
  // differ most often from #070706 by > 24 (against an equally dark patch a vanishing dark trunk changes nothing)
  const base = await cap(REBUILD_SETTLE)
  let best = [[0, 0], -1]
  for (let x = 0; x + 130 <= W; x += 40) for (const y of [150, 330]) {
    let n = 0; for (let yy = y; yy < y + 700; yy += 4) for (let xx = x; xx < x + 130; xx += 4) { const i = (yy * W + xx) * 4; if (Math.max(base[i] - 7, base[i + 1] - 7, base[i + 2] - 6) > DTH) n++ }
    if (n > best[1]) best = [[x, y], n]
  }
  const TREE = `left:${best[0][0]}px;top:${best[0][1]}px;width:130px;height:700px;background:#070706;`
  const seq = frames => { const g = [], m = [], l = []; for (let i = 1; i < frames.length; i++) { const d = diffGrid(frames[i - 1], frames[i]); g.push(d.cnt); m.push(d.mean); l.push(`${i - 1}->${i}`) } return [g, m, l] }
  const out = {}
  await put(RECT); const r1 = await cap(); await clear(); const r2 = await cap()
  out['a: 160x200 rect shown for one 100 ms step'] = analyse(...seq([base, base, r1, r2, r2]))
  await put(RECT + 'opacity:.5'); const f1 = await cap(); await put(RECT); const f2 = await cap(); await clear()
  out['b: same rect fading in over 100 ms (sampled mid-fade)'] = analyse(...seq([base, base, f1, f2, f2]))
  await put(TREE); const t1 = await cap(); await clear(); const t2 = await cap()
  out[`c: tree-sized dark rect (${best[0][0]},${best[0][1]}) disappearing`] = analyse(...seq([t1, t1, t2, t2]))
  // d: the whole scene scaling through smoothly about the vanishing point, 3% per 100 ms (interior pairs judged)
  const sc = []
  for (let i = 0; i < 7; i++) { await page.evaluate(k => { const c = document.getElementById('cam'); c.style.animation = 'none'; c.style.transformOrigin = '960px 700px'; c.style.transform = `scale(${k})` }, Math.pow(1.03, i)); sc.push(await cap()) }
  out['d: smooth scale-through of the whole scene (must NOT flag)'] = analyse(...seq(sc), { ends: false })
  await page.context().close()
  let ok = true
  for (const [k, ps] of Object.entries(out)) {
    const hit = ps.some(p => p.flagged.length), want = !k.startsWith('d')
    if (hit !== want) ok = false
    const pop = ps.flatMap(p => p.popLargest ? [p.popLargest] : []).sort((p, q) => q.area - p.area)[0]
    const raw = ps.flatMap(p => p.rawLargest ? [p.rawLargest] : []).sort((p, q) => q.area - p.area)[0]
    console.log(`${hit === want ? 'PASS' : 'FAIL'}  ${k}: ${hit ? 'FLAGGED' : 'not flagged'}; largest pop blob ${pop ? `${pop.area} px ${pop.w}x${pop.h} fill ${pop.fill}` : 'none'}; largest raw blob ${raw ? `${raw.area} px fill ${raw.fill}` : 'none'}`)
  }
  return ok
}

// ---------------------------------------------------------------- main
// REAL GPU: headless Chromium's default is SwiftShader (software raster, 5-9 fps), which also drops tiles under a small
// tile budget. Metal ANGLE + GPU raster is the TV-like path. --lowmem keeps the default tile budget (shows the risk);
// --swiftshader drops the GPU flags. Real-clock smoothness is judged by concepts/v4/record.mjs + analyze.py, not here.
const GPU = args.includes('--swiftshader') ? [] : ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist']
browser = await chromium.launch({ args: [...GPU, ...(args.includes('--lowmem') ? [] : ['--force-gpu-mem-available-mb=4096'])] })
try {
  console.log(`page ${pageUrl}`)
  console.log(`PROVISIONAL flag line: pop blob bbox >= ${LINE.minSide}x${LINE.minSide} px, fill >= ${LINE.fill}, >= ${LINE.area} px, not touching the frame edge (Ben's call)`)
  if (args.includes('--probes')) { const ok = await probes(); console.log(ok ? 'probes: all as expected' : 'probes: SOME UNEXPECTED') }
  const all = []
  for (const a of many('--walk').map(Number)) {
    const fd = opt('--frames') ? path.join(opt('--frames'), `walk${a}`) : null
    const p0 = await openPage(), wander = await p0.evaluate(() => !!(window.__route && window.__route.clk)); await p0.context().close()
    const w = wander ? await sampleWander(a, fd) : await sampleWalk(a, fd), s = summarize(w)
    all.push({ ...s, pairs: w.pairs }); console.log(JSON.stringify(s))
  }
  if (opt('--idle')) { const r = await idleBox(+opt('--idle')); const m = Math.max(...r.map(x => x.meanPer100ms)), o = Math.max(...r.map(x => x.over24)); console.log(`idle ${opt('--idle')} s, text box, one 100 ms pair every 10 s: max mean delta ${m} per 100 ms (~${(m / 6).toFixed(3)} per 60 Hz frame), max px over 24: ${o}`); console.log(JSON.stringify(r)) }
  if (opt('--json')) fs.writeFileSync(opt('--json'), JSON.stringify(all, null, 1))
  if (unstable) console.log(`(${unstable} retakes before frames settled)`)
} finally { await browser.close() }
