import { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '../../../lib/supabase.js';
import { useTheme } from '../../shared/ThemeProvider.jsx';
import { EASE_OUT, EASE_PANEL } from '../../../lib/easings.js';

const DISP_CAP = 150, SS = 1.6;
const CAP = DISP_CAP * SS, MAXW = 1520 * SS;

// ─── Ring-world reveal ─────────────────────────────────────────────────────
// Once the warp has decelerated to a real stop, the black canvas itself lifts
// off the top of the stage, revealing the ring-world ambient that has been
// running full-viewport behind this slide the whole time (already on its
// default station — nothing is jumped or re-aimed). "Round 1" then lands as
// its own announcement beat over the revealed world.
//
// SETTLED_WARP: `warp` is eased toward 0 by 0.045/frame once the target item
// is 'landed', so it decays asymptotically and never actually hits 0. Below
// 0.02 the star field is visually stopped (the draw loop itself already
// switches streaks back to dots under 0.03). Read live off the loop rather
// than timed from `landed` — `landed` fires when the outro text finishes
// exiting, ~0.8s BEFORE the stars have actually come to rest.
const SETTLED_WARP = 0.02;
// Ceremonial reveal, not a UI transition — deliberately slower than the
// app's 150-250ms interaction range. EASE_PANEL is this repo's drawer/sheet
// curve, which is exactly what this motion is: a black sheet sliding away.
// Exported because SlideRenderer runs this exact duration backwards as the
// slide's ENTRANCE (sheet drops in from the same top edge to cover) — the
// two halves are one mechanic, so they read one constant.
export const REVEAL_S = 0.85;
const REVEAL_VARIANTS = {
  here: { transform: 'translateY(0%)', opacity: 1 },
  gone: {
    transform: 'translateY(-100%)',
    opacity: 0,
    transition: {
      transform: { duration: REVEAL_S, ease: EASE_PANEL },
      // Fades only on the tail of the wipe — a full-length crossfade would
      // muddy the world showing through a half-transparent black panel.
      opacity: { duration: 0.3, delay: REVEAL_S - 0.3, ease: 'linear' },
    },
  },
};
// Reduced motion: the reveal still has to happen (it carries real
// information — the show is moving on), just without the vertical travel.
const REVEAL_VARIANTS_REDUCE = {
  here: { opacity: 1 },
  gone: { opacity: 0, transition: { duration: 0.45, ease: EASE_OUT } },
};

// Background + starfield are fixed regardless of show theme — black
// background, grayscale-to-white stars — so the warp intro reads as a
// consistent, always-the-same ceremony moment instead of a jazz-club show
// getting an amber warp and a neon-tokyo show getting a pink one. Text
// (intro/team/outro) is the one thing that stays theme-linked, per this
// app's usual convention.
const BG_FIXED = '#000000'
const STAR_ACCENT_FIXED = '#3a3a3a'
const STAR_HIGHLIGHT_FIXED = '#e8e8e8'

// Deterministic seeded shuffle (mulberry32 + Fisher-Yates) — same seed
// always produces the same order, so a reload or Stream Deck back/forward
// over the sequence doesn't reshuffle teams the host has already announced.
function seededShuffle(arr, seedStr) {
  let seed = 0;
  for (const ch of String(seedStr)) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) >>> 0;
    let t = seed;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

const F = (px, fontFamily) => `700 ${px}px ${fontFamily}`;

// The size THIS text would claim on its own: full CAP unless it's too wide for
// MAXW, in which case scale down to fit (canvas advance width is linear in font
// size, so one measure gives the exact fit — no binary search needed).
let measureCtx = null;
export function fitFontSize(text, fontFamily) {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d');
  measureCtx.font = F(CAP, fontFamily);
  const w0 = measureCtx.measureText((text || '').toUpperCase()).width || 1;
  return w0 > MAXW ? Math.max(46, CAP * (MAXW / w0)) : CAP;
}

function makeSprite(text, color, glowHi, glowAcc, fontFamily, fsOverride) {
  const t = (text || '').toUpperCase();
  const off = document.createElement('canvas');
  const g = off.getContext('2d');
  const fs = fsOverride ?? fitFontSize(t, fontFamily);
  g.font = F(fs, fontFamily);
  const tw = g.measureText(t).width;
  const pad = Math.ceil(fs * 0.55);
  const W = Math.ceil(tw) + pad * 2, H = Math.ceil(fs * 1.5) + pad;
  off.width = W; off.height = H;
  const cx = W / 2, cy = H / 2;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = F(fs, fontFamily);
  g.shadowColor = glowAcc; g.shadowBlur = fs * 0.34; g.fillStyle = color; g.fillText(t, cx, cy);
  g.shadowColor = glowHi;  g.shadowBlur = fs * 0.16; g.fillText(t, cx, cy);
  g.shadowBlur = 0; g.fillText(t, cx, cy);
  return { canvas: off, w: W, h: H, fs };
}

// slide.data: { openingText?, closingText?, parts, currentPart }
// parts/currentPart are the same stepping mechanism shiny series use (see
// useShow.js's withEntryState/nextSlide/prevSlide) — parts is baked once,
// on first entry, to [intro, ...teams, outro, landed].length by
// bakeTeamPickerParts; this component just reads currentPart as a prop and
// reacts, same as PylRevealSlide/PixelateSeriesSlide. It does NOT listen for
// its own keydown — Stream Deck lives on /host (LiveMode.jsx), not /display,
// so a local listener here would never see the real hardware.
// How long a fully-revealed intro/team name holds before auto-advancing to
// the next one (2026-08-20, Ben: "one advance button to start the whole
// animation ... all team names ... flow together" — a Next press per name
// was the actual complaint, not the pacing). Outro is deliberately excluded
// (see the auto-advance effect below) — the closing line still waits for an
// explicit Next, same as today, since that's the one beat Ben still wants to
// control the timing of ("then i have to advance to get to next slide").
const AUTO_HOLD_MS = 1400;

export default function TeamPickerSlide({ slide, show, isPreview = false }) {
  const { theme } = useTheme();
  const reduce = useMemo(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const font = theme?.fonts?.display || 'Boogaloo, system-ui, sans-serif';
  const openingText = slide?.data?.openingText?.trim() || "Now, let's meet our teams";
  const closingText = slide?.data?.closingText?.trim() || "Now, let's do this shit";
  const currentPart = slide?.data?.currentPart ?? 0;

  const [teams, setTeams] = useState([]);
  const [fontsReady, setFontsReady] = useState(false);

  // Background theme (loop lives in public/, not bundled — a fixed 45s
  // native-loop AAC clip, same "always the same ceremony" reasoning as the
  // fixed BG_FIXED/STAR_*_FIXED colors above). Starts on mount; fades out
  // over REVEAL_S once the ring-world reveal begins so the music finishes
  // exactly as the wipe does, not with a hard cut. Autoplay-with-sound can
  // be blocked by the browser without a prior user gesture — this is a
  // kiosk `/display` page a host has already navigated to, so the common
  // case has one, but `.play()` rejection is swallowed either way rather
  // than surfaced, since there's no UI here to show an error in.
  const audioRef = useRef(null);
  const AUDIO_VOL = 0.55;
  // Synced to the first item's "approach" (the words' zoom/grow-in), not a
  // flat timer (2026-08-17, Ben: "should start as the words get bigger" /
  // "the fade in starts just before" — two corrections to what was
  // originally a plain 3s delay). `covered` flips at REVEAL_S*1000 (see the
  // entrance-hold effect below) — that's the exact moment the first item
  // starts growing. START_LEAD_MS gets the fade audibly under way just
  // before that instant instead of starting flush with it.
  const FADE_IN_MS = 4000;
  const START_LEAD_MS = 200;
  // Single ref for whichever timer/rAF is currently driving a.volume — fed
  // by both the fade-in below and the fade-out further down, so starting
  // one always cancels the other first. Before this, the fade-out effect's
  // `[settled]` dependency fired on MOUNT too (settled starts false) and
  // unconditionally snapped volume to AUDIO_VOL, racing the fade-in's own
  // rAF loop (never cancelled except on unmount) for control of a.volume —
  // two independent loops writing it every frame, occasionally computing a
  // value just outside [0,1] from the timing skew between them, which
  // HTMLMediaElement.volume's setter throws on rather than clamps.
  const volAnimRef = useRef({ timeout: null, raf: null });
  function stopVolAnim() {
    clearTimeout(volAnimRef.current.timeout);
    cancelAnimationFrame(volAnimRef.current.raf);
    volAnimRef.current = { timeout: null, raf: null };
  }
  // HTMLMediaElement.volume THROWS (doesn't clamp) outside [0,1] — confirmed
  // live even with the single-owner rAF handle above still occasionally
  // computing a few-ten-thousandths negative right at the fade-out's tail
  // (startVol * (1-p) with p pinned to exactly 1 by Math.min, but startVol
  // itself sampled mid-fade-in from the OTHER effect can carry a sliver of
  // float error through). Clamping here is the actual fix for the crash;
  // the single-owner handle above is still correct and worth keeping since
  // it's what stops the two loops fighting over which value wins.
  function setVol(a, v) { a.volume = Math.max(0, Math.min(1, v)); }
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    stopVolAnim();
    a.volume = 0;
    const t = setTimeout(() => {
      a.play().catch(() => {});
      const t0 = performance.now();
      const step = (now) => {
        const p = Math.min(1, (now - t0) / FADE_IN_MS);
        setVol(a, AUDIO_VOL * p);
        if (p < 1) volAnimRef.current.raf = requestAnimationFrame(step);
      };
      volAnimRef.current.raf = requestAnimationFrame(step);
    }, Math.max(0, REVEAL_S * 1000 - START_LEAD_MS));
    volAnimRef.current.timeout = t;
    return stopVolAnim;
  }, []);

  // live from teams table, baked on mount (everyone who scanned the QR).
  // Shuffled, not registration order — reading them off in signup order
  // isn't the point, a shuffle is. Seeded off slide.id so the order is
  // stable across a reload or Stream Deck back/forward instead of
  // reshuffling every time this effect re-runs.
  useEffect(() => {
    if (!show?.id) return;
    let ok = true;
    supabase.from('teams').select('name').eq('show_id', show.id)
      .order('registered_at', { ascending: true })
      .then(({ data }) => {
        if (!ok) return;
        const names = (data || []).map((r) => r.name).filter(Boolean);
        setTeams(seededShuffle(names, slide?.id ?? show.id));
      });
    return () => { ok = false; };
  }, [show?.id, slide?.id]);

  useEffect(() => {
    let ok = true;
    const done = () => ok && setFontsReady(true);
    const fam = font.split(',')[0].replace(/['"]/g, '').trim();
    if (document.fonts?.load) {
      Promise.all([document.fonts.load(`700 ${CAP}px ${fam}`), document.fonts.load(`700 46px ${fam}`)])
        .then(() => document.fonts.ready).then(done).catch(done);
    } else done();
    return () => { ok = false; };
  }, [font]);

  // slide.data.parts is baked to a fixed length (intro + teams + outro +
  // landed) the first time the slide is entered live — use that as the
  // authoritative team count so the sequence can't resize mid-reveal if
  // someone registers late. Falls back to the live team count when parts
  // hasn't been baked yet (e.g. viewing this slide in the editor preview,
  // which never goes through useShow.js's live-entry path).
  const bakedCount = Array.isArray(slide?.data?.parts) ? slide.data.parts.length - 3 : null;
  const teamCount = bakedCount !== null ? Math.max(0, bakedCount) : teams.length;
  const teamNames = useMemo(() => teams.slice(0, teamCount), [teams, teamCount]);

  const seq = useMemo(() => [
    { kind: 'intro', text: openingText },
    ...teamNames.map((n) => ({ kind: 'team', text: n })),
    { kind: 'outro', text: closingText },
    { kind: 'landed' },
  ], [teamNames, openingText, closingText]);

  const canvasRef = useRef(null);
  const spriteCache = useRef(new Map());
  // Both start equal to currentPart (not 0) so a page reload mid-reveal
  // replays the current item's approach instead of flash-exiting a wrong one.
  const ctl = useRef({ seq, theme, reduce, displayedIdx: currentPart, targetIdx: currentPart, covered: reduce });
  const [hudIdx, setHudIdx] = useState(currentPart);
  // settled: warp has actually decayed to a stop (see SETTLED_WARP) — starts
  // the reveal. revealed: the black canvas has finished sliding away — starts
  // the Round 1 beat and lets the draw loop shut down.
  const [settled, setSettled] = useState(false);
  const [revealed, setRevealed] = useState(false);

  // Fades the loop out in step with REVEAL_VARIANTS' wipe (REVEAL_S) rather
  // than a fixed timer — settled flipping back to false (Stream Deck back
  // out of 'landed') cancels the fade and snaps volume back up instead of
  // leaving the music silent for a resumed sequence.
  const everSettledRef = useRef(false);
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    if (!settled) {
      // Only a real back-out (was settled, now isn't) snaps volume back to
      // full — on initial mount settled is ALSO false, but nothing has
      // happened yet, so leave the fade-in effect above alone to ramp up
      // from 0 on its own schedule instead of stomping it here.
      if (everSettledRef.current) { stopVolAnim(); a.volume = AUDIO_VOL; }
      return;
    }
    everSettledRef.current = true;
    stopVolAnim();
    const startVol = a.volume, t0 = performance.now();
    const step = (now) => {
      const p = Math.min(1, (now - t0) / (REVEAL_S * 1000));
      setVol(a, startVol * (1 - p));
      if (p < 1) volAnimRef.current.raf = requestAnimationFrame(step);
      else a.pause();
    };
    volAnimRef.current.raf = requestAnimationFrame(step);
    return stopVolAnim;
  }, [settled]);

  // Hold the first item's approach until the entrance wipe has landed.
  // SlideRenderer drops this whole panel in from the top edge over REVEAL_S
  // (SLIDE_ANIMATIONS['team-picker'] — the exit reveal run backwards). The
  // draw loop starts on mount, and the intro text is at full opacity 126ms
  // in (`op = pt / (A * 0.12)`), so without this hold the text rides down
  // with the sheet already fully formed instead of popping once the stage
  // is covered. Reduced motion gets no wipe (SlideRenderer's reduce branch
  // hands it a dissolve, itself neutralized by the opacity lock), so it
  // starts covered and holds nothing.
  // ponytail: timed off mount, not wired to the parent's onAnimationComplete
  // — both start on the same mount, and a real handle would mean threading a
  // callback prop down through SlideRenderer for one 850ms wait.
  useEffect(() => {
    if (reduce) return;
    const t = setTimeout(() => { ctl.current.covered = true; }, REVEAL_S * 1000);
    return () => clearTimeout(t);
  }, [reduce]);

  useEffect(() => { ctl.current.seq = seq; }, [seq]);
  useEffect(() => { ctl.current.theme = theme; spriteCache.current.clear(); }, [theme]);
  // Authoritative target from Supabase — the draw loop below reacts to this
  // changing (in either direction) by exiting whatever's on screen and
  // approaching the new target once the exit completes.
  // `restart` is a no-op unless the loop shut itself down after the reveal —
  // backing out of 'landed' (Stream Deck back) has to bring the star field
  // and the canvas back, so the loop can't be a one-way door.
  useEffect(() => {
    ctl.current.targetIdx = Math.min(currentPart, seq.length - 1);
    ctl.current.restart?.();
  }, [currentPart, seq.length]);

  // Auto-advance intro/team parts — same write nextSlide()'s multi-part
  // branch makes (useShow.js), fired from here instead of a host click.
  // Guarded to hudIdx === currentPart so a fresh page load mid-sequence or a
  // Stream Deck press racing the timer never double-advances: hudIdx only
  // updates once the draw loop has actually settled on the Supabase-driven
  // target (see the `[currentPart, seq.length]` effect above), so if they
  // disagree a nav is already in flight and this effect's cleanup — which
  // fires on every hudIdx change — clears the pending timer before it can
  // fire against a part that's no longer current.
  useEffect(() => {
    if (isPreview) return;
    const item = seq[hudIdx];
    if (!item || (item.kind !== 'intro' && item.kind !== 'team')) return;
    if (hudIdx !== currentPart || hudIdx >= seq.length - 1) return;
    const t = setTimeout(() => {
      const newSlides = (show.slides ?? []).map((s) =>
        s.id === slide.id ? { ...s, data: { ...s.data, currentPart: hudIdx + 1 } } : s
      );
      supabase.from('shows').update({ slides: newSlides, answer_reveal: false }).eq('id', show.id);
    }, AUTO_HOLD_MS);
    return () => clearTimeout(t);
  }, [hudIdx, currentPart, seq, isPreview, show, slide.id]);

  // One font size for every team name — the size the HARDEST-to-fit (longest)
  // name claims on its own. Same fix f7ddb51 made for question text across a
  // round: without it each name independently maximized itself, so a short
  // name rendered at full CAP right after a long one that had shrunk to fit
  // MAXW, and consecutive reveals visibly popped bigger/smaller. Smaller than
  // a name's own optimal size always still fits (fitting is monotonic), so
  // this only ever adds headroom — the longest name is unchanged, since it IS
  // the minimum. Computed once per roster (not per frame); the draw loop reads
  // the baked sprites, which carry the size with them.
  // ponytail: teams only. The intro/outro lines are one-off framing beats and
  // keep their own fit — folding them into the min would shrink every team
  // name to the length of "Now, let's meet our teams".
  const uniformTeamFs = useMemo(() => {
    if (!fontsReady || !teamNames.length) return null;
    return Math.min(...teamNames.map((n) => fitFontSize(n, font)));
  }, [fontsReady, teamNames, font]);

  const getSprite = (it) => {
    const th = ctl.current.theme;
    const c = th.colors, color = c.highlight;
    const fs = it.kind === 'team' ? ctl.current.teamFs : null;
    const key = `${it.text}|${color}|${c.highlight}|${c.accent}|${font}|${fs ?? 'auto'}`;
    let s = spriteCache.current.get(key);
    if (!s) { s = makeSprite(it.text, color, c.highlight, c.accent, font, fs ?? undefined); spriteCache.current.set(key, s); }
    return s;
  };

  // bake-ahead once fonts + teams ready. teamFs lives on ctl because the draw
  // loop captured getSprite's closure on mount (same reason theme does).
  useEffect(() => {
    ctl.current.teamFs = uniformTeamFs;
    if (fontsReady) { spriteCache.current.clear(); seq.forEach(it => { if (it.kind !== 'landed') getSprite(it); }); }
  }, [fontsReady, seq, uniformTeamFs]); // eslint-disable-line

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dctx = canvas.getContext('2d', { alpha: false, desynchronized: true });
    const W = 1920, H = 1080, CX = W / 2, CY = H / 2;
    canvas.width = W; canvas.height = H;
    const c = ctl.current;
    const N = c.reduce ? 110 : 190;
    const stars = Array.from({ length: N }, () => ({
      x: Math.random() * 2 - 1, y: Math.random() * 2 - 1, z: Math.random(), s: 0.7 + Math.random() * 0.6,
    }));
    const S0 = 0.03;
    const easeInOut = (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
    let phase = 'approach', pt = 0, warp = c.reduce ? 0.12 : 0, last = performance.now(), raf;
    let settledFired = false;
    const beginItem = () => { phase = 'approach'; pt = 0; };

    const draw = (now) => {
      const dt = Math.min(26, now - last); last = now;
      const dtn = dt / 16.6667;
      const acc = hexToRgb(STAR_ACCENT_FIXED), hi = hexToRgb(STAR_HIGHLIGHT_FIXED), bg = hexToRgb(BG_FIXED);
      // A Supabase-driven target change (either direction) interrupts
      // whatever's currently showing — exit it, then approach the new one.
      // 'landed' has no sprite/exit of its own (nothing drawn once done),
      // so backing out of it snaps straight to approaching the new target
      // instead of trying to play an exit animation for an invisible item.
      if (c.targetIdx !== c.displayedIdx) {
        if (c.seq[c.displayedIdx]?.kind === 'landed') {
          c.displayedIdx = c.targetIdx;
          setHudIdx(c.displayedIdx);
          beginItem();
        } else if (phase !== 'exit') { phase = 'exit'; pt = 0; }
      }
      // TEAM-1 fix: under reduced-motion, hold warp at its fixed low starting
      // value instead of easing it toward 1 every frame. Previously only the
      // star COUNT (190→110) and the text's zoom-approach (replaced with a
      // flat fade below) respected `reduce` — this loop still ratcheted warp
      // up to full speed regardless, so the streaking parallax lines (the
      // actual vestibular-motion effect) kept playing continuously under
      // reduced-motion. This is the one slide in the app using canvas/rAF
      // instead of CSS `@keyframes`, so it sits outside the app's usual
      // `.el-anim{animation:none}` pattern and needed its own explicit branch.
      if (c.reduce) {
        warp = 0.12;
      } else {
        // While the entrance sheet is still descending (!c.covered), ease
        // toward the same 0.12 idle reduced-motion pins forever — proven not
        // to bloom the additive star trails — instead of ramping straight to
        // 1. Ramping to 1 immediately put warp at ~0.9 by the time the sheet
        // lands (0.955^51 frames), putting hyperspace at full speed before
        // the intro text even starts — inverting the approved text-then-
        // hyperspace order. The sheet still arrives with visible drift, not
        // as a static card; it just isn't already at full speed underneath.
        const warpTarget = !c.covered ? 0.12 : (c.seq[c.targetIdx]?.kind === 'landed' ? 0 : 1);
        warp += (warpTarget - warp) * 0.045 * dtn;
      }
      // Settled = we're resting on 'landed' with nothing pending AND the star
      // field has actually stopped. Under reduced motion warp is pinned at
      // 0.12 forever, so 'landed' alone is the signal there. Checking the
      // displayed item (not `phase`) also covers a reload straight into the
      // landed part, where `phase` never passes through 'done'.
      const atRest = c.seq[c.displayedIdx]?.kind === 'landed' && c.targetIdx === c.displayedIdx;
      const nowSettled = atRest && (c.reduce || warp < SETTLED_WARP);
      if (nowSettled !== settledFired) {
        settledFired = nowSettled;
        setSettled(nowSettled);
        if (!nowSettled) setRevealed(false);
      }
      const base = 0.019 * warp;
      dctx.fillStyle = `rgba(${bg.r},${bg.g},${bg.b},${c.reduce ? 1 : 0.30})`;
      dctx.fillRect(0, 0, W, H);
      dctx.globalCompositeOperation = 'lighter';
      for (const s of stars) {
        const prevZ = s.z; s.z -= base * s.s * dtn;
        if (s.z <= 0.02) { s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; s.z = 1; continue; }
        const sx = (s.x / s.z) * CX + CX, sy = (s.y / s.z) * CY + CY;
        if (sx < -60 || sx > W + 60 || sy < -60 || sy > H + 60) { s.x = Math.random() * 2 - 1; s.y = Math.random() * 2 - 1; s.z = 1; continue; }
        const depth = 1 - s.z, a = Math.min(1, depth * 1.15), tt = Math.min(1, depth * 1.3), core = depth * depth * 0.6;
        const r = Math.round(acc.r + (hi.r - acc.r) * tt + (255 - hi.r) * core);
        const g = Math.round(acc.g + (hi.g - acc.g) * tt + (255 - hi.g) * core);
        const b = Math.round(acc.b + (hi.b - acc.b) * tt + (255 - hi.b) * core);
        dctx.fillStyle = dctx.strokeStyle = `rgba(${r},${g},${b},${a})`;
        const px = (s.x / prevZ) * CX + CX, py = (s.y / prevZ) * CY + CY;
        const len = Math.abs(sx - px) + Math.abs(sy - py);
        if (len < 1.2 || warp < 0.03) { dctx.beginPath(); dctx.arc(sx, sy, Math.max(0.7, depth * 2.2), 0, 6.2832); dctx.fill(); }
        else { dctx.lineWidth = Math.max(0.6, depth * depth * 5.2); dctx.beginPath(); dctx.moveTo(px, py); dctx.lineTo(sx, sy); dctx.stroke(); }
      }
      dctx.globalCompositeOperation = 'source-over';
      const vg = dctx.createRadialGradient(CX, CY, 0, CX, CY, H * 0.5);
      vg.addColorStop(0, `rgba(${bg.r},${bg.g},${bg.b},0.80)`);
      vg.addColorStop(0.34, `rgba(${bg.r},${bg.g},${bg.b},0.40)`);
      vg.addColorStop(0.62, 'rgba(0,0,0,0)');
      dctx.fillStyle = vg; dctx.fillRect(0, 0, W, H);

      const item = c.seq[c.displayedIdx];
      // `c.covered` gates TEXT here, and (see above) holds warp to a gentle
      // idle rather than 0 or full speed while the sheet is still landing —
      // so the sheet arrives already alive with soft drift, ramps to full
      // hyperspace only once the text has room to read against it.
      if (item && c.covered && phase !== 'done' && item.kind !== 'landed') {
        const A = (c.reduce ? 900 : 1050), E = 620;
        pt += dt;
        let disp = 1, op = 1;
        if (phase === 'approach') {
          const p = Math.min(1, pt / A); disp = S0 + (1 - S0) * easeInOut(p); op = Math.min(1, p / 0.12);
          if (p >= 1) { phase = 'hold'; pt = 0; }
        } else if (phase === 'hold') {
          // Holds indefinitely — only a real currentPart change (Stream
          // Deck, via LiveMode -> useShow.js -> Supabase) breaks the hold.
          disp = 1; op = 1;
        } else if (phase === 'exit') {
          const q = Math.min(1, pt / E); disp = 1 + 0.9 * q * q; op = q < 0.78 ? 1 - Math.pow(q / 0.78, 1.25) : 0;
          if (q >= 1) {
            c.displayedIdx = c.targetIdx;
            setHudIdx(c.displayedIdx);
            if (c.seq[c.displayedIdx]?.kind === 'landed') phase = 'done';
            else beginItem();
          }
        }
        if (c.reduce) { disp = 1; op = Math.min(1, pt / 260); }
        if (op > 0.001) {
          const spr = getSprite(item), drawScale = disp / SS;
          dctx.globalAlpha = op;
          dctx.drawImage(spr.canvas, CX - (spr.w * drawScale) / 2, CY - (spr.h * drawScale) / 2, spr.w * drawScale, spr.h * drawScale);
          dctx.globalAlpha = 1;
        }
      }
      if (!c.stopped) raf = requestAnimationFrame(draw);
    };
    // Painting a canvas nobody can see costs the ring world frames for the
    // rest of the Round 1 beat — `c.stopped` is set once the reveal finishes
    // and cleared by `restart` if the host backs out of 'landed'.
    c.restart = () => {
      if (!c.stopped) return;
      c.stopped = false;
      last = performance.now();
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => { cancelAnimationFrame(raf); c.restart = null; };
  }, []); // eslint-disable-line

  const cur = seq[hudIdx];

  return (
    <div className="absolute inset-0 overflow-hidden">
      <audio ref={audioRef} src="/audio/lightspeed-theme-loop.m4a" loop preload="auto" />
      {/* The canvas keeps its own fixed 1920x1080 backing store and CSS
          fill — the wrapper only ever moves/fades, so none of that sizing
          logic is disturbed. */}
      <motion.div
        className="absolute inset-0"
        initial={false}
        animate={settled ? 'gone' : 'here'}
        variants={reduce ? REVEAL_VARIANTS_REDUCE : REVEAL_VARIANTS}
        onAnimationComplete={() => {
          if (!settled) return;
          setRevealed(true);
          ctl.current.stopped = true;
        }}
      >
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      </motion.div>
      {revealed ? (
        <RoundOneBeat theme={theme} font={font} reduce={reduce} />
      ) : cur?.kind === 'team' ? (
        <div className="absolute bottom-10 inset-x-0 text-center" style={{ fontFamily: font, letterSpacing: 4, color: theme.colors.highlight, opacity: 0.5, fontSize: 26 }}>
          {String(hudIdx).padStart(2, '0')} / {String(teamCount).padStart(2, '0')}
        </div>
      ) : null}
    </div>
  );
}

// The "Round 1" beat that replaces the old quiet bottom-corner label. Timing
// and motion are lifted from RoundIntroSlide (spring slam on the number, a
// kicker sliding up behind it) so a round starting looks the same here as it
// does when a real round-intro slide does it — see that file, this is
// deliberately its visual language, not a third one. What it does NOT copy is
// that slide's opaque themed background and logo: this beat plays ON TOP of
// the ring world we just revealed, so it stays transparent and leans on a
// dark radial scrim for legibility over whatever the world is doing.
// ponytail: "Round 1" is hardcoded, exactly as the label it replaces was —
// this slide has no round data of its own, and the team intro only ever
// precedes round 1.
function RoundOneBeat({ theme, font, reduce }) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
      <motion.div
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.45, ease: EASE_OUT }}
        style={{ background: 'radial-gradient(ellipse 58% 62% at 50% 50%, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0.26) 46%, transparent 78%)' }}
      />
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateY(26px)' }}
        animate={{ opacity: 0.75, transform: 'translateY(0px)' }}
        transition={{ duration: 0.3, ease: EASE_OUT }}
        className="relative z-10"
        style={{ fontFamily: font, color: theme.colors.text, fontSize: 'clamp(1.4rem, 2.4vw, 2.4rem)', letterSpacing: '0.42em', textIndent: '0.42em', textTransform: 'uppercase' }}
      >
        Round
      </motion.div>
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, transform: 'scale(2.6)' }}
        animate={{ opacity: 1, transform: 'scale(1)' }}
        transition={reduce
          ? { duration: 0.3, delay: 0.1, ease: EASE_OUT }
          // Spring on the scale only — springing the opacity too would ramp
          // it in over the spring's whole settle, and the number would read
          // as fading up rather than landing.
          : { default: { type: 'spring', duration: 0.5, bounce: 0.25, delay: 0.12 }, opacity: { duration: 0.18, delay: 0.12, ease: EASE_OUT } }}
        className="relative z-10"
        style={{
          fontFamily: font,
          color: theme.colors.highlight,
          fontSize: 'clamp(6rem, 20vw, 18rem)',
          lineHeight: 0.9,
          fontWeight: 700,
          letterSpacing: '-0.04em',
          textShadow: `0 0 48px ${theme.colors.accent}, 0 0 120px ${theme.colors.accent}88`,
        }}
      >
        1
      </motion.div>
    </div>
  );
}
