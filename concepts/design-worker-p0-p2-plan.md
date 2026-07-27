**STATUS: implemented 2026-07-26**, after three independent fresh-context Opus reviews of this
plan converged hard on the same four problems (below), all fixed before anything shipped:
1. No `if` field exists on hook config — path filtering moved into each script.
2. `PostToolUse` exit 2 doesn't undo an already-written file — reframed as fast feedback; the real
   backstop is `design-done-gate.mjs`, which re-runs `geometry-lint.mjs` independently.
3. `SubagentStop`-matcher-by-agent-type was unverified and likely wrong — the gate self-filters
   instead (exits 0 immediately unless `git status` shows a touched visual file) and explicitly
   checks `stop_hook_active` to prevent an infinite block-loop.
4. **The load-bearing hole:** the authoring agent had `Write` access to the critic-verdict and
   attempt-count files — the exact self-policing failure one layer down. Fixed via
   `.claude/settings.json`'s `permissions.deny` (blocks the agent's `Write`/`Edit` *tool* calls to
   those paths) plus having the gate hook itself spawn the critic, rather than trusting a
   worker-written verdict file.

Also caught during implementation, by literally running the linter against the real, still-broken
Campfire code as a sanity check: the box-shadow detector's own regex had a decimal-point bug
(`1.5vw` didn't match an integer-only `\d+` pattern) that would have silently missed the exact bug
it was built to catch. Fixed, then re-verified: the linter now correctly flags Campfire's two
overrunning gradients as FAIL, the third (near-miss) as WARN, and the box-shadow as FAIL — see
`concepts/DESIGN-WORKER-LESSONS.md`'s corrected Active Directive entry.

**Still open / needs a live human test, not just static reading** (flagged honestly, not glossed
over): whether `SubagentStop` actually fires and carries `stop_hook_active` as expected in the
installed Claude Code version, and whether `claude -p` can really be spawned from inside a hook to
invoke the critic — both were unverifiable without triggering a real Claude Code session
lifecycle event, which this implementation pass couldn't do. The done-gate script fails toward
blocking-with-manual-instructions, not failing open, if the spawn doesn't work — but confirm this
empirically on the next real visual task rather than trusting it blind.

---

# P0–P2 implementation plan: mechanical enforcement for Trivia OS visual work

Source: the external Opus audit (`concepts/design-worker-audit-handoff.md` and its response),
verdict "the agent+lessons-file fix is real but insufficient — verification must be mechanical,
not textual." This plan implements P0 through P2 in full, keeps the `trivia-os-design-worker`
agent and `DESIGN-WORKER-LESSONS.md` on as **builders and consultants** (not the sole enforcer —
demoted per the audit's closing recommendation), and folds in real findings from a dedicated
research pass on Claude Code hooks / CSS-parsing tooling / Playwright motion assertions (full
findings below each relevant section).

This is a draft for review — three independent Opus agents are reviewing it in parallel before
anything gets built. Findings from that review get folded in before implementation starts.

## Research findings that changed the design from the audit's literal wording

1. **Hooks match on `tool_name`, not file path.** There's no path-glob matcher. `PostToolUse`
   with matcher `"Edit|Write"` fires for every edit/write; the hook script itself must read
   `tool_input.file_path` from stdin JSON and bail out (exit 0) for non-visual files.
2. **Exit code 2 blocks; exit code 1 does not.** This is a documented footgun — every hook script
   in this plan must exit 2 with the failure reason on stderr to actually block.
3. **Inside a subagent, `Stop` hooks become `SubagentStop`, matcher-filtered by agent type.** The
   done-gate hook should be wired as `SubagentStop` matched to `trivia-os-design-worker` (and the
   new critic agent), not a global `Stop` hook that fires for every session.
4. **The `tools:` frontmatter MCP-stripping bug is real and confirmed open** — GitHub
   anthropics/claude-code#13898 and #21560 (plus dupes #30280, #19964, #31287). Practical fix:
   **remove `tools:` entirely** and use `disallowedTools:` (a denylist) if anything needs
   restricting — a denylist subtracts from the inherited set instead of replacing it, so MCP
   servers already permitted in this repo's `.claude/settings.json` (notably
   `mcp__chrome-devtools__navigate_page` / `take_screenshot`, already allowlisted) stay available.
   This is the actual fix for "the agent can't screenshot its own output" — no new tool needed,
   just stop stripping the ones already granted at the settings level.
5. **No existing stylelint rule or Claude Code plugin does gradient-margin or
   box-shadow-without-border-radius checking.** Confirmed by search — this has to be a small
   bespoke script, not a config flag on an existing tool. Good news: the actual math needs no
   DOM/box lookup at all. Per the CSS spec, `radial-gradient(ellipse RX% RY% at CX% CY%, ...)`'s
   `RX%`/`RY%` and `CX%`/`CY%` are already each expressed as a percentage of their own axis (width
   for X, height for Y) — so the overrun check is pure arithmetic on the gradient function's own
   declared numbers (`center_x - radius_x >= 0`, `center_x + radius_x <= 100`, same for Y), with
   zero need to know the containing element's actual pixel dimensions or aspect ratio. This makes
   the linter a pure text/value parse, not a JSX-structure-aware tool.
6. **Parsing tool: `postcss-value-parser`** (what stylelint itself uses internally) or `css-tree`
   with `context:'value'` — either can parse an extracted `radial-gradient(...)` or `box-shadow`
   argument string once it's pulled out of the surrounding JS/JSX/HTML text via balanced-paren
   extraction (a ~15-line utility; no full JS/JSX parser needed since we're not resolving
   identifiers, just reading literal percentage/keyword tokens out of template-literal text).
7. **Rotation-angle decomposition: don't hand-roll `atan2`.** Use the `transformation-matrix` npm
   package's `fromString()` + `decomposeTSR()` to go from a `matrix(a,b,c,d,e,f)` computed-style
   string to a rotation angle. Accumulate angle *deltas* across consecutive samples rather than
   comparing absolute angles, since `atan2` wraps at ±180°.

---

## P0-A — Deterministic CSS-geometry linter (PostToolUse hook)

**Catches:** Campfire's flame — both the gradient-margin overrun (2 of 3 layers, confirmed by hand
in the audit response) and the box-shadow-on-a-square-div bug (the real defect on the 3rd layer,
which the lessons file's own write-up mis-described — see the fix in the Lessons-file section
below).

**Files to create:**
- `.claude/hooks/geometry-lint.mjs` — the checker. Given a file's raw text:
  1. Find every `radial-gradient(` call via balanced-paren extraction.
  2. If it matches the `ellipse RX% RY% at CX% CY%` form (this codebase's exclusive convention —
     confirm via grep before assuming, fall back to skip-with-warning for any other form), parse
     `RX,RY,CX,CY` and check `CX∓RX` and `CY∓RY` against `[0,100]` with a required 5-point margin
     inside that range (i.e. flag if `CX-RX < 5` or `CX+RX > 95`, same for Y) **except** don't flag
     an overrun on the *bottom* edge (`CY+RY > 95`) — per the lessons file's own established
     convention, a bottom anchor point blending into the ground/floor is an accepted, intentional
     pattern, not a bug. Only left/right/top overruns are hard failures.
  3. Find every `boxShadow`/`box-shadow` declaration; look at the enclosing `style={{...}}` object
     or inline `style="..."` string (nearest enclosing balanced braces/quotes) for a
     `borderRadius`/`border-radius` value that isn't `0`/absent. Flag if a glow-colored (low-alpha,
     colored, blurred) box-shadow exists with no rounding — this is a heuristic, not a proof, and
     the script should say so in its failure message rather than claiming certainty.
  4. Print a clear PASS/FAIL table (same style as this repo's existing `assert-*.mjs` scripts) and
     **exit 2** (not 1 — confirmed footgun) on any FAIL, with the exact math in stderr.
- Wire it into `.claude/settings.json` as a `PostToolUse` hook, matcher `"Edit|Write"`, `if` field
  (or in-script early-exit) restricted to files under `concepts/**/*.html` and
  `client/src/components/display/**/*.jsx`.

## P0-B — Render/commit "done gate" (SubagentStop hook)

**Catches:** Campfire shipping unrendered *and* uncommitted — confirmed both happened via
`git status` in the audit response. Treated as one root cause (both are checkpoints skipped in
the same rush), fixed by one mechanism.

**Files to create:**
- `.claude/hooks/design-done-gate.mjs` — on `SubagentStop` (matcher: `trivia-os-design-worker`,
  and the new critic agent below), check:
  1. A screenshot artifact exists under `concepts/.audit-shots/` (this repo's existing convention)
     with an mtime after the session's touched-file mtimes.
  2. `git status --short` shows the touched visual file(s) as clean (committed), not `M`/`??`.
  3. (Once P1-B exists) a critic verdict file for the touched element records a `PASS`.
  If any check fails, **exit 2** with the specific missing item named, forcing the subagent to
  keep working rather than stop.
- Wire as `SubagentStop` in `.claude/settings.json`.

## P1-A — Fix the agent's actual capability gap

**Catches:** the review gates (`impeccable`, `emil-design-eng`) and screenshot capability being
described in the agent's instructions but literally uninvokable as configured.

**Files to edit:**
- `.claude/agents/trivia-os-design-worker.md` — remove the `tools:` line entirely (confirmed real
  fix per the GitHub issues above). If any restriction is still wanted, use `disallowedTools:`
  instead, naming only what should be excluded (e.g. nothing visual-related needs excluding here).
  This restores inherited MCP access, including the already-allowlisted
  `mcp__chrome-devtools__navigate_page`/`take_screenshot` in `.claude/settings.json` — no new
  screenshot mechanism needs to be invented, it already exists and was just unreachable.

## P1-B — Fresh-context vision critic, decoupled from the author

**Catches:** the flame (partially — vision critics have a real false-negative rate on subtle
motion per the audit's own caveats, which is why P2-C stays a separate deterministic check, not a
replacement for this).

**Files to create:**
- `.claude/agents/trivia-os-design-critic.md` — a new, separate subagent. No `tools:` allowlist
  (same MCP-stripping fix as above) or, if restricted, `disallowedTools:` only. Given a screenshot
  path and the frozen pass-criterion sentence (`concepts/OBJECT-RENDERING-PROTOCOL.md`'s "PASS = a
  fresh viewer names this as ___" convention), it must output a verdict file
  (`concepts/.design-critic-verdicts/<slug>.json`, `{ "verdict": "PASS"|"FAIL", "reason": "..." }`)
  that the done-gate hook reads. Explicitly instructed: it cannot be overruled by the authoring
  agent's own report; its file is the record the gate checks, not the authoring agent's summary.

## P2-A — Generated-assets-first as the enforced default

**Catches:** every figurative failure in the record (swing, pond water, flame silhouette, Sonora
Balloons' cut foreground) — same failure category throughout.

**Files to edit:**
- `concepts/OBJECT-RENDERING-PROTOCOL.md` — strengthen the noun test's existing iconic/figurative
  split from "classify, then choose" to an explicit default: figurative → generated art is the
  starting assumption; hand-coding a figurative element requires an explicit, logged exception.
  Iconic (one-sentence-of-geometry) elements still get hand-coded directly, but **must pass P0-A's
  geometry-lint** before being considered done — this is the concrete enforcement that keeps this
  from being another prose-only rule like the protocol doc's own predecessor.

## P2-B — Mechanical two-strike counter

**Catches:** the swing's 7-round and the pond's 6-round non-convergence — the runaway blind-retry
pattern the current "two-strike rule" phrase can't actually stop (it was never wired to anything).

**Files to create:**
- `concepts/.design-attempt-counts.json` — `{ "<element-slug>": { "fails": 2, "lastReason": "..." } }`,
  incremented by the critic-verdict-recording step (P1-B) on every FAIL. Read by the done-gate
  hook (P0-B): if an element's `fails` count is already `>= 2`, the gate blocks unconditionally and
  requires a human-added `"unlocked": true` field in the same JSON (Ben edits it directly) before
  a third attempt is allowed to proceed at all — not just flagged, actually blocked.

## P2-C — Rotation-angle-over-time as a required harness check, not a lesson

**Catches:** the swing's near-motionless sway that passed 27/27 position-only checks.

**Files to create/edit:**
- `concepts/tools/assert-rotation-over-time.mjs` — generalize the sampling logic already proven in
  `assert-deck-pond-layout.mjs` into a reusable exported function (element selector, expected
  amplitude/period, sample count) using the `transformation-matrix` package for the
  matrix-to-angle decomposition (accumulate deltas, don't compare raw `atan2` output across
  samples — the wraparound bug the research flagged).
- `.claude/agents/trivia-os-design-worker.md` — instruct: any element whose animation includes
  `rotate(...)` must have a corresponding rotation-angle-over-time assertion before being reported
  as verified; a position-only bounding-box check is not sufficient for that class of motion.

## Lessons-file corrections (do regardless of the above)

- `concepts/DESIGN-WORKER-LESSONS.md`'s Active Directive on the Campfire flame currently claims
  "all three flame `GlowLayer` radial gradients had `center ± radius` overrunning ... by 4-20%."
  This is wrong for the dimmest layer (`ellipse 46% 60% at 50% 86%`): `50±46` clears the box with
  ~4% margin; that layer's only real defect is the box-shadow. Correct this before anything else
  ships, since it's the exact kind of self-graded inaccuracy the whole audit is about.
- Add a header note to both `DESIGN-WORKER-LESSONS.md` and `trivia-os-design-worker.md`: these are
  now authoring config and human-readable history. The enforcement layer is P0-A/P0-B/P1-B: a
  hook, a gate, and a decoupled critic — not this file's prose, and not the agent's own discipline.
