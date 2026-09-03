---
name: trivia-questions
description: Write trivia questions and find question-worthy facts in Ben's Baynes Trivia house style. Use this skill WHENEVER the work involves trivia content — writing or editing questions, brainstorming facts or topics to write questions about, building swing rounds, Press Your Luck boards, bonus questions, or themed shows, analyzing the question bank, judging whether a fact is "question-worthy," or auditing/drafting hints. Trigger even on casual asks like "give me some facts about X," "ideas for next week," "is this a good question," or "punch this question up" — fact-finding for trivia IS this skill's core job, not just question formatting.
---

# Baynes Trivia — Question Writing & Fact Finding

Ben runs live bar trivia at Baynes Apple Valley (mid-Michigan). This skill encodes his question-writing voice, distilled from 56 full shows (2024–2026, ~1,400 questions). The goal: when an agent finds facts or drafts questions, the output should be indistinguishable from something Ben wrote on a good night.

**The one-sentence style (rewritten 2026-09-02):** a deep cut INSIDE something the whole bar already loves, with a second door in — the SUBJECT is famous (a show, film, song, game, park, team, brand, Michigan place — or a real-world thing the bar already knows: Iwo Jima, sloths, Lewis and Clark, the Cold War), the DIG is a detail nobody at the table has noticed, and the second door is the answer word living in another universe, a quotable line, a character who "would know," or a Michigan tie. The old phrasing ("an obscure route to a familiar destination") was read by every automated hunter as "find an obscure thing," which produced Hans Island and Andrew Jackson's cheese wheel and a 2% keep rate. Ben's own words: *"i focus on just plain old cool things. fandoms are the goals"* — and, same day: *"there has to be a genuine balance of cool trivia facts and fandoms."* The bank agrees: ~1 in 5 regular questions has a real-world subject (WW2, explorers, animals, places) told with the same hinge-and-shout shape. Cool = a thing everyone already loves, seen from an angle they never noticed.

## Taste Profile v2 (2026-09-02) — read `references/fact-hunt/taste-profile.md` in the trivia-os repo for the long form

This skill lives in two copies — repo root `trivia-questions/SKILL.md` and `~/.claude/skills/trivia-questions/SKILL.md` — keep them byte-identical; there is no third snapshot under `references/fact-hunt/` any more. Fact-hunt hunters Read `taste-profile.md` only (its §0 gates and §9 exemplars ride in with the one Read); the orchestrator reads this file by absolute path, `/Users/bencoughlin/Projects/baynes-trivia/trivia-os/trivia-questions/SKILL.md`, only when it needs the skill.

Built from a full read of all ~2,000 bank rows by two independent Fable 5.1 reviewers plus Ben's real keep/kill verdicts on fact-hunt output. The short form:

- **The wells, ranked:** sitcom canon (The Office deepest) · Disney/Pixar/the parks · comedy films 1980–2010 · nerd canon (Star Wars, LOTR, HP, GoT, Marvel/DC, Pokémon, Nintendo, D&D, 90s Nick) · music ×3 (classic-rock record book / 90s-2000s radio + one-hit-wonders + lyric detail / country) · sports as pop culture (Tigers, MSU, team-name origins, athletes in movies, "only in the four majors") · Michigan/Saginaw/family as garnish everywhere · cryptids/haunted/hoax/true crime · brands, toys (Toy Hall of Fame ~10×), dead retail, cocktails, beer/whiskey · internet/meme culture · lists-as-authority ("according to Rolling Stone/IMDB/Guinness/Forbes/People…") · topical (deaths become questions the same week).
- **Real-world well (`Cool-facts`, ~1 in 5 — corrected 2026-09-02, an earlier draft said "nearly absent"):** WW2/Cold War, explorers, animals, places, famous people. Same rules as a fandom fact: famous subject, a hinge (math, only/first, secret second name, gross, legend), sayable answer, shout. A pop door helps (pulsar via the Bee Gees, Paper Clip via Clippy) but isn't required. Dead: obscure subjects, grim/legal payoffs, unsayable answers — the 2026-08 tombstone pile.
- **The shapes:** detail-inside-a-famous-thing (~40% of the bank: Levee, Courtyard, Sauna, Turnip, Maurice) · name-with-a-second-life (Colossus, Kirby, Creed, Squib, Echo, Jericho, Plunder, Osprey, Vixen) · lyric/quote/scene detail ("If you're Tracy Chapman…") · you-could-ask-[character] bridge (Chandler Bing → Tulsa) · hook-that-is-secretly-a-clue ("Ow! My patella!" → Wounded Knee) · three-role actor riddle · according-to-[list] record-book puzzle · name-origin (band/brand/toy/mascot/team) · Michigan garnish · topical/in-memoriam.
- **A bridge is one of exactly five typed doors:** `name:` the answer word in a second universe · `line:` a quotable line/lyric/SFX from the answer's own culture · `ask:` a character or celebrity who "would know" · `mi:` a Michigan/family tie · `hook:` a cold-open from a different property that secretly contains the answer. "Another fact about the subject," filmographies, and category nouns are NOT bridges.
- **The shout test:** write the five words the bar yells at the reveal. No shout, no fact.
- **Anti-list (real kills):** grim payoff, lawsuits/legal history, debunks that make the thing smaller, patents, celebrity day jobs, science mechanism for its own sake, etymology without a pop twin, "weird history" listicle corners, answers the bar can't say out loud.
- **Era is irrelevant.** A 1937 Disney detail and a 2025 viral clip sit in the same round.

## The Signature Question Anatomy

Nearly every Ben question has this skeleton. Learn it before writing anything:

```
[HOOK]  [SETUP FACT with texture]  [QUESTION PIVOT]  [SECOND CLUE / crossover anchor]?  [TRAILING WINK…]
```

1. **The Hook (optional, ~40% of questions):** a cold-open quote, sound effect, or interjection BEFORE the question — often unattributed, and often secretly a third clue. `"Ow! My Patella!"` opens a question whose answer is Wounded Knee. `*FLASH*` opens Men in Black. `"Stayin alive, stayin alive!"` opens a question about pulsars (Saturday Night Fever ≈ radio beams… no—it's the beat: a pulsar pulses). Sometimes it's pure comedy with no clue. Never explain the hook.

2. **The Setup Fact:** one genuinely surprising fact, told with concrete texture — years, dollar amounts, counts, proper nouns ("8,795 cans of SpaghettiOs," "a 755-foot-deep body of water," "159 quintillion possible combinations"). The texture makes it feel true and makes the answer feel earned. The fact is the obscure part; keep the answer familiar.

3. **The Question Pivot:** almost always "what/who/where + category noun" — "what band," "what US city," "what kind of animal." The category noun tells teams the SHAPE of the answer, which is half the fairness contract.

4. **The Second Clue (the two-clue lattice — THE signature move):** a second, independent route to the same answer, usually a cross-domain crossover: "shares its name with…", "can also be found in…", "you could ask [character]…". Example: *Colossus* = the 1943 codebreaking computer AND the only original X-Man from mainland Asia. A team can arrive from EITHER direction. When drafting, if you can't find a second route, the fact usually isn't a Ben question yet — keep digging.

5. **The Trailing Wink (optional):** a trailing aside, ellipsis-heavy, that sneaks in one more sideways hint or a joke: "Don't go too fast, though, we wouldn't want you to turn to plaid…" (Spaceballs → Ludicrous). "…he has two locations in Saginaw. PTTTTNNNNNNGGGGG!"

**Full worked example (real):**
> "It looks like you're writing a letter. Would you like help?". What household item code name was given to the operation that the US Armed Forces deployed, where they brought over 1600 German scientists to help give them an advantage over the Soviets after WW2?
> → **Operation Paper Clip** (hook = Clippy; setup = real history with the number 1,600; pivot = "what household item"; the hook itself is the second clue)

## What Makes a Fact Question-Worthy (the fact-finding filter)

When hunting facts (web search, lists, research), run every candidate through these gates:

1. **Familiar destination:** is the ANSWER something a whole bar table can produce by ear? (Kit Kat, Denver, Frankenstein, The Cars, Kirby — yes. Phil LaMarr, an obscure chemist — no.) And is the SUBJECT a fandom the bar already loves? Obscure subjects are not the route; the route is a join the resident fan hasn't made.
2. **Does it bridge?** A bridge is a typed second door into the same answer (`name:` / `line:` / `ask:` / `mi:` / `hook:` — see Taste Profile v2), usually crossing two fandoms: Colossus = codebreaking computer + X-Man; Marley = Scrooge's partner + a Labrador + a reggae legend. A fact with only one door needs a found second door before it's ready; "another fact about the subject" is not a door.
3. **Superlatives, onlys, firsts:** "the only NFL team whose name ends in a vowel," "the first live-action film with a CGI lead," "the most photographed buildings." These are Ben's bread and butter — they're unambiguous, gradeable, and inherently interesting. BUT they're also the #1 staleness risk: any "current/most/latest" claim must be re-verified before use and dated in your notes.
4. **One unambiguous answer, gradeable in seconds by ear.** If two defensible answers exist, either rewrite until only one survives or explicitly allow it: "name either," "name one of the two."
5. **Interesting even if you miss it.** The reveal should make the room go "ohhh" — and the ohhh is almost always the SECOND DOOR (Kirby is JACK Kirby; Akagi is the Die Hard vault), not the fact alone. The hinge is the entertainment; the fact is the delivery. A question nobody enjoys hearing the answer to is dead weight.
6. **VERIFY EVERY FACT via web search before proposing it.** A wrong answer in front of a live crowd is the content equivalent of a P0 bug. Confidently-remembered facts are exactly the ones that turn out wrong. Verify the setup fact AND the crossover clue independently.
7. **Never trust a listicle.** Viral fact-lists and "50 amazing facts" content run ~5–10% quietly wrong — a July 2026 corpus review caught two that nearly entered the pipeline: "the Segway's inventor died on a Segway" (false — Dean Kamen is alive; it was Jimi Heselden, who *bought* the company, in 2010) and "the Abbey Road crossing is a UNESCO World Heritage site" (false — it's Grade II listed under English Heritage, 2010, not UNESCO). Verify against primary/institutional sources (Wikipedia + one independent), never against another listicle. If two sources disagree, the fact is dead or the dispute becomes the question.

## Difficulty Is Written, Not Tagged

Ben doesn't rate difficulty — he engineers it in the prose. The dials:

- **Easier:** more scaffolding (hook + two clues + wink all pointing the same way), broader category noun, more famous answer, recency ("this past week…").
- **Harder:** strip to one clue, deepen the cut (championship shows use the same anatomy but reach further — "the only Best Actor surname shared by two winners"), narrow the category noun, require a name instead of a category.
- **Bonus-tier:** either a single deep-lattice question or a list: "For ten points each, name the five…" (the second bonus is almost always a 5-item list with a scoring frame).

## Hint Audit

The Second Clue and Trailing Wink (anatomy items 4–5) are hints, and the bank proves it: two independent minings of the `questions` table (Aug 2026, 1,883 rows) found "as a hint" once, ever, and zero occurrences of "if that helps," "as a clue," "bonus point." A hint that announces itself has already failed — the bar can't tell it's being helped until after it works. Hints work by quoting the answer's own culture in that culture's own voice, with zero connective tissue explaining the bridge.

**Default to doing nothing.** A question with two independent routes across two knowledge domains already has its hint built in — audit before adding, and "no hint needed" is the expected output, not a cop-out.

**Position matters more than wording.** HEAD (before the question, compressed — 138 rows in the bank, 32 under 25 characters) reads as native color. TAIL (after the `?` — 383 rows, 274 of them over 90 characters) is where hints go long and start sounding like homework. Default to head; reach for tail only when the joke needs the answer's shape already in the ear.

**The em-dash is not this voice.** One occurrence in 1,526 `regular` rows, and it's a test row. Set-off punctuation is the ellipsis and the exclamation point.

Full carrier taxonomy (ranked punchiest first, with bank examples), anti-patterns, and the audit procedure — including the mishearing check, the highest-value single step in the whole thing: **`references/hint-carriers.md`** — read it before auditing an existing question for hints or drafting a hint for a fresh one. Complements `references/question-anatomy.md` §2–3 (hook/wink authoring taxonomy) rather than replacing it — that file is about writing hooks and winks from scratch; this one is about auditing what's already on the page and picking the shortest carrier that survives verification.

## Voice & Register

- PG-13 bar comedy: puns, groaners, mild profanity when it lands, roast energy in special rounds. "Your momma is so old, her breast milk is powdered!" is a real hook (→ Tiffany's silver standard).
- **Local anchors:** Michigan and Saginaw-area references recur constantly — Tigers, MSU/UofM, Michigan breweries (Shorts, Founders, Bell's), Mackinac, the UP, Saginaw businesses. When a fact has a Michigan angle, USE IT.
- **House lore:** Ben, his dad Shawn, the Coughlin family, and Baynes itself appear as recurring characters, especially in swing rounds ("Shawn's Big Day," "Ben's historic road trip"). Personal-lore rounds mix a family anecdote with a verifiable trivia fact per item.
- Spelling/typos in the bank are Ben writing fast for reading aloud, not artifacts — write clean but FRAGMENTARY: notes-page lines, not polished paragraphs.
- Questions are read ALOUD. Favor rhythm, spoken punctuation (em-dashes, ellipses), and words that are fun to say. Avoid anything that only works in print.

## Show Structure (what slots you're writing for)

Current weekly skeleton (2026): **R1, R2 (question rounds) → R3 Swing Round → R4 Press! Your! Luck! → R5 (question round) → Bonus (2 questions)**. Each question round = 4–6 standalone questions + 1–2 named-format ("shiny") questions. Themed nights and championships keep the skeleton; championships cut deeper, themed nights keep every question on-theme while still bridging domains.

- **Swing round:** one concept, 6–9 items, uniform answer format within the round. The concept itself is the creativity showcase — see `references/format-library.md` for the 40+ concept catalog (fauxbituaries, children's-book opening lines, poorly described plots, band-name origins, one-star landmark reviews, haikus, mean tweets…). New swing concepts are prized; propose fresh ones in this spirit.
- **Press Your Luck:** 6 independent items under one punchy topic with a twist in the title ("Operation ailments with no bones in the name," "movie product placements," "Michigan birds"), roughly half of real boards being picture or audio ID. Teams submit all 6 at once: a perfect 6/6 pays 20 per answer, one miss drops every correct answer to 10 — that gamble is the round. Boards are NOT required to be closed/complete lists (that framing was retired 2026-08-23; "Weapon of Choice" and "Mascot Examples" are curated and real). Boards repeat across a few consecutive weeks, then rotate. Full doctrine: `references/format-library.md`.
- **Bonus:** Q1 = one deep single question; Q2 = "for ten points each, name the N…" list.
- **Appendix A rounds:** visual name-that-X lists (20+ items) ending in a "Redemption" item.

## Named Format Library (shiny questions)

Recurring in-round formats with their own rules — "We're not so different, you and I…" (find what 4 things share), Tri Bond (three clues, one word), Singonyms (lyrics re-worded with synonyms), Where in the Hell is Carmen San Diego, Pixelate!, Did you tape the instructions? (name the thing from its parts list), One Hit Un-Wonder, Map Maker Map Maker, Put Me In Coach, Kevin James Zookeeper, Song by the Scene, Title Drops, Name! That! X!… Full catalog with per-format rules and examples: **`references/format-library.md`** — read it before writing any shiny question, swing round, or PYL board.

**Hard constraint on any NEW shiny format** (learned the hard way 2026-07-17 — see rule 7 below): it must be answerable by writing ONE thing down on paper. Read it before proposing a new one, not after.

**On the *Um, Actually* Fandom wiki (`um-actually.fandom.com/wiki/Shiny_Questions`):** yes, several of Ben's existing named formats (Cryptogeography, Name! That! X!, Hear! Me! Roar!, Map Maker Map Maker, Pixelate!, Once more without feeling…) trace back to that page — but **Ben has read that page exhaustively himself and does NOT want any new format ideas sourced from it, even loosely adapted or disguised.** He will recognize it. Do not fetch it, mine it, or use it as inspiration for new concepts — a batch of five direct-but-simplified ports was rejected outright on this basis alone (2026-07-18), independent of whether the mechanics were otherwise sound. If new shiny ideas are needed, build from Ben's OWN corpus DNA instead (see `references/format-library.md`'s rejection history) and strictly pop-culture/show-centered content — real-world trivia (patents, legal history, celebrities' civilian jobs) reads as "too trivial" and also gets rejected. No word-puzzle mechanics (anagrams, charades, thesaurus-decodes, portmanteau/mashups) either. **Display constraint:** shows run on big TVs viewed by up to 30 teams at bar distance — formats requiring fine visual detail (spot a small edited detail, read small text) don't work at that scale; keep visuals bold/large (like existing Pixelate, Rogues Gallery) or go audio/text-only. See [[feedback_trivia_night_shiny_format_design]] for the full rejection history.

## The Notes Page (idea capture pipeline)

Ben's raw material lives in a running notes page: fragmentary, stacked-line captures jotted when he hears a fun fact, harvested later when writing that week's show. A real entry looks like:

```
City in Mississippi
Tupelo
Lends its name to a popular type of honey
Van morrison
Elvis hometown
```

That's one answer (Tupelo) with THREE bridge candidates already stacked (honey, the Van Morrison song, Elvis's birthplace) — a question waiting for phrasing, not a finished question. **When generating fact lists or question ideas, produce material in this shape**: answer + every bridge you can find, stacked. More bridges = more phrasing options and difficulty dials later. A fact captured with zero bridges is a note-to-self to keep digging, not a dead entry.

The notes page also contains **format seeds** ("Kidz Bop lyrics — give lyrics to the kids version, name song"; "IMDb buzz words — give 3, guess movie") and **meta ideas** (using AI to generate shiny content: AI band images, AI song covers, "ask Claude to describe something but drunk"). Treat proposed new shiny/swing concepts as first-class output alongside facts.

**Fact-source habits worth mirroring when hunting (re-weighted 2026-09-02 — the old list read as "find obscure corners," which is exactly the wrong instruction):** fandom wikis and episode guides for the wells in `taste-profile.md`; Genius and lyric annotations; IMDb trivia/goofs; Disney park history sites; the Toy Hall of Fame, RRHOF, Grammy/Oscar/Billboard record books, Walk of Fame; band/brand/toy/mascot name-origin interviews; minor-league mascot pages; MLive and the Free Press for Michigan; this week's deaths/news/sports; ranked lists from a NAMED source (Rolling Stone, IMDB, Guinness, Forbes, People, Bleacher Report); Easter eggs in LEGO sets and games; deleted scenes and production legend; "only/first/last" record lists; word origins WITH a pop-culture twin. Secret-service code names and the Ig Nobels stay as a minor corner (both produced used facts). Dropped: diner slang, kangaroo words, NATO-alphabet trivia, BGG top-50, parental-guide text — obscure subjects with no fandom door.

**Search tool for hunting: Exa MCP (`web_search_exa`, `web_fetch_exa`).** Added 2026-09-02. It is neural, not keyword — so describe the SHAPE of the fact you want in a sentence and it finds pages that match the idea. That is the whole reason it's here: keyword search returns the famous surface of a subject, which is exactly what a bar table already knows, while a described shape surfaces the deep cut inside the famous thing (gate 1). Ask for what you actually want:

- "obscure production detail about a beloved 90s animated film that connects to a famous musician" — a shape, not keywords
- "band name origin that comes from a misheard phrase" — the second-door pattern (gate 2) stated directly
- Keyword-shaped queries ("Kit Kat facts") get you listicles, which rule 7 already tells you to distrust

`web_fetch_exa` pulls a page back as clean markdown — use it to read the primary source itself rather than trusting a search snippet, which is where half of rule 7's quietly-wrong facts come from.

This does NOT relax gates 6 and 7. Exa is better at FINDING candidates; it is not a verifier. Every fact still needs two independent sources, and a superlative still needs a date. A single Exa result is a lead, not a verified fact.

## Question Bank Integration

The canonical store is the `questions` table (Supabase project `qwtbgusqfoypvehnungr`). **Real columns, verified 2026-07-17 against 1,901 live rows** (bulk-imported 2026-07-06 through 2026-07-15 from the legacy archive): `id, type (regular|shiny|swing|pyl|list), text, answer, is_bonus, is_shiny, shiny_type (image|text|audio|list|grid|video), shiny_format_name, questions_data (jsonb — list-shaped items for swing/pyl/multi-part shiny), created_at`.

The schema also defines `category`, `round_type (normal|swing|pyl)`, `used_on date[]`, `show_title`, `show_date`, `round_title`, `subtitle`. **Corrected 2026-08-25** (the prior 2026-07-17 note here was wrong about `category`): `category` is populated on 1,514/1,948 rows (77.7%), present from the original 2026-07-06 bulk import onward — not a later backfill. It's free-text, comma-separated tags per row (e.g. `"Elvis Presley, classic cars, 1980s music, wordplay"`), **not a fixed taxonomy** — don't treat values as an enum. Validated by hand against 30 random tagged rows: tags consistently name the question's *bridge/setup domains*, not the literal answer (zero outright misclassifications). Use it as the primary repeat-avoidance/similarity signal — "did Ben already run this angle," not just this exact answer — and as directional input for topic-fingerprint work, not as ground truth. `round_type` is still null on ~92% of rows and `used_on` is still empty on every row — those two 2026-07-17 findings hold. Flag (don't silently fix) any data-quality issue you notice, since these are production rows.

What actually works today:
- **Slot-fitting:** use `type` + `is_bonus` + `is_shiny` to know what a candidate question is for.
- **Named-format frequency:** `shiny_format_name` is well-populated (231/233 shiny rows) — `select shiny_format_name, count(*) from questions group by 1 order by 2 desc` tells you what's overused vs. fresh before proposing a shiny slot. See `references/format-library.md` for the standing frequency table (as of 2026-07-17: "We're not so different, you and I…" alone is ~24% of all shiny questions ever run).
- **Repeat-avoidance:** since `used_on` can't help, text/answer-match against the bank instead — `where answer ilike '%<candidate answer>%'` — before proposing a standalone question.
- **Bank analysis:** format-mix trends via `shiny_format_name`, staleness ("current record holder" questions age) via re-reading `text` for dated superlatives, reuse patterns via `answer` matching. Category-balance analysis isn't possible until that column is backfilled.

**High-recurrence answers (from a July 2026 two-year docx-archive review, 87 shows) — check before reusing:** Ludicrous, Apothecary, Headless Horseman, Kenny Loggins, Regina George, Jack Nicholson. Most repeats trace to legitimate private/corporate-gig reuse (Anderson Eye, Freeland, Dow — verbatim reuse between weekly shows and private gigs is standard and fine), but a few land inside the weekly rotation itself — that's the one to avoid. Verbatim reuse *within* the weekly Baynes rotation is the only hard no.

**Shiny format frequency, measured across the full docx archive (count = shows featuring the format, not individual rows — a different unit than the DB-based table in `format-library.md`, but the same signal):** Weekly staple — We're not so different (61 shows, near-every week). Regular rotation — One Hit Un-Wonder (29), Pixelate (29), Tri Bond (20), Singonyms (18), Name! That! X! (17), Map Maker (15). Occasional — Carmen San Diego (12), Title Drops (12), Song by the Scene (9), Put Me In Coach (7), Kevin James Zookeeper (7), Did You Tape the Instructions (6). Don't propose two staples in one round; prefer resting a format that ran the previous week. **⚠ This table disagrees with the DB row counts for three formats — One Hit Un-Wonder, Put Me In Coach, and especially Map Maker (zero DB rows despite 15 shows here) — see `format-library.md`'s "UNRESOLVED" note before treating either count as this format's real recent-use rate.**

**PYL boards already run in 2026 (don't re-propose soon):** Operation ailments with no bones in the name · Ben Stiller (filmography) · Boat music · Weapon of choice · Most photographed buildings (NYT × NatGeo) · BNAS · Deadliest Warrior (VS edition) · Birds · Movie Boosts (product placements) · Did You Tape the Instructions (board-game parts) · Sitcom workplaces · State nicknames.

## Output Templates

**When proposing question ideas / fact lists,** deliver each as:
> **Fact:** [the verified surprising fact, with source noted]
> **Bridge:** [the crossover/second clue found]
> **Draft question:** [full question in the anatomy above]
> **Answer:** [one crisp line] · **Fits:** [category / round_type / slot]
> **Staleness:** [none / re-verify by DATE if superlative-based]

**When punching up an existing question:** diagnose against the anatomy (missing hook? no second clue? answer not by-ear gradeable? two defensible answers?), then rewrite.

**When asked for "facts to write about" (and for every automated hunter):** don't dump raw facts and don't draft questions — deliver each fact in the NOTES-PAGE shape (see below): answer on line 1, 2–5 fragments of ≤15 words, typed doors (`name:` / `line:` / `ask:` / `mi:` / `hook:`), `media:` if a clip or photo exists, and a five-word `Shout:` line — so every item is a question waiting to be phrased. The "Draft question" line in the template above is for chat use when Ben explicitly asks for drafts; the fact-hunt pipeline never fills it.

## Hard Rules

1. Verify every fact and every crossover claim via web search before it ships. No exceptions, including "well-known" facts.
2. Never propose a question with a disputable answer without flagging the dispute.
3. Answers must be gradeable by ear in seconds — no spelling-dependent answers, no "accept any of these seven."
4. Keep the destination familiar. If the answer needs explaining, it's the setup, not the answer.
5. Match the slot: standalone questions get the full anatomy; swing/PYL items follow their round's uniform format; shiny questions follow their named format's rules.
6. **New shiny formats must be paper-answerable.** One definitive answer per question, gradeable in seconds, written on paper — never an open-ended brainstorm (that's what killed a whole batch of proposed formats 2026-07-17: they read as digital-app puzzles — crossword fill-in, Wordle-style tile guessing, NYT-Connections-style grouping, Immaculate-Grid-style interactive cell picking, Battleship-style turn-based reveal). No app, no device, no fill-in-grid, no turn-based back-and-forth. Also avoid Scattergories-shaped formats (open, multi-item, slow to run) unless explicitly asked for — Ben already has Scattergories and finds it too time-consuming to want more like it. The bar: a new shiny format should feel like a sibling of "We're not so different, you and I…" or "Cryptogeography" — a short clue or clue-set, one crisp named answer, done.
