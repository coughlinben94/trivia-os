// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

// The wizard pulls in useShow.js (for sortedSlides) and jukeboxSupabase.js,
// both of which reach the real Supabase client at import time. Stub the client
// itself — one mock covers every path into it, and jukeboxSupabase's own
// try/catch turns the resulting TypeError into the `null` it already handles.
// `.from` additionally needs a real chain now that the wizard's own bendle_songs
// fetch effect calls `supabase.from(...).select(...).order(...)` unconditionally
// on mount (Task 5) — an empty object made that throw on every render.
vi.mock('../../lib/supabase.js', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        order: () => Promise.resolve({ data: [{ id: 'song_1', title: 'Test Song', answer: 'Test Song', aliases: [] }] }),
      }),
    }),
  },
}))

const { default: AddSlideWizard } = await import('./AddSlideWizard.jsx')

const fmt = (id, name, type) => ({
  id, name, icon: '✨', blurb: `${name} blurb`, description: `${name} description`,
  input_schema: { type, slots: 1, seriesEnabled: false, labels: [] },
})

const FORMATS = [
  fmt('fmt_grid', 'Grid Fmt', 'grid'),
  fmt('fmt_venn', 'Venn Fmt', 'venn'),
  fmt('fmt_matching', 'Matching Fmt', 'matching'),
  fmt('fmt_bendle', 'Bendle Fmt', 'bendle'),
]

const GRID_STRINGS = ['Columns', 'Rows']
const VENN_STRINGS = ['How many separate questions?', 'How many per side?']

let host, root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function click(text) {
  const btn = [...host.querySelectorAll('button')].find(b => b.textContent.includes(text))
  if (!btn) throw new Error(`no button containing "${text}"`)
  act(() => { btn.dispatchEvent(new MouseEvent('click', { bubbles: true })) })
}

// Mount straight into the shiny format picker, then walk the two clicks a host
// makes: select the format card, then "Add <name> →" into the details step.
function openDetails(name) {
  act(() => root.render(
    <AddSlideWizard
      show={{ id: 'show_1', rounds: [] }}
      shinyFormats={FORMATS}
      shinyLoading={false}
      initialData={{ type: 'shiny-question' }}
      onAddSlide={() => {}}
      onClose={() => {}}
      onTypeChange={() => {}}
    />,
  ))
  click(name)
  click(`Add ${name}`)
  expect(host.textContent).toContain(`${name} blurb`) // proves we're on the details step
}

describe('AddSlideWizard shiny details — registry wiring', () => {
  it('renders grid\'s own Columns/Rows controls and no venn controls', () => {
    openDetails('Grid Fmt')
    for (const s of GRID_STRINGS) expect(host.textContent).toContain(s)
    for (const s of VENN_STRINGS) expect(host.textContent).not.toContain(s)
  })

  it('renders venn\'s own two count controls and no grid controls', () => {
    openDetails('Venn Fmt')
    for (const s of VENN_STRINGS) expect(host.textContent).toContain(s)
    for (const s of GRID_STRINGS) expect(host.textContent).not.toContain(s)
  })

  it('renders neither for a hasOwnControls:false kind (matching)', () => {
    openDetails('Matching Fmt')
    for (const s of [...GRID_STRINGS, ...VENN_STRINGS]) expect(host.textContent).not.toContain(s)
  })
})

// 2026-09-05 whole-branch review, Fix 1: a Bendle slide used to create with
// bendleSongId: null (canAddShiny only checked roundId+answer, and Bendle has
// no typed answer to check) — dead end downstream, no recovery path. Asserts
// the create-gate itself, not just that a control renders.
function createButtonFor(name) {
  return [...host.querySelectorAll('button')].find(b => b.textContent.trim().startsWith(`Add ${name}`))
}

describe('AddSlideWizard shiny details — bendle song gate', () => {
  it('disables create with no song picked, and enables it once one is', async () => {
    act(() => root.render(
      <AddSlideWizard
        show={{ id: 'show_1', rounds: [{ id: 'round_1', number: 1, title: 'Round 1' }] }}
        shinyFormats={FORMATS}
        shinyLoading={false}
        initialData={{ type: 'shiny-question', roundId: 'round_1' }}
        onAddSlide={() => {}}
        onClose={() => {}}
        onTypeChange={() => {}}
      />,
    ))
    click('Bendle Fmt')
    click('Add Bendle Fmt')
    // bendle_songs fetch is async — flush it before checking the select's options.
    await act(async () => { await Promise.resolve() })

    expect(createButtonFor('Bendle Fmt').disabled).toBe(true)
    expect(host.textContent).toContain('Pick a song to continue')

    const songSelect = [...host.querySelectorAll('select')]
      .find(s => [...s.options].some(o => o.value === 'song_1'))
    act(() => {
      songSelect.value = 'song_1'
      songSelect.dispatchEvent(new Event('change', { bubbles: true }))
    })

    expect(createButtonFor('Bendle Fmt').disabled).toBe(false)
  })
})
