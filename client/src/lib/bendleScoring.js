// The default tier ladder: earlier layers are harder to guess, so they pay
// more. Which STEM occupies which position is per-slide (data.bendleTierOrder,
// edited in SlideEditor's BendleBuilder) — see buildBendleTiers below. Points
// (20/15/10) are a REFERENCE for Ben's manual grading, not auto-scored
// (2026-09-08 rebuild: Bendle is 3 real host-advanced slides, graded by hand
// — teams write the answer down, Ben walks around and enters points via
// Quick Entry, same as any regular question. No phone guess-lock, no
// auto-scoring — see docs/superpowers/specs/
// 2026-09-04-bendle-layered-audio-question-design.md for the original
// phone-scored design this superseded).
//
// Earlier layers pay more so committing on a thinner mix is the right play
// (2026-09-05, Ben: "i want them to guess earlier, ie less instruments ...
// so theyd get rewarded for doing so"). (2026-09-08, Ben: retuned 30/15/10
// to 20/15/10 — his call.)
//
// THREE steps, always (2026-09-05, Ben: "all shiny step questions will always
// be 3 steps") — that's a house rule across the shiny step formats, not a
// Bendle detail, so keep the count at three if these get retuned.
//
// Vocals are deliberately NOT one of the three step stems (2026-09-07, Ben:
// "the vocals arent introduced until i reveal the answer — that's the
// goal") — they only play once the host presses the standard answer-reveal
// key (see ShinyBendleQuestion.jsx).
export const DEFAULT_STEP_ORDER = ['drums', 'bass', 'other']

export const STEM_LABELS = { drums: 'Drums', bass: 'Bass', other: 'Everything Else' }

// Position 0/1/2 always pay 20/15/10 — only WHICH stem sits in which
// position varies per slide. (2026-09-08, Ben: "what if i wanted bass first
// drums second sometimes" / "if i want bass first, or guitar first, doesnt
// matter" — the order itself is the point, not the points.)
const STEP_POSITIONS = [
  { points: 20 },
  { points: 15 },
  { points: 10 },
]

// 'other' keeps the id 'full' it always had (pre-reorder BENDLE_TIERS named
// its tier that, not 'other') — kept for continuity with any historical
// reference to that id, harmless either way now that nothing looks tiers up
// by id for scoring.
const TIER_IDS = { drums: 'drums', bass: 'bass', other: 'full' }

// stepOrder: a permutation of DEFAULT_STEP_ORDER's 3 stems, e.g.
// ['bass', 'drums', 'other']. Falls back to the default order for anything
// malformed (missing, wrong length) rather than throwing on a live TV.
export function buildBendleTiers(stepOrder) {
  const order = Array.isArray(stepOrder) && stepOrder.length === STEP_POSITIONS.length
    ? stepOrder
    : DEFAULT_STEP_ORDER
  return order.map((stem, i) => ({
    id: TIER_IDS[stem] ?? stem,
    label: i === 0 ? `${STEM_LABELS[stem] ?? stem} Only` : `+ ${STEM_LABELS[stem] ?? stem}`,
    points: STEP_POSITIONS[i].points,
    stems: [stem],
  }))
}

export const BENDLE_TIERS = buildBendleTiers(DEFAULT_STEP_ORDER)

// Minimum seconds of audio a host-picked start offset must leave. Not a
// fixed round length (2026-09-08 rebuild to 3 real host-advanced slides
// removed the old internal 60s-round timer, per Ben: "i dont want the
// 60s") — each step/reveal beat now plays to its own natural end (or a
// host-picked end_offset for the reveal only), so there's no fixed
// duration left to reserve runway against. Just enough tail that a picked
// point isn't picking dead air.
export const MIN_PLAYABLE_SECONDS = 5

// Keeps a host-picked start point from running a stem past its own end —
// Tone.Player silently plays nothing (no error) if asked to start at or past
// a buffer's duration, so an unclamped offset near the end of a short song
// would go out on a silent TV with no indication anything is wrong.
export function clampBendleOffset(offsetSeconds, stemDurationSeconds) {
  const maxOffset = Math.max(0, (stemDurationSeconds ?? 0) - MIN_PLAYABLE_SECONDS)
  return Math.min(Math.max(0, offsetSeconds ?? 0), maxOffset)
}
