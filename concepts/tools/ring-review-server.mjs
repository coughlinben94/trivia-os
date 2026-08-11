// Local server + driver for concepts/ring-review-tool.html (PLAN-ring-review-tool.md).
//
// Two jobs a plain double-clicked HTML file can't do:
//  1. Same-origin access into the world-07-ring iframe (jumpTo, getAnimations,
//     getBoundingClientRect across the frame boundary) — file:// origins aren't
//     reliably same-origin across two files in Chrome.
//  2. "Frozen frame with strokes burned in" evidence PNGs — there's no native DOM-
//     to-image API. Reuses Playwright (already a concepts/tools dependency, already
//     how safebox-hit-test.mjs and station-audit.mjs freeze+screenshot this exact
//     page) instead of adding a new rasterization dependency.
//
// Freeze pattern is FAILURE-LEDGER instruments eight+nine's, verbatim: pause() alone
// leaves each animation at whatever wall-clock currentTime it already reached;
// currentTime = 0 pins it to a fixed point on its own timeline.
import { chromium } from 'playwright'
import { createServer } from 'node:http'
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const conceptsDir = path.resolve(__dirname, '..')
// world-07-ring.html imports from ../client/src/... (repo root) — same reason
// safebox-hit-test.mjs and station-audit.mjs serve from repo root, not concepts/.
const rootDir = path.resolve(__dirname, '../..')
const reviewsDir = path.join(conceptsDir, 'reviews')

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' }

let page = null // set once Playwright's page is ready; /api/save waits for it

const server = createServer(async (req, res) => {
  if (req.method === 'POST' && req.url === '/api/save') return handleSave(req, res)
  try {
    const urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname)
    const filePath = path.join(rootDir, path.normalize(urlPath === '/' ? '/concepts/ring-review-tool.html' : urlPath))
    if (!filePath.startsWith(rootDir)) { res.writeHead(403); return res.end('Forbidden') }
    const data = await readFile(filePath)
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath)] || 'application/octet-stream' })
    res.end(data)
  } catch { res.writeHead(404); res.end('Not found') }
})

async function handleSave(req, res) {
  try {
    const chunks = []
    for await (const c of req) chunks.push(c)
    const payload = JSON.parse(Buffer.concat(chunks).toString('utf8'))
    const { date, stamp, currentStation, stations } = payload

    await mkdir(reviewsDir, { recursive: true })
    const jsonPath = path.join(reviewsDir, `ring-review-${stamp}.json`)
    await writeFile(jsonPath, JSON.stringify({ date, stamp, stations }, null, 2))

    const pngPaths = []
    if (page) {
      const marked = stations.filter(s => s.marks.length > 0)
      for (const s of marked) {
        await page.evaluate((idx) => window.__reviewTool.gotoStationForCapture(idx), s.index)
        await page.waitForTimeout(150)
        const nn = String(s.index + 1).padStart(2, '0')
        const pngPath = path.join(reviewsDir, `ring-review-${stamp}-st${nn}.png`)
        // Element screenshot, not a viewport-relative clip rect: clip silently truncates
        // to whatever's on-screen, and the stage (up to ~1470px tall) doesn't reliably
        // fit inside the 1000px launch viewport — that cropped every mark in the
        // bottom slice of the frame out of the evidence PNG without erroring.
        await page.locator('#paintCanvas').screenshot({ path: pngPath })
        pngPaths.push(pngPath)
      }
      await page.evaluate((idx) => window.__reviewTool.restore(idx), currentStation)
    }

    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: true, jsonPath: path.relative(conceptsDir, jsonPath), pngPaths: pngPaths.map(p => path.relative(conceptsDir, p)) }))
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ ok: false, error: String(err && err.message || err) }))
  }
}

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const port = server.address().port
const url = `http://127.0.0.1:${port}/concepts/ring-review-tool.html`

// Headed (visible) Chromium — Ben reviews and paints in this window. Needed so this
// same process can screenshot the live, frozen page server-side on Save.
const browser = await chromium.launch({ headless: false })
page = await browser.newPage({ viewport: { width: 1500, height: 1000 } })
await page.goto(url)

console.log(`ring-review-tool running: ${url}`)
console.log('Review in the Chromium window that just opened. Ctrl-C here to stop.')

browser.on('disconnected', () => { server.close(); process.exit(0) })
process.on('SIGINT', async () => { await browser.close(); server.close(); process.exit(0) })
