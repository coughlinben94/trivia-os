# Nightly Log

Append-only run history for the Storybook Agent. One entry per run (successful, blocked, or crashed). Newest at the bottom.

## Entry format

```
## <date> <time> — run <runId>
trigger: scheduled | manual
claimed: <queue id> | agent-proposed:<slug>
preflight: pass | fail (<reason>)
sprites: <n> calls, <n> succeeded, <n> failed | primitives-fallback (degraded)
audit: pass | fixed (<what>) | unresolved (<what>)
result: built <file> | blocked (<reason>) | crashed (detected next run)
commit: <sha or "not pushed: <reason>">
```

## Runs

## 2026-07-20 21:18 UTC — run 20260720T211824Z-6-20245
trigger: manual
claimed: agent-proposed:greenhouse-gnome-rescue
preflight: pass
sprites: pending
audit: pending
result: pending (mid-run blocker hit and resolved — see note below)
commit: pending

Mid-run note: `.git/index.lock` and `concepts/.nightly-lock/owner.json` both went into an
"Operation not permitted" state (not a plain stale lock — `rm -f` from this sandbox was
refused at the OS level), most likely a live collision with the round-journey-studio
session sharing this working tree. Per Stuck Protocol step 3's documented fallback, logged
without a commit and did not force past it. Ben cleared both paths manually from the host
Terminal; run resumes from the claim commit.
