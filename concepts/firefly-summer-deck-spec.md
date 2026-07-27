# Firefly Summer — deck/pond replan (locked spec)

Read this whole file before touching code. This replaces the meadow/oak/swing
composition entirely. Do not port the oak, the swing, the branch, or the jar
forward. Build a new file — do not overwrite `firefly-summer-meadow.html`,
the iterations-never-overwritten rule still applies. New filename:
`firefly-summer-pond-deck-v1.html`.

## Why this exists

Four builds and seven Fable-verified attempts on the meadow/swing composition
failed. The swing passed every locked number (27/27) and still read as a
crane boom, never a hanging swing. Two causes, found late:

1. Ropes rendered visible enough to see (thick, wood-toned) read as rigid
   posts, not cord — and "vertical, parallel, two tie points, visible their
   whole run" as a written rule forecloses the sag/curve/taper that would
   have made them read as rope.
2. The branch/rope/seat had only 0.3–0.4px blur while every other element in
   the scene (jar shadow, pond shimmer, oak shadow, glow) used 1.5–9px blur.
   A real rendering-technique mismatch, not a shape problem.

Ben's call after seeing the last render: worst one yet, full replan, no
eighth patch attempt.

## New vantage

The viewer stands on a deck at night, looking out at a pond. Two lanterns
hang in the top corners from an unseen structure above the viewer (porch
roof, pergola beam — never drawn) and swing slowly, like real lanterns in a
breeze. Fireflies drift over the water.

This was checked against two independent consultants (Fable, Opus) before
being locked. Where they disagreed, the resolution is noted inline.

## Locked layout (% of stage, origin top-left, 16:9, ±2% tolerance unless stated)

**SKY** y = 0% → 43%.

**HILLS** — exactly 3 layers (unchanged convention). Ridgeline tops: far
43%, mid 47%, near 51%. Each layer measurably darker than the one behind it.

**POND** — the subject; give it the biggest box in the frame.
Far shore y = 53%. Near waterline y = 80% (partly occluded by the rail —
see below). X-span 6% → 94%. Shoreline is its own element: a 0.7%-tall band
at y = 52.6–53.3%, lighter than both the hill above it and the water below
it — not a fade, a defined edge.
Reflection column under each lantern: width 4% of stage, centered on that
lantern's resting x-position, spanning y = 53% → 80%, opacity ramping
0.5 → 0 with depth.
**Hard rule: the water is lit by the sky gradient only.** The two lantern
reflection columns are the only amber allowed in the pond. No ambient warm
spill painted onto the water surface — physically the lanterns are 20+ feet
away, and spill on the water is the tell that the geometry is fake.

**DECK / RAILING** — required, not optional. Two lanterns in the corners
alone will not sell "standing on a deck" — a corner light with nothing
crossing the frame below it reads as a floating orb or a distant streetlamp.
The vantage is sold by occlusion: something in the foreground crosses in
front of the pond's near edge.
- Rail cap: y = 72% → 73.5%, x = 0% → 100% (full width, frame edge to edge).
- Balusters: 7 verticals, 1% stage width each, evenly spaced starting at
  x = 8%, y = 73.5% → 84%.
- Deck floor: y = 84% → 100%, x = 0% → 100%, darkest fill value in the scene.
The pond's near waterline (80%) sits inside the baluster band — the closest
water is visible only through the gaps. That overlap is deliberate; if pond
and rail don't overlap, it's a fence next to a pond, not a view from a deck.

**LANTERNS** — asymmetric on purpose. Two identical lanterns at matched
heights is a mirror composition, the same category of mistake as dead-center
placement.
- Pivot points are on-frame and visible: a small hardware dot, ~0.9%
  diameter, at left (x=14%, y=1%) and right (x=86%, y=1.5%).
- Chain: straight, 0.35% stage width, pivot to lantern top. Straight is
  correct here — a taut chain under a weighted lantern doesn't sag. This is
  not the rope-vs-post trap from the swing; that trap only applies to an
  object that should look slack and doesn't.
- Left lantern: body top y=14%, center x=14%, width 5.5%, height 7.5%.
- Right lantern: body top y=11.5%, center x=86%, width 4.8%, height 6.8%
  (deliberately smaller and higher than the left — breaks the mirror).
- Glow halo: radius 2.2× body width, blur ≥8px.

**Swing motion — the part most likely to fail again if under-specified:**
- Rotate the whole chain+body group about its pivot. Sinusoidal ease is
  correct here — for small angles, that *is* real pendulum physics, not an
  approximation.
- Left: amplitude ±9° (18° peak-to-peak), period 6.2s.
- Right: amplitude ±7° (14° peak-to-peak), period 7.4s. Different period so
  the two are never in phase — the relative motion between them is what
  reads as movement at TV viewing distance, not either lantern alone.
- Hold 0.6s at rest before the first swing starts.
- **Assert the rotation angle in degrees over multiple time samples, ±1°
  tolerance — not the x/y position of the lantern.** A position-based bounding
  box cannot see a swing this small; ±9° of rotation on a normal pendulum
  length moves the lantern body only ~2% of stage width, which is inside a
  ±2% position tolerance and would silently pass while reading as motionless.
  This exact gap — a check that can't see the thing it's supposed to verify
  — is why the swing failure went undetected for so many rounds.

**Rail-cap light pools** — required, welds the lanterns to the deck. Amber
ellipse, 15% stage width, centered under each lantern's resting x-position,
sitting on the rail cap (y = 72–75%), blur ≥7px, static — it does not swing,
only the lantern above it does.

**FIREFLIES** — 14 total, bounded x = 16% → 84%, y = 56% → 76%. None above
y = 56% (keeps them off the hill silhouette and off the sky — over the water
only, since Ben asked for fireflies over the pond specifically). 5 of the 14
get a mirrored reflection dot in the water below them.

**Color — 60/30/10 as a starting ratio:** deep blue-teal (sky + water) ≈60%
of the frame, near-black silhouette (hills, deck, rail) ≈30%, warm amber
(lantern flame, firefly glow, reflections, light pools) ≤10% of lit pixels.

## Hard style rules

- Flat 2D silhouette only for hills, deck, and rail — no isometric, no
  three-quarter view, no visible top faces on any object.
- **Blur floor: every element in the scene ≥1.5px blur, no exceptions.**
  This directly closes the gap that broke the swing — nothing in this scene
  gets the thin, sharp-vector treatment that made the branch/rope look
  pasted from a different art style.
- **Superseded 2026-07-26 — this line had it backwards.** "No new raster
  assets" was the default that let the swing, and then the pond, burn 7 and
  6 hand-coded rounds before anyone generated real art for them. The oak in
  this same file proves the other order works: hand-typed SVG failed it 3
  times, one Recraft pass fixed it outright. The corrected default, per
  `concepts/OBJECT-RENDERING-PROTOCOL.md`: classify every element first.
  Anything a guest would identify by its contour or its joints (rope, water,
  bark, railings with visible joinery) is generated and isolation-validated
  before it touches a scene. Only genuinely one-sentence-of-geometry shapes
  (a disc, a beam, a glowing dot, a flat gradient plane) get hand-coded. Do
  not hand-code a figurative element "to see if it works first" — that
  guess is what cost the swing seven rounds.
- Pond/water surface specifically: hand-coded fill failed six non-converging
  ways before a generated raster texture worked. Start with generated water,
  not hand-coded, on any future pond/lake/ocean element.
- Reduced-motion branch: lanterns hold at rest (no swing), everything else
  in the scene unchanged.

## Build order

1. Write the assertion script first (extend or replace
   `concepts/tools/assert-firefly-layout.mjs` — new name
   `assert-deck-pond-layout.mjs` is fine). It must check every locked number
   above, **including the rotation-angle-over-time check for both lanterns.**
   A static-position-only assertion script is what let the swing pass 27/27
   while failing every visual read — do not repeat that gap here.
2. Build sky, hills, pond, shoreline, deck, rail, balusters. Run the
   assertion script. Watch it render (rule 0 — a real render, not a mental
   model of one) before going further.
3. **Fable checkpoint A**, fresh context, screenshot only, "report findings
   only, do not fix, do not be encouraging." Ask: does this read as standing
   on a deck looking at a pond? Do not ask if it "works."
4. Build lanterns, chains, pivots, swing motion, glow, rail-cap light pools,
   fireflies. Run the assertion script, including the rotation check.
5. **Fable checkpoint B**, fresh context. This time a still frame is not
   enough — the whole point of the amplitude finding above is that the
   failure mode is invisible in one frame. Capture multiple frames across a
   full swing cycle (or a short screen recording) and ask Fable to look at
   the motion, not a single image. Ask what the lanterns actually look like
   doing, not whether the scene "works."
6. Re-verify every Fable finding against the real coordinates and the real
   rotation values before acting on it — Fable has been right and wrong
   before in this project; treat its read as a lead, not a verdict.

## Final gate — answer in writing before calling this done

- The assertion table, pasted, all PASS — including the rotation checks.
- One line per element: does it read as the thing it's meant to be?
- Does the deck/rail actually occlude the pond's near edge, or do they just
  sit next to each other unoccluded?
- What would you change with one more hour, and why didn't you?

## What the two consultants disagreed on, and how it was resolved

- **Rail size.** One consultant proposed a minimal rail stub in one corner;
  the other argued a full-width rail is what actually sells the "standing
  on a deck" read, since a stub next to an otherwise-open pond is a weaker
  occlusion cue. Full-width rail won — it's the more falsifiable claim
  ("pond and rail overlap or they don't") and matches the failure mode
  already seen once (an element that passes numbers but doesn't sell the
  read it's supposed to sell).
- **Swing amplitude.** One consultant proposed a small, subtle swing; the
  other pointed out that a small enough swing is invisible to a
  position-based assertion and would repeat the swing failure under a new
  name. The rotation-angle assertion and the larger amplitude both come from
  that finding — it's the sharper, more specific catch of the two.
