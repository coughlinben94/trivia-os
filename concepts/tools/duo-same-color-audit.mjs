#!/usr/bin/env node
// Diagnostic only. Reads derivePalette's real output; does not score or
// alter a palette, and does not measure brightness.
import { DUO_PALETTES } from '../../client/src/lib/duoGraph.js'
import { derivePalette, hueDelta } from '../../client/src/lib/weightedPalette.js'
import { midnightGalaxyRing } from '../../client/src/worlds/midnightGalaxy.ring.js'

const currentHues = midnightGalaxyRing.stations.map(station => station.hue)
const rows = Object.entries(DUO_PALETTES).map(([name, palette]) => {
  const { assignment, hues } = derivePalette({ ...palette, currentHues })
  const pairs = assignment.flatMap((color, i) => {
    const next = (i + 1) % assignment.length
    return color === assignment[next]
      ? [{ stations: `${i}-${next}`, gap: hueDelta(hues[i], hues[next]) }]
      : []
  })
  return { name, min: Math.min(...pairs.map(pair => pair.gap)), pairs }
})

// Hue arithmetic sentinel remains valid before and after a palette fix.
if (hueDelta(359, 0) !== 1 || hueDelta(5, 185) !== 180) {
  throw new Error('Hue-distance known-answer probe failed')
}

console.log('duo | minimum adjacent same-color hue gap | pairs (station indices: degrees)')
for (const row of rows) {
  console.log(`${row.name} | ${row.min}° | ${row.pairs.map(pair => `${pair.stations}:${pair.gap}°`).join(', ')}`)
}
for (const gap of [0, 1, 2, 3, 5, 10]) {
  const affected = rows.filter(row => row.min <= gap).length
  const pairs = rows.reduce((sum, row) => sum + row.pairs.filter(pair => pair.gap <= gap).length, 0)
  console.log(`<=${gap}°: ${affected}/${rows.length} duos, ${pairs} adjacent pairs`)
}
