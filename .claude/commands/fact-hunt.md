---
description: Deep-study the trivia-os question bank to learn Ben's voice, topics, and reference universe, then dual-track research (web/wiki + agent-reach video/podcast/reddit) until 100 verified, bridged facts matching that profile exist — written straight into the fact_hunt_entries Supabase table for the fact browser UI
allowed-tools: Read, Write, Edit, Grep, Glob, Skill, Task, Agent, TodoWrite, WebSearch, WebFetch, Bash, mcp__supabase__execute_sql, mcp__supabase__list_tables
disable-model-invocation: true
---

# /fact-hunt — study Ben's corpus, then bank 100 verified facts in his taste

Purpose: **high-season question banking.** When shows come weekly and there's no research time, this run stocks the larder. The bank is NOT the fact source — it's the **teacher**. Study how Ben writes, what he writes about, which reference universes he returns to, then go find 100 NEW facts from the web (and YouTube, podcasts, Reddit) that feel like they were always going to be his. Every fact bridged, verified, non-colliding. Output = rows in Supabase (`fact_hunt_entries`), browsable in the fact browser UI. **Never draft questions; Ben rewrites everything himself.**

Two ways to run this:
- **Full round** (default, no arguments): Phase 0–5 below, in full — corpus (re-)study if needed, both worker tracks, domain-deficit math, source scoring, 100-fact target.
- **`/fact-hunt quick [N]`** — a fast top-up. See "Quick mode" after Phase 0. Use it for a casual "grab a few more facts" ask, not for a real round.

## Resume check — FIRST, before anything (full round only; quick mode has its own short-circuit)

There is no more Word-doc-driving progress file to check for completeness — the facts themselves live in Supabase now, per-wave, so a crash mid-round only loses in-flight wave state, never accepted facts. What you check on startup:

1. **Is a round already running today?**
   ```sql
   select agent, domain, count(*) as n, max(created_at) as last_write
   from fact_hunt_entries
   where round_date = current_date
   group by agent
   order by last_write desc;
   ```
   - If a row's `agent` matches a pattern like `fact-hunt-<today>` and its `last_write` is **older than ~1 hour**, that run is dead/finished — treat its count as this round's starting tally and resume from there (don't re-research what's already in the table; pull its answers into today's dedupe set).
   - If a row's `last_write` is **younger than ~1 hour** and its `agent` value isn't the one you're about to use for this session, another `/fact-hunt` session is likely live right now. **Stop and ask Ben** before dispatching anything — this is the same collision class that hit the old ledger on 2026-07-22 (4 collisions from two sessions racing one file); Supabase rows don't prevent the same race, they just make it easier to detect.
   - If nothing exists for today, this is a fresh round: tally starts at 0/100.
2. **Local crash-recovery scratch file:** keep a lightweight `FACT-HUNT-PROGRESS.md` in cwd purely for mid-round bookkeeping — Taste Profile notes (so you don't re-run Phase 1 if Phase 1 already completed this session or very recently), in-flight wave state (which domain slices are dispatched, which subagents haven't reported back), and the running tally mirror. This file is a convenience cache, not the source of truth — the source of truth for accepted facts is always `fact_hunt_entries`. If the file is missing or stale (Taste Profile section absent or from a different date), redo Phase 1.
3. **Dedupe corpus** — pull fresh each round from Supabase (cleaner than a local file now that the bank and the round both live in the same table):
   ```sql
   select lower(answer) as answer from questions
   union
   select lower(answer) as answer from fact_hunt_entries;
   ```
   This is the live repeat-guard for every candidate, in both Phase 1's legacy bank and everything already banked by prior `/fact-hunt` rounds. Re-run this query at the start of each wave (cheap) rather than trusting a stale in-memory copy, since Track 1 and Track 2 are writing concurrently.
4. **Agent identifier for this run:** mint `fact-hunt-<YYYY-MM-DD>` (append `-2`, `-3`… if a prior run today already used the base name and has since gone stale/dead per step 1) — every row this session inserts carries this in the `agent` column. This is what makes the concurrency check in step 1 and the promotions/demotions report in Phase 5 possible.

## Phase 0 — Load style + skills (mandatory, in order)

1. **Read `references/fact-hunt/trivia-questions.md`** (repo-local snapshot of the trivia-questions skill) — the fact-finding filter, question anatomy, bank schema, output template. Everything below assumes it. This is a FILE READ, not a skill load — do not report it loaded unless the Read actually returned content. If a `trivia-questions` *skill* also happens to be available, it supersedes the snapshot on conflict. `references/fact-hunt/format-library.md` and `question-anatomy.md` sit alongside for depth — read them if judging shiny/swing/PYL fit.
2. `dispatching-parallel-agents` skill (`~/.agents/skills/dispatching-parallel-agents/SKILL.md`) — load before Phase 2 (parallel dispatch is required, and now two tracks run at once).
3. `agent-reach` skill — mandatory Phase 0 load now that Track 2 (below) depends on it end to end. Read its SKILL.md and the platform-specific reference docs you'll actually need (`references/video.md` for YouTube/podcast, `references/social.md` for Reddit) for the real invocation syntax — **do not guess commands**. Note in particular: YouTube subtitles/search via `yt-dlp` (no login needed for search/subs), Reddit via `opencli reddit search` (desktop) or `rdt search` (server-side) depending on `agent-reach doctor --json`'s reported backend, podcasts via 小宇宙 `transcribe.sh` for Xiaoyuzhou-hosted episodes — for English-language podcasts without a Xiaoyuzhou mirror, fall back to the show's own site/RSS via `references/web.md`'s Jina Reader pattern, or `agent-reach transcribe` on a public audio URL.

Word-doc tooling is gone — nothing to load for Phase 4 anymore; it's a direct Supabase write.

Create a TodoWrite list mirroring the phases below. Create/refresh `FACT-HUNT-PROGRESS.md` in cwd as described in the resume check above (Taste Profile + in-flight wave state only — never the accepted facts themselves).

## Quick mode — `/fact-hunt quick` or `/fact-hunt quick N`

For a casual top-up ask ("grab a few more facts," not a real research day). Default N = 10 if not given.

- **Skip** the resume check's full mechanics beyond a single freshness check: if `FACT-HUNT-PROGRESS.md`'s Taste Profile section exists and is from today or the last few days, reuse it as-is — do not re-run Phase 1's corpus study.
- If there is no usable Taste Profile at all (first-ever run, or file absent), quick mode still needs *something* to steer by — pull a fast, cheap version: `select domain, count(*) from questions group by 1;`-style skim (a few hundred rows, not 800+) rather than the full Phase 1 read. Note in the report that this was an abbreviated profile.
- **Skip** the dual-worker split and the domain-deficit/source-scoring machinery in (b)/(c) entirely — Track 1 (web/Wikipedia/Wikidata) only, single subagent or inline if a subagent isn't warranted for N this small, quota = N.
- **Do not skip** Phase 3 verification (every fact, no exceptions, same gates) or the Supabase write (Phase 4, below) — quick-mode facts are real facts and go into `fact_hunt_entries` with `agent = 'fact-hunt-quick-<YYYY-MM-DD>[-2...]'` the same as a full round, so they count against future dedupe and deficit math.
- Report done the same shape as Phase 5 but scaled down — no promotions/demotions section is expected (Track 2 never ran), just tally, entries, and a pointer to the fact browser UI.

Use quick mode when: Ben wants a handful of facts for tonight, mid-week top-up, "we're 6 short for Friday." Use a full round when: it's the weekly high-season banking session, the taste profile is stale/absent, or the target is the full 100.

## Phase 1 — Corpus study (learn Ben before hunting for Ben)

Supabase project `qwtbgusqfoypvehnungr`, table `questions` (~1,900 rows). Real usable columns: `type, text, answer, is_bonus, is_shiny, shiny_format_name, questions_data`. `category`/`used_on`/`round_type` are effectively empty — do NOT use them (per trivia-questions skill).

*(Note: the same Supabase project, `qwtbgusqfoypvehnungr`, also now holds `fact_hunt_entries` and `fact_hunt_sources` — everything below lives in one project. Never use project id `dreggwinegtirxxanntv`, which shows up elsewhere in this repo's docs — it is not this project.)*

This phase is the point of the command. **Read the actual question text at scale — hundreds of rows, not a 20-row sample.** Pull in pages (`select id, type, text, answer from questions order by id limit 300 offset N;`) until you've read enough that new pages stop teaching you anything (expect to read 800+ rows; read all ~1,900 if context allows — dispatch an Explore/general-purpose subagent per page-range and merge findings if needed).

Build a written **Taste Profile** in `FACT-HUNT-PROGRESS.md` covering, with real examples quoted from the bank:

1. **Topic fingerprint:** which domains recur and in what proportion — bucket every answer you read into the domain wheel (below) and record actual percentages. Note the sub-obsessions inside domains (e.g. not "music" but *which eras, which genres, one-hit wonders vs. legends*). **This is the authoritative baseline that Phase 2's domain-deficit floor (change b) reads from — record it as a clean domain→percentage table so it's copy-pasteable into that math, not just prose.**
2. **Reference universe:** the specific wells he returns to — Michigan/Saginaw anchors, which decades of pop culture, which franchises, which sports, house lore (Shawn, the Coughlins, Baynes itself). List them concretely; new facts that can touch these wells score higher.
3. **Anatomy stats:** roughly how often questions open with a hook, carry a trailing wink, use "shares its name with…" vs. "you could ask X…" bridge phrasings — the moves, with three quoted examples of each.
4. **Texture habits:** how he deploys numbers/years/proper nouns; typical question length; spoken-rhythm patterns (em-dashes, ellipses, ALL-CAPS sound effects).
5. **Answer-familiarity calibration:** how famous is a typical answer? Quote five typical answers and five deepest-cut answers to bracket the range.
6. **Dedupe corpus:** superseded by the resume check's live Supabase union query (bank + `fact_hunt_entries`) — no separate local pull needed here.
7. **Answer-frequency:** `select lower(answer), count(*) from questions group by 1 having count(*) > 1 order by 2 desc;` — 2+ appearances = hard-avoid this session (plus the skill's known-repeat list: Ludicrous, Apothecary, Headless Horseman, Kenny Loggins, Regina George, Jack Nicholson).
8. **Gap read:** domains/wells that are thin relative to what plays well — thin spots get extra quota in Phase 2, and feed directly into the domain-deficit floor below.

The Taste Profile is the steering document for everything after. A fact that would pass generic gates but doesn't sound like the profile is a **reject**.

## Phase 2 — Research loop (two tracks, every round, always)

Target: **100 accepted facts per round.** Work in waves until the round's tally hits its target. **Every full-round invocation dispatches both worker tracks in parallel from the start — this is not tiered or optional.** (Quick mode is the only exception; see above.)

**Split:** of the round's 100-fact target, **Track 1 owns 70 facts, Track 2 owns 30 facts.** Both tracks run every wave, in parallel, contributing to the same running tally, the same wave-merge/dedupe/flush cycle, and the same Phase 3 verification gate.

### Track 1 — fact-hunter worker (web / Wikipedia / Wikidata)

Unchanged mechanics from prior rounds:

**Domain wheel** — spread across, weighted by the Taste Profile's actual topic fingerprint (match his proportions **compressed under the ~15/domain cap; overflow quota goes to the thin spots**): history · science/nature · sports · music · film/TV · geography · food/drink/brands · words/etymology · Michigan/local · records/onlys/firsts/misc.

**Hunting grounds** (from the skill's fact-source habits): IG Nobel Prizes, origin stories of names/brands/bands, "only/first/last" record lists, secret-service code names, word etymologies with modern crossovers, LEGO/game Easter eggs, production trivia and deleted scenes, obscure institutional datasets, kangaroo words, diner slang, this-month's news/deaths/sports for topical hooks. Search these corners — not "50 amazing facts" listicles.

Dispatch via Task tool (`general-purpose` type), 2–3 subagents at a time on disjoint domain slices, in waves, targeting the 70-fact Track 1 quota.

### Track 2 — agent-reach worker (YouTube / Reddit / podcasts)

New. Researches **exclusively** via the `agent-reach` skill (loaded in Phase 0) against YouTube, Reddit, and podcasts — not Reddit alone. Same per-candidate gates and Phase 3 verification apply, with the same rule that already governed Reddit: **never trust a video/podcast/Reddit claim as its own source** — trace the claim to what it cites (a paper, an official record, a news report) or find an independent verification. A YouTube video, a Reddit thread, and a podcast episode are all raw material, never one of the two required verification sources.

Good hunting grounds by platform:
- **YouTube** (`yt-dlp` per `agent-reach`'s video reference): explainer/deep-dive channels, "how it's made," documentary excerpts, video essays on a franchise/era/brand — subtitle-pull for claims, then verify independently. `yt-dlp --dump-json "ytsearch5:query"` to scout candidates, then subtitle-pull the ones that look promising.
- **Reddit** (via `agent-reach`'s active backend — check `agent-reach doctor --json` first): r/todayilearned, r/interestingasfuck, r/AskHistorians, r/AskScience, plus domain-specific subs for whichever domains are in this wave's quota (e.g. r/nba or r/CFB for sports, r/Cooking or r/beer for food/drink). Top comments often hand you a bridge for free.
- **Podcasts**: Xiaoyuzhou-hosted episodes via `transcribe.sh --polish`; for English podcasts, the show's own site/RSS (Jina Reader) or `agent-reach transcribe` on a public audio URL. History, science, and true-crime-adjacent podcasts are strong for deep-cut bridges.

**Source list — query before dispatching, update after every wave** (see change c, full mechanics below): pull `fact_hunt_sources` ranked by domain fit for this wave's assigned domains, hand the ranked list to Track 2 subagents as their starting point, and update the table after the wave based on what was actually attempted/verified.

**Domain-deficit floor (not a flat split) — computed live, every round, before Track 2 dispatches:**

1. Query current bank distribution: `select domain, count(*) as n from fact_hunt_entries group by 1;` (include today's already-flushed rows from earlier waves this round). Compute each domain's share of the total.
2. Compare against the Phase 1 Taste Profile's topic-fingerprint baseline (the domain→percentage table built in Phase 1 step 1 — this is the authoritative source, not any hardcoded list). For each domain: `deficit = baseline_share − current_share`. A domain sitting well below its baseline share has a large positive deficit; a domain already over-represented has a negative deficit and gets zero allocation this wave.
3. Rank domains by deficit, descending. Take the **top 3 deficit domains** — these get **60% of Track 2's quota for this wave**, split evenly (20% each). If Track 2's wave quota doesn't divide evenly, round down per domain and give the remainder to the single highest-deficit domain.
4. The remaining **40% of Track 2's quota** spreads across the rest of the domains with positive deficit, weighted proportionally to their deficit size (domains at or above baseline get none of this either — their weight is floored at 0 and the pool renormalizes across whatever positive-deficit domains remain).
5. If fewer than 3 domains have positive deficit (a well-balanced bank), collapse the 60% allocation across however many positive-deficit domains exist, split evenly, and let the remaining share flow to the highest overall-fingerprint domains as a normal top-up rather than deficit-driven.

Recompute this at the start of each wave, not once per round — the deficit shifts as facts land.

### Shared mechanics (both tracks)

**Per-candidate gates** (all must pass before verification is even attempted):
- Familiar destination — answer producible by a bar table by ear.
- **At least one bridge found** — second independent route to the same answer, ideally cross-domain. Zero bridges = keep digging or drop.
- One unambiguous, ear-gradeable answer.
- Interesting even if missed — the reveal entertains.
- **Sounds like the Taste Profile** — touches at least one of his wells, or fits his topic fingerprint; a generic pub-quiz fact that any host could use is a reject even if true and bridged.
- Not in the dedupe corpus (live Supabase union query from the resume check) and not already accepted this session by either track.

**Parallelism (required, not optional):** dispatch research via subagents (Task tool, `general-purpose` type) — 2–3 per track at a time on disjoint slices, in waves, both tracks running concurrently. Each subagent prompt must include: **an instruction to first Read `references/fact-hunt/trivia-questions.md` (absolute path)** — cheaper and more faithful than pasting the style rules, and subagents can Read files — plus (Track 1) its domain slice + quota or (Track 2) its assigned deficit domain(s), platform(s), quota, and ranked source list from `fact_hunt_sources`; the Taste Profile (paste the relevant sections verbatim — this lives only in the local progress file, not the reference); the live dedupe answer list; the per-candidate gates; Phase 3 verification rules; the exact output shape (below); **the Fits-category definitions (regular = standalone full-anatomy slot · shiny-seed = fits a named format · swing-seed = could anchor a 6–9-item uniform round · PYL-seed = complete/bounded 6-item list potential · bonus-tier = deep-lattice or "name the N" list, myth-bust = widely-believed claim that turned out false), and the explicit rule: facts + stacked bridges only, NEVER draft questions.** Track 2 subagents additionally get the agent-reach invocation syntax pointer (Phase 0's reference docs) and the never-trust-the-platform-as-a-source rule.

Subagents verify their own batches and return finished entries; the main agent's job is orchestration, **wave-merge intake (reject any returned entry with fewer than 2 named sources, or a bridge no source covers — bounce it, don't accept it)**, cross-batch and cross-track dedupe (collisions between subagents, and now between tracks, are the known failure mode), and flushing accepted entries straight to `fact_hunt_entries` between waves (Phase 4). Do the hunting inline yourself only if subagent dispatch is genuinely unavailable in the session — and say so in the local progress file.

**Crash hardening (a real run stalled here 2026-07-22 mid-hunt; this is now structurally better):** flush accepted entries to Supabase (`fact_hunt_entries`) after EVERY wave, not at the end — a crash now only loses in-flight wave state (which the local `FACT-HUNT-PROGRESS.md` scratch file tracks), never facts that already landed in the table. Pass subagents only the answer list for dedupe, not the full question text. If context is running low mid-hunt, stop dispatching, flush everything accepted so far, update `fact_hunt_sources` for whatever Track 2 sources were used this session (don't skip the source-scoring update just because the round is cutting short), and tell Ben to rerun `/fact-hunt` to resume — a partial bank that resumes beats a full bank that never lands.

## Phase 3 — Verification (every fact, no exceptions)

- Verify the setup fact AND each bridge **independently** via web search: Wikipedia + one non-listicle independent source. Two sources disagree = fact dead (or the dispute IS the question — flag it as such). If the fact has a clean encyclopedic anchor (person/event/org/work), prefer `mcp__wikipedia__*` and `mcp__wikidata__*` (SPARQL for structured claims like dates or "first/only" records) over prose re-reading.
- Never verify against another listicle, and never against the YouTube video / Reddit thread / podcast episode that surfaced the candidate — that's raw material, not a source, for Track 2 the same as it always was for Reddit alone.
- Superlatives/"current/most/latest" claims: verify as of today, and stamp a re-verify-by date in the entry's `staleness` field.
- Record each source as a real URL (not just an outlet name) — the entry must be traceable back to the page that verified it.
- A fact that fails verification does not count toward 100. If it's a widely-believed claim that just turned out false, write it up as a `myth-bust` entry instead of discarding it (`fits = 'myth-bust'`) — the correction is often better material than the myth. Otherwise it gets a one-line tombstone note in the local progress file (prevents re-hunting it this session) — it does not get a Supabase row at all (nothing to mark `tombstoned` on, since it was never inserted).
- Track which worker/platform actually produced each verified fact — this feeds `origin` in Phase 4 and the source-scoring update in Phase 2's Track 2 mechanics.

## Phase 4 — Write to Supabase (`fact_hunt_entries`)

No more Word doc. Every accepted entry (from either track) gets inserted directly into `fact_hunt_entries` via `mcp__supabase__execute_sql`, batched one wave = one multi-row `INSERT`:

```sql
insert into fact_hunt_entries
  (round_date, domain, answer, fact, bridges, sources, tags, fits, staleness, origin, status, agent)
values
  (current_date, 'music', 'Kate Bush', 'Verified surprising fact text...',
   array['bridge one', 'bridge two'],
   array['https://...', 'https://...'],
   array['music', 'history'],
   'regular', 'none', 'wikipedia', 'active', 'fact-hunt-2026-08-23'),
  (...next row...);
```

Field mapping notes:
- `origin` — set accurately per which worker/source actually found the fact: `web` or `wikipedia` or `wikidata` for Track 1; `reddit`, `youtube`, or `podcast` for Track 2. This is what makes Phase 2's domain-deficit query and Phase 5's source-scoring report meaningful later.
- `status` — always `'active'` on insert (never `'used'` or `'tombstoned'` — those are set later, elsewhere, by whatever marks facts as spent on a real show).
- `agent` — the run identifier minted in the resume check (`fact-hunt-<date>[-N]` or `fact-hunt-quick-<date>[-N]`).
- `fits` — `regular / shiny-seed / swing-seed / pyl-seed / bonus-tier / myth-bust` (the table's check constraint — note it's `pyl-seed` lowercase-hyphenated in the schema, not `PYL-seed`).
- `bridges` and `sources` are `text[]` — pass as Postgres array literals as shown above, one bridge per array element, one URL per source element.
- `staleness` — `'none'` or `'re-verify by DATE'` as free text, matching the old doc entry shape.

Flush after every wave, same cadence as before — never batch the whole round into one end-of-run insert.

### Source-scoring update (change c) — after every wave that used Track 2

For every `fact_hunt_sources` row a Track 2 subagent actually pulled candidates from this wave:

1. **Counts:** `total_attempted += <candidates pulled from this source this wave>`, `total_verified += <of those, how many passed Phase 3>`, `last_used_at = now()`.
2. **Per-domain score nudge** (moving average): for each domain the source was used for this wave, compute `hit_rate = verified_this_wave_this_domain / attempted_this_wave_this_domain` (skip the update for a domain with 0 attempts this wave). Then:
   - If `domain_scores` already has an entry for that domain: `new_score = old_score * 0.7 + hit_rate * 0.3`.
   - If it's a new/unscored domain for that source: initialize `domain_scores[domain] = hit_rate` directly (no blending on the first observation).
   - Clamp to `[0, 1]`.
3. **Demotion:** if `total_attempted >= 5` and `(total_verified::float / total_attempted) < 0.3`, set `status = 'demoted'`. (5 is deliberately low-friction for a small, growing table — one bad wave from a brand-new source shouldn't demote it, but a source that's been tried several times and is mostly whiffing should drop out of the default rotation.)
4. **Retirement:** if a source is already `demoted` and accumulates `total_attempted >= 15` with `(total_verified::float / total_attempted) < 0.25` still true, set `status = 'retired'` (retired sources are excluded from the ranked list entirely — demoted ones can still be picked as a last resort or exploratory pick, retired ones can't).
5. **New sources:** if a Track 2 subagent used a source not yet in the table (a new YouTube channel, subreddit, or podcast), `insert ... on conflict (platform, name) do nothing` a fresh row first (`total_attempted = 0, total_verified = 0, domain_scores = '{}'`, `status = 'active'`), then apply the same update above. Note it as a first-time source for Phase 5's report.
6. Unscored/new domains for an otherwise-known source count as **exploratory picks** — the ranked list you hand Track 2 subagents should include 1–2 exploratory picks per wave (sources with no score yet for the target domain) alongside the top-ranked scored sources, so the table keeps learning about domains it hasn't covered yet.

## Phase 5 — Verify before done

Load `verification-before-completion`. Confirm, against Supabase directly rather than a doc:

- `select count(*) from fact_hunt_entries where round_date = current_date and agent = '<this run's agent id>';` matches the round's target (100 for a full round, N for quick mode).
- Every row this run inserted has non-null `domain`, `answer`, `fact`, at least one `bridges` element, at least 2 `sources` elements, a valid `fits`, and a valid `origin`.
- Zero answers collide with the pre-round dedupe corpus (spot-check a sample against the union query from the resume check).
- The local `FACT-HUNT-PROGRESS.md` scratch state (if kept) is consistent with what's actually in Supabase — no wave marked "flushed" locally that isn't present in the table.
- **Source promotions/demotions section present** (full rounds only, i.e. Track 2 ran): pull this round's `fact_hunt_sources` deltas and summarize which sources were promoted (a domain score moved up notably, say +0.1 or more this round), demoted, retired, or tried for the first time. This goes straight into the final report — Ben should see the source list evolving without querying Supabase himself.
- Spot-read 10 random entries against the Taste Profile — is this a fact Ben would have jotted on his notes page?

Only then report done: tally, per-domain and per-track breakdown, the source promotions/demotions section (full rounds), a 5-line highlight reel of the best finds, and a pointer to **the fact browser UI** (the Claude Artifact reading this same `fact_hunt_entries` table) as where to browse the round's results.

**Do NOT draft questions.** The deliverable is raw material — Ben writes the questions himself. Facts + stacked bridges only.
