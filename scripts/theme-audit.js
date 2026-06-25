// Theme audit — captures REAL drenched /display?demo=1 question slides for all 29 themes.
// Requires: dev server running at http://localhost:5174, python3 + Pillow installed.
// Usage: node scripts/theme-audit.js

const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const playwright = require('/Users/bencoughlin/Projects/trivia-os/node_modules/playwright')
const { PNG } = require('/Users/bencoughlin/Projects/trivia-os/node_modules/pngjs')

const BASE_URL = 'http://localhost:5174'
const OUT_DIR = path.join(__dirname, '..', 'theme-screenshots-v2')
const REPORT_PATH = path.join(__dirname, '..', 'theme-audit-report.md')
const GRID_PATH = path.join(__dirname, '..', 'theme-grid-v2.html')
const PY_SCRIPT = path.join(OUT_DIR, '_make_gif.py')

const THEMES = [
  'pure-michigan', 'midnight-galaxy', 'autumn-harvest', 'northern-lights',
  'medieval-tavern', 'sunset-boulevard', 'retro-arcade', 'sand-dune-chill',
  'halloween', 'jazz-club', 'dive-bar', 'rooftop-party', 'christmas-eve',
  'drive-in-movie', 'western-showdown', 'under-the-sea', 'neon-tokyo',
  'firefly-summer', 'wine-cellar', 'meteor-shower', 'eighties-night',
]

// Still capture config
const STILL_W = 1920, STILL_H = 1080
const STILL_CANDIDATES = 4
const STILL_INTERVAL_MS = 900

// GIF capture config
const GIF_W = 960, GIF_H = 540
const GIF_FRAMES = 50
const GIF_INTERVAL_MS = 200  // 50 frames × 200ms = 10s animation window, 5fps GIF

const MOUNT_WAIT_MS = 1200

function meanLuminance(pngPath) {
  try {
    const png = PNG.sync.read(fs.readFileSync(pngPath))
    let sum = 0
    for (let i = 0; i < png.data.length; i += 4) {
      sum += (0.299 * png.data[i] + 0.587 * png.data[i + 1] + 0.114 * png.data[i + 2]) / 255
    }
    return sum / (png.width * png.height)
  } catch { return 0 }
}

function writePyScript() {
  fs.writeFileSync(PY_SCRIPT, `import sys, os, glob, shutil
from PIL import Image
fd, op, dur = sys.argv[1], sys.argv[2], int(sys.argv[3])
frames = sorted(glob.glob(os.path.join(fd, 'frame_*.png')))
imgs = [Image.open(f).convert('RGB').quantize(colors=128) for f in frames]
imgs[0].save(op, save_all=True, append_images=imgs[1:], loop=0, duration=dur, optimize=False)
shutil.rmtree(fd)
`)
}

async function captureStill(browser, themeId, errors) {
  const ctx = await browser.newContext({ viewport: { width: STILL_W, height: STILL_H } })
  const page = await ctx.newPage()
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()) })

  await page.goto(`${BASE_URL}/display?demo=1&theme=${themeId}`, { waitUntil: 'load' })
  await page.waitForTimeout(MOUNT_WAIT_MS)

  const tmp = []
  for (let i = 0; i < STILL_CANDIDATES; i++) {
    const f = path.join(OUT_DIR, `_cand_${themeId}_${i}.png`)
    await page.screenshot({ path: f })
    tmp.push(f)
    if (i < STILL_CANDIDATES - 1) await page.waitForTimeout(STILL_INTERVAL_MS)
  }

  let best = tmp[0], bestLum = 0
  for (const f of tmp) {
    const lum = meanLuminance(f)
    if (lum > bestLum) { bestLum = lum; best = f }
  }
  fs.copyFileSync(best, path.join(OUT_DIR, `${themeId}-still.png`))
  for (const f of tmp) try { fs.unlinkSync(f) } catch {}

  await ctx.close()
  return bestLum
}

async function captureGif(browser, themeId) {
  const ctx = await browser.newContext({ viewport: { width: GIF_W, height: GIF_H } })
  const page = await ctx.newPage()

  await page.goto(`${BASE_URL}/display?demo=1&theme=${themeId}`, { waitUntil: 'load' })
  await page.waitForTimeout(MOUNT_WAIT_MS)

  const frameDir = path.join(OUT_DIR, `_frames_${themeId}`)
  fs.mkdirSync(frameDir, { recursive: true })

  for (let i = 0; i < GIF_FRAMES; i++) {
    await page.screenshot({ path: path.join(frameDir, `frame_${String(i).padStart(4, '0')}.png`) })
    if (i < GIF_FRAMES - 1) await page.waitForTimeout(GIF_INTERVAL_MS)
  }
  await ctx.close()

  const gifPath = path.join(OUT_DIR, `${themeId}.gif`)
  const res = spawnSync('python3', [PY_SCRIPT, frameDir, gifPath, String(GIF_INTERVAL_MS)], {
    timeout: 90000,
    encoding: 'utf8',
  })
  if (res.status !== 0) {
    console.error(`  GIF assembly error for ${themeId}:`, res.stderr || res.error?.message)
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  writePyScript()

  const browser = await playwright.chromium.launch({ headless: true })
  const results = []

  for (let i = 0; i < THEMES.length; i++) {
    const themeId = THEMES[i]
    process.stdout.write(`[${i + 1}/${THEMES.length}] ${themeId}... `)
    const errors = []

    const lum = await captureStill(browser, themeId, errors)
    await captureGif(browser, themeId)

    results.push({ themeId, lum, errors })
    console.log(`lum=${lum.toFixed(3)} errors=${errors.length}`)
  }

  await browser.close()
  try { fs.unlinkSync(PY_SCRIPT) } catch {}

  writeReport(results)
  writeGrid(results)
  console.log(`\nDone. Report: theme-audit-report.md  Grid: theme-grid-v2.html`)
}

function writeReport(results) {
  const lines = [
    '# Theme Audit Report v2',
    '',
    `Captured: ${new Date().toISOString()}`,
    `Method: /display?demo=1&theme=ID — real drenched QuestionSlide`,
    `Still: ${STILL_CANDIDATES} candidates at ${STILL_W}×${STILL_H} (${STILL_INTERVAL_MS}ms apart), kept highest mean luminance`,
    `Loop: ${GIF_FRAMES} frames at ${GIF_INTERVAL_MS}ms intervals, ${GIF_W}×${GIF_H}, PIL animated GIF (${GIF_FRAMES * GIF_INTERVAL_MS / 1000}s loop)`,
    '',
    '---',
    '',
    ...results.flatMap(({ themeId, lum, errors }) => [
      `## ${themeId}`,
      `- Still: theme-screenshots-v2/${themeId}-still.png (luminance: ${lum.toFixed(3)})`,
      `- Loop: theme-screenshots-v2/${themeId}.gif`,
      `- Console errors: ${errors.length ? '\n  - ' + errors.join('\n  - ') : 'none'}`,
      '',
    ]),
  ]
  fs.writeFileSync(REPORT_PATH, lines.join('\n'))
}

function writeGrid(results) {
  const cards = results.map(({ themeId }) => `
  <div class="card">
    <p class="name">${themeId}</p>
    <div class="label">Peak still · 1920×1080</div>
    <img src="theme-screenshots-v2/${themeId}-still.png" alt="${themeId}" loading="lazy">
    <div class="label sep">6s loop · 960×540 · 5fps</div>
    <img src="theme-screenshots-v2/${themeId}.gif" alt="${themeId} loop" loading="lazy">
  </div>`).join('\n')

  fs.writeFileSync(GRID_PATH, `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Trivia OS Theme Audit v2</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
body{background:#0a0a0a;color:#e0e0e0;font-family:system-ui,sans-serif;padding:24px}
h1{font-size:1.3rem;font-weight:700;margin-bottom:20px;color:#fff}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(420px,1fr));gap:18px}
.card{background:#141414;border-radius:10px;overflow:hidden;border:1px solid #222}
.name{padding:7px 12px;font-size:.72rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#666;background:#0f0f0f}
.label{padding:3px 12px;font-size:.6rem;color:#444;text-transform:uppercase;letter-spacing:.1em;background:#0f0f0f}
.sep{border-top:1px solid #1c1c1c}
img{display:block;width:100%;aspect-ratio:16/9;object-fit:cover}
</style>
</head>
<body>
<h1>Trivia OS — Theme Audit v2 · ${results.length} themes · ${new Date().toLocaleDateString()}</h1>
<div class="grid">
${cards}
</div>
</body>
</html>`)
}

main().catch(e => { console.error(e); process.exit(1) })
