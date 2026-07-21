---
description: Commit and push tonight's queue claim immediately after selecting a QUEUE.md entry (Step 2 checkpoint)
allowed-tools: Read, Edit, Bash(git *), Bash(./concepts/tools/*)
model: haiku
disable-model-invocation: true
---

# /claim — Step 2 commit checkpoint (Storybook Agent)

Once you've claimed a queue entry (revision, grilled brief, or self-invented concept per `AGENT-PROMPT.md` Step 2's priority order) and written the opening `NIGHTLY-LOG.md` entry, commit and push the claim immediately — before generating any sprites or writing any HTML:

```bash
./concepts/tools/guarded-commit-push.sh "$RUN_ID" "nightly: claim <id>" concepts/QUEUE.md concepts/NIGHTLY-LOG.md
```

Rules:
- This commit's allowlist is deliberately just these two files — **never** the prototype HTML file, which doesn't exist yet at this point in the run.
- This is your crash checkpoint. If this run dies after this point, the next run's `/preflight` (its stale-`building`-entry recovery check) finds your stale `building` entry and recovers cleanly.
- Nonzero exit here (including a rejected push) is a stuck-protocol trigger, same as `/ship` — not something to retry or route around. Go to the Stuck Protocol in `AGENT-PROMPT.md`.

After this succeeds, proceed to Step 3 (sprite generation) and Step 4 (build) as described in `AGENT-PROMPT.md` — those are creative/judgment steps, not mechanical ones, so they stay in the main file rather than becoming a rigid command.
