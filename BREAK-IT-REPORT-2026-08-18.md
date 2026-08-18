# BREAK-IT REPORT — 2026-08-18

Adversarial pre-show hunt against `main` (HEAD `5f9f068` at audit start). Read-only against
production except a throwaway `ZZTEST-BREAKER` show (`show_ZZTESTBRK1`), which has been fully
deleted — teams/scores/phone_answers/questions/storage rows created for it all confirmed at 0
before deletion, no cleanup owed to Ben. No code was changed, no commits made, no migrations or
RLS policies applied.

Note throughout: Ben was actively building tonight's real show (`show_NyRe6x2Q`) in a second
session during this audit — it moved from 12→15 slides mid-run. Numbers below reflect a fresh
check at the end of the audit (see §1).

---

## Verdict

**Yes-with-workarounds.** Nothing found makes the *engine* unsafe to run tonight — Realtime
merge discipline, Stream Deck races, error boundaries, RLS on scoring/identity, and the anon
jukebox-advance path all held up under live adversarial testing. The two real blockers are a
content gap (Round 2 has no questions and no ending) and a one-line permissions fix — both fixable
in minutes. A handful of P1s need workarounds tonight rather than code fixes.

**Do these three things before doors, in order:**
1. Finish building Round 2 in `show_NyRe6x2Q` through a winner-reveal slide (§3, P0-a).
2. Run `GRANT UPDATE ON public.teams TO anon, authenticated;` in the Supabase SQL editor (§3, P0-b).
3. Read the **In-show workarounds** (§8) once, especially: don't drag whole rounds or a shiny
   series' lead slide tonight, and glance at the sidebar order after adding any slide to the last
   round.

---

## Pre-doors list (ranked, with time estimate)

| # | Item | Est. | Type |
|---|---|---|---|
| 1 | Finish Round 2 content + a `winner-reveal` slide in `show_NyRe6x2Q` | in progress (Ben) | content |
| 2 | `GRANT UPDATE ON public.teams TO anon, authenticated;` in Supabase SQL editor | 1 min | DB permission |
| 3 | Read §8 in-show workarounds once | 3 min | briefing |
| 4 | (Optional, if a dev pass happens before doors) Prime `AudioContext.resume()` in `Display.jsx`'s existing `onFirstInteraction` handler so Rules-slide audio isn't silently blocked on a cold TV | 10 min | code |
| 5 | (Optional, low urgency) Note the PIN brute-force exposure — no code fix fits before tonight; just don't say the PIN loudly | 0 min | awareness |

Everything else below is real but does not need to be fixed before tonight — it's covered by a
workaround in §8.

---

## P0 findings

### P0-1 — Tonight's real show has no Round 2 content and no ending
**CONFIRMED**, re-verified at end of audit (was 12 slides at audit start, now 15).

`show_NyRe6x2Q` slide sequence, sorted by `order`:
```
pre-show → state-of-union → rules → team-picker → round-intro(R1) →
6 questions → grading-break → 2 more questions (still tagged Round 1's roundId,
placed after the grading-break — looks like in-progress editing) → round-intro(R2)
```
That's the **last slide**. Round 2 (`round_Gn1qcgJi`) has zero question slides, no grading-break,
no PYL round, no wager/matching question, and there is no `winner-reveal` slide anywhere in the
show. Per SKILL.md's Final Break logic, `saveResults()`/auto-close requires `winner-reveal` as the
literal last slide — it can't fire because that slide doesn't exist yet.

**Blast radius:** host hits a dead end live on stage after the Round 2 intro card, with nothing to
advance to.

**Fix:** content, not code — finish Round 2's questions, add a closing grading-break, and add a
`winner-reveal` slide as the literal last slide. Ben appeared to be doing exactly this during the
audit; confirm it's complete before doors.

*Secondary, lower severity:* the "We're not so different, you and I..." shiny question (Q3, a real
multi-photo format, not a bespoke/broken one) renders correctly but has zero on-screen caption text
across all 4 photos — the host will need to narrate it from memory with no on-screen safety net.
P2, not blocking.

### P0-2 — `teams` table is missing its UPDATE grant entirely (functional, not RLS)
**CONFIRMED** via two real anon-key HTTP requests, not policy-reading.

This isn't a bad RLS policy — the RLS policy (`owner_uid = auth.uid()`) is correct. The table
simply has no `UPDATE` grant at all for `anon`/`authenticated`, which Postgres checks *before* RLS
ever runs. Confirmed: a non-owner session gets `403 42501` (expected), and the actual **owning**
session gets the identical `403 42501` trying to update its own row (not expected — every other
write-gated table has this grant, `teams` is the outlier).

**Live impact right now, tonight, on real phones:**
- `client/src/views/Join.jsx:1716` — `powerup_used: true` never persists. **Powerups don't work.**
- `client/src/views/Join.jsx:1645` — connection/presence status updates silently fail.
- `client/src/views/Join.jsx:1181/1189` — "went back"/"caught up" tracking silently fails.

None of this crashes anything — it fails closed, silently — but it means an entire shipped
feature (powerups) is dead on real phones as of right now.

**Fix (not applied — for Ben to run):**
```sql
GRANT UPDATE ON public.teams TO anon, authenticated;
```

---

## P1 findings

### P1-1 — Round drag-reorder leaves stale labels everywhere, and Quick Entry can silently misattribute points
**CONFIRMED**, live, from three independent angles (scoring, build-mode, and doc-drift agents all
converged on the same root cause).

`reorderRounds` (`client/src/hooks/useShow.js:468-483`) reorders the `rounds` array and
renumbers question labels *within* each round, but never touches `round.number`/`round.title`/
`roundNumber` on the round or its round-intro slide. Every label anchored to those fields goes
stale after a drag:
- `QuestionCounter.jsx:9-10` (the on-screen TV badge) computes its round number from live array
  *position*, not identity — after dragging Swing Round to position 1, its questions show
  **"R1"** on the TV.
- `RoundSidebar.jsx:443`'s own header shows the same stale "R1 · Round 1" after a drag.
- Actual scores are **never** misdirected — `deriveRoundCols` keys everything off the immutable
  `round.id`, confirmed byte-identical column set before/after a drag.
- The dangerous path: `ScoreboardModal.jsx`'s Quick Entry numeric fallback (`resolveRound()`,
  lines 29-41) resolves a bare digit like `1` against whichever column's **label text** literally
  reads `R{n}`. A host watching the TV say "R1" during a live Swing-round question, typing `1`
  into Quick Entry (a completely natural move), gets silently routed to the *real* Round 1's
  column — misattributing points between rounds live, with no error or warning.

**Workaround tonight:** don't drag whole rounds to reorder them. If a round order needs fixing,
rebuild it instead. In Quick Entry, prefer the text token (`SW`, `PYL`) over a bare number if
there's ever been a reorder.

### P1-2 — Shiny series does NOT reorder as one atomic unit (contradicts documented guarantee)
**CONFIRMED**, live repro.

SKILL.md states drag-reorder "carries the whole group as one atomic unit." Live test: a 2-part
shiny series (shared `shinyFormatId`, `isSeries:true`) had its **lead** slide's grip dragged to a
new position — the group split. The lead became a standalone row at the new position; the orphaned
sibling stayed behind as a second, disconnected row, no longer grouped or collapsible together.
Root cause: `RoundSidebar.jsx`'s per-row `onGripDown` (line 496) has no group-aware branch, and
`computeNewOrder`'s within-round drag path (lines 196-207) operates on individual slide ids, not
series groups.

**Blast radius:** each half of a broken series then behaves as an independent standalone question
— likely also breaking the shared `ShinyIntroScreen` "once per run" gating for that pair.

**Workaround tonight:** don't drag a shiny series' slides in Build Mode. If one must move, drag it,
then immediately check RoundSidebar still shows it collapsed as one grouped row — if not, undo
(Cmd/Ctrl+Z) and try again or rebuild the series instead.

### P1-3 — Adding a slide to the final round can silently land it after Winner Reveal
**CONFIRMED**, live repro, with root cause identified (this is the same class of bug SIM-REPORT
already flagged, but the mechanism is now understood precisely).

`AddSlideWizard.jsx:337-345`'s "add slide" logic inserts after "this round's last existing slide"
— correct intent, meant to avoid splitting a round. But `winner-reveal` itself is stored with
`roundId` set to the *last round* (not `null`/round-less as its logical position implies), so it
counts as that round's own last slide. Any add to the final round therefore lands **after**
`winner-reveal`.

**Blast radius:** `Display.jsx`'s Final Break auto-jump (jukebox-return → last slide) depends on
`winner-reveal` being the show's literal last slide. A stray slide landing after it — even
briefly, mid-build — breaks that automatic close for the *entire show* until someone notices and
drags it back.

**Workaround tonight:** after adding any slide to the final round (PYL round, or whichever round
precedes winner-reveal in `show_NyRe6x2Q` once built), glance at the sidebar order and confirm
`winner-reveal` is still the very last row. Drag it back down if not.

### P1-4 — Rules-slide audio can be silently blocked on a truly cold TV
**CONFIRMED**, live, fresh Playwright context with zero prior clicks/keydowns.

Chrome's autoplay policy suspends the `AudioContext` until a real user gesture occurs anywhere on
the page. On a genuinely cold load, `ctx.resume()` never resolves, the scheduled beep sources never
advance, `onended` never fires, and the PSA never plays — the only thing that eventually reveals
the rules content is the 12-second watchdog timeout (`RulesSlide.jsx:131`), not the intended
~5-second beep+PSA cinematic beat. Net effect on a cold TV browser: **12 seconds of silent red
strobing** instead of the intended cinematic.

Mitigating factor: Chrome's "sticky user activation" means a single genuine click/keypress
*anywhere* earlier in that browser session unlocks audio for good. If the TV browser gets clicked
at all during setup (e.g. to trigger fullscreen), this likely never happens tonight — but it's not
guaranteed.

**Workaround tonight:** have whoever sets up the TV click/tap the display once during setup, before
the show goes live. **Small code fix if there's time:** prime `AudioContext.resume()` inside
`Display.jsx`'s existing `onFirstInteraction` handler (~line 650) so any early interaction anywhere
in the show unlocks audio well before Rules is reached.

*Secondary, dev-only artifact, not production-relevant:* React StrictMode double-invokes the Rules
effect in the Vite dev server only (never in the production build), which surfaced 3 harmless
`AudioBufferSourceNode` console warnings during testing. Confirmed dev-only; no action needed.

### P1-5 — A genuine network outage during a score edit fails silently, no warning
**CONFIRMED**, live, via a hard-aborted `rest/v1` route (Playwright's `context.setOffline` proved
unreliable for this — Chromium can complete some writes anyway; route-level abort is deterministic).

`ScoreboardModal.jsx`'s `save()` (lines 281-315) does an unguarded `await ...select('scores')
...single()` *before* the branch that sets the amber "at risk" border and fires the failure toast.
On a real outage that initial read throws and the function exits before reaching that branch — no
amber border, no toast, and the DB write never happens. The host's screen still shows the typed
number as if it saved; it silently didn't. No false-positive reaches the TV or phones (since the
write never lands, Realtime never pushes it), so the damage is confined to the host's own screen —
but it's confined *silently*.

**Workaround tonight:** during any known wifi hiccup, re-check that a just-entered score actually
shows up on the phone/TV scoreboard rather than trusting the host screen at face value.

---

## P2 findings

- **Matching-board offline-save UX trap.** A failed matching save (dropped connection mid-submit)
  leaves the tapped pair visually colored as "matched" even though nothing was scored — and the
  natural recovery move (retapping the same pair) hits the "already matched → undo" branch and
  *clears* it instead of resubmitting, so a team has to notice, then redo both taps from scratch.
  `client/src/components/join/MatchingBoard.jsx:84-113`, `:172`. CONFIRMED live.
- **"We're not so different" shiny question has no on-screen caption text** across any of its 4
  photos (see P0-1 secondary note above). CONFIRMED.
- **Host PIN has zero brute-force protection** — 4-digit, unsalted SHA-256, no lockout/rate-limit
  found anywhere in the edge function or schema. ~35 minutes exhaustive at a conservative 5 req/s.
  Not attacker-relevant tonight (needs a scripted attacker in range of the anon key, and the venue
  isn't a target), but a real, zero-friction gap. CONFIRMED from code.
- **`jukebox_state` table has anon read+write RLS policies**, flagged by the security scan but not
  deep-audited (out of this session's declared scope) — a live show-state table with anon write
  access deserves a follow-up look before the next audit cycle. Not urgent tonight.
- **Reauth token UX gap (by design, not a bug):** when a team's phone gets "stolen" via a
  legitimately-redeemed reauth token, the original phone doesn't get a clear "you're logged out"
  message — subsequent writes fail RLS and surface the same generic "check your connection" copy
  WagerBoard/MatchingBoard already show for any save failure. Low real risk (single-use tokens
  confirmed correctly enforced), just a confusing message if it comes up.
- **Storage buckets have no DELETE policy** on any of the 3 buckets — confirmed, cleanup debt only,
  not a show-stopper.
- **Unserialized structural writes** (`deleteSlide`/`reorderSlides`/`reorderRounds`/
  `addSiblingSlides` in `useShow.js`) don't get the same write-ordering protection `updateSlide`
  has. Real but narrow — needs two rapid structural edits racing each other, unlikely mid-show.
- **Rapid mouse-clicked "Next ▶"** has no debounce/reentrancy guard, unlike the keyboard hotkey
  path (which was fixed and re-confirmed safe in this audit). Flagged from AUDIT.md, not
  independently re-tested live this session.

## P3 findings

- Scoreboard column order is always `SW | PYL | R1 | ?` regardless of actual play order (Swing/PYL
  always carry `number: null`, sort first) — cosmetic, not a bug, confirmed even on a
  never-reordered show.
- `autoFitText`'s floor-clamp fallback logs a console warning on deliberately-oversized test text;
  did not visibly overflow. Real show text (see §1) has zero occurrences of this — nothing to
  shorten tonight.
- 7 of 21 themes have never been live-screenshotted end-to-end. Worth a glance at TV distance if
  tonight's theme is one of them — `midnight-galaxy`'s ring world has a known, already-accepted
  station 4/10 luminance regression if that theme is picked.

---

## Landmines re-verified (§4 of the original brief)

| Landmine | Status | How verified |
|---|---|---|
| **RT-1** (Realtime TOAST omission → blank TV) | **Still holding** | Live: lightweight `answer_reveal` write against a TOASTed slide never blanked the TV. Code: `Display.jsx`'s merge is a generic spread over every field, not an allowlist — new columns are automatically covered. `Join.jsx`/`useShow.js` confirmed merging too. |
| Two independent show-shape implementations | **Confirmed gap, low real impact** | Only one column added since 2026-08-01 (`scores_locked_at`) is missing from `normalizeShow()` — same class of gap as the already-known `audio_playing`. Traced every current reader/writer: none of them actually needs the missing thread today. Latent risk for future work, not a fix-tonight item. |
| Serialized debounced writes | **Confirmed true, and verified WagerBoard/MatchingBoard genuinely use the same pattern** (not just a doc claim) — both have their own `saveChainRef`. |
| OV-1 (focus-steal) | **Still holding** | Live: mid-edit toolbar click, box survived. |
| OV-2 (stale closure) | **Still holding** | Live: 3 rapid duplicates, no ghosts/resurrection. |
| OV-3 (Escape scope) | **Still holding** | Live: Escape exited only the inline edit, `SlideEditor` stayed mounted. |
| OV-4 (stage vs viewport measurement) | **Still holding** | Live: stage-relative measurement matched stored percent exactly; viewport-relative showed the expected false "drift." |
| RLS-D-1 (un-PIN'd TV / anon `advance_show`) | **Still holding** | Live, from a session that never called `verify-host-pin`: step-forward and jump-to-last succeeded; arbitrary mid-show jump and backward jump both blocked. |
| SEC-1 (PIN brute-forceability) | **Still true, unchanged** | See P2. |
| SEC-2 (`teams` UPDATE open policy) | **Fixed at the RLS layer** — but see P0-2, the *grant* itself is missing so the fix is currently unreachable either way. |
| SIM-P0 (`teams` INSERT RLS blocking registration) | **FIXED, confirmed live** | Registered a real team from a completely clean browser profile through the actual `/join` UI — 201 Created, `owner_uid` correctly stamped. The 2026-08-16 sim result is stale. |
| PREV-1 (winner-reveal drum roll leaking in Build Mode) | **Still holding** | Code: `isPreview` gates the entire audio-load-and-play sequence, confirmed the gate covers the actual `<audio>` call. |
| Storage has no DELETE policy | **Still true** | Confirmed, P3/cleanup only. |

---

## Doc drift

- **SKILL.md/slides.md**: Winner Reveal and Scoreboard Reveal are documented as reading
  `teams`/`team_scores`; they actually read `scoreboard_teams` primarily, falling back to
  `teams`/`team_scores` only when empty. Neither doc mentions the fallback at all.
- **SKILL.md/build-state.md**: slide type count documented as 15/16; actual count in
  `SlideRenderer.jsx`'s `SLIDE_COMPONENTS` is **17**. The `rules` slide type (added this week) and
  the `matching` shiny subtype are both fully built and undocumented anywhere in SKILL.md's Slide
  Types table or Shiny Subtypes section.
- **SKILL.md's Scoreboard System section / dress-rehearsal.md**: describes `ScoreboardOverlay` as
  a 52%-wide right-side drawer with the slide still visible behind it, and a two-column layout for
  >8 teams. Both are stale — it was deliberately redesigned back to a full-stage opaque overlay
  with dual radial gradients on 2026-08-16 (commit `696d980`), and the two-column split no longer
  exists at all. `dress-rehearsal.md`'s literal walkthrough step ("the slide stays visible
  behind/beside it") is now factually wrong — don't run that checklist step literally tonight.
- **useshow.md**'s Realtime code sample uses channel name `show:${showId}`; actual channel names in
  code are `show-state:${showId}`, `display:${showId}`/`display:any-live`,
  `join-show:${id}`/`scores-drawer:${id}`, `preshow-teams:${id}`.
- **ring-world-mistakes.md**: still describes `RingAmbient.jsx` as "not mounted in production yet
  — dev-only," per a 2026-08-09 handoff note. It's been mounted in production since 2026-08-16.
  `scripts/ship.sh`'s own comments already correctly reflect the newer state; only the reference
  doc is stale.
- **SKILL.md**: `questions` table SELECT is documented as public; a 2026-08-17 migration
  (`20260817193000_lock_down_questions_select.sql`) locked it down to `host_verified` — every
  client caller already sits behind `HostPinGate`, so this is a correct, intentional tightening
  with no functional loss, just an undocumented one. Same for `phone_answers` SELECT
  (`20260817171310`), now scoped to `host_verified OR owning team`.

---

## What we could not test

- **The full live Event Horizon (jukebox ring) song-to-song transition** — no Spotify session was
  available in the sandbox, so the actual `StationRingLayer` track-change visual could not be
  triggered live. Relying on the documented fix trail (3 bugs found and fixed by an independent
  Opus review on 2026-08-17) as code-verified only, not re-confirmed live this session.
- **A clean, uninterrupted full jukebox-return round-trip on `/display`** — two of the display-
  surface tests were interrupted mid-run by a second agent legitimately driving the same test
  show's live-slide state concurrently (an artifact of running 7 QA agents against one shared
  sandbox, not a product bug). The individual pieces (warp opacity ramp, error-boundary
  containment, exit-hold RPC firing) all checked out in isolation; a single uninterrupted full
  cycle would give more confidence if there's time for one more pass.
- **The native `beforeinstallprompt` PWA dialog itself** — headless Chromium doesn't reliably fire
  real browser-native install prompts, so this was verified structurally (the banner component is
  only mounted on the registration screen, not reachable from any live-question view) rather than
  by observing the actual native prompt.
- **7 of 21 ambient themes**, never live-screenshotted this session — see P3.
- Both scores_locked_at cross-implementation gap and the `jukebox_state` anon-write policy are
  flagged but not deep-audited — see their respective P2/finding entries.

---

## In-show workarounds (for whoever's holding the mic or the laptop)

- **If the round order looks wrong on a slide or the sidebar** (e.g. Swing Round shows "R1"): the
  scores are still landing in the right place — the *label* is just stale after a drag. When using
  Quick Entry, type `SW` or `PYL` instead of a bare number if there's any doubt.
- **If you need to reorder a shiny multi-part question**: don't, tonight. If you already did and
  the parts show up as two separate rows in the sidebar instead of one grouped row, undo
  (Cmd/Ctrl+Z) right away.
- **If you add a new slide to the last round of the show**: check the sidebar — `winner-reveal`
  should still be the very last row. If something landed after it, drag that slide back up above
  winner-reveal.
- **If the TV goes dark red and silent on the Rules slide for more than ~5 seconds**: that's the
  known audio-autoplay block — it will self-resolve in 12 seconds via the watchdog. Nothing to do,
  just don't panic-restart anything.
- **If you enter a score and it doesn't show up on the scoreboard/TV a few seconds later**: re-enter
  it. There's a chance it silently failed to save (usually during a wifi hiccup) with no warning
  shown.
- **If a team says their matching-question pair "isn't sticking"**: have them clear it and redo
  both taps fresh, rather than just tapping the same pair once more (that undoes it).
- **If registration seems to fail for a team**: this was fixed and confirmed working tonight — if
  it fails anyway, it's a new issue, not the known one; have them fully reload `/join` first.
- **Powerups won't work for anyone tonight** unless the `GRANT UPDATE` fix (P0-2) gets run before
  doors — if it wasn't run, don't promise powerups to the room.
