# BREAK IT — Adversarial Pre-Show Hunt, Trivia OS

**Paste this whole file as the first message to a fresh Claude Code session in
`~/Projects/baynes-trivia/trivia-os`.**

---

## 0. Situation

Trivia OS runs a live trivia night at Baynes Apple Valley. **The next show is
TONIGHT.** A real crowd, three TVs off one HDMI splitter, a Stream Deck, and
twenty-odd phones on `/join`. There is no staging night and no rollback window
once doors open.

The last 48 hours put roughly 100 commits on `main` — a Rules slide with real
audio, a WarpTransition rewrite, error boundaries around every display overlay,
a jukebox ring-world transition, phone-side wager and matching boards, score
locking, team reauth tokens, a PWA install prompt on `/join`, and a pile of
"fix the fix" commits on top. Three of those commits are literally titled *fix
the regressions the previous commit introduced*. That is the shape of a build
that is about to fail in front of people.

**Your job is to find the failures first.** Not to admire the architecture, not
to tidy anything, not to suggest refactors. Find what breaks the show.

---

## 1. Hard constraints — read twice

1. **REPORT ONLY. Do not change code.** No commits, no edits, no branches, no
   `git stash`, no reverts. Your entire output is a report. Ben decides what
   gets fixed with the hours he has left.
   - The one exception: throwaway scratch files under `/tmp` for your own
     analysis. Never inside the repo.
2. **Production Supabase is `qwtbgusqfoypvehnungr` (Baynes Trivia).** Confirm
   that in `client/.env.local` before you touch anything. `dreggwinegtirxxanntv`
   is a different business and has already caused a production 404 once.
3. **Read-only against prod, with one carve-out:** you may create ONE throwaway
   show whose title starts with `ZZTEST-BREAKER`, register throwaway teams on
   it, and delete all of it when you are done. You may read any table, any RLS
   policy, any row.
   - **Never** modify, delete, or go live on a real show.
   - **Never** write to the `questions` archive except rows your own test show
     auto-created, which you then delete.
   - **Never** apply a migration or change an RLS policy. If a policy is wrong,
     say so in the report with the exact SQL you would run. Do not run it.
4. **Never `git push`.** Never touch `main`'s pointer.
5. **Ben sometimes runs a second Claude session on this same working directory.**
   If you see commits you did not make, a moved branch pointer, or staged files
   you did not stage — that is the other session, not corruption. Do not "fix"
   it. Note it and move on.
6. **Stop and ask** rather than guess if a check would touch real show data.

---

## 2. Fire these skills before anything else

Per `CLAUDE.md`, non-negotiable:

- `using-superpowers` — first, every session
- `trivia-os` — the project blueprint, plus its `references/`
- `systematic-debugging` — before you write up any bug
- `verification-before-completion` — before you call a finding confirmed
- `dispatching-parallel-agents` — you will want this, see §6

Read in this order, and read them properly, not skimmed:

1. `SKILL.md` (repo root)
2. `references/build-state.md`
3. `references/slides.md`
4. `references/features.md`
5. `references/useshow.md`
6. `references/display-architecture.md`
7. `references/ring-world-mistakes.md` — especially "eight instruments have
   lied on this project"
8. `AUDIT.md` — the full ledger of past findings and their IDs
9. `SIM-REPORT.md` — the 2026-08-16 field-test sim, still has open P0/P1
10. `docs/dress-rehearsal.md` — the physical-rig checklist, and a map of which
    bug classes have actually bitten

**Then distrust all of it.** These docs have drifted from reality repeatedly and
say so about themselves. `build-state.md` opens by admitting it lags. `SKILL.md`
describes `ScoreboardOverlay` as full-screen; it is a 52% right-side drawer.
`SKILL.md` says Winner Reveal reads `teams`/`team_scores`; it reads
`scoreboard_teams`. Treat every doc claim as a hypothesis with a line number
attached. **Code and live DB are the only sources of truth. A doc that
contradicts the code is itself a finding.**

---

## 3. What changed recently — your risk surface

Do this first, before any theorizing:

```bash
git log --since="2026-08-15" --pretty=format:"%ad %h %s" --date=short
git log --since="2026-08-15" --name-only --pretty=format:"--- %h %s"
git diff --stat HEAD~40 HEAD
```

Recent, hot, and thinly tested:

| Area | Why it worries me |
|---|---|
| **Rules slide** (`RulesSlide.jsx`, `d46edc9`, shipped hours ago) | New slide type with two real MP3s (`rules-beep.mp3`, `rules-psa.mp3`) and a continuous strobe. Autoplay policy, audio that never stops, GPU rule violations, reduced-motion. |
| **Error-boundary batch** (`881db17`) | Wrapped every display overlay. Already produced two live-TV regressions (`67b3399`, `724608d`). A boundary that catches wrong hides the crash instead of containing it. |
| **WarpTransition** (`WarpTransition.jsx`) | Black-frame bugs fixed twice in two days (`315272d`, `724608d`, `1791702`). |
| **Advance race** (`157c153`, `6dd05e3`) | ArrowRight now defers `nextSlide()` 280ms when the answer is revealed. ArrowLeft cancels the pending timer. This is a hand-rolled race guard on the single most-pressed key of the night. |
| **Phone answers: wager + matching** (`WagerBoard`, `MatchingBoard`, `phone_answers`, `scores_locked_at`) | Whole new write path from untrusted phones, with lock-then-read ordering that has already been fixed once (`d934c2d`, `57e96ca`). |
| **Team reauth tokens** (`create_reauth_token`, `redeem_reauth_token`, `LateTeamPopover`) | SECURITY DEFINER RPCs that rewrite a team's owner session. Reauth has no undo. |
| **Jukebox ring-world / Event Horizon** (`StationRingLayer`, `LiveScreen`) | Merged same-day, three bugs found by review immediately after. Sits on the grading-break path every round uses. |
| **`/join` PWA prompt** (`c7a3be2`) | New manifest + install prompt on the surface twenty strangers hit at once. |
| **Uniform text sizing sweep** (`ef1dd78`, `f7ddb51`, `157c153`) | Grading-break text was 2.45× too wide until today. `autoFitText` has a known documented overflow fallback (see §5). |

---

## 4. The landmine catalogue — verify each one still holds

These are documented failure modes with IDs. Every one has recurred at least
once. Confirm each is still fixed on current `main`, and say so explicitly in
the report — "still holding" is a useful answer.

- **RT-1 (P0, blank TV).** Supabase Realtime omits unchanged TOASTed columns
  from UPDATE payloads. Every real show's `slides` JSONB is TOASTed. A
  lightweight write (`answer_reveal`, `scoreboard_visible`, `scores_locked_at`)
  delivers a row with **no `slides` key**. Any consumer that does
  `setShow(payload.new)` instead of merging nulls `currentSlide` and blanks the
  TV mid-question. `/display` and `/join` must merge, never full-replace.
  **Every new Realtime-synced field needs the same discipline — check whether
  `scores_locked_at`, wager state, and matching state got it.**
- **Two independent show shapes.** `Display.jsx` spreads raw Supabase rows;
  `useShow.js` runs `normalizeShow()`. New columns must be threaded through
  both by hand. Find every column added since 2026-08-01 and check both paths.
- **Serialized debounced writes.** `updateSlide` chains writes on
  `slidesSaveChainRef` because concurrent Supabase `UPDATE`s resolved out of
  order and silently overwrote newer data with older — every request returning
  204 the whole time. `WagerBoard` and `MatchingBoard` claim to apply the same
  pattern to `phone_answers`. **Verify that claim, do not take it.**
- **OV-1 focus-steal.** Toolbar controls must `preventDefault()` on
  `pointerdown` or an in-progress text edit blurs, commits empty, self-deletes.
- **OV-2 stale closure.** Create/delete/duplicate must use functional `setState`
  or deleted overlays resurrect and persist as empty ghosts.
- **OV-3 Escape scope.** Inline edit must `stopPropagation()` or Escape
  unmounts the whole `SlideEditor`.
- **OV-4 measure against the stage, not the viewport.** An overlay stored at
  `x:37` measures `38.9` against the browser viewport. That gap is 16:9
  letterboxing, not drift. Any "position is off" claim must be re-measured
  stage-relative before you believe it — including your own.
- **RLS-D-1.** The TV browser must have **no** host PIN session. The jukebox
  return path advances the show through the anon `advance_show` RPC
  (`supabase/migrations/20260706001000`, restricted by
  `20260716000000_advance_show_restrict_step`). A PIN'd TV browser masks this
  failure completely. Test un-PIN'd, in a clean profile.
- **SEC-1.** `verify-host-pin`: 4 digits, unsalted SHA-256, no rate limit, no
  lockout. Confirm whether that is still true. Do not attempt to brute it.
- **SEC-2.** `teams` UPDATE policy was `USING (true) WITH CHECK (true)` for
  `public` — any phone could rewrite any team's row. Check current
  `pg_policies`. `20260806190000_team_owner_uid_rls.sql` may or may not have
  closed it.
- **SIM P0 — `teams` INSERT blocked by RLS.** As of 2026-08-16, `/join`
  registration returned `42501` for anon **and** for host-verified sessions.
  **This is the single highest-stakes thing to check tonight.** If it is still
  broken, nobody's phone can join and the show has no scoring. Verify by
  actually registering a team on your `ZZTEST-BREAKER` show from a clean
  browser profile — not by reading the policy and reasoning about it.
- **PREV-1.** Clicking the winner-reveal slide in Build Mode must not play the
  drum roll out loud.
- **Storage has no DELETE policy.** Uploads only accumulate. Confirm; it is a
  cleanup problem, not a show-stopper.

---

## 5. Where to attack — concrete scenarios

Do not just read code. Drive the app. Playwright and `playwright-cli` are
available; `npm run dev` runs Vite locally, and prod is
<https://trivia-os.vercel.app>.

### 5.1 The Stream Deck under a nervous thumb

Ben presses fast, under stage lights, while talking to a room.

- ArrowRight three times with zero delay. Does it advance three slides or one?
  (The sim saw one. Nobody knows if that is a debounce or a dropped advance.)
- ArrowRight with the answer revealed, then ArrowLeft inside the 280ms window.
  Then Right again inside the same window. Then hold Right down (auto-repeat).
- A, S, R hammered during a slide transition, and during a WarpTransition.
- Cmd+A, Cmd+R, Cmd+S, Alt+Tab while a question is on screen. The modifier
  guard exists because a plain select-all once revealed an answer to the room.
  Try to find a modifier combination that still leaks through.
- Keys pressed while focus sits in the score panel, the theme picker, the
  scoreboard modal, a `contenteditable` overlay. Then keys pressed after a
  modal closes — does focus return somewhere that eats them?
- Stream Deck keys while the host window is **not** focused. What happens then?

### 5.2 The TV

- Un-PIN'd fresh profile at `/display`. Full run: pre-show → questions →
  grading break → jukebox → return → rounds → final break → winner reveal.
- Blank-stage hunt: after every overlay toggle, is slide content still there?
  Any blank frame is RT-1 class and is a show-stopper.
- Kill the network for 15s mid-question. Restore. Does the TV recover to the
  right slide or wedge?
- Reload the TV tab mid-show. Reload it during a transition. Reload it during
  the jukebox handoff.
- Non-16:9 viewport, and a 4K TV scaling. `bb4b227` fixed a ring background gap
  on non-16:9 — verify it and look for siblings.
- Do the error boundaries actually contain? Force a render throw in one overlay
  (a malformed `overlays` JSONB on your test show — string instead of array,
  nulls, a missing `type`) and check the rest of the stage survives. Then check
  the boundary does not swallow a crash that should have been loud.
- Rules slide: does the beep/PSA audio stop on slide change? Does it stop on
  step-back? Does it stack if you bounce in and out? Does autoplay work on a TV
  browser that has had no user gesture yet? Does the strobe respect
  `prefers-reduced-motion`, and does it animate anything other than `transform`
  and `opacity`?

### 5.3 The phones — twenty strangers, mixed hardware

- Register from a clean profile. Twice with the same name. With an empty name.
  With 200 characters. With emoji. With leading/trailing whitespace. With
  a name that differs from another only by case (the own-team highlight
  normalizes case — does registration?).
- Register **after** the show has gone live. After the final break.
- Wager board: submit, change tier, submit after lock. Submit from two tabs at
  once as the same team. Submit a range ("12-15"), "$5", "1,200", "412 wings",
  a negative, `1e9`, an empty string. Check `parseWagerNumber` against the
  scoring code, and check what the host sees when zero teams answered — there
  is a manual override for that refusal (`ce20353`); make it misfire.
- Matching board: submit partial, submit duplicates, submit after lock, drop
  the connection mid-submit.
- **The lock race:** the code locks before reading `phone_answers` because the
  old order let a late write land after the read. Try to beat it. Submit at the
  instant the host locks. Two teams, one late.
- Reauth: create a token, redeem it, then redeem it again. Redeem it from a
  different phone. Redeem an expired one. Redeem one for a team that already
  reauthed. Reauth has no undo — this is the one that quietly steals a team's
  identity.
- Kill the app (background the tab / lock the phone) for two minutes, come
  back. Session recovery from localStorage. Then clear localStorage and come
  back.
- Landscape. Small screens. The PWA install prompt — does it cover anything
  it should not, and does it fire mid-question?

### 5.4 Scoring and the scoreboard

- Quick Entry: `1`, `SW`, `PYL`, `?`, `M`, garbage tokens, a round token that
  matches two columns, a partial team name matching three teams.
- `deriveRoundCols` against a show with reordered rounds. **The sim found that
  dragging a round does not renumber it** — Round 2 dragged first still reads
  "R2" on the counter. Follow that into the scoreboard columns: does the score
  land in the column the host thinks it does?
- Enter a score, kill wifi, enter another. The failure toast is UX-2. Confirm
  it fires on the host and that nothing error-ish reaches a TV.
- Negative scores, decimals, huge numbers, a pasted string.
- Delete a team that already has scores. Delete a round that has scores.
- Winner reveal with zero scored teams, with a tie for first, with a
  three-way tie, with one team.

### 5.5 The build surface (Ben will be editing at 6pm)

- Add a slide to the last round when a winner-reveal already follows it. The
  sim saw it land **after** winner-reveal.
- Reorder a shiny series — it must move as one atomic unit.
- Drag a round; check numbering, counters, and scoreboard columns after.
- Overlay editor: OV-1 through OV-4 above, plus undo/redo across a slide
  switch, and undo after a delete.
- Long question text. The known `autoFitText` fallback renders at floor size
  and overflows the box when no size satisfies `maxLines` — the code itself
  says "1 of 1514 questions in the current DB hits this." **Find out how many
  questions in tonight's actual show hit it.** That is a concrete, answerable,
  high-value number. Query the show, run the same fit math, list the offenders
  so Ben can shorten them before doors.
- Paste from Word (curly quotes, PUA bullet glyphs). `4c1de99` strips some —
  find what it misses.
- Import/export round-trip a real show. Duplicate a show. Delete a show that
  is live.

### 5.6 Whole-show dry run

Build a full `ZZTEST-BREAKER` show that mirrors tonight's shape: opening beats,
Rules slide, State of the Union, Team Intro, 3–5 normal rounds with grading
breaks, a swing round, a PYL round, a wager question, a matching question,
final break, winner reveal. **At least 15 slides with real-length question
text** — RT-1 only manifests once `slides` is big enough to TOAST.

Then run it end to end, at speed, with a TV tab and a phone tab open, and
try to wreck it.

---

## 6. Method

- **Parallelize the reading, serialize the judging.** Fan out subagents across
  independent surfaces (display, phones, scoring, build, backend/RLS,
  jukebox/ring). Have each return findings with file:line and a repro. Then
  verify every finding yourself before it reaches the report. A subagent's
  claim is a lead, not a fact.
- **Every finding needs a repro someone else can run.** Exact clicks, exact
  keys, exact slide type, exact data. "Might race" is not a finding.
- **Instruments lie on this project** — `ring-world-mistakes.md` names eight of
  them. Screenshots of a scaled canvas, viewport-relative measurements, console
  warnings that fire in dev only, `console.log` ordering under React 18 strict
  mode. Confirm through a second, different instrument before you believe a
  surprising result.
- **A passing HTTP status is not a passing write.** The serialized-write bug
  returned 204 on every request while losing data.
- **Distinguish "I read this and it looks wrong" from "I ran this and it broke."**
  Label every finding as CONFIRMED (you reproduced it) or SUSPECTED (code
  reading only). Do not blur them. A hallucinated P0 six hours before a show
  costs Ben more than a missed P2.
- **Do not fix.** When you catch yourself about to edit, write the fix into the
  report as a diff-in-prose instead.

---

## 7. Prioritize by "what does the crowd see"

- **P0 — the show stops or visibly fails.** Blank TV, phones cannot join,
  scoring loses data, host cannot advance, audio that will not stop, a crash
  with no recovery.
- **P1 — visibly wrong in front of people.** Clipped question text, wrong
  scores on screen, an answer revealed early, a stuck overlay, wrong winner.
- **P2 — Ben notices, the crowd does not.** Host-side friction, bad error
  messages, editor bugs, cleanup debt.
- **P3 — cosmetic or theoretical.**

**Rank by (probability tonight × visibility), not by how interesting the bug
is.** A boring `teams` RLS policy outranks an elegant race condition that needs
two phones to submit inside the same 8ms.

---

## 8. Deliverable

Write `BREAK-IT-REPORT-2026-08-18.md` at the repo root. (That file is your only
write inside the repo. Do not commit it.)

Structure:

1. **Verdict, in three lines at the top.** Is this build safe to run tonight —
   yes, yes-with-workarounds, or no? If workarounds, list them as things Ben
   can do rather than things someone must code.
2. **The pre-doors list.** Ranked, with a time estimate each. What to fix in
   the hours available, in order. Be honest about what does not fit.
3. **P0 findings.** Each with: what breaks, CONFIRMED/SUSPECTED, exact repro,
   file:line, blast radius, and the smallest safe fix you would make.
4. **P1, P2, P3** in the same format, shorter.
5. **Landmines re-verified.** The §4 list, each marked still-holding /
   regressed / could-not-test, with how you tested.
6. **Doc drift.** Every place `SKILL.md` or a reference file contradicts the
   code, with the correction.
7. **What you could not test**, and what it would take. Say this plainly.
   Silence here reads as coverage you do not have.
8. **In-show workarounds.** If X breaks mid-show, do Y. Written for someone
   holding a microphone, not a keyboard.

Then delete your `ZZTEST-BREAKER` show, its teams, its `scoreboard_teams` rows,
its `phone_answers` rows, and its auto-archived `questions` rows. Verify each
is gone with a direct query. List any Storage objects you could not delete
(there is no DELETE policy) so Ben can clear them from the dashboard.

---

## 9. What success looks like

Not a long report. A report where every P0 is real, every repro works on the
first try, and Ben can read the top three lines and know whether to run the
show on this build.

If you find nothing above P2, say that plainly and show your work — that is a
legitimate and valuable outcome. Do not pad the list to look thorough.

**Start now. Read `SKILL.md` first.**
