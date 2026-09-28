// Frozen-frame capture + pixel diff for the ring world (Halloween spec §5.1).
//   node scripts/ring-baseline.mjs capture <outDir> [baseUrl] [query]
//   node scripts/ring-baseline.mjs diff <dirA> <dirB>
//   node scripts/ring-baseline.mjs probe <baseUrl>     (known-answer test of the diff tool)
// Bundled Chromium only (never Ben's real Chrome). Needs a running dev server.
import { chromium } from '@playwright/test'
import { PNG } from 'pngjs'
import fs from 'node:fs'
import path from 'node:path'

const W = 1920, H = 1080, STATIONS = 13, SETTLE_MS = 3500

function diffPng(a, b) {
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
  await page.goto(`${baseUrl}/ambient?${query}`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  for (let i = 0; i < STATIONS; i++) {
    await page.waitForTimeout(SETTLE_MS)
    // Hide the audit's own Turn/Auto-play overlay so only the world is compared.
    await page.evaluate(() => document.querySelectorAll('button').forEach(b => { b.parentElement.style.visibility = 'hidden' }))
    await page.screenshot({ path: path.join(outDir, `station-${String(i).padStart(2, '0')}.png`), animations: 'disabled', caret: 'hide' })
    await page.evaluate(() => document.querySelectorAll('button').forEach(b => { b.parentElement.style.visibility = '' }))
    await page.getByRole('button', { name: /^Turn/ }).click()
  }
  await browser.close()
  if (errors.length) console.error('page errors:', errors.slice(0, 3))
  console.log(`captured ${STATIONS} frames -> ${outDir}`)
}

function diffDirs(a, b) {
  let bad = 0
  for (let i = 0; i < STATIONS; i++) {
    const f = `station-${String(i).padStart(2, '0')}.png`
    const r = diffPng(path.join(a, f), path.join(b, f))
    if (r.differing !== 0) bad++
    console.log(f, r.differing === 0 ? 'IDENTICAL' : `DIFF px=${r.differing} maxChannelDelta=${r.max}`)
  }
  return bad
}

const [cmd, ...rest] = process.argv.slice(2)
if (cmd === 'capture') await capture(...rest)
else if (cmd === 'diff') process.exit(diffDirs(rest[0], rest[1]) ? 1 : 0)
else if (cmd === 'probe') {
  // Known-answer probe: same world twice must be identical; a different query must differ.
  const base = rest[0], d = '/private/tmp/ring-probe'
  await capture(`${d}/a`, base); await capture(`${d}/b`, base)
  await capture(`${d}/c`, base, 'ring=1&colors=%23ff2200,%23ffd400&weights=0.55,0.45')
  const same = diffDirs(`${d}/a`, `${d}/b`)
  const other = diffDirs(`${d}/a`, `${d}/c`)
  const ok = same === 0 && other > 0
  console.log(ok ? 'PROBE OK: same=identical, recolored=different' : `PROBE FAILED same_bad=${same} other_bad=${other}`)
  process.exit(ok ? 0 : 1)
} else { console.error('usage: capture|diff|probe'); process.exit(2) }
