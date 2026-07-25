# Firefly Summer — Bespoke Ambient Design

## Context

Firefly Summer (`theme.id: 'firefly-summer'`) is currently one of the 12 "generic-engine" themes — it routes through the shared `BreathingGradient` component (`GRADIENT_MOODS['firefly-summer'] = 'calm'`) with no bespoke scene at all. The `particles: {color, count, behavior:'firefly'}` config in `themes/index.js` is vestigial, unused since the gradient-collapse. This spec upgrades it to a bespoke ambient, following the pattern the 9 bespoke themes use (`AMBIENT_MAP` in `ParticleBackground.jsx`) and reusing the animation techniques proven out this session building Sonora Balloons (`concepts/sonora-balloons-depth.html`, patterns now documented in `references/ambient-design-law.md`).

Theme's existing palette (unchanged): `bg:#040e04, bgDeep:#020a02, accent:#1a3808, highlight:#d4a020, text:#e8f0c0, textMuted:#607040, shinyBg:#081000, shinyAccent:#a0ff40`.

## Composition (revised after Fable design-review pass)

Not a left/right split — the porch is a foreground object standing in front of one continuous scene, not one panel of a diptych:

- **Treeline + lake run full width**, behind everything else. 3-layer treeline in back, lake band in front of it (shoreline read), both extending edge to edge.
- **Porch bleeds off the left and bottom edges, cropped** — roofline exits top-left, floor exits bottom-left, a post is cut by the left edge. A complete, isolated porch illustration floating in a quarter of the frame reads as a dollhouse on the lawn; a cropped porch reads as "you're standing on it looking out at the lake," which is the actual premise of the theme. This also simplifies the mask to just top+right edges (fading into dark foliage, where it's invisible) instead of a 4-edge radial fade that reads as "image pasted on."
- **Oak tree moves into the treeline** as its largest tree, not into the raster — it belongs there, costs nothing extra (the layer's being built regardless), and frees up detail budget in the small raster for the porch+swing to actually be legible.
- **Jar is hand-coded, pulled out of the raster entirely** (see Anchor detail) — it's the real focal element, not the porch.
- **Fireflies everywhere**, including behind the porch in z-order (occlusion is a free depth cue) and reflected in the lake.
- **Sky: a real dusk gradient + stars** — see Sky section. This is where the color variety lives.

## Anchor detail

**Backdrop image** (Recraft, tested this session — one-shot clean generation, no iteration fight): porch + empty swing chains only (no bench, no jar, no oak — those are hand-coded or moved elsewhere). Prompt for a **partial/corner view** cropped by the frame edge, not an "isolated complete scene" (the isolated-scene framing was what biased the first test toward a centered dollhouse-style object). Flat vector illustration, dark green/gold/yellow-green palette, explicit negatives (no photorealism, no extra scenery/buildings/fence/people/animals/text/watermark/vignette — naming every unwanted element individually, the technique that worked for this project's planet assets).
- **Compositing: no alpha cutout.** Testing this session found `remove_background` leaves a black shadow-blob artifact on this palette (dark-on-dark: near-black theme bg vs. dark-green illustration elements confuses clean keying — the same class of bug that cost the diner/planet assets multiple rounds, different trigger). Instead: blend the raw webp onto the theme's own near-black bg via a CSS gradient mask fading only the top+right edges (the left+bottom edges bleed off-frame, nothing to mask there).

**Swing bench** (hand-coded, not Recraft): a rounded rect with a few plank lines, same tier of effort as the balloon basket. Hangs from the backdrop image's painted chain positions. Sways via a `sdSway`-style rotate — but NOT the balloon's ±2.4°/6.5s values (those suit a big soft object in wind; on a small empty swing that reads as a jitter/metronome). Wider arc (±4-5°, 4-5s), with the amplitude rerolled at each rest boundary (same reroll-at-rest pattern already built) so it arcs, nearly settles, then gets nudged again — reads as alive rather than motorized.

**The jar** (hand-coded, the real anchor): a rounded-rect-with-neck shape + a static soft glow layer, positioned near the porch. 2-3 fireflies live inside it on their own slower flash interval, independent of the main firefly population — fireflies flashing against the glass is the one image that actually names this theme, more than the porch does.

**Safe area:** jar (the true focal point) stays left of the 20% safe-area line; porch mass stays low enough that most of it sits below y=72%.

**Tint fallback (decided, not punted):** the raster is this system's first non-hand-coded ambient asset — `tint()` can't reach into a webp when a host overrides the show's highlight color. Fix at port time with a static `filter: hue-rotate()` derived from the tint delta between the theme's default and override highlight — cheap, and static filters are allowed by the GPU rule (only *animating* filter is banned).

## Forest + lake detail

**Treeline (3 layers):** Direct reskin of `RIDGE_SHAPE_VARIANTS` / `RIDGE_TIERS` from `sonora-balloons-depth.html` — tileable SVG silhouette polygons (2 bump-layout variants per layer for tile-seam-safe variety, per the tile-seam invariant documented in `ambient-design-law.md`), one scroll speed/direction per layer, real vertical separation between layers, blur+desaturation increasing on the back layer. The oak tree is the largest silhouette in the front layer.

**Lake:** A full-width foreground band in front of the treeline. Revised after Fable review — the scrolling ripple-silhouette idea is cut (confirms the "sliiiightly moving" instinct: at a perceptible-but-subtle amplitude it's imperceptible, and imperceptible motion is pure animation cost for nothing). Replaced with motion the water actually has:
- **Static treeline reflection** — a dark, vertically-flipped, low-opacity copy of the front treeline band. Zero animation; this alone is what makes the band read as water instead of more ground.
- **Reflected firefly flashes** — a blurred, vertically-stretched, dimmer copy of each shoreline firefly's flash, keyed off the same opacity keyframe (near-free reuse) — doubles the perceived flash count and gold presence in the lower frame in one move.
- **Shimmer overlay kept**: the soft horizontal glint drifting across the surface (`sdWave`, removed from the balloon file for being an ill-fitting leftover there — correct fit here, reused deliberately this time).

## Sky (new section — this is where the color variety goes)

A real multi-stop dusk gradient, not a flat near-black rectangle — the balloon file's 12-stop indigo→plum→ember→teal→blue sky is the reference point for why that scene doesn't go monochrome over a 3-hour show; Firefly Summer's sky was the one thing this design hadn't addressed. Deep indigo/violet at zenith through teal at mid-sky to warm ember low behind the treeline. This is a **deliberate, explicit exception** to `ambient-design-law.md`'s in-family color rule (hues confined to `accent → highlight`) — Sonora Balloons already exceeds this rule with its purple-to-orange sky, so there's precedent, but it's being decided here explicitly rather than shipped as a silent violation. The gold firefly flashes read *more* gold against a teal/violet sky than against black (complement contrast) — this strengthens the biological-accuracy premise rather than working against it.

## Fireflies

**Tier split** (mirrors the balloon hero/filler architecture, count revised upward per Fable's duty-cycle math):
- **~10 hero fireflies** — bigger/brighter, near the jar/tree. Permanent tier, no runtime reassignment.
- **~30 filler fireflies** — small, dim, fade in/out on independent periods (direct copy of `sdBalloonFade`'s flat-hold keyframe shape).
- Reasoning for the count: a 0.5s flash on a ~6s cycle is an ~8% duty cycle. At 10 total fireflies that's <1 lit at any instant — most 3-second glances see one firefly or zero, which reads as dead regardless of how biologically correct the timing is. At ~40 total, 3-4 are lit at any instant with a new one igniting roughly twice a second — the real-meadow read, with the per-insect interval unchanged. These are tiny opacity-only divs; the cost of 40 vs 10 is negligible (an order of magnitude cheaper per-element than a balloon's clipped/filtered/gore-sliding SVG subtree).
- Full distribution including over/behind the porch (occluded by it in z-order) and reflected in the lake — no firefly-free zones.

**Color:** uniform gold/yellow-green glow (`highlight:#d4a020`, `shinyAccent:#a0ff40`) — real firefly bioluminescence peaks at ~560nm, landing almost exactly here (source below). Uniform coloring is the accurate choice, not just the simpler one.

**Motion — three layers, grounded in real firefly behavior:**
1. **Drift** — position wander, direct copy of the balloon `sdBalloonDrift` + reroll-at-rest-boundary pattern (WAAPI `playbackRate` for speed variance).
2. **Flash-and-decay glow, asymmetric** — not a symmetric blink. Real fireflies (*Photinus pyralis*) flash a brief streak roughly every 5-7s, mostly dim between. Keyframe: fast rise, slower fall (e.g. `0%,88%{base} 91%{peak} 96%{~0.35} 100%{base}`), base opacity held around 0.12-0.18 (not 0 — a faint constant ember scatter, not full blackout between flashes), staggered per-firefly via random negative delay so they never resync.
3. **J-stroke** — a short upward translate coupled to the flash, matching *P. pyralis*'s signature dip-and-swoop-upward display (the reason it's nicknamed the "big dipper firefly"). Transform-only, effectively free, and the single most recognizable firefly behavior available — a flashing dot that also lifts reads unmistakably as a firefly rather than a blinking light.
- No sway/rotate layer beyond the J-stroke — fireflies aren't fabric shapes.

## Stars

Direct reuse of the balloon file's star field: ~22 stars, `sdStar`-style keyframe (dips to full `opacity:0` at each cycle boundary), reroll to a new random position at that invisible instant. No changes needed — copy as-is.

## Iteration-risk plan (the core worry this design addresses)

The two failure modes that actually cost multiple rounds on prior Recraft-based assets (diner, planets) were: (1) the model adding unwanted elements despite negative prompting, and (2) compositing/docking math bugs. This design tested (1) directly this session — one-shot clean generation, no fight, on the original (now-superseded) full-scene prompt; the revised porch-only prompt is a simplification, not new territory. It designs out (2) entirely: no docking math (single static anchor, no camera flythrough), and no alpha-cutout (mask-blend instead, sidestepping the dark-on-dark bg-removal blob bug found in testing). Everything else — treeline, lake, sky, fireflies, jar, swing, stars — is either pure reused CSS/JS from the balloon ambient or a cheap hand-coded shape (jar, swing bench) at the same tier of effort as the balloon basket. The only Recraft production step is one generation pass for a simpler porch-only backdrop than originally tested.

## GPU / reduced-motion compliance

Animate only `transform` and `opacity`, per the ambient design law's GPU rule — same constraint the balloon file honored throughout. Every animated element gets a `prefers-reduced-motion` guard via the existing `.sd-anim` / `rm-force` class pattern.

## References

- Firefly flash interval and behavior: [Firefly Anatomy and Flash Patterns — Firefly Atlas](https://www.fireflyatlas.org/learn/firefly-anatomy-and-flash-patterns), [Species-Specific Flash Patterns Track the Nocturnal Behavior of Sympatric Taiwanese Fireflies](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC8773436/)
- Firefly bioluminescence wavelength/color: [Firefly Luciferase Wavelength: Peak Emission & Shift Factors](https://academicpath.org/firefly-luciferase-wavelength-guide), [What Color Are Fireflies When They Glow? — Biology Insights](https://biologyinsights.com/what-color-are-fireflies-when-they-glow/)
- Prior session's proven techniques: `references/ambient-design-law.md` (reroll-at-rest, WAAPI playbackRate, flat-hold keyframes, depth-band separation, tile-seam invariants), `concepts/sonora-balloons-depth.html` (reference implementation)
- Recraft generation test (this session): 2 candidates generated one-shot clean on the original full-scene prompt (now superseded by the porch-only crop); `remove_background` test on candidate 2 showed the dark-on-dark blob artifact this spec designs around (image URLs logged in conversation, not persisted as files — regenerate if needed for reference)
- Design critique pass: Fable (fresh-context designer review) read this spec, the balloon reference implementation, and `ambient-design-law.md`, and identified the composition/color/population issues this revision addresses — firefly duty-cycle math, porch-as-floating-island risk, monochrome-sky risk, imperceptible-ripple-motion risk, jar-as-real-anchor, J-stroke behavior. Full critique preserved in conversation history.
