---
description: Study Ben's question bank via the taste profile, then dual-track research (web/wiki + agent-reach video/reddit) toward ~30 verified, bridged, independently-graded facts that are deep cuts INSIDE things the bar already loves — written straight into the fact_hunt_entries Supabase table
allowed-tools: Read, Write, Edit, Grep, Glob, Skill, Task, Agent, TodoWrite, WebSearch, WebFetch, Bash, mcp__supabase__execute_sql, mcp__supabase__list_tables
disable-model-invocation: true
---

# /fact-hunt — bank verified facts in Ben's taste (30 = the round's pace-setter)

Aug 2026: ~600 facts delivered, 11 used — 2%. Cause: obscure subjects, résumé/lawsuit/debunk angles, answers nobody says.
2026-09-01 wave in the notes-page shape: 15 of 37 kept.
Everything below exists to hold that.

Output = rows in `fact_hunt_entries`. **Never draft questions; Ben rewrites everything himself.** Steering doc: `references/fact-hunt/taste-profile.md` — §0 is the numbered gate list (cite items by number, never restate them), §1 the 14 wells and the canonical `domain` strings, §5 the live verdict queries, §9 the pinned exemplars. Supabase project `qwtbgusqfoypvehnungr` holds `questions`, `fact_hunt_entries`, `fact_hunt_sources`. Never use project id `dreggwinegtirxxanntv` (it appears elsewhere in this repo's docs; it is not this project). Zero migrations.

## Modes
- **Full round** (no args): Phase 0–5, both tracks, at least 2 waves per track, independent grader, 30-fact pace-setter (not a minimum, never padded toward).
- **`quick N`** (default N = 10): Read taste-profile.md, run the Phase 1 answer-frequency query, write `FACT-HUNT-BANK.txt`, hunt Track 1 only with the same hunter template and the same grader, quota N, `agent = 'fact-hunt-quick-<YYYY-MM-DD>[-N]'`. No preflight, no source scoring. Phase 3 and Phase 4 in full. Report = Phase 5 scaled down (tally, highlight reel, browser link). **First run after any prompt rewrite is `/fact-hunt quick 30` before a full round — one variable at a time.**
- **`grade`**: Ben says keep/kill in prose (ids or answers). Resolve answers to ids from the named round — `select id, answer from fact_hunt_entries where agent like 'fact-hunt-<date>%';` — echo the id list, then run kills `update fact_hunt_entries set status='tombstoned' where id in (...);` and keeps `update fact_hunt_entries set tags = array_append(tags,'kept') where id in (...) and not ('kept' = any(tags));`. `status='used'` stays reserved for facts that ran in a show. The first-ever grade run also backfills `kept` onto the 15 rows listed in taste-profile §5 "Kept, 2026-09-01" (resolve by answer where it's a literal value; a few entries there are paraphrased — e.g. "555 and Bruce Almighty" — so match those by eye against `fact`/`answer`, not a blind `ilike`; echo ids, same update).

## Phase 0 — Preflight (full round only; runs before the resume check, aborts the run)
- `yt-dlp --version` returns a version, then a real smoke: `yt-dlp --dump-json "ytsearch1:test"` returns a result.
- `agent-reach doctor --json` reports a backend for `reddit`, then one live `opencli reddit search` / `rdt search` (per doctor's backend) returns a result. Doctor green + fetch failing = that platform is DOWN.
- One platform down: note it, give Track 2's quota to the other, say so in Phase 5. Both down: skip Track 2 this round, say so in Phase 5, continue with Track 1 — do not STOP.
- Dispatch one throwaway Task subagent (prompt: "reply OK") and confirm it returns. Failure is fatal: STOP, tell Ben what's missing and to rerun from a normal session. Never hunt inline; a failed preflight never licenses quick mode.
- Reads: `references/fact-hunt/taste-profile.md` (orchestrator; hunters and grader Read it via their templates). If you need the skill itself, Read `/Users/bencoughlin/Projects/baynes-trivia/trivia-os/trivia-questions/SKILL.md` by absolute path. Load `dispatching-parallel-agents` before Phase 2, and the `agent-reach` skill with its `references/video.md` (YouTube) and `references/social.md` (Reddit) for real invocation syntax — never guess commands.
- TodoWrite list mirroring the phases. Create/refresh `FACT-HUNT-PROGRESS.md` in cwd: in-flight wave state, wave lines, grader reasons — never the facts. `fact_hunt_entries` is the only source of truth.

### Resume check (full round, after preflight)
1. Is a round already running today?
   ```sql
   select agent, array_agg(distinct domain) as domains, count(*) as n, max(created_at) as last_write
   from fact_hunt_entries where round_date = current_date group by agent order by last_write desc;
   ```
   `last_write` older than ~1 h = a dead/finished run: its count is this round's starting tally; pull its answers into dedupe. Younger than ~1 h under another agent id = a live sibling: mint the next `-N` suffix, pull its answers + domains into dedupe, lean to wells it isn't covering. Escalate to Ben only on an observed double-write. Nothing today = fresh round, 0/30.
2. Agent id: `fact-hunt-<YYYY-MM-DD>` (`-2`, `-3`… if the base is taken, dead or live). Every row this session inserts carries it.
3. Orchestrator dedupe, re-run at the start of every wave (both tracks write concurrently). Answer-level: `select lower(answer) as answer from questions union select lower(answer) as answer from fact_hunt_entries;` Angle-level:
   ```sql
   select id::text, answer, category from questions where category is not null
   union all
   select id::text, answer, array_to_string(tags, ', ') as category from fact_hunt_entries where tags is not null and array_length(tags,1) > 0;
   ```
   `category`/`tags` are free-text bridge tags, not a taxonomy. A fresh answer with the same stacked-bridge combo is a repeat in spirit — flag it in the wave notes.

## Phase 1 — Study (one Read, four queries, one file)
`questions` (~1,950 rows) usable columns: `type, text, answer, category, is_bonus, is_shiny, shiny_format_name, questions_data`. `category` = free-text bridge/setup tags on ~78% of rows. `used_on` / `round_type` are empty — never use them.
1. Read `references/fact-hunt/taste-profile.md`. It IS the profile; do not rebuild it from the bank.
2. Drift check: `select category, count(*) from questions where category is not null group by 1 order by 2 desc limit 100;` — a top-20 tag that maps to no §1 well, or a §1 well with no tags at all, gets named in the Phase 5 report and steered by.
3. Per-well mined veins (for `{{mined_veins}}`, Phase 2 Dispatch): for the well(s) this wave's hunters will get, `select category, tags from questions where category ilike '%<well keyword>%' or category ilike any(array[...])` plus a text grep of `FACT-HUNT-BANK.txt` for that well's obvious hinges (band-name origins, park Easter eggs, etc.) — a short list of "already used this angle" hinges, not exhaustive (Music example: Hootie, Whoopi, Five Finger Death Punch, Doobies…). Build it fresh per wave for whichever wells are in play; a hunter's own per-fact grep (hunter-prompt.md step 2) is the real gate, this is just the head start.
4. Answer-frequency: `select lower(answer), count(*) from questions group by 1 having count(*) > 1 order by 2 desc;` — 2+ appearances = hard-avoid this session (plus the skill's known repeats: Ludicrous, Apothecary, Headless Horseman, Kenny Loggins, Regina George, Jack Nicholson).
5. Gap read, one line: which §1 wells are thin in THIS round's accepted rows (never the whole table).
6. Write `FACT-HUNT-BANK.txt` in cwd once per round: one line per row, `id<TAB>answer<TAB>text`, from `questions` ∪ `fact_hunt_entries` (all statuses). Build it yourself via paged `execute_sql` (`select id::text, answer, text from questions order by id limit 500 offset N;` then `select id::text, answer, fact as text from fact_hunt_entries order by id limit 500 offset N;`) or a local dump script whose service-role key comes from an env var — never inline, and hunters never see the script. Hunters and the grader Grep this file for the answer AND the hinge (§0.7).

## Phase 2 — Research loop (two tracks, in waves)
Target: 30 grader-accepted facts, a digging pace-setter. A round that honestly ends at 22 reports 22; a round padded to 30 is a failed round. Track 1 (web / Wikipedia / Wikidata) owns 21, Track 2 (YouTube / Reddit via `agent-reach`) owns 9; both run every wave, in parallel, into the same tally, intake, grader, dedupe and flush.

**Allocation.** Each wave: one hunter per well, walking taste-profile §1 in rank order (Sitcoms, Disney, Comedy films, Nerd canon, Music…) up to the wave's hunter count; `Cool-facts` is in every wave — Ben's balance. No counting, no cap; a wave that comes back 40% one well just says so in the wave line and in Phase 5. Both tracks get this round's per-well count — `select domain, count(*) from fact_hunt_entries where agent = '<this run>' group by 1;` — as `{{round_counts}}`; Track 2 additionally gets §1's order and, if a sibling run is live, which wells it covers.

**Lanes** (every wave carries all seven; each hunter gets a well AND a lane mix): 1 detail-inside-a-famous-thing (default) · 2 name-with-a-second-life · 3 lyric/quote/scene · 4 name-origin · 5 according-to-list (the source name goes in the fact) · 6 topical (`staleness = 're-verify by <date>'`) · 7 math / real↔fiction leak / four-majors logic. Two steps before returning any fact: (a) one search for a Michigan tie, added as `mi:`; (b) if a natural clip/logo/photo exists, add a `media:` line.

**Hunting grounds.** Track 1: episode guides, fandom wikis, lyric annotation sites, IMDb trivia, Disney park history, Toy HOF, RRHOF/Grammy/Billboard record books, band-name-origin interviews, game Easter eggs, cameo lists, MLive/Freep, this week's news; for `Cool-facts`, NASA/NPS/Smithsonian/NatGeo/Guinness pages on FAMOUS subjects. Track 2: YouTube deep-dive channels (`yt-dlp --dump-json "ytsearch5:query"` to scout, then subtitle-pull) and the fandom subs for this wave's wells (r/DunderMifflin, r/StarWars, r/WaltDisneyWorld, r/ClassicRock, r/motorcitykitties, r/Michigan, r/cedarpoint, r/MovieDetails…); r/todayilearned only for lanes 4–5. Never "50 amazing facts" listicles, weird-history corners, r/AskHistorians or r/AskScience. A video or thread is raw material, never a source.

**Track 2 sources.** Before dispatch: `select platform, name, total_attempted, total_verified, last_used_at from fact_hunt_sources where status = 'active' order by total_verified desc, last_used_at asc;` — hand the ranked list to Track 2 hunters. After each Track 2 wave, per source used: `total_attempted += n`, `total_verified += m`, `last_used_at = now()`; a source not yet in the table gets `insert ... on conflict (platform, name) do nothing` first.

**Gates.** Hunters self-reject against taste-profile §0 items 1–9 (they Read the file; do not paste the gates). Returning under quota beats padding.

**Edge quota.** Each wave may carry 1 fact that deliberately stretches past the profile — domain-edge (a fandom or angle the bank never touched) or shape-edge (break an unstated convention every bank entry shares about how a fact carries); name the flavor. It waives only the sounds-like-the-profile judgment; every §0 gate applies in full. Tag it `edge`; never pad to fill the allowance — record a zero.

**Dispatch.** Task tool, `general-purpose`, 2–3 hunters per track at a time on disjoint wells. Fill `references/fact-hunt/hunter-prompt.md` and dispatch it verbatim — **the template IS the spec.** Slots: `{{agent}}` `{{track}}` `{{well}}` `{{lanes}}` `{{quota}}` `{{mined_veins}}` (hinges the bank already ran for that well — Phase 1's tag list plus a Grep of `FACT-HUNT-BANK.txt`) `{{round_counts}}`, and `{{track2_sources}}` for Track 2 only.

**Mechanical intake** (orchestrator, per returned entry — bounce, don't accept): fewer than 2 named sources · a bridge no source covers · a bridge not typed `name:/line:/ask:/mi:/hook:` · no `Shout:` line · `lane:<n>` not first in `tags` · `domain` not one of the 14 exact strings in taste-profile §1 (normalize obvious case/spacing slips, bounce the rest) · answer in the dedupe set or already accepted this round by either track.

**Independent grader.** After intake, before flush: ONE grader per wave via the Agent tool with `model: opus`, never a hunter re-used. Fill `references/fact-hunt/grader-prompt.md` and dispatch it verbatim. Slots: `{{entries}}` (the wave's intake survivors), `{{random20}}` (`select text, answer from questions where type='regular' order by random() limit 20;`), `{{verdict_rows}}` (the two live queries in taste-profile §5: used/kept rows and the last 40 kills). Four binary bounces: §0.1 sayable answer · a lawsuit/court case AS the fact · §0.7 mined vein · §0.9 verified. Everything else — door quality, résumé, debunk-led, grim, trademark, introduced subject — scores 1–5 on one question, "would Ben jot this?", anchored on real verdicts: Frank Oz 5 vs Sterling Holloway 2; Superman ice cream / Littlefeather kept vs Shepard's 24 yards killed; Duracell kept vs the AT-AT suit killed. The grader names the nearest-neighbor row in the live §5 list and its pile. Accept ≥3. `edge` rows get the binaries only and pass through. Grader reasons go in the progress file for Ben; report the bounce rate, never target it. The grader never rewrites facts and never drafts questions.

**Wave line** (in `FACT-HUNT-PROGRESS.md`, after every wave): `wave N (track, wells): returned Y / intake-bounced Z / grader-bounced B / accepted V / edge E`. Hunters' `considered / self-rejected / failed verification` footer is kept beneath it.

**Flush + watchdog.** Record the dispatch in the progress file BEFORE dispatching. Flush grader-accepted rows to `fact_hunt_entries` after EVERY wave (Phase 4); mark the wave `flushed` only after a post-flush `select count(*)` confirms the rows. Any wave still `dispatched` at Phase 5 is a data-loss event — report it. Context low mid-round: stop dispatching, flush, update `fact_hunt_sources`, tell Ben to rerun `/fact-hunt` to resume. Dispatch dies mid-round: flush what's accepted, stop — never degrade to inline solo hunting.

**End condition.** A full round runs at least 2 waves per track. Dispatch a third wave only if the last wave accepted 5 or more; otherwise stop. Context running low ends the round at any point — flush first.

## Phase 3 — Verification (every fact; hunters verify their own batch, orchestrator spot-checks)
- Two independent sources per §0.9 (the primary work counts as one for a lyric/scene/level; never a listicle, never the video/thread that surfaced it).
- Two sources disagree = fact dead, or keep it as a legend with `[disputed]` inline.
- Superlatives / "current, most, latest" verified as of today and stamped `staleness = 're-verify by <YYYY-MM-DD>'`; topical (lane 6) uses the same string with its expiry date.
- Every source is a real URL, not an outlet name.
- Record which worker/platform found it — feeds `origin` and the source counts. A failed candidate gets a one-line note in the progress file, never a Supabase row.

## Phase 4 — Write (`fact_hunt_entries`, one multi-row INSERT per wave, never one end-of-run batch)
```sql
insert into fact_hunt_entries
  (round_date, domain, answer, fact, bridges, sources, tags, fits, staleness, origin, status, agent)
values
  (current_date, 'Nerd canon', 'Kirby',
   E'Kirby\nNintendo''s pink puffball, 1992, Dream Land\nNamed after Jack Kirby — Stan Lee''s co-creator at Marvel\nmedia: Kirby''s Dream Land title screen\nShout: "Kirby is a MARVEL guy?!"',
   array['name: Jack Kirby, co-creator of the X-Men and Fantastic Four', 'ask: any X-Men table would know Kirby drew them', 'hook: "Suck it up!"'],
   array['https://...', 'https://...'],
   array['lane:2', 'nintendo', 'marvel', 'name-collision'],
   'regular', 'none', 'wikipedia', 'active', 'fact-hunt-2026-09-05'),
  (...next row...);
```
- `domain` — one of the 14 strings in taste-profile §1, exact spelling (pre-2026-09-02 rows carry old subject names; per-well counts only look at this run).
- `fact` — notes-page shape: line 1 the answer; 2–5 fragments of ≤15 words; optional `media:`; last line `Shout: "…"`; `[disputed]` inline on legends. Worked examples: taste-profile §8.
- `bridges` — every element typed `name:/line:/ask:/mi:/hook:`. `sources` — one URL per element. Both `text[]` literals as shown.
- `tags` — `lane:<n>` first, `edge` when applicable. `fits` — `regular / shiny-seed / swing-seed / pyl-seed / bonus-tier / myth-bust` (check constraint; lowercase-hyphenated).
- `origin` — `web` / `wikipedia` / `wikidata` (Track 1), `youtube` / `reddit` (Track 2). `status` — always `'active'` on insert. `staleness` — `'none'` or `'re-verify by DATE'`. `agent` — this run's id.

## Phase 5 — Verify before done
Load `verification-before-completion`. Against Supabase, never the scratch file:
- `select count(*) from fact_hunt_entries where round_date = current_date and agent = '<this run>';` — the tally you report is this number. Accept rate = accepted ÷ returned.
- Every row this run inserted has non-null `domain`, `answer`, `fact`, ≥1 `bridges` element, ≥2 `sources` elements, a valid `fits` and `origin`, and a `domain` in the 14 strings.
- Self-checks (run, don't print): zero answers collide with the pre-round dedupe set; lane coverage `select tags[1] as lane, count(*) from fact_hunt_entries where agent = '<this run>' group by 1;`; per-well `select domain, count(*) from fact_hunt_entries where agent = '<this run>' group by 1;`; the progress file agrees with the table (no local `flushed` wave missing from Supabase).
- Spot-read 5 random non-`edge` rows against taste-profile §9; if you disagree with the grader on 3 of 5, say so in the report.

Report: tally + accept rate; the wave lines; sources used this round with attempted/verified counts (full rounds); a 5-line highlight reel, each with its `Shout:` line; an unflushed-wave warning if any; drift-check and platform notes; the fact browser link (the Claude Artifact reading `fact_hunt_entries`; it cannot write). Ben grades via `/fact-hunt grade`.

**Do NOT draft questions.** Facts + typed doors only; Ben writes the questions.
