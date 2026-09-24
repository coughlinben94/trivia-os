import { describe, it, expect } from 'vitest'
import { duoWalk, validateDuoGraph } from './duoWalk.js'

const LOOP_GRAPH = { a: ['b'], b: ['c'], c: ['a'] }
const BRANCHING_GRAPH = { a: ['b', 'c'], b: ['a', 'c'], c: ['a', 'b'] }

describe('duoWalk', () => {
  it('is deterministic — same seed/graph/stepIndex always returns the same duo', () => {
    const first = duoWalk('show_abc123', BRANCHING_GRAPH, 5)
    const second = duoWalk('show_abc123', BRANCHING_GRAPH, 5)
    expect(first).toBe(second)
  })

  it('different seeds can produce different walks', () => {
    // Not guaranteed for every possible pair, but true for a real spread of
    // seeds against a 3-node branching graph — if this ever flakes, the rng
    // salt or the graph fixture needs a look, not the test.
    const seeds = Array.from({ length: 20 }, (_, i) => `seed-${i}`)
    const results = new Set(seeds.map(s => duoWalk(s, BRANCHING_GRAPH, 0)))
    expect(results.size).toBeGreaterThan(1)
  })

  it('stepIndex 0 returns a valid starting node, no transitions taken', () => {
    const result = duoWalk('show_start', LOOP_GRAPH, 0)
    expect(Object.keys(LOOP_GRAPH)).toContain(result)
  })

  it('walks a fixed loop deterministically regardless of stepIndex size', () => {
    // LOOP_GRAPH has exactly one out-edge per node, so the walk is fully
    // determined by the start node once picked — every step's "choice" has
    // only one option.
    const start = duoWalk('show_loop', LOOP_GRAPH, 0)
    const order = ['a', 'b', 'c']
    const startIdx = order.indexOf(start)
    for (let step = 0; step < 9; step++) {
      expect(duoWalk('show_loop', LOOP_GRAPH, step)).toBe(order[(startIdx + step) % 3])
    }
  })

  it('replaying is consistent — stepIndex N is always one transition past N-1 from the same seed', () => {
    // This is the actual guarantee duoWalk has to hold: re-fetching after a
    // host adds a slide mid-show (which can only ever raise stepIndex for
    // slides not yet reached, never change a past one) must not change any
    // ALREADY-COMPUTED step's answer.
    const results = Array.from({ length: 8 }, (_, i) => duoWalk('show_replay', BRANCHING_GRAPH, i))
    for (let i = 0; i < results.length - 1; i++) {
      expect(BRANCHING_GRAPH[results[i]]).toContain(results[i + 1])
    }
  })

  it('returns null for an empty graph instead of throwing', () => {
    expect(duoWalk('show_empty', {}, 3)).toBeNull()
  })

  it('does not infinite-loop on a dead end — stops advancing once it hits one', () => {
    const deadEndGraph = { a: ['b'], b: [] }
    // Whichever step it lands on b, it must stay there rather than throwing
    // or hanging.
    expect(() => duoWalk('show_dead_end', deadEndGraph, 50)).not.toThrow()
    const result = duoWalk('show_dead_end', deadEndGraph, 50)
    expect(['a', 'b']).toContain(result)
  })
})

describe('validateDuoGraph', () => {
  it('reports no warnings for a valid, strongly-connected graph', () => {
    expect(validateDuoGraph(BRANCHING_GRAPH)).toEqual([])
    expect(validateDuoGraph(LOOP_GRAPH)).toEqual([])
  })

  it('flags a node with no out-edges', () => {
    const warnings = validateDuoGraph({ a: ['b'], b: [] })
    expect(warnings.some(w => w.includes('"b"') && w.includes('no out-edges'))).toBe(true)
  })

  it('flags a self-loop', () => {
    const warnings = validateDuoGraph({ a: ['a'] })
    expect(warnings.some(w => w.includes('self-loop'))).toBe(true)
  })

  it('flags an edge pointing at a node that does not exist in the graph', () => {
    const warnings = validateDuoGraph({ a: ['ghost'] })
    expect(warnings.some(w => w.includes('"ghost"') && w.includes("isn't a node"))).toBe(true)
  })

  it('flags a graph that is not strongly connected (a trapped cluster)', () => {
    // a and b only ever point at each other, so a walk starting at 'a' can
    // never reach 'c' — c can reach a, but that's one direction, not
    // strong connectivity.
    const warnings = validateDuoGraph({ a: ['b'], b: ['a'], c: ['a'] })
    expect(warnings.some(w => w.includes('strongly connected'))).toBe(true)
  })

  it('flags an empty graph', () => {
    expect(validateDuoGraph({})).toEqual(['graph is empty — nothing to walk'])
  })
})
