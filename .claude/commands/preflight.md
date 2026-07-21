---
description: Run Step 0 preflight checks — repo check, delete canary, required docs, Recraft reachability, sanitizer self-test, manifest validation, run-lock acquisition, git baseline
allowed-tools: Read, Grep, Glob, Bash(git *), Bash(node *), Bash(npm *), Bash(cd *), Bash(echo *), Bash(rm *), Bash(./concepts/tools/*), ToolSearch, mcp__cowork__allow_cowork_file_delete
model: haiku
disable-model-invocation: true
---

# /preflight — Step 0 (Storybook Agent)

Run every check below, in order. Stop and log to `NIGHTLY-LOG.md` on any failure — do not proceed past a failed check, do not improvise a workaround not listed here.

```bash
cd ~/Projects/baynes-trivia/trivia-os
```

1. **Repo present and readable.** `git remote -v` should show `coughlinben94/trivia-os`.

1b. **Delete-permission canary — before any git write.**
```bash
TESTFILE="concepts/.delete-canary-$$"
echo x > "$TESTFILE"
rm -f "$TESTFILE" 2>/dev/null
echo "exit code: $?"
```
If nonzero: stop, call `mcp__cowork__allow_cowork_file_delete` directly (separate tool call, not from inside bash) with this session's actual path to `$TESTFILE`, then re-run `rm -f "$TESTFILE"`. If it still fails, stop the entire run — platform issue, not a bash workaround.

2. **Required docs readable:** `concepts/QUEUE.md`, `concepts/LESSONS.md`, `references/round-journeys.md`. Missing or unreadable = stop.

3. **Recraft reachable.** `ToolSearch` with `{query: "recraft generate_image get_user vectorize_image", max_results: 10}`, then call `get_user`. Total outage (even `get_user` fails) = preflight failure, not a per-sprite fallback case.

4. **Sanitizer toolbox self-tested:**
```bash
cd concepts/tools
if [ ! -d node_modules ]; then npm ci; fi
if ! node test-sanitizer.mjs; then
  echo "SANITIZER SELF-TEST FAILED — DO NOT PROCEED" >&2
  exit 1
fi
if ! node test-postmessage-contract.mjs; then
  echo "POSTMESSAGE CONTRACT SELF-TEST FAILED — DO NOT PROCEED" >&2
  exit 1
fi
cd ../..
```
Use the `if ! node ...; then ... exit 1; fi` form — never `node ... || echo ...` (that masks a real failure behind `echo`'s own success).

4b. **Existing manifest.js valid before you touch it:**
```bash
if ! node concepts/tools/validate-manifest.mjs; then
  echo "EXISTING manifest.js already fails validation — do not build on a corrupted base." >&2
  exit 1
fi
```

5. **Acquire the run lock:**
```bash
RUN_ID="$(./concepts/tools/lock-acquire.sh "<scheduled|manual>")"
CODE=$?
if [ "$CODE" = "2" ]; then
  echo "Another run holds the lock. Exiting cleanly, zero spend." >&2
  exit 0
elif [ "$CODE" != "0" ]; then
  echo "Lock acquisition failed unexpectedly. Logging and stopping." >&2
  exit 1
fi
```
Save `$RUN_ID` — needed for every remaining step this run.

6. **Git baseline — save, AFTER lock acquisition, never before:**
```bash
./concepts/tools/git-baseline.sh save "$RUN_ID"
```

7. **Stale `building` queue entries.** If `lock-acquire.sh`'s stderr mentioned taking over an expired lock, check `QUEUE.md` for any entry still `building` and mark it `blocked`: "crashed run, reclassified by lock-expiry takeover on `<date>`."

If every check passes: proceed to `/claim`. The lock stays held through everything else this run — released only via `lock-release.sh` as the final action, on every exit path.
