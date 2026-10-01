// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '../../shared/ThemeProvider.jsx'
import DropExplainer, { SAMPLE_DROP, SAMPLE_DROP_RESULT } from './DropExplainer.jsx'
import { DEFAULT_DROP_TOTAL, isValidAlloc } from '../../../lib/dropScoring.js'

describe('<DropExplainer>', () => {
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

  it('uses a valid split scored by the real scorer', () => {
    expect(SAMPLE_DROP.total).toBe(DEFAULT_DROP_TOTAL)
    expect(isValidAlloc(SAMPLE_DROP.split, Object.keys(SAMPLE_DROP.split), SAMPLE_DROP.total)).toBe(true)
    expect(SAMPLE_DROP.points).toBe(SAMPLE_DROP.split[SAMPLE_DROP.correct.id])
    expect(SAMPLE_DROP.dropOrder).not.toContain(SAMPLE_DROP.correct.id)
    expect(SAMPLE_DROP_RESULT).toBe('Jupiter was right: keep 15. The 10 on Saturn are lost.')
  })

  it('renders the question, every tile, the pool and the result', () => {
    act(() => root.render(<ThemeProvider><DropExplainer /></ThemeProvider>))
    const textContent = container.textContent
    expect(textContent).toContain('Which planet is the biggest?')
    expect(textContent).toContain(`${DEFAULT_DROP_TOTAL} points to split`)
    for (const label of ['Saturn', 'Jupiter', 'Neptune', 'Earth']) expect(textContent).toContain(label)
    expect(textContent).toContain(SAMPLE_DROP_RESULT)
    expect(container.querySelector('[role="img"]').getAttribute('aria-label')).toContain(SAMPLE_DROP_RESULT)
  })
})
