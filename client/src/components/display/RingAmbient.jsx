// RingAmbient — the DOM-building half of the "ring" ambient model.
// Ported from concepts/world-07-ring.html, which remains the source of
// truth (see client/src/lib/ringEngine.js for the pure-math half). This
// component is NOT wired into production — it exists in isolation until a
// later task mounts it in the dev-only /ambient preview route.
//
// Architectural constraint (matches ParticleBackground.jsx's own "never
// re-mounts" rule, see that file's Critical Rules comment and the repo
// SKILL.md): the station index must NEVER arrive as a React prop, because
// this component will eventually live inside ParticleBackground, which
// mounts once per show. So the entire DOM tree is built exactly once in a
// mount-only useEffect (mirroring the reference build's own top-level
// `(function build(){...})()` IIFE), and turn()/jumpTo() are exposed
// imperatively via useImperativeHandle. Both mutate `surge.style.transform`
// directly — never React state/props — so calling them never triggers a
// re-render of this subtree.
//
// Out of scope for this port (see the plan task for the full reasoning):
// question TEXT rendering (qLayer/qText/renderQ/showQ/hideQ/fitPx/wrapLines/
// fits — Trivia OS already has its own question-rendering system elsewhere,
// which composites on top of this component), and the reference build's own
// demo-page chrome (.notes/.ctl/header/.sub/status line, the safe-box
// `.guides` overlay, `.vig` vignette and `.grain` texture — none of these
// appear in the task's explicit "CSS you'll need" class list).
//
// The shooting-star system (spawnShoot/shootLoop/.shootLane) WAS listed
// here as out of scope too, with no reason given (unlike the two items
// above, which have real ones) — ported in 2026-08-12 once Ben asked to
// "lean more into" it; see the build effect below.
//
// The SCRIM (qScrim/layoutScrim in the reference build) is IN scope, unlike
// the rest of the question system: spec §2 requires it under any text this
// safe box carries, RingAmbient shipping without it is a real legibility
// regression (station 0 measured p99.5 99 against a 72 cap — bright content
// with nothing dimming it), and its geometry/alpha don't depend on knowing
// anything about the app's actual question text or its show/hide timing —
// only on the current station. See layoutScrim() below.
import { forwardRef, useEffect, useLayoutEffect, useImperativeHandle, useRef } from 'react'
import { cylinderOf, authorPeriodOf, buildArc, loudnessOf, fillOf, rng, lerp, assertLayerPeriods } from '../../lib/ringEngine.js'
import { ringNavAction } from '../../lib/ringStationIndex.js'
import { EASE_SURGE } from '../../lib/easings.js'
import { ringDom, px, ringCss, SKY_REGIONS, skyRegionWeights, skyRegionHues, accentCompanionHue, applySkyTints, applyTints } from '../../lib/ringPrimitives.js'

// ENGINE — engine-fixed, identical for every world; never a prop (a world
// never sets any of this, same as the reference build's own ENGINE const).
// SAFE is included (absent from the reference's WORLD-facing exports but
// present in its own ENGINE object) because bandY() needs it to keep solid
// forms out of the safe box. Q/DWELL_MS are still omitted — they belong to
// the out-of-scope question system. SHOOT_MS is now included (2026-08-12,
// Ben: "lean more into shooting star concept" — that system is no longer
// out of scope here, see the shooting-star block in the build effect below).
const ENGINE = {
  W: 1920, H: 1080,
  // 12 -> 13 on 2026-08-16: the jukebox grading-break got its own dedicated
  // stop (Ben: "it needs to have its own ring slot") — the `record` station,
  // appended at index 12 in midnightGalaxy.ring.js and world-07-ring.html,
  // then swapped to index 10 the same day for silhouette-family spacing.
  // This is NOT an additive change: arcAt() is cos(2*PI*(i+phase)/PANES), so
  // every station's loudness/fill/ink moves, not just the new one. It also
  // moves the wrap point from 11->0 to 12->0; both new legs are covered by
  // ringEngine.test.js's 13-pane wrap-glide suite.
  PANES: 13,
  SURGE_MS: 1700,
  SAFE: { x: 0.20, y: 0.28, w: 0.60, h: 0.44 },
  SHOOT_MS: [12000, 35000],
  LAYERS: [
    { id: 'sky',  surge: 0,    m: 1 },
    { id: 'far',  surge: 480,  m: 1 },
    { id: 'mid',  surge: 1920, m: 1 },
    { id: 'near', surge: 2880, m: 3 },
  ],
  // B2-luminance.md sec 2.1/5.3: {18,52} was frame-mean luma outside what the
  // spec's own alpha/placement caps can physically reach (ceiling ~28-30 at
  // legal peak alpha) — unreachable at any ink level the spec permits, and
  // pre-fillOf() the value never reached a pixel anyway (proved: scaling it
  // 10x rendered byte-identical frames). ref/fillMin/fillMax feed fillOf()
  // below, the channel that DOES reach a pixel.
  ARC: { lo: 10, hi: 31, exp: 1.6, ref: 31, fillMin: 0.35, fillMax: 1.00 },
  STAR_ALPHA_FLOOR: 0.28,
}

// Fails loudly at import if a future PANES/surge/m edit stops a layer's
// authored strip tiling its cylinder in whole pixels — the seam that would
// otherwise appear at the wrap is the kind of defect nobody traces back to
// the arithmetic. See ringEngine.js for why this replaced 'm divides PANES'.
assertLayerPeriods(ENGINE)

// ── CSS — the chassis/primitive/star rules (.ring-lyr, .ring-surge,
// .ring-void, .ring-star, .ring-pf, .ring-b-lobe, .ring-b-rim, .ring-d-glow,
// .ring-s-core, .ring-s-spk, .ring-l-disc, .ring-l-arm, .ring-l-arm-edge,
// .ring-l-core, .ring-k-tail, .ring-k-head, .ring-r-body, .ring-r-edge,
// .ring-rg-ring, @keyframes
// ringTw/ringPfBreathe) now come from client/src/lib/ringPrimitives.js's
// ringCss('ring-') — the same source concepts/world-07-ring.html's
// unprefixed <style> injects via ringCss(''). These were hand-duplicated
// against that page's <style> block (in sync, but nothing enforced that —
// the same bug class the makePrim extraction already fixed once).
//
// `.ring-stage` and its `.go` transition trigger stay local — that class
// isn't part of the ring-verify.mjs contract (only #design, .ring-void,
// .ring-star, .ring-surge, window.__world are — see the mount effect below
// for this component's own window.__world exposure), "stage" is generic
// enough to risk
// colliding with unrelated app CSS, and the easing here comes from this
// app's own client/src/lib/easings.js rather than the reference build's
// hardcoded curve. The reduced-motion query stays local too, but now
// includes `.ring-shoot` (2026-08-12 — that system is no longer out of
// scope, see the shooting-star block in the build effect below); still
// excludes the `.stage.rm` manual-toggle branch, dev-harness-only UI (a
// checkbox to force reduced-motion for testing) that neither build needs
// at runtime. ──
// .ring-scrim: full-frame geometry (left/top/width/height) is fixed once at
// build time (ART-DIRECTION-SPEC.md sec 2 — see the build effect below for
// why full-frame, not a fitted box); only the alpha-bearing background is
// per-station (see layoutScrim below). position:absolute only — no CSS
// transition, this component owns no question-visibility state to animate
// against.
const RING_CSS = `
${ringCss('ring-')}
.ring-stage.go .ring-surge{transition:transform var(--surge-ms) cubic-bezier(${EASE_SURGE.join(',')})}
.ring-scrim{position:absolute;pointer-events:none}

@media (prefers-reduced-motion:reduce){
  .ring-surge{transition:none!important}
  .ring-star,.ring-pf,.ring-pf-breathe,.ring-shoot{animation-play-state:paused!important}
  .ring-drift{animation-play-state:paused!important}
  .ring-rock-spin{animation-play-state:paused!important}
}
`

// dom.el/dom.makePrim/dom.bandY/dom.buildStars (and the plain px export)
// come from client/src/lib/ringPrimitives.js's ringDom('ring-', ENGINE)
// call below. ENGINE (unlike worldData) is module-scoped, not a prop, so
// dom can be too — every call site in this file, in buildLayerContent and
// in the mount effect, goes through it rather than ever passing the
// "ring-" prefix by hand. See that module for the full primitive-rendering
// logic (blob/dots/spikes/lens/streak/ribbon/ring/binary) — one source now
// shared with concepts/world-07-ring.html.
const dom = ringDom('ring-', ENGINE)

// The per-station background-wash table (WASH_KINDS / greenWash /
// orangeWash, 2026-08-13..14) is GONE as of 2026-08-16 — synced from
// world-07-ring.html, same deletion in both builds. Replaced by the sky-
// region system in ringPrimitives.js (SKY_REGIONS / skyRegionWeights /
// applySkyTints / makeSourceGlow); see that module's own block comment for
// the full reasoning. Short version: the wash was an object riding the
// mid-layer surge, so its color arrived WITH the pan as a wipe, and four
// rounds of geometry/alpha tuning never touched that. Nothing colored
// slides with the pan any more — the sky itself leans, on its own slower
// clock, with the region's own headline object visibly lighting it.

// ═══ BUILD ═══ dispatches per-layer content building.
function buildLayerContent(engine, world, arc, host, L) {
  // 2026-09-02 palette-aware, synced with world-07-ring.html: region hues are
  // derived from the world's own station data, never read off SKY_REGIONS.
  const regionHues = skyRegionHues(world.stations)
  const period = authorPeriodOf(engine, L)

  if (L.id === 'far') {
    /* slow, dense star field */
    dom.buildStars(host, period, 140, 1.0, 0xA11CE)

    // Wide soft wash blobs (6/period, ~620-900px, `blob` primitive) removed
    // entirely 2026-08-13 — see world-07-ring.html's identical removal note
    // (same fix, both builds) for the full reasoning: a fresh customer-role
    // critique pass root-caused this loop as most of Ben's recurring
    // "remove planet" / "random dim circles" / "not needed here" complaints
    // back to 2026-08-12, because it drew far-layer washes with the same
    // `blob` primitive kind headline nebulae use — visually indistinguishable
    // from a real object but with no thematic identity, drifting across ~5
    // unrelated stations per wash (far's 480px/turn vs mid's 1920px/turn).
    // Station 10's one-off `noWash` exemption from this same loop, for the
    // identical complaint, was the same problem recurring, not a coincidence.
    // The far-layer star field above and the anchor/drifter below are
    // unrelated and untouched.

    // far-layer anchor (spec §7.6) removed outright 2026-08-13 — see
    // world-07-ring.html's identical removal note (same fix, both builds)
    // for the full reasoning. Three prior rounds each re-tuned only alpha
    // (0.34->0.15 here, further to 0.09->0.05 on the other build) without
    // ever changing what the anchor actually was: a `lens` primitive
    // rendered as l-disc/l-arm "bead spiral" shapes — the identical
    // primitive kind and render path station 3's own spiral-galaxy headline
    // uses. A fresh customer-role critique agent (2026-08-13) confirmed it
    // still reads as a duplicate of that headline even at the other build's
    // alpha 0.05 — dimming was never going to fix a same-shape-as-a-real-
    // headline problem. No replacement is authored here — open spec
    // question for Ben, not resolved by this removal.

    // one trackable drifter (spec §7.7): the only element in this world
    // carrying its own continuous transform, so the up-to-75s gap between
    // turns isn't a freeze-frame with only twinkle for company. The
    // transform lives on THIS element (.ring-drift's own CSS animation,
    // see ringCss) nested INSIDE far's already-transformed .ring-surge —
    // never a second transform on the layer itself. A rail-style layer
    // transform was deliberately deleted earlier this session for causing
    // visible pops at turn boundaries; this can't reintroduce that bug
    // class because .ring-surge's own transform is never touched here.
    // 3600px/120s = 30px/s along a sine path (2026-08-17, Ben watching the
    // pre-show live: "wayyyyy too slow", "needs to be moving at an angle",
    // "even rounded paths" — was 3600px/480s = 7.5px/s, dead-flat
    // horizontal). Crossing time is now 2min, under spec §7.7's authored
    // 4-12min band; see ringPrimitives.js's .drift block for the full
    // reasoning, the ±55px amplitude's clearance math, and why that band
    // was overridden rather than ignored. linear+alternate so it reverses
    // cleanly at each end instead of snapping back. Size bumped 9->14px
    // and given a warmer color + a bigger/stronger glow than any star can
    // reach (far-layer stars top out at size 8 with box-shadow blur
    // 17.6px/spread 2.4px — see ringPrimitives.js's .drift, blur
    // 32px/spread 10px) so it reads as an object, not one more star.
    {
      const dr = rng(0, 0xD817)
      const drift = dom.el('drift')
      const ds = 14
      drift.style.width = drift.style.height = px(ds)
      drift.style.left = px(period * 0.12)
      // skipMinBleed: true — the min-bleed clamp is a fraction of the
      // element's OWN height (14% floor / 16% ceiling), tuned for
      // 576-880px headlines. On this 14px satellite that collapses to a
      // ~2px range, so without the flag it's arithmetically pinned to the
      // top rail regardless of the seed. The reference build
      // (world-07-ring.html) already carries this fix — Ben: "likes the
      // drift, but it was getting clipped at the top" — it just never got
      // ported to this component. Confirmed safe: skipMinBleed only gates
      // the post-hoc clamp, not bandY's own two rng() draws, so nothing
      // else in the seeded sequence shifts.
      drift.style.top = px(dom.bandY(dr, ds, undefined, undefined, true))
      host.appendChild(drift)
    }
  }

  else if (L.id === 'mid') {
    /* THE COMPOSITION LAYER. mid moves exactly one frame per turn, so
       station i is authored into the frame at x = i*W and lands there
       every single time. */

    /* third star layer (spec §5: >=3 star layers, surge distances
       differing per §0's ratio) — see concepts/world-07-ring.html's
       identical comment for the reasoning: mid's surge (1920) already
       sits between far (480) and near (2880) in the engine's 1:4:6
       ratio family, so reusing it needs no new surge value.
       sizeMul 1.25 (not far's 1.0): far:mid:near size ramps 1.0:1.25:1.5
       against the 1:4:6 speed ramp, so depth reads from a static frame
       too, not just from differential motion. */
    dom.buildStars(host, period, 40, 1.25, 0xCAFE1)

    // Occlusion eligibility + occluderStations (spec §7.2's >=1-in-3
    // subtractive-disc floor) removed entirely 2026-08-13, Ben's explicit
    // call — see world-07-ring.html's identical removal note (same fix,
    // both builds). Three prior rounds each re-tuned size/fill/position
    // without addressing the actual complaint: makeOccluder always draws
    // drawPlanetDisc's planet-silhouette geometry regardless of the host
    // station's own theme, so it read as a stray planet on non-planet
    // stations no matter how it was tuned. concepts/tools/ring-verify.mjs
    // check #14a and ring-occlusion-ablation.mjs will fail/no-op against a
    // floor this component no longer tries to clear — that check's own
    // pass/fail logic is unedited (STAYS-HUMAN), needs Ben's own follow-up
    // if the floor itself should retire.

    for (let i = 0; i < engine.PANES; i++) {
      const st = world.stations[i]
      // Each property below draws from its OWN seeded stream, keyed by
      // station index + a distinct per-property constant — not one shared
      // stream read sequentially. See concepts/world-07-ring.html's
      // identical comment for why (2026-08-08: a bandY fix reshuffled 4 of
      // 12 stations' companion kind/hue as a pure side effect of consuming
      // a different number of r() calls upstream, with no logical
      // connection between the two — separate streams make that class of
      // bug structurally impossible).
      const rHeadline = rng(i, 0x5EED1)
      const rPairBand = rng(i, 0x5EED2) // only the shared upper/lower coin-flip (spec §7.5 — this one draw IS intentionally shared)
      const rCompanion = rng(i, 0x5EED3)
      const rDetail = rng(i, 0x5EED4)
      const lou = loudnessOf(arc, i)
      const fill = fillOf(engine, arc, i)
      const x0 = i * engine.W

      // headline form — 576-880px longest edge, full tier range regardless
      // of loudness (was lerp(576,880, lou*0.75+r()*0.25) — quiet stations
      // got stuck near the 576 floor, loud ones near 880, so a quiet
      // station read as a small/sparse frame instead of "large and dim."
      // Loudness now speaks through alpha/detail-count only, below.
      // 2026-08-12: synced from world-07-ring.html — pulsar shrunk 0.78x
      // (Ben: "can be smaller"). See that file's comment for why scaling
      // the whole box shrinks the object proportionally in one change.
      // 2026-08-12 round 3 (Ben, st11: "make longer") — synced from
      // world-07-ring.html: ribbon's own visual "length" is this width, so
      // it gets a wider tier instead of the shared 576-880 range.
      // 2026-08-13 round 2: synced from world-07-ring.html — widened past
      // frame width (Ben: "make it go longer but ends off screen") so the
      // far end actually exits the frame instead of just reading longer
      // within it — see that file's identical comment for the full math.
      // 2026-08-16: synced from world-07-ring.html (2026-08-12, Ben: "half
      // on one slide half on another"). This branch never made it across
      // when the rest of that round was synced, so st9's asteroid field
      // shipped as an ordinary corner-hugged headline here while the
      // reviewed build had it spanning the st9/st10 boundary. Ported
      // verbatim — including the fact that the spanning `hh` consumes NO
      // rHeadline() draw and `headLeft` bypasses cornerX(), which is what
      // keeps this station's seeded stream in step with the other build.
      // See that file's own comment for the full reasoning.
      const isSpanningField = st.prim === 'asteroidField'
      const hw = isSpanningField ? lerp(900, 1300, rHeadline())
        : st.prim === 'ribbon' ? lerp(1600, 2000, rHeadline())
        // 2026-08-13: synced from world-07-ring.html — streak's visual
        // length is its width (Ben, st7: "doesn't have a major asset").
        : st.prim === 'streak' ? lerp(860, 1180, rHeadline())
          : lerp(576, 880, rHeadline()) * (st.prim === 'pulsar' ? 0.78 : 1)
      const hh = st.prim === 'streak' ? hw * 0.30
        : st.prim === 'ribbon' ? hw * 0.34
        : isSpanningField ? hw * 0.42
          : hw * (0.62 + rHeadline() * 0.26)
      const alpha = lerp(0.34, 0.55, lou)
      const head = dom.makePrim(st.prim, hw, hh, st.hue, alpha, rHeadline, true, fill, st.variant) // isHeadline: only per-station breathe (spec §8); variant: per-station prim treatment (st3's dust ring)
      // 2026-08-12: synced from world-07-ring.html — this file was still on
      // the pre-corner-bias uniform draw ([0.08,0.98] of remaining travel
      // room, the very formula that measured mean centroid x=920 but still
      // read as "top-center, not a corner" per Ben's st0 complaint on the
      // OTHER build). Now shares ringPrimitives.js's `cornerX` — a fixed
      // pixel margin from the frame edge instead of a fraction of
      // remaining space, so the corner-push effect doesn't dilute for wide
      // headlines. See that function's own comment for the full history.
      // 2026-08-12: synced from world-07-ring.html — optional per-station
      // `bandUpper` override (st11, Ben: "move to bottom right"), same
      // pattern as `cornerLeft`. Draw still always happens.
      const pairBandDraw = rPairBand() < 0.5
      const pairUpper = st.bandUpper !== undefined ? st.bandUpper : pairBandDraw // shared band draw — see bandY's forceUpper comment (spec §7.5)
      // Corner choice drawn explicitly (not inside cornerX) so the
      // occluder below can read it and place itself at the opposite corner.
      // 2026-08-12: synced from world-07-ring.html — optional per-station
      // `cornerLeft` override (st6, Ben: "needs to be on other bottom
      // corner"), same pattern as the existing `ring`/`accent` flags. The
      // draw still always happens so this station's rHeadline stream
      // count is identical whether or not it's overridden.
      const cornerDraw = rHeadline() < 0.5
      const headlineCornerLeft = st.cornerLeft !== undefined ? st.cornerLeft : cornerDraw
      // 2026-08-26 (ring-verify Bug C): boundary-centered placement put
      // exactly 50% of this headline's box outside st9's own frame — the
      // bleed check's own "ACCIDENTAL CLIP (>35%)" call, confirmed real by
      // design-council review, not the deliberate 10-35% corner-bleed the
      // rest of the ring uses. Reverted to the same cornerX() every other
      // headline uses (isSpanningField still governs this station's size
      // tier/aspect below — only its POSITION was the bug).
      let headLeft = dom.cornerX(rHeadline, hw, x0, headlineCornerLeft)
      // 2026-08-13: synced from world-07-ring.html — `planet` centers its
      // min(w,h) disc in a wider box, leaving ~(hw-hh)/2 of dead horizontal
      // inset between the box edge (which cornerX corner-hugs) and the
      // visible disc edge. Shift the box by that inset so the DISC edge
      // lands at cornerX's own margin (Ben, st4: "more towards corner").
      // See that file's identical comment for the full reasoning.
      if (st.prim === 'planet') {
        const discInset = (hw - Math.min(hw, hh)) / 2
        headLeft += headlineCornerLeft ? -discInset : discInset
        // 2026-08-13: synced from world-07-ring.html — the planet's d-glow
        // halo overflows the disc (GLOW_FRAC=1.35, mirrored here) and its
        // brightest band crossed the station boundary, painting a bright
        // arc on the NEIGHBOR station's slide (Ben, st4: "half on one page
        // half on other"). Soft-mask only the glow at the boundary; see
        // that file's identical comment for the full reasoning.
        const discSize = Math.min(hw, hh)
        const glowLeft = headLeft + (hw - discSize) / 2 + (discSize - discSize * 1.35) / 2
        const glowW = discSize * 1.35
        const glowEl2 = head.querySelector('[class*="d-glow"]')
        if (glowEl2) {
          const FEATHER = 24
          // 2026-08-24: drawPlanetDisc now sets its own mask on this same
          // element (the dark-side glow falloff — see its glowMask comment).
          // Assigning here used to OVERWRITE it, silently restoring the
          // full-wrap corona this station was flagged for. Stack instead:
          // multi-layer mask + intersect composite multiplies the two.
          const stackMask = (m) => {
            const prev = glowEl2.style.maskImage
            const combined = prev ? `${prev}, ${m}` : m
            glowEl2.style.maskImage = combined; glowEl2.style.webkitMaskImage = combined
            if (prev) { glowEl2.style.maskComposite = 'intersect'; glowEl2.style.webkitMaskComposite = 'source-in' }
          }
          if (headlineCornerLeft && glowLeft < x0) {
            const b = x0 - glowLeft
            stackMask(`linear-gradient(to right, transparent ${b.toFixed(0)}px, black ${(b + FEATHER).toFixed(0)}px)`)
          } else if (!headlineCornerLeft && glowLeft + glowW > x0 + ENGINE.W) {
            const b = (x0 + ENGINE.W) - glowLeft
            stackMask(`linear-gradient(to right, black ${(b - FEATHER).toFixed(0)}px, transparent ${b.toFixed(0)}px)`)
          }
        }
      }
      // 2026-08-13: synced from world-07-ring.html — same dead-padding fix
      // as `planet` above, for `ring` (st0). See that file's identical
      // comment for the full reasoning.
      if (st.prim === 'ring') {
        const ringBodySize = Math.min(hw, hh) * 0.52
        const ringRx = Math.min(ringBodySize * (st.variant === 'dust' ? 1.22 : 1.08), hw / 2 - 4)
        const discInset = hw / 2 - ringRx
        headLeft += headlineCornerLeft ? -discInset : discInset
      }
      // 2026-08-13: synced from world-07-ring.html — same dead-padding fix
      // for `dots` (st2, Ben: "move closer to corner"): the cluster's dense
      // mass is centered in the box (~0.28*hw reach), so shift the box until
      // the mass edge, not the box edge, sits at cornerX's margin. See that
      // file's identical comment for the measurement.
      if (st.prim === 'dots') {
        const discInset = hw / 2 - hw * 0.28
        headLeft += headlineCornerLeft ? -discInset : discInset
      }
      // skipMinBleed dropped with the headLeft fix above — it existed only
      // to keep the old boundary-centered placement's ~50% horizontal crop
      // from stacking with the normal forced vertical bleed and going even
      // further past the 35% cap. Normal cornerX placement doesn't need it.
      const headTop = dom.bandY(rHeadline, hh, pairUpper, dom.rotatedBandH(st.prim, hw, hh))
      head.style.left = px(headLeft)
      head.style.top = px(headTop)
      host.appendChild(head)
      // 2026-08-12 round 2 (Ben, st10: "put this more towards corner") —
      // synced from world-07-ring.html. `spikes` centers its core+rays
      // dead-on at 50%/50% via CSS regardless of where the frame itself
      // sits, so a corner-tucked frame still reads as "somewhere in the
      // quadrant." Nudge just the core+ray group toward the frame's own
      // corner post-hoc — see that file's own comment for the full reasoning.
      if (st.prim === 'spikes') {
        const cxPct = headlineCornerLeft ? 30 : 70, cyPct = pairUpper ? 30 : 70
        head.querySelectorAll('[class*="s-core"], [class*="s-spk"]').forEach((n) => {
          n.style.left = cxPct + '%'; n.style.top = cyPct + '%'
        })
        // 2026-08-12 round 3 (Ben, st10: "two assets, just need one") —
        // synced from world-07-ring.html: d-glow keeps its CSS `inset:0`
        // default (centers on the full frame) even after the core+rays
        // above shift toward the corner, reading as a second star. Recenter
        // it on the same corner point, same size as before.
        const glowEl = head.querySelector('[class*="d-glow"]')
        if (glowEl) {
          glowEl.style.inset = 'auto'
          glowEl.style.width = px(hw); glowEl.style.height = px(hh)
          glowEl.style.left = px(hw * cxPct / 100 - hw / 2)
          glowEl.style.top = px(hh * cyPct / 100 - hh / 2)
        }
      }
      const headCx = headLeft + hw / 2, headCy = headTop + hh / 2

      // ── SKY-REGION SOURCE GLOW (2026-08-16) ── synced from
      // world-07-ring.html. Only the region's own `regionSource` station
      // draws one: an enlarged, low-alpha light-field centred on that
      // station's headline object and inserted BEFORE it, so the object
      // (and every element appended after it) silhouettes in front of the
      // light instead of being painted over by it. This is the "why is the
      // sky green here" half of the region — the sky tint itself lives on
      // the never-transformed sky layer (see the mount effect below).
      // Station-box sized + edge-feathered inside makeSourceGlow so a
      // corner-anchored headline's glow can't spill onto the neighbouring
      // slide (the mask also stops it painting over the PREVIOUS station's
      // objects, which sharing this mid-layer host would otherwise allow).
      if (st.regionSource && SKY_REGIONS[st.region]) {
        // Visual centre, not box centre: `spikes` re-centres its core+rays
        // (and its own d-glow) on the corner point above, so the light has
        // to follow them or it reads as a second, offset source.
        let gcx = headCx, gcy = headCy
        if (st.prim === 'spikes') {
          gcx = headLeft + hw * (headlineCornerLeft ? 0.30 : 0.70)
          gcy = headTop + hh * (pairUpper ? 0.30 : 0.70)
        }
        host.insertBefore(dom.makeSourceGlow(st.region, regionHues[st.region], x0, gcx, gcy, Math.max(hw, hh)), head)
      }

      // The per-station wash block that used to sit here (radial ellipse
      // dome, `greenWash`/`orangeWash`, four rounds of geometry/alpha
      // tuning) is DELETED 2026-08-16 in both builds — full history in git,
      // reasoning in ringPrimitives.js's SKY_REGIONS comment. Do not
      // reintroduce a colored box on the mid layer: that layer is exactly
      // what made the color slide in with the pan instead of settling after
      // it.

      // Any station with `ring:true` in its data — see world-07-ring.html's
      // identical comment (same fix, both builds, /simplify's station-data-
      // flag generalization) and makeNebulaRing's own comment in
      // ringPrimitives.js.
      // 2026-08-12: synced from world-07-ring.html — uniform 1.30x scale
      // centered exactly on the blob's own core reads as an eyeball (Ben:
      // "woah, what is that???? not a fan"). Uneven axis scale + an offset
      // off-center breaks the concentric iris/pupil read.
      if (st.ring) {
        const nrW = hw * 1.55, nrH = hh * 0.95
        const nring = dom.makeNebulaRing(nrW, nrH, st.hue, fill)
        nring.style.left = px(headCx - nrW / 2 + hw * 0.16)
        nring.style.top = px(headCy - nrH / 2 - hh * 0.10)
        host.appendChild(nring)
      }

      // one feature-tier companion — this IS the station's declared pair
      // (spec §7.5): two elements linked by a shared visual property, not
      // two independent random placements (a collage, not a pair). Shared
      // property: hue echo within ±18° for non-accent stations (inside the
      // spec's 20° budget); accent stations intentionally push the
      // companion hue ~168° away (the world's one complementary-accent
      // mechanic), so hue can't carry the pair there — the connecting
      // bridge does, drawn for accent stations regardless of hue.
      // 2026-08-12: synced from world-07-ring.html — this file was still on
      // the old proximity-orbit placement (pairAng/pairRad around the
      // headline's own centroid), never ported the st1/st3 clearance fix
      // either. Superseded entirely: Ben, fresh review, generalizing st0's
      // specific complaint — "two items squished together in the same
      // corner is no bueno — ie a spiral not by a planet." Once headlines
      // are corner-anchored, keeping the companion close means jamming two
      // objects into the same corner. The pairing signal (hue-echo/bridge)
      // never depended on physical closeness, so companion now takes the
      // OPPOSITE corner from its headline — same treatment as the
      // occluder below.
      // noCompanion (st5 pulsar, 2026-08-13): synced from world-07-ring.html
      // — see that file's identical comment for the full reasoning (round-6
      // mis-marked this station's own companion as neighbor bleed).
      if (!st.noCompanion) {
        const others = ['blob', 'dots', 'lens', 'streak'].filter(k => k !== st.prim)
        const rolled = others[Math.floor(rCompanion() * others.length)]
        // companionKind (st1, 2026-08-13): synced from world-07-ring.html —
        // forces st1's companion to 'dots' instead of the rolled 'blob',
        // see that file's identical comment.
        const ck = st.companionKind || rolled
        // companionBoost (st6/st7, 2026-08-13): synced from
        // world-07-ring.html — see that file's identical comment. Both
        // stations sit at the ARC trough, so the loudness-driven alpha
        // bottomed out invisible; floors applied AFTER the seeded rolls
        // (same rCompanion() call count, no stream reshuffle).
        // 2026-08-13 round 2: same floors extended to EVERY lens companion
        // (`ck === 'lens'`), synced from world-07-ring.html — see that
        // file's identical comment. Math.max is idempotent, so st7
        // (flag + lens) doesn't double-apply.
        const cwRoll = lerp(230, 420, rCompanion())
        const boostComp = st.companionBoost || ck === 'lens'
        const cw = boostComp ? Math.max(cwRoll, 380) : cwRoll
        const ch = ck === 'streak' ? cw * 0.30 : cw * (0.60 + rCompanion() * 0.28)
        // 2026-09-02 palette-aware, synced with world-07-ring.html: an accent's
        // companion is now the farthest hue anchor, not a fixed +168. Same
        // rCompanion() call count — the lerp only ever evaluated on the
        // non-accent branch, and still does.
        const compHue = st.accent
          ? accentCompanionHue(st.hue, world.hueAnchors)
          : st.hue + lerp(-18, 18, rCompanion())
        const compAlphaRoll = lerp(0.30, 0.48, lou) * 0.8
        const compAlpha = boostComp ? Math.max(compAlphaRoll, 0.55) : compAlphaRoll
        const comp = dom.makePrim(ck, cw, ch, compHue, compAlpha, rCompanion, false, fill)
        const compLeft = dom.cornerX(rCompanion, cw, x0, !headlineCornerLeft)
        // companionUpper (st2, 2026-08-14): synced from world-07-ring.html —
        // per-station band override (true = upper); unset keeps !pairUpper,
        // the diagonal-opposite standing rule. See that file's comment.
        const compUpper = st.companionUpper !== undefined ? st.companionUpper : !pairUpper
        const compTop = dom.bandY(rCompanion, ch, compUpper, dom.rotatedBandH(ck, cw, ch))
        comp.style.left = px(compLeft)
        comp.style.top = px(compTop)
        host.appendChild(comp)
      }

      // Pair-bridge connector: synced from world-07-ring.html, then
      // REMOVED OUTRIGHT there in the same pass — see that file's own
      // comment for the full history. Short version: it worked as a local
      // connector when the companion orbited near the headline; once the
      // companion moved to the diagonal-opposite corner, the same bridge
      // started spanning nearly the full frame diagonal instead. Ben,
      // fresh batch: "3-4 long lines not needed." Drops accent stations'
      // only spec §7.5 pairing signal — flagged in the other file, not
      // repeated here.

      // detail-tier specks, count follows loudness. k===0 is forced toward
      // the tier floor (spec §7.3 scale ladder): the worst-case headline
      // (576px) divided by a detail element that happened to draw near the
      // old ceiling (154px) measured at 3.7x — under the required >=6x.
      // Forcing one detail element per station into [58,70] guarantees
      // 576/70 = 8.2x even in the worst-case headline draw; the ladder no
      // longer depends on two independent random draws going its way.
      // maxDetail (2026-08-26, ring-verify Bug A: elements-per-station 2-5,
      // spec §1): loud stations' own headline+companion+dn(up to 4) already
      // sits at 6 before counting any neighbor-corner bleed — st0-4/9-12
      // measured 6-8. Detail dots are the one Feature-and-below tier not
      // protected by the §7.5 declared-pair rule (headline/companion stay
      // untouched), so they're the surplus to trim. Per-station cap, not a
      // formula-wide cut, so untouched stations (already 2-5) keep their
      // loudness-scaled dot count exactly as before.
      const dn = Math.min(Math.round(lerp(1, 4, lou)), st.maxDetail ?? 4)
      for (let k = 0; k < dn; k++) {
        const dw = k === 0 ? lerp(58, 70, rDetail()) : lerp(58, 154, rDetail())
        const d = dom.makePrim('dots', dw, dw * 0.9, st.hue, lerp(0.34, 0.60, lou) * 0.7, rDetail, false, fill)
        // 2026-08-12 round 2 (Ben, st1: "too much going on") — synced from
        // world-07-ring.html: keeps ambient detail specks in the middle
        // 64% of frame width, clear of the corner zones headline/companion/
        // occluder already occupy, instead of a fully uniform [0,W] draw
        // that could land right on top of one by chance.
        d.style.left = px(x0 + lerp(0.18, 0.82, rDetail()) * engine.W - dw / 2)
        // 2026-08-14: synced from world-07-ring.html — skipMinBleed opts
        // these small ambient specks out of bandY's headline corner-bleed
        // floor (Ben: "star clusters... really close to the borders...
        // brought into the scene a little more"). See that file's comment.
        d.style.top = px(dom.bandY(rDetail, dw * 0.9, undefined, undefined, true))
        host.appendChild(d)
      }

      // fillCorner (st9 asteroid field, Ben: "need something here" on the
      // bottom-left) — synced from world-07-ring.html: the spanning-field
      // headline is centered on the st9/st10 boundary so this station's
      // own bottom-left corner stays bare; a small explicit dust cluster
      // fills it, outside the corner-avoiding detail loop above.
      if (st.fillCorner) {
        // 2026-08-12 round 3 (Ben: "need a planet here") — synced from
        // world-07-ring.html: swapped the dust speck for makeOccluder's
        // own small lit-planet disc.
        const fw = lerp(90, 130, rDetail())
        const fc = dom.makeOccluder(fw, st.hue + 20, fill)
        fc.style.left = px(x0 + engine.W * 0.10 - fw / 2)
        fc.style.top = px(engine.H * 0.84 - fw * 0.45)
        host.appendChild(fc)
      }

      // Spec §7.2 occlusion disc (the >=1-in-3-station subtractive planet-
      // disc) removed 2026-08-13, Ben's explicit call — see the
      // occluderStations removal note above this station loop for why.
    }
  }

  else if (L.id === 'near') {
    /* fast and anonymous — the layer that sells the turn */
    dom.buildStars(host, period, 26, 1.5, 0xBEEF)
  }
}

const isReduced = () =>
  typeof window !== 'undefined' && window.matchMedia &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

// Sentinel value for the `stationOverride` prop: "go back to the station you
// were on before the last numeric override sent you away." A sentinel rather
// than a second prop or a ref threaded through ParticleBackground — the
// station being returned to is this component's own private state (stationRef),
// so the caller never has to learn a number it couldn't act on anyway.
export const RING_RETURN = 'return'

// worldData shape: { id, type, name, phase, sky: [4 hex], qColours: [2 hex],
// stations: [PANES x {key,prim,hue,accent}] } — see concepts/world-07-ring.html's
// own WORLD literal. qColours is accepted but unused here (question-colour
// styling belongs to the out-of-scope question-rendering system).
const RingAmbient = forwardRef(function RingAmbient({ worldData, slideIndex, stationOverride, showStationDebug = false }, ref) {
  // The ground behind the stage. Was a hardcoded '#01010a' — a blue-black
  // tuned to the purple world, which stayed blue-black under every recolour.
  // The sky ramp's terminal stop is the same near-black, already generated
  // from the palette (scripts/ring-recolor.mjs), so this reuses it instead of
  // being a fourth colour to keep in sync. Falls back to black if a world
  // ships a short sky.
  const BACKDROP = worldData.sky[worldData.sky.length - 1] ?? '#000000'
  const stageElRef = useRef(null)
  const designElRef = useRef(null)
  const surgeElsRef = useRef({})
  const scrimElRef = useRef(null)
  const arcRef = useRef(null)
  const offsetRef = useRef({})
  const stationRef = useRef(0)
  const debugLabelRef = useRef(null)
  const busyRef = useRef(false)
  const queuedTurnsRef = useRef([]) // queued turn() directions (+1/-1), drained one per unlock()
  const turnTimerRef = useRef(null)
  const shootLaneRef = useRef(null)
  const shootTimerRef = useRef(null)
  const skyTintsRef = useRef(null)
  const skyWeightsRef = useRef(null)

  // One choke point so turn()/jumpTo() can't drift on the animate flag —
  // turns animate (that's the whole effect), jumps snap (authoritative
  // resync, and the only path ring-verify.mjs drives; see applySkyTints).
  function writeSkyTints(station, animate) {
    if (skyTintsRef.current && skyWeightsRef.current) {
      applySkyTints(skyTintsRef.current, skyWeightsRef.current, station, animate)
    }
  }

  // ── build once on mount — never re-run on worldData change. This is the
  // whole point of the task: RingAmbient will eventually live inside
  // ParticleBackground, which mounts once per show and must never rebuild
  // its DOM mid-session. ──
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    const stage = stageElRef.current
    const design = designElRef.current
    if (!stage || !design) return

    // 2026-08-17, Ben, live: a real gap opened at the bottom of the frame on
    // any viewport narrower-than-16:9 (taller relative to width) — a 2000x1300
    // window (1.54:1) left ~175px uncovered. Root cause: this only ever
    // scaled off WIDTH, so a stage taller than 16:9-of-its-width never got
    // covered on the extra height. Cover-fit instead of width-fit: take
    // whichever axis needs the BIGGER scale so the design canvas always
    // covers the full stage regardless of its aspect ratio, same as CSS
    // `object-fit: cover` — the design can now overflow slightly on the
    // other axis, which ring-stage's own overflow:hidden already clips.
    function fit() {
      const s = Math.max(stage.clientWidth / ENGINE.W, stage.clientHeight / ENGINE.H)
      design.style.transform = `scale(${s})`
    }
    const ro = new ResizeObserver(fit)
    ro.observe(stage)
    fit()

    const arc = buildArc(ENGINE, worldData)

    // sky layer — bare, never transformed, never offset. The region tint
    // layers live HERE, above .void and below every content layer, which is
    // the entire mechanism: the sky is the one thing that doesn't slide with
    // the pan, so a color change on it can't arrive as a wipe. Its own
    // opacity transition is the "own slower clock" (ringPrimitives.js's
    // SKY_TINT_IN_MS/OUT_MS).
    const sky = dom.el('lyr')
    const skyInner = dom.el('surge')
    skyInner.style.transition = 'none'
    skyInner.appendChild(dom.el('void'))
    const skyTints = dom.makeSkyTints(skyRegionHues(worldData.stations)) // 2026-09-02 palette-aware, synced with world-07-ring.html
    for (const t of Object.values(skyTints)) skyInner.appendChild(t)
    skyTintsRef.current = skyTints
    skyWeightsRef.current = skyRegionWeights(worldData.stations)
    sky.appendChild(skyInner)
    design.appendChild(sky)

    const surgeEls = {}
    for (const L of ENGINE.LAYERS) {
      if (L.id === 'sky') continue
      const cyl = cylinderOf(ENGINE, L)
      const period = authorPeriodOf(ENGINE, L)
      const lyr = dom.el('lyr')
      const surge = dom.el('surge')
      surge.style.width = px(cyl + ENGINE.W)
      lyr.appendChild(surge)
      design.appendChild(lyr)

      // author one period, then repeat it m+1 times. The extra copy covers
      // the window that hangs past the cylinder just before it wraps.
      const proto = dom.el(''); proto.style.position = 'absolute'; proto.style.inset = '0'
      buildLayerContent(ENGINE, worldData, arc, proto, L)
      for (let k = 0; k <= L.m; k++) {
        const copy = k === 0 ? proto : proto.cloneNode(true)
        copy.style.position = 'absolute'
        copy.style.left = px(k * period)
        copy.style.top = '0'
        copy.style.width = px(period)
        surge.appendChild(copy)
      }
      surgeEls[L.id] = surge
      offsetRef.current[L.id] = 0
    }
    surgeElsRef.current = surgeEls
    arcRef.current = arc

    // shooting-star lane — 2026-08-12, ported from world-07-ring.html (Ben:
    // "lean more into shooting star concept"). Appended before the scrim
    // below, same relative order as the reference build's own
    // `design.insertBefore(shootLane, qScrim)` — the scrim still dims
    // shoots the same as every other ring layer.
    const shootLane = dom.el('shootLane')
    design.appendChild(shootLane)
    shootLaneRef.current = shootLane

    // scrim (ART-DIRECTION-SPEC.md sec 2: "alpha must reach exactly zero
    // strictly inside its own element bounds, on every axis"). Appended
    // last, so it paints above every ring content layer (matches
    // world-07-ring.html's own insertBefore(layer, qScrim) ordering — every
    // layer lands before the scrim in DOM order, this component just gets
    // there by being last to append instead). FULL FRAME, no fitted box —
    // a 2026-08-08 fitted box (-14% inset, y230-850, ~4:1 aspect) clipped
    // the ellipse's own falloff at the box edge before it reached
    // transparent (confirmed by rendering it: a hard horizontal seam,
    // exactly the "dead stripe" the old elliptical-never-a-band rule meant
    // to prevent). A full 1920x1080 element has no boundary inside the
    // frame to expose — its boundary IS the frame's — so the gradient
    // below just needs to fade out before ITS edges, not some inner box's.
    const scrim = dom.el('scrim')
    scrim.style.left = '0'
    scrim.style.top = '0'
    scrim.style.width = px(ENGINE.W)
    scrim.style.height = px(ENGINE.H)
    design.appendChild(scrim)
    scrimElRef.current = scrim
    layoutScrim(stationRef.current)
    writeSkyTints(stationRef.current, false) // initial state snaps, same as the scrim's

    stage.style.setProperty('--surge-ms', ENGINE.SURGE_MS + 'ms')
    worldData.sky.forEach((c, i) => stage.style.setProperty('--sky-' + (i + 1), c))
    // Same mechanism, one line down: the world's near-white tints (star
    // temperatures, hot cores, the comet glare). Absent → ringPrimitives'
    // BASE_TINTS defaults inside each var() stand, unchanged.
    applyTints(stage, worldData.tints)

    writeOffsets()
    shootLoop()

    // Exposed for concepts/tools/ring-verify.mjs's live-route pass — mirrors the
    // reference build's own window.__world contract (concepts/world-07-ring.html,
    // bottom of its <script>) so the gate can drive/measure the component that
    // actually ships instead of only the standalone HTML file. turn/jumpTo are
    // function declarations elsewhere in this component body (hoisted, so they
    // exist by the time this effect runs); station/offset stay live getters so the
    // gate always reads current state, not a snapshot from mount time.
    // cylinderOf/authorPeriodOf are re-curried to the reference build's own
    // single-argument shape (`cylinderOf(L)`, closing over ENGINE) rather than
    // exposed as ringEngine.js's real two-argument `(engine, layer)` signature —
    // the gate calls `w.cylinderOf(L)` identically against both passes, and this
    // is the one place that has to bridge the difference, not the gate.
    window.__world = {
      ENGINE, WORLD: worldData, ARC: arc,
      cylinderOf: (L) => cylinderOf(ENGINE, L),
      authorPeriodOf: (L) => authorPeriodOf(ENGINE, L),
      get station() { return stationRef.current },
      get offset() { return offsetRef.current },
      jumpTo, turn,
    }

    // React 18 StrictMode double-invokes this effect in dev; clear what we
    // built so the second invocation doesn't append a duplicate DOM tree.
    return () => {
      ro.disconnect()
      clearTimeout(shootTimerRef.current)
      // turn()'s in-flight unlock timer (~SURGE_MS+60) would otherwise fire
      // post-unmount and call unlock() on null refs, throwing inside
      // dom.clampSafeBoxStarPeaks(designElRef.current).
      clearTimeout(turnTimerRef.current)
      design.replaceChildren()
      if (window.__world && window.__world.WORLD === worldData) delete window.__world
    }
  }, [])

  // Advances one station per question change — or snaps straight to the
  // correct one when the change isn't a single adjacent step (a multi-slide
  // skip, or a Go Live that resumes mid-show). Single steps glide in BOTH
  // directions (2026-08-24, Ben: "why i cant go back and forth between ring
  // slides and have it be smooth" — Prev used to always snap): turn() takes
  // a direction now, and its backward branch pre-snaps across the wrap where
  // it has to (see turn()'s own willUnwrap comment) so a one-station glide
  // always travels over authored content. Multi-station moves still use
  // jumpTo(), which snaps rather than glides — the pan cylinders only carry
  // content for single-surge travel (see the stationOverride comment below).
  // Ben, 2026-08-21: clicking back
  // and forth in Dev Mode was cycling the ring forward every single time
  // regardless of direction — this used to fire turn() on ANY slideKey
  // change, with no idea which way the show had actually moved. Keyed on
  // slideIndex (not slideKey) so "which way" and "how far" are answerable
  // at all — station === slideIndex % PANES is the system's own stated
  // invariant (see jumpTo's comment), this just actually enforces it for
  // every transition, not only single-step ones.
  //
  // Guards on the last index actually seen rather than a first-run boolean,
  // so StrictMode's dev double-invoke can't fire a spurious extra turn (the
  // second invocation sees prev already === slideIndex and no-ops).
  //
  // useLayoutEffect, not useEffect (2026-08-21, Ben: "a stale ambient
  // background pops up first for a quick second" on Go Live): a plain
  // useEffect fires AFTER the browser paints, so on the very first render
  // where DisplayInner shows a real slide, that first paint happened with
  // the ring still sitting at whatever station it was idling on through
  // PreShowScreen — the correcting jumpTo() only landed a frame later,
  // which read as a stale-background flash. This is the same class of bug
  // slideId's own lag fix (in Display.jsx) already fixed one layer up —
  // that one made the PROP arrive on time; this makes what RingAmbient DOES
  // with it happen before paint too. useLayoutEffect runs synchronously
  // after DOM mutations but before the browser paints, so the jump/turn is
  // already applied by the time anything is shown.
  const lastSlideIndexRef = useRef(slideIndex)
  useLayoutEffect(() => {
    // == null: also catches an explicit null from a future call site, not just undefined
    if (slideIndex == null) return
    const prev = lastSlideIndexRef.current
    lastSlideIndexRef.current = slideIndex
    // Decision table lives in ringNavAction (pure, unit-tested): single
    // steps glide either way, everything else jumps. 'jump' also covers
    // prev == null — first real slide, align even if Go Live resumed mid-show.
    const action = ringNavAction(prev, slideIndex)
    if (action === 'turn') turn()
    else if (action === 'turn-back') turn(-1)
    else if (action === 'jump') jumpTo(slideIndex)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slideIndex])

  // ── Station override: the jukebox grading-break's dedicated slot ──
  // Every other caller advances the ring by exactly one station per slide.
  // The break is the one moment that must land on a SPECIFIC station (10, the
  // record — see Display.jsx's MUSIC_STATION) no matter where the rotation
  // happens to be, so it is the one caller that jumps instead of turning.
  //
  // jumpTo() snaps rather than glides, and that is deliberate rather than a
  // shortcut: each layer's pan cylinder is authored exactly `cylinder +
  // ENGINE.W` wide — ONE spare frame, which is what makes the 12->0 wrap able
  // to glide to an un-modded target. Travelling an arbitrary 0-12 stations
  // has no authored content to glide across, so a "smooth" multi-station
  // version would pan over blank cylinder. Display.jsx flips this prop in the
  // same React commit that mounts the opaque JukeboxBreakOverlay, so the snap
  // lands under cover — the same trick turn()'s own post-wrap modulo reset
  // uses.
  //
  // Contract for the jukebox-side layer (jukebox-ring-fusion branch): by the
  // time that overlay paints, stationRef is MUSIC_STATION (10), the record is
  // the station in frame, and the disco sky tint is at full weight (snapped,
  // not transitioning — jumpTo passes animate:false, see applySkyTints).
  //
  // 2026-08-17 (Ben) — the override is now a ROUND TRIP, not a one-way jump:
  // "like the grading break itself has an Sx station tied to it. then after
  // the slide is there for 10 seconds, it 'warps' to the jukebox, then when
  // done, warps back to round 2 slide Sx." A numeric override records the
  // station it is leaving (Sx — read straight off stationRef, so it is always
  // whatever the slide's own turn() organically landed on, never a guess or a
  // slide-index derivation that could drift), then jumps. RING_RETURN jumps
  // back to it. Display.jsx plays WarpTransition over both, so neither snap is
  // seen; this component still just snaps, same as before.
  //
  // The `station === slideIndex % PANES` invariant that turn()'s comment names:
  // the JUMP already broke it, and this narrows the damage rather than adding
  // to it. Before, the ring resumed forward rotation from station 10 and every
  // later station was permanently offset by an arbitrary amount. Now the only
  // residual is -1 per grading break — the break slide and the round-2 slide
  // that follows it both render Sx — which is Ben's explicit call here. Safe to
  // violate: the invariant is an art-direction property (every slide gets a
  // fresh station), not a correctness assumption. Nothing reads station except
  // layoutScrim/writeSkyTints/the debug label, jumpTo() walks whole surges so
  // offsets stay self-consistent, and ring-verify.mjs drives its own jumpTo()
  // path and never sees this prop.
  const returnStationRef = useRef(null)
  useEffect(() => {
    if (stationOverride == null) return
    if (stationOverride === RING_RETURN) {
      // Never left (a return with no outbound jump — e.g. a break skipped
      // before its warp finished): nothing to come back to, so hold still
      // rather than jumping somewhere stale.
      if (returnStationRef.current == null) return
      jumpTo(returnStationRef.current)
      returnStationRef.current = null
      return
    }
    returnStationRef.current = stationRef.current
    jumpTo(stationOverride)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stationOverride])

  function writeOffsets() {
    const surgeEls = surgeElsRef.current
    const offset = offsetRef.current
    for (const L of ENGINE.LAYERS) {
      if (L.id === 'sky') continue
      const surgeEl = surgeEls[L.id]
      if (surgeEl) surgeEl.style.transform = `translate3d(${-offset[L.id]}px,0,0)`
    }
  }

  // ── SHOOTING STAR ── ported from world-07-ring.html's spawnShoot()/
  // shootLoop() verbatim (2026-08-12, Ben: "lean more into shooting star
  // concept"), adapted to refs instead of module-level `let`s/`window.
  // __shootLane` since this is a React component, not a page script.
  // 2026-08-14 (Ben, live on the world-07-ring.html harness — synced here
  // since this is a verbatim port; see that file's identical comment for
  // the full back-and-forth): two distinct event types, not one behavior.
  // A lone spawnShoot() picks its own random direction every call, same as
  // before this whole round. A separate, rarer spawnMeteorShower() fires
  // 3-4 staggered shoots that all share ONE direction picked once per burst
  // ("i was speaking only in terms of a meteor shower where three play back
  // to back to back. the others can be any direction").
  // Three visual tiers instead of one fixed recipe — a rendering-based audit
  // (2026-08-16) found position/timing genuinely random but size/brightness/
  // speed identical on every single spawn, and named THAT (not placement) as
  // the actual "every meteor is the same meteor" mechanical-feeling culprit.
  // Weighted so most stays unobtrusive background motion and only a few per
  // hour actually grab a look. distMul/durMul scale the existing random
  // ranges rather than replacing them, so each tier still has its own spread.
  // 2026-08-16 rebalance: the first pass (60/35/5 @ 150px/0.55 spark) traded
  // away overall presence for variety — a hyper-critique measured its
  // weighted visible-mass proxy (w*h*opacity) at ~63% of the pre-tier
  // baseline, directly against Ben's earlier "lean more into shooting star
  // concept" (2026-08-12). He confirmed tonight: wants variety AND
  // visibility, not a trade-off. Spark boosted and reweighted toward the
  // brighter tiers — same proxy math now lands ~105% of baseline while
  // keeping three genuinely distinct tiers (364 / 872 / 2688).
  const SHOOT_TIERS = [
    { weight: 0.45, w: 200, h: 2.6, opPeak: 0.70, opMid: 0.58, durMul: 0.78, distMul: 0.70 },
    { weight: 0.40, w: 270, h: 3.4, opPeak: 0.95, opMid: 0.85, durMul: 1.00, distMul: 1.00 },
    { weight: 0.15, w: 480, h: 5.6, opPeak: 1.00, opMid: 0.95, durMul: 1.55, distMul: 1.35 },
  ]
  // anchorPos: undefined for a lone spawnShoot (full-frame random, as
  // before). A meteor shower passes the FIRST star's own landed position as
  // the anchor for every star after it (2026-08-17, Ben, live: "the
  // shooting stars weren't tightly grouped together enough... starting
  // point like 15% circle around the first one") — sqrt(random) for an
  // area-uniform pick inside the circle, not a linear radius (linear would
  // bunch points near the center). Returns the position it landed on so the
  // caller can thread it forward as the next star's anchor.
  function spawnShoot(forceDir, anchorPos) {
    if (isReduced()) return
    const lane = shootLaneRef.current
    if (!lane) return
    // Inlined rather than a separate pickShootTier() — the concept HTML's
    // static no-stray-math-random gate only sanctions Math.random() calls
    // textually inside spawnShoot/shootLoop/spawnMeteorShower; synced here
    // for consistency even though this file isn't itself gate-scanned.
    let tr = Math.random(), tier = SHOOT_TIERS[SHOOT_TIERS.length - 1]
    for (const t of SHOOT_TIERS) { tr -= t.weight; if (tr <= 0) { tier = t; break } }
    const rot = dom.el('shootRot'), s = dom.el('shoot'), d = forceDir ?? (Math.random() < 0.5 ? 1 : -1)
    if (d < 0) s.classList.add('rev') // see ringCss's own .shoot.rev comment — keeps the bright head leading
    let left, top
    if (anchorPos) {
      const radius = ENGINE.W * 0.15
      const ang = Math.random() * Math.PI * 2
      const r = Math.sqrt(Math.random()) * radius
      left = anchorPos.left + Math.cos(ang) * r
      top = anchorPos.top + Math.sin(ang) * r
    } else {
      left = d > 0 ? 140 + Math.random() * 500 : 1180 + Math.random() * 500
      top = 70 + Math.random() * 760
    }
    rot.style.left = px(left)
    rot.style.top = px(top)
    rot.style.setProperty('--sa', (d > 0 ? 1 : -1) * (14 + Math.random() * 16) + 'deg')
    s.style.setProperty('--sd2', px((d > 0 ? 1 : -1) * (640 + Math.random() * 380) * tier.distMul))
    s.style.setProperty('--sdu', ((1.5 + Math.random() * 1.2) * tier.durMul) + 's')
    s.style.setProperty('--sw', tier.w + 'px')
    s.style.setProperty('--sh', tier.h + 'px')
    s.style.setProperty('--s-op1', tier.opPeak)
    s.style.setProperty('--s-op2', tier.opMid)
    rot.appendChild(s); lane.appendChild(rot)
    // 2026-08-14: synced from world-07-ring.html — setTimeout fallback
    // removal (animationend has no guaranteed fire; a backgrounded/
    // throttled tab can pause a running animation before it completes, and
    // a shower spawning 3-4 at once turns a few stalled events into "10 on
    // screen"). See that file's identical comment.
    const dur = parseFloat(s.style.getPropertyValue('--sdu')) * 1000
    setTimeout(() => rot.remove(), dur + 800)
    s.addEventListener('animationend', () => rot.remove())
    return { left, top }
  }
  // Meteor shower: 3-4 shoots, one shared direction, staggered ~250-550ms
  // apart — close enough to feel like one event, far enough to read as
  // distinct streaks.
  function spawnMeteorShower() {
    if (isReduced()) return
    const dir = Math.random() < 0.5 ? 1 : -1
    const n = 3 + Math.round(Math.random()) // 3-4
    // 2026-08-16 (Ben, direct spec: "staggered 2-3 seconds apart"): was
    // k * (250 + rand*300) — a fresh random PER star instead of an
    // accumulating gap, so consecutive stars could land as close as ~144ms
    // apart (a hyper-critique measured this live) and read as a glitch, not
    // a shower. `delay` now accumulates a real 2-3s gap between each star.
    // 2026-08-17 (Ben, live: "the shooting stars weren't tightly grouped
    // together enough... within the same like area"): position was never
    // shared, only direction — each star picked its own full-frame spot.
    // First star still picks freely; anchorPos threads its landed position
    // forward so every star after it clusters within a 15%-of-frame-width
    // circle around the first (see spawnShoot's own comment). Safe under
    // the accumulating 2-3s delay because each timeout only fires once the
    // previous one has already run and reassigned anchorPos.
    let delay = 0
    let anchorPos
    for (let k = 0; k < n; k++) {
      setTimeout(() => { anchorPos = spawnShoot(dir, anchorPos) }, delay)
      delay += 2000 + Math.random() * 1000
    }
  }
  // ~1 in 5 cycles is a shower instead of a lone shoot — see
  // world-07-ring.html's identical SHOWER_CHANCE comment.
  const SHOWER_CHANCE = 0.20
  function shootLoop() {
    clearTimeout(shootTimerRef.current)
    const [a, b] = ENGINE.SHOOT_MS
    shootTimerRef.current = setTimeout(() => {
      if (Math.random() < SHOWER_CHANCE) spawnMeteorShower(); else spawnShoot()
      shootLoop()
    }, a + Math.random() * (b - a))
  }

  // scrim alpha only — geometry is fixed at mount (full frame, see the
  // build effect). Alpha formula mirrors world-07-ring.html's layoutScrim()
  // exactly: scale-free via loudnessOf(), so it moves with the arc
  // regardless of what ENGINE.ARC.lo/hi are.
  //
  // Ellipse 70%/62% of a 1920x1080 box: radii 1344x670px from centre.
  // Tuned empirically in two rounds against gates pulling opposite ways —
  // not derived from one formula, and not stable at either round-1 value:
  //   - rx (70%, unchanged since round 1) and the transparent stop (74%,
  //     994px) hold the frame-edge boundary-alpha check (must reach zero
  //     strictly inside the element's own 1920x1080 bounds — verified live,
  //     diff 0.9-1.0) while getting the safe box's own corner pixels
  //     (which sit past the 45% stop) into the gradient's reach at all.
  //   - ry alone (round 1: 50%, ry=540) got the OLD cap (p99.5<=72) to
  //     EXACTLY 72/72 — zero headroom, which is what the cap's own
  //     2026-08-09 retarget (<=68, WARN inside 4pts) exists to catch. 50%
  //     couldn't be pushed further without more room: it already equalled
  //     the frame's own half-height. Growing to 62% (670px, 130px past the
  //     frame's own 540px half-height on that axis) needs no compensating
  //     change to the transparent stop — the STOP is a fraction of ry too,
  //     so growing ry alone deepens near-safe-box coverage without moving
  //     where the vertical falloff completes in absolute pixels enough to
  //     threaten that axis's own edge (still verified live, not assumed).
  //     Round 2 measured: st0 p99.5 72 -> 62, six points of real margin
  //     under the new 68 cap, same bandY-style zero-headroom caveat this
  //     project has been burned by before — don't let a future change eat
  //     it back to zero without re-measuring.
  function layoutScrim(station) {
    const scrim = scrimElRef.current, arc = arcRef.current
    if (!scrim || !arc) return
    const a = lerp(0.30, 0.68, loudnessOf(arc, station))
    scrim.style.background = `radial-gradient(ellipse 70% 62% at 50% 50%,
      rgba(2,2,10,${a.toFixed(2)}) 0%, rgba(2,2,10,${(a * 0.75).toFixed(2)}) 45%,
      transparent 74%)`
  }

  // Offsets wrap modulo the layer's cylinder, and because every cylinder is
  // exactly 12 surges, all layers return to phase 0 together on turn 12.
  // 2026-08-16: the 12th turn (station 11 -> 0) GLIDES like the other 11.
  // The old wrap branch snapped offsets to 0 in a single frame — "content
  // at phase 0 is identical to phase cylinder" is true of the RESET but was
  // being applied to the TRAVEL (a rendering audit sampled 125-190
  // intermediate frames on every normal turn and exactly zero on the 12th).
  // Now the wrap animates to the un-modded target (offset + surge ===
  // cylinder — real content exists there; each layer's DOM is built
  // cyl + ENGINE.W wide with an m+1th content copy precisely to cover the
  // window hanging past the cylinder), and the modulo reset happens after
  // the transition completes, where the snap is genuinely invisible.
  // Reduced motion still snaps every turn, wrap included.
  //
  // Deliberate deviation from the reference build: the reference increments
  // `station` (and unlocks `busy`) inside land(), which the reduced-motion
  // branch calls immediately but the animate branch defers via a SECOND setTimeout
  // at ENGINE.Q.IN_START_MS (1150ms, ahead of the SURGE_MS+60 one) — timed
  // so the question text swap lands mid-transition, and unlocking `busy`
  // ~550ms before the CSS transition visually finishes. With the question
  // system out of scope for this component, there is no such constant to
  // defer to, so here `station` updates synchronously with `offset`, and
  // `busy` unlocks once, when the transition actually completes
  // (SURGE_MS+60) — a caller-initiated turn during that window queues (see
  // below) rather than starting a second transition mid-animation. The
  // wrap-modulo math and the +1-mod-PANES increment itself are unchanged
  // from the reference.
  // A turn() received while busy queues instead of vanishing — the ring's
  // whole model depends on station always equaling slideIndex % PANES, so a
  // rapid double-advance (a real thing a host does) must never drop a turn
  // silently. See concepts/ART-DIRECTION-SPEC.md §8. unlock() is the single
  // choke point both busy-clearing sites below call through, so a queued
  // turn drains exactly once busy actually frees up.
  function unlock() {
    busyRef.current = false
    dom.clampSafeBoxStarPeaks(designElRef.current) // item 3: re-clamp at rest, new station
    if (queuedTurnsRef.current.length > 0) {
      turn(queuedTurnsRef.current.shift())
    }
  }

  // dir: +1 (default — every pre-2026-08-24 caller, including ring-verify's
  // window.__world.turn()) glides one station forward; -1 glides one station
  // back (Prev between adjacent ring-visible slides — see the slideIndex
  // effect above). Still strictly single-station: multi-station moves stay
  // jumpTo()'s job.
  function turn(dir = 1) {
    if (busyRef.current) { queuedTurnsRef.current.push(dir); return }
    busyRef.current = true
    const stage = stageElRef.current
    const offset = offsetRef.current
    const willWrap = dir > 0 && ENGINE.LAYERS.some(L => L.id !== 'sky' &&
      offset[L.id] + L.surge >= cylinderOf(ENGINE, L))
    // Backward mirror of willWrap: a glide target below offset 0 would pan
    // the viewport over the unauthored space LEFT of each cylinder's x=0
    // (content only exists on [0, cylinder + spare frame]). Handled by the
    // pre-snap below, so — unlike willWrap — nothing is deferred to the
    // transition-end timer: the subtraction itself lands the offsets back
    // in [0, cylinder).
    const willUnwrap = dir < 0 && ENGINE.LAYERS.some(L => L.id !== 'sky' &&
      offset[L.id] - L.surge < 0)

    if (isReduced()) {
      ENGINE.LAYERS.forEach(L => {
        if (L.id === 'sky') return
        const cyl = cylinderOf(ENGINE, L)
        offset[L.id] = ((offset[L.id] + dir * L.surge) % cyl + cyl) % cyl
      })
      stage.classList.remove('go')
      writeOffsets()
      // unlock() may drain a queued turn and re-add 'go' in this same
      // tick; without a forced reflow between the remove and that re-add,
      // the browser coalesces both writes into one paint and the wrap
      // animates as a visible rewind instead of snapping.
      void stage.offsetWidth
      stationRef.current = (stationRef.current + dir + ENGINE.PANES) % ENGINE.PANES
      if (debugLabelRef.current) debugLabelRef.current.textContent = `S${stationRef.current}`
      layoutScrim(stationRef.current)
      // Still animated on the wrap branch: the wrap snaps the PAN (a rewind
      // across a whole cylinder would read as one), but the sky is decoupled
      // from the pan by design — the ember region fading out across the
      // 11 -> 0 boundary is a real transition, not part of the jump the wrap
      // exists to hide.
      writeSkyTints(stationRef.current, !isReduced())
      unlock()
      return
    }

    if (willUnwrap) {
      // Invisible pre-snap — the backward wrap (station 0 -> 12), the mirror
      // of the forward wrap's deferred modulo reset, just run BEFORE the
      // glide instead of after it. At station 0 every offset is 0, and
      // offset === cylinder shows the exact same pixels: the viewport
      // [cylinder, cylinder + W] is the spare-frame content copy of [0, W] —
      // the same window every forward wrap glide already ends on, so this is
      // proven-authored territory, not an assumption. Snap there without a
      // transition ('go' off + forced reflow, same coalescing discipline as
      // the branches above), then the ordinary subtraction below glides
      // cylinder -> cylinder - surge over real content.
      stage.classList.remove('go')
      ENGINE.LAYERS.forEach(L => { if (L.id !== 'sky') offset[L.id] += cylinderOf(ENGINE, L) })
      writeOffsets()
      void stage.offsetWidth
    }

    stage.classList.add('go')
    ENGINE.LAYERS.forEach(L => { if (L.id !== 'sky') offset[L.id] += dir * L.surge })
    writeOffsets()
    stationRef.current = (stationRef.current + dir + ENGINE.PANES) % ENGINE.PANES
    if (debugLabelRef.current) debugLabelRef.current.textContent = `S${stationRef.current}`
    layoutScrim(stationRef.current)
    // Fired in the same tick the pan starts, but on a longer duration and a
    // milder curve, so the sky is still settling ~900ms after the pan lands.
    // Retargeting (a queued/rapid Stream-Deck turn landing mid-fade) is free
    // — it's a CSS transition, so it re-aims from wherever it currently is
    // rather than stacking a second animation.
    writeSkyTints(stationRef.current, true)
    turnTimerRef.current = setTimeout(() => {
      stage.classList.remove('go')
      if (willWrap) {
        // Invisible reset: the transition is over and 'go' was removed in
        // this same tick, so this transform write snaps rather than
        // animates. Forced reflow before unlock() — a drained queued turn
        // may re-add 'go' in the same tick (same coalescing hazard as the
        // reduced-motion branch above). busy stayed locked for the whole
        // glide, so a queued turn can never stack its surge on top of an
        // un-modded cylinder offset.
        ENGINE.LAYERS.forEach(L => { if (L.id !== 'sky') offset[L.id] %= cylinderOf(ENGINE, L) })
        writeOffsets()
        void stage.offsetWidth
      }
      unlock()
    }, ENGINE.SURGE_MS + 60)
  }

  function jumpTo(target) {
    // Authoritative resync: cancels any turn() this jump is interrupting
    // (and drops anything queued behind it), so a jump made mid-transition
    // can't be overshot by that turn still landing afterward.
    clearTimeout(turnTimerRef.current)
    busyRef.current = false
    queuedTurnsRef.current = []
    // stationRef only ever holds 0..PANES-1 — normalize first, or an
    // out-of-range/non-integer target (a raw slide index from a future
    // caller, an off-by-one, a stray float) never equals stationRef.current
    // and this loop spins forever.
    target = ((Math.trunc(target) % ENGINE.PANES) + ENGINE.PANES) % ENGINE.PANES
    const offset = offsetRef.current
    while (stationRef.current !== target) {
      ENGINE.LAYERS.forEach(L => { if (L.id !== 'sky') offset[L.id] = (offset[L.id] + L.surge) % cylinderOf(ENGINE, L) })
      stationRef.current = (stationRef.current + 1) % ENGINE.PANES
    }
    if (debugLabelRef.current) debugLabelRef.current.textContent = `S${stationRef.current}`
    // A jump that interrupts a wrap glide before its deferred modulo reset
    // can arrive here with offset === cylinder (legit mid-wrap state). Left
    // un-modded, the NEXT turn() would misread it as another wrap. No-op in
    // every other case (offsets already < cylinder).
    ENGINE.LAYERS.forEach(L => { if (L.id !== 'sky') offset[L.id] %= cylinderOf(ENGINE, L) })
    stageElRef.current.classList.remove('go')
    writeOffsets()
    layoutScrim(stationRef.current)
    writeSkyTints(stationRef.current, false) // snap — see applySkyTints on why a jump must not leave a transition in flight
    dom.clampSafeBoxStarPeaks(designElRef.current) // item 3: re-clamp at rest, new station
  }

  // turn/jumpTo close over refs only (stable identities), so the empty dep
  // array is safe — the handle never needs to be recomputed after mount.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useImperativeHandle(ref, () => ({
    turn,
    jumpTo,
    get station() { return stationRef.current },
  }), [])

  return (
    <div
      ref={stageElRef}
      className="ring-stage"
      aria-hidden
      // aspectRatio: '16/9' removed (2026-08-17, Ben, live) — with inset:0 in
      // a definite-size parent this doesn't act as a MINIMUM, it caps the
      // stage's own height to width*9/16, independent of the parent's real
      // height. On the real show TV (a true 1920x1080 16:9 panel) that cap
      // never bound anything since width*9/16 already equals the true
      // height. In any other window shape (any dev/preview browser window,
      // which is what actually surfaced this) it silently capped the stage
      // short and left the difference as bare, uncovered space below it —
      // the fit() cover-scale above can't reach space the stage itself never
      // claimed. inset:0 alone already does the right thing: fill the true
      // parent size on every aspect ratio, identical result on a real 16:9 TV.
      style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: BACKDROP, pointerEvents: 'none' }}
    >
      <style>{RING_CSS}</style>
      <div
        ref={designElRef}
        id="design"
        style={{ position: 'absolute', left: 0, top: 0, width: ENGINE.W, height: ENGINE.H, transformOrigin: '0 0', overflow: 'hidden' }}
      />
      {/* Debug station readout (2026-08-17, Ben: "a faux # somewhere so I
          know it's a transition from s0-s1") — plain DOM text, updated
          imperatively at the same 3 sites stationRef.current itself is
          written (turn()'s reduced/normal branches, jumpTo()), never React
          state — same "never a prop, never a re-render" rule as everything
          else on this component.
          Gated on showStationDebug (2026-08-17, Ben: doesn't want it visible
          during the actual show) — Display.jsx passes this only when
          isPreview is true, i.e. only in the host's own Preview tab, never on
          the venue TV route the audience actually sees. Safe to not mount at
          all otherwise: every imperative write to debugLabelRef.current
          above is already null-guarded (`if (debugLabelRef.current)`). */}
      {showStationDebug && (
        <div
          ref={debugLabelRef}
          style={{
            position: 'absolute', top: 8, left: 8, zIndex: 999,
            fontFamily: 'monospace', fontSize: 13, color: 'rgba(255,255,255,0.55)',
            textShadow: '0 1px 2px rgba(0,0,0,0.9)', pointerEvents: 'none',
          }}
        >
          S0
        </div>
      )}
    </div>
  )
})

export default RingAmbient
