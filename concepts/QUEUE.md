# Round Journey Queue

Theme entries for the nightly Storybook Agent. Schema and lifecycle are defined in `PLAN.md` §Approach 1 & 3c — this file is the living data, that file is the spec.

## Status machine

`raw` → `grilled` → `building` → `built` → { `approved` | `rejected` | `needs-revision` }
(a `needs-revision` entry loops back through `building` → `built` for its next iteration)

- **raw**: an idea exists but hasn't been through a grill session yet. The agent will never build a `raw` entry.
- **grilled**: Ben + Claude have run a daytime grill session and locked a one-paragraph brief with explicit beginning/middle/end story beats (per `references/round-journeys.md`'s "It's a story, not just a mood transition"). Cross-theme handoff briefs name both themes explicitly.
- **building**: an agent run has claimed this entry (see PLAN.md §3c). If you see this status and no agent is currently running, the claiming run likely crashed — the next preflight will detect and reclassify it once its lock has expired.
- **built**: a fresh iteration exists in `concepts/`, tracked in `manifest.js`, awaiting Ben's morning review.
- **blocked**: the agent hit a wall (see NIGHTLY-LOG.md for why) and stopped rather than guessing.
- **approved**: Ben reviewed and signed off on the direction and execution. Ready for the human-driven promotion path (PLAN.md §5).
- **rejected**: Ben reviewed and passed on the whole direction — not worth continuing. Reason lives in `LESSONS.md` (a general, cross-theme takeaway).
- **needs-revision**: Ben reviewed, liked the direction, and gave one or more concrete fixable notes — this is NOT rejection. The notes live in this entry's own `Revision notes` list (below), not in `LESSONS.md`, because they're specific to this one piece. The next agent run claims `needs-revision` entries FIRST, before any `grilled` entry or a fresh invention (see PLAN.md §3c) — a stalled draft always gets priority over starting something new. **Capped at 5 iterations**: on the 5th revision cycle without approval, the agent stops looping automatically and logs "iteration cap hit, needs your call" — it's your decision from there whether to keep iterating by hand or mark it `rejected`.

## Entry format

```
### <id> — <short title>
status: raw | grilled | building | built | blocked | approved | rejected | needs-revision
journeyType: same-theme | cross-theme
theme: <theme name>          (same-theme)
fromTheme / toTheme: <...>   (cross-theme, instead of theme)
targetShow / targetRound: <optional — a real upcoming show/round boundary this journey
                            is meant for, if one's been decided. Not required; plenty of
                            journeys get grilled and built before a specific show is set.>
source: ben-grilled | agent-proposed+self-grilled
                              (agent-proposed entries ARE appended here, status `building`
                               directly, on the same night they're invented and self-grilled
                               — see PLAN.md §3c / AGENT-PROMPT.md Step 2(3). This durable
                               record is what future nights read for the anti-repetition
                               check — an agent-proposed idea that never touched this file
                               would leave no trace for the next night's "don't repeat the
                               last 5" scan.)
iteration: <n>                (starts at 1; increments each needs-revision pass)

Brief (beginning/middle/end):
<one paragraph. What happens, what it costs, how it resolves. This is the locked
creative direction the agent builds from — it does not re-interpret or improve on it.>

Revision notes (newest first, only if iteration > 1):
- <date>: <Ben's concrete note from that morning's review — the specific fixable thing,
  not a vibe, per round-journeys.md's feedback protocol>
```

## Queue

### greenhouse-gnome-rescue — Greenhouse Rescue
status: building
journeyType: same-theme
theme: greenhouse
source: agent-proposed+self-grilled
iteration: 1

Brief (beginning/middle/end):
A sunlit greenhouse shelf holds a row of tidy terracotta pots in warm afternoon light;
one vine, planted a little too close to the edge, is growing suspiciously fast.
Time-lapse-style, it bursts into a frantic growth spurt, spiraling wildly and knocking
its own pot toward the shelf's edge — it teeters, about to fall. A garden gnome
ornament sitting at the base of the shelf, until this instant pure static decor,
snaps to life for one single frame, reaches up, and catches the pot just before it
hits the ground — then freezes right back into its normal pose as if nothing moved,
vine now trimmed back to a tidy, contained shape. The turn: an object established as
decoration turns out to be secretly capable, saves the day in one beat, and the
reveal is withheld — we never see it move again.

Anti-repetition check (Step 1.6, self-noted): the 5 most recent prototypes
(space-road-trip-full-journey, meteor-shower-liftoff-pov-teampicker,
meteor-shower-windshield-journey, midnight-galaxy-spaceship-journey,
in-round-echo-spaceship) are all space/cosmic in setting, navy/icy-white in palette,
and awe-or-adventure in register. This piece differs on all three: greenhouse
setting (not space), warm terracotta/green/gold palette (`#C4622D` / `#2E5339` /
`#F6E8CC` / `#E9A73A`, not navy/cosmic), and a cozy-whimsical register (not
awe/wonder). Candidates killed: a deep-sea "looming shape resolves into an ordinary
fish" premise (killed — same danger-deflated-to-mundane arc as the meteor/bandaid
piece, just reskinned underwater); a mail-sorting-belt "package caught by a robotic
arm" premise (killed — same near-miss-catch story shape as the windshield piece's
beat structure, just reskinned industrial).

Self-grill against references/round-journeys.md checklist:
- Crowning moment: the gnome's single catch is the fastest, sharpest motion in the
  piece — everything else (vine growth, pot teeter) is comparatively gradual build
  toward that one snap, satisfying the "crowning moment" rule for the piece's one beat.
- Anticipation: the pot's teeter-hang is held briefly before the catch.
- Silhouette: gnome needs strong fill contrast against the wood shelf — flagged for
  Step 5's static audit.
- No pop-in: vine grows via path/scale animation, not instant appearance; gnome is
  on-screen the whole time, static, then moves — never appears/disappears.
- Follow-through: vine settles with a small overshoot after the catch; gnome's
  arm has a brief settle-wobble on the pot before fully still.
