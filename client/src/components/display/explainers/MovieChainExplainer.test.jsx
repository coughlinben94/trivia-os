// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '../../shared/ThemeProvider.jsx'
import { MOVIE_CHAIN_POINTS } from '../../../lib/movieChainScoring.js'
import MovieChainExplainer, { SAMPLE_CHAINS } from './MovieChainExplainer.jsx'

describe('<MovieChainExplainer>', () => {
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

  it('sample chains are scored by the real scorer: shortest, one longer, wrong link', () => {
    expect(SAMPLE_CHAINS.map(chain => chain.points)).toEqual([MOVIE_CHAIN_POINTS.shortest, MOVIE_CHAIN_POINTS.oneLonger, 0])
    expect(SAMPLE_CHAINS.map(chain => chain.reason)).toEqual([null, null, 'final-link'])
  })

  it('renders endpoints, count, chains and scores', () => {
    act(() => root.render(<ThemeProvider><MovieChainExplainer /></ThemeProvider>))
    const text = container.textContent
    expect(text).toContain('Titanic → Good Will Hunting')
    expect(text).toContain('Shortest chain: 3 movies')
    expect(text).toContain('Interstellar')
    expect(text).toContain(`+${MOVIE_CHAIN_POINTS.shortest}`)
    expect(text).toContain(`+${MOVIE_CHAIN_POINTS.oneLonger}`)
    expect(text).toContain('Jack Nicholson isn’t in Good Will Hunting')
  })
})
