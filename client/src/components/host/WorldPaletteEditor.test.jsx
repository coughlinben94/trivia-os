// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

// The ring engine itself is verified by concepts/tools/ring-verify.mjs against
// real rendered frames; standing it up inside jsdom would prove nothing about
// this component and would need ResizeObserver/matchMedia/rAF stubs to even
// boot. Stub it and record what it is handed instead — what this file is
// actually for is the wiring: does the editor feed the preview a world that
// tracks the palette, and does Apply hand up the right object.
// `mounts` records MOUNTS, not renders. That distinction is the whole point:
// the real RingAmbient builds its DOM world once in a mount effect and
// deliberately never re-runs it when worldData changes, so handing it a fresh
// worldData under a stable key updates nothing on screen. Only a remount
// re-renders the preview, so only a remount counts.
vi.mock('../../lib/ringPalettesClient.js', () => ({
  fetchCertifiedPalettes: vi.fn().mockResolvedValue([
    { id: '1', colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35], drift: { arc: 60 }, source: 'generated', seed: '42', stations: null },
    {
      id: '2', colors: ['#22c55e', '#eab308'], weights: [0.5, 0.5], drift: { arc: 30 }, source: 'generated', seed: '99',
      // Swap of positions 0/10 — same swap the 2026-09-14 shelf-stations
      // plan's own integration test used, reused here for the same reason
      // ringWorldFor.test.js reuses it: two independent "known good" swaps
      // agreeing is worth more than either alone.
      stations: ['eclipse', 'spiral galaxy', 'star cluster', 'amber planet', 'lit planet', 'pulsar', 'rose nebula', 'comet', 'binary pair', 'asteroid field', 'ringed planet', 'aurora ribbon', 'supernova'],
    },
  ]),
  saveAsPending: vi.fn().mockResolvedValue(undefined),
  findMatch: (shelf, p) => shelf.find(s => JSON.stringify(s.colors) === JSON.stringify(p.colors) && JSON.stringify(s.weights) === JSON.stringify(p.weights) && JSON.stringify(s.drift) === JSON.stringify(p.drift)),
}))

const mounts = []
vi.mock('../display/RingAmbient.jsx', async () => {
  const { useEffect } = await import('react')
  return {
    default: props => {
      useEffect(() => { mounts.push(props) }, [])
      return null
    },
  }
})

let drawWorldImpl = () => { throw new Error('ringDraw: pool cannot fill 13 slots under the caps (chose 11 of 13)') }
vi.mock('../../lib/drawWorld.js', async () => {
  const actual = await vi.importActual('../../lib/drawWorld.js')
  return { ...actual, drawWorld: (...args) => drawWorldImpl(...args) }
})

const { default: WorldPaletteEditor } = await import('./WorldPaletteEditor.jsx')

const BASE = {
  colors: {
    bg: '#08001a', bgDeep: '#040010', accent: '#4a1a8f', highlight: '#c060ff',
    text: '#e8d0ff', textMuted: '#8050b0', shinyBg: '#120030', shinyAccent: '#ff40a0',
  },
}

let host, root
beforeEach(() => {
  mounts.length = 0
  drawWorldImpl = () => { throw new Error('ringDraw: pool cannot fill 13 slots under the caps (chose 11 of 13)') }
  vi.useFakeTimers()
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.useRealTimers()
})

function render(props = {}) {
  act(() => root.render(
    <WorldPaletteEditor
      baseTheme={BASE}
      onClose={() => {}}
      onApplyThemeColors={() => {}}
      {...props}
    />,
  ))
}

const swatches = () => [...host.querySelectorAll('input[type="color"]')]
const byText = text => [...host.querySelectorAll('button')].find(b => b.textContent.includes(text))

function setColor(index, value) {
  const input = swatches()[index]
  act(() => {
    // React tracks the DOM value node-side; bypass it so the change event is
    // seen as a real edit.
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')
      .set.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('WorldPaletteEditor', () => {
  it('opens on preset swatches and the full 13-station world', () => {
    render()
    expect(swatches()).toHaveLength(0)
    expect(byText('Custom colors')).toBeTruthy()
    expect(mounts[0].worldData.stations).toHaveLength(13)
  })

  it('applying a preset commits colors+weights and remounts the preview', () => {
    render()
    const first = mounts[0].worldData.stations.map(s => s.hue)
    act(() => byText('Amber & Rose').click())
    expect(mounts).toHaveLength(2)
    expect(mounts[1].worldData.stations.map(s => s.hue)).not.toEqual(first)
  })

  it('remounts the preview with the new hues when the palette changes', () => {
    // If this regresses to a stable key, the weight bar and the swatches look
    // dead: everything else on screen updates and the preview does not.
    render()
    act(() => byText('Custom colors').click())
    const first = mounts[0].worldData.stations.map(s => s.hue)
    setColor(0, '#f97316')
    act(() => { vi.advanceTimersByTime(500) })
    expect(mounts).toHaveLength(2)
    expect(mounts[1].worldData.stations.map(s => s.hue)).not.toEqual(first)
  })

  it('does not rebuild the preview on every tick of a color drag', () => {
    // A remount rebuilds several thousand DOM nodes. Native color inputs fire
    // continuously while the OS picker is open, so the commit is debounced.
    render()
    act(() => byText('Custom colors').click())
    setColor(0, '#f97316')
    setColor(0, '#f97318')
    setColor(0, '#f97320')
    expect(mounts).toHaveLength(1)
    act(() => { vi.advanceTimersByTime(500) })
    expect(mounts).toHaveLength(2)
  })

  it('adds and removes a third color, keeping the bar at 100%', () => {
    render()
    act(() => byText('Custom colors').click())
    act(() => byText('add a third color').click())
    expect(swatches()).toHaveLength(3)
    const pct = [...host.querySelectorAll('[style*="width"]')]
      .filter(el => el.style.width.endsWith('%'))
      .map(el => parseFloat(el.style.width))
    expect(Math.round(pct.reduce((a, b) => a + b, 0))).toBe(100)

    act(() => byText('remove third color').click())
    expect(swatches()).toHaveLength(2)
  })

  it('hands Apply the four theme colors AND the worldPalette (2026-09-03: the ring is a runtime value now)', async () => {
    const applied = []
    render({ onApplyThemeColors: c => applied.push(c) })
    await act(async () => { await Promise.resolve() }) // let the shelf fetch resolve — default palette matches the mocked shelf row
    act(() => byText("Apply to this show's theme").click())
    expect(applied).toHaveLength(1)
    expect(Object.keys(applied[0]).sort()).toEqual(['themeColors', 'worldPalette'])
    expect(Object.keys(applied[0].themeColors).sort()).toEqual(['accent', 'bg', 'bgDeep', 'highlight'])
    for (const v of Object.values(applied[0].themeColors)) expect(v).toMatch(/^#[0-9a-f]{6}$/)
    expect(applied[0].worldPalette).toEqual({ colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35], drift: { arc: 60 } })
  })

  it('lists every station with its advisory row once details are expanded', () => {
    // The table is advisory/dev-facing (hue/luma math), collapsed by default
    // so the host's first view is just colors + weight bar + preview + Apply.
    render()
    act(() => byText('Technical details').click())
    expect(host.querySelectorAll('tbody tr')).toHaveLength(13)
  })

  it('hands Ben a copyable ring-recolor command built from the committed palette, once expanded', () => {
    // The screen shows a full before/after hue table next to an Apply button.
    // Without this the host has no way to tell that Apply does NOT touch the
    // ring — and no path to actually recolor it besides asking an engineer.
    render()
    act(() => byText('Technical details').click())
    expect(host.textContent.replace(/\s+/g, ' ')).toContain(
      "Apply recolours this show's theme AND its ring world. The TV picks it up when "
      + "/display loads — reload the display if it's already open.",
    )
    const code = [...host.querySelectorAll('code')].find(el => el.textContent.includes('ring-recolor.mjs'))
    expect(code.textContent).toBe(
      "node scripts/ring-recolor.mjs --colors '#a855f7,#3b82f6' --weights '0.65,0.35' --write && npm run test:unit && npm run verify:ring",
    )
  })

  it('copies the ring-recolor command to the clipboard and flips the button label', async () => {
    const writeText = vi.fn().mockResolvedValue()
    Object.assign(navigator, { clipboard: { writeText } })
    render()
    act(() => byText('Technical details').click())
    await act(async () => { byText('Copy command').click() })
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('ring-recolor.mjs'))
    expect(byText('Copied ✓')).toBeTruthy()
    act(() => { vi.advanceTimersByTime(1500) })
    expect(byText('Copy command')).toBeTruthy()
  })

  it('Apply on a shelf-matching palette applies immediately, no pending message', async () => {
    const applied = []
    render({ onApplyThemeColors: c => applied.push(c) })
    await act(async () => { await Promise.resolve() }) // let the shelf fetch resolve
    act(() => byText("Apply to this show's theme").click())
    await act(async () => { await Promise.resolve() })
    expect(applied).toHaveLength(1)
    expect(byText('Saved, pending check')).toBeFalsy()
  })

  it('disables Apply while the shelf is still loading, so the default preset cannot race the fetch into a false "pending"', async () => {
    render()
    expect(byText("Apply to this show's theme").disabled).toBe(true) // shelf fetch hasn't resolved yet
    await act(async () => { await Promise.resolve() }) // let it resolve
    expect(byText("Apply to this show's theme").disabled).toBe(false)
  })

  it('Apply on a NON-matching custom palette saves as pending instead of applying', async () => {
    const applied = []
    render({ onApplyThemeColors: c => applied.push(c) })
    await act(async () => { await Promise.resolve() })
    act(() => byText('Custom colors').click())
    setColor(0, '#112233') // guaranteed not to match the mocked shelf's purple
    act(() => { vi.advanceTimersByTime(500) })
    act(() => byText("Apply to this show's theme").click())
    await act(async () => { await Promise.resolve() })
    expect(applied).toHaveLength(0)
    expect(byText('Saved, pending check')).toBeTruthy()
  })

  it('lists certified shelf rows as clickable cards, including a drawn-world row', async () => {
    // Scoped to `.shrink-0` (the shelf-card class) — the preset row's own
    // buttons also carry a `title` attribute (pre-existing, unrelated to
    // this task), so a bare `button[title]` query over-matches.
    render()
    await act(async () => { await Promise.resolve() })
    const cards = [...host.querySelectorAll('button.shrink-0[title]')]
    expect(cards).toHaveLength(2)
    expect(cards[1].title).toContain('eclipse')
  })

  it('picking a drawn-world shelf card reorders the preview stations to match', async () => {
    render()
    await act(async () => { await Promise.resolve() })
    const worldCard = [...host.querySelectorAll('button[title]')].find(b => b.title.startsWith('eclipse'))
    act(() => worldCard.click())
    const last = mounts.at(-1).worldData.stations
    expect(last[0].key).toBe('eclipse')
    expect(last[10].key).toBe('ringed planet')
  })

  it('Apply on a picked drawn-world row hands up a ringWorld payload matching the shelf row', async () => {
    const applied = []
    render({ onApplyThemeColors: c => applied.push(c), showId: 'show-abc' })
    await act(async () => { await Promise.resolve() })
    const worldCard = [...host.querySelectorAll('button[title]')].find(b => b.title.startsWith('eclipse'))
    act(() => worldCard.click())
    act(() => byText("Apply to this show's theme").click())
    expect(applied).toHaveLength(1)
    expect(applied[0].ringWorld).toEqual({
      rowId: '2',
      seed: expect.stringMatching(/^showSeed:[0-9a-f]+$/),
      ringVersion: expect.any(String),
      stations: ['eclipse', 'spiral galaxy', 'star cluster', 'amber planet', 'lit planet', 'pulsar', 'rose nebula', 'comet', 'binary pair', 'asteroid field', 'ringed planet', 'aurora ribbon', 'supernova'],
      palette: { colors: ['#22c55e', '#eab308'], weights: [0.5, 0.5], drift: { arc: 30 } },
    })
  })

  it('Apply on a plain palette pick omits ringWorld entirely (back-compat)', async () => {
    const applied = []
    render({ onApplyThemeColors: c => applied.push(c) })
    await act(async () => { await Promise.resolve() })
    act(() => byText("Apply to this show's theme").click())
    expect(applied).toHaveLength(1)
    expect('ringWorld' in applied[0]).toBe(false)
  })

  it('Re-roll objects composes a new draw and updates the preview on success', async () => {
    // Real drawWorld keys are always resolvable RING_POOL entries (drawn
    // FROM the pool) — reuse the same known-good 13-key reorder as the
    // shelf mock above rather than placeholder keys, since the component
    // re-resolves stations by key against RING_POOL (see previewWorldData).
    const DRAWN_KEYS = ['eclipse', 'spiral galaxy', 'star cluster', 'amber planet', 'lit planet', 'pulsar', 'rose nebula', 'comet', 'binary pair', 'asteroid field', 'ringed planet', 'aurora ribbon', 'supernova']
    drawWorldImpl = () => ({
      world: {
        stations: DRAWN_KEYS.map(key => ({ key })),
        palette: { colors: ['#111111', '#222222'], weights: [0.7, 0.3], drift: { arc: 45 } },
      },
      showSeed: 1, nounSeed: 2, palSeed: 3,
    })
    render()
    await act(async () => { await Promise.resolve() })
    act(() => byText('Re-roll objects').click())
    expect(mounts.at(-1).worldData.stations[0].key).toBe('eclipse')
  })

  it("Re-roll objects shows a plain error instead of crashing when the pool cannot fill 13 slots (known limit — docs/superpowers/plans/2026-09-14-ring-world-shelf-stations.md)", async () => {
    render()
    await act(async () => { await Promise.resolve() })
    act(() => byText('Re-roll objects').click())
    expect(host.textContent).toContain("Couldn't compose a new object set")
    // Must not have crashed the rest of the modal:
    expect(byText("Apply to this show's theme")).toBeTruthy()
  })
})
