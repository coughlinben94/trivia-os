# Display View Architecture

**Path:** `client/src/views/Display.jsx` + `client/src/components/display/`

## Routing Logic (Display.jsx)
```
loading=true                           → black screen + spinner
show=null                              → purple fallback
?preview=true                          → PreviewSlide (debug label, no realtime)
is_live && current_slide_id === null   → PreShowScreen
is_live && current_slide_id !== null   → DisplayInner
```

## PreShowScreen
Shows during `is_live=true` but before first slide advance.
```
[ParticleBackground]    ← theme-driven, locks in for the session
[QR code]               ← 160×160, /join?show=${id}
[Team count]            ← "X teams in" (large heading)
[Ticker]                ← always 1920px width
                          < 5 teams: scrolls custom messages (or defaults)
                          ≥ 5 teams: scrolls team names
[Baynes watermark]      ← bottom-right, 18% opacity
[Ben photo]             ← bottom-left, 120px, 0.7 opacity
```

## DisplayInner
```
[ParticleBackground]  ← same instance, OUTSIDE AnimatePresence (never re-mounts)
[AnimatePresence]     ← wraps SlideRenderer only
  [SlideRenderer]     ← current slide + transition animation
    [QuestionCounter] ← top-right (question slides only): "Q3 · R1"
    [BaynesWatermark] ← bottom-right, 18% opacity, all slides
```

## ParticleBackground — The Most Important Rule
**Never re-mounts.** Lives at DisplayInner level, outside AnimatePresence.  
Never add a `key` prop or wrap it in anything that could cause unmount.  
Re-renders only when `theme` prop changes (theme switch is intentional).  

**3-layer architecture:**
1. **Atmosphere** — gradient washes, low-energy motion, full-screen fills
2. **Mid glow** — accent color elements, soft radials, mid-depth
3. **Accent detail** — focal anchor (sun/moon/sign/sprite), foreground accents

**Center safe-area:** 60% width × 45% height kept CLEAR for question text.  
**GPU-only:** `transform` + `opacity` only in `@keyframes`. Never `color`, `filter`, `box-shadow`, `width`, `height`.

## SlideRenderer.jsx
Routes `slide.type` → component. Also manages transitions.

**SLIDE_COMPONENTS map:**
```js
'title' → TitleSlide
'state-of-union' → StateOfUnionSlide
'round-intro' → RoundIntroSlide
'question' → QuestionSlide
'grading-break' → GradingBreakSlide
'scoreboard-reveal' → ScoreboardRevealSlide
'custom' → CustomSlide
'multi-question' → MultiQuestionSlide
'pixelate-series' → PixelateSeriesSlide
'pyl-reveal' → PylRevealSlide
```

**9 transitions:** dissolve, emerge, zoom, punch, drop, descend, sink, settle, loom  
`'random'` picks randomly (no immediate repeat).  
Reduced-motion collapses all to dissolve (opacity crossfade only).

**Easing curves (canonical):** all imports come from `client/src/lib/easings.js` — never redeclare locally. Full table in `SKILL.md`'s "Easing curves (canonical)".
```js
EASE_OUT   = [0.23, 1, 0.32, 1]  // standard enters (most common)
EASE_EXIT  = [0.33, 1, 0.68, 1]  // exits
EASE_DROP  = [0.25, 1, 0.25, 1]  // weighted lands
EASE_BAR   = [0.4, 0, 0.2, 1]    // score/progress bars
EASE_PANEL = [0.32, 0.72, 0, 1]  // drawers/sheets
```
Old names `EASE_SNAP`/`EASE_QUINT`/`EASE_QUART`/`EASE_CUBIC`/`EASE_DRAWER` are retired.

## QuestionCounter
- Shows on `question` type slides only
- Format: `Q{questionNumber} · R{roundIndex+1}`
- Top-right corner, 20px from edge
- Theme accent color at 70% opacity, uppercase, letter-spaced
- Never animates

## BaynesWatermark
- Bottom-right, all slide types
- 18% opacity, theme text color (not full-color logo)

## Audio (question slides with shinyType: 'audio')
- WaveformBars.jsx renders animated bars
- PLAY button — no autoplay
- `audioGainDb` from slide data → Web Audio GainNode applied on playback
- Gain computed at upload by `audioNormalize.js` (target RMS: −20dBFS, peak: −1dBFS, clamp ±12dB)

## Stage Boundary

**Source:** `client/src/display/stage.js` + `client/src/display/StageFrame.jsx`

```js
STAGE_SCALE = 0.85
STAGE.width  = 1632   // Math.round(1920 * 0.85)
STAGE.height = 918    // Math.round(1080 * 0.85)
```

StageFrame is a centered, clipped box mounted in `DisplayInner` between ParticleBackground and the slide content. Every foreground surface — questions, shiny cards, scoreboard pullout, PYL popup, winner reveal, powerup callouts, media — renders inside it. Nothing may overflow this box.

**CSS contract:**
- `position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%)`
- `width: calc(100vw * var(--stage-scale)); height: calc(100vh * var(--stage-scale))`
- `overflow: hidden` — the enforcement; transitions clip at the wall
- `container-type: size` — children may use `cqw`/`cqh` relative to the stage
- `pointer-events: none` on the outer frame; inner wrapper restores `auto`
- `z-index: 2` — above ParticleBackground (z:1), below viewport overlays (z-50)

**What stays full-viewport (outside StageFrame):**
- `ParticleBackground` — never re-mounts, always full-viewport behind the stage
- `QuestionCounter`, `AnswerRevealOverlay`, `ScoreboardOverlay`, `BaynesWatermark` — viewport-level overlays (migrated to StageFrame in later commits)
- `PreShowScreen` ticker bar — intentionally bleeds to screen edges

**Relationship to the ambient safe-area rule:**
The center 60% width × 45% height safe area is a separate, unchanged ambient-design law. The stage boundary and the safe area are independent constraints: the stage clips foreground content at 85% viewport, the safe area reserves the inner region of the stage for question text (ambient elements stay outside that inner region).

## Realtime Sync Pattern
All display surfaces subscribe to the show row and react to:
- `current_slide_id` change → advance/rewind
- `theme_id` change → update ParticleBackground theme
- `is_live` change → switch between PreShowScreen and DisplayInner
- `scoreboard_visible`, `scores_revealed` → show/hide scoreboard overlay
