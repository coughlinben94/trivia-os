---
description: Run Step 0 preflight checks — scratch checkout, required docs, Recraft reachability, sanitizer self-test, manifest validation, run-lock acquisition, git baseline
allowed-tools: Read, Grep, Glob, Bash(git *), Bash(node *), Bash(npm *), Bash(cd *), Bash(echo *), Bash(rm *), Bash(./concepts/tools/*), ToolSearch
model: haiku
disable-model-invocation: true
---

# /preflight — Step 0 (Storybook Agent)

Run every check below, in order. Stop and log to `NIGHTLY-LOG.md` (in `$WORKDIR`, see step 1) on any failure — do not proceed past a failed check, do not improvise a workaround not listed here.

1. **Scratch checkout — replaces the old "cd into the connected repo" step entirely.**
```bash
WORKDIR="$(./concepts/tools/nightly-checkout.sh ~/Projects/baynes-trivia/trivia-os | tail -1)"
cd "$WORKDIR"
```
Why: a normal `git commit` creates+deletes `.git/index.lock` as an unavoidable part of its own operation, and the connected `~/Projects/baynes-trivia/trivia-os` folder's delete-permission wall blocks every delete there for an unattended run — confirmed live, documented, unattended-unresolvable (see `NIGHTLY-LOG.md`'s 2026-07-20/21 entries). Fix: this run does **all** of its git work — lock, commit, push, everything from here to the end — inside `$WORKDIR`, a scratch checkout entirely outside the connected folder, where deletes are unrestricted. The connected folder itself is read exactly once by `nightly-checkout.sh` (remote URL + its existing credentials-store file) and never written to by this run again. Ben's own copy picks up new commits via a normal `git pull` — see `/morning-review`, which does this first, interactively, where a delete-permission prompt actually can be answered by a live human.

If `nightly-checkout.sh` exits nonzero (missing credentials-store, auth probe failed, clone/fetch failed): stop, log the exact stderr, do not improvise a workaround.

**Save `$WORKDIR` — every remaining step this run, in every command, assumes CWD is `$WORKDIR`, not the connected folder.**

2. **Required docs readable (in `$WORKDIR`):** `concepts/QUEUE.md`, `concepts/LESSONS.md`, `references/round-journeys.md`. Missing or unreadable = stop.

3. **Recraft reachable.** `ToolSearch` with `{query: "recraft generate_image get_user vectorize_image", max_results: 10}`, then call `get_user`. Total outage (even `get_user` fails) = preflight failure, not a per-sprite fallback case.

4. **Sanitizer toolbox self-tested (in `$WORKDIR`):**
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

4a2. **Visual-audit browser present (in `$WORKDIR`):** `/audit`'s mandatory visual pass (Step 5) needs headless Chromium downloaded — this is separate from `npm ci`, which only installs the `playwright` package, not the browser binary itself.
```bash
cd concepts/tools
npx playwright install chromium 2>&1 | tail -5
cd ../..
```
This is a real network dependency (~110MB on a cold cache, cached under `$HOME/.cache/ms-playwright` across runs within the same sandbox lifetime). If it fails here (network egress blocked to the download host, disk space, etc.), do not silently skip the visual pass later — treat it the same as any other preflight failure: stop, log the exact error, don't improvise a workaround. A build with only the code-invariant checklist and no visual pass is a known-worse audit, not an acceptable silent downgrade — see `QUEUE.md`'s space-road-trip 2026-07-22 entry for why that gap is real, not theoretical.

4b. **Existing manifest.js valid before you touch it:**
```bash
if ! node concepts/tools/validate-manifest.mjs; then
  echo "EXISTING manifest.js already fails validation — do not build on a corrupted base." >&2
  exit 1
fi
```

5. **Acquire the run lock (operates on `$WORKDIR/concepts/.nightly-lock` — untracked, local to this scratch checkout, unchanged script/logic from before):**
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

Known, judged-acceptable residual limitation: this lock is local disk state in `$WORKDIR`. It survives a same-run or later-same-sandbox-lifetime `nightly-checkout.sh` refresh (fetch+`reset --hard` never touches untracked files) but does NOT survive the scratch path being wiped between genuinely separate sandbox lifetimes, if that ever turns out to be how scheduled-task sandboxes behave (unconfirmed either way). At an actual cadence of one nightly firing plus occasional manual runs, this is accepted, not hidden — if a stale lock is ever conspicuously absent when it shouldn't be, say so plainly in `NIGHTLY-LOG.md` rather than silently trusting the lock result.

6. **Git baseline — save, AFTER lock acquisition, never before:**
```bash
./concepts/tools/git-baseline.sh save "$RUN_ID"
```

7. **Stale `building` queue entries.** If `lock-acquire.sh`'s stderr mentioned taking over an expired lock, check `QUEUE.md` for any entry still `building` and mark it `blocked`: "crashed run, reclassified by lock-expiry takeover on `<date>`."

If every check passes: proceed to `/claim`. The lock stays held through everything else this run — released only via `lock-release.sh` as the final action, on every exit path. Everything from here on — `/claim`, sprite gen, `/audit`, `/ship` — runs with CWD `$WORKDIR`.
