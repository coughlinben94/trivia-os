# Trivia OS: live show idea hub

2026-09-24. Astra source review plus a read-only browser walkthrough of the Aug 18 show in `/host`, `/display?preview=true`, and `/join`. The browser review sampled the opening, a question, round intros, grading breaks, a leaderboard, Press Your Luck, and the winner preview. It did not advance a live production show or test the physical TV/audio rig.

## Direction

Give each round a story: anticipation, play, release, standings, comeback, finale. Trivia OS already has substantial spectacle: automatic team intros, answer-lock countdowns, shiny-section handoffs, animated scores, and a drum-roll/silence/slam/fireworks winner sequence. The strongest upgrades connect those moments and help Ben control their timing.

## Recommended ideas

| Priority | Idea | What the room experiences | Implementation path |
| --- | --- | --- | --- |
| 1 | Round-results story | After grading, reveal a meaningful biggest climb or close chase, then the full leaderboard. Give more teams a moment to cheer. | Build on `ScoreboardRevealSlide.jsx` and `ScoreboardOverlay.jsx`. Compare previous and current **published** score snapshots; handle ties and incomplete grading explicitly. Medium to large effort. |
| 2 | Contextual host cue | Ben sees what the next press will do: “Play clip,” “Reveal image 2 of 4,” “Lock answers,” or “Show Round 3.” Add the following cue where useful. | Derive labels from `slideStepping.js` and display in `LiveMode.jsx` beside the existing Next control and Up Next cards. Small to medium effort. |
| 3 | Break-return entrance | Music ducks, a short visual beat gathers attention, then the next round title lands when Ben is ready. | Extend the current `JukeboxBreakOverlay.jsx` / `Display.jsx` handoff and `RoundIntroSlide.jsx`. Keep Ben in control; do not create another automatic navigation timer. Medium effort. |
| 4 | Authored answer payoff | On selected questions, the answer lands, then an image or one-sentence context gives the crowd a second reaction. Keep ordinary questions fast. | Add optional authored reveal data to questions and render it through the generic answer overlay in `Display.jsx`. Keep specialized wager and shiny reveals intact. Small to medium effort. |
| 5 | Optional podium finale | Ben recognizes finalists, triggers the existing winner impact, then holds a clean photo/thank-you frame. | Extend `WinnerRevealSlide.jsx` using frozen final results. The final grading break currently jumps to the last winner slide, so separate awards slides would require navigation changes. Medium effort. |

Build order for quick value: contextual host cue, answer payoff, break-return entrance, published standings, podium finale. The rankings above reflect audience impact; this order reflects dependencies and delivery risk.

## Smaller additions

- Welcome newly joined teams on the pre-show TV in a short, queued animation while keeping the QR stable.
- Give each round one visual motif that returns in its opener, special answer, and results moment.
- Show a post-round phone receipt after results publish: points gained and rank movement, then return attention to the room.
- Add a pre-show readiness view for long-text fit, missing media/answers, break destinations, and scoring setup.
- Estimate show pacing from slide types, audio clips, and breaks; flag long segments back to back.

## Implementation constraints

- Phone scores are currently visible outside the ten-minute editing lock (`Join.jsx`, `scoresLocked`). A suspenseful TV reveal would be spoiled on phones unless both surfaces read from a deliberate published snapshot. The Add Slide wizard still says a Scoreboard Reveal “unlocks phone scores,” which no longer matches current behavior.
- The current leaderboard slide already reveals ranks from lowest to highest. New storytelling should add context and controlled publication rather than another generic count-up.
- Winner Reveal reads mutable `scoreboard_teams` on mount. A frozen final result would keep TV, phones, and saved history aligned while Ben performs a longer finale.
- Final-break navigation currently skips intervening slides and jumps to the last winner slide. Put an awards sequence inside Winner Reveal or redesign the navigation deliberately.
- Keep animation phases local to the display and publish only durable show cues. Preserve the persistent ambient renderer, reduced-motion behavior, and existing scoring authority.
- The browser walkthrough found a duplicate round ID in the older Aug 18 show and React duplicate-key warnings. That is a separate data/UI issue to inspect before using that show as a rehearsal fixture.

## Rehearsal limit and next step

Preview and source inspection establish the current shape, not how the full night feels in the room. A safe end-to-end live rehearsal needs an isolated backend or a test mode that cannot become the globally selected live show: `/display` chooses the most recently updated `is_live` row. Once isolated, run host, TV, and several phones through the same deck, record timings and transitions, and check audio on the actual splitter/TV setup. Use that recording to refine the five ideas above before implementation.
