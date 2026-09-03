import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  readStationHues, rewriteRingJs, rewriteHtml, rewriteHuePin, rewriteSky,
  rewriteTints, deriveTints, recolorWorld, normalizePalette,
  formatPlan, blockedTargets, regionHueWarnings,
} from './ringRecolor.js'
import { BASE_TINTS } from './ringPrimitives.js'
import { midnightGalaxyRing } from '../worlds/midnightGalaxy.ring.js'

const THEME = {
  colors: {
    bg: '#08001a', bgDeep: '#040010', accent: '#4a1a8f', highlight: '#c060ff',
    text: '#e8d0ff', textMuted: '#8050b0', shinyBg: '#120030', shinyAccent: '#ff40a0',
  },
}

// Reads the real world files. These transforms exist only to edit THOSE two
// files, so a fixture copy would test the fixture, not the pipeline — the
// failure mode being replaced here is exactly a hand-edit that matched one
// file's shape and silently missed the other's.
const RING_JS = readFileSync(new URL('../worlds/midnightGalaxy.ring.js', import.meta.url), 'utf8')
const HTML    = readFileSync(new URL('../../../concepts/world-07-ring.html', import.meta.url), 'utf8')
const PIN     = readFileSync(new URL('../worlds/midnightGalaxy.ring.test.js', import.meta.url), 'utf8')

// Keys, not hues. The hues are exactly what scripts/ring-recolor.mjs is
// built to change, so pinning them here would make every recolor break the
// recolor tool's own tests. midnightGalaxy.ring.test.js is the file that
// pins values, and the tool rewrites it in the same run.
const STATION_KEYS = [
  'ringed planet', 'spiral galaxy', 'star cluster', 'amber planet',
  'lit planet', 'pulsar', 'rose nebula', 'comet', 'binary pair',
  'asteroid field', 'record', 'aurora ribbon', 'supernova',
]
const ANCHORS = [
  { deg: 276, window: 25 }, { deg: 214, window: 25 }, { deg: 140, window: 25 },
]
const NEW_HUES = [10, 55, 20, 60, 15, 50, 25, 45, 30, 40, 35, 65, 5]
const rowsFor = hues => STATION_KEYS.map((key, i) => ({ key, hue: hues[i] }))

describe('readStationHues', () => {
  it('reads the 13 shipped stations in ring order, with their constant names', () => {
    const rows = readStationHues(RING_JS)
    expect(rows.map(r => r.key)).toEqual(STATION_KEYS)
    expect(rows.map(r => r.constName)).toEqual(
      STATION_KEYS.map(k => k.toUpperCase().replace(' ', '_') + '_HUE'),
    )
    for (const r of rows) expect(r.hue).toBeTypeOf('number')
  })

  it('reads the same hues the world module actually exposes', async () => {
    const { midnightGalaxyRing } = await import('../worlds/midnightGalaxy.ring.js')
    expect(readStationHues(RING_JS).map(r => [r.key, r.hue]))
      .toEqual(midnightGalaxyRing.stations.map(s => [s.key, s.hue]))
  })

  it('throws when the stations block is short — a partial parse must not pass', () => {
    const short = RING_JS.replace(/^.*key: 'supernova'.*$\n/m, '')
    expect(() => readStationHues(short)).toThrow(/13/)
  })

  it('throws when a hue constant is declared but no station reads it', () => {
    const orphan = RING_JS.replace(
      /^export const SUPERNOVA_HUE\s*=\s*\d+$/m,
      m => `${m}\nexport const ORPHAN_HUE         = 99`,
    )
    expect(() => readStationHues(orphan)).toThrow(/ORPHAN_HUE/)
  })

  it('throws when a station reads a constant that does not exist', () => {
    const bad = RING_JS.replace('hue: SUPERNOVA_HUE', 'hue: NOPE_HUE')
    expect(() => readStationHues(bad)).toThrow(/NOPE_HUE/)
  })
})

describe('rewriteRingJs', () => {
  it('round-trips: rewriting with the same hues re-parses to the same hues', () => {
    const before = readStationHues(RING_JS)
    const out = rewriteRingJs(RING_JS, before.map(r => r.hue), ANCHORS)
    expect(readStationHues(out)).toEqual(before)
  })

  it('leaves exactly one hueAnchors block, marked as generated', () => {
    const out = rewriteRingJs(RING_JS, readStationHues(RING_JS).map(r => r.hue), ANCHORS)
    expect(out.match(/hueAnchors: \[/g)).toHaveLength(1)
    expect(out).toContain('// written by scripts/ring-recolor.mjs — do not hand-edit')
    expect(out).toContain('{ deg: 276, window: 25 },')
  })

  it('writes new hues into the constants and nowhere else', () => {
    const out = rewriteRingJs(RING_JS, NEW_HUES, ANCHORS)
    expect(readStationHues(out).map(r => r.hue)).toEqual(NEW_HUES)
    expect(out).toContain('export const RINGED_PLANET_HUE  = 10')
  })

  it('rewrites the anchors to the supplied palette', () => {
    const out = rewriteRingJs(RING_JS, NEW_HUES, [{ deg: 0, window: 25 }, { deg: 60, window: 25 }])
    expect(out.match(/\{ deg: \d+, window: \d+ \},/g)).toEqual([
      '{ deg: 0, window: 25 },', '{ deg: 60, window: 25 },',
    ])
  })
})

describe('rewriteHtml', () => {
  it('changes every one of the 13 station hues', () => {
    const out = rewriteHtml(HTML, rowsFor(NEW_HUES), ANCHORS)
    for (const [i, key] of STATION_KEYS.entries()) {
      const line = out.split('\n').find(l => l.includes(`key:'${key}'`))
      expect(line, key).toMatch(new RegExp(`hue:\\s*${NEW_HUES[i]},`))
    }
  })

  it('touches nothing outside the 13 station lines and the anchors block', () => {
    // The anchors block is cut from BOTH sides first: the rewritten one is
    // shorter (its hand-written inner comments go), so a raw index-by-index
    // diff would flag every line after it as "changed".
    const cutAnchors = text => {
      const lines = text.split('\n')
      const start = lines.findIndex(l => /^[ \t]*hueAnchors: \[/.test(l))
      const indent = lines[start].match(/^[ \t]*/)[0]
      const end = lines.findIndex((l, i) => i > start && l === `${indent}],`)
      return [...lines.slice(0, start), ...lines.slice(end + 1)]
    }
    const before = cutAnchors(HTML)
    const out = cutAnchors(rewriteHtml(HTML, rowsFor(NEW_HUES), ANCHORS))
    expect(out).toHaveLength(before.length)
    const changed = before.map((l, i) => i).filter(i => before[i] !== out[i])
    expect(changed.map(i => before[i].match(/key:'([^']+)'/)?.[1] ?? before[i]))
      .toEqual(STATION_KEYS)
    expect(changed).toHaveLength(13)
  })

  it('keeps the "mirrors midnightGalaxy.ring.js" comment above the anchors', () => {
    const out = rewriteHtml(HTML, rowsFor(NEW_HUES), ANCHORS)
    expect(out).toContain("mirrors client/src/worlds/midnightGalaxy.ring.js's hueAnchors")
  })

  it('throws when the html is missing a station the palette names', () => {
    const missing = HTML.replace(/^.*key:'supernova'.*$\n/m, '')
    expect(() => rewriteHtml(missing, rowsFor(NEW_HUES), ANCHORS)).toThrow(/supernova/)
  })
})

describe('rewriteHuePin', () => {
  it('rewrites the pinned [key, hue] pairs in place', () => {
    const out = rewriteHuePin(PIN, rowsFor(NEW_HUES))
    STATION_KEYS.forEach((key, i) => {
      expect(out, key).toContain(`['${key}', ${NEW_HUES[i]}]`)
    })
    expect(out.match(/\['[^']+', \d+\]/g)).toHaveLength(13)
  })

  it('throws when a station is missing from the pin', () => {
    expect(() => rewriteHuePin(PIN.replace(/\['supernova', \d+\],/, ''), rowsFor(NEW_HUES)))
      .toThrow(/supernova/)
  })
})

describe('blockedTargets', () => {
  const TARGETS = [
    'client/src/worlds/midnightGalaxy.ring.js',
    'concepts/world-07-ring.html',
    'client/src/worlds/midnightGalaxy.ring.test.js',
  ]

  it('is empty on a clean tree', () => {
    expect(blockedTargets('', TARGETS)).toEqual([])
  })

  it('names a target another session already has modified', () => {
    const porcelain = ' M client/src/lib/ringRecolor.js\n M concepts/world-07-ring.html\n'
    expect(blockedTargets(porcelain, TARGETS)).toEqual(['concepts/world-07-ring.html'])
  })

  it('follows a rename to its destination path, and ignores renames of other files', () => {
    const porcelain = [
      'R  client/src/lib/old-world.js -> client/src/worlds/midnightGalaxy.ring.js',
      'RM concepts/old.html -> concepts/some-other-file.html',
      'R  "a b.js" -> "client/src/worlds/midnightGalaxy.ring.test.js"',
    ].join('\n')
    expect(blockedTargets(porcelain, TARGETS)).toEqual([
      'client/src/worlds/midnightGalaxy.ring.js',
      'client/src/worlds/midnightGalaxy.ring.test.js',
    ])
  })

  it('catches staged and untracked targets too', () => {
    const porcelain = 'M  client/src/worlds/midnightGalaxy.ring.js\n?? concepts/world-07-ring.html'
    expect(blockedTargets(porcelain, TARGETS)).toEqual([
      'client/src/worlds/midnightGalaxy.ring.js',
      'concepts/world-07-ring.html',
    ])
  })
})

describe('formatPlan', () => {
  it('prints one st<i> row per station plus the warnings', () => {
    const rows = STATION_KEYS.map((key, i) => ({ key, from: 256 - i, to: NEW_HUES[i] }))
    const out = formatPlan(rows, ['two colors overlap'])
    expect(out).toMatch(/st0\s+ringed planet\s+256\s*→\s*10/)
    expect(out).toMatch(/st12\s+supernova\s+244\s*→\s*5/)
    expect(out).toContain('two colors overlap')
  })

  it('says so when there is nothing to warn about', () => {
    expect(formatPlan([{ key: 'a', from: 1, to: 2 }], [])).toMatch(/no warnings/i)
  })
})

describe('regionHueWarnings', () => {
  // The sky regions are DERIVED: skyRegionHues adds a fixed hueOffset
  // (aurora +32) to its source station's hue, so a region can land outside
  // every anchor window even when all 13 stations are inside one — the
  // recolor's own output then contains a colour the palette never chose.
  const ANCHORS = [{ deg: 0, window: 25 }, { deg: 55, window: 25 }]

  it('says nothing about a region hue inside an anchor window', () => {
    expect(regionHueWarnings({ ember: 20, disco: 60 }, ANCHORS)).toEqual([])
  })

  it('warns, naming the region and the hue, when a region lands outside every window', () => {
    const out = regionHueWarnings({ aurora: 105 }, ANCHORS)
    expect(out).toHaveLength(1)
    expect(out[0]).toContain('aurora')
    expect(out[0]).toContain('105')
  })

  it('measures the window cyclically, so 350 is inside an anchor at 10', () => {
    expect(regionHueWarnings({ aurora: 350 }, [{ deg: 10, window: 25 }])).toEqual([])
  })
})

// ── JS ↔ HTML hue parity ───────────────────────────────────────────────────
// The two files carry independent copies of the same 13 hues and the same
// anchor list, and nothing else compares them: verify:ring reads only the
// HTML, the app renders only the .js. A hand edit to one file alone is the
// exact failure this whole pipeline exists to stop, so it has to fail
// test:unit, not just review.
describe('rewriteSky', () => {
  it('rewrites both sky source hexes in either world file', () => {
    for (const [src, what] of [[RING_JS, 'ring.js'], [HTML, 'html']]) {
      const out = rewriteSky(src, { bg: '#1a0004', bgDeep: '#0e0002' }, what)
      expect(out).toMatch(/SKY_BG\s*=\s*'#1a0004'/)
      expect(out).toMatch(/SKY_BG_DEEP\s*=\s*'#0e0002'/)
      // SKY_BG's own pattern must not have eaten SKY_BG_DEEP's line.
      expect(out).not.toMatch(/SKY_BG_DEEP\s*=\s*'#1a0004'/)
    }
  })

  it('refuses a source file with no sky constants', () => {
    expect(() => rewriteSky('const nope = 1\n', { bg: '#000000', bgDeep: '#000000' }, 'fixture'))
      .toThrow(/no SKY_BG sky constant/)
  })

  it('refuses a color that is not #rrggbb', () => {
    expect(() => rewriteSky(RING_JS, { bg: 'red', bgDeep: '#000000' }, 'ring.js'))
      .toThrow(/not a #rrggbb color/)
  })
})

describe('tints', () => {
  it('rewrites every tint in either world file', () => {
    const next = { ...BASE_TINTS, halo: '#112233', shootTail: '#445566' }
    for (const [src, what] of [[RING_JS, 'ring.js'], [HTML, 'html']]) {
      const out = rewriteTints(src, next, what)
      expect(out).toMatch(/halo:\s*'#112233'/)
      expect(out).toMatch(/shootTail:\s*'#445566'/)
    }
  })

  it('refuses a file missing a tint the table names', () => {
    expect(() => rewriteTints("const TINTS = { halo: '#fdf7ff' }", BASE_TINTS, 'fixture'))
      .toThrow(/no tint 'coreWarm'/)
  })

  // The whole point of rotating from a fixed baseline: recolouring twice
  // lands where recolouring once did. Rotating from the file's current values
  // instead would drift a little further every run.
  it('is idempotent — same palette, same result from the same baseline', () => {
    const once = deriveTints(BASE_TINTS, ['#ff2200', '#ffd400'])
    const twice = deriveTints(BASE_TINTS, ['#ff2200', '#ffd400'])
    expect(twice).toEqual(once)
  })

  it('leaves a neutral neutral and moves a tinted one', () => {
    const out = deriveTints({ white: '#ffffff', cool: '#eaf0ff' }, ['#ff2200'])
    expect(out.white).toBe('#ffffff')
    expect(out.cool).not.toBe('#eaf0ff')
  })
})

describe('normalizePalette', () => {
  it('throws on 1 color', () => {
    expect(() => normalizePalette({ colors: ['#ff2200'] })).toThrow(/2-3/)
  })
  it('throws on 4 colors', () => {
    expect(() => normalizePalette({ colors: ['#ff2200', '#ffd400', '#3b82f6', '#a855f7'] })).toThrow(/2-3/)
  })
  it('throws on a non-hex color', () => {
    expect(() => normalizePalette({ colors: ['#ff2200', 'red'] })).toThrow(/rrggbb/)
  })
  it('throws on a zero weight', () => {
    expect(() => normalizePalette({ colors: ['#ff2200', '#ffd400'], weights: [0, 1] })).toThrow(/positive/)
  })
  it('throws on a weight-count mismatch', () => {
    expect(() => normalizePalette({ colors: ['#ff2200', '#ffd400'], weights: [1] })).toThrow(/weights/)
  })
  it('normalizes weights to sum to 1', () => {
    const out = normalizePalette({ colors: ['#ff2200', '#ffd400'], weights: [3, 1] })
    expect(out.weights[0] + out.weights[1]).toBeCloseTo(1)
    expect(out.weights[0]).toBeCloseTo(0.75)
  })
  it('defaults to equal weights when none are given', () => {
    const out = normalizePalette({ colors: ['#ff2200', '#ffd400'] })
    expect(out.weights).toEqual([0.5, 0.5])
  })
})

describe('recolorWorld', () => {
  const PALETTE = { colors: ['#ff2200', '#ffd400'], weights: [0.55, 0.45] }

  it('produces the same 13 station hues as the CLI dry run for the same inputs', () => {
    // Frozen against scripts/ring-recolor.mjs's own dry-run output, 2026-09-03,
    // post-Phase-1 ladder fix — st3 (amber planet) lands at 63, not 68.
    const EXPECTED = [343, 36, 28, 63, 346, 40, 23, 56, 354, 46, 18, 52, 8]
    const world = recolorWorld(midnightGalaxyRing, PALETTE, THEME)
    expect(world.stations.map(s => s.hue)).toEqual(EXPECTED)
  })

  it('derives tints the same way ring-recolor.mjs does', () => {
    const world = recolorWorld(midnightGalaxyRing, PALETTE, THEME)
    expect(world.tints).toEqual(deriveTints(BASE_TINTS, PALETTE.colors))
  })

  it('builds a 4-stop sky ramp', () => {
    const world = recolorWorld(midnightGalaxyRing, PALETTE, THEME)
    expect(world.sky).toHaveLength(4)
  })

  it('carries one hueAnchors entry per palette color', () => {
    const world = recolorWorld(midnightGalaxyRing, PALETTE, THEME)
    expect(world.hueAnchors).toHaveLength(2)
  })

  it('does not mutate the base world', () => {
    const before = JSON.parse(JSON.stringify(midnightGalaxyRing))
    const world = recolorWorld(midnightGalaxyRing, PALETTE, THEME)
    expect(midnightGalaxyRing).toEqual(before)
    expect(world.stations[0]).not.toBe(midnightGalaxyRing.stations[0])
  })

  // recolorWorld MUST always take the authored module as `base` — its
  // station-identity-aware assignment reads base's hues as "what this
  // station is really about." Recolouring an already-recoloured world
  // starts that assignment from a moved position. It is NOT REQUIRED to
  // match recolouring the base once (it may coincidentally, as it does for
  // this particular palette below — that is not a guarantee, just this
  // palette's fixed point). Named so nobody "fixes" a future mismatch into
  // an idempotence guarantee this function never promised.
  it('recolouring a recoloured world runs without throwing, and is not required to be idempotent', () => {
    const once = recolorWorld(midnightGalaxyRing, PALETTE, THEME)
    const twice = recolorWorld(once, PALETTE, THEME)
    expect(twice.stations).toHaveLength(13)
  })
})

describe('midnightGalaxy.ring.js and world-07-ring.html agree', () => {
  const htmlStationPairs = () => {
    const block = HTML.match(/^([ \t]*)stations: \[\r?\n([\s\S]*?)^\1\],$/m)
    expect(block, 'world-07-ring.html: no stations block').toBeTruthy()
    return [...block[2].matchAll(/key:\s*'([^']+)'[\s\S]*?hue:\s*(\d+)/g)]
      .map(m => [m[1], Number(m[2])])
  }
  const anchorDegs = src =>
    [...src.match(/^([ \t]*)hueAnchors: \[\r?\n[\s\S]*?^\1\],$/m)[0].matchAll(/deg:\s*(\d+)/g)]
      .map(m => Number(m[1]))

  it('carries the same station key/hue pairs in both files', () => {
    expect(htmlStationPairs()).toEqual(readStationHues(RING_JS).map(r => [r.key, r.hue]))
  })

  it('carries the same hueAnchors degrees in both files', () => {
    expect(anchorDegs(HTML)).toEqual(anchorDegs(RING_JS))
  })

  // The sky's source hexes are the third thing a recolour writes into both
  // files. Same failure shape as the hues: recoloured in one, and the app's
  // sky and the gate's sky are two different skies.
  // A tint added to one file's table and not the other's is the same
  // one-file-edit failure the hue pairs already guard against.
  it('carries the same tint table in both files, matching BASE_TINTS', () => {
    const tintsOf = src => Object.fromEntries(Object.keys(BASE_TINTS)
      .map(k => [k, (src.match(new RegExp(`\\b${k}:\\s*'(#[0-9a-f]{6})'`, 'i')) ?? [])[1]]))
    const fromJs = tintsOf(RING_JS)
    expect(Object.values(fromJs).every(Boolean), 'ring.js is missing a tint').toBe(true)
    expect(tintsOf(HTML)).toEqual(fromJs)
  })

  it('carries the same sky source colors in both files', () => {
    const skyOf = src => [/SKY_BG(\s*)=\s*'(#[0-9a-f]{6})'/i, /SKY_BG_DEEP\s*=\s*'(#[0-9a-f]{6})'/i]
      .map(re => src.match(re).pop())
    expect(skyOf(HTML)).toEqual(skyOf(RING_JS))
  })
})
