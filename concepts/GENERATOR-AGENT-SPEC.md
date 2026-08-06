# Generator Agent — spec of open questions, not an implementation

This is not a build doc. It names what a future session must decide before writing a
generator agent. `concepts/HANDOFF-world-07-ring.md` names the core tension: naive
templating gives 21 recolours of one file, free rein gives 21 unrelated looks. That is
a creative-direction call, not something one unattended session should resolve alone.
Per this repo's own pattern for exactly this kind of call, the next step should be a
`brainstorming` + `grilling` pass with Ben, not more code.

`concepts/noun-atlas.json` seeds this spec with the one theme that has real, verified
data: space, generalized from `client/src/worlds/midnightGalaxy.ring.js`'s own station
list. The other 20 themes in `client/src/themes/index.js` each need their own grounded
pass — what nouns actually belong, what primitive each maps to — the way space got one
across 5 prototype rounds. Filling those in is explicitly out of scope here.

## Open question 1 — who authors a new theme's Noun Atlas entry?

Two options, both live:

- **Human-authored per theme, first.** A person decides Autumn Harvest's nouns are
  "pumpkin, corn stalk, scarecrow, harvest moon" before any agent runs. Slower, but
  keeps the "naive templating" failure mode out — nobody hands the agent a blank
  page and asks it to invent an entire visual vocabulary at once.
- **The generator proposes an atlas entry as part of its own run**, for Ben to accept
  or reject, the way `.claude/agents/trivia-os-design-critic.md` and
  `-design-quality-critic.md` already sit downstream of generated work in this repo.
  Faster, but reintroduces the "free rein" half of the tension the handoff doc warns
  against, unless something else constrains it.

This plan does not pick one. Whichever way this goes, it changes the generator's
input contract (a theme name alone, vs. a theme name plus a pre-authored atlas entry).

## Open question 2 — what does `validateWorld` actually check, and is it still the target?

The handoff doc calls `s2-world-engine.js`'s `validateWorld` "the acceptance test."
This session searched `~` and initially could not find `s2-world-engine.js`,
`S1-art-direction.md`, `S2-engine.md`, `SCAFFOLD-TEAM-BRIEF.md`,
`DRAFT-world-scaffold.md`, or `TT-02-doctrine-audit.md`. A second, more thorough pass
did find them — they live under a Cowork local-agent-mode-sessions outputs folder
(path below), dated **2026-07-30**, the same day as commit `aa20451` and six days
before this branch (`ring-scaffold-absorption`, started 2026-08-06) existed:

```
~/Library/Application Support/Claude/local-agent-mode-sessions/3ef585b3-2cb9-44a7-9d1e-76599043c1d2/f1fe63a6-1ff2-46f9-901a-2b8e5f9d3c23/local_96758608-bb17-4166-8a50-35c241f8c065/outputs/
```

`validateWorld` (in `s2-world-engine.js`, that folder) is real and detailed, not a
stub: it checks schema version, world type against a fixed enum, per-type geometry
(`space` must be `radial`, terrestrial/aquatic/aerial must be `linear` — "a vertical
ramp always implies a horizon," the same rule the ring handoff states), a base-palette
luminance-range floor per type, a far-layer anchor spanning 3–5 stations, exactly
`ENGINE.PANES` mid-layer stations each with 2–5 elements, at least one headline/feature
element per station (no station ever empty), a `targetMeanLuma` band per station, no
duplicate noun within a station, primitive kind checked against a fixed enum, centroid
kept outside a safe box, rotation-aware clip detection, and an alpha floor on gradient
stops.

Two things a future session needs to resolve before building against this, not this
one:

1. **Confirm the files are still there and still current.** This folder also contains
   `S3-generator.md` and `S4-verification.md` — both explicit skeletons ("SKELETON —
   being filled in," "Do not read as final until this line is gone") — plus started
   scaffolding at `s3-skill/` (a `building-worlds` skill, itself all `TBD`) and
   `s4-gate/` (`world-gate.mjs`, `checks.mjs`, `measure.js`, `probe.js`, `report.mjs`).
   None of it is confirmed finished, and nothing here confirms it survived past
   2026-07-30 or is what Ben still wants built.
2. **The schema `validateWorld` checks does not match what this branch built.**
   `validateWorld` expects `mid.stations[i].elements[j]` objects with `tier`, `pair`,
   `cx`/`cy`, `w`/`h`, `rotDeg`, `noun`, and `form.kind`. This branch's actual station
   shape — `midnightGalaxy.ring.js`, verified and rendered — is flat:
   `{ key, prim, hue, accent }`, checked by `concepts/tools/ring-verify.mjs`, not by
   `validateWorld`. They are different schemas for what may or may not be the same
   engine. A generator cannot target both without someone first deciding which one
   this repo is actually building toward.
3. **A same-day, separate decision may already supersede the ring model.** The same
   outputs folder's `DRAFT-STATE.md` (also dated 2026-07-30) states: "The
   continuous-world ambient architecture is decided but unbuilt. Model: honest lateral
   translation, anchor at optical infinity, **no loop closure**." That is a different
   shape than the 12-station wraparound cylinder this branch just built and verified
   (`ringEngine.js`, `RingAmbient.jsx`, the ring's own turn-12 wrap). Whether the ring
   built on this branch is the same effort as that decision, a still-valid earlier
   step toward it, or a direction that decision already moved past, is not something
   this session can determine from the filesystem alone. Flagging for Ben, not
   resolving it here.

Until one of these is confirmed, `concepts/tools/ring-verify.mjs` — built and verified
this session, 14/14 passing, already wired into the Stop-hook gate for ring-shaped
world files — is the closest real, working substitute for "the acceptance test," scoped
to the schema this branch actually shipped. A future session can extend it into that
role explicitly, once the questions above are answered, rather than building a
generator against a `validateWorld` contract that may target a different schema or a
superseded architecture.

## Open question 3 — subagent prompt, or new application code?

This repo already dispatches Claude Code subagents for exactly this shape of work —
"make me a themed asset that has to feel authored, not templated" — per
`concepts/QUEUE.md`'s Fable second-opinion pattern (an arms-length `Agent` call,
`model: "fable"`, run against a checklist, its verdict re-verified against the actual
file rather than taken on its word) and the existing
`.claude/agents/trivia-os-design-worker.md` / `-design-critic.md` /
`-design-quality-critic.md` trio. The half-built `s3-skill/SKILL.md` found under Open
Question 2 also leans this way: it is scaffolded as a Claude Code skill
(`building-worlds`, Intake / Brief / Emit / Self-check / Gate / Stop-and-ask), not as
a standalone script.

The dispatched-agent route looks like the better fit — it reuses a pattern this repo
already trusts instead of inventing a new one, and an agent can be told to fail
loudly ("stop and ask") on the noun-atlas gap in Open Question 1 rather than silently
guessing. But that is a recommendation, not a decision this plan makes. Confirm with
Ben before committing to "generator = subagent prompt" over "generator = application
code that calls a model."
