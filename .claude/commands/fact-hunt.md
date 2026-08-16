---
description: Deep-study the trivia-os question bank to learn Ben's voice, topics, and reference universe, then research-loop the web until 100 verified, bridged facts matching that profile exist — delivered as an organized Word doc
allowed-tools: Read, Write, Edit, Grep, Glob, Skill, Task, Agent, TodoWrite, WebSearch, WebFetch, Bash, mcp__supabase__execute_sql, mcp__supabase__list_tables
disable-model-invocation: true
---

# /fact-hunt — study Ben's corpus, then bank 100 verified facts in his taste

Purpose: **high-season question banking.** When shows come weekly and there's no research time, this run stocks the larder. The bank is NOT the fact source — it's the **teacher**. Study how Ben writes, what he writes about, which reference universes he returns to, then go find 100 NEW facts from the web that feel like they were always going to be his. Every fact bridged, verified, non-colliding. Output = one Word doc of raw material — facts + stacked bridges in notes-page shape. **Never draft questions; Ben rewrites everything himself.**

## Resume check — FIRST, before anything

If `FACT-HUNT-PROGRESS.md` already exists in cwd: this is a **resume**, not a fresh run. Read it. Rules:

- The **last** `running count: N/T` header in the file is authoritative; earlier round headers and prose notes are historical. If the last round shows N ≥ T, do NOT silently start more research — ask Ben: build the Word doc for that round, or open a new round?
- If the Taste Profile section is complete, do NOT redo Phase 1 — load the skills (Phase 0) and jump to Phase 2 from the authoritative tally.
- Rebuild the dedupe corpus as: bank answers + **every accepted answer already in the progress file + every tombstoned answer**. It lives in `FACT-HUNT-DEDUPE.md` in cwd (fixed name, never /tmp) — re-pull only if that file is absent.
- **Concurrency guard:** if the progress file's last entry is younger than ~1 hour and this session didn't write it, another `/fact-hunt` session may be live — stop and ask Ben before dispatching anything (two sessions racing one ledger already happened 2026-07-22; 4 collisions).
- Start fresh only if the file is absent or Ben says "fresh hunt" (archive the old file as `FACT-HUNT-PROGRESS-<date>.md` first).

## Phase 0 — Load style + skills (mandatory, in order)

1. **Read `references/fact-hunt/trivia-questions.md`** (repo-local snapshot of the trivia-questions skill) — the fact-finding filter, question anatomy, bank schema, output template. Everything below assumes it. This is a FILE READ, not a skill load — do not report it loaded unless the Read actually returned content. If a `trivia-questions` *skill* also happens to be available, it supersedes the snapshot on conflict. `references/fact-hunt/format-library.md` and `question-anatomy.md` sit alongside for depth — read them if judging shiny/swing/PYL fit.
2. `dispatching-parallel-agents` skill (`~/.agents/skills/dispatching-parallel-agents/SKILL.md`) — load before Phase 2 (parallel dispatch is required).
3. Word-doc tooling — Phase 4 only (research first, format later): use the `docx` skill if available; otherwise build the .docx via `pandoc` or python-docx through Bash. Do not block on a missing skill.

Create a TodoWrite list mirroring the phases below. Create `FACT-HUNT-PROGRESS.md` in cwd **if absent** as the running ledger (on resume it already exists — append only, never rewrite; use Edit, not Write, for flushes): tally, per-domain counts, every accepted fact appended immediately after verification.

## Phase 1 — Corpus study (learn Ben before hunting for Ben)

Supabase project `qwtbgusqfoypvehnungr`, table `questions` (~1,900 rows). Real usable columns: `type, text, answer, is_bonus, is_shiny, shiny_format_name, questions_data`. `category`/`used_on`/`round_type` are effectively empty — do NOT use them (per trivia-questions skill).

This phase is the point of the command. **Read the actual question text at scale — hundreds of rows, not a 20-row sample.** Pull in pages (`select id, type, text, answer from questions order by id limit 300 offset N;`) until you've read enough that new pages stop teaching you anything (expect to read 800+ rows; read all ~1,900 if context allows — dispatch an Explore/general-purpose subagent per page-range and merge findings if needed).

Build a written **Taste Profile** in `FACT-HUNT-PROGRESS.md` covering, with real examples quoted from the bank:

1. **Topic fingerprint:** which domains recur and in what proportion — bucket every answer you read into the domain wheel (below) and record actual percentages. Note the sub-obsessions inside domains (e.g. not "music" but *which eras, which genres, one-hit wonders vs. legends*).
2. **Reference universe:** the specific wells he returns to — Michigan/Saginaw anchors, which decades of pop culture, which franchises, which sports, house lore (Shawn, the Coughlins, Baynes itself). List them concretely; new facts that can touch these wells score higher.
3. **Anatomy stats:** roughly how often questions open with a hook, carry a trailing wink, use "shares its name with…" vs. "you could ask X…" bridge phrasings — the moves, with three quoted examples of each.
4. **Texture habits:** how he deploys numbers/years/proper nouns; typical question length; spoken-rhythm patterns (em-dashes, ellipses, ALL-CAPS sound effects).
5. **Answer-familiarity calibration:** how famous is a typical answer? Quote five typical answers and five deepest-cut answers to bracket the range.
6. **Dedupe corpus:** all answers (`select id, answer from questions;`) held for collision checks — the repeat-guard for Phase 2.
7. **Answer-frequency:** `select lower(answer), count(*) from questions group by 1 having count(*) > 1 order by 2 desc;` — 2+ appearances = hard-avoid this session (plus the skill's known-repeat list: Ludicrous, Apothecary, Headless Horseman, Kenny Loggins, Regina George, Jack Nicholson).
8. **Gap read:** domains/wells that are thin relative to what plays well — thin spots get extra quota in Phase 2.

The Taste Profile is the steering document for everything after. A fact that would pass generic gates but doesn't sound like the profile is a **reject**.

## Phase 2 — Research loop

Target: **100 accepted facts per round**. Work in waves (2–3 subagents × ~10-fact quotas each) until the round's tally hits its target.

**Domain wheel** — spread across, weighted by the Taste Profile's actual topic fingerprint (match his proportions **compressed under the ~15/domain cap; overflow quota goes to the thin spots**): history · science/nature · sports · music · film/TV · geography · food/drink/brands · words/etymology · Michigan/local · records/onlys/firsts/misc.

**Hunting grounds** (from the skill's fact-source habits): IG Nobel Prizes, origin stories of names/brands/bands, "only/first/last" record lists, secret-service code names, word etymologies with modern crossovers, LEGO/game Easter eggs, production trivia and deleted scenes, obscure institutional datasets, kangaroo words, diner slang, this-month's news/deaths/sports for topical hooks. Search these corners — not "50 amazing facts" listicles. **Reddit (via `agent-reach`):** r/todayilearned, r/interestingasfuck, r/AskHistorians, r/AskScience — especially strong for the thin domains (sports, food/drink, games/toys); top comments often hand you a bridge for free. Raw material only — never count the thread as one of the two verification sources, trace the claim to what it cites or find an independent one.

**Per-candidate gates** (all must pass before verification is even attempted):
- Familiar destination — answer producible by a bar table by ear.
- **At least one bridge found** — second independent route to the same answer, ideally cross-domain. Zero bridges = keep digging or drop.
- One unambiguous, ear-gradeable answer.
- Interesting even if missed — the reveal entertains.
- **Sounds like the Taste Profile** — touches at least one of his wells, or fits his topic fingerprint; a generic pub-quiz fact that any host could use is a reject even if true and bridged.
- Not in the dedupe corpus (`answer ilike` check against Phase-1 pull) and not already accepted this session.

**Parallelism (required, not optional):** dispatch research via subagents (Task tool, `general-purpose` type) — 2–3 at a time on disjoint domain slices, in waves. Each subagent prompt must include: **an instruction to first Read `references/fact-hunt/trivia-questions.md` (absolute path)** — cheaper and more faithful than pasting the style rules, and subagents can Read files — plus its domain slice + quota, the Taste Profile (paste the relevant sections verbatim — this lives only in the progress file, not the reference), the answer-only dedupe list, the per-candidate gates, Phase 3 verification rules, the exact output template, **the Fits-category definitions (regular = standalone full-anatomy slot · shiny-seed = fits a named format · swing-seed = could anchor a 6–9-item uniform round · PYL-seed = complete/bounded 6-item list potential · bonus-tier = deep-lattice or "name the N" list), and the explicit rule: facts + stacked bridges only, NEVER draft questions.** Subagents verify their own batches and return finished entries; the main agent's job is orchestration, **wave-merge intake (reject any returned entry with fewer than 2 named sources, or a bridge no source covers — bounce it, don't ledger it)**, cross-batch dedupe (collisions between subagents are the known failure mode), and flushing to the progress file between waves. Do the hunting inline yourself only if subagent dispatch is genuinely unavailable in the session — and say so in the progress file.

**Crash hardening (a real run stalled here 2026-07-22 mid-hunt):** append accepted entries to `FACT-HUNT-PROGRESS.md` after EVERY wave, not at the end — the progress file is the only thing that survives. Keep the dedupe corpus in `FACT-HUNT-DEDUPE.md` in cwd (fixed name — not `/tmp`, not context) and pass subagents only the answer list, not the full question text. If context is running low mid-hunt, stop dispatching, flush everything accepted so far to the progress file, and tell Ben to rerun `/fact-hunt` to resume — a partial bank that resumes beats a full bank that never lands.

**Dedupe-file sync (mandatory, every wave, not optional):** `FACT-HUNT-DEDUPE.md` is a collision corpus, not a report — a round that finishes without updating it silently sets up the *next* round to re-find and re-verify the same facts. Every time you flush accepted entries to `FACT-HUNT-PROGRESS.md`, in the same step append that wave's newly accepted answers to `FACT-HUNT-DEDUPE.md` (Edit, not Write — never overwrite what's there). This applies whether the round finishes clean or gets cut short by context limits — a partial flush to the progress file with no matching dedupe update is an incomplete flush.

## Phase 3 — Verification (every fact, no exceptions)

- Verify the setup fact AND each bridge **independently** via web search: Wikipedia + one non-listicle independent source. Two sources disagree = fact dead (or the dispute IS the question — flag it as such). If the fact has a clean encyclopedic anchor (person/event/org/work), prefer `mcp__wikipedia__*` and `mcp__wikidata__*` (SPARQL for structured claims like dates or "first/only" records) over prose re-reading.
- Never verify against another listicle.
- Superlatives/"current/most/latest" claims: verify as of today, and stamp a re-verify-by date in the entry.
- Record each source as a real URL (not just an outlet name) — the entry must be traceable back to the page that verified it.
- A fact that fails verification does not count toward 100. If it's a widely-believed claim that just turned out false, write it up as a `myth-bust` entry instead of discarding it (tag it `myth-bust` in Fits) — the correction is often better material than the myth. Otherwise it gets a one-line tombstone in the progress file (prevents re-hunting it).
- Append each accepted entry to `FACT-HUNT-PROGRESS.md` immediately, and its answer to `FACT-HUNT-DEDUPE.md` in the same step.

## Phase 4 — Word doc

Only now load Word tooling (docx skill if available, else pandoc/python-docx via Bash). Create `~/Desktop/Trivia/Fact Hunts/` if absent, then build `~/Desktop/Trivia/Fact Hunts/fact-hunt-YYYY-MM-DD.docx` — if that filename already exists (multi-round day), suffix `-2`, `-3`, … Never overwrite.

- Title page line: date, round, tally, domain distribution.
- One section per domain, entries numbered continuously from the round's starting index (round 1: 1–100; later rounds continue where the ledger left off).
- Each entry, exactly this shape (notes-page style — answer + stacked bridges, per the skill's output template):

> **N. [ANSWER]** — *[domain]*
> **Fact:** [verified surprising fact, with concrete texture — numbers, years, proper nouns]
> **Bridges:** [every independent route found, stacked one per line]
> **Sources:** [≥2 URLs; note which source verifies which bridge]
> **Tags:** [lowercase tags, reused across rounds where possible: food-drink, games-toys, michigan, myth-bust, brands, history, music, words, science, sports, records, movies, tv, geography]
> **Fits:** [regular / shiny-seed / swing-seed / PYL-seed / bonus-tier]
> **Staleness:** [none | re-verify by DATE]

- Appendix A (if any): Format Seeds — new shiny/swing/PYL format *ideas* that surfaced while hunting (per the trivia-questions skill's notes-page pipeline) — plus any reserve facts over quota.
- Appendix B: tombstoned facts (failed verification) — so next hunt skips them.

## Phase 5 — Verify before done

Load `verification-before-completion`. Confirm: doc exists and opens, entry count = the round's target, every entry has ≥1 bridge + ≥2 URL sources, zero answers collide with the bank corpus, progress file matches doc, and every accepted answer this round is present in `FACT-HUNT-DEDUPE.md` (grep the doc's answer list against it — any miss is an incomplete flush, fix before reporting done). Spot-read 10 random entries against the Taste Profile — is this a fact Ben would have jotted on his notes page? Only then report done, with the doc path and a 5-line highlight reel of the best finds.

**Do NOT draft questions.** The deliverable is raw material in notes-page shape — Ben writes the questions himself. Facts + stacked bridges only.
