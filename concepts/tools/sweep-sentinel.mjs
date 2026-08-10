// concepts/tools/sweep-sentinel.mjs — TASK 2, a component of the sweep
// driver (concepts/tools/ring-sweep.mjs, TASK 3). No sweep may start without
// a green sentinel: this is what catches an unwired parameter, a metric
// blind to its own subject, and stale hardcoded maths — the three classes
// that have burned rounds on this project (FAILURE-LEDGER.md).
//
// Three steps, run in order, any failure halts immediately (does not
// proceed to the next step) and always restores state before returning:
//
//   a. NOISE FLOOR — measure the target metric twice with NOTHING changed
//      in between. The delta is epsilon. Post the 2026-08-09 freezeFrame fix
//      (FAILURE-LEDGER.md "instrument eight"), epsilon must be EXACTLY zero.
//      A nonzero epsilon here doesn't mean "the metric is a little noisy" —
//      it means the freeze fix regressed, or this specific check reads
//      something the freeze doesn't cover, and the sweep must refuse to
//      start rather than optimise against a moving target.
//
//   b. KICK — perturb the target parameter by a config-declared delta with
//      a known expected direction, remeasure, confirm the metric moved that
//      way by more than `floor`. `floor` is an ABSOLUTE minimum movement,
//      not a multiple of epsilon (epsilon is 0 post-freeze, so 3*epsilon=0
//      would pass on any nonzero float-rounding twitch — no signal at all).
//      Default floor is 1.0 in the metric's OWN reported unit (1 luma unit
//      for an integer p99.5/p95/mean reading, 1 percentage point for a %
//      reading, 1.0 for a bare ratio like "2.13x"). Justification: every
//      metric this gate reports rounds to one decimal place or one integer
//      luma unit — so the worst-case rounding residual is well under 0.5 in
//      that same unit, and 1.0 sits comfortably (2x+) above that floor while
//      still being far below what any deliberately-sized sweep kick should
//      move a genuinely-wired parameter by. A kick that fails to clear 1.0
//      is much more likely an unwired parameter or a metric blind to its
//      own subject than real signal too small to matter — callers targeting
//      a metric with different native precision should pass an explicit
//      `floor` rather than rely on this default.
//
//   c. RESTORE — revert the kick, remeasure, confirm the reading reproduces
//      the ORIGINAL baseline (base1) exactly — not "close," exactly, same
//      zero-tolerance as step (a). A restore that doesn't reproduce exactly
//      means restore() itself is incomplete (e.g. touched a file it doesn't
//      fully revert, or a cache/HMR left stale state) — exactly the kind of
//      bug a sweep loop would otherwise silently compound over 8 iterations.
export async function runSentinel({ measure, applyKick, restore, direction, floor = 1.0, label = 'target metric' }) {
  if (direction !== 'up' && direction !== 'down') {
    throw new Error(`runSentinel: direction must be 'up' or 'down', got ${JSON.stringify(direction)}`);
  }
  const steps = [];

  // a. noise floor
  const base1 = await measure();
  const base2 = await measure();
  const epsilon = Math.abs(base2 - base1);
  steps.push({ step: 'noise-floor', base1, base2, epsilon });
  if (epsilon !== 0) {
    return {
      pass: false, failedStep: 'noise-floor', steps,
      reason: `${label}: epsilon=${epsilon} (base1=${base1}, base2=${base2}), expected EXACTLY 0 post-freeze — a nonzero noise floor means something regressed the freezeFrame fix, or this check reads something the freeze doesn't cover. Refusing to start a sweep against a moving target.`,
    };
  }

  // Every restore() call below goes through this wrapper — NEVER call
  // restore() directly and let it throw uncaught. A buggy restore() (this
  // module's own self-test found exactly this: a miswritten guard in the
  // caller's restore() threw mid-recovery) must never crash the caller
  // holding dirty on-disk state; it must produce a clear, typed failure
  // that still tells the caller state may be dirty and needs a manual
  // check, not a stack trace that skips whatever safety net the caller had
  // planned to run after.
  async function safeRestore() {
    try { await restore(); return { ok: true }; }
    catch (err) { return { ok: false, error: err.message }; }
  }

  // b. kick
  await applyKick();
  let kicked;
  try {
    kicked = await measure();
  } catch (err) {
    const r = await safeRestore();
    return {
      pass: false, failedStep: 'kick', steps,
      reason: `${label}: measure() threw after applyKick(): ${err.message}. ${r.ok ? 'State restored.' : `restore() ALSO THREW (${r.error}) — state may be dirty, check manually.`}`,
      restoreOk: r.ok,
    };
  }
  const delta = kicked - base1;
  const movedRight = direction === 'up' ? delta > floor : delta < -floor;
  steps.push({ step: 'kick', kicked, delta, floor, direction, movedRight });
  if (!movedRight) {
    const r = await safeRestore();
    return {
      pass: false, failedStep: 'kick', steps,
      reason: `${label}: metric moved by ${delta} (base1=${base1} -> kicked=${kicked}), needed ${direction === 'up' ? `> +${floor}` : `< -${floor}`}. Parameter may be unwired, this metric may be blind to its own subject, or the configured kick delta is too small to matter — not automatically "floor too aggressive." ${r.ok ? 'State restored.' : `restore() ALSO THREW (${r.error}) — state may be dirty, check manually.`}`,
      restoreOk: r.ok,
    };
  }

  // c. restore
  const r = await safeRestore();
  if (!r.ok) {
    return { pass: false, failedStep: 'restore', steps, reason: `${label}: restore() threw: ${r.error} — state may be dirty, check manually.`, restoreOk: false };
  }
  const restored = await measure();
  const restoredDelta = Math.abs(restored - base1);
  steps.push({ step: 'restore', restored, restoredDelta });
  if (restoredDelta !== 0) {
    return {
      pass: false, failedStep: 'restore', steps,
      reason: `${label}: restored reading (${restored}) differs from original baseline (${base1}) by ${restoredDelta} — restore() did not fully revert state. Do not trust this parameter's restore() for a real sweep until fixed.`,
    };
  }

  return { pass: true, steps, epsilon, delta, floor, base1, kicked, restored };
}
