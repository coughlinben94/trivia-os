// Generated and rewritten by the nightly Storybook Agent — never hand-edited.
//
// MUST always take exactly this shape: a single `window.MANIFEST = <JSON literal>;`
// assignment, nothing else — no function calls, no template strings, no concatenation.
// Written atomically (tmp file + rename, see PLAN.md §3g) so a crash mid-write can never
// leave a truncated/malformed file. Any string field embedded here (prompts, theme names)
// MUST have the literal character `<` replaced with the six-character escape sequence `<` before
// writing, so a value containing the literal substring "</script>" can not break out of
// this script tag and inject arbitrary HTML. Independently checked, not just trusted on
// the honor system: see concepts/tools/validate-manifest.mjs, run before every commit.
//
// Entry shape (see PLAN.md §Approach 1):
// { id, file, theme, journeyType, fromTheme?, toTheme?, targetShow?, targetRound?,
//   status: 'draft'|'blocked'|'needs-revision'|'rejected'|'approved'|'shipped',
//   degraded, source, date, iteration, supersedes (previous file for this id, or null),
//   revisionNotes: [{ note, date }], sprites: [{ prompt, model, date }] }
//
// Iterations are never overwritten in place: each revision pass on the same queue id
// writes a NEW file + a NEW manifest entry linked via `supersedes`, so the gallery can
// show a design full history side by side, not just its latest state.
window.MANIFEST = [{"id":"space-road-trip","file":"space-road-trip-full-journey.html","journeyType":"cross-theme","fromTheme":"midnight-galaxy","toTheme":"autumn-harvest","status":"needs-revision","degraded":false,"source":"ben-grilled","date":"2026-07-20","iteration":1,"supersedes":null,"revisionNotes":[{"note":"Missing document.visibilitychange handler — tStart never resets when the tab is backgrounded and returns, so elapsed-time math will think far more time passed than actually animated, likely causing the sequence to jump or skip ahead unpredictably on refocus. Add a visibilitychange listener that resets tStart the same way play()'s replay reset already does.","date":"2026-07-20"},{"note":"Missing the postMessage contract (window.__journeyControls = { play, pause, replay }, postmessage-child-boilerplate.js embedded). Has a working Replay button but no pause capability at all. Wire play/pause/replay to the existing tick()/cancelAnimationFrame()/resetUI() mechanism — pause needs a real implementation, not a no-op.","date":"2026-07-20"}]},{"id":"space-road-trip","file":"space-road-trip-v2.html","journeyType":"cross-theme","fromTheme":"midnight-galaxy","toTheme":"autumn-harvest","status":"needs-revision","degraded":false,"source":"ben-grilled","date":"2026-07-20","iteration":2,"supersedes":"space-road-trip-full-journey.html","revisionNotes":[{"note":"The floating-diner (formerly \"gas station\") stop needs a full redesign: it's supposed to be a distant planet that happens to have a diner, perched on a floating rock — not a gas station on a moon surface. See QUEUE.md for the full grilled direction.","date":"2026-07-22"}]},{"id":"space-road-trip","file":"space-road-trip-v3.html","journeyType":"cross-theme","fromTheme":"midnight-galaxy","toTheme":"autumn-harvest","status":"draft","degraded":false,"source":"ben-grilled","date":"2026-07-22","iteration":3,"supersedes":"space-road-trip-v2.html"}];
