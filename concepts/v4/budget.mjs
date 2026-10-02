// Live layer budget breakdown (real clock, GPU flags): samples every 200 ms through the given walks and prints, at the
// peak, animations and drawn area by item kind.   node concepts/v4/budget.mjs --seed 7 --from 4 --walks 2
import { chromium } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1] }
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', '--force-gpu-mem-available-mb=4096'] })
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } })
await p.goto(pathToFileURL(path.join(ROOT, 'concepts/haunted-forest-route-v4.html')).href + `?seed=${opt('--seed', '7')}&bare#s=${opt('--from', '4')}`)
await p.waitForFunction(() => window.__route); await p.waitForTimeout(1500)
const snap = () => p.evaluate(() => {
  const by = {}, top = []; let anims = document.getElementById('stage').getAnimations({ subtree: true }).length, px = 0
  for (const el of document.querySelectorAll('#world > *, #ground > *')) {
    const k = el.classList.contains('pl') ? (el.parentNode.id === 'ground' ? 'tile' : 'plane') : (el.dataset.z || '? ? ?').split(' ')[2]
    const a = (el.offsetWidth * el.offsetHeight + [...el.querySelectorAll(':scope > .ly')].reduce((s, l) => s + l.offsetWidth * l.offsetHeight, 0)) / 1e6, n = el.getAnimations({ subtree: true }).length
    top.push([k, el.dataset.z, el.offsetWidth + 'x' + el.offsetHeight, +a.toFixed(1), n, el.querySelectorAll(':scope > .ly').length]); by[k] = by[k] || { n: 0, anims: 0, mpx: 0 }; by[k].n++; by[k].anims += n; by[k].mpx += a; px += a
  }
  for (const k in by) by[k].mpx = +by[k].mpx.toFixed(1)
  return { anims, mpx: +px.toFixed(1), u: window.__route.u(), by, top: top.sort((a, b) => b[3] - a[3]).slice(0, 8) }
})
let peak = { anims: 0 }, peakA = { mpx: 0 }
for (let w = 0; w < +opt('--walks', '2'); w++) {
  const T = await p.evaluate(() => window.__route.advance()), end = Date.now() + T + 800
  while (Date.now() < end) { const s = await snap(); if (s.anims > peak.anims) peak = s; if (s.mpx > peakA.mpx) peakA = s; await p.waitForTimeout(200) }
}
console.log('PEAK ANIMS', JSON.stringify(peak)); console.log('PEAK AREA', JSON.stringify(peakA)); await b.close()
