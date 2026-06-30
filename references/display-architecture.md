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

**Easing constants:**
```js
EASE_QUINT = [0.22, 1, 0.36, 1]  // standard ease-out (most common)
EASE_QUART = [0.25, 1, 0.25, 1]  // weighted hard land
EASE_CUBIC = [0.33, 1, 0.68, 1]  // gentle entry
```

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

## Realtime Sync Pattern
All display surfaces subscribe to the show row and react to:
- `current_slide_id` change → advance/rewind
- `theme_id` change → update ParticleBackground theme
- `is_live` change → switch between PreShowScreen and DisplayInner
- `scoreboard_visible`, `scores_revealed` → show/hide scoreboard overlay
