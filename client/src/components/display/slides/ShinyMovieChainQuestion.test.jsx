import { describe, it, expect, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import ShinyMovieChainQuestion, { lockedLabel } from './ShinyMovieChainQuestion.jsx'

vi.mock('../../../lib/supabase.js', () => ({ supabase: { rpc: vi.fn() } }))

const theme = { fonts: { display: 'Boogaloo', body: 'DM Sans' }, colors: { text: '#fff', highlight: '#ffd700' } }
const data = { movieChainStart: { title: 'Start' }, movieChainEnd: { title: 'End' }, movieChainCount: 3, movieChainLocked: true }

describe('Movie Chain TV', () => {
  it('holds the final verdict until reveal', () => {
    const markup = renderToStaticMarkup(<ShinyMovieChainQuestion slide={{ data: { ...data, movieChainResults: [{ valid: true, points: 15, movieLabels: ['Start', 'End'] }] } }} theme={theme} />)
    expect(markup).toContain('Start')
    expect(markup).toContain('End')
    expect(markup).toContain('Answers locked')
    expect(markup).not.toContain('15 points:')
  })

  it('shows a successful chain and score counts after reveal', () => {
    const markup = renderToStaticMarkup(<ShinyMovieChainQuestion slide={{ data: { ...data, movieChainRevealed: true, movieChainResults: [{ valid: true, points: 15, movieLabels: ['Start', 'Middle', 'End'], performerLabels: ['Alex', 'Blair'] }, { valid: false, points: 0 }] } }} theme={theme} />)
    expect(markup).toContain('Middle')
    expect(markup).toContain('Alex')
    expect(markup).toContain('15 points: 1 team')
    expect(markup).toContain('0 points: 1 team')
  })

  it('says "1 team", not "1 teams", on the TV', () => {
    expect(lockedLabel(0)).toBe('0 teams locked in')
    expect(lockedLabel(1)).toBe('1 team locked in')
    expect(lockedLabel(7)).toBe('7 teams locked in')
  })
})
