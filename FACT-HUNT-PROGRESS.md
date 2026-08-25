# Fact Hunt Progress — 2026-08-23

Run agent id: `fact-hunt-2026-08-23`
Mode: full round, 100-fact target. **Inline execution** — this run is a forked subagent with no Agent/Task-tool access, so Track 1 and Track 2 ran single-threaded rather than as 2-3 parallel subagents per track as the command specifies. Noted in final report; actual fact count will fall well short of 100 as a result.

## Resume check
- No live/dead `fact-hunt-<date>` round today. Only today-dated rows are `agent='fact-hunt-migration'` (377 rows, one-time legacy backfill, not a real round — doesn't match the round-agent pattern, and is hours stale regardless).
- No collision. Fresh round.

## Taste Profile (read 800 rows of `questions`, ids 1-~800 range via 4x LIMIT 200 batches)

### Topic fingerprint (rough bucket of the 800 read, by recurring category)
- Film/TV: ~20% — heavy on Disney parks/deep-cuts, MCU/superhero trivia, 80s-2020s films, sitcom deep-cuts (Office, Seinfeld, SpongeBob)
- Music: ~18% — one-hit wonders, band-name origins, Grammy/RRHOF trivia, classic rock, country, Michigan bands (Verve Pipe)
- History/military ops: ~10% — WW2 op code names, Cold War, Wild West, ancient history
- Sports: ~12% — MLB/NFL/NBA records, "only team whose name ends in a vowel"-style superlatives, Michigan teams (Tigers)
- Geography/travel: ~10% — national parks, "smallest/remotest" superlatives, Michigan towns
- Words/etymology: ~8% — compound words, archaic terms, "shares its name with"
- Horror/myth/legend: ~7% — cryptids, hauntings, classic monster movies
- Food/drink/brands: ~6% — fast food history, cocktails, brand mascots
- Michigan/local: recurring anchor across every domain above, not a separate bucket — Saginaw, Tigers, MSU/UofM, Shorts/Founders breweries, UP/Yooper culture
- Games/toys/misc records: ~5% — Toy Hall of Fame, board games, "onlys/firsts"
- Records/onlys/misc: scattered throughout as the connective tissue, not its own bucket

### Reference universe (recurring wells)
Michigan/Saginaw anchors (Tigers, MSU/UofM, Sault Ste Marie, Beaver Island, Shorts/Founders/Bell's breweries), Disney park deep-cuts (ride history, Imagineering trivia), classic rock/one-hit-wonder music trivia, WW2 operation code names, MCU/superhero lore, 80s-90s sitcoms (Office, Seinfeld, Full House-adjacent), horror-movie/cryptid lore, house lore (Ben, dad Shawn, the Coughlins), NFL/MLB/NBA record trivia.

### Anatomy stats (confirmed from corpus, matches trivia-questions.md exactly)
- Hook quotes appear on roughly 35-40% of standalone questions — e.g. "Ow! My Patella!" (Wounded Knee), "Stayin alive, stayin alive!" (pulsar), "It looks like you're writing a letter" (Operation Paper Clip)
- "shares its name with…" bridge phrasing extremely common — dozens of instances (Colossus, Astoria, Squib, Cannonball, Maverick)
- Trailing winks less frequent in this batch but present — sound-effect asides, parenthetical jokes

### Answer-familiarity range
Typical (by-ear, whole-bar): Kit Kat, The Cars, Frankenstein, Denver, Dairy Queen, Wrigley Field, Alcatraz.
Deep-cut (route, not destination-obscure): Operation Paper Clip, Colossus, Squib, Pandemonium, Hugo Strange, Manticore.

### Answer-frequency (2+ repeats, hard-avoid this session)
word/visual/audio/n/a are format-label artifacts, not real answers — filtered out. Real repeat answers: Bonnie and Clyde, Holy Grail, Seattle Mariners, Aerosmith, I Spy, Kevin Bacon, Montreal, Denver, Fabulous, Jack in the Box, Philadelphia Eagles, Bill Hader, Horses, Happy Days, Queen, Dragon, Little Drummer Boy, Clown, Jack Nicholson, Mad Hatter, Robin Thicke, Colossus, Steamboat, San Antonio Spurs, Frosty, Anthony Hopkins, Poison, Doom, Jack Sparrow, Sid — plus the skill's known list (Ludicrous, Apothecary, Headless Horseman, Kenny Loggins, Regina George, Jack Nicholson).

### Gap read (thin spots — extra quota target)
Science/nature pure (non-animal) facts, words/etymology, food/drink/brands beyond fast-food-history, and non-Michigan-US geography (world capitals, world records) all read thinner than film/TV/music/sports in this batch — matches PYL agent's independent finding of a geography/food gap this session. Weighted Track-1 quota toward these.

## Dedupe corpus
Live union query run at hunt start (bank `questions.answer` + `fact_hunt_entries.answer`) — checked per-candidate during hunting, not re-pasted here.

## Wave log
- Wave 1 (Track 1 inline, mixed domains): 12 facts drafted, 4 caught as exact dedupe collisions against the `fact-hunt-migration` legacy backfill (wombat cube-poop, narwhal/unicorn, octopus 3-hearts, Nepal flag) and deleted before commit.
- Wave 2 (Track 1 inline, replacements): 3 facts (boxing ring, Twinkies myth, honey-never-spoils) added to replace the deleted 4.
- Final: 11 facts committed to `fact_hunt_entries` under agent `fact-hunt-2026-08-23`. Track 2 did not run — no yt-dlp installed (YouTube off in `agent-reach doctor`) and OpenCLI's Reddit backend needs the Browser Bridge Chrome extension, not connected in this fork's environment.

## Round closed short of 100-fact target
Inline single-threaded execution (no Agent/Task-tool subagent dispatch available to this fork) can't reach the dual-track parallel throughput the command assumes. 11 verified facts delivered as an honest partial round rather than fabricating volume. Recommend Ben rerun `/fact-hunt` from the normal (non-forked) session so it can dispatch the real 2-3-subagents-per-track parallel waves.

---

## CONTINUATION — same 2026-08-23 round, new session with full Task/Agent access

Run agent id for everything from here: `fact-hunt-2026-08-23-2`. Prior run's 11 rows (agent `fact-hunt-2026-08-23`) are NOT re-researched — they count as this round's starting tally (11/100) per the resume-check's "legitimate partial result, already flushed" rule. `agent-reach doctor --json` now reports youtube: ok (yt-dlp) and reddit: ok (OpenCLI). Track 2 is live.

Taste Profile above (topic fingerprint, reference universe, anatomy stats, answer-familiarity, gap read) is reused as-is — same session/date, still fresh. Not redone.

### Canonical domain wheel for THIS run's inserts (per command spec's 10-domain wheel)
History · Science/Nature · Sports · Music · Film/TV · Geography · Food/Drink/Brands · Words/Etymology · Michigan/Local · Records/Onlys/Firsts/Misc
(Legacy bank also contains "Games/Toys" and "Literature/Comics" as ad hoc extensions outside the spec's wheel — flagged in Phase 5 report as pre-existing drift, not reproduced by new inserts unless a candidate is unambiguously games/toys, in which case reuse "Games/Toys" to match precedent rather than mis-bucketing it.)

### Domain-deficit baseline (Phase 1 topic fingerprint compressed onto the 10-domain wheel, summing to 100)
Film/TV 19 · Music 17 · Sports 12 · History 10 · Geography 10 · Words/Etymology 8 · Food/Drink/Brands 6 · Science/Nature 5 · Michigan/Local 5 · Records/Onlys/Firsts/Misc 8

### Wave log (continuation)
- Wave 1: Track 1 x3 (Film/TV 10, Music+Records 12, Science/Nature+Geography 14 = 36) + Track 2 x2 (Film/TV+Music+History 7, Records+Geography 8 = 15). 51 facts flushed to `fact_hunt_entries` under `fact-hunt-2026-08-23-2` (1 fixed post-insert: Cleveland/Balloonfest myth-bust entry only had 1 source, added Case Western Reserve's Encyclopedia of Cleveland History as second source). `fact_hunt_sources` scoring updated for both existing (Half As Interesting, Wendover Productions) and 10 newly-discovered Track 2 sources.
  - **Reddit was NOT actually usable this session** despite `agent-reach doctor --json` reporting `status: ok` for reddit — OpenCLI's browser-bridge backend errored (`BROWSER_CONNECT`, Chrome extension not connected) on every retry across both Track 2 subagents, no `rdt-cli` fallback installed. Track 2 ran YouTube-only both waves so far. Flag for Phase 5: doctor-vs-runtime-reality contradiction.
  - Running tally: this run (fact-hunt-2026-08-23-2) = 51. Combined round (+ prior 11) = 62/100. Track 1 total 47/70 (23 remaining). Track 2 total 15/30 (15 remaining).
- Wave 2 dispatch (in flight): Track 1 x3 (Sports 8; History 5 + Food/Drink/Brands 5; Words/Etymology 5 = 23) + Track 2 x2 (Film/TV 3 + Music 3 = 6; Records/Onlys/Firsts/Misc 3 + History 4 + Sports 2 = 9) — deficit recomputed against full 439-row bank, same top-3 deficit domains as wave 1 (Film/TV, Music, Records/Onlys/Firsts/Misc).
- Wave 2 never landed in Supabase (checked 2026-08-24: only the wave 1 51 rows + prior 11 exist under this round's agents). Round left at 62/100, incomplete — not resumed by this session, see quick-mode entry below instead.

---

## `/fact-hunt quick` — 2026-08-24, agent `fact-hunt-quick-2026-08-24`

Requested run: N=10, inline (no subagent dispatch needed for this size), to sanity-check the new Blinders-off gate + prominence check added to the command spec today. Track 1 only (web/Wikipedia), Taste Profile reused as-is from 2026-08-23 above.

**Result: 8 of 10 delivered.** Quality-over-quota — several strong-looking candidates were rejected, not padded around:
- **Already in the bank/dedupe corpus** (caught by per-candidate `ilike` check against `questions` + `fact_hunt_entries`, not a guess): Kellogg's Corn Flakes, The Slinky, the word "Nice," narwhal/unicorn, Assassin's Creed.
- **Failed the new prominence check** before it went any further: Vernors' Civil War-barrel origin story — true, but too well-worn a piece of Michigan lore (leads its own Detroit Historical Society page) to count as a deep cut.

**Delivered (all `fits='regular'`, 2 sources + 1 bridge each):**
1. Zebra — 2025 Ig Nobel (zebra-striped cattle repel flies) + zebra crossing etymology (Slough, 1951)
2. Adobe — company named after Adobe Creek + the word's ~4,000-year Egyptian→Coptic→Arabic→Spanish journey
3. Ian Fleming — WWII's Operation Ruthless (staged plane crash to steal Enigma codebooks) before he created James Bond
4. Worcestershire sauce — Lea & Perrins' forgotten cellar barrel + modern Bloody Mary/Caesar salad crossover
5. Dropkick Murphys — named for wrestler/rehab-sanatorium operator John "Dropkick" Murphy + The Departed/Bruins crossover
6. Pittsburgh Steelers — only NFL team with a one-sided helmet logo (Rooney oversight) + it's literally the U.S. steel industry's "Steelmark" emblem
7. Space Shuttle Enterprise — Star Trek fan letter campaign renamed it from "Constitution"
8. Cashew — raw shells carry the same urushiol as poison ivy (and mango), never sold in-shell

Verified in Supabase post-insert: all 8 rows non-null on domain/answer/fact/bridges/sources/fits/staleness/origin (`select ... where agent = 'fact-hunt-quick-2026-08-24'`), zero dedupe collisions. Fact browser UI has the entries.

**Read on the new gates:** they worked as intended and cost real yield — roughly half of researched candidates this round were rejected for being too circulated or already banked, not for being false. That tracks with the point of "Blinders off." Full round would need proportionally more research volume to hit 100 at this bar.
