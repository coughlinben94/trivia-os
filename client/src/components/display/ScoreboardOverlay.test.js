import { describe, it, expect, vi } from 'vitest'

// ScoreboardOverlay imports the real Supabase client at module load, which
// throws on the undefined env vars a test run has. Only the import is reached.
vi.mock('../../lib/supabase.js', () => ({ supabase: {} }))

import { gridTemplate } from './ScoreboardOverlay.jsx'

describe('gridTemplate', () => {
  it('never emits repeat(0, …) — invalid CSS that drops the whole grid (2026-09-01 live, 21 teams)', () => {
    const t = gridTemplate(0)
    expect(t).not.toMatch(/repeat\(/)
    expect(t).toBe('3.4cqw minmax(0, 33cqw) 9cqw')
  })

  it('emits one 1fr track per round between name and total', () => {
    expect(gridTemplate(3)).toBe('3.4cqw minmax(0, 33cqw) minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr) 9cqw')
  })
})
