import React, { useEffect, useRef, useState } from "react";
import { EASE_OUT, EASE_EXIT } from "../../../lib/easings.js";

/**
 * Trivia OS — "ABDUCTION" selection animation
 * Contract: { candidates, winnerId, theme, onDone }
 * Stage 1344x756. Winner predetermined upstream (fair, not randomized on screen).
 *
 * A UFO hovers over a starlit field of landed team pods and tractor-beams them
 * up one at a time. Every non-winner gets hauled up, scanned, and comedically
 * REJECTED — beam flickers, pod drops back down with a bounce and stays
 * grounded. Only the true winner ever gets the full bright beam-up.
 *
 * Scales like BattleshipDuel's wave/funnel (max 8 pods on screen):
 *   N <= 4   -> no elimination waves, straight to the finale with all N pods.
 *   N 5-8    -> one wave narrows down to 4 survivors, then finale.
 *   N 9-30   -> 4 chunks (each <=8), each chunk's wave rejects down to 1
 *               survivor (winner's chunk always spares the winner) -> finale.
 * Pacing accelerates as the field thins (per wave + per rejection, lower base
 * at high N) and the beam sweeps during pans — no dead air between targets.
 * Finale: pacing slows, lift height / hold / light show escalate per rejection.
 * Victory: winner is hauled up and HELD at the beam mouth as the hero shot;
 * flash, confetti and the name card all anchor to that same point.
 *
 * Reject texture: ~22% of abduction attempts fumble first — pod rises partway,
 * beam flickers and cuts, pod drops with a bounce, beam retries. Never happens
 * on the winner's final beam-up — that one is always clean.
 *
 * Persistent roster (BoxingRing pattern): every team listed both sides of the
 * stage the entire time. "Grounded" (rejected) rows dim + strike through; the
 * winner's row gets the crown at the end.
 */

const AREA_W = 1344, AREA_H = 756, CX = AREA_W / 2;
const UFO_Y = 108;                 // saucer center y
const SHIP_ROW_Y = 548;            // pod sprite top y (staggered ±13)
const GROUND_Y = 640;
const BEAM_TOP = 148;
// UFO pan clamp — saucer is 210 wide; keeps its full extent (and the beam's
// 168px base) clear of the 126px roster columns on both edges. Verified
// visually at 7 and 26 teams.
const UFO_MIN_X = 250, UFO_MAX_X = AREA_W - 250;
const CREAM = "#f5f0e8", APPLE = "#e02020";
const PALETTE = ["#ff5d5d", "#5db0ff", "#7ee081", "#c98bff", "#ff9f43", "#4de3d0", "#ff6fb0", "#b0e04d", "#ffd24d", "#4d9fff", "#ff7ae0", "#7affb0"];

const cb = (arr) => `cubic-bezier(${arr[0]},${arr[1]},${arr[2]},${arr[3]})`;
const EASE_OUT_CSS = cb(EASE_OUT), EASE_EXIT_CSS = cb(EASE_EXIT);
// Physics-correct curves (EASE_DROP in easings.js is an ease-OUT — wrong for a
// gravity fall, wrong for a beam pull; both need to build speed, not shed it):
const EASE_LIFT_CSS = cb([0.6, 0.05, 0.35, 1]);  // beam pull — builds from rest, settles into the hold
const EASE_FALL_CSS = cb([0.32, 0, 0.67, 0]);    // gravity — accelerates all the way into the ground
const EASE_RISE_CSS = cb([0.8, 0, 0.45, 1]);     // winner haul-up — hard build after the hover, quick catch at the top

const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [b[i], b[j]] = [b[j], b[i]]; } return b; };

const tint = (hex, amt) => {
  const n = parseInt(hex.slice(1), 16);
  const ch = (c) => Math.max(0, Math.min(255, Math.round(amt >= 0 ? c + (255 - c) * amt : c * (1 + amt))));
  return `#${(((ch(n >> 16) << 16) | (ch((n >> 8) & 255) << 8) | ch(n & 255)) >>> 0).toString(16).padStart(6, "0")}`;
};

// Deterministic scatter tables — stable across re-renders.
const STARS = Array.from({ length: 34 }, (_, k) => ({ x: 24 + ((k * 191) % 1296), y: 14 + ((k * 113) % 560), tw: k % 3 === 0, d: (k % 5) * 0.8, s: k % 4 === 0 ? 3 : 2 }));
const REJECTS = ["REJECTED!", "NOPE.", "TOO HEAVY!", "PUT IT BACK!", "NOT THE ONE...", "WRONG SPECIES!", "EW. NO."];
const FUMBLES = ["BEAM JAM!", "SLIPPED!", "LOW BATTERY!"];
const FINALE_REJECTS = ["HMM... NO.", "SO CLOSE!", "ALMOST..."];

function splitEven(arr, k) {
  const out = Array.from({ length: k }, () => []);
  arr.forEach((item, i) => out[i % k].push(item));
  return out.filter((c) => c.length);
}

/** Same wave plan as BattleshipDuel. Each wave: { ships, keepIds, finale } */
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

/**
 * Row layout, centered, kept clear of both 126px roster columns.
 * Tag anti-overlap math (the WhackAMole lesson, done up front):
 *  - min spacing at n=8 is (1344-620)/7 ≈ 103px between pod centers;
 *  - tags are capped at maxWidth spacing-8 (so ≥ 95px gap ⇒ no horizontal
 *    overlap even before stagger);
 *  - pods alternate ±13px vertically (26px stagger) vs a tag pill whose real
 *    rendered height is 22px (12px font × pinned 14px lineHeight + 2×3px pad
 *    + 2×1px border) — 26 > 22, so even touching tags never clip.
 */
function layoutRow(ships) {
  const n = ships.length;
  const spacing = Math.min(150, (AREA_W - 620) / Math.max(1, n - 1));
  const startX = CX - (spacing * (n - 1)) / 2;
  return ships.map((s, i) => ({ ...s, x: n === 1 ? CX : startX + spacing * i, y: SHIP_ROW_Y + (i % 2 ? 13 : -13), tagMax: Math.min(120, spacing - 8) }));
}

/** Little landed team pod — dome + hull in the team color, landing legs. */
function Pod({ id, color }) {
  const hullId = `abd-hull-${id}`;
  return (
    <svg width="76" height="52" viewBox="0 0 76 52" style={{ display: "block", filter: "drop-shadow(0 6px 7px rgba(0,0,0,0.55))" }}>
      <defs>
        <linearGradient id={hullId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tint(color, 0.4)} />
          <stop offset="0.55" stopColor={color} />
          <stop offset="1" stopColor={tint(color, -0.45)} />
        </linearGradient>
      </defs>
      {/* dome */}
      <path d="M22 22 Q22 6 38 6 Q54 6 54 22 Z" fill="#cfe4f2" opacity="0.9" />
      <path d="M26 20 Q27 11 36 9" fill="none" stroke="#ffffffcc" strokeWidth="2" strokeLinecap="round" />
      {/* hull */}
      <ellipse cx="38" cy="28" rx="34" ry="12" fill={`url(#${hullId})`} />
      <ellipse cx="38" cy="24.5" rx="34" ry="8.5" fill="#ffffff22" />
      {[16, 30, 44, 58].map((x) => <circle key={x} cx={x} cy="30.5" r="2.6" fill={tint(color, -0.6)} stroke="#ffffff2e" strokeWidth="0.8" />)}
      {/* landing legs */}
      <path d="M16 37 L9 48 M60 37 L67 48 M38 40 L38 49" stroke={tint(color, -0.55)} strokeWidth="3" strokeLinecap="round" />
      <path d="M5 48.5 L13 48.5 M63 48.5 L71 48.5 M34 49.5 L42 49.5" stroke={tint(color, -0.4)} strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/** The mothership — big saucer, glass dome, blinking rim lights. */
function Saucer({ accent, highlight }) {
  return (
    <svg width="210" height="92" viewBox="0 0 210 92" style={{ display: "block", filter: "drop-shadow(0 10px 14px rgba(0,0,0,0.6))" }}>
      <defs>
        <linearGradient id="abd-ufo-hull" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={tint(accent, 0.55)} />
          <stop offset="0.5" stopColor={accent} />
          <stop offset="1" stopColor={tint(accent, -0.55)} />
        </linearGradient>
        <radialGradient id="abd-ufo-dome" cx="0.4" cy="0.3" r="0.9">
          <stop offset="0" stopColor="#eef7ff" />
          <stop offset="0.6" stopColor="#9fc4dd" />
          <stop offset="1" stopColor="#5d7f96" />
        </radialGradient>
      </defs>
      {/* dome */}
      <path d="M65 42 Q65 10 105 10 Q145 10 145 42 Z" fill="url(#abd-ufo-dome)" opacity="0.95" />
      <path d="M72 38 Q74 20 90 14" fill="none" stroke="#ffffffbb" strokeWidth="2.5" strokeLinecap="round" />
      {/* pilot blob peeking out of the dome */}
      <ellipse cx="105" cy="32" rx="11" ry="9" fill={tint(highlight, -0.1)} />
      <circle cx="101" cy="30" r="2.2" fill="#0a1216" />
      <circle cx="109" cy="30" r="2.2" fill="#0a1216" />
      {/* saucer body */}
      <ellipse cx="105" cy="54" rx="100" ry="22" fill="url(#abd-ufo-hull)" />
      <ellipse cx="105" cy="47" rx="100" ry="15" fill="#ffffff26" />
      <ellipse cx="105" cy="66" rx="62" ry="12" fill={tint(accent, -0.62)} />
      {/* rim lights — blink via opacity only */}
      {[25, 65, 105, 145, 185].map((x, k) => (
        <circle key={x} cx={x} cy="56" r="5" fill={highlight} style={{ animation: `abdBlink 1400ms ease-in-out ${k * 220}ms infinite` }} />
      ))}
    </svg>
  );
}

export default function Abduction({ candidates, winnerId, theme, onDone }) {
  const C = theme.colors;
  const FONT_D = `'${theme.fonts.display}', 'Boogaloo', sans-serif`;
  const FONT_B = `'${theme.fonts.body}', 'DM Sans', sans-serif`;
  const reducedMotion = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches).current;

  const wrapRef = useRef(null);
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setFit(Math.min(el.clientWidth / AREA_W, el.clientHeight / AREA_H)));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const colorOf = useRef(Object.fromEntries(candidates.map((c, i) => [c.id, PALETTE[i % PALETTE.length]]))).current;

  const [ships, setShips] = useState([]);
  const [ufo, setUfo] = useState({ x: CX, dur: 0, arrived: false });
  const [beam, setBeam] = useState("off"); // off | on | flicker | bright
  const [fx, setFx] = useState([]);
  const [banner, setBanner] = useState(null);
  const [victory, setVictory] = useState(null);
  const [roster, setRoster] = useState({}); // id -> 'out' | 'winner'

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

    // Guard the trust boundary once: bad winnerId (or empty candidates) must
    // never hang the overlay — buildPlan/runVictory both assume the winner exists.
    if (!candidates.length || !candidates.some((c) => c.id === winnerId)) {
      console.warn("[Abduction] winnerId not found in candidates — skipping animation");
      push(800, () => { if (!doneRef.current) { doneRef.current = true; onDone && onDone(); } });
      return () => T.current.forEach(clearTimeout);
    }

    const plan = buildPlan(candidates, winnerId);
    const totalWaves = plan.length - 1;
    // Pacing: starts lower at high team counts, accelerates per wave and per
    // rejection within a wave (BoxingRing/BattleshipDuel ramp — Abduction didn't).
    const basePace = candidates.length > 16 ? 0.8 : candidates.length > 8 ? 0.9 : 1;
    const fallMs = (p) => Math.round(380 * p);

    const setShip = (id, patch) => setShips((list) => list.map((s) => (s.id === id ? { ...s, ...(typeof patch === "function" ? patch(s) : patch) } : s)));

    const spawnText = (x, y, label, ms = 700) => {
      const id = nextId();
      setFx((f) => [...f, { id, kind: "text", x, y, label }]);
      push(ms, () => setFx((f) => f.filter((o) => o.id !== id)));
    };
    const spawnFlash = (x, y) => {
      const id = nextId();
      setFx((f) => [...f, { id, kind: "flash", x, y }]);
      push(600, () => setFx((f) => f.filter((o) => o.id !== id)));
    };
    const spawnConfetti = (x, y) => {
      const id = nextId();
      setFx((f) => [...f, { id, kind: "confetti", x, y }]);
      push(2100, () => setFx((f) => f.filter((o) => o.id !== id))); // conf anim 1800ms + max 240ms delay
    };
    const spawnDust = (x) => {
      const id = nextId();
      setFx((f) => [...f, { id, kind: "dust", x, y: GROUND_Y - 4 }]);
      push(560, () => setFx((f) => f.filter((o) => o.id !== id)));
    };
    const shakeStage = (ms = 200) => {
      const el = document.getElementById("abd-stage-root");
      el?.classList.add("shake");
      push(ms, () => el?.classList.remove("shake"));
    };

    let ufoX = CX;
    const moveUfoTo = (x, p, cb2) => {
      const tx = clamp(x, UFO_MIN_X, UFO_MAX_X);
      const dur = Math.round(clamp(Math.abs(tx - ufoX) * 0.9, 260, 700) * p);
      ufoX = tx;
      setUfo({ x: tx, dur, arrived: true });
      push(dur, () => { setUfo((u) => ({ ...u, dur: 0 })); cb2(); }); // dur:0 also scopes willChange to the pan
    };

    const liftShip = (id, dy, dur, ease = EASE_LIFT_CSS) => setShip(id, { dy, trans: `transform ${dur}ms ${ease}`, held: true });
    /** Gravity drop — accelerates into the ground, dust + stage shake on impact, small bounce. */
    const dropShip = (ship, p, cb2) => {
      const fall = fallMs(p), up = Math.round(130 * p), settle = Math.round(170 * p);
      setShip(ship.id, { dy: 0, trans: `transform ${fall}ms ${EASE_FALL_CSS}`, held: false });
      push(fall, () => {
        spawnDust(ship.x);
        shakeStage();
        setShip(ship.id, { dy: -12, trans: `transform ${up}ms ${EASE_OUT_CSS}` });
        push(up + 10, () => {
          setShip(ship.id, { dy: 0, trans: `transform ${settle}ms ${EASE_FALL_CSS}` });
          push(settle + 20, cb2);
        });
      });
    };

    /** One abduction attempt ending in comedic rejection. */
    const rejectTarget = (target, spectacle, cb2) => {
      const p = spectacle.pace;
      setBeam("on"); // beam sweeps WITH the pan — searchlight, no dead air between targets
      moveUfoTo(target.x, p, () => {
        const mainLift = () => {
          const liftDur = Math.round(520 * p);
          liftShip(target.id, spectacle.lift, liftDur);
          push(liftDur + Math.round(spectacle.holdMs * (spectacle.finale ? 1 : p)), () => {
            setBeam("flicker");
            // caption dies right as the pod lands — never floats over an empty sky
            spawnText(target.x, target.y + spectacle.lift - 46, pick(spectacle.finale ? FINALE_REJECTS : REJECTS), 200 + fallMs(p) + 60);
            push(200, () => {
              setBeam("off");
              dropShip(target, p, () => {
                setShip(target.id, { grounded: true });
                setRoster((r) => ({ ...r, [target.id]: "out" }));
                push(Math.round(spectacle.postMs * p), cb2);
              });
            });
          });
        };
        if (spectacle.allowFumble && Math.random() < (spectacle.finale ? 0.22 : 0.14)) {
          // fumble: partial lift, beam cuts out, pod drops, beam retries
          const fumbleLift = Math.round(380 * p);
          liftShip(target.id, -140, fumbleLift);
          push(fumbleLift + 60, () => {
            setBeam("flicker");
            spawnText(target.x, target.y - 190, pick(FUMBLES), 220 + fallMs(p) + 60);
            push(220, () => {
              setBeam("off");
              dropShip(target, p, () => push(Math.round(180 * p), () => { setBeam("on"); push(Math.round(220 * p), mainLift); }));
            });
          });
        } else mainLift();
      });
    };

    const runWave = (wave, waveIndex, waveDone) => {
      const laid = layoutRow(wave.ships.map((c) => ({ id: c.id, name: c.name })));
      setShips(laid.map((s) => ({ ...s, dy: 0, trans: "", held: false, grounded: false, exiting: false, taken: false })));
      setBanner(wave.finale ? "FINAL SELECTION" : `LANDING ZONE ${waveIndex + 1} OF ${totalWaves}`);
      push(1400, () => setBanner(null));

      const targets = shuffle(laid.filter((s) => !wave.keepIds.includes(s.id)));
      const runIndex = (i) => {
        if (i >= targets.length) {
          if (wave.finale) { waveDone(); return; }
          // clear the field for the next landing zone
          setShips((list) => list.map((s) => ({ ...s, exiting: true })));
          push(420, waveDone);
          return;
        }
        const spectacle = wave.finale
          ? { lift: -250 - i * 36, holdMs: 520 + i * 220, postMs: 300 + i * 140, allowFumble: true, finale: true, pace: Math.min(1, basePace + 0.1) }
          : { lift: -240, holdMs: 240, postMs: 140, allowFumble: true, finale: false, pace: clamp(basePace - waveIndex * 0.06 - i * 0.05, 0.45, 1) };
        rejectTarget(laid.find((s) => s.id === targets[i].id), spectacle, () => runIndex(i + 1));
      };
      push(550, () => runIndex(0));
    };

    const runVictory = (winnerShip) => {
      // clean, no fumble ever: full-bright beam, pod hauled up and HELD at the
      // beam mouth — the winner stays visible as the hero of the victory beat,
      // and every victory element (flash, confetti, card) anchors to it.
      setBeam("on");
      moveUfoTo(winnerShip.x, 1, () => {
        const wx = clamp(winnerShip.x, UFO_MIN_X, UFO_MAX_X);
        setBeam("bright");
        spawnText(wx, winnerShip.y - 210, "THE CHOSEN ONE!", 1400);
        push(420, () => {
          // anticipation: gentle hover off the ground...
          setShip(winnerShip.id, { dy: -34, trans: `transform 480ms ${EASE_OUT_CSS}`, held: true });
          push(500, () => {
            // ...then the beam hauls it up hard, catching it just under the saucer
            const holdY = UFO_Y + 78;
            // Full size, not shrunk — this is the hero shot, it should never read
            // smaller than the grounded losers still on the ground behind it.
            setShip(winnerShip.id, { dy: -(winnerShip.y - holdY), sc: 1, trans: `transform 820ms ${EASE_RISE_CSS}`, held: true });
            push(820, () => {
              setRoster((r) => ({ ...r, [winnerShip.id]: "winner" }));
              spawnFlash(wx, holdY + 10);
              spawnConfetti(wx, holdY + 20);
              shakeStage(240);
              setVictory({ name: winnerShip.name, x: wx });
              push(2600, () => { if (!doneRef.current) { doneRef.current = true; onDone && onDone(); } });
            });
          });
        });
      });
    };

    const runPlan = (idx) => {
      const wave = plan[idx];
      if (wave.finale) {
        runWave(wave, idx, () => {
          const laid = layoutRow(wave.ships.map((c) => ({ id: c.id, name: c.name })));
          const w = laid.find((s) => s.id === winnerId);
          if (!w) { // unreachable after the top guard, but never hang the overlay
            console.warn("[Abduction] winner unresolved in finale — ending gracefully");
            if (!doneRef.current) { doneRef.current = true; onDone && onDone(); }
            return;
          }
          push(400, () => runVictory(w));
        });
      } else {
        runWave(wave, idx, () => push(400, () => runPlan(idx + 1)));
      }
    };

    // entrance: saucer drifts in from above, then the first landing zone appears
    push(80, () => setUfo({ x: CX, dur: 0, arrived: true }));
    push(1100, () => runPlan(0));
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

  const skyBg = `linear-gradient(180deg, ${C.bgDeep} 0%, ${C.bg} 62%, ${tint(C.accent, -0.6)} 100%)`;
  const nL = Math.ceil(candidates.length / 2);
  const rosterPos = (i) => {
    const side = i < nL ? "L" : "R", idxOnSide = side === "L" ? i : i - nL, count = side === "L" ? nL : candidates.length - nL;
    const step = (AREA_H - 32) / Math.max(1, count);
    return { x: side === "L" ? 10 : AREA_W - 126, y: 16 + step * idxOnSide + step / 2 - 9 };
  };
  const beamOn = beam !== "off";

  return (
    <div ref={wrapRef} style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      <div style={{ width: AREA_W, height: AREA_H, position: "absolute", top: "50%", left: "50%", transformOrigin: "center", transform: `translate(-50%, -50%) scale(${fit})` }}>
        <div style={{ width: AREA_W, height: AREA_H, position: "relative", overflow: "hidden", borderRadius: 20, border: `2px solid ${C.accent}44`, background: skyBg, animation: "popStage 420ms " + cb([0.34, 1.56, 0.64, 1]) }}>
          {/* Shake lives on its own inner wrapper, never on this outer div — toggling
              a `.shake` class here would replace this div's `animation` (popStage) with
              abdShake, and removing the class later restarts popStage from its 0%
              (opacity:0) state instead of resuming, blacking out the whole stage on
              every landing. See Abduction critique 2026-08-26. */}
          <div id="abd-stage-root" style={{ width: "100%", height: "100%", position: "relative" }}>
          {/* ---- night sky ---- */}
          {STARS.map((st, k) => (
            <div key={"st" + k} style={{ position: "absolute", left: st.x, top: st.y, width: st.s, height: st.s, borderRadius: "50%", background: C.text, opacity: 0.5, animation: st.tw ? `starTwinkle 2600ms ease-in-out ${st.d}s infinite` : "none" }} />
          ))}
          {/* soft nebula patches — mid-stage interest so the sky isn't dead black */}
          <div style={{ position: "absolute", left: 170, top: 210, width: 430, height: 210, borderRadius: "50%", background: `radial-gradient(ellipse, ${C.accent}2e, transparent 68%)`, filter: "blur(6px)" }} />
          <div style={{ position: "absolute", left: 810, top: 130, width: 380, height: 190, borderRadius: "50%", background: `radial-gradient(ellipse, ${C.highlight}16, transparent 68%)`, filter: "blur(6px)" }} />
          <div style={{ position: "absolute", left: 520, top: 340, width: 340, height: 150, borderRadius: "50%", background: `radial-gradient(ellipse, ${C.accent}1e, transparent 70%)`, filter: "blur(8px)" }} />
          {/* ---- ground ---- */}
          <div style={{ position: "absolute", left: -60, top: GROUND_Y - 96, width: 520, height: 190, borderRadius: "50%", background: tint(C.accent, -0.72), opacity: 0.9 }} />
          <div style={{ position: "absolute", left: 880, top: GROUND_Y - 76, width: 620, height: 170, borderRadius: "50%", background: tint(C.accent, -0.72), opacity: 0.9 }} />
          <div style={{ position: "absolute", left: 0, top: GROUND_Y - 34, width: "100%", height: AREA_H - GROUND_Y + 34, background: `linear-gradient(180deg, ${tint(C.accent, -0.52)}, ${C.bgDeep} 85%)` }} />
          <div style={{ position: "absolute", left: 0, top: GROUND_Y - 35, width: "100%", height: 2, background: `linear-gradient(90deg, transparent, ${C.highlight}44 30%, ${C.highlight}66 50%, ${C.highlight}44 70%, transparent)` }} />

          {banner && (
            <div style={{ position: "absolute", top: 26, left: 0, right: 0, zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", gap: 16, animation: "fadeIn 220ms ease-out" }}>
              <div style={{ width: 56, height: 2, background: `linear-gradient(90deg, transparent, ${C.highlight}aa)` }} />
              <div style={{ color: C.highlight, fontFamily: FONT_D, letterSpacing: 6, fontSize: 27, textShadow: `0 0 22px ${C.highlight}55, 0 2px 4px #000` }}>{banner}</div>
              <div style={{ width: 56, height: 2, background: `linear-gradient(90deg, ${C.highlight}aa, transparent)` }} />
            </div>
          )}

          {/* ---- persistent roster, both flanks ---- */}
          {candidates.map((c, i) => {
            const p = rosterPos(i), st = roster[c.id];
            return (
              <div key={"r" + c.id} style={{ position: "absolute", left: p.x, top: p.y, width: 116, zIndex: 58, display: "flex", alignItems: "center", gap: 5, opacity: st === "out" ? 0.38 : 1, transition: "opacity 400ms ease-out" }}>
                <span style={{ width: 9, height: 9, borderRadius: 3, background: colorOf[c.id], flex: "none", boxShadow: st === "winner" ? `0 0 10px ${C.highlight}` : "none" }} />
                <span style={{ fontSize: 12, lineHeight: "14px", fontWeight: 800, fontFamily: FONT_B, color: st === "winner" ? C.highlight : "#e8ecf5", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: st === "out" ? "line-through" : "none", textShadow: st === "winner" ? `0 0 14px ${C.highlight}88` : "none" }}>
                  {st === "winner" ? "👑 " : ""}{c.name}
                </span>
              </div>
            );
          })}

          {/* ---- UFO + tractor beam (beam rides along inside the pan container) ---- */}
          <div style={{ position: "absolute", left: 0, top: 0, zIndex: 30, transform: `translate3d(${ufo.x}px, ${ufo.arrived ? 0 : -220}px, 0)`, transition: ufo.dur ? `transform ${ufo.dur}ms ${cb([0.45, 0, 0.25, 1])}` : `transform 950ms ${EASE_OUT_CSS}`, willChange: ufo.dur ? "transform" : undefined }}>
            {/* beam cone — bright escalates on WIDTH + core + pool, not just hue,
                so it reads at TV distance even when highlight is already near-white */}
            <div style={{
              position: "absolute", left: -84, top: BEAM_TOP, width: 168, height: GROUND_Y + 8 - BEAM_TOP,
              clipPath: "polygon(42% 0, 58% 0, 94% 100%, 6% 100%)",
              background: beam === "bright"
                ? `linear-gradient(180deg, #ffffffee, ${C.highlight}cc 30%, ${C.highlight}55 80%, transparent)`
                : `linear-gradient(180deg, ${C.highlight}cc, ${C.highlight}66 45%, ${C.highlight}22 85%, transparent)`,
              opacity: beam === "off" ? 0 : beam === "bright" ? 1 : 0.8,
              transform: `scaleX(${beam === "bright" ? 1.5 : 1})`, transformOrigin: "50% 0%",
              transition: "opacity 220ms ease-out, transform 300ms ease-out",
              animation: beam === "flicker" ? "beamFlicker 460ms linear infinite" : beam === "on" ? "beamPulse 1100ms ease-in-out infinite" : "none",
              zIndex: 22, pointerEvents: "none",
            }} />
            {/* bright-only inner core — near-white column, theme-proof */}
            <div style={{
              position: "absolute", left: -84, top: BEAM_TOP, width: 168, height: GROUND_Y + 8 - BEAM_TOP,
              clipPath: "polygon(45% 0, 55% 0, 72% 100%, 28% 100%)",
              background: "linear-gradient(180deg, #ffffff, #ffffffbb 40%, #ffffff33 85%, transparent)",
              opacity: beam === "bright" ? 0.95 : 0,
              transition: "opacity 240ms ease-out", zIndex: 23, pointerEvents: "none",
            }} />
            {/* beam ground pool — grows + whitens when bright */}
            <div style={{
              position: "absolute", left: -90, top: GROUND_Y - 16, width: 180, height: 34, borderRadius: "50%",
              background: beam === "bright"
                ? `radial-gradient(ellipse, #ffffffcc, ${C.highlight}66 45%, transparent 72%)`
                : `radial-gradient(ellipse, ${C.highlight}50, transparent 70%)`,
              transform: `scale(${beam === "bright" ? 1.7 : 1})`,
              opacity: beamOn ? 1 : 0, transition: "opacity 220ms ease-out, transform 300ms ease-out", zIndex: 21,
            }} />
            {/* saucer with idle bob */}
            <div style={{ position: "absolute", left: -105, top: UFO_Y - 46, animation: "ufoBob 3200ms ease-in-out infinite", zIndex: 30 }}>
              <Saucer accent={C.accent} highlight={C.highlight} />
              <div style={{ position: "absolute", left: 25, top: 70, width: 160, height: 26, borderRadius: "50%", background: `radial-gradient(ellipse, ${C.highlight}3a, transparent 70%)` }} />
            </div>
          </div>

          {/* ---- team pods ---- */}
          {ships.map((s) => (
            <div key={s.id} style={{
              position: "absolute", left: s.x - 60, top: s.y, width: 120, zIndex: s.held ? 60 : 15, // held pods ride in FRONT of the beam, flash, and confetti (55) — the winner must stay the hero, not buried under its own party
              transform: `translate3d(0, ${s.exiting ? 40 : s.dy || 0}px, 0) scale(${s.sc ?? 1})`,
              opacity: s.taken ? 0 : s.exiting ? 0 : s.grounded ? 0.45 : 1,
              transition: s.exiting ? `transform 400ms ${EASE_EXIT_CSS}, opacity 380ms ease-out` : `${s.trans || "transform 300ms " + EASE_OUT_CSS}, opacity 300ms ease-out`,
              willChange: s.held ? "transform" : undefined,
            }}>
              <div style={{ position: "relative", width: 76, margin: "0 auto", animation: s.held ? "holdSway 900ms ease-in-out infinite" : "none" }}>
                <Pod id={s.id} color={colorOf[s.id]} />
              </div>
              {/* name tag — pinned lineHeight, capped width; see layoutRow() overlap math */}
              <div style={{ marginTop: 4, textAlign: "center" }}>
                <div style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "3px 10px", borderRadius: 999, background: "#081420cc", border: `1px solid ${colorOf[s.id]}66`, maxWidth: s.tagMax, boxShadow: "0 3px 8px #0007" }}>
                  <span style={{ width: 7, height: 7, borderRadius: "50%", background: colorOf[s.id], flex: "none" }} />
                  <span style={{ fontSize: 12, lineHeight: "14px", fontWeight: 800, color: CREAM, fontFamily: FONT_B, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{s.name}</span>
                </div>
              </div>
            </div>
          ))}

          {/* ---- fx ---- */}
          {fx.map((o) => {
            if (o.kind === "text") return <div key={o.id} style={{ position: "absolute", left: o.x, top: o.y, transform: "translate(-50%,-50%) rotate(-6deg)", fontFamily: FONT_D, fontSize: 34, color: "#fff", letterSpacing: 1, whiteSpace: "nowrap", textShadow: `0 0 18px ${C.highlight}, 2px 2px 0 #000`, animation: "koPop 500ms ease-out", zIndex: 50 }}>{o.label}</div>;
            if (o.kind === "flash") return (
              <div key={o.id} style={{ position: "absolute", left: o.x, top: o.y, zIndex: 46 }}>
                <div style={{ position: "absolute", left: -170, top: -170, width: 340, height: 340, borderRadius: "50%", background: `radial-gradient(circle, #ffffff, ${C.highlight}aa 40%, transparent 68%)`, animation: "boomFlash 520ms ease-out forwards" }} />
                <div style={{ position: "absolute", left: -30, top: -30, width: 60, height: 60, borderRadius: "50%", border: `3px solid ${C.highlight}`, animation: `ringOut 560ms ${EASE_OUT_CSS} forwards` }} />
              </div>
            );
            if (o.kind === "dust") return (
              <div key={o.id} style={{ position: "absolute", left: o.x, top: o.y, zIndex: 18 }}>
                <div style={{ position: "absolute", left: -34, top: -8, width: 68, height: 16, borderRadius: "50%", border: `2px solid ${C.text}55`, animation: `ringOut 480ms ${EASE_OUT_CSS} forwards` }} />
                {[-30, -16, 0, 16, 30].map((dx, k) => (
                  <div key={k} style={{ position: "absolute", left: -8, top: -11, width: 16, height: 16, borderRadius: "50%", background: `${C.text}5a`, filter: "blur(2px)", ["--dx"]: `${dx * 1.9}px`, animation: `dustPuff 500ms ease-out ${k * 25}ms forwards`, opacity: 0 }} />
                ))}
              </div>
            );
            if (o.kind === "confetti") return Array.from({ length: 50 }).map((_, k) => (
              <div key={o.id + "_" + k} style={{ position: "absolute", left: o.x, top: o.y, width: 11, height: 16, borderRadius: 2, background: [C.highlight, C.accent, APPLE, CREAM][k % 4], animation: `conf 1800ms ease-out ${(k % 9) * 30}ms forwards`, ["--dx"]: `${rand(-380, 380)}px`, ["--dy"]: `${rand(-160, 120)}px`, ["--r"]: `${rand(-360, 360)}deg`, zIndex: 55 }} />
            ));
            return null;
          })}

          {/* ---- victory banner — everything anchors to victory.x, the same point
                  where the winner's pod hangs in the bright beam ---- */}
          {victory && (
            <>
              <div style={{ position: "absolute", left: victory.x, top: 296, transform: "translateX(-50%) scale(.9)", opacity: 0, fontFamily: FONT_D, fontSize: 28, letterSpacing: 5, color: C.highlight, textShadow: `0 0 20px ${C.highlight}, 0 2px 4px #000`, animation: "popIn 320ms ease-out 200ms forwards", zIndex: 52, whiteSpace: "nowrap" }}>ABDUCTED!</div>
              <div style={{ position: "absolute", left: victory.x, top: 348, transform: "translate(-50%,0) scale(.9)", opacity: 0, padding: "14px 42px", borderRadius: 16, background: `linear-gradient(180deg, ${tint(C.accent, 0.18)}, ${C.accent} 55%, ${tint(C.accent, -0.28)})`, border: `1px solid ${C.highlight}88`, color: C.text, fontFamily: FONT_D, fontSize: 32, letterSpacing: 1, textShadow: "0 2px 4px #0008", boxShadow: `0 0 60px ${C.highlight}66, 0 10px 24px #000a`, animation: `cardIn 380ms ${EASE_OUT_CSS} 480ms forwards`, zIndex: 80, whiteSpace: "nowrap" }}>
                {victory.name}
              </div>
            </>
          )}
          </div>
        </div>
      </div>
      <style>{`
        @keyframes popStage{0%{transform:scale(.9);opacity:0}100%{transform:scale(1);opacity:1}}
        @keyframes fadeIn{0%{opacity:0}100%{opacity:1}}
        @keyframes popIn{0%{transform:translateX(-50%) scale(.9);opacity:0}100%{transform:translateX(-50%) scale(1);opacity:1}}
        @keyframes cardIn{0%{transform:translate(-50%,0) scale(.9);opacity:0}100%{transform:translate(-50%,0) scale(1);opacity:1}}
        @keyframes ufoBob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes abdBlink{0%,100%{opacity:.25}50%{opacity:1}}
        @keyframes starTwinkle{0%,100%{opacity:.2}50%{opacity:.85}}
        @keyframes beamPulse{0%,100%{opacity:.8}50%{opacity:.62}}
        @keyframes beamFlicker{0%{opacity:.85}18%{opacity:.25}36%{opacity:.7}55%{opacity:.18}75%{opacity:.6}100%{opacity:.4}}
        @keyframes dustPuff{0%{transform:translate(0,0) scale(.5);opacity:.85}100%{transform:translate(var(--dx),-16px) scale(1.5);opacity:0}}
        #abd-stage-root.shake{animation:abdShake 200ms ease-in-out}
        @keyframes abdShake{0%,100%{transform:translate(0,0)}25%{transform:translate(-4px,2px)}50%{transform:translate(4px,-2px)}75%{transform:translate(-3px,1px)}}
        @keyframes holdSway{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}
        @keyframes koPop{0%{transform:translate(-50%,-50%) rotate(-6deg) scale(.3)}70%{transform:translate(-50%,-50%) rotate(-6deg) scale(1.25)}100%{transform:translate(-50%,-50%) rotate(-6deg) scale(1)}}
        @keyframes boomFlash{0%{transform:scale(.4);opacity:1}100%{transform:scale(1.3);opacity:0}}
        @keyframes ringOut{0%{transform:scale(.3);opacity:.9}100%{transform:scale(3);opacity:0}}
        @keyframes conf{0%{transform:translate(-50%,-50%) rotate(0);opacity:1}100%{transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy) + 420px)) rotate(var(--r));opacity:0}}
      `}</style>
    </div>
  );
}
