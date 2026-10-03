// GPU / raster memory of the v4 page from Chrome's own memory-infra dumps (CDP Tracing.requestMemoryDump):
// cc tile memory (rastered layer tiles), gpu (shared images, gl), plus composited layer count from LayerTree.
//   node concepts/v4/gpumem.mjs --seed 7 [--vp 1920x1080] [--mem 4096] [--from 2] [--at 0,2500] [--url <page>]
// --at: ms after a Next press at which to dump (0 = before the press). Prints MB per allocator family.
import { chromium } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1] }
const base = opt('--url', pathToFileURL(path.join(ROOT, 'concepts/haunted-forest-route-v4.html')).href)
const [VW, VH] = opt('--vp', '1920x1080').split('x').map(Number)
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist', `--force-gpu-mem-available-mb=${opt('--mem', '4096')}`] })
const p = await b.newPage({ viewport: { width: VW, height: VH } })
await p.goto(`${base}?seed=${opt('--seed', '7')}&bare&noq#s=${opt('--from', '2')}`); await p.waitForFunction(() => window.__route); await p.waitForTimeout(2500)
const c = await p.context().newCDPSession(p)
async function dump(tag) {
  const chunks = []; c.on('Tracing.dataCollected', e => chunks.push(...e.value))
  await c.send('Tracing.start', { traceConfig: { includedCategories: ['disabled-by-default-memory-infra'], excludedCategories: ['*'], memoryDumpConfig: { triggers: [] } } })
  await c.send('Tracing.requestMemoryDump', { deterministic: false, levelOfDetail: 'detailed' })
  const done = new Promise(r => c.once('Tracing.tracingComplete', r)); await c.send('Tracing.end'); await done
  const fam = {}
  for (const e of chunks) { const ad = e.args?.dumps?.allocators; if (!ad) continue
    for (const [name, d] of Object.entries(ad)) { const sz = d.attrs?.size?.value; if (!sz) continue
      const top = name.split('/').slice(0, 2).join('/'); if (name.split('/').length > 2) continue
      fam[top] = Math.max(fam[top] || 0, parseInt(sz, 16) / 1048576) } }
  await c.send('LayerTree.enable'); const layers = await new Promise(r => { c.once('LayerTree.layerTreeDidChange', e => r(e.layers || [])); setTimeout(() => r([]), 3000) }); await c.send('LayerTree.disable')
  const draws = layers.filter(l => l.drawsContent)
  const keep = Object.entries(fam).filter(([k, v]) => /^(cc|gpu|skia|tile|shared_image|viz)/.test(k) && v > 0.5).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v.toFixed(1)}`)
  console.log(tag, `layers ${layers.length} drawing ${draws.length} drawnMpx ${(draws.reduce((s, l) => s + l.width * l.height, 0) / 1e6).toFixed(1)}`, keep.join(' '))
}
let t = 0
for (const at of opt('--at', '0,2500').split(',').map(Number)) { if (at > 0 && t === 0) { await p.evaluate(() => window.__route.advance()) } if (at > t) { await p.waitForTimeout(at - t); t = at } await dump(`t=${at}`) }
await b.close()
