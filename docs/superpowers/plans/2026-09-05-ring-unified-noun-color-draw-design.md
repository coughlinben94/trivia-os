# Ring unified noun + colour draw — design (no code changed)

**Date:** 2026-09-05. **Status:** design + recommendation for Ben to react to. Nothing under
`client/src`, `concepts/`, or `references/` was edited. Nothing here is built until Ben signs off
(`references/ring-world-continuity.md` §4; project standing rule).

**Builds on, does not replace:** `2026-09-02-ring-station-variety.md` (noun pool, `drawStations`,
lanes, slot classes — Phase 1 shipped as `midnightGalaxy.slots.js`, Phases 2–4 not started),
`2026-09-05-ring-noun-expansion-research.md` (Noun Atlas, Tier A/B nouns, three-lane reading of
"three tier spacing"), `2026-09-03-ring-palette-drift-and-shelf.md` (SHIPPED: `ring_palettes`
shelf, `RING_VERSION`, drift, Apply/Surprise-me picker).

**Read first, every time:** `references/ring-world-mistakes.md`, `references/ring-world-continuity.md`
§4, `concepts/OBJECT-RENDERING-PROTOCOL.md`, `concepts/FAILURE-LEDGER.md` (read in full this session).

**New decision from Ben, final, built in below:** the `record` noun at station 10 goes. It duplicates
the real Jukebox on screen — `Display.jsx:659 MUSIC_STATION = 10` forces the ring to station 10 for
every grading break, so a drawn spinning record sits under a real music player. The 2026-09-05
research doc's "not a candidate for replacement" verdict is overridden; that doc did not know about
the duplication. The `MUSIC_STATION` mechanism itself (force a fixed station during breaks) is not in
question — only which noun sits there.

---

## 11a. Decisions, 2026-09-05 (Ben, in chat, captured verbatim + resolved)

Answering §11's numbered list:

1. **Lock kinds — DECIDED.** Add every real drawn kind currently in the ring to
   `ring-spec.lock.json`'s `drawnSubject.kinds`: `planet`, `binary`, `asteroidField`, `pulsar`, plus
   `eclipse` once built (replacing `record`, which is retired). Not a partial list — every kind
   actually rendered as a headline gets added, closing the 10/13 FAIL finding for good rather than
   patching around it.
2. **Independent draws — DECIDED, yes.** Nouns and colours drawn independently, no noun→hue ban
   table, identity-aware composition as designed in §2.1/§4. Ben will still judge it from a rendered
   world, not from the doc — that part of the original item stands.
3. **One palette per show — DECIDED, confirmed.** The §2.2 reformulation stands: one whole-ring
   palette per show, station-to-station variety comes from `derivePalette`'s own ladder/drift, not a
   separate palette per station.
4. **Eclipse at station 10 — OPEN, Ben said "idk."** Not a no — genuinely undecided pending seeing it
   built. Proceeding with §5's recommendation (corona-first, no occluder, `radial-mass` only) as the
   working build target, because it's the only concrete candidate with a passed sanity check (§5.1–5.3)
   and nothing else is on the table — but this is provisional until Ben sees it rendered and gives
   real aesthetic acceptance (item 12, standing). Do not treat "built" as "approved."
5. **`disco` region — DECIDED.** Rename to `corona`, lower saturation, re-anchored to the eclipse per
   §5.3's recommendation.
6. **Slot-class thresholds — not addressed; default stands.** Fable's 0.2/0.6 loudness cuts (§3.3)
   proceed as the working numbers. Flag to Ben before the gate ships in case he wants different ones —
   this is a threshold choice, STAYS HUMAN, silence isn't the same as a yes.
7. **Schema — not addressed; default stands.** `stations jsonb null` on `ring_palettes` (§7.1), not a
   new table. Flag before the migration runs — Ben's sign-off is required either way per the doc's own
   rule, silence here just picks the cheaper default to build toward.
8. **Certification policy — not addressed; default stands.** Full gate run per composed world, nightly
   batch (§11 item 8's recommended option), hosts only ever see certified worlds. Flag before it ships.
9. **Sub-seeds — DECIDED.** Re-roll nouns independently of colour ("re-roll the nouns would be cool") —
   `nounSeed`/`palSeed` split confirmed as a real host action, not just a doc idea.
10. **Turn-craft polish — DECIDED, yes.** Schedule the §6.2 follow-ups found while researching where
    "alive" actually comes from.
11. **Recraft tier — Ben confirms paid**, self-reported, not independently verified against a billing
    page. Treated as confirmed per his own account status; the eclipse reference can be cited as a
    licensed input.
12. **Aesthetic acceptance — standing, unchanged.** Every drawn world still gets Ben's eye on a real TV
    before it airs, item 4 above most of all.

**Net effect:** items 1, 2, 3, 5, 9, 10, 11 are settled. Item 4 is a working default, not a decision.
Items 6, 7, 8 are working defaults by silence, explicitly flagged as still-open threshold/schema/policy
calls that need a real yes before they ship, not just an absence of objection.

---

## 0. Answer up front

1. **One seed, one draw, one shelf row, one host step.** Nouns and palette are drawn from two
   separate pools but composed into ONE world object before the show, and the *composed world* is
   what gets certified and what the host picks. Two independent draws with two independent
   certifications cannot make "nothing unchecked airs" true, because the thing that airs is the
   combination and nobody checked it. §2.
2. **The "one pool palette per station-turn" idea does not survive contact with the shipped colour
   engine.** `derivePalette` is a whole-ring function (adjacency floor, hue ladder, a closed drift bump
   around the ring, one sky). A different certified palette per station breaks all four and breaks
   the certification unit. Reformulated: the palette pool is a pool of whole-ring palettes; the draw
   picks one per show; within-ring colour variety is `derivePalette`'s job (3 colours, drift up to
   the dead-band cap). §2.2.
3. **Draw independently, couple in composition — and the coupling is already built.**
   `derivePalette`'s station-identity-aware assignment reads each station's authored hue as "what
   this noun is about" and hands it the nearest palette colour. Under a noun draw, the 13 authored
   hues at the slots change, so the palette's colour-to-station assignment re-derives per draw for
   free. No new noun→hue ban table; that would be per-noun patches, the thing a pool cannot carry.
   Ben's aesthetic call whether this is enough coupling. §4.
4. **"Alive" comes from the turn, not from the draw.** The crowd sees a turn ~78 times a night and a
   draw once a week. The pre-show draw delivers "not the same show as last week." The 1700ms glide,
   three-speed parallax, the sky's separate 2600ms clock still settling 900ms after the pan lands,
   and each noun's own idle motion deliver "feels alive." Ben's fear of "straight cuts" is already
   answered by shipped code; the draw's job is to give that machinery new material without ever
   handing it a cliff. Four guarantees separate "alive" from "noise." §6.
5. **Eclipse at station 10 checks out, with two findings.** (a) Slot 10 is the 5th-quietest of 13 by
   arc (13.5; loudness 0.20) and the gate's bottom-third is `floor(13/3) = 4` stations — eclipse
   clears the §7.2 subtractive ban by one rank, so build it corona-first (the ink is the bright
   annulus; the dark disc is a hole in its own glow, never `makeOccluder`) and it isn't subtractive
   at all. A dim slot suits an eclipse; it was a weakness for the record. (b) Class eclipse
   `radial-mass` only, not the hybrid — as a burst it sits d=2 from the supernova at 12. Under the
   lane draw, eclipse pinned at 10 puts radial-mass in lane B `{1,4,7,10}` and both of today's
   signed spacing exceptions (st3–4 d=1, st8–10 d=2) vanish by construction. §5.
6. **The `disco` sky region loses its source with the record.** Options: rename to `corona` with the
   eclipse as `regionSource` and drop `tintSat` from 74 toward the 60–66 of the other two (the
   "manufactured object, allowed to be loudest" reason is gone), or delete it. Aesthetic — Ben's.
   Under the draw, `region` rides on the noun, so this resolves per world, not per slot. §5.3.
7. **Order that makes a real build possible:** (0) Ben's answers (§11) → (1) the eclipse swap as a
   plain authored edit, both builds, art rounds per protocol, `RING_VERSION` bump — this resets the
   palette shelf, budget a re-sweep → (2) `ringDraw.js` pure + tests → (3) `drawWorld` composition +
   static checks → (4) shelf grows a `stations` column + sweep gains `--world-batch` → (5) picker
   grows the world shelf → (6) pool growth, one noun at a time (art). The lock-file edit (Q1) blocks
   step 6's membership rules, not steps 2–5: `drawnSubject` is a **spec-tier** check
   (`ring-verify.mjs:342 'spec'`) and `certifyPalette` passes on regression tier alone. §3.4, §9.

---

## 1. Verified this session, not quoted

- `RingAmbient.jsx:63-64` `PANES: 13, SURGE_MS: 1700`; turn easing `EASE_SURGE = [0.16, 0.62, 0.28, 1]`
  (`easings.js:6`) on `transform` only; layers `far 480 / mid 1920 / near 2880 (m:3)` — three pan
  speeds. `SKY_TINT_IN_MS = 2600` (`ringPrimitives.js:3183`) — the sky tint is a second, slower
  clock fired in the same tick as the pan. Reduced motion snaps every turn.
- The ring builds its DOM once at mount; `ParticleBackground.jsx:1242-1246` freezes the world in a
  ref. `ringWorldFor(theme)` recolours the authored base via `recolorWorld(base, theme.worldPalette)`
  when `theme_overrides.worldPalette` exists (`ThemeProvider.jsx:41`, `ThemePickerModal.jsx:135`).
- `worldPalette` shape today: `{ colors: [2-3 hex], weights: [..], drift: { arc } }`.
- `recolorWorld` requires `base` to carry *authored* hues (`ringRecolor.js:206-212`) — a drawn world
  whose stations carry their pool entries' authored hues satisfies that contract by construction.
- `derivePalette` (`weightedPalette.js:286-368`): Hamilton allocation of stations to colours, DP
  assignment minimising `hueDelta(currentHues[i], anchor)` with a same-colour adjacency floor, per-colour
  hue ladder inside a 25° window, drift as a closed `(1 - cos(2πi/13))/2` bump per colour, dead band
  `[45, 80)` respected via `driftPlan`. One `bg/bgDeep` for the whole ring from a folded palette.
- Arc at phase 5 (ran `buildArc` from `ringEngine.js`, not read off a comment):
  `0:29.4 1:28.2 2:26.6 3:27.9 4:22.9 5:13.4 6:14.7 7:9.7 8:11.0 9:12.2 10:13.5 11:16.9 12:22.2`.
  Loudness `loudnessOf`: `0:1.00 1:.93 2:.86 3:.92 4:.67 5:.19 6:.26 7:.00 8:.07 9:.13 10:.20 11:.36 12:.63`.
- Gate bottom-third-by-arc = `Math.floor(13 * 0.3333) = 4` (`ring-verify.mjs:1126`): slots {7, 8, 9, 5}.
  Slot 10 is 5th. Not in the banned set — by one rank.
- `drawnSubject` check is spec tier (`ring-verify.mjs:342`), lock `kinds = [ground, nebulaCloud, ring,
  sprite]`; `ground`/`sprite` never built; 10/13 headlines report FAIL today. `palette-sweep.mjs`'s
  `certifyPalette` counts regression FAILs only, so this check never blocks a shelf row.
- `skyRegionHues` (`ringPrimitives.js:3076-3085`): a region with no member station is skipped — a world
  drawn without a pulsar has no aurora, no crash. Confirmed the variety plan's §2.2 claim by reading.
- `JukeboxBreakOverlay.jsx:48` wraps the Jukebox in `absolute inset-0 bg-black` with `ringMode`.
  Whether the ring is visible under the Jukebox is `ringMode`'s doing inside `Jukebox.jsx` — not read
  this session. Ben's own observation that the record shows under the music is what this design
  acts on; nothing here depends on the exact overlay compositing.
- Within-night repetition: ~78 ring-visible slides ÷ 13 ≈ 6 laps a night (variety plan §1). A per-show
  draw changes *which* 13 repeat six times. It does not touch the six.

---

## 2. One draw, not two

### 2.1 The shape both mechanisms share, and where it stops being shared

| | noun draw (unbuilt, Phase 2) | palette pick (shipped) |
|---|---|---|
| pool | code-side `pool[]` in `midnightGalaxy.ring.js` (research doc §5) | `ring_palettes` rows, `status='certified'`, `ring_version` match |
| pick | `drawStations(pool, {seed})` — seeded, lanes, caps | `Surprise me` = `Math.random` over the shelf; `Apply` = exact `findMatch` |
| frozen | at ring mount | at ring mount (`ringWorldRef`) |
| certified unit | per noun, per slot class (variety plan Phase 4) — *proposed* | per whole-ring recolour of the **authored 13** |

The last row is the seam. A shelf row says "palette P over the authored 13 passed the regression
tier." Put P over a *different* 13 and the row says nothing — ink, headline ink, bleed, safe-box
luminance are all per-prim. The variety plan's Q3 ("what does the gate certify when there are many
seeds") is the same question from the noun side. Answered separately, both answers are partial.
Answered once, at the composition, both close.

### 2.2 The per-station palette idea, checked against the engine

The idea from earlier today: a pool of certified palettes and a seeded sequence assigning one to each
station-turn, decided pre-show. Against what is shipped:

1. `derivePalette` is whole-ring. Its adjacency floor (no two neighbours share a colour unless
   arithmetic forces it), its hue ladder (8 stations of one colour render 8 distinct shades), and its
   drift (a *closed* cosine bump so st12 meets st0 within one rung) all assume one palette owns all 13.
   Thirteen palettes, one per slot, gives no floor, no ladder, no closure — the wrap becomes a cliff.
2. The sky is one layer (`surge: 0`). It does not pan. `bg/bgDeep` come from one folded palette. Which
   station's palette owns the sky?
3. Certification: each row was certified as a whole-ring recolour. Thirteen rows mixed is a world no
   gate has seen — Ben's 2026-09-03 "bulletproof" call is violated by construction.
4. The connectedness principle (Ben, 2026-08-16, "panning always, ALWAYS, feels connected") is the
   reason `skyRegionWeights` became a continuous falloff. Per-slot palettes reintroduce colour cliffs
   one layer up.

**Reformulation that keeps the intent** ("more colour happening around the ring, not one fixed look"):
- the pool is a pool of whole-ring palettes (the shelf, as built);
- the per-show draw picks ONE for the whole ring;
- variety *around the ring within a show* is `derivePalette`'s job and it already has the levers:
  3 colours instead of 2, drift toward its per-colour cap (`driftPlan` clips at the dead band; the
  purple anchor's cap is 116°), and `LADDER_HALF`. Those are palette-generator parameters
  (`paletteGenerator.js`: `DRIFT_MIN/MAX`, `k = r() < 0.25 ? 3 : 2`), not a second mechanism;
- variety *across shows* is the draw.

If Ben wants something closer to the original idea — colour that changes *during* a show — the only
seam where a rebuild is invisible is the warp's black frame at `MUSIC_STATION`, and that is the
palette-runtime plan's Phase 4 "rebuild under the jukebox" hook, unbuilt, and it collides with the
"never touched live" constraint. Not proposed here. Named so it isn't re-derived.

### 2.3 The unified step

```
showSeed  = seedFrom(show.id)                              // paletteGenerator.seedFrom, already exists
nounSeed  = hash32(showSeed, 0x4E4F554E)                    // 'NOUN' — independent sub-streams,
palSeed   = hash32(showSeed, 0x434F4C52)                    // 'COLR' — so re-rolling one keeps the other

stations  = drawStations(pool, { seed: nounSeed, pinKey: 'eclipse', pinAt: MUSIC_STATION })
palette   = shelf[palSeed % shelf.length]                   // certified whole-ring rows only
world     = recolorWorld({ ...base, stations }, palette, baseTheme)   // the coupling point, §4
assertWorld(world)                                          // static: assertRing + regionHueWarnings + dead band + accents<=3
```

Sub-seeds are the one deliberate decoupling: a host who likes tonight's colours but wants different
objects presses "re-roll objects" and the palette stays put. One `showSeed` still reproduces the
whole world on any reload.

Then the row (§7.1) stores the **resolved** draw — 13 station keys in slot order, the palette, the
seed, `RING_VERSION` — not the seed alone. A seed re-run against a pool that gained a member gives a
different set; the row is the truth, the seed is provenance. Same discipline as the shelf.

### 2.4 Why one host step

The host's mental model should be "this show's world," not "this show's objects" and "this show's
colours" as two unrelated dials. Impeccable's product register: consistency over surprise, the tool
disappears into the task. One "Surprise me" that hands back a certified world, one shelf strip to pick
from, one "Custom" panel underneath for the host who wants to steer. §7.2.

---

## 3. The rules that already kinda exist — applied, not described

### 3.1 Three lanes at stride 3

Lanes `A {0,3,6,9}`, `B {1,4,7,10}`, `C {2,5,8,11}`, slot 12 special. Members of one lane are pairwise
≥3 apart cyclically (3, 6, 9; and 9→0 = 4). A family that owns a whole lane satisfies the ≥3 rule with
no further check. `LANE_CAP = floor(13/3) = 4`. Slot 12's neighbours within d<3 are {10, 11, 0, 1}; its
family must be absent from those four.

Pinning eclipse at 10 fixes lane B's family: **radial-mass = lane B**. Today's radial-mass set
{0, 3, 4, 8, 10} would become {1, 4, 7, 10} — four planets, all d≥3, no exceptions. Q9 answers itself:
the draw fixes both signed exceptions; the allow-list is unnecessary. (Ben confirms — it re-reviews
his authored order.)

### 3.2 ≥3-station family rule

Enforced by `assertRing` in the draw (variety plan §2.4), never by a comment. Also asserts: unique
keys, ≤3 headlines per `prim` name and never adjacent, ≤3 accents. Runs at draw time, throws in dev,
falls back to the authored 13 in production (`separateArc` precedent: a black screen mid-show is
worse than a flat arc).

### 3.3 Loud / mid / trough slot classes

From the real arc above, not the spec's prose: **loud** (loudness ≥ 0.6) = {0, 1, 2, 3, 4, 12};
**mid** (0.2–0.6) = {6, 10, 11}; **trough** (< 0.2) = {5, 7, 8, 9}. Slot 10 sits on the mid/trough
line (0.20). A pool entry carries `certified.slotClasses` (research doc §5) and the draw only places
a noun in a slot class it carries — this is the second placement constraint after lanes. An eclipse
certified `['mid','loud']` may sit at 10; a subtractive element certified `['loud']` may not.
Thresholds 0.2/0.6 here are proposals for Ben (STAYS HUMAN — threshold choice).

### 3.4 The `ring-spec.lock.json` drawn-kind gate

Facts: `drawnSubject` is spec tier. It fails 10/13 today. The shelf certifies on regression tier only.
So the lock edit does **not** block building the draw machinery or certifying worlds. It blocks the
*definition of the pool's allow-list*: "a headline must be a drawn kind" with today's list admits three
kinds. Two ways forward, both Ben's: (a) edit `kinds` to add `planet`, `binary`, `asteroidField`,
`pulsar` (the plainly-drawn ones — opaque disc + terminator + rim) and leave `lens/dots/streak/ribbon/
spikes` out, which makes five current headlines pool-ineligible until rebuilt (variety plan's Q7 order);
(b) leave the lock alone and define the pool allow-list as a separate code-side list, accepting the
spec-tier FAIL as known debt. (a) is the honest one; it is a lock edit and it is his to type.

### 3.5 Order of resolution

Q1 (lock kinds) → pool membership rules. Q9 (exceptions) → dissolves under lanes. Slot-class thresholds
→ before the first world certifies. Q3 (certify what) → answered by §2: the composed world. Nothing
in §3 needs new check code in `ring-verify.mjs`; `assertWorld` is a build-time assertion in the draw
module, and the gate keeps measuring whatever renders.

---

## 4. Coupled or independent — the judgment call

**Recommendation: draw independently, couple in composition, add no coupling table.**

What "coupled" would mean concretely: a per-noun rule like "the eclipse never wears the dead band"
(already true for every noun — `DEAD_BAND` is a palette property), or "the rose nebula stays warm"
(a hue preference). The second kind is what `derivePalette` already does softly: its cost function
is `hueDelta(authoredHue, anchor)`, so the nebula authored at 330 takes the palette's pinkest colour
when there is one and the nearest available when there isn't. That is the right strength — a
preference, not a ban. A ban table is a per-noun patch; the variety plan §2.2 rule stands: a noun
that only works under a flag is not pool-ready.

What full independence would cost: nothing today, because there is no station-level colour decision
that ignores the noun — `recolorWorld` is the only path and it is identity-aware. The risk of "random
in the wrong way" lives elsewhere (§6.3), in the four composition guarantees, not in noun↔hue.

**One real coupling worth keeping explicit:** `accent` rides on the noun (rose nebula, amber planet,
supernova today) and the draw caps accents at ≤3. `accentCompanionHue` reads the palette's anchors
to pick the companion from the far side of the palette. Noun says "I am a warm accent"; palette says
"warm means this hex tonight." Already built; carry it, don't redesign it.

**Ben's call (STAYS HUMAN, aesthetic):** whether identity-aware assignment is enough coupling once
he sees a few drawn worlds on the TV, or whether some noun deserves a hard preference. Decide from
renders, not from this doc.

---

## 5. Eclipse at station 10 — sanity check

### 5.1 Arc and the subtractive ban

Slot 10: arc 13.5, loudness 0.20, 5th-quietest. Gate's bottom third = quietest 4 = {7, 8, 9, 5}.
Eclipse at 10 is legal under §7.2 by one rank. Two consequences:

- Build it **corona-first**: the drawn ink is a bright annulus ≥4px plus 2–4 short flares (the hard
  sub-element spec §6.1 wants), the disc is a hole in that glow drawn on near-black sky. It subtracts
  nothing from the sky, so it isn't a `makeOccluder`-class element and §7.2 doesn't apply. That is
  also the honest Recraft reading (research doc §2: "dark disc + thin bright annulus + short flares").
- A quiet slot suits it. The record's residual was "renders dimmer at 10" — for a record that was a
  defect. For an eclipse, dim is the noun. Headline-ink floor (0.04) is the number to watch: a thin
  annulus can under-ink. Measured, not predicted.

### 5.2 Family and lanes

Class eclipse `radial-mass` only. Fill-black test: a disc. As a burst it would sit d=2 from the
supernova at 12 and re-create the exact "signed exception" pattern this design removes. Under lanes,
radial-mass owns lane B `{1,4,7,10}`; the pin at 10 is then a *consequence* of the lane, not a
special case (rotation step in `drawStations` keeps every cyclic distance).

### 5.3 The `disco` region

`SKY_REGIONS.disco` exists for the record (source, offset 0, `tintSat 74` — deliberately the loudest,
"the party moment," justified by being the only manufactured object). With the record gone the
justification is gone. `region` rides on the noun, so under the draw a world without the source noun
simply has no such region (`skyRegionHues` skips it; `skyRegionWeights` gives 0). Options for the
eclipse noun:

1. `region: 'corona', regionSource: true` — rename disco, `hueOffset 0`, `tintSat` down to ~62,
   `tintLight` ~28. A corona lighting the sky around a quiet slot is a plausible source.
2. No region on the eclipse; delete `disco`. The st9–st11 stretch loses its shoulder colour and the
   dead-air problem the 2026-08-16 falloff fixed partially reopens at the world's quietest stretch.
3. Keep `disco` on the eclipse unchanged — the "party" saturation with a nothing-like-a-party object.

Recommend 1. Aesthetic — Ben's. Whatever he picks, the `SKY_REGIONS` comment block that argues from
the record needs rewriting in the same commit (one fact, one home).

### 5.4 Better fit than eclipse?

Checked against the Tier A/B list: crescent moon is the strongest silhouette, but it is a planet
variant and lane B already holds three planets — it's a better *pool* member than a *pin*. The pinned
noun should be one that reads at a dim slot and that no other pool member resembles: eclipse is the
only Tier A noun that is dark by nature. Constellation (cluster) would move the pin to lane C and push
radial-mass out of lane B, a bigger re-layout for no gain. **Eclipse stands.**

---

## 6. Where "alive" comes from — emil-design-eng and impeccable, applied

Scope note: `ring-world-mistakes.md` records that `emil-design-eng` has no object-craft content. This
question is not object craft; it is interaction animation, which is exactly what that skill is about.
Both apply here squarely.

### 6.1 Frequency first

Emil's first question — how often will they see it? A turn: ~78 times a night. A station: ~6 times a
night. A draw: once a week. The thing seen 78 times is what "alive" is made of; the thing seen once a
week is what "doesn't get old" is made of. Two different itches. Ben's phrase "feels alive, doesn't
get old" names both, and they have different levers:

| itch | lever | state |
|---|---|---|
| feels alive (per turn) | 1700ms glide on `transform` only, `[0.16, 0.62, 0.28, 1]` (a strong ease-out, no bounce), three-speed parallax (480/1920/2880), sky tint on its own 2600ms clock still settling ~900ms after the pan lands, invisible wrap, queued turns retarget (transitions, not keyframes), per-noun idle motion (twinkle, breathe, drift, rock-spin, shooting stars) | **shipped** |
| doesn't get old (per week) | the draw — different 13, different palette | this design |

So: **pre-show randomisation alone does not deliver "alive."** A static world with a great turn feels
alive on turn one. A new world every week with a hard cut would feel dead on every turn. Ben's fear
("just straight cuts") is about the first row, and it is already answered — the turn is a glide with a
slower sky behind it, which is the single most "alive" thing in the system: two clocks, not one. What
the draw adds is *material*: which loud slot the eclipse's corona flares into, which colour the aurora
shoulder fades through on the way to the trough. The turn craft does the work; the draw keeps handing
it something new to do.

### 6.2 Two turn-craft observations, out of scope, flagged not built

- Every turn uses one curve regardless of whether it heads loud→quiet or quiet→loud. Emil: match
  motion to mood. A slightly longer settle into a trough slot and a crisper arrival on a loud one is
  the kind of unseen detail that compounds. It is a change to `EASE_SURGE`/`SURGE_MS` handling and to
  the gate's drive timing — not this design, Ben's to schedule.
- Reduced motion snaps the pan but still animates the sky (deliberate, `turn()`'s comment). Correct
  per emil ("reduced, not zero — keep opacity/colour, drop movement"). Leave it.

### 6.3 Impeccable: what separates "alive" from "noise" in this specific system

The product register's slop test is "strangeness without purpose." For a drawn world the strangeness
budget is spent on the draw, so everything around it has to be *predictable*. Four guarantees, each
already a mechanism or one assert away:

1. **No hue cliff at any turn.** `derivePalette`'s adjacency floor + ladder + closed drift. Under a
   2-colour palette three neighbour pairs share a colour at 8/5 weights (the warning it prints) — they
   still read as two shades, not a smear. Guarantee holds under any noun draw because it is a property
   of the palette pass, not the nouns.
2. **No silhouette echo within 3 slots.** Lanes. Holds by construction.
3. **No loud noun in a trough, no subtractive noun in the bottom four.** Slot classes on the pool
   entry + `assertWorld`.
4. **No colour without a cause.** `region` rides on the source noun; a world without the source has
   no tint. The aurora exists because the pulsar is there. This is the guarantee that most separates
   "designed" from "random": a viewer never sees a green sky with nothing green in it.

Break any one and the crowd reads noise. Hold all four and a fully random draw reads as a place that
happens to be different this week. That is the whole difference, and none of it is a taste rule — it
is arithmetic and asserts, the only kind of rule this project's own docs say survives.

### 6.4 The host surface, impeccable product register

The picker is a modal already; keep it (modal-first is banned for new surfaces, not for the one that
exists). Changes it implies: a shelf strip of certified worlds (skeleton while loading, not a spinner;
an empty state that says what to run), one primary action ("Apply to this show"), "Surprise me" and
"Re-roll objects" as secondary, "Custom" collapsed. Same button vocabulary as today. The station list
on the left already lists stations by index — it will list the drawn nouns in slot order with the
derived hue dot, which is the one glance that tells the host what tonight's world is. Nothing new to
learn; the modal grows one row.

---

## 7. Plugging into what's shipped — shapes, not code

### 7.1 Storage: the shelf grows one nullable column

Ponytail ladder rung 2: reuse `ring_palettes`. Add `stations jsonb null` — `null` means "the authored
ring," which is what every existing certified row already means, so nothing re-certifies for the
schema change alone (the `RING_VERSION` bump for the eclipse swap is what forces that, separately).
A row with `stations` set is a **world** row. `seed text` already exists; store `'showSeed:<hex>'`
for drawn worlds. Unique index `(source, seed, ring_version)` already prevents double-insert.

Lazier alternative named: a separate `ring_worlds` table with `palette_id` FK. Cleaner names, two
tables to sweep, two client helpers. Not recommended at pool size ~19. Schema/RLS change either way:
**Ben's sign-off before any migration runs** (working-style rule).

`theme_overrides` grows one key beside `worldPalette`:

```
theme_overrides.worldPalette   // unchanged, back-compat: {colors, weights, drift}
theme_overrides.ringWorld      // new, optional:
  { rowId, seed, ringVersion,
    stations: ['comet','crescent moon',…13 keys in slot order],   // resolved, not re-drawn
    palette: {colors, weights, drift} }                            // denormalised copy
```

`ringWorldFor(theme)` reads `theme.ringWorld` first: look each key up in `pool`, assemble `stations`,
`recolorWorld` with `ringWorld.palette`. Any key missing (pool shrank) or `ringVersion` mismatch →
fall back to `worldPalette` over the authored ring → fall back to base. The TV never blanks. The
denormalised copy is why `/display` never needs a second fetch and a deleted row cannot break a show.

### 7.2 Picker

`WorldPaletteEditor.jsx` → the same modal, retitled "World — Midnight Galaxy." Rows top to bottom:

1. **Shelf strip**: certified world rows for the current `RING_VERSION`, each a 13-dot noun row (hue
   dots) over a 2–3 swatch palette bar. Click = preview + selects. Skeleton on load. Empty state: "No
   worlds checked yet — run `palette-sweep.mjs --world-batch`."
2. **Surprise me** (random certified world; `Math.random` is fine here — host UI over certified rows,
   the existing comment already says why) · **Re-roll objects** (new `nounSeed`, same palette →
   composes → if the composition exists on the shelf, instant; else "Saved, pending check").
3. **Custom** (collapsed): today's colour panel, unchanged.
4. Left column: drawn nouns in slot order. Preview: `RingAmbient` on the composed world,
   `stationOverride` per click — unchanged component.
5. **Apply**: exact match on the shelf → instant; else pending, same two states as today.

`findMatch` grows to compare `stations` too. `saveAsPending` writes the composed row.

### 7.3 Sweep

`palette-sweep.mjs` gains `--world-batch N`: for seeds 1..N, `drawWorld` → `certifyPalette`-shaped run
over the composed world (both builds, `?world=<rowId>` or `?stations=<keys>&colors=…` on the two render
routes — the html build already imports the world module and takes `?colors=`), known-answer probe
first (the authored ring at the base palette must certify), upsert. `--pending` already covers rows
hosts saved. The cost is one gate run per world; N=10 nightly on an always-on machine is the shape.
Where that runs is infra Ben already has (per memory: Davos); not assumed here.

### 7.4 What does NOT change

`RingAmbient.jsx` (builds what it's handed), `derivePalette`, `recolorWorld`, `SLOTS`, the gate's checks,
the lock file (until Q1), `MUSIC_STATION`, the warp, the Jukebox.

---

## 8. Worked example — one show, one seed

Pool assumed for the example: today's 13 minus record, plus eclipse, crescent moon, banded giant,
constellation, meteor shower, flying saucer, cratered moon = 19 (research doc Tier A + B; saucer and
cratered moon are Ben's taste calls and are in the pool for arithmetic only). Families: radial-mass 8,
cluster 3, streak 3, burst 2, lens 2, cloud 1. Lane cap 4.

Draw (hand-walked through `drawStations`'s rules; not run — Phase 2 doesn't exist):
radial-mass → lane B, eclipse pinned at 10. Streak ×3 + cloud → lane A. Cluster ×3 + burst → lane C.
Slot 12 → burst (neighbours 10 radial, 11 cluster, 0 streak, 1 radial — legal; burst at 2 is d=3).

Palette: shelf row "Violet & Pink" `#8b5cf6 / #ec4899`, weights 0.60/0.40, drift 60. Hues below are
the real `derivePalette` output run this session against the drawn nouns' hues (new nouns' authored
hues are **hypothetical**, marked \*; they don't exist until the noun is built).

| slot | lane | class (lou) | noun | family | base hue | derived hue | colour |
|---|---|---|---|---|---|---|---|
| 0 | A | loud 1.00 | comet | streak | 208 | 236 | violet |
| 1 | B | loud .93 | crescent moon\* | radial-mass | 212\* | 239 | violet |
| 2 | C | loud .86 | pulsar (aurora source) | burst | 120 | 299 | pink |
| 3 | A | loud .92 | meteor shower\* | streak | 200\* | 223 | violet |
| 4 | B | loud .67 | lit planet | radial-mass | 140 | 281 | pink |
| 5 | C | trough .19 | constellation\* | cluster | 224\* | 203 | violet |
| 6 | A | mid .26 | aurora ribbon | streak | 196 | 202 | violet |
| 7 | B | trough .00 | banded giant\* | radial-mass | 30\* | 271 | pink |
| 8 | C | trough .07 | asteroid field | cluster | 160 | 214 | violet |
| 9 | A | trough .13 | rose nebula (accent) | cloud | 330 | 231 | violet |
| 10 | B | mid .20 | **eclipse\*** (corona source) — `MUSIC_STATION` | radial-mass | 44\* | 312 | pink |
| 11 | C | mid .36 | star cluster | cluster | 268 | 265 | violet |
| 12 | — | loud .63 | supernova (ember source, accent) | burst | 36 | 343 | pink |

Checks by eye against §6.3: no family within d<3 (radial {1,4,7,10}, streak {0,3,6}, cluster {5,8,11},
burst {2,12} d=3, cloud {9}); 3 same-colour neighbour pairs (0–1, 5–6, 8–9) each ≥6° apart on the
ladder — `derivePalette` printed exactly that warning; accents = 2 (nebula, supernova) ≤ 3; regions
present: aurora (pulsar at 2 — so the aurora shoulder now lives at the loud end, a different world
from today's), ember (12), corona (10). Six of last week's nouns are out (ringed planet, spiral galaxy,
amber planet, binary pair, saucer, cratered moon) — "a third of the ring is new," the variety plan's
P=19 arithmetic.

What the example exposes, honestly: pulsar at a loud slot means the aurora tints the world's brightest
stretch, not its quietest as today. Whether that reads right is a TV question. It is exactly the kind
of thing per-world certification exists to catch numerically and Ben's eye exists to catch
aesthetically.

---

## 9. Build order — the sequence that makes a real build possible

| step | what | size | blocked by |
|---|---|---|---|
| 0 | Ben answers §11 items 1, 2, 4, 5, 6, 8 | chat | — |
| 1 | Eclipse swap as a plain authored edit: st10 in both builds, `disco`→`corona` (or delete), `RECORD_HUE`→`ECLIPSE_HUE` + pin, `MUSIC_STATION` comment, `SKY_REGIONS` comment, `RING_VERSION` bump. Art rounds per protocol (noun test sentence first, fill-black, corona-first, `LIGHT_DEG`, geometry-lint). Then `--seed-batch` re-sweep — the bump empties the shelf | art: 2–7 rounds; edit: half a day | 0 (items 4, 5) |
| 2 | `ringDraw.js` pure + tests; falsifier: seed `'authored'` → the step-1 ring byte-for-byte | half a day, no render | — (can run before 1) |
| 3 | `drawWorld` composition + `assertWorld` + sub-seeds; `ringWorldFor` reads `ringWorld` with the two fallbacks | half a day | 2 |
| 4 | `stations` column + `--world-batch` + `findMatch`/`saveAsPending` on worlds | a day, attended gate runs | 3, schema sign-off |
| 5 | Picker shelf strip / Surprise / Re-roll | half a day | 4 |
| 6 | Pool growth, one noun at a time, Tier A first | art project | 0 (item 1) |

Steps 2–5 are Sonnet-sized behind a flag; with the pool = the step-1 13, the draw is a no-op set and
`assertRing` on the authored order is the first thing that will fail (radial {0,3,4,8,10}) — that
failure is the proof the machinery works, not a bug to tune around. Step 1 and 6 are the art project.
Nothing renders on the TV differently until Ben flips the flag.

---

## 10. What this does not do

- No code, no lock edit, no threshold, no migration, no `noun-atlas.json` edit.
- No claim about how any composed world looks on the TV. Nothing was rendered; §8's hues are a pure
  function's output, not a frame.
- No per-round redraw, no live palette change, no `PANES` change, no `MUSIC_STATION` index change.
- Does not re-litigate nebula demotion, the far-layer anchor, sky-region normalisation, or the
  realised-span check.
- TV test and viewing distance remain outstanding; every slot-class threshold above inherits that.

---

## 11. STAYS HUMAN — Ben's calls, collected

1. **Lock kinds (Q1).** Add `planet / binary / asteroidField / pulsar` to `drawnSubject.kinds`, or keep
   the lock and define the pool allow-list separately with the spec-tier FAIL as known debt. Your
   edit either way.
2. **Coupling.** Accept "independent draws, identity-aware composition, no noun→hue table" — and judge
   it from rendered worlds, not from this doc. Aesthetic.
3. **Per-station palettes.** Accept the reformulation in §2.2 (one whole-ring palette per show;
   within-ring variety from `derivePalette`'s own levers), or say the original intent was something
   else. One sentence settles it.
4. **Eclipse at 10.** Confirm the noun; confirm it is built corona-first (no occluder) so §7.2 never
   applies; confirm `radial-mass` only. Taste + spec reading.
5. **`disco` region.** Rename to `corona` on the eclipse at lower saturation (recommended), delete, or
   keep. Aesthetic.
6. **Slot-class thresholds.** Loudness 0.2 / 0.6 as the mid/trough/loud cuts, or other numbers.
   Threshold choice.
7. **Schema.** `stations jsonb null` on `ring_palettes` (recommended) vs a `ring_worlds` table. Shared
   infra, RLS unchanged either way — your sign-off before a migration runs.
8. **Certification policy for worlds.** One gate run per composed world, nightly batch on existing
   always-on infra, hosts pick only certified worlds (recommended — it is the only reading of
   "bulletproof" that survives a noun draw). Or the variety plan's cheaper Q3 option (slot-invariance
   for regression tier, spot-check spec tier) with the honest caveat that it certifies parts, not the
   whole.
9. **Sub-seeds.** Keep "re-roll objects, keep colours" as a host action, or one Surprise only.
10. **Turn-craft follow-ups** (§6.2): worth scheduling, or leave the turn as is.
11. **Recraft tier** — still unconfirmed (research doc §8 item 7); eclipse reference is cited as
    licensed input only once it is.
12. **Aesthetic acceptance** of every drawn world, on the real TV. Standing.

## 12. Suggested next step, if Ben says go

One attended session: answer 1, 3, 4, 5, 8 in chat; then step 1 (eclipse) as the art task under the
protocol, and step 2 (`ringDraw.js`) as a Sonnet task with no render, in parallel — they don't touch
the same files.
