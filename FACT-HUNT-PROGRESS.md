# Fact Hunt Progress — 2026-08-26

Run agent id: `fact-hunt-2026-08-26`
Mode: full round, **120-fact pace-setter (Ben doubled it 8:26p — Track 1: 84, Track 2: 36; per-domain cap scales to ~18)**. Normal session, full Agent-tool dispatch confirmed.

## Resume check
- No rows in `fact_hunt_entries` for `round_date = current_date` — fresh round, tally 0/60.
- No sibling live run. No collision.

## Preflight (Phase 0)
- yt-dlp 2026.08.19 — version OK, real smoke test OK (`ytsearch1:test` returned a result). YouTube UP.
- agent-reach doctor: youtube ok, reddit ok — reddit smoke test initially FAILED (`BROWSER_CONNECT`; OpenCLI extension was disabled in Chrome). Ben re-enabled it 8:10p; re-smoke-test PASSED (`opencli reddit search "trivia"` returned live results). **Reddit UP.** Track 2 runs all three platforms.
- Podcasts: not separately smoke-tested (only required if both yt+reddit fail; YouTube is up).
- Subagent dispatch: throwaway agent returned OK. Dispatch UP.
- Phase 0 reads done: references/fact-hunt/trivia-questions.md, dispatching-parallel-agents SKILL, agent-reach SKILL + video.md.

## Bank distribution (fact_hunt_entries, status <> 'tombstoned', pulled 8:01p — 202 rows)
Geography 33 · History 25 · Music 24 · Science/Nature 23 · Words/Etymology 23 · Film/TV 20 · Games/Toys 18 · Michigan/Local 13 · Food/Drink/Brands 11 · Sports 11 · Records/Onlys/Firsts/Misc 1

## Taste Profile (merged 2026-08-26 from 4 parallel corpus readers, ~1,580 substantive rows read in full)
Coverage note: slices ids 339–867, 597–1119, 1120–1620, 1621–2138; ids 1–338 unread (one reader drifted); four slices converged — new pages stopped teaching.

### Topic fingerprint — BASELINE for deficit math (domain → % of substantive corpus)
| Domain | Baseline % |
|---|---|
| Film/TV | 32 |
| Music | 19 |
| History | 8 |
| Sports | 8 |
| Records/Onlys/Firsts/Misc (incl. cryptids/folklore/internet) | 7 |
| Geography | 6 |
| Michigan/Local (as primary; garnishes far more) | 5 |
| Food/Drink/Brands | 5 |
| Games/Toys | 4 |
| Science/Nature | 3 |
| Words/Etymology | 3 |

Onlys/firsts/records is also a MODE: ~40% of all questions carry an only/first/last/most frame.

Sub-obsessions: Disney/Pixar + parks (single deepest well); classic rock (Beatles, Zeppelin, Petty, supergroups, RRHOF induction classes); one-hit wonders + band-name origins; Grammy/Oscar/Razzie record-book; WW2 (op code names, oddities); cryptids/paranormal/folklore (signature well: Mothman, Amityville, Dogman); MLB/Tigers + team-name origins; national parks + superlative geography; dead retail + brand-mascot lore + breweries; cocktail lineage; retro Nintendo/board games; The Office (deepest sitcom well), Star Wars, LOTR/GoT as garnish; voice-actor crossovers; ranked-list-as-authority (Rolling Stone/Guinness/AFI cited in ~1 in 5).

### Reference universe (wells that score bonus points)
Michigan/Saginaw: Tigers ('84 battery, Zumaya), MSU/UofM, Frankenmuth, Mackinac, Flint (Grand Funk, Corvette), Bay City (Madonna, ? and the Mysterians), Saginaw businesses (Stable Ski Shop, car washes, dead retail), UP/Edmund Fitzgerald, Leland/Leelanau, Cedar Point, Michigan breweries (Shorts, Stroh's, Dark Horse, Frankenmuth). House lore: Shawn (Santa, PBR, couch), Carlee, Aunt Mary, Baynes itself, first-person Ben asides. Institutions: RRHOF, Grammy/Oscar record-book, Rolling Stone lists, IMDb, Guinness, Toy Hall of Fame, national parks, this-week deaths/news.

### Anatomy stats (for wave-merge judgment)
- Hook cold-open: ~15–40% by slice (themed shows cluster them) — quote/SFX/interjection, never explained, often secretly a clue.
- Trailing wink: ~10–30% — ellipsis aside sneaking one more hint or joke.
- "Shares its name with…": ~5–15% — THE workhorse bridge verb. "You could ask X…" / "If you're [artist]…" second-person bridge: ~3–8%.
- The real signature: the unmarked second clue — nearly every question stacks a second independent route.

### Texture habits
~60% contain a digit, ~35% a year; texture numbers are load-bearing ("8,795 cans," "159 quintillion"). Median ~35–40 words, 2-sentence shape: fact → pivot + second clue. Ellipses ARE his dash (em-dash rare). ALL-CAPS SFX, stutter opens, self-interruptions, direct address. Proper nouns as texture even when not the answer.

### Answer-familiarity + FACT-DEPTH BRACKET (paste into every subagent prompt)
Typical answers (by-ear, whole bar): Kit Kat, The Cars, Pink Floyd, Morgan Freeman, Shrek, Atari, Alcatraz, TGI Fridays, Abbey Road, Justin Timberlake.
Deepest-cut answers (still familiar-destination via a second route): Fountains of Wayne, DJ Pooh, Gilgamesh, Them Crooked Vultures, Bluestreak, Powerline, ? and the Mysterians.
EASY FLOOR (reject — table half-knows): rickrolling origin, MythBusters tested the Titanic door, Tom was everyone's first Myspace friend, Paul barefoot on Abbey Road, backwards-masking = Zeppelin.
GENUINE DEEP CUT (the accepted bar): Apollo 17 carried 4 mice named Fe/Fi/Fo/Fum; WW2 Navy built dedicated ice-cream barges; Tiffany's set the US silver standard (92%, 1837); HTTP error 451 = blocked for legal reasons (Fahrenheit 451); Gretzky was babysitting Robin Thicke when traded; Johnny Cash attacked by his ostrich Waldo (5 broken ribs); Andras Toma, last WW2 POW repatriated (2001).

### Gap read (thin in bank relative to what plays — overflow quota targets)
Hard science/space/inventions (pop-bridged), food-as-cuisine (vs brand lore), words/etymology as destination (wordplay is everywhere as method), international geography/history, hip hop/R&B, soccer/hockey/Olympics, women as answer subjects, visual art/architecture, post-2010 gaming, Michigan-as-entrée (it's mostly garnish).

### Current fact_hunt_entries share (202 active rows) vs baseline → deficits
Film/TV 9.9% (deficit +22) · Music 11.9% (+7) · Records/Misc 0.5% (+6.5) · Sports 5.4% (+2.6) · all others at/above baseline (Geography +10 over, Science +8 over, Words +8 over).
Track 2 wave-1 floor: top-3 = Film/TV, Music, Records/Misc (60%); remainder tier = Sports (40%).

## In-flight wave state
- Phase 1 corpus study: 4 subagents DISPATCHED (rows 0-500 / 500-1000 / 1000-1500 / 1500-2000) + 1 dedupe-export agent (scratchpad dedupe-answers.txt / dedupe-angles.txt / repeat-answers.txt)
- Separately (not fact-hunt): 3 concept generators running (PYL / shiny / swing) on Ben's ask.

## Wave log
- **Wave 1 — DISPATCHED 8:28p (not yet flushed):**
  - T1-A (Track 1, Film/TV + Music, quota 8)
  - T1-B (Track 1, History + Sports + Records/Onlys/Firsts/Misc incl. cryptids, quota 8)
  - T1-C (Track 1, Science/Nature + Words/Etymology + Food/Drink/Brands + international Geography, quota 8)
  - T2-D (Track 2 YouTube, Film/TV 4 + Music 2, quota 6)
  - T2-E (Track 2 Reddit/podcast/+Secret Base YT, Sports 4 + Records/Misc 2, quota 6)
  - Wave quota: 36. Dedupe list frozen at scratchpad/dedupe-answers-frozen-w1.txt (1,926 answers). Shared spec: scratchpad/wave-spec.md.
  - T1-A RETURNED 8:47p: considered 24 / self-rejected 15 / failed verification 1 / returned 8 (edge 0) → merge-gate: 0 collisions, 0 bounced, **8 accepted** (Maleficent accepted w/ angle-adjacency note: bank has Haunted Mansion answer, different route; Jim Cummings = shallowest cut per hunter). Held for wave flush. Also: Norm Peterson first-name fact held back under-sourced — rescuable next wave.
  - T1-B RETURNED 8:55p: considered 30 / self-rejected 21 / failed verification 1 / returned 8 (edge 0) → merge-gate: 0 exact collisions, 0 bounced, **8 accepted** w/ flags: Bigfoot ≈ bank answer "Sasquatch" (synonym answer, different angle — Ben's call); Elmo's Tickle-Me-Elmo bridge collides with used bank answer (flag bridge, primary fact fresh). Held for flush.
  - T2-D RETURNED 8:58p: considered 14 / self-rejected 7 / failed verification 1 / returned 6 (edge 0) → merge-gate: 0 collisions, 0 bounced, **6 accepted** w/ flags: Ratzenberger bridges (Cheers+Pixar+voice-acting) angle-near-match bank's "Cheers" question — primary lawsuit fact is fresh; Michael Moore verified via court opinion + CBS + Copyright Office (no Wikipedia coverage exists — institutional-grade, noted); Chumbawamba fee is a $70–100k range per sources. Per-source: RnR True Stories 4/3, Law School Data 3/3, GameSpot Universe 1/0, Music Files 0/0 (unfindable), exploratory Twenty Thousand Hertz 1/0. Held for flush.
  - T2-E RETURNED 9:05p: considered 24 / self-rejected 18 / failed verification 0 / returned 6 (edge 0) → merge-gate: 1 cross-batch collision (Detroit Tigers, vs T1-B) resolved by re-anchoring the Disco Demolition entry's answer to "Disco Demolition Night" (event is the by-ear destination; fact/bridges unchanged); Sherlock Holmes accepted w/ angle flag (bank has Loch Ness/Loch Ness Monster on cryptid route; primary route = film-prop discovery). **6 accepted.** Per-source: r/todayilearned 14/4, Secret Base 4/2, r/interestingasfuck 1/0, NSTAAF 0/0 (RSS teasers only — transcription not spent this wave), Tifo + PMT not pulled.
  - T1-C RETURNED 9:15p: considered 40 / self-rejected 32 / failed verification 0 / returned 8 (edge 1 — "quiz" shape-edge myth-bust) → 0 collisions, 0 bounced, **8 accepted** (tulip-festival bridge on Netherlands is adjacent to bank's tulip-mania answer — minor, noted).
- **Wave 1 FLUSHED 9:20p — CONFIRMED: `select count(*)` = 36 rows, 36 distinct answers, agent fact-hunt-2026-08-26.** Tally 36/120.
- Wave 1 counters: `wave 1 (both tracks, all domains): subagents 5 / quota 36 / considered 132 / self-rejected 93 / failed verification 3 / returned 36 / bounced 0 / accepted 36 / edge 1`. Accept rate 100% (36/36 returned).
- Source scoring applied: RnR True Stories 5/4 (film-tv .925), Law School Data 4/4 (1.0), Secret Base 4/2 (sports .815), GameSpot 2/1 (.7), r/todayilearned 14/4 → **DEMOTED** (28.6% < 30% rule), r/interestingasfuck .42, Twenty Thousand Hertz added (exploratory, 1/0). Music Files unfindable via ytsearch — candidate for retirement.
- Model note: wave 1 hunters ran on Fable 5 (session-inherited). Ben asked to "switch to Fable 5" — already the case; wave 2 stays Fable 5.
- **Wave 2 — DISPATCHED 9:22p (not yet flushed):** same 5-slice shape, dedupe file dedupe-answers-frozen-w2.txt (1,962), deficits recomputed (238 active rows): top-3 still Film/TV +19.8 / Music +6.8 / Records +4.9, Sports +0.4 the only other positive. T2 floor: Film/TV 4 + Music 2 (YouTube), Sports 4 + Records 2 (Reddit/podcast/Secret Base).
  - T1-B RETURNED 9:35p: considered 22 / self-rejected 14 / failed verification 0 / returned 8 (edge 1, shape-edge Chupacabra — no taste waiver consumed) → 0 collisions, 0 bounced, **8 accepted** (Rose Bowl: bank has "Rose Bowl Parade" on broadcasting angle; 1902 game fact is a different route — noted). Prominence rule killed Fielder 319-HR near-miss. Held for flush.
  - T1-C RETURNED 9:40p: considered 24 / self-rejected 16 / failed verification 0 / returned 8 (edge 0) → 0 collisions, 0 bounced, **8 accepted** (Grape-Nuts adjacency: bank has Kellogg's/Battle Creek answers — Post side of same feud, different answer, noted). Spares cut at quota: Dave Thomas GED, Energizer/Duracell bunny (verified-adjacent, rescuable). Held for flush.
  - T2-E RETURNED 9:48p: considered 24 / self-rejected 18 / failed verification 0 / returned 6 (edge 0) → **1 BOUNCED at merge**: Ty Cobb entry = wave 1's flushed "Detroit Tigers" 1912 strike fact (same event, different answer — cross-track duplicate). **5 accepted** w/ flags: Pokémon answer-fresh (bank uses it heavily as bridge domain only); Bubba Smith's Hightower bridge grazes bank #419 (primary steel-marker fact fresh). Guinness-seizure sub-claim correctly dropped (404). Per-source: r/TIL-via-search 8/4, Secret Base 3/1, r/EndDemocracy 1/1, r/baseball exploratory 2/0.
  - T1-A RETURNED 9:55p: considered 18 / self-rejected 10 / failed verification 0 / returned 8 (edge 0) → 0 collisions, **8 accepted** incl. Norm rescue (transcript + IMDb sourcing landed) and Dolly Parton death — **verified real by orchestrator via WebSearch (NPR/NBC/Variety/CNN, d. 2026-08-25)** before flush. Tim Curry also died 8/25 but is a frozen answer — bridge-use only.
  - T2-D RETURNED 9:58p: considered 28 / self-rejected 22 / failed verification 0 / returned 6 (edge 0) → 1 flag ("Mr. Brightside" — bank has The Killers as answer; song answer distinct), **6 accepted**. Law School Data + I Want My 80's Back unfindable via ytsearch this wave (same failure as Music Files — flag all three for retirement review). Per-source: RnRTS 3/1, Country Cast 4/1, GameSpot 13/4, Company Man 1/0.
- **Wave 2 FLUSHED 10:05p — CONFIRMED: count = 71 rows, 71 distinct answers.** Tally 71/120.
- Wave 2 counters: `wave 2 (both tracks, all domains): subagents 5 / quota 36 / considered 116 / self-rejected 80 / failed verification 0 / returned 36 / bounced 1 / accepted 35 / edge 2`. Round accept rate 71/72 = 98.6%.
- Wave 2 source scoring applied. r/todayilearned recovered to 36% lifetime (still demoted — spec has no promotion path; flag for Ben). New: r/EndDemocracy 1/1, r/baseball 0/2. GameSpot survived demotion check (33.3%).
- **Wave 3 (first dispatch) KILLED ~10:10p — all 5 subagents terminated by session usage limit (reset 10pm Detroit). Nothing returned, nothing lost from the table (71 rows safe). Partial leads recovered: Kingsford/Michigan (T2-E), dedupe kills Guthrie/Dropkick/Departed (T2-D). Re-dispatched post-reset as wave 3b, same slices.**
- **Wave 3b — DISPATCHED post-reset (not yet flushed):** NOTE: machine slept twice mid-wave, killing T2-E (Michigan) twice — resumed via SendMessage both times; `caffeinate -is` now holds the Mac awake for the rest of the round.
  - T1-A RETURNED: considered 23 / self-rejected 15 / failed verification 0 / returned 8 (edge 0) → 0 collisions, **8 accepted** (Stevie Wonder answer-fresh — bank only bridges him on "Harmonica"; Blair Witch $60K-budget viral claim correctly killed in-verification; Rocky Horror prominence caveat noted — record is lead-paragraph, never-pulled mechanics are the deep layer). Held for flush.
  - T1-B RETURNED: considered 26 / self-rejected 18 / failed verification 0 / returned 8 (edge 0) → 0 collisions, **8 accepted** (Colosseum ≠ bank's two "Colossus" answers — noted; Conan Doyle adjacent to w2's Sherlock Holmes entry, different answer/fact; Taft = wave's 2nd myth-bust). Held for flush. Wave 3 running tally: 16.
  - T2-E sleep-killed a 3rd time (Wikipedia MCP rate-limited, falling back to curl) — resumed again; told to return a short verified batch rather than run long. deficits recomputed (273 active): top-3 Film/TV +18.4 / Music +6.2 / Records +3.7; 40%-tier = Michigan/Local (+0.2) — Sports now at baseline. T2 floor: Film/TV 4 + Music 2 (YouTube), Michigan/Local 4 + Records 2 (Reddit/podcast — exploratory r/Michigan, r/Detroit). T1 same 3 slices. Dedupe file dedupe-answers-frozen-w3.txt (1,997).
  - **Round abandoned here 2026-08-26 ~10:15p** — wave 3b's T2-D/T2-E never dispatched (session ended). Tally frozen at 71 (wave 2 flush) + T1-A 8 + T1-B 8 from wave 3b = **87/120**. Never resumed under this agent id.

## Round resumed 2026-09-01 as `fact-hunt-2026-09-01` (5 days later — new round_date, new agent id per resume-check rules; not a same-day crash recovery)

Ben's call, asked explicitly: "resume one wave now" rather than leave 8/26 dead or run a full fresh round. The 120-fact target from 8/26 was a one-off Ben doubled that specific night — command default is 60, and Phase 5's own rule is report the honest tally, never pad toward a number. Treated as: reuse the 8/26 Taste Profile (still substantive, not redone), recompute domain deficits fresh against the full bank (now 315 active rows across all agents, not just this round), dispatch exactly one wave, flush, stop — not a claim that digging is "exhausted" (that needs 2+ waves per track; this was Ben-scoped to one).

**Fresh deficit read (315 active rows, vs Taste Profile baseline):** Film/TV 16.5% vs 32% baseline (deficit +15.5) · Music 14.6% vs 19% (+4.4) · Records/Misc 5.1% vs 7% (+1.9) · every other domain at or over baseline (Geography, History, Words/Etymology, Science/Nature, Games/Toys all overshot; Michigan/Local ~at). Only 3 positive-deficit domains — wave targeted those three plus a mild Michigan/Local exploratory top-up on T2.

**Preflight:** yt-dlp 2026.08.19 OK, real smoke test OK. agent-reach doctor: youtube ok, reddit ok (OpenCLI) — both real-smoke-tested OK this time, no BROWSER_CONNECT repeat.

**Wave 1 (2026-09-01) — DISPATCHED, FLUSHED, CONFIRMED same session:**
  - T1-A (Film/TV, quota 10): considered 30 / self-rejected 18 / failed verification 1 / returned 11 (edge 1, shape-edge — "555," breaks the proper-noun-answer convention) → 0 dedupe hits, **11 accepted**.
  - T1-B (Music, quota 8): considered 13 / self-rejected 4 / failed verification 1 / returned 8 (edge 0) → 0 dedupe hits, **8 accepted**.
  - T1-C (Records/Misc, quota 6): considered 17 / self-rejected 11 / failed verification 0 / returned 6 (edge 0) → 0 dedupe hits, **6 accepted**.
  - T2-D (YouTube, Film/TV 4 + Music 2): considered 18 / self-rejected 12 / failed verification 0 / returned 6 (edge 0) → 0 dedupe hits, **6 accepted**. Sources: Law School Data 10 pulled/4 verified, Professor of Rock 1 pulled/2 hits, GameSpot Universe 2/0, Rock N' Roll True Stories 2/0, Country Cast 90 scouted/0 (channel drifted to political/tabloid clickbait — **flag for Ben: consider downgrading**), Twenty Thousand Hertz/apollomovieguy/I Want My 80's Back!/Music Files all 1 try each, mostly unfindable via ytsearch (3rd wave in a row for the ytsearch-unfindable trio).
  - T2-E (Reddit/podcast, Records/Misc 4 + Michigan/Local 2): considered 47 / self-rejected 41 / failed verification 0 / returned 6 (edge 0) → 0 dedupe hits, **6 accepted**. r/todayilearned (already demoted) carried the batch alongside r/Michigan/r/Detroit exploratory (~55-60 raw candidates pulled, uncleanly separable by sub); Half As Interesting and Jon Bois/Secret Base each tried once, 0 hits this wave.
  - **Cross-batch dedupe: 0 collisions** (37 distinct answers, verified via live SQL union query against `questions` + `fact_hunt_entries` before insert — all 37 clear).
  - **FLUSHED — CONFIRMED: `select count(*)` = 37 rows, agent `fact-hunt-2026-09-01`.**
  - Wave 1 counters: `wave 1 (both tracks, all domains): subagents 5 / quota 36 / considered 125 / self-rejected 86 / failed verification 2 / returned 37 / bounced 0 / accepted 37 / edge 1`. Accept rate 100% (37/37 returned accepted).
  - **Source-scoring update applied.** Notable: **r/todayilearned crossed into RETIREMENT this wave** — already demoted (36% lifetime going in), this wave's ~57 attempted / 6 verified dragged the running rate to ~17.7% at 79 total attempts (≥15 threshold), triggering the spec's automatic retirement rule (`status='retired'`). Flag for Ben — it was still the single biggest Track 2 producer by volume even at a low hit rate; retiring it removes it from the default rotation but it's not gone, still queryable as historical data.
  - Round total for this agent id after 1 wave: **37/120** (round-level target inherited from 8/26 is stale/one-off; not treated as a real target — see above). Combined with the dead 8/26 round's 87, the bank now has two partial `fact-hunt` rounds on this topic (124 combined rows), which is fine — they're independent, dedupe-safe, and both live in `fact_hunt_entries`.
  - **Not claiming exhaustion.** Only 1 wave ran this session (Ben's explicit scope: "resume one wave now," not "run to exhaustion"). Phase 5's 2-waves-per-track minimum wasn't attempted. Round stays open — a future `/fact-hunt` invocation (or another explicit "resume" ask) can pick up more waves against the same live deficit read.
