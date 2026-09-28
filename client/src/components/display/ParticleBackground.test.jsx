// @vitest-environment jsdom
// Covers ONLY ParticleBackground's ring branch: which ring component mounts
// for a given theme. Both ring components are mocked — a DOM marker can't
// tell them apart (EvolvingRingAmbient renders real RingAmbients inside), and
// their own engines have their own tests.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { getTheme } from '../../themes/index.js'

const rendered = []

vi.mock('./RingAmbient.jsx', () => ({
  default: (props) => { rendered.push({ kind: 'ring', props }); return null },
}))
vi.mock('./EvolvingRingAmbient.jsx', () => ({
  default: (props) => { rendered.push({ kind: 'evolving', props }); return null },
}))

const { default: ParticleBackground } = await import('./ParticleBackground.jsx')

async function mount(theme) {
  const container = document.createElement('div')
  const root = createRoot(container)
  await act(async () => {
    root.render(<ParticleBackground theme={theme} showId="show_pb_test" slideIndex={0} />)
  })
  await act(async () => { root.unmount() })
}

describe('ParticleBackground ring branch', () => {
  beforeEach(() => { rendered.length = 0 })

  it('renders EvolvingRingAmbient with the resolved arrangement when theme.colorEvolution is set', async () => {
    await mount({ ...getTheme('midnight-galaxy'), id: 'midnight-galaxy', colorEvolution: true })
    const kinds = new Set(rendered.map(r => r.kind))
    expect([...kinds]).toEqual(['evolving'])
    const { props } = rendered[0]
    expect(props.showId).toBe('show_pb_test')
    expect(props.slideIndex).toBe(0)
    expect(Array.isArray(props.arrangement?.stations)).toBe(true)
  })

  it('still renders plain RingAmbient when colorEvolution is not set', async () => {
    await mount({ ...getTheme('midnight-galaxy'), id: 'midnight-galaxy' })
    expect([...new Set(rendered.map(r => r.kind))]).toEqual(['ring'])
  })

  it('ignores colorEvolution on a theme with no ring world', async () => {
    await mount({ ...getTheme('under-the-sea'), id: 'under-the-sea', colorEvolution: true })
    expect(rendered).toEqual([])
  })
})
