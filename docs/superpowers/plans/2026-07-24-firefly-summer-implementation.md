# Firefly Summer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `concepts/firefly-summer-meadow.html` — a standalone, self-contained ambient prototype (same convention as `concepts/sonora-balloons-depth.html`: no bundler, no external dependencies, `open`-able directly in a browser) implementing the design in `docs/superpowers/specs/2026-07-24-firefly-summer-bespoke-ambient-design.md`.

**Architecture:** Single HTML file, vanilla CSS keyframes + WAAPI (no animation library — GSAP was considered and rejected: every technique this design needs (drift, stagger, custom easing, reduced-motion gating) is already proven working via plain CSS/WAAPI in the balloon file, and introducing a new dependency into a zero-dependency prototype convention buys nothing). Layer stack bottom-to-top: sky gradient → stars → treeline (3 depth bands) → lake (reflection + shimmer) → fireflies (drift/flash/J-stroke, reflected in lake) → porch backdrop (Recraft asset, cropped/bled off-frame) → hand-coded swing bench → hand-coded jar (with its own firefly sub-population).

**Tech Stack:** Vanilla HTML/CSS/JS, CSS `@keyframes` + WAAPI (`Element.getAnimations()`, `Animation.playbackRate`), one Recraft-generated raster asset (`mcp__recraft__generate_image`).

**Verification convention (this project, not pytest):** No test framework exists for these concept prototypes. Verification per task is: (1) `node -e "new Function(...)"` syntax check on the extracted `<script>` block, (2) a real headless-Chromium capture via `concepts/tools/visual-audit.mjs` (zero pageErrors/consoleErrors is the pass bar), (3) for tasks producing hand-crafted visual shapes, a Fable design-consultant pass (fresh-context agent, `model: fable`) reviewing actual rendered frames — this is the project's established real second-opinion mechanism, used throughout the balloon build this session and caught real bugs each time it ran.

---

### Task 0: Scaffold the file

**Files:**
- Create: `concepts/firefly-summer-meadow.html`

- [ ] **Step 1: Create the file skeleton**

Copy `concepts/sonora-balloons-depth.html`'s outer structure (the `<style>` block's base reset, `.stage`/`.safe-area` scaffolding, the reduced-motion toggle checkbox + `rm-force` class, the on-page notes panel, the `(function(){ ... })()` IIFE wrapper) — this is the proven harness every bespoke ambient prototype in this repo uses. Do not copy any balloon-specific code (ridge/balloon functions) yet; those get reskinned per-task below.

- [ ] **Step 2: Verify the skeleton loads with no errors**

Run:
```bash
node concepts/tools/visual-audit.mjs concepts/firefly-summer-meadow.html --duration=3000 --slug=ff-scaffold
```
Expected: `{"pageErrors":[],"consoleErrors":[]}` in the output, an empty dark stage in the captured frame.

- [ ] **Step 3: Commit**

```bash
git add concepts/firefly-summer-meadow.html
git commit -m "scaffold: Firefly Summer concept file, harness only"
```

---

### Task 1: Sky gradient + stars

**Files:**
- Modify: `concepts/firefly-summer-meadow.html`

- [ ] **Step 1: Write the sky gradient**

Per spec's Sky section — deep indigo/violet at zenith through teal at mid-sky to warm ember low, explicitly exceeding `ambient-design-law.md`'s in-family color rule (documented precedent: Sonora Balloons' sky does the same). Add as the `#world` background div, first child, never animated (same "constant backdrop" role the balloon file's sky div has):

```html
<div style="position:absolute;inset:0;background:linear-gradient(180deg, #0a0620 0%, #1a1040 18%, #241a52 32%, #1f3050 48%, #1a4048 62%, #2a3818 78%, #4a3810 88%, #1a2808 96%, #040e04 100%)"></div>
```

(Indigo `#0a0620` → violet `#241a52` → teal-transition `#1a4048` → warm-ember-into-canopy `#4a3810` → settles into the theme's own `bg:#040e04` at the horizon, where the treeline sits.)

- [ ] **Step 2: Reuse the star field verbatim**

Copy the balloon file's star-generation loop exactly (22 stars, `sdStar` keyframe dipping to `opacity:0` at both cycle boundaries, reroll-position-at-invisible-instant on `animationiteration`) — spec says "no changes needed, copy as-is." Same `#stars` div id, same loop, same keyframe name.

- [ ] **Step 3: Visual-audit check**

```bash
node concepts/tools/visual-audit.mjs concepts/firefly-summer-meadow.html --duration=15000 --slug=ff-sky
```
Expected: zero errors; frames show the multi-stop dusk gradient (not a flat rectangle) with twinkling stars in the upper portion.

- [ ] **Step 4: Commit**

```bash
git add concepts/firefly-summer-meadow.html
git commit -m "feat: Firefly Summer sky gradient + star field"
```

---

### Task 2: Treeline (3 depth layers, oak included)

**Files:**
- Modify: `concepts/firefly-summer-meadow.html`

- [ ] **Step 1: Write the 3-layer treeline shapes**

Direct reskin of `RIDGE_SHAPE_VARIANTS`/`RIDGE_TIERS` from the balloon file — same tileable-SVG-polygon architecture, same real-vertical-separation-per-layer lesson (from `ambient-design-law.md`'s depth-band section), same 2-bump-variant-per-layer tile-seam-safety. Treeline silhouettes use spikier/more irregular bump shapes than the balloon's rolling ridge curves (a treeline canopy is jagged, not a smooth dune) — this is exactly the kind of shape where "known for straight lines" risk shows up if bumps are drawn as uniform repeating triangles. Vary bump width AND height irregularly per point, not just height:

```javascript
const TREE_SHAPE_VARIANTS = {
  T1: ['0,100 0,78 8,74.5 15,77 24,73 33,76.5 41,72 50,75.5 58,71.5 67,75 76,72.5 85,76 92,73.5 100,77 100,100',
       '0,100 0,77 10,74 19,76.5 27,72.5 36,76 45,73 53,75.5 62,72 70,76.5 79,73.5 88,77 100,74.5 100,100'],
  T2: ['0,100 0,85 9,80.5 17,84 26,79.5 35,83 44,79 52,82.5 61,78.5 70,82 79,79 88,83 100,80 100,100',
       '0,100 0,84 11,80 20,83.5 29,79 38,82.5 47,78.5 55,82 64,79.5 73,83 82,80 91,83.5 100,80.5 100,100'],
  T3: ['0,100 0,92 10,89 19,91.5 28,88.5 37,91 46,88 55,90.5 64,87.5 73,90.5 82,88 91,91 100,89 100,100',
       '0,100 0,91 12,89 21,91 30,88.5 39,90.5 48,88 57,90 66,88.5 75,90.5 84,88.5 93,90.5 100,89.5 100,100'],
};
```

- [ ] **Step 2: The oak, as the front layer's largest silhouette**

Per Fable's review, the oak moved out of the raster and into T3 (front layer, the recommended larger/most-detailed layer since it's closest). Add one wider, taller silhouette bump into a T3 tile at a fixed offset (not part of the random bump generation — a single named landmark shape) with a distinct canopy outline (a few extra small notches breaking its top edge, so it doesn't read as just a bigger triangle than its neighbors):

```javascript
// The oak sits at a fixed point in T3's first tile — a real landmark, not a randomly-generated bump.
// Canopy gets 3 small notch-outs along its top edge so its silhouette isn't just "bigger triangle."
const OAK_SILHOUETTE = '58,100 58,84 60,79 59,75 61,71 60,68 63,65 65,62 68,60 66,57 69,55 72,54 71,51 74,50 77,51 76,54 79,55 82,57 80,60 83,62 85,65 84,68 86,71 85,75 87,79 86,84 86,100';
```

- [ ] **Step 3: Port `buildRidge`/`RIDGE_TIERS` → `buildTreeline`/`TREE_TIERS`**

Same 4-copy `[A,B,A,B]` tiling (tile-seam invariant from `ambient-design-law.md`), same per-layer scroll speed/direction, blur+desaturation increasing on the back layer (T1). Fill colors: dark green family instead of purple (e.g. T1 `#1a3808` haziest/back, T2 `#122806`, T3 `#0a1a02` sharpest/front — following the theme's own `accent:#1a3808` as the mid-anchor point, lighter behind, darker in front, same "lighten a step so each layer reads against its gradient band" lesson from the balloon fill rework).

- [ ] **Step 4: Visual-audit, 190s endurance (crosses the tile-wrap boundary)**

```bash
node concepts/tools/visual-audit.mjs concepts/firefly-summer-meadow.html --duration=190000 --min-hold-gap=8000 --slug=ff-treeline-endurance
```
Expected: zero errors; 3 visually distinct depth bands; oak recognizable as a landmark, not just a bigger bump; no seam pop at the wrap.

- [ ] **Step 5: Craft-iteration checkpoint — Fable design consultant on line quality**

This is the "take extra time" step. Dispatch a fresh-context Fable agent (`model: fable`) with the actual captured frames from Step 4 and the exact `TREE_SHAPE_VARIANTS`/`OAK_SILHOUETTE` point data. Ask it specifically: does this treeline read as a hand-illustrated jagged canopy, or does it read as "computer-generated regular zigzag" (uniform bump spacing/height being the tell)? Does the oak read as a distinct named tree or just a bigger triangle? Iterate the point data based on its answer — this is expected to take more than one pass; that's the point of budgeting a dedicated step for it rather than treating first-draft coordinates as final.

- [ ] **Step 6: Commit**

```bash
git add concepts/firefly-summer-meadow.html
git commit -m "feat: Firefly Summer treeline (3 layers + oak landmark)"
```

---

### Task 3: Lake (reflection + shimmer, no scrolling ripple)

**Files:**
- Modify: `concepts/firefly-summer-meadow.html`

- [ ] **Step 1: Static treeline reflection**

A full-width band below the treeline: a vertically-flipped, low-opacity, slightly-blurred copy of the T3 (front) layer's silhouette shape, dark-toned, completely static — no animation at all on this element. Per Fable's review, this alone is what sells "water" over "more ground," before a single pixel moves:

```css
.lake-reflection {
  position: absolute; left: 0; right: 0; bottom: 0; height: 14%;
  transform: scaleY(-1);
  opacity: 0.35;
  filter: blur(1.5px);
  /* fill: same T3 polygon shape, reused directly, not regenerated */
}
```

- [ ] **Step 2: Shimmer overlay**

Direct reuse of the balloon file's removed `sdWave` effect (a soft horizontal blurred glint, `linear-gradient` streak translating + scaling slightly, `ease-in-out`) — the exact keyframe and element structure that existed in `sonora-balloons-depth.html` before it was deleted there for being an ill-fitting leftover. Here it is the correct fit; port it back verbatim (same 3-instance pattern at different `bottom%`/duration/delay so they don't sync).

- [ ] **Step 3: Reflected firefly flashes (depends on Task 4 — do this step after Task 4 is committed)**

A blurred, vertically-stretched, ~40%-opacity copy of each shoreline firefly's flash element, positioned at the mirrored y-coordinate below the lake's horizon line, keyed off the *same* opacity keyframe/animation timing as its source firefly (not a separate independently-timed animation — it must flash exactly when its source flashes). Implementation: for each firefly within the lake's width range, clone a second small div using the same `--fadeOp`-style custom property and animation name, positioned at `bottom: <mirrored-y>` instead of `top`.

- [ ] **Step 4: Visual-audit**

```bash
node concepts/tools/visual-audit.mjs concepts/firefly-summer-meadow.html --duration=30000 --slug=ff-lake
```
Expected: zero errors; lake band reads as water (reflection + shimmer visible) with no scrolling ripple silhouette anywhere (that idea was cut — verify it's actually absent, not just quiet).

- [ ] **Step 5: Commit**

```bash
git add concepts/firefly-summer-meadow.html
git commit -m "feat: Firefly Summer lake (static reflection + shimmer + firefly reflections)"
```

---

### Task 4: Fireflies (hero + filler, drift + flash + J-stroke)

**Files:**
- Modify: `concepts/firefly-summer-meadow.html`

- [ ] **Step 1: The flash-and-decay keyframe (asymmetric, grounded in real *Photinus pyralis* timing)**

```css
/* Fast rise (~3% of cycle), slower fall (~5%), long dim hold at a non-zero base
   (0.15) rather than full blackout — real fireflies are a faint constant ember
   scatter between flashes, not invisible. NOT a symmetric blink. */
@keyframes ffFlash {
  0%, 88%   { opacity: 0.15; }
  91%       { opacity: 1; }
  96%       { opacity: 0.35; }
  100%      { opacity: 0.15; }
}
```

- [ ] **Step 2: The J-stroke — upward dip coupled to the flash**

*Photinus pyralis*'s signature "big dipper" display: a short upward translate timed to the flash, transform-only (free, per emil-design-eng's GPU rule). Separate keyframe, same element, composed via a second `sd-anim`-style wrapper (same pattern the balloon file used to stack drift/breathe/sway without fighting over one `transform`):

```css
@keyframes ffJStroke {
  0%, 88%  { transform: translateY(0); }
  91%      { transform: translateY(-6%); }
  100%     { transform: translateY(0); }
}
```

- [ ] **Step 3: Drift — direct port of `sdBalloonDrift` + reroll-at-rest + WAAPI playbackRate**

Same rest-to-target-to-rest keyframe shape (not `alternate`), same `animationiteration` handler gated by `e.animationName !== 'ffDrift'` (bubbling guard — this file will have flash/J-stroke as sibling animations on the same wrapper, so the guard is not optional, it's the exact bug class caught twice already this session), same WAAPI `playbackRate` speed-variance approach (never touch `animation-duration` directly — the balloon session's proven position-snap fix).

- [ ] **Step 4: Build the tier split — ~10 hero + ~30 filler**

```javascript
// Duty-cycle math (Fable's review): a ~0.5s-equivalent flash on a ~6s cycle is
// an ~8% duty cycle. 10 total fireflies → <1 lit at any instant, reads as dead.
// ~40 total → 3-4 lit at any instant, a new one igniting roughly twice a
// second — the real-meadow read, per-insect interval unchanged.
const HERO_COUNT = 10, FILLER_COUNT = 30;
```
Hero fireflies: bigger, positioned with a bias toward the jar/tree area but not exclusively there (spec: full distribution, no firefly-free zones — the bias is a soft weighting, not a hard boundary). Filler: small, `sdBalloonFade`-style flat-hold fade-in/out layered as a *third* animation alongside drift+flash+J-stroke on the dimmer/smaller ones — reuse the flat-hold keyframe shape verbatim (fast ramp in, real hold, fast ramp out, real hold at zero).

- [ ] **Step 5: Occlusion — some fireflies behind the porch in z-order**

A subset of the firefly population gets a lower `z-index` than the porch backdrop layer (added in Task 5) — free depth cue per Fable's review. Since Task 5 doesn't exist yet at this point in the plan, stub this as a z-index variable (`FIREFLY_BACK_Z`) now and wire the actual porch layer above it in Task 5 Step 4.

- [ ] **Step 6: Uniform color**

All fireflies: `background: var(--ff-color, #d4a020)` for the base glow, with the brighter flash peak using `shinyAccent:#a0ff40` — no rainbow variety (spec's explicit "uniform, biologically accurate" decision, revisit only if it reads flat once built, per the spec's own honesty about that tradeoff).

- [ ] **Step 7: Visual-audit, dense-sample (catch any position snap early, same lesson from the balloon drift-speed bug)**

```bash
node concepts/tools/visual-audit.mjs concepts/firefly-summer-meadow.html --duration=25000 --step=400 --min-hold-gap=400 --slug=ff-fireflies-dense
```
Expected: zero errors; visibly more than one firefly lit at most sampled instants; no position jumps frame-to-frame (same centroid-tracking check the balloon session used to catch its own reroll bug — worth running the same kind of pixel-centroid Python check here before trusting it by eye).

- [ ] **Step 8: Commit**

```bash
git add concepts/firefly-summer-meadow.html
git commit -m "feat: Firefly Summer fireflies (hero+filler, flash+J-stroke+drift, ~40 total)"
```

---

### Task 5: Anchor — Recraft porch backdrop

**Files:**
- Modify: `concepts/firefly-summer-meadow.html`
- Create: cached asset reference (webp, wherever this project's Recraft cache convention lives — check `concepts/.recraft-cache/` naming pattern before naming the new file)

- [ ] **Step 1: Generate the porch-only backdrop**

Per the revised spec: porch + empty swing chains ONLY (no bench, no jar, no oak). Prompt for a **partial/corner crop**, not an isolated complete scene — this is the one real change from the two candidates already tested this session (which were full isolated scenes). Explicit negatives naming every unwanted element individually (the technique proven to work on this project's planet assets): no photorealism, no complete/isolated framing, no extra scenery/buildings/fence/people/animals/text/watermark/vignette, no oak tree, no bench/seat, no jar.

- [ ] **Step 2: Look at the result before accepting it**

Check specifically: does the roofline/floor/post actually get cut by the frame edge as asked, or did the model still center a complete object? If the latter, this is exactly the prompt-iteration risk the design's iteration-risk-plan section named as real but bounded — re-prompt with a more explicit framing instruction (e.g. "shown as if photographed from just inside the porch, cropped tight") rather than accepting a centered result and trying to crop it after the fact (cropping after generation risks cutting through detail at an arbitrary point instead of a composed one).

- [ ] **Step 3: Composite via mask-blend, not alpha cutout**

Per the tested-and-designed-around bug: do NOT run `remove_background` on this asset (confirmed this session to leave a dark-on-dark blob artifact). Blend the raw webp onto the stage's own background via a CSS gradient mask fading only the top and right edges (left+bottom bleed off-frame, nothing to mask there):

```css
.porch-backdrop {
  position: absolute; left: 0; bottom: 0;
  width: 32%; /* wider than the spec's original 25% anchor-only estimate, since it now bleeds off-frame rather than being a self-contained island */
  mask-image: linear-gradient(to right, black 60%, transparent 100%),
              linear-gradient(to bottom, black 60%, transparent 100%);
  mask-composite: intersect;
  -webkit-mask-composite: source-in;
}
```

- [ ] **Step 4: Wire the porch layer's z-index against Task 4's stubbed `FIREFLY_BACK_Z`**

Set the porch backdrop's `z-index` above the back-tier fireflies and below the front-tier ones, resolving Task 4 Step 5's stub.

- [ ] **Step 5: Visual-audit**

```bash
node concepts/tools/visual-audit.mjs concepts/firefly-summer-meadow.html --duration=15000 --slug=ff-porch
```
Expected: zero errors; porch reads as cropped/bled, not a floating island; mask fade invisible against the dark foliage behind it.

- [ ] **Step 6: Commit**

```bash
git add concepts/firefly-summer-meadow.html
git commit -m "feat: Firefly Summer porch backdrop (Recraft asset, cropped composite)"
```

---

### Task 6: Anchor — hand-coded jar (the real focal element)

**Files:**
- Modify: `concepts/firefly-summer-meadow.html`

This is the second "take extra time" task. The jar is, per Fable's review, the element that actually names the theme — it needs to read as a considered illustration, not a generated rounded-rectangle.

- [ ] **Step 1: Draw the jar as an SVG path, not a CSS rounded-rect**

A CSS `border-radius` rectangle is the exact "straight lines" tell this task exists to avoid. Use a real SVG path with a slightly irregular neck taper and a lid that isn't a perfect rectangle (real mason jars have a subtly domed/ridged lid silhouette, a slight neck-to-body curve asymmetry, and a body that isn't perfectly parallel-sided):

```html
<svg viewBox="0 0 60 90" width="60" height="90">
  <path d="M18,8 Q17,6 20,5 L40,5 Q43,6 42,8 L41,20 Q44,24 44,32 L45,72 Q45,80 38,82 L22,82 Q15,80 15,72 L16,32 Q16,24 19,20 Z"
        fill="none" stroke="#2a1020" stroke-width="1.2" opacity="0.7"/>
  <rect x="17" y="4" width="26" height="7" rx="1.5" fill="#5a4020"/>
</svg>
```

(Adjust these control points by eye against a real mason-jar reference — the goal is a body that tapers very slightly and asymmetrically, not a mirror-symmetric capsule.)

- [ ] **Step 2: Static soft glow layer + 2-3 fireflies inside**

A blurred radial-gradient glow behind/within the jar outline (static intensity, or a very slow multi-minute breathe — not tied to the individual firefly flashes inside it, which have their own faster rhythm). 2-3 firefly divs positioned inside the jar's body bounds, using the *same* `ffFlash` keyframe as the main population but their own slower/offset interval (spec: "independent of the main firefly population").

- [ ] **Step 3: Visual-audit**

```bash
node concepts/tools/visual-audit.mjs concepts/firefly-summer-meadow.html --duration=20000 --slug=ff-jar
```
Expected: zero errors; jar visibly glowing with fireflies flashing against the glass.

- [ ] **Step 4: Craft-iteration checkpoint — Fable design consultant on the jar specifically**

Dispatch a fresh Fable agent with the actual captured frames and the exact SVG path data. Ask directly: does this read as a hand-considered jar illustration, or as a rounded rectangle with a lid glued on (the generic-shape tell)? Iterate the path's control points based on the answer before moving on — do not accept the first-draft path as final without this check, since this is the one shape in the whole file explicitly named as the theme's identity.

- [ ] **Step 5: Commit**

```bash
git add concepts/firefly-summer-meadow.html
git commit -m "feat: Firefly Summer jar (hand-coded, fireflies inside, the theme's real anchor)"
```

---

### Task 7: Anchor — hand-coded swing bench + sway

**Files:**
- Modify: `concepts/firefly-summer-meadow.html`

- [ ] **Step 1: Draw the bench**

Same tier of effort as the balloon basket (a simple, clearly-intentional shape, not over-engineered) — a rounded rect body with 3-4 plank lines is fine here specifically because a porch swing bench genuinely IS a simple geometric object in reality (unlike the jar, which has organic curvature to get right). The craft risk here is different from the jar's: it's in the motion, not the shape.

```html
<div class="swing-bench" style="width:34px;height:10px;border-radius:2px;background:#6b4a26">
  <div style="position:absolute;top:2px;left:2px;right:2px;height:1px;background:#4a3018"></div>
  <div style="position:absolute;top:5px;left:2px;right:2px;height:1px;background:#4a3018"></div>
</div>
```

- [ ] **Step 2: Sway — NOT the balloon's ±2.4°/6.5s values**

Per Fable's review: those values suit a big soft object in wind; on a small empty swing they read as a jitter/metronome. Wider arc, reroll amplitude at each rest boundary (same reroll-at-rest pattern already proven), using emil-design-eng's recommended strong ease-in-out curve for on-screen movement rather than a bare `ease-in-out`:

```css
@keyframes ffSwingSway {
  0%, 100% { transform: rotate(var(--swayMin, -4deg)); }
  50%      { transform: rotate(var(--swayMax, 4deg)); }
}
.swing-bench { animation: ffSwingSway 4.5s cubic-bezier(0.77, 0, 0.175, 1) infinite; }
```
```javascript
// Reroll amplitude at each rest boundary — arcs, nearly settles, gets nudged
// again, instead of a constant-amplitude metronome swing.
swingEl.addEventListener('animationiteration', () => {
  const amp = 2.5 + Math.random() * 3; // 2.5-5.5deg
  swingEl.style.setProperty('--swayMin', `${-amp}deg`);
  swingEl.style.setProperty('--swayMax', `${amp}deg`);
});
```

- [ ] **Step 3: Position at the backdrop image's painted chain endpoints**

This requires eyeballing the actual generated porch image from Task 5 to find the pixel/percentage coordinates where its painted chains end, then placing the bench there with `transform-origin` at the chain attachment point (matching the balloon sway wrapper's pivot pattern).

- [ ] **Step 4: Visual-audit**

```bash
node concepts/tools/visual-audit.mjs concepts/firefly-summer-meadow.html --duration=20000 --slug=ff-swing
```
Expected: zero errors; bench visibly hangs from the chains and sways with a varying (not constant) arc.

- [ ] **Step 5: Commit**

```bash
git add concepts/firefly-summer-meadow.html
git commit -m "feat: Firefly Summer swing bench (hand-coded, amplitude-reroll sway)"
```

---

### Task 8: Full-scene verification + final Fable pass

**Files:**
- No new files; verification only.

- [ ] **Step 1: Static checklist, including reduced-motion coverage**

```bash
grep -n "@keyframes" concepts/firefly-summer-meadow.html
grep -n "will-change\|setInterval\|requestAnimationFrame" concepts/firefly-summer-meadow.html
grep -c "animation:" concepts/firefly-summer-meadow.html
grep -c "sd-anim" concepts/firefly-summer-meadow.html
```
Confirm every animated property across every keyframe is `transform` and/or `opacity` only (the GPU rule). Confirm no stray `setInterval`/`will-change`. Then compare the two counts: every element carrying an inline `animation:` declaration must also carry `class="sd-anim"` (or be a child of a `sd-anim` wrapper) — that class plus the `.rm-force .sd-anim{animation:none!important}` / `@media (prefers-reduced-motion:reduce)` rule copied in Task 0 is the entire reduced-motion mechanism in this file. If the `animation:` count is meaningfully higher than the `sd-anim` count, find and fix the uncovered elements (treeline tiles, lake reflection/shimmer, all three firefly tiers, jar fireflies, swing bench are the ones added across Tasks 1-7 — check each).

- [ ] **Step 2: 190s endurance capture (crosses every layer's tile-wrap boundary)**

```bash
node concepts/tools/visual-audit.mjs concepts/firefly-summer-meadow.html --duration=190000 --min-hold-gap=8000 --slug=ff-full-endurance
```
Expected: zero pageErrors/consoleErrors across the full run.

- [ ] **Step 3: Full-scene Fable design-review pass**

Dispatch a fresh-context Fable agent with the full file, the design spec, and the endurance capture's frames. Ask it to evaluate the finished scene against the spec's own success criteria: does it feel alive (the population/duty-cycle fix), is the color varied (the sky gradient), does the porch read as cropped-not-floating, does the jar read as the real anchor, do the hand-crafted shapes (treeline, jar, swing) hold up under this final full-context look now that everything is assembled together (a shape that looked fine in isolation during its own task-level Fable check can still clash once every other layer is present).

- [ ] **Step 4: Fix anything Fable's full-scene pass surfaces, re-verify, commit**

Same iterate-until-clean loop the balloon session used throughout — do not skip a finding because earlier task-level checks already passed; the whole point of this final pass is catching composition-level issues no single task's isolated check could see.

```bash
git add concepts/firefly-summer-meadow.html
git commit -m "fix: Firefly Summer final Fable pass fixes"
```
(Only if changes were needed; otherwise no commit for this step.)

---

## Explicitly out of scope for this plan

- **Porting into `ParticleBackground.jsx`/`AMBIENT_MAP`.** This plan builds the concept prototype only, matching exactly how Sonora Balloons was built and verified before its own (still-pending) production port. Do not touch `client/src/components/display/ParticleBackground.jsx`, `client/src/themes/index.js`, or `GRADIENT_MOODS` in this plan.
- **The `tint()` hue-rotate fallback for the raster asset.** The spec decided this explicitly (a static `filter: hue-rotate()` derived from the tint delta) but it only matters once this theme is actually wired into `ParticleBackground.jsx`'s `tint()` call — out of scope until the port plan exists.
