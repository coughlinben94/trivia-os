# Lessons

Ben's feedback from morning gallery reviews, injected into every nightly run so the agent doesn't repeat a mistake it's already been told about. Capped per `PLAN.md` §Approach 1: at most 10 active directives below the "Established Conventions" line. When a normal run would push past 10, the agent folds the oldest entries into a one-line addition to Established Conventions and drops their verbatim originals — this file never grows unbounded.

## Established Conventions

_(nothing folded in yet — this section fills in two ways: old Active Directives aging out
after the 10-cap, and one-line "why it landed" notes from approved drafts (PLAN.md §5) —
the second is deliberate: rejections alone only teach caution, this is where the pipeline
learns what to repeat, not just what to avoid.)_

## Active Directives

- 2026-07-22: When `visual-audit.mjs` output disagrees with what the animation code says
  should happen — especially for any beat under ~2s (a burst, flash, impact) — don't
  write the disagreement into `QUEUE.md` as a finding yet. Check the printed `real=`
  elapsed and phase-label fields for EVERY relevant screenshot first: confirm a sample
  actually landed inside the beat's real time window before concluding it's broken. A
  first-run visual-audit pass on space-road-trip reported a "dead" supernova finale that
  turned out to be a false positive — every sample had drifted past the real 1.1s burst
  window without the tool (at the time) surfacing that fact. Ground truth from the page's
  own DOM state beats a nominal timestamp every time.
