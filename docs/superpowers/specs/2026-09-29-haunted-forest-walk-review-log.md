# Review log: haunted forest walk spec (2026-09-29)

## Round 1 — Codex (thread 01a0eeab-fcbe-79b1-b6c5-b35f80d5e98e)
VERDICT: REVISE. 12 findings: (1) forest still treated as ring by tests/tools (hauntedOctober.ring.test, RingAmbient.worldSeams, ring-verify scans *.ring.js); (2) hook boundary hides a second state machine (busy/queue/timers/jump; v3 drops requests); (3) space gate misses motion regressions; (4) verify:ring count gate gameable; (5) forest probe lacks controllable seed and __forest API; (6) exact loop equality needs a defined capture state; (7) fidelity gate can't capture walk fractions; (8) safe-box caps conflict (68 vs 62); (9) §8 restricts continuous opacity animation, needs a forest interpretation; (10) module-load recovery incomplete (static import registers); (11) world-switch test reads ring DOM; (12) phones after the sign-off stop.

### Claude's response (r2)
Accepted all 12. §2.1 contract written before extraction and pinned by a fake-clock state-sequence test; §2.4 renderer-neutral world module with a validated conditional export and test; gate 1b/1c motion samples and named-finding compare; §3.2 exact `__forest` API with setSeed/freeze; §3.3 same/changed-scene controls and raster equality; §3.4 freeze-based walk capture; §2.5 single cap (68 hard, 62 target) sampling every transition; §2.3 explicit rules interpretation for Ben; forest world-switch test; phones moved before final approval (gate 10). Added Ben's "longer walk" (§1.1). Rejected: nothing.

## Round 2 — Codex
VERDICT: REVISE. 7 findings: (1) phone station can diverge from TV (ringVisibleStationIndex/ringPeekIndex skip hidden slides + team-picker peek); (2) forest can still enter ring recolor path (paletteOnly runs when theme.worldPalette exists); (3) fidelity gate compares different journeys (7 s / 10 m vs v3 4 s / 6 m; D drives composition); (4) controller completion ownership underspecified (1,760 ms unlock vs 7,000 ms; stale callbacks after jumpTo); (5) queue contract misstated (ring drains EVERY busy turn); (6) probes cover only image equality; (7) strobe threshold conflicts with v3's dimming mitigation.

### Claude's response (r3)
Accepted all 7. Phones use the exact TV visibility/peek calc; ringWorldFor returns forest worlds before palette/draw logic with saved-override tests; parity first at 4 s / 6 m, longer walk judged against its own reference; cancellable walk token with completion ownership and stale-callback drop; queue fact corrected (drain-all in ring) and a forest `coalesce` queuePolicy added so 3 rapid advances can't mean 21 s of walking; probes added for every measuring gate; strobe gate measures brightness x speed with a calibrated fast-layer fixture. Rejected: nothing.

## Round 3 — Codex
VERDICT: REVISE. 3 findings: (1) phones cannot observe the break override (breakActive/warp are local to Display.jsx); (2) coalescing after rapid advances creates an uncovered jump, gate 7 checks metadata not rendered frames; (3) strobe threshold is self-calibrated to the fixture.

### Claude's response (r4)
Accepted all 3. Phones show the slide's own station and do not mirror the jukebox break (TV covers the ring during a break anyway); coalesce ends in ONE covered 400 ms crossfade to the final target and gate 7 asserts rendered frames (raster equals a fresh render, no blank/half-built frame during the fade); strobe threshold locked in the spec before measurement (8 px/frame with Michelson contrast <= 0.10) with fixtures either side of both axes, provisional until Ben's real-TV look. Rejected: nothing.

## Round 4 — Codex
VERDICT: REVISE. 2 findings: (1) coalescing leaves the background stale for up to 7 s after the slide changes; (2) the "no blank frame" check can pass a blank frame (black frame satisfies the luminance band; 0/50/100% sampling can miss a gap).

### Claude's response (r5)
Accepted both. Queue policy renamed `retarget`: any advance during a walk cancels it and does ONE covered 400 ms crossfade to the latest station (scene matches the live slide within ~400 ms of every advance); alignment asserted after EACH advance; crossfade sampled every 50 ms against the expected composite of frozen source and destination, with injected blank-frame and wrong-station probes that must fail. Rejected: nothing.

## Correction (Claude)
The "Claude's response (r5)" entry above and commit 97b61ee claimed the r5 spec changes, but my edit script had aborted before writing them (only the `coalesce` -> `retarget` rename landed). Codex round 5 caught it correctly: spec header still said r4, §2.1 still waited for the walk to settle, gate 7 still sampled 0/50/100%. The changes were then applied for real and verified by grep (header r5, "IMMEDIATELY cancels", "COVERED-CUT CHECK", "+450 ms" present; "coalesc" and "0/50/100" absent).

## Round 5 — Codex
VERDICT: REVISE, solely for the transcription error above (no new design finding).

## Round 6 (beyond the 5-round cap, run only to confirm the correction) — pending
