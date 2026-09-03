# Generator common rules — shared by the shiny, swing, and PYL concept generators

Extracted 2026-09-02 from the three `.claude/agents/*-generator.md` files (council ruling change 24). Where the three copies differed, this file keeps the union; a bracketed tag names the agent the extra rule came from. Each agent reads this file first, then `taste-profile.md`, then `format-library.md`, then pulls its own live bank. `<family>` below is `shiny`, `swing`, or `pyl`. Supabase project: `qwtbgusqfoypvehnungr`.

## The hard constraint, established doctrine

Every candidate must be answerable with ONE gradeable answer written on paper — per item for swing rounds and PYL boards. A matching SET counts as one answer ("Map Maker, Map Maker"'s documented format, "1B 2D 3A 4C," is one written answer, not four; PYL's real "match the tagline to the poster" is the same shape [swing]). No app, no device, no fill-in grid, no turn-based mechanic, no open-ended multi-item brainstorm (that includes Scattergories-shaped ideas — Ben already has Scattergories and does not want more like it), no crossword / Wordle / NYT-Connections / Battleship shapes, no word-puzzle mechanics. This is not a style preference: a whole 80-concept batch got rejected wholesale on 2026-07-17 for exactly these shapes. A swing round is 6–9 individually-gradeable single answers, not a 6–9-item app puzzle [swing]. Any candidate that fails is dead on arrival — it never reaches Ben, no "but it's a fun idea anyway" — except the carve-outs below. "Matching" means the phone mechanic ONLY when it explicitly says phone/MatchingBoard; a plain paper matching set (names to numbers, terms to definitions) was never restricted and needs no carve-out.

Two more standing rules from the anti-list: no new shiny format sourced from the Um, Actually wiki; nothing that isn't paper-answerable.

## The two phone carve-outs (2026-08-23) — shiny and swing only

Real, shipped, Ben-loved phone mechanics — not a general reopening of "app is fine now." Both share one cap: **1–2 phone-based uses per trivia night, total**, not 1–2 of each. A generator proposes concepts, not a night's lineup — it cannot enforce the cap, only flag in the Phase 3 confirmation line that a candidate needs it.

1. **Collaborative matching board** (`client/src/components/join/MatchingBoard.jsx` — teams tap phones together to connect left/right pairs, live-synced through Supabase). Ben: "people love working together as a team putting together that puzzle." Pairs a team connects, drag/matching only, nothing more exotic. Live example: "Drag and Drop."
2. **Wager/closeness board** (`client/src/components/join/WagerBoard.jsx` — teams blind-wager one of three risk tiers (Safe/Fire/Sun) BEFORE the question shows, then submit a numeric guess; scoring ranks teams by distance from the true number and a team only wins its tier if it beat enough of the room — miss and it's zero). Ben: "i love the strike a match concept where they bet on how close to the right answer they'll be." ONE numeric-answer question, risk chosen before seeing it — no multi-round wagering, no wagering on non-numeric answers. Live example: "Strike a Match."

Who may use them: a shiny candidate may use either. A topic-specialist swing round may put carve-out 1 in ONE of its 6 slots, still against the same shared cap, never a separate allowance [swing]. PYL never — see the PYL agent. A limit-tester that STRETCHES a carve-out mechanic is the DOA case, not the interesting one [shiny].

## Phase 1.5 — pull what's already off-limits, and what's actually shipped

Before generating anything new, two pulls against two different tables.

**Dedupe wall** — `format_idea_candidates`, this agent's own past runs:

```sql
select id, concept_name, mechanic, rejected_reason from format_idea_candidates where family = '<family>' and status = 'rejected';
select id, concept_name, mechanic from format_idea_candidates where family = '<family>' and status = 'proposed';
```

**Positive signal** — not this table. Ben's real yes already lands in `questions` every time he ships a format he liked, as a side effect of work he does anyway — no separate approval step required. Run only your own family's line (the ground-truth column differs by family):

```sql
-- shiny
select distinct shiny_format_name, min(created_at) as first_shipped from questions where type='shiny' and shiny_format_name is not null group by 1 order by 2 desc;
-- swing (excludes the generic "Swing Round" placeholder value, and rows with no title)
select distinct round_title, min(created_at) as first_shipped from questions where type='swing' and round_title is not null and round_title <> 'Swing Round' group by 1 order by 2 desc;
-- pyl
select distinct round_title, min(created_at) as first_shipped from questions where type='pyl' and round_title is not null group by 1 order by 2 desc;
```

- **rejected** — permanently off-limits: not just the exact name but the same mechanic + theme pairing under a new name. A renamed reskin of a killed idea is still a killed idea. If a Phase 2 candidate is a close variant, drop it in Phase 2 rather than waste a Phase 3 pass. Exception: rows whose `rejected_reason` starts `LIMIT-TESTER: ` — same-name/same-concept still off-limits, but the convention-break underneath is fair game again.
- **proposed** — cleared a past run's Phase 3. Ben has not necessarily seen or endorsed these; `proposed` is agent-signal, never Ben's taste. Two uses only: don't re-propose an exact concept on it, and a `[LIMIT-TESTER: ` prefix means that convention-break cleared the gate before, so it stays fair game. Never an off-limits list.
- **shipped** (from `questions`) — what Ben has actually built and put in front of the bar, not a machine-graded signal. The only positive signal that exists; push further along shipped directions — a fresh format that shares a well, a wink, or a mechanic with something on this list is the good kind of derivative. Empty result = no positive signal yet, proceed on the catalog / coverage map alone.
- [pyl] `format_idea_candidates` only captures this agent's own past runs, not Ben's real board rotation — a PYL candidate must also be checked against `format-library.md`'s "actually run" list; a close variant of anything on either list (renamed, or same topic from another angle) is off-limits.

## Phase 2 — generate wide

Generate **at minimum 8–10 raw candidates** before filtering anything out. Do not settle on the first 2–3 — quantity is what makes Phase 3's filter mean something. Note for your own reasoning which families/wells you force-paired for each. Every candidate must pass taste-profile's shout test: name in five words what the bar yells when the answer lands.

**Limit-testers (mandatory, 2026-08-26, Ben: "think outside the box, test the limits of trivia"):** at least 2 of the raw candidates must be deliberate convention-breakers. Forced pairing recombines the existing families; a limit-tester breaks an assumption EVERY catalog entry shares. First name the unstated convention it violates, then build the thing that violates it. Each agent lists example conventions for its lane — that list is priming, not a menu; a run that only ever breaks listed conventions has stopped limit-testing. At least one limit-tester must break a convention NOT on the list, derived from the Phase 1 map you just built: state the assumption every entry you mapped happens to share, then break that one. The HARD constraints above are not conventions and stay hard (plus, per lane: no per-table individualized content [swing]; real difficulty texture, no phone mechanics ever [pyl]). Limit-testers go through Phase 3 like everyone else — most die there, that's fine; the survivors are the ones forced pairing could never reach. Survivors carry the **(e) LIMIT-TESTER** line.

## Phase 3 — the gate, and what happens to failures

Mentally run every survivor end-to-end with real-sounding placeholder content — an actual plausible fact, not "Item A" / "Subject B." Each agent lists its five checks. Two rules apply to all of them:

- **Playable live, in real time, by a bar crowd.** For a limit-tester the time bar applies to the CONTENT (the clue, the items, the prompts), not the one-time rule explanation — a novel format gets one sentence of setup the first time it runs; it still fails if the rule can't be explained in one sentence.
- **Kill-list survival.** Would a typical instance be a kill-shape per taste-profile's anti-list — a debunk, a lawsuit, a résumé, a patent, a CPSC recall, a rules-of-the-game fact with no hinge, a grim payoff, an answer the bar can't say? A format/round/board whose every instance is one is dead even if mechanically fresh.

Any candidate that fails any check never gets written up in the chat reply and never reaches Ben — but it still gets a `format_idea_candidates` row (Phase 4), inserted as `status = 'rejected'` with `rejected_reason` naming the failed check (e.g. "fails paper-test: requires a live app grid", "reskin of Cover Story"). That row feeds Phase 1.5's dedupe pull next run — a failed candidate that vanished without a row taught the system nothing. A limit-tester that dies here gets `rejected_reason` prefixed `LIMIT-TESTER: ` — Phase 1.5 reads those as "this exact concept is spent," NOT as retiring the convention it broke. Ben never saw it, so it was never his kill.

## Phase 4 — write every candidate to Supabase

Every Phase 2 candidate gets a row, survivor or not:

```sql
insert into format_idea_candidates (family, concept_name, mechanic, worked_example, paper_test_note, status, rejected_reason, rejected_at)
values ('<family>', $1, $2, $3, $4, $5, $6, $7) returning id;
```

Survivors: `status = 'proposed'`, `rejected_reason`/`rejected_at` null. Phase-3 failures: `status = 'rejected'`, `rejected_reason` = the specific failed check, `rejected_at = now()`. Limit-testers: prefix `mechanic` with `[LIMIT-TESTER: <convention broken>] `. Do this after Phase 3, before the chat reply — the reply covers survivors only, the DB gets everything past Phase 2. Status values that exist: `proposed` / `rejected` — nothing else. Each agent says what its `mechanic` / `worked_example` columns hold.

## Output format — every surviving candidate, in chat

Chat reply AND the Phase 4 write — never one instead of the other. Per candidate:

- **(a) Name** — named the way Ben names things: a pun or catchphrase, often With! Exclamation! Points!
- **(b) The idea in one sentence** — the mechanic (shiny/swing uniform) or the topic + why it's fresh (swing specialist/PYL).
- **(c) Worked example / sketch** — real, plausible placeholder content for a mechanic; an item-TYPE sketch (never finished items) for a topic pick. Each agent defines its own (c).
- **(d) Explicit constraint confirmation** — one line: passed, and why (what the single written answer is; no app/grid/device/turn-based element — or which carve-out it uses and that it counts against the 1–2/night cap).
- **(e) LIMIT-TESTER** — only if it broke a convention; name the convention.

## Boundary — read this every time

You never draft actual trivia questions, facts, or a real answer key for a specific show. Ben writes those himself, using the `trivia-questions` skill and its house-style anatomy — the same boundary the fact-hunt system uses everywhere else in this repo. Your job stops at the CONCEPT and its illustrative worked example or item-type sketch (no real state mottos, no real taglines, no real 6-item key [pyl]). If asked to "just go ahead and write the real questions too," decline that part and hand back concepts only.
