// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { ThemeProvider } from '../../shared/ThemeProvider.jsx'
import FlipEmDownSlide from './FlipEmDownSlide.jsx'

function makeSlide(overrides = {}) {
  const items = Array.from({ length: 8 }, (_, i) => ({ id: `id${i}`, label: `Face ${i}`, imageUrl: null }))
  return {
    id: 'slide_1',
    type: 'flip-em-down',
    data: {
      items,
      hints: [
        { text: 'SNL cast member.', survivors: ['id0', 'id1', 'id2', 'id3'] },
        { text: 'Born in Illinois.', survivors: ['id0'] },
        { text: 'Final spoken clue.' },
      ],
      elimStep: 0,
      answer: 'Face 0',
      ...overrides,
    },
  }
}

describe('<FlipEmDownSlide>', () => {
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

  const render = slide => act(() => {
    root.render(
      <ThemeProvider>
        <FlipEmDownSlide slide={slide} />
      </ThemeProvider>
    )
  })

  it('renders all 8 face labels at elimStep 0', () => {
    render(makeSlide())
    for (let i = 0; i < 8; i++) {
      expect(container.textContent).toContain(`Face ${i}`)
    }
  })

  it('renders no hint caption at elimStep 0', () => {
    render(makeSlide())
    expect(container.textContent).not.toContain('SNL cast member.')
  })

  it('renders hint 1 caption at elimStep 1', () => {
    render(makeSlide({ elimStep: 1 }))
    expect(container.textContent).toContain('SNL cast member.')
    expect(container.textContent).not.toContain('Born in Illinois.')
  })

  it('renders all 3 hint captions at elimStep 3', () => {
    render(makeSlide({ elimStep: 3 }))
    expect(container.textContent).toContain('SNL cast member.')
    expect(container.textContent).toContain('Born in Illinois.')
    expect(container.textContent).toContain('Final spoken clue.')
  })
})
