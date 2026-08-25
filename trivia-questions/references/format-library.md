# Format Library — Shiny Questions, Swing Rounds, PYL Boards

The named recurring formats. When writing for one, match its rules exactly; when inventing a new one, match the *spirit* (a repeatable mechanic + a name that gets announced with relish, often With! Exclamation! Points!).

**Family tree — these three sections aren't independent.** A shiny format is a single-question mechanic; a swing round is that same mechanic stretched to 6–9 uniform items; a PYL board is a swing round narrowed to a *complete, verifiable list* under one theme. Concretely: "We're not so different, you and I…" (shiny, find the hidden connection) is the same move as a swing round built around one connection worked across 8 items; "Did you tape the instructions?" (shiny, name-from-parts-list) is one step from a PYL board like "the six [X] with no [Y] in the name" (name-from-bounded-list). When a shiny format feels tapped out at 1 question, that's often a sign it has a swing-round or PYL life left in it — check here before inventing from scratch.

## Shiny / In-Round Named Formats

These slot INSIDE question rounds (1–2 per round). Frequency notes from the 56-show corpus.

| Format | Mechanic | Notes |
|---|---|---|
| **We're not so different, you and I…** | 4 items shown/read; find the hidden connection | THE staple — appears in nearly every show, usually R1. Connections range easy ("all Muppets") to devious ("all noble names": Duke Ellington, Carole King, Prince Fielder, Sacha Baron Cohen). **Correction, 2026-08-25:** the old "never 4 from one franchise unless orthogonal" line is contradicted by real live rows (all-WNBA teams, all-MASH characters, all-Transformers) — same-franchise item sets ARE used, as an easier construction variant. Drop the "never" framing. Also, this is the most-used format AND the most inconsistently entered: live rows split across at least 5 different `text`/`answer`/`questions_data` storage shapes (connection in text vs. in answer, items inline vs. as separate list rows, 4/18 sampled instances with a blank answer field never backfilled). Not a rule — just know the DB shape is unreliable for this format specifically, verify before reusing a row as a template. |
| **Tri Bond** | Three clues, one word answers all three | Clues cross domains: "Mascot of a Texas university, WW2 plane, Memphis's Elanor" → Mustang. The word is always common; the routes are not. **Data note, 2026-08-25:** live rows use 3 incompatible storage shapes (all-in-one string; 3 separate items with the answer only on the last; a "prep notes" shape with the answer word in `text` and category tags in `answer`) — don't copy a row's raw shape as a template without checking which kind it is. |
| **Singonyms** | Song lyric re-worded with synonyms; name the song | "In all of the occupations that are necessary… a 20ml measurement of sucrose aids the treatment" → Spoonful of Sugar. Logged in the DB under both "Singonyms" and "Sinonyms" (typo split, same format, 13 uses combined) — write it "Singonyms" going forward. **Correction, 2026-08-25:** every live row's `answer` field is actually the ARTIST, and `text` holds the plain, un-reworded song title — the reworded-synonym clue text itself isn't stored anywhere in the DB, it's delivered live off-slide. If you're pulling a past row as a reference for the mechanic, you won't find the actual clue text in the database; the mechanic as designed (name the song from its reworded lyric) is right, but the graded answer in practice has drifted to the artist. Flagged for Ben — worth confirming which is intended going forward. |
| **Where in the Hell is Carmen San Diego?** | Landmark/culture clues (usually images); name the country/state/city | |
| **Pixelate! / Time for a close up!** | Progressively pixelated / zoomed image; name film / logo / team | Close-up is usually sports logos. Confirmed clean split in a 2026-08-25 full-corpus read: Pixelate instances were 100% films, Close-Up instances 100% sports logos — no crossover found. |
| **Did you tape the instructions?** | Name the thing from its parts/pieces list | "A motorized pachyderm, four plastic sticks with meshes, 32 nylon bugs" → Elefun. Works for board games, Monopoly special editions, LEGO sets. **Broadened, 2026-08-25:** also confirmed live for non-board-game franchise object collections — e.g. an Office/Beatles/Scooby-Doo prop-set version with no board game involved. Same mechanic, wider material. |
| **Map Maker, Map Maker (Make Me a Map)** | Match items to map locations, or geography riddles | Answer format often "1B 2D 3A 4C". **⚠ Data gap, 2026-08-25:** despite 15 documented uses in Ben's docx show archive, zero rows exist for this format anywhere in the live DB — confirmed by direct text search, not just a `shiny_format_name` mismatch. This looks like a real import gap, not a naming issue. Unresolved — flag to Ben before trusting either count. |
| **Put Me In, Coach!** | Sports lineups/rosters with one missing; name the missing player | Frequently Tigers diamonds. **Note, 2026-08-25:** docx archive shows 7 uses; only 2 live in the DB — a real under-count, similar in shape to the Map Maker gap though not as total. |
| **One Hit Un-Wonder** | One-hit-wonder artist ID, straight — teams are shown/told clues and name the artist | "I took the cats in" → Baha Men. **Correction, 2026-08-25:** that worked example is actually stored as a plain `type='regular'` question in the DB, not tagged to this shiny format — it may be aspirational/illustrative rather than a live example. The 5 rows actually tagged `One Hit Un-Wonder` in the DB are straight one-hit-wonder artist-ID lists with no reworded-title wordplay at all. Also a real usage gap: docx archive shows 29 uses, DB has only 5 — the biggest under-count found after Map Maker. If reviving this format, decide which version you mean (the wordplay-title mechanic as originally documented, or the straight-ID list actually being run) before writing new ones. |
| **Song Connections** | 4 songs share a hidden connection | Sister of Not So Different, music-only. |
| **Song by the Scene / Movie Karaoke / 8-Bit / Bluegrass / Reggae editions** | Identify song from film scene or genre-swapped cover | Audio formats; the cover-genre rotates. |
| **Kevin James, Zookeeper** | Name obscure animals from images | Echidna, kinkajou, dik-dik energy. |
| **Name! That! X!** | Rapid image ID list, announced with exclamation points | X = Santa, Elf, Freak, Tiger, Weapon, School, Good Boy… Big ones become Appendix A rounds. **Note, 2026-08-25:** confirmed the core mechanic is real and consistent at scale (15–28 item lists, fully answered) — but a recurring minority of tagged rows are actually bare 3–4 item comma-lists with a blank answer, structurally indistinguishable from "We're not so different." Likely mis-tagging, found independently across every partition of the bank — a pattern, not a one-off typo. |
| **Title Drops / Opening Lines / Ending Statements / Opening Voiceovers** | Identify film from its title-drop moment / first / last lines | |
| **Tape/Stories using texts** | On-screen text crawls or epilogue cards; name film | |
| **Traitor!** | Actor who played both a Marvel AND a DC character; name actor | |
| **Notice the Eyes** | Eye-crop photos of a themed person-group | Composers, directors, drummers. |
| **Rogues Gallery** | Villain lineup images; name the hero they belong to | |
| **Odd One Out / Well, one is different** | 4 items, one doesn't belong; say which and why | **Correction, 2026-08-25:** the one confirmed live row is actually built as 3 same-category items shown as the clue, with the 4th (odd) item AND its explanation both packed into the answer field — "shown 3, reveal the outlier," not "shown 4, pick the outlier." Low sample (n=1), worth confirming with Ben before treating as the fixed rule. |
| **Count It Up / Count 'em Up** | List read aloud; answer is a NUMBER ("how many of these films feature a mammal as a plot point") | |
| **Cryptogeography** | Cryptid/folklore description; name its country | Kappa → Japan, Pukwudgie → USA. |
| **Scattergories / Mini Scattergories** | Category lists, letter drawn live | Categories mix generic + Michigan-local ("Michigan brewery/winery/distillery"). |
| **Movie/Kid Movie Venn Diagrams** | Two films; name the shared actor | |
| **Squad Up!** | Name the team/group from member names | |
| **Luck of the Roll** | Die roll determines which item of an ordered list to name | Ordered lists: Taylor Swift albums backwards, Avengers by film appearance order. |
| **Pointless** | 4 possible answers worth 30/20/10/−10 by obscurity, one is wrong | Risk-reward scoring. |
| **Appendix A rounds** | 20+ item visual ID list, one theme, ends with a **Redemption** item | Liquor bottles, X-Men, Disney Channel Originals, dog breeds, Tigers players, Halloween monsters. Redemption = one bonus save. |

**Formats found live in the DB but missing from this catalog until 2026-07-17** — added by mining `shiny_format_name` + `questions_data` on real rows. Descriptions marked *(inferred)* are reconstructed from a single low-sample row and are worth a one-line confirm from Ben before treating as gospel; everything else is confirmed from 3+ examples.

| Format | Mechanic | Notes |
|---|---|---|
| **Band by the Albums** | Album-cover or discography clues; name the band | 9 uses — a real recurring staple that was simply never written down. |
| **First, Second, or Third** | Opening line/monologue clues in one round, mixed sub-modes: sometimes "name the movie/song from its opening line," sometimes "name who/what speaks or performs it" | 5 uses. Title likely refers to ranking clue difficulty (1st/2nd/3rd clue given) rather than franchise order — *(inferred, confirm exact rule with Ben)*. |
| **Name That Song** | Song title or lyric fragment given; name the ARTIST (not the song) | 4 uses (grew to ~11+ in a later 2026-08-25 recount). Distinct from One Hit Un-Wonder (reworded titles) — this is a straight artist-ID format. **⚠ Correction, 2026-08-25:** live rows contradict this — the `answer` field holds a SONG TITLE ("Don't Stop Me Now," "Dust in the Wind," "Slow Ride"), never an artist. Either the documented rule is backwards, or the format's purpose flipped since 2026-07-17 and nobody updated this row. Flag for Ben before writing a new one — confirm which direction (name-the-song vs. name-the-artist) is actually intended. |
| **Hear! Me! Roar!** | Audio clips of cartoon/character sounds (roars, theme snippets); name the character or show | 4 uses, all animation-themed ("Saturday AM Edition," cartoon themes). |
| **Once more, without feeling…** | A song or line read/performed completely flat/monotone; name the source | 4 uses. The deadpan delivery IS the mechanic — title is the instruction. |
| **Movie Chapters** | A film's home-video/DVD chapter-title list read aloud; name the film | 3 uses. |
| **Let's rant it up!** | Famous movie rant/tirade monologues; name the film | 2 uses. |
| **Movie Roll Switcheroo** | An ensemble scenario is narrated using character names pulled from unrelated films; name the film the swapped cast is secretly describing | 2 uses. Genuinely tangled mechanic — *(inferred, confirm exact rule with Ben)* before reusing. |
| **A show by its intro** | TV theme song/opening plays; name the show | 2 uses. |
| **WTF?** | A movie paired with a wildly unexpected/tangential connected fact; name the surprising element | 2 uses. The bar-comedy punchline is the surprise itself — *(inferred, confirm exact rule with Ben)*. |
| **Put me in coach!** | Lowercase/no-comma variant of **Put Me In, Coach!** already above — same format, same row. | — |
| **Ben and Jerrys Replacements** | A real Ben & Jerry's flavor (named after a celebrity, per their actual naming convention) is renamed with a different celebrity pun; name the real flavor | 1 use — *(inferred)*, worth reviving given the "house lore" voice fit. |
| **Bill Nye** | Three riddle-nicknames, each with its OWN separate named answer — not one shared connection | 1 use. **Correction, 2026-08-25:** the prior "likely a themed variant of We're not so different" guess was checked against the real row and is wrong — the actual data is 3 independent riddle-nicknames (Katy Perry / Sylvester Stallone / Helen Keller in the one live example), each answered separately, no single hidden connection. Closer in shape to a mini Tri-Bond-without-the-shared-word than to "We're not so different." |
| **First Roles** | Given an actor, name their first (often obscure) film/role | 1 use — inverse of the usual "name the actor" format, worth reusing more. |
| **Where everyone knows your name** | A cocktail's ingredient list plus a punny celebrity bridge clue; name the drink | 1 use — Cheers-referencing title. |
| **Origin Story** (shiny) | A single dramatic riddle describing a character's obscure origin; name the character | 1 use. Distinct from the *swing* concept "Origin stories" below (which covers hero origins across 6-9 items) — same idea, different scale. |
| **Dark Fantasies** | Kids'-media titles sharing a hidden darker theme; find the connection | 1 use — *(inferred, low confidence)*, reads as a themed "We're not so different" variant. |
| **Musically Inclined** | A short run of literal (not reworded) lyric fragments; name the source | 1 use — distinct from Singonyms (no synonym rewording here). |
| **Those sneaky bricks…** | Official LEGO set trivia — a specific hidden/Easter-egg piece buried in a named build; name the piece | 3 uses. Sibling of "Did you tape the instructions?" (parts-list) but this is the hidden-Easter-egg variant. |

**Formats found live in a 2026-08-25 full-corpus read, still missing from this catalog:**

| Format | Mechanic | Notes |
|---|---|---|
| **AI Images / AI Movie Images** | 3 AI-generated images shown (films or artists); find the hidden connection | Real, moderately recurring (~10 combined uses across the bank) — previously only mentioned in passing prose about "AI-generated shiny content," never given its own catalog row despite being tagged as its own `shiny_format_name`. Same shape as "We're not so different" but AI-image-specific and blank-answer (connection delivered live). Two spellings in the DB for the same family (one for movies, one for bands) — pick one going forward. |
| **ChatGPT goes ERB** | "[X] vs ?" — 3 items, each an Epic Rap Battle-style opponent pairing with one side blanked; name the missing opponent | ~4 uses. Also only mentioned in prose before this. One live instance is a clean 3-item vs.-format list; another is a flat comma list with no visible "vs" structure and a blank answer — confirm the clean version is the real mechanic before reusing the other as a template. |
| **106 Miles to Chicago** | Blues Brothers-titled road-trip round: rest-stop/brand clues; name the brand | 1 use. |
| **Are You Going to Call Her Back?** | A modern sitcom paired with its classic-era predecessor/inspiration; name the earlier show | 1 use (Friends→Cheers, A-Team→Battlestar Galactica pairing style). |
| **Unable to Learn Guitar…** | Simple song-to-artist ID, one word/short-title songs | 1 use. |
| **What's In The Box?** | Sibling of "Did you tape the instructions?" — single-item board-game-pieces ID | 1 use. |
| **Character Colors** | Match a themed character set (e.g. the Flintstones) to their signature colors | 1 use. |
| **Baynes Tinder** | A cryptid/creature is given a dating-app "profile" description; name the cryptid | 1 use ("Cryptid tinder" → wendigo). Odd, house-voice bit worth reviving. |
| **Drunk History** | An obscure real historical event retold in an improvised "drunk narrator" voice, ending on a pivot question | 1 use, but a clean, repeatable, distinctly Ben-voiced mechanic — e.g. a slurred retelling of the Emu War ending on "what country?" → Australia. Worth using more. |

**Two phone-interaction carve-outs, confirmed live and legitimate — sync note, 2026-08-25:** "Drag and Drop" (7 uses — teams connect left/right pairs on their phones) and "Strike a Match" (teams blind-wager a risk tier, then submit a numeric guess) are real, Ben-approved exceptions to the paper-only rule below, added 2026-08-23 and documented in `.claude/agents/shiny-format-idea-generator.md` — but were missing from THIS file, which made them look like Hard-Rule violations to anyone reading only the catalog. They are not violations. Cap: 1–2 phone-based shiny uses per night TOTAL (not each). See the agent file for the full carve-out language before proposing a new phone-based format — only these two exact mechanics are allowed to break the paper-only rule; everything else (grids, apps, turn-based reveals) is still dead on arrival. Also found live: rows explicitly named "(Test)" / "DRY RUN TEST" (e.g. "Use Your Phone (Test)") — these are dev/prototype rows sitting in the production table, not real formats; exclude them from any frequency count.

**Frequency snapshot (233 shiny rows, as of 2026-07-17):** "We're not so different, you and I…" alone accounts for ~24% of every shiny question ever run (55 uses) — it's the one format genuinely at risk of going stale from overuse. Tri Bond (17), Name!That!Thing (15), and Pixelate/Time-for-a-Close-Up combined (18) are the next tier — healthy staples, not yet overdue. Everything at 1–2 uses above is either a true one-off worth reviving or was tried once and can be safely retired — Ben's call, not something to infer from count alone.

**UNRESOLVED — DB-row count vs. docx-archive show count disagree, 2026-08-25:** re-ran this at the current bank size (263 shiny rows of 1,948 total) and diffed it against the trivia-questions skill's separate docx-archive table (which counts *shows featuring a format*, not rows). Most formats track a consistent ~0.85-0.95 rows-per-show ratio once likely typo-variants are merged (e.g. "Singonyms"/"Sinonyms" — same format, split by a spelling slip in the source data). A few don't, and the gap looks like an import problem, not a measurement-unit artifact: **One Hit Un-Wonder** (docx: 29 shows / DB: 5 rows), **Put Me In Coach** (7 / 2), and worst, **Map Maker** — docx says 15 shows, but zero rows exist in the DB under any `shiny_format_name` or in question text, confirmed by direct search. Whatever these three formats' real recent-use rate is, don't infer it from the DB row count alone — it's very likely undercounting them specifically, not just generally. Don't fully trust the docx count either without knowing why the import dropped them. Flagged for Ben to resolve; not silently corrected.

**AI-generated shiny content** (established, growing): AI band images (band's songs as literal AI images), AI movie titles ("movies using AI, in other words"), ChatGPT-goes-ERB, AI song covers in cartoon voices. When asked to generate these, the joke is literal-mindedness — the AI takes the title at face value.

## Swing Round Concepts (Round 3)

One concept, 6–9 items, uniform answer shape, concept announced in the round title. The concept IS the entertainment — novelty is prized. The corpus catalog, for spirit-matching and repeat-avoidance:

Children's book opening lines · Poorly-and-shortly described movie plots · Stupid questions get stupid answers (answer is IN the question: the horse named Upset, the band called The Band) · Fauxbituaries (fictional-character obituaries/graves) · Band Name Inspirations (origin story → name band) · Celebrity Mean Tweets · One-star travel reviews (review → name landmark) · Haikus (celebrity/film as haiku) · Movie Quote Odd One Out · Character cast mix-up (plot retold with actors' OTHER roles) · Crazy movie deaths · Epic Rap Battles of History (lyric → name opponent) · Famous landmarks by city (images) · Scattergories full-round · Music Bingo Precursor (lyric-detail questions: "what job does Tiny Dancer have?" → seamstress) · Origin stories (hero origins, no names) · ESPN 30-for-30 titles · MiLB team nicknames (city + definition riddle → nickname) · College-nickname definitions by city (Spartans, Sooners, Cavaliers…) · AFI movie quotes · Iconic sports calls (audio → answer a detail) · The Disney Theory Timeline · Map maker: make me a film (travel-route maps → film) · High school superiority (MI school nicknames by riddle) · Silenced RPG (map/level → country) · Live Action?? (Disney live-action deep cuts) · Irish rock covers · Song covers by genre · TV show change-a-letter (plot of the pun title → pun title) · Checklists (narrative walk-through with embedded questions) · X marks the spot (treasure/maps) · Gotta catch 'em all (Pokémon lore → real-world origin) · A Nostalgic Christmas / Shawn's Big Day / Ben's Historic Road Trip (personal-lore: family anecdote + verifiable fact per item) · Alphabetically first and last · Big EGOS (award lists → name person) · Pokémon entomology odd-one-out · Off to a rough start (this year's deaths, legacy-routed) · Masters ("master" wordplay across domains) · Cards Against Humanity descriptions.

**When proposing a new swing concept:** name it like Ben would (pun or catchphrase), define the uniform answer shape, write the EX: item first (rounds often open with a worked example), and keep every item independently verifiable.

## Press! Your! Luck! Boards (Round 4, 2026-era)

3–4 categories per board, each a **6-item complete or bounded list**. Teams press to name items; the list must be airtight:

- Complete-by-definition: "the six WW2-set Best Picture winners," "Operation ailments with no bones in the name."
- Bounded-by-window: "the last 6 Super Bowl halftime BANDS," "since the list's 2011 inception."
- Source-bounded: "most photographed buildings per a NYT × NatGeo cross-reference."

Category titles are punchy nouns ("Deadliest Warrior," "Sitcom Workplaces," "Books Without Words," "Movie Boosts" = product placements). Boards deliberately REPEAT across consecutive weeks (2–4 shows) before rotating — returning teams get a memory reward. When building a board, verify list completeness independently for every item; a missing valid item is a table dispute waiting to happen.

## Bonus Round (2 questions)

Q1: one fully-loaded standalone question, often the hardest lattice of the night. Q2: a scored list — "For ten points each, name the five…" — bounded and source-safe. Occasionally a per-person dedication round (Shawn/Jenean/Carlee/Ben each get a question in their domain).

---

## 2026 Season — New Concepts (proposed, untested — five shiny reworks, 2026-07-17 through 2026-07-18)

**Shiny section history:** draft 1 (80 concepts) rejected wholesale for violating the paper-answerable constraint and over-indexing on sports. Draft 2 (28 concepts) fixed both but rejected as "no pizzazz... not really different" — flat **"redact one fact, guess the source"** templates. Draft 3 (20 concepts) added multi-route convergence but rejected for leaning on WORD-PUZZLE mechanics (charades, anagrams, thesaurus-decoding, portmanteau — the last one specifically flagged as something Ben had already done). Draft 4 (5 concepts) switched to real-world fact-convergence (patents, legal/ban history, celebrities' civilian jobs) — REJECTED 0/5: **"Doesn't sound like you, you're going too trivial... this is more show centered, people love the not so different you and i, movie title drop audio questions, song covers in diff versions like bluegrass or 8bit."**

**Draft 5 dead end:** several of Ben's real formats (Cryptogeography, Name! That! X!, Hear! Me! Roar!, Map Maker Map Maker, Pixelate!, Once more without feeling…) do trace back to the "Shiny Questions" page of the *Um, Actually* Fandom wiki — reachable despite a Cloudflare gate via the Fandom API (`api.php?action=parse&page=Shiny_Questions&format=json&prop=wikitext`). Draft 5 ported five more sections of that page. **Rejected outright, independent of mechanic quality: "i dont want any from that site. even just slightly changed. ive read thrtough the site like crazy."** Ben has already mined that page exhaustively himself — it is NOT a source of fresh ideas for him, adapted or not, and he recognizes it instantly. **Do not use that wiki for inspiration, at all, going forward.** He also named a real technical constraint in the same message: **"What's Wrong (With This Picture)?" (spot an edited image detail) fails separately because the show runs on big TVs with up to 30 teams watching at bar distance — fine visual detail doesn't read at that scale.** Bold/large visuals (existing Pixelate, Rogues Gallery) or audio/text-only are safe; anything needing close visual scrutiny is not.

### Shiny / in-round — deep rework, take 6 (no wiki, pop-culture audio/performance, "try 5 more then we'll be done")

Back to Ben's own corpus DNA (Tri Bond convergence, We're Not So Different connection-finding), recombined with the specific flavor he named as beloved — recognizable pop-culture content re-served through an audio or performance twist — while respecting the display constraint (audio/text-forward, no fine visual detail).

| Format | Mechanic | Worked examples | Why it's fresh |
|---|---|---|---|
| **Genre Bender!** | An iconic INSTRUMENTAL film/TV score cue (no lyrics) is played, reimagined in a wildly different musical genre; name the film/show | The *Jaws* theme played as a bluegrass banjo tune; the *Star Wars* Imperial March played as lo-fi elevator jazz; the *Jurassic Park* theme as a mariachi arrangement | Direct sibling of the genre-swapped-cover format Ben already loves (8-bit/bluegrass/reggae editions) — same DNA, but scores instead of songs-with-lyrics, which is a whole separate well of iconic material his existing format never touches |
| **Pitch Shift!** | A famous, deeply recognizable movie/TV theme or scene audio is played dramatically sped up (chipmunk-pitched) or slowed down (doom/reverb-warped); name the source | The *Indiana Jones* theme sped up into a chipmunk fanfare; the *Cantina Band* theme from Star Wars slowed to a horror-movie crawl | Same "recognizable content through a fun audio twist" DNA as the genre-swap covers, but zero production complexity — one pitch/tempo knob turns anything into a disguised-but-solvable clip |
| **Trailer Voice!** | In the deep movie-trailer-narrator voice ("In a world…"), Ben dramatically narrates a real, decidedly UN-dramatic pop-culture moment (a sitcom plot, a kids' cartoon episode, a viral clip) as if it's an action blockbuster; name what's actually being described | "In a world... where a paper company must survive picture day... one man's beet farm... is the only hope." → **The Office**, "Threat Level Midnight" or the Dwight beet-farm subplot | The bit IS the content — pure hook/performance in Ben's own established voice (see the anatomy doc's hook taxonomy), applied as a recurring named format rather than a one-off cold open |
| **Same Voice, Different Face!** | Three or four short audio clips of ONE voice actor's performances across totally unrelated animated roles play back to back, no names given; name the voice actor | Twilight Sparkle (*My Little Pony*), Raven (*Teen Titans*), Bubbles (*The Powerpuff Girls*), and Timmy Turner (*The Fairly OddParents*) — four completely different shows, one actress → **Tara Strong** | We're Not So Different's connection-finding logic, ported to audio clips instead of a read/shown list — new medium for a beloved mechanic, not a new mechanic wearing a new name |
| **Cameo!** | Tri Bond's shape, strictly pop-culture: three clues from three unrelated franchises/genres, each independently describing a role played by the SAME person; name the person | A conniving Philadelphia dive-bar owner and self-proclaimed "Golden God" (*It's Always Sunny in Philadelphia*'s Frank Reynolds) + the voice of a small orange creature who speaks for the trees (*The Lorax*) + a deformed aristocrat raised by penguins running for mayor of Gotham (*Batman Returns*'s Penguin) → **Danny DeVito** | Same three-independent-routes convergence as Tri Bond, but built entirely from pop-culture roles (sitcom × animated family film × superhero film) instead of Tri Bond's usual word-based routes — closes the gap between "multi-route convergence" (right mechanic, drafts 3-4) and "show-centered" (right content, this draft) that no prior batch hit at the same time |

**Verification status:** Tara Strong's four roles and Danny DeVito's three roles are high-confidence, well-documented general knowledge (re-verify per house rule before going live, same as any fact-based question). Genre Bender/Pitch Shift/Trailer Voice are production bits, not factual claims — no verification needed beyond confirming the source clip/theme is real and correctly attributed. None of these five are sourced from, or adapted from, the *Um, Actually* wiki.

### Swing rounds — general batch + full-corpus specialist

| Format | Uniform shape | EX item | Why fresh |
|---|---|---|---|
| **Concession Stand Confidential** | Stadium food tradition/bit → team/ballpark | Klement's sausage race since '93 → **Brewers** | Sports×food crossover, unclaimed |
| **Sudden Death** | Real OT/tiebreak rule quirk → the sport/league | MLB's Manfred Man since 2023 | Rules-trivia, clean sports-only |
| **Prize Inside!** | Toy that shipped in a snack box → the brand | Toy-in-every-box since Feb 19 1912 → **Cracker Jack** | Unclaimed food×toy crossover |
| **As Seen On TV!** | Real product's own jingle/slogan → the product | "Ch-ch-ch-Chia!" → **Chia Pet** | Commercial-jingle ID, distinct from Singonyms/Title Drops |
| **Toy Aisle Time Capsule** (audio) | Vintage toy jingle → the toy | 1962 Slinky jingle | Audio-first, games/toys domain |
| **Off the Menu** / **86'd!** *(overlap, see note above)* | Discontinued food product, packaging or flop story → the product | McDLT dual-container, 1984-91 | Untouched nostalgia lane |
| **Order Up!** | Old-school diner order lingo → the real dish | "Adam and Eve on a raft" → poached eggs on toast | Diner slang, named fact-source habit, never built |
| **Recall Notice!** / **Recall! That! Toy!** *(overlap, see note above)* | Real CPSC recall description → the product | Aqua Dots' GHB-precursor coating, 2007 | Toys/consumer products get zero current formats |
| **Get Your Hot Dogs Here!** | Signature stadium concession, loving detail → team/venue | The Boomstick → **Rangers**, Globe Life Field | Sports+food sharing one bun |
| **First! Or Last!** | Category + ordering rule (varies per item) → the extreme | 7 Dwarves, alphabetically first → **Bashful** | Ordering criterion changes per item — found live at id 1039, never named |
| **Fill 'Er Up!** | Ordered/patterned sequence, one slot blanked → the missing member | Poker hand rankings, gap at four-of-a-kind | Answer sits INSIDE a pattern, not at an edge — id 1236 |
| **You Are Here!** | Second-person immersive scene, no proper nouns → the fictional place | Wardrobe, snow, lamppost → **Narnia** | Stretches the anatomy doc's "scenario" texture into a full round — id 1523 |
| **Sibling Shopping Spree!** | Named relative gift-hunts using a career-stat pun → the celebrity | 3 Grammys swept 2022 → **Chris Stapleton** | A real recurring pattern in the corpus (ids 1282, 1308) that was never named |
| **Ring In the Hits!** | Bare calendar date (same day, different years) → the #1 song that week | Dec 31, 1999 → **"Smooth," Santana ft. Rob Thomas** | Clue carries zero song/artist hint |
| **Three For The City!** | City name → exactly three named landmarks (all required) | Seattle → Gum Wall, Space Needle, Fremont Troll | Multi-part fixed answer, flips the usual image→city direction |
| **Recast Ready!** | 3+ actors who all played the SAME character → the character | Hackman/Spacey/Eisenberg → **Lex Luthor** | True "same answer, independent routes" shape — id 1500 |
| **Roll For Initiative!** | D&D class described via mythology/mechanics, no name given → the class | Celtic earth-magic shapeshifter → **Druid** | Zero TTRPG-vocabulary answer shape exists currently — id 337 |
| **Evil Real Estate!** | Villain's lair/property NAME (text only) → the film | "Ursula's lair" → **The Little Mermaid** | Distinct retrieval path from image-based Rogues Gallery — id 689 |
| **The Role That Got Away!** | Iconic role via the actor who won it → the actor who TURNED IT DOWN | Gandalf → **Sean Connery** declined | Answer is the near-miss, not the famous name — id 1544 |
| **Based On A True Story!** | Biopic title → the real person depicted | *The Imitation Game* → **Alan Turing** | No catalog entry runs title→real-subject as a uniform shape — id 1651 |
| **Now Starring: The Band!** | Comedy film title (bare) → the real band cameoing on-screen | *Bridesmaids* → **Wilson Phillips** | Distinct from lyric/scene-based music formats — id 1730 |

**Corpus data-quality flags found while reading (not fixed, per standing rule — Ben's call):** swing round id 1418 looks corrupted/duplicated (Stone Temple Pilots appears as both a clue and an answer in the same 8-item set). Swing round id 1688 has two factually-wrong items — a "World Series winners since 2010" list including the Yankees (haven't won since 2009), and a "US Mint locations" list including San Diego (not a current Mint site). Worth a spot-check before either round runs again.

### Press Your Luck boards — full-corpus specialist

15 boards, each with a named completeness strategy (the format-library's existing three — complete-by-definition, bounded-by-window, source-bounded — plus a 4th spotted live in the corpus but never named: **taxonomy-complete**, the entire fixed classification itself, not a filtered subset of something bigger).

| Board | Strategy | The 5-8 items | Why fresh |
|---|---|---|---|
| **The Original Six** | bounded-by-window | Bruins, Black Hawks, **Red Wings**, Canadiens, Rangers, Maple Leafs (NHL, 1942-67) | Hockey absent from sample; Michigan anchor free |
| **The Fab Five** | complete-by-definition | Webber, Rose, Howard, King, Jackson (Michigan '91 recruits) | Hyper-local |
| **Cooperstown's Class of '36** | complete-by-definition | Cobb, Ruth, Wagner, Mathewson, W. Johnson | HOF induction classes untouched |
| **Day One!** | complete-by-definition | 100m, long jump, shot put, high jump, 400m (Olympic decathlon day 1) | Track & field absent from sample |
| **Seven for Seven** | complete-by-definition | 100mH, high jump, shot put, 200m, long jump, javelin, 800m (heptathlon) | Pairs with Day One! |
| **The Five Mother Sauces** | taxonomy-complete | Béchamel, Velouté, Espagnole, Tomate, Hollandaise | No cooking-classification boards exist |
| **Grain Rules!** | source-bounded (27 CFR §5.143) | Bourbon, Rye, Wheat, Malt, Rye Malt, Corn Whiskey | Liquor-LAW trivia, not flavor |
| **Bordeaux's First Growths** | source-bounded (1855 Classification, amended once) | Lafite-Rothschild, Latour, Margaux, Haut-Brion, Mouton Rothschild | Wine trivia untouched |
| **The Five Basic Tastes** | taxonomy-complete | Sweet, sour, salty, bitter, umami | Science×food cross-domain bridge |
| **Cluedo's Original Six — Suspects** | complete-by-definition | Scarlett, Mustard, White, Green, Peacock, Plum | No board-game-character boards exist |
| **Cluedo's Original Six — Weapons** | complete-by-definition | Candlestick, knife, lead pipe, revolver, rope, wrench | Pairs with Suspects as one Cluedo board |
| **Trivial Pursuit's Wedge Six** | taxonomy-complete | Geography, Entertainment, History, Arts & Lit, Science & Nature, Sports & Leisure | Board-game-inception angle |
| **Crayola's Original Eight** | bounded-by-window | Red, orange, yellow, green, blue, violet, brown, black (1903 box) | Toy/school-supply angle absent |
| **The Early Bird Four** | source-bounded (Kenner 1977 mail-away) | Luke, Leia, Chewbacca, R2-D2 | Toy-marketing-history angle |
| **Super Mario Kart's Original Eight** | bounded-by-window | Mario, Luigi, Peach, Yoshi, Koopa Troopa, Toad, Bowser, DK Jr. (1992 SNES) | Video games absent from sample |

### Shiny — video/audio/image, single-answer (survivors of the grid/video batch — the rest required an interactive grid or app and got cut in the 2026-07-17 rework, see note above)

| Format | Media | Mechanic | Worked example | Why fresh |
|---|---|---|---|---|
| **Then There Was…** | video | Time-lapse construction footage, no narration; name the structure | Mackinac Bridge, 1954-57 | Motion is load-bearing — unreadable as a still |
| **Face Lift!** | video | Brand logo morphs through real historical redesigns, freeze before current; name the brand | Starbucks siren, 1971→2011 | Change-over-time IS the clue |
| **Eye on the Storm** | video | Animated storm-track map, no labels; name the storm | Hurricane Katrina's path | Opens a recurring video-only sub-genre |
| **Chain Reaction!** | video | Domino/Rube Goldberg toppling footage, freeze before the last piece; name what's being spelled/built | 1M+ dominoes, Netherlands record | Suspense of building momentum, unreproducible as a still |
| **Play by Play Freeze** | video | Animated telestrator play diagram, frozen before the payoff; name the play | The Philly Special, Super Bowl LII | Evergreen well, any famous trick play |
| **The Big Climb** | video | Bar/line chart races upward over decades, freeze before reveal; name the company | Domino's, 1 store 1960 → 22,300+ | "Bar chart race" genre, untapped in trivia |
| **House Anthem** | audio | Real stadium CROWD tradition, not the studio track; name the venue/team | "Sweet Caroline" swell → **Fenway Park** | Crowd-as-instrument, distinct from every existing audio format |
| **Order Slip** | image | Photographed menu/receipt, store name blacked out, prices visible; name the chain | 1955 McDonald's 15¢ menu | Document-reading literacy, sidesteps current-price staleness |
| **Encore Order** | list | A real setlist's exact/scrambled song order, read aloud; name the artist/event | Queen's 21-minute Live Aid set | Tests set-craft/sequence, not song recognition |

Each of these ends in ONE named answer written on paper — no grid to fill in, no app, no turn-based reveal. **Cut from the original grid/video batch** (violated the paper-answerable rule): Nine Lives (Immaculate-Grid-style), Connect the Squares (NYT Connections-style), Grid Lock (crossword), Fire For Effect! (Battleship-style turn-based reveal), Flavor Quadrant (plot-a-dot), Word Up! (Wordle-style tile grid).
