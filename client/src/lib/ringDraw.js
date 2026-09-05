//
// Pure. No DOM, no Math.random — every random choice below goes through
// ringEngine.js's hash32/rng (docs/superpowers/plans/
// 2026-09-02-ring-station-variety.md §2.4). See that doc's invariant table
// (§2.3) for where each rule below comes from.
import { rng, hash32 } from './ringEngine.js'

export const LANE_CAP = (slots) => Math.floor(slots / 3)

function cyclicDist(a, b, slots) {
  const d = Math.abs(a - b)
  return Math.min(d, slots - d)
}

export function assertRing(order, { slots = order.length, maxAccents = 3, maxPerPrim = 3 } = {}) {
  const seenKeys = new Set()
  const primCounts = {}
  let accents = 0

  // Check for duplicate keys first
  for (let i = 0; i < slots; i++) {
    const s = order[i]
    if (seenKeys.has(s.key)) throw new Error(`assertRing: duplicate key "${s.key}"`)
    seenKeys.add(s.key)
  }

  // Reset for the main checks
  seenKeys.clear()

  for (let i = 0; i < slots; i++) {
    const s = order[i]
    seenKeys.add(s.key)
    if (s.accent) accents++
    primCounts[s.prim] = (primCounts[s.prim] || 0) + 1

    for (let j = i + 1; j < slots; j++) {
      const other = order[j]
      const d = cyclicDist(i, j, slots)
      if (other.family === s.family && d < 3) {
        throw new Error(`assertRing: family "${s.family}" at slots ${i} and ${j} are ${d} apart, need >=3`)
      }
      if (other.prim === s.prim && d === 1) {
        throw new Error(`assertRing: prim "${s.prim}" adjacent at slots ${i} and ${j}`)
      }
    }
  }

  if (accents > maxAccents) {
    throw new Error(`assertRing: ${accents} accents, max ${maxAccents}`)
  }
  for (const [prim, count] of Object.entries(primCounts)) {
    if (count > maxPerPrim) {
      throw new Error(`assertRing: prim "${prim}" used ${count}x, max ${maxPerPrim}`)
    }
  }
  return true
}
