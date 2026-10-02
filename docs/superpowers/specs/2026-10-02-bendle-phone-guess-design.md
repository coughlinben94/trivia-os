# Bendle Phone Guess — Design (v2)

Date: 2026-10-02
Status: v2 after an independent spec critique and a catalog spike. Decisions below are the owner's. Awaiting final read before the build plan.

## Goal

Today a Bendle team writes its guess on paper and the host walks the room to read and score answers. Let teams pick or type the song on their phones and lock one guess. The app grades it automatically, and the reveal slide shows what every team guessed.

## Decisions (owner, 2026-10-02)

- Grade automatically, on **title plus artist where possible** (rule below).
- One guess per team for the whole Bendle (three step slides). The step live when the team locks sets its points: step 1 = 30, step 2 = 20, step 3 = 10 (`BENDLE_STEP_POINTS`). A wrong or missing guess scores 0.
- A team's lock is final for that team. The host's Unlock button clears the team guesses and reopens phone submissions, so a team that locked the wrong song can guess again.
- The reveal slide shows each team's guess.
- **No outside music service.** Spotify's policy ("Do not create a game, including trivia quizzes."), Apple's MusicKit license (§3.3.6(D)), the iTunes Search API (promotional use only, ~20 calls/min), Deezer and Last.fm (no commercial use) all rule out a live catalog. Teams search a song list we build once from Wikidata (CC0).
- The existing host-side Spotify song picker and the jukebox are not touched by this feature. (Their own policy risk is separate and unchanged.)

## Song list (catalog)

- A static file, `client/public/bendle-catalog.<version>.json`, built by `scripts/build-bendle-catalog.mjs` from Wikidata: songs, singles, musical works and recordings (Q7366, Q134556, Q105543609, Q55850593) that have a performer (P175) and at least 3 Wikipedia articles. Queries run one at a time and split by item type to stay under the SPARQL limit; the script sends a User-Agent with contact info; duplicates merge on normalized title+artist keeping the highest article count. Output: `[title, artist, rank]` rows, about 50-60k rows, ~0.6 MB gzipped (estimate; the spike's partial export was 413 KB for ~35k rows).
- Rank = Wikipedia article count (CC0). Search ranks by it.
- Refresh is a manual rerun a few times a year. No server, table, or API route is involved at show time. No credit line is required (CC0); a small "Song list: Wikidata (CC0)" footer is optional.
- Known gaps: very new songs and songs Wikidata lacks a performer for (e.g. Uptown Funk). The typed-guess path covers these.

## Rules

- A guess is `{ title, artist|null, source: 'catalog'|'typed', qid|null }`. A team either picks a catalog row (title and artist filled in) or chooses "Use what I typed" (title required, artist optional).
- **Grading — title plus artist where possible:**
  1. Title must match. Normalized guess title equals the normalized song `title`, `answer`, or any `aliases[]`, allowing a typo tolerance of at most floor(len/5) edits (Damerau-Levenshtein on the title with spaces removed, capped at 2; titles of 4 characters or fewer must match exactly). Never match when the normalized string is empty.
  2. If both the guess and the song have an artist, the artist must also match: normalized, split on `&`, `,`, `and`, `feat./ft./featuring`, any main artist matching, same typo tolerance, leading "the" ignored. A cover with the same title by a different artist therefore misses.
  3. If either side has no artist (a typed guess with the artist left blank, or a song row with no artist), grade on the title alone.
- Normalization: NFKD then strip accents; lowercase; "&" becomes "and"; remove bracketed text (`(Remastered)`, `[Live]`, `(feat. X)`); remove a trailing ` - …` tag only when spaced on both sides; remove `feat./ft./featuring …`; drop a leading "the "; remove punctuation; squash spaces.
- Points = the step value of the slide that was live when the team locked. A team that never locks scores 0. Teams see no correctness feedback until the reveal.
- The host can set any team's points by hand after the reveal: a per-team dropdown 0 / 10 / 20 / 30 (like Movie Chain), which also covers a team with no phone. Quick Entry is not used for Bendle once phone play is on, so written and phone points are never added twice.
- Songs need `answer` or `title` (always present) and should have `aliases` for alternate titles; the Bendle song editor prompts for aliases when a song has none. `spotify_id` is no longer used for grading.

## Phone board (`/join`)

- New `BendleBoard.jsx`, mounted for a live Bendle step slide, following `MovieChainBoard` / `WagerBoard`: ready screen, search, lock, locked state. It loads the catalog file once (prefetched when the team joins or when the board first mounts; cached by version).
- Search runs on the phone: a text box, ~100 ms debounce, word-prefix match on the normalized title and artist, top 8 results ranked by article count. Each row shows title and artist (no artwork). A "Use what I typed" row is always present, with an optional artist field.
- A preview shows "Your guess: Title - Artist". Lock In saves it and the board shows "Locked in at step N". The other two steps show the same locked state. If the phone is offline or the catalog fails to load, the typed path still works.
- One guess across three slides: the board treats any existing row for the team in the Bendle group as locked and calls `onAnswered(true)`, so a team locked at step 1 is not pinned to an open board on steps 2-3.
- During the host lock countdown the board shows "Lock in now" for a picked-but-unlocked guess; a guess that was not locked when the host locks scores 0.
- The 30-second "stepped away" lockout in `Join.jsx` must not strand a team that put the phone down during a long listening step; Bendle gets a longer grace or an exemption (decided in the plan against the lockout code).

## Integrity (database guard)

`phone_answers` is unique on (slide_id, team_id) and the Bendle group has three step slides with different ids. RLS only checks that the team owns the row, and slide ids are readable from the public `shows.slides`, so the UI alone cannot enforce one guess or the step. Following `supabase/migrations/20261001150000_movie_chain_block_locked_answers.sql`, a BEFORE INSERT/UPDATE trigger for Bendle step slides:

1. Rejects a write unless `shows.current_slide_id = new.slide_id` (kills back-dating a guess to step 1 and the stale-render race). The board shows "step moved on, tap again".
2. Rejects a write once the group is locked (the step-3 slide's `bendleLocked`).
3. Rejects a second row for the same team in the same Bendle group (grouped by `shinyGroupId`).
4. Rejects UPDATE, so the first lock is final. The board treats a duplicate or rejected second tap as success.

Because `submitted_at` is restamped on UPDATE, "earliest wins" is dropped. Forging the answer JSON only helps a team that already knows the song; accepted, like the rest of the app's client-side scoring. Unlock needs a host-only way to delete the group's rows for the reopened guess: a host-gated RPC (`host_verified` JWT claim) that deletes a Bendle group's `phone_answers` rows, since the table has no DELETE policy today.

## Lock, unlock, reveal (follows Movie Chain's split)

- Bendle is added to `PHONE_MECHANICS` (`client/src/lib/slideStepping.js`) with `lockFields: ['bendleLocked']`, `revealField: 'bendleRevealed'`, `clearFields: ['bendleResults', 'bendleLockedAt']`. The `guard` stays true on all three step slides so Join, remote, and host panes keep working. A new optional per-mechanic `lockHere(data)` (true only for `bendleStepIndex === 2`) is used by `pendingLockPhase`, `pendingReveal`, LiveMode's lock/Unlock/override panel, and `remoteFix`, so Next on steps 1-2 only advances and the lock countdown starts once, on step 3.
- Press order on step 3: play the clip, then lock, then reveal. `planHostCommand` and `nextPressGate` check pending audio before the lock phase for Bendle (today the lock is checked first, so the first Next on step 3 would lock before step 3's clip plays); `nextPressCue` follows. A test pins the order: land, play, advance, then on step 3: play, lock, A, Next.
- Lock writes only `bendleLocked` and `bendleLockedAt` (on the step-3 slide). It publishes no results, so nobody learns correctness early.
- A (answer reveal): on steps 1-2 refuses (the answer and vocals must not appear while phones are open); on step 3 it grades the rows (`.in('slide_id', stepIds)`, found by `shinyGroupId` + `bendleStepIndex`, never by slide order), applies host overrides, publishes `bendleResults` and `bendleRevealed` together, upserts scores idempotently keyed to the step-3 slide id (never a row's own slide id), and plays the vocals. `ShinyBendleQuestion` reveals when `show.answer_reveal || data.bendleRevealed`.
- Unlock (host): clears `bendleLocked`, `bendleLockedAt`, `bendleResults`, deletes the group's `phone_answers` rows via the host RPC, reopens submissions, and rescoring rebuilds results. An Unlock after the reveal also clears the revealed flag.
- Replay protection: a locked step 3 is protected when re-entered from a sibling step via Prev/Next, so replaying an earlier step cannot reopen submissions. Jump and goLive protections carry over from the existing logic.
- `lockHandlersRef`, `scoreActionFor`, the fix-busy map, and `runHostCommand` error routing in LiveMode are hand-written per-mechanic lists and each gets a `bendle` entry; the iPad remote/relay lock and rescore commands must be wired the same way.
- The dead `bendle_answer_counts` database view is replaced by a group-wide submission count, or removed.

## Reveal slide and host view

- The TV lists every team: team name, the song guessed (title and artist), the step it was locked at, ✓/✗, and points. Correct teams first, ordered by step, then the rest; no guess shows "No guess". Up to about 10 teams in one column, then two columns; text no smaller than ~2.2vmin at 1280x720. Phones show the team's own guess, its result, the step, and points.
- The host pane shows "N of M locked" during play and a per-team table after the reveal with the points dropdown override.
- Reveal list is drawn from `bendleResults` on the step-3 slide, not from raw rows.

## Rules card change

- The Bendle card changes after the round-2 rules-cards PR (#33) merges: action "Search the song on your phone and lock in your one guess.", scoring keeps the 30/20/10 step rule plus "Right song and artist.", and the answer-sheet visual becomes a phone search mock. Doc and tests follow; stale comments in `bendleScoring.js` (header: "not auto-scored"), `shinyWizardKinds.jsx`, and `BendleExplainer.jsx` (aria-label) are updated.

## Files (expected)

- New: `scripts/build-bendle-catalog.mjs`, `client/public/bendle-catalog.<version>.json`, `client/src/lib/bendleGuessScoring.js` (+ test: normalization, title/artist match, typo tolerance, step points, overrides, idempotent score updates), `client/src/lib/bendleCatalog.js` (+ test: load, word-prefix search, ranking), `client/src/components/join/BendleBoard.jsx` (+ test), a Supabase migration (trigger + host delete RPC).
- Changed: `slideStepping.js` (mechanic entry, `lockHere`), `Join.jsx`, `LiveMode.jsx`, `hostCommands.js` / `nextPressGate` / `nextPressCue` / `remoteFix`, `ShinyBendleQuestion.jsx` (reveal), `BendleAdmin.jsx` (alias prompt), `shinyExplainers.js` + `BendleExplainer.jsx`, `references/shiny-rules-card.md`, SKILL.md notes.
- Removed from the previous design: the public search route, `getSpotifyToken` use, artwork, `spotify_id` grading.

## Non-goals

- Live Spotify/Apple/iTunes/Deezer/Last.fm lookups; free-form partial credit; hints; wrong-guess penalties.
- Changing Bendle audio, step order, or the host's song and offset editor.
- Showing correctness before the reveal.

## Verification

- Unit tests as listed above plus the search test against 15 typed queries ("mr bright", "bohemian rhaps", "dont stop believ", "africa toto", "mr blue sky", ...).
- Component tests: board search, typed path, lock across steps, offline catalog, rejected second write, step-moved-on message.
- Database tests for the trigger (live-slide only, no write after lock, one row per team per group, no update) and the host delete RPC, run against a local or branch database before touching production.
- Stepping tests: lock only on step 3, press order (play, lock, A, Next), A refuses on steps 1-2, Unlock clears, replay protection, jump/goLive.
- Browser: isolated harness for the board at 375/390/430 phone widths and the reveal list at 1920x1080 and 1280x720 with 3 and 20 teams; then a two-device rehearsal before a show.

## Risks and open items

- Wikidata has no performer for some well-known songs; typed guess plus host override cover it. Coverage of the owner's real picks is unknown until the build runs: spot-check the next 20 Bendle picks.
- Artist matching can false-negative on catalog-versus-song-row spelling ("Daryl Hall & John Oates"); the host override and the title-only fallback (artist blank) cover it.
- The catalog is ~0.6 MB per phone on first load (CDN cached, versioned filename).
- Wikidata's catalog export needs a User-Agent with contact info; the existing `api/_lib/wikidata.js` header lacks one (separate fix, flagged).
- Songs the host adds by hand upload have no artist: title-only grading applies and the editor prompts for aliases.
