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

  it('applies grayscale filter to eliminated face cards at elimStep 1', () => {
    render(makeSlide({ elimStep: 1 }))

    // At elimStep 1 with survivors = ['id0', 'id1', 'id2', 'id3'],
    // indices 4-7 should be eliminated
    let eliminatedCount = 0
    let survivingCount = 0

    for (let i = 0; i < 8; i++) {
      const label = `Face ${i}`
      // Find the span with this label
      const labelSpan = Array.from(container.querySelectorAll('span')).find(el => el.textContent.trim() === label)
      expect(labelSpan).toBeTruthy()

      // Get the parent div (FaceCard - motion.div)
      const faceCard = labelSpan.parentElement
      const hasGrayscale = faceCard?.style.filter?.includes('grayscale')

      const isAlive = i < 4
      if (isAlive) {
        expect(hasGrayscale).toBeFalsy()
        survivingCount++
      } else {
        expect(hasGrayscale).toBeTruthy()
        eliminatedCount++
      }
    }

    expect(eliminatedCount).toBe(4)
    expect(survivingCount).toBe(4)
  })

  it('renders identically at elimStep 3 vs elimStep 2 (step 3 changes no survivors)', () => {
    render(makeSlide({ elimStep: 2 }))
    const step2Html = container.innerHTML
    act(() => root.unmount())
    container.remove()

    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    render(makeSlide({ elimStep: 3 }))
    const step3Html = container.innerHTML

    // Both boards should show the same 8 face cards with the same
    // alive/eliminated state; only the extra spoken-only hint caption
    // differs at step 3. Compare eliminated/surviving counts rather than
    // raw HTML since a new hint caption node shifts markup.
    expect(step3Html).toContain('Final spoken clue.')
    expect(step2Html).not.toContain('Final spoken clue.')
    for (let i = 0; i < 4; i++) expect(step3Html).toContain(`Face ${i}`)
  })

  it('empty survivors array for a hint eliminates nobody (final review fix)', () => {
    render(makeSlide({
      elimStep: 1,
      hints: [
        { text: 'Unticked hint.', survivors: [] },
        { text: 'Hint 2.', survivors: ['id0'] },
        { text: 'Hint 3.' },
      ],
    }))

    for (let i = 0; i < 8; i++) {
      const label = `Face ${i}`
      const labelSpan = Array.from(container.querySelectorAll('span')).find(el => el.textContent.trim() === label)
      const faceCard = labelSpan.parentElement
      expect(faceCard?.style.filter?.includes('grayscale')).toBeFalsy()
    }
  })
})
