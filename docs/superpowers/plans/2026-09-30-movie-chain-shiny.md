# Movie Chain Shiny Question Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a guided movie-to-movie shiny question with a hidden final performer connection and 15/10/0 scoring.

**Architecture:** A Vercel route wraps Wikidata search and cast lookups. Pure shared code validates and scores submitted QID chains. The existing shiny registry, phone answer row, host lock/reveal state machine, and scoreboard bucket carry the question through the four Trivia OS views.

**Tech Stack:** React 18, Vite, Vitest, Vercel functions, Supabase JS, Wikidata MediaWiki API.

**Spec:** `docs/superpowers/specs/2026-09-30-movie-chain-shiny-design.md`

---

### Task 1: Wikidata lookup boundary

**Files:** Create `api/_lib/wikidata.js`, `api/movie-chain.js`, `api/_lib/wikidata.test.js`; create `client/src/lib/movieChainApi.js`.

- [ ] Write tests first for QID rejection, search results filtered to films, cast+voice claim extraction, year/label disambiguation, upstream timeout/failure, and neutral rejection when `check` is asked about the fixed destination. The fixture for a film has `claims.P31` containing `Q11424`, `claims.P161` containing a performer QID, and `claims.P725` containing a voice performer QID.
- [ ] Run `npx vitest run api/_lib/wikidata.test.js`; confirm expected missing-module failure.
- [ ] Implement `searchMovies(query, fetcher)`, `getMovieCast(movieId, fetcher)`, and `checkMiddleCredit(movieId, personId, destinationId, fetcher)` in the library. Use `wbsearchentities` then `wbgetentities`, QID allowlists, `AbortSignal.timeout`, bounded result counts, and an in-process short cache. `checkMiddleCredit` returns `{kind:'destination'}` before any cast lookup when `movieId === destinationId`.
- [ ] Expose `GET /api/movie-chain?action=search|cast|check` with a stable JSON error shape; the client wrapper handles non-2xx and request cancellation.
- [ ] Run the targeted test and `npm run build`; commit this task.

### Task 2: Chain rules and scoring

**Files:** Create `client/src/lib/movieChainScoring.js`, `client/src/lib/movieChainScoring.test.js`.

- [ ] Write failing tests for answer shape `{movies:[A,...,B], performers:[P1,...]}`, fixed endpoints, one performer per edge, no repeated QIDs, count including endpoints, shorter-than-announced=15, announced=15, announced+1=10, longer/invalid=0, and every submitted edge rechecked. Include a case where the final edge succeeds but an earlier edge is invalid.
- [ ] Run `npx vitest run client/src/lib/movieChainScoring.test.js`; confirm red.
- [ ] Implement `scoreMovieChainSubmission(answer, {startId,endId,announcedCount,castByMovie})` returning `{valid,finalConnected,movieCount,points,reason}`. Missing cast data throws a lookup error instead of producing a wrong-answer verdict. Add `computeMovieChainScoreUpdates` as a thin `applyPhoneScoreUpdates` call.
- [ ] Run the targeted test; commit this task.

### Task 3: Format and host authoring

**Files:** Modify `client/src/components/host/FormatLibrary.jsx`, `client/src/lib/shinyWizardKinds.jsx`, `client/src/components/host/AddSlideWizard.jsx`, `client/src/components/host/SlideEditor.jsx`; create `client/src/components/host/MovieChainEditor.jsx`; add a seed migration under `supabase/migrations/` through `supabase migration new`.

- [ ] Write failing registry/editor tests: Movie Chain creates one blank `question` slide with `shinyInputSchema.type === 'movie-chain'`; endpoint searches store QIDs+labels+years; same endpoint and missing/invalid count show a host-facing error; generic answer input is absent.
- [ ] Run those targeted Vitest files; confirm red.
- [ ] Add Movie Chain to `FIXED_SHAPE_KINDS` and `INPUT_TYPES`, seed the format with a stable ID, and mount `MovieChainEditor` in the right rail. Use the shared API wrapper for endpoint search and cast-count readiness. Preserve the right rail as slide content.
- [ ] Run targeted tests and build; commit this task.

### Task 4: Phone chain builder

**Files:** Create `client/src/components/join/MovieChainBoard.jsx` and its test; modify `client/src/views/Join.jsx`, `client/src/lib/shinySeries.js`, `client/src/lib/slideStepping.js`.

- [ ] Write failing UI tests for choosing a current-film performer, typed global middle-film search, a valid middle connection, a rejected middle connection, a neutral destination result, undo, no repeat, max announced+1, Lock In persistence to `phone_answers`, reload restore, host lock freeze, and no verdict before reveal.
- [ ] Run `npx vitest run client/src/components/join/MovieChainBoard.test.jsx`; confirm red.
- [ ] Add `isMovieChainShiny`, register one lock/reveal pair in `PHONE_MECHANICS`, and render the board in `Join`. Keep both endpoints, count, and chain visible. Save only a complete QID answer; use the same confirmed-upsert pattern as `PinBoard` and a neutral error when lookup fails.
- [ ] Run targeted tests; commit this task.

### Task 5: Host lock, reveal, scoreboard, TV

**Files:** Modify `client/src/components/host/LiveMode.jsx`, `client/src/components/display/slides/QuestionSlide.jsx`; create `client/src/components/display/slides/ShinyMovieChainQuestion.jsx` and tests; update host command tests as needed.

- [ ] Write failing tests for lock-only cutoff, late-answer exclusion, A-key validation of all edges, result+reveal publication in one slide update, scoreboard fold-in only after reveal, lookup failure leaving reveal pending, retry idempotence, and team-specific phone/TV result visibility. Verify that no result or score is written before reveal.
- [ ] Run targeted tests; confirm red.
- [ ] Add a Movie Chain lock handler that persists `movieChainLockedAt`. Add an async A-key reveal handler that reads the frozen submissions, fetches unique movie casts, computes results, writes `movieChainResults` and `movieChainRevealed` together, then applies idempotent score updates. A failed lookup leaves the reveal flag false and reports a retryable host error. Add a host-only correction control for a disputed post-reveal credit and reapply that slide's score bucket.
- [ ] Render a large TV endpoint challenge before reveal and one valid submitted chain plus 15/10/0 counts after reveal. Phones use their result row only when `movieChainRevealed` is true. Respect reduced motion, the display safe area, and the shared easing definitions.
- [ ] Run targeted tests and build; commit this task.

### Task 6: Integration and documentation

**Files:** Update `SKILL.md` and relevant `references/` entries; add or update a focused end-to-end test under `e2e/` if a test show is available.

- [ ] Run all targeted Movie Chain tests and `npm run build`; inspect failures and fix only linked defects.
- [ ] Run `npm run test:unit` outside the restricted sandbox so relay suites can bind localhost. Confirm totals and investigate failures.
- [ ] Exercise host setup, phone submission, host lock, A reveal, and scoreboard fold-in in a local or throwaway-show environment. Do not alter a real show.
- [ ] Inspect `git diff --check`, `git status`, and the final diff against every spec section; document any external-data limitations. Commit the integration changes.
