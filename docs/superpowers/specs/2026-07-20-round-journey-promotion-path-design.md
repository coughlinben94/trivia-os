# Round Journey Promotion Path — Design

Date: 2026-07-20
Status: design approved by Ben, not yet planned or built.

## Goal

The nightly Storybook Agent (`concepts/AGENT-PROMPT.md`) builds standalone prototype
files in `concepts/*.html`. Nothing currently turns an approved prototype into a real,
playable part of a live show. This spec closes that gap: how a promoted journey
actually renders, how it gets placed into a show, and how it connects to the existing
team-picker warp effect Ben wants reused as its entry beat.

Explicitly out of scope, deferred as a separate later design: per-round theming
(rounds automatically inheriting a different theme, which would let a journey fire
automatically instead of being manually placed). Today, theme is show-wide
(`ThemePickerModal` sets `show.theme`; `Display.jsx` reads one theme for the whole
show). This spec's placement mechanism is manual and doesn't require that feature to
exist first, and doesn't preclude it being added later.

## Architecture: one slide type, a per-journey registry

A single new entry in `SLIDE_COMPONENTS`
(`client/src/components/display/SlideRenderer.jsx`):

```js
'round-journey': RoundJourneySlide,
```

`RoundJourneySlide` is a thin dispatcher: it reads `slide.data.journeyId`, looks it up
in `client/src/components/display/slides/journeys/registry.js`, and renders the
matched component. Each promoted journey is its own real component file under
`journeys/` — a direct port of a `concepts/*.html` prototype's canvas/rAF or GSAP
code, not a generic data-driven schema. This mirrors the existing `team-picker`/
`winner-reveal` pattern and keeps `SLIDE_COMPONENTS` itself from growing one entry per
promotion.

Registry shape:

```js
{
  id: 'meteor-shower-flythrough',
  component: MeteorShowerFlythrough,
  themes: ['meteor-shower'],
  label: 'Meteor Shower — Flythrough',
}
```

`themes` lives on the registry entry itself (not a separate parallel list) so
`AddSlideWizard`'s filter and the registry can't drift out of sync.

**Unknown-id fallback:** if a show's `journeyId` no longer matches any registry entry
(renamed/deleted journey, an older exported show), the dispatcher renders a graceful
"slide unavailable" state, not a crash. The per-slide `ErrorBoundary` in `Display.jsx`
catches hard crashes, but a silent failure mid-show is still a failure worth handling
explicitly.

**`isPreview` discipline:** `SlideRenderer` passes `isPreview` down. Ported prototypes
running full rAF loops inside host-editor thumbnails is a real performance risk once a
show has several journeys in it. Journey components must render a single static frame
when `isPreview` is true, not the live animation.

## Placement into a show: manual, filtered by theme

`client/src/components/host/AddSlideWizard.jsx` has an existing `TYPE_CARDS` array —
the data behind the "add a slide" picker. It gets one new card:

```js
{ type: 'round-journey', icon: '🎬', name: 'Round Journey', desc: '...' }
```

Picking it opens a sub-picker listing promoted journeys, filtered to the show's
currently-selected theme (reading each registry entry's `themes` field) — a
space-themed show never offers a greenhouse-themed journey as an option.

**Adding a new journey later must stay cheap.** This is the actual reason the registry
pattern was chosen over giving every promotion its own `SLIDE_COMPONENTS` entry:
promoting a new space journey down the road means writing one new component file and
adding one line to `journeys/registry.js` — it never touches the shared bridge, the
dispatcher, or `AddSlideWizard`. Those three pieces are built once and reused by every
future promotion, space-themed or otherwise.

Placement is entirely manual and opt-in. Nothing requires one journey per round
boundary; Ben places zero, one, or several, wherever he wants, and can reuse the same
journey across many shows if he likes it — same as any other slide type today.

Per-instance color customization was raised and then de-scoped in favor of the ease-of-
addition point above — Ben's real priority is that adding new journeys stays cheap, not
runtime palette swapping. Colors stay locked in from the real theme at promotion time,
same as the prototype already does. If per-placement palette variants become a real
want later, that's a separate, small addition on top of this design, not a blocker to it.

## The hyperspace bridge — internal to RoundJourneySlide, not its own slide

Ben's intended show flow, once a grading break ends: the jukebox hands control back to
`/display` (a full page reload, `?from=jukebox`) → a ~5-second "hyperspace" bridge
plays, always visually consistent regardless of theme → the specific chosen journey
plays → the round's normal ambient background (`ParticleBackground.jsx`) takes over.

**This is NOT a fourth/third slide.** Two structural facts about the app rule that out:

- Nothing in this app auto-advances slides on a timer. Every beat is a host-driven DB
  write from `/host`; `/display`'s nav authority is deliberately locked to one path
  (the RLS-D-1 fix removed display-side keyboard advance as a liability). A standalone
  bridge slide would need either an extra host button press (dead air, bad UX) or a
  new timed display-side nav write — reopening a door closed on purpose.
- The reload-from-jukebox already means the journey slide always mounts fresh. A
  fixed black starfield as the component's own opening phase is a natural fit there —
  it covers asset/font warm-up for the journey underneath, essentially for free.

So: `RoundJourneySlide` owns an internal timeline with two phases, driven by a local
timer, not the show's slide-navigation state:

1. **Bridge phase (~5s):** the shared starfield warp, starting at full "in hyperspace"
   speed and decelerating smoothly toward calm over the window — the same visual grammar
   as a ship dropping out of hyperspace. Always the same regardless of theme (per Ben's
   explicit "consistent... same animation the team intro screen has" requirement).
2. **Journey phase:** the specific promoted journey's own content.

**Handoff between phases:** a brief full-black hold (roughly 150–300ms) between the
bridge ending and the journey's first frame, rather than cross-fading two live canvases
at once. Simpler to build, avoids running two rAF loops simultaneously during the
handoff, and reads naturally given hyperspace's own black-void aesthetic. If this reads
as too abrupt once actually seen on a real venue TV, upgrading to a soft cross-fade is
a contained follow-up, not a redesign — consistent with this project's existing
discipline of shipping the simpler mechanism first and only adding complexity in
response to an observed problem, not preemptively.

**Real bug to avoid at build time:** `SlideRenderer.jsx` (lines ~146–161) currently
forces `opacity: 1` (no fade transition) for `team-picker`/`state-of-union`/`grid`
specifically because a normal fade would briefly expose the theme's `bgDeep` color
underneath before snapping to black. `'round-journey'` opens on the same fixed-black
starfield and must join that list, or the hyperspace entrance will flash the show's
theme color for an instant before going black — exactly the inconsistency Ben wants to
avoid.

## Shared starfield extraction — scope matters

`TeamPickerSlide.jsx` already has the exact warp effect wanted for the bridge: a
canvas/rAF star layer (z-depth projection, frame-independent `dtn = dt/16.6667` decay,
per-star motion-blur trails), with an existing code comment confirming the "always
consistent regardless of theme" behavior Ben wants is already a deliberate design
choice there, not something new to invent.

The rAF loop in `TeamPickerSlide.jsx` (roughly lines 132–239) actually contains two
different things interleaved, and only one should move:

- **Extract:** the pure star-drawing layer — star array init, the per-frame
  fill/update/draw, including the `rgba(bg, 0.30)` background fill under `lighter`
  composite (this fill *is* the motion-blur trail effect — it must move with the rest,
  not be left behind). Inputs: `ctx`, the star array, a `warp` value, `dtn`, fixed
  colors. No team-picker-specific state. Suggested location: `client/src/lib/
  starfield.js`, alongside the existing pure-helper convention (`lib/easings.js`).
- **Do not extract:** the sequencing state machine — `c.seq`/`c.targetIdx`/
  `c.displayedIdx`, phase handling, sprite drawing, `setHudIdx`/`setLanded`, and
  critically the warp *target* logic itself (`warpTarget = seq[targetIdx].kind ===
  'landed' ? 0 : 1` — team-picker's warp decelerates specifically when a reveal
  lands). `warp` becomes a caller-supplied input to the extracted function; team-picker
  keeps computing its own target and easing toward it exactly as today, the bridge
  computes its own independent 5-second ramp-down.

Two details that must travel with the extraction, not be reconstructed from memory:

- **Reduced-motion policy.** The existing TEAM-1 fix (warp pinned at 0.12, reduced star
  count, opaque background fill under reduced motion) becomes caller policy once `warp`
  is an external input — the bridge must replicate this itself, or the hyperspace
  entrance regresses accessibility that team-picker already has correctly.
- **Fixed setup values** (colors, canvas dimensions, `alpha: false` context option)
  move with the module so both callers can't silently drift apart over time.

Sequencing: do the extraction as its own isolated commit first, visually confirm
team-picker is unchanged on the real display, *then* build the bridge on top of the
now-shared function. Not a "build both from scratch and dedupe later" approach — the
extraction is narrow and low-risk enough that there's no real benefit to building it
twice first.

## Mechanical promotion steps (when Ben says "promote X")

1. Read the approved prototype and its `manifest.js`/`QUEUE.md` entries — brief,
   palette, any still-open revision notes.
2. If the prototype bundles multiple stops into one review file (as tonight's
   `space-road-trip-full-journey.html` does), split it: each stop becomes its own
   component under `journeys/`, tagged with its own real theme in the registry.
3. Port each stop's canvas/rAF or GSAP code into its component — a direct port, not a
   rewrite. Real theme tokens are already correct in the prototype; no re-theming work.
4. Register each in `journeys/registry.js`.
5. `RoundJourneySlide` and its bridge phase are built once, reused by every future
   promotion — not rebuilt per journey.
6. Add the `'round-journey'` card to `AddSlideWizard.jsx`'s `TYPE_CARDS` (also once).
7. A basic dev-server render check (mounts without errors) before calling it done.
   Actual timing/feel on a real venue TV stays Ben's call, same as the nightly agent's
   own Step 5 audit already says about itself.
8. Ben reviews the diff before anything merges.

## Open items, explicitly not resolved here

- Per-placement color customization — real idea, not built, flagged above.
- Per-round automatic theming / automatic journey placement — separate, deferred,
  bigger feature.
- Whether the black-hold handoff between bridge and journey phases needs a softer
  cross-fade — ship the simple version first, revisit only if it reads poorly live.
