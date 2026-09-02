import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import {
  readStationHues, rewriteRingJs, rewriteHtml, rewriteHuePin,
  formatPlan, blockedTargets,
} from './ringRecolor.js'

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
