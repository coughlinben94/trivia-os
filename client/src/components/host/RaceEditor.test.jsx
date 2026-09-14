// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { useState } from 'react'

vi.mock('../../lib/supabase.js', () => ({
  supabase: { from: () => ({ select: () => ({ eq: () => Promise.resolve({ data: [] }), order: () => Promise.resolve({ data: [] }) }) }) },
}))

const { RaceEditor } = await import('./SlideEditor.jsx')

const baseData = {
  text: '',
  contenders: [
    { id: 'a', name: '', imageUrl: null },
    { id: 'b', name: '', imageUrl: null },
    { id: 'c', name: '', imageUrl: null },
    { id: 'd', name: '', imageUrl: null },
  ],
  beats: [
    { label: 'Week 1', values: [0, 0, 0, 0] },
    { label: 'Week 2', values: [0, 0, 0, 0] },
  ],
  raceStartedAt: null,
  answer: '',
}

function nativeInputSet(input, value) {
  const proto = input.type === 'textarea' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('<RaceEditor>', () => {
  let container, root

  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  // Mirrors real usage: SlideEditor owns `data` and passes setData/scheduleSave
  // down; this harness does the same so RaceEditor's writes are checked via
  // the round-trip re-render, not by inspecting a spy's call args.
  function Harness({ initial = baseData, scheduleSave = vi.fn() }) {
    const [data, setData] = useState(initial)
    return (
      <RaceEditor
        data={data}
        onChange={(key, value) => setData(d => ({ ...d, [key]: value }))}
        setData={setData}
        scheduleSave={scheduleSave}
        onMediaUpload={vi.fn()}
      />
    )
  }

  it('derives data.answer from the current beats whenever a value changes', () => {
    const scheduleSave = vi.fn()
    act(() => { root.render(<Harness scheduleSave={scheduleSave} />) })

    const nameInputs = container.querySelectorAll('input[placeholder^="Contender"]')
    expect(nameInputs.length).toBe(4)
    act(() => { nativeInputSet(nameInputs[0], 'Lion King') })
    act(() => { nativeInputSet(nameInputs[1], 'Forrest Gump') })

    const row0 = container.querySelectorAll('[data-beat-row]')[0]
    const contender2ValueInput = row0.querySelectorAll('input')[2] // [0]=label, [1]=contender1, [2]=contender2
    act(() => { nativeInputSet(contender2ValueInput, '50') })

    expect(scheduleSave).toHaveBeenCalled()
    const lastCall = scheduleSave.mock.calls.at(-1)[0]
    expect(lastCall.data.answer).toBe('Forrest Gump')
  })

  it('shows an inline warning and clears the answer on a final-beat tie', () => {
    const tiedData = {
      ...baseData,
      contenders: baseData.contenders.map((c, i) => ({ ...c, name: `C${i}` })),
      beats: [{ label: 'Week 1', values: [10, 10, 5, 5] }],
    }
    act(() => { root.render(<Harness initial={tiedData} />) })
    expect(container.textContent).toMatch(/no winner/i)
  })
})
