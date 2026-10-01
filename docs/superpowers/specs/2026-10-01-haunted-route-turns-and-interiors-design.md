# Haunted October v4: a route with turns, barn and house interiors, per-show variety

Date: 2026-10-01. Status: DRAFT, prototype-first, nothing wired. Supersedes the "straight 13-landmark corridor" part of `2026-09-29-haunted-forest-walk-design.md` (that spec's rules, gates, camera contract and world wiring stay; the SCENERY model changes). Ben, 2026-10-01 (after looking at the v3 port): "really glitchy, jumps in and out, doesnt look good"; "walking through a haunted forest. we make turns, walk through haunted barn and houses, variation is key". Decisions from Ben the same day: build it as CSS layered 2.5D (no canvas, no rAF, no waiver); a DIFFERENT ROUTE EACH SHOW (seeded random from a kit of segments).

## 1. What changes, what stays
Stays: one station per slide (13, loop), the camera contract (`lib/stationCamera.js`, retarget policy), `ForestAmbient` props/handle, the shared station resolver and phone backdrop, the gates in the spec (safe box, census, covered-cut, reduced motion), `approved:false`.
Changes: a station is no longer "a landmark on a straight road". A station is one SEGMENT of a route, and a walk is the move from the end of segment i to the end of segment i+1. Segment kinds give the variety.

## 2. Segment kit (v4 prototype scope in bold)
- **straight**: the current forest corridor (v3 generator).
- **bendL / bendR**: the path curves left/right over the walk; the view swings with it.
- **barn / house (interior)**: a door or barn-door landmark grows to fill the frame, the walk passes through it, and the next rest frame is a hand-built INTERIOR set (rafters or ceiling beams converging to the vanishing point, floor, hay or furniture, portraits, lantern light, drifting dust). Leaving an interior is the mirror door.
- later: fork (two paths, one chosen by seed), clearing, graveyard, bridge, well, cabin, mill.

## 3. Mechanics (CSS only, no new rule broken)
- Bend: v3 already animates every item with a per-stop `scale()` about the vanishing point (24 keyframe stops, generated). A bend adds a per-item `translateX` per stop from a path centerline `xc(Z)` (a gentle quadratic over the segment) and a small heading swing of the whole rig; ground and fog use the same function so nothing slides against the path. Transform and opacity only.
- Interior: a separate generator `interiorScene(kind, seed)` returning layers in the same item model (so `mount()` keyframes, anti-strobe and cap handling are reused) plus a door item whose scale-through is the transition. Interior rest frame is static layers + at most one flicker and slow dust (within spec 2.3's census).
- Pop-in/out (the complaint): items must LEAVE by passing off the screen edge or by a fog fade over distance, never by a timed fade while still large and near. The 400 ms cap fade is replaced by letting a near item keep scaling until it exits the frame (cap raised or item culled only when fully off-screen). New item entry is only at far distance inside fog. This is a gate: no frame in a walk may change by a localized blob (count of pixels with channel delta over a locked threshold per 100 ms step); the whole-frame mean used so far cannot see it.
- Strobe: `?nostrobe` whole-item dimming is REMOVED from the product path (it ghosted trunks). Strobe handling returns as limiting walk speed or dimming only distant bright layers; Ben's decision after he sees v4.

## 4. Per-show route
`makeRoute(seed, 13) -> [{ kind, variant }]`, deterministic per `showId` (same show, same route on every TV and reload), pure and unit-tested. Rules: start with a straight gate-like segment; no two interiors in a row; at most two bends in a row; the jukebox music station (index 10) stays a fixed, calm segment so the break picture is predictable; every kind appears at most 3 times; the loop closes (segment 12 flows into segment 0). The route is data; the camera contract and station count do not change.

## 5. Prototype first (this phase)
`concepts/haunted-forest-route-v4.html`, standalone, extending v3: one bend (L and R) and ONE barn interior with in and out doors, `makeRoute(seed)` driving a 13-station auto-play, `?seed=` and `?dur=`. Judge by eye on a laptop and the TV. Verify with the new localized-change sampler (frames at 100 ms, blob count) not only whole-frame mean. NOT wired into the app until Ben approves the look.

## 6. Then (only after Ben's yes)
Port to `forestGen`/`forestScene` (route-aware generator, interior scenes), ForestAmbient takes `route`, per-show seed from `showId`, phone backdrop hue per segment kind, re-run gates at final values.

## 7. Open for Ben
Which interiors besides the barn (house: hallway or parlor?), fork behaviour, whether the route should be shown to the host, final walk pace, dread vs cute.
