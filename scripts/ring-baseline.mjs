// Frozen-frame capture + pixel diff for the ring world (Halloween spec §5.1).
//   node scripts/ring-baseline.mjs capture <outDir> [baseUrl] [query]
//   node scripts/ring-baseline.mjs diff <dirA> <dirB>
//   node scripts/ring-baseline.mjs probe <baseUrl>     (known-answer test of the diff tool)
// Bundled Chromium only (never Ben's real Chrome). Needs a running dev server.
import { chromium } from '@playwright/test'
import { PNG } from 'pngjs'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execSync } from 'node:child_process'

// Static rest frames only: `animations: 'disabled'` jumps finite animations to their end and
// resets infinite ones to frame 0, so drift/twinkle/shooting-star MOTION is invisible here.
// motion.json (per-station DOM counts + computed animation names) covers that gap.
// Settle >= SURGE_MS 1700 + SKY_TINT_OUT_MS 3800 (ringPrimitives.js) + margin.
const W = 1920, H = 1080, STATIONS = 13, SETTLE_MS = 6000

function diffPng(a, b) {
  if (!fs.existsSync(a) || !fs.existsSync(b)) return { differing: -2, max: 255 }
  const A = PNG.sync.read(fs.readFileSync(a)), B = PNG.sync.read(fs.readFileSync(b))
  if (A.width !== B.width || A.height !== B.height) return { differing: -1, max: 255 }
  let differing = 0, max = 0
  for (let i = 0; i < A.data.length; i += 4) {
    const d = Math.max(
      Math.abs(A.data[i] - B.data[i]), Math.abs(A.data[i + 1] - B.data[i + 1]),
      Math.abs(A.data[i + 2] - B.data[i + 2]))
    if (d) { differing++; if (d > max) max = d }
  }
  return { differing, max }
}

async function capture(outDir, baseUrl = 'http://localhost:5199', query = 'ring=1') {
  fs.mkdirSync(outDir, { recursive: true })
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: W, height: H } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })
  const motion = {}
  await page.goto(`${baseUrl}/ambient?${query}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  for (let i = 0; i < STATIONS; i++) {
    await page.waitForTimeout(SETTLE_MS)
    const label = await page.getByRole('button', { name: /^Turn/ }).innerText()
    if (!label.includes(`station ${i} /`)) throw new Error(`station index mismatch at frame ${i}: button says "${label}"`)
    motion[i] = await page.evaluate(() => {
      const sel = ['.ring-star', '.ring-drift', '.ring-driftRun', '.ring-shootLane', '.ring-surge']
      return Object.fromEntries(sel.map(q => {
        const els = [...document.querySelectorAll(q)]
        const names = [...new Set(els.map(e => { const c = getComputedStyle(e); return `${c.animationName}@${c.animationDuration}` }))].sort()
        return [q, { count: els.length, anims: names }]
      }))
    })
    // Hide the audit's own Turn/Auto-play overlay so only the world is compared.
    await page.evaluate(() => document.querySelectorAll('button').forEach(b => { b.parentElement.style.visibility = 'hidden' }))
    await page.screenshot({ path: path.join(outDir, `station-${String(i).padStart(2, '0')}.png`), animations: 'disabled', caret: 'hide' })
    await page.evaluate(() => document.querySelectorAll('button').forEach(b => { b.parentElement.style.visibility = '' }))
    await page.getByRole('button', { name: /^Turn/ }).click()
  }
  await browser.close()
  fs.writeFileSync(path.join(outDir, 'motion.json'), JSON.stringify(motion, null, 1))
  const git = (c) => { try { return execSync(c, { encoding: 'utf8' }).trim() } catch { return 'n/a' } }
  fs.writeFileSync(path.join(outDir, 'provenance.json'), JSON.stringify({
    baseUrl, query, viewport: [W, H], settleMs: SETTLE_MS, gitSha: git('git rev-parse HEAD'),
    gitDirty: git('git status --porcelain -- client/src') !== '', playwright: git('npx playwright --version'),
  }, null, 1))
  if (errors.length) { console.error('page/console errors:', errors.slice(0, 3)); process.exitCode = 1 }
  console.log(`captured ${STATIONS} frames -> ${outDir}`)
}

function diffDirs(a, b) {
  let bad = 0
  for (let i = 0; i < STATIONS; i++) {
    const f = `station-${String(i).padStart(2, '0')}.png`
    const r = diffPng(path.join(a, f), path.join(b, f))
    if (r.differing !== 0) bad++
    console.log(f, r.differing === 0 ? 'IDENTICAL' : r.differing === -1 ? 'SIZE MISMATCH' : r.differing === -2 ? 'MISSING FRAME' : `DIFF px=${r.differing} maxChannelDelta=${r.max}`)
  }
  const count = d => fs.readdirSync(d).filter(f => f.endsWith('.png')).length
  if (count(a) !== count(b)) { console.log(`FRAME COUNT MISMATCH ${count(a)} vs ${count(b)}`); bad++ }
  for (const f of ['motion.json']) {
    const pa = path.join(a, f), pb = path.join(b, f)
    if (fs.existsSync(pa) && fs.existsSync(pb)) {
      const same = fs.readFileSync(pa, 'utf8') === fs.readFileSync(pb, 'utf8')
      console.log(f, same ? 'IDENTICAL' : 'DIFF'); if (!same) bad++
    }
  }
  return bad
}

const [cmd, ...rest] = process.argv.slice(2)
if (cmd === 'capture') { await capture(...rest); process.exit(process.exitCode ?? 0) }
else if (cmd === 'diff') process.exit(diffDirs(rest[0], rest[1]) ? 1 : 0)
else if (cmd === 'probe') {
  // Known-answer probe: same world twice must be identical; a different query must differ.
  const base = rest[0], d = fs.mkdtempSync(path.join(os.tmpdir(), 'ring-probe-'))
  await capture(`${d}/a`, base); await capture(`${d}/b`, base)
  await capture(`${d}/c`, base, 'ring=1&colors=%23ff2200,%23ffd400&weights=0.55,0.45')
  const same = diffDirs(`${d}/a`, `${d}/b`)
  const other = diffDirs(`${d}/a`, `${d}/c`)
  // Second must-differ case: one flipped pixel in a copied frame.
  const e = `${d}/e`; fs.cpSync(`${d}/a`, e, { recursive: true })
  const png = PNG.sync.read(fs.readFileSync(`${e}/station-05.png`)); png.data[0] ^= 1
  fs.writeFileSync(`${e}/station-05.png`, PNG.sync.write(png))
  const onePx = diffPng(`${d}/a/station-05.png`, `${e}/station-05.png`)
  const ok = same === 0 && other > 0 && onePx.differing === 1
  console.log(ok ? 'PROBE OK: same=identical, recolored=different, single-pixel flip detected' : `PROBE FAILED same_bad=${same} other_bad=${other} onePx=${onePx.differing}`)
  process.exit(ok ? 0 : 1)
} else { console.error('usage: capture|diff|probe'); process.exit(2) }
