import { Fragment, useState, useRef, useEffect, useMemo } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import WaveformBars from '../WaveformBars.jsx'
import ShinyIntroScreen from '../ShinyIntroScreen.jsx'
import ShinyMatchingQuestion from './ShinyMatchingQuestion.jsx'
import ShinyWagerQuestion from './ShinyWagerQuestion.jsx'
import ShinyOrderQuestion from './ShinyOrderQuestion.jsx'
import { resolveShinyPart, isVisualShiny, isAudioShiny, isListShiny, isVideoShiny, isMatchingShiny, isWagerShiny, isOrderShiny, isConcurrentShiny, isConcurrentMediaShiny, partsToGridView } from '../../../lib/shinySeries.js'
import { GridContent } from './GridSlide.jsx'
import { fitToBox, QUESTION_BOX, QUOTE_BOX, useFitToBox, useFitListToBox, LIST_ITEM_FLOOR, LIST_ITEM_CEIL, VISUAL_CAPTION_FLOOR, VISUAL_CAPTION_CEIL } from '../../../lib/autoFitText.js'
import { EASE_OUT, EASE_EXIT, EASE_PANEL } from '../../../lib/easings.js'
import { SHINY_GOLD, SHINY_GOLD_GLOW } from '../../../lib/shinyGold.js'
import { youtubeEmbedUrl } from '../../../lib/youtube.js'
import { warmYoutubeAudio, claimYoutubeAudio } from '../../../lib/youtubeWarmAudio.js'
import { warmImages, slideImageUrls } from '../../../lib/warmImages.js'

// ─── Standard question ────────────────────────────────────────────────────────

function StandardQuestion({ slide, show, theme, transitionKey }) {
  const { data } = slide
  const part = resolveShinyPart(data)
  const rt = data._regionTransforms ?? {}
  const xf = id => { const t = rt[id]; return t ? { transform: `translate(${t.dx??0}px,${t.dy??0}px) rotate(${t.rotate??0}deg)`, transformOrigin: 'center', display: 'inline-block' } : {} }
  const isAssemble = transitionKey === 'assemble'
  // Regular (non-shiny) questions get their sequential number prepended
  // automatically — questionNumber is already kept correct through
  // reorders/deletes by renumberRoundQuestions (useShow.js), so this stays
  // right without the host re-typing it. 2026-08-17, Ben: was hand-typing
  // "1. "/"2. " into the question text itself and wanted it wired in
  // instead. Shiny questions skip this — they get their own series
  // banner/title treatment and the QuestionCounter corner badge instead.
  // Bug fixed 2026-08-17 (caught by review, not live): questionNumber is
  // per-TRACK, not per-round — bonus questions number 1,2,3... on their OWN
  // sequence (renumberRoundQuestions, questionNumbering.js), separate from
  // the regular Q1,Q2,... track. A bonus question after 5 regular ones has
  // questionNumber === 1, so this would print "1. ..." on the TV — reading
  // as the actual first question of the round. Bonus questions already get
  // their own "B1"-style label in QuestionCounter's corner badge; they just
  // don't get a number folded into the question text itself.
  const displayText = !data.isShiny && !data.isBonus && data.questionNumber ? `${data.questionNumber}. ${part.text}` : part.text

  // Uniform sizing across the round (Ben, 2026-08-17: "I want the font
  // sizes to be as close to each other as possible" — Q4 fit its own
  // longer text at its own optimal size, popping noticeably smaller next
  // to a short question like Q5 sized at ITS OWN optimal-and-bigger size).
  // Same philosophy useFitListToBox already uses for MultiQuestion/PylReveal
  // rows: size everything to the box's HARDEST-to-fit member instead of
  // letting each item claim its own independent max. Every question-type
  // slide in this round is measured with fitToBox individually (each still
  // gets its own real display text/prefix); the smallest of those wins and
  // every question in the round renders at that one size.
  // Bug fixed 2026-08-17 (caught by review, not live): the pool included
  // EVERY question-type slide in the round regardless of shiny status, but
  // shiny list/wager/matching/visual/audio questions never actually render
  // through THIS component's QUESTION_BOX/fitToBox call — they each have
  // their own independent sizing elsewhere. A long shiny question's text
  // could drag Math.min down and shrink every REGULAR question in the round
  // to fit a box it's never even measured against. Scoped to non-shiny
  // questions only, same split displayText already uses above.
  const roundQuestionTexts = useMemo(() => {
    if (!show?.slides) return [displayText]
    return show.slides
      .filter(s => s.type === 'question' && !s.data?.isShiny && s.roundId === slide.roundId)
      .map(s => {
        const p = resolveShinyPart(s.data)
        return !s.data?.isBonus && s.data?.questionNumber ? `${s.data.questionNumber}. ${p.text}` : p.text
      })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [show?.slides, slide.roundId])
  // fitToBox measures via canvas — a first paint before the body font loads
  // measures fallback-font metrics. This flips once web fonts are ready to
  // force uniformFontSize below to recompute with real glyph metrics.
  // Bug fixed 2026-08-17 (caught by review, not live): fontsReady used to
  // just force a re-render, back when fitToBox was called inline in the
  // render body (so any re-render re-ran it). It's now behind a useMemo —
  // a re-render alone doesn't recompute a memo, only a changed dependency
  // does, so this was a permanently-stale fallback-font measurement until
  // the slide itself changed. fontsReady is now an explicit dependency.
  const [fontsReady, setFontsReady] = useState(false)
  useEffect(() => { document.fonts.ready.then(() => setFontsReady(true)) }, [])

  const uniformFontSize = useMemo(() => {
    const sizes = roundQuestionTexts.map(t => fitToBox(t, { ...QUESTION_BOX, family: theme.fonts.body }))
    return sizes.length ? Math.min(...sizes) : fitToBox(displayText, { ...QUESTION_BOX, family: theme.fonts.body })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundQuestionTexts, theme.fonts.body, fontsReady])

  // Subtitle as a quote sitting above the question text (Ben, 2026-08-18:
  // "sometimes i give a quote and they have to answer the question") — sized
  // on its own, not folded into uniformFontSize's per-round match, since it's
  // a per-part quote, not the thing being kept visually consistent slide to
  // slide the way the question itself is.
  const subtitleFontSize = useMemo(() => {
    if (!part.subtitle) return 0
    return fitToBox(part.subtitle, { ...QUOTE_BOX, family: theme.fonts.body })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [part.subtitle, theme.fonts.body, fontsReady])

  const question = isAssemble
    ? { initial: { opacity: 0, y: 30, scale: 0.97 }, animate: { opacity: 1, y: 0, scale: 1 }, transition: { duration: 0.46, delay: 0.22, ease: EASE_OUT } }
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.22, ease: EASE_OUT, delay: 0.18 } }
  const photo = isAssemble
    ? { initial: { opacity: 0, scale: 0.8 }, animate: { opacity: 0.7, scale: 1 }, transition: { duration: 0.4, delay: 0.31, ease: EASE_OUT } }
    : { initial: { opacity: 0 }, animate: { opacity: 0.7 }, transition: { delay: 0.2, duration: 0.4 } }

  return (
    <div
      className="w-full h-full relative overflow-hidden"
      style={{ background: 'transparent' }}
    >
      {/* Reading-well — soft radial darken behind text center */}
      <div aria-hidden style={{
        position: 'absolute', inset: 0, zIndex: 18, pointerEvents: 'none',
        background: 'radial-gradient(ellipse 56% 46% at 50% 52%, rgba(0,0,0,0.40) 0%, rgba(0,0,0,0.20) 45%, transparent 72%)',
      }} />

      {/* Question text — large, centered — Section 23. Subtitle (a quote or
          context line, Ben 2026-08-18) sits directly above it, in the same
          reading well, rather than tucked into the series banner's tiny
          label style — it needs to read as "here's the setup", not a badge. */}
      <motion.div
        initial={question.initial}
        animate={question.animate}
        transition={question.transition}
        className="absolute inset-0 flex flex-col items-center justify-center px-24 py-20 z-[30] gap-4"
      >
        {part.subtitle && (
          <span data-slide-region="subtitle" data-slide-field="subtitle">
            <p
              className="text-center leading-relaxed italic"
              style={{
                color: theme.colors.textMuted ?? theme.colors.text,
                fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
                fontSize: rt.subtitle?.fontSizePx ?? subtitleFontSize,
                fontWeight: 500,
                maxWidth: '80ch',
                textShadow: '0 2px 18px rgba(0,0,0,0.85), 0 1px 4px rgba(0,0,0,0.6)',
              }}
            >
              {part.subtitle}
            </p>
          </span>
        )}
        <span data-slide-region="text" data-slide-field="text" style={xf('text')}>
          <p
            className="text-center leading-relaxed"
            style={{
              color: theme.colors.text,
              fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
              fontSize: rt.text?.fontSizePx ?? uniformFontSize,
              fontWeight: 500,
              maxWidth: '80ch',
              textShadow: '0 2px 18px rgba(0,0,0,0.85), 0 1px 4px rgba(0,0,0,0.6)',
            }}
          >
            {displayText}
          </p>
        </span>
      </motion.div>

      {/* Host photo — bottom-right, subtle */}
      {data.hostPhotoUrl && (
        <motion.div
          initial={photo.initial}
          animate={photo.animate}
          transition={photo.transition}
          className="absolute bottom-20 right-10 pointer-events-none z-[30]"
        >
          <img
            src={data.hostPhotoUrl}
            alt=""
            style={{ height: 160, maxWidth: '100%', objectFit: 'contain', filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))' }}
          />
        </motion.div>
      )}
    </div>
  )
}

// ─── Shiny visual question ────────────────────────────────────────────────────

function ShinyVisualQuestion({ slide, theme }) {
  const { data } = slide
  const rt = data._regionTransforms ?? {}
  const part = resolveShinyPart(data)
  const reduce = useReducedMotion()
  const [aspect, setAspect] = useState(null) // 'landscape' | 'portrait' | 'square'
  const [flashVisible, setFlashVisible] = useState(true)
  // Bug fixed 2026-08-17 (caught while wiring in Pop & Settle, not live):
  // neither image element below was ever keyed on data.currentPart, so
  // Framer never remounted them when stepping to the next photo — the
  // initial->animate entrance only ever played once, on first entering the
  // series, contradicting this file's own comment a few lines down. Both
  // image elements now key on `${slide.id}:${currentPart}` (same idiom
  // already used elsewhere in this file for audio/list parts) so the
  // entrance actually replays on every photo, not just the first.
  const partKey = `${slide.id}:${data.currentPart ?? 0}`
  // Pop & Settle (Ben, 2026-08-17, picked from a side-by-side comparison of
  // 5 candidates): scales up from 84% with a spring overshoot past 100%
  // before settling, plus a couple degrees of rotation — reads like a
  // snapshot being set down, not a generic fade. Spring, not a manual
  // multi-keyframe curve, for the overshoot — idiomatic for this codebase
  // (RoundIntroSlide's round-number slam-in uses the same type:'spring'
  // + bounce approach). transform + opacity only.
  const imageEntrance = reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0.14 } }, transition: { duration: 0.2, ease: EASE_OUT } }
    : {
        initial: { scale: 0.84, rotate: -2, opacity: 0 },
        animate: { scale: 1, rotate: 0, opacity: 1 },
        exit: { scale: 0.97, opacity: 0, transition: { duration: 0.16, ease: EASE_OUT } },
        transition: { type: 'spring', bounce: 0.32, duration: 0.5 },
      }

  useEffect(() => {
    // Flash clears after the CSS animation completes — Section 20. Keyed to
    // slide.id ONLY (2026-08-17, Ben) — used to also re-fire on
    // data.currentPart, so a 4-photo series played the full flash + gold
    // glow burst on EVERY photo, not just entering the question once. That's
    // the "main slide" theatrical treatment; advancing within one series
    // should read as a calm cut to the next photo, not four separate
    // entrances. The image itself still crossfades between photos (its own
    // key={data.currentPart} below), just without the flash/burst.
    setFlashVisible(true)
    const t = setTimeout(() => setFlashVisible(false), 250)
    return () => clearTimeout(t)
  }, [slide.id])

  function handleImageLoad(e) {
    const { naturalWidth: w, naturalHeight: h } = e.target
    if (w > h * 1.25) setAspect('landscape')
    else if (h > w * 1.25) setAspect('portrait')
    else setAspect('square')
  }

  // Portrait's 50/50 image+caption split only earns its keep when there's
  // real caption text to put in the other half — without it (2026-08-18,
  // "Time for a Close Up": image-only questions, no part.text) a portrait
  // photo left half the screen blank, reading as off-center/broken rather
  // than a deliberate layout. No text falls through to the landscape/square
  // branch's full-bleed object-contain treatment instead, which centers any
  // aspect ratio the same way.
  const isPortrait = aspect === 'portrait' && !!part.text?.trim()

  // Wireable via the same Design-canvas region-transform mechanism
  // StandardQuestion already uses (2026-08-25) — both branches share one
  // "caption" region id since only one is ever mounted at a time.
  const captionBoxRef1 = useRef(null)
  const autoCaptionSize1 = useFitToBox(captionBoxRef1, part.text, {
    family: theme.fonts.body,
    floorPx: VISUAL_CAPTION_FLOOR * 16,
    ceilPx: VISUAL_CAPTION_CEIL * 16,
    maxLines: 5, lineHeight: 1.15,
  })
  const captionSize1 = rt.caption?.fontSizePx ?? autoCaptionSize1
  const captionBoxRef2 = useRef(null)
  const autoCaptionSize2 = useFitToBox(captionBoxRef2, part.text, {
    family: theme.fonts.body,
    floorPx: VISUAL_CAPTION_FLOOR * 16,
    ceilPx: VISUAL_CAPTION_CEIL * 16,
    maxLines: 5, lineHeight: 1.15,
  })
  const captionSize2 = rt.caption?.fontSizePx ?? autoCaptionSize2

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ background: theme.colors.shinyBg }}>
      {/* White flash — Section 20: 1 frame, CSS not JS */}
      {flashVisible && <div className="shiny-flash absolute inset-0 z-50 bg-white" />}

      {/* Gold glow burst — CSS, off main thread */}
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: `radial-gradient(ellipse at center, ${SHINY_GOLD_GLOW}38 0%, transparent 55%)`,
          animation: 'shinyGlow 0.7s ease-out forwards',
        }}
      />

      {isPortrait ? (
        /* Portrait: image left 50%, text right 50% — Section 14 */
        <div className="w-full h-full flex">
          {/* popLayout: pops the exiting image out of normal flow while it
              fades, so the outgoing/incoming pair crossfading briefly
              doesn't fight the flex layout for the same half-width slot. */}
          <AnimatePresence mode="popLayout">
            <motion.div
              key={partKey}
              className="w-1/2 h-full overflow-hidden"
              {...imageEntrance}
            >
              <img
                src={part.mediaUrl}
                onLoad={handleImageLoad}
                alt=""
                className="w-full h-full object-contain"
              />
            </motion.div>
          </AnimatePresence>
          <motion.div
            key={`${partKey}:caption`}
            className="w-1/2 h-full flex items-center justify-center px-12"
            initial={{ x: reduce ? 0 : 24, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ delay: 0.18, duration: 0.28, ease: EASE_OUT }}
          >
            <div ref={captionBoxRef1} className="w-full">
              <span data-slide-region="caption" data-slide-field="text">
                <p
                  className="text-center leading-relaxed"
                  style={{
                    color: theme.colors.text,
                    fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
                    fontSize: `${captionSize1}px`,
                    fontWeight: 500,
                  }}
                >
                  {part.text}
                </p>
              </span>
            </div>
          </motion.div>
        </div>
      ) : (
        /* Landscape / square: full bleed + gradient scrim — Section 14 */
        <>
          <AnimatePresence mode="popLayout">
            <motion.img
              key={partKey}
              src={part.mediaUrl}
              onLoad={handleImageLoad}
              alt=""
              className="w-full h-full object-contain"
              {...imageEntrance}
            />
          </AnimatePresence>
          {/* Same rule the portrait branch above already applies: the
              caption furniture only earns its keep when there is real
              caption text to put in it. A shared-answer image series
              ("We're not so different, you and I..." — one answer collected
              up front, so every part.text is empty) was rendering an empty
              <p> inside a ~200px-tall black gradient scrim that re-keyed on
              every part step, so each photo swap also slid a bare dark band
              up from the bottom over the new image. 2026-08-24, Ben:
              "arent transitioning smooth". */}
          {!!part.text?.trim() && <motion.div
            key={`${partKey}:caption`}
            className="absolute bottom-0 left-0 right-0"
            style={{
              background: 'linear-gradient(to top, rgba(0,0,0,0.88) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)',
              paddingBottom: 64,
              paddingTop: 120,
              paddingLeft: 64,
              paddingRight: 64,
            }}
            initial={{ y: reduce ? 0 : 32, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.15, duration: 0.22, ease: EASE_OUT }}
          >
            <div ref={captionBoxRef2} className="w-full">
              <span data-slide-region="caption" data-slide-field="text">
                <p
                  className="text-center leading-snug"
                  style={{
                    color: '#f5f0e8',
                    fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
                    fontSize: `${captionSize2}px`,
                    fontWeight: 500,
                  }}
                >
                  {part.text}
                </p>
              </span>
            </div>
          </motion.div>}
        </>
      )}

    </div>
  )
}

// ─── Shiny visual question — swing-round pan reveal ────────────────────────────
// Legacy Swing Round visual questions (data.shinyType === 'visual' — see
// resolveShinyPart's own comment on the two ways a visual question gets
// flagged) get a two-beat treatment instead of ShinyVisualQuestion's
// immediate text+image layout (2026-08-18, Ben): text alone first, then the
// host presses Reveal Image and the whole slide pans up — a real vertical
// camera move, not a fade — to bring the image into view. Kept as its own
// component rather than retrofitting ShinyVisualQuestion, which stays
// untouched for every format-library image question elsewhere in the show.
function ShinySwingVisualQuestion({ slide, theme }) {
  const { data } = slide
  const part = resolveShinyPart(data)
  const reduce = useReducedMotion()
  const revealed = !!data.imagesRevealed

  // Two images (e.g. "the 4 heads" then "the 4 weapons") uses mediaSlots[0]
  // for beat 1 and [1] for beat 2. The original single-image shape (a
  // written question, then one revealed photo) still works unchanged —
  // resolveShinyPart's part.mediaUrl only ever resolves slot 0, so a lone
  // slot naturally falls through to beat 2, leaving beat 1 as text.
  const slots = data.mediaSlots ?? []
  const dualImage = slots.length >= 2
  const beat1Image = dualImage ? slots[0]?.url : null
  const beat2Image = dualImage ? slots[1]?.url : part.mediaUrl

  const captionBoxRef = useRef(null)
  const captionSize = useFitToBox(captionBoxRef, part.text, {
    family: theme.fonts.body,
    floorPx: VISUAL_CAPTION_FLOOR * 16,
    ceilPx: VISUAL_CAPTION_CEIL * 16,
    maxLines: 4, lineHeight: 1.25,
  })

  return (
    <div className="w-full h-full relative overflow-hidden" style={{ background: theme.colors.shinyBg }}>
      <div
        className="absolute inset-0 pointer-events-none z-10"
        style={{
          background: `radial-gradient(ellipse at center, ${SHINY_GOLD_GLOW}38 0%, transparent 55%)`,
          animation: 'shinyGlow 0.7s ease-out forwards',
        }}
      />

      {/* A 200%-tall track holding both beats stacked; panning is just
          translating this track by exactly one stage-height (-50% of its
          own 200% height), so it lands pixel-exact on beat 2 regardless of
          the actual stage size. */}
      <motion.div
        className="absolute left-0 right-0 top-0"
        style={{ height: '200%' }}
        animate={{ y: revealed ? '-50%' : '0%' }}
        transition={{ duration: reduce ? 0 : 0.85, ease: EASE_PANEL }}
      >
        {/* Beat 1 — question text, or an image when the question is two
            images back to back (e.g. "the 4 heads") */}
        <div className="w-full flex items-center justify-center px-24" style={{ height: '50%' }}>
          {beat1Image ? (
            <img
              src={beat1Image}
              alt=""
              className="max-w-full max-h-full object-contain rounded-2xl"
              style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
            />
          ) : (
            <div ref={captionBoxRef} className="w-full">
              <p style={{
                textAlign: 'center', color: theme.colors.text, lineHeight: 1.25,
                fontFamily: `'${theme.fonts.body}', sans-serif`,
                fontSize: `${captionSize}px`, fontWeight: 500,
                textShadow: '0 2px 18px rgba(0,0,0,0.85)',
              }}>
                {part.text}
              </p>
            </div>
          )}
        </div>

        {/* Beat 2 — the image, revealed by the pan */}
        <div className="w-full flex items-center justify-center px-20" style={{ height: '50%' }}>
          {beat2Image && (
            <img
              src={beat2Image}
              alt=""
              className="max-w-full max-h-full object-contain rounded-2xl"
              style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}
            />
          )}
        </div>
      </motion.div>
    </div>
  )
}

// ─── Shiny audio question ─────────────────────────────────────────────────────

function ShinyAudioQuestion({ slide, show, theme, isPreview }) {
  const { data } = slide
  const part = resolveShinyPart(data)
  const isYoutubeSource = !!part.youtubeId
  const [playing, setPlaying] = useState(false)
  const audioRef = useRef(null)
  const audioCtxRef = useRef(null)
  const ytHandleRef = useRef(null)

  // A multi-part series keeps the same slide.id across parts, so this
  // component never remounts when the host steps to a new part — only
  // data.currentPart changes. `playing` is local state, so on the very
  // render where the part changes it still reads whatever it was for the
  // OLD part (true, if that clip was still playing when Next was pressed).
  // The play/pause effect below runs in the SAME commit against THIS
  // render's `playing` value — resetting it in a separate, later-declared
  // effect is too late; that effect's state update only takes effect next
  // render, after the play effect already fired once using the stale
  // `true` and claimed+started the NEW part's clip with sound (a phantom
  // blip immediately paused behind it, and a claimed-but-never-really-
  // pressed-play handle left behind). Resetting during render — React's
  // own documented pattern for "state derived from a changed prop" —
  // reruns synchronously before any effect sees the stale value.
  const partKey = `${slide.id}:${data.currentPart ?? 0}`
  const [lastPartKey, setLastPartKey] = useState(partKey)
  if (partKey !== lastPartKey) {
    setLastPartKey(partKey)
    if (playing) setPlaying(false)
  }

  useEffect(() => {
    return () => { audioCtxRef.current?.close() }
  }, [])

  // Pre-build the whole player at slide mount, not just the API script
  // (2026-08-24, Ben: close the build/load/buffer latency "on any slide
  // with audio... unless the audio is downloaded"). warmYoutubeAudio builds
  // a muted player buffered at the clip start and parks it paused in a
  // hidden body-level container (see youtubeWarmAudio.js), so the PLAY
  // press below is unmute+play instead of API-load/build/buffer/seek —
  // the "first shiny-audio play of the night stalls" gap, closed. Not in
  // the host's preview pane: a warm iframe there would stack on top of
  // YoutubeClipEditor's own preview player for no benefit.
  useEffect(() => {
    if (!isYoutubeSource || isPreview) return
    warmYoutubeAudio(part.youtubeId, part.youtubeStart ?? 0, part.youtubeEnd ?? null)
  }, [isYoutubeSource, isPreview, part.youtubeId, part.youtubeStart, part.youtubeEnd])

  // One claimed player per clip, destroyed when the clip changes (a
  // multi-part series keeps the same slide.id across parts) or on unmount.
  // Declared BEFORE the play/pause effect below so that on a part change
  // this cleanup runs first and the play effect sees a clean slate.
  useEffect(() => {
    if (!isYoutubeSource) return
    return () => {
      ytHandleRef.current?.destroy()
      ytHandleRef.current = null
    }
  }, [isYoutubeSource, part.youtubeId, part.youtubeStart, part.youtubeEnd, slide.id, data.currentPart])

  // Real YT.Player instead of a bare iframe (2026-08-19) — needed for
  // .setVolume(part.volume), which a plain embed URL has no equivalent for.
  // Since the warm-player rework the player persists across pause/replay
  // within one clip — but the SEMANTICS are unchanged from the old
  // mount-on-play/destroy-on-pause pattern: pause fully stops playback, and
  // replay restarts from the clip start (the explicit seekTo on both the
  // pause and play paths below), never resume-mid-clip.
  // `end` in the warm player's playerVars (2026-08-19, Opus review) makes
  // YouTube's own player the real stop; the wall-clock timeout below stays
  // as a backstop for the rare case `end` doesn't fire.
  useEffect(() => {
    if (!isYoutubeSource) return
    if (playing) {
      let cancelled = false
      if (!ytHandleRef.current) {
        ytHandleRef.current = claimYoutubeAudio(part.youtubeId, part.youtubeStart ?? 0, part.youtubeEnd ?? null)
        ytHandleRef.current.onStateChange(state => {
          if (state === 0 /* ENDED */) setPlaying(false)
        })
      }
      const handle = ytHandleRef.current
      handle.whenReady(player => {
        if (cancelled || handle !== ytHandleRef.current) return
        player.setVolume(part.volume ?? 100)
        player.unMute()
        player.seekTo(part.youtubeStart ?? 0, true)
        player.playVideo()
      })
      return () => { cancelled = true }
    }
    // playing false — an explicit pause press, the auto-stop timeout, or
    // YouTube's own `end`/ENDED. Park the player back at the clip start,
    // still claimed and buffered, so a replay is instant too.
    const handle = ytHandleRef.current
    handle?.whenReady(player => {
      if (handle !== ytHandleRef.current) return
      player.pauseVideo()
      player.seekTo(part.youtubeStart ?? 0, true)
    })
  }, [isYoutubeSource, playing, part.youtubeId, part.youtubeStart, part.youtubeEnd, part.volume, slide.id, data.currentPart])

  // `playing` itself is already reset synchronously during render above —
  // this only pauses the real <audio> element (non-YouTube path), which is
  // an imperative DOM call and has to stay in an effect.
  useEffect(() => {
    audioRef.current?.pause()
  }, [partKey])

  // A YouTube-sourced clip has no <audio onEnded> equivalent — a plain
  // embed gives us no ended event — so we time the auto-stop ourselves
  // from the configured clip length, same effect the "Preview clip"
  // button gets in the host editor via getCurrentTime() polling.
  useEffect(() => {
    if (!isYoutubeSource || !playing || !part.youtubeEnd) return
    const ms = Math.max(0, (part.youtubeEnd - (part.youtubeStart || 0)) * 1000)
    if (ms <= 0) return
    const t = setTimeout(() => setPlaying(false), ms)
    return () => clearTimeout(t)
  }, [isYoutubeSource, playing, part.youtubeEnd, part.youtubeStart])

  function ensureAudioGraph() {
    if (!audioRef.current || audioCtxRef.current) return audioCtxRef.current
    const ctx = new AudioContext()
    const src = ctx.createMediaElementSource(audioRef.current)
    const gainNode = ctx.createGain()
    gainNode.gain.value = Math.pow(10, (data.audioGainDb ?? 0) / 20)
    src.connect(gainNode)
    gainNode.connect(ctx.destination)
    audioCtxRef.current = ctx
    return ctx
  }

  async function playWithGain() {
    const ctx = ensureAudioGraph()
    if (ctx?.state === 'suspended') await ctx.resume()
    await audioRef.current.play()
    setPlaying(true)
  }

  // React to show.audio_playing from Supabase (wired in step 5 Live Mode)
  // — only meaningful for the real <audio> element; a YouTube-sourced clip
  // has no gain graph to hook into and is driven purely by the on-screen button.
  // isPreview: the host's build-mode preview pane must not play the clip out
  // loud on the laptop while the show is being built — same gate RulesSlide,
  // WinnerRevealSlide, PreShowSlide and StateOfUnionSlide put on their audio.
  // Only this remote-driven path is gated; the on-screen PLAY button below is
  // an explicit press and still works in preview.
  useEffect(() => {
    if (isYoutubeSource || isPreview) return
    const ap = show?.audio_playing
    if (ap?.slideId === slide.id && ap?.playing && audioRef.current) {
      playWithGain().catch(() => {})
    }
  }, [show?.audio_playing, slide.id, isYoutubeSource, isPreview])

  return (
    <div
      className="w-full h-full relative flex flex-col items-center justify-center gap-10 overflow-hidden"
      style={{ background: theme.colors.shinyBg }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 50%, ${SHINY_GOLD_GLOW}18 0%, transparent 65%)`,
        }}
      />

      {/* Question number/label */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06, duration: 0.22, ease: EASE_OUT }}
        className="relative z-10 text-center"
      >
        <p
          style={{
            fontFamily: `'${theme.fonts.display}', sans-serif`,
            color: theme.colors.text,
            fontSize: 'clamp(3rem, 8cqw, 6rem)',
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {part.questionNumber != null ? `Q${part.questionNumber}` : (data.questionLabel ?? data.questionNumber)}
        </p>
        {part.text && (
          <p className="mt-3" style={{ color: theme.colors.textMuted, fontSize: '1.5rem' }}>
            {part.text}
          </p>
        )}
      </motion.div>

      {/* Waveform — CSS, Section 20 */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.3 }}
      >
        <WaveformBars playing={playing} />
      </motion.div>

      {/* Play button — shown but host controls audio via Live Mode.
          Underlying playback mechanism branches on source: a real <audio>
          tag for an uploaded file, or a visually-hidden YouTube iframe for
          a clip sourced from a URL. Visible UI (waveform, button, colors)
          is identical either way. */}
      {(isYoutubeSource ? part.youtubeId : part.mediaUrl) && (
        <>
          {/* YouTube source renders no element here anymore — the hidden
              player lives in a body-level container owned by
              youtubeWarmAudio.js so it can be pre-built/buffered before the
              PLAY press (and an iframe can't be reparented into this tree
              without reloading and dropping its buffer). */}
          {!isYoutubeSource && (
            <audio
              ref={audioRef}
              src={part.mediaUrl}
              onEnded={() => setPlaying(false)}
              preload="auto"
            />
          )}
          <motion.div
            initial={{ scale: 0.85, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.3, duration: 0.25, ease: EASE_OUT }}
            className="relative z-10"
          >
            <div
              data-no-step
              className="w-24 h-24 rounded-full flex items-center justify-center cursor-pointer"
              onClick={() => {
                if (isYoutubeSource) {
                  setPlaying(p => !p)
                } else if (playing) {
                  audioRef.current?.pause(); setPlaying(false)
                } else {
                  playWithGain()
                }
              }}
              style={{
                background: theme.colors.accent,
                boxShadow: playing ? 'none' : `0 0 40px ${SHINY_GOLD_GLOW}50`,
                animation: playing ? 'none' : 'playPulse 2.4s ease-in-out infinite',
              }}
            >
              <span style={{ color: SHINY_GOLD, fontSize: '2.5rem', marginLeft: playing ? 0 : 4 }}>
                {playing ? '⏸' : '▶'}
              </span>
            </div>
          </motion.div>
        </>
      )}
    </div>
  )
}

// ─── Shiny video question ─────────────────────────────────────────────────────
// Same visual scaffolding as ShinyAudioQuestion (series label, question
// number/label, centered "visualization", ▶/⏸ button) — the waveform +
// <audio> tag are swapped for a video box + YouTube iframe, only mounted
// (and thus only playing) while `playing` is true.

function ShinyVideoQuestion({ slide, theme }) {
  const { data } = slide
  const part = resolveShinyPart(data)
  const reduce = useReducedMotion()
  const [playing, setPlaying] = useState(false)

  // A multi-part series keeps the same slide.id across parts — reset
  // playback state when the host advances to a different clip.
  useEffect(() => {
    setPlaying(false)
  }, [slide.id, data.currentPart])

  // A plain embed has no onEnded event, so time the auto-stop ourselves
  // from the configured clip length (mirrors the host editor's own
  // getCurrentTime() >= end polling for "Preview clip").
  useEffect(() => {
    if (!playing || !part.youtubeEnd) return
    const ms = Math.max(0, (part.youtubeEnd - (part.youtubeStart || 0)) * 1000)
    if (ms <= 0) return
    const t = setTimeout(() => setPlaying(false), ms)
    return () => clearTimeout(t)
  }, [playing, part.youtubeEnd, part.youtubeStart])

  const embedSrc = part.youtubeId
    ? youtubeEmbedUrl(part.youtubeId, { start: part.youtubeStart, end: part.youtubeEnd, autoplay: true, controls: false })
    : null

  return (
    <div
      className="w-full h-full relative flex flex-col items-center justify-center gap-10 overflow-hidden"
      style={{ background: theme.colors.shinyBg }}
    >
      {/* Background glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 70% 60% at 50% 50%, ${SHINY_GOLD_GLOW}18 0%, transparent 65%)`,
        }}
      />


      {/* Question number/label */}
      <motion.div
        initial={{ opacity: 0, y: reduce ? 0 : 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.06, duration: 0.22, ease: EASE_OUT }}
        className="relative z-10 text-center"
      >
        <p
          style={{
            fontFamily: `'${theme.fonts.display}', sans-serif`,
            color: theme.colors.text,
            fontSize: 'clamp(3rem, 8cqw, 6rem)',
            fontWeight: 700,
            lineHeight: 1,
          }}
        >
          {part.questionNumber != null ? `Q${part.questionNumber}` : (data.questionLabel ?? data.questionNumber)}
        </p>
        {part.text && (
          <p className="mt-3" style={{ color: theme.colors.textMuted, fontSize: '1.5rem' }}>
            {part.text}
          </p>
        )}
      </motion.div>

      {/* Video box — replaces the waveform */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.15, duration: 0.3 }}
        className="relative z-10 rounded-2xl overflow-hidden"
        style={{
          width: 'min(60vw, 980px)',
          aspectRatio: '16 / 9',
          background: theme.colors.bgDeep,
          boxShadow: `0 0 0 1px ${SHINY_GOLD}30`,
        }}
      >
        {playing && embedSrc ? (
          <iframe
            key={`${slide.id}:${data.currentPart ?? 0}`}
            src={embedSrc}
            title="Shiny video clip"
            className="w-full h-full"
            style={{ border: 0, display: 'block' }}
            allow="autoplay; encrypted-media; picture-in-picture"
            allowFullScreen
          />
        ) : (
          <div
            className="w-full h-full flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${theme.colors.bgDeep}, ${theme.colors.bg})` }}
          >
            <span style={{ fontSize: '3.5rem', opacity: 0.3, filter: `drop-shadow(0 0 12px ${SHINY_GOLD_GLOW}60)` }}>🎬</span>
          </div>
        )}
      </motion.div>

      {/* Play button — same convention as ShinyAudioQuestion */}
      {part.youtubeId && (
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.25, ease: EASE_OUT }}
          className="relative z-10"
        >
          <div
            data-no-step
            className="w-24 h-24 rounded-full flex items-center justify-center cursor-pointer"
            onClick={() => setPlaying(p => !p)}
            style={{
              background: theme.colors.accent,
              boxShadow: playing ? 'none' : `0 0 40px ${SHINY_GOLD_GLOW}50`,
              animation: playing ? 'none' : 'playPulse 2.4s ease-in-out infinite',
            }}
          >
            <span style={{ color: SHINY_GOLD, fontSize: '2.5rem', marginLeft: playing ? 0 : 4 }}>
              {playing ? '⏸' : '▶'}
            </span>
          </div>
        </motion.div>
      )}
    </div>
  )
}

// ─── Shiny list question ───────────────────────────────────────────────────────

function ShinyListQuestion({ slide, theme }) {
  const { data } = slide
  const reduce = useReducedMotion()
  const items = data.listItems ?? []
  const hasPoints = !!data.shinyInputSchema?.hasPoints

  const listBoxRef = useRef(null)
  const rowSize = useFitListToBox(listBoxRef, items.map(it => it.text), {
    family: theme.fonts.body,
    floorPx: LIST_ITEM_FLOOR * 16,
    ceilPx: LIST_ITEM_CEIL * 16,
    gapPx: 18,
    rowInset: hasPoints ? 160 : 96,
    maxLinesPerRow: 2,
    lineHeight: 1.35,
  })

  return (
    <div className="w-full h-full relative overflow-hidden flex flex-col items-center justify-center px-24 py-16" style={{ background: theme.colors.shinyBg }}>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 70% 55% at 50% 50%, ${SHINY_GOLD_GLOW}18 0%, transparent 65%)` }}
      />

      {data.text && (
        <motion.p
          initial={{ opacity: 0, y: reduce ? 0 : -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: EASE_OUT }}
          className="relative z-10 text-center mb-8"
          style={{
            color: theme.colors.text,
            fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
            fontSize: 'clamp(1.3rem, 2.8vw, 2.1rem)',
            fontWeight: 500,
            maxWidth: '70ch',
          }}
        >
          {data.text}
        </motion.p>
      )}

      <div ref={listBoxRef} className="relative z-10 w-full max-w-4xl">
        <ol className="space-y-4">
          {items.map((item, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: reduce ? 0 : -16 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.08 + i * 0.06, duration: 0.22, ease: EASE_OUT }}
              className="flex gap-5 items-center justify-center"
            >
              <span
                className="shrink-0 flex items-center justify-center rounded-full"
                style={{
                  width: 40, height: 40,
                  background: theme.colors.accent,
                  fontFamily: `'${theme.fonts.display}', sans-serif`,
                  color: theme.colors.highlight,
                  fontSize: '1rem', fontWeight: 700,
                }}
              >
                {i + 1}
              </span>
              <p
                style={{
                  color: theme.colors.text,
                  fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
                  fontSize: `${rowSize}px`,
                  fontWeight: 500,
                  lineHeight: 1.35,
                }}
              >
                {item.text}
              </p>
              {hasPoints && (
                <span
                  className="shrink-0 rounded-full px-3 py-1"
                  style={{
                    background: theme.colors.bgDeep,
                    color: theme.colors.highlight,
                    fontFamily: `'${theme.fonts.display}', sans-serif`,
                    fontSize: '0.95rem', fontWeight: 700,
                    boxShadow: `0 0 0 1px ${theme.colors.highlight}55`,
                  }}
                >
                  +{item.points ?? 0}
                </span>
              )}
            </motion.li>
          ))}
        </ol>
      </div>

      <div className="absolute top-5 left-5 z-20 text-2xl" style={{ filter: `drop-shadow(0 0 8px ${SHINY_GOLD_GLOW})` }}>✨</div>
    </div>
  )
}

// ─── Shiny concurrent question ────────────────────────────────────────────────
// A text series played all-at-once: every part stays on screen as a
// label | question | answer row, and each Next fills in one more answer cell
// (data.currentPart is the highest revealed row — the existing per-part
// stepping, untouched, just read additively here instead of as a swap).

function ShinyConcurrentQuestion({ slide, theme, isPreview }) {
  const { data } = slide
  const reduce = useReducedMotion()
  const parts = data.parts ?? []
  // A part normally IS one display row (Song Lyrics: 6 parts, 6 rows, one
  // reveal per Next). data.groupSize chunks flat parts into fixed-size
  // reveal groups instead — several rows reveal TOGETHER on one Next press
  // (2026-08-25, Ben: Disney wants "three and three" — 6 rows, only 2
  // reveal presses). Parts stay flat so the existing part-editor UI keeps
  // working; slideStepping.js's stepCount mirrors this chunking so Next/Prev
  // cap at group count, not raw part count.
  const groupSize = data.groupSize || 1
  const rowGroups = []
  for (let i = 0; i < parts.length; i += groupSize) rowGroups.push(parts.slice(i, i + groupSize))
  const rows = rowGroups.flatMap((g, gi) => g.map(r => ({ ...r, _group: gi })))
  // currentPart counts groups ALREADY revealed here, not "the part currently
  // on screen" — 0 means nothing revealed yet. (Fixed 2026-08-25, live show
  // bug: this used to add +1, so group 0's answer showed on the very first
  // content frame before any Next press — Ben: "pyl song lyrics... already
  // had the first answer revealed." slideStepping.js's revealStepCount gives
  // this format one extra Next-reachable state up front so the last group is
  // still reachable now that 0 no longer means "one revealed.") isPreview
  // (the host's build-mode canvas, SlideCanvasEditor) forces this to 0
  // regardless of currentPart — 2026-08-25, Ben: browsing/editing this slide
  // in Build Mode must never leak an answer onto the host's own screen
  // before the round is actually live.
  const revealedGroups = isPreview ? 0 : (data.introDone ? Math.min(data.currentPart ?? 0, rowGroups.length) : 0)
  // groupSize > 1 with more than one group (Disney: 2 groups of 3) means a
  // real "columns" layout, not just fewer reveal presses — see isPaired's
  // render branch below.
  const isPaired = groupSize > 1 && rowGroups.length > 1

  // Fixed-px side columns on purpose: the stage is a fixed 1920 canvas
  // (same assumption QUESTION_BOX bakes in), and a constant label/answer
  // width makes the question column's width "container minus a constant" —
  // exactly the rowInset shape useFitListToBox already handles, so this
  // reuses the measured-uniform-rows convention from ShinyListQuestion
  // instead of a guessed clamp(). Question text drives the shared size;
  // labels/answers are short (song names / titles) and render slightly
  // smaller in their own fixed cells.
  // Narrowed from an earlier 340/440 pass (2026-08-25, Ben: "wayyyyyyyy too
  // small") — those widths reserved over 800px of a 1680px stage, starving
  // the fit hook's available width for the actual question text and driving
  // it toward its floor on anything but the shortest line.
  // Narrowed again (2026-08-25, Ben: "this slides text needs to be
  // bigger") — labels/answers here are short single words/titles, not
  // worth 530px of fixed width when it's the question column's fit that
  // sets everyone's size. Ceiling raised to match (was a literal 4.4rem;
  // now reads LIST_ITEM_CEIL directly since the shared const was bumped
  // to this exact value in the same tuning pass — one less magic number
  // to keep in sync by hand).
  const LABEL_W = 190, ANSWER_W = 220, COL_GAP = 24, ROW_GAP = 14
  const gridRef = useRef(null)
  const rowSize = useFitListToBox(gridRef, rows.map(r => r.text ?? ''), {
    family: theme.fonts.body,
    floorPx: LIST_ITEM_FLOOR * 16,
    ceilPx: LIST_ITEM_CEIL * 16,
    gapPx: ROW_GAP,
    rowInset: LABEL_W + ANSWER_W + COL_GAP * 2,
    maxLinesPerRow: 2,
    lineHeight: 1.3,
  })

  const rowEntrance = i => ({
    initial: { opacity: 0, x: reduce ? 0 : -16 },
    animate: { opacity: 1, x: 0 },
    transition: { delay: 0.08 + i * 0.06, duration: 0.22, ease: EASE_OUT },
  })

  return (
    <div className="w-full h-full relative overflow-hidden flex flex-col items-center justify-center px-20 py-14" style={{ background: theme.colors.shinyBg }}>
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 70% 55% at 50% 50%, ${SHINY_GOLD_GLOW}18 0%, transparent 65%)` }}
      />

      {data.text && (
        <motion.p
          initial={{ opacity: 0, y: reduce ? 0 : -12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25, ease: EASE_OUT }}
          className="relative z-10 text-center mb-8"
          style={{
            color: theme.colors.text,
            fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
            fontSize: 'clamp(1.3rem, 2.8vw, 2.1rem)',
            fontWeight: 500,
            maxWidth: '70ch',
          }}
        >
          {data.text}
        </motion.p>
      )}

      {/* flex-1 min-h-0 gives the fit hook a real bounded height to divide
          among the rows, instead of a content-driven one that grows with
          whatever size it just picked. */}
      <div ref={gridRef} className="relative z-10 w-full flex-1 min-h-0" style={{ maxWidth: 1820 }}>
        {isPaired ? (
          // Paired mode (groupSize > 1, more than one group): one COLUMN per
          // reveal group instead of one row per part — 2026-08-25, Ben:
          // Disney's 3-and-3 has to read as "left column / right column", not
          // a single 6-row list. Each group is short, fixed-count, bounded-
          // length proper nouns (character/team names), so a tuned cqw clamp
          // stands in for the measure-to-fit hook here rather than teaching
          // that hook a second, per-column box shape for one slide type.
          //
          // columnHeaders (optional, per-slide data): array of [labelHeader,
          // answerHeader] pairs, one per group — 2026-08-25, Ben: "theres
          // nothing referencing what i need for answers" — audience needs to
          // know THIS side is the character, THAT side is the team. Row
          // numbers count straight through 1..N across groups, not restart
          // per column (same ask, same message).
          <div
            className="w-full h-full grid"
            style={{ gridTemplateColumns: `repeat(${rowGroups.length}, minmax(0, 1fr))`, columnGap: 64, alignContent: 'center' }}
          >
            {rowGroups.map((group, gi) => {
              const headers = data.columnHeaders?.[gi]
              return (
              <div key={gi} className="flex flex-col justify-center" style={{ gap: 28 }}>
                {headers && (
                  <div className="flex items-center justify-between gap-6 pb-1" style={{ borderBottom: `1px solid ${SHINY_GOLD_GLOW}55` }}>
                    <span style={{ color: theme.colors.textMuted, fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`, fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{headers[0]}</span>
                    <span style={{ minWidth: '35%', textAlign: 'right', color: theme.colors.textMuted, fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`, fontSize: '1rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{headers[1]}</span>
                  </div>
                )}
                {group.map((row, ri) => (
                  <div key={ri} className="flex items-center justify-between gap-6">
                    <motion.p
                      {...rowEntrance(gi * groupSize + ri)}
                      style={{
                        color: theme.colors.highlight,
                        fontFamily: `'${theme.fonts.display}', sans-serif`,
                        fontSize: 'clamp(1.6rem, 3.4cqw, 2.6rem)',
                        fontWeight: 700,
                        lineHeight: 1.2,
                      }}
                    >
                      <span style={{ color: theme.colors.textMuted, fontSize: '0.55em', fontWeight: 600, marginRight: '0.4em' }}>{gi * groupSize + ri + 1}.</span>
                      {row.label}
                    </motion.p>
                    <div style={{ minWidth: '35%', textAlign: 'right' }}>
                      {gi < revealedGroups && (
                        <motion.p
                          key={`${slide.id}:ans:${gi}:${ri}`}
                          initial={{ opacity: 0, x: reduce ? 0 : 14 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ duration: 0.28, ease: EASE_OUT }}
                          style={{
                            color: SHINY_GOLD,
                            fontFamily: `'${theme.fonts.display}', sans-serif`,
                            fontSize: 'clamp(1.6rem, 3.4cqw, 2.6rem)',
                            fontWeight: 700,
                            lineHeight: 1.2,
                          }}
                        >
                          {row.answer}
                        </motion.p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              )
            })}
          </div>
        ) : (
          <div
            className="w-full h-full"
            style={{
              display: 'grid',
              gridTemplateColumns: `${LABEL_W}px minmax(0, 1fr) ${ANSWER_W}px`,
              columnGap: COL_GAP,
              rowGap: ROW_GAP,
              alignContent: 'center',
              alignItems: 'center',
            }}
          >
            {/* columnHeaders (optional): [labelHeader, textHeader, answerHeader]
                — 2026-08-25, Ben: "song, lyrics, answer as column titles". Plain
                grid cells in the same 3-col template, not a separate row
                element, so they line up with the data cells for free. */}
            {data.columnHeaders?.length === 3 && (
              <Fragment>
                {data.columnHeaders.map((h, ci) => (
                  <span key={ci} style={{
                    color: theme.colors.textMuted,
                    fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
                    fontSize: '1rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    borderBottom: `1px solid ${SHINY_GOLD_GLOW}55`,
                    paddingBottom: 6,
                    textAlign: ci === 0 ? 'left' : ci === 2 ? 'right' : 'left',
                  }}>
                    {h}
                  </span>
                ))}
              </Fragment>
            )}
            {rows.map((row, i) => (
              <Fragment key={i}>
                <motion.p
                  {...rowEntrance(i)}
                  style={{
                    color: theme.colors.highlight,
                    fontFamily: `'${theme.fonts.display}', sans-serif`,
                    fontSize: `${rowSize * 0.9}px`,
                    fontWeight: 700,
                    lineHeight: 1.2,
                  }}
                >
                  {row.label}
                </motion.p>
                <motion.p
                  {...rowEntrance(i)}
                  style={{
                    color: theme.colors.text,
                    fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
                    fontSize: `${rowSize}px`,
                    fontWeight: 500,
                    lineHeight: 1.3,
                  }}
                >
                  {row.text}
                </motion.p>
                {/* Cell div always present so the grid never reflows on a
                    reveal; only the answer inside mounts. Key is stable per
                    row, so the entrance fires exactly once — when that row's
                    group newly reveals — not on later renders. */}
                <div>
                  {row._group < revealedGroups && (
                    <motion.p
                      key={`${slide.id}:ans:${i}`}
                      initial={{ opacity: 0, x: reduce ? 0 : 14 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.28, ease: EASE_OUT }}
                      style={{
                        color: SHINY_GOLD,
                        fontFamily: `'${theme.fonts.display}', sans-serif`,
                        fontSize: `${rowSize * 0.95}px`,
                        fontWeight: 700,
                        lineHeight: 1.25,
                      }}
                    >
                      {row.answer}
                    </motion.p>
                  )}
                </div>
              </Fragment>
            ))}
          </div>
        )}
      </div>

      <div className="absolute top-5 left-5 z-20 text-2xl" style={{ filter: `drop-shadow(0 0 8px ${SHINY_GOLD_GLOW})` }}>✨</div>
    </div>
  )
}

// ─── Shiny intro → content pan ────────────────────────────────────────────────
// Ben, 2026-08-17: "literally just the pan transition up to an image." When
// introDone flips, the title card lifts UP and out of frame while the real
// content rises into the space it left, so the swap reads as the camera
// tilting up past the card to the thing sitting behind it. Before this it was
// a plain conditional render — an instant cut with no exit/enter at all (and
// SlideRenderer's cross-slide transition never covered it: same component
// instance, same key={slide.id}, so nothing there re-runs on this swap).
//
// mode="wait" — the card must be gone before the content arrives. Overlapping
// them would stack two full-bleed layers over the ambient world mid-pan.
//
// GPU-only: transform + opacity, nothing else. Full `transform` strings rather
// than Framer's `y` shorthand so this stays on the hardware-accelerated path
// (the shorthand runs on the main thread via rAF), and so the distances can be
// percentages of the element's own height — the wrapper is inset-0, so they
// scale with the stage instead of being pinned to 1080p pixel values.
//
// Distances are deliberately partial (20% out / 16% in), not a full 100%
// travel: with mode="wait" the two halves don't move together, so a full-frame
// slide would show the empty gap between them. A shorter throw paired with an
// opacity fade reads as one continuous camera move.
//
// No overshoot/spring on purpose. The intro card already lands with its own
// two-oscillation boing, and ShinyVisualQuestion's image settles from
// scale 1.08 — a third bounce on the container made the whole beat read busy
// on a TV. The pan owns the container; the existing inner entrances still run
// underneath it and compose fine (nested transforms multiply).
//
// Direction (2026-08-24, Ben: "after the third slide of a shiny that pans, it
// should then pan back down to the shiny title"): the closing beat has to
// travel the OPPOSITE way from the opening one, or the camera appears to keep
// moving forward while the content goes backwards. `dir` is +1 for the
// title→content pan and -1 for the content→title pan back, and simply flips
// the sign of both throws — same distances, same durations, same curves,
// mirrored. Written as dynamic variants (functions of `custom`) specifically
// because the EXITING half can't be reached any other way: AnimatePresence
// freezes the outgoing element's props at removal, so its exit direction has
// to arrive through AnimatePresence's own `custom` prop.
const SHINY_PAN = {
  initial: dir => ({ opacity: 0, transform: `translateY(${16 * dir}%)` }),
  animate: { opacity: 1, transform: 'translateY(0%)', transition: { duration: 0.36, ease: EASE_PANEL } },
  exit:    dir => ({ opacity: 0, transform: `translateY(${-20 * dir}%)`, transition: { duration: 0.24, ease: EASE_EXIT } }),
}
// Reduced motion keeps the content and the beat, drops the travel — a short
// crossfade, no position change.
const SHINY_PAN_REDUCED = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.2, ease: EASE_OUT } },
  exit:    { opacity: 0, transition: { duration: 0.14, ease: EASE_EXIT } },
}

// ─── Main dispatcher ──────────────────────────────────────────────────────────

function ShinyContent({ slide, show, theme, transitionKey, isPreview }) {
  const { data } = slide
  const part = resolveShinyPart(data)

  // "All at once" with image assets — every asset on screen together, one
  // shared answer, no per-press reveal (Ben, 2026-08-26: one-at-a-time is
  // what sequential is for). Reuses GridSlide's drawing code via the
  // partsToGridView adapter rather than a second renderer, and sits ABOVE
  // the visual branch so concurrent beats the one-at-a-time treatment.
  // isVisualShiny guards the tiles: GridContent draws <img>, so only image
  // assets belong here (the wizard only offers "all at once" for text and
  // image formats for the same reason).
  if (isConcurrentMediaShiny(data) && isVisualShiny(data) && Array.isArray(data.parts) && data.parts.length > 1) {
    return <GridContent slide={{ ...slide, data: { ...data, ...partsToGridView(data) } }} theme={theme} />
  }
  if (isVisualShiny(data) && part.mediaUrl) {
    // Legacy Swing Round flag (see resolveShinyPart's comment) routes to the
    // pan-reveal treatment; format-library image questions keep the
    // existing immediate text+image layout, unchanged.
    return data.shinyType === 'visual'
      ? <ShinySwingVisualQuestion slide={slide} theme={theme} />
      : <ShinyVisualQuestion slide={slide} theme={theme} show={show} />
  }
  if (isAudioShiny(data)) {
    return <ShinyAudioQuestion slide={slide} theme={theme} show={show} isPreview={isPreview} />
  }
  if (isVideoShiny(data)) {
    return <ShinyVideoQuestion slide={slide} theme={theme} />
  }
  if (isListShiny(data)) {
    return <ShinyListQuestion slide={slide} theme={theme} />
  }
  if (isMatchingShiny(data)) {
    return <ShinyMatchingQuestion slide={slide} theme={theme} />
  }
  if (isWagerShiny(data)) {
    return <ShinyWagerQuestion slide={slide} show={show} theme={theme} />
  }
  // Concurrent TEXT — the cumulative-reveal treatment. isConcurrentShiny is
  // the single gate (it keeps legacy concurrent IMAGE series, e.g. "Time for
  // a Close Up", on their one-at-a-time visual treatment above); the media
  // check excludes the tiles branch at the top of this dispatcher. This
  // condition used to be restated inline here instead of calling the gate —
  // that duplication is exactly what the 2026-08-26 rebuild consolidated.
  if (isConcurrentShiny(data) && !isConcurrentMediaShiny(data) && Array.isArray(data.parts) && data.parts.length > 1) {
    return <ShinyConcurrentQuestion slide={slide} theme={theme} isPreview={isPreview} />
  }
  if (isOrderShiny(data)) {
    return <ShinyOrderQuestion slide={slide} show={show} theme={theme} />
  }
  return <StandardQuestion slide={slide} theme={theme} show={show} transitionKey={transitionKey} />
}

export default function QuestionSlide({ slide, show, transitionKey, isPreview }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const { data } = slide

  // Warm every image this slide can show, the moment the slide mounts — see
  // warmImages.js for why (a part step remounts the <img> with a cold src,
  // so the entrance animation plays over an empty box and the photo pops in
  // after it). Deliberately here, above the early return: this runs for the
  // shiny intro card too, which is ~2s of free lead time before the first
  // photo is even asked for, and hooks order has to stay stable regardless.
  // No-op for a slide with no image media.
  useEffect(() => {
    warmImages(slideImageUrls(data))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slide.id])

  // Non-shiny questions never see the intro↔content swap, so they never enter
  // the AnimatePresence below — identical output and identical DOM depth to
  // before this transition existed.
  if (!data.isShiny) {
    return <StandardQuestion slide={slide} theme={theme} show={show} transitionKey={transitionKey} />
  }

  const showIntro = !data.introDone
  // The title card is showing again AFTER its content already ran — the
  // closing beat (slideStepping.js's outroShown). Same card, panned back the
  // way it came, and rendered quiet instead of replaying the entrance.
  const isClosing = showIntro && !!data.outroShown
  const dir = isClosing ? -1 : 1

  return (
    // initial={false} — the first mount must not animate. Arriving on a shiny
    // slide is SlideRenderer's transition to own; this one exists only for the
    // intro→content swap that happens later, while the slide is already up.
    // custom={dir} feeds the dynamic variants above — on AnimatePresence so
    // the outgoing (frozen-props) half reads the CURRENT direction, and on the
    // motion.div so the incoming half reads the same one.
    <AnimatePresence mode="wait" initial={false} custom={dir}>
      <motion.div
        key={showIntro ? 'shiny-intro' : 'shiny-content'}
        className="absolute inset-0"
        variants={reduce ? SHINY_PAN_REDUCED : SHINY_PAN}
        custom={dir}
        initial="initial"
        animate="animate"
        exit="exit"
      >
        {showIntro
          ? <ShinyIntroScreen slide={slide} theme={theme} show={show} isClosing={isClosing} />
          : <ShinyContent slide={slide} show={show} theme={theme} transitionKey={transitionKey} isPreview={isPreview} />}
      </motion.div>
    </AnimatePresence>
  )
}
