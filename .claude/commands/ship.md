---
description: Update QUEUE.md/manifest.js/NIGHTLY-LOG.md and perform the guarded commit+push for tonight's build (Steps 6-7)
allowed-tools: Read, Edit, Bash(git *), Bash(node *), Bash(cat *), Bash(mv *), Bash(./concepts/tools/*)
model: haiku
disable-model-invocation: true
---

# /ship — Step 6 (update records) + Step 7 (commit/push) — Storybook Agent

## Update records

**Queue (`QUEUE.md`):** set the claimed entry to `built` (a completed revision pass clears `needs-revision` back to `built` — never `approved`, that's never your call). If you hit an unresolvable wall anywhere in Steps 2–5, set it to `blocked` instead and jump to the Stuck Protocol in `AGENT-PROMPT.md`.

**Manifest (`concepts/manifest.js`) — atomic write, exact procedure:**
1. Build the full JSON array of all manifest entries (existing, unchanged, plus tonight's new one). Replace every literal `<` in string field values with the six-character escape sequence backslash-u-zero-zero-three-c — this is what stops a value containing `</script>` from breaking out of the script tag context. Do NOT write a plain `<` character back in its place — that is a no-op and defeats the entire point.
2. Write via tmp file, then atomic rename:
```bash
cat > concepts/manifest.js.tmp <<'EOF'
// Generated and rewritten by the nightly Storybook Agent — never hand-edited.
window.MANIFEST = <PASTE THE ESCAPED JSON.stringify(entries) OUTPUT HERE>;
EOF
mv concepts/manifest.js.tmp concepts/manifest.js
```
3. **Validate independently before trusting it:**
```bash
if ! node concepts/tools/validate-manifest.mjs; then
  echo "MANIFEST VALIDATION FAILED — treat like a failed sanitizer self-test, do not commit" >&2
  exit 1
fi
```
Treat a failure here exactly like a failed sanitizer self-test — stop, don't patch around it, don't commit.

**Log (`NIGHTLY-LOG.md`):** append the run's entry — trigger, claimed id, preflight result, sprite count/outcome, audit result, final result, commit sha.

**LESSONS.md cap check:** if the Active Directives section already has 10 entries and an update would push past that, fold the oldest into the Established Conventions summary block before appending.

## Commit and push

```bash
./concepts/tools/guarded-commit-push.sh "$RUN_ID" "nightly: built <id> v<n>" concepts/QUEUE.md concepts/manifest.js concepts/NIGHTLY-LOG.md concepts/<your-new-file>.html
```

This script refuses to commit any path outside `concepts/`, refuses off `main`, refuses on baseline drift, never force-pushes. Nonzero exit = stuck-protocol trigger, not something to route around.

Capture the script's last stdout line — `RESULT: <status> sha=<sha-or-none>` — and record the literal status word (`pushed`, `committed-not-pushed-day-work`, `push-rejected`, `nothing-to-commit`) plus sha in `NIGHTLY-LOG.md`, not a paraphrase.

**Note — current known limitation, not yet fixed:** this script pushes straight to `main`. A separate recommendation (open, not yet implemented) is to route this through `github` MCP's `create_pull_request` instead, so a bad autonomous run lands in a PR for morning review rather than live on `main`. That's a real change to `guarded-commit-push.sh` itself, not just a prompt instruction — flag as a follow-up, don't assume it's already true.

Always end with the lock release, regardless of path taken:
```bash
./concepts/tools/lock-release.sh "$RUN_ID"
```
