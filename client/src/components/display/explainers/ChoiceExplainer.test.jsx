// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '../../shared/ThemeProvider.jsx'
import ChoiceExplainer, { SAMPLE_CHOICE_RESULTS } from './ChoiceExplainer.jsx'

describe('<ChoiceExplainer>', () => {
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

  it('samples are scored by the real scorer: exact set scores, wrong or extra pick scores 0', () => {
    const points = SAMPLE_CHOICE_RESULTS.map(s => s.answers.map(a => a.points > 0))
    expect(points).toEqual([[true, false], [true, false]])
  })

  it('shows both single-pick and multi-pick examples with score vs 0, no point number', () => {
    act(() => root.render(<ThemeProvider><ChoiceExplainer /></ThemeProvider>))
    const text = container.textContent
    expect(text).toContain('Pick one')
    expect(text).toContain('Pick every one that fits')
    expect(text).toContain('Extra pick: Pluto')
    expect(text.match(/Scores/g)).toHaveLength(2)
    expect(text).not.toMatch(/\+\d|\d+ points/)
  })

  it('single-pick title shows only the pick-one half', () => {
    act(() => root.render(<ThemeProvider><ChoiceExplainer data={{ shinyMultiSelect: false }} /></ThemeProvider>))
    const text = container.textContent
    expect(text).toContain('Pick one')
    expect(text).not.toContain('Pick every one that fits')
    expect(text.match(/Scores/g)).toHaveLength(1)
  })

  it('multi-pick title shows only the pick-every-one half', () => {
    act(() => root.render(<ThemeProvider><ChoiceExplainer data={{ shinyMultiSelect: true }} /></ThemeProvider>))
    const text = container.textContent
    expect(text).toContain('Pick every one that fits')
    expect(text).not.toContain('Pick one')
    expect(text).toContain('Extra pick: Pluto')
  })
})
