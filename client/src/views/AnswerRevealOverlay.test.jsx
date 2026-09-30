// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'

// Display.jsx builds a Supabase client at import time; no network in tests.
vi.mock('../lib/supabase.js', () => ({ supabase: {} }))

import { ThemeProvider } from '../components/shared/ThemeProvider.jsx'
import { AnswerRevealOverlay } from './Display.jsx'
import { SHINY_GOLD } from '../lib/shinyGold.js'

// 2026-09-30, Ben (TV, live show): hitting Answer showed "a black line across
// the screen that the answer sat on". Measured: the card was w-full (1792px)
// and ~232px tall — an 8:1 near-black band in every theme. The card must size
// to its answer, and carry the theme/shiny accent so it reads as a designed
// card, not a band.
describe('<AnswerRevealOverlay> card', () => {
  let container, root
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    globalThis.FontFace = class { load() { return Promise.resolve(this) } }
    if (!document.fonts) document.fonts = { add() {}, delete() {}, ready: Promise.resolve() }
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  })
  afterEach(() => { act(() => root.unmount()); container.remove() })

  const render = data => act(() => {
    root.render(
      <ThemeProvider>
        <AnswerRevealOverlay show={{ answer_reveal: true }} currentSlide={{ id: 'q', type: 'question', data: { text: 'Q', answer: 'Gary Busey', ...data } }} />
      </ThemeProvider>
    )
  })
  const card = () => container.querySelector('[data-testid="answer-card"]')

  it('shows the answer text', () => {
    render({})
    expect(container.textContent).toContain('Gary Busey')
  })
  it('card is not full width (no w-full band)', () => {
    render({})
    expect(card()).not.toBeNull()
    expect(card().className).not.toMatch(/\bw-full\b/)
  })
  it('a shiny question gets the fixed gold border', () => {
    render({ isShiny: true })
    expect(card().style.border).toContain('rgb(240, 216, 144)') // SHINY_GOLD #f0d890
    expect(SHINY_GOLD).toBe('#f0d890')
  })
  it('a non-shiny question gets a border that is not gold', () => {
    render({ isShiny: false })
    expect(card().style.border).not.toContain('rgb(240, 216, 144)')
    expect(card().style.border).not.toBe('')
  })
})
