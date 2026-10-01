// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '../../shared/ThemeProvider.jsx'
import MatchingExplainer, { SAMPLE_CORRECT_PAIRS, SAMPLE_MATCH_ANSWER } from './MatchingExplainer.jsx'

describe('<MatchingExplainer>', () => {
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

  it('scores the sample with the real scorer: 2 correct, 2 swapped', () => {
    expect(SAMPLE_CORRECT_PAIRS).toBe(2)
    expect(SAMPLE_MATCH_ANSWER.map(pair => pair.scored)).toEqual([true, true, false, false])
  })

  it('shows every pair with a text verdict, never a point number', () => {
    act(() => root.render(<ThemeProvider><MatchingExplainer /></ThemeProvider>))
    const text = container.textContent
    for (const word of ['Dog', 'Woof', 'Cow', 'Moo', 'Cat', 'Quack', 'Duck', 'Meow']) expect(text).toContain(word)
    expect(text.match(/Scores/g)).toHaveLength(2)
    expect(text.match(/✗0/g)).toHaveLength(2)
    expect(text).not.toMatch(/\+\d/)
  })
})
