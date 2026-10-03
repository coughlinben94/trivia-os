// Horizon-streak hunt: sweeps the arc in frozen frames (fake clock) for given seeds and looks for thin, wide, warm
// (orange) features near the horizon band (y 600..800 of 1080). For each hit it asks the page which elements are at
// that point (elementsFromPoint), so the streak is traced to its item.
//   node concepts/v4/streak.mjs --seeds 7,1031 [--kinds bendL,bendR] [--step 0.3] [--url <page>] [--out <dir>]
import { chromium } from '@playwright/test'
import { PNG } from 'pngjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1] }
const base = opt('--url', pathToFileURL(path.join(ROOT, 'concepts/haunted-forest-route-v4.html')).href), STEPM = +opt('--step', '0.3')
const kinds = opt('--kinds', 'bendL,bendR').split(','), OUT = opt('--out', null); if (OUT) fs.mkdirSync(OUT, { recursive: true })
const b = await chromium.launch({ args: args.includes('--sw') ? [] : ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--force-gpu-mem-available-mb=4096'] })   // --sw: software raster (frozen frames, same pixels)
const warm = (d, i) => { const r = d[i], g = d[i + 1], bl = d[i + 2]; return r > 70 && r > g * 1.3 && g > bl * 1.15 && r - bl > 40 }
const hits = []
for (const seed of opt('--seeds', '7').split(',')) {
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } }), p = await ctx.newPage()
  const t0 = Date.now(); await p.clock.install({ time: t0 }); await p.clock.pauseAt(t0 + 1000)
  await p.goto(`${base}?seed=${seed}&bare&noq&wander=3`); await p.waitForFunction(() => window.__route)
  const { route, S, L } = await p.evaluate(() => ({ route: window.__route.route.map(r => r.kind), S: window.__route.S, L: window.__route.L }))
  for (let k = 0; k < 13; k++) {
    if (!kinds.includes(route[k])) continue
    const a = k ? S[k - 1] : 0, z = S[k]
    await p.evaluate(a => { window.__route.freeze(); window.__route.jump(0) }, a)
    // jump(k-1) is a covered cut; wait it out, then walk the stretch at 3 m/s in frozen 0.1 s steps
    await p.evaluate(k => window.__route.jump(k), (k + 12) % 13); await p.clock.runFor(600)
    while (await p.evaluate(() => window.__route.u()) % L < a - 1.5) await p.clock.runFor(100)
    for (let n = 0; ; n++) {
      const u = await p.evaluate(() => { window.__route.freeze(); return window.__route.u() })
      if ((u % L) > z + 1 || n > 60) break
      await p.waitForTimeout(250); let s = await p.screenshot(); for (let i = 0; i < 8; i++) { await p.waitForTimeout(120); const c = await p.screenshot(); if (c.equals(s)) break; s = c }
      const d = PNG.sync.read(s).data
      // rows 600..800: runs of warm pixels; a streak = run >= 60 px wide in a band <= 14 px tall
      for (let y = 600; y < 800; y++) { let run = 0
        for (let x = 0; x < 1920; x++) { if (warm(d, (y * 1920 + x) * 4)) run++; else { if (run >= 60) { let h = 0; for (let yy = y - 20; yy < y + 20; yy++) if (yy >= 0 && warm(d, (yy * 1920 + x - (run >> 1)) * 4)) h++
              if (h <= 14) { const el = await p.evaluate(([x, y]) => document.elementsFromPoint(x, y).slice(0, 6).map(e => { const it = e.closest('[data-z]'), pl = e.closest('.pl'); return (it ? 'item ' + it.dataset.z : pl ? 'plane/tile ' + (pl.parentNode.id) : e.id || e.className) }).join(' | '), [x - (run >> 1), y])
                hits.push({ seed, k, kind: route[k], u: +u.toFixed(2), x: x - run, y, w: run, h, el }); if (OUT) fs.writeFileSync(path.join(OUT, `s${seed}_u${u.toFixed(2)}.png`), s) } } run = 0 } }
      }
      await p.clock.runFor(STEPM / 3 * 1000)
    }
  }
  await ctx.close()
}
const uniq = {}; for (const h of hits) { const k = h.seed + ':' + h.el; if (!uniq[k] || h.w > uniq[k].w) uniq[k] = h }
console.log(hits.length, 'streak rows'); for (const h of Object.values(uniq)) console.log(JSON.stringify(h))
await b.close()
