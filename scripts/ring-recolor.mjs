#!/usr/bin/env node
// Recolor the ring world from one weighted palette.
//
//   node scripts/ring-recolor.mjs --colors '#ff0000,#ffea00' --weights '0.55,0.45'
//   node scripts/ring-recolor.mjs --colors '#ff0000,#ffea00' --weights '0.55,0.45' --write
//
// Without --write it prints the plan and touches nothing. With --write it
// rewrites all three files that carry station hues, or none of them.
//
// The three files exist because the app and the verification gate read
// DIFFERENT sources: client/src/worlds/midnightGalaxy.ring.js is what
// /display renders, concepts/world-07-ring.html is what `npm run
// verify:ring` measures, and midnightGalaxy.ring.test.js pins the shipped
// values so neither can drift unnoticed. Every past recolor was a paste
// into two of them by hand; that is what this replaces.

import { readFileSync, writeFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { derivePalette } from '../client/src/lib/weightedPalette.js'
import { skyRegionHues, accentCompanionHue } from '../client/src/lib/ringPrimitives.js'
import { midnightGalaxyRing } from '../client/src/worlds/midnightGalaxy.ring.js'
import {
  readStationHues, rewriteRingJs, rewriteHtml, rewriteHuePin,
  formatPlan, blockedTargets,
} from '../client/src/lib/ringRecolor.js'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const TARGETS = {
  ringJs: 'client/src/worlds/midnightGalaxy.ring.js',
  html: 'concepts/world-07-ring.html',
  pin: 'client/src/worlds/midnightGalaxy.ring.test.js',
}
const STATION_COUNT = 13

const read = rel => readFileSync(ROOT + rel, 'utf8')

function parseArgs(argv) {
  const flags = {}
  for (let i = 0; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) throw new Error(`unexpected argument: ${argv[i]}`)
    const name = argv[i].slice(2)
    if (name === 'write') { flags.write = true; continue }
    if (name !== 'colors' && name !== 'weights') throw new Error(`unknown flag: --${name}`)
    const value = argv[++i]
    if (value === undefined) throw new Error(`--${name} needs a value`)
    flags[name] = value
  }

  if (!flags.colors) throw new Error("--colors is required, e.g. --colors '#ff0000,#ffea00'")
  const colors = flags.colors.split(',').map(s => s.trim())
  if (colors.length < 2 || colors.length > 3) {
    throw new Error(`--colors takes 2 or 3 colors, got ${colors.length}`)
  }
  for (const c of colors) {
    if (!/^#[0-9a-fA-F]{6}$/.test(c)) throw new Error(`not a #rrggbb color: ${c}`)
  }

  let weights = colors.map(() => 1)
  if (flags.weights) {
    weights = flags.weights.split(',').map(s => Number(s.trim()))
    if (weights.length !== colors.length) {
      throw new Error(`--weights has ${weights.length} values for ${colors.length} colors`)
    }
    if (weights.some(w => !(w > 0))) throw new Error('every weight must be a positive number')
  }
  const total = weights.reduce((a, b) => a + b, 0)
  weights = weights.map(w => w / total)

  return { colors, weights, write: !!flags.write }
}

function main() {
  const { colors, weights, write } = parseArgs(process.argv.slice(2))

  const ringJs = read(TARGETS.ringJs)
  const rows = readStationHues(ringJs)
  const currentHues = rows.map(r => r.hue)

  // No baseTheme: this pipeline writes station hues and anchors only. Theme
  // colors are the host UI's job — the ring world is palette-fixed.
  const derived = derivePalette({
    colors, weights, stationCount: STATION_COUNT, currentHues,
  })

  const plan = rows.map((r, i) => ({ key: r.key, from: r.hue, to: derived.hues[i] }))
  const stations = rows.map((r, i) => ({ key: r.key, hue: derived.hues[i] }))

  console.log(`\nRing recolor — ${colors.length} colors`)
  colors.forEach((c, i) => {
    console.log(`  ${c}  weight ${weights[i].toFixed(2)}  anchor ${derived.hueAnchors[i].deg}°  ${derived.counts[i]} stations`)
  })
  console.log()
  console.log(formatPlan(plan, derived.warnings))

  // The sky regions and accent companions are DERIVED from the station hues
  // (Task 1), not authored — printing them is the only way to see, before
  // writing, what the new palette does to the parts of the world nobody
  // edits by hand.
  const byKey = new Map(stations.map(s => [s.key, s.hue]))
  const withMeta = midnightGalaxyRing.stations.map(s => ({ ...s, hue: byKey.get(s.key) ?? s.hue }))
  const regions = skyRegionHues(withMeta)
  console.log('\nSky regions (derived from the new hues):')
  for (const [key, hue] of Object.entries(regions)) {
    const src = withMeta.find(s => s.region === key && s.regionSource) ?? withMeta.find(s => s.region === key)
    console.log(`  ${key.padEnd(7)} ${hue}°  (from ${src.key} at ${src.hue}°)`)
  }

  console.log('\nAccent companions:')
  for (const s of withMeta.filter(s => s.accent)) {
    console.log(`  ${s.key.padEnd(14)} ${s.hue}° → companion ${accentCompanionHue(s.hue, derived.hueAnchors)}°`)
  }

  if (!write) {
    console.log('\nDry run — nothing written. Add --write to apply.\n')
    return
  }

  const porcelain = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' })
  const blocked = blockedTargets(porcelain, Object.values(TARGETS))
  if (blocked.length) {
    throw new Error(
      `refusing to write — already modified in the working tree:\n  ${blocked.join('\n  ')}\n` +
      'Commit or revert those first (another session may be mid-edit).',
    )
  }

  // All three strings first, then all three writes: a throw halfway through
  // the transforms must not leave the app recolored and the gate's file on
  // the old palette.
  const next = {
    [TARGETS.ringJs]: rewriteRingJs(ringJs, derived.hues, derived.hueAnchors),
    [TARGETS.html]: rewriteHtml(read(TARGETS.html), stations, derived.hueAnchors),
    [TARGETS.pin]: rewriteHuePin(read(TARGETS.pin), stations),
  }
  for (const [rel, text] of Object.entries(next)) writeFileSync(ROOT + rel, text)

  console.log(`\nWrote:\n  ${Object.keys(next).join('\n  ')}`)
  console.log('\nNext:\n  npm run test:unit && npm run verify:ring\n')
}

try {
  main()
} catch (err) {
  console.error(`ring-recolor: ${err.message}`)
  process.exit(1)
}
