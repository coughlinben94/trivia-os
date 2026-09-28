import { describe, it, expect } from 'vitest'
import { reusableRoundId, localDateString } from './showDefaults.js'

const rounds = [{ id: 'r1', roundType: 'swing' }, { id: 'r2' }]
describe('reusableRoundId', () => {
  it('reuses a matching type', () => {
    expect(reusableRoundId('r1', rounds, 'swing')).toBe('r1')
    expect(reusableRoundId('r2', rounds, 'normal')).toBe('r2')
  })
  it('rejects a mismatched, missing, or absent round', () => {
    expect(reusableRoundId('r1', rounds, 'pyl')).toBeNull()
    expect(reusableRoundId('nope', rounds, 'swing')).toBeNull()
    expect(reusableRoundId(null, rounds, 'swing')).toBeNull()
  })
})
describe('localDateString', () => {
  it('uses local calendar date', () => {
    expect(localDateString(new Date(2026, 8, 5, 23, 30))).toBe('2026-09-05')
  })
})
