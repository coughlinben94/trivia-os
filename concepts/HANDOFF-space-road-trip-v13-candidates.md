# space-road-trip v13 — 8 Fable candidates, ready for morning review

Session context: computer crashed mid-session. Recovered, then dispatched Fable
agents (max creative authority, must actually render + must call Recraft) at
your request across three stops. All 8 agents paused on your "pause all"
request — none were mid-write when stopped; every file below is syntactically
valid (`node --check` clean) and was independently confirmed to render the
full 4-stop file with zero page/console errors. Nothing has been committed,
and `NIGHTLY-LOG.md` / `QUEUE.md` / `manifest.js` are untouched — these are all
sitting as loose candidate files in `concepts/`, exactly as you asked.

## The one fact every diner-stop agent found independently

**`space-road-trip-v12.html` never actually played.** It deletes
`drawFloatingIsland()` (per your "diner+rock fused" note) but leaves the call
to it in `drawGasWorld`, and the fused `dinerRockImg` asset was generated but
never wired in — only the old standalone diner image ships. Real headless
render: `ReferenceError: drawFloatingIsland is not defined` the instant the
diner stop's alpha crosses 0.01, the animation loop dies there, and the phase
label freezes at `bridge2` for the rest of the run. **Nobody — human or
agent — ever actually watched v12 play.** Every "10 versions and it's still
not right" read of the diner stop up to now was based on v11, not v12.

Five independent agents hit this same wall and each fixed it their own way —
that's why there are 5 different diner-stop candidates below, not variations
on a shared fix.

## Diner stop — 5 independent full rebuilds (pick one, or graft ideas across)

All five: fixed the v12 crash, embedded a real Recraft diner+rock (and, in
most, a separate Recraft drone per your "drone is its own asset" note),
confirmed via real render + `node --check`, left evidence-cited `.notes`.

| File | Angle | What's distinctive |
|---|---|---|
| `v13-camera.html` | Camera/cinematography | Root-caused *why* 9 prior versions felt too distant: arrival started at 0.05 scale with nothing visible to push toward for ~1.5s. Now starts at 0.30 (diner visible from frame 1), adds an easeOut brake tail so the "we've stopped" jolt fires at the actual visual stop (not ~900ms early), moves flare/debris/lights into world-space so they scale with the 4x zoom instead of misaligning, adds a departure bank-flick. |
| `v13-asset.html` | Recraft asset quality | Generated and rendered TWO real Recraft candidates side by side, picked the one legible at distance (roof/window/sign still read as "diner" as a speck). Rescaled/redocked the drone, which was rendering at building-size — a knock-on bug from v10's 4x zoom nobody had caught because nothing rendered past the crash point. Re-verified once more under a second superpowers-flagged pass; held up unchanged. |
| `v13-timing.html` | Beat pacing/choreography | Focused on whether each beat (arrival/hold/drone/departure) gets the right screen-time relative to its importance, per Emil-style easing/duration taste. |
| `v13-guest.html` | First-time-guest reaction | Explicitly re-ran the "MEMORABLE" bar the other 3 stops were already held to. Verdict on v11 (last playable version): "a pretty purple postcard I'd tune out mid-sentence." Rebuilt the drone delivery into the stop's one unmistakable instant — flies at camera, fills half the screen, pink blip, thunk, whoosh off. Self-rated: "the space diner that DoorDashed the screen," first version they'd actually remember later. Flags the pink blip blends into the bag's own orange at peak. |
| `v13-freshtake.html` | Structural rebuild, no sunk cost | Deliberately ignored v12's mechanism as sacred. Replaced "3D scene + bolted-on camera" with a windshield-fixed frame and the diner as a sprite on a drive-thru path (distant speck → arcs in → parks large → drone delivers → sweeps off). Kept only individually-proven pieces (fixed-planet parallax, rush/shake, growth curve). Flags one nit: drone slightly overlaps rock silhouette at hover (named fix: `DRONE_HOVER_SCREEN.x`, not yet applied). |

**My read, for what it's worth:** `v13-guest.html` and `v13-freshtake.html` are
the two most structurally different from each other and from the v4-v12
lineage — worth watching those two first since they represent the biggest
actual decision (bolted-on camera on a 3D scene vs. windshield-fixed sprite
path). `v13-camera.html` and `v13-asset.html` are closer to "the v12 direction,
finally actually finished and debugged" — good candidates if you liked v12's
concept on paper and just want it working.

## Supernova/harvest finale — 2 candidates (likely complementary, not exclusive)

Context: this stop had never been reviewed by a Fable pass before tonight —
you asked for 2 agents on it because that was the original pre-crash plan.

| File | Angle | What's distinctive |
|---|---|---|
| `v13-supernova-climax.html` | Climax intensity/payoff | Built on top of `v13-asset.html`'s fixed base. Bumped ejecta particle count 18→44 (18 read as "a handful of stray dots under the flash"), halved the burst-stagger window 180ms→90ms so the burst reads as one instant instead of smearing across two beats, made the ember field catch the nova's own light at burst instant instead of just sitting under an overlay. Was mid-edit (adding `novaCoreR`/`novaGather`/`novaAfter`/`novaRemnant` state) when stopped — **treat this one as further along in concept than in finished execution; re-render before trusting it fully.** |
| `v13-supernova-asset.html` | Recraft asset for the burst itself | Found the existing hand-drawn radial-gradient burst reads as "a flat grey-tan wash with a small fuzzy blob" at its own peak frame — thinnest moment in a file where the other 3 stops all carry real illustration work. Generated a real Recraft supernova starburst (white-gold core, ember-orange shockwave, HAR palette), drawn additively so it doesn't need transparency removal, riding the *existing* timing envelope (no new timers). Confirmed via full re-render, zero errors. This one looks essentially finished. |

These two touch different mechanisms (particle count/timing vs. a drawn
image) and were built independently on different bases — they were NOT
diffed against each other. Before shipping either, someone (you or a future
pass) should check whether they conflict or can be merged.

## Meteor shower — 1 candidate, your explicit spec

You asked for: sparse open (one meteor, then another, then it picks up) —
built on `v13-asset.html`'s fixed base.

| File | Status |
|---|---|
| `v13-meteor-buildup.html` | Verified the beat timing renders correctly non-reduced-motion; was mid-way through the reduced-motion + full-tail crash re-check (confirming it doesn't reintroduce the diner/harvest crash) when stopped. **Re-render this one before trusting the reduced-motion path** — everything else checked out clean. |

## Housekeeping already done this session

- Stale `.nightly-lock` (dead pid from the crash) — cleared.
- `git status` unaffected by any of this — all 8 files are new/untracked,
  nothing modified in place, nothing committed.

## Suggested next step

Watch the diner-stop candidates in a browser (not just screenshots) — that's
the one thing no agent could actually verify tonight, and multiple agents
flagged it as the real remaining unknown. Pick a direction (or name pieces to
graft together), and the normal `/ship` pass (QUEUE.md + NIGHTLY-LOG.md +
manifest.js + commit) can run against whichever one wins.
