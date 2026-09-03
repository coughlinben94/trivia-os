# Ring station variety — noun pool, random draw, per-round redraw (OBJECT side)

**Date:** 2026-09-02. **Author:** Fable 5.1, consult agent. **Status:** plan only, no code changed.
**Sibling plan (colour side, do not merge scopes):** `2026-09-02-ring-palette-runtime.md` — not read, not
duplicated here. Where the two touch, this file says "colour plan owns it" and stops.

**Rules this plan holds itself to:** never edit `concepts/tools/ring-spec.lock.json`, never touch
`ring-verify.mjs` pass/fail logic, never move a threshold (`references/ring-world-continuity.md` §4).
Every "Ben decides" item is marked **STAYS HUMAN** and collected at the end.

---

## Verdict, up front

1. **Don't add nouns yet. Fix the ones you have first.** By the spec's own definition (lock file
   `drawnSubject.kinds` = `ground/nebulaCloud/ring/sprite`), **10 of 13 headline objects are glow-kind, not
   drawn** — that is Ben's "they look like shit" complaint written as a gate check, already failing. A pool
   of 20 objects that read badly is more variety of bad. Quantity after quality.
2. **The pool idea is right, and it is cheap to build the *machinery* for — the pool *contents* are the art
   project.** Build the draw (a pure, seeded, tested function) once the colour plan has landed; grow the pool
   one object at a time, each through the rendering protocol.
3. **Grow the pool with variants of the one anatomy Ben has already accepted (planets: `drawPlanetDisc`)
   before inventing new object kinds.** Crescent moon, banded giant, eclipse. Cheapest real variety, best
   odds of reading at distance.
4. **Per-show draw: yes (later). Per-round redraw of the noun set: no, not now.** Round-to-round variety is
   the colour plan's job (palette per round). A noun redraw mid-show needs a rebuild mechanism the ring
   doesn't have, a pool 2-3× bigger than is realistic this season, and gate runs per draw. Say no now,
   revisit when the pool is over ~25 and the colour plan's rebuild hook exists.
5. **What I would not do:** raise `PANES`; random `Math.random` anything; a third copy of the station
   array; figurative nouns (rocket, satellite, astronaut) before a `sprite` kind exists; per-station flags
   as the way to make new nouns fit.
6. **Free lever, tiny gain, Ben's call whether to bother:** start each show on a different station
   (hash of show id mod 13). Same world, different first impression. One line. Not "variety".

Cheap: Phase 0, Phase 1 (slot-table extraction), Phase 2 (draw function). Art project: Phase 4 (every new
noun) and the craft pass on the existing five glow-kind headlines. Sonnet can do Phases 1-2 after the colour
work; nobody should hand Sonnet a "draw a saucer" task without the protocol.

---

## 0. What the two mandated skills actually contribute (honest reading)

Both loaded per Ben's A1 instruction (`references/ring-world-mistakes.md`, "[REINSTATED, A1 priority]").

- **`impeccable` — one rule transfers, cite it by id: `skill-ban-codex-sketchy-svg`.** "5-to-30 path crude
  scenes meant to depict a tangible subject… read as amateurish, not whimsical. If you can't render the
  scene with real assets, ship no illustration." That is the exact risk of every figurative noun on the
  candidate list below (rocket, satellite, astronaut) and the reason they are excluded from this plan. The
  rest of the skill (contrast ratios, card grids, eyebrows, cream backgrounds, `product.md` register) is UI
  layout and does not apply to drawn objects on a TV. Its `context.mjs` was run; PRODUCT.md is the only
  useful output — see §1 for a viewing-distance contradiction it surfaced.
- **`emil-design-eng` — no object-craft content, as the ledger already says.** Two habits transfer, both
  process, not craft: (a) "review with fresh eyes the next day / frame by frame" → for us that is the
  fill-black silhouette read (spec §6.2) and the outstanding TV test, done before any verdict; (b) "good
  defaults matter more than options" → the station array now carries nine per-station override flags
  (`cornerLeft`, `bandUpper`, `companionUpper`, `companionKind`, `companionBoost`, `noCompanion`,
  `maxDetail`, `variant`, `region`). Each is a patch for one noun in one slot. A pool cannot carry patches
  — a noun that only works with a flag in slot 7 is not a pool member. This is the one emil idea that
  changes the design here (see §3, slot table vs noun table).

No animation advice belongs in this plan and none is included.

---

## 1. Facts checked today — confirmations and corrections to the brief

Verified in this session against the live files, not quoted:

- `ENGINE.PANES` is 13 (`RingAmbient.jsx:62`). `assertLayerPeriods` passes for PANES 13-20 (ran it —
  `scratchpad/arc-sweep.mjs`). **Layer tiling does not block more stations. Confirmed.**
- **`arcAt` re-opens the spec tier when PANES moves — confirmed and sized.** Ran `buildArc` (the real
  function, includes `separateArc`) for PANES 13-20 at the shipped `phase: 5`:
  - 13-16: span 3.04 / 2.82 / 3.07 / 3.14 (band 2.2-4.0 ok), quietest 9.7-10.6 (band 8-13 ok), loudest
    29.4-32.1 (band 26-34 ok), every cyclic gap ≥ 1.29 (floor 1.26). **Pure-arithmetic arc checks pass
    up to 16.** Every station's loudness still moves (st0 goes 29.4 → 23.1 by PANES 16), so every
    rendered check (ink, headline ink, mid-share, realised arc, bleed, quadrant, balance) re-rolls.
  - **17+: the quadrant lock makes it impossible by arithmetic.** `quadrant` is 2-4 headlines per
    quadrant; four quadrants cap at 16. At 18+ the quietest station also drops under the 8 floor
    (7.5, 7.4, 7.4). So **16 is the hard ceiling for a fixed ring without a lock-file edit (STAYS
    HUMAN)** — and that is a ceiling on *stations*, which this plan argues against raising anyway.
- Gate state 49 PASS / 2 WARN / 14 FAIL: **not re-run** (another session is editing this checkout;
  instrument ten's HMR shape would poison a react-live pass). Quoted, not verified.
- "~4 stations of far content co-visible": arithmetic is right (480 vs 1920) but **moot** — the far layer
  now carries only stars and the drifter. The anchor and the wash blobs were both removed 2026-08-13
  (`RingAmbient.jsx:176-187`, `:163-175`). Nothing station-keyed lives on far.
- **Correction: the family-spacing rule is *not* gated and is *already broken twice* with Ben's sign-off.**
  `grep family ring-verify.mjs` → nothing. The ring today has radial mass at {0,3,4,8} (st3-st4 distance 1,
  flagged in `world-07-ring.html:419`) and record-vs-binary at distance 2 (`:426`). The brief's "guaranteed
  by hand-authored ordering" is optimistic — it is guaranteed by a comment, and the comment records two
  exceptions.
- **Correction: `sprite` and `ground` do not exist.** `grep "kind === 'sprite'" ringPrimitives.js` →
  nothing. The lock's drawn list names two kinds that were never built, and omits `planet`, `record`,
  `binary`, `asteroidField`, `pulsar` — kinds that are plainly drawn (opaque disc + terminator + rim) but
  count as glow for the check. That mismatch is why 10/13 fail. Reconciling it is a lock-file edit —
  **STAYS HUMAN** (question Q1 below).
- **Viewing distance now has three sources, not two:** ~20 ft (2026-08-09 handoff), ~12 ft / 55"
  (`ART-DIRECTION-SPEC.md` §13), and "3 TV screens from 10+ feet" (`PRODUCT.md`, via impeccable's
  `context.mjs`). Still unmeasured. Nothing below cites one as settled.
- **Within-night repetition dwarfs week-to-week repetition.** `references/slides.md`: ~60 questions + 5
  round intros + 6 shiny titles + 5 grading breaks + pre-show ≈ 78 ring-visible slides per show
  (`Display.jsx:300` `isRingVisible`). 78 / 13 ≈ **6 laps a night — every station is seen six times per
  show.** A per-show pool changes *which* 13 repeat six times; it does not touch the six. Ben should know
  that before deciding what "more varied" means to him (question Q2).
- `concepts/noun-atlas.json` is stale: 8 bare `noun → primitive` strings (the exact shape spec §6.2 bans),
  three of them retired nouns. Not a usable pool seed. Flagged, not edited.
- Two copies of the station array exist and are hand-synced: `client/src/worlds/midnightGalaxy.ring.js:104`
  and `concepts/world-07-ring.html:415` (the html copy carries `maskSpots` the JS copy doesn't). Plus the
  hue pin `midnightGalaxy.ring.test.js`, plus `scripts/ring-recolor.mjs` rewriting all three by key. A pool
  touches all four (§3.5).

---

## 2. Design question 1 — a noun pool instead of a fixed 13

**Yes, draw from a pool — but the draw fills a fixed table of 13 *slots* whose placement is authored once
and gated once. Nouns move; slots don't.** That one decision is what keeps most of the gate invariant
across draws.

### 2.1 Why slots, not free placement

Today a station's placement comes from `rng(i, 0x5EED1)` keyed by *station index*, but the corner and band
coin-flips happen *after* `makePrim` has consumed an unknown number of draws from the same stream
(`ringPrimitives.js` calls `r()` 116 times across branches; `RingAmbient.jsx:329-333` draws `cornerDraw`
after the headline is built). So the corner a noun lands in depends on *which prim* was built — the comet's
`cornerLeft:false` exists precisely because "the redesigned streak draws more seeded points, which reordered
this station's corner draw" (`world-07-ring.html:423`). Put a different noun in slot 7 and slot 7's corner
changes. Quadrant rotation, horizontal balance, vertical spread — all gated — would re-roll on every draw.

Fix: a **slot table** — 13 entries of `{ cornerLeft, bandUpper, companionUpper, companionBoost, maxDetail }`
— read from the table, with the coin-flip draws still *called* so no stream count changes (the codebase's
own established pattern: "the draw still always happens so this station's rHeadline stream count is
identical whether or not it's overridden", `RingAmbient.jsx:326-328`). Seed the table with today's
*effective* values (rolled value, or the override where one exists) so the authored ring renders
byte-identical. Then quadrant / balance / vertSpread / occluder-placement are **slot properties, invariant
under any draw**. What still varies per draw: bleed (depends on prim size/rotation), ink, headline ink,
mid-share, perceptibility, arc-realised — all prim-dependent, all spec-tier.

### 2.2 Which of the current per-station flags are slot vs noun

| flag | belongs to | why |
|---|---|---|
| `cornerLeft`, `bandUpper`, `companionUpper` | slot | placement grammar (§2 quadrant/balance) |
| `companionBoost` | slot | it exists because slots 6/7 sit at the arc trough (`lou≈0`), a property of index+phase |
| `maxDetail` | slot | set from measured element counts at loud slots (`dn = lerp(1,4,lou)`) |
| `companionKind`, `noCompanion` | noun | "rolled dots is illegible next to a streak" is about the noun's own shape |
| `variant`, `region`, `regionSource`, `accent`, `hue`, `prim`, `family` | noun | identity |

`region` travelling with the noun means the sky-region weights (`skyRegionWeights`, index-distance based)
re-derive per draw for free — a ring with no pulsar simply has no aurora. **Whether the colour plan's
per-round palette wants regions pinned to slots instead is the colour plan's call; this plan only notes the
seam.**

### 2.3 Invariants the draw must enforce (build-time, not gate-time)

From `ring-world-mistakes.md` + spec §6.2/§10, listed with where each is *actually* checked today:

| invariant | checked today? | in the draw |
|---|---|---|
| headline noun appears exactly once | comment only | by construction (draw without replacement) |
| same silhouette family ≥3 apart, cyclic (12 neighbours 0) | comment only, violated twice | **hard**, via family lanes (§2.4) |
| ≤3 headlines share one `prim` name; never adjacent | comment only | hard |
| headline prim is a drawn kind | `ring-verify` static (spec tier, 10/13 FAIL) | pool entries only from an allow-list — **which list is Q1** |
| record station present, at index 10 | `Display.jsx:659 MUSIC_STATION = 10`, comment says "follows the record" | pinned: draw, then rotate so record lands at 10 (rotation preserves every cyclic distance) |
| accent stations ≤3 | comment (`:426` "warm-complementary cap") | hard, ≤3 accents per draw |
| 1-3 hue anchors, every hue inside a window | `ring-recolor.mjs` warnings | **colour plan owns**; the draw only carries hues through |
| quadrant 2-4 each, balance ±96, vertSpread ≥6, bleed 3-5, occluder placement | `ring-verify` | slot table (§2.1) — invariant by construction for the first four; bleed re-measured |

### 2.4 The selection algorithm — concrete, seeded, no `Math.random`

New pure module, no DOM, sibling of `ringEngine.js`: `client/src/lib/ringDraw.js`. Uses `rng` from
`ringEngine.js` (`hash32`-based, reproducible).

```js
// ringDraw.js — pure. pool: [{ key, prim, family, hue, accent, ... }]; slots = 13.
import { rng } from './ringEngine.js'

export const LANE_CAP = (slots) => Math.floor(slots / 3)   // 4 at 13: max members of one family with spacing >=3

export function drawStations(pool, { seed, slots = 13, pinKey = 'record', pinAt = 10 }) {
  const r = rng(seed, 0xD0A1)
  const pick = (arr) => arr.splice(Math.floor(r() * arr.length), 1)[0]

  // 1. pin
  const pinned = pool.find(s => s.key === pinKey)
  const rest = pool.filter(s => s !== pinned)

  // 2. choose the set: weighted by family size, capped per family, <=3 accents, <=3 per prim name
  const chosen = [pinned]
  const byFam = () => chosen.reduce((m, s) => (m[s.family] = (m[s.family] || 0) + 1, m), {})
  while (chosen.length < slots) {
    const cands = rest.filter(s => !chosen.includes(s)
      && (byFam()[s.family] || 0) < LANE_CAP(slots)
      && chosen.filter(c => c.accent).length + (s.accent ? 1 : 0) <= 3
      && chosen.filter(c => c.prim === s.prim).length < 3)
    if (!cands.length) throw new Error('ringDraw: pool cannot fill ' + slots + ' slots under the caps')
    chosen.push(pick(cands))
  }

  // 3. place: three lanes {k, k+3, k+6, k+9} take up to 4 members of ONE family each;
  //    slot 12 (neighbours 10,11,0,1) needs a family absent from lanes 0 and 1's ends.
  //    Sort families by size desc; big families get whole lanes; small families share a lane
  //    only if the lane's own members stay >=3 apart (always true inside one lane).
  const fams = Object.entries(chosen.reduce((m, s) => ((m[s.family] ||= []).push(s), m), {}))
    .sort((a, b) => b[1].length - a[1].length)
  const order = new Array(slots).fill(null)
  const lanes = [[0, 3, 6, 9], [1, 4, 7, 10], [2, 5, 8, 11]].map(l => l.filter(i => i < slots))
  // fill lanes round-robin from the biggest family; leftover singletons take slot 12 if legal
  // (full assignment with backtracking is ~40 lines; the point is it's deterministic and asserts)
  // ... assign ...
  assertRing(order)   // family >=3 cyclic, prim <=3 & non-adjacent, unique keys, accents <=3

  // 4. rotate so the pinned noun sits at pinAt — rotation keeps every cyclic distance
  const at = order.findIndex(s => s.key === pinKey)
  return order.map((_, i) => order[(i + at - pinAt + slots) % slots])
}
```

Seed source: `hash32` of the show id (`show.id`, stable across Go Live resume — the same show must draw
the same ring every time the display reloads mid-night). `seed = 0` (or `seed: 'authored'`) **must return
today's 13 in today's order** — that is Phase 2's falsifier and keeps the shipped world byte-identical
until Ben flips it on.

Failure policy: `drawStations` throws in dev; in production `RingAmbient` catches and falls back to the
authored 13 (the codebase's own precedent — `separateArc` "deliberately does NOT throw… a black screen
mid-show is worse than a slightly flat arc").

### 2.5 What the draw cannot make invariant, stated plainly

- **Bleed** (3-5 stations cropped 10-35%): depends on prim width/rotation (`ROTATION_MAX_DEG`,
  `rotatedBandH`). Streak/ribbon/asteroidField have their own width tiers. A draw with three elongated nouns
  in bleeding slots can exceed 5. Mitigation: slot table marks which slots bleed; elongated prims get a
  per-prim bleed profile. Still measured, not proven.
- **Ink / headline ink / mid-share / perceptibility**: per-prim. Each pool member must have been gated *in
  every slot class it can land in* (loud / mid / trough) before it enters the pool — that is the per-noun
  acceptance in Phase 4, and it is the real cost.
- **The gate certifies one seed.** A per-show pool is 52 worlds a year and the gate has looked at one.
  Options for Ben (Q3): gate K sample seeds in CI (K=5 ≈ 5× gate time), or accept slot-invariance for the
  regression tier and spot-check spec tier per new noun only.

---

## 3. Design question 2 — how big must the pool be before "different every week" is true

Do the honest arithmetic on *set overlap*, not permutations. The crowd sees the noun set (six laps a
night); they don't perceive orderings.

With pool size P and 13 drawn (record always in), expected shared nouns between two consecutive weeks
≈ 1 + 12 × 12 / (P − 1):

| P | shared week-to-week | new nouns per week | how it reads |
|---|---|---|---|
| 13 (today) | 13 | 0 | same world |
| 16 | 10.6 | 2-3 | "was that planet here last week?" |
| 19 | 9.0 | 4 | a third of the ring is new |
| 25 | 7.0 | 6 | half new |
| 37 | 5.0 | 8 | mostly new |

**Family caps bite before the pool does.** With spacing ≥3 on 13 slots, no family can exceed 4 per draw,
and the lane geometry needs ≥4 families (slot 12 needs a family absent from slots 10, 11, 0, 1). Today's
families: radial mass 4 (+record's disc), cluster 2, burst 2, streak 2, cloud 1, lens 1. **Radial mass is
already saturated at 4** — so a pool of 7 planets buys real variety (any 4 of 7 each week) while a pool of
12 planets buys nothing extra per draw. Grow *breadth across families* once the planet lane is full.

Orderings: after family-lane assignment, the legal arrangements number in the thousands even at P=13 — but
a reordering is not variety the crowd notices; it is only which noun sits on the loud arc slot. Don't count
it.

**Honest number:** a pool of ~19 (six new nouns, four of them planet variants) gets "a third of the ring
is new each week". That is the realistic season-scale target. "Mostly new every week" needs ~37 nouns,
which is ~24 art rounds at this project's historical rate (each object 2-7 review rounds). Not this season.

---

## 4. Design question 3 — which nouns, concretely

Space world only (the 21-theme generalisation is retired; a second world doesn't exist). Every entry
classified per `OBJECT-RENDERING-PROTOCOL.md`: **iconic** = one sentence of geometry, hand-code;
**figurative** = contour/joints, reference-first trace, never generated pixels.

### Tier A — variants of the accepted planet anatomy (`drawPlanetDisc`). Cheapest, best odds.

| noun | class | prim / new? | family | keep ≥3 from | cost | note |
|---|---|---|---|---|---|---|
| crescent moon | iconic | `planet` variant `'crescent'` — `lightDeg` near-grazing + a second dark disc offset along the light vector | radial mass | ringed, amber, lit, binary, record | ~60-80 lines in `drawPlanetDisc` | strongest silhouette in the sky; fill-black test passes by definition |
| banded giant (Jupiter) | iconic | `planet` variant `'banded'` — 3-5 horizontal bands clipped to the disc, one storm oval | radial mass | same | ~60 lines | bands must be ≥4px and ≥+40 luma or they vanish at distance (spec §6.1) |
| eclipse | iconic | `ring` anatomy minus the ring: dark disc over a bright corona annulus | radial mass / burst hybrid | planets AND pulsar/supernova | ~80 lines | **subtractive** — spec §7.2 bans it on bottom-third-by-arc slots; slot table must mark it loud-only |
| cratered moon | iconic | `planet` variant `'cratered'` | radial mass | same | ~50 lines | weakest of the four: craters at 12-20 ft read as spots; test on the TV before committing |

Reject in this tier: a third `ring` variant (tilted/double ring) — `ring` is already used twice (st0, st3);
the ≤3-per-prim cap plus "must differ in a non-hue parameter by ≥25%" makes a third a near-duplicate.
Black hole with accretion disc — in silhouette it *is* a ringed planet (dark body + ring); fails the
fill-black distinctness test against st0.

### Tier B — new drawn kinds, iconic. Medium cost, each is a new `makePrim` branch (~100-150 lines) plus
`ringCss` rules plus both builds.

| noun | class | prim | family | keep ≥3 from | note |
|---|---|---|---|---|---|
| constellation (Big Dipper or one named figure) | iconic | new `constellation`: 7 dots ≥6px + ≥4px connector strokes | scattered cluster | star cluster, asteroid field | the most *nameable* thing on this list for a bar crowd; the connectors are what make it drawn, not `dots` |
| flying saucer | iconic (ellipse + dome + 3 lights) | new `saucer` | lens (same silhouette as an edge-on spiral) | spiral galaxy | campy, on-brand ("full of personality"); kitsch risk is Ben's call (Q5) |
| edge-on galaxy | iconic (bright bar + bulge + dust lane) | new `edgeGalaxy` | elongated streak | comet, aurora ribbon | would make a 3rd streak-family member; only worth it once cluster/burst lanes are also 3 |

### Tier C — figurative. **Not in this plan.**

Rocket, satellite/probe, astronaut, space whale, telescope. All need a `sprite` kind that does not exist,
a per-noun traced path (reference-first, hand-placed anchors, provenance comment, `geometry-lint`), and each
one is the textbook `skill-ban-codex-sketchy-svg` case. If Ben wants one of these, it is a separate project:
build `sprite` once (the spec's own §6 ask, ~200+ lines + the path library), then one noun at a time. Say
so rather than letting a subagent try a 12-path rocket.

### Also not: anything that needs a new **glow** kind. Glow is atmosphere, never the subject (§6.0).

### Quality bar before quantity — the plain statement

Five current headlines are glow-kind by any reading (`lens` spiral galaxy, `dots` star cluster, `streak`
comet, `ribbon` aurora ribbon, `spikes` supernova). Ben's 2026-08-12 notes on them: "shape looks terrible",
"needs a relook", "weird line". **Rebuilding those five as drawn kinds is worth more than any five new
nouns**, and it is the same skill and the same protocol. Order: (1) Q1 settles which kinds count as drawn,
(2) rebuild the five, (3) Tier A variants, (4) Tier B. Adding first is the wrong order.

---

## 5. Design question 4 — "more slides that appear randomly"

**Primary reading (a), assumed everywhere above:** more ring *stations*, drawn at random per show. Fits
"adding new items to the noun random concept" in the same sentence.

**Alternative reading (b), a different product idea:** trivia *slide types* that appear at random in a
show — e.g. a wildcard bonus slide, a random "swing" mini-format, a surprise Shiny title card. That lives in
`slideStepping.js` / the show builder, not the ring, and would be its own plan with its own questions
(random at build time or live? does the host know in advance? does it affect scoring keys `r_${round.id}`?).
Nothing in this plan builds it. **Disambiguation is Q4 below.**

---

## 6. Design question 5 — redraw the station set per round?

**No, not now. Here's why, plainly.**

- **The ring builds its DOM once at mount** (`RingAmbient.jsx` mount effect: `buildArc` →
  `buildLayerContent` → cylinder copies). A mid-show redraw is a rebuild. The only moment it could hide is
  under the jukebox at the record station (`MUSIC_STATION = 10`, the warp's black frame). The colour plan is
  building a rebuild-under-overlay hook for palettes; a noun redraw would ride that same hook — **it cannot
  exist before it, and it is not this plan's to build.**
- **The premise survives only if the pivot is pinned.** The record must stay at 10 across redraws (the
  draw's rotation step guarantees that). Then the crowd's experience is: warp out, music, warp back to the
  record — and the *next* turn lands on a station they last saw ~13 slides ago. Nobody holds 13 stations in
  memory across a grading break. So it is coherent enough, *if* the seam is invisible. That is a TV check,
  not an argument.
- **The gain is small at any pool size Ben can afford.** Five rounds × 13 = 65 station-slots a night. With
  a 19-noun pool, every noun appears in ~3.4 of 5 rounds — the crowd sees the same objects re-shuffled, and
  now the *within-round* lap (§1: ~1.2 laps per round) is the only thing that changed. Per-round redraw
  starts paying at P ≈ 33+.
- **Gate cost multiplies.** Each draw is a world; per round is five worlds a night.
- **What round-to-round variety should come from instead:** the colour plan's per-round palette (cheap,
  no art, already in flight), and the arc — a round already spans one full loud-to-quiet lap.

Revisit when: pool > 25, the colour plan's rebuild hook is live, and the TV test has happened.

---

## 7. Design question 6 — where object-craft quality actually comes from

Cite one rule, by id: `impeccable` → `skill-ban-codex-sketchy-svg`. Everything else below is this
project's own spec, which already says what makes an object read at bar distance:

1. **Closed, opaque silhouette** — spec §6.2 fill-black test: silhouette it, is the noun still guessable?
   The planets pass; a glow can't.
2. **A hard sub-element ≥4px thick at ≥ local background + 40 luma, tracing ≥60% of the parent's outline**
   (§6.1). The planets have it (terminator + rim in `drawPlanetDisc`). The five glow headlines don't.
3. **One light direction for the whole world** — `LIGHT_DEG = 225` exists; every new drawn kind must use it
   or it reads as pasted in (protocol's "one scene, one visual language").
4. **Size is already right** (headline 30-46% of frame width). "It feels small" is ink, not box (§1).
5. **No glow as subject** (§6.0). Glow behind a drawn subject is fine; glow *as* the subject is the failure
   that keeps moving from station to station.
6. **Deliberate imperfection** — protocol addendum: too-smooth, too-symmetric detail is itself the
   AI tell. Hand-placed, uneven detail density.

**And the one thing no rule substitutes for:** the TV test. Real screen, real distance, sort 13 stations
into reads-as-present / reads-as-empty by eye, written down before looking at a number. Still outstanding;
also settles which of the three viewing-distance numbers is real. Every threshold below the fold depends on
it. **Do it before Phase 4 spends an art round.**

---

## 8. Phases

Order matters: **Phase 1-3 wait for the colour plan to land** (it rewrites the hue-constant block and
`ring-recolor.mjs`'s station handling — a pool needs one named hue constant per pool entry, and building that
against a moving file is a merge nobody wants).

### Phase 0 — start each show on a different station (optional, free, tiny)

- **Files:** `client/src/views/Display.jsx` (one expression where `slideIndex` is computed at `:838`;
  add `+ (hash32(show.id, 0x0FF5E7) % 13)`). Nothing else.
- **Effect:** same world, different first station. `MUSIC_STATION` jump and `RING_RETURN` unaffected
  (absolute / derived). Go Live resume stable (hash of a stable id).
- **Verify:** `npm run test:unit`; preview two shows with different ids, confirm different pre-show
  stations; reload one, confirm the same station.
- **Rollback:** revert one line.
- **Falsifier:** if the gate's `[react-live]` pass drives the `/ambient?ring=1` route through this code
  path and its station numbering shifts, the phase-0 wrap checks (`all layers hit phase 0 together`) go
  red → the offset leaked into the gate's drive. It must not; the gate uses `jumpTo` directly.
- **Honest value:** 13 first impressions. Not variety. Ben decides whether it is worth even one line (Q6).

### Phase 1 — slot table extraction (byte-identical refactor)

- **Files:** `client/src/components/display/RingAmbient.jsx` (station loop `:260-616`),
  `concepts/world-07-ring.html` (its identical loop, ~`:600-1100` — both builds, lockstep, "synced"
  comments per house rule), new `client/src/worlds/midnightGalaxy.slots.js` (13 entries), new test
  `midnightGalaxy.slots.test.js`.
- **What:** move `cornerLeft` / `bandUpper` / `companionUpper` / `companionBoost` / `maxDetail` out of the
  station entries into the slot table, seeded with today's *effective* values (rolled draw or override).
  Keep every `r()` call exactly where it is. Station entries keep `key/prim/hue/accent/variant/region/
  regionSource/companionKind/noCompanion` and gain `family`.
- **Verify:** `npm run test:unit`; `npm run verify:ring` on both builds; screenshot diff of all 13
  stations before/after (`concepts/.audit-shots/`, gate already writes them) — **byte-identical or stop**.
- **Rollback:** `git revert` one commit; no data, no lock, no threshold touched.
- **Falsifier:** any pixel diff at any station in either build. The 2026-08-08 bandY incident is the
  prior: one extra `r()` call reshuffled 4 of 12 stations' companions. If the diff isn't zero, a stream
  moved — find it, don't tune around it.
- **Cheap.** Sonnet-sized, after the colour plan.

### Phase 2 — `ringDraw.js`, pure, tested, not yet wired

- **Files:** new `client/src/lib/ringDraw.js`, new `ringDraw.test.js`. No render change.
- **Tests:** (a) seed `'authored'` returns today's 13 in today's order (**the falsifier**); (b) 10,000
  seeds over a synthetic 30-noun pool: zero family-spacing violations, zero duplicate keys, record always
  at 10, ≤3 accents, ≤3 per prim and never adjacent; (c) determinism: same seed twice → same array;
  (d) a pool that cannot fill 13 under the caps throws with a readable message.
- **Rollback:** delete two files.
- **Cheap.** Sonnet-sized.

### Phase 3 — wire the draw (behind a flag), gate K seeds

- **Files:** `RingAmbient.jsx` (accept `worldData.pool` + `seed`, call `drawStations`, fall back to
  `worldData.stations` on throw), `ParticleBackground.jsx` (pass `show.id`-derived seed), `Display.jsx`,
  `concepts/world-07-ring.html` (`?seed=` query for the gate), `midnightGalaxy.ring.js` (add `pool: [...]`
  = the current 13 with `family`, so the draw is a no-op set until Phase 4 adds members),
  `scripts/ring-recolor.mjs` (rewrite per pool key — **coordinate with the colour plan's final shape**),
  `midnightGalaxy.ring.test.js` (pin extends to pool entries), `WorldPaletteEditor.jsx` (lists stations by
  index — now lists the pool; colour-side file, flag only).
- **Verify:** `npm run verify:ring` at seed `authored` — must equal today's numbers exactly; then at 5
  sample seeds — regression tier must stay 34/34 (slot-invariant by construction — **if it doesn't, the
  slot table leaked**); spec tier per seed reported, not gated.
- **Rollback:** flag off = authored order; revert wires.
- **Falsifier:** regression tier moving with the seed. That would mean placement is still noun-coupled and
  Phase 1's extraction missed a draw.
- **STAYS HUMAN before this phase:** Q3 (what the gate certifies when there are many seeds).
- Medium. Needs an attended session for the gate runs (instrument ten: no concurrent editing on 5173).

### Phase 4 — grow the pool, one noun at a time (art project)

For each noun, in this order — crescent moon, banded giant, constellation, eclipse, saucer (if Q5 yes):

1. Noun test written down first: "PASS = a fresh viewer names this as ___" (protocol, frozen criterion).
2. Iconic → hand-code (`ringPrimitives.js` branch or `drawPlanetDisc` variant), `LIGHT_DEG`, ≥4px hard edge,
   `geometry-lint` passes. Both builds.
3. Render in isolation, fill-black, then in the three slot classes (loud / mid / trough) via
   `stationOverride` / `?seed=`. Two failed fresh reads → tighter reference trace (protocol); a third blind
   attempt is a violation.
4. `npm run verify:ring` at a seed that places it — ink / headline ink / bleed / perceptibility reported.
5. Ben's eye on the TV. Aesthetic acceptance is his (STAYS HUMAN).
6. Only then: add to `pool`, add its hue constant + pin, commit.

- **Falsifier per noun:** the fill-black read. If a fresh reader can't name it silhouetted, it does not
  enter the pool regardless of what the numbers say.
- **Rollback per noun:** remove the pool entry; the kind can stay in `ringPrimitives.js` unused.
- **Expensive.** Each is 2-7 review rounds historically. Not a Sonnet-tomorrow task.

---

## 9. Do not do this — traps specific to this codebase

1. **Don't raise `PANES`.** 17+ is arithmetically impossible under the quadrant lock; 14-16 re-rolls every
   station's loudness and every rendered check, for zero variety (still one fixed set). Variety comes from
   the pool, not the station count.
2. **Don't consume or add a single `r()` draw in the station loop.** One extra call reshuffles every
   downstream placement in that station (2026-08-08). Phase 1's byte-identical diff is the guard.
3. **Don't make the draw random at runtime.** `Math.random` is banned in world construction
   (`[static] no-stray-math-random` is a gate check). Seed from `show.id`.
4. **Don't create a third station list.** Two hand-synced copies + a pin + a recolor script already drift
   (st9's spanning field never synced for four days, `FAILURE-LEDGER.md` 2026-08-16). If the html reference
   can import the pool from `midnightGalaxy.ring.js` (it already imports `ringPrimitives.js` and
   `ringEngine.js` from `../client/src/lib/`), do that in Phase 3 rather than copying.
5. **Don't put pool members in a new `*.ring.js` file thinking it's inert.** `ring-verify`'s static checks
   glob `client/src/worlds/*.ring.js` and read every `prim:` as a station. Parity (every prim has a branch)
   is a feature — keep it; drawn-subject will report per pool entry — expected, spec tier, say so in the
   commit.
6. **Don't ship a Recraft pixel, trace a game-icons file, or `vectorize_image` anything.** Reference only;
   Recraft's free tier bars commercial use and Baynes is commercial.
7. **Don't fix a noun that fails in one slot with a new per-station flag.** That is the pattern the pool
   makes impossible to carry. A noun that only works with a flag isn't pool-ready.
8. **Don't run the gate's react-live pass while another session edits this checkout** (instrument ten,
   both shapes). Use `vite preview` on a private port or wait.
9. **Don't edit `ring-spec.lock.json` to make `planet`/`record` count as drawn.** It is the right fix and it
   is Ben's to type (Q1).
10. **Don't touch the nebula/anchor questions on the way past.** Nebula demotion is an unproven hypothesis;
    the far-layer anchor is an open spec question. Both are flagged in the ledger; neither is this plan's.

---

## 10. Cheap vs art project — for tomorrow's Sonnet session

| item | size | who |
|---|---|---|
| Phase 0 start-offset | one line | anyone, if Ben wants it |
| Phase 1 slot table (byte-identical) | half a day, attended gate run | Sonnet, after colour plan lands |
| Phase 2 `ringDraw.js` + tests | half a day, no render | Sonnet |
| Phase 3 wiring + K-seed gate | a day, attended | Sonnet + Ben for Q3 |
| Rebuild the five glow headlines as drawn kinds | 5 × (2-7 rounds) | art project, protocol, Ben's eye |
| Phase 4 each new noun | 2-7 rounds each | art project |
| `sprite` kind + any figurative noun | separate project | not this season unless Ben says so |

Sonnet is doing colour tomorrow. Nothing in this plan is for tomorrow.

---

## 11. STAYS HUMAN — questions for Ben

- **Q1 (lock file).** `drawnSubject.kinds` names `sprite`/`ground` (never built) and omits `planet`,
  `record`, `binary`, `asteroidField`, `pulsar`. Which of those five count as drawn? Your edit, your call.
  Until answered, the pool's allow-list is undefined.
- **Q2 (what "varied" means).** Each station is seen ~6× a night. Is the itch week-to-week (pool per show
  fixes it) or within-night (nothing cheap fixes it; per-round redraw needs a 30+ pool)?
- **Q3 (gate policy for many seeds).** Gate K sample seeds per change (slower), or gate the authored seed
  only and rely on slot-invariance for the regression tier? Threshold and gate-logic choices are yours.
- **Q4 (disambiguation).** "More slides that appear randomly": ring stations (this plan), or actual trivia
  slide types appearing at random in a show (a different plan)?
- **Q5 (taste).** Flying saucer: campy-on-brand or too kitsch for the space world? Constellation: Big
  Dipper, or a made-up figure? Eclipse: worth its loud-slot-only restriction?
- **Q6 (Phase 0).** Worth one line, or noise?
- **Q7 (order).** Agree to rebuild the five glow headlines before adding any noun? This plan says yes;
  it is your product call, and you asked for more stations.
- **Q8 (per-round).** Accept "no for now" on noun redraw per round, with colour carrying round-to-round?
- **Q9 (spacing exceptions).** st3-st4 (d=1) and record-binary (d=2) are live exceptions you signed. The
  draw will enforce ≥3 strictly, which means the *authored* order fails `assertRing`. Keep the exceptions
  as an explicit allow-list in the slot file (your entry to type), or let the draw fix them and re-review?
- **Standing:** the TV test, and the viewing distance (20 / 12 / "10+" ft). Nothing above is calibrated
  until it happens.

---

## 12. Seams with the colour plan (named, not read)

- Hue constants: one per station today; a pool needs one per pool entry. Whatever shape the colour plan
  gives `RINGED_PLANET_HUE`-style constants and `ring-recolor.mjs`'s `rows.map(... key ...)`, Phase 3
  follows it.
- `region` on a noun vs on a slot: this plan says noun (regions re-derive per draw). If per-round palettes
  want regions pinned to slots, colour plan wins; the draw then carries `region` on the slot table instead.
- Rebuild-under-jukebox hook: colour plan's. Per-round noun redraw (if ever) rides it, never builds its own.
- `WorldPaletteEditor.jsx` enumerates stations by index; a pool changes what the host sees there.
