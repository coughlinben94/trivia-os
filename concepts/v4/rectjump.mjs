// Which element jumps? Frozen frames at arcs u0 and u1 (fake clock); prints live elements whose on-screen box changes
// far more than the camera step explains, with their key, kind and box.   node concepts/v4/rectjump.mjs --seed 152 --from 6 --u0 83.85 --u1 83.88
import { chromium } from '@playwright/test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const args = process.argv.slice(2), opt = (k, d) => { const i = args.indexOf(k); return i < 0 ? d : args[i + 1] }
const base = opt('--url', pathToFileURL(path.join(ROOT, 'concepts/haunted-forest-route-v4.html')).href)
const b = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu-rasterization', '--ignore-gpu-blocklist'] })
const p = await b.newPage({ viewport: { width: 1920, height: 1080 } })
const t0 = Date.now(); await p.clock.install({ time: t0 }); await p.clock.pauseAt(t0 + 1000)
await p.goto(`${base}?seed=${opt('--seed')}&bare&noq#s=${opt('--from')}`); await p.waitForFunction(() => window.__route); await p.evaluate(() => window.__route.freeze())
const go = async u0 => { while (await p.evaluate(() => window.__route.u()) < u0 - 0.002) { const u = await p.evaluate(() => window.__route.u()); await p.clock.runFor(Math.max(1, Math.min(100, Math.round((u0 - u) / 0.42 * 1000)))) } await p.evaluate(() => window.__route.freeze()) }
const snap = () => p.evaluate(() => { const o = {}; for (const [k, r] of window.__route.internals.LIVE) { const b = r.el.getBoundingClientRect(); o[k] = { b: [b.left, b.top, b.right, b.bottom].map(Math.round), cls: r.el.className, z: r.el.dataset.z || '', tf: getComputedStyle(r.el).transform.slice(0, 160) } } return o })
await go(+opt('--u0')); const A = await snap(); await go(+opt('--u1')); const B = await snap()
const rows = []
for (const k in B) if (A[k]) { const d = Math.max(...A[k].b.map((v, i) => Math.abs(v - B[k].b[i]))); rows.push([d, k, B[k].cls, B[k].z, A[k].b, B[k].b, A[k].tf, B[k].tf]) }
rows.sort((a, c) => c[0] - a[0]); for (const r of rows.slice(0, 6)) console.log(JSON.stringify(r))
await b.close()
