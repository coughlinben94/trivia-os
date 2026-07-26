# Diner Stop Parallax Redo (v7) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the space-road-trip concept's floating-diner stop so the arrival reads as real piloted flight, not a camera zoom on a static photo — a small compact rock (only the diner sits on it) starts as a tiny, off-center, distant speck against a fixed background planet, grows via genuine parallax as the ship banks and drifts to line up with it, and settles into a tight parked frame exactly as the bank levels out.

**Architecture:** Single self-contained canvas-2D prototype file, `concepts/space-road-trip-v7.html`, forked from `space-road-trip-v6.html` (itself an unshipped, untracked draft — no prior iteration record depends on it, safe to fork from directly). The core mechanic change is decoupling `GAS_PLANET`'s draw call from the existing camera-transform block so the planet stays fixed in screen space — that fixed/moving contrast between the planet and the rock IS the parallax cue, not a separate system. A lateral drift offset is added to the same camera-transform pivot that already drives the bank/scale, using the same `easeOutCubic`-eased `camP` value, so translation, rotation, and scale all resolve together at the exact same instant (settle = parked = level = centered = full scale).

**Tech Stack:** Vanilla canvas 2D JS, this file's own existing conventions (dtn-normalized easing, `ctx.save()`/`restore()` transform stacking, `node --check` for syntax validation). No unit-test framework exists for this file — verification is `node --check`, this repo's `concepts/tools/spot-check.mjs` screenshot tool (retargeted to v7), and a real-browser live watch, per this iteration's own history of two prior misses that were screenshot-verified but didn't read correctly when actually watched.

**Context this plan assumes (already decided, in the current conversation, do not re-litigate):**
- Full stop at the rock; drone still delivers food afterward — unchanged from v5/v6.
- Approach uses real parallax: rock+diner starts small/distant, grows disproportionately faster than the planet (which stays roughly fixed, receding to "background," not the focus).
- At rest (parked), tight framing on the diner is fine — "small" only needs to read during the approach, not the resting composition.
- Rock starts off-center (lower-left) with the ship visibly banking/drifting to center it by park — confirmed over a dead-center/growing-only alternative (Fable's independent opinion, requested and agreed: dead-center-only-growing is "the zoom-only bug wearing a new hat"; lateral translation is the strongest real-time motion cue, and the bank only earns its keep if it's actually turning toward something).
- The rock itself is small — Ben's exact words: "the rock is small. the only thing on the rock is said diner." The flanking debris-mesa layers (`GAS_MESAS_FAR`/`GAS_MESAS_NEAR`/`drawGasMesa`) are removed outright, not just made smaller.

---

### Task 1: Fork v6 into v7

**Files:**
- Create: `concepts/space-road-trip-v7.html` (copy of `concepts/space-road-trip-v6.html`)

- [ ] **Step 1: Copy the file**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os/concepts
cp space-road-trip-v6.html space-road-trip-v7.html
```

- [ ] **Step 2: Verify it's byte-identical to v6 before any edits**

Run: `diff space-road-trip-v6.html space-road-trip-v7.html`
Expected: no output (files identical)

---

### Task 2: Shrink the rock, delete the flanking debris layers, reposition the ship-park anchor

**Files:**
- Modify: `concepts/space-road-trip-v7.html`

- [ ] **Step 1: Delete `GAS_MESAS_FAR`/`GAS_MESAS_NEAR`/`drawGasMesa` entirely**

Find this block (currently ~28 lines, starting with the "far + near DEBRIS-ROCK layers" comment and ending with `drawGasMesa`'s closing brace):

```js
// far + near DEBRIS-ROCK layers — repurposed 2026-07-22 from "mesas sitting on
// a continuous horizon" into small independent floating rocks scattered in
// the void (the same x/w/h data, just no longer touching a shared ground
// line — each now carries its own y01 so far ones can drift above or below
// MOON_Y independently). This is what actually sells "floating in space, not
// standing on a moon surface": far ones smaller/dimmer for depth, near ones
// bigger/closer to camera, ALL now separate floating bodies rather than
// skyline buttes. Doubles as reinforcing the "debris" motif this stop's
// touchdown effect now uses too, and echoes meteor shower's own rock debris
// earlier in the tour — the same visual language, not a coincidence.
const GAS_MESAS_FAR  = [ {x:0.06,w:0.09,h:0.16,y01:-0.10}, {x:0.20,w:0.06,h:0.10,y01:0.06}, {x:0.70,w:0.07,h:0.12,y01:-0.07}, {x:0.94,w:0.10,h:0.14,y01:0.04} ];
// middle rock was at x:0.34 — a Fable pass (pre-redesign, when this was still
// a mesa on the shared horizon) computed its base spanning x326-422px
// directly behind the parked ship's hull (x355-451px), with the ship's
// rim-light landing at only ~1.20:1 against it there — moved left to clear
// the hull by ~48px. Preserved here even though the ground shape changed,
// since the same ship/hull x-position this was clearing is unchanged.
const GAS_MESAS_NEAR  = [ {x:0.02,w:0.14,h:0.24,y01:0.03}, {x:0.22,w:0.10,h:0.19,y01:-0.05}, {x:0.86,w:0.13,h:0.22,y01:0.02} ];
function drawGasMesa(x01,w01,h01,fill,y01=0){
  // Second rework (2026-07-22, same day — caught by actually looking at the
  // rendered frame via visual-audit.mjs, not just reading the code): the
  // first attempt at "floating rock" here was a symmetric double-trapezoid,
  // same tall proportions as the old mesa-on-a-horizon shape it replaced —
  // rendered, it read as a row of giant purple VASES/PILLARS flanking the
  // scene, not small floating debris. Root cause: keeping the old h01 values
  // (sized for tall foreground mesas) while only changing the path shape
  // wasn't enough; the SIZE and REGULARITY were the actual problem, not just
  // the silhouette's top/bottom taper. Replaced with a genuinely small,
  // irregular jagged blob — same rock-chunk visual language as msDebris in
  // the meteor-shower world earlier in this tour (an intentional callback,
  // not a coincidence), deterministically jittered from x01 so it's stable
  // across replays without needing its own persistent random state.
  const bw=W*w01, bh=H*h01, bx=W*x01, by=MOON_Y+H*y01;
  const seed = x01*97.31;
  const jit = i => 0.7 + 0.55*Math.abs(Math.sin(seed+i*12.9898));
  const baseR = Math.min(bw,bh)*0.30; // deliberately small — debris, not a landmark
  const pts = 7;
  ctx.fillStyle=fill;
  ctx.beginPath();
  for (let i=0;i<pts;i++){
    const ang = (i/pts)*Math.PI*2;
    const r = baseR*jit(i);
    const px = bx + Math.cos(ang)*r, py = by + Math.sin(ang)*r*0.7; // squashed vertically — a rock, not a sphere
    if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
  }
  ctx.closePath(); ctx.fill();
}
```

Replace it with:

```js
// v7 (2026-07-23): the flanking far/near debris-rock layers (formerly
// GAS_MESAS_FAR/NEAR + drawGasMesa) are removed outright — Ben's direct call
// on the full redo, "the rock is small. the only thing on the rock is said
// diner." Nothing else floats near it.
```

- [ ] **Step 2: Delete the two call sites inside `drawGasWorld`**

Find and delete this line (far layer):

```js
  for (const m of GAS_MESAS_FAR) drawGasMesa(m.x, m.w, m.h, 'rgba(100,56,180,0.8)', m.y01);
```

Find and delete this line (near layer):

```js
  for (const m of GAS_MESAS_NEAR) drawGasMesa(m.x, m.w, m.h, '#6a3ab0', m.y01);
```

- [ ] **Step 3: Shrink the rock span**

Find:

```js
const ISLAND_LEFT = W*0.24, ISLAND_RIGHT = W*0.80;
```

Replace with:

```js
// v7: shrunk from a wide 0.24-0.80 span (56% of frame width) to a compact
// single rock — Ben's direct call, "the rock is small." Every downstream
// bezier control point below is a fraction of (ISLAND_RIGHT-ISLAND_LEFT), so
// shrinking the span alone reshapes the whole silhouette proportionally; no
// other change needed in drawFloatingIsland() itself.
const ISLAND_LEFT = SIGN_X - W*0.155, ISLAND_RIGHT = SIGN_X + W*0.155;
```

- [ ] **Step 4: Pull the ship-park anchor onto the smaller rock**

Find:

```js
const SHIP_PARK = { x: SIGN_X - W*0.20, y: MOON_Y - H*0.045 };
```

Replace with:

```js
const SHIP_PARK = { x: SIGN_X - W*0.12, y: MOON_Y - H*0.045 }; // v7: pulled in from -0.20 — that x fell outside the new, smaller rock's left edge (ISLAND_LEFT = SIGN_X-0.155W), so touchdown flare/debris would have appeared to hover past the rock's edge instead of landing on it
```

- [ ] **Step 5: Syntax check**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os/concepts
python3 -c "
import re
html=open('space-road-trip-v7.html').read()
scripts=re.findall(r'<script>(.*?)</script>', html, re.S)
open('/tmp/v7check.js','w').write('\n'.join(scripts))
"
node --check /tmp/v7check.js && echo SYNTAX_OK
```

Expected: `SYNTAX_OK`

---

### Task 3: Decouple the planet from the camera-transform block

**Files:**
- Modify: `concepts/space-road-trip-v7.html`

The planet is what makes the parallax read: it must stay fixed in screen space while the rock scales/translates a lot, so the differential IS the depth cue. Right now the planet's draw calls sit *inside* the same `ctx.save()`/scale/rotate block as the rock — that was correct for v4/v5's design (planet was meant to loom big and unmoving-relative-to-itself while the whole scene pushed toward it together) but wrong for v7, where the planet specifically must NOT share the rock's own camera push.

- [ ] **Step 1: Cut the planet-drawing block out of the camera-transform group**

Find this block (it currently sits right after `ctx.translate(-camFocusX, -camFocusY);`, before the far-mesa loop — the far-mesa loop was already deleted in Task 2, so in the post-Task-2 file this planet block is the first thing after `ctx.translate(-camFocusX, -camFocusY);`):

```js
  // the ringed planet — the scene's new focal point. Ring drawn behind first
  // (reads as passing behind the planet), then the planet body, then a short
  // brighter arc segment of ring in front for a touch of depth without a full
  // 3D occlusion system.
  ctx.save();
  ctx.translate(GAS_PLANET.x, GAS_PLANET.y); ctx.rotate(-0.30);
  ctx.strokeStyle=`rgba(${DINER_TEAL.r},${DINER_TEAL.g},${DINER_TEAL.b},0.30)`; ctx.lineWidth=GAS_PLANET.r*0.09;
  ctx.beginPath(); ctx.ellipse(0,0, GAS_PLANET.r*2.05, GAS_PLANET.r*0.42, 0, 0, 6.2832); ctx.stroke();
  ctx.restore();
  const pg = ctx.createRadialGradient(GAS_PLANET.x-GAS_PLANET.r*0.35,GAS_PLANET.y-GAS_PLANET.r*0.35,GAS_PLANET.r*0.1, GAS_PLANET.x,GAS_PLANET.y,GAS_PLANET.r);
  pg.addColorStop(0,`rgba(${ARC.hi.r},${ARC.hi.g},${ARC.hi.b},0.95)`); pg.addColorStop(0.7,`rgba(${ARC.accent.r},${ARC.accent.g},${ARC.accent.b},0.95)`); pg.addColorStop(1,`rgba(20,8,36,0.95)`);
  ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(GAS_PLANET.x,GAS_PLANET.y,GAS_PLANET.r,0,6.2832); ctx.fill();
  ctx.save();
  ctx.translate(GAS_PLANET.x, GAS_PLANET.y); ctx.rotate(-0.30);
  ctx.strokeStyle=`rgba(${DINER_TEAL.r},${DINER_TEAL.g},${DINER_TEAL.b},0.6)`; ctx.lineWidth=GAS_PLANET.r*0.06;
  ctx.beginPath(); ctx.ellipse(0,0, GAS_PLANET.r*2.05, GAS_PLANET.r*0.42, 0, 3.55, 5.87); ctx.stroke();
  ctx.restore();
```

Remove it from that location entirely (leave `drawFloatingIsland();` as the next line after `ctx.translate(-camFocusX, -camFocusY);`).

- [ ] **Step 2: Re-insert it in screen space, before the camera transform starts**

Find the existing deep-stars loop (stays outside any transform already):

```js
  for (const s of gasDeepStars){ const a=s.hi*(reduced?0.7:(0.5+0.5*Math.sin(now/(s.dur/6.28)+s.phase))); ctx.fillStyle=`rgba(255,255,255,${a})`; ctx.beginPath(); ctx.arc(s.x,s.y,s.size,0,6.2832); ctx.fill(); }
  ctx.globalCompositeOperation='source-over';
```

Insert the planet block immediately after it (before the big camera-transform comment block / `const camP = ...` line):

```js
  // v7: the planet moved OUT of the camera-transform group and now draws
  // here, in plain screen space, fixed for the whole stop. This fixed-vs-
  // moving contrast against the rock (which DOES scale/translate a lot below)
  // is the actual parallax cue — a near object growing much faster than a
  // static-looking far one, not a uniform zoom on everything at once.
  ctx.save();
  ctx.translate(GAS_PLANET.x, GAS_PLANET.y); ctx.rotate(-0.30);
  ctx.strokeStyle=`rgba(${DINER_TEAL.r},${DINER_TEAL.g},${DINER_TEAL.b},0.30)`; ctx.lineWidth=GAS_PLANET.r*0.09;
  ctx.beginPath(); ctx.ellipse(0,0, GAS_PLANET.r*2.05, GAS_PLANET.r*0.42, 0, 0, 6.2832); ctx.stroke();
  ctx.restore();
  const pg = ctx.createRadialGradient(GAS_PLANET.x-GAS_PLANET.r*0.35,GAS_PLANET.y-GAS_PLANET.r*0.35,GAS_PLANET.r*0.1, GAS_PLANET.x,GAS_PLANET.y,GAS_PLANET.r);
  pg.addColorStop(0,`rgba(${ARC.hi.r},${ARC.hi.g},${ARC.hi.b},0.95)`); pg.addColorStop(0.7,`rgba(${ARC.accent.r},${ARC.accent.g},${ARC.accent.b},0.95)`); pg.addColorStop(1,`rgba(20,8,36,0.95)`);
  ctx.fillStyle=pg; ctx.beginPath(); ctx.arc(GAS_PLANET.x,GAS_PLANET.y,GAS_PLANET.r,0,6.2832); ctx.fill();
  ctx.save();
  ctx.translate(GAS_PLANET.x, GAS_PLANET.y); ctx.rotate(-0.30);
  ctx.strokeStyle=`rgba(${DINER_TEAL.r},${DINER_TEAL.g},${DINER_TEAL.b},0.6)`; ctx.lineWidth=GAS_PLANET.r*0.06;
  ctx.beginPath(); ctx.ellipse(0,0, GAS_PLANET.r*2.05, GAS_PLANET.r*0.42, 0, 3.55, 5.87); ctx.stroke();
  ctx.restore();
```

- [ ] **Step 3: Fix the now-stale explanatory comment above the camera transform**

Find:

```js
  // Camera-POV rework, 2026-07-22 (see updateGasArrival's header comment for
  // the full account): everything from here through the drone — the planet,
  // both mesa layers, the island, the building/sign, and the drone — is
  // wrapped in a camera push toward the diner, replacing the old ship
  // sprite's flight. Fixed 2026-07-22 (iteration 5 audit, one-attempt rule):
  // this transform was originally placed AFTER the planet/mesas/island were
  // already drawn (only building/sign/drone were ever actually wrapped),
  // contradicting this very comment's own claim. Invisible in v4's mild
  // 0.88->1 push, but iteration 5's 0.7-scale departure punch made it obvious
  // by eye — the diner building visibly shrank away while its own island and
  // the planet stayed pinned at full size, reading as broken, not as a camera
  // pulling back. Moved the whole camera setup + ctx.save() up to here, before
  // the planet, so the punch (and the arrival push, and the bank) actually
  // move the whole scene together. The background fill + deep stars above
  // stay at identity — a fixed distant backdrop the camera pushes past, not
  // through, which also avoids any edge gaps from scaling a full-canvas fill.
```

Replace with:

```js
  // v7 (2026-07-23), full redo per Ben's live feedback on v6 — "we arent
  // seeing the ship fly up to the diner" plus "the rock is small... we just
  // drive by picking up the food" (full stop + drone delivery confirmed
  // unchanged in the follow-up). The planet is deliberately EXCLUDED from
  // this camera-push group now (see the planet block moved above, right
  // after the deep-stars loop) — it stays fixed in screen space on purpose,
  // so its non-motion against the rock's own scale/translate is the parallax
  // depth cue. Only the rock (drawFloatingIsland), the building/sign, and the
  // drone are wrapped here. The background fill + deep stars stay at
  // identity too, same as before.
```

- [ ] **Step 4: Syntax check**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os/concepts
python3 -c "
import re
html=open('space-road-trip-v7.html').read()
scripts=re.findall(r'<script>(.*?)</script>', html, re.S)
open('/tmp/v7check.js','w').write('\n'.join(scripts))
"
node --check /tmp/v7check.js && echo SYNTAX_OK
```

Expected: `SYNTAX_OK`

---

### Task 4: Off-center start + lateral drift tied to the bank, wider arrival scale

**Files:**
- Modify: `concepts/space-road-trip-v7.html`

- [ ] **Step 1: Widen the arrival scale range and add the drift offset**

Find:

```js
  const bankAngle = GAS_BANK_MAX * (1 - camP);
  const arrivalScale = lerp(0.62, 1, camP); // v6: widened from 0.88 — v5's 12% swing didn't read as a swoop-in when watched live
```

Replace with:

```js
  const bankAngle = GAS_BANK_MAX * (1 - camP);
  const arrivalScale = lerp(0.14, 1, camP); // v7: starts as a genuinely tiny distant speck (was 0.62 in v6) — a 38%-smaller version of the same shot still didn't read as "distant" per Ben's live feedback
  // v7: lateral drift, riding the same easeOutCubic curve as bankAngle/
  // arrivalScale (camP itself already carries that curve) — the rock starts
  // shifted lower-left and drifts to dead-center exactly as the bank levels
  // out and the scale reaches 1, so "turning to line up" and "arriving" read
  // as the same single motion, not two things that happen to end together.
  // Per Fable's explicit recommendation: a target that only grows at a fixed
  // frame position is indistinguishable from a scale animation; lateral
  // translation is the strongest real-time motion cue available here, and
  // it's what gives the existing bank angle an actual reason to exist.
  const GAS_START_DRIFT_X = W*0.24, GAS_START_DRIFT_Y = H*0.14;
  const driftX = GAS_START_DRIFT_X * (1 - camP);
  const driftY = GAS_START_DRIFT_Y * (1 - camP);
```

- [ ] **Step 2: Apply the drift in the camera-transform pivot**

Find:

```js
  ctx.save();
  ctx.translate(camFocusX, camFocusY);
  ctx.rotate(bankAngle);
  ctx.scale(camScale, camScale);
  ctx.translate(-camFocusX, -camFocusY);
```

Replace with:

```js
  ctx.save();
  // v7: the first translate uses focus+drift, the closing translate uses the
  // TRUE (undrifted) focus — the asymmetry is deliberate. Rotate/scale still
  // pivot around the real focus point (camFocusX/Y), so the bank/zoom still
  // reads as centered on the diner; the mismatch between the two translates
  // is what adds a net screen-space shift on top of that, shrinking to zero
  // by the time camP reaches 1 (driftX/Y both 0), so the parked composition
  // is byte-for-byte the same as it was before this drift was added.
  ctx.translate(camFocusX - driftX, camFocusY + driftY);
  ctx.rotate(bankAngle);
  ctx.scale(camScale, camScale);
  ctx.translate(-camFocusX, -camFocusY);
```

- [ ] **Step 3: Syntax check**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os/concepts
python3 -c "
import re
html=open('space-road-trip-v7.html').read()
scripts=re.findall(r'<script>(.*?)</script>', html, re.S)
open('/tmp/v7check.js','w').write('\n'.join(scripts))
"
node --check /tmp/v7check.js && echo SYNTAX_OK
```

Expected: `SYNTAX_OK`

---

### Task 5: Tone down the v6 approach-rush layer (now a secondary cue, not the primary one)

**Files:**
- Modify: `concepts/space-road-trip-v7.html`

v6 added a debris-rush layer (`gasRushDebris`/`drawGasRush`) and a matching camera shake (`gasRushShake` in `tick()`) to compensate for the old zoom-only approach not reading as motion. Now that real parallax + lateral drift carry that job, the rush layer should stay as textural reinforcement but not fight for attention — reduce its amplitude rather than deleting it (it's still a real, cheap "engine strain" cue).

- [ ] **Step 1: Reduce the rush debris density factor**

Find:

```js
function drawGasRush(now, dtn, intensity){
  if (reduced || intensity<=0.01) return; // reduced-motion contract: no new motion added by this pass
  ctx.globalCompositeOperation='lighter';
  const base = 0.05*intensity;
```

Replace with:

```js
function drawGasRush(now, dtn, intensity){
  if (reduced || intensity<=0.01) return; // reduced-motion contract: no new motion added by this pass
  ctx.globalCompositeOperation='lighter';
  const base = 0.035*intensity; // v7: reduced from 0.05 — real parallax+drift now carry the primary "we're moving" read, this is texture, not the main cue
```

- [ ] **Step 2: Reduce the rush shake amplitude**

Find:

```js
  const gasRushIntensity = gasApproachIntensity(geShip - SHIP_HOLD_BEFORE);
  const gasRushShake = (!reduced && gasRushIntensity>0.001) ? msRumbleNoise(now, gasRushIntensity*3.6) : {x:0,y:0};
```

Replace with:

```js
  const gasRushIntensity = gasApproachIntensity(geShip - SHIP_HOLD_BEFORE);
  const gasRushShake = (!reduced && gasRushIntensity>0.001) ? msRumbleNoise(now, gasRushIntensity*2.2) : {x:0,y:0}; // v7: reduced from 3.6 — secondary texture now, not the primary motion cue
```

- [ ] **Step 3: Syntax check**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os/concepts
python3 -c "
import re
html=open('space-road-trip-v7.html').read()
scripts=re.findall(r'<script>(.*?)</script>', html, re.S)
open('/tmp/v7check.js','w').write('\n'.join(scripts))
"
node --check /tmp/v7check.js && echo SYNTAX_OK
```

Expected: `SYNTAX_OK`

---

### Task 6: Visual verification (screenshot pass + live watch — the real gate for this iteration)

**Files:**
- Modify: `concepts/tools/spot-check.mjs` (retarget `FILE` constant to v7)

- [ ] **Step 1: Retarget the spot-check script**

Find the `FILE` constant near the top of `concepts/tools/spot-check.mjs` (currently pointed at v5 per the prior handoff — confirm what it's actually pointed at first, since it may already have been bumped):

```bash
grep -n "^const FILE" /Users/bencoughlin/Projects/baynes-trivia/trivia-os/concepts/tools/spot-check.mjs
```

Update it to `space-road-trip-v7.html`.

- [ ] **Step 2: Run it across the approach sub-beats**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os/concepts
node tools/spot-check.mjs
```

Confirm from the output frames: the rock starts as a small, off-center, dim shape; the planet's own size/position looks the same across early/mid/late approach frames (fixed, not scaling with the rock); the rock is visibly larger and centered by the parked frame; no ship sprite is ever visible; the diner is the only structure on the rock (no flanking debris).

- [ ] **Step 3: Live watch — do not skip this, it's the entire point of this iteration**

Serve the file locally and open it in a real browser tab (not a screenshot tool) so it can actually be watched playing in real time:

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os/concepts
python3 -m http.server 8934 --bind 127.0.0.1 &
```

Open `http://127.0.0.1:8934/space-road-trip-v7.html`. Watch the diner stop specifically. Confirm with Ben, live, whether it now reads as "we flew up to a small rock, turned to line up with it, and parked" — do not mark this task done from screenshots alone; the last two iterations were both screenshot-verified and still didn't land when actually watched.

---

### Task 7: Ship (only after Ben confirms it reads correctly live — do not ship on screenshot verification alone)

**Files:**
- Modify: `concepts/QUEUE.md` (space-road-trip entry — iteration 7, revision notes)
- Modify: `concepts/manifest.js` (space-road-trip entry — new v7 entry)
- Modify: `concepts/NIGHTLY-LOG.md` (new run entry)

- [ ] **Step 1: Baseline check before shipping**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
concepts/tools/git-baseline.sh check "20260723T003918Z-37969-31588"
```

If it flags drift outside `concepts/`, independently confirm it's unrelated (same as this session already did once for `FACT-HUNT-PROGRESS.md`/`.claude/settings.local.json`) before proceeding.

- [ ] **Step 2: Update QUEUE.md, manifest.js, NIGHTLY-LOG.md**

Follow `.claude/commands/ship.md` exactly — iteration 7, `file: space-road-trip-v7.html`, `supersedes: space-road-trip-v6.html`, revision notes capturing this whole brainstorming thread (full-stop+drone unchanged, parallax approach, rock shrunk to diner-only, off-center drift tied to bank, Fable's independent opinion and its reasoning). Validate manifest via:

```bash
node concepts/tools/validate-manifest.mjs
```

- [ ] **Step 3: Ship**

```bash
cd /Users/bencoughlin/Projects/baynes-trivia/trivia-os
concepts/tools/guarded-commit-push.sh "20260723T003918Z-37969-31588" "nightly: built space-road-trip v7 (diner-stop parallax redo)" concepts/space-road-trip-v7.html concepts/QUEUE.md concepts/manifest.js concepts/NIGHTLY-LOG.md
```

- [ ] **Step 4: Release the lock**

```bash
concepts/tools/lock-release.sh "20260723T003918Z-37969-31588"
```
