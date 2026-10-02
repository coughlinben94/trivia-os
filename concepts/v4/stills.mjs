// Station stills for the design checks (GPU flags, page held still with ?wander=0, no question text):
//   node concepts/v4/stills.mjs --out <dir> --seeds 1,7,1031,42
// writes <dir>/s<seed>_<station>.png and <dir>/meta.json (route, palette, landmarks per seed). Then
// python3 concepts/v4/stills.py <dir> for darkness / contrast numbers and contact sheets.
import { chromium } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1] }
const OUT = path.resolve(opt('--out', 'v4stills')), seeds = opt('--seeds', '1,7,1031,42').split(',')
const stations = opt('--stations', '0,1,2,3,4,5,6,7,8,9,10,11,12').split(',').map(Number)
fs.mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--force-gpu-mem-available-mb=4096'] })
const meta = {}
for (const seed of seeds) {
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } }), p = await ctx.newPage()
  const errs = []; p.on('pageerror', e => errs.push(e.message))
  await p.goto(pathToFileURL(path.join(ROOT, 'concepts/haunted-forest-route-v4.html')).href + `?seed=${seed}&bare&noq&wander=0`)
  await p.waitForFunction(() => window.__route)
  meta[seed] = await p.evaluate(() => ({ route: window.__route.route.map(r => r.kind + r.variant), pal: window.__route.palette, lms: window.__route.landmarks }))
  for (const k of stations) {
    await p.evaluate(k => window.__route.jump(k), k); await p.waitForTimeout(1800)
    await p.screenshot({ path: path.join(OUT, `s${seed}_${String(k).padStart(2, '0')}.png`) })
  }
  if (errs.length) console.log('ERRORS', seed, errs)
  await ctx.close()
}
fs.writeFileSync(path.join(OUT, 'meta.json'), JSON.stringify(meta, null, 1)); console.log(JSON.stringify(meta))
await b.close()
