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
