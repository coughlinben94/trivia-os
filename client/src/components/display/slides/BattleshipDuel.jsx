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
const HEAD_IMG = "/ben/IMG_1216-removebg-preview.png"; // same asset + crop as WhackAMole
const SHIP_OFF_X = -360; // entrance start offset — ship fully off-screen left

const cb = (arr) => `cubic-bezier(${arr[0]},${arr[1]},${arr[2]},${arr[3]})`;
const EASE_OUT_CSS = cb(EASE_OUT);
const EASE_DROP_CSS = cb(EASE_DROP);
const EASE_EXIT_CSS = cb(EASE_EXIT);

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [b[i], b[j]] = [b[j], b[i]]; } return b; };

/** Lighten (amt > 0) or darken (amt < 0) a #rrggbb hex. */
const tint = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (c) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))));
  return `#${(((ch(n >> 16) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)) >>> 0).toString(16).padStart(6, "0")}`;
};

// Deterministic scatter tables — stable across re-renders (fx layers re-render every state change).
const SPARKS = Array.from({ length: 16 }, (_, k) => ({ a: k * 2.399 + 0.7, r: 0.55 + ((k * 37) % 45) / 100 }));
const DROPS = [-32, -18, -6, 8, 22, 34];
const STARS = Array.from({ length: 16 }, (_, k) => ({ x: 30 + ((k * 173) % 1284), y: 16 + ((k * 97) % 300), tw: k % 3 === 0, d: (k % 5) * 0.9 }));

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

/** Enemy destroyer sprite — layered SVG, hull in the team color. */
function EnemyShip({ id, color }) {
  const hullId = `bshull-${id}`, cabId = `bscab-${id}`;
  return (
    <svg width="120" height="64" viewBox="0 0 120 64" style={{ display: "block", transform: "scaleX(-1)", filter: "drop-shadow(0 7px 8px rgba(0,0,0,0.55))" }}>
      <defs>
        <linearGradient id={hullId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tint(color, 0.38)} />
          <stop offset="0.55" stopColor={color} />
          <stop offset="1" stopColor={tint(color, -0.5)} />
        </linearGradient>
        <linearGradient id={cabId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f3f6f8" />
          <stop offset="1" stopColor="#a9b5bf" />
        </linearGradient>
      </defs>
      {/* stern mast + pennant */}
      <line x1="16" y1="10" x2="16" y2="32" stroke={tint(color, -0.45)} strokeWidth="2.4" />
      <path d="M17 10 L36 14.5 L17 19 Z" fill={tint(color, 0.3)} />
      {/* smokestack */}
      <rect x="66" y="12" width="10" height="20" rx="2" fill="#2c343b" />
      <rect x="66" y="15" width="10" height="3.4" fill={color} />
      {/* superstructure + portholes */}
      <rect x="40" y="18" width="38" height="17" rx="3" fill={`url(#${cabId})`} stroke="#00000022" />
      <circle cx="49" cy="26.5" r="2.6" fill="#1c2b36" />
      <circle cx="59" cy="26.5" r="2.6" fill="#1c2b36" />
      <circle cx="69" cy="26.5" r="2.6" fill="#1c2b36" />
      {/* bow gun */}
      <rect x="86" y="28" width="12" height="6.5" rx="2" fill={tint(color, -0.28)} />
      <rect x="97" y="30" width="11" height="2.6" rx="1.3" fill="#25303a" />
      {/* hull, bow to the right */}
      <path d="M7 35 L103 35 L117 41 L106 54 Q102 60 93 60 L23 60 Q13 60 9.5 51 Z" fill={`url(#${hullId})`} />
      <path d="M7 35 L103 35 L117 41" fill="none" stroke="#ffffff55" strokeWidth="1.6" />
      <path d="M9.5 51 L106.5 51 L104.5 54 Q102 60 93 60 L23 60 Q13 60 9.5 51 Z" fill="#00000042" />
      {[30, 47, 64, 81].map((x) => <circle key={x} cx={x} cy="43.5" r="2.3" fill="#0a1a26aa" stroke="#ffffff2e" strokeWidth="0.8" />)}
    </svg>
  );
}

/** The player battleship — steel hull, tower, mast; the main gun is a separate rotating div overlay. */
function Flagship({ accent }) {
  return (
    <svg width="240" height="120" viewBox="0 0 240 120" style={{ display: "block", filter: "drop-shadow(0 10px 12px rgba(0,0,0,0.6))" }}>
      <defs>
        <linearGradient id="bsfs-hull" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#7d8c96" />
          <stop offset="0.5" stopColor="#48555e" />
          <stop offset="1" stopColor="#232e35" />
        </linearGradient>
        <linearGradient id="bsfs-tower" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#93a2ac" />
          <stop offset="1" stopColor="#4c5a63" />
        </linearGradient>
        <linearGradient id="bsfs-bridge" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#aab7c0" />
          <stop offset="1" stopColor="#68767f" />
        </linearGradient>
      </defs>
      {/* aft mast + radar */}
      <line x1="62" y1="56" x2="62" y2="14" stroke="#28323a" strokeWidth="3" />
      <line x1="50" y1="24" x2="74" y2="24" stroke="#28323a" strokeWidth="2.4" />
      <ellipse cx="62" cy="12" rx="8" ry="3.2" fill="none" stroke="#38444d" strokeWidth="2" />
      {/* aft structure */}
      <rect x="40" y="54" width="44" height="22" rx="3" fill="url(#bsfs-tower)" stroke="#00000030" />
      <rect x="47" y="60" width="8" height="5" rx="1" fill="#16222b" />
      <rect x="60" y="60" width="8" height="5" rx="1" fill="#16222b" />
      {/* main tower + bridge */}
      <rect x="76" y="38" width="64" height="38" rx="3" fill="url(#bsfs-tower)" stroke="#00000030" />
      <rect x="84" y="22" width="44" height="18" rx="3" fill="url(#bsfs-bridge)" stroke="#00000030" />
      {[88, 98, 108, 118].map((x) => <rect key={x} x={x} y="27" width="7" height="5.5" rx="1" fill="#101c25" />)}
      <rect x="84" y="46" width="48" height="4" rx="2" fill="#ffffff22" />
      {/* smokestack */}
      <rect x="146" y="40" width="14" height="24" rx="2.5" fill="#28323a" />
      <rect x="146" y="44" width="14" height="4.4" fill={accent} opacity="0.9" />
      <rect x="144" y="38" width="18" height="4" rx="2" fill="#1b242b" />
      {/* fore secondary turret */}
      <rect x="176" y="63" width="24" height="12" rx="3" fill="#3c4952" stroke="#00000030" />
      <rect x="198" y="66.5" width="17" height="3.4" rx="1.7" fill="#25303a" />
      {/* hull, bow to the right */}
      <path d="M8 76 L210 76 L236 84 L221 106 Q215 114 202 114 L36 114 Q19 114 13 99 Z" fill="url(#bsfs-hull)" />
      <path d="M8 76 L210 76 L236 84" fill="none" stroke="#ffffff3a" strokeWidth="2" />
      {/* accent boot stripe + shaded waterline */}
      <path d="M13 94 L227.5 94 L223 100 L15.8 100 Z" fill={accent} opacity="0.85" />
      <path d="M15 101 L222.5 101 L221 106 Q215 114 202 114 L36 114 Q19 114 15 101 Z" fill="#00000048" />
      {[44, 72, 100, 128, 156, 184].map((x) => <circle key={x} cx={x} cy="86" r="2.6" fill="#0a161eaa" stroke="#ffffff26" strokeWidth="0.9" />)}
      {/* anchor hawse near bow */}
      <circle cx="216" cy="84" r="3" fill="#141d24" stroke="#ffffff22" strokeWidth="1" />
    </svg>
  );
}

/** Small gliding gull (replaces the dove emoji). */
function Gull() {
  return (
    <svg width="38" height="20" viewBox="0 0 38 20" style={{ display: "block", filter: "drop-shadow(0 2px 3px #0006)" }}>
      <g style={{ transformOrigin: "50% 60%", animation: "gullFlap 320ms ease-in-out infinite alternate" }}>
        <path d="M2 12 Q10 2 19 10 Q28 2 36 12" fill="none" stroke="#f0f4f8" strokeWidth="3" strokeLinecap="round" />
      </g>
      <path d="M14 10 L25 12 L14 14 Z" fill="#dfe6ec" />
    </svg>
  );
}

export default function BattleshipDuel({ candidates, winnerId, theme, onDone }) {
  const C = theme.colors;
  const FONT_D = `'${theme.fonts.display}', 'Boogaloo', sans-serif`;
  const FONT_B = `'${theme.fonts.body}', 'DM Sans', sans-serif`;
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
  const [shipX, setShipX] = useState(SHIP_OFF_X);      // entrance slide offset
  const [shipSettled, setShipSettled] = useState(false); // true once arrived — enables idle bob, fades the wake

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

    /* Grand entrance — the flagship motors in from off-screen left with Ben at
       the helm, wake churning, a flourish call-out mid-slide, then settles into
       the idle bob before the first squadron appears (~1.25s total). */
    push(80, () => setShipX(0));
    push(620, () => {
      const id = nextId();
      setFx((f) => [...f, { id, kind: "text", x: SHIP_X + 160, y: SHIP_Y - 160, label: "CAPTAIN BEN, REPORTING!" }]);
      push(750, () => removeFx(id));
    });
    push(1030, () => setShipSettled(true));
    push(1250, () => runPlan(0));
    return () => T.current.forEach(clearTimeout);
  }, []);

  if (reducedMotion) {
    const winner = candidates.find((c) => c.id === winnerId);
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: C.bgDeep }}>
        <div style={{ padding: "28px 56px", borderRadius: 20, background: C.accent, fontWeight: 900, fontSize: 52, color: C.bgDeep, textAlign: "center", fontFamily: FONT_D }}>
          {winner?.name ?? "Winner"}
        </div>
      </div>
    );
  }

  const skyBg = `linear-gradient(180deg, ${C.bgDeep} 0%, #071b29 55%, #0d3145 100%)`;
  const MOON_X = 1108, MOON_Y = 112;

  return (
    <div ref={wrapRef} style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      <div style={{ width: AREA_W, height: AREA_H, position: "absolute", top: "50%", left: "50%", transformOrigin: "center", transform: `translate(-50%, -50%) scale(${fit})` }}>
        <div id="bship-stage-root" style={{ width: AREA_W, height: AREA_H, position: "relative", overflow: "hidden", borderRadius: 20, border: `2px solid ${C.accent}44`, background: skyBg, animation: "popStage 420ms " + cb([0.34, 1.56, 0.64, 1]) }}>
          {/* ---- sky ---- */}
          {STARS.map((st, k) => (
            <div key={"st" + k} style={{ position: "absolute", left: st.x, top: st.y, width: 2.5, height: 2.5, borderRadius: "50%", background: C.text, opacity: 0.5, animation: st.tw ? `starTwinkle 2600ms ease-in-out ${st.d}s infinite` : "none" }} />
          ))}
          <div style={{ position: "absolute", left: MOON_X - 70, top: MOON_Y - 70, width: 140, height: 140, borderRadius: "50%", background: `radial-gradient(circle, ${C.highlight}30, transparent 68%)` }} />
          <div style={{ position: "absolute", left: MOON_X - 27, top: MOON_Y - 27, width: 54, height: 54, borderRadius: "50%", background: `radial-gradient(circle at 38% 34%, #fdfbf2, ${tint(C.highlight, 0.55)} 68%, ${tint(C.highlight, 0.2)})`, boxShadow: `0 0 44px ${C.highlight}66` }} />
          <div style={{ position: "absolute", left: 120, top: 96, width: 340, height: 56, borderRadius: 60, background: "#ffffff09", filter: "blur(10px)", animation: "cloudDrift 26s ease-in-out infinite alternate" }} />
          <div style={{ position: "absolute", left: 620, top: 220, width: 260, height: 42, borderRadius: 60, background: "#ffffff07", filter: "blur(9px)", animation: "cloudDrift 34s ease-in-out infinite alternate-reverse" }} />
          {/* horizon glow */}
          <div style={{ position: "absolute", left: 0, top: WATER_Y - 90, width: "100%", height: 100, background: `radial-gradient(ellipse 68% 100% at 50% 100%, ${C.accent}2e, transparent 72%)` }} />

          {/* ---- water ---- */}
          <div style={{ position: "absolute", left: 0, top: WATER_Y, width: "100%", height: AREA_H - WATER_Y, background: "linear-gradient(180deg, #17506f 0%, #0c3450 30%, #072335 68%, #04141f 100%)" }} />
          <div style={{ position: "absolute", left: 0, top: WATER_Y, width: "100%", height: AREA_H - WATER_Y, background: `linear-gradient(180deg, ${C.accent}1c, transparent 42%)` }} />
          <div style={{ position: "absolute", left: 0, top: WATER_Y - 1, width: "100%", height: 2, background: `linear-gradient(90deg, transparent, #bfe6ff55 30%, #bfe6ff77 50%, #bfe6ff55 70%, transparent)` }} />
          {/* moon reflection */}
          <div style={{ position: "absolute", left: MOON_X - 34, top: WATER_Y + 4, width: 68, height: 240, background: `linear-gradient(180deg, ${C.highlight}2c, ${C.highlight}12 45%, transparent)`, filter: "blur(4px)" }} />
          {/* drifting glints */}
          <div style={{ position: "absolute", left: -80, top: WATER_Y + 34, width: AREA_W + 160, height: 3, background: "repeating-linear-gradient(90deg, transparent 0 46px, #bfe6ff20 46px 58px)", animation: "seaDrift 9s ease-in-out infinite alternate" }} />
          <div style={{ position: "absolute", left: -80, top: WATER_Y + 96, width: AREA_W + 160, height: 3, background: "repeating-linear-gradient(90deg, transparent 0 64px, #bfe6ff16 64px 80px)", animation: "seaDrift 13s ease-in-out infinite alternate-reverse" }} />
          <div style={{ position: "absolute", left: -80, top: WATER_Y + 190, width: AREA_W + 160, height: 4, background: "repeating-linear-gradient(90deg, transparent 0 88px, #bfe6ff12 88px 110px)", animation: "seaDrift 17s ease-in-out infinite alternate" }} />

          {banner && (
            <div style={{ position: "absolute", top: 26, left: 0, right: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", gap: 16, animation: "fadeIn 220ms ease-out" }}>
              <div style={{ width: 56, height: 2, background: `linear-gradient(90deg, transparent, ${C.highlight}aa)` }} />
              <div style={{ color: C.highlight, fontFamily: FONT_D, letterSpacing: 6, fontSize: 27, textShadow: `0 0 22px ${C.highlight}55, 0 2px 4px #000` }}>{banner}</div>
              <div style={{ width: 56, height: 2, background: `linear-gradient(90deg, ${C.highlight}aa, transparent)` }} />
            </div>
          )}

          {/* battleship — slides in from off-screen left on mount, then settles into the idle bob */}
          <div style={{ position: "absolute", left: SHIP_X - 100, top: SHIP_Y - 70, width: 240, zIndex: 20, transform: `translate3d(${shipX}px,0,0)`, transition: `transform 950ms ${EASE_OUT_CSS}`, animation: shipSettled ? "bob 3400ms ease-in-out infinite" : "none", willChange: "transform" }}>
            <div style={{ position: "relative", width: 240, height: 120 }}>
              {/* entrance wake — stern foam streaks + bow spray, churning while underway, fades once settled */}
              <div style={{ position: "absolute", left: -96, top: 96, width: 108, height: 15, borderRadius: "50%", background: "linear-gradient(90deg, transparent, #d8eeffb8)", filter: "blur(2px)", transformOrigin: "100% 50%", animation: "wakeChurn 340ms ease-in-out infinite", opacity: shipSettled ? 0 : 1, transition: "opacity 500ms ease-out" }} />
              <div style={{ position: "absolute", left: -70, top: 107, width: 86, height: 11, borderRadius: "50%", background: "linear-gradient(90deg, transparent, #d8eeff80)", filter: "blur(2px)", transformOrigin: "100% 50%", animation: "wakeChurn 420ms ease-in-out 120ms infinite", opacity: shipSettled ? 0 : 1, transition: "opacity 500ms ease-out" }} />
              <div style={{ position: "absolute", left: 222, top: 84, width: 28, height: 28, borderRadius: "50%", background: "radial-gradient(circle, #f0f8ffd0, #d8eeff44 60%, transparent 75%)", filter: "blur(1px)", transformOrigin: "20% 100%", animation: "wakeChurn 300ms ease-in-out infinite", opacity: shipSettled ? 0 : 1, transition: "opacity 400ms ease-out" }} />
              <Flagship accent={C.accent} />
              {/* Ben at the helm — same asset + validated crop window as WhackAMole (original-image
                  x:128-278, y:45-195), scaled into a 40px circle standing in the open bridge,
                  tucked behind the gun pivot so he reads as the one firing it */}
              <div style={{ position: "absolute", left: 62, top: 2, width: 40, height: 40, borderRadius: "50%", overflow: "hidden", border: `3px solid ${C.accent}`, boxShadow: "0 2px 6px #0009", background: "#16222b", zIndex: 1 }}>
                {/* maxWidth:none — Tailwind preflight's img{max-width:100%} otherwise shrinks the crop into invisibility */}
                <img src={HEAD_IMG} alt="" style={{ position: "absolute", width: 115, maxWidth: "none", left: -34, top: -12 }} />
              </div>
              {/* main gun — pivot sits atop the bridge; barrel points right, recoils along its own axis */}
              <div style={{ position: "absolute", left: 95, top: 13, width: 22, height: 22, borderRadius: "50%", background: "linear-gradient(180deg, #6d7c86, #333f47)", boxShadow: "0 2px 4px #0008", zIndex: 2 }} />
              <div style={{
                position: "absolute", left: 106, top: 18, width: 48, height: 12, borderRadius: "3px 5px 5px 3px",
                background: "linear-gradient(180deg, #5c6b75, #2c383f)", boxShadow: "0 2px 3px #0007",
                transformOrigin: "0% 50%",
                transform: `rotate(${turret.angle}deg) translateX(${turret.recoil ? -6 : 0}px)`,
                transition: `transform ${turret.recoil ? 70 : 220}ms ${EASE_OUT_CSS}`, zIndex: 1,
              }}>
                <div style={{ position: "absolute", right: 0, top: 2, width: 6, height: 8, borderRadius: 2, background: "#18222a" }} />
              </div>
              {/* bow foam */}
              <div style={{ position: "absolute", left: 150, top: 106, width: 110, height: 14, borderRadius: "50%", background: "radial-gradient(ellipse, #d8eeff33, transparent 70%)" }} />
              <div style={{ position: "absolute", left: -8, top: 108, width: 130, height: 12, borderRadius: "50%", background: "radial-gradient(ellipse, #d8eeff22, transparent 70%)" }} />
            </div>
          </div>

          {/* enemy fleet */}
          {ships.map((s) => (
            <div key={s.id} style={{
              position: "absolute", left: s.x - 60, top: s.y - 30, width: 120,
              transform: s.sinking
                ? `translateY(150px) rotate(${s.flinch % 2 ? 24 : -20}deg)`
                : `translateY(0) rotate(0deg) scale(${s.flinch ? 1.06 : 1})`,
              opacity: s.sinking ? 0 : 1,
              transition: s.sinking ? `transform 750ms ${EASE_DROP_CSS}, opacity 700ms ${EASE_EXIT_CSS}` : `transform 160ms ${EASE_OUT_CSS}`,
              animation: "bob 2600ms ease-in-out infinite",
              zIndex: 15,
            }}>
              <div style={{ position: "relative", width: 120 }}>
                <EnemyShip id={s.id} color={colorOf[s.id]} />
                <div style={{ position: "absolute", left: 12, top: 54, width: 100, height: 10, borderRadius: "50%", background: "radial-gradient(ellipse, #d8eeff2e, transparent 70%)" }} />
              </div>
              <div style={{ marginTop: 5, textAlign: "center" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "2px 10px", borderRadius: 999, background: "#081420cc", border: `1px solid ${colorOf[s.id]}66`, maxWidth: 134, boxShadow: "0 3px 8px #0007" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: colorOf[s.id], flex: "none" }} />
                  <span style={{ fontSize: 12, fontWeight: 800, color: CREAM, fontFamily: FONT_B, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                </div>
              </div>
            </div>
          ))}

          {/* shells — glowing tracers, angled toward their target */}
          {shots.map((sh) => {
            const rot = (Math.atan2(sh.y2 - sh.y1, sh.x2 - sh.x1) * 180) / Math.PI;
            return (
              <React.Fragment key={sh.id}>
                <div style={{ position: "absolute", left: sh.x1, top: sh.y1, width: 36, height: 36, marginLeft: -18, marginTop: -18, borderRadius: "50%", background: "radial-gradient(circle, #fff, #ffd24d 40%, transparent 70%)", animation: "muzzle 180ms ease-out forwards", zIndex: 41 }} />
                <div style={{ position: "absolute", left: sh.x1, top: sh.y1, zIndex: 40, transform: "translate(0,0)", ["--tx"]: `${sh.x2 - sh.x1}px`, ["--ty"]: `${sh.y2 - sh.y1}px`, animation: `shellFly ${sh.dur}ms ${EASE_OUT_CSS} forwards` }}>
                  <div style={{ width: 32, height: 7, marginLeft: -16, marginTop: -3.5, borderRadius: 4, transform: `rotate(${rot}deg)`, background: "linear-gradient(90deg, transparent, #ffb84d55 40%, #ffe89a 72%, #fff)", boxShadow: "0 0 12px #ffd97a" }} />
                </div>
              </React.Fragment>
            );
          })}

          {/* fx layer */}
          {fx.map((o) => {
            if (o.kind === "boom") {
              const R = o.count * 3, n = Math.min(o.count, 14), dur = o.big ? 900 : 600;
              return (
                <div key={o.id} style={{ position: "absolute", left: o.x, top: o.y, zIndex: 45 }}>
                  {[0, 1, 2].map((k) => (
                    <div key={"s" + k} style={{ position: "absolute", left: -24 + k * 16, top: -22, width: 46, height: 46, borderRadius: "50%", background: "radial-gradient(circle, #2c3237cc, transparent 68%)", filter: "blur(3px)", opacity: 0, animation: `smokeUp ${o.big ? 1000 : 650}ms ease-out ${k * 70}ms forwards` }} />
                  ))}
                  <div style={{ position: "absolute", left: -R, top: -R, width: R * 2, height: R * 2, borderRadius: "50%", background: `radial-gradient(circle, #fff9ec, #ffd24d 28%, ${o.color} 58%, transparent 76%)`, animation: `boom ${dur}ms ease-out forwards` }} />
                  <div style={{ position: "absolute", left: -R * 0.7, top: -R * 0.7, width: R * 1.4, height: R * 1.4, borderRadius: "50%", background: "radial-gradient(circle, #ffffff, transparent 62%)", animation: "boomFlash 220ms ease-out forwards" }} />
                  <div style={{ position: "absolute", left: -26, top: -26, width: 52, height: 52, borderRadius: "50%", border: `3px solid ${o.color}`, animation: `ringOut ${o.big ? 820 : 540}ms ${EASE_OUT_CSS} forwards` }} />
                  {SPARKS.slice(0, n).map((p, k) => {
                    const d = (o.big ? 118 : 74) * p.r;
                    return <div key={"p" + k} style={{ position: "absolute", left: -3, top: -3, width: 6, height: 6, borderRadius: "50%", background: k % 3 ? "#ffd97a" : o.color, boxShadow: `0 0 8px ${k % 3 ? "#ffd97a" : o.color}`, ["--sx"]: `${Math.cos(p.a) * d}px`, ["--sy"]: `${Math.sin(p.a) * d - 18}px`, animation: `sparkFly ${o.big ? 860 : 560}ms ${EASE_OUT_CSS} forwards` }} />;
                  })}
                </div>
              );
            }
            if (o.kind === "splash") return (
              <div key={o.id} style={{ position: "absolute", left: o.x, top: o.y, zIndex: 44 }}>
                <div style={{ position: "absolute", left: -30, top: -8, width: 60, height: 16, borderRadius: "50%", border: "2px solid #cfe9ff88", animation: `ringOut 480ms ${EASE_OUT_CSS} forwards` }} />
                <div style={{ position: "absolute", left: -6, top: -32, width: 12, height: 34, borderRadius: "45%", background: "linear-gradient(180deg, #ffffffd8, #bfe6ff55)", transformOrigin: "50% 100%", animation: "plumeUp 480ms ease-out forwards" }} />
                {DROPS.map((dx, k) => (
                  <div key={k} style={{ position: "absolute", left: -2, top: -8, width: 5, height: 9, borderRadius: "50%", background: "#d9efffcc", opacity: 0, ["--dx"]: `${dx}px`, animation: `dropArc 500ms ease-out ${k * 20}ms forwards` }} />
                ))}
              </div>
            );
            if (o.kind === "bird") return (
              <div key={o.id} style={{ position: "absolute", left: o.x, top: o.y, zIndex: 46, transform: "translate(0,0)", ["--btx"]: `${o.tx - o.x}px`, ["--bty"]: `${o.ty - o.y}px`, animation: `birdFly ${o.dur}ms linear forwards` }}>
                <Gull />
              </div>
            );
            if (o.kind === "text") return <div key={o.id} style={{ position: "absolute", left: o.x, top: o.y, transform: "translate(-50%,-50%) rotate(-6deg)", fontFamily: FONT_D, fontSize: 34, color: "#fff", letterSpacing: 1, whiteSpace: "nowrap", textShadow: "0 0 18px #ffb14d, 2px 2px 0 #000", animation: "koPop 500ms ease-out", zIndex: 50 }}>{o.label}</div>;
            if (o.kind === "confetti") return Array.from({ length: 50 }).map((_, k) => (
              <div key={o.id + "_" + k} style={{ position: "absolute", left: o.x, top: o.y, width: 11, height: 16, borderRadius: 2, background: [C.highlight, C.accent, APPLE, CREAM][k % 4], animation: `conf 1800ms ease-out ${(k % 9) * 30}ms forwards`, ["--dx"]: `${rand(-360, 360)}px`, ["--dy"]: `${rand(-300, 40)}px`, ["--r"]: `${rand(-360, 360)}deg`, zIndex: 55 }} />
            ));
            return null;
          })}

          {/* victory — anchor to the surviving ship's actual on-screen position */}
          {victory && (() => {
            const vs = ships.find((s) => s.id === victory.id);
            const vx = vs ? vs.x : victory.x, vy = vs ? vs.y : victory.y;
            return (
            <>
              <div style={{ position: "absolute", left: vx - 130, top: 0, width: 260, height: vy, background: `linear-gradient(180deg, ${C.highlight}33, transparent)`, clipPath: "polygon(46% 0, 54% 0, 100% 100%, 0% 100%)", animation: "fadeIn 500ms ease-out", zIndex: 12 }} />
              <div style={{ position: "absolute", left: vx - 120, top: vy - 50, width: 240, height: 130, borderRadius: "50%", background: `radial-gradient(ellipse, ${C.highlight}2a, transparent 70%)`, animation: "fadeIn 500ms ease-out", zIndex: 13 }} />
              <div style={{ position: "absolute", left: vx, top: vy - 78, transform: "translateX(-50%) scale(.9)", opacity: 0, fontFamily: FONT_D, fontSize: 26, letterSpacing: 4, color: C.highlight, textShadow: `0 0 20px ${C.highlight}, 0 2px 4px #000`, animation: "popIn 320ms ease-out 200ms forwards", zIndex: 52, whiteSpace: "nowrap" }}>LAST SHIP STANDING!</div>
              <div style={{ position: "absolute", left: vx, top: vy + 62, transform: "translate(-50%,0) scale(.9)", opacity: 0, padding: "14px 42px", borderRadius: 16, background: `linear-gradient(180deg, ${tint(C.accent, 0.18)}, ${C.accent} 55%, ${tint(C.accent, -0.28)})`, border: `1px solid ${C.highlight}88`, color: C.text, fontFamily: FONT_D, fontSize: 32, letterSpacing: 1, textShadow: "0 2px 4px #0008", boxShadow: `0 0 60px ${C.highlight}66, 0 10px 24px #000a`, animation: "cardIn 380ms " + EASE_OUT_CSS + " 500ms forwards", zIndex: 80, whiteSpace: "nowrap" }}>
                {victory.name}
              </div>
            </>
            );
          })()}
        </div>
      </div>
      <style>{`
        @keyframes popStage{0%{transform:scale(.9);opacity:0}100%{transform:scale(1);opacity:1}}
        @keyframes fadeIn{0%{opacity:0}100%{opacity:1}}
        @keyframes popIn{0%{transform:translateX(-50%) scale(.9);opacity:0}100%{transform:translateX(-50%) scale(1);opacity:1}}
        @keyframes cardIn{0%{transform:translate(-50%,0) scale(.9);opacity:0}100%{transform:translate(-50%,0) scale(1);opacity:1}}
        @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-6px)}}
        @keyframes boom{0%{transform:scale(.2);opacity:1}100%{transform:scale(1.4);opacity:0}}
        @keyframes boomFlash{0%{transform:scale(.5);opacity:1}100%{transform:scale(1.25);opacity:0}}
        @keyframes ringOut{0%{transform:scale(.3);opacity:.9}100%{transform:scale(2.6);opacity:0}}
        @keyframes sparkFly{0%{transform:translate(0,0) scale(1);opacity:1}100%{transform:translate(var(--sx),var(--sy)) scale(.3);opacity:0}}
        @keyframes smokeUp{0%{transform:translateY(6px) scale(.5);opacity:.75}100%{transform:translateY(-48px) scale(1.5);opacity:0}}
        @keyframes plumeUp{0%{transform:translateY(0) scaleY(.2);opacity:.95}55%{transform:translateY(-10px) scaleY(1);opacity:.9}100%{transform:translateY(-2px) scaleY(.6);opacity:0}}
        @keyframes dropArc{0%{transform:translate(0,0);opacity:1}55%{transform:translate(calc(var(--dx)*.7),-30px);opacity:1}100%{transform:translate(var(--dx),6px);opacity:0}}
        @keyframes muzzle{0%{transform:scale(.5);opacity:1}100%{transform:scale(1.3);opacity:0}}
        @keyframes koPop{0%{transform:translate(-50%,-50%) rotate(-6deg) scale(.3)}70%{transform:translate(-50%,-50%) rotate(-6deg) scale(1.25)}100%{transform:translate(-50%,-50%) rotate(-6deg) scale(1)}}
        @keyframes shellFly{100%{transform:translate(var(--tx),var(--ty))}}
        @keyframes birdFly{100%{transform:translate(var(--btx),var(--bty))}}
        @keyframes gullFlap{from{transform:scaleY(1)}to{transform:scaleY(.65)}}
        @keyframes wakeChurn{0%,100%{transform:scaleX(1)}50%{transform:scaleX(1.28)}}
        @keyframes conf{0%{transform:translate(-50%,-50%) rotate(0);opacity:1}100%{transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy) + 380px)) rotate(var(--r));opacity:0}}
        @keyframes seaDrift{0%{transform:translateX(-40px)}100%{transform:translateX(40px)}}
        @keyframes cloudDrift{0%{transform:translateX(-34px)}100%{transform:translateX(34px)}}
        @keyframes starTwinkle{0%,100%{opacity:.2}50%{opacity:.85}}
        #bship-stage-root.shake{animation:screenShake 260ms ease-in-out}
        @keyframes screenShake{0%,100%{transform:translate(0,0)}25%{transform:translate(-6px,3px)}50%{transform:translate(6px,-3px)}75%{transform:translate(-4px,2px)}}
        @media (prefers-reduced-motion: reduce){*{animation-duration:1ms!important;animation-iteration-count:1!important;transition-duration:1ms!important}}
      `}</style>
    </div>
  );
}
