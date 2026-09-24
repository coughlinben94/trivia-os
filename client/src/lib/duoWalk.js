// Deterministic walk through a curated "duo" pairing graph — the mechanism
// behind the night-color-evolution feature
// (docs/superpowers/specs/2026-09-24-ring-world-night-color-evolution-design.md).
//
// Never stores a precomputed "at slide N, duo X" sequence — that was an
// early draft of this design and it's wrong (goes stale the moment a host
// adds a slide mid-show). Instead, same pattern this app already uses
// elsewhere for "randomized but must survive reload/back-nav without
// re-rolling" (TeamPickerSlide.jsx's seededShuffle(names, slide.id)): pure
// recompute from a stable seed, every time, using this app's own rng()
// helper (never Math.random — ringEngine.js's own rule).
import { rng } from './ringEngine.js'
import { seedFrom } from './paletteGenerator.js'

// Distinct from every other rng() call site's own constant in this app
// (weightedPalette.js, paletteGenerator.js, RingAmbient.jsx each use their
// own) — an arbitrary fixed salt, just needs to not collide.
const DUO_WALK_SALT = 0xD0057E9

// graph: { [duoId]: duoId[] } — an adjacency list. duoWalk is deterministic
// and stateless: the same (seed, graph, stepIndex) always returns the same
// duoId, and stepIndex is where in the walk you're asking about, not how
// many times you've called this function. A graph walk is inherently
// sequential (which edges are available at step N depends on the whole path
// to N), so this replays from the start each call rather than trying to
// jump directly to stepIndex — graphs here are ~10-12 nodes and stepIndex
// realistically never exceeds a few dozen in one show, so replaying is
// cheap, not a real cost.
export function duoWalk(seed, graph, stepIndex) {
  const nodeIds = Object.keys(graph)
  if (nodeIds.length === 0) return null
  // ringEngine.js's rng()/hash32() coerce their first arg with `| 0` —
  // a string seed (show.id is a string, e.g. "show_abc123") collapses to
  // 0 for every input that way, not a spread of distinct seeds. seedFrom()
  // (paletteGenerator.js) is this app's own string->uint32 hash, already
  // used for exactly this purpose elsewhere.
  const r = rng(seedFrom(String(seed)), DUO_WALK_SALT)
  let current = nodeIds[Math.floor(r() * nodeIds.length)]
  for (let i = 0; i < stepIndex; i++) {
    const edges = graph[current]
    if (!edges || edges.length === 0) break // dead end — validateDuoGraph should have caught this already
    current = edges[Math.floor(r() * edges.length)]
  }
  return current
}

// Structural validation only — never an aesthetic judgment. Which duos
// exist and which edges "look good" is Ben's call
// (references/ring-world-continuity.md §4, STAYS-HUMAN); this only checks
// the graph can't strand a walk or loop forever on one node. Same
// `warnings`-array shape derivePalette() already uses in weightedPalette.js.
export function validateDuoGraph(graph) {
  const warnings = []
  const nodeIds = Object.keys(graph)
  if (nodeIds.length === 0) {
    warnings.push('graph is empty — nothing to walk')
    return warnings
  }
  for (const id of nodeIds) {
    const edges = graph[id]
    if (!edges || edges.length === 0) {
      warnings.push(`"${id}" has no out-edges — a walk that lands here is stuck`)
      continue
    }
    for (const target of edges) {
      if (target === id) warnings.push(`"${id}" has a self-loop`)
      if (!(target in graph)) warnings.push(`"${id}" -> "${target}", but "${target}" isn't a node in this graph`)
    }
  }
  // Strong connectivity: every node must be reachable from every other node,
  // or a walk can get trapped in a small cluster and never reach the rest of
  // the shelf. Checked by BFS from each node in turn — graphs here are tiny
  // (~10-12 nodes), O(n^2) is fine.
  for (const start of nodeIds) {
    const seen = new Set([start])
    const queue = [start]
    while (queue.length) {
      const cur = queue.shift()
      for (const next of graph[cur] ?? []) {
        if (!seen.has(next) && next in graph) { seen.add(next); queue.push(next) }
      }
    }
    if (seen.size < nodeIds.length) {
      warnings.push(`"${start}" can't reach every other node — the graph isn't strongly connected`)
      break // one report is enough; fix the graph and re-validate
    }
  }
  return warnings
}
