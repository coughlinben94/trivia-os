import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { ringVisibleStationIndex, ringPeekIndex } from './ringStationIndex.js'
import { isRingVisible, resolveRingSlideIndex } from './ringStationResolver.js'

// ORACLE: Display.jsx's predicate text as of 51f09b4, copied literally. Do not
// "sync" this with the resolver — it exists to catch drift in the moved copy.
const OLD_IS_RING_VISIBLE = s =>
  s?.type === 'team-preview' || s?.type === 'grading-break' ||
  s?.type === 'question' ||
  s?.type === 'pre-show' || s?.type === 'round-intro' || s?.type === 'swing-round-intro' ||
  s?.type === 'shiny-title' || s?.type === 'bonus'
const OLD_VISIBLE_SET = ['team-preview', 'grading-break', 'question', 'pre-show',
  'round-intro', 'swing-round-intro', 'shiny-title', 'bonus']

// Display.jsx's old inline formula (site 1 shape: `show.current_slide_index ?? 0`).
const oldFormula = (sorted, cur) =>
  ringVisibleStationIndex(sorted, ringPeekIndex(sorted, cur ?? 0), OLD_IS_RING_VISIBLE)

// Every SLIDE_COMPONENTS key, read from source (importing SlideRenderer pulls
// the whole slide-component tree).
const src = readFileSync(new URL('../components/display/SlideRenderer.jsx', import.meta.url), 'utf8')
const block = src.match(/const SLIDE_COMPONENTS = \{([\s\S]*?)\n\}/)[1]
const SLIDE_TYPES = [...block.matchAll(/'([a-z-]+)'\s*:/g)].map(m => m[1])

// Seeded LCG so the matrix is the same every run.
function rng(seed) {
  let x = seed >>> 0
  return () => ((x = (x * 1664525 + 1013904223) >>> 0) / 2 ** 32)
}

const teamPicker = (parts, currentPart) => ({
  type: 'team-picker',
  data: parts == null ? {} : { parts: Array.from({ length: parts }, (_, i) => i), currentPart },
})
const TEAM_PICKER_VARIANTS = [
  teamPicker(null), teamPicker(0, 0), teamPicker(3, 0), teamPicker(3, 1),
  teamPicker(3, 2) /* landed */, teamPicker(1, undefined) /* landed via ?? 0 */, teamPicker(2, 5),
]

function buildShows() {
  const shows = [
    [],
    [{ type: 'pre-show' }],
    [teamPicker(3, 2)], // landed team-picker LAST: peek past the end
    [teamPicker(3, 1)],
    [{ type: 'pre-show' }, teamPicker(3, 2), { type: 'question' }],
    [{ type: 'pre-show' }, teamPicker(3, 0), { type: 'round-intro' }, { type: 'question' }],
    [{ type: 'question' }, { type: 'scoreboard-reveal' }, { type: 'grid' }, { type: 'venn' }, { type: 'question' }],
    [{ type: 'shiny-title' }, { type: 'question', data: { introDone: true } }, { type: 'bonus' }],
    [null, undefined, {}, { type: 'question' }],
  ]
  const r = rng(0x3d2)
  const pool = [...SLIDE_TYPES.filter(t => t !== 'team-picker'), 'unknown-type']
  for (let n = 0; n < 200; n++) {
    const len = 1 + Math.floor(r() * 14)
    const show = []
    for (let i = 0; i < len; i++) {
      show.push(r() < 0.15
        ? TEAM_PICKER_VARIANTS[Math.floor(r() * TEAM_PICKER_VARIANTS.length)]
        : { type: pool[Math.floor(r() * pool.length)] })
    }
    shows.push(show)
  }
  return shows
}

const SHOWS = buildShows()
const indicesFor = show => [undefined, null, ...Array.from({ length: show.length + 3 }, (_, i) => i)]
const CASES = SHOWS.flatMap(show => indicesFor(show).map(cur => [show, cur]))

describe('resolveRingSlideIndex', () => {
  it(`equals the old Display.jsx inline formula on all ${CASES.length} (show, index) pairs`, () => {
    expect(CASES.length).toBeGreaterThan(1500)
    for (const [show, cur] of CASES) {
      expect(resolveRingSlideIndex(show, cur), JSON.stringify({ show, cur })).toBe(oldFormula(show, cur))
    }
  })

  it('site 2 shape (guarded non-null index, no ?? 0) matches too', () => {
    for (const [show, cur] of CASES) {
      if (cur == null) continue
      const site2Old = ringVisibleStationIndex(show, ringPeekIndex(show, cur), OLD_IS_RING_VISIBLE)
      expect(resolveRingSlideIndex(show, cur)).toBe(site2Old)
    }
  })

  // Teeth: each dropped ingredient must change the answer somewhere in CASES.
  const differsSomewhere = f => CASES.some(([show, cur]) => f(show, cur) !== resolveRingSlideIndex(show, cur))
  it('matrix catches a version without the team-picker peek', () => {
    expect(differsSomewhere((s, c) => ringVisibleStationIndex(s, c ?? 0, isRingVisible))).toBe(true)
  })
  it('matrix catches a version without the visibility predicate', () => {
    expect(differsSomewhere((s, c) => ringVisibleStationIndex(s, ringPeekIndex(s, c ?? 0), () => true))).toBe(true)
  })
  it('matrix catches a version that drops ?? 0', () => {
    expect(differsSomewhere((s, c) => ringVisibleStationIndex(s, ringPeekIndex(s, c), isRingVisible))).toBe(true)
  })
})

describe('isRingVisible truth table over SLIDE_COMPONENTS', () => {
  it('found the slide type list', () => {
    expect(SLIDE_TYPES).toContain('question')
    expect(SLIDE_TYPES).toContain('team-picker')
    expect(SLIDE_TYPES.length).toBeGreaterThanOrEqual(25)
  })
  it('visible set equals the old Display.jsx list exactly', () => {
    const visible = SLIDE_TYPES.filter(type => isRingVisible({ type })).sort()
    expect(visible).toEqual(SLIDE_TYPES.filter(type => OLD_IS_RING_VISIBLE({ type })).sort())
    expect(visible).toEqual([...OLD_VISIBLE_SET].sort())
  })
  it('null/undefined/typeless slides are not visible', () => {
    for (const s of [null, undefined, {}, { type: 'nope' }]) expect(isRingVisible(s)).toBe(false)
  })
})

// Pins the two TV call sites by source text (critique of 3d-2: no test read Display.jsx, so a wrong
// index/array/guard there would pass every other test). Display is too heavy to render here.
describe('Display.jsx call sites', () => {
  const display = readFileSync(new URL('../views/Display.jsx', import.meta.url), 'utf8')
  it('uses the shared resolver exactly twice, with the reviewed arguments', () => {
    expect(display.match(/resolveRingSlideIndex\(/g)).toHaveLength(2)
    expect(display).toContain('resolveRingSlideIndex(sortedSlides, show.current_slide_index ?? 0)')
    expect(display).toMatch(/show\.current_slide_index != null\s*\n?\s*\? resolveRingSlideIndex\(sortedForRing, show\.current_slide_index\)\s*\n?\s*: null/)
  })
  it('keeps no private copy of the formula or predicate', () => {
    expect(display).not.toMatch(/ringVisibleStationIndex\(/)
    expect(display).not.toMatch(/ringPeekIndex\(/)
    expect(display).not.toMatch(/const isRingVisible/)
  })
})
