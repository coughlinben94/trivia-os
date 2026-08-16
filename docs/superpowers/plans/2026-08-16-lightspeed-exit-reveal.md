# Lightspeed Exit → Ring World Reveal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After the team-intro ("lightspeed") sequence decelerates to a full stop and goes black, the black canvas itself slides/wipes upward off-screen, revealing the ring-world ambient background that has been running underneath the whole time (already sitting on station 0, its default mount station — no station jump needed). Once revealed, "Round 1" appears as its own popup moment instead of the quiet always-there corner label it is today.

**Architecture:** Pure presentation change inside `TeamPickerSlide.jsx`. No changes to `Display.jsx`'s ambient-mount architecture, no ref-forwarding into `RingAmbient` needed — station 0 is already what's showing by the time this slide's canvas would reveal it, confirmed by Ben (simplified from an earlier "jump to S1" idea specifically to avoid needing that plumbing).

**Tech Stack:** React + Framer Motion for the reveal transition (the canvas itself stays a plain `<canvas>`, wrapped in a `motion.div` for the slide-away).

**Confirmed with Ben (live, this session) — the exact sequence, in order, not up for re-interpretation:**
1. Teams announced one at a time (unchanged, already correct per an earlier audit today).
2. Closing text ("Now, let's do this shit" or `data.closingText`) appears — **while still at speed**, not after decelerating. (Confirm this is really the current order by reading the code fresh — the `outro` phase precedes `landed` in the `seq` array, and `warpTarget` only drops to 0 once the target is `'landed'`, so speed should still be near-full when the outro text is showing. Verify this holds, don't just trust the plan's restatement of it.)
3. *After* the closing text has been showing for its normal hold, deceleration begins (already built — `warpTarget = 0` once `kind === 'landed'`, eased at `0.045` per frame).
4. Fully stopped, screen fully black (already the resting state today — this is where the app currently just sits forever showing a quiet "Round 1" label).
5. **NEW:** once fully stopped (not while still decelerating), the black canvas slides/wipes upward off-screen, revealing the ring-world ambient already running behind it, already on station 0.
6. **NEW:** once revealed, "Round 1" appears as its own distinct popup/announcement beat — not the quiet corner label that exists today (that label is being replaced by this popup, not kept alongside it).

**Explicitly NOT part of this plan (ruled out by Ben directly):**
- No station jump/`jumpTo()` call — station 0 is already correct, that's what's already showing.
- No "pan" of the ring-world camera itself — the *black layer* is what moves, the world underneath stays exactly as it already is.
- GPU/CPU cost of the ring-world running continuously through the whole lightspeed sequence — raised as a question, Ben said not to worry about it for this plan.

---

### Task 1: Detect "fully stopped" and trigger the reveal

**Files:**
- Modify: `client/src/components/display/slides/TeamPickerSlide.jsx`

- [ ] **Step 1: Read the current landed/decel logic fresh**

Read the full file, especially the `draw` closure inside the main `useEffect` (canvas rAF loop) — specifically the `warpTarget`/`warp` easing (`warp += (warpTarget - warp) * 0.045 * dtn`), the `phase` state machine (`'approach' | 'hold' | 'exit' | 'done'`), and where `setLanded(true)` fires. Confirm your understanding of exactly when `phase` becomes `'done'` and `landed` (React state) becomes `true` relative to `warp` actually reaching ~0 — `warp` and `phase`/`landed` are not the same thing today; `landed`/`done` fires as soon as the exit animation on the outro text completes, which is BEFORE warp has fully decayed to a stop (warp is still easing down asymptotically at that point, over roughly ~1.5-2s at the current 0.045/frame rate). The reveal must wait for warp to actually be near-zero (visually stopped), not just for `landed === true`.

- [ ] **Step 2: Add a "settled" signal**

Add a way for the component to know when `warp` has actually decayed to near-zero after `landed` becomes true — either (a) a `useEffect` on `landed` that starts a fixed-duration timer calibrated to the known decay rate (compute roughly how many frames/ms it takes `0.045`-per-frame easing to go from ~1 to under, say, `0.01` — solve `(1-0.045)^n < 0.01` for `n` frames at ~16.7ms/frame, and use that as the timer duration with a little margin), or (b) expose the live `warp` value from the closure into a ref the outer component can poll/read on an interval once `landed` is true, and flip a `settled` state once it crosses a small threshold. Prefer (a) if the math is straightforward and the timer duration reads as an intentional, named constant (not a magic number) — simpler, no extra polling. Use (b) only if (a) proves inaccurate when you actually render and check (i.e., the timer fires visibly before or after the star streaks have actually stopped).

- [ ] **Step 3: Verify by rendering**

Render this slide (jump straight to a `'landed'`-adjacent `currentPart`, or step through a real sequence) and confirm visually + by frozen-frame inspection that your "settled" signal fires at the moment the star field has actually stopped moving, not before (streaks still visible) or long after (dead air staring at a static black screen).

---

### Task 2: The reveal itself — canvas slides up, "Round 1" becomes a popup

**Files:**
- Modify: `client/src/components/display/slides/TeamPickerSlide.jsx`

- [ ] **Step 1: Wrap the canvas for the slide-away transition**

Wrap the existing `<canvas>` element in a `motion.div` (or animate the canvas directly if a wrapper isn't needed — check whether the canvas's own sizing/ref logic tolerates being inside an animated wrapper without breaking the `canvas.width`/`canvas.height` setup in the effect). On the "settled" signal from Task 1, animate this wrapper's `transform: translateY(...)` from `0` to `-100%` (or fully off the top of the frame) with opacity fading out over the same motion — matching this app's established "percentages are relative to the element's own size" convention (`translateY(-100%)` moves it by its own height regardless of actual pixel dimensions, the same technique already documented in this repo's animation conventions). Use a deliberate, not-too-fast duration — this is a big reveal moment, should read as significant (in the 600-1000ms range as a starting point, adjust after actually watching it render — don't leave it at a generic 200-300ms UI-transition speed, this isn't a dropdown).

- [ ] **Step 2: Stop painting once revealed (don't waste cycles on a hidden canvas)**

Once the reveal transition completes, the rAF loop should stop actively drawing (it's currently `raf = requestAnimationFrame(draw)` called unconditionally forever) — either cancel the rAF loop entirely once fully revealed+settled (simplest, and this component's whole point is now finished, it never needs to draw again for the rest of the show), or leave it running if there's a reason found during implementation that it needs to keep going (e.g. if the parent never unmounts this slide and something depends on the canvas staying "alive" — check for that before assuming it's safe to just cancel the loop; if genuinely unsure, leave the loop running and flag it as a minor cleanup opportunity rather than risk breaking something by cancelling it incorrectly).

- [ ] **Step 3: Replace the quiet "Round 1" label with a real popup**

The current `landed ? <div>...Round 1...</div>` (quiet, opacity 0.35, bottom-corner label) should stop rendering in its current form. In its place, once the reveal has happened, show "Round 1" as an actual announcement-style popup/card — look at how this app already does "announcement" moments for a consistent visual language to reuse rather than inventing a new one: `ShinyIntroScreen.jsx` (just built/updated today — a title card with glow, tilt, motion) and `RoundIntroSlide.jsx` (a real, existing "round starts now" slide type in this same `slides/` directory — check what it renders, since "Round 1" starting is conceptually exactly what `RoundIntroSlide` is FOR, and there's a real possibility the right move here is not to build a new custom popup at all, but to have this reveal hand off directly into an existing `RoundIntroSlide`-style moment instead of reinventing one inside `TeamPickerSlide` itself). Read `RoundIntroSlide.jsx` before deciding which path to take, and explain your choice in the report — don't silently invent a third visual language for "a round is starting" when this app may already have one.

- [ ] **Step 4: Reduced motion**

The slide-away transition should still happen under `prefers-reduced-motion` (it's a state change conveying real information — the show is moving on — not decorative motion), but should be a simple opacity crossfade instead of the translateY wipe, consistent with this app's existing reduced-motion pattern elsewhere in this same file (`c.reduce` branches already exist throughout).

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 6: Render and watch the full sequence**

This is a motion/sequencing task — actually render a full run (teams → outro text → decelerate → stop → reveal → Round 1 beat) and confirm the order and feel match Ben's described sequence exactly. Don't mark done from code inspection alone.

---

### Task 3: Final review

- [ ] **Step 1:** `npm run build` clean.
- [ ] **Step 2:** Commit (don't push) — leave for Ben's sign-off, same as every other motion/display change today.
- [ ] **Step 3:** Report back: confirm the settled-detection timing felt right, confirm what was decided for the "Round 1" moment (new popup vs. handoff to `RoundIntroSlide`) and why, confirm the canvas rAF loop's fate (stopped vs. left running, and why), and give screenshots or a clear description of what was rendered and watched.

## Explicitly out of scope

- GPU/CPU performance measurement of the ring-world system over a full multi-hour show — Ben said not to worry about it for this plan, but it remains a real open question raised earlier today, worth its own investigation eventually.
- Any change to `RingAmbient.jsx`/`ParticleBackground.jsx`/`Display.jsx` — this plan touches `TeamPickerSlide.jsx` only.
