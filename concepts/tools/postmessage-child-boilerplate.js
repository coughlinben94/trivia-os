// concepts/tools/postmessage-child-boilerplate.js
//
// CANONICAL snippet — copy verbatim into the <script> of every nightly-generated
// prototype HTML file (PLAN.md §3e). Pairs with the parent-side dispatch in
// concepts/index.html's `sendToFrame()`. Do not paraphrase or "improve" this when
// generating a prototype — the exact message shape and validation order is what makes
// the contract meaningful; a near-miss reimplementation is a silent security regression.
//
// Contract:
//   - The parent (gallery) is the only legitimate sender. This file identifies "the
//     parent" as `window.parent` — not by origin, since a file:// frame's own origin is
//     the opaque string "null" and can't be used for authentication.
//   - A per-load nonce is delivered by the parent via the URL fragment, set BEFORE the
//     iframe's src is assigned, so it's present from this script's very first tick —
//     there is no window during which a message could arrive before the nonce exists.
//   - Every incoming message is checked against ALL THREE of: exact event.source
//     identity, the nonce, and a strict {type, nonce} schema — before doing anything.
//   - Unknown message shapes, wrong nonces, or a source that isn't window.parent are
//     silently ignored, not errored — a prototype should never crash from a stray or
//     malformed message.
//
// The animation itself must expose three hooks matching the sequence's actual mechanism
// (GSAP timeline or canvas/rAF loop — see PLAN.md §3e on which to use for which piece):
//   __journeyControls.play()    — resume from wherever paused (or start, on first play)
//   __journeyControls.pause()   — freeze in place; cancel any rAF handle; for GSAP,
//                                  timeline.pause()
//   __journeyControls.replay()  — reset to frame zero and play from the top; for a
//                                  canvas/rAF piece this MUST reset the clock (t0), not
//                                  just re-trigger CSS classes, or the frame-timing
//                                  normalization (dtn) will compute a bogus giant delta
//                                  on the next frame
//
// A prototype's own on-page Replay button (required by round-journeys.md's prototype
// conventions) should call the SAME __journeyControls.replay() — one implementation,
// two triggers (on-page button, gallery postMessage), never two separate replay code
// paths that can drift out of sync with each other.

(function () {
  'use strict';

  // Parse the nonce this exact load was given. Absence of a nonce means this file was
  // opened directly (not through the gallery) — the postMessage listener still installs
  // (harmless), it just will never match any incoming message, which is the correct
  // no-op behavior for a directly-opened prototype.
  var OWN_NONCE = null;
  (function parseNonce() {
    var hash = window.location.hash || '';
    var match = hash.match(/nonce=([^&]+)/);
    if (match) OWN_NONCE = decodeURIComponent(match[1]);
  })();

  window.addEventListener('message', function (event) {
    // 1. Exact source identity — the message must come from this frame's own parent
    //    window reference, not merely claim to.
    if (event.source !== window.parent) return;

    // 2. Strict schema — reject anything that isn't exactly { type: string, nonce: string },
    //    including a plain object with EXACTLY those two own keys, nothing more. (postMessage
    //    structured-clones event.data, so an extra key can never carry an executable
    //    function — but "strict" should mean strict: an object with a surprise third key is
    //    not the shape this contract promises, and accepting it anyway is what "strict"
    //    exists to prevent, independent of whether this particular channel happens to be
    //    unexploitable today.)
    var data = event.data;
    if (!data || typeof data !== 'object' || Array.isArray(data)) return;
    var keys = Object.keys(data);
    if (keys.length !== 2) return;
    if (typeof data.type !== 'string' || typeof data.nonce !== 'string') return;

    // 3. Nonce match — the one piece an attacker (even one satisfying #1 and #2, e.g. a
    //    confused/compromised parent) can't guess, since it's per-load and delivered
    //    out-of-band via the URL fragment before this listener could have leaked it.
    if (!OWN_NONCE || data.nonce !== OWN_NONCE) return;

    var controls = window.__journeyControls;
    if (!controls) return;

    switch (data.type) {
      case 'play':
        if (typeof controls.play === 'function') controls.play();
        break;
      case 'pause':
        if (typeof controls.pause === 'function') controls.pause();
        break;
      case 'replay':
        if (typeof controls.replay === 'function') controls.replay();
        break;
      // Unknown type: silently ignored, per the "never crash on a stray message" rule.
    }
  });
})();
