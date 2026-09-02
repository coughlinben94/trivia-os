import { describe, it, expect } from 'vitest'
import {
  SPLIT_TEAM_THRESHOLD,
  REVEAL_CHROME_CQH,
  REVEAL_SPLIT_GAP_CQW,
  REVEAL_SINGLE_COLUMN_CQW,
  REVEAL_SPLIT_COLUMN_CQW,
  REVEAL_ROW_DURATION,
  REVEAL_LEADER_TAIL,
  revealTemplate,
  revealColumnWidthCqw,
  revealMetrics,
  revealStagger,
  revealRowDelay,
  splitByRank,
} from '../../../lib/scoreboardMath.js'

// Ben's shows: 21 teams is the real number, 3/9/10/12/30 are the boundaries
// around it (below the split threshold, at it, just past it, and a worst case).
const COUNTS = [3, 9, 10, 12, 21, 30]

describe('revealTemplate', () => {
  it('never emits repeat( — repeat(0, …) is invalid CSS and drops the whole grid-template-columns declaration (live 2026-09-01, overlay commit 590170c)', () => {
    for (const isSplit of [false, true]) {
      expect(revealTemplate(isSplit)).not.toMatch(/repeat\(/)
    }
  })

  it('is rank | flexible name | score — the name track is the only one that stretches', () => {
    expect(revealTemplate(false)).toBe('6.2cqw minmax(0, 1fr) 10.54cqw')
  })

  it('scales its fixed tracks down in split mode: cqw stays scoped to the FULL stage even inside a half-width column (overlay commit 3d1d5a5)', () => {
    const split = revealTemplate(true)
    expect(split).toBe('4.93cqw minmax(0, 1fr) 8.38cqw')

    const fixed = t => [...t.matchAll(/([\d.]+)cqw/g)].reduce((s, m) => s + Number(m[1]), 0)
    expect(fixed(split)).toBeLessThan(fixed(revealTemplate(false)))
  })

  it('leaves the majority of every column to the team name, in both modes', () => {
    for (const isSplit of [false, true]) {
      const fixed = [...revealTemplate(isSplit).matchAll(/([\d.]+)cqw/g)]
        .reduce((s, m) => s + Number(m[1]), 0)
      expect(fixed).toBeLessThan(revealColumnWidthCqw(isSplit) * 0.4)
    }
  })

  it('two split columns plus their gap fit inside the stage', () => {
    expect(REVEAL_SPLIT_COLUMN_CQW * 2 + REVEAL_SPLIT_GAP_CQW).toBeCloseTo(100, 6)
  })
})

describe('revealMetrics', () => {
  it('splits into two columns past SPLIT_TEAM_THRESHOLD, one below it', () => {
    expect(revealMetrics(SPLIT_TEAM_THRESHOLD).columnCount).toBe(1)
    expect(revealMetrics(SPLIT_TEAM_THRESHOLD + 1).columnCount).toBe(2)
    expect(revealMetrics(21).perColumn).toBe(11)
    expect(revealMetrics(30).perColumn).toBe(15)
  })

  it('every team fits on the stage with no scrolling, at every count Ben runs', () => {
    for (const n of COUNTS) {
      const m = revealMetrics(n)
      // perColumn rows + the gaps between them, plus the title chrome.
      const used = m.perColumn * m.row + (m.perColumn - 1) * m.gap + REVEAL_CHROME_CQH
      expect(used).toBeLessThanOrEqual(100)
    }
  })

  it('row metrics shrink monotonically as the team count grows, within each layout mode', () => {
    for (const range of [[1, SPLIT_TEAM_THRESHOLD], [SPLIT_TEAM_THRESHOLD + 1, 40]]) {
      let prev = Infinity
      for (let n = range[0]; n <= range[1]; n++) {
        const { row } = revealMetrics(n)
        expect(row).toBeLessThanOrEqual(prev + 1e-9)
        prev = row
      }
    }
  })

  it('splitting makes rows BIGGER, which is the entire reason to split', () => {
    expect(revealMetrics(SPLIT_TEAM_THRESHOLD + 1).row)
      .toBeGreaterThan(revealMetrics(SPLIT_TEAM_THRESHOLD).row)
  })

  it('caps row height so a 3-team board is not three giant bars', () => {
    expect(revealMetrics(3).row).toBe(revealMetrics(1).row)
  })

  it('name/score/rank/bar all derive from the row height, so nothing outgrows its row', () => {
    for (const n of COUNTS) {
      const m = revealMetrics(n)
      expect(m.name).toBeGreaterThan(0)
      expect(m.name * 1.15 + m.bar + m.padY * 2).toBeLessThan(m.row)
      expect(m.score).toBeLessThan(m.row)
      expect(m.crown).toBeLessThan(m.row)
    }
  })

  it('keeps names legible on a bar TV — 21 teams stays above 20px on the 918px-tall stage', () => {
    const px = revealMetrics(21).name * 9.18 // 1cqh on the 0.85-scaled 1080p stage
    expect(px).toBeGreaterThan(20)
  })

  it('never divides by zero on an empty roster', () => {
    const m = revealMetrics(0)
    expect(Number.isFinite(m.row)).toBe(true)
    expect(m.row).toBeGreaterThan(0)
  })
})

describe('revealStagger', () => {
  it('keeps the whole reveal near 2s no matter how many teams', () => {
    for (const n of COUNTS) {
      expect(revealStagger(n).total).toBeLessThanOrEqual(2.3)
    }
    // 21 teams at the old fixed 0.08 step took 0.3 + 20*0.08 = 1.9s of
    // stagger ALONE, before the row's own enter and the leader's crown.
    expect(revealStagger(21).span).toBeLessThan(1.9)
    expect(revealStagger(30).span).toBeLessThan(1.9)
  })

  it('compresses the per-row step as the count grows, never expanding it', () => {
    let prev = Infinity
    for (let n = 2; n <= 40; n++) {
      const { step } = revealStagger(n)
      expect(step).toBeLessThanOrEqual(prev + 1e-9)
      expect(step).toBeLessThanOrEqual(0.08)
      prev = step
    }
  })

  it('keeps the original 0.08 step for small boards, where nothing needs compressing', () => {
    expect(revealStagger(3).step).toBeCloseTo(0.08, 6)
    expect(revealStagger(9).step).toBeCloseTo(0.08, 6)
  })

  it('single team gets no stagger at all', () => {
    expect(revealStagger(1).span).toBe(0)
  })

  it('total accounts for the row enter and the leader crown that lands after it', () => {
    const s = revealStagger(21)
    expect(s.total).toBeCloseTo(s.last + REVEAL_LEADER_TAIL, 6)
    expect(REVEAL_LEADER_TAIL).toBeGreaterThan(REVEAL_ROW_DURATION)
  })
})

describe('revealRowDelay', () => {
  it('reveals lowest rank first, leader last', () => {
    for (const n of COUNTS) {
      const last = revealRowDelay(n, n)
      const first = revealRowDelay(1, n)
      expect(last).toBeCloseTo(revealStagger(n).base, 6)
      expect(first).toBeCloseTo(revealStagger(n).last, 6)
    }
  })

  it('orders strictly by rank, not by which column a team landed in', () => {
    const delays = Array.from({ length: 21 }, (_, i) => revealRowDelay(i + 1, 21))
    const sorted = [...delays].sort((a, b) => b - a)
    expect(delays).toEqual(sorted)
  })
})

describe('splitByRank', () => {
  it('runs 1..N down the left column then continues down the right', () => {
    expect(splitByRank([1, 2, 3, 4, 5], false)).toEqual([[1, 2, 3, 4, 5]])
    expect(splitByRank([1, 2, 3, 4, 5], true)).toEqual([[1, 2, 3], [4, 5]])
  })

  it('puts the extra team in the left column on an odd count, matching ScoreboardOverlay', () => {
    const [left, right] = splitByRank(Array.from({ length: 21 }, (_, i) => i + 1), true)
    expect(left.length).toBe(11)
    expect(right.length).toBe(10)
    expect(left[0]).toBe(1)
    expect(right[0]).toBe(12)
  })
})
