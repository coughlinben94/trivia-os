# references/brand.md — Baynes Identity, Design Philosophy, Animation, Impeccable

**Read before:** any display-view component, any animation code, any Baynes visual, any UX copy, before marking any display component done.

---

## Baynes Apple Valley Brand Identity

Every surface of Trivia OS carries the Baynes Apple Valley identity. This is not a generic trivia app. It is Baynes Trivia Night. The brand must be present and felt.

### Brand Colors

| Name | Hex | Usage |
|---|---|---|
| Deep Forest Green | `#004000` | Primary brand — logo, round intro accents, grading break backgrounds |
| Apple Red | `#e02020` | Shiny slide accent, powerup alerts, special event highlights |
| Orchard Green | `#60a000` | Secondary accent — question counter, watermark tint |
| Bright Leaf | `#60c000` | Nature details, small decorative elements |
| Cream | `#f5f0e8` | Text on dark backgrounds, light overlays |

**Never use all colors at once.** Per design surface: 2–3 colors max. The weekly theme drives the primary palette — Baynes colors appear as accents and watermarks.

### Typography

**Display font: Handters** — the Baynes hero font. Used for all large display text: round titles, scoreboard headers, question number badges, title slide, shiny round title cards.

**Supporting font: Roquen** — the Baynes secondary font. Used for question text body, round subtitles, grading break messages, team names on scoreboard, score labels.

**Current default fonts:** Boogaloo (display) + DM Sans (body/UI) — every theme still ships these as its base `fonts.display`/`fonts.body`; the per-theme font field exists but is unused.

**Handters + Roquen are loaded and selectable, just not the default.** Files live at repo-root `public/fonts/` (Vite's `publicDir` points there, not `client/public/`), `@font-face` declarations already exist in `index.css`, and both are in `ThemeCustomizeControls.jsx`'s `DISPLAY_FONTS` preset list alongside Boogaloo/DM Sans — a host can pick either as a per-show override from `ThemePickerModal`'s Customize row. No theme uses them by default yet.

**Never use thin or geometric serifs on the display view.** The crowd is in a dark bar, often drinking. Legibility at 20 feet beats elegance every time.

### Logo Placement

- `/display` — bottom-right watermark, 18% opacity, theme text color (not full-color). Present on every slide. Implemented in `BaynesWatermark.jsx`.
- Round intro slides — centered above round title, 35% opacity, slightly more prominent
- Host panel — full-color logo top-left nav bar
- `/join` — top of registration screen, cream/white variant

**The Baynes logo character** (farmer on a red apple, raising a cider glass) is the soul of the brand. Playful, hardworking, celebratory — that energy should inform every visual decision.

### Brand Tone

- Warm and welcoming — never corporate, never cold
- Confident but not arrogant
- A little bit funny — the host's personality is part of the show
- Michigan orchard energy — genuine, grounded, seasonal

---

## The Host Personality & Ben Photos

The host is Ben Coughlin. His personality is intentionally woven into the show — the crowd makes fun of him, in the best way. **This is a feature, not a bug.**

### Ben Photo System

Photos live in `/public/ben/`. Drop any PNG/JPG there and it's immediately available app-wide without any code changes.

**API route:** `/api/ben-photos.js` — Vercel serverless function. Reads `/public/ben/`, returns JSON array of public URLs: `["/ben/Ben1.png", "/ben/IMG_xxxx.png", ...]`

**Hook:** `useBenPhotos.js` — fetches `/api/ben-photos` on mount. Returns `{ photos, randomPhoto, loading }`. `randomPhoto` is picked once on mount — stable, doesn't re-roll on re-render.

**Component:** `BenPhoto.jsx` (`/components/shared/`) — takes `size` (number, default 80) and `className` props. Renders a `border-radius: 50%` circle img at the specified size, `object-fit: cover`. Returns null while loading or if no photos available — no broken image icon.

**Where Ben photos appear:**
- `/join` registration screen — 100px circle at top of form, above the "Trivia Night" heading
- Pre-show screen — 120px circle, bottom-left corner, `opacity: 0.7`
- Grading break slides — thumbnail, lower-left corner (~15% of slide width)
- Round intro slides — medium inset (30–40% of slide, offset)
- Shiny round title cards — medium-small (20–25%, lower left)
- Emotional slides (R5 "Ben loves you") — NO photo. The absence is the joke.

### Photo Display Philosophy

- Never formal or polished — the charm is in the candid, slightly ridiculous quality
- Large, centered or full-bleed with text overlaid
- Optional slight vignette around edges to blend with theme background
- The photo should feel like it was thrown in there on purpose. Because it was.

### Host Voice in UI Copy

All copy in the app should sound like Ben wrote it. Warm, funny, self-deprecating. Examples from the deck (exact verbatim):

- *"This ain't just your mommas trivia…."*
- *"Now, please sit back, relax, and enjoy each others company as Ben grades papers 😊"*
- *"Have fun, and don't yell at me, I'm not a professional trivia writer! lol"*
- *"It did not went well."* (Round 2 subtitle — intentional grammar error, beloved)
- *"Ben loves you, truly. You guys make my week, every single time we do this silly thing."*
- *"Whatever the quizmaster says, goes…"*
- *"we will throw your phone in the river"*

**The app should feel like he built it himself. Because he did.**

---

## Visual Design Philosophy — "Midnight Orchard"

Before writing any display-view CSS or component, internalize this. It is the aesthetic DNA of Trivia OS's `/display` view.

**Midnight Orchard** is the collision of two worlds: the raw warmth of a Michigan apple orchard at harvest time, and the electric darkness of a late-night game show. A cidery taproom with the lights down, TVs up, pencils and scorecards out.

**Form and space:** Bold geometry dominates. Questions occupy the screen like headlines — large, unambiguous, commanding. Negative space is breathing room for a crowd reading from across a bar. No clutter. No decoration for decoration's sake.

**Color and material:** The active weekly theme provides the primary palette. Dark backgrounds are the default; light is used only for emphasis. Think: a projector in a dark room, a fire pit at night, the glow of a tap handle.

**Scale and rhythm:** The question number badge lands before the text, orienting the crowd instantly. Question text is massive. Supporting elements (round name, counter, watermark) are whisper-quiet. The hierarchy is unambiguous at 20 feet.

**Transition as punctuation:** Slide transitions are not decoration — they are a dramatic pause, a spotlight shifting. Round intros slam in. Questions snap. The scoreboard reveals itself like a curtain rising. Motion serves the moment or it is removed.

**The host's presence:** Ben's photos are compositionally intentional. Large enough to read, positioned to contrast with text, chosen for maximum comic or emotional impact. They are not clip art. They are part of the show.

**Craftsmanship standard:** Every slide must look like it was designed, not generated. Margins are deliberate. Type is sized for legibility at distance, not visual balance at arm's length. Color is tested against dark bar conditions, not a bright monitor.

### Applying the Philosophy

1. **Start with the content** — what does the crowd need to see, and in what order?
2. **Strip everything that doesn't serve that** — every decoration must earn its place
3. **Apply the active theme** — colors, fonts from the theme definition
4. **Add Baynes accents** — watermark logo, subtle brand color references
5. **Test the motion** — does this transition serve the moment, or is it just movement?
6. **Ask: would this look good on a TV in a dark bar?** — if yes, ship it

---

## Emil Design Engineering Principles

These govern every animation, interaction, and motion decision. Read before writing any animation code.

### The Core Rule: Unseen details compound

When a transition feels exactly right, the crowd doesn't think "great animation" — they just feel the energy of the show. The aggregate of invisible correctness creates an experience people love without knowing why.

### Animation Decision Framework

**1. Should this animate at all?**

| Frequency | Decision |
|---|---|
| Every slide advance (100+ times/night) | No animation on the control itself. Only on the display output. |
| Occasional (score panel open, scoreboard reveal) | Standard animation |
| Rare/ceremonial (round intro, shiny slide, powerup) | Full dramatic treatment |

Stream Deck button presses on the host panel: **no animation**. The host presses next 80+ times a night.

**2. What easing?**

Canonical source: `client/src/lib/easings.js` (JS array exports, not CSS custom properties — the old `--ease-*` vars below don't exist in the codebase anymore):

```js
EASE_OUT   = [0.23, 1, 0.32, 1]   // slide transitions, snappy entries
EASE_DROP  = [0.25, 1, 0.25, 1]   // round intro slam, badge bounce (weighted land)
EASE_PANEL = [0.32, 0.72, 0, 1]   // score panel, /join sheet (drawers)
EASE_BAR   = [0.4, 0, 0.2, 1]     // scoreboard bar expansion
EASE_EXIT  = [0.33, 1, 0.68, 1]   // exits
```

**Never use `ease-in` for UI animations.** It starts slow — the exact moment the user is watching most closely. `ease-out` at 180ms feels faster than `ease-in` at 180ms.

**3. How fast?**

| Element | Duration |
|---|---|
| Slide transition (question → question) | 160–180ms |
| Score panel slide-out | 220ms |
| Round intro slam | 300ms entry, hold until advanced |
| Scoreboard row stagger | 80ms per row |
| Scoreboard bar expansion | 600ms |
| Shiny slide flash | 1 frame (16ms) |
| Shiny scale-in | 280ms |
| Button press feedback | 120ms |
| Toast alert (host panel) | 180ms in, 140ms out |
| /join scoreboard sheet | 320ms, --ease-drawer |

**Rule: UI animations (host panel) stay under 200ms. Display animations can be longer because they serve the performance.**

### Specific Implementation Rules

**Never animate from scale(0):**
```js
// Wrong — appears from nowhere
initial: { scale: 0, opacity: 0 }
// Right — has visible shape even when entering
initial: { scale: 0.96, opacity: 0, x: '100%' }
animate: { scale: 1, opacity: 1, x: 0 }
```

**Round intro overshoot spring:**
```js
initial: { scale: 3.5, opacity: 0 }
animate: { scale: 1, opacity: 1 }
transition: { type: 'spring', duration: 0.4, bounce: 0.25 }
// Title follows:
initial: { y: 60, opacity: 0 }
animate: { y: 0, opacity: 1 }
transition: { delay: 0.25, duration: 0.28, ease: [0.23, 1, 0.32, 1] }
```

**Host panel buttons — always feel responsive:**
```css
.host-button { transition: transform 120ms ease-out, background 100ms ease; }
.host-button:active { transform: scale(0.97); }
```

**Score input hold-to-confirm:**
```css
.confirm-overlay {
  clip-path: inset(0 100% 0 0);
  transition: clip-path 200ms ease-out; /* release: fast */
}
.confirm-button:active .confirm-overlay {
  clip-path: inset(0 0 0 0);
  transition: clip-path 1.2s linear; /* press: deliberate */
}
```

**Toast alerts:**
```js
enter: { y: -8, opacity: 0 } → { y: 0, opacity: 1 }, 200ms ease-out
exit:  { opacity: 0 }, 140ms ease-in
// Forward-attempt alerts: stay until manually dismissed
// Back/exit alerts: auto-dismiss after 6s
```

### Performance Rules

**Only animate `transform` and `opacity` on the display view.** These run on the GPU. Never animate `width`, `height`, `padding`, or `margin`.

**Use CSS animations for predetermined display effects** (waveform, ambient, looping backgrounds). CSS runs off the main thread and stays smooth even when audio is loading.

**Framer Motion hardware acceleration:**
```jsx
// NOT hardware accelerated — drops frames under load
<motion.div animate={{ x: 100 }} />
// Hardware accelerated — use this on /display
<motion.div animate={{ transform: 'translateX(100px)' }} />
```

**Touch device hover states on /join:**
```css
@media (hover: hover) and (pointer: fine) {
  .powerup-button:hover { transform: scale(1.03); }
}
```

**Respect reduced motion:**
```jsx
const shouldReduceMotion = useReducedMotion()
// opacity transitions only, no transform-based movement
// Never zero animations — fade-only is fine
```

### Cohesion Rule

Every animation must match the energy of the moment it serves:
- **Round intros:** theatrical, weighty, dramatic — the crowd needs to feel it
- **Question slides:** snappy and immediate — pace matters
- **Scoreboard:** ceremonial but legible — stagger gives people time to find their team
- **Host panel:** invisible — tools that feel good without calling attention to themselves
- **Team phones:** minimal — reference device, not performance screen

---

## Impeccable Design System

Trivia OS uses the Impeccable design engineering skill for production-grade frontend quality. This is not optional polish — it is part of the build process.

### Required Commands by Build Stage

```bash
# After building any /display view component
$impeccable polish [component]

# After building the /host panel
$impeccable audit [component]

# After building /join phone view
$impeccable adapt [component]

# If any component looks bland or generic
$impeccable bolder [component]

# For all UX copy
$impeccable clarify [component]

# For scoreboard and round intro animations
$impeccable animate [component]

# For the theme system
$impeccable colorize [component]
```

### Absolute Bans

Never let these into the codebase:
- **Side-stripe borders** — no `border-left` accent lines on cards or panels
- **Gradient text** — `background-clip: text` with gradient, banned by default. **Named exception:** `StateOfUnionSlide` uses it deliberately for its signature red-white-blue title lockup — a sanctioned exception like the fixed-gold shiny signal. Don't "fix" it.
- **Ghost-card pattern** — never pair `border: 1px solid` + `box-shadow` blur ≥ 16px on the same element
- **Over-rounded corners** — cards max 12–16px. Never 24px+ on cards
- **Cream/sand/beige backgrounds** — the warm-neutral AI default. Display is dark, host panel is clean white/cool gray
- **Uppercase tracked eyebrows on every section** — one deliberate use is voice, everywhere is AI grammar
- **Numbered section markers (01/02/03)** as scaffolding
- **Hand-drawn SVG illustrations** — never. Real assets or nothing.
- **Diagonal stripe backgrounds** — `repeating-linear-gradient` stripes are banned
- **Identical card grids** — same-size icon+heading+text cards repeated endlessly

### Display View Specific Rules

- Body text contrast ≥ 4.5:1 against background — critical for TV at distance
- Display heading letter-spacing floor: ≥ -0.04em
- Hero text ceiling: `clamp()` max ≤ 6rem — above that it's shouting
- Use `text-wrap: balance` on round titles and question numbers
- Motion must have `@media (prefers-reduced-motion: reduce)` alternative — always
- Never gate content visibility on a class-triggered transition — content visible by default
- Z-index — two layering domains, not one global scale (the old dropdown→tooltip 100–600 scale never described the real code):
  - **Display** (`/display` render tree) layers locally in the **1–60** band: slide content and freeform overlays at 1–50, persistent overlays (QuestionCounter, BaynesWatermark, AnswerReveal, `OverlayLayer`) at 50, and `ScoreboardOverlay` caps the stack at **z-[60]**. A cross-cutting display banner (`NavDeniedBanner`) sits at 200.
  - **Host UI** (build mode, toolbars, portal popovers) uses the higher band — roughly sticky(200) / toast(500) / tooltip·popover(600).
  - Rule: a new display overlay slots **under 60** unless it must cover the scoreboard. Never 999 or 9999.

### Color Strategy

- `/display` — **"Drenched"**: the surface IS the color. Theme background dominates 70%+. Correct for TV.
- `/host` panel — **"Restrained"**: tinted neutrals + one accent. Light mode, minimal distraction.
- `/join` — **"Committed"**: theme accent carries 30–60%, legibility always wins.

### The AI Slop Test

Before shipping any component: "Could someone look at this and say 'AI made that' without doubt?" If yes, it has failed.

Specific Trivia OS failure modes to watch for:
- Display view looks like a generic dark dashboard
- Round intro uses default ease instead of the specified overshoot spring
- Scoreboard looks like a data table instead of a game show leaderboard
- /join looks like a generic form instead of a trivia night experience
- Ben's photo slides look like an afterthought instead of intentional comedic moments

### Design Plugin Integrations

**`design:design-handoff`** — Run when any display-view component is complete. Generates: layout measurements, design tokens, component props, interaction states, animation timing, responsive breakpoints, edge cases.

**`design:ux-copy`** — Run when writing any user-facing text. All copy must sound like Ben wrote it. Reference Section 22 voice examples.

**`design:design-critique`** — Run before marking any display-view component done. Criteria: readable at 20ft on a dark TV, theme colors applied correctly, Baynes watermark present and positioned, question counter visible, Emil animation principles followed.

**`design:accessibility-review`** — Run on /join. WCAG 2.1 AA minimum. Touch targets ≥ 44×44px, color contrast at low brightness, powerup button (one tap, no accidental triggers).
