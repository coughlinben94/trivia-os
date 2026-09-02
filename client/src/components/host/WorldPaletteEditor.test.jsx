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

  it('hands Apply exactly the four theme colors, and nothing ring-shaped', () => {
    const applied = []
    render({ onApplyThemeColors: c => applied.push(c) })
    act(() => byText("Apply to this show's theme").click())
    expect(applied).toHaveLength(1)
    expect(Object.keys(applied[0]).sort()).toEqual(['accent', 'bg', 'bgDeep', 'highlight'])
    for (const v of Object.values(applied[0])) expect(v).toMatch(/^#[0-9a-f]{6}$/)
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
      'Click Apply for the theme half. Paste this to Claude for the ring half — it needs '
      + 'a code change and a gate run, and the gate reports pre-existing spec warnings; '
      + 'the regression line is what must be green.',
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
})
