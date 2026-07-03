import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../../../lib/supabase.js';
import { useTheme } from '../../shared/ThemeProvider.jsx';
import BaynesWatermark from '../BaynesWatermark.jsx';

const DISP_CAP = 150, SS = 1.6;
const CAP = DISP_CAP * SS, MAXW = 1520 * SS;

// Background + starfield are fixed regardless of show theme — black
// background, grayscale-to-white stars — so the warp intro reads as a
// consistent, always-the-same ceremony moment instead of a jazz-club show
// getting an amber warp and a neon-tokyo show getting a pink one. Text
// (intro/team/outro) is the one thing that stays theme-linked, per this
// app's usual convention.
const BG_FIXED = '#000000'
const STAR_ACCENT_FIXED = '#3a3a3a'
const STAR_HIGHLIGHT_FIXED = '#e8e8e8'

function hexToRgb(hex) {
  const n = parseInt(String(hex).replace('#', ''), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function makeSprite(text, color, glowHi, glowAcc, fontFamily) {
  const t = (text || '').toUpperCase();
  const off = document.createElement('canvas');
  const g = off.getContext('2d');
  const F = (px) => `700 ${px}px ${fontFamily}`;
  g.font = F(CAP);
  const w0 = g.measureText(t).width || 1;
  const fs = w0 > MAXW ? Math.max(46, CAP * (MAXW / w0)) : CAP;
  g.font = F(fs);
  const tw = g.measureText(t).width;
  const pad = Math.ceil(fs * 0.55);
  const W = Math.ceil(tw) + pad * 2, H = Math.ceil(fs * 1.5) + pad;
  off.width = W; off.height = H;
  const cx = W / 2, cy = H / 2;
  g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = F(fs);
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
export default function TeamPickerSlide({ slide, show }) {
  const { theme } = useTheme();
  const reduce = useMemo(() =>
    typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const font = theme?.fonts?.display || 'Boogaloo, system-ui, sans-serif';
  const openingText = slide?.data?.openingText?.trim() || "Now, let's meet our teams";
  const closingText = slide?.data?.closingText?.trim() || "Now, let's do this shit";
  const currentPart = slide?.data?.currentPart ?? 0;

  const [teams, setTeams] = useState([]);
  const [fontsReady, setFontsReady] = useState(false);

  // live from teams table, baked on mount (everyone who scanned the QR)
  useEffect(() => {
    if (!show?.id) return;
    let ok = true;
    supabase.from('teams').select('name').eq('show_id', show.id)
      .order('registered_at', { ascending: true })
      .then(({ data }) => { if (ok) setTeams((data || []).map((r) => r.name).filter(Boolean)); });
    return () => { ok = false; };
  }, [show?.id]);

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
  const ctl = useRef({ seq, theme, reduce, displayedIdx: currentPart, targetIdx: currentPart });
  const [hudIdx, setHudIdx] = useState(currentPart);
  const [landed, setLanded] = useState(seq[currentPart]?.kind === 'landed');

  useEffect(() => { ctl.current.seq = seq; }, [seq]);
  useEffect(() => { ctl.current.theme = theme; spriteCache.current.clear(); }, [theme]);
  // Authoritative target from Supabase — the draw loop below reacts to this
  // changing (in either direction) by exiting whatever's on screen and
  // approaching the new target once the exit completes.
  useEffect(() => { ctl.current.targetIdx = Math.min(currentPart, seq.length - 1); }, [currentPart, seq.length]);

  const getSprite = (it) => {
    const th = ctl.current.theme;
    const c = th.colors, color = c.highlight;
    const key = `${it.text}|${color}|${c.highlight}|${c.accent}|${font}`;
    let s = spriteCache.current.get(key);
    if (!s) { s = makeSprite(it.text, color, c.highlight, c.accent, font); spriteCache.current.set(key, s); }
    return s;
  };

  // bake-ahead once fonts + teams ready
  useEffect(() => {
    if (fontsReady) { spriteCache.current.clear(); seq.forEach(it => { if (it.kind !== 'landed') getSprite(it); }); }
  }, [fontsReady, seq]); // eslint-disable-line

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
          setLanded(false);
          beginItem();
        } else if (phase !== 'exit') { phase = 'exit'; pt = 0; }
      }
      const warpTarget = c.seq[c.targetIdx]?.kind === 'landed' ? 0 : 1;
      warp += (warpTarget - warp) * 0.045 * dtn;
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
      if (item && phase !== 'done' && item.kind !== 'landed') {
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
            if (c.seq[c.displayedIdx]?.kind === 'landed') { phase = 'done'; setLanded(true); }
            else { setLanded(false); beginItem(); }
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
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []); // eslint-disable-line

  const cur = seq[hudIdx];

  return (
    <div className="absolute inset-0 overflow-hidden">
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      {landed ? (
        <div className="absolute bottom-10 inset-x-0 text-center" style={{ fontFamily: font, letterSpacing: 5, color: theme.colors.highlight, opacity: 0.35, fontSize: 24, textTransform: 'uppercase' }}>Round 1</div>
      ) : cur?.kind === 'team' ? (
        <div className="absolute bottom-10 inset-x-0 text-center" style={{ fontFamily: font, letterSpacing: 4, color: theme.colors.highlight, opacity: 0.5, fontSize: 26 }}>
          {String(hudIdx).padStart(2, '0')} / {String(teamCount).padStart(2, '0')}
        </div>
      ) : null}
      <BaynesWatermark />
    </div>
  );
}
