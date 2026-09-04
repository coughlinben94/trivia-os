# Semantic dedupe threshold calibration (2026-09-03)

Fresh calibration run, done in response to a council finding: the earlier
"~50 pairs reviewed, keep 0.90" call was never written down (unfalsifiable),
and a separate council member's own 300-row sample pointed toward 0.93 with
no artifact either. This is that artifact — the actual query, the actual
pairs, actual verdicts, and the actual decision.

## Query

```sql
select a.id as id_a, b.id as id_b, left(a.answer,80) as answer_a, left(b.answer,80) as answer_b,
       1 - (a.embedding <=> b.embedding) as similarity
from questions a join questions b on a.id < b.id
where a.embedding is not null and b.embedding is not null
  and a.type='regular' and b.type='regular'
  and 1 - (a.embedding <=> b.embedding) > 0.85
order by similarity desc
limit 80;
```

`type='regular'` filter matters: shiny/swing/list rows have null-text
embeddings that cluster near 1.0 with each other as pure noise (side-finding
from the fix-1 session). Excluding them gives a clean read of the actual
regular-question bank.

## Method

Pulled full `text`/`answer` for every id in the 80-pair result and judged
each pair by hand: **true dup** = same underlying fact/question, reworded or
re-imported; **false positive** = shares an answer string or topic domain
but is a genuinely different question (different specific fact, different
correct answer angle, or a companion question that asks for a different
piece of the same larger fact).

## Score bands

**0.99 – 1.0 (14+ pairs, all true dup).** Verbatim or near-verbatim question
re-imports — same text down to a curly-vs-straight-quote diff (e.g. `2049`/
`2080` "And…. We're back!!!", `2062`/`2106` the Bill Rasmusen/OJ Simpson
question, `2054`/`2087` the Lighthouse question). Archive duplicates from
the same show re-landing in the bank. Zero noise in this band.

**0.93 – 0.99: mixed, but true-dup-majority.** Most pairs here are the same
fact reworded (`1226`/`1922` Jack in the Box, `289`/`1187` Doom, `1043`/
`1816` Fabulous, `553`/`1293` Anthony Hopkins/Grinch, `1396`/`1576` Bonnie
and Clyde, `1370`/`1941` Crosby Stills [Nash Young]). But real false
positives already show up here: `1143`/`1395` (MTV Unplugged vs Kurt Cobain
— same fact-set, but one question asks for the show and the other for the
person, different correct answers), `1922`/`2634` and `1922`/`3093` (Jack in
the Box vs Checkers — both "toy hall of fame + fast food chain" trivia but
different specific answer), `1704`/`1927` (cast names vs show name,
companion questions), `1371`/`1701` (5-apple list vs single apple, list
overlap not duplication).

**0.90 – 0.93: false-positive-majority.** Nine of the ten pairs here are
different specific facts sharing a topic (SpongeBob fish characters, Greek
myth companion facts, Narnia/Disney faun coincidence, Oscar-thanks lists,
symmetrical-logo lists, Scooby-Doo 2 different monsters). Only one true dup
falls in this band: `64`/`1758`, two framings of the same Kansas City
sports-motif fact, at 0.9039 — right at the edge.

**0.85 – 0.90 (below the current cutoff): true dups already being missed.**
This is the important finding. Several unambiguous same-fact pairs sit
*below* 0.90 today and are already invisible to `match_bank_dupes` at the
current threshold: `948`/`1647` Yeti/Yetis (0.9014, just clears),
`824`/`1485` Gilgamesh x2 (0.8972), `871`/`1646` San Antonio Spurs
win-percentage (0.8966), `57`/`1942` Hippos/Hippopotamus, Escobar (0.8952),
`2633`/`3092` Dallas/grassy-knoll (0.8898), `1253`/`1740` Robin Thicke/VMA
twerk, reframed via the Gretzky-babysitting hook (0.8867), `328`/`1314`
Smoke on the Water, two different framings of the same Montreux-fire fact
(0.8984). These are real, worth-catching duplicates that a full-text or
prose rewrite already pushes under 0.90 — the embedding is sensitive to
*how much of the surrounding question prose differs*, not just whether the
core fact is the same.

## Verdict: keep 0.90

Moving to 0.93 was the alternative on the table. The data argues against it:
raising the cutoff to 0.93 would drop the 0.90–0.93 band entirely, which
cuts ~9 false positives but also loses the one true dup that band actually
contains (`64`/`1758`). That is not a good trade in isolation, and it does
nothing about the bigger problem this run surfaced: real duplicates already
fall *below* 0.90 (the 0.85–0.90 band has at least 6 true dups going
unmatched right now). Raising the threshold makes recall worse in the exact
direction where the system is already weak; it does not fix the actual gap.

Lowering the threshold isn't supported either — the 0.85–0.90 band's
true/false split is close to the 0.90–0.93 band's, so pulling the cutoff
down trades a similar amount of new noise for the true dups it recovers,
no clear win either way without a larger sample.

**Decision: leave `match_bank_dupes`'s default and the `0.90` literal in
`.claude/commands/fact-hunt.md` unchanged.** No migration, no prompt edit.
The bank's biggest dedup gap isn't the cutoff value — it's that same-fact
duplicates with heavily reworded prose can drift under any reasonable single
threshold on question-text embeddings. That's a real limitation worth a
council follow-up (e.g. embedding answer-only rather than full text, or a
second-pass LLM judge on borderline pairs), but it's out of scope for this
fix — this file just makes the 0.90 number checkable, per the ask.

## Lexical (pg_trgm) calibration (2026-09-04)

A fable build review flagged `match_bank_dupes_lexical`'s `0.4` default as
uncalibrated — set from a single pair (Yeti/Yetis at 0.57) with no sample
behind it. This is that sample: the real query, real pairs, real verdicts.

### Query

```sql
select a.id as id_a, b.id as id_b, a.answer as answer_a, b.answer as answer_b,
       similarity(lower(a.answer), lower(b.answer)) as sim
from questions a join questions b on a.id < b.id
where a.type='regular' and b.type='regular'
  and similarity(lower(a.answer), lower(b.answer)) > 0.3
order by sim desc
limit 100;
```

Ran unbounded first to get band counts (`count(*) group by` a `case` over
0.1-wide bands), then re-ran per band to pull real pairs for judgment —
the same two-step method as the cosine calibration above.

### Band counts (655 pairs total above 0.3, `type='regular'` only)

| band | n | character |
|---|---|---|
| 1.00 (exact string) | 125 | trivial — same lowercased answer, already caught by any exact-match dedupe |
| 0.80–0.90 | 1 | true dup (typo) |
| 0.70–0.80 | 6 | true-dup-majority |
| 0.60–0.70 | 34 | **mixed, false-majority** — 13 true / 21 false by hand count |
| 0.57–0.60 | 14 | false-majority (Yeti/Yetis sits in this band) |
| 0.50–0.57 | 37 | false-majority |
| 0.40–0.50 | 89 | false-dominant (fable's flagged pairs live here) |
| 0.30–0.40 | 349 | not hand-sampled — trend from bands above says overwhelmingly noise |

### Sampled pairs

**0.70–0.90 (true-dup-majority, 7 pairs):** `703`/`1436` Borris Karloff /
Boris Karloff (0.8125, typo) · `518`/`1431` and `924`/`1431` Washington, DC /
Washington (0.7857) · `705`/`1828` Courage the Cowardly Dog / Gromit,
Courage the Cowardly Dog (0.7667) · `1357`/`2116` Wolverine / Wolverines
(0.75) · `139`/`1071` Cannonball / Cannonball Run (0.7333) · `650`/`1277`
Elephants / Elephant (0.7273) · `935`/`1326` Boston, MA / Boston (0.7). Zero
clear false positives in this range.

**0.60–0.70 (mixed, 34 pairs, hand-judged 13 true / 21 false):** true side —
`1001`/`1589` Roadrunner / Road Runner (0.6923) · `815`/`2103` &
`815`/`2059` Kevin Kostner / Kevin Costner (0.6875, typo) · `541`/`951`
Rugrats / The Rugrats (0.6667) · `1118`/`1193` & `1127`/`1193` Dragon /
Dragons (0.6667) · `883`/`1751` Mamma Mia, Abba / Mamma Mia (0.6429) ·
`555`/`1324` Marley / Bob Marley (0.6364) · `843`/`1420` & `1420`/`1947`
Clown / Clowns (0.625) · `1348`/`1714` Sailing by Christopher Cross /
Christopher Cross (0.6071) · `962`/`1938` Verve / The Verve (0.6). False
side — `995`/`1337` Layla, Eric Clapton / Eric Clapton (0.6842, different
correct-answer angle) · `1955`/`1987` Milwaukee Deep / Milwaukee (0.6667,
trench vs city) · `1370`/`1941` Crosby, Stills, Nash, Young / Crosby,
Stills, and Nash (0.6552 — **a real true dup by cosine** at 0.9675, see
below) · `630`/`802` & `630`/`1297` California Condor / California (0.6471,
species vs state) · `741`/`1225` Oklahoma / Oklahoma City (0.6429, state vs
city) · `1852`/`1939` Horton / Tim Horton (0.6364, unrelated) · `215`/`1638`
Shaggy dog / Shaggy (0.6364, unrelated character) · `113`/`1118` &
`113`/`1127` Dragon fly / Dragon (0.6364, unrelated) · `803`/`1963` New
Mexico / Mexico (0.6364, different countries) · `559`/`1931` &
`1931`/`2012` Philadelphia / Philadelphia Eagles (0.6316, city vs team) ·
`342`/`869` & `342`/`1932` Queens / Queen (0.625, borough vs band) ·
`658`/`1085` Buffalo / Buffalo Bills (0.6154, city vs team) · `1053`/`1204`
& `1053`/`1216` San Francisco Cable Cars / San Francisco (0.6087, landmark
vs city) · `410`/`1277` White Elephant / Elephant (0.6, gift-exchange term
vs animal) · `1325`/`1510` Donkey Kong Country / Donkey Kong (0.6, specific
game vs franchise).

**0.40–0.60 (false-dominant, fable's flagged examples):** `285`/`584`
Monkey / Donkey (0.4) · `873`/`945` & `296`/`873` Ireland / Iceland
(0.4545) · `633`/`1692` Mr. Rogers / Kenny Rogers (0.4375) · `1171`/`1624`
Burt Reynolds / Ryan Reynolds (0.5) · `1257`/`1295` Gumball Machine /
Machine Gun (0.5556) · `179`/`1150` Australia / Austria (0.5, dangerous —
different countries, near-anagram). All confirmed false positives.

### Why not 0.6 (fable's own suggested number)

Fable's ~0.6 recommendation was anchored on Yeti/Yetis scoring 0.57 as the
motivating true-dup case. Checked that anchor directly against this bank's
data and it doesn't hold up two ways:

1. **0.57–0.60 is not clean.** Yeti/Yetis (0.5714) sits in an exact-tie
   cluster with real false positives at the *same* similarity value —
   `Chicago Bulls`/`Chicago`, `Buffalo`/`Buffalo trace`, `Dancing`/`Dancing
   banana`, `Christopher Lee`/`Christopher cross` (all 0.5714) and
   `Gumball machine`/`Machine gun` (0.5556) sit right next to it. pg_trgm
   similarity on short 2–3 word answers produces exact ties across
   unrelated pairs — there's no threshold that keeps Yeti/Yetis and drops
   its noisy neighbors at the same score.
2. **Yeti/Yetis doesn't need lexical anyway.** Checked its cosine score
   directly: `948`/`1647` Yeti/Yetis is 0.9014 cosine — it already clears
   `match_bank_dupes`'s existing 0.90 default (confirmed live, matches the
   "just clears" note in the cosine section above). The semantic check
   already catches this pair. Raising the lexical threshold past 0.57 costs
   nothing on the case that supposedly justified 0.6.

### Verdict: 0.7

At `> 0.7`, the sample is true-dup-dominant with zero observed false
positives (the 7 pairs in the 0.70–0.90 band above). Below 0.7, the
0.60–0.70 band is false-majority (21 of 34 by hand count) and everything
under 0.6 gets worse fast, including the exact pairs fable flagged
(Monkey/Donkey, Ireland/Iceland, Mr. Rogers/Kenny Rogers, Burt
Reynolds/Ryan Reynolds, Gumball machine/Machine gun, Australia/Austria —
all land between 0.4 and 0.56).

This does cost some real recall: article/pluralization pairs like
`Rugrats`/`The Rugrats` (0.6667) and `Clown`/`Clowns` (0.625) fall below
0.7 and are not reliably caught by cosine either (checked directly —
Wolverine/Wolverines cosine is 0.8515, Elephants/Elephant is 0.7858, both
under the 0.90 cosine cutoff). That's an accepted gap, not a blind spot:
these are low-value duplicates (a hunter re-surfacing "Rugrats" when
"The Rugrats" is already banked is a minor redundancy, not a wasted-effort
false bounce), and the two signals are already known to be complementary
rather than complete — the same finding the cosine section above makes.

**Complementary-signal proof, verified live:**
- `1357`/`2116` Wolverine / Wolverines: 0.75 lexical (caught) vs 0.8515
  cosine (missed — below 0.90).
- `1370`/`1941` Crosby, Stills, Nash, Young / Crosby, Stills, and Nash:
  0.6552 lexical (missed at the new 0.7 cutoff) vs 0.9675 cosine (caught).

Each signal genuinely covers ground the other misses; neither replaces the
other. `0.7` is the lexical check's high-precision floor for the class it's
actually good at (typo / spacing / word-order variants on short answer
strings) — it is not trying to be the sole catch for every pluralization or
article variant.

**Decision: `match_bank_dupes_lexical`'s default moves from `0.4` to `0.7`.**
Migration: `supabase/migrations/<timestamp>_fact_hunt_lexical_threshold_calibration.sql`
(idempotent `create or replace function`). `.claude/commands/fact-hunt.md`'s
`0.4` literal in the mechanical-intake bullet updated to match.
