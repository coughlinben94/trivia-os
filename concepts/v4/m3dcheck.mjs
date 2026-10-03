// matrix3d INTERPOLATION check. Walls, roofs and ground tiles move as exact 2D homographies (matrix3d keyframes whose
// z row and column are identity). Between two keyframes the browser interpolates matrix3d by DECOMPOSING both; when
// the two differ too much the in-between can come out with a 3D rotation (non-zero z entries): the panel swings
// through space for a frame or two (seed 152 at u=83.88: a far ground tile flung across the sky, hiding the moon).
// This sweeps every live .pl element's own animation at 1 cm of arc and counts in-between transforms whose z entries
// are not ~0.   node concepts/v4/m3dcheck.mjs --seeds 152,7 [--url <page>] [--laps 1]
import { chromium } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1] }
const base = opt('--url', pathToFileURL(path.join(ROOT, 'concepts/haunted-forest-route-v4.html')).href)
const b = await chromium.launch(), SP = +opt('--spike', '150')   // px of second difference per 1 cm step
for (const seed of opt('--seeds', '152').split(',')) {
  const p = await b.newPage({ viewport: { width: 1920, height: 1080 } })
  await p.goto(`${base}?seed=${seed}&bare&noq&wander=0`); await p.waitForFunction(() => window.__route)
  const res = { seed, checked: 0, bad: 0, badMs: 0, examples: [] }, done = new Set()
  for (let lap = 0; lap < +opt('--laps', '1'); lap++) for (let k = 0; k < 13; k++) {
    await p.evaluate(k => window.__route.jump(k), k); await p.waitForTimeout(50)
    const r = await p.evaluate(([done, SPIKE]) => {
      const out = []
      for (const [key, rec] of window.__route.internals.LIVE) {
        if (!rec.el.classList.contains('pl') || done.includes(key)) continue
        const a = rec.anims[0]; if (!a) continue; const dur = a.effect.getComputedTiming().duration, keep = a.currentTime; a.pause()
        // project the box corners through the computed matrix (about its transform-origin); smooth motion has a tiny
        // second difference per 1 cm step, a decomposition flip a spike. Only corners in front (w > 0) and near the frame count
        const st = getComputedStyle(rec.el), [ox, oy] = st.transformOrigin.split(' ').map(parseFloat), W = rec.el.offsetWidth, H = rec.el.offsetHeight
        const x0 = rec.el.offsetLeft, y0 = rec.el.offsetTop, C = [[0, 0], [W, 0], [W, H], [0, H]]
        let bad = 0, first = null, prev = [], worst = 0
        for (let t = 0; t <= dur; t += 10) { a.currentTime = t; const cs = getComputedStyle(rec.el), m = cs.transform, op = +cs.opacity; if (!m.startsWith('matrix3d')) { prev = []; continue }
          const v = m.slice(9, -1).split(',').map(Number)
          const P = C.map(([x, y]) => { const X = x - ox, Y = y - oy, w = v[3] * X + v[7] * Y + v[15]; return w > 0.05 ? [(v[0] * X + v[4] * Y + v[12]) / w + ox + x0, (v[1] * X + v[5] * Y + v[13]) / w + oy + y0] : null })
          prev.push(P); if (prev.length > 3) prev.shift()
          if (prev.length === 3) { let d = 0
            for (let c = 0; c < 4; c++) { const [p0, p1, p2] = prev.map(q => q[c]); if (!p0 || !p1 || !p2) continue
              if (p1[0] < -400 || p1[0] > 2320 || p1[1] < -400 || p1[1] > 1480) continue
              d = Math.max(d, Math.hypot(p2[0] - 2 * p1[0] + p0[0], p2[1] - 2 * p1[1] + p0[1])) }
            if (op < 0.02) d = 0   // invisible then
            worst = Math.max(worst, d); if (d > SPIKE) { bad++; if (first === null || d > first[1]) first = [t, Math.round(d), +(rec.ue + t / 1000).toFixed(2)] } } }
        a.currentTime = keep; out.push([key, bad, first, rec.el.parentNode.id])
      }
      return out
    }, [[...done], SP])
    for (const [key, bad, first, par] of r) { done.add(key); res.checked++; if (bad) { res.bad++; res.badMs += bad * 10; res.examples.push({ key, par, cmOfArc: bad, worst: first }) } }
  }
  res.examples.sort((x, y) => y.worst[1] - x.worst[1]); res.examples = res.examples.slice(0, 10); console.log(JSON.stringify(res)); await p.close()
}
await b.close()
