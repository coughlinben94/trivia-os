# Ring noun expansion — research + feasibility (no code changed)

**Date:** 2026-09-05. **Status:** research + proposal only. Nothing under `client/src`, `concepts/`, or
`references/` was edited. Recraft was used as reference imagery only; no image file entered the repo
(they live in the session scratchpad and inside the published artifact, nowhere else).

**Builds on, does not replace:** `docs/superpowers/plans/2026-09-02-ring-station-variety.md` (Fable
consult, the noun-pool design). That plan already answers most of "how would a pool work"; this doc
checks what has landed since, adds Recraft silhouette evidence, and translates Ben's two new phrases
("benchmarks of nouns to draw from", "three tier spacing") into the codebase's real terms.

**Read first, every time:** `references/ring-world-mistakes.md` (checklist + rule zero),
`references/ring-world-continuity.md` §4 (STAYS HUMAN), `concepts/OBJECT-RENDERING-PROTOCOL.md`
(reference-first, two-strike cap).

---

## 0. Answer up front

1. **The prompt's read of the current layout is correct**, with one correction: the "three-layer
   per station" structure is real but it is a *size ladder* (headline / feature-companion / detail
   specks, spec §1 table) plus a *separate* sky-region layer — four things, not three, and none of
   them is a spacing rule.
2. **Phase 1 of the variety plan has shipped** (`client/src/worlds/midnightGalaxy.slots.js`, commit
   `a1f04d5`): placement is already pinned to ring slots, not nouns. Phase 2 (`ringDraw.js`, the seeded
   draw) and Phase 3 (wiring) have **not** started. `concepts/noun-atlas.json` is the stale 8-entry
   file the variety plan already flagged; it is not a usable pool.
3. **"Benchmarks of nouns to draw from" = the variety plan's `pool` + the Noun Atlas from
   `SCAFFOLD-world-ring.md` §11.** Recommended shape: a code-side pool array with per-entry
   certification metadata, mirroring the *idea* of the `ring_palettes` shelf (checked before offered,
   stamped with `RING_VERSION`) — but **not** a Supabase table. Reasoning in §5.
4. **"Three tier spacing" is ambiguous; three real candidates exist in the repo.** The reading this
   doc goes with: the variety plan's **three interleaved lanes** `{k, k+3, k+6, k+9}` (§2.4 there),
   which is what makes the ≥3 family-spacing rule hold by construction. Ben must confirm — §6.
5. **New nouns, ranked by silhouette evidence:** eclipse and crescent moon read strongest; banded
   giant and constellation next; flying saucer reads instantly but is a taste call; meteor shower is
   feasible as a multi-`streak`; wormhole, black hole, space station are **not** recommended (reasons
   in §3/§4). The variety plan's "fix the five glow-kind headlines before adding any noun" ordering
   still stands and nothing here overrides it.

---

## 1. What is actually built today (verified by reading, not from the prompt)

### 1.1 Stations — `client/src/worlds/midnightGalaxy.ring.js:122-136`

| st | key | prim | hue | accent | family (slots.js) | flags carried on the noun |
|---|---|---|---|---|---|---|
| 0 | ringed planet | `ring` | 256 | – | radial-mass | maxDetail 2 |
| 1 | spiral galaxy | `lens` | 170 | – | lens | companionKind `dots` |
| 2 | star cluster | `dots` | 268 | – | cluster | – |
| 3 | amber planet | `ring` (variant `dust`) | 28 | accent | radial-mass | – |
| 4 | lit planet | `planet` | 140 | – | radial-mass | region `aurora` |
| 5 | pulsar | `pulsar` | 120 | – | burst | region `aurora`, regionSource, noCompanion |
| 6 | rose nebula | `nebulaCloud` | 330 | accent | cloud | – |
| 7 | comet | `streak` | 208 | – | streak | companionKind `lens` |
| 8 | binary pair | `binary` | 214 | – | radial-mass | – |
| 9 | asteroid field | `asteroidField` | 160 | – | cluster | spanning-size branch in RingAmbient |
| 10 | record | `record` | 300 | – | radial-mass (soft) | region `disco`, regionSource; `MUSIC_STATION = 10` (`Display.jsx:659`) |
| 11 | aurora ribbon | `ribbon` | 196 | – | streak | – |
| 12 | supernova | `spikes` | 36 | accent | burst | region `ember`, regionSource |

Family spacing as shipped: radial-mass {0,3,4,8,(10)} — **st3–st4 d=1** (Ben's signed exception,
`world-07-ring.html` st3 comment) and **st8–st10 d=2** (signed, st10 comment: "≥3 from every radial
mass is arithmetically impossible at PANES=13 with {0,3,4,8} fixed"). cluster {2,9}=6/7, burst
{5,12}=6, streak {7,11}=4, cloud {6}, lens {1}. The rule is prose only — `grep family
concepts/tools/ring-verify.mjs` returns nothing (variety plan §1 already said so; re-confirmed).

### 1.2 How a noun is constructed

Hand-coded, one `makePrim` branch per `kind`, `client/src/lib/ringPrimitives.js:454` — twelve kinds
today: blob (486), nebulaCloud (659), dots (833), spikes (951), lens (1068), streak (1338), ribbon
(1548), ring (1832), record (1959), binary (2066), planet (2175), asteroidField (2195), pulsar (2412).
`planet`, `ring`, and the retired occluder share `drawPlanetDisc` (2618) with one world light
direction `LIGHT_DEG = 225` (2546). Nothing generated ships; `.claude/hooks/geometry-lint.mjs`
checks the radial-gradient/box-shadow arithmetic on every edit. Confirmed: reference-first, no
Recraft pixels anywhere in the tree.

**Gate mismatch, still open (variety plan Q1):** `concepts/tools/ring-spec.lock.json:96-102`
`drawnSubject.kinds = [ground, nebulaCloud, ring, sprite]`. `ground` and `sprite` were never built
(`grep "kind === 'sprite'"` → nothing). So only st0/st3 (`ring`) and st6 (`nebulaCloud`) pass the
drawn-subject check; `planet`, `record`, `binary`, `asteroidField`, `pulsar` — all plainly drawn — count
as glow. **10/13 FAIL, and it is a lock-file edit (STAYS HUMAN).** A noun pool's allow-list is
undefined until this is answered.

### 1.3 The per-station structure — what the prompt called "three layers"

`RingAmbient.jsx:261-623`, one loop body per station, in draw order:

| tier (spec §1 table, `ART-DIRECTION-SPEC.md:43-48`) | size | count | source of kind |
|---|---|---|---|
| Headline | 576–880px (streak 860–1180, ribbon 1600–2000, asteroidField 900–1300) | 1 | `st.prim` |
| Feature = "companion" | 230–420px | 0–1 (`noCompanion` opts out) | rolled from `['blob','dots','lens','streak']` minus the headline's kind, or `st.companionKind` |
| Detail specks | 58–154px | `min(round(lerp(1,4,lou)), SLOTS[i].maxDetail)` | always `dots` |
| (separate) sky region | whole-sky tint + a source glow under the headline | only on `regionSource` stations | `SKY_REGIONS` (`ringPrimitives.js:3036`) |

This is a **scale ladder** (spec §7.3, ≥6× largest÷smallest) and a placement grammar (headline in one
corner, companion in the diagonal-opposite corner, specks in the middle 64%). It is *not* a spacing
rule between stations. So reading (i) of "three tier spacing" as "already exists" is only half true —
see §6.

### 1.4 What has shipped since the variety plan was written

- `midnightGalaxy.slots.js` — Phase 1 done, byte-identical refactor, includes `family` per slot.
- `ring_palettes` shelf + `palette-sweep.mjs` + `RING_VERSION = 'v1-2026-09-03'`
  (`client/src/lib/ringCertification.js`) — the colour-side certification pattern is live.
- `ringDraw.js` — **does not exist.** Phase 2/3 not started. No `pool` field on the world.
- `concepts/noun-atlas.json` — unchanged, stale (`nebula→blob`, `dust ribbon`, `open cluster` — three
  retired nouns; `binary pair→dots` is wrong today).

---

## 2. Recraft — what was generated, what it showed

Account: 1,968 credits remaining (`get_user`). Free tier grants ~50/day and does not accrue to that
figure, so this is consistent with a paid plan — **but the API does not return the plan name; Ben
confirms the tier before any of this is cited as licensed reference** (checklist item 6). Reference
only in every case: no file in the repo, no trace, no `vectorize_image`.

**Method finding worth keeping:** two "8-cell contact sheet" prompts (recraftv3, `digital_illustration`)
both collapsed into the model's priors — sheet 1 returned eight planets, sheet 2 mostly galaxies — regardless
of the per-cell list. Only single-object prompts held. That is the protocol's own "isolation check"
showing up on the reference side: **one noun per generation, or the reference is worthless.**
(`recraftv4_1` rejects `input_style` entirely; use `recraftv3_raster` for styled reference.)

Silhouette read of each single-object reference (the only thing these are for):

| reference | reads as its noun by contour? | what it tells us |
|---|---|---|
| total eclipse | yes, instantly | dark disc + thin bright annulus + short flares. Hybrid radial-mass/burst. Subtractive — spec §7.2 bans on bottom-third-by-arc slots (loud-only). |
| black hole + accretion disc | **no — it drew a ringed planet** | confirms variety plan §4's rejection: in silhouette a black hole *is* st0. Not a new family. |
| wormhole | as "funnel"/"tornado", not "wormhole" | two lens-shaped discs joined by a stem; collides with the lens family and needs a noun the crowd can't name at distance. Skip. |
| meteor shower | yes (parallel streaks) | the model added trees and a horizon — a space world bans vertical gradients (SCAFFOLD §10). The usable part is five parallel `streak`s with staggered heads. |
| flying saucer | yes, instantly | pure iconic geometry (ellipse + dome + 3 lights). Silhouette family = lens (flattened disc), same as spiral galaxy and an edge-on ring. Campy — taste call. |
| space station | yes, but only because it is *dense* | ring + hub + spokes + panels + antenna: the reference itself is the argument for Tier C — needs a `sprite` kind and a traced path. `skill-ban-codex-sketchy-svg` case. |
| vinyl record in space | yes | matches the shipped construction (tilt, label, sheen, rim); reads as a record, not a planet, exactly because it has no terminator (`ringPrimitives.js:1976-1979`). |
| crescent moon (sheet 1, cell 1) | yes | strongest silhouette of the set; a planet-disc with a grazing light angle. |
| banded giant (sheet 1, cell 2) | yes | horizontal bands need ≥4px and ≥+40 luma at frame scale or they vanish (spec §6.1). |
| constellation (sheet 2, cell 4) | yes | connector lines are what make it *drawn* rather than `dots`. |

---

## 3. Candidate new nouns — proposal

Rule held throughout: reuse an existing primitive where the anatomy already exists
(`SCAFFOLD-world-ring.md` §10 "do not fork the engine"); flag a genuinely new kind honestly. Every
entry classified per the protocol (iconic = one sentence of geometry; figurative = contour/joints).

### Tier A — variants of the accepted planet anatomy (`drawPlanetDisc`). Cheapest, best odds.

| noun | class | prim | family | Recraft evidence | cost | verdict |
|---|---|---|---|---|---|---|
| crescent moon | iconic | `planet` variant `'crescent'` — `lightDeg` near-grazing, second dark disc offset along the light vector | radial-mass | strong | ~60–80 lines in `drawPlanetDisc` | **do first** |
| banded giant | iconic | `planet` variant `'banded'` — 3–5 bands clipped to the disc + one storm oval | radial-mass | good | ~60 lines | second |
| total eclipse | iconic | new small branch or `ring` minus the ring: dark disc over a bright corona annulus | radial-mass/burst hybrid | strong | ~80 lines | **loud-slot-only** (subtractive, spec §7.2) — slot table must mark it |
| cratered moon | iconic | `planet` variant `'cratered'` | radial-mass | reference was a moon, craters read as spots at distance | ~50 lines | TV-test before committing |

**Radial-mass lane is already saturated at 4 per draw** (LANE_CAP = floor(13/3)). Tier A buys variety
*within* the lane (any 4 of 7 planets), not more planets per ring. That is still real week-to-week
variety per the variety plan's overlap table (§3 there).

### Tier B — new drawn kinds, iconic. Each is a new `makePrim` branch (~100–150 lines) + `ringCss`
rules + both builds.

| noun | class | prim | family | Recraft evidence | verdict |
|---|---|---|---|---|---|
| constellation (Big Dipper) | iconic | new `constellation`: 7 dots ≥6px + ≥4px connectors | cluster | good | best *nameable* thing for a bar crowd; cluster lane has room (2 of 4) |
| meteor shower | iconic | new `meteorShower` = N × the existing `streak` sub-recipe, staggered heads, one shared angle | streak | good (ignore the horizon) | streak lane {7,11} has room for 1–2 more under a draw; distinct pattern from the single comet at distance |
| flying saucer | iconic | new `saucer` | lens | strong | on-brand campy, reads instantly; **Ben's taste call (variety plan Q5)** |

### Tier C — figurative. Not this season.

Space station, rocket, satellite, astronaut. All need a `sprite` kind that does not exist, a traced
path with hand-placed anchors and a provenance comment, and `geometry-lint`. The space-station
reference is the visual proof. Separate project if Ben wants one.

### Rejected on silhouette evidence

- **Black hole** — Recraft itself drew a ringed planet. Fails fill-black distinctness against st0.
- **Wormhole** — reads as a funnel; two lens discs + stem; not nameable at 20 ft.
- **Second aurora variant** — st11 is already the ribbon; `ribbon` ×2 hits the ≤3-per-prim/never-
  adjacent cap fast and adds nothing a hue change doesn't.
- **A third `ring` variant** — already ×2 (st0, st3); a third is a near-duplicate.

---

## 4. Existing nouns — which are weak, and what would fix them

Ground truth is Ben's own 2026-08-12 notes (`concepts/HANDOFF-ring-2026-08-12.md:88-100`) plus the
drawn-subject gate:

| st | noun | evidence it is weak | proposed fix | grounded in |
|---|---|---|---|---|
| 1 | spiral galaxy (`lens`) | glow-kind per lock; Ben "want the oval more blurry gradient dimmed"; face-on reference shows two *arms* — the shipped lens has a lane, not arms | rebuild as a drawn face-on spiral: bright core + two hard-edged arm strokes ≥4px (spec §6.1), keep `lens` for companions | sheet 2 cell 1; `ringPrimitives.js:1068` |
| 2 | star cluster (`dots`) | glow-kind; "cluster and the line look off" | globular reference: one dense round mass, not scattered — or replace with the constellation (Tier B) so the cluster lane holds a *drawn* member | sheet 2 cell 2 |
| 7 | comet (`streak`) | glow-kind; "needs a relook at"; quietest arc slot (lou=0), companion forced to `lens` and boosted just to be seen | solid opaque head disc (a small `drawPlanetDisc` at the head, terminator toward the sun) so the head passes fill-black; tail stays glow | reference cell 3 (sheet 2 lost it — regenerate single) |
| 11 | aurora ribbon (`ribbon`) | glow-kind; Ben "love this but needs to be moved" (moved) | leave — it is the one glow headline Ben likes. Flag only. | `HANDOFF-ring-2026-08-12.md:99` |
| 12 | supernova (`spikes`) | glow-kind; "two assets, just need one" (fixed by re-centring the d-glow) | hot opaque core disc ≥ 4px rim so the core is a *drawn* object, rays stay glow | `RingAmbient.jsx:430-447` |
| 10 | record | **not weak as a shape** — Recraft reference confirms the shipped construction; the only manufactured noun and the loudest region on purpose (`SKY_REGIONS.disco` comment) | leave the object. Two flagged residuals, both Ben's: d=2 to the binary pair; arc slot 11.8 (dimmer than st12's 21.3). A per-show draw pins it at 10 by rotation (variety plan §2.4 step 4), so the pool does not touch it. | `midnightGalaxy.ring.js:133` |
| 3/4 | amber planet / lit planet | d=1, Ben's signed exception | under a draw, the lane assignment fixes this for free — only if Ben lets the draw *re-review* the authored order (variety plan Q9) | `world-07-ring.html` st3 comment |

Is the record "a strong or weak fit"? **Strong as a silhouette, deliberate as a product choice, and the
one noun the ring is *routed around* (`MUSIC_STATION`).** Its weakness is positional (quiet arc slot,
d=2), not visual. Not a candidate for replacement.

---

## 5. Feasibility — "benchmarks of nouns to draw from" (Noun Atlas / pool)

**Translation:** `SCAFFOLD-world-ring.md` §11's Noun Atlas ("space has nebulae and comets, Autumn
Harvest does not") + the variety plan's `pool` array + a certification stamp per entry. A future
seeded `drawStations(pool, {seed: hash32(show.id)})` picks 13 of N.

**What already exists to reuse (ladder rung 2 — already in the codebase):**
- `rng`/`hash32` (`ringEngine.js`) — seeded draw, no `Math.random` (gate-checked).
- `SLOTS[]` with `family` per slot — placement invariant under any draw. Done.
- `RING_VERSION` + the "certified before offered" policy from the palette shelf — the *pattern*.
- `runChecks` from `ring-verify.mjs` — the only legal check code (never a fork).
- `stationOverride` / `?seed=` style hooks in both builds for rendering a candidate in a specific slot.

**Recommended shape — a code-side pool, not a table:**

```js
// midnightGalaxy.ring.js — sketch only, not written
pool: [
  { key:'ringed planet', prim:'ring', family:'radial-mass', hue: RINGED_PLANET_HUE, accent:false,
    certified: { ringVersion:'v1-2026-09-03', slotClasses:['loud','mid','trough'], gate:'2026-09-xx' } },
  ...
]
```

Why not a `ring_nouns` Supabase table like `ring_palettes`: a palette is *data a host picks at show
time*, so it needs a shelf the picker can read. A noun is *code* (a `makePrim` branch) — it cannot be
added by a host, cannot be certified without a code change, and its certification is only meaningful
against a `RING_VERSION` that is itself a code constant. The stamp belongs next to the code. The
palette shelf's real lesson to mirror is the **policy** (nothing airs unchecked; known-answer probe
= seed `'authored'` must reproduce today's 13 byte-for-byte), not its storage.

**What "certified" means for a noun (the acceptance a pool entry must carry — Ben sets the bar,
STAYS HUMAN):** rendered in isolation, fill-black read passes, rendered in each slot class it may
land in (loud / mid / trough via `stationOverride`), `verify:ring` regression tier unchanged, Ben's eye
on the TV. Same steps as variety plan Phase 4; nothing new invented here.

**Cost honestly:** machinery (Phase 2 `ringDraw.js` + tests, Phase 3 wiring behind a flag) is a
day or two of Sonnet-sized work *after* Q1 (lock allow-list) is answered. Pool *contents* are the art
project — 2–7 review rounds per noun historically. A pool of ~19 (six new nouns) is the season-scale
target that makes "a third of the ring is new each week" true (variety plan §3 table).

**Blocking questions, unchanged from the variety plan:** Q1 (which kinds count as drawn), Q3 (what the
gate certifies when there are many seeds), Q9 (allow-list the two signed spacing exceptions, or let the
draw fix them).

---

## 6. Feasibility — "three tier spacing"

Ben's phrase could map to any of these, all real in the repo. Named plainly rather than picked
silently:

| reading | what it is | status |
|---|---|---|
| (i) headline / feature / detail size tiers | spec §1 table; `RingAmbient.jsx` station loop; spec §7.3 ≥6× ladder | **built, gated** (scale ladder, elements-per-station) — but it is a *size* ladder, not spacing *between* stations |
| (ii) ≥3-station family spacing | `ring-world-mistakes.md` checklist 5; inline comments | **prose only, violated twice with sign-off**, not in `ring-verify` |
| (iii) three interleaved lanes `{k,k+3,k+6,k+9}` | variety plan §2.4 — each lane holds ≤4 members of one family; three lanes × stride 3 = 13 slots (slot 12 special-cased) | **designed, not built** (Phase 2) |
| (iv) loud / mid / trough slot classes | variety plan §2.5/§8 Phase 4 — a noun is certified per arc class | **designed, not built** |
| (v) something new | e.g. graded distance: same noun ≥6 apart, same family ≥3, same prim never adjacent | partly in (iii)'s `assertRing` (family ≥3, prim ≤3 & non-adjacent, keys unique) |

**Reading I'm going with: (iii), which is (ii) made mechanical.** "Three" is the lane stride, and the
three lanes are the tiers. It is the only reading where "spacing" and "tier" both mean something, and it
is the piece that turns the twice-broken prose rule into arithmetic — the pattern this project's own
docs say is the only kind of rule that holds (SCAFFOLD §7: "a convention that holds is one turned into
arithmetic, not judgment"). If Ben meant (i), it already exists and nothing needs building. If he meant
(v), the `assertRing` invariants in the variety plan's draw already encode a three-level version (noun
unique / family ≥3 / prim non-adjacent) and only need the distances confirmed.

**Ambiguity flagged, not resolved:** Ben to say which. One sentence from him settles it.

---

## 7. What this does NOT do

- No code, no lock-file edit, no threshold, no `noun-atlas.json` edit (stale, flagged, left).
- No re-litigation of nebula demotion, the far-layer anchor, sky-region normalisation, or the
  realised-span check — all adjudicated in `FAILURE-LEDGER.md`.
- No claim about how any candidate *looks* on the TV — nothing here was rendered in the ring. Every
  silhouette verdict above is from a reference image, which is the protocol's step 0, not its gate.
- The TV test and the viewing distance (20 / 12 / "10+" ft) remain outstanding and every distance-
  derived threshold above inherits that.

---

## 8. STAYS HUMAN — Ben's calls, collected

1. Which of `planet / record / binary / asteroidField / pulsar` count as drawn (`ring-spec.lock.json`
   edit). Unblocks the pool allow-list. (Variety plan Q1.)
2. "Three tier spacing" — reading (i), (iii), or (v)? (§6.)
3. Pool storage: code-side `pool` with certification stamp (recommended) vs a `ring_nouns` table.
4. Order: rebuild the five glow-kind headlines first (variety plan's Q7, still recommended) or start
   Tier A variants in parallel because they share `drawPlanetDisc` and can't regress the five?
5. Taste: flying saucer in or out; eclipse worth its loud-slot-only restriction; constellation = Big
   Dipper or a made-up figure.
6. Keep the two signed spacing exceptions (st3–4 d=1, st8–10 d=2) as an allow-list, or let the draw
   re-place them. (Q9.)
7. Recraft plan tier — confirm paid before these references are cited as licensed inputs.
8. Aesthetic acceptance of anything above, on the real TV.

## 9. Suggested next step, if Ben says go

Not a build. One attended session: answer items 1, 2, 6 above in chat; then Phase 2 (`ringDraw.js`,
pure, tested, `seed:'authored'` byte-identical falsifier) as a Sonnet task with no render. Art rounds
wait for the lock answer and the TV test.
