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

  it('non-split output is byte-identical whether isSplit is omitted or explicitly false (2026-09-01 regression guard)', () => {
    expect(gridTemplate(0)).toBe(gridTemplate(0, false))
    expect(gridTemplate(3)).toBe(gridTemplate(3, false))
  })

  it('split mode scales the fixed tracks to fit a half-width column, not the full stage (2026-09-01 live, 21 teams: "half the names are cut off", "no scores showing")', () => {
    // Split mode always has 0 round columns (see the comment above
    // gridTemplate) — this is the exact shape the live board hit.
    const t = gridTemplate(0, true)
    expect(t).toBe('1.68cqw minmax(0, 16.27cqw) 4.44cqw')
    // Un-scaled, this same call produced '3.4cqw minmax(0, 33cqw) 9cqw' —
    // fixed-track width alone (before any padding/border) already ate 45.4
    // of the ~49.3cqw a split column actually has. The scaled fixed-track
    // total below must clear real headroom under that budget, not just
    // technically fit it, or a border/padding pixel clips it again exactly
    // like before.
    const fixedCqwTotal = 1.68 + 16.27 + 4.44
    const perColumnBudget = (100 - 1.4) / 2 // two columns, 1.4cqw gap
    expect(fixedCqwTotal).toBeLessThan(perColumnBudget * 0.7)
  })
})
