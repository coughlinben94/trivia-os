// The curated duo set + pairing graph for the night-color-evolution feature
// (docs/superpowers/specs/2026-09-24-ring-world-night-color-evolution-design.md).
// Authored 2026-09-24 — Ben handed off "duos pairing up is on you" explicitly,
// so this file (not an agent invention on its own initiative) is the one
// place that decision lives. Every color pair below is a real row already
// certified in `ring_palettes` (verified against a live Supabase query the
// same session this was written) — this file never invents a palette, it
// only picks which certified rows are in the rotation and which may follow
// which. Re-verify against `ring_palettes` (status='certified', current
// RING_VERSION) before trusting this list after a `RING_VERSION` bump.
//
// 12 duos, picked for real hue-family spread rather than the old shelf's
// purple/red cluster: warm (crimson/gold/amber/solar-storm), violet/blue,
// green, and the newly-certified vivid family (mint, turquoise, cyan,
// electric blue+pink, neon magenta+green) that a palette-sweep.mjs retry
// fix (2026-09-24, same session) found for the first time.
// `drift` is part of what was actually certified (Codex review, 2026-09-24
// — a real gap the first version of this file had): ring_palettes stores
// and matches on colors+weights+drift together, and recolorWorld() defaults
// to drift arc 0 when it's missing — rendering any of these without its own
// drift value would show a DIFFERENT, never-certified visual state. Every
// value below is copied from the live certified row (verified via Supabase
// query this same session, not assumed) — the 6 presets were all swept at
// arc 60 (palette-sweep.mjs's preset loop hardcodes that), the 6 generated
// duos each carry their own individually-rolled arc.
export const DUO_PALETTES = {
  crimson_gold:    { colors: ['#dc2626', '#eab308'], weights: [0.6, 0.4], drift: { arc: 60 } },
  solar_flare:     { colors: ['#ea580c', '#facc15'], weights: [0.6, 0.4], drift: { arc: 60 } },
  amber_rose:      { colors: ['#f59e0b', '#f43f5e'], weights: [0.55, 0.45], drift: { arc: 60 } },
  purple_blue:     { colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35], drift: { arc: 60 } },
  violet_pink:     { colors: ['#8b5cf6', '#ec4899'], weights: [0.6, 0.4], drift: { arc: 60 } },
  amazon_dusk:     { colors: ['#166534', '#7c3aed'], weights: [0.55, 0.45], drift: { arc: 60 } },
  mint_drift:      { colors: ['#63e4a3', '#5134f9'], weights: [0.688, 0.312], drift: { arc: 79 } },
  electric_bloom:  { colors: ['#3f1ef5', '#f0298b'], weights: [0.594, 0.406], drift: { arc: 40 } },
  turquoise_bloom: { colors: ['#2bdeb6', '#8254ef'], weights: [0.664, 0.336], drift: { arc: 52 } },
  neon_garden:     { colors: ['#f943aa', '#36f357'], weights: [0.586, 0.414], drift: { arc: 38 } },
  solar_storm:     { colors: ['#f41d2a', '#5026e0'], weights: [0.588, 0.412], drift: { arc: 48 } },
  cyan_mirage:     { colors: ['#53f7e2', '#d24aed'], weights: [0.646, 0.354], drift: { arc: 75 } },
}

// Edges = "this transition looks good" (an aesthetic call, made explicitly
// here, not a formula) — every edge shares a real anchor-hue bridge with its
// target (e.g. amber_rose's rose -> violet_pink's pink; solar_flare's warm
// green-adjacent weight -> amazon_dusk's dominant green), so no walk jumps
// between two duos with nothing visually in common. Every node has 3-4
// out-edges and the graph is strongly connected (validated below, in
// duoGraph.test.js) — a walk can reach any duo from any other, never gets
// stuck in a small cluster.
export const DUO_GRAPH = {
  crimson_gold:    ['solar_flare', 'amber_rose', 'solar_storm'],
  solar_flare:     ['crimson_gold', 'amber_rose', 'amazon_dusk'],
  amber_rose:      ['crimson_gold', 'solar_flare', 'violet_pink'],
  purple_blue:     ['violet_pink', 'mint_drift', 'electric_bloom'],
  violet_pink:     ['purple_blue', 'amber_rose', 'neon_garden'],
  amazon_dusk:     ['solar_flare', 'purple_blue', 'turquoise_bloom'],
  mint_drift:      ['purple_blue', 'turquoise_bloom', 'cyan_mirage'],
  electric_bloom:  ['purple_blue', 'neon_garden', 'cyan_mirage'],
  turquoise_bloom: ['amazon_dusk', 'mint_drift', 'solar_storm'],
  neon_garden:     ['violet_pink', 'electric_bloom', 'cyan_mirage'],
  solar_storm:     ['crimson_gold', 'turquoise_bloom', 'cyan_mirage'],
  cyan_mirage:     ['mint_drift', 'electric_bloom', 'neon_garden', 'solar_storm'],
}
