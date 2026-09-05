import { normalizeRoundScore } from './scoreboardMath.js'

// The default tier ladder: earlier layers are harder to guess, so they pay
// more. Not exposed for per-slide editing in this build (mirrors WAGER_TIERS
// being fixed, not configurable) — a follow-up if the defaults don't hold up
// live. See docs/superpowers/specs/2026-09-04-bendle-layered-audio-question-design.md.
//
// The ladder ROUGHLY HALVES rather than stepping down evenly, and that's the
// whole mechanic (2026-09-05, Ben: "i want them to guess earlier, ie less
// instruments ... so theyd get rewarded for doing so"). An even -10 step
// actually rewards WAITING: a wrong guess costs nothing, so a team 60% sure on
// drums-only compares 0.6 x 40 = 24 against waiting one layer for 0.85 x 30 =
// 25.5 and correctly sits on its hands. Halving flips that (0.6 x 30 = 18 vs
// 0.85 x 15 = 12.75), so committing on the thinnest mix is the right play.
// Keep the cliff between rung 1 and rung 2 steep if these get retuned — the
// gap is what does the work, not the absolute numbers.
//
// THREE steps, always (2026-09-05, Ben: "all shiny step questions will always
// be 3 steps") — that's a house rule across the shiny step formats, not a
// Bendle detail, so keep the count at three if these get retuned.
//
// Stems and steps are deliberately NOT one-to-one. Source separation gives
// four tracks (drums/bass/other/vocals, the four NOT NULL url columns on
// bendle_songs), and the last step brings in `other` AND `vocals` together —
// so the final reveal is the whole song landing at once, which is the better
// payoff moment anyway, and vocals are the giveaway so an "everything but
// vocals" rung was the least interesting of the four. ShinyBendleQuestion
// fades in every stem named in `stems` at that tier's atSeconds and derives
// round length from the last tier, so `stems` must name real STEM_KEYS.
export const BENDLE_TIERS = [
  { id: 'drums', label: 'Drums Only',        atSeconds: 0,  points: 30, stems: ['drums'] },
  { id: 'bass',  label: '+ Bass',            atSeconds: 20, points: 15, stems: ['bass'] },
  { id: 'full',  label: '+ Everything Else', atSeconds: 40, points: 10, stems: ['other', 'vocals'] },
]

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

// Which tier was active at this many elapsed seconds. Tiers must be in
// ascending atSeconds order (same load-bearing-order contract WAGER_TIERS
// documents) — walks forward and returns the LAST tier whose atSeconds <=
// elapsed, defaulting to the first tier for anything before/at zero.
export function resolveBendleTier(elapsedSeconds, tiers) {
  const list = tiers ?? BENDLE_TIERS
  let active = list[0]
  for (const tier of list) {
    if (tier.atSeconds <= elapsedSeconds) active = tier
    else break
  }
  return active
}

// entries: [{ teamId, teamName, guess, elapsedSeconds }]. song: { answer, aliases }.
// A team with no guess (guess == null) scores 0, sorted last — same "no
// guess isn't a bad guess, it's no guess" convention scoreWagerRound uses.
//
// TRUST NOTE (deliberate, reviewed — do not "fix" without re-litigating):
// `elapsedSeconds` on each entry is CLIENT-REPORTED (BendleBoard.jsx computes
// it as Date.now() minus the phone's own slide-open timestamp) and this
// function trusts it as-is for tier resolution. There is no server-recorded
// "slide opened at" timestamp to check it against; the server's
// `submitted_at` is used only for the late-answer lock cutoff, never for tier
// resolution. The original spec (docs/superpowers/specs/
// 2026-09-04-bendle-layered-audio-question-design.md, "Tier resolution at
// lock time") called for resolving tier server-side from a server timestamp,
// treating the client value as advisory only — this implementation inverts
// that. The controller reviewed and accepted the gap 2026-09-05: this is a
// casual, host-supervised bar-trivia game, not an adversarial one; a team
// spoofing a faster elapsedSeconds via a hand-edited request is
// low-probability, low-consequence, and bounded to that one team's own score.
// The likelier exposure is accidental, not hostile: a phone reload mid-round,
// or a team opening /join late, restarts BendleBoard's openedAtRef at zero —
// a guess made at real t=55s reports elapsedSeconds≈5 and lands in the
// drums-only tier it never actually heard. Also bounded to that one team's
// own score, and rare enough in practice not to justify server-side timing.
// Building server-side slide-open timing is explicitly OUT of scope.
export function scoreBendleRound({ entries, song, tiers = BENDLE_TIERS }) {
  const rows = (entries ?? []).map(e => {
    // elapsedSeconds is REQUIRED for a correct guess to score, same as guess
    // itself: unreachable through the shipped BendleBoard.jsx (it always
    // sends a real elapsedSeconds), but a malformed/manual insert with
    // elapsedSeconds missing should not fall back to the earliest/highest
    // tier for free — that would score a team on data that was never
    // actually timed. Treated the same as "no guess": correct: false,
    // points: 0, sorted last (2026-09-05 whole-branch review, Fix 5).
    const correct = e.guess != null && e.elapsedSeconds != null
      && matchesBendleAnswer(e.guess, song?.answer, song?.aliases)
    const tier = correct ? resolveBendleTier(e.elapsedSeconds, tiers) : null
    return {
      teamId: e.teamId,
      teamName: e.teamName ?? null,
      guess: e.guess ?? null,
      elapsedSeconds: e.elapsedSeconds ?? null,
      correct,
      tierId: tier?.id ?? null,
      points: tier?.points ?? 0,
    }
  })

  return rows.sort((a, b) => {
    if (a.correct !== b.correct) return a.correct ? -1 : 1
    if (!a.correct) return 0
    return a.elapsedSeconds - b.elapsedSeconds
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
