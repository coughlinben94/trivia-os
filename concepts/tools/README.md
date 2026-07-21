# concepts/tools — what's here and who needs it

Built and adversarially reviewed (6 rounds Codex + 1 round Gemini code-level, all
findings fixed and tested against real adversarial input — see `PLAN-REVIEW-LOG.md`
at the repo root for the full history) as part of the unattended nightly Storybook
Agent scaffolding. Two different kinds of session touch this repo, and they don't
need the same subset:

## If you're building a prototype interactively (Ben present, story + Q&A + build)

You almost certainly want:
- **`sanitize-svg.mjs`** — run any Recraft-generated (or otherwise external) SVG
  through this before embedding it in a prototype. Fail-closed, tested against 14+
  adversarial fixtures (script injection, entity expansion, external refs, DoS). Don't
  hand-roll your own sanitization or skip it because the source "seems fine."
- **`postmessage-child-boilerplate.js`** — embed this verbatim in any prototype meant
  to run inside the gallery's iframe (play/pause control contract, nonce-checked,
  exact-schema). Tested against 9 simulated exchanges.
- **`validate-manifest.mjs`** — if you touch `concepts/manifest.js`, run
  `node concepts/tools/validate-manifest.mjs` before considering the edit done. It
  parses the file as pure source text (never executes it) and independently confirms
  it's safe: no script-tag breakout, safe filenames only, and — as of tonight —
  correctly handles multi-iteration revision chains, including one that supersedes a
  `blocked` (file-less) prior iteration.

You almost certainly do NOT need:
- `lock-acquire.sh` / `lock-release.sh` / `git-baseline.sh` / `guarded-commit-push.sh`
  — these exist so the *unattended* nightly agent can safely commit/push with nobody
  watching (lock ownership, out-of-scope drift detection, never force-pushing, a
  `nightly:`-prefixed-commit convention). An interactive session with Ben present
  doesn't need automated safety rails Ben himself already provides by being there.
  If you're just committing your own work normally, use plain `git add`/`git commit`.

## If you're the unattended nightly agent (or testing it)

Read `concepts/AGENT-PROMPT.md` in full — it's the actual spec, and it names every
script above by exact call signature. All 5 scripts in this directory were fixed and
re-tested tonight (7 findings from Gemini's first code-level pass, on top of 9 from
Codex's 6th round) — full detail in `PLAN-REVIEW-LOG.md`. Nothing here should be
reconstructed from memory or partially reproduced inline; call the scripts.
