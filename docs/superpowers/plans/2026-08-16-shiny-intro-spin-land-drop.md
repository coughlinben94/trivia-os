# Shiny Intro — Spin/Land/Drop Motion + Random Host Photo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `ShinyIntroScreen.jsx`'s current entrance (a single spring pop-in) with a spin-and-land choreography confirmed live with Ben via an animated artifact prototype, and swap the intro's fixed `hostPhotoUrl` for a fresh random pick from the show's own host-photos folder every time the card mounts.

**Architecture:** Pure animation/data-source change inside `ShinyIntroScreen.jsx` — no new files, no schema change. The random-photo piece reuses the existing `getHostPhotos()` listing already used by the host's own photo picker (`useShow.js`), called from the display side instead of read from a fixed `data.hostPhotoUrl` field.

**Tech Stack:** React + Framer Motion (already the file's animation library — do not introduce raw WAAPI or a new animation dependency; the prototype used WAAPI only because Artifacts can't import framer-motion, translate the same choreography to `motion.*`/`animate()` calls consistent with the rest of this codebase).

**Confirmed with Ben (live, this session), not up for re-litigation:**
- Layout stays what's live today ("Sunrise" — tilted gold title, host photo lower-left, format icon badge lower-right, warm radial glow, ambient background showing through) — only the *entrance motion* and *photo source* change, not the composition.
- Motion: title starts tiny at center, spins through **one tame, controlled turn (~1 rotation, not a dizzy multi-spin)** while scaling up, lands with a **real spring overshoot ("boing" — two oscillations past/back from full size)**, not a soft single settle. A gold burst ring + radiating sparks fire at the landing instant. Format icon pops in right after landing (its own overshoot). Ben's photo rockets up from below the frame **after** the title lands (sequenced, not simultaneous), with its own overshoot/wobble.
- **Final rest tilt is exactly -6deg** — matches this file's own existing `rotate(-6deg)` convention (see current code, the `animate={{ ..., rotate: -6 }}` on the title). Do not let the spin's final rotation land on an arbitrary multiple-of-360-plus-remainder angle — explicitly target -6deg (i.e. pick spin totals that are `360*n - 6`).
- Total sequence duration is **slow and deliberate**, not snappy — Ben pushed back TWICE toward slower after seeing faster passes ("needs to be slower", then "make the spinning animation 1.5x as long" on the already-slowed version). Reference feel: the prototype's `LAND_T = 1725`ms to impact (this is the final, twice-corrected value — read it directly from the file, don't use an earlier number from memory), ~2.4-2.6s to fully settle including the photo drop. Don't compress this back down for the sake of feeling "responsive" — this is a rare, celebratory, occasional-per-show moment (the emil-design-eng skill's own framework puts this in the "can add delight / longer duration OK" bucket, not the sub-300ms UI-interaction bucket), and the direction of every one of Ben's corrections has been slower/bigger, not faster — if anything, err slightly longer rather than risk undershooting again.
- Reference prototype (what Ben approved, build TO this, not past it): the artifact at the path noted below in "Reference" — read its `<script>` block's WAAPI keyframes directly for the actual timing/easing/offset values before writing the Framer Motion equivalent. Don't reinvent the choreography from the plain-English description alone.

**Explicit assumption, not yet confirmed — flag don't silently build around it:** the random photo picks a **fresh** photo every time the intro card mounts (not the same photo held for the whole question). Ben was asked this directly and never answered before saying "get going" — proceed on this assumption since it fits the "laugh folder" spirit, but call it out again in your final report so it's easy to correct if wrong.

**Reference:** `/private/tmp/claude-501/-Users-bencoughlin/4ef19b35-1570-46be-b4b7-055e1bf491b4/scratchpad/shiny-spin-land-drop.html` — the actual approved animated prototype (Ben watched this exact file, twice, with corrections applied both times). This file will not exist in your worktree; it's outside the repo. Read it via its absolute path if your environment can reach it; if not, ask the controller (don't guess the choreography).

---

### Task 1: Translate the approved motion into ShinyIntroScreen.jsx

**Files:**
- Modify: `client/src/components/display/ShinyIntroScreen.jsx` (full file, 104 lines as of this plan — read it fresh, it may have shifted)

- [ ] **Step 1: Read both the current component and the approved prototype**

Read `client/src/components/display/ShinyIntroScreen.jsx` in full. Read the prototype HTML at the path above in full — specifically its `<script>` tag's WAAPI `.animate()` calls for `title`, `card` (note: the prototype's "card" frame doesn't exist as a separate element in the real component today — the real component has no card background box, just the title/photo/icon directly on the ambient background; decide whether Ben's "lands into the media card" note implies adding a card-frame element behind the title now, or whether that's Phase 2 territory once the up-pan/media-card system exists — if genuinely ambiguous, implement the title/icon/photo choreography now and flag the card-frame question in your report rather than guessing either way), `glow`, `burst`, `sparks`, `iconBadge`, and `ben` for their exact keyframe offsets, durations, and easing.

- [ ] **Step 2: Rebuild the title entrance as Framer Motion**

Replace the current title `motion.p`'s `initial`/`animate`/`transition` (currently a single spring: `{ initial: { opacity: 0, scale: reduce ? 1 : 0.85, rotate: reduce ? -6 : -14 }, animate: { opacity: 1, scale: 1, rotate: -6 }, transition: reduce ? {...} : { type: 'spring', duration: 0.5, bounce: 0.25 } }`) with a multi-keyframe animation matching the prototype's spin-scale-overshoot sequence. Framer Motion supports arrays for keyframe values (e.g. `animate={{ scale: [0.05, 0.42, 0.85, 1.22, 0.90, 1.08, 1], rotate: [0, 196, 336, 366, 350, 358, -6], opacity: [0, 1, 1, 1, 1, 1, 1] }}` with a matching `times` array for offsets and `transition={{ duration: <slow, per Ben>, times: [...], ease: 'linear' }}` since the prototype uses `linear` easing across explicit keyframes, not a single eased curve — the "ease" is baked into the keyframe spacing itself, same technique as the prototype). Reduced-motion path stays a simple fade, same as today (don't add spin/scale motion under `prefers-reduced-motion`).

- [ ] **Step 3: Add the landing burst + sparks**

Port the prototype's radial spark burst (the `.burst` ring + N `.spark` particles, WAAPI-driven, radiating outward at the landing instant) into a new small piece of this component. This can be plain CSS `@keyframes` + a handful of absolutely-positioned `<span>`/`<div>` elements (no need for a whole new library) — trigger them via a `useEffect` keyed on `[slide.id]` that mirrors the flash-reset pattern this file doesn't currently have but `QuestionSlide.jsx`'s shiny components already use elsewhere (`useEffect(() => { ...reset/retrigger... }, [slide.id, data.currentPart])` is the established pattern in this codebase for "replay this beat when we land on a new part/slide" — check `QuestionSlide.jsx` lines near its `flashVisible` effect for the exact idiom and match it, since this file will eventually need the same "replay on currentPart change" behavior once Phase 2 wires it into a multi-part sequence, even though today it only ever shows once per slide). Respect `prefers-reduced-motion` — skip the burst/sparks entirely when reduced motion is on (they're pure decoration, not comprehension-critical, matching this skill's own reduced-motion guidance).

- [ ] **Step 4: Sequence the icon badge and photo to land AFTER the title**

The icon badge and host photo already exist in this file (icon badge `motion.div`, photo `motion.img`) — change their `transition.delay` values so they fire after the title's landing instant (match the prototype's relative timing: icon starts around the title's landing offset, photo starts slightly after the icon, both with their own overshoot). Framer Motion supports overshoot via `type: 'spring', bounce: <higher value>` — use a higher `bounce` (e.g. 0.5-0.6) for these two elements than the current 0.25, or use explicit multi-keyframe arrays like the title if you need the exact two-oscillation "boing" the prototype has (match by rendering and comparing, not by guessing which approach looks closer).

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 6: Render and compare against the prototype**

This is a motion-quality task — render it (Playwright, frozen-frame sampling at several timestamps the same way this repo's ring-world work verified motion earlier today, or just watch it render headed if that's faster for judging feel) and compare against the approved prototype's timing/feel. Don't mark this done on "the code looks like it should produce the right animation" — actually watch it play and confirm: tame spin angle, real spring-boing landing (not a soft settle), burst/sparks visible, icon-then-photo sequencing after landing, slow overall pace, final tilt exactly -6deg (measure it, don't eyeball it — read the computed `transform` at rest).

---

### Task 2: Random host photo instead of fixed hostPhotoUrl

**Files:**
- Modify: `client/src/components/display/ShinyIntroScreen.jsx`
- Read (don't modify unless necessary): `client/src/hooks/useShow.js` (`getHostPhotos`, ~line 508) for the exact existing listing logic/shape to reuse
- Check: `client/src/components/display/slides/QuestionSlide.jsx` and `client/src/components/display/slides/GridSlide.jsx` (both render `<ShinyIntroScreen>`) — confirm what props they currently pass, to know whether `show`/`show.id` is already reachable at the call site or needs threading through

- [ ] **Step 1: Determine the fetch path**

`getHostPhotos()` in `useShow.js` is a hook-internal async function tied to the live `show` state object, called today only from host-side editors (`SlideEditor.jsx`, `SlideCanvasEditor.jsx`) where the full `useShow()` hook is already in scope. `ShinyIntroScreen.jsx` today only receives `{ slide, theme }` — it does NOT have hook access. Two real options, pick whichever fits this codebase's existing patterns best after reading how `QuestionSlide.jsx`/`GridSlide.jsx` currently get their own `show` prop (they already receive `show` per earlier grep in this session — `<ShinyVisualQuestion slide={slide} theme={theme} show={show} />` pattern exists in `QuestionSlide.jsx`):
  - (a) Thread `show` down to `ShinyIntroScreen` the same way, and call Supabase storage `.list()` directly inside `ShinyIntroScreen` using `show.id` (same bucket/path convention as `getHostPhotos()`'s own implementation — `HOST_PHOTOS_BUCKET = 'trivia-host-photos'`, path `${show.id}/host-photos`), OR
  - (b) Export a small standalone helper (not tied to the `useShow` hook's closures) that both `useShow.js`'s `getHostPhotos()` and `ShinyIntroScreen.jsx` can call, to avoid duplicating the bucket-listing logic in two places.

  Prefer (b) if it's a clean extraction (a few lines, no behavior change to the existing host-editor call sites) — this repo's own conventions favor shared helpers over duplicated Supabase-storage logic (see how `shinySeries.js` already centralizes shared shiny-data logic for exactly this reason). If extracting cleanly turns out to be awkward (e.g. `getHostPhotos` is entangled with other `useShow` closure state), fall back to (a) and note why in your report rather than forcing an extraction that adds risk.

- [ ] **Step 2: Pick one at random on mount, not on every re-render**

Fetch the photo list once when the intro screen mounts for a given `slide.id` (not on every React re-render — this component may re-render for reasons unrelated to a new question), pick one index at random, and hold it in `useState`. If the show has zero uploaded host photos, fall back to the existing `data.hostPhotoUrl` behavior (today's fixed-field path) so a show with no photos folder yet doesn't lose the photo entirely — don't make this a hard requirement that breaks the card when the folder's empty.

- [ ] **Step 3: Verify build**

Run: `npm run build`
Expected: exits 0.

- [ ] **Step 4: Manual verification**

Confirm against a real show with multiple host photos uploaded (check Supabase directly if needed — `HOST_PHOTOS_BUCKET`/show id — or ask the controller for a show id with photos already uploaded) that reloading/re-mounting the intro screen picks a different photo across multiple mounts, not the same one every time.

---

### Task 3: Final review

- [ ] **Step 1:** `npm run build` clean, no console errors on a real render.
- [ ] **Step 2:** Commit (don't push) — leave for Ben's aesthetic sign-off, same as every other ring-world/display motion change today (STAYS-HUMAN-adjacent: aesthetic acceptance on a customer-facing animation is his call, confirmed via render, not assumed from code).
- [ ] **Step 3:** Report back clearly on: (a) whether the "media card" question from Task 1 Step 1 was resolved or flagged, (b) confirmation the fresh-random-photo assumption was implemented as stated (or why not), (c) before/after screenshots or a description of what was rendered and compared.

## Explicitly out of scope for this plan (Phase 2, not yet planned)

- The up-pan mechanism moving the whole media card from item to item within a multi-part shiny question (title → photo 1 → photo 2 → ...) — confirmed direction (world holds still, media card layer pans upward) exists as a design pitch only, not planned or built yet.
- Putting Ben's photo on the per-item media cards (not just the intro card) — Ben asked for this ("put on the media card somewhere") but it depends on the Phase 2 media-card system existing first.
- The "screen starts blank, question text pops in ~2s after the ring background moves to a new station" pacing rule — confirmed scope (tied to ring station changes specifically, not every slide) but this is a `RingAmbient`/`SlideRenderer` timing change, unrelated to this plan's files, and not yet planned.
