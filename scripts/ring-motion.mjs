// Frozen MOTION samples for the ring world (Halloween forest spec gate 1b).
//   node scripts/ring-motion.mjs capture <out.json> [baseUrl]
//   node scripts/ring-motion.mjs diff <a.json> <b.json>
//   node scripts/ring-motion.mjs probe [baseUrl]    (known-answer test of capture + diff)
// ring-baseline.mjs frames use animations:'disabled' and cannot see motion; this drives a real
// turn(), pauses every finite CSS transition/animation it started, sets currentTime to 0/25/50/75/100%
// of that animation's own duration, and records computed transform/opacity + timing + easing.
// Bundled Chromium only. Needs a running dev server (default http://localhost:5199).
import { chromium } from '@playwright/test'
import fs from 'node:fs'

const W = 1920, H = 1080, FRACS = [0, 0.25, 0.5, 0.75, 1]
// from-station, direction. 12->0 is the forward wrap; 0->12 the backward pre-snap path.
const SCENARIOS = [[0, 1], [5, 1], [11, 1], [12, 1], [1, -1], [0, -1], [7, -1]]

async function sample(page, from, dir) {
  await page.evaluate(([f]) => window.__world.jumpTo(f), [from])
  await page.waitForTimeout(400) // let the snap's own writes land; jumpTo leaves no transition in flight
  return page.evaluate(([dir, FRACS]) => {
    const r3 = s => s.replace(/-?\d+\.\d+/g, m => String(Math.round(parseFloat(m) * 1000) / 1000))
    const label = el => {
      const cls = (el.className && el.className.baseVal === undefined ? el.className : '').toString().split(/\s+/).filter(Boolean).join('.')
      const sib = el.parentElement ? [...el.parentElement.children].indexOf(el) : -1
      return `${el.tagName.toLowerCase()}.${cls}#${el.id || ''}@${sib}`
    }
    const before = window.__world.station
    window.__world.turn(dir) // synchronous: starts the walk, writes transforms/classes
    const after = window.__world.station
    const anims = document.getAnimations().filter(a => {
      const e = a.effect, t = e && e.getComputedTiming()
      // Shooting stars spawn on a random timer, independent of turn(): not camera motion, and one
      // mid-flight at sample time made two identical runs differ (probe caught it, 2026-10-01).
      const shoot = e && e.target && e.target.closest && e.target.closest('.ring-shootLane, .ring-shoot')
      return t && !shoot && Number.isFinite(t.endTime) && t.endTime > 0 && (a instanceof CSSTransition || a instanceof CSSAnimation)
    })
    const rows = anims.map(a => {
      const t = a.effect.getComputedTiming(), tm = a.effect.getTiming()
      return { a, key: `${a.transitionProperty || a.animationName}|${label(a.effect.target)}`,
        timing: { duration: t.duration, delay: t.delay, endTime: t.endTime, easing: tm.easing, fill: tm.fill } }
    }).sort((x, y) => x.key < y.key ? -1 : x.key > y.key ? 1 : 0)
    rows.forEach(r => r.a.pause())
    const frames = {}
    for (const f of FRACS) {
      rows.forEach(r => { r.a.currentTime = f * r.timing.endTime })
      frames[f] = Object.fromEntries(rows.map(r => {
        const c = getComputedStyle(r.a.effect.target)
        return [r.key, { transform: r3(c.transform), opacity: r3(c.opacity) }]
      }))
    }
    // Wrap reset is a setTimeout (real time, 1760 ms): not reached inside this synchronous sample.
    return { before, after, anims: rows.map(r => ({ key: r.key, ...r.timing })), frames }
  }, [dir, FRACS])
}

async function capture(outFile, baseUrl = 'http://localhost:5199') {
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: W, height: H } })
  const errors = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto(`${baseUrl}/ambient?ring=1`, { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  await page.waitForFunction(() => window.__world && window.__world.ENGINE)
  const out = { viewport: [W, H], scenarios: {} }
  for (const [from, dir] of SCENARIOS) {
    out.scenarios[`${from}${dir > 0 ? '+' : '-'}`] = await sample(page, from, dir)
    await page.waitForTimeout(2200) // wrap deferred reset + busy unlock before the next scenario's jumpTo
  }
  await browser.close()
  fs.writeFileSync(outFile, JSON.stringify(out, null, 1))
  const n = Object.values(out.scenarios).map(s => s.anims.length)
  console.log(`captured ${SCENARIOS.length} scenarios (animations per scenario: ${n.join(',')}) -> ${outFile}`)
  if (errors.length) { console.error('page errors:', errors.slice(0, 3)); process.exitCode = 1 }
}

function diffFiles(a, b) {
  const A = JSON.parse(fs.readFileSync(a, 'utf8')), B = JSON.parse(fs.readFileSync(b, 'utf8'))
  let bad = 0
  for (const k of new Set([...Object.keys(A.scenarios), ...Object.keys(B.scenarios)])) {
    const same = JSON.stringify(A.scenarios[k]) === JSON.stringify(B.scenarios[k])
    console.log(k, same ? 'IDENTICAL' : 'DIFF'); if (!same) bad++
  }
  return bad
}

const [cmd, ...rest] = process.argv.slice(2)
if (cmd === 'capture') { await capture(...rest); process.exit(process.exitCode ?? 0) }
else if (cmd === 'diff') process.exit(diffFiles(rest[0], rest[1]) ? 1 : 0)
else if (cmd === 'probe') {
  // Same code twice must be identical; a doctored sample (one transform digit) must differ;
  // and a sampler that saw ZERO animations must be rejected (empty-capture guard).
  const base = rest[0], d = fs.mkdtempSync('/tmp/ring-motion-probe-')
  await capture(`${d}/a.json`, base); await capture(`${d}/b.json`, base)
  const same = diffFiles(`${d}/a.json`, `${d}/b.json`)
  const doc = JSON.parse(fs.readFileSync(`${d}/a.json`, 'utf8'))
  const first = doc.scenarios['0+'].frames['0.5']; const key = Object.keys(first).find(k => first[k].transform.startsWith('matrix'))
  first[key].transform = first[key].transform.replace(/\d/, c => String((+c + 1) % 10))
  fs.writeFileSync(`${d}/c.json`, JSON.stringify(doc, null, 1))
  const doctored = diffFiles(`${d}/a.json`, `${d}/c.json`)
  const empty = Object.values(JSON.parse(fs.readFileSync(`${d}/a.json`, 'utf8')).scenarios).filter(s => s.anims.length === 0).length
  const ok = same === 0 && doctored > 0 && empty === 0
  console.log(ok ? 'PROBE OK: repeat identical, doctored sample detected, no empty scenario' : `PROBE FAILED same_bad=${same} doctored_bad=${doctored} empty=${empty}`)
  process.exit(ok ? 0 : 1)
} else { console.error('usage: capture|diff|probe'); process.exit(2) }
