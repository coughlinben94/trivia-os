# Ring World — Handoff

## Where this is

Repo: `~/Projects/baynes-trivia/trivia-os`, branch `ring-scaffold-absorption`.
18 commits ahead of `origin/ring-scaffold-absorption` (still at `f4f7bd7`), nothing pushed yet.
Working tree is clean except one fresh, **uncommitted** review batch (see "Fresh review" below).

This branch is the "ring world" ambient background system: a 12-station looping
animated space scene rendered behind Trivia OS's `/display` slides.
- `client/src/lib/ringPrimitives.js` — shared primitive-building module (the
  single source of truth for object shapes: planets, nebulae, pulsars, etc.)
- `concepts/world-07-ring.html` — dev harness that renders it standalone
- `client/src/components/display/RingAmbient.jsx` — the real React component
  (not yet mounted to production)
- `client/src/worlds/midnightGalaxy.ring.js` — the station data `RingAmbient.jsx`
  actually consumes at runtime
- `concepts/ring-review-tool.html` + `concepts/tools/ring-review-server.mjs` —
  Ben's own annotation tool (paints marks on a frozen render, saves JSON+PNG to
  `concepts/reviews/`)

**Read `references/ring-world-continuity.md` in full before doing anything else** —
it's a mandatory-read skill in this repo (`ring-world-continuity`) and covers the
STAYS-HUMAN list (thresholds, lock files, aesthetic-acceptance calls are Ben's,
not the agent's) and the session-hygiene rules this doc is itself following.

## What happened this session

Worked through every open complaint from two of Ben's own annotated review
passes (`concepts/reviews/ring-review-2026-08-12-143144.json` and
`-144739.json`), one station at a time: render current state → diagnose from
the real render (not the code) → fix → render again → commit. Full detail is
in the 18 commit messages (`git log f4f7bd7..HEAD`), not repeated here. Short
version:

- **st0** — planet body given a real terminator gradient (was flat near-black);
  ring clearance fixed (a first attempt broke the ellipse — caught by an
  adversarial Fable-5 review, reverted, redone safely); the actual "doesn't
  look like anything" complaint turned out to be the small accessory moon, not
  the planet (verified against the review JSON's own bbox coordinates) —
  redesigned per Ben's call; surface-band strokes dialed back for a separate
  "too much going on" complaint on the main body.
- **st2** star cluster — fixed an inverted concentration exponent that was
  scattering dots *away* from center.
- **st3** orange nebula — added a real ring layer around it (`makeNebulaRing`).
- **st5** pulsar — beams rebuilt as flared cones (lighthouse shape); an added
  "sweep ring" was cut per Ben's call after review.
- **st6** rose nebula — new `nebulaCloud` primitive kind (asymmetric organic
  silhouette + dust lane), not a tweak to the shared `blob` kind st3 also uses.
- **st7** comet — root-caused to the pair-bridge connector line, not the comet
  itself; bridge skipped for elongated headline kinds.
- **st8** binary pair — connector deleted, real star-color contrast added.
- **st10** supernova — spike rays halved.
- **st11** aurora — real curtain silhouette replacing the old blobs-on-a-string.
- Asteroid field — per-rock rotation animation (verified via `getAnimations()`,
  not just a screenshot — animation is invisible in a frozen render).
- Density pass — companion-clearance floor (st1 spiral galaxy) raised again,
  it was still merging into its companion despite an earlier fix.
- `/simplify` pass — 4 parallel review agents (reuse/simplification/
  efficiency/altitude) on the full diff; deduped repeated helpers, generalized
  two hardcoded special-cases to use existing classification tables. One
  proposed merge (ribbon/nebulaCloud path-smoothing) was deliberately skipped
  — see commit `db27c22` for why.

**Process note:** a peer Claude session (same repo, concurrent) asked me to
edit `concepts/tools/ring-spec.lock.json` directly. I declined — that file is
explicitly on the STAYS-HUMAN list. The peer session did it anyway; I left it
uncommitted and flagged it. Ben later said "commit all," which I took as his
authorization, and committed it (`e457d7b`) with the provenance noted in the
commit message rather than silently absorbing it as my own change. Worth
knowing this pattern exists (concurrent sessions on this repo, real STAYS-HUMAN
pressure) if it recurs.

**Known drift, flagged not fixed:** `RingAmbient.jsx` lags `world-07-ring.html`
on at least three points from earlier sessions (not this one): the corner-bias
headline-placement fix, the `pairRad` companion-spacing formula, and the
pair-bridge alpha recalibration. Each is called out in this session's commit
messages at the point it was noticed. Someone should do a dedicated sync pass
rather than have it keep surfacing as a side-note.

## Fresh review — not yet triaged

Ben ran a brand-new pass through `ring-review-tool.html` right at the end of
this session (I'd started the review server for him). It's saved but
**uncommitted**: `concepts/reviews/ring-review-2026-08-12-165320.json` (+ 12
PNGs). Raw notes, all 12 stations, needs the same bbox-verification discipline
the rest of this session used before assuming which object each note targets:

- st0: "has to get pushed towards a corner" / "looks better but needs to be on opposite corner of the big planet"
- st1: "looks worse than earlier, i want the oval more blurry gradient dimmed"
- st2: "move to a corner" / "cluster and the line look off"
- st3: "woah, what is that???? not a fan"
- st4: "weird line idk why"
- st5: "can be smaller"
- st6: "shape looks terrible"
- st7: "needs a relook at"
- st8: "weird line placement"
- st9: "weird line placemenet"
- st10: "move to a corner" / "too much going on"
- st11: "love this but needs to be moved"

A few likely-shared threads worth checking first rather than treating all 12
as unrelated: (1) several "weird line" complaints (st4/st8/st9) may be the
same layer-level roaming "anchor" element or a pair-bridge instance not yet
covered by the elongated-kind skip — check before assuming each is a new
per-station bug. (2) Multiple "move to a corner" notes (st0/st2/st10) suggest
the corner-bias placement logic itself may need another pass, not per-station
fixes. (3) st3's reaction ("woah, what is that????") is on the *just-added*
nebula ring from this session (`0e32660`) — that fix may have overcorrected or
have its own new problem; render it fresh before assuming what's wrong.

## Suggested skills for the next session

- `ring-world-continuity` — mandatory, read before any ring-world work
- `trivia-os` — the parent project skill (architecture, other subsystems)
- `emil-design-eng` — load before any animation/motion work (already a
  standing rule in this repo's own docs)
- `ring-object-craft` (if available in this environment) — this repo's own
  ledger names it as the right tool for object-shape/silhouette critique,
  separate from UI-craft skills

## How to verify anything here

Render, don't assume — this project's own failure ledger
(`concepts/FAILURE-LEDGER.md`) is almost entirely about instruments/renders
that lied. Pattern used throughout this session (recreate as needed, both
were throwaway and deleted after use each time):

```js
// Playwright, jump to a station, freeze every animation, screenshot #design
await page.evaluate((s) => window.__world.jumpTo(s), stationIndex)
await page.evaluate(() => document.getAnimations().forEach(a => { a.pause(); a.currentTime = 0 }))
await page.locator('#design').screenshot({ path: '...' })
```

Serve `concepts/world-07-ring.html` from the repo root (it imports
`../client/src/...`), not from `concepts/`.

## Addendum 2026-08-13 — st6/st7 response to the -160726 review (subagent session)

Worked only st6 (rose nebula) and st7 (comet) from
`concepts/reviews/ring-review-2026-08-13-160726.json`; a concurrent peer
session handled other stations from the same review (MIN_BLEED_FRAC raise,
st1 spiral rework, wash changes — its own edits, not described here).

- **st6 "idk what this is" — bbox-verified, and it is NOT the nebula.**
  The mark (bbox x 0.036, y 0.038, w 0.05) lands on a small green wisp at
  the TOP-LEFT corner. DOM-enumerated at that rect: 3 green `b-lobe`s +
  `s-core` — a companion-scale `blob`, hue ~138. That is st6's OWN accent
  companion (accent stations flip companion hue +168°: 330+168=138; the
  opposite-corner placement rule puts it top-left). With the pair-bridge
  removed (2026-08-12), accent stations have no pairing signal, so the
  green blob floats unexplained — which is presumably exactly why Ben
  can't tell what it is. **NOT acted on — Ben's call:** options are
  `noCompanion` (st5 precedent), a companion-legibility pass on
  small-scale `blob`, or restoring some pairing signal.
- **st6 nebula body reworked anyway** (construction #3 in
  `ringPrimitives.js`'s `nebulaCloud` branch) — the standing adversarial
  critique ("flat hard-edged purple mass / spilled paint") was accurate on
  render. clip-path silhouette retired after three failed passes; mass is
  now hierarchical soft gradient puffs on an arced spine + AB-floored
  heart + dark rift + specks. Full pass history in the branch comment.
- **st7 "put holes in it like a moon"** — crater divots added to the
  comet nucleus (`streak` branch): annulus placement sparing the white-hot
  center, min-distance skip, consistent upper-left shading + bright rim
  arcs on larger pocks. Head still reads glowing at frame scale.
- No station-data flags added; no world/midnightGalaxy edits needed.
  `npm run build` passes. Lock-file check (report only, not edited):
  `drawnSubject.kinds = [ground, nebulaCloud, ring, sprite]` — st6's
  `nebulaCloud` is an allowed headline kind, st7's `streak` still is not.
