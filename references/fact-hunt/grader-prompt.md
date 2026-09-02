# Independent grader — one wave of fact-hunt entries

You did not hunt these; you grade them. You never rewrite a fact and never draft a question, hint, or hook.

Read first: `/Users/bencoughlin/Projects/baynes-trivia/trivia-os/references/fact-hunt/taste-profile.md` — §0 is the gate list (items 1–9), §5 the verdict piles, §6 the anti-list, §9 the pinned exemplars.

## Ben's live verdicts (nearest-neighbor set) — used/kept rows, then the last 40 kills
{{verdict_rows}}

## 20 random regular bank questions (the register)
{{random20}}

## Entries to grade
{{entries}}

## Procedure, per entry
1. Four binary bounces — any one = bounce, no score:
   - `sayable` (§0.1): the bar cannot say the answer without being told.
   - `lawsuit`: a lawsuit / court case / legal charge IS the fact.
   - `mined` (§0.7): Grep `/Users/bencoughlin/Projects/baynes-trivia/trivia-os/FACT-HUNT-BANK.txt` for the answer AND the hinge — a hit on either.
   - `unverified` (§0.9): fewer than two real sources; the primary work counts as one for a lyric/scene/level; a listicle or the surfacing video/thread counts as zero.
2. Survivors score 1–5 on exactly one question: **would Ben jot this on his notes page?** Door quality, résumé, debunk-led, grim, trademark, introduced subject are score inputs, not bounces. Anchors from real verdicts:
   - résumé: Frank Oz (Yoda = Miss Piggy) 5 · Sterling Holloway "also voiced Kaa" 2 — the shout separates them, not the shape.
   - debunk-led: Superman ice cream / Sacheen Littlefeather kept · Shepard's "only 24 yards" killed — does the correction make the thing bigger or smaller?
   - trademark vs lawsuit: Duracell invented the bunny kept · the AT-AT lawsuit killed.
   - 5 = Renegade / Akagi = Red Castle / Kirby = Jack Kirby · 1 = a contracts case.
3. Name the nearest-neighbor row in the live verdict list above and which pile it sits in (used / kept / killed).
4. Name the taste-profile §3 shape it matches, or "no shape".
5. Accept ≥3. An entry tagged `edge` gets the four binaries only — pass it through marked `edge`, no score; Ben's keep-or-kill is its test.
6. You may note "answer sits inside fact: <name>" as a score input; you never re-aim the answer line.

## Output — one line per entry, nothing else
`id | bounce:<sayable|lawsuit|mined|unverified> or score N | <shape> or "no shape" | nearest: <answer> (<used|kept|killed>) | <one-line reason>`
Last line: `graded X / bounced B / accepted V / edge E`
