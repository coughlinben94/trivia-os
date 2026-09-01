// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

// The wizard pulls in useShow.js (for sortedSlides) and jukeboxSupabase.js,
// both of which reach the real Supabase client at import time. Stub the client
// itself — one mock covers every path into it, and jukeboxSupabase's own
// try/catch turns the resulting TypeError into the `null` it already handles.
vi.mock('../../lib/supabase.js', () => ({ supabase: {} }))

const { default: AddSlideWizard } = await import('./AddSlideWizard.jsx')

const fmt = (id, name, type) => ({
  id, name, icon: '✨', blurb: `${name} blurb`, description: `${name} description`,
  input_schema: { type, slots: 1, seriesEnabled: false, labels: [] },
})

const FORMATS = [
  fmt('fmt_grid', 'Grid Fmt', 'grid'),
  fmt('fmt_venn', 'Venn Fmt', 'venn'),
  fmt('fmt_matching', 'Matching Fmt', 'matching'),
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
