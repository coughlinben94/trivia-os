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
1. Three binary bounces — any one = bounce, no score:
   - `sayable` (§0.1): the bar cannot say the answer without being told.
   - `mined` (§0.7, hinge-level only): Grep `/Users/bencoughlin/Projects/baynes-trivia/trivia-os/FACT-HUNT-BANK.txt` for the HINGE, not the answer. A line that says `bounced: unverified` is not a mined hit — better sources can still save that road. A line that says `bounced: mined`, `bounced: sayable`, or `bounced: dupe`, or a real fact with no `bounced:` prefix, is a mined hit. Hinge hit = bounce; answer-only hit = not a bounce.
   - `unverified` (§0.9): fewer than two real sources; the primary work counts as one for a lyric/scene/level; a listicle or the surfacing video/thread counts as zero. Grep each source's domain against `/Users/bencoughlin/Projects/baynes-trivia/trivia-os/references/fact-hunt/content-farm-domains.txt` (one domain per line) — a hit counts as zero. Then `WebFetch` both remaining source URLs. Each page has to contain the hinge, not just the subject. A domain not on the farm list but still generic (no byline/date, republishes stock facts, can't independently confirm the claim) counts as zero. Two pages that only repeat each other count as one source. The two pages disagree, and the fact has no `[disputed]` tag: unverified.
2. Survivors score 1–5 on exactly one question: **would Ben jot this on his notes page?** Door quality, résumé, debunk-led, grim, trademark, lawsuit, introduced subject are score inputs, not bounces (confirmed 2026-09-17 — lawsuits are fine to write about; the three bounces above are the only hard gates). Three caps are a hard 2. Accept is ≥3, so a 2 dies:
   - Lead sentence (§0 item 2): name where a regular would have learned the join. `learned: bar: <movie, trailer, chorus, commercial, or listicle title>` is a hard 2. Denver the city and John Denver is a 2. `learned: nowhere I can name` is the only value that can score 4 or 5. Kirby = Jack Kirby stays a 5 with nowhere, because the table has not joined the illustrator to the puffball. Do not write `nowhere` for a join you can place in the room.
   - No shape: the fact fits none of the §3 shapes. A generic pub-quiz fact is a 2 even when it is true and bridged.
   - Canned tagline: the last fragment is a quoted rhetorical question (`wait, the OTHER battery invented the bunny?!`). That is a `Shout:` with the label removed. A plain note that lands the reveal scores on the hinge.
   Anchors from real verdicts:
   - résumé: Frank Oz (Yoda = Miss Piggy) 5 · Sterling Holloway "also voiced Kaa" 2 — the reveal separates them, not the shape.
   - debunk-led: Superman ice cream / Sacheen Littlefeather kept · Shepard's "only 24 yards" killed — does the correction make the thing bigger or smaller?
   - trademark/lawsuit: Duracell invented the bunny kept · Firefox's two trademark-forced renames (Phoenix → Firebird → Firefox) kept · the AT-AT copyright-trial verdict killed. The line: does the reveal stay a sayable, familiar THING (a browser, a mascot), or shrink into the legal proceeding itself (a court, a ruling, a settlement)?
   - 5 = Renegade / Akagi = Red Castle / Kirby = Jack Kirby · 2 = a lead sentence the room already knows · 1 = a contracts case.
3. Name the nearest-neighbor row in the live verdict list above and which pile it sits in (used / kept / killed). Skip any row whose fact starts with `bounced:`. That row is a pipeline stub, not Ben's taste.
4. Name the taste-profile §3 shape it matches, or "no shape". "no shape" is the cap in step 2.
5. Accept ≥3. An `edge` tag changes nothing. Score it 1–5 on the same question.
6. You may note "answer sits inside fact: <name>" as a score input; you never re-aim the answer line.

## Output — one line per entry, nothing else
`id | bounce:<sayable|mined|unverified> or score N | <shape> or "no shape" | nearest: <answer> (<used|kept|killed>) | learned: bar: <place> or nowhere I can name | hinges: "<sentence>" (host) ; "<sentence>" (host) | farm: <host or none> | <one-line reason>`
`hinges:` is one short sentence from each source that contains the hinge. A page that only names the subject does not count. `farm:` is a host you zeroed as a listicle or a generic page and that is not already on `content-farm-domains.txt`. Otherwise `none`.
Last line: `graded X / bounced B / accepted V / edge E`
