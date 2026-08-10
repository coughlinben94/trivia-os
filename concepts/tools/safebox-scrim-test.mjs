// TASK 1 test: is the st4 tool/gate discrepancy explained by scrim state?
// Measures st4 with the scrim explicitly forced ON and explicitly forced
// OFF, and prints both this tool's and the gate's own safe-box crop rect
// literals side by side.
import { chromium } from 'playwright'
import { PNG } from 'pngjs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const target = path.join(__dirname, '../world-07-ring.html')
const station = 4
const CAP = 68

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
const url = `http://127.0.0.1:${port}/concepts/world-07-ring.html`

function lumaAt(data, idx) { return 0.2126 * data[idx] + 0.7152 * data[idx + 1] + 0.0722 * data[idx + 2] }
function percentilesOf(hist, total) {
  let sum = 0
  for (let v = 0; v < 256; v++) sum += hist[v] * v
  const mean = sum / total
  let p995 = 255, c995 = 0
  const t995 = total * 0.995
  for (let v = 0; v < 256; v++) { c995 += hist[v]; if (c995 >= t995) { p995 = v; break } }
  return { mean, p995 }
}

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
await page.goto(url)
await page.waitForFunction(() => !!window.__world, null, { timeout: 8000 })
// wait for fonts explicitly — showQ() (called by jumpTo) chains scrim
// activation behind document.fonts.ready via a promise; a short fixed wait
// can race past it and leave the scrim never turned on.
await page.evaluate(() => document.fonts.ready)
await page.evaluate((st) => window.__world.jumpTo(st), station)
await page.waitForTimeout(300)

const dRectGate = await page.locator('#design').evaluate(el => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height } })
const scale = dRectGate.width / 1920

// gate's own literal crop (ring-verify.mjs line ~837): 384/302/1536/778 * scale
const gateCrop = [Math.max(0, Math.floor(384 * scale)), Math.max(0, Math.floor(302 * scale)), Math.ceil(1536 * scale), Math.ceil(778 * scale)]
// this tool's crop (safebox-hit-test.mjs): 384/302.4/1536/777.6 * scale
const toolCrop = [Math.max(0, Math.floor(384 * scale)), Math.max(0, Math.floor(302.4 * scale)), Math.ceil(1536 * scale), Math.ceil(777.6 * scale)]
console.log(`gate crop: [${gateCrop}]  tool crop: [${toolCrop}]  scale=${scale.toFixed(4)}`)

const scrimState = await page.evaluate(() => {
  const el = document.getElementById('qScrim')
  return { hasOn: el.classList.contains('on'), computedOpacity: getComputedStyle(el).opacity, background: el.style.background.slice(0, 80) }
})
console.log(`scrim state at measurement time (natural, before forcing): on=${scrimState.hasOn} opacity=${scrimState.computedOpacity}`)
console.log(`scrim background: ${scrimState.background}`)

async function measure(scrimOn) {
  await page.evaluate(() => document.getAnimations().forEach(a => a.pause()))
  await page.evaluate((on) => {
    const qLayer = document.getElementById('qLayer')
    if (qLayer) { qLayer.dataset.saved = qLayer.style.display; qLayer.style.display = 'none' }
    const qScrim = document.getElementById('qScrim')
    qScrim.classList.toggle('on', on)
  }, scrimOn)
  await page.evaluate((prefix) => {
    document.querySelectorAll('.' + prefix + 'star').forEach(el => {
      const cs = getComputedStyle(el)
      el.style.setProperty('--ob', cs.getPropertyValue('--op').trim())
    })
    document.querySelectorAll('.' + prefix + 'pf-breathe').forEach(el => {
      const cs = getComputedStyle(el)
      el.style.setProperty('--pa', cs.getPropertyValue('--pa2').trim())
    })
  }, '')
  const buf = await page.locator('#design').screenshot()
  const png = PNG.sync.read(buf)
  await page.evaluate(() => {
    const qLayer = document.getElementById('qLayer')
    if (qLayer) { qLayer.style.display = qLayer.dataset.saved || ''; delete qLayer.dataset.saved }
  })
  const [x0, y0, x1c, y1c] = gateCrop
  const x1 = Math.min(png.width, x1c), y1 = Math.min(png.height, y1c)
  const hist = new Uint32Array(256)
  let total = 0
  for (let y = y0; y < y1; y++) {
    const rowBase = png.width * y
    for (let x = x0; x < x1; x++) {
      const idx = (rowBase + x) << 2
      const l = Math.max(0, Math.min(255, Math.round(lumaAt(png.data, idx))))
      hist[l]++; total++
    }
  }
  return percentilesOf(hist, total)
}

const off = await measure(false)
const on = await measure(true)
console.log(`\nstation ${station} (gate crop, cap=${CAP}):`)
console.log(`  scrim OFF: mean=${off.mean.toFixed(1)} p99.5=${off.p995}`)
console.log(`  scrim ON:  mean=${on.mean.toFixed(1)} p99.5=${on.p995}`)
console.log(`  ratio on/off p99.5 = ${(on.p995 / off.p995).toFixed(3)}`)

await browser.close()
server.close()
