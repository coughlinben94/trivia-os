// Debug tool, not a gate: dumps every DOM element overlapping the safe-box
// rect at forced breathe/twinkle peak for a given station, ranked by overlap
// area, so a luminance-cap regression can be attributed to a specific
// element instead of guessed at. Mirrors ring-verify.mjs's own peak-forcing
// (--pa -> --pa2, star --ob -> --op) so the numbers line up with the gate.
import { chromium } from 'playwright'
import path from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const target = process.argv[2] || path.join(__dirname, '../world-07-ring.html')
const station = parseInt(process.argv[3] ?? '4', 10)

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

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto(url)
await page.waitForFunction(() => !!window.__world, null, { timeout: 8000 })
await page.evaluate((st) => window.__world.jumpTo(st), station)
await page.waitForTimeout(150)

const prefix = await page.evaluate(() => window.__world.prefix ?? 'ring-')

const result = await page.evaluate(({ prefix }) => {
  document.querySelectorAll('.' + prefix + 'star').forEach(el => {
    const cs = getComputedStyle(el)
    el.style.setProperty('--ob', cs.getPropertyValue('--op').trim())
  })
  document.querySelectorAll('.' + prefix + 'pf-breathe').forEach(el => {
    const cs = getComputedStyle(el)
    el.style.setProperty('--pa', cs.getPropertyValue('--pa2').trim())
  })
  const designEl = document.getElementById('design')
  const dRect = designEl.getBoundingClientRect()
  const scale = dRect.width / 1920 || 1
  const SAFE = window.__world.ENGINE.SAFE
  const H = window.__world.ENGINE.H
  const safeX0 = 0.2 * 1920, safeX1 = 0.8 * 1920
  const safeY0 = SAFE.y * H, safeY1 = (SAFE.y + SAFE.h) * H

  const out = []
  designEl.querySelectorAll('*').forEach(el => {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) return
    const x0 = (r.left - dRect.left) / scale, x1 = (r.right - dRect.left) / scale
    const y0 = (r.top - dRect.top) / scale, y1 = (r.bottom - dRect.top) / scale
    const ox0 = Math.max(x0, safeX0), ox1 = Math.min(x1, safeX1)
    const oy0 = Math.max(y0, safeY0), oy1 = Math.min(y1, safeY1)
    const overlapArea = Math.max(0, ox1 - ox0) * Math.max(0, oy1 - oy0)
    if (overlapArea < 40) return
    if ((x1 - x0) >= 1900 && (y1 - y0) >= 1000) return // full-frame wrapper, not paint
    const cs = getComputedStyle(el)
    const hasVisiblePaint = (cs.backgroundImage !== 'none') || cs.boxShadow !== 'none' ||
      (cs.backgroundColor && !/rgba?\([^)]*,\s*0\)|transparent/.test(cs.backgroundColor))
    if (!hasVisiblePaint) return
    out.push({
      cls: el.className,
      rect: [Math.round(x0), Math.round(y0), Math.round(x1), Math.round(y1)],
      overlapArea: Math.round(overlapArea),
      overlapFracOfEl: +(overlapArea / ((x1 - x0) * (y1 - y0))).toFixed(2),
      bg: cs.background.slice(0, 140),
      boxShadow: cs.boxShadow.slice(0, 100),
      opacity: cs.opacity,
    })
  })
  out.sort((a, b) => b.overlapArea - a.overlapArea)
  return { scale, safeBox: [safeX0, safeY0, safeX1, safeY1], elements: out.slice(0, 20) }
}, { prefix })

console.log(`station ${station} — safe box (design px):`, result.safeBox, 'scale', result.scale)
result.elements.forEach((e, i) => {
  console.log(`${i + 1}. .${e.cls.replace(/\s+/g, '.')} rect=${e.rect} overlap=${e.overlapArea}px2 (${(e.overlapFracOfEl * 100).toFixed(0)}% of el) opacity=${e.opacity}`)
  console.log(`   bg: ${e.bg}`)
  if (e.boxShadow !== 'none') console.log(`   boxShadow: ${e.boxShadow}`)
})

await browser.close()
server.close()
