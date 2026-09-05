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

export function drawStations(pool, { seed, slots = 13, pinKey = 'record', pinAt = 10 } = {}) {
  if (seed === 'authored') return pool.slice()

  const pinned = pool.find(s => s.key === pinKey)
  if (!pinned) throw new Error(`ringDraw: pinKey "${pinKey}" not found in pool`)

  const numericSeed = typeof seed === 'number' ? seed : hash32(String(seed), 0)
  const r = rng(numericSeed, 0xD0A1)

  const laneCap = LANE_CAP(slots)
  const maxAccents = 3
  const maxPerPrim = 3

  // 1. Choose the set (all of `pool` if pool.length === slots — no freedom,
  //    but the cap check below still runs and can still throw).
  const chosen = [pinned]
  const famCount = { [pinned.family]: 1 }
  const primCount = { [pinned.prim]: 1 }
  let accentCount = pinned.accent ? 1 : 0
  const remaining = pool.filter(s => s !== pinned)

  while (chosen.length < slots) {
    const cands = remaining.filter(s =>
      (famCount[s.family] || 0) < laneCap &&
      accentCount + (s.accent ? 1 : 0) <= maxAccents &&
      (primCount[s.prim] || 0) < maxPerPrim
    )
    if (!cands.length) {
      throw new Error(`ringDraw: pool cannot fill ${slots} slots under the caps (chose ${chosen.length} of ${slots})`)
    }
    const idx = Math.floor(r() * cands.length)
    const picked = cands[idx]
    remaining.splice(remaining.indexOf(picked), 1)
    chosen.push(picked)
    famCount[picked.family] = (famCount[picked.family] || 0) + 1
    primCount[picked.prim] = (primCount[picked.prim] || 0) + 1
    accentCount += picked.accent ? 1 : 0
  }

  // 2. Place: backtracking search over slot order. Small n (<=13), heavily
  //    pruned by the family/prim checks, so this terminates fast in
  //    practice; it is a correctness-first search, not the fastest possible
  //    placement — see the variety plan's own note that a hand-optimised
  //    lane-fill is ~40 lines for the same guarantee.
  const order = new Array(slots).fill(null)
  const used = new Array(chosen.length).fill(false)
  const dist = (a, b) => Math.min(Math.abs(a - b), slots - Math.abs(a - b))

  function fits(member, slotIdx) {
    for (let i = 0; i < slots; i++) {
      const other = order[i]
      if (!other) continue
      const d = dist(slotIdx, i)
      if (other.family === member.family && d < 3) return false
      if (other.prim === member.prim && d === 1) return false
    }
    return true
  }

  function shuffledIndices(n) {
    const idxs = Array.from({ length: n }, (_, i) => i)
    for (let i = idxs.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[idxs[i], idxs[j]] = [idxs[j], idxs[i]]
    }
    return idxs
  }

  function backtrack(slotIdx) {
    if (slotIdx === slots) return true
    for (const i of shuffledIndices(chosen.length)) {
      if (used[i]) continue
      const member = chosen[i]
      if (!fits(member, slotIdx)) continue
      order[slotIdx] = member
      used[i] = true
      if (backtrack(slotIdx + 1)) return true
      order[slotIdx] = null
      used[i] = false
    }
    return false
  }

  if (!backtrack(0)) {
    throw new Error('ringDraw: no arrangement of the chosen set satisfies spacing under this seed')
  }

  assertRing(order, { slots, maxAccents, maxPerPrim })

  // 3. Rotate so the pinned noun lands at pinAt — rotation preserves every
  //    cyclic distance, so assertRing's guarantees survive the rotation.
  const at = order.findIndex(s => s.key === pinKey)
  return order.map((_, i) => order[(i + at - pinAt + slots) % slots])
}
