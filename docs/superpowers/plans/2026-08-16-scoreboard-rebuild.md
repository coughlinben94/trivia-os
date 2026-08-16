# Scoreboard Rebuild — TV Grid + Phone Overtake Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the TV scoreboard (`ScoreboardOverlay.jsx`) into a real, dense, "Excel trivia scoreboard" style grid — every team, every round column, total, all visible at once, in this app's real brand (not the current hardcoded-amber pill layout). Rebuild the phone scores drawer (`Join.jsx`'s `ScoresDrawer`) with an "Overtake" bar treatment on its existing simple team+total data — no round data added to phone, that was explicitly rejected.

**Architecture:** Both surfaces already read from the same shared data helpers in `client/src/lib/scoreboardMath.js` (`deriveRoundCols`, `computeTotal`, `normalizeRoundScore`, `MEDALS`) — used by 4 surfaces total (host `ScoreboardModal`, TV `ScoreboardOverlay`, phone `Join`'s scores drawer, post-show `ShowDetail`). This plan only touches TV and phone rendering, not the shared math file, not the host editor, not `ShowDetail`.

**Tech Stack:** React + Framer Motion, same as the rest of this app's display/join surfaces.

**Confirmed with Ben (live, this session):**
- Ben rejected 3 earlier stylized single-total mockup directions (Podium/Overtake/Marquee) for the TV — his words: *"no not on tv either. tv is full. r1-5 and total alongside team name"* then *"take excel trivia scoreboard as a concept."* This means: **every round as its own visible column, not hidden pills, not a single big number.** "Excel" is a reference to the classic trivia-host convention of projecting a live spreadsheet — dense, legible, all-at-once — not a literal request to build spreadsheet software. Dress it in this app's real brand (per-show theme colors, Boogaloo/DM Sans), don't ship literal Excel chrome (gridlines-only, Calibri, etc).
- For the PHONE scores drawer specifically, Ben confirmed he wants the "Overtake" concept (one of the 3 rejected-for-TV directions) applied there instead: bar length as the score, comet-trail glow on the leader, an animated pass when ranks change. Phone data stays exactly what it already is — team name + total only, confirmed correct and NOT to be changed by adding round columns.

**Current state, read fresh before starting (this plan's summary may drift from the file by the time you read it — verify):**
- `client/src/components/display/ScoreboardOverlay.jsx` — TV. `ScoreboardContent` (~line 115) already computes `cols = deriveRoundCols(show)` and fetches ranked teams, but `TeamRow` (~line 9) renders round scores as small pill badges (`{col.label} {total}`) that are HIDDEN when a round total is 0 AND hidden below the `xl` breakpoint (`hidden xl:flex`) — i.e. round data is present in the code but not reliably visible, and even when visible it's not a real aligned grid column. Colors are hardcoded (`#fbbf24`, `rgba(251,191,36,...)` amber) instead of `theme.colors.*` — the ONE surface in this scoreboard system that doesn't already use per-show theme colors (the phone drawer already does).
- `client/src/views/Join.jsx`'s `ScoresDrawer` (~line 471) — phone. Bottom sheet, drag-to-dismiss, already uses real `theme.colors.*`, simple rank+medal+name+total rows, no round data (correct, keep it that way), no bar visualization yet.

---

### Task 1: TV scoreboard — real grid layout

**Files:**
- Modify: `client/src/components/display/ScoreboardOverlay.jsx`

- [ ] **Step 1: Read the current file in full, and read how it's actually triggered/shown on a live show** (`show.scoreboard_visible`/`showState.scoreboardVisible`, whatever host control flips that — search `LiveMode.jsx` or `useShow.js` briefly for context, don't change that triggering mechanism, just understand it).

- [ ] **Step 2: Replace the pill-based `TeamRow` with a real grid/table layout.**
  - Header row: team name column (widest), then one column per `deriveRoundCols(show)` entry (label from `col.label` — note labels aren't always "R1"/"R2", swing/PYL rounds get "SW"/"PYL", and there's always a trailing `bonus`/`'?'` column per `deriveRoundCols`'s own code — render whatever it actually returns, don't hardcode "R1" through "R5", the plan's own title is shorthand, not a literal spec), then a Total column.
  - Data rows: one per team, real aligned columns under each header (CSS grid or table, not a pill row) — every round's score visible for every team simultaneously, not hidden below a breakpoint, not hidden when zero (a 0 is real information — a team that scored nothing on a round should show "0", not vanish that column entirely for that row, since that breaks a spreadsheet's actual promise: a scannable rectangle where every cell means something).
  - Keep the existing rank/medal treatment (`MEDALS` array, top-team highlight) — that part is good, don't discard it, integrate it as the leading column same as today conceptually.
  - Keep the existing two-column layout for >8 teams (`useTwo`/`leftCol`/`rightCol`) if it still makes sense with real columns instead of pills — if a two-column grid layout gets genuinely awkward with N round columns each, it's fine to revisit that split logic, but don't silently drop the "handle a lot of teams without running off screen" concern that motivated it originally.

- [ ] **Step 3: Switch every hardcoded color to `theme.colors.*`.**
  Read `ThemeProvider.jsx`/`useTheme()` (already imported and used elsewhere in this file) for the exact token names available (`accent`, `highlight`, `text`, `bg`, etc. — check `references/themes.md` for the full list if unsure). Replace every `#fbbf24`/`rgba(251,191,36,...)` amber literal with the appropriate theme token so this scoreboard reskins correctly across all 21 per-show themes, matching how the phone drawer already does this correctly.

- [ ] **Step 4: Motion on score change.**
  When a team's total changes (a score gets updated while the scoreboard is visible — this can happen live), the affected row should get a real moment: a brief highlight/pulse and the number counting up rather than snapping to the new value. Check whether `ScoreboardContent`'s current `useEffect` (fetches once on `show.id` change, no realtime subscription) needs a realtime subscription added to actually see live updates while the panel is open — if the panel currently only ever shows a static snapshot from when it opened, decide whether adding live updates is in scope here or a separate concern, and say so clearly in your report rather than silently skipping motion because there's nothing live to react to yet.

- [ ] **Step 5: Verify build.** `npm run build` exits 0.

- [ ] **Step 6: Render and verify.** Real show, real scores, at least one show with >8 teams and one with normal team counts, at least 2 different per-show themes to confirm color theming actually works, not just one. Confirm every round column is visible for every team (no hidden-below-breakpoint, no hidden-when-zero).

---

### Task 2: Phone scoreboard — Overtake bars

**Files:**
- Modify: `client/src/views/Join.jsx` (`ScoresDrawer` function, ~line 471)

- [ ] **Step 1: Read the current `ScoresDrawer` in full**, including how `teams` (the prop it receives) is fetched/shaped by its caller (`openScoresDrawer`, ~line 1168) — confirm it's already just `{ id, name, total-ish shape }` with no round breakdown, and that this stays true (don't add round data to the fetch).

- [ ] **Step 2: Replace the plain rank+name+total rows with Overtake-style bars.**
  Bar length proportional to score (relative to the current leader's score, so the leader's bar is always full-width and others scale against it). Leader gets a comet-trail/glow treatment. When ranks change (a fetch returns a different order than last render — this drawer re-fetches each time it opens per the existing `openScoresDrawer` flow, check whether it also needs a realtime subscription while open, same question as Task 1 Step 4, decide and report), animate the pass — rows reordering with a real transition (Framer's layout animations, `layout` prop on the row `motion.div`, is the natural fit here since rows already have stable `key={t.id}`).
  Keep: drag-to-dismiss, the "is this my team" highlight, medal treatment, loading/empty states — this is a visual treatment change on top of existing behavior, not a rebuild of the drawer's mechanics.

- [ ] **Step 3: Verify build.** `npm run build` exits 0.

- [ ] **Step 4: Render and verify** — real show, multiple teams with different scores, confirm bar proportions read correctly (leader full-width, others scaled), confirm the "my team" highlight still works, confirm drag-to-dismiss still works.

---

### Task 3: Final review

- [ ] **Step 1:** `npm run build` clean.
- [ ] **Step 2:** Confirm neither task touched `scoreboardMath.js`, `ScoreboardModal.jsx` (host), or `ShowDetail.jsx` (post-show) — those 3 surfaces share the same math but are explicitly out of scope.
- [ ] **Step 3:** Commit (don't push) — leave for Ben's sign-off, same as every other display/motion change today.
- [ ] **Step 4:** Report back clearly: what the TV grid actually looks like (screenshots), what decision was made on live score-update motion (Task 1 Step 4 / Task 2 Step 2's realtime question) and why, before/after comparison.

## Explicitly out of scope

- `client/src/lib/scoreboardMath.js` — shared by 4 surfaces, not touched.
- `ScoreboardModal.jsx` (host-side scoreboard editor) — not touched.
- `ShowDetail.jsx` (post-show history view) — not touched.
- Any change to how/when the TV panel opens (`scoreboard_visible` trigger) or the phone drawer opens (`openScoresDrawer`) — presentation only, not the show-control mechanism.
