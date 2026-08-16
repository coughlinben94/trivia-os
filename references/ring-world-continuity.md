# references/ring-world-continuity.md — session-hygiene rules for ring-world work

**Scope:** the ring world-builder only (same scope as `ring-world-mistakes.md`). This file does
**not** restate that file's checklist — it covers what that file's own mandatory-read chain
doesn't reach: the raw failure ledger, the live handoff, one commit-timing rule, and the
STAYS-HUMAN list. Read `ring-world-mistakes.md` first; it's already mandatory (`SKILL.md` Read
Order item 2). Read this second, specifically before or during ring-world work.

## Why this file exists

This project has lost its own institutional memory twice, a year apart, the identical way: a
multi-item plan lived only in a Cowork session's temporary outputs folder, never written into
this repo, session ended, gone. First time: 18 dead approaches (`FAILURE-LEDGER.md`'s own
opening note). Second time, 2026-08-10: an 11-item in-progress plan for this branch, confirmed
unrecoverable after exhausting git reflog/stash/fsck, the skill cache, local Cowork sessions,
Spotlight, and Time Machine. Separately, the same instrument bug (an unfrozen animation frame
read as if fixed) was found, fixed, then found unfixed in a second file months later —
"instrument nine," `FAILURE-LEDGER.md`. Both are the predictable result of a rule that lived
only in someone's intent and nowhere a mechanism could check it.

## 1. Session start

1. Read `concepts/FAILURE-LEDGER.md` in full, not summarized, newest entries first. It is not in
   the top-level `SKILL.md` Read Order and `ring-world-mistakes.md` lags it — that file's "Rule
   zero" stops at instrument eight; instrument nine (2026-08-10) isn't folded in yet.
2. Read whichever `concepts/HANDOFF-ring-*.md` and `concepts/SCAFFOLD-world-ring.md` §8 apply to
   today's task for current open items — don't take this file's word for which is highest
   priority; that changes session to session and belongs in those docs, not here.
3. Run `git status` and `git log --oneline -10` before trusting either doc's picture — this repo
   regularly has more than one session working it at once.

## 2. The commit-timing rule — Claude Code sessions only, stated honestly

Per `ring-world-mistakes.md`'s own process note, the advisory design work on this system happens
in a separate Cowork session that writes prompts for a separate Claude Code session to paste and
implement — and that same note is explicit that the Cowork session does **not** edit this repo
directly and should flag stale claims to Ben rather than drive-by-edit them. This rule does not
override that. It is addressed to the Claude Code session only — the one place in this
architecture that both receives a plan's text and is allowed to write to the repo.

**If you are a Claude Code session, the moment a plan, task list, or agent prompt meant to
outlive this one session exists in a form you'd want back — whether you wrote it or were handed
it — write it into `concepts/`, `references/`, or `docs/superpowers/plans/` (this project's
existing, actively-used plan location). A new file, or appended to the live HANDOFF.** Not at the
end. Not when it "feels finished." A plan that exists only in a chat reply or a Cowork outputs
folder does not yet exist anywhere this project can recover it.

**What this does and does not fix, named plainly:** both real losses on this project (the
18-entry ledger, the 2026-08-10 11-item plan) happened entirely inside a Cowork session's own
outputs folder — text that a Claude Code session never saw and this rule never reaches. This rule
closes a real but narrower case: a CC session that receives or generates plan-shaped content and
lets it evaporate anyway. **The Cowork-side gap is not closed by anything in this repo and can't
be** — closing it needs an instruction on the Cowork side (e.g., "before executing a multi-step
plan, have it pasted into a Claude Code session and persisted first"), which is Ben's call, not
this file's.

**Mechanical backstop:** `.claude/hooks/plan-commit-gate.mjs`, wired as a `Stop` hook
(`.claude/settings.json` — deliberately not `SubagentStop`; a subagent's own to-do list is its
internal task breakdown, not a cross-session plan), reads this session's own transcript and
blocks Stop when real unfinished work (3+ incomplete to-do items) exists with zero trace written
into `concepts/`, `references/`, or `docs/superpowers/plans/`. It warns, non-blocking, when a
plan-shaped file was written but not yet committed (already on disk narrows the failure mode;
`scripts/ship.sh` separately refuses to ship with an unclean tree). Calibrated against 8
synthetic fixtures, re-run and recorded after a real bug was found in the first version — see the
hook's own header (dated changelog, v2) for the full case list and results, and for what it
structurally cannot see (the Cowork-only case above). This narrows the "received it, sat on it"
gap. It does not fix "never wrote it down anywhere in the first place" if that "anywhere" is
outside this repo — that's the Cowork-side gap named above, not something this rule can reach.

The hook checks file existence and to-do completion state only — not whether the file's content
actually captures the plan. That's a deliberate limit, not an oversight: a machine can verify a
file exists; it cannot verify a plan was faithfully transcribed, and pretending otherwise would
be its own instance of a check that sounds rigorous but measures the wrong thing.

## 3. Before proposing any fix — same two rules, checked earlier in the loop

`ring-world-mistakes.md` checklist item 2 (mean-vs-peak) and its falsifiers paragraph (search
"falsifiers", ~line 125) are already mandatory reading — this section adds no new content, only a
timing instruction: that file frames both as an end-of-round check, before shipping a fix. Run
them before *proposing* one instead — earlier in the loop, same two rules, no new prose here to
drift out of sync with the original.

If either check flags the reasoning in progress, say so before continuing rather than quietly
fixing the framing and presenting only the corrected version.

**This is not a closed list.** When a new failure shape gets found the way instrument nine was
found, it gets its own dated entry in `FAILURE-LEDGER.md`, same as every other entry there — this
file names two because two are named and confirmed as of this writing, not because two is the
permanent count.

## 4. STAYS HUMAN

Originally stated in `HANDOFF-ring-sentinel.md`; this is now the canonical, durable copy, and
that handoff's own copy carries a one-line pointer back here (added in the same change that added
this file — a moved fact needs the edit at its old home too, not just a new one, or "canonical"
is just an assertion). This is a standing rule, not tied to any one task:

- Choosing target metrics or thresholds.
- Editing a lock file or check code (`ring-spec.lock.json`, `ring-verify.mjs`'s pass/fail logic,
  any gate's cap values).
- Typing an `allowedToMove`/allowlist entry.
- Interpreting a POISONED or ambiguous run.
- Aesthetic acceptance — does this actually look right.

If a task in progress would require deciding one of these, name it explicitly and stop rather
than deciding and continuing.

## Known limits, stated rather than papered over

- The hook cannot see a Cowork-only artifact. It closes "written here, not saved" — it cannot
  close "never written here at all." Nothing running inside this repo's hooks can; that gap is
  structural, not a bug to fix later.
- Nothing here can verify a lesson was actually absorbed versus mechanically checked off — only
  that the required file exists. Checklist fatigue and rules that get pencil-whipped under
  pressure are a documented failure mode of exactly this shape of gate. The mitigation is keeping
  the mechanical checks few and cheap (file exists, to-dos complete — nothing this file asks a
  machine to judge requires interpretation) and leaving judgment to section 3 and 4, which are
  read, not checked.
- A ledger entry can go stale (the bug shape it describes stops recurring) and nothing here
  expires one. Not solved here; noted so it isn't silently assumed solved.
- A resumed session can carry stale incomplete to-dos from earlier, unrelated work, and the hook
  can't tell "genuinely forgotten" from "already handled a different way." Writing one line
  ("these N are deprioritized, not forgotten") satisfies the gate and costs seconds — annoying,
  not expensive — but this is a known false-positive shape, not a solved one.
- The hook is wired repo-global; its prescription (write into `concepts/`) is ring-scoped. A
  session doing unrelated app work with a long, legitimately-incomplete to-do list gets pointed at
  a ring-world directory. Whether this hook should instead check ring-world file paths were
  touched this session before firing is a real open question — left to Ben rather than decided
  here, since narrowing a gate's trigger condition is itself editing check logic (STAYS HUMAN,
  §4).

## Out of scope

Object shape/silhouette quality — `ring-object-craft`. General bug diagnosis with no ring-world
failure-history angle — `systematic-debugging`. This file is not a second copy of
`ring-world-mistakes.md`'s checklist, a testing framework, or a project-management tool.
