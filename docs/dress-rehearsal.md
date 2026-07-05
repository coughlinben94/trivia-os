# Trivia OS — Dress Rehearsal Checklist (real rig)

Run this on the ACTUAL setup before the next live night: MacBook host + OREI HDMI
splitter → 3 TVs + Stream Deck + one phone on /join. Print it; check boxes with a pen.

**Why these items:** each one covers a bug class that was found (and fixed) in the
2026-07-05 audits — RT-1 realtime blanking, RLS-D-1 silent TV denial, OV-1 overlay
creation, SW-1 swing column, UX-2 write-failure toasts. The rehearsal proves the fixes
on the hardware that matters, not a dev laptop.

---

## 0. Setup conditions (do not skip — these ARE the test)

- [ ] **TV browser has NO host PIN session.** Open /display in a fresh profile or
  incognito window on the TV output. Do NOT enter the PIN there, ever, and don't reuse
  a browser profile where you once did. *Why: the RLS-D-1 scenario only exists in this
  state — a PIN'd TV browser silently masks it.*
- [ ] **Use a REAL-SIZED show, not the Test show.** The RT-1 realtime bug only
  manifests when the show's `slides` JSONB is big enough for Postgres to TOAST it
  (roughly 2KB compressed — the 11-slide Test show already triggered it, so any real
  ~40-slide night is far past the line). Duplicate a past real show or build ≥15 slides
  with real question text.
- [ ] Host laptop on /host (PIN'd), extended display mode, Stream Deck connected and
  its keys targeting the HOST window (click the host window once before using it).
- [ ] One phone joined via the QR code on the pre-show screen.

## 1. Go live + pre-show

- [ ] Go Live → **Start from beginning**.
  - Correct: TVs show PreShowScreen (QR + team count); phone flips to "waiting".
  - Failure: TV stays on old content or shows "Trivia Night / Starting soon" holding
    screen → the display didn't pick up the live show; reload the TV tab.
- [ ] Register the phone team; watch the count tick up on the TV within ~2s.

## 2. Stream Deck sweep (on a QUESTION slide — every key)

Advance to a question slide that has an answer filled in, then:

- [ ] **Next / Prev (ArrowRight / ArrowLeft)** — TVs advance/retreat within ~1s,
  correct transition, no flash of wrong slide.
- [ ] **A (answer reveal)** — the answer card appears OVER the question; toggling off
  returns to the question. **Failure mode this exists to catch (RT-1): the TV goes
  blank/ambient-only instead of showing the answer.** If ANY TV blanks here, stop —
  that's a show-stopper regression.
- [ ] **S (scoreboard overlay)** — panel slides in from the right; the slide stays
  visible behind/beside it; toggling off returns cleanly. Spam S a few times DURING a
  slide transition (press Next, immediately hammer S) — no stuck overlay, no blank.
- [ ] **R (scores revealed)** — phone's score drawer reflects it.
- [ ] After each toggle: confirm the slide content is still on screen. Blank stage
  after any toggle = RT-1 class failure.

## 3. Scoreboard + Quick Entry (SW column)

- [ ] Open Score modal, add 2–3 teams, enter scores via **Quick Entry**: at the round
  step type `1` (→ R1), then repeat with **`SW`**, then `PYL`, then `?`.
  - Correct: `SW` matches the Swing Round column (header literally reads "SW"), score
    lands in that column, TV overlay (S) and the phone drawer show the same numbers.
  - Failure: "SW" doesn't match, or the swing column header reads "R2"/"R{n}" — SW-1
    regression.
- [ ] Kill the venue wifi on the laptop for ~15s mid-entry, change one score.
  - Correct: red "Save failed — check connection" toast on the HOST (and an amber
    underline on the at-risk cell); nothing appears on TVs or phone. Toast clears
    after wifi returns and the next edit saves.
  - Failure: no toast (UX-2 regression) or anything error-ish visible on a TV.

## 4. Overlay slide on the TV

- [ ] Before the run, put a text overlay + an image overlay on one question slide
  (Edit layout → click empty canvas → type; 🖼 Image). Verify in the editor:
  click-to-add works first try, toolbar appears on selection, drag/resize/rotate work.
  - Failure: clicking empty canvas does nothing (OV-1 regression).
- [ ] During the run: that slide on the TV shows both overlays at the exact positions
  from the editor preview (WYSIWYG). Check at the actual TV distance for size.

## 5. Jukebox round trip (the RLS-D-1 test)

- [ ] Advance into a NON-final grading break. Correct: after ~10s the TV navigates to
  the Jukebox on its own (or press Space/ArrowRight ON THE TV WINDOW to skip the wait —
  those keys only skip to the jukebox; they no longer advance slides).
- [ ] Play a track, press `b` on the jukebox → TV returns to /display.
  - Correct: the show advances one slide past the break. **This must work with the TV
    browser un-PIN'd — it exercises the anon `advance_show` RPC.**
  - Failure: TV returns but the slide doesn't advance AND a banner appears at the top:
    "⚠ Display can't advance the show — use the host controls." The banner firing IS
    the guard working — advance from the host, and investigate the RPC after the
    rehearsal. A silent non-advance with NO banner is a worse failure — report that.

## 6. The close: Final Break → Winner Reveal

- [ ] Structure check first: the show's literal LAST slide is a winner-reveal, and the
  final grading break is the last grading break in the deck.
- [ ] Enter the final grading break → jukebox → return (`b`).
  - Correct: TV jumps STRAIGHT to the winner reveal (skipping any slides between the
    break and the end — known, documented behavior). Drum roll plays on the TV, winner
    name + confetti render. **Failure: ambient-only black screen at this moment — RT-1
    regression at the worst possible time.**
  - Correct (host side): `saveResults` fires once — check afterwards in /shows →
    the show's detail page shows the Final Scoreboard matching the entered scores.
  - With zero scored teams the TV should show the "Check the scoreboard!" fallback,
    never a stuck "And the winner is…".
- [ ] Editor sanity: earlier in the day, clicking the winner-reveal slide in Build Mode
  must NOT play the drum roll out loud (PREV-1 regression if it does).

## 7. Wrap

- [ ] Un-live the show / reset for the real night; wifi back on; note ANY anomaly seen
  (even cosmetic) with the slide + key sequence that produced it.
- [ ] If any RT-1/RLS-class failure appeared: do not run the live night on that build.

---

*Generated from the 2026-07-05 second-opinion audit (AUDIT.md) and the RLS-D-1 fix
session. Update this list when display-side write paths or realtime handling change.*
