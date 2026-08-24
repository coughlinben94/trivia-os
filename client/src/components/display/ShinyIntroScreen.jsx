import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion, cubicBezier } from 'framer-motion'
import { EASE_OUT } from '../../lib/easings.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../lib/shinyGold.js'
import { listSharedHostPhotos, pickPhotoForSlide, getUsedHostPhotoUrls } from '../../lib/hostPhotos.js'

// Every shiny question/grid gets a standalone beat before its content — a pure
// announcement, no question/answer/media yet, giving the host room to set
// up what's coming. Modeled on the deck's yellow "shiny round title card"
// slides (tilted handwritten-style title, Ben photo lower-left) but reworked
// to fit the app's per-show theme system instead of a hardcoded color, and
// to stay ambient rather than full-bleed — the ParticleBackground mounted
// behind every slide (Display.jsx) should still read through around the
// edges, not get covered by a flat color block.
//
// Entrance choreography ported from the approved WAAPI prototype
// (shiny-spin-land-drop.html, Ben-approved after two slow-down corrections):
// title spins in through ~1 tame rotation while scaling up, lands at
// LAND_T with a two-oscillation spring "boing", a gold burst ring + 8
// sparks fire at impact, then the host photo rockets up from below the frame
// — sequenced, not simultaneous. Keyframe values, offsets, and durations are
// the prototype's numbers (linear-eased tracks map exactly via Framer's
// times arrays). Two deliberate divergences: the burst/sparks fire AT the
// landing instant rather than the prototype's early-warped timing (see
// IMPACT_EASE note below), and the glow settles at full opacity to match
// this screen's shipped always-on wash instead of the prototype's 0.55.
//
// The format-icon badge (prototype "iconBadge" track) was removed from this
// screen 2026-08-17 (Ben: format icons are a backend/host-only affordance —
// they identify a format in the editor, not something the audience needs on
// the TV). `data.shinyFormatIcon` still exists and is still shown in
// RoundSidebar/AddSlideWizard/FormatLibrary — only this display-facing badge
// is gone.
//
// Shared by QuestionSlide.jsx (question type) and GridSlide.jsx (grid type)
// — any isShiny slide type can gate its content on `data.introDone` and
// render this first.

const LAND_T = 1.725 // s — moment of impact; every other element keys off this (prototype's 1725ms, 1.5x slow, Ben's call)
// Burst/spark easing — same bezier the prototype used, but the FORM matters:
// passing the raw [0.16,1,0.3,1] array routes Framer through its
// WAAPI-accelerated path, where (like the prototype's effect-level `easing`)
// the bezier warps the WHOLE iteration's progress — dragging the `times`
// offsets earlier, so the burst would fire ~290ms in, mid-spin. Passing a
// cubicBezier() FUNCTION forces main-thread pre-generated keyframes where
// the ease applies per-segment and `times` stay literal — burst fires
// ~1.4s, on the title's overshoot peak. We deliberately keep the function
// form: burst-on-impact is what the prototype's own beat sheet describes
// ("Impact. A gold burst ring flashes"), even though the prototype file
// Ben watched actually fired it early. Flagged for Ben's sign-off.
const IMPACT_EASE = cubicBezier(0.16, 1, 0.3, 1)

// Settle easings for the overshoot tails (title / icon badge / host photo).
//
// The three wobble tracks below used to pass a single `ease: 'linear'` across
// their whole multi-keyframe transition. Framer applies one easing per keyframe
// SEGMENT, so 'linear' meant every segment ran at constant velocity with an
// instantaneous velocity reversal at each peak — and, worse, the FINAL segment
// arrived at its rest value still travelling at full speed and then stopped
// dead. A real damped spring passes through zero velocity at every extremum and
// coasts into rest. That hard terminal stop is what read as mechanical.
//
// Fix: pass an ARRAY of eases (one per segment, length = keyframes - 1). Sine
// curves are used deliberately — a damped oscillation between two extrema IS a
// half-sinusoid, so easeOutSine/easeInOutSine are the literal shape, not an
// approximation.
//
// These stay cubicBezier() FUNCTIONS for the same reason IMPACT_EASE does:
// isWaapiSupportedEasing() rejects an array of functions, which pins the
// animation to Framer's main-thread keyframe generator where `times` are
// literal. (An array of raw [a,b,c,d] tuples would PASS that check and reroute
// through WAAPI, warping every offset. Keep the function form.)
const HOLD = cubicBezier(0.25, 0.25, 0.75, 0.75) // exact identity — preserves the approved spin/hold segments unchanged
const SETTLE_ARRIVE = cubicBezier(0.39, 0.575, 0.565, 1) // easeOutSine — moving fast, decelerate to a standstill at the peak
const SETTLE_SWING = cubicBezier(0.445, 0.05, 0.55, 0.95) // easeInOutSine — extremum to extremum, zero velocity at both ends

// `isClosing` — this card is the CLOSING beat (Ben, 2026-08-24: "after the
// third slide of a shiny that pans, it should then pan back down to the shiny
// title"), not the opening announce. Same card, same destination: the title
// and photo sit at exactly the rest values the entrance settles to (title
// scale 1 / rotate -6, photo y 0% / rotate 0), the same layout, the same
// theme colors, the same glow. Only the JOURNEY differs — the card is already
// landed, so nothing spins, scales up from nothing, bursts, or rockets in.
// The travel for this beat belongs to the container that pans it back down
// (QuestionSlide's SHINY_PAN, run in reverse); anything moving in here on top
// of that would be a second, competing motion.
//
// Mechanically this is the reduced-motion presentation — which already IS the
// "arrive at rest, no travel" version of this screen — so the two share one
// `quiet` flag rather than growing a third set of keyframes to keep in sync.
// That also means the closing beat can never drift out of step with the rest
// values the entrance lands on: they're read from the same expressions.
export default function ShinyIntroScreen({ slide, theme, show, isClosing = false }) {
  const { data } = slide
  const reduce = useReducedMotion()
  const quiet = isClosing || reduce
  const title = data.seriesTheme || data.shinyFormatName || 'Shiny Question'

  // The title is flex-centered (its own midpoint always sits at 50%/50% of
  // the stage, matching the glow's anchor above — see that comment), but the
  // host photo is separately pinned to the frame's bottom edge (see the photo
  // wrapper below) and never moves. A title that wraps to 2 lines grows
  // symmetrically around that fixed center, so its second line can reach
  // down into the photo's face — confirmed live on "We're not so different,
  // you and I...": the word "not" lands across the eyes. Rather than move the
  // photo (its trajectory/height are deliberately static, see that comment)
  // or the glow (Ben: "i want it equal on the text" — it has to track the
  // title's own center), shrink the title once if it actually rendered to
  // more than one line. Measuring real rendered lines rather than guessing
  // off character count matches this codebase's house rule against
  // char-count text sizing (see autoFitText.js).
  const titleRef = useRef(null)
  const [titleWrapped, setTitleWrapped] = useState(false)

  // Same drag/rotate/resize region system StateOfUnionSlide's photo already
  // uses (SlideCanvasEditor's [data-slide-region] detection — generic, no
  // per-slide registration needed). Composed onto the wrapper's existing
  // `translateX(-80%)` anchor rather than replacing it, so the entrance
  // choreography on the <motion.img> inside stays untouched.
  const photoRt = data._regionTransforms?.photo
  const photoRegionTransform = `translateX(-80%) translate(${photoRt?.dx ?? 0}px,${photoRt?.dy ?? 0}px) rotate(${photoRt?.rotate ?? 0}deg) scale(${photoRt?.scale ?? 1})`

  // Host photo — a random pick from the show's uploaded host-photo library,
  // chosen once per SLIDE (not per mount, and not per re-render), so each
  // intro card can surprise with a different Ben while any one card keeps the
  // same Ben for its whole life. Falls back to the slide's fixed
  // data.hostPhotoUrl while the list loads or when the pool is empty.
  //
  // Stability lives in pickPhotoForSlide's module-scoped map, not in this
  // component's state, on purpose: this component fully unmounts whenever
  // `data.introDone` flips, and prevSlide() regresses that flag to false to
  // step back to the title card — so component state cannot survive the one
  // navigation that matters here. See pickPhotoForSlide's header comment.
  //
  // Draws from the SHARED cross-show pool (Ben's explicit call, 2026-08-16),
  // not a per-show folder — a per-show pool would go silently empty on any
  // duplicated or brand-new show, since storage objects aren't copied along
  // with the show row. The `show` prop is only used to steer the random pick
  // away from photos already explicitly pinned to another slide (Ben,
  // 2026-08-17: "wire the photo library to see if a photo had already been
  // used that night or not") — it plays no part in WHICH pool loads.
  const [randomPhotoUrl, setRandomPhotoUrl] = useState(null)
  useEffect(() => {
    let cancelled = false
    setRandomPhotoUrl(null)
    const excludeUrls = getUsedHostPhotoUrls(show, slide.id)
    listSharedHostPhotos().then(photos => {
      if (cancelled || photos.length === 0) return
      const pick = pickPhotoForSlide(slide.id, photos, excludeUrls)
      if (pick) setRandomPhotoUrl(pick.url)
    })
    return () => { cancelled = true }
  }, [slide.id])
  // A host-picked photo is a deliberate choice for this specific slide and
  // wins over the random pool — the pool is the default, not an override.
  // HostPhotoLibrary's "remove photo" affordance writes `null` explicitly
  // (never leaves the key unset) — an unset key means "use the random pool",
  // an explicitly-cleared one means "show nothing", same null-vs-unset
  // distinction StateOfUnionSlide.jsx's photoUrl already gets right. A plain
  // `||` here treated both the same, so removing a photo just showed a
  // different random one instead of none.
  const photoUrl = data.hostPhotoUrl === null ? null : (data.hostPhotoUrl || randomPhotoUrl)

  // Replay key — same idiom as QuestionSlide.jsx's flash reset: a multi-part
  // series keeps the same slide.id across parts, only currentPart changes as
  // the host advances (Phase 2 will re-show this screen per part). Remounting
  // on the key replays every keyframe track below.
  const replayKey = `${slide.id}:${data.currentPart ?? 0}`

  // Measures actual rendered line count, not character count (per the
  // comment on titleWrapped above). CSS transforms (the scale/rotate this
  // element animates on) never affect layout, so this reads the true rest
  // line-wrap immediately, even mid-entrance — no need to wait for the
  // animation to settle. Guarded on document.fonts.ready, same gotcha every
  // other measure-to-fit spot in this codebase guards against: measuring
  // against fallback-font metrics before the theme font loads would read the
  // wrong line count. Resets on every replay so a shorter title (or a
  // different part of a series) doesn't inherit a stale shrink.
  useEffect(() => {
    setTitleWrapped(false)
    let cancelled = false
    document.fonts.ready.then(() => {
      if (cancelled) return
      const textNode = titleRef.current?.firstChild
      if (!textNode) return
      const range = document.createRange()
      range.selectNodeContents(textNode)
      if (range.getClientRects().length > 1) setTitleWrapped(true)
    })
    return () => { cancelled = true }
  }, [replayKey, title])

  // Spark geometry — 8 particles radiating from center, random angle jitter
  // and distance per replay (prototype: 90–145px on a ~900px stage; doubled
  // here for the full-size display).
  const sparks = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const angle = (i / 8) * Math.PI * 2 + (Math.random() * 0.5 - 0.25)
        const dist = 180 + Math.random() * 110
        return {
          dx: Math.cos(angle) * dist,
          dy: Math.sin(angle) * dist,
          duration: LAND_T + 0.3 + Math.random() * 0.12,
        }
      }),
    [replayKey] // eslint-disable-line react-hooks/exhaustive-deps
  )

  return (
    <div key={replayKey} className="w-full h-full relative overflow-hidden flex items-center justify-center">
      {/* Sunrise glow — theme-colored wash, not a full-screen fill, so the
          ambient background still shows through around the edges. Ramps in
          ~0.89–1.19s, mid-spin, well before LAND_T — matches the prototype's
          early ramp and this screen's always-on wash.
          Uses IMPACT_EASE (function-form) + literal `times` matching that
          real visual window, same mechanism as the burst/sparks below —
          NOT the string 'easeOut', which would take Framer's WAAPI-
          accelerated path and silently warp these `times` offsets earlier
          via an internal engine-selection heuristic (see IMPACT_EASE's own
          comment). Pinning both to the function form means the ramp timing
          is a stated fact of this spec, not a side effect of which code
          path Framer happens to pick — and stays consistent with the
          burst/sparks if a future framer-motion version changes that
          heuristic. */}
      <motion.div
        aria-hidden
        initial={{ opacity: 0 }}
        animate={quiet ? { opacity: 1 } : { opacity: [0, 0, 1, 1] }}
        transition={quiet ? { duration: 0.3 } : { duration: LAND_T + 0.26, times: [0, 0.448, 0.599, 1], ease: IMPACT_EASE }}
        className="absolute inset-0 pointer-events-none"
        style={{
          // Ellipse sized so the 72% transparent stop actually lands INSIDE
          // the stage (2026-08-17, Ben: "straight lines" on left/right/
          // bottom). At the old 85%/65% size, the gradient's own math didn't
          // reach fully transparent until past the box edge — StageFrame's
          // overflow:hidden then clipped the still-visible tail into a hard
          // line instead of a soft fade.
          //
          // Anchor moved 62% → 50% (2026-08-17, Ben: "the shiny aura looks
          // centered towards under the text ... i want it equal on the
          // text"). The title sits at 50% of the stage (this screen is
          // flex-centered), so a 50% anchor makes the glow vertically
          // symmetric around it — the old 62% weighted it toward the host
          // photo's landing zone below. Clip-safety at the new anchor:
          // fade completes at 0.72 × the semi-axis, so horizontally
          // 0.72 × 55% = 39.6% from center vs 50% to either edge (10.4%
          // margin, unchanged), and vertically 0.72 × 40% = 28.8% vs 50%
          // to BOTH edges now (21.2% margin each — better than the old
          // bottom-edge worst case of 38% − 28.8% = 9.2%).
          background: `radial-gradient(ellipse 55% 40% at 50% 50%, ${SHINY_GOLD_GLOW}4d 0%, ${SHINY_GOLD_GLOW}22 38%, transparent 72%)`,
        }}
      />

      {/* Impact burst + sparks — pure decoration, skipped under reduced motion
          and on the closing beat (nothing is impacting: the card is already
          landed, so a burst would be announcing an arrival that never
          happens). */}
      {!quiet && (
        <>
          <motion.div
            aria-hidden
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: [0, 0, 1, 9], opacity: [0, 0, 0.9, 0] }}
            transition={{ duration: LAND_T + 0.35, times: [0, 0.62, 0.68, 1], ease: IMPACT_EASE }}
            className="absolute z-10 pointer-events-none rounded-full"
            style={{
              left: '50%', top: '50%', width: 20, height: 20, marginLeft: -10, marginTop: -10,
              background: `radial-gradient(circle, #fff6dd 0%, ${SHINY_GOLD} 30%, ${SHINY_GOLD_GLOW}66 60%, transparent 72%)`,
            }}
          />
          {sparks.map((s, i) => (
            <motion.div
              key={i}
              aria-hidden
              initial={{ x: 0, y: 0, scale: 1, opacity: 0 }}
              animate={{
                x: [0, 0, s.dx * 0.25, s.dx],
                y: [0, 0, s.dy * 0.25, s.dy],
                scale: [1, 1, 1.4, 0.2],
                opacity: [0, 0, 1, 0],
              }}
              transition={{ duration: s.duration, times: [0, 0.64, 0.72, 1], ease: IMPACT_EASE }}
              className="absolute z-10 pointer-events-none rounded-full"
              style={{
                left: '50%', top: '50%', width: 10, height: 10, marginLeft: -5, marginTop: -5,
                background: SHINY_GOLD,
                boxShadow: `0 0 16px 4px ${SHINY_GOLD_GLOW}`,
              }}
            />
          ))}
        </>
      )}

      {/* Host photo — rockets up from below the frame AFTER the title lands,
          overshoots with a rotate wobble (prototype "ben" track).

          Positioning wrapper (2026-08-17, Ben: photos must sit near the middle
          of the asset they accompany, not in a frame corner). It used to hang
          off `left: 0`, which anchors to the FRAME edge — and because these
          cutouts sit centred inside their own mostly-transparent canvas, the
          narrower the photo the further from the title it landed. Anchoring at
          `left: 50%` and pulling back 80% of the photo's own width instead
          puts it just left of the title card's centre for ANY aspect ratio:
          its centre lands at 50% - 0.3w, close enough to read as part of the
          title card, still clear of the title's core (which paints over it —
          the title is later in DOM at the same z-10).

          The wrapper is deliberately STATIC: every motion prop below is
          unchanged, so the approved entrance choreography and its documented
          timing are untouched. It carries the 56% height so the img's
          `height: 100%` still resolves (percentage heights need a resolved
          parent) and so the y-track's `%` offsets, which are relative to the
          image's own height, keep their original travel. */}
      <div
        data-slide-region="photo"
        data-slide-field="photo"
        className="absolute bottom-0 left-1/2 z-10 pointer-events-none"
        style={{ height: '56%', transform: photoRegionTransform }}
      >
        {/* Always mounted, even before the random-photo fetch resolves (most
          slides have no fixed data.hostPhotoUrl, so photoUrl is briefly
          undefined): gating the mount on photoUrl would start this track's
          timeline at fetch-resolve time, landing the photo late and
          network-dependent instead of on the card's shared beat. A src-less
          <img> paints nothing, so the empty element animating is invisible;
          src swaps in-place whenever the URL arrives. */}
      <motion.img
        src={photoUrl || undefined}
        alt=""
        initial={quiet ? { opacity: 0, y: '0%', rotate: 0 } : { opacity: 0, y: '85%', rotate: -6 }}
        animate={
          quiet
            ? { opacity: 1, y: '0%', rotate: 0 }
            : {
                opacity: [0, 0, 1, 1, 1],
                y: ['85%', '85%', '-18%', '6%', '0%'],
                rotate: [-6, -6, 4, -2, 0],
              }
        }
        transition={
          quiet
            ? { delay: 0.15, duration: 0.4, ease: EASE_OUT }
            : {
                duration: LAND_T + 0.65,
                times: [0, 0.68, 0.82, 0.91, 1],
                // Values left alone — this track already decays (y -18% → +6%, rotate
                // +4 → -2) at a constant ~214ms half-period. Only the hard stop at rest
                // needed fixing, and it mattered most here: it's the largest element on
                // screen, so a dead-stop at full speed is the most visible.
                ease: [HOLD, SETTLE_ARRIVE, SETTLE_SWING, SETTLE_SWING],
              }
        }
        className="block pointer-events-none"
        style={{ height: '100%', objectFit: 'contain', filter: 'drop-shadow(0 8px 20px rgba(0,0,0,0.4))' }}
      />
      </div>

      {/* Title — big, tilted, marker-style. Spins in through one tame
          controlled turn while scaling up, lands with a two-oscillation
          spring "boing". Final rest angle is 354deg ≡ exactly -6deg (360-6),
          matching this file's tilt convention — not a leftover spin remainder. */}
      <motion.p
        initial={quiet ? { opacity: 0, scale: 1, rotate: -6 } : { opacity: 0, scale: 0.05, rotate: 0 }}
        animate={
          quiet
            ? { opacity: 1, scale: 1, rotate: -6 }
            : {
                opacity: [0, 1, 1, 1, 1, 1, 1, 1],
                // Bounce amplitudes now DECAY geometrically toward rest instead of
                // stalling. Measured from the rest values (rotate 354, scale 1):
                //   rotate  +12 → -4 → +1.5   (ratio ~0.35 each half-cycle)
                //   scale  +0.22 → -0.09 → +0.04 (ratio ~0.42)
                // The old third bounce was +4 / +0.08 — the SAME size as the second
                // (12 → 4 → 4), so the card ticked back and forth at a constant
                // amplitude and then stopped, which is a ratchet, not a spring.
                scale: [0.05, 0.05, 0.42, 0.85, 1.22, 0.91, 1.04, 1],
                rotate: [0, 0, 196, 336, 366, 350, 355.5, 354],
              }
        }
        transition={
          quiet
            ? { duration: 0.3, ease: EASE_OUT }
            : {
                duration: LAND_T,
                // Tail offsets equalised: the old 0.9 / 0.96 / 1 gave half-periods of
                // 172ms → 104ms → 69ms, so the wobble sped UP as it died — a real
                // spring holds a constant frequency while only the amplitude shrinks.
                // The last beat was also only ~4 frames at 60fps, too short to read as
                // motion at all. 0.8 (the impact peak, which the burst/spark tracks key
                // off) is untouched; only the two post-impact offsets moved.
                times: [0, 0.03, 0.42, 0.68, 0.8, 0.867, 0.934, 1],
                // One ease per segment (7 for 8 keyframes). Spin/hold segments keep the
                // approved constant-velocity feel via the exact identity curve; only
                // the four post-impact segments change.
                ease: [HOLD, HOLD, HOLD, SETTLE_ARRIVE, SETTLE_SWING, SETTLE_SWING, SETTLE_SWING],
              }
        }
        ref={titleRef}
        className="relative z-10 text-center px-20"
        style={{
          fontFamily: `'${theme.fonts.display}', sans-serif`,
          color: SHINY_GOLD,
          // ponytail: single-shot shrink (not an iterative fit loop) — good
          // enough for the one long title this actually hits tonight ("We're
          // not so different, you and I..."). If a future title is long
          // enough to still wrap at 80%, port this to the real
          // measure-and-binary-search loop in autoFitText.js instead of
          // adding more shrink steps here.
          fontSize: titleWrapped ? 'clamp(2.2rem, 5.2cqw, 4.8rem)' : 'clamp(2.75rem, 6.5cqw, 6rem)',
          fontWeight: 700,
          lineHeight: 1.08,
          textShadow: `0 3px 0 rgba(0,0,0,0.25), 0 2px 10px ${SHINY_GOLD_GLOW}40`,
        }}
      >
        {title}
      </motion.p>

      {/* Subtitle — optional per-instance line ("Dog Edition", "Bluegrass Cover").
          Delayed past the landing instant so it doesn't precede the title. */}
      {data.introSubtitle && (
        <motion.p
          initial={{ opacity: 0, y: quiet ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: quiet ? 0.35 : 1.45, duration: 0.35, ease: EASE_OUT }}
          className="absolute z-10 text-center px-20"
          style={{
            top: 'calc(50% + 5.5rem)',
            fontFamily: `'${theme.fonts.ui}', 'Inter', sans-serif`,
            color: theme.colors.text,
            fontSize: 'clamp(1.1rem, 2.2cqw, 1.6rem)',
            fontWeight: 600,
            letterSpacing: '0.04em',
            textShadow: '0 2px 12px rgba(0,0,0,0.6)',
          }}
        >
          {data.introSubtitle}
        </motion.p>
      )}
    </div>
  )
}
