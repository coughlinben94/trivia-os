// client/src/components/join/PhoneBackdrop.test.jsx — Tier 2 phone backdrop (Phase 3d-4).
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { renderToStaticMarkup } from 'react-dom/server'
import PhoneBackdrop, { phoneBackdropWorld, phoneStationIndex } from './PhoneBackdrop.jsx'
import { FOREST_THEME_IDS } from './phoneBackdropThemes.js'
import { RING_WORLDS } from '../../lib/ringWorldFor.js'
import { THEMES } from '../../themes/index.js'
import { resolveRingSlideIndex } from '../../lib/ringStationResolver.js'

const forest = RING_WORLDS['haunted-october']
const q = (id, order) => ({ id, order, type: 'question', data: {} })

describe('PhoneBackdrop', () => {
  it('renders a fixed, inert, aria-hidden backdrop with the station sky for a forest world', () => {
    const html = renderToStaticMarkup(<PhoneBackdrop world={forest} stationIndex={10} />)
    const sky = forest.phone.skies[10]
    expect(html).toContain('aria-hidden="true"')
    expect(html).toContain('data-phone-backdrop="10"')
    expect(html).toContain('position:fixed')
    expect(html).toContain('pointer-events:none')
    expect(html).toContain('z-index:-1')
    expect(html).toContain(`linear-gradient(180deg, ${sky.top} 0%, ${sky.mid} 55%, ${sky.horizon} 88%)`)
  })

  it('renders nothing for space, every other theme, or no world', () => {
    expect(renderToStaticMarkup(<PhoneBackdrop world={RING_WORLDS['midnight-galaxy']} stationIndex={3} />)).toBe('')
    expect(renderToStaticMarkup(<PhoneBackdrop world={undefined} stationIndex={3} />)).toBe('')
    for (const t of THEMES) {
      const w = phoneBackdropWorld(t.id)
      if (t.id === 'haunted-october') expect(w).toBe(forest)
      else expect(w).toBeNull()
      expect(renderToStaticMarkup(<PhoneBackdrop world={RING_WORLDS[t.id]} stationIndex={0} />) === '').toBe(t.id !== 'haunted-october')
    }
  })

  it('FOREST_THEME_IDS (static, no world load) equals RING_WORLDS ids with renderer forest', () => {
    const fromWorlds = Object.keys(RING_WORLDS).filter(id => RING_WORLDS[id]?.renderer === 'forest').sort()
    expect([...FOREST_THEME_IDS].sort()).toEqual(fromWorlds)
    expect(fromWorlds.length).toBeGreaterThan(0)
  })

  it('station: host index through the TV resolver, mod 13; not live = 0', () => {
    const slides = Array.from({ length: 20 }, (_, i) => q('s' + i, i)).reverse() // unsorted on purpose
    expect(phoneStationIndex({ is_live: true, slides, current_slide_index: 15 })).toBe(15 % 13)
    expect(phoneStationIndex({ is_live: true, slides, current_slide_index: 15 })).toBe(resolveRingSlideIndex([...slides].reverse(), 15) % 13)
    expect(phoneStationIndex({ is_live: false, slides, current_slide_index: 15 })).toBe(0)
    expect(phoneStationIndex(null)).toBe(0)
    // phoneStationIndex reads only the show row: no viewed/browsing index parameter exists.
    expect(phoneStationIndex.length).toBeLessThanOrEqual(2)
  })

  it('source has no canvas, frame loop, or motion', () => {
    const src = readFileSync(new URL('./PhoneBackdrop.jsx', import.meta.url), 'utf8')
    for (const banned of ['<canvas', 'requestAnimationFrame', 'animation', 'transition', '@keyframes', 'framer-motion', 'motion.', 'viewedIndex']) {
      expect(src).not.toContain(banned)
    }
  })

  it('Join mounts it once, at the root, from the host-only helper, gated on a forest world', () => {
    const join = readFileSync(new URL('../../views/Join.jsx', import.meta.url), 'utf8')
    expect(join.match(/<phoneBackdrop\.Backdrop /g)).toHaveLength(1)
    expect(join).toContain("{phoneWorld && (phase === 'waiting' || phase === 'live') && (")
    expect(join).toContain('<phoneBackdrop.Backdrop world={phoneWorld} stationIndex={phoneBackdrop.stationIndex(show, phoneWorld.stations.length)} />')
    // Not inside LiveView (where viewedIndex lives).
    const live = join.slice(join.indexOf('function LiveView('), join.indexOf('export default function Join('))
    expect(live).not.toMatch(/phoneBackdrop|PhoneBackdrop/)
    // Static import graph: only the tiny module, never the backdrop/world modules.
    const staticImports = join.match(/^import .*$/gm).join('\n')
    expect(staticImports).toContain("from '../components/join/phoneBackdropThemes.js'")
    expect(staticImports).not.toMatch(/PhoneBackdrop\.jsx|ringWorldFor|hauntedOctober|forest/)
    const tiny = readFileSync(new URL('./phoneBackdropThemes.js', import.meta.url), 'utf8')
    expect(tiny.match(/^import .*$/gm)).toBeNull() // zero static imports
    expect(tiny).toContain("trackOptionalLoad(() => import('./PhoneBackdrop.jsx'))")
    // Roots go transparent only when the backdrop is on; otherwise the original gradient string.
    expect(join.match(/background: backdrop \? 'transparent' : `linear-gradient\(180deg, \$\{bg\} 0%, \$\{bgDeep\} 100%\)`/g)).toHaveLength(2)
  })
})

// ---- optional-chunk guard (critique of 3d-3) ----
import { trackOptionalLoad } from './phoneBackdropThemes.js'
describe('optional chunk load tracking', () => {
  it('holds the counter while a load is pending and releases it on resolve and on reject', async () => {
    globalThis.__optionalChunkLoads = 0
    let res, rej
    const ok = trackOptionalLoad(() => new Promise(r => { res = r }))
    expect(globalThis.__optionalChunkLoads).toBe(1)
    res('x'); await ok
    expect(globalThis.__optionalChunkLoads).toBe(0)
    const bad = trackOptionalLoad(() => new Promise((_, r) => { rej = r }))
    expect(globalThis.__optionalChunkLoads).toBe(1)
    rej(new Error('404')); await expect(bad).rejects.toThrow('404')
    expect(globalThis.__optionalChunkLoads).toBe(0)
    expect(() => trackOptionalLoad(() => { throw new Error('sync') })).toThrow('sync')
    expect(globalThis.__optionalChunkLoads).toBe(0)
  })
  it('main.jsx skips the stale-chunk reload while an optional load is in flight', () => {
    const main = readFileSync(new URL('../../main.jsx', import.meta.url), 'utf8')
    const i = main.indexOf("addEventListener('vite:preloadError'")
    const guard = main.indexOf('window.__optionalChunkLoads > 0', i)
    const reload = main.indexOf('window.location.reload()', i)
    expect(i).toBeGreaterThan(-1)
    expect(guard).toBeGreaterThan(i)
    expect(guard).toBeLessThan(reload) // the guard precedes the reload
  })
})
