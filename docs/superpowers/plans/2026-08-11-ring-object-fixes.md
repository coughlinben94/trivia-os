# 2026-08-11 — ring-world object fixes (research → draft → blind critique → rewrite → re-critique)

**Committed per `references/ring-world-continuity.md` §2's commit-timing rule, before any other
work this session** — this is the mechanism that rule exists to enforce, not decoration.

**Branch:** `ring-scaffold-absorption`. **File:** `concepts/world-07-ring.html`. **Skills in
use:** `impeccable` + `emil-design-eng` as A1-priority reference inputs (per
`ring-world-mistakes.md`'s reinstatement) — specifically `impeccable`'s codex-defects rule on
hand-drawn/sketchy SVG, since the rest of both files doesn't transfer to object-craft (documented
finding in the ledger, not re-litigated here).

## Background

Two independent blind once-overs (one direct, one Fable-5 with zero knowledge of the first) each
rendered all 12 stations fresh and scored against the noun test / figurative-iconic match /
sketchy-SVG smell / glow-stripped silhouette check / distance survival. Both converged
independently on the same #1 cross-cutting problem — treated as the strongest signal in this
report.

## THE #1 FIX, cross-cutting, first priority

A reused "black disc with glowing rim" prop appears at stations 0, 2, 3, 4, 10. At 2, 3, 10 it is
the largest/brightest shape in frame, upstaging the station's real intended noun (star cluster,
orange nebula, supernova) — shrinks to a faint smudge/dot-cluster in a corner. Kill or drastically
shrink wherever it is not the actual subject. **Do NOT touch st0 (ringed planet) or st4 (lit
planet)** — both reviewers confirmed those two genuinely work; flattening them in a redo sweep
would be a regression.

## Per-station verdicts (harsher read wins where the two reviews diverge)

| St | Object | Verdict | Fix |
|----|--------|---------|-----|
| 00 | ringed planet | PASS both | leave alone |
| 01 | spiral galaxy | FAIL both | real redesign — no spiral structure, reads as bead-chain smudge |
| 02 | star cluster | FAIL both, worse than crude | headline shape reads as plain planet/eclipse (wrong noun); real cluster idea is buried in a reused speckle-dust motif with no headline weight anywhere — real redesign around visibly-clustered points, not the reused disc |
| 03 | orange nebula | cloud shape itself fine; upstaged by eclipse-disc | re-check after #1 fix before separate nebula work |
| 04 | lit planet | PASS both | leave alone |
| 05 | pulsar | DIVERGED (clean pass / borderline — beam lines vanish at 20ft) | real work: beam line weight 5-10x current |
| 06 | rose nebula | FAIL/weak both, dimmest object in suite | real contrast/opacity increase + decontaminate from unrelated flat-grey companion circle |
| 07 | comet | DIVERGED (basically correct-but-faint / FAIL — cropped off top edge) | real work: fix crop/placement first, then contrast |
| 08 | binary pair | DIVERGED (legit concept, low contrast / FAIL — indistinguishable from background stars) | real work: add an actual pairing cue (shared arc / connecting line candidate) — pressure-test against noun test before committing |
| 09 | asteroid field | PASS/borderline both; only 3 hexagons, halo reads as bokeh not rock, stray unrelated line | more (10+) smaller less-glowed polygons, remove stray line |
| 10 | supernova | starburst shape itself reads as explosion both reviews; upstaged by eclipse-disc | re-check after #1 fix before separate supernova work |
| 11 | aurora ribbon | FAIL both | real redesign around a wavy/undulating contour, not a flat oval smear |

## Scope boundaries (STAYS-HUMAN aligned, `ring-world-mistakes.md` "Verified good" section)

- Star layers, size ramp, and colour treatment/theme palettes are PROTECTED — no edits without
  explicit Ben sign-off on the specific change. None of the above should require touching either;
  if a fix drafts toward needing to, stop and ask.
- Object-form review lens: `impeccable`'s sketchy-SVG codex-defects rule + the noun test +
  drawn-subject check (`ring-verify.mjs`) + distance-survival read — not `impeccable`/
  `emil-design-eng` wholesale.
- Do not reduce star density anywhere as a side effect of any fix.

## The loop (same structure as the `ring-world-continuity` skill build, commit `9ee0bc5`)

1. **RESEARCH** — render current 12 stations fresh, confirm the table above still holds on
   today's actual disk state before fixing anything that might be stale.
2. **DRAFT** — fix order: (1) eclipse-disc contamination at st02/03/10, (2) st01/st02 real
   redesigns, (3) st05/07/08 real-work items, (4) st06 contrast+decontam, (5) st09 hexagon
   count/glow, (6) st11 wave contour. State predicted noun-test verdict BEFORE each implementation
   — predict-first, same discipline as every fix this session.
3. **BLIND CRITIQUE** — render the fixed suite fresh, dispatch two independent Fable-5 agents
   (Agent tool, model `fable`), zero cross-knowledge, same checklist, blind-score all 12 cold.
   Capture disagreement, don't smooth it over.
4. **RE-RESEARCH** — check every objection against a fresh render, not abstract reasoning.
5. **REWRITE** — incorporate real findings; note in the commit message any critique that turned
   out wrong against evidence.
6. **RE-CRITIQUE** — two more fresh blind Fable-5 passes against the rewrite only.

## Reporting requirement

Predicted vs actual per object, both critique rounds' verdicts, explicit open-vs-verified list.
**Do not commit the object changes until phase 6 comes back clean or explicitly
acceptable-with-named-caveats** — report honestly if it doesn't. (This plan doc itself is
committed now, separately and immediately, per the commit-timing rule — that is not contingent on
phase 6.)

## STAYS HUMAN reminder

Aesthetic acceptance — does this actually look right — is Ben's call, not a phase-6-clean
declaration. This report proposes; it does not conclude "done."
