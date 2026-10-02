# Bendle Phone Guess — Design

Date: 2026-10-02
Status: decisions agreed in chat; awaiting written-spec review before planning.

## Goal

Today a Bendle team writes its guess on paper and the host walks the room to read and score answers. Let teams search Spotify on their phones, pick the song, and lock one guess. The app grades it automatically, and the reveal slide shows what every team guessed.

## Decisions (from the owner, 2026-10-02)

- Grade automatically.
- Each team gets one guess for the whole Bendle (three step slides). The step that is live when the team locks sets its points: step 1 = 30, step 2 = 20, step 3 = 10 (`BENDLE_STEP_POINTS`). A wrong or missing guess scores 0.
- A team's lock is final for that team. The host's existing Unlock button reopens phone submissions (every phone-locked question already has one; Bendle gets it from the shared mechanics table).
- The reveal slide shows each team's guess.

## Rules

- A guess is one Spotify track chosen from search results on the phone. Free text is not accepted.
- Correct = the picked track's Spotify ID equals the Bendle song's `spotify_id`, OR its normalized title plus main artist equals the Bendle song's. Normalization strips case, punctuation, and trailing version tags such as "- Remastered 2011", "- Single Version", "(Remastered)", "(Deluxe)". It does not strip "Live", "Acoustic", "Cover", or "Karaoke": those are different recordings and do not score.
- The host can mark any team right or wrong by hand after the reveal (per-team override, same pattern as Wager/Movie Chain). Manual points still work through Quick Entry.
- Points are the step value of the slide that was live when the team's answer was saved. A team that never locks scores 0.
- Teams see no feedback about correctness until the reveal.

## Phone board (`/join`)

- New `BendleBoard.jsx`, mounted for a live Bendle step slide, following the existing boards (`MovieChainBoard`, `WagerBoard`): ready screen, search, lock, locked state.
- Search: a text box with a 350 ms debounce, at least 2 characters, a list of up to 8 results showing artwork, title, and artist. Tapping a result selects it; the team can reselect before locking.
- Lock In saves the answer and shows "Locked in at step N". The other two step slides show the same locked state, so a team cannot guess twice.
- Answer shape in `phone_answers.answer`: `{ spotifyId, title, artist, artworkUrl }`. The `slide_id` of the row records the step.
- One guess across three slides: the board reads the team's rows for the Bendle group's step slides. If a row exists, it shows locked. Scoring takes the single row for the team; if more than one exists (a race or stale rehearsal data), the earliest `submitted_at` wins.
- If search fails, the board says so and shows a retry button. The host falls back to paper and Quick Entry.

## Search endpoint

- New public route, a twin of `api/movie-chain.js`: no login, a 5-minute in-memory cache, a minimum query length, and a limit of 8 results. It uses the same `getSpotifyToken()` client-credentials helper as the host route.
- Returns metadata only: `spotifyId`, `title`, `artist`, `artworkUrl`.
- The host-only `api/spotify-search.js` is unchanged.
- Abuse limit: the cache plus the length floor are the guard, as for Movie Chain. A Vercel firewall rate limit can be added later if needed.

## Lock, unlock, and reveal flow

- Registered in `PHONE_MECHANICS` (`client/src/lib/slideStepping.js`) as a mechanic with lock fields and a reveal field, so fresh-entry reset, jump protection, `pendingLockPhase`, and Unlock all work from the one table.
- Submissions stay open across steps 1, 2 and 3. The host lock happens once, after step 3 and before the reveal, using the standard Next-press lock countdown on the last step slide. Next on steps 1 and 2 only advances. The plan must confirm how `pendingLockPhase` handles a mechanic that locks only on the group's final slide.
- Host Unlock reopens submissions for the group and clears the scored results so rescoring rebuilds them.
- On the host's answer reveal, the app grades every saved row, applies host overrides, writes points to the scoreboard (idempotent, like the other mechanics), and plays the vocals as it does today.

## Reveal slide

- After the reveal, the TV lists every team: team name, the track guessed (title and artist), the step it was locked at, a ✓/✗, and points. Correct teams first, ordered by step, then the rest; teams with no guess are listed as "No guess".
- Phones show the team's own result: the track it picked, correct or not, the step, and points.
- Layout follows the TV size rules used by the rules cards (large type, never color alone, text no smaller than ~2.2vmin, up to the room's team count without scrolling; for rooms too large, two columns).

## Rules card change

- The Bendle rules card copy changes from "No phone entry. The host checks answers by hand." to a phone-entry version: the action becomes "Search the song on your phone and lock in your one guess." and the scoring lines keep the 30/20/10 step rule. The answer-sheet visual becomes a phone search mock. The doc and tests follow. This ships after the in-flight round-2 rules-card PR merges.

## Files (expected)

- New: `client/src/components/join/BendleBoard.jsx` (+ test), `api/spotify-guess.js` (name set in the plan), `client/src/lib/bendleGuessScoring.js` (+ test): normalization, matching, step points, override, idempotent score updates.
- Changed: `client/src/lib/slideStepping.js` (mechanics table), `client/src/views/Join.jsx` (dispatch), `client/src/components/host/LiveMode.jsx` (lock countdown, scoring, Unlock, override UI), `client/src/components/display/slides/ShinyBendleQuestion.jsx` (reveal list), `client/src/lib/shinyExplainers.js` and `BendleExplainer.jsx` (card copy), `references/shiny-rules-card.md`, SKILL.md notes.
- No new table. `phone_answers` already holds one row per (slide, team) with a JSON answer.

## Non-goals

- Free-text answers, partial credit, hints, or wrong-guess penalties.
- Changing how Bendle audio plays, step order, or the host's song and offset editor.
- Showing correctness before the reveal.

## Verification

- Unit tests: normalization (remaster tags stripped, live/cover not), ID match, title+artist match, step points by slide, earliest-row-wins, never-locked = 0, host override, idempotent rescoring, malformed or altered rows score 0.
- Component tests: board search/lock/locked state across steps, failed search, one-guess enforcement.
- Endpoint tests: input validation, cache, shape.
- Stepping tests: fresh-entry reset, jump protection, Unlock.
- Browser check on the isolated harness at 1920x1080 and 1280x720 (reveal list with many teams), phone width 375/390/430, and a real two-device pass before use in a show.

## Risks and open items

- Spotify catalog variants (remasters, deluxe, regional releases) have different IDs; the normalized title+artist fallback and the host override cover these. Acceptable misses: live and cover versions.
- Teams could look the song up elsewhere while the mix plays. The mix is audible to the room either way; not a design goal to prevent.
- Spotify client-credentials rate limits under a full room searching at once: the cache and debounce reduce this; confirm in the plan with a load estimate.
- The `bendle_songs` row must have `spotify_id` set for ID matching; songs without one fall back to title+artist only. The editor should warn when a selected song has no `spotify_id`.
