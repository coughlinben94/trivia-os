import React, { useEffect, useRef, useState } from "react";
import { EASE_OUT, EASE_DROP, EASE_EXIT } from "../../../lib/easings.js";

/**
 * Trivia OS — "BATTLESHIP DUEL" selection animation
 * Contract: { candidates, winnerId, theme, onDone }
 * Stage 1344x756. Winner predetermined upstream (fair, not randomized on screen).
 *
 * Scales to up to ~30 teams via a wave/funnel structure, max 8 ships per screen:
 *   N <= 4   -> no elimination waves, straight to the finale with all N ships.
 *   N 5-8    -> one wave narrows the fleet down to 4 survivors, then finale.
 *   N 9-30   -> exactly 4 chunks (each <=8, guaranteed since ceil(30/4)=8), each
 *               chunk's wave sinks down to 1 survivor (winner's chunk always
 *               spares the winner) -> 4 survivors -> finale.
 * Finale: battleship keeps sniping the last 3-4 ships down to 1, pacing slows
 * and explosions escalate with each kill — a spectacle close, not a duel mode.
 *
 * Shot texture: ~25% of shots miss (splash, ship flinches, re-fire), ~10% clip
 * a seagull mid-flight instead (comedic aside, wasted shot, re-fire). Neither
 * ever happens on the true final kill of the finale — that one always lands
 * clean.
 */

const AREA_W = 1344, AREA_H = 756, CX = AREA_W / 2, CY = AREA_H / 2;
const WATER_Y = 470, SHIP_ROW_Y = 430;
const SHIP_X = 165, SHIP_Y = 600; // battleship position
const CREAM = "#f5f0e8", APPLE = "#e02020";
const PALETTE = ["#ff5d5d", "#5db0ff", "#7ee081", "#c98bff", "#ff9f43", "#4de3d0", "#ff6fb0", "#b0e04d", "#ffd24d", "#4d9fff", "#ff7ae0", "#7affb0"];

const cb = (arr) => `cubic-bezier(${arr[0]},${arr[1]},${arr[2]},${arr[3]})`;
const EASE_OUT_CSS = cb(EASE_OUT);
const EASE_DROP_CSS = cb(EASE_DROP);
const EASE_EXIT_CSS = cb(EASE_EXIT);

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [b[i], b[j]] = [b[j], b[i]]; } return b; };

function splitEven(arr, k) {
  const out = Array.from({ length: k }, () => []);
  arr.forEach((item, i) => out[i % k].push(item));
  return out.filter((c) => c.length);
}

/** Build the sequence of waves. Each wave: { ships, keepIds, finale } */
function buildPlan(candidates, winnerId) {
  const N = candidates.length;
  const pool = shuffle(candidates);
  const waves = [];
  let finalPool;

  if (N > 8) {
    const chunks = splitEven(pool, 4);
    const survivors = [];
    chunks.forEach((chunk) => {
      const keepId = chunk.some((c) => c.id === winnerId) ? winnerId : pick(chunk).id;
      waves.push({ ships: chunk, keepIds: [keepId] });
      survivors.push(chunk.find((c) => c.id === keepId));
    });
    finalPool = survivors;
  } else if (N > 4) {
    const rest = shuffle(pool.filter((c) => c.id !== winnerId));
    const keep = [pool.find((c) => c.id === winnerId), ...rest.slice(0, 3)];
    waves.push({ ships: pool, keepIds: keep.map((c) => c.id) });
    finalPool = keep;
  } else {
    finalPool = pool;
  }

  waves.push({ ships: finalPool, keepIds: [winnerId], finale: true });
  return waves;
}

function layoutRow(ships) {
  const n = ships.length;
  const spacing = Math.min(170, (AREA_W - 420) / Math.max(1, n - 1 || 1));
  const startX = CX + 70 - (spacing * (n - 1)) / 2;
  return ships.map((s, i) => ({ ...s, x: n === 1 ? CX + 120 : startX + spacing * i, y: SHIP_ROW_Y + (i % 2 ? 14 : -10) }));
}

export default function BattleshipDuel({ candidates, winnerId, theme, onDone }) {
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

  const [ships, setShips] = useState([]);
  const [shots, setShots] = useState([]);
  const [fx, setFx] = useState([]);
  const [turret, setTurret] = useState({ angle: -20, recoil: false });
  const [banner, setBanner] = useState(null);
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

    const plan = buildPlan(candidates, winnerId);
    const totalWaves = plan.length - 1; // excluding finale, for the "SQUADRON X OF Y" label

    const angleTo = (x, y) => (Math.atan2(y - SHIP_Y, x - SHIP_X) * 180) / Math.PI;

    const spawnExplosion = (x, y, color, count, big) => {
      const id = nextId();
      setFx((f) => [...f, { id, kind: "boom", x, y, color, count, big }]);
      push(big ? 1000 : 650, () => setFx((f) => f.filter((o) => o.id !== id)));
    };
    const spawnSplash = (x, y) => {
      const id = nextId();
      setFx((f) => [...f, { id, kind: "splash", x, y }]);
      push(500, () => setFx((f) => f.filter((o) => o.id !== id)));
    };
    const spawnBird = (x1, y1, x2, y2, dur) => {
      const id = nextId();
      setFx((f) => [...f, { id, kind: "bird", x: x1, y: y1, tx: x2, ty: y2, dur }]);
      return id;
    };
    const removeFx = (id) => setFx((f) => f.filter((o) => o.id !== id));

    const fireShot = (targetX, targetY, dur, cb2) => {
      setTurret({ angle: angleTo(targetX, targetY), recoil: true });
      push(90, () => setTurret((t) => ({ ...t, recoil: false })));
      const id = nextId();
      const x1 = SHIP_X + 44, y1 = SHIP_Y - 60;
      setShots((s) => [...s, { id, x1, y1, x2: targetX, y2: targetY, dur }]);
      push(dur, () => { setShots((s) => s.filter((o) => o.id !== id)); cb2 && cb2(); });
    };

    const rollShotType = (allowMissAndBird) => {
      if (!allowMissAndBird) return "hit";
      const r = Math.random();
      if (r < 0.1) return "bird";
      if (r < 0.35) return "miss";
      return "hit";
    };

    const sinkShip = (shipId, cb2) => {
      setShips((list) => list.map((s) => (s.id === shipId ? { ...s, sinking: true } : s)));
      push(760, () => { setShips((list) => list.filter((s) => s.id !== shipId)); cb2 && cb2(); });
    };

    const flinchShip = (shipId) => {
      setShips((list) => list.map((s) => (s.id === shipId ? { ...s, flinch: (s.flinch || 0) + 1 } : s)));
    };

    const resolveTarget = (target, allowMissAndBird, spectacle, cb2) => {
      const roll = rollShotType(allowMissAndBird);
      const dur = 520;

      if (roll === "miss") {
        fireShot(target.x + rand(-46, 46), target.y + rand(20, 46), dur, () => {
          spawnSplash(target.x, target.y + 40);
          flinchShip(target.id);
          push(360, () => resolveTarget(target, false, spectacle, cb2));
        });
        return;
      }
      if (roll === "bird") {
        const bx = CX + rand(-260, 260), by = 140;
        fireShot(bx, by, dur, () => {
          const bid = spawnBird(bx - 200, by - 40, bx + 200, by + 20, 900);
          push(430, () => {
            spawnExplosion(bx, by, "#fff8e0", 10, false);
            removeFx(bid);
            const squawk = nextId();
            setFx((f) => [...f, { id: squawk, kind: "text", x: bx, y: by - 50, label: "SQUAWK!" }]);
            push(650, () => removeFx(squawk));
          });
          push(900, () => resolveTarget(target, false, spectacle, cb2));
        });
        return;
      }

      // clean hit
      fireShot(target.x, target.y, dur, () => {
        spawnExplosion(target.x, target.y, colorOf[target.id], spectacle.particles, spectacle.big);
        if (spectacle.big) push(0, () => { document.getElementById("bship-stage-root")?.classList.add("shake"); push(spectacle.shakeMs, () => document.getElementById("bship-stage-root")?.classList.remove("shake")); });
        const boom = nextId();
        setFx((f) => [...f, { id: boom, kind: "text", x: target.x, y: target.y - 60, label: pick(["BOOM!", "SHE'S HIT!", "DIRECT HIT!", "TAKING ON WATER!"]) }]);
        push(600, () => removeFx(boom));
        sinkShip(target.id, () => push(spectacle.holdMs, cb2));
      });
    };

    const runWave = (wave, waveIndex, waveDone) => {
      const laid = layoutRow(wave.ships.map((c) => ({ id: c.id, name: c.name })));
      setShips(laid.map((s) => ({ ...s, sinking: false, flinch: 0 })));
      setVictory(null);

      const label = wave.finale ? "FINAL STANDOFF" : `SQUADRON ${waveIndex + 1} OF ${totalWaves}`;
      setBanner(label);
      push(1400, () => setBanner(null));

      const targets = shuffle(laid.filter((s) => !wave.keepIds.includes(s.id)));

      const runIndex = (i) => {
        if (i >= targets.length) { waveDone(); return; }
        const isFinaleLastKill = wave.finale && i === targets.length - 1;
        const spectacle = wave.finale
          ? { particles: 16 + i * 6, big: i >= 1, shakeMs: 260 + i * 80, holdMs: 500 + i * 220 }
          : { particles: 12, big: false, shakeMs: 0, holdMs: 420 };
        const target = laid.find((s) => s.id === targets[i].id) || targets[i];
        resolveTarget(target, !isFinaleLastKill, spectacle, () => runIndex(i + 1));
      };
      push(650, () => runIndex(0));
    };

    const runVictory = (winnerShip) => {
      setVictory({ id: winnerShip.id, name: winnerShip.name, x: winnerShip.x, y: winnerShip.y });
      const id = nextId();
      setFx((f) => [...f, { id, kind: "confetti", x: winnerShip.x, y: winnerShip.y }]);
      push(1600, () => { if (!doneRef.current) { doneRef.current = true; onDone && onDone(); } });
    };

    const runPlan = (idx) => {
      const wave = plan[idx];
      if (wave.finale) {
        runWave(wave, idx, () => {
          const winnerCandidate = candidates.find((c) => c.id === winnerId);
          const laidWinner = layoutRow([{ id: winnerCandidate.id, name: winnerCandidate.name }]);
          push(500, () => runVictory({ ...winnerCandidate, x: laidWinner[0].x, y: laidWinner[0].y }));
        });
      } else {
        runWave(wave, idx, () => push(700, () => runPlan(idx + 1)));
      }
    };

    push(500, () => runPlan(0));
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

  const seaBg = `linear-gradient(180deg, ${C.bgDeep} 0%, #0e2233 46%, #103a52 47%, #0a2638 100%)`;

  return (
    <div ref={wrapRef} style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      <div style={{ width: AREA_W, height: AREA_H, position: "absolute", top: "50%", left: "50%", transformOrigin: "center", transform: `translate(-50%, -50%) scale(${fit})` }}>
        <div id="bship-stage-root" style={{ width: AREA_W, height: AREA_H, position: "relative", overflow: "hidden", borderRadius: 20, border: `2px solid ${C.accent}44`, background: seaBg, animation: "popStage 420ms " + cb([0.34, 1.56, 0.64, 1]) }}>
          <div style={{ position: "absolute", left: 0, top: WATER_Y, width: "100%", height: 3, background: `${C.accent}33` }} />
          <div style={{ position: "absolute", left: 0, top: WATER_Y, width: "100%", height: AREA_H - WATER_Y, background: "linear-gradient(180deg, #0d3550dd, #06212fee)" }} />

          {banner && (
            <div style={{ position: "absolute", top: 26, left: 0, right: 0, textAlign: "center", zIndex: 60, color: C.accent, fontWeight: 900, letterSpacing: 5, fontSize: 22, animation: "fadeIn 220ms ease-out" }}>
              {banner}
            </div>
          )}

          {/* battleship */}
          <div style={{ position: "absolute", left: SHIP_X - 90, top: SHIP_Y - 34, width: 200, zIndex: 20 }}>
            <div style={{ position: "relative", width: 200, height: 60 }}>
              <div style={{ position: "absolute", left: 10, top: 22, width: 180, height: 30, borderRadius: "6px 6px 16px 4px", background: "linear-gradient(#5a6b73,#33424a)", boxShadow: "0 8px 16px #0009" }} />
              <div style={{ position: "absolute", left: 60, top: 2, width: 60, height: 26, borderRadius: 4, background: "linear-gradient(#7c8b93,#4a5860)" }} />
              <div style={{ position: "absolute", left: 78, top: -14, width: 24, height: 18, borderRadius: 3, background: "#333", transformOrigin: "50% 100%", transform: `rotate(${turret.angle + 90}deg) translateX(${turret.recoil ? -4 : 0}px)`, transition: `transform ${turret.recoil ? 70 : 220}ms ${EASE_OUT_CSS}` }} />
            </div>
          </div>

          {/* enemy fleet */}
          {ships.map((s) => (
            <div key={s.id} style={{
              position: "absolute", left: s.x - 60, top: s.y - 24, width: 120,
              transform: s.sinking
                ? `translateY(150px) rotate(${s.flinch % 2 ? 24 : -20}deg)`
                : `translateY(0) rotate(0deg) scale(${s.flinch ? 1.06 : 1})`,
              opacity: s.sinking ? 0 : 1,
              transition: s.sinking ? `transform 750ms ${EASE_DROP_CSS}, opacity 700ms ${EASE_EXIT_CSS}` : `transform 160ms ${EASE_OUT_CSS}`,
              animation: "bob 2600ms ease-in-out infinite",
              zIndex: 15,
            }}>
              <div style={{ position: "relative", width: 120, height: 46 }}>
                <div style={{ position: "absolute", left: 4, top: 16, width: 112, height: 22, borderRadius: "4px 4px 14px 4px", background: colorOf[s.id] }} />
                <div style={{ position: "absolute", left: 40, top: 0, width: 40, height: 18, borderRadius: 3, background: "#ffffffcc" }} />
              </div>
              <div style={{ marginTop: 4, textAlign: "center", fontSize: 12, fontWeight: 800, color: CREAM, textShadow: "0 1px 3px #000", whiteSpace: "nowrap" }}>{s.name}</div>
            </div>
          ))}

          {/* shells */}
          {shots.map((sh) => (
            <div key={sh.id} style={{
              position: "absolute", left: sh.x1, top: sh.y1, width: 10, height: 10, borderRadius: "50%",
              background: "#ffe89a", boxShadow: "0 0 10px #ffe89a", zIndex: 40,
              transform: "translate(0,0)",
              transition: `transform ${sh.dur}ms ${EASE_OUT_CSS}`,
              ["--tx"]: `${sh.x2 - sh.x1}px`, ["--ty"]: `${sh.y2 - sh.y1}px`,
              animation: `shellFly ${sh.dur}ms ${EASE_OUT_CSS} forwards`,
            }} />
          ))}

          {/* fx layer */}
          {fx.map((o) => {
            if (o.kind === "boom") return (
              <div key={o.id} style={{ position: "absolute", left: o.x, top: o.y, zIndex: 45 }}>
                <div style={{ position: "absolute", left: -o.count * 3, top: -o.count * 3, width: o.count * 6, height: o.count * 6, borderRadius: "50%", background: `radial-gradient(circle, #fff, ${o.color} 45%, transparent 72%)`, animation: `boom ${o.big ? 900 : 600}ms ease-out forwards` }} />
              </div>
            );
            if (o.kind === "splash") return <div key={o.id} style={{ position: "absolute", left: o.x - 20, top: o.y - 10, width: 40, height: 20, borderRadius: "50%", background: "#bfe6ff88", animation: "splashFade 480ms ease-out forwards", zIndex: 44 }} />;
            if (o.kind === "bird") return <span key={o.id} style={{ position: "absolute", left: o.x, top: o.y, fontSize: 26, zIndex: 46, transform: "translate(0,0)", transition: `transform ${o.dur}ms linear`, ["--btx"]: `${o.tx - o.x}px`, ["--bty"]: `${o.ty - o.y}px`, animation: `birdFly ${o.dur}ms linear forwards` }}>🕊️</span>;
            if (o.kind === "text") return <div key={o.id} style={{ position: "absolute", left: o.x, top: o.y, transform: "translate(-50%,-50%) rotate(-6deg)", fontWeight: 900, fontSize: 30, color: "#fff", textShadow: "0 0 18px #ffb14d, 2px 2px 0 #000", animation: "koPop 500ms ease-out", zIndex: 50 }}>{o.label}</div>;
            if (o.kind === "confetti") return Array.from({ length: 50 }).map((_, k) => (
              <div key={o.id + "_" + k} style={{ position: "absolute", left: o.x, top: o.y, width: 11, height: 16, borderRadius: 2, background: [C.highlight, C.accent, APPLE, CREAM][k % 4], animation: `conf 1800ms ease-out ${(k % 9) * 30}ms forwards`, ["--dx"]: `${rand(-360, 360)}px`, ["--dy"]: `${rand(-300, 40)}px`, ["--r"]: `${rand(-360, 360)}deg`, zIndex: 55 }} />
            ));
            return null;
          })}

          {/* victory */}
          {victory && (
            <>
              <div style={{ position: "absolute", left: victory.x - 130, top: 0, width: 260, height: victory.y, background: `linear-gradient(180deg, ${C.highlight}33, transparent)`, clipPath: "polygon(46% 0, 54% 0, 100% 100%, 0% 100%)", animation: "fadeIn 500ms ease-out", zIndex: 12 }} />
              <div style={{ position: "absolute", left: victory.x, top: victory.y - 70, transform: "translateX(-50%) scale(.9)", opacity: 0, fontWeight: 900, fontSize: 22, letterSpacing: 3, color: C.highlight, textShadow: `0 0 20px ${C.highlight}`, animation: "popIn 320ms ease-out 200ms forwards", zIndex: 52 }}>LAST SHIP STANDING!</div>
              <div style={{ position: "absolute", left: victory.x, top: victory.y + 60, transform: "translate(-50%,0) scale(.9)", opacity: 0, padding: "16px 38px", borderRadius: 16, background: C.accent, color: C.bgDeep, fontWeight: 900, fontSize: 28, boxShadow: `0 0 60px ${C.highlight}`, animation: "cardIn 380ms " + EASE_OUT_CSS + " 500ms forwards", zIndex: 80 }}>
                {victory.name}
              </div>
            </>
          )}
        </div>
      </div>
      <style>{`
        @keyframes popStage{0%{transform:scale(.9);opacity:0}100%{transform:scale(1);opacity:1}}
        @keyframes fadeIn{0%{opacity:0}100%{opacity:1}}
        @keyframes popIn{0%{transform:translateX(-50%) scale(.9);opacity:0}100%{transform:translateX(-50%) scale(1);opacity:1}}
        @keyframes cardIn{0%{transform:translate(-50%,0) scale(.9);opacity:0}100%{transform:translate(-50%,0) scale(1);opacity:1}}
        @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes boom{0%{transform:scale(.2);opacity:1}100%{transform:scale(1.4);opacity:0}}
        @keyframes splashFade{0%{transform:scale(.4);opacity:.9}100%{transform:scale(1.6);opacity:0}}
        @keyframes koPop{0%{transform:translate(-50%,-50%) rotate(-6deg) scale(.3)}70%{transform:translate(-50%,-50%) rotate(-6deg) scale(1.25)}100%{transform:translate(-50%,-50%) rotate(-6deg) scale(1)}}
        @keyframes shellFly{100%{transform:translate(var(--tx),var(--ty))}}
        @keyframes birdFly{100%{transform:translate(var(--btx),var(--bty))}}
        @keyframes conf{0%{transform:translate(-50%,-50%) rotate(0);opacity:1}100%{transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy) + 380px)) rotate(var(--r));opacity:0}}
        #bship-stage-root.shake{animation:screenShake 260ms ease-in-out}
        @keyframes screenShake{0%,100%{transform:translate(0,0)}25%{transform:translate(-6px,3px)}50%{transform:translate(6px,-3px)}75%{transform:translate(-4px,2px)}}
        @media (prefers-reduced-motion: reduce){*{animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important}}
      `}</style>
    </div>
  );
}
