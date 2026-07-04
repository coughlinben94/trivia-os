// PowerPoint-style discrete-tier text autofit.
//
// Ben's own mental model from the old deck: 55pt for a normal-length
// question, dropping to 48pt for longer ones — a manual, two-step version
// of PowerPoint's "shrink text on overflow" autofit. This is the automatic
// equivalent: pick from a small set of fixed size bands by character count
// instead of continuously measuring/shrinking. Predictable, cheap (no
// layout measurement, no ResizeObserver), and — the actual point of this
// module — using the SAME tier table across every slide type that shows
// host-typed prose is what makes text feel consistent slide to slide,
// instead of each component having its own hand-tuned clamp() range.
//
// Each tier's value is a cqw (container-query-width) number, resolved
// against StageFrame's stage-relative box (client/src/display/stage.js,
// STAGE_SCALE = 0.85 of the viewport) — not vw. Half the slide components
// were on raw vw before this pass; cqw is the current direction of travel
// (see the "Stage boundary infrastructure" commits) and keeps text at a
// consistent scale relative to the actual TV-safe stage box rather than
// the full browser viewport.
//
// autoFitClamp() still returns a clamp(floor, tier, ceiling) string — the
// floor/ceiling remain a safety net for unusual screen sizes; the tier
// picked by length is just the *preferred* middle value clamp() scales
// from.

function pickTier(text, tiers) {
  const len = (text ?? '').length
  return tiers.find(t => len <= t.maxChars) ?? tiers[tiers.length - 1]
}

export function autoFitClamp(text, tiers, floorRem, ceilRem) {
  const tier = pickTier(text, tiers)
  return `clamp(${floorRem}rem, ${tier.cqw}cqw, ${ceilRem}rem)`
}

// ─── Shared tier tables ─────────────────────────────────────────────────────

// Single block of prose filling most of the slide: questions, State of the
// Union, Grading Break, Custom body, Pixelate Series hint. Ceiling anchored
// to the existing QuestionSlide max (4.5rem ≈ 54pt) — already matched Ben's
// 55pt reference before this pass, so it's the anchor everything else now
// aligns to instead of each file inventing its own range.
export const PARAGRAPH_TIERS = [
  { maxChars: 60,       cqw: 4.5 },  // one-liner — "What is the capital of France?"
  { maxChars: 110,      cqw: 3.8 },  // ~Ben's old 48pt step-down
  { maxChars: 170,      cqw: 3.1 },
  { maxChars: 240,      cqw: 2.5 },
  { maxChars: Infinity, cqw: 2.1 },
]
export const PARAGRAPH_FLOOR = 1.8
export const PARAGRAPH_CEIL  = 4.5

// Multiple items sharing one screen (Multi-Question, PYL Reveal answer
// list) — inherently smaller than a single dominant question since several
// rows compete for the same space. Scaled down from PARAGRAPH_TIERS by
// roughly the same per-item ceiling these slides already used.
export const LIST_ITEM_TIERS = [
  { maxChars: 40,       cqw: 2.6 },
  { maxChars: 80,       cqw: 2.1 },
  { maxChars: 130,      cqw: 1.7 },
  { maxChars: Infinity, cqw: 1.4 },
]
export const LIST_ITEM_FLOOR = 1.1
export const LIST_ITEM_CEIL  = 2.5

// Short single lines that are still host-typed and length-variable, but
// never a full paragraph — round-intro subtitles/catchphrases.
export const LINE_TIERS = [
  { maxChars: 24,       cqw: 4.2 },
  { maxChars: 44,       cqw: 3.4 },
  { maxChars: 70,       cqw: 2.8 },
  { maxChars: Infinity, cqw: 2.3 },
]
export const LINE_FLOOR = 1.3
export const LINE_CEIL  = 3.0

// The dramatic winner-name reveal — normally one short team name, but ties
// join multiple names together ("Team A & Team B & Team C") and can run
// long enough to blow past a fixed clamp ceiling. Same mechanism, much
// bigger numbers since this is meant to dominate the screen when short.
export const REVEAL_TIERS = [
  { maxChars: 16,       cqw: 11 },
  { maxChars: 32,       cqw: 8.5 },
  { maxChars: 55,       cqw: 6.5 },
  { maxChars: Infinity, cqw: 4.8 },
]
export const REVEAL_FLOOR = 2.5
export const REVEAL_CEIL  = 10

// Prose sharing the frame with a full-height image — shiny visual question's
// half-width portrait column, or the bottom-third scrim band in landscape.
// Genuinely less room than a full-bleed question, so its own ceiling (kept
// at the existing 3.5rem this slide already used) rather than PARAGRAPH's.
export const VISUAL_CAPTION_TIERS = [
  { maxChars: 60,       cqw: 3.5 },
  { maxChars: 110,      cqw: 3.0 },
  { maxChars: 170,      cqw: 2.4 },
  { maxChars: 240,      cqw: 2.0 },
  { maxChars: Infinity, cqw: 1.7 },
]
export const VISUAL_CAPTION_FLOOR = 1.5
export const VISUAL_CAPTION_CEIL  = 3.5
