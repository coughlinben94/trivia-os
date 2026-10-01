# Handoff: Ring duo transition redesign

**For:** Claude Code, tomorrow  
**Date:** 2026-09-30  
**Status:** pause implementation until transition direction below is understood.

## Ben's latest direction

The current transitions do **not** look good. Ben's correction: **the transitions need to be static.**
The current implementation animates a curved SVG mask over 1.2 seconds. That animated wipe is not
accepted and should not be treated as the intended design.

Preserve the earlier decisions unless Ben changes them:

- A duo is two colors used as a world; its background is a very dark blend and its objects use the
  duo's colors.
- Worlds come from the branching nexus of connected duos. The seeded walk can make different
  connected jumps; the sequence has no fixed length.
- Switch worlds every seeded random 3–4 slides. Same show ID and transition number must replay the
  same choice.
- Randomization matters. Per-transition angle, screen position, and a curved or bulging boundary
  may vary, but the selected composition should be static while shown.
- Color evolution stays off by default. Ben makes final aesthetic decisions.

**Clarify before coding:** “static” could mean a fixed split composition held for the whole transition,
or an instantaneous cut into a fixed two-world composition. Do not infer a moving reveal from the
older “switching worlds” wording. Bring Ben a concrete still-frame proposal (or two) and confirm what
changes between slides before implementing another animation.

## Current implementation and repo state

- Worktree: `/Users/bencoughlin/Projects/baynes-trivia/trivia-os/.claude/worktrees/ring-duo-same-color-fix`
- Branch: `feat/ring-duo-organic-transition`
- Pushed commit: `4309141 feat(ring): add seeded organic duo transitions`
- Preview: [open the evolving duo preview](https://trivia-6b7n5f2bg-ben-coughlin-s-projects.vercel.app/ambient?evolving=1&showId=show_b)
- Worktree has one uncommitted source edit in `client/src/views/AmbientAudit.jsx`: high-contrast preview controls, because Ben could not see them on the dark background. `npm run build` passed after this edit. This handoff file is also untracked. Commit and push both only after checking the branch state tomorrow.
- The preview at the URL above is from commit `4309141`; it does not include the uncommitted control contrast fix.

The committed implementation changes `duoTransition.js` to 3–4 slide gaps and varies wipe parameters
deterministically from show ID + transition step. `EvolvingRingAmbient.jsx` animates an SVG mask from
one duo to another. Tests cover cadence, seeded geometry, role changes, and reduced motion. The work
also updates the color-evolution spec and adds an implementation plan.

## Verification evidence and limits

- Focused transition tests passed.
- All client tests passed: **119 files, 1,749 tests**, excluding `relay/**`.
- Build passed. Vite emitted its existing warning about a chunk over 500 kB.
- Browser review showed the current animated edge reading too much like a diagonal cut. Ben rejected
  the transition. Do not present its visual review as approval.
- The default full test command cannot load the two relay test files in this checkout because
  `relay/package.json`'s `ws` dependency is absent.
- No brightness result was collected for the transition. The trusted `runChecks()` in
  `concepts/tools/ring-verify.mjs` expects one `window.__world` and drives it with `.turn()`; it cannot
  correctly measure this two-world, slide-driven transition. Do not use an ad hoc brightness sampler
  or change gate semantics/thresholds without Ben's approval.
- The 17 duo palette rows, colors, and certified weights were not changed. Ratios vary between
  existing duos; arbitrary new ratios such as 30/70 remain uncertified.
- Auto-draw remains disabled; color evolution remains off by default.

## Next work

1. Start from the branch above and inspect `docs/superpowers/specs/2026-09-24-ring-world-night-color-evolution-design.md` plus the current component.
2. Resolve what Ben means by “static” before touching the transition code. Keep seeded variation in
   the composition if it still matches his intent; do not animate the selected boundary unless he
   says so.
3. Show Ben the real preview after the revised build. Do not enable color evolution by default.
4. Keep all brightness measurements on the real `runChecks()` path. Flag that the present gate cannot
   drive the transition route rather than inventing a substitute.
