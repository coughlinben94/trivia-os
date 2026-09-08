import { normalizeRoundScore } from './scoreboardMath.js'

// The default tier ladder: earlier layers are harder to guess, so they pay
// more. Which STEM occupies which position is now per-slide (data.bendleTierOrder,
// edited in SlideEditor's BendleBuilder) — see buildBendleTiers below. Points
// and timing (20/15/10 at 0/20/40s) stay fixed regardless of order.
// See docs/superpowers/specs/2026-09-04-bendle-layered-audio-question-design.md.
//
// Earlier layers pay more so committing on a thinner mix is the right play
// (2026-09-05, Ben: "i want them to guess earlier, ie less instruments ...
// so theyd get rewarded for doing so"). An even step rewards WAITING
// instead: a wrong guess costs nothing, so a team just sitting on a
// close-behind tier and waiting for more confidence loses nothing by doing
// so. Keep rung 1 enough above rung 2 that a same-confidence bet always
// favors committing early if these get retuned — the gap is what does the
// work, not the absolute numbers. (2026-09-08, Ben: retuned 30/15/10 to
// 20/15/10 — the steep-cliff property above no longer strictly holds at
// every confidence level; his call.)
//
// THREE steps, always (2026-09-05, Ben: "all shiny step questions will always
// be 3 steps") — that's a house rule across the shiny step formats, not a
// Bendle detail, so keep the count at three if these get retuned.
//
// Vocals are deliberately NOT one of the three in-round tiers (2026-09-07,
// Ben: "the vocals arent introduced until i reveal the answer — that's the
// goal"). They used to land alongside `other` on the third tier, but vocals
// are the giveaway, so having them audible before the round even locks
// undercut the guess. `vocals` is still one of the four real stem columns,
// but ShinyBendleQuestion's round-playing effect now skips fetching it
// entirely — one less stem to download over show wifi for content nobody
// is meant to hear yet. It's loaded only in the separate reveal-beat effect
// (see BendleReveal in ShinyBendleQuestion.jsx), together with the other
// three stems, as the "here's the answer" payoff.
export const DEFAULT_STEP_ORDER = ['drums', 'bass', 'other']

export const STEM_LABELS = { drums: 'Drums', bass: 'Bass', other: 'Everything Else' }

// Position 0/1/2 always pay 20/15/10 at 0s/20s/40s — only WHICH stem sits in
// which position varies per slide. (2026-09-08, Ben: "what if i wanted bass
// first drums second sometimes" / "if i want bass first, or guitar first,
// doesnt matter" — the order itself is the point, not the points/timing.)
const STEP_POSITIONS = [
  { atSeconds: 0, points: 20 },
  { atSeconds: 20, points: 15 },
  { atSeconds: 40, points: 10 },
]

// 'other' keeps the id 'full' it always had (pre-reorder BENDLE_TIERS named
// its tier that, not 'other') — shows played before per-slide order existed
// have that literal string persisted in data.bendleResults[].tierId, and
// this is what a reveal re-render looks it back up by (see
// ShinyBendleQuestion's BendleReveal). Renaming it would blank out every
// past show's reveal label the next time its history is viewed.
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
    atSeconds: STEP_POSITIONS[i].atSeconds,
    points: STEP_POSITIONS[i].points,
    stems: [stem],
  }))
}

export const BENDLE_TIERS = buildBendleTiers(DEFAULT_STEP_ORDER)

// Total seconds a round runs for: the last tier's start plus a tail long
// enough to actually hear it before the host locks. ShinyBendleQuestion
// derives its progress bar from this; the admin scrubber (BendleOffsetScrubber)
// uses it to cap how late a start point can be picked, so an offset can never
// leave less than a full round's worth of audio in the file.
export const ROUND_LENGTH_SECONDS = BENDLE_TIERS[BENDLE_TIERS.length - 1].atSeconds + 20

// Keeps a host-picked start point from running a stem past its own end —
// Tone.Player silently plays nothing (no error) if asked to start at or past
// a buffer's duration, so an unclamped offset near the end of a short song
// would go out on a silent TV with no indication anything is wrong. Clamps
// into [0, duration - ROUND_LENGTH_SECONDS], collapsing to 0 if the stem is
// shorter than one full round (nothing useful to offset in that case; the
// round just plays what there is, same as any other short song today).
export function clampBendleOffset(offsetSeconds, stemDurationSeconds) {
  const maxOffset = Math.max(0, (stemDurationSeconds ?? 0) - ROUND_LENGTH_SECONDS)
  return Math.min(Math.max(0, offsetSeconds ?? 0), maxOffset)
}

function normalize(s) {
  return (s ?? '').toString().trim().toLowerCase()
}

// Exact-after-normalize match against the canonical answer or any alias.
// No fuzzy-distance library — aliases are how this codebase already covers
// real spelling/title variants (same bar every other free-text answer in
// this app clears).
export function matchesBendleAnswer(guess, answer, aliases) {
  const g = normalize(guess)
  if (!g) return false
  if (g === normalize(answer)) return true
  return (aliases ?? []).some(a => normalize(a) === g)
}

// Which tier a guess submitted during part `partIndex` counted in. Bendle is
// now a 3-part host-advanced series (2026-09-08, Ben: "i want three
// subslides, one per step") — the round no longer runs on an internal timer,
// so tier resolution is just "which part was live on the show's own synced
// state when the phone submitted," not a clock computation. Clamped so a
// stray out-of-range value can't index past the tier list.
export function resolveBendleTier(partIndex, tiers) {
  const list = tiers ?? BENDLE_TIERS
  const idx = Math.min(Math.max(partIndex ?? 0, 0), list.length - 1)
  return list[idx]
}

// entries: [{ teamId, teamName, guess, submittedAtPart }]. song: { answer, aliases }.
// A team with no guess (guess == null) scores 0, sorted last — same "no
// guess isn't a bad guess, it's no guess" convention scoreWagerRound uses.
//
// `submittedAtPart` replaces the old client-clock `elapsedSeconds` (2026-09-08
// rebuild, alongside the move to 3 host-advanced parts): BendleBoard.jsx now
// sends whatever data.currentPart it has locally at submit time, which is
// itself just a mirror of the show row's own currentPart via the existing
// Realtime sync every other slide field already rides — not a client-side
// wall clock. This kills the specific accidental-exposure case the old
// TRUST NOTE flagged (a phone reload resetting a local timer to zero,
// silently misscoring a late guess into the earliest tier): there's no local
// timer left to reset. A deliberately spoofed submittedAtPart in a
// hand-edited request is still possible and still not defended against
// server-side — same low-probability/low-consequence/single-team-scoped
// judgment the controller made 2026-09-05, carried forward rather than
// re-litigated.
export function scoreBendleRound({ entries, song, tiers = BENDLE_TIERS }) {
  const rows = (entries ?? []).map(e => {
    // submittedAtPart is REQUIRED for a correct guess to score, same as guess
    // itself: unreachable through the shipped BendleBoard.jsx (it always
    // sends a real currentPart), but a malformed/manual insert with it
    // missing should not fall back to the earliest/highest tier for free —
    // that would score a team on data that was never actually attributed to
    // a real step. Treated the same as "no guess": correct: false, points: 0,
    // sorted last (2026-09-05 whole-branch review, Fix 5 — same convention).
    const correct = e.guess != null && e.submittedAtPart != null
      && matchesBendleAnswer(e.guess, song?.answer, song?.aliases)
    const tier = correct ? resolveBendleTier(e.submittedAtPart, tiers) : null
    return {
      teamId: e.teamId,
      teamName: e.teamName ?? null,
      guess: e.guess ?? null,
      submittedAtPart: e.submittedAtPart ?? null,
      correct,
      tierId: tier?.id ?? null,
      points: tier?.points ?? 0,
    }
  })

  return rows.sort((a, b) => {
    if (a.correct !== b.correct) return a.correct ? -1 : 1
    if (!a.correct) return 0
    return a.submittedAtPart - b.submittedAtPart
  })
}

// Same fold-in contract as computeWagerScoreUpdates — writes only this
// slide's entry into the round's phoneBySlide bucket, preserving every
// other phone-scored slide already in the round. Dedupes by scoreboard team
// id (last write wins) so a host data-entry name collision can't crash the
// upsert's ON CONFLICT clause.
export function computeBendleScoreUpdates({ results, teams, scoreboardTeams, roundKey, slideId }) {
  const teamIdToName = new Map((teams ?? []).map(t => [t.id, t.name.trim().toLowerCase()]))
  const updates = []
  for (const r of results ?? []) {
    const teamName = teamIdToName.get(r.teamId)
    if (!teamName) continue
    const sbTeam = (scoreboardTeams ?? []).find(t => t.name.trim().toLowerCase() === teamName)
    if (!sbTeam) continue
    const prevSplit = normalizeRoundScore(sbTeam.scores?.[roundKey])
    const nextPhone = { ...prevSplit.phoneBySlide, [slideId]: r.points }
    const nextScores = { ...sbTeam.scores, [roundKey]: { written: prevSplit.written, phone: nextPhone } }
    updates.push({ id: sbTeam.id, show_id: sbTeam.show_id, name: sbTeam.name, scores: nextScores, sort_order: sbTeam.sort_order })
  }
  return [...new Map(updates.map(u => [u.id, u])).values()]
}
