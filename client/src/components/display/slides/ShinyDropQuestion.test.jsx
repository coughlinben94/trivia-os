// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '../../shared/ThemeProvider.jsx'
import QuestionSlide from './QuestionSlide.jsx'

// The TV only ever reads aggregates: an RPC count and a head-only teams count.
vi.mock('../../../lib/supabase.js', () => ({
  supabase: {
    rpc: () => Promise.resolve({ data: 2 }),
    from: () => ({ select: () => ({ eq: () => Promise.resolve({ count: 5 }) }) }),
  },
}))
vi.mock('../../../lib/youtubeWarmAudio.js', () => ({ warmYoutubeAudio: vi.fn(), claimYoutubeAudio: vi.fn() }))

const options = ['a', 'b', 'c', 'd'].map(id => ({ id, label: `Tile ${id}` }))
const slide = data => ({
  id: 'd1', type: 'question', roundId: 'r1',
  data: {
    questionNumber: 1, isShiny: true, shinyInputSchema: { type: 'drop' },
    text: 'Which is real?', options, correctId: 'b', ...data,
  },
})

describe('<QuestionSlide> — The Drop on the TV', () => {
  let container, root
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    globalThis.FontFace = class { load() { return Promise.resolve(this) } }
    if (!document.fonts) document.fonts = { add() {}, delete() {}, ready: Promise.resolve() }
    HTMLCanvasElement.prototype.getContext = () => ({
      font: '16px sans-serif',
      measureText(s) { return { width: s.length * 16 * 0.55 } },
    })
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => { act(() => root.unmount()); container.remove() })

  const render = s => act(() => {
    root.render(<ThemeProvider><QuestionSlide slide={s} show={{ id: 'sh' }} /></ThemeProvider>)
  })
  // The tile wrapper that carries the fall: the element whose style holds the opacity.
  const tileFalls = () => [...container.querySelectorAll('span')]
    .filter(sp => /^Tile [a-d]$/.test(sp.textContent))
    .map(sp => {
      let el = sp
      while (el && el.style.opacity === '') el = el.parentElement
      return el?.style.opacity
    })

  it('dispatches a drop slide to the Drop renderer and shows all four tiles', () => {
    render(slide())
    expect(container.textContent).toContain('Which is real?')
    for (const id of ['a', 'b', 'c', 'd']) expect(container.textContent).toContain(`Tile ${id}`)
    expect(tileFalls()).toEqual(['1', '1', '1', '1'])
  })

  it('drops wrong tiles one per step, in authored order, never the correct one', () => {
    render(slide({ dropLocked: true, dropStep: 2 }))
    expect(tileFalls()).toEqual(['0', '1', '0', '1']) // a and c fell, b (correct) and d remain
  })

  it('after the last drop only the correct tile is left, and the all-in line shows', () => {
    render(slide({ dropLocked: true, dropStep: 3, dropRevealed: true, dropResults: { totals: {}, allIn: 2, teams: 4 } }))
    expect(tileFalls()).toEqual(['0', '1', '0', '0'])
    expect(container.textContent).toContain('2 teams went all-in')
  })

  it('shows what the room put on each tile once locked, and nothing before', () => {
    const results = { totals: { a: 40, b: 85, c: 0, d: 30 }, allIn: 1, teams: 6 }
    render(slide({ dropResults: results })) // not locked yet: no totals leak
    expect(container.textContent).not.toContain('85 pts')
    render(slide({ dropLocked: true, dropResults: results }))
    for (const t of ['40 pts', '85 pts', '0 pts', '30 pts']) expect(container.textContent).toContain(t)
  })

  it('says so when no correct tile was set', () => {
    render(slide({ dropLocked: true, correctId: null }))
    expect(container.textContent).toContain('No correct tile was set')
  })
})
