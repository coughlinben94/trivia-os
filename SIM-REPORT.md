# SIM-REPORT.md — Ben Field-Test Simulation

Date: 2026-08-16. Test show: "Tuesday Night Trivia — ZZTEST-AGENT" (`show_hl3zXZ-Q`), built via real UI clicks (playwright-cli against `/host`, `/display`, `/join`) against the production Supabase project (`qwtbgusqfoypvehnungr`). Full build (opening beats, 3 normal rounds, swing round, PYL round, overlays, closers, reorder), full live run (Go Live, hotkeys, PYL picker, Quick Entry, final-break edge case, kill/restart), and teardown all completed. Branch: `fix/ben-sim-findings`.

---

## 1. Broke

### P0 — `teams` table INSERT is blocked for EVERYONE — `/join` team registration is completely dead in prod
**Repro:** From a fresh `/join?show=<id>` page, type any team name, click "Join the Show". Also reproduced directly: `curl -X POST .../rest/v1/teams` with the anon key, and separately with a host-PIN-verified (`host_verified: true`) JWT — both return `401`/`403` with `{"code":"42501","message":"new row violates row-level security policy for table \"teams\""}`.
**Expected:** Team registers, phone moves to the "waiting" screen.
**Actual:** Hard RLS rejection. The UI does surface the raw Postgres error text under the input ("new row violates row-level security policy for table \"teams\""), so at least it's not a silent hang — but no real customer could ever join a live show right now. This is not player-only: I confirmed even an authenticated host session with `host_verified: true` gets the same 42501, so it isn't a "should be public, is gated behind host PIN" misconfiguration — INSERT appears to have no working policy at all for this table (default-deny). By contrast, `scoreboard_teams` (the newer table) INSERTs fine for a host-verified session — the break is specific to `teams`.
**Suspected cause:** RLS policy on `teams.INSERT` — missing, or a broken/always-false USING/WITH CHECK expression.
**Severity:** P0. Would ruin a live show — nobody's phone could register.
**Not fixed:** This is exactly the "touches RLS" case the task told me to flag rather than fix. Needs a Supabase-side policy check/fix (`supabase` MCP or dashboard), not a code change.

### P1 — Long-but-ordinary question text overflows the slide box, top and bottom, on `/display`
**Repro:** Build any `question` slide whose text wraps to 5+ lines at the `QUESTION_BOX` floor size (`maxLines: 4`, floor `1.8rem`). Real example hit organically while writing test questions: *"What 8-bit Nintendo plumber's original arcade name was Jumpman before Nintendo of America's landlord inspired his rename?"* (150 chars, completely ordinary bar-trivia length — nothing pathological).
**Expected:** Text auto-shrinks to fit the box (that's the whole point of `autoFitText.js`).
**Actual:** Text visibly overflows the slide's dark box on both the top and bottom edges on a real render (screenshotted at 1280×720, a normal TV-ish 16:9 res) — the first word is clipped at the top, the last line clipped at the bottom.
**Suspected file:** `client/src/lib/autoFitText.js` (`fitToBox`), `QUESTION_BOX` const, consumed by `client/src/components/display/slides/QuestionSlide.jsx`.
**Root cause, already documented in code:** `fitToBox` has a self-acknowledged fallback (comment dated 2026-08-13): when no size in `[floorPx, ceilPx]` satisfies `maxLines` even at the floor, it renders at floor size anyway and logs a `console.warn`. The comment states this is real and known ("confirmed real: 1 of 1514 questions in the current DB hits this"). This is a deliberate, documented tradeoff — I'm not treating it as a hidden regression — but the **mitigation is invisible to Ben**: it's a `console.warn`, and per standing practice, Ben and family never open DevTools. The only human who could catch this before a show has no way to see the warning that exists specifically to warn them.
**Severity:** P1 — would embarrass mid-show (crowd sees clipped question text on the TV), and it's not rare: I wrote ~30 test questions and hit this on the first "medium-length" one.
**Not fixed:** Changing the floor/maxLines tradeoff, or how the warning surfaces, is a product decision about the shared text-fit system used by 6+ slide surfaces — flagging per the task's own guidance rather than guessing at a fix. **Recommended fix (not applied):** surface the same warning inside the host UI (e.g. a small "may not fit — shorten this?" hint on the Question Text field in `SlideEditor.jsx`, computed by calling `fitToBox` with the current text) so it reaches Ben instead of a console only he never opens.

---

## 2. Confused-me-as-Ben

- **`title` and `scoreboard-reveal` slide types exist in code/docs but have no card in the Add-Slide picker.** `AddSlideWizard.jsx`'s `TYPE_CARDS` only has 8 real entries (state-of-union, team-picker, round-intro, question, shiny-question, grading-break, winner-reveal, custom) + hidden team-preview. `title` and `scoreboard-reveal` are both real, fully-implemented `SlideRenderer` components with full writeups in SKILL.md's "15 slide types" table — but there is no way to add either one from the UI. `state-of-union` clearly superseded `title` as the real opener (matches the deck), and the S-hotkey `ScoreboardOverlay` clearly superseded `scoreboard-reveal` as the live scoring reveal. This is very likely intentional (old types left in place, never pruned) rather than broken — but the docs don't say so, and if Ben goes looking for either one expecting to find it in the wizard, he won't. Worth a doc note or a deliberate delete, not a UI fix.

- **`ScoreboardOverlay` is not actually full-screen** — SKILL.md and features.md both describe it as "full-screen dark overlay (rgba 0,0,0,0.92)". The real component (`ScoreboardOverlay.jsx`) is a deliberate 52%-width **right-side slide-in drawer** (`width: '52%'`, slides in via `x: '100%' → 0`), leaving the left half of whatever slide is live still visible underneath, dimmed. This reads correctly once you know it's meant to be a drawer, not a takeover — but the first time I hit `S` I thought the overlay had failed to render, because the docs promised a full blackout. Pure documentation drift, not a bug — the code is internally consistent and clearly intentional (explicit width + one-sided box-shadow + slide animation). Worth updating SKILL.md/features.md so the next person doesn't have the same "is this broken?" moment.

- **Round drag-reorder doesn't renumber the round.** I dragged Round 2's whole round-block above Round 1's in the sidebar. The show order updated correctly (Round 2's slides now play first) and I verified it survives a reload — but Round 2 is still titled "Round 2" and its question counters still read "R2" even though it's now literally the first round the crowd sees. Slide-level reorder auto-renumbers question labels (Q1/Q2 update live), but round-level reorder does not touch `roundNumber`/title. A host who reorders whole rounds pre-show will confuse the crowd with an out-of-sequence "Round 2, Round 1, Round 3" on screen. Worth a warning in the UI, or auto-renumbering on round drag, but it's a product decision (does Ben ever actually reorder whole rounds?) so I only flagged it.

- **Storage objects have no DELETE policy at all.** Every upload (Ben photos, question images) can be created via the anon-insert policy documented in SKILL.md, but there is no working DELETE path — I got a 403 from Supabase Storage even with a host-verified session trying to delete my own two test uploads. This means Storage will only ever grow; nothing the app does can clean it up, and my teardown couldn't fully finish (see below). Worth a Supabase-side policy addition (host_verified DELETE on `storage.objects`, mirroring the pattern already used for every other write-gated table) — flagged, not touched, since it's the same RLS-change category the task told me to leave alone.

- **`Add slide` from a round's own overview doesn't reliably insert at the end of that round when it's the last round and something else (winner-reveal) already follows it.** I used R5's "+ Add slide" to insert a throwaway Custom slide meant to land between the final grading-break and winner-reveal (per the task's specific edge-case ask). It actually landed *after* winner-reveal instead — I had to drag it into position manually afterward. Minor, but worth knowing if you ever build a show and expect a round-scoped "+Add slide" to always mean "right after this round's last slide."

- **Rapid back-to-back "Next ▶" clicks can silently drop one advance.** Clicking Next 3 times with no delay between clicks only advanced 1 slide once; adding ~500ms between clicks worked every time. I couldn't tell if this is a debounce guarding against double-advance (a feature) or a real bug, and I never saw host/display desync from it — just flagging the friction, since Ben does click fast during a live show.

---

## 3. Held up

- **Show creation, theme picking, and per-show font/color overrides** — all worked cleanly, including the live preview in the theme picker and confirmed-exact persistence (`theme_overrides: { fonts: { display: "Handters" }, colors: { text: "#ffcc00" } }`) matching what I set.
- **State of the Union, Team Intro, and all three normal rounds** (round-intro → 5 questions → grading-break with jukebox library) built without a single console error across ~15 slide-add operations.
- **Shiny question flow** — picking a real production format ("Time for a Close Up"), uploading a test image (verified 200 on the `trivia-show-media` Storage POST), and the series/multi-part mechanism (added a 2nd part to "Hear! Me! Roar!", confirmed it groups as one atomic unit in the sidebar, not two separate deletable rows) all worked exactly as documented.
- **Swing Round bulk-add (8 paired Q&A) and PYL bulk-add (3 themes → 3 `pyl-reveal` slides)** both worked cleanly and produced the right slide types.
- **Overlay editor landmines OV-1/OV-2/OV-3, all confirmed still holding, no regression:**
  - OV-1 (focus-steal): clicked Bold mid-text-edit on a freshly-created box — box survived, text intact.
  - OV-2 (stale-closure delete): created a second empty text box, Escaped out of it while empty — it was correctly discarded, and the *existing* overlay (with real text) was untouched, not reverted to a stale snapshot.
  - OV-3 (Escape scope): Escape while editing exited text-edit mode into "selected" (resize handles) without unmounting the whole SlideEditor.
  - Center H / Center V buttons store exact math (`x = 50 − w/2`), not eyeball-close, matching the documented drag-snap guarantee.
  - Undo/Redo (⌘Z / ⌘⇧Z) ran with zero console errors.
- **Slide reorder (drag within a round) and round reorder (drag whole round)** both persisted correctly through a full page reload — verified via direct DB read before and after.
- **Go Live picker** — jump-to-arbitrary-slide worked correctly (jumped straight to slide 37/39, a specific grading-break, from the collapsed round list).
- **Final-break jukebox-return jump, including the documented edge case** — with a throwaway Custom slide deliberately placed between the last grading-break and winner-reveal, navigating `/display?...&from=jukebox` jumped straight from the grading-break to the literal last slide (winner-reveal), silently skipping the custom slide in between — exactly as SKILL.md documents. Confirmed via `current_slide_id` before/after.
- **RT-1 (lightweight-write blank-TV landmine)** — 4 rapid `S` toggles plus an `A` toggle in a row, TV never blanked once. `/join` reconnected cleanly on reload too.
- **A/S hotkeys** — answer reveal and scoreboard overlay both fire correctly and instantly from the host's keyboard.
- **PYL Cards picker** — full-screen animated card reveal with confetti, correctly picked one random team from the 2-team roster.
- **Quick Entry (ScoreboardModal ⚡ mode)** — partial-name single-match auto-advance, multi-match disambiguation buttons, and garbage round-token rejection (stays on the same step, no crash) all worked correctly. Score save round-tripped and the S-overlay reflected the new total.
- **Winner Reveal** — despite the `teams`/`team_scores` RLS bug above, Winner Reveal computed and displayed the correct winner (drum roll → confetti → name → points) because it's actually wired to `scoreboard_teams` as its primary source (with `teams`/`team_scores` only as a legacy fallback) — this contradicts SKILL.md's "queries teams + team_scores" description (doc drift, not a bug) but means the real, current-gen scoring path works end-to-end.
- **Dev-server kill + restart mid-live** — killed the Vite process outright, restarted it, reloaded `/display`: recovered to the exact live slide (winner-reveal) with the correct computed winner, 0 console errors. Host and phone reconnect logic wasn't stressed further than this but showed no issue.
- **Teardown** — test show deleted via the UI's real two-step delete confirm (verified gone via direct query); both `scoreboard_teams` ZZTEST-AGENT rows and all 17 `questions` archive rows (auto-archived by slide creation) deleted and verified empty. The `teams` table needed no cleanup — it never got any rows, per the P0 above.

---

## Residual / needs Ben's manual action

Two Storage objects could not be deleted through the app (no DELETE policy exists on `storage.objects` at all — see finding above) and are still sitting in Supabase Storage:
- `trivia-show-media/show_hl3zXZ-Q/M6S1fJlHFK9t.png`
- `trivia-host-photos/show_hl3zXZ-Q/host-photos/MkfHxo0KIjlq.png`

Both are small (685 bytes, a solid-color test PNG) and clearly named under the now-deleted show's ID — safe to delete from the Supabase dashboard whenever convenient.

---

## Fixes applied (this branch, not pushed)

1. `e115506` — **ShowPicker New/Load buttons stick disabled forever on RLS auth failure.** `handleNew`/`handleLoad` in `Host.jsx` never reset `working` state on a thrown error (no try/catch), so an unauthenticated click on "+ New show" left the button permanently disabled with zero feedback until a full page reload. Added try/catch/finally + a friendly inline message pointing at the PIN gate. Verified by re-running the exact repro (unauthenticated click → error message appears, button re-enables).
2. `1ce3350` — **Shiny questions show a plain ❓ icon in RoundSidebar instead of ✨.** `slideLabel()` already special-cased `data.isShiny` for the text label, but the icon lookup used `SLIDE_TYPE_META[slide.type]` unconditionally — shiny questions are still type `'question'`, so the icon never picked up the shiny signal. Fixed the icon to follow `isShiny` the same way the label already does. Verified in the live sidebar (both shiny slides now show ✨).

Neither P0 nor the autoFitText P1 was code-fixed — both are flagged above with the reasoning for leaving them alone (RLS-change category, and a deliberate shared-system tradeoff respectively).
