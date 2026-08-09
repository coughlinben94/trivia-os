// Direct-attribution debug tool for the safe-box luminance cap (regression
// tier, ART-DIRECTION-SPEC.md:76 §2). Retires safebox-contam-debug.mjs, whose
// area x alpha ranking answers the wrong question for a p99.5 (peak-pixel)
// metric — a large translucent lobe scores high on that ranking and
// contributes almost nothing to a peak-pixel stat; a small near-white core is
// the reverse. This tool instead: finds every pixel actually above the cap in
// the real screenshot, then calls document.elementsFromPoint() at those exact
// coordinates. No ranking heuristic, no guessing which element "looks like"
// the contributor.
//
// Mirrors ring-verify.mjs's own peak-forcing and luma math exactly (same
// --pa->--pa2 / --ob->--op mutation, same qLayer hide, same
// 0.2126/0.7152/0.0722 luma weights) so the numbers this reports line up with
// the gate's own.
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const target = process.argv[2] || path.join(__dirname, '../world-07-ring.html')
const station = parseInt(process.argv[3] ?? '4', 10)
const CAP = parseInt(process.argv[4] ?? '68', 10)
const runs = parseInt(process.argv[5] ?? '1', 10)

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript' }
const rootDir = path.resolve(__dirname, '../..')
const server = createServer(async (req, res) => {
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    const filePath = path.join(rootDir, path.normalize(urlPath))
    const data = await readFile(filePath)
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' })
    res.end(data)
  } catch { res.writeHead(404); res.end('Not found') }
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const relPath = '/' + path.relative(rootDir, path.resolve(target))
const url = target.startsWith('http') ? target : `http://127.0.0.1:${port}${relPath}`

function lumaAt(data, idx) { return 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2] }

// same percentile math as ring-verify.mjs's statsFromHist — used here to find
// the ACTUAL p99.5 threshold value, not just "anything above the cap." A
// percentile stat is set by pixel RANK, not by the extreme max: if the
// >cap tail is mostly a large dim population near the cap with a few rare,
// much-brighter outliers, p99.5 lands near the dim population, and sampling
// only the brightest pixels (the outliers) samples the wrong thing.
function percentilesOf(hist, total) {
  let cum = 0, mean = 0, sum = 0
  for (let v = 0; v < 256; v++) sum += hist[v] * v
  mean = sum / total
  let p95 = 255, p995 = 255
  let c95 = 0, c995 = 0
  const t95 = total * 0.95, t995 = total * 0.995
  for (let v = 0; v < 256; v++) {
    c95 += hist[v]; if (c95 >= t95 && p95 === 255) p95 = v
    c995 += hist[v]; if (c995 >= t995 && p995 === 255) p995 = v
  }
  return { mean, p95, p995 }
}

async function measureOnce(page, prefix, dRect) {
  const scale = dRect.width / 1920
  // same peak-forcing + qLayer hide as ring-verify.mjs
  await page.evaluate(() => {
    const qLayer = document.getElementById('qLayer')
    if (qLayer) { qLayer.dataset.saved = qLayer.style.display; qLayer.style.display = 'none' }
  })
  await page.evaluate((prefix) => {
    document.querySelectorAll('.' + prefix + 'star').forEach(el => {
      const cs = getComputedStyle(el)
      el.style.setProperty('--ob', cs.getPropertyValue('--op').trim())
    })
    document.querySelectorAll('.' + prefix + 'pf-breathe').forEach(el => {
      const cs = getComputedStyle(el)
      el.style.setProperty('--pa', cs.getPropertyValue('--pa2').trim())
    })
  }, prefix)

  const design = page.locator('#design')
  const buf = await design.screenshot()
  const png = PNG.sync.read(buf)

  await page.evaluate(() => {
    const qLayer = document.getElementById('qLayer')
    if (qLayer) { qLayer.style.display = qLayer.dataset.saved || ''; delete qLayer.dataset.saved }
  })

  const sx0 = Math.max(0, Math.floor(384 * scale)), sy0 = Math.max(0, Math.floor(302.4 * scale))
  const sx1 = Math.min(png.width, Math.ceil(1536 * scale)), sy1 = Math.min(png.height, Math.ceil(777.6 * scale))
  const boxW = sx1 - sx0, boxH = sy1 - sy0
  const boxTotal = boxW * boxH

  const hist = new Uint32Array(256)
  const bright = []
  for (let y = sy0; y < sy1; y++) {
    const rowBase = png.width * y
    for (let x = sx0; x < sx1; x++) {
      const idx = (rowBase + x) << 2
      const l = Math.max(0, Math.min(255, Math.round(lumaAt(png.data, idx))))
      hist[l]++
      if (l > CAP) bright.push({ x, y, l, r: png.data[idx], g: png.data[idx + 1], b: png.data[idx + 2] })
    }
  }
  const stats = percentilesOf(hist, boxTotal)
  bright.sort((a, b) => b.l - a.l)
  return { bright, boxTotal, sx0, sy0, sx1, sy1, scale, buf, png, stats }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto(url)
await page.waitForFunction(() => !!window.__world, null, { timeout: 8000 })
const prefix = await page.evaluate(() => window.__world.prefix ?? '')
await page.evaluate((st) => window.__world.jumpTo(st), station)
await page.waitForTimeout(150)
// Freeze every CSS animation (drift, twinkle, breathe) before doing ANYTHING
// else. Without this, the screenshot captures one instant but a later
// elementsFromPoint call — a real round-trip later — hits whatever moved
// into that pixel by THEN, not what's actually in the image. That mismatch
// is exactly what produced nonsense first-pass results here (a 1-3px star
// "hit" hundreds of px from the sample point).
await page.evaluate(() => document.getAnimations().forEach(a => a.pause()))
const dRect = await page.locator('#design').evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height } })

const results = []
for (let i = 0; i < runs; i++) {
  const r = await measureOnce(page, prefix, dRect)
  results.push(r)
}

const last = results[results.length - 1]
console.log(`dRect: ${JSON.stringify(dRect)}`)
console.log(`\nstation ${station} — safe box crop [${last.sx0},${last.sy0}]-[${last.sx1},${last.sy1}] (${last.boxTotal}px), cap=${CAP}, scale=${last.scale.toFixed(4)}`)

if (runs > 1) {
  console.log(`stability across ${runs} runs: counts above cap = [${results.map(r => r.bright.length).join(', ')}], max luma = [${results.map(r => r.bright[0]?.l ?? 0).join(', ')}]`)
}

const { bright, boxTotal, stats } = last
console.log(`measured: mean=${stats.mean.toFixed(1)} p95=${stats.p95} p99.5=${stats.p995} (this tool's own histogram, same math as the gate)`)
console.log(`pixels above ${CAP}: ${bright.length} (${(100 * bright.length / boxTotal).toFixed(3)}% of box)`)
console.log(`NOTE: p99.5 is a RANK statistic, not the max — it can sit near the low end of the >cap tail if that tail is a large dim population with only a few much-brighter outliers. Sampling brightest-first samples the outliers, not necessarily what sets the threshold. Below: brightest-first sample AND a sample near the actual p99.5 value.`)

if (bright.length > 0) {
  const xs = bright.map(p => p.x), ys = bright.map(p => p.y)
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys)
  console.log(`bright-pixel bbox: [${minX},${minY}]-[${maxX},${maxY}] (${maxX - minX}x${maxY - minY}) vs box ${last.sx1 - last.sx0}x${last.sy1 - last.sy0}`)

  // grid-cell scatter: 8x8 grid over the crop, count cells with >=1 bright pixel
  const GRID = 8
  const cellW = (last.sx1 - last.sx0) / GRID, cellH = (last.sy1 - last.sy0) / GRID
  const cells = new Set()
  bright.forEach(p => cells.add(`${Math.floor((p.x - last.sx0) / cellW)},${Math.floor((p.y - last.sy0) / cellH)}`))
  console.log(`spatial scatter: ${cells.size}/${GRID * GRID} grid cells touched (1 = single tight region, ${GRID * GRID} = fully scattered)`)

  function spreadSample(pool, n) {
    const seenCells = new Set(), out = []
    for (const p of pool) {
      const cell = `${Math.floor((p.x - last.sx0) / cellW)},${Math.floor((p.y - last.sy0) / cellH)}`
      if (out.length === 0 || !seenCells.has(cell)) { out.push(p); seenCells.add(cell) }
      if (out.length >= n) break
    }
    return out
  }

  const brightestSample = spreadSample(bright, 8)
  // near-p99.5 sample: the value that ACTUALLY sets the failing metric, not
  // the extreme max (see NOTE above) — pixels within +/-2 of stats.p995,
  // sorted by distance to it so the closest-to-threshold pixels come first.
  const nearP995Pool = bright.filter(p => Math.abs(p.l - stats.p995) <= 2).sort((a, b) => Math.abs(a.l - stats.p995) - Math.abs(b.l - stats.p995))
  const nearP995Sample = spreadSample(nearP995Pool, 8)

  async function hitTest(label, sample) {
    console.log(`\n[${label}] elementsFromPoint + first painting element, ${sample.length} sample point(s):`)
    for (const p of sample) {
      const vx = dRect.left + p.x, vy = dRect.top + p.y
      const hit = await page.evaluate(({ vx, vy }) => {
        const stackNames = []
        let paint = null
        for (const el of document.elementsFromPoint(vx, vy)) {
          const cs = getComputedStyle(el)
          // SVG shapes (circle/path/ellipse/rect/g/polygon) paint via the
          // `fill`/`stroke` SVG attribute or CSS fill property, NOT
          // background-image/color — a plain CSS check misses them
          // entirely. drawPlanetDisc's lit disc/terminator/rim/bands are
          // all SVG, so this matters directly for the 'planet' and 'ring'
          // kinds.
          const svgFill = (el instanceof SVGElement) && cs.fill && cs.fill !== 'none' && cs.fill !== 'rgba(0, 0, 0, 0)'
          const paints = cs.backgroundImage !== 'none' || cs.boxShadow !== 'none' || svgFill ||
            (cs.backgroundColor && !/rgba?\([^)]*,\s*0\)|transparent/.test(cs.backgroundColor))
          stackNames.push(el.tagName + (el.className ? '.' + String(el.className).trim().split(/\s+/).join('.') : '') + (paints ? '[PAINTS]' : '') + (svgFill ? '[SVG]' : ''))
          if (paints && !paint) {
            const r = el.getBoundingClientRect()
            paint = { cls: el.className, tag: el.tagName, rect: [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)], opacity: cs.opacity, bg: cs.background.slice(0, 100), boxShadow: cs.boxShadow.slice(0, 100), svgFill: cs.fill, svgStroke: cs.stroke }
          }
        }
        return { stackNames, paint }
      }, { vx, vy })
      console.log(`  (${p.x},${p.y}) luma=${p.l} rgb=(${p.r},${p.g},${p.b}) vx,vy=(${vx.toFixed(0)},${vy.toFixed(0)})`)
      console.log(`    stack: ${hit.stackNames.join(' < ')}`)
      if (hit.paint) console.log(`    contributor: ${hit.paint.tag}.${String(hit.paint.cls).trim().split(/\s+/).join('.')} rect=${hit.paint.rect} opacity=${hit.paint.opacity} bg=${hit.paint.bg} boxShadow=${hit.paint.boxShadow} svgFill=${hit.paint.svgFill} svgStroke=${hit.paint.svgStroke}`)
      else console.log(`    contributor: none found in stack`)
    }
  }

  await hitTest('brightest-first (peak outliers)', brightestSample)
  await hitTest(`near p99.5=${stats.p995} (what actually sets the metric)`, nearP995Sample)
} else {
  console.log('no pixels above cap in this crop.')
}

await browser.close()
server.close()
