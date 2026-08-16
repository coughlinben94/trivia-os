# Ring build — think tank findings, 2026-08-08

**For a fresh agent. Read this whole file before touching anything.**

Five independent Opus audits examined the current build. Full reports are in the Cowork outputs
folder: `A1-drift-audit.md`, `A2-history-audit.md`, `B1-gate-audit.md`, `B2-luminance.md`,
`B3-scaffold.md`, `b3-noun-atlas.md`, plus `b1-ring-verify.mjs` (a rebaselined gate) and B2's four
measurement scripts.

**There are two separate problems and they need separate work.**

**Track 1 — the space theme (Midnight Galaxy).** The structural engine is sound and should not be
touched. The reason it has never looked right is that the brightness system is disconnected: the value
arc is computed correctly and then thrown away before it reaches a pixel. Proven, not inferred.
Sections 1–9 below.

**Track 2 — the scaffolding.** The camera model survives all 21 themes. **The implementation survives
none of the other 20.** It is a space renderer, not a scaffold. Section 13 below, and this is the
larger piece of work.

Read §13 before deciding how much effort to put into §1–9 — some of the space-build fixes are also
scaffold fixes, and some are not.

---

## 0. Housekeeping

A concurrent session left `.git/index.lock` behind — **this blocks every git command until deleted.**
Also delete `concepts/tools/_a1_count_tmp.mjs` and `_a1_count_orig.mjs` if still present.

Confirm you are the only agent session running before you start. Several audits found files changing
underneath them.

---

## 1. The root cause: `ARC.lo` and `ARC.hi` are dead constants

`ringEngine.js:50` — `loudnessOf()` is the arc's **only** consumer, and it normalises the arc to 0–1,
discarding the units entirely.

**Proof, not inference.** B2 patched `world-07-ring.html`'s `ARC: {lo:18, hi:52}` to `{lo:180, hi:520}`
— a tenfold increase — re-rendered all 12 stations, and got **SHA-256-identical pixels, max |Δ mean
luma| = 0.000000.** A control run confirmed the harness was actually detecting change.

The arc was never dim. It was never wired up. Every previous fix tuned arithmetic that was already
correct and never reached the screen.

This is the direct cause of the owner's two oldest complaints — that nothing feels like a moment, and
that the shapes feel small.

### The measurements

| | value |
|---|---|
| Engine's computed station targets | 17.7 – 51.3 |
| What actually renders | 8.5 – 13.7 (B1); −62% to −83% off target after B2's correction |
| Rendered span across 12 stations | 1.56× against a 3.12× intent |
| Ink coverage | 1.8 – 8.9% against a 6–18% target |
| Headline ink, worst station | 0.2% against a 4% floor |
| Safe-box mean luminance | 5.3 against a cap of 34 |

For scale, B2 measured all nine approved shipping ambients: **Sonora renders at 52.8**;
**`midnight-galaxy`, the approved space ambient, renders at 12.2.**

### Why "just raise the alphas" does not work — measured, not assumed

×4 on every mid-layer container opacity moves station 0 by **+4.5%** (9.55 → 9.98). It saturates.

The real defect is **painted area × surface alpha**. Headline boxes occupy 20–27% of the frame but
paint only 0.9–24% of their own interior. Effective peak alpha on the painted surface is 0.05–0.23
after container × gradient-stop compounding — **below `references/themes.md:177`'s own 0.25 floor on 7
of 8 surfaces.** The gate measures the container alpha (0.34–0.55, passing) and never the product.

### Second contributor: pane-invariant light

By ablation: sky 3.05 + grain 2.05 = **5.10 luma of light that is identical on every station**, versus
**2.40 of station-varying content.** That is 213% against spec §3's ≤35% cap — a rule enforced by
nothing. The constant floor is what collapses a 4.5× content span into a 1.56× frame span.

### The fix B2 specifies

Wire `fillOf(arc[i] / ARC.ref)` into `makePrim` to drive interior stop alphas (×2.6) and painted extent
(×1.9); push the far layer behind mid; lift the sky ramp 1.6×; cut grain.

Measured live with the per-station gain applied: **rendered 10.4 → 31.3, all 12 stations inside ±30%,
span 3.01× against a 3.12× target — 96% of intended contrast reaching the screen versus 54% today, ink
16.2%.**

### `lo`/`hi` should change to `{lo: 10, hi: 31}`

18/52 are unreachable as frame-mean luma. Ceiling arithmetic under the spec's own caps: the largest
legal headline, fully opaque at peak alpha 0.55, yields 16.8 luma of frame mean; the whole frame tops
out around 28–30. `hi = 52` is **Sonora's number transplanted into the one world type whose spec
forbids the sky from carrying it** — Sonora is an aerial world with a 12-stop sky; a space world's sky
must stay dark.

10/31 is reachable, preserves the span, sits between two approved ambients, and at 15 feet the step is
4.5× in linear light.

---

## 2. The gate was baselined to the build

`ring-verify.mjs:98-101` records the build's own measured badness as its pass criterion. Its own
comment at `:88-93` admits it: *"the actual measured badness … at the moment this two-tier split
landed"*, pass criterion *"not WORSE than this, not meets the spec target."*

With `headlineInk: 11` recorded, a build where **10 of 12 stations sit outside the 4–9% band — one at
0.2% against a 4% floor — prints PASS.**

Two corrections to an earlier audit: `bleed: 0` and `balance: 34.3` are *badness scores*, not
measurements, and both currently report FAIL correctly. The baseline is not wholly inert — it catches
regressions. It simply cannot catch wrongness.

**B1's rebaselined replacement is at `outputs/b1-ring-verify.mjs`.** Run against a real Chromium
render it goes from **1 FAIL to 9 FAIL, exit 2.** That is the correct behaviour.

Its most important addition is spec §3's "close the loop" rule (`ART-DIRECTION-SPEC.md:149`): rendered
mean luma must land within ±30% of the station's arc target. Nothing had ever checked whether the
render obeys the arc — only whether the arc's targets were internally consistent with each other.

**B2's caveat on that tolerance:** ±30% per station cannot catch the defect it exists to catch. If
every station sits within ±30% of a 3.1× arc, the worst permissible rendered span is 1.67× — barely
above today's 1.56×. Add a hard span rule (≥0.80× of target span) and a rank-correlation rule.

**Self-calibration warning:** calibrate on the render with a single scalar `ARC.ref` only. Fitting
`lo`/`hi` to the measured render makes today's flat build pass everything — that is `CONTENT_BASELINE`
reinvented under a new name.

---

## 3. Nothing runs the gate

No npm script, no `.github/workflows`, no husky hook, and `scripts/ship.sh` never mentions it.
`ring-occlusion-ablation.mjs` — which correctly implements spec §7.2 — is orphaned the same way.

A gate nobody runs is a gate that does not exist.

---

## 4. Spec coverage

The canonical spec is the repo's `concepts/ART-DIRECTION-SPEC.md`, which declares at line 3 that it
supersedes `S1-art-direction.md`. It contains **67 `[auto]` rules**.

- 17 enforced by the rebaselined gate
- 1 enforced by an orphaned tool
- **~49 enforced by nothing** — the whole of §6, §8, §9 and §10

## 5. Contract decision: `ring-verify.mjs` wins

`validateWorld` reports 15 errors, but that number flatters the build — it short-circuits at
`mid.stations: 0` and never runs its ~40 element-level rules. The build is procedural
(`ringPrimitives.js` computes geometry at render time); `validateWorld` demands a declarative world.
Adopting it means inverting the architecture, and it validates *promises rather than pixels* — it would
have passed the realised-arc defect silently. It also still enforces three superseded rules
(`FLAT_NEIGHBOURS` at `:398` is deleted by name in the spec).

Keep it as the generator's pre-emit schema validator, which is what its own header says it is for, and
port its ~15 cheap static `WORLD.stations` checks into `ring-verify.mjs` — about 80 lines.

---

## 6. The pictorial layer, still untouched

**No drawn object exists anywhere in `ringPrimitives.js`.** Every primitive is a glow phenomenon.
`ART-DIRECTION-SPEC.md:240-252` recommended a `sprite` primitive — opaque, stroked, closed path — with
the reasoning stated plainly: *Sonora's balloons read at distance because they're drawn.* That
recommendation, the one derived directly from the named reference, was skipped; `ring` and `binary`
shipped instead, and both are also glows.

Sonora's sky is 12 stops, 9.8:1 internal luma range, six hue families, peak luma 149
(`ParticleBackground.jsx:1033`). The ring's is 4 stops from two theme colours, one hue family,
monotonically darkening (`ringEngine.js:76-78`).

Sonora also puts 3 of its 5 focal lanes **inside** the safe band and manages legibility with the scrim.
`bandY()` bans centroids from it — which the spec's own appendix already flagged as recreating the dead
horizontal stripe.

**The scrim:** spec §2 requires it, `RingAmbient.jsx` does not render one, and the demo's current
geometry leaves the safe-box corners uncovered. B2's proposed geometry takes station 0 from p99.5 124
to 73.

---

## 7. Ledger #11 is live again under a new name

`ringPrimitives.js:640-643` ships "one trackable drifter" at **3,600px over 480s = 7.5 px/s** on a
**14px** object. The approved band (`S2-engine.md:222`) is **2–5 drifters, ≥22px, crossing frame in
60–150s**. The `MidnightGalaxyAmbient` satellite it replaced was ~5× faster (that component was deleted 2026-08-14 when midnight-galaxy moved to the ring renderer).

Cause is a two-spec conflict: `ART-DIRECTION-SPEC.md:325-326` says 4–12 minutes;
`S2-engine.md:588` explicitly names that figure superseded. Both files are live. Resolve it and delete
the loser.

---

## 8. Other confirmed defects

- **2,085 DOM nodes (38.2%) are never visible.** The copy loop `for (k = 0; k <= L.m; k++)` treats `m`
  (content repeats) as a copy count. The mid layer's entire second copy — 1,929 nodes — sits past the
  rightmost pixel the offset schedule can reach. `S2-engine.md:135-151` says mid needs zero
  duplication. Deleting both unreachable copies is −38% nodes with **zero visual change**.
- **Star size distribution regressed.** The `sizeMul` 1.25/1.5 ramp gives 43.4 / 38.9 / 17.7% against a
  62–70 / 24–30 / 5–9% spec; largest star 11.6px against an 8px ceiling. No gate check exists.
- **Independent random streams broke quadrant balance.** After splitting the streams, 7 of the 12
  largest shapes cluster in one quadrant (target 2–4) and composition sits off-centre right. The old
  tuning was accidentally coupled to the shared stream. **Re-tune against the new streams — do not
  revert the split.** The split is correct; the tuning simply needs redoing against it.
- Three TVs off an HDMI splitter is **one** render surface, not three. The splitter is a dumb repeater.
- The "~1,069 node budget" cited in older notes **is not in any repo file** and should be disregarded.
  The original prototype rendered 4,081 nodes on day one.

---

## 9. What is verified good — do not break it

- Layer surges 480 / 1920 / 2880, ratio 1 : 4 : 6 — real parallax
- All layers return to phase 0 together at turns 12, 24, 36
- Integer offsets across 36 simulated turns; no float reaches a transform
- Zero `Math.random` in world construction
- Stations 6/7/8, previously identical, now measure 22.7 / 17.7 / 20.2 — that defect is closed
- Sky colour is now unified; both builds report `rgb(8, 0, 26)`
- **Turn 12's wrap was watched in a real browser: no visible background jump.** Structurally there is
  no in-between frame to catch. One open observation: the question text's fade-in is still arriving
  when the background has already snapped — judge whether that reads as a fault.
- CPU measured: ~0.8% of one core idle, ~49% during 30 back-to-back turns; memory flat over 2 minutes.
  Real use is idle-heavy (75s between turns), so the realistic average is near the idle figure.

**Seven ledger entries are retired by arithmetic** — more permanent ground than the previous six
attempts gained combined. The bones are genuinely sound. The problem was never the engine.

---

## 10. Suggested order of work

1. Delete `.git/index.lock` and any leftover temp files.
2. **Implement B2's luminance fix.** This is the one that changes what Ben sees. Wire `fillOf()`,
   change `ARC` to `{lo: 10, hi: 31}`, push far behind mid, lift the sky ramp, cut grain.
3. Adopt `b1-ring-verify.mjs`, plus B2's span and rank-correlation rules. Expect red. Work it down
   honestly — never by moving a threshold.
4. **Wire the gate into `npm run` and into `ship.sh`.** A gate nobody runs does not exist.
5. Delete the two unreachable layer copies. Re-measure nodes and FPS.
6. Add the scrim to `RingAmbient.jsx` with B2's geometry.
7. Resolve the drifter spec conflict; one number, one home.
8. Re-tune quadrant balance against the split random streams.
9. Fix star size distribution; add a gate check for it.
10. Then the pictorial layer: a drawn `sprite` primitive, a wider sky, and reconsider the centre-band
    ban.
11. **Get it on the actual taproom TV.** Nothing in seven attempts has ever been displayed there. Every
    spec flags this as the largest open risk.

---

## 11. Standing rules

Every one has already been broken at least once here.

- **Render before you claim.** Anything unrendered is labelled unverified in the same message that
  delivers it.
- **A gate may never encode, as a pass criterion, a value it obtained by measuring the artefact it
  gates.** B1's replacement enforces this three ways: a mandatory `file:line` spec citation on every
  threshold (exit 3 at import if missing), a lint rejecting bare numeric literals in comparisons, and a
  lint on the words "baseline/measured/observed" inside comparison-feeding object literals. The real
  pressure behind the original mistake — a permanently red gate is one people stop reading — is
  answered by `KNOWN_DEVIATIONS`: dated, reasoned, self-expiring, WARN never PASS.
- **One fact, one home.** Every duplicated number in this project's history has eventually forked.
- Every constant declared exactly once — never in both CSS and JS.
- No `Math.random` in world construction; independent seeded streams keyed by station and property.
- No blur on elements smaller than about 4× the blur radius.
- Vertical gradients banned in space worlds, required in terrestrial ones — the rule is per world type.
- transform/opacity only; no `requestAnimationFrame`; reduced motion freezes rather than vanishes.

## 13. TRACK 2 — the scaffolding (B3)

Everything in §1–12 concerns one theme. This section concerns the other twenty.

### The verdict

**The camera survives all 21. The implementation survives none of the other 20.**

The ring model — 12 stations, per-layer surge, a 12-turn period, seeded placement, a value arc — is
sound and general. What has been built on top of it is a deep-space renderer with space assumptions
welded in at six separate points.

### The type census — the number that settles it

| type | themes |
|---|---|
| terrestrial | 9 |
| interior | 6 |
| space | **2** |
| urban | 2 |
| aquatic | 1 |
| aerial | 1 |

**The one working type covers 2 of 21.** (And if Meteor Shower is judged terrestrial rather than
space — an open direction call for Ben — it drops to 1 of 21.)

Note "urban" (Sunset Boulevard, Neon Tokyo) has no slot in the existing five-type table. B3 replaces
the enum with three orthogonal axes — `gravity` / `groundPlane` / `skyGeom` — which covers all 21 with
nothing left over.

### The six things that break

1. **No theme can produce a legal non-space sky.** B3 computed Rec.601 luma for `bg`/`bgDeep` across
   all 21 palettes. The maximum top-to-bottom delta in the entire set is **11.9** (Sonora).
   `ART-DIRECTION-SPEC.md:185-191` requires ≥45 interior, ≥50 aquatic, ≥60 terrestrial, ≥90 aerial.
   `skyFromTheme()` cannot produce a legal base gradient for **any** non-space type for **any** theme.
   The palettes are backdrops authored to sit behind text — they are not skies. The approved
   `SonoraBalloonsAmbient` already knows this and hardcodes a 12-stop literal at delta **137**
   (`ParticleBackground.jsx:1033`). **`sky` must be authored per world, not derived from the theme.**
2. **Sky geometry is not data.** `ringPrimitives.js:600-602` hardcodes a radial gradient inside a
   shared CSS string. A terrestrial world has no way to request a vertical ramp.
3. **`world.type` is written and read by nothing.** It exists at `midnightGalaxy.ring.js:10` and has
   zero references in the engine. `FAILURE-LEDGER.md:41` blames an *omitted* type field for the build
   that silently grew terrain. Here the field exists and is inert — same failure, one step further on.
4. **The spec's own gates reject Sonora — the named quality bar.** Its balloons are 72–95px, i.e.
   3.8–5.0% of frame width, which is Detail tier, not Headline (30–46%). Combined ink ~3.5% against a
   4–9% headline floor. Centroids at 184/302/435/558/684px against a safe box of 302–778: **3 of 5 sit
   inside it, and a 4th misses by 0.4px.** Section 3's pane-invariant light cap also inverts under a
   sky — Sonora's light is 100% pane-invariant by definition. The tier bands and ink rules are
   calibrated for glow; a drawn form's legibility scales with **edge**, not area.
5. **Terrestrial ground breaks the parallax numerically.** A 1:4:6 speed ratio implies a 6:1.5:1
   distance ratio, but the size ramp is 1.0:1.25:1.5 — wrong by about 4× for anything resting on
   ground. Compounding it, `near.m = 3` means near content repeats every 4 turns, and `near` is
   exactly where a terrestrial foreground lives. `S2-engine.md` §6.2 flatly forbids `near.elements`.
6. **Two canonical docs contradict each other on the scrim.** `ART-DIRECTION-SPEC.md:80-84` mandates
   elliptical, never a band. `DESIGN-WORKER-LESSONS.md` rounds 2–3 prove at mechanism level that a
   radial gradient **cannot** hold flat dimming across a wide horizontal band, and switched to a
   vertical linear one. Both are correct — resolve it **by world type**.

### The primitives

`sprite`, `ring` and `ground` were specced at `ART-DIRECTION-SPEC.md:241-251`. Only `ring` shipped.

**Roughly 60–80% of station nouns across the 20 unbuilt themes map to a primitive that does not
exist.** B3 specifies six additions, ranked by how many themes each unblocks:

| primitive | themes blocked without it |
|---|---|
| `ground` | 19 / 21 |
| `silhouette` | 17 / 21 |
| `emitter` | 16 / 21 |
| `sprite` | 14 / 21 |
| `beam` | 13 / 21 — already written and approved as `UsGodray` |
| `flame` | 8 / 21 — hand-coding it has failed four times |

**Protocol compliance splits on authorship, not on primitive type.** Iconic forms become
engine-parametric. Figurative forms become atlas-resident traced paths carrying a mandatory `// ref:`
provenance comment, with two new `geometry-lint` checks and a hard rule that **the generator selects an
atlas key and may never write path data.** B3 recommends *against* S2's proposed general `path` escape
hatch — it is one field away from letting an agent invent geometry, which
`OBJECT-RENDERING-PROTOCOL.md` forbids.

`b3-noun-atlas.md` holds the full 21-theme mapping.

### The split B3 did not force

**Interiors should not go on the ring at all** — Medieval Tavern, Retro Arcade, Jazz Club, Dive Bar,
Wine Cellar, 80s Night. A room does not go around you. Content sits at one depth, 2–6 metres out, so a
1:4:6 ratio reads as a dolly rather than a pan, and there is no landmark parade for atmospheric
perspective to grade against. Three of the six already have approved fixed-scene ambients.

Give them **the ring's station model and value arc without its translation** — twelve lighting states
of one room, reusing `arcAt()` unchanged. Small build, real payoff, and it makes the value arc earn its
keep across six more themes.

Extending the ring proper to the other 13 costs six engine changes and six primitives. **State that as
a project, not a config pass.** Two of those changes also fix live defects in the space build.

### Caveat

Nothing in B3 was rendered. All arithmetic is derived from source; every visual claim is labelled
unverified in the full report.

---

## 12. Document status

- **Canonical spec:** `concepts/ART-DIRECTION-SPEC.md` (67 `[auto]` rules; supersedes `S1-art-direction.md`).
- **STALE, history only:** `concepts/SCAFFOLD-world-ring.md`, `concepts/HANDOFF-world-07-ring.md`,
  `S1-art-direction.md`.
- **Still live and useful:** `FAILURE-LEDGER.md` (18 dead approaches — read before proposing anything),
  `S2-engine.md`, `A1`/`A2`/`B1`/`B2` reports, `TT-02-doctrine-audit.md`.
