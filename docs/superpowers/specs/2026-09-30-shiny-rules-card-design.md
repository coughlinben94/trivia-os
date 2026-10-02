# Shiny Rules Card — Design

Date: 2026-09-30
Status: design approved in chat; awaiting written-spec review before planning.

## Goal

Give teams a quick, glanceable explanation of shiny formats whose phone actions
or scoring rules are not obvious from seeing one example. Use one shared
information order, with a format-specific demonstration, so a team can
understand what to do and what earns points before the real question begins.

This extends the existing second beat after a shiny title card. It does not add
a slide type or alter gameplay.

## Audience and success criteria

The audience is a room looking at the `/display` TVs while the host introduces
the format. The card succeeds when someone who only glances at the screen can
still tell:

1. what action to take and where to take it;
2. how the answer is scored; and
3. how the visual example relates to the real mechanic.

The instruction and scoring summary are visible at the start and remain
available alongside the example. The example is clearly marked **Example** and
never looks like the live question or a real team's result.

## Design

### Shared structure

The card uses the same content order for each opted-in format:

1. **Action:** one short sentence, visible immediately.
2. **Scoring:** one concise line or small diagram, visible immediately.
3. **Example:** one large format-specific visual that demonstrates the action
   and outcome.

The card inherits the shiny title's visual language and current theme. Keep
the copy large and high contrast for the TV. Avoid paragraphs, tiny phone UI,
unexplained symbols, and information that depends on color alone. The example
must carry a visible Example label.

The display begins the example when the host advances from the title card. It
plays once, then holds its final frame until the host advances again. Normal
Next/Prev navigation lets the host skip the card or revisit it; no new live
control is added. The essential instruction and score summary are present from
the first frame, so they are not delayed behind the animation. The Bendle card
is visual-only; its real song audio begins through the existing host-initiated
question flow.

Use the existing second-beat/`currentPart` flow, reduced-motion support, and
display animation rules. There is no new slide type, database field, or
Supabase migration.

### Format coverage and sample content

Only formats that need an extra action/scoring explanation opt in. The
registry-driven design supplies the action copy, scoring summary, example
renderer/data, and any assets for each eligible format. The three interactive
formats are identified by their stable `shinyInputSchema.type` values because
their database format IDs are generated. “Not So Different” uses its existing
fixed format ID because it is a sample-only exception. The same registry
determines whether a title receives the extra beat and what it renders; adding
a format must not require maintaining separate eligibility allowlists in the
builder and TV renderer. This is a constrained code-owned catalog, not a
host-editable slide editor.

Initial coverage:

| Format | Action | Scoring summary | Example requirements |
|---|---|---|---|
| **Bendle** | Write down the song title as the host reveals each mix step; guesses are not submitted on phones. | Earlier correct answers earn more: 30, 20, then 10 points by step. | Show three successive mixes gaining one layer per step. Do not imply a fixed instrument order: the host can reorder the layers. Do not imply automatic scoring or phone entry. Keep this card visual-only; the real song audio starts during the question. |
| **Pin It** | Place one pin on the US map on your phone and lock it in. | The closest pins generally earn 10 points; rooms under five teams award the closest team, and a tie at the cutoff can add winners. | Use the real map surface and a clearly labeled sample location, then show example guesses and the correct spot. Highlight the qualifying nearest guesses. Do not show city labels as if teams can use them during play. |
| **Hues, Cues, and Booze** | Choose a square on the color grid on your phone and lock it in. | Exact square: 30 points; one square away: 20; two squares away: 10. | Show a short color clue, a sample selected square, the target, and the scoring-distance zones. Include coordinates and outlines so the explanation does not rely on color alone. |

The “We’re Not So Different, You and I…” explainer remains sample-led: four
clues, the connection prompt, and the answer. Its one-answer written mechanic
is already clear from the sample, so it does not need a scoring/rules panel in
this phase. It does use the same shared themed Example frame as the other
formats, keeping its four-photo reveal, prompt, answer, and timing intact.
Other familiar, paper-answer shiny formats stay out of the registry until
there is a concrete reason to explain them.

### Timing, compatibility, and accessibility

- The extra beat stays in the existing shiny title group's navigation. The
  host advances from title to card to content; the card does not auto-advance.
- Only newly built title slides receive the extra beat. Existing show data is
  not migrated or rewritten.
- A repeated shiny format group gets one card at its own title, not a card per
  question or step.
- Reduced motion keeps all instructional content and uses opacity-only
  transitions.
- Example visuals use actual format assets/components where practical: the
  existing US map, the generated Hues, Cues palette, and the real Bendle layer
  model. Do not substitute rough hand-drawn illustrations for those surfaces.

## Current gameplay facts the card must preserve

- Bendle has three host-advanced question slides. Teams write answers down;
  the host grades manually. Point values follow step position (30/20/10), while
  the instrument order can vary. Vocals are added only when the answer is
  revealed.
- Pin It awards 10 points to the closest scoring group: the closest 40%,
  rounded up, or one closest team when fewer than five teams are in the room.
  Ties at the rounded-mile cutoff also score.
- Hues, Cues, and Booze scores by Chebyshev grid distance: 30 at the exact
  square, 20 within one square, 10 within two squares, and zero beyond. A
  diagonal neighboring square counts as distance one.
- “Not So Different” currently demonstrates its mechanic without explicit
  scoring text; this design keeps that simpler explainer intact.

The implementation must verify these facts against the live scoring code
when it is built. The older Bendle phone-scoring design is superseded and must
not be used as the source for this card.

## Architecture and data flow

Use one code-owned definition per eligible shiny format. A definition is
selected by either a stable `input_schema.type` or a fixed format ID and supplies
the short action instruction, concise scoring summary, sample renderer key,
and sample data/assets. The title builder stamps the input-schema type onto new
title slide data so rendering uses the same selector. Scoring values and
thresholds come from shared constants used by both the scorer and the card; if
a live rule currently exists only as a literal in scoring logic, extract it
before the card duplicates it. The definition is also the source of truth for
title-beat eligibility, component selection, and asset warming. Keep
format-specific visuals separate from the shared card layout so the map, color
grid, and audio-layer example can use their actual mechanic without forcing
them into one animation.

The title slide's existing `currentPart` state selects the title or rules-card
beat. The card receives theme and format definition, renders without writing
show data, and holds until the host's next navigation action.

## Non-goals

- Changing how any shiny question is authored, answered, locked, revealed, or
  scored.
- Adding phone submissions or automatic scoring to Bendle.
- Replacing all shiny titles or introducing a global rules slide.
- Rewriting existing shows or changing their title-card behavior.
- Adding a host-authored card editor or arbitrary rules-card copy fields.
- Autoplaying sample audio or displaying real team submissions/results.

## Acceptance criteria

1. Bendle, Pin It, and Hues, Cues, and Booze each receive one second-beat card
   after their shiny title, using the action/scoring/example structure above.
2. Bendle's copy remains correct for any configured layer order and describes
   written/manual grading accurately.
3. Pin It's copy describes the room-relative scoring and small-room/tie behavior
   without implying every team is ranked on the TV.
4. Hues, Cues, and Booze's example marks coordinates and scoring distance in a
   way that remains understandable without color perception alone.
5. Example animation runs once per visit, holds its final frame, and follows
   reduced-motion settings. The Bendle card does not play sample audio.
6. Existing “Not So Different” sample-only behavior stays intact, and older
   saved title cards remain unchanged.
7. The registry is the only source for title-beat eligibility, rendering, and
   warming example assets; it selects interactive formats by schema type and
   the existing sample-only format by fixed ID.
8. Shared scoring constants feed both the live scorer and the card, so their
   scoring summaries cannot silently drift apart.

## Spec self-review

- Scope is limited to the shiny title's explanatory beat and its format
  definitions; there is no separate database or host-authoring feature.
- Existing-show compatibility, format-specific scoring, and Bendle's manual
  grading/variable layer order are explicit.
- The examples, action text, scoring text, playback behavior, and navigation
  behavior have one unambiguous owner each.
