# references/round-journeys.md — Round-Transition Journey Pattern

**Read before:** designing any themed round-intro/round-transition sequence — a "journey" moment that carries the show from one round to the next, distinct from both the 10 snappy every-slide transitions (`SlideRenderer.jsx`'s `dissolve`/`zoom`/`punch`/etc.) and the persistent, never-remounting ambient background (`ParticleBackground.jsx`).

This doc is scaffolding, not a catalog. It does not prescribe which theme gets which motif — that's a per-session creative decision made fresh each time, not something to hardcode here. What belongs in this file is the *method*, the *prototype conventions*, and *reusable technique/composition checklists* that apply regardless of which theme is being designed for.

---

## What this is

A round journey is an occasional, theatrical beat — same tier as Winner Reveal's drumroll-to-confetti sequence, not the same tier as a normal slide-to-slide cut. It's built *on top of* something the theme or the app already owns (an ambient anchor's own artwork, an existing canvas/rAF engine, a color palette already defined), never as a parallel system invented from scratch. It exists to make moving from one round to the next feel like part of the show's world instead of a mechanical UI transition.

**What it is not:** it doesn't touch the persistent ambient layer's own remount rule, and it isn't a replacement for the 10 named transitions — those still handle ordinary slide advances.

**It's a story, not just a mood transition.** A journey isn't only "the colors change and it looks cool" — it's a moment with a small narrative in it: something happens, has a consequence, gets resolved. A meteor clipping the windshield mid-shower, cracking the glass, then getting comically patched with a bandaid before the ship carries on is exactly the kind of beat this pattern is for — not a deviation from it. When designing a journey, ask what *happens* in it, not just what it looks like.

**On animation-technique freedom vs. the ambient layer's GPU-only rule:** `SKILL.md`/`ambient-design-law.md`'s strict "transform/opacity only, no continuous JS state" rule is scoped to the *persistent* ambient layer, which has to run jank-free for a 3+ hour show. Round journeys are one-shot, occasional beats — the same tier the app already grants more animation freedom to via `TeamPickerSlide.jsx`'s canvas/rAF warp engine and `WinnerRevealSlide.jsx`'s canvas confetti. A round journey reusing or extending an existing canvas/rAF engine is following precedent, not breaking it. That said, prefer the lightest mechanism that achieves the effect — canvas/rAF because a genuine per-frame numeric need exists, not by default.

---

## The method

1. **Pick the theme, fresh, each time.** A round journey is a per-theme creative decision made in the moment — this doc never assigns a fixed motif to a fixed theme.
2. **Find what already exists before designing anything new.** Every bespoke ambient theme owns real artwork for its anchor (`ParticleBackground.jsx`); some slide types own their own canvas/rAF engines. Look for something reusable before reaching for a new mechanism — cheaper to build, and it keeps the show's visual language consistent instead of accumulating unrelated one-off effects.
3. **Design the motif as an extension, not a rebuild.** Ask what an existing engine can do with one new input (a value pushed past its normal range, a different asset fed into the same drawing loop) before writing a parallel system that duplicates math the codebase already has.
4. **Prototype as a standalone HTML mockup before any real code.** See conventions below. Ben needs to see it move before anything touches the actual app — a still screenshot or a text description of an animation is not sufficient for a go/no-go call here.
5. **Iterate on Ben's actual reactions, not assumptions.** Expect the first version to be wrong in a concrete, fixable way — that's normal, not a sign the direction is bad. Fix the specific thing, replay, ask again.
6. **Self-gate, then get the eyes-check, then build the real component.** Only after Ben approves the prototype does this turn into an actual `SlideRenderer.jsx` transition or slide-type addition.

---

## Two shapes a journey can take

A round boundary's journey takes one of two shapes, decided by whether the leaving round and the arriving round share a theme:

- **Same-theme continuation.** Leaving and arriving rounds share a theme. Play one continuous single-theme motif for the whole journey — no bridge, no color handoff. This is still full-length and full-theatrical; sharing a theme is not a reason to make the transition shorter or quieter. Every round boundary gets the full treatment regardless of whether color changes.
- **Cross-theme handoff.** Leaving and arriving rounds have different themes. Structure the journey in three parts: a departure beat in the leaving theme's own motif and native colors, a short neutral bridge, then an arrival beat in the entering theme's own motif and native colors. The bridge is the only piece that has to be theme-agnostic — everything else stays owned by its theme. This matters because it avoids an N² combinations problem as more themes get journeys: each theme needs one departure flourish and one arrival flourish defined for it, not a bespoke motif for every possible pair of themes it might hand off to or from.

Practical notes on the bridge: keep it short relative to the two flourishes it connects — it's a connector, not content. Crossfade the base/background tone between the two themes' deep colors rather than cutting. And because a bridge is usually crossing through near-black, keep a fine mote/noise layer over it the whole time per the near-black-banding lesson below — a bare gradient ramp through near-black is exactly where banding shows, and the bridge is the one part of a journey most likely to be a plain gradient if you're not deliberate about it.

Which shape a given round boundary takes is decided by the show's data, not by this file — whatever assigns themes to rounds determines it. This file only owns the motion/structure of each shape once that decision's already made.

---

## Motion technique checklist

Grounded in established animation craft (Disney's 12 principles, motion-design convention) — generic technique, not tied to any specific studio's work.

- **Anticipation.** A brief preparatory beat before the main action reads as more natural and gives the eye time to lock on before something moves fast — this is the general principle behind the "hold beat before ascent" fix already applied once (see Reusable lessons below). Apply it any time a new element is about to become the focal point.
- **Overlapping/staggered action.** When several things animate in one beat (an element entering, the background dimming, a light/glow effect, text revealing), don't start and end them all in lockstep — stagger their timing slightly. Simultaneous starts/stops read as mechanical; staggered ones read as energetic and natural.
- **Silhouette-first legibility.** A shape should read clearly by its outline alone, before color or detail. This is the general principle behind the camouflage bug already found and fixed once (an anchor's fill matching the background it crosses) — check silhouette contrast against every background state the element will actually cross, not just the state it starts in.
- **No pop-in.** Nothing scales in from 0 or appears instantly in place — fade or slide it in. Matches `themes.md`'s existing motion-vocabulary rule; restated here because journeys are full-stage moments where the temptation to pop content in is stronger than in the ambient layer.
- **Edge margin / no clipping.** Keep core visual elements (the thing the eye is meant to follow) inboard of the frame edge with real breathing room — a safe margin, not flush to the boundary. Only atmosphere (backgrounds, gradients, particle fields) should be allowed to bleed to the edge.
- **Follow-through / staggered stops.** The mirror image of overlapping/staggered starts above: don't bring every animated element to a dead stop at the same instant. Let secondary elements (a glow, trailing particles, child text) settle a beat after the main element lands, optionally with a touch of overshoot. An instant full-stop on everything at once reads mechanical the same way a simultaneous start does.
- **Easing and duration by role.** Ease-out for entrances (arrive with speed, settle into place). Ease-in for exits (depart with acceleration). Ease-in-out for on-stage repositioning and looping/idle motion. One-shot actions (an arrival, a reveal) read best on an asymmetric curve — fast start, long smooth settle (a custom `cubic-bezier` biased toward finishing most of its travel early) — rather than a symmetric ease. Duration should scale with distance traveled, not be a flat constant — a full-stage crossing wants a longer duration than a small settle, or perceived speed reads inconsistent between beats. As a starting ladder at normal frame rates: roughly 800ms for an ordinary full move, 300–500ms for something snappy, 100–150ms for a small pop accent (a badge, a number tick) — tune from there, don't treat these as fixed.
- **Parent-drives-child stagger amount.** When one element's motion causes another's (a balloon moves, its basket/rigging follow; a body moves, a limb follows), offset the dependent element's animation start by roughly 50–80ms behind what's driving it — enough to read as causal, not so much it looks disconnected. Frame it as "what is this driven by?" for every secondary element in a scene.
- **Motion follows arcs, not straight lines.** Natural movement curves; a purely linear translate path reads stiff. Where a path is more than a short hop, prefer a curved trajectory (an SVG motion path, or a translate combined with a secondary perpendicular offset that eases in and out) over a straight vector.
- **Depth via differential speed, not just scale.** A foreground element traveling farther/faster than a background element (classic parallax) is a cheap, effective depth cue — and a "far" layer can be counter-moved slightly opposite a "near" layer's direction for an even stronger fake-3D read. Keep background motion subdued relative to the foreground focal action — this is the same "atmosphere is ground, never figure" rule `themes.md` already states for the ambient layer, and it applies just as much inside a journey's own composition.
- **Hold before the first action.** Roughly half a second of stillness (at a legible starting state) before anything moves gives the eye time to settle on the frame — the same principle as the anticipation/hold-beat lesson above, with a concrete number attached.

---

## Loop construction (for anything that repeats continuously, not one-shot)

A round journey is mostly one-shot, but pieces of it may loop (an idle sway before departure, an ambient element inside the scene) — different construction rules apply to a loop than to a one-shot beat:

- **Know which loop shape you're building.** A ping-pong (A→B→A, e.g. `alternate` direction) only needs two poses. A seamless forward loop needs its last frame to match its first frame exactly, or the seam shows as a visible jump.
- **Snap-back happens while invisible.** If an element's state changes partway through a scene and it needs to loop or reset, do the reset while the element is offscreen, hidden, or at zero opacity — never as a visible jump cut mid-scene.
- **Avoid exact-zero on anything that should look alive.** A blink, a pulse, or similar cyclical motion that fully collapses to 0 (scale, height, opacity at its floor) on every cycle reads as a glitch rather than a natural motion at that exact frame. Floor it slightly above zero instead.
- **Deliberate irregularity beats uniform repetition.** A short, perfectly uniform loop (blink every exactly 2s, sway every exactly 3s) reads as mechanical once a viewer's eye catches the pattern. Prefer one longer cycle containing irregular-interval repeats over a short perfectly-regular one — this is already the practice behind this app's own prime-number-staggered ambient timings; extend the same instinct to any loop inside a journey.
- **Duplicated instances need negative offset, not synchronized start.** When one animated element is duplicated many times (a field of identical particles, repeated decorative elements), give each copy a *negative* `animation-delay` proportional to its index rather than starting all copies at `0` — negative delay means each copy begins already partway through its cycle, so nothing pops in synchronized or looks like a grid of clones moving in lockstep.
- **A single scrub/rate control over a whole built sequence.** Rather than hand-tuning every keyframe's timing individually, consider driving an entire composed sequence's playback speed from one multiplier (a single CSS custom property feeding every duration in the sequence, or one `playbackRate`-style value for a canvas/rAF timeline) — makes "make the whole thing 20% snappier" a one-line change instead of a re-tune of every element.
- **Centralize shared jitter parameters.** If multiple elements share an organic-wobble quality (particles drifting, foliage swaying), drive them all from one or two shared frequency/amplitude values (a couple of CSS custom properties, or fields on one config object feeding a canvas loop) rather than each element getting its own hand-tuned independent values — keeps the whole group visually coherent and makes global tuning cheap.

---

## Composition checklist for full-stage moments

Round journeys, unlike the ambient layer, are allowed to fully occupy the stage — there's no center-safe-area-must-stay-clear constraint once a journey is playing (no question text needs to stay legible during it). That's a different composition problem, worth its own checklist:

- **Color dominance (60/30/10 as a starting ratio, not a hard rule):** one dominant color for roughly the majority of the frame (background/atmosphere), one secondary color for the next largest share (midground), one accent color reserved for the smallest, most attention-grabbing share (the focal element or the "moment" beat — a flash, a reveal). Prevents a scene from reading as visually flat or, at the other extreme, as competing for attention everywhere at once.
- **Placement at power points, not dead center.** Rule-of-thirds intersections read as more dynamic than perfect centering for a moving/arriving element — worth trying an off-center arrival position before defaulting to center-then-drift.
- **Five-part scene checklist** for what a journey's content actually shows: *who/what* is the subject, what is it *doing* (motion communicates the moment — avoid a static held pose as the only content), *where* does it happen (environment gives context even in a few strokes), what *changes* as a result (the "why we're watching" payoff — a reveal, an arrival, a transformation), and what's the *scale* relationship between elements (large vs. small elements signal importance non-verbally).
- **Metaphor over literal explanation.** When a journey needs to represent an abstract idea (progress, arrival, transformation), translate it into a physical/spatial action (something growing, something being carried, something breaking through darkness into light) rather than depending on on-screen text to explain it — the motion should carry the meaning.

---

## Prototype conventions

Every round-journey mockup is a single self-contained HTML file (no build step, opens directly in a browser) with:

- The stage at real 16:9 aspect ratio, using the target theme's actual `colors` from `themes/index.js` — never placeholder colors.
- A **Replay** button that resets and re-triggers the sequence (these are one-shot animations, not loops, so you need a way to re-watch them).
- A **"Simulate prefers-reduced-motion"** checkbox that *actually* forces the reduced branch via a JS flag or class toggle — not one nested inside the real `@media` query, which only fires when the OS-level setting is also on and silently does nothing otherwise. Test the checkbox itself before calling a prototype done.
- GPU-only animation only — `transform`/`opacity` for CSS, or the equivalent canvas math for rAF-driven pieces. Static `filter`/`blur` is fine; animating it is not.
- A notes block below the stage explaining the sequence beat-by-beat, what deliberately did *not* change from any shipped baseline being reused, and any real trade-off or open architectural question the prototype surfaces. Keep any stated timing numbers in that text in sync with the actual animation durations in the code — this drifts easily when timing gets tuned after the notes are written.
- A short self-gate block against the same spirit as `themes.md`'s 7-check Acceptance Gate, adapted to what's relevant for a transition rather than a persistent ambient scene.

Prototypes live in `concepts/` at the repo root (flat, alongside the existing PYL-picker concept files) — untracked scratch until a direction is locked.

**When a design pivots mid-session** (new camera framing, new motif, new mechanism), update the prototype file itself before moving on to the next idea, or explicitly flag in conversation that the file on disk is a superseded iteration. A prototype file that silently lags the latest described direction is a real trap for whoever picks this back up later — including a future instance of yourself.

### Before building: load supporting skills

Before writing the prototype HTML, load:
- `gsap-core` + `gsap-timeline` — construction quality (easing, sequencing).
- `emil-design-eng` — timing/anticipation/follow-through polish, so motion doesn't default to generic linear/spring AI-motion.
- `impeccable` — after the prototype exists, to audit whether it reads premium or just functional.

### Input requirements — real material only

Never brief this from a verbal description alone. Before design starts, supply:
- The actual theme's palette/tokens (not a description of the colors).
- The actual `ParticleBackground.jsx` (or relevant existing engine file) for that theme, so the new motif extends real code, not an invented generic shape.
- Separated visual assets (isolated layers with transparent backgrounds), never a single fused scene — a fused illustration or baked video can't become theme-aware, retriggerable, code-driven motion.

### Scope

One moment, one theme, one file per prototype round. Don't ask for "the whole journey" in one pass — narrow scope gets faster, clearer iteration than one sprawling scene.

**Multi-stop journeys are a legitimate evolution of this, not an exception to work around.** A single file can legitimately string several stops together (a themed "road trip" through multiple stages, each its own beat) — when it does, treat each stop as its own scope unit for the checklist below, not the file as a whole. See "Reusable lessons" for the specific failure mode this pattern introduces that single-stop journeys don't.

### Feedback protocol

Feedback must name the concrete, fixable thing — a timing offset, an easing choice, a missing anticipation beat — not a vibe ("feels off", "not quite right"). Vague feedback produces vague fixes. This is a sharper version of the existing "expect the first version to be wrong — fix the concrete thing, replay" rule.

---

## Reusable lessons from prototyping so far

Two early bugs (an anchor camouflaging against a same-hue background, motion starting with no hold beat) are already folded into the Motion technique checklist above as the silhouette-legibility and anticipation entries — not re-listed here to avoid saying the same thing twice. What follows are lessons distinct from that checklist:

- **When an engine is reused for a themed variant, keep the change local — unless you can cleanly extract a pure, input-driven piece with zero behavior change to the original caller.** If a round journey borrows an existing engine that's documented elsewhere as intentionally theme-agnostic (a "consistent ceremony" design choice), don't modify that shared component to add theming — copy the relevant math into the journey's own component instead. The shared component's original design intent stays intact. The one exception, confirmed in practice (2026-07-20, the hyperspace bridge borrowing `TeamPickerSlide.jsx`'s starfield warp): a genuinely pure drawing function — no caller-specific state, every input supplied by the caller (colors, `dtn`, a `warp` value) — can be extracted into a real shared module instead of copied, AS LONG AS the caller-specific parts (team-picker's own sequencing state machine, and specifically what drives its `warp` value moment to moment) stay exactly where they are and are never touched. The test: after extraction, does the original caller compute and supply the same values it always did, with the same resulting behavior? If yes, one shared function is fine and is what makes future changes to that drawing math apply everywhere at once instead of drifting between copies. If the extraction would require the shared module to know anything about the caller's own state, stop and copy instead — that's exactly the risk this lesson originally warned about.
- **Copy the frame-timing normalization, not just the visual math.** `TeamPickerSlide.jsx` clamps and normalizes delta-time (`dtn = min(26, dt)/16.667`) before using it to advance any value. If a journey copies motion math from an existing rAF engine, that normalization has to come with it — without it, the same code runs animation speed proportional to the display's actual refresh rate, so it plays roughly 2x too fast on a 120Hz screen versus the 60Hz the numbers were tuned against.
- **Pre-allocate and recycle particles; don't spawn-and-discard per frame.** The existing star engine uses one fixed-size array for its whole lifetime — no per-frame allocation. Any journey that adds burst/spawn-style particles (an explosion, a trail) should reuse a fixed pool the same way, not `new` a fresh object per particle per frame. At real particle counts and 60fps, per-frame allocation produces enough garbage-collector pressure to cause visible stutter — invisible in a quick prototype check, real on a TV running the effect for a full show.
- **Near-black gradients band on real TV panels.** A slow-animating gradient that ramps through near-black tones can resolve into visible stripes on 8-bit display panels — near-black is exactly where a panel has the fewest available tonal steps. Relevant because dark theatrical atmosphere is the default mood for most of these journeys. Mitigate by avoiding long slow ramps through near-black, or by keeping a fine particle/noise layer over the gradient (incidentally, the existing star fields already do this as a side effect). Separate ops-level note: if a journey's fast motion ever looks smeared or haloed on the actual venue TVs, check whether the TV's motion-smoothing/interpolation setting is on — it should be off (Game or PC mode) for anything frame-precise.
- **A connective/transitional beat belongs inside the component it leads into, not as its own slide.** This app has no timer-driven auto-advance anywhere — every beat is a host-initiated DB write from `/host`, and `/display`'s nav authority was deliberately locked to that one path (display-side keyboard advance was removed as a liability). Confirmed in practice (2026-07-20, designing a "hyperspace" entry beat meant to precede every round journey): making the transitional beat its own slide would force an extra host button-press just to get through it, and either leaves dead air waiting for that press or requires reopening timed display-side navigation that was closed on purpose. The fix: give the destination component (here, the round-journey slide) its own internal two-phase timeline — a local timer drives phase A (the transitional beat) into phase B (the actual content) — so the slide-navigation model is never touched. Generalizes to any future "there should be a moment before X" idea: check whether X's own component can own that moment internally before reaching for a new slide type.
- **Multi-stop journeys need a crowning moment at EVERY stop, not just overall polish.** The five-part scene checklist above measures whether a stop has *content* (subject, action, environment, change, scale) — it does not measure whether that content adds up to an *event*. A stop can pass all five parts and still be forgettable ambiance. Tested directly on a four-stop journey: a fresh-eyes "guest at trivia night, never been here, did that blow my mind?" pass found exactly two stops that landed hard ("whoa, look at that" — the kind of reaction that makes a table look up from their phones) and two that didn't ("cute, gets a laugh, but reads as an Easter egg, not a showstopper" / "wallpaper, not a highlight, would go completely unnoticed"). The pattern in what worked: each landing stop had one unmistakable thing happen at a single, specific instant — a camera-shaking rush, a sudden burst — not just sustained prettiness building and holding. The pattern in what didn't: pure ambiance with nothing that *happens*, however polished. The fix generalizes and is worth doing before considering a multi-stop journey done, not after a guest-reaction pass catches it late: name each stop's crowning moment in one line — the one instant a guest would actually point at, distinct from how nice the stop looks the rest of the time. If a stop can't get a one-line answer, that stop needs a redesign, not more polish on what's already there. (One concrete fix pattern that worked: an existing continuously-driven value in the scene — a warp/drift speed already animating for other reasons — spiked hard for one beat, rather than introducing a whole new object/mechanism. Cheaper to build, and the sudden spike of something already-present reads as more surprising than a new element arriving gently.)

---

## Style language (non-binding reference, not a hard rule)

Design conversations for these journeys have leaned on flat-vector-explainer language: bold solid color-blocking with minimal shadow/gradient, simple/simplified geometric shapes, generous rounding, soft glow/particle accents rather than pictorial detail, and a strict edge-margin discipline (see composition checklist above). This is an established, genre-wide convention in science-explainer and motion-design work generally — a vocabulary for describing the *feel*, not a mandate to match any specific external studio's work frame-for-frame. The actual constraints that govern what ships are still `references/themes.md`'s Law/Recipe/Acceptance Gate and `references/ambient-design-law.md`'s GPU-only rules for the ambient layer specifically.

**Source note:** several of the technique entries above (the timing ladder, parent-drives-child stagger amounts, loop-construction rules, particle-pooling and frame-timing-normalization notes, near-black banding note) were informed in part by a Skillshare animation-production course from a well-known flat-vector explainer studio. They're written here as generalized animation-production craft rather than as a transcript of that course, but the source is worth naming rather than leaving implicit.
