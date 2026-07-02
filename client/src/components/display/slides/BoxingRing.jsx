import React, { useRef, useState, useEffect } from "react";

const CREAM = "#f5f0e8", APPLE = "#e02020";
const AREA_W = 1344, AREA_H = 756, CX = AREA_W / 2, CY = AREA_H / 2;
const RING_HX = 527, RING_HY = 275;
const PLATE_W = 150, PLATE_H = 46;
const PALETTE = ["#ff5d5d", "#5db0ff", "#7ee081", "#c98bff", "#ff9f43", "#4de3d0", "#ff6fb0", "#b0e04d", "#ffd24d", "#4d9fff", "#ff7ae0", "#7affb0"];
const SP = 1.1;
const FIRST_KO_DOOM = 4500, KO_SPACING = 1900, SWORD_MS = 2800, HITS_TO_KILL = 3;
const DANCE_MS = 3000 * SP, FINISH_MS = 850 * SP, BELL_MS = 1000 * SP, BREAK_MS = 1400 * SP;
const TAU = Math.PI * 2;

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [b[i], b[j]] = [b[j], b[i]]; } return b; };
const hpColor = (hp) => hp > 55 ? "#4de081" : hp > 28 ? "#ffcf4d" : "#ff5d5d";
const easeOutBack = (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const POWS = ["POW!", "BAM!", "WHAM!", "SMACK!", "BOOM!", "KA-POW!"];

export default function BoxingRing({ candidates, winnerId, theme, onDone }) {
  const C = theme.colors;
  const F = useRef([]); const fx = useRef([]); const shake = useRef(0);
  const phase = useRef("bell"); const marks = useRef({}); const done = useRef(false);
  const sword = useRef({ active: false, bearer: null, victim: null, t0: 0, slashed: false });
  const matchesRef = useRef([]); const cmRef = useRef(0);
  const [, force] = useState(0);

  const wrapRef = useRef(null); const [fit, setFit] = useState(1);
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setFit(Math.min(1, el.clientWidth / AREA_W)));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const N = candidates.length;
  const pScale = clamp(6 / Math.min(N, 8), 0.72, 1);
  const ROPE_IN = 24;
  const hx = RING_HX - ROPE_IN - (PLATE_W * pScale) / 2, hy = RING_HY - ROPE_IN - (PLATE_H * pScale) / 2;
  const CORNERS = [[CX - hx * 0.82, CY - hy * 0.78], [CX + hx * 0.82, CY - hy * 0.78], [CX - hx * 0.82, CY + hy * 0.78], [CX + hx * 0.82, CY + hy * 0.78]];

  useEffect(() => {
    const find = (id) => F.current.find((f) => f.id === id);
    F.current = candidates.map((c, i) => ({
      ...c, color: PALETTE[i % PALETTE.length],
      x: CX, y: CY, hx0: CX, hy0: CY, bob: i * 1.3, stageX: CX, stageY: CY,
      vx: 0, vy: 0, hp: 100, alive: false, match: -1, doomed: false, rot: 0, vrot: 0, gray: 0,
      cd: 0, hitFlash: 0, target: null, win: false, hitsTaken: 0, vcd: 0,
      state: "brawl", mode: "approach", engageUntil: 0, hasSword: false, swordVictim: false, killed: false,
      appear: 0,
    }));

    // build the bracket
    const nonWin = shuffle(candidates.filter((c) => c.id !== winnerId).map((c) => c.id));
    let matches;
    if (N > 8) {
      const half = Math.ceil(N / 2);
      const aNon = nonWin.slice(0, half - 1), bNon = nonWin.slice(half - 1);
      const finalistB = bNon[bNon.length - 1];
      matches = [
        { ids: [winnerId, ...aNon], win: winnerId, survivors: 1, sword: aNon.length >= 2, label: "SEMIFINAL 1" },
        { ids: [...bNon], win: finalistB, survivors: 1, sword: (bNon.length - 1) >= 2, label: "SEMIFINAL 2" },
        { ids: [winnerId, finalistB], win: winnerId, survivors: 2, sword: false, label: "FINAL" },
      ];
    } else {
      matches = [{ ids: candidates.map((c) => c.id), win: winnerId, survivors: 2, sword: nonWin.length >= 3, label: "" }];
    }
    matchesRef.current = matches;

    const startMatch = (idx) => {
      cmRef.current = idx;
      const m = matches[idx], c = m.ids.length, base = performance.now();
      m.ids.forEach((id, i) => {
        const f = find(id); if (!f) return;
        const a = (i / c) * TAU - Math.PI / 2;
        f.match = idx; f.alive = true; f.hp = 100; f.doomed = false; f.hitsTaken = 0; f.vcd = 0;
        f.killed = false; f.swordVictim = false; f.hasSword = false; f.gray = 0; f.rot = 0; f.vrot = 0;
        f.win = false; f.state = "brawl"; f.mode = "approach"; f.engageUntil = 0; f.target = null; f.cd = 0; f.hitFlash = 0;
        f.x = CX + hx * Math.cos(a) * rand(0.62, 0.9); f.y = CY + hy * Math.sin(a) * rand(0.62, 0.9);
        f.hx0 = f.x; f.hy0 = f.y; f.vx = 0; f.vy = 0; f.appear = base + i * 50;
      });
      sword.current = { active: false, bearer: null, victim: null, t0: 0, slashed: false };
      phase.current = "bell"; marks.current.bellStart = base;
    };

    const nnDist = (f, ref) => { let b = 1e9; for (const o of ref) if (o.id !== f.id) { const dd = Math.hypot(o.x - f.x, o.y - f.y); if (dd < b) b = dd; } return b; };

    const buildBeats = (m) => {
      const nonW = m.ids.filter((id) => id !== m.win);
      let dying;
      if (m.survivors === 1) dying = nonW.slice();
      else if (m.ids.length <= 2) dying = [];
      else { dying = nonW.slice(0, -1); }
      m.bearerId = dying.length ? dying[dying.length - 1] : null;
      const swIdx = (m.sword && dying.length >= 2) ? 1 : (m.sword && dying.length === 1 ? 0 : -1);
      const beats = []; let t = FIRST_KO_DOOM;
      for (let k = 0; k < dying.length; k++) { const isS = k === swIdx; beats.push({ t, sword: isS }); t += isS ? SWORD_MS + 700 : KO_SPACING; }
      marks.current.beats = beats; marks.current.beatIdx = 0; marks.current.dying = new Set(dying); marks.current.meleeStart = performance.now();
    };

    const startSword = (victimId) => {
      const m = matches[cmRef.current], bearer = find(m.bearerId), victim = find(victimId);
      if (!bearer || !victim || !bearer.alive || !victim.alive) { if (victim) victim.doomed = true; return; }
      const others = F.current.filter((f) => f.alive && f.match === cmRef.current && f.id !== bearer.id && f.id !== victim.id);
      const ax = others.length ? others.reduce((s, f) => s + f.x, 0) / others.length : CX;
      const ay = others.length ? others.reduce((s, f) => s + f.y, 0) / others.length : CY;
      const corner = CORNERS.reduce((a, c) => (Math.hypot(c[0] - ax, c[1] - ay) > Math.hypot(a[0] - ax, a[1] - ay) ? c : a));
      victim.stageX = corner[0]; victim.stageY = corner[1];
      const tx = CX - corner[0], ty = CY - corner[1], td = Math.hypot(tx, ty) || 1;
      bearer.stageX = corner[0] + (tx / td) * 360; bearer.stageY = corner[1] + (ty / td) * 300;
      sword.current = { active: true, bearer: bearer.id, victim: victim.id, t0: performance.now(), slashed: false };
      bearer.state = "sword"; victim.swordVictim = true;
    };

    const runBeat = (isSword) => {
      const cm = cmRef.current, m = matches[cm];
      const living = F.current.filter((f) => f.alive && f.match === cm);
      const pend = living.filter((f) => marks.current.dying.has(f.id) && !(isSword && f.id === m.bearerId));
      if (!pend.length) return;
      const victim = isSword
        ? pend.reduce((a, c) => nnDist(c, living) > nnDist(a, living) ? c : a)
        : pend.reduce((a, c) => nnDist(c, living) < nnDist(a, living) ? c : a);
      marks.current.dying.delete(victim.id);
      if (isSword) startSword(victim.id); else victim.doomed = true;
    };

    startMatch(0);

    let raf;
    const step = () => {
      const now = performance.now();
      const cm = cmRef.current, m = matches[cm], MW = m.win;
      const P = phase.current, SW = sword.current;
      const living = F.current.filter((f) => f.alive && f.match === cm);

      for (const f of F.current) {
        if (f.match !== cm) continue;
        if (!f.alive) { f.vy += 0.5; f.x += f.vx; f.y += f.vy; f.rot += f.vrot; f.gray = Math.min(1, f.gray + 0.05); continue; }
        if (now < f.appear) continue;
        if (P === "bell") { f.x = f.hx0; f.y = f.hy0 + Math.sin(now * 0.004 + f.bob) * 7; continue; }

        if (P === "melee") {
          if (f.hitFlash <= 0 && !f.doomed) f.hp = Math.min(100, f.hp + 0.1);
          if (SW.active && f.id !== SW.bearer && !f.swordVictim) { const vk = F.current.find((x) => x.id === SW.victim); if (vk) { const dx = f.x - vk.x, dy = f.y - vk.y, d = Math.hypot(dx, dy) || 1; if (d < 275) { const pp = ((275 - d) / 275) * 0.95; f.vx += (dx / d) * pp; f.vy += (dy / d) * pp; } } }

          if (f.state === "sword" && SW.active && SW.bearer === f.id) {
            const e = now - SW.t0; let tx = f.stageX, ty = f.stageY, acc = 0.6;
            if (e >= 1700) { const v = F.current.find((x) => x.id === SW.victim); if (v) { tx = v.x; ty = v.y; } acc = 2.4; }
            if (e >= 1000) f.hasSword = true;
            const dx = tx - f.x, dy = ty - f.y, d = Math.hypot(dx, dy) || 1;
            f.vx += (dx / d) * acc; f.vy += (dy / d) * acc;
          } else if (f.swordVictim && SW.active) {
            const dx = f.stageX - f.x, dy = f.stageY - f.y, d = Math.hypot(dx, dy) || 1;  // shoved to the corner, normal velocity (no phasing)
            f.vx += (dx / d) * 0.55; f.vy += (dy / d) * 0.55;
          } else {
            if (!f.target || !F.current.find((x) => x.id === f.target && x.alive && x.match === cm && !x.swordVictim && !(SW.active && x.id === SW.bearer))) {
              let near = null, best = 1e9;
              for (const o of living) if (o.id !== f.id && !o.swordVictim && !(SW.active && o.id === SW.bearer)) { const dd = Math.hypot(o.x - f.x, o.y - f.y); if (dd < best) { best = dd; near = o; } }
              f.target = near ? near.id : null;
            }
            const tgt = F.current.find((x) => x.id === f.target);
            if (f.mode === "recoil" && now < f.engageUntil && !f.doomed) {
              if (tgt) { const dx = f.x - tgt.x, dy = f.y - tgt.y, d = Math.hypot(dx, dy) || 1; f.vx += (dx / d) * 0.13; f.vy += (dy / d) * 0.13; }
            } else {
              f.mode = "approach";
              if (tgt) { const dx = tgt.x - f.x, dy = tgt.y - f.y, d = Math.hypot(dx, dy) || 1, spd = f.doomed ? 0.24 : 0.2; f.vx += (dx / d) * spd; f.vy += (dy / d) * spd; }
            }
          }
          if (f.vcd > 0) f.vcd--;
          if (f.doomed) f.hp = Math.max(0, 100 - f.hitsTaken * (100 / HITS_TO_KILL));
        } else if (P === "dance") {
          const winF = living.find((x) => x.id === MW), rUp = living.find((x) => x.id !== MW);
          if (winF && rUp) {
            const tt = (now - marks.current.dance) / 1000, lean = 1 - 0.28 * Math.max(0, Math.sin(tt * 2.0)), R = 175 * lean, ang = tt * 1.35;
            winF.stageX = CX + R * Math.cos(ang); winF.stageY = CY + R * 0.6 * Math.sin(ang);
            rUp.stageX = CX + R * Math.cos(ang + Math.PI); rUp.stageY = CY + R * 0.6 * Math.sin(ang + Math.PI);
            for (const g of [winF, rUp]) { g.vx += (g.stageX - g.x) * 0.02; g.vy += (g.stageY - g.y) * 0.02; }
          }
        } else if (P === "finish") {
          if (f.id === MW) { const r = living.find((x) => x.id !== MW); if (r) { const dx = r.x - f.x, dy = r.y - f.y, d = Math.hypot(dx, dy) || 1; f.vx += (dx / d) * 1.4; f.vy += (dy / d) * 1.4; } }
        } else if (P === "celebrate" && f.win) { f.x += (CX - f.x) * 0.12; f.y += (CY - f.y) * 0.12; f.vx = f.vy = 0; }

        const charging = (f.state === "sword" && SW.active && now - SW.t0 >= 1700);
        const sp = Math.hypot(f.vx, f.vy), max = P === "finish" || charging ? 13 : 4.2;
        if (sp > max) { f.vx = (f.vx / sp) * max; f.vy = (f.vy / sp) * max; }
        f.x += f.vx; f.y += f.vy; f.vx *= 0.9; f.vy *= 0.9;
        if (f.x < CX - hx) { f.x = CX - hx; f.vx *= -0.7; }
        if (f.x > CX + hx) { f.x = CX + hx; f.vx *= -0.7; }
        if (f.y < CY - hy) { f.y = CY - hy; f.vy *= -0.7; }
        if (f.y > CY + hy) { f.y = CY + hy; f.vy *= -0.7; }
        if (f.cd > 0) f.cd--; if (f.hitFlash > 0) f.hitFlash--;
      }

      // anti-overlap
      const MIN_SEP = PLATE_W * pScale * 0.6;
      for (let i = 0; i < living.length; i++) for (let j = i + 1; j < living.length; j++) {
        const a = living[i], b = living[j];
        let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy);
        if (d < MIN_SEP) {
          if (d < 0.01) { dx = rand(-1, 1); dy = rand(-1, 1); d = Math.hypot(dx, dy) || 1; }
          const nx = dx / d, ny = dy / d, corr = (MIN_SEP - d) / 2;
          a.x -= nx * corr; a.y -= ny * corr; b.x += nx * corr; b.y += ny * corr;
        }
      }

      // sword slash resolution
      if (SW.active && !SW.slashed) {
        const b = F.current.find((x) => x.id === SW.bearer), v = F.current.find((x) => x.id === SW.victim), e = now - SW.t0;
        const dist = b && v ? Math.hypot(v.x - b.x, v.y - b.y) : 1e9, tooLong = e > SWORD_MS + 3000;
        if (b && v && v.alive && e >= 1700 && (dist < 92 || tooLong)) {
          if (dist >= 92) { b.x = v.x - 46; b.y = v.y; }
          SW.slashed = true; v.killed = true; shake.current = 44;
          fx.current.push({ id: Math.random(), x: v.x, y: v.y, born: now, slash: true, color: C.highlight });
          fx.current.push({ id: Math.random(), x: v.x, y: v.y, born: now, shock: true, color: C.highlight });
          fx.current.push({ id: Math.random(), x: v.x, y: v.y, born: now, flash: true, color: C.highlight });
          fx.current.push({ id: Math.random(), x: v.x, y: v.y - 78, born: now, txt: "\u2694 SLICED!", big: true, color: C.highlight });
          for (let q = 0; q < 16; q++) fx.current.push({ id: Math.random(), x: v.x, y: v.y, born: now, shard: true, vx: rand(-14, 14), vy: rand(-16, 4), color: q % 2 ? v.color : C.highlight });
          setTimeout(() => { if (b) { b.hasSword = false; b.state = "brawl"; } sword.current.active = false; }, 450);
        }
      }

      // collisions → punches
      if (P === "melee" || P === "finish") {
        for (let i = 0; i < living.length; i++) for (let j = i + 1; j < living.length; j++) {
          const a = living[i], b = living[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
          if (d < 100 && a.cd === 0 && b.cd === 0) {
            const nx = dx / d, ny = dy / d, kb = P === "finish" ? 12 : 9;
            a.vx -= nx * kb; a.vy -= ny * kb; b.vx += nx * kb; b.vy += ny * kb;
            a.cd = b.cd = 18; a.hitFlash = b.hitFlash = 8;
            for (const v of [a, b]) {
              if (P === "melee" && v.doomed) { if (v.vcd === 0) { v.hitsTaken++; v.vcd = 34; } }
              else v.hp = Math.max(16, v.hp - rand(12, 20));
              if (P === "melee" && !v.doomed && Math.random() < 0.6) { v.mode = "recoil"; v.engageUntil = now + rand(520, 900); }
            }
            const lethal = P === "melee" && (a.doomed || b.doomed);
            shake.current = P === "finish" ? 22 : lethal ? 12 : 7;
            fx.current.push({ id: Math.random(), x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, born: now, txt: P === "finish" ? "K.O.!" : POWS[(Math.random() * POWS.length) | 0], big: P === "finish", color: P === "finish" ? C.highlight : (Math.random() > .5 ? a.color : b.color) });
            if (P === "finish") { const r = living.find((x) => x.id !== MW); if (r) r.killed = true; }
          }
        }
      }

      // deaths (scripted)
      for (const f of F.current) if (f.match === cm && f.alive && (f.killed || (f.doomed && f.hitsTaken >= HITS_TO_KILL))) {
        f.alive = false; f.hp = 0; f.vy = -6; f.vrot = rand(-14, 14); f.gray = 0; shake.current = Math.max(shake.current, 16);
        if (!f.killed) fx.current.push({ id: Math.random(), x: f.x, y: f.y, born: now, ko: true, color: f.color });
      }

      // ---- phase / match orchestration ----
      if (P === "bell" && now - marks.current.bellStart > BELL_MS) { phase.current = "melee"; buildBeats(m); }
      if (P === "melee") {
        while (marks.current.beatIdx < marks.current.beats.length && now - marks.current.meleeStart >= marks.current.beats[marks.current.beatIdx].t) {
          runBeat(marks.current.beats[marks.current.beatIdx].sword); marks.current.beatIdx++;
        }
        const alive2 = F.current.filter((f) => f.alive && f.match === cm);
        if (!SW.active && alive2.length <= m.survivors) {
          if (m.survivors === 1) { phase.current = "break"; marks.current.breakStart = now; }
          else { phase.current = "dance"; marks.current.dance = now; }
        }
      }
      if (P === "break" && now - marks.current.breakStart > BREAK_MS) { startMatch(cm + 1); }
      if (P === "dance" && now - marks.current.dance > DANCE_MS) { phase.current = "finish"; marks.current.finish = now; }
      if (P === "finish" && (F.current.filter((f) => f.alive && f.match === cm).length <= 1 || now - marks.current.finish > FINISH_MS + 300)) {
        if (!marks.current.celeb) {
          phase.current = "celebrate"; marks.current.celeb = now;
          const w = F.current.find((f) => f.id === MW); if (w) { w.alive = true; w.win = true; w.hp = 100; }
          for (let k = 0; k < 50; k++) fx.current.push({ id: Math.random(), x: CX, y: CY, born: now, confetti: true, vx: rand(-11, 11), vy: rand(-15, -4), color: [C.highlight, C.accent, APPLE, CREAM][k % 4] });
        }
      }
      if (P === "celebrate" && now - marks.current.celeb > 1600 * SP && !done.current) { done.current = true; onDone && onDone(); }

      fx.current = fx.current.filter((f) => now - f.born < (f.confetti ? 2400 : f.shard ? 950 : f.flash ? 280 : f.shock ? 580 : f.slash ? 700 : f.ko || f.big ? 950 : 550));
      for (const f of fx.current) if (f.confetti || f.shard) { f.vy += 0.4; f.x += f.vx; f.y += f.vy; }
      if (shake.current > 0) shake.current *= 0.85;

      force((k) => k + 1);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); };
  }, []);

  const now = performance.now();
  const cm = cmRef.current, P = phase.current, m = matchesRef.current[cm] || { label: "" };
  const celeb = marks.current.celeb || 0;
  const sk = shake.current, sx = (Math.random() - .5) * sk, sy = (Math.random() - .5) * sk;
  const stageBg = `radial-gradient(ellipse 72% 58% at 50% 46%, ${C.accent}26 0%, transparent 62%), radial-gradient(ellipse at center, ${C.bg} 0%, ${C.bgDeep} 82%)`;
  const rope = (inset) => ({ position: "absolute", left: CX - RING_HX + inset, top: CY - RING_HY + inset, width: (RING_HX - inset) * 2, height: (RING_HY - inset) * 2, border: `3px solid ${C.accent}`, opacity: 0.5 - inset * 0.008, borderRadius: 4 });
  const post = (px, py) => ({ position: "absolute", left: px - 12, top: py - 12, width: 24, height: 24, borderRadius: 6, background: C.highlight, boxShadow: `0 0 18px ${C.highlight}aa` });

  const mFighters = F.current.filter((f) => f.match === cm);
  const nL = Math.ceil(mFighters.length / 2);
  const rosterTop = CY - RING_HY + 6, rosterH = RING_HY * 2 - 12;
  const rosterPos = (i) => {
    const side = i < nL ? "L" : "R", idxOnSide = side === "L" ? i : i - nL, count = side === "L" ? nL : mFighters.length - nL;
    const step = rosterH / Math.max(1, count), y = rosterTop + step * idxOnSide + step / 2 - 20;
    return { x: side === "L" ? 8 : AREA_W - 116, y };
  };

  return (
    <div ref={wrapRef} style={{ width: "100%", height: AREA_H * fit }}>
      <div style={{ width: AREA_W, height: AREA_H, transformOrigin: "top left", transform: `scale(${fit})` }}>
        <div style={{ width: AREA_W, height: AREA_H, position: "relative", overflow: "hidden", borderRadius: 20, border: `2px solid ${C.accent}44`, background: stageBg, animation: "popStage 420ms cubic-bezier(.2,1.2,.3,1)" }}>
          {/* cold-path pre-warm: keeps the sword's heavy composite layers resident so the FIRST strike doesn't stutter */}
          <div aria-hidden style={{ position: "absolute", left: 0, top: 0, width: 2, height: 2, opacity: 0.02, overflow: "hidden", pointerEvents: "none" }}>
            <div style={{ width: 60, height: 6, borderRadius: 14, background: `linear-gradient(90deg, transparent, ${C.highlight}, #fff, ${C.highlight}, transparent)`, boxShadow: `0 0 70px ${C.highlight}`, willChange: "transform, opacity" }} />
            <div style={{ width: 20, height: 20, borderRadius: "50%", border: `7px solid ${C.highlight}`, willChange: "transform, opacity" }} />
            <div style={{ width: 30, height: 30, borderRadius: "50%", background: `radial-gradient(circle, ${C.highlight}dd, transparent 65%)`, willChange: "opacity" }} />
            <div style={{ fontSize: 40, filter: `drop-shadow(0 0 10px ${C.highlight})` }}>⚔️</div>
            <div style={{ width: 12, height: 18, background: C.highlight, borderRadius: 2 }} />
          </div>

          {/* roster */}
          {mFighters.map((f, i) => {
            const p = rosterPos(i), dead = !f.alive;
            return (
              <div key={"r" + f.id} style={{ position: "absolute", left: p.x, top: p.y, width: 108, opacity: dead ? 0.4 : 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 3 }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: f.color, flex: "none" }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: "#e8ecf5", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: dead ? "line-through" : "none" }}>{f.name}</span>
                </div>
                <div style={{ height: 9, background: "#00000066", borderRadius: 5, overflow: "hidden", border: "1px solid #ffffff18" }}>
                  <div style={{ width: `${Math.max(0, f.hp)}%`, height: "100%", background: dead ? "#555" : hpColor(f.hp), transition: "width 140ms cubic-bezier(0.23,1,0.32,1)" }} />
                </div>
              </div>
            );
          })}

          <div style={{ transform: `translate(${sx}px,${sy}px)` }}>
            <div style={{ position: "absolute", left: CX - RING_HX, top: CY - RING_HY, width: RING_HX * 2, height: RING_HY * 2, borderRadius: 8, background: `radial-gradient(ellipse 80% 70% at 50% 60%, ${C.accent}18, transparent 70%)`, boxShadow: "inset 0 0 60px #0008" }} />
            {[0, 10, 20].map((v) => <div key={v} style={rope(v)} />)}
            {[[CX - RING_HX, CY - RING_HY], [CX + RING_HX, CY - RING_HY], [CX - RING_HX, CY + RING_HY], [CX + RING_HX, CY + RING_HY]].map(([px, py], i) => <div key={i} style={post(px, py)} />)}
          </div>

          {/* match label / bell */}
          {(P === "bell" || P === "break") && m.label && (
            <div style={{ position: "absolute", top: 26, left: 0, right: 0, textAlign: "center", zIndex: 55, color: C.accent, fontWeight: 900, letterSpacing: 5, fontSize: 22 }}>
              {P === "break" ? "NEXT · " + (matchesRef.current[cm + 1] || {}).label : m.label}
            </div>
          )}
          {P === "bell" && (
            <div style={{ position: "absolute", left: CX, top: CY, transform: "translate(-50%,-50%)", textAlign: "center", zIndex: 50 }}>
              <div style={{ fontSize: 84, animation: "bellShake 180ms ease-in-out infinite" }}>🔔</div>
              <div style={{ fontWeight: 900, fontSize: 40, letterSpacing: 4, color: C.highlight, textShadow: `0 0 30px ${C.highlight}` }}>DING! DING! DING!</div>
            </div>
          )}

          <div style={{ transform: `translate(${sx}px,${sy}px)` }}>
            {mFighters.map((f) => {
              const entering = now < f.appear, armed = f.hasSword;
              const wt = f.win && celeb ? clamp((now - celeb) / 420, 0, 1) : 0;
              const bmp = f.win ? 1 + 0.4 * easeOutBack(wt) : armed ? 1.12 : 1;
              return (
                <div key={f.id} style={{ position: "absolute", left: f.x, top: f.y, transform: `translate(-50%,-50%) rotate(${f.rot}deg) scale(${bmp * pScale})`, filter: `grayscale(${f.gray}) brightness(${f.hitFlash > 0 ? 1.85 : 1})`, opacity: entering ? 0 : f.alive ? 1 : 1 - f.gray * 0.7, transition: "opacity 300ms", willChange: armed || f.win ? "transform, opacity" : undefined, zIndex: f.win || armed ? 40 : 10 }}>
                  <div style={{ position: "relative", width: PLATE_W, padding: "9px 6px", borderRadius: 12, textAlign: "center", fontWeight: 900, fontSize: 18, lineHeight: 1.05, color: "#0b0d16", background: f.color, boxShadow: f.win || armed ? `0 0 60px ${C.highlight}, 0 0 0 4px ${C.highlight}` : "0 6px 14px #0009", border: "2px solid #00000033" }}>
                    {f.name}
                    {armed && <div style={{ position: "absolute", top: -30, right: -18, fontSize: 40, transform: "rotate(20deg)", filter: `drop-shadow(0 0 10px ${C.highlight})`, animation: "swordIn 260ms cubic-bezier(.34,1.56,.64,1) both" }}>⚔️</div>}
                  </div>
                  {f.win && <div style={{ position: "absolute", top: -46, left: "50%", transform: "translateX(-50%)", fontSize: 40 }}>👑</div>}
                </div>
              );
            })}
          </div>

          {fx.current.map((f) => {
            if (f.confetti) return <div key={f.id} style={{ position: "absolute", left: f.x, top: f.y, width: 12, height: 18, background: f.color, borderRadius: 2, transform: `rotate(${f.x}deg)`, zIndex: 45 }} />;
            if (f.shard) return <div key={f.id} style={{ position: "absolute", left: f.x, top: f.y, width: 16, height: 16, background: f.color, borderRadius: 3, transform: `translate(-50%,-50%) rotate(${f.x}deg)`, zIndex: 47 }} />;
            if (f.flash) return <div key={f.id} style={{ position: "absolute", left: f.x, top: f.y, width: 520, height: 520, marginLeft: -260, marginTop: -260, borderRadius: "50%", background: `radial-gradient(circle, ${f.color}dd, transparent 65%)`, animation: "flashFade 280ms ease-out forwards", zIndex: 46 }} />;
            if (f.shock) return <div key={f.id} style={{ position: "absolute", left: f.x, top: f.y, width: 80, height: 80, marginLeft: -40, marginTop: -40, borderRadius: "50%", border: `7px solid ${f.color}`, animation: "shockRing 580ms cubic-bezier(0.23,1,0.32,1) forwards", zIndex: 46 }} />;
            if (f.slash) return <div key={f.id} style={{ position: "absolute", left: f.x, top: f.y, width: 500, height: 28, transform: "translate(-50%,-50%) rotate(-32deg)", background: `linear-gradient(90deg, transparent, ${f.color}, #fff, ${f.color}, transparent)`, borderRadius: 14, boxShadow: `0 0 70px ${f.color}`, animation: "slash 460ms ease-out", zIndex: 47 }} />;
            if (f.ko || f.big) return <div key={f.id} style={{ position: "absolute", left: f.x, top: f.y, transform: "translate(-50%,-50%) rotate(-10deg)", fontWeight: 900, fontSize: f.big ? 94 : 52, color: f.big ? f.color : "#fff", textShadow: `0 0 22px ${f.color}, 3px 3px 0 #000`, animation: "koPop 500ms ease-out", zIndex: 48 }}>{f.txt || "K.O."}</div>;
            return <div key={f.id} style={{ position: "absolute", left: f.x, top: f.y, transform: "translate(-50%,-50%)", fontWeight: 900, fontSize: 34, color: f.color, textShadow: "2px 2px 0 #000", animation: "powPop 450ms ease-out", zIndex: 25 }}>{f.txt}</div>;
          })}
        </div>
      </div>
      <style>{`@keyframes popStage{0%{transform:scale(.9);opacity:0}100%{transform:scale(1);opacity:1}}@keyframes bellShake{0%,100%{transform:rotate(-16deg)}50%{transform:rotate(16deg)}}@keyframes powPop{0%{transform:translate(-50%,-50%) scale(.3)}60%{transform:translate(-50%,-50%) scale(1.25)}100%{transform:translate(-50%,-50%) scale(1)}}@keyframes koPop{0%{transform:translate(-50%,-50%) rotate(-10deg) scale(.2)}70%{transform:translate(-50%,-50%) rotate(-10deg) scale(1.3)}100%{transform:translate(-50%,-50%) rotate(-10deg) scale(1)}}@keyframes slash{0%{transform:translate(-50%,-50%) rotate(-32deg) scaleX(0);opacity:0}40%{opacity:1}100%{transform:translate(-50%,-50%) rotate(-32deg) scaleX(1);opacity:0}}@keyframes swordIn{0%{transform:rotate(20deg) scale(.5);opacity:0}100%{transform:rotate(20deg) scale(1);opacity:1}}@keyframes shockRing{0%{transform:scale(.3);opacity:.9}100%{transform:scale(7);opacity:0}}@keyframes flashFade{0%{opacity:.6}100%{opacity:0}}@media (prefers-reduced-motion: reduce){*{animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important}}`}</style>
    </div>
  );
}
