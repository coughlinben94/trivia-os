# Ring Full Build — Architecture Unification, Depth, and Remaining Spec Conformance

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Finish the space-world ring ambient build against `concepts/ART-DIRECTION-SPEC.md` and the punch lists from three independent Fable-model reviews of the current state (engine architecture, visual execution, spec-coverage audit). Kill the dual-file duplication bug class permanently, then land hue anchors, the depth mechanics spec section (§7, currently 0% implemented), the sub-visible-animation ban, the flagged noun/silhouette failures (spiral galaxy ≈ ringed lens, dust ribbon near-invisible, binary pair reading as dead moons, four cyclically-adjacent blob headlines), the "quiet stations read as empty, not hushed" composition problem, a third star layer, and an upgraded verification gate that actually covers the code that ships.

**Architecture:** Task 1 extracts the primitive-rendering DOM logic (`makePrim`, `bandY`, `buildStars`, `el`/`px`/`hsla`) that both `concepts/world-07-ring.html` and `client/src/components/display/RingAmbient.jsx` currently hand-duplicate into one shared vanilla-JS ES module, `client/src/lib/ringPrimitives.js`. Both files import from it going forward, using a `classPrefix` parameter to keep each file's own CSS-class convention (`b-lobe` in the HTML, `ring-b-lobe` in the JSX) — this is what makes every subsequent task land in BOTH builds automatically instead of needing a second manual port. Tasks 2-8 build on that shared module. `buildLayerContent` (per-station composition/placement) and the `turn()`/`land()`/`jumpTo()` engine chassis stay as two files for now — they were already separately hardened and synced this session (Tasks 3-4 of the prior plan) and are lower risk; unifying them is flagged as a fast-follow, not blocking.

Every task in this plan gets TWO review passes before being considered done: (1) a spec-compliance verification pass (checks the implementation against `ART-DIRECTION-SPEC.md`'s actual numbered rules, with real measurements — this is the pattern already used all session and has caught real bugs every time), and (2) a critique from the SAME standing Opus-5 agent used earlier this session (continued via `SendMessage`, not a fresh spawn — it should retain context from everything it's already reviewed). Both review passes must render/measure for real, not just read source and assume.

**Tech Stack:** Vanilla JS ES modules (shared primitives), React (RingAmbient.jsx port), `concepts/tools/ring-verify.mjs` (the gate, upgraded in Task 8), Playwright (all verification).

---

## File Structure

- Create: `client/src/lib/ringPrimitives.js` — shared, framework-agnostic DOM-building functions: `el`, `px`, `hsla`, `makePrim`, `bandY`, `buildStars`. No React, no browser API beyond `document.createElement`/style manipulation (works identically loaded via `<script type="module">` in a static HTML file or `import`ed into a React component).
- Modify: `concepts/world-07-ring.html` — replace its inline copies of the above with an ES module import; keep everything else local.
- Modify: `client/src/components/display/RingAmbient.jsx` — same: import from the shared module instead of local copies.
- Modify: `client/src/worlds/midnightGalaxy.ring.js` — hue anchors (Task 2), reassign one nebula's primitive to fix the cyclic-adjacency violation (Task 3), any world-data changes needed for the trough/anchor/pair work (Tasks 4-6).
- Modify: `concepts/tools/ring-verify.mjs` — new checks (Task 8): cyclic adjacent-gap replaces the deprecated rank check (this was already done earlier this session — verify it's still correct, don't redo), ink budget, bleed, quadrant rotation, safe-box luma, primitive-name parity between world data and `makePrim`, and a second gate pass against the live React route.

---

### Task 1: Extract shared primitive-rendering module

**Files:**
- Create: `client/src/lib/ringPrimitives.js`
- Modify: `concepts/world-07-ring.html`
- Modify: `client/src/components/display/RingAmbient.jsx`

This is the prerequisite for every other task in this plan landing in both builds without manual re-porting. Read both files' CURRENT `makePrim`/`bandY`/`buildStars`/`el`/`px`/`hsla` in full before starting — `RingAmbient.jsx` was just re-synced to match the HTML exactly (commit `396a639`), so they should currently be logic-identical modulo class-name prefixing. Confirm that's true before extracting; if they've drifted even slightly, reconcile to the HTML's version first (it's the one three independent reviews have hardened) and note the discrepancy in your report.

- [ ] **Step 1: Write the shared module**

```js
// client/src/lib/ringPrimitives.js
// Shared DOM-building logic for the ring ambient system. Framework-agnostic
// vanilla JS - loaded via <script type="module"> in concepts/world-07-ring.html
// AND imported into client/src/components/display/RingAmbient.jsx. This is
// the fix for a real, repeatedly-observed bug class this session: the two
// files hand-duplicated this logic, and every hardening pass (rim thickness,
// contrast, the ring/binary primitives) landed in one file and not the
// other - at one point RingAmbient.jsx rendered two stations as empty divs
// because its copy of makePrim had no branch for a primitive the world data
// required. One source now; both builds consume it.
//
// classPrefix lets each embedding context keep its own CSS-class convention
// without this module caring: concepts/world-07-ring.html uses unprefixed
// classes (.b-lobe, .b-rim); RingAmbient.jsx prefixes everything (.ring-b-lobe,
// .ring-b-rim) to avoid colliding with the rest of the app's CSS. Every
// element this module creates goes through prefix(name) instead of a literal
// string.

export function el(prefix, name) {
  const d = document.createElement('div')
  if (name) d.className = prefix + name
  return d
}

export function px(n) { return n.toFixed(1) + 'px' }

export function hsla(h, s, l, a) { return `hsla(${h},${s}%,${l}%,${a})` }

// bandY: places an element's TOP edge such that its CENTROID never falls
// inside engine.SAFE, for any element height h - clamped by centroid, not a
// fixed y-offset (see ART-DIRECTION-SPEC.md §2; this fixed a real safe-box
// violation earlier this session where a tall headline's centroid could
// land inside the box under the old fixed-offset constants).
export function bandY(engine, r, h) {
  const H = engine.H, top = engine.SAFE.y * H, bot = (engine.SAFE.y + engine.SAFE.h) * H
  const upper = r() < 0.5, margin = 8
  if (upper) {
    const maxY = top - h / 2 - margin, minY = -h * 0.10
    return maxY <= minY ? maxY : minY + (maxY - minY) * r()
  }
  const minY = bot - h / 2 + margin, maxY = H - h * 0.88
  return minY >= maxY ? minY : minY + (maxY - minY) * r()
}

// makePrim, buildStars: copy the CURRENT bodies of these two functions from
// concepts/world-07-ring.html verbatim, with these mechanical changes only:
//   1. Every el('some-class') call becomes el(prefix, 'some-class').
//   2. Both functions take `prefix` as their first parameter.
//   3. Nothing else changes - not a single numeric, color, or geometric
//      value. This is an extraction, not a rewrite. If you think something
//      could be improved while you're in here, don't - flag it in your
//      report instead, this task is scoped to zero-behavior-change.
export function makePrim(prefix, kind, w, h, hue, alpha, r) {
  // ... copy the current makePrim body here, prefixing every el() call
}

export function buildStars(prefix, host, period, perFrame, sizeMul, seed) {
  // ... copy the current buildStars body here, prefixing every el() call
}
```

Do the actual copy-and-prefix work yourself by reading the real current function bodies — the stub above shows the shape and the one mechanical rule (prefix every `el()` call), not literal content to paste blind.

- [ ] **Step 2: Wire the shared module into `concepts/world-07-ring.html`**

Change the `<script>` block (or add a `type="module"` script) to `import { el, px, hsla, makePrim, bandY, buildStars } from '../client/src/lib/ringPrimitives.js'` (confirm the real relative path from the HTML file's location to the module — verify it resolves before assuming). Delete the file's own local `makePrim`/`bandY`/`buildStars`/`el`/`px`/`hsla` definitions. Every call site that used to say `makePrim(kind, w, h, hue, alpha, r)` becomes `makePrim('', kind, w, h, hue, alpha, r)` (empty-string prefix — the HTML's CSS is unprefixed). Same for `bandY(r, h)` → `bandY(ENGINE, r, h)` (it already takes `r, h`; confirm whether the current HTML's `bandY` already receives `ENGINE` implicitly via closure or needs it passed explicitly now that it's imported — adjust call sites accordingly). Same for `buildStars(...)` calls, prefix `''`.

**Constraint:** `<script type="module">` in a `file://`-loaded HTML page has real cross-browser quirks (CORS restrictions on local file imports in some browsers). Test this actually works via `file://` in the same Playwright-based verification this session has used throughout — if `file://` module imports don't work reliably, the fallback is serving the HTML via a trivial local static server for verification purposes (document whichever approach you land on and why).

- [ ] **Step 3: Wire the shared module into `RingAmbient.jsx`**

```js
import { el, px, hsla, makePrim, bandY, buildStars } from '../../lib/ringPrimitives.js'
```

Delete the file's own local copies of these functions. Every call site becomes `makePrim('ring-', kind, w, h, hue, alpha, r)`, `bandY(ENGINE, r, h)`, `buildStars('ring-', host, period, perFrame, sizeMul, seed)` — adjust to match whatever the real current call signatures are (read the file, don't assume the plan's illustrative signature is exact).

- [ ] **Step 4: Verify both builds render identically to before the extraction**

This is a refactor — the deliverable is "renders exactly the same," not "renders differently." Render all 12 stations of both `concepts/world-07-ring.html` and `RingAmbient.jsx` (via `/ambient?ring=1`) before and after this change (screenshot comparison, Playwright), confirm pixel-equivalent (or close enough that any difference is explainable, e.g. font-rendering noise — not a geometry/color change). Run `node concepts/tools/ring-verify.mjs concepts/world-07-ring.html` — must stay 14/14. Check browser console for errors in both (module-loading failures are a common way this kind of change breaks silently).

- [ ] **Step 5: Commit**

```bash
git add client/src/lib/ringPrimitives.js concepts/world-07-ring.html client/src/components/display/RingAmbient.jsx
git commit -m "Extract makePrim/bandY/buildStars into one shared module - both builds now import the same source"
```

---

### Task 2: Hue anchors (spec §4)

**Files:**
- Modify: `client/src/worlds/midnightGalaxy.ring.js`

Read `concepts/ART-DIRECTION-SPEC.md` §4 in full. Midnight Galaxy's `theme.colors.highlight` is violet (~276°); the spec-coverage audit found station 12's hue (140°, green) doesn't fit any reasonable single ±25° window around that, and flagged this as unresolved.

- [ ] **Step 1: Declare a dyad**

```js
// alongside the existing sky/qColours fields in midnightGalaxyRing
hueAnchors: [
  { deg: 276, window: 25 },  // violet/purple - the theme's own highlight
  { deg: 214, window: 25 },  // cool blue - comet, open cluster, binary pair already live here
],
```

- [ ] **Step 2: Check every station's hue against the dyad, resolve outliers**

List all 12 stations' `hue` values and their distance from each anchor. Anything outside both ±25° windows and not marked `accent: true` must be fixed: either re-hue it to fit (shift toward 250-260° to read as "violet-blue" rather than unrelated) or mark it as this world's one deliberate 3rd accent (spec allows ≤3 accent stations at ≤25% of that station's ink — check the existing `accent` flags aren't already at the cap before adding a new one). Station 12 (green nebula, 140°) is the known outlier from the audit — resolve it one way or the other, don't leave it silently out-of-family.

- [ ] **Step 3: Verify + commit**

```bash
node concepts/tools/ring-verify.mjs concepts/world-07-ring.html
git add client/src/worlds/midnightGalaxy.ring.js
git commit -m "Declare Midnight Galaxy's hue anchors as a dyad, resolve the out-of-family green nebula"
```

---

### Task 3: Fix noun/silhouette failures found by the visual review

**Files:**
- Modify: `client/src/lib/ringPrimitives.js` (this now updates both builds via Task 1's extraction)
- Modify: `client/src/worlds/midnightGalaxy.ring.js`

The visual-execution Fable review, having actually rendered and looked at all 12 stations, found three specific noun failures and one repetition violation. Fix each on its own merits — these are real design problems, not spec-checkbox items:

- [ ] **Step 1: Spiral galaxy needs actual spiral structure**

Currently `lens` renders identically for "spiral galaxy" and "ringed lens" (the `ring` primitive fixed the latter; the former is still a flattened ellipse disc + dust lane, filled-black-indistinguishable from a tilted ring). Add real arm structure to the `lens` primitive when used for this noun — two logarithmic-ish curved bands sweeping out from the core, each with its own soft gradient and a bright inner edge (reuse the hard-edge/tracing approach already established for `blob`'s rim this session: an edge element must actually trace where the arm's visible glow is, not float near it). Render, silhouette-check (fill solid black) against `ring` — confirm they're now genuinely distinct classes, not just differently-named.

- [ ] **Step 2: Dust ribbon needs real presence**

Currently reads as "a scratch on a dark screen" per the visual review — a single thin pale curve, near-invisible at the frame scale. Per spec §6.1's ink minimums (headline ink 4-9% of frame) and the review's own fix suggestion: make it a large, low-alpha band crossing a substantial fraction of the frame width (not just a thin decorative ribbon shape) — big and dim, still passing the ≥4px/contrast-delta hard-edge rule on at least one rim tracing its long edge. This is the same "big and dim, not small and dim" principle Task 4 applies to trough stations generally; do this one now since it's noun-specific.

- [ ] **Step 3: Binary pair needs real stellar bodies, not flat dead-moon discs**

The halo-sizing fix (this session, commit `b0dd4ff`) correctly stopped the two dots from merging into one blob — but overshot into flat, matte, opaque grey circles with no glow, the only fully-opaque flat elements in a world built entirely from glowing forms. Give each of the two bodies its own radial-gradient glow (hot core fading to a soft halo, matching the treatment every other primitive in this vocabulary uses) instead of a flat `background: hsla(...,1)` fill. Keep the unequal sizing and the shared connecting halo from the current fix (that part is correct) — only the individual body rendering needs to change from flat-opaque to glowing.

- [ ] **Step 4: Fix the four-blob cyclic-adjacency violation**

Per spec §6.2/§10: no noun may be the largest element more than 3 times in 12, never on cyclically adjacent stations (station 12 → station 1 counts as adjacent). Currently `blob` is the headline primitive on stations 1, 6, 9, AND 12 — four times, and 12→1 are adjacent. Reassign ONE of these four (station 12, "green nebula," is the natural candidate since Task 2 may already be changing its hue/accent status) to a different primitive that still reads as a nebula-adjacent noun, OR reconsider whether it needs to stop being a "nebula" at all — use judgment, but the fix must leave `blob` at ≤3 headline appearances with no two cyclically adjacent.

- [ ] **Step 5: Verify + commit**

Render all 12 stations, screenshot, do the fill-black silhouette count (target ≥8/12 distinct classes per spec §6.2 — the audit found this "at exactly 8/12, not comfortably above" before this task; confirm it's now comfortably above, not just still scraping the floor). Run the gate.

```bash
node concepts/tools/ring-verify.mjs concepts/world-07-ring.html
git add client/src/lib/ringPrimitives.js client/src/worlds/midnightGalaxy.ring.js
git commit -m "Fix spiral galaxy/ring duplication, dust ribbon invisibility, binary pair's dead-moon look, and the 4x cyclically-adjacent blob violation"
```

---

### Task 4: Fix trough stations reading as empty (spec §3, visual review's top finding)

**Files:**
- Modify: `client/src/lib/ringPrimitives.js` and/or `client/src/worlds/midnightGalaxy.ring.js` (whichever is the right lever — see Step 1)

The visual review's single biggest finding: quiet stations achieve their low value-arc target by having LESS and SMALLER content, not by having large content at LOW luminance — so they read as half-loaded screens, not hushed places. Stations flagged specifically: 6 (violet nebula), 7 (dust ribbon — partially addressed by Task 3 Step 2), 8 (binary pair — partially addressed by Task 3 Step 3), 9 (rose nebula), 11 (open cluster).

- [ ] **Step 1: Diagnose the real lever**

Read `buildLayerContent`'s `mid` branch (in both `concepts/world-07-ring.html` and `RingAmbient.jsx` — this logic wasn't unified by Task 1, so check both, or better: if time allows, extend Task 1's extraction to cover this function too, since it's exactly the kind of logic that will otherwise need manual re-syncing again). Find where a station's `lou` (loudness, 0-1 from the arc) scales element SIZE (`hw = lerp(576, 880, lou*0.75 + r()*0.25)` or similar) vs where it scales ALPHA — the fix is to reduce or remove loudness's influence on size, so quiet stations still draw full-tier-range headline shapes, and let alpha/detail-count carry the loudness signal instead.

- [ ] **Step 2: Implement — large forms, low alpha, at the quiet end**

For the specific stations flagged (6, 9, 11 — 7 and 8 are handled by Task 3), verify after the size/alpha decoupling that their headline elements are drawing at or near the tier's full size range (576-880px longest edge, not clustered at the bottom of that range because `lou` is low), with alpha correctly still low per the arc. This may require adjusting how `lou` factors into the headline-size `lerp` call specifically, not a per-station hack — a per-station special case would just be papering over the same bug for the next trough seed.

- [ ] **Step 3: Verify + commit**

Render, screenshot stations 6/9/11 before/after, confirm by eye they now read as "a large dim form in a quiet sky" rather than "mostly empty frame." Re-check the value-arc gate still passes (§3's span/band/gap rules — a size/alpha decoupling could accidentally change measured luma if not careful; re-verify with real numbers, don't assume it's unaffected). Re-check ink-per-station is still inside spec's 6-18% band if that check exists yet (Task 8 adds it formally; do a manual check now if it doesn't exist yet).

```bash
node concepts/tools/ring-verify.mjs concepts/world-07-ring.html
git add -A  # scope to the real files touched, check git status first
git commit -m "Decouple headline size from loudness so quiet stations stay large-and-dim instead of small-and-sparse"
```

---

### Task 5: Third star layer (spec §5)

**Files:**
- Modify: `client/src/lib/ringPrimitives.js` (the `buildLayerContent` far/near layer setup — check both files per Task 4's note about this function not yet being unified)

Spec §5 requires "at least three star layers, and their surge distances must differ per §4.6.1." The spec-coverage audit confirmed only two exist (far + near). Add a third with its own surge distance (must fit the existing engine layer list's surge/m arithmetic — check `ENGINE.LAYERS` and `concepts/tools/ring-verify.mjs`'s layer-arithmetic checks before picking a value; it must satisfy `cylinder = 12 × surge` and the differential-surge ratio rules already gated).

- [ ] **Step 1: Add the layer**

Determine the right insertion point — likely a "mid-far" or "mid-near" star density sitting between the existing two, with its own surge distance distinct from both (not equal to `far`'s 480 or `near`'s 2880). Confirm what `ENGINE.LAYERS` currently contains and add an entry consistent with the existing 1:4:6-style ratio family, then wire a `buildStars` call for it into the layer-building logic, sized appropriately (density/size mix from spec §5's existing bands — the same ones already governing the other two layers).

- [ ] **Step 2: Verify + commit**

Run the gate (it checks total visible stars per frame — target 150-260; adding a layer must not blow past this, may require reducing density on the existing two layers to compensate). Check `layer arithmetic` and `parallax is real` checks still pass with the new layer included.

```bash
node concepts/tools/ring-verify.mjs concepts/world-07-ring.html
git add -A
git commit -m "Add a third star layer (spec requires >=3), rebalanced density to stay within the 150-260/frame gate"
```

---

### Task 6: Depth mechanics (spec §7 — currently 0% implemented, confirmed by audit)

**Files:**
- Modify: `client/src/lib/ringPrimitives.js` and/or `RingAmbient.jsx`/`world-07-ring.html`'s `buildLayerContent` (whichever holds after Task 1/4's unification decisions)
- Modify: `client/src/worlds/midnightGalaxy.ring.js`

Read spec §7 in full (all 7 sub-rules). This is the largest remaining task — same scope as the original plan's Task 9, still entirely unaddressed. Implement what's tractable in one pass; if any sub-item can't land cleanly, report that honestly rather than force a fake pass (same standard used all session).

- [ ] **Step 1: Scale ladder (§7.3)** — within a station, largest ÷ smallest non-atmosphere element ≥6×. The audit found worst case at 3.7×. After Task 1/4 size-decoupling work, resample detail-tier sizes if a station's ladder doesn't clear 6× — tighten the lower end of the detail-tier `lerp` range or force at least one detail element toward the tier floor.

- [ ] **Step 2: One trackable drifter (§7.7)** — currently NOTHING provides continuous motion between turns (up to 75s of freeze-frame with only twinkle). Add exactly one element on the far layer with its OWN CSS transform/animation (crossing time 4-12 minutes, per this session's own prior finding that slower reads as visually frozen) — critically, this must be a transform on the ELEMENT, nested inside the already-transformed layer, never a second transform on the LAYER itself (a rail-style layer transform was deliberately deleted earlier this session for causing visible pops; do not reintroduce that class of bug).

- [ ] **Step 3: Far-layer anchor (§7.6)** — one nameable form, visible in 4-6 of 12 stations, sized via `(frameWidth + anchorWidth) / farSurge` landing in that band (far surge = 480 per the engine; do the actual arithmetic against the real value, don't guess). A large, slow `lens`-based form (the review praised this primitive's legibility) is a reasonable choice. Place once per far-layer author-period.

- [ ] **Step 4: Occlusion (§7.2), measured by ablation** — at least 1-in-3 stations needs an element whose footprint measurably dims the star layer behind it (≥0.5× reduction, render with/without and diff). Given most primitives are translucent glows, this likely needs a genuinely dark, rimmed shape (reuse the rim-contrast treatment established this session) placed over a dense star region on the mid layer for a subset of stations.

- [ ] **Step 5: Declared pairs (§7.5)** — at least one declared pair per station: headline + companion linked by proximity plus one shared visual property. Cheapest real implementation: bias the companion's hue to sit within 20° of the headline's hue on roughly half of stations (currently independent/random), and/or add a thin connecting visual bridge between them when they're close enough.

- [ ] **Step 6: Verify + commit**

For each sub-item, verify by real measurement (ablation render for occlusion, actual crossing-time timing for the drifter, actual visible-station-count for the anchor) — not by reading the code and assuming. Report which sub-items landed cleanly and which didn't, honestly.

```bash
node concepts/tools/ring-verify.mjs concepts/world-07-ring.html
git add -A
git commit -m "Implement spec §7 depth mechanics: scale ladder, trackable drifter, far-layer anchor, basic occlusion, declared pairs"
```

---

### Task 7: Sub-visible breathe ban (spec §8)

**Files:**
- Modify: `client/src/lib/ringPrimitives.js`

The spec-coverage audit confirmed this is still unfixed: every primitive still breathes at ~1.18× alpha, mostly under the 22-luma perceptibility floor the spec bans as dead compositor weight.

- [ ] **Step 1: Headline-only breathe, wide enough to be real**

In the shared `makePrim`, only apply the `pfBreathe`/`ringPfBreathe` animation (and its `--pa`/`--pa2` custom properties) to elements explicitly flagged as a station's headline — pass an options flag from the call site, skip the animation entirely (static alpha, no animation class) for companion/detail/far-wash/atmosphere elements. Widen the headline's swing to clear the 22-luma floor (spec's own guidance: `Math.min(alpha*1.6, 1)` rather than the current `*1.18`), and lengthen the period floor to ≥30s.

- [ ] **Step 2: Verify + commit**

Confirm via computed-style sampling at breathe-peak that the headline's brightest pixel actually swings ≥22 luma (real measurement, both builds since Task 1 unified this function). Confirm non-headline elements no longer animate at all (check `animation-name` is `none` or absent on them).

```bash
node concepts/tools/ring-verify.mjs concepts/world-07-ring.html
git add client/src/lib/ringPrimitives.js
git commit -m "Breathe animation: headline-only, wide enough to actually be visible, everything else static per spec's dead-weight-animation ban"
```

---

### Task 8: Upgrade the verification gate (spec §2/§3, engine-architecture review's #3 recommendation)

**Files:**
- Modify: `concepts/tools/ring-verify.mjs`

The engine-architecture review's top structural recommendation, and the spec-coverage audit's #3 punch-list item: the gate only tests the HTML file (never the code that ships), still contains at least one deprecated check, and is missing several rules that tasks 3-7 (this plan and the prior one) have been "verifying" only via numbers pasted into commit messages and comments.

- [ ] **Step 1: Confirm/fix the arc-gap check**

Verify the cyclic adjacent-gap check (added earlier this session, replacing the rank-based check the spec itself calls broken) is genuinely what's currently running — re-read the file, don't assume from memory. If the deprecated rank check is still present anywhere, remove it.

- [ ] **Step 2: Add missing §1/§2 checks**

Ink-per-station (6-18% of frame, via the same luma-threshold method used in prior sessions' measurement work), headline ink when present (4-9%), largest-element-supplies-≥55%-of-mid-layer-ink, elements-per-station (2-5, excluding atmosphere), safe-box luminance cap (mean ≤34 measured under the scrim at breathe/twinkle peak, not the resting frame), bleed (3-5 of 12 stations' largest element cropped 10-35% by a frame edge, post-rotation), quadrant rotation (largest element's quadrant, 2-4 times per quadrant across 12 stations), horizontal balance (mean centroid x within 960±96 — already measured manually this session at 919.8, make it a real gate check).

- [ ] **Step 3: Add a primitive-name parity check**

The empty-station bug found this session (world data names a primitive `makePrim` has no branch for) should never be able to ship silently again. Add a static check: every distinct `prim` value across every `*.ring.js` world file must have a matching `kind === '...'` branch in `client/src/lib/ringPrimitives.js`'s `makePrim` (this is now checkable directly against source text since Task 1 unified the function — a simple regex/AST scan for `kind === '<name>'` against the set of `prim:` values used in world data is sufficient, doesn't need a real render).

- [ ] **Step 4: Extend the gate to the live React route**

Per the engine-architecture review: point a second pass of the gate (or a parallel script) at the actual Vite dev server's `/ambient?ring=1` route instead of only `file://`-loading the HTML, using the same `window.__world`-style exposure `RingAmbient.jsx` already provides via its imperative handle (check what's currently exposed; extend if the gate needs something not yet reachable). This closes the "gate never touches the code that ships" gap directly.

- [ ] **Step 5: Verify + commit**

Run the upgraded gate against current HEAD, report the real pass/fail counts honestly — some newly-added checks may fail against current content (e.g. if Task 3-4's fixes didn't fully close every gap). Fix what's cheaply fixable; report the rest.

```bash
node concepts/tools/ring-verify.mjs concepts/world-07-ring.html
git add concepts/tools/ring-verify.mjs
git commit -m "Upgrade ring-verify.mjs: ink/bleed/quadrant/balance/safe-box checks, primitive-name parity check, live React-route pass"
```

---

## Review Protocol For Every Task Above

After each task's implementation commit:

1. **Spec-compliance verification** — a fresh reviewer checks the real committed code against the specific `ART-DIRECTION-SPEC.md` section(s) the task cites, with real measurements (render, screenshot, compute — never trust a claimed number without re-deriving it). Same standard used all session.
2. **Opus consultant critique** — continue the standing Opus-5 agent from this session (via its existing agent identity, not a fresh spawn, so it retains full context of everything already reviewed) with a critique request specific to the new task's diff. Give it the exact git SHA range, the spec section(s), and explicit permission/expectation to render and measure independently rather than trust the commit message.
3. Any finding from either pass that represents a real bug (not a style preference) gets fixed and re-verified before the task is considered closed — this has been the pattern all session and it has caught a real, sometimes production-breaking bug on nearly every task so far. Don't skip it because the backlog is long.

---

## Self-Review

**Spec coverage:** §0 (done, no task). §1 (Task 4 addresses the size/ink-budget half; Task 8 adds the missing gate checks). §2 (Task 8 adds the missing gate checks for already-implemented placement rules). §3 (Task 4 touches this; already-implemented arc math unaffected). §4 (Task 2). §5 (Task 5). §6 (Task 3; Task 1 is the vocabulary's shared-source fix). §7 (Task 6). §8 (Task 7; queue/wrap already done prior session). §9 (already done prior session, not touched here). §10 (Task 3 Step 4 fixes the noun-repetition violation; rest already satisfied by construction). §11 (N/A, generator out of scope per user's space-only decision). §12 (eye checks — flagged throughout, not closeable by an agent, final pass is Ben's). §13 (unchanged, real-hardware/timing verification still explicitly out of scope for agents).

**Placeholder scan:** Task 6's occlusion/anchor/drifter sub-steps are the most open-ended in this plan — each has explicit permission to report a partial result honestly rather than force a fake pass, which is intentional scoping given §7's genuine difficulty, not a placeholder for missing content. The actual approach for each sub-item is fully specified.

**Type consistency:** `ringPrimitives.js`'s function signatures (`el(prefix, name)`, `makePrim(prefix, kind, w, h, hue, alpha, r)`, `bandY(engine, r, h)`, `buildStars(prefix, host, period, perFrame, sizeMul, seed)`) are used identically by both call-site tasks (Task 1's own wiring, and every later task that touches these functions, e.g. Task 3's primitive edits, Task 7's breathe-flag addition) — confirm this holds as the plan executes; if a later task needs to change a signature, it must be changed in both call sites, and this is exactly the kind of drift Task 1 exists to prevent.
