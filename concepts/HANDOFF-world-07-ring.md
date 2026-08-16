# Handoff — world-07 ring, and the generator that has to come after it

Paste the block at the bottom into Claude Code from the repo root.

---

## Where this stands

Five prototypes died before this one. The failures are catalogued — **read
`FAILURE-LEDGER.md` in the Cowork outputs folder before proposing anything**, because the same
ideas keep coming back wearing new names.

`concepts/world-07-ring.html` is the current build. Its **arithmetic is verified**; its **appearance
is not**. Nobody has rendered it. That distinction is the whole reason this project has burned five
rounds — four builds were presented as finished having never been opened in a browser.

## What is verified

Run in a JS engine, not asserted:

```
far  surge=480   cylinder=5760   authorPeriod=5760
mid  surge=1920  cylinder=23040  authorPeriod=23040
near surge=2880  cylinder=34560  authorPeriod=11520  (m=3)

all layers hit phase 0 together at turns 12, 24, 36
integer arithmetic throughout — no float reaches a transform
parallax ratio far:mid:near = 1 : 4 : 6
content coverage exceeds cylinder + one frame on every layer
value arc span 2.89x  (target 2.2–4.0)
no-flat-neighbours 10/12 steps  (need >=8)
stars ~166 visible per frame  (target 150–260), 1,464 star nodes
```

## What is NOT verified — do this first

1. **Render it.** `concepts/world-07-ring.html`, open it, watch a full 12 turns plus the wrap at
   turn 12. Console must be clean.
2. **The wrap at turn 12.** The build deliberately *jumps* rather than animates when a layer would
   cross its cylinder, on the theory that phase 0 and phase `cylinder` hold identical content so the
   jump is invisible. **That theory is untested.** If it shows, that is the first thing to fix.
3. **Three stations sit at brightness 18** (indices 6, 7, 8) — a quarter of the ring is identical.
   It passes the spec at 10/12 but it is exactly the "nothing is a moment" defect that killed
   world-06. Fix by adding a small seeded jitter to `arcAt()` — roughly ±10–16%, seeded, never
   `Math.random` — and re-check that span stays inside 2.2–4.0 and steps stay ≥ 8.
4. **Node count 1,464 stars each running an opacity animation**, extrapolated from Sonora's 22 and
   never profiled at the time this was written. **[Corrected 2026-08-09:** target is one 1080p TV at
   ~20ft, not a MacBook-driving-3-TVs setup — that framing was wrong here too. Since measured: 56–59fps
   at ~5,465 DOM elements. Performance has never been the binding constraint. See
   `references/ring-world-mistakes.md`.]
5. Whether the primitives read as their nouns at 15 feet. `blob dots spikes lens streak ribbon`.

## The rules that keep getting broken

- **Render before you claim.** Anything unrendered is labelled unverified in the same message that
  delivers it. This is rule 1 and it has been broken in every round so far.
- **Every constant declared exactly once.** world-06 declared travel distance in CSS *and* JS; they
  disagreed; that was the pop everyone kept calling "choppy." Those pops measured 0.31° and 0.61° of
  visual angle — dead centre in the 0.26–1.05° band where sudden displacement grabs the eye hardest.
- **No `Math.random` in world construction.** world-06 used it for vertical placement, so the layout
  differed on every reload, which would defeat any automated check.
- **No blur on small elements.** A blur wider than about a quarter of an element deletes it. That is
  how "stars are the hero" became grey noise.
- **No vertical gradients in a space world.** A vertical ramp always implies a horizon; that is how
  an earlier build silently grew terrain nobody asked for. Terrestrial worlds *require* one — the
  rule is per world type, not universal.
- transform/opacity only; no `requestAnimationFrame`; reduced motion freezes rather than vanishes.

## Then: the two pieces that do not exist yet

**The generator agent.** Ben says "make me an Autumn Harvest world," an agent runs, and what comes
back is good enough to look at without a fight. The hard part is the design-vein problem: naive
templating gives 21 recolours of one file, free rein gives 21 unrelated looks. Needs a Noun Atlas —
space has nebulae and comets, Autumn Harvest does not — and forms that pass the noun test.
`concepts/OBJECT-RENDERING-PROTOCOL.md` applies.

**The verification gate.** Loads a generated world, drives it through all 12 stations
deterministically, captures each, reads the console, and checks the measurable rules above with a
number attached. Its absence is the direct cause of all five failed rounds. The repo already has
`.claude/hooks/geometry-lint.mjs` and `design-done-gate.mjs` — plug into those, do not build a
parallel system.

Scope it to **work, not to a pipeline.** The rule that would have caught every one of these failures
existed 8 days before the worst build and never fired, because its scope followed the file that wrote
it down rather than the work it should govern.

## Reference material

In the Cowork outputs folder (`~/Library/Application Support/Claude/local-agent-mode-sessions/.../outputs/`):

| File | What it is |
|---|---|
| `FAILURE-LEDGER.md` | 18 dead approaches + the process failures. Read first. |
| `S1-art-direction.md` | Measured critique of world-06 + the visual spec. `[auto]` items are gate-checkable. |
| `S2-engine.md` + `s2-world-engine.js` | The engine contract. `validateWorld` is the acceptance test. |
| `SCAFFOLD-TEAM-BRIEF.md` | Full context and house law |
| `DRAFT-world-scaffold.md` | Engine + content contract, incl. world types |
| `TT-02-doctrine-audit.md` | Why the repo's docs rotted; 24 contradictions; 8 mechanisms |

---

## THE PROMPT

```
Read concepts/HANDOFF-world-07-ring.md first, then concepts/world-07-ring.html.

Context: five prototypes of a 360-degree ambient background have failed. The
arithmetic of world-07 is verified; nothing about its appearance is. Four earlier
builds were presented as finished having never been rendered — do not add a fifth.

Do this in order:

1. Render concepts/world-07-ring.html in a real browser. Watch all 12 turns and the
   wrap at turn 12. Report what you actually see, with screenshots. Console must be
   clean. Do not describe it without looking at it.

2. Fix what the render exposes. The two known suspects: the turn-12 wrap jumps
   rather than animates (untested assumption that it's invisible), and stations
   6, 7 and 8 all sit at brightness 18 so a quarter of the ring reads identical.

3. Then build the two missing pieces, in this order:
   a) The verification gate — drives a world through all 12 stations
      deterministically, captures each, checks the measurable rules from
      S1-art-direction.md, emits pass/fail with numbers. Plug into the existing
      .claude/hooks/geometry-lint.mjs and design-done-gate.mjs rather than
      building a parallel system. Scope the rule to work, not to a pipeline.
   b) The generator agent — takes a theme name, emits a world that passes
      validateWorld in s2-world-engine.js and then passes the gate. Needs a Noun
      Atlas so it knows a comet doesn't belong in Autumn Harvest.

Standing rules, all of which have already been broken once:
- Render before you claim. Anything unrendered is labelled unverified in the same
  message that delivers it.
- Every constant declared exactly once — never in both CSS and JS.
- No Math.random in world construction; one seeded hash, everywhere.
- No blur on elements smaller than about 4x the blur radius.
- No vertical gradients in a space world (they read as a horizon). Terrestrial
  worlds require one — the rule is per world type.
- transform/opacity only, no requestAnimationFrame, reduced motion freezes.

Use systematic-debugging before any fix and verification-before-completion before
calling anything done. Show me renders, not descriptions.
```
