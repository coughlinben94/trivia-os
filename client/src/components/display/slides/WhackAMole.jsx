import React, { useEffect, useRef, useState } from "react";
import { EASE_OUT, EASE_EXIT } from "../../../lib/easings.js";

/**
 * Trivia OS — "WHACK-A-MOLE" selection animation
 * Contract: { candidates, winnerId, theme, onDone }
 * Stage 1344x756. Winner predetermined upstream (fair, not randomized on screen).
 *
 * Real arcade rules, not a fixed bracket: up to 10 holes stay on the cabinet
 * the whole time, and every "round" a random handful of still-alive teams
 * (1-3 decoys + this round's actual target) pop up in random holes together.
 * The mallet only ever whacks the target; decoys duck back down safe. A
 * team can pop up early, often, and repeatedly and still be the winner —
 * there is no "safe by round 2" logic, it's just random until it's the last
 * name standing. Scales to ~30 teams by cycling the same hole bank; only
 * the winner's mole never gets whacked, and it gets the final solo pop for
 * the victory beat.
 */

const AREA_W = 1344, AREA_H = 756, CX = AREA_W / 2, CY = AREA_H / 2;
const HOLE_Y = 500;
const CREAM = "#f5f0e8", APPLE = "#e02020";
const PALETTE = ["#ff5d5d", "#5db0ff", "#7ee081", "#c98bff", "#ff9f43", "#4de3d0", "#ff6fb0", "#b0e04d", "#ffd24d", "#4d9fff", "#ff7ae0", "#7affb0"];
const HEAD_IMG = "/ben/IMG_1216-removebg-preview.png";
const MAX_HOLES = 10;

const cb = (arr) => `cubic-bezier(${arr[0]},${arr[1]},${arr[2]},${arr[3]})`;
const EASE_OUT_CSS = cb(EASE_OUT);
const EASE_EXIT_CSS = cb(EASE_EXIT);
const EASE_IN_CSS = "cubic-bezier(0.55,0,0.85,0.35)";
const EASE_BOUNCE_CSS = "cubic-bezier(0.34,1.56,0.64,1)";

/* Mallet swing poses (deg) + per-phase transition so the strike snaps
   while the wind-up telegraphs. Lean tilts the whole body into the swing. */
const REST = 10, WINDUP = -118, STRIKE = 80, RECOIL = 48;
const ARM_TRANS = {
  [WINDUP]: `transform 230ms ${EASE_BOUNCE_CSS}`,
  [STRIKE]: "transform 90ms cubic-bezier(0.5,0,0.9,0.4)",
  [RECOIL]: `transform 130ms ${EASE_OUT_CSS}`,
  [REST]: `transform 220ms ${EASE_OUT_CSS}`,
};
const ARM_LEAN = { [WINDUP]: -7, [STRIKE]: 9, [RECOIL]: 5, [REST]: 0 };

const rand = (a, b) => a + Math.random() * (b - a);
const randInt = (a, b) => Math.floor(rand(a, b + 1));
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [b[i], b[j]] = [b[j], b[i]]; } return b; };

function holeLayout(count) {
  const n = Math.max(count, 1);
  const spacing = Math.min(190, (AREA_W - 340) / Math.max(1, n - 1 || 1));
  const startX = CX - (spacing * (n - 1)) / 2;
  return Array.from({ length: n }, (_, i) => (n === 1 ? CX : startX + spacing * i));
}

export default function WhackAMole({ candidates, winnerId, theme, onDone }) {
  const C = theme.colors;
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const wrapRef = useRef(null);
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setFit(Math.min(el.clientWidth / AREA_W, el.clientHeight / AREA_H)));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const colorOf = useRef(Object.fromEntries(candidates.map((c, i) => [c.id, PALETTE[i % PALETTE.length]]))).current;
  const HOLE_COUNT = Math.min(MAX_HOLES, candidates.length);
  const holeX = holeLayout(HOLE_COUNT);

  const [moles, setMoles] = useState([]);
  const [charX, setCharX] = useState(-160);
  const [armAngle, setArmAngle] = useState(REST);
  const [banner, setBanner] = useState(null);
  const [fx, setFx] = useState([]);
  const [victory, setVictory] = useState(null);

  const T = useRef([]);
  const doneRef = useRef(false);
  const push = (ms, fn) => T.current.push(setTimeout(fn, ms));
  const uid = useRef(0);
  const nextId = () => `x${uid.current++}`;

  useEffect(() => {
    if (reducedMotion) {
      const t = setTimeout(() => onDone?.(), 1500);
      return () => clearTimeout(t);
    }

    const spawnStars = (x, y) => {
      const id = nextId();
      setFx((f) => [...f, { id, kind: "stars", x, y }]);
      push(500, () => setFx((f) => f.filter((o) => o.id !== id)));
    };
    const spawnText = (x, y, label) => {
      const id = nextId();
      setFx((f) => [...f, { id, kind: "text", x, y, label }]);
      push(600, () => setFx((f) => f.filter((o) => o.id !== id)));
    };

    const popMole = (id, up) => setMoles((list) => list.map((m) => (m.id === id ? { ...m, up } : m)));
    const whackMole = (id) => setMoles((list) => list.map((m) => (m.id === id ? { ...m, whacked: true } : m)));

    const whack = (target, cb2) => {
      setCharX(target.x + 18); // stand beside the hole: mallet head lands on the mole at STRIKE
      push(360, () => {
        setArmAngle(WINDUP);
        push(280, () => {
          setArmAngle(STRIKE);
          push(100, () => {
            whackMole(target.id);
            spawnStars(target.x, target.y - 75);
            spawnText(target.x, target.y - 120, pick(["BONK!", "WHACK!", "GOTCHA!", "SO LONG!"]));
            setArmAngle(RECOIL);
            push(120, () => {
              popMole(target.id, false);
              setArmAngle(REST);
              push(240, cb2);
            });
          });
        });
      });
    };

    let alive = [...candidates];
    const eliminationOrder = shuffle(candidates.filter((c) => c.id !== winnerId));

    const popRound = (targetId, cb2) => {
      const target = alive.find((c) => c.id === targetId);
      const decoyPool = alive.filter((c) => c.id !== targetId);
      const decoyCount = Math.min(randInt(1, 3), decoyPool.length);
      const decoys = shuffle(decoyPool).slice(0, decoyCount);
      const participants = shuffle([target, ...decoys]);
      const slots = shuffle([...Array(HOLE_COUNT).keys()]).slice(0, participants.length);

      const roundMoles = participants.map((c, i) => ({
        id: c.id, name: c.name, x: holeX[slots[i]], y: HOLE_Y, up: false, whacked: false,
      }));
      setMoles(roundMoles);
      setBanner(`${alive.length} team${alive.length === 1 ? "" : "s"} left`);
      push(900, () => setBanner(null));

      roundMoles.forEach((m, i) => push(i * 100, () => popMole(m.id, true)));

      push(roundMoles.length * 100 + 650, () => {
        const targetMole = roundMoles.find((m) => m.id === targetId);
        whack(targetMole, () => {
          roundMoles.filter((m) => m.id !== targetId).forEach((m) => popMole(m.id, false));
          alive = alive.filter((c) => c.id !== targetId);
          push(420, cb2);
        });
      });
    };

    const runVictory = (winnerCandidate) => {
      const winnerMole = { id: winnerCandidate.id, name: winnerCandidate.name, x: CX, y: HOLE_Y, up: false, whacked: false };
      setBanner("FINAL MOLE STANDING!");
      setMoles([winnerMole]);
      push(500, () => {
        popMole(winnerMole.id, true);
        setVictory({ id: winnerMole.id, name: winnerMole.name, x: CX, y: HOLE_Y });
        const id = nextId();
        setFx((f) => [...f, { id, kind: "confetti", x: CX, y: HOLE_Y }]);
        setBanner(null);
        push(1600, () => { if (!doneRef.current) { doneRef.current = true; onDone && onDone(); } });
      });
    };

    const runIndex = (i) => {
      if (i >= eliminationOrder.length) {
        const winnerCandidate = candidates.find((c) => c.id === winnerId);
        push(400, () => runVictory(winnerCandidate));
        return;
      }
      popRound(eliminationOrder[i].id, () => runIndex(i + 1));
    };

    push(700, () => runIndex(0));
    return () => T.current.forEach(clearTimeout);
  }, []);

  if (reducedMotion) {
    const winner = candidates.find((c) => c.id === winnerId);
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: C.bgDeep }}>
        <div style={{ padding: "28px 56px", borderRadius: 20, background: C.accent, fontWeight: 900, fontSize: 52, color: C.bgDeep, textAlign: "center" }}>
          {winner?.name ?? "Winner"}
        </div>
      </div>
    );
  }

  const cabW = Math.max((holeX[holeX.length - 1] ?? CX) - (holeX[0] ?? CX) + 260, 700);
  const cabX = CX - cabW / 2;
  const cabTop = HOLE_Y - 60;
  const bulbCount = Math.floor(cabW / 26);

  return (
    <div ref={wrapRef} style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      <div style={{ width: AREA_W, height: AREA_H, position: "absolute", top: "50%", left: "50%", transformOrigin: "center", transform: `translate(-50%, -50%) scale(${fit})` }}>
        <div style={{ width: AREA_W, height: AREA_H, position: "relative", overflow: "hidden", borderRadius: 20, border: `2px solid ${C.accent}44`, background: `radial-gradient(ellipse 72% 58% at 50% 40%, ${C.accent}18 0%, transparent 62%), radial-gradient(ellipse at center, ${C.bg} 0%, ${C.bgDeep} 82%)`, animation: "popStage 420ms " + EASE_BOUNCE_CSS }}>

          {banner && (
            <div style={{ position: "absolute", top: 26, left: 0, right: 0, textAlign: "center", zIndex: 60, color: C.accent, fontWeight: 900, letterSpacing: 5, fontSize: 22, animation: "fadeIn 220ms ease-out" }}>
              {banner}
            </div>
          )}

          {/* ground shadow + cabinet feet */}
          <div style={{ position: "absolute", left: cabX - 24, top: 664, width: cabW + 48, height: 34, borderRadius: "50%", background: "radial-gradient(ellipse, #000000aa, transparent 70%)", zIndex: 1 }} />
          <div style={{ position: "absolute", left: cabX + 18, top: 654, width: 26, height: 24, borderRadius: "0 0 6px 6px", background: "#1a1a22", zIndex: 1 }} />
          <div style={{ position: "absolute", left: cabX + cabW - 44, top: 654, width: 26, height: 24, borderRadius: "0 0 6px 6px", background: "#1a1a22", zIndex: 1 }} />

          {/* marquee support struts */}
          <div style={{ position: "absolute", left: cabX + 56, top: cabTop - 34, width: 12, height: 36, background: "linear-gradient(90deg,#6b4420,#3a2410)", zIndex: 2 }} />
          <div style={{ position: "absolute", left: cabX + cabW - 68, top: cabTop - 34, width: 12, height: 36, background: "linear-gradient(90deg,#6b4420,#3a2410)", zIndex: 2 }} />

          {/* marquee */}
          <div style={{ position: "absolute", left: cabX, top: cabTop - 88, width: cabW, height: 56, borderRadius: 14, background: "linear-gradient(180deg, #3a2410, #201205)", border: "4px solid #6b4420", boxShadow: "0 10px 24px #0009", zIndex: 3 }}>
            <div style={{ position: "absolute", inset: 6, borderRadius: 8, background: "linear-gradient(180deg,#241608,#160c03)", boxShadow: "inset 0 0 18px #000" }} />
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 900, fontSize: 24, letterSpacing: 5, color: C.highlight, textShadow: `0 0 14px ${C.highlight}` }}>WHACK-A-MOLE</div>
            {Array.from({ length: bulbCount }).map((_, i) => (
              <React.Fragment key={i}>
                <div style={{ position: "absolute", left: 10 + i * 26, top: 6, width: 8, height: 8, borderRadius: "50%", background: i % 2 ? "#ffe89a" : "#ff8a8a", animation: `bulbPulse ${900 + (i % 3) * 220}ms ease-in-out infinite`, animationDelay: `${(i % 5) * 90}ms` }} />
                <div style={{ position: "absolute", left: 10 + i * 26, top: 42, width: 8, height: 8, borderRadius: "50%", background: i % 2 ? "#ffe89a" : "#ff8a8a", animation: `bulbPulse ${900 + (i % 3) * 220}ms ease-in-out infinite`, animationDelay: `${(i % 5) * 90}ms` }} />
              </React.Fragment>
            ))}
          </div>

          {/* cabinet body */}
          <div style={{ position: "absolute", left: cabX, top: cabTop, width: cabW, height: 70, borderRadius: "18px 18px 0 0", background: "linear-gradient(180deg, #d94b3a, #a8291c)", boxShadow: "inset 0 10px 10px #ffffff1e, inset 0 -8px 14px #00000030", zIndex: 4 }} />
          <div style={{ position: "absolute", left: cabX, top: cabTop + 54, width: cabW, height: 10, background: "linear-gradient(180deg,#ffd76a,#b8862c)", boxShadow: "0 2px 4px #0006", zIndex: 4 }} />
          <div style={{ position: "absolute", left: cabX, top: cabTop + 60, width: cabW, height: 160, borderRadius: "0 0 16px 16px", background: "repeating-linear-gradient(135deg, #2a4fae 0 26px, #23439a 26px 52px)", boxShadow: "0 16px 30px #0009", zIndex: 2 }}>
            <div style={{ position: "absolute", left: cabW / 2 - 90, top: 100, width: 180, height: 28, borderRadius: 8, background: "#0e1c12", border: "3px solid #ffe89a", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: C.highlight }}>★ PRESS YOUR LUCK ★</div>
            {/* coin door */}
            <div style={{ position: "absolute", left: 28, top: 88, width: 52, height: 58, borderRadius: 8, background: "linear-gradient(180deg,#1a1a24,#0c0c14)", border: "2px solid #ffe89a44" }}>
              <div style={{ position: "absolute", left: 22, top: 8, width: 8, height: 18, borderRadius: 2, background: "#000", border: "1px solid #ffe89a33" }} />
              <div style={{ position: "absolute", left: 16, top: 36, width: 20, height: 12, borderRadius: 3, background: "#e05a4a" }} />
            </div>
            <div style={{ position: "absolute", right: 34, top: 96, fontSize: 30, color: "#ffe89a", textShadow: "0 0 10px #ffe89a88" }}>★</div>
          </div>
          {/* cabinet side rails */}
          <div style={{ position: "absolute", left: cabX - 14, top: cabTop - 92, width: 20, height: 756 - (cabTop - 92) - 92, borderRadius: 8, background: "linear-gradient(90deg,#4a2c12,#2a1808)", boxShadow: "0 10px 20px #0008", zIndex: 5 }} />
          <div style={{ position: "absolute", left: cabX + cabW - 6, top: cabTop - 92, width: 20, height: 756 - (cabTop - 92) - 92, borderRadius: 8, background: "linear-gradient(90deg,#4a2c12,#2a1808)", boxShadow: "0 10px 20px #0008", zIndex: 5 }} />

          {/* fixed hole bank — reused every round, not owned by any one team */}
          {holeX.map((x, i) => (
            <div key={"hole" + i} style={{ position: "absolute", left: x - 54, top: HOLE_Y - 12, width: 108, height: 34, borderRadius: "50%", background: "radial-gradient(ellipse at 50% 40%, #050a04, #241408)", boxShadow: "inset 0 7px 12px #000d, 0 2px 0 #ffffff14", zIndex: 6 }} />
          ))}

          {/* whichever teams happen to be popped up this round */}
          {moles.map((m) => (
            <div key={m.id} style={{ position: "absolute", left: m.x - 60, top: HOLE_Y - 150, width: 120, height: 156, overflow: "hidden", zIndex: 5 }}>
              <div style={{
                position: "absolute", left: 14, top: 50, width: 92, height: 100,
                transformOrigin: "50% 100%",
                transform: m.up
                  ? (m.whacked ? "translateY(26px) scaleY(0.35) scaleX(1.4)" : "translateY(0)")
                  : "translateY(120px)",
                transition: `transform ${m.whacked ? 90 : 300}ms ${m.whacked ? EASE_IN_CSS : EASE_BOUNCE_CSS}`,
                animation: m.up && !m.whacked ? "bob 1700ms ease-in-out infinite" : "none",
                filter: m.whacked ? "brightness(0.65)" : "none",
              }}>
                <div style={{ position: "absolute", left: 14, top: 0, width: 16, height: 20, borderRadius: "50%", background: colorOf[m.id] }} />
                <div style={{ position: "absolute", left: 62, top: 0, width: 16, height: 20, borderRadius: "50%", background: colorOf[m.id] }} />
                <div style={{ position: "absolute", left: 6, top: 12, width: 80, height: 88, borderRadius: "50% 50% 40% 40%", background: colorOf[m.id], boxShadow: "inset -8px -10px 14px #00000038, inset 6px 8px 10px #ffffff22" }} />
                <div style={{ position: "absolute", left: 26, top: 60, width: 40, height: 32, borderRadius: "50%", background: "#f5f0e855" }} />
                {m.whacked ? (
                  <>
                    <span style={{ position: "absolute", left: 23, top: 34, fontSize: 15, fontWeight: 900, color: "#1a1a1a", lineHeight: 1 }}>✕</span>
                    <span style={{ position: "absolute", left: 53, top: 34, fontSize: 15, fontWeight: 900, color: "#1a1a1a", lineHeight: 1 }}>✕</span>
                  </>
                ) : (
                  <>
                    <div style={{ position: "absolute", left: 26, top: 38, width: 12, height: 12, borderRadius: "50%", background: "#1a1a1a" }} />
                    <div style={{ position: "absolute", left: 54, top: 38, width: 12, height: 12, borderRadius: "50%", background: "#1a1a1a" }} />
                  </>
                )}
                <div style={{ position: "absolute", left: 40, top: 52, width: 12, height: 9, borderRadius: "50%", background: "#ff9db0" }} />
                <div style={{ position: "absolute", left: 37, top: 61, width: 8, height: 10, borderRadius: "0 0 3px 3px", background: "#fff", border: "1px solid #00000022" }} />
                <div style={{ position: "absolute", left: 47, top: 61, width: 8, height: 10, borderRadius: "0 0 3px 3px", background: "#fff", border: "1px solid #00000022" }} />
              </div>
              <div style={{ position: "absolute", left: -14, top: 128, width: 148, textAlign: "center", opacity: m.up ? 1 : 0, transition: "opacity 200ms ease" }}>
                <div style={{ display: "inline-block", maxWidth: 144, padding: "3px 10px", borderRadius: 6, background: "#140c04cc", border: "2px solid #ffe89a66", fontSize: 13, fontWeight: 800, color: CREAM, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{m.name}</div>
              </div>
            </div>
          ))}

          {/* whacker character (walks via transform, never `left`; body leans into the swing) */}
          <div style={{ position: "absolute", left: 0, top: 324, width: 150, height: 200, zIndex: 50, transform: `translate3d(${charX}px,0,0)`, transition: `transform 340ms ${EASE_OUT_CSS}`, willChange: "transform" }}>
            <div style={{ position: "absolute", inset: 0, transformOrigin: "50% 100%", transform: `rotate(${ARM_LEAN[armAngle] ?? 0}deg)`, transition: ARM_TRANS[armAngle] ?? `transform 200ms ${EASE_OUT_CSS}` }}>
              <div style={{ position: "absolute", left: 40, top: 150, width: 16, height: 44, borderRadius: 6, background: "#3a2a1c" }} />
              <div style={{ position: "absolute", left: 70, top: 150, width: 16, height: 44, borderRadius: 6, background: "#3a2a1c" }} />
              <div style={{ position: "absolute", left: 34, top: 186, width: 26, height: 10, borderRadius: "6px 6px 4px 4px", background: "#1c1410" }} />
              <div style={{ position: "absolute", left: 66, top: 186, width: 26, height: 10, borderRadius: "6px 6px 4px 4px", background: "#1c1410" }} />
              <div style={{ position: "absolute", left: 24, top: 78, width: 78, height: 82, borderRadius: "26px 26px 20px 20px", background: C.accent, border: `3px solid ${C.bgDeep}`, boxShadow: "inset -10px -10px 16px #00000026" }} />
              <div style={{ position: "absolute", left: 6, top: 92, width: 22, height: 44, borderRadius: 12, background: C.accent, border: `3px solid ${C.bgDeep}`, transform: "rotate(18deg)" }} />
              <div style={{ position: "absolute", left: 30, top: 18, width: 68, height: 68, borderRadius: "50%", overflow: "hidden", border: `4px solid ${C.accent}`, boxShadow: `0 0 16px ${C.highlight}88`, background: C.bgDeep }}>
                <img src={HEAD_IMG} alt="" style={{ position: "absolute", width: 212, left: -71, top: -16 }} />
              </div>
              <div style={{ position: "absolute", left: 88, top: 94, width: 16, height: 48, borderRadius: 8, background: C.accent, border: `2px solid ${C.bgDeep}`, transformOrigin: "50% 6px", transform: `rotate(${armAngle}deg)`, transition: ARM_TRANS[armAngle] ?? `transform 200ms ${EASE_OUT_CSS}`, zIndex: 55, willChange: "transform" }}>
                <div style={{ position: "absolute", left: -1, top: 34, width: 18, height: 16, borderRadius: "50%", background: C.accent, border: `2px solid ${C.bgDeep}` }} />
                <div style={{ position: "absolute", left: 3, top: 40, width: 10, height: 76, borderRadius: 5, background: "linear-gradient(90deg,#a06a34,#5a3a18)" }} />
                <div style={{ position: "absolute", left: -16, top: 108, width: 48, height: 30, borderRadius: 9, background: "linear-gradient(180deg,#e05a4a,#a8291c)", border: "2px solid #6b1a10", boxShadow: "inset 0 4px 0 #ffffff2e" }}>
                  <div style={{ position: "absolute", left: 6, top: 7, width: 8, height: 8, borderRadius: "50%", background: "#ffd76a" }} />
                  <div style={{ position: "absolute", right: 6, top: 7, width: 8, height: 8, borderRadius: "50%", background: "#ffd76a" }} />
                </div>
              </div>
            </div>
          </div>

          {/* fx */}
          {fx.map((o) => {
            if (o.kind === "text") return <div key={o.id} style={{ position: "absolute", left: o.x, top: o.y, transform: "translate(-50%,-50%) rotate(-6deg)", fontWeight: 900, fontSize: 26, color: "#fff", textShadow: "0 0 14px #ffb14d, 2px 2px 0 #000", zIndex: 55, animation: "koPop 500ms ease-out" }}>{o.label}</div>;
            if (o.kind === "stars") return Array.from({ length: 8 }).map((_, k) => (
              <span key={o.id + "_" + k} style={{ position: "absolute", left: o.x, top: o.y, fontSize: 16, zIndex: 46, animation: "star 480ms ease-out forwards", ["--sx"]: `${rand(-70, 70)}px`, ["--sy"]: `${rand(-70, 10)}px` }}>✦</span>
            ));
            if (o.kind === "confetti") return Array.from({ length: 64 }).map((_, k) => (
              <div key={o.id + "_" + k} style={{ position: "absolute", left: o.x, top: o.y - 90, width: 7 + (k % 3) * 3, height: 12 + (k % 4) * 4, borderRadius: 2, background: [C.highlight, C.accent, APPLE, CREAM][k % 4], animation: `conf 1800ms ease-out ${(k % 9) * 30}ms forwards`, ["--dx"]: `${rand(-380, 380)}px`, ["--dy"]: `${rand(-320, 40)}px`, ["--r"]: `${rand(-360, 360)}deg`, zIndex: 60 }} />
            ));
            return null;
          })}

          {/* victory */}
          {victory && (
            <>
              <div style={{ position: "absolute", left: victory.x - 110, top: HOLE_Y - 200, width: 220, height: 220, borderRadius: "50%", background: `radial-gradient(circle, ${C.highlight}55 0%, transparent 65%)`, zIndex: 4, animation: "winGlow 1200ms ease-in-out infinite" }} />
              <div style={{ position: "absolute", left: victory.x - 24, top: HOLE_Y - 148, zIndex: 20, animation: "popIn 320ms " + EASE_BOUNCE_CSS }}>
                <div style={{ fontSize: 42, animation: "bob 1700ms ease-in-out infinite" }}>👑</div>
              </div>
              <div style={{ position: "absolute", left: victory.x, top: HOLE_Y + 122, transform: "translate(-50%,0) scale(.9)", opacity: 0, padding: "14px 42px", borderRadius: 16, background: C.accent, color: C.bgDeep, fontWeight: 900, fontSize: 28, textAlign: "center", boxShadow: `0 0 60px ${C.highlight}`, animation: "cardIn 380ms " + EASE_BOUNCE_CSS + " 300ms forwards", zIndex: 80 }}>
                <div style={{ fontSize: 13, letterSpacing: 4, opacity: 0.75, marginBottom: 2 }}>★ WINNER ★</div>
                {victory.name}
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`
        @keyframes popStage{0%{transform:scale(.9);opacity:0}100%{transform:scale(1);opacity:1}}
        @keyframes fadeIn{0%{opacity:0}100%{opacity:1}}
        @keyframes popIn{0%{transform:scale(.4);opacity:0}100%{transform:scale(1);opacity:1}}
        @keyframes cardIn{0%{transform:translate(-50%,0) scale(.9);opacity:0}100%{transform:translate(-50%,0) scale(1);opacity:1}}
        @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-10px)}}
        @keyframes bulbPulse{0%,100%{opacity:.35}50%{opacity:1}}
        @keyframes koPop{0%{transform:translate(-50%,-50%) rotate(-6deg) scale(.3)}70%{transform:translate(-50%,-50%) rotate(-6deg) scale(1.25)}100%{transform:translate(-50%,-50%) rotate(-6deg) scale(1)}}
        @keyframes star{0%{transform:translate(-50%,-50%) scale(.3) rotate(0);opacity:1}100%{transform:translate(calc(-50% + var(--sx)),calc(-50% + var(--sy))) scale(1) rotate(180deg);opacity:0}}
        @keyframes conf{0%{transform:translate(-50%,-50%) rotate(0);opacity:1}100%{transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy) + 380px)) rotate(var(--r));opacity:0}}
        @keyframes winGlow{0%,100%{transform:scale(.85);opacity:.5}50%{transform:scale(1.12);opacity:.95}}
        @media (prefers-reduced-motion: reduce){*{animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important}}
      `}</style>
    </div>
  );
}
