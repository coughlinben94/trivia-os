# Plan: /join Phone View Rebuild
**Date:** 2026-06-24  
**Goal:** Replace generic dark /join view with a complete, production-ready phone experience that is theme-aware, phase-driven, and spec-correct.

---

## Architecture

**Phase state machine:** `loading → register → waiting → live`

**Theme sourcing:** `getTheme(show.theme_id)` from `themes/index.js` → `theme.colors.{bg, accent, highlight, text}` applied as inline styles throughout. "Committed" strategy — accent carries 30–60% of surface.

**Data layer:** Preserved verbatim from existing Join.jsx — all Supabase subscriptions, leaderboard builder, score subscription, visibilitychange handler, localStorage session recovery.

**New:** connection status tracking via `.subscribe()` callback → `ReconnectingBanner`. Session recovery now validates stored team against DB before restoring.

---

## Tech Stack
- React + Framer Motion (AnimatePresence, motion, useReducedMotion)
- Supabase Realtime (existing channels preserved)
- Inline styles only (no Tailwind — avoids theme color conflicts with arbitrary values)
- Boogaloo + DM Sans only

---

## Files

| File | Action |
|------|--------|
| `client/src/views/Join.jsx` | Complete rewrite |
| `client/src/index.css` | Add `@keyframes spin` + `@keyframes breathePulse` |

---

## Component Map

```
Join (main — state + data)
  ├── LoadingScreen
  ├── NoShowScreen
  ├── RegistrationScreen   theme bg + accent, 56px input, logo, Ben copy
  ├── WaitingScreen        checkmark spring-in, team name, pulsing dot, score bar
  ├── LiveView
  │   ├── TopBar           fixed 56px, backdrop blur, round + Q counter
  │   ├── SlideContent     question/round-intro/grading-break/scoreboard-reveal/title/multi
  │   ├── BottomBar        fixed 64px, score + scoreboard pill + powerup
  │   │   └── PowerupConfirm (inline popover, not full-screen)
  │   └── ScoreboardSheet  Framer Motion bottom sheet, 72dvh, staggered rows + score bars
  └── ReconnectingBanner   fixed top, slides down on CHANNEL_ERROR/TIMED_OUT/CLOSED
```

---

## Key Decisions

1. **No forward button** — teams are followers. Back-only nav in live view.
2. **Bottom sheet not full-screen overlay** — ScoreboardSheet uses `AnimatePresence` + `motion.div` translating from `y:100% → y:0`, iOS drawer easing `cubic-bezier(0.32, 0.72, 0, 1)`.
3. **Score bar in bottom bar** — persistent across all live phases, animates to actual score.
4. **Phase transition:** `waiting → live` happens when `show.is_live` becomes true via Supabase UPDATE subscription.
5. **Session recovery:** reads localStorage → verifies team row in DB → only restores if row exists.

---

## Self-Review Checklist
- [ ] No Socket.io, Express, local file storage
- [ ] Only Boogaloo + DM Sans fonts
- [ ] No forward button anywhere
- [ ] Theme colors applied: registration bg, waiting bg, live bg all use `theme.colors.bg`
- [ ] Scoreboard bottom sheet uses `cubic-bezier(0.32, 0.72, 0, 1)`
- [ ] Staggered leaderboard rows with score bars
- [ ] `ReconnectingBanner` fires on CHANNEL_ERROR / TIMED_OUT / CLOSED
- [ ] `visibilitychange` handler preserved
- [ ] `powerup_used` check preserved
- [ ] `team_scores` subscription preserved
- [ ] `leaderboard` only built when `scores_revealed = true`
- [ ] Clean build passes
- [ ] No console errors
