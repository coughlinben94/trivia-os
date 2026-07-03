import React, { useState, useEffect, useRef } from "react";

/**
 * Trivia OS — "CHEST DUEL" selection animation (bottom-half royale)
 * Contract: { candidates, winnerId, theme, onDone }
 * Stage: fills StageFrame (85% of viewport). Theme lights the stage.
 *
 * THREE chests are ALWAYS on screen. Each round: two teams walk up, each randomly
 * opens one of the three (third stays shut) → they return to the corner closest to
 * their chest → COMBAT: the non-lethal is thrown first (does nothing), then the
 * kill item comes out and finishes it. ~10% of rounds BOTH teams pull non-lethals —
 * they exchange harmless throws and both go back into the pool.
 * When two remain: THE FINAL — same choreography, choose-your-chest moment, crown.
 *
 * Items (no guns): KILL ⚔️💣🥊🎆🔨🏹🔱🧨 · NON-LETHAL 🦆🥧🎉
 * Winner predetermined upstream — elimination order scheduled; reads as chest luck.
 * Global pace: 15% slower than v1 (SPD).
 */

const AREA_W = 1344, AREA_H = 756, CX = AREA_W / 2, CY = AREA_H / 2;
const FLOOR = CY + 195, CHEST_Y = CY - 115;
const CHESTS_X = [CX - 340, CX, CX + 340];
const CORNER_X = [305, AREA_W - 305];
const APPLE = "#e02020", CREAM = "#f5f0e8";
const PALETTE = ["#ff5d5d", "#5db0ff", "#7ee081", "#c98bff", "#ff9f43", "#4de3d0", "#ff6fb0", "#b0e04d", "#ffd24d", "#4d9fff", "#ff7ae0", "#7affb0"];
const SPD = 1.15;
const S = (ms) => Math.round(ms * SPD);

const KILL = [
  { id: "sword", emoji: "⚔️", label: "SWORD", verb: "CLEAVED!" },
  { id: "grenade", emoji: "💣", label: "GRENADE", verb: "EXPLODED!", spin: true, boomx2: true },
  { id: "glove", emoji: "🥊", label: "BOXING GLOVE", verb: "K.O.!" },
  { id: "firework", emoji: "🎆", label: "FIREWORK", verb: "LAUNCHED!" },
  { id: "mallet", emoji: "🔨", label: "GIANT MALLET", verb: "SMASHED!", spin: true },
  { id: "crossbow", emoji: "🏹", label: "CROSSBOW", verb: "SKEWERED!" },
  { id: "trident", emoji: "🔱", label: "TRIDENT", verb: "IMPALED!", spin: true },
  { id: "cannon", emoji: "🧨", label: "CANNON", verb: "BLOWN UP!" },
];
const WHIFF = [
  { id: "duck", emoji: "🦆", label: "RUBBER DUCK", verb: "boink.", spin: true },
  { id: "pie", emoji: "🥧", label: "CREAM PIE", verb: "splat.", spin: true },
  { id: "tp", emoji: "🧻", label: "TOILET PAPER", verb: "unraveled.", spin: true },
  { id: "fish", emoji: "🐟", label: "WET FISH", verb: "slap!", spin: true },
  { id: "apple", emoji: "🍎", label: "APPLE", verb: "crunch.", spin: true },
  { id: "teddy", emoji: "🧸", label: "TEDDY BEAR", verb: "aww." },
  { id: "pickle", emoji: "🥒", label: "PICKLE", verb: "dill with it.", spin: true },
  { id: "eggplant", emoji: "🍆", label: "EGGPLANT", verb: "egged.", spin: true },
];

const pk = (a) => a[(Math.random() * a.length) | 0];
const shuffle = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [b[i], b[j]] = [b[j], b[i]]; } return b; };
const EASE = "cubic-bezier(.34,1.56,.64,1)", OUT = "cubic-bezier(0.23,1,0.32,1)", INOUT = "cubic-bezier(0.77,0,0.175,1)";
const FLY_MS = 560;

function Chest({ open, highlight }) {
  return (
    <div style={{ position: "relative", width: 130, height: 104 }}>
      <div style={{ position: "absolute", bottom: 0, width: 130, height: 66, borderRadius: 10, background: "linear-gradient(#7a4a22,#54300f)", border: "3px solid #35200e", boxShadow: "inset 0 -6px 0 #0003, 0 8px 16px #0007" }} />
      <div style={{ position: "absolute", bottom: 28, width: 130, height: 11, background: "linear-gradient(#f6cf5b,#b8860b)" }} />
      <div style={{ position: "absolute", bottom: 22, left: 57, width: 18, height: 22, background: "#f6cf5b", border: "2px solid #7a5a0b", borderRadius: 3, zIndex: 2 }} />
      {open && <div style={{ position: "absolute", bottom: 44, left: 22, width: 86, height: 44, borderRadius: "50%", background: `radial-gradient(circle, ${highlight}, transparent 70%)`, filter: "blur(5px)", animation: "glowUp 420ms ease-out" }} />}
      <div style={{ position: "absolute", bottom: 58, left: -2, width: 134, height: 42, borderRadius: "12px 12px 5px 5px", background: "linear-gradient(#8a5528,#663913)", border: "3px solid #35200e", transformOrigin: "bottom center", transform: `rotateX(${open ? -118 : 0}deg)`, transition: `transform 460ms ${EASE}` }} />
    </div>
  );
}

function Plate({ name, color, hl, win, glow }) {
  return (
    <div style={{ position: "relative", width: 168, padding: "12px 8px", borderRadius: 14, textAlign: "center", fontWeight: 900, fontSize: 20, lineHeight: 1.05, color: "#0b0d16", background: color, border: "2px solid #00000033", boxShadow: win || glow ? `0 0 60px ${hl}, 0 0 0 4px ${hl}` : "0 8px 16px #0009" }}>
      {name}
      {win && <div style={{ position: "absolute", top: -50, left: "50%", transform: "translateX(-50%)", fontSize: 46, animation: `crownDrop 500ms ${EASE} both` }}>👑</div>}
    </div>
  );
}

export default function ChestDuel({ candidates, winnerId, theme, onDone }) {
  const C = theme.colors;
  const [view, setView] = useState({ mode: "intro" });
  const [dead, setDead] = useState(() => new Set());
  const [fx, setFx] = useState([]);
  const T = useRef([]); const doneRef = useRef(false);
  const push = (ms, fn) => T.current.push(setTimeout(fn, ms));
  const bang = (o) => setFx((f) => [...f, { id: Math.random(), born: performance.now(), ...o }]);
  const colorOf = useRef(Object.fromEntries(candidates.map((c, i) => [c.id, PALETTE[i % PALETTE.length]]))).current;
  const byId = (id) => candidates.find((c) => c.id === id);

  useEffect(() => {
    const reduce = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finish = () => {
      setView((v) => ({ ...v, mode: "win" }));
      for (let k = 0; k < 46; k++) bang({ confetti: true, x: CX, y: CY - 40, vx: (Math.random() - .5) * 22, vy: -Math.random() * 16 - 4, color: [C.highlight, C.accent, APPLE, CREAM][k % 4] });
      push(S(1900), () => { if (!doneRef.current) { doneRef.current = true; onDone && onDone(); } });
    };
    if (reduce || candidates.length < 2) { finish(); return () => T.current.forEach(clearTimeout); }

    const nonW = shuffle(candidates.filter((c) => c.id !== winnerId).map((c) => c.id));
    const finalist = nonW[nonW.length - 1];
    const quickVictims = nonW.slice(0, -1);
    const alive = new Set(candidates.map((c) => c.id));

    const runDuel = ({ aId, bId, dud, isFinal }, next) => {
      const [cA, cB] = shuffle([0, 1, 2]);
      const aCorner = cA < cB ? 0 : 1, bCorner = 1 - aCorner;
      const aItem = pk(WHIFF);
      const bItem = dud ? pk(WHIFF.filter((w) => w.id !== aItem.id)) : pk(KILL);
      const d = { aId, bId, cA, cB, aCorner, bCorner, aItem, bItem, dud, isFinal, step: "enter" };
      lastPair = [aId, bId];
      setView({ mode: "duel", d });
      const setStep = (s) => setView((v) => (v.mode === "duel" ? { ...v, d: { ...v.d, step: s } } : v));
      push(S(300), () => setStep("line"));
      push(S(1250), () => setStep("walk"));
      push(S(1950), () => setStep("open"));
      push(S(2300), () => setStep("reveal"));
      push(S(3200), () => setStep("corner"));
      push(S(3950), () => setStep("throw1"));
      push(S(3950) + 30, () => setStep("fly1"));
      push(S(3950) + 30 + S(FLY_MS), () => {
        setStep("land1");
        bang({ verb: aItem.verb, small: true, x: CORNER_X[bCorner], y: FLOOR - 120, color: "#cfd6e6" });
      });
      push(S(5100), () => setStep("throw2"));
      push(S(5100) + 30, () => setStep("fly2"));
      push(S(5100) + 30 + S(FLY_MS), () => {
        if (dud) {
          setStep("land2");
          bang({ verb: bItem.verb, small: true, x: CORNER_X[aCorner], y: FLOOR - 120, color: "#cfd6e6" });
          bang({ verb: "NOBODY DIES!", x: CX, y: CHEST_Y - 90, color: C.accent });
        } else {
          setStep("dead");
          alive.delete(aId); setDead((s) => new Set([...s, aId]));
          bang({ boom: true, x: CORNER_X[aCorner], y: FLOOR - 20, color: C.highlight });
          if (bItem.boomx2) bang({ boom: true, big: 1.6, x: CORNER_X[aCorner], y: FLOOR - 20, color: APPLE });
          bang({ verb: bItem.verb.toUpperCase(), x: CORNER_X[aCorner], y: FLOOR - 120, color: C.highlight, big: isFinal });
        }
      });
      push(S(6150), () => setStep("exit"));
      push(S(6750), next);
    };

    let lastPair = [];
    const randomOpp = (not) => {
      const all = [...alive].filter((id) => id !== not);
      const fresh = all.filter((id) => !lastPair.includes(id));
      const pool = fresh.length ? fresh : all;
      return pool[(Math.random() * pool.length) | 0];
    };

    const runQuick = (i) => {
      if (i >= quickVictims.length) {
        setView({ mode: "finalIntro" });
        push(S(1400), () => {
          const fin = () => runDuel({ aId: finalist, bId: winnerId, dud: false, isFinal: true }, finish);
          if (Math.random() < 0.4) runDuel({ aId: finalist, bId: winnerId, dud: true, isFinal: true }, fin);
          else fin();
        });
        return;
      }
      const victim = quickVictims[i];
      const go = () => runDuel({ aId: victim, bId: randomOpp(victim), dud: false, isFinal: false }, () => runQuick(i + 1));
      if (Math.random() < 0.10) {
        const freshAll = [...alive].filter((id) => !lastPair.includes(id));
        const p1 = pk(freshAll.length ? freshAll : [...alive]); const p2 = randomOpp(p1);
        runDuel({ aId: p1, bId: p2, dud: true, isFinal: false }, go);
      } else go();
    };

    setView({ mode: "intro" });
    push(S(1200), () => runQuick(0));
    return () => T.current.forEach(clearTimeout);
  }, []);

  useEffect(() => {
    let raf;
    const tick = () => {
      const now = performance.now();
      setFx((f) => f.filter((o) => now - o.born < (o.confetti ? 2400 : o.boom ? 700 : 1000)).map((o) => o.confetti ? { ...o, x: o.x + o.vx, y: o.y + o.vy, vy: o.vy + 0.5 } : o));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  // Stage-fill: scale canvas to fill StageFrame (accounts for both dimensions, no max-1 cap)
  const wrapRef = useRef(null); const [fit, setFit] = useState(1);
  useEffect(() => { const el = wrapRef.current; if (!el) return; const ro = new ResizeObserver(() => setFit(Math.min(el.clientWidth / AREA_W, el.clientHeight / AREA_H))); ro.observe(el); return () => ro.disconnect(); }, []);

  const { mode } = view; const d = view.d;
  const win = byId(winnerId) || candidates[0];
  const survivors = candidates.filter((c) => !dead.has(c.id));

  const nL = Math.ceil(candidates.length / 2);
  const rosterTop = 120, rosterH = AREA_H - 240;
  const rosterPos = (i) => {
    const side = i < nL ? "L" : "R", idx = side === "L" ? i : i - nL, count = side === "L" ? nL : candidates.length - nL;
    const step = rosterH / Math.max(1, count);
    return { x: side === "L" ? 14 : AREA_W - 152, y: rosterTop + step * idx + step / 2 - 22 };
  };

  const stageBg = `radial-gradient(ellipse 70% 55% at 50% 42%, ${C.accent}2b 0%, transparent 60%), radial-gradient(ellipse at center, ${C.bg} 0%, ${C.bgDeep} 82%)`;

  const duel = d && (() => {
    const atChest = ["walk", "open", "reveal"].includes(d.step);
    const revealed = ["reveal", "corner", "throw1", "fly1", "land1", "throw2", "fly2", "dead", "land2"].includes(d.step);
    const open = !["enter", "line", "walk"].includes(d.step);
    const pos = (who) => {
      const chest = who === "a" ? d.cA : d.cB, corner = who === "a" ? d.aCorner : d.bCorner;
      if (d.step === "enter") return { x: corner === 0 ? -120 : AREA_W + 120, y: FLOOR };
      if (atChest) return { x: CHESTS_X[chest], y: CHEST_Y + 118 };
      return { x: CORNER_X[corner], y: FLOOR };
    };
    return { atChest, revealed, open, pos };
  })();

  const flyA = d && (d.step === "throw1" || d.step === "fly1");
  const flyB = d && (d.step === "throw2" || d.step === "fly2");

  return (
    <div ref={wrapRef} style={{ width: "100%", height: "100%", position: "relative", overflow: "hidden" }}>
      <div style={{ width: AREA_W, height: AREA_H, position: "absolute", top: "50%", left: "50%", transformOrigin: "center", transform: `translate(-50%,-50%) scale(${fit})` }}>
        <div style={{ width: AREA_W, height: AREA_H, position: "relative", overflow: "hidden", borderRadius: 20, border: `2px solid ${C.accent}44`, background: stageBg, animation: "popStage 420ms cubic-bezier(.2,1.2,.3,1)" }}>
          <div style={{ position: "absolute", left: 170, right: 170, top: FLOOR + 44, height: 3, background: `linear-gradient(90deg, transparent, ${C.accent}66, transparent)` }} />

          {/* headline */}
          <div style={{ position: "absolute", top: 30, left: 0, right: 0, textAlign: "center", zIndex: 55 }}>
            {mode === "intro" && <div style={{ fontWeight: 900, fontSize: 40, letterSpacing: 6, color: "#fff" }}>🎁 CHEST DUEL 🎁</div>}
            {mode === "duel" && !d.isFinal && <div style={{ fontWeight: 900, fontSize: 24, letterSpacing: 4, color: C.accent }}>{survivors.length} REMAIN</div>}
            {mode === "finalIntro" && <div style={{ fontWeight: 900, fontSize: 38, letterSpacing: 6, color: C.highlight, textShadow: `0 0 26px ${C.highlight}`, animation: "popIn 320ms ease-out" }}>⚔️ THE FINAL ⚔️</div>}
            {mode === "duel" && d.isFinal && (d.step === "enter" || d.step === "walk") && <div style={{ fontWeight: 900, fontSize: 30, letterSpacing: 4, color: C.highlight, textShadow: `0 0 24px ${C.highlight}`, animation: "popIn 300ms ease-out" }}>CHOOSE YOUR CHEST</div>}
          </div>

          {/* roster */}
          {candidates.map((c, i) => {
            const p = rosterPos(i), isDead = dead.has(c.id);
            const active = mode === "duel" && (c.id === d.aId || c.id === d.bId);
            return (
              <div key={"r" + c.id} style={{ position: "absolute", left: p.x, top: p.y, width: 138, opacity: isDead ? 0.38 : 1, transition: "opacity 350ms", animation: "rosterIn 300ms cubic-bezier(0.23,1,0.32,1) backwards", animationDelay: `${i * 40}ms` }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "5px 7px", borderRadius: 8, background: active ? `${C.accent}22` : "transparent", outline: active ? `1px solid ${C.accent}88` : "none" }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3, background: colorOf[c.id], flex: "none" }} />
                  <span style={{ fontSize: 13, fontWeight: 800, color: "#e8ecf5", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", textDecoration: isDead ? "line-through" : "none" }}>{c.name}</span>
                  {isDead && <span style={{ fontSize: 12 }}>💀</span>}
                </div>
              </div>
            );
          })}

          {/* the three chests — always on stage */}
          {[0, 1, 2].map((k) => (
            <div key={"c" + k} style={{ position: "absolute", left: CHESTS_X[k], top: CHEST_Y, transform: "translate(-50%,-50%)", animation: "riseIn 600ms cubic-bezier(.34,1.56,.64,1) both", animationDelay: `${k * 70}ms` }}>
              <Chest open={!!(duel && duel.open && mode === "duel" && (k === d.cA || k === d.cB))} highlight={C.highlight} />
            </div>
          ))}

          {/* current duel */}
          {mode === "duel" && duel && ["a", "b"].map((who) => {
            const id = who === "a" ? d.aId : d.bId;
            const item = who === "a" ? d.aItem : d.bItem;
            const c = byId(id);
            const { x, y: py } = duel.pos(who);
            const flying = who === "a" ? flyA : flyB;
            const thrownAway = who === "a"
              ? ["fly1", "land1", "throw2", "fly2", "dead", "land2", "exit"].includes(d.step)
              : ["fly2", "dead", "land2", "exit"].includes(d.step);
            const gone = (d.step === "dead" || d.step === "exit") && who === "a" && !d.dud;
            const itemAboveChest = duel.atChest || d.step === "enter";
            const myCorner = who === "a" ? d.aCorner : d.bCorner;
            const targetCorner = who === "a" ? d.bCorner : d.aCorner;
            const launched = who === "a" ? d.step === "fly1" : d.step === "fly2";
            return (
              <React.Fragment key={id}>
                <div style={{ position: "absolute", left: 0, top: 0, transform: `translate3d(${x}px,${py}px,0) translate(-50%,-50%) ${gone ? "translateY(56px) rotate(80deg)" : ""}`, opacity: d.step === "exit" ? 0 : 1, transition: `transform ${gone ? `${S(450)}ms ease-in` : `${S(620)}ms ${INOUT}`}, opacity ${S(480)}ms ease-out`, filter: gone ? "grayscale(1) brightness(.7)" : "none", animation: `fadeIn ${S(420)}ms ease-out backwards`, animationDelay: who === "b" ? "60ms" : "0ms", willChange: "transform", zIndex: 20 }}>
                  <Plate name={c.name} color={colorOf[id]} hl={C.highlight} glow={d.isFinal && d.step === "enter"} />
                </div>
                {duel.revealed && !thrownAway && !flying && (
                  <div style={{ position: "absolute", left: 0, top: 0, transform: `translate3d(${itemAboveChest ? CHESTS_X[who === "a" ? d.cA : d.cB] : x}px,${itemAboveChest ? CHEST_Y - 104 : FLOOR - 128}px,0) translateX(-50%)`, textAlign: "center", transition: `transform ${S(620)}ms ${INOUT}`, animation: `itemPop ${S(380)}ms ease-out both`, willChange: "transform", zIndex: 26 }}>
                    <div style={{ fontSize: 66, filter: `drop-shadow(0 0 12px ${C.highlight})`, lineHeight: 1, animation: `itemScale ${S(380)}ms ${EASE} both` }}>{item.emoji}</div>
                    <div style={{ marginTop: 3, fontWeight: 900, fontSize: 14, letterSpacing: 1, color: "#eef2fb", whiteSpace: "nowrap" }}>{item.label}</div>
                  </div>
                )}
                {flying && (
                  <div style={{ position: "absolute", left: 0, top: 0, transform: `translate3d(${launched ? CORNER_X[targetCorner] : CORNER_X[myCorner]}px,${FLOOR - 120}px,0) translate(-50%,-50%)`, transition: `transform ${S(FLY_MS)}ms ${OUT}`, willChange: "transform", zIndex: 30 }}>
                    <span style={{ display: "inline-block", fontSize: 62, filter: `drop-shadow(0 0 14px ${C.highlight})`, animation: `${item.spin ? "spinFly" : "arcY"} ${S(FLY_MS)}ms linear` }}>{item.emoji}</span>
                  </div>
                )}
              </React.Fragment>
            );
          })}

          {/* win */}
          {mode === "win" && (
            <div style={{ position: "absolute", left: 0, top: 0, zIndex: 40, "--wx0": `${d ? CORNER_X[d.bCorner] : CX}px`, "--wy0": `${d ? FLOOR : CY}px`, animation: `winPop 650ms ${INOUT} both` }}>
              <Plate name={win.name} color={colorOf[win.id]} hl={C.highlight} win />
            </div>
          )}

          {/* fx */}
          {fx.map((o) => {
            if (o.confetti) return <div key={o.id} style={{ position: "absolute", left: o.x, top: o.y, width: 12, height: 18, background: o.color, borderRadius: 2, transform: `rotate(${o.x}deg)`, zIndex: 45 }} />;
            if (o.boom) return <div key={o.id} style={{ position: "absolute", left: o.x, top: o.y, width: 90 * (o.big || 1), height: 90 * (o.big || 1), marginLeft: -45 * (o.big || 1), marginTop: -45 * (o.big || 1), borderRadius: "50%", background: `radial-gradient(circle, #fff, ${o.color} 40%, transparent 70%)`, animation: "boom 640ms ease-out forwards", zIndex: 44 }} />;
            return <div key={o.id} style={{ position: "absolute", left: o.x, top: o.y, transform: "translate(-50%,-50%) rotate(-8deg)", fontWeight: 900, fontSize: o.big ? 72 : o.small ? 34 : 48, color: o.color, textShadow: `0 0 22px ${o.color}, 3px 3px 0 #000`, animation: "koPop 500ms ease-out", zIndex: 48 }}>{o.verb}</div>;
          })}
        </div>
      </div>
      <style>{`@keyframes popStage{0%{transform:scale(.9);opacity:0}100%{transform:scale(1);opacity:1}}@keyframes glowUp{0%{opacity:0;transform:scale(.4)}100%{opacity:1;transform:scale(1)}}@keyframes itemPop{0%{opacity:0}100%{opacity:1}}@keyframes popIn{0%{transform:scale(.95);opacity:0}100%{transform:scale(1);opacity:1}}@keyframes winPop{0%{transform:translate3d(var(--wx0),var(--wy0),0) translate(-50%,-50%) scale(1);opacity:1}100%{transform:translate3d(${CX}px,${CY}px,0) translate(-50%,-50%) scale(1.35);opacity:1}}@keyframes itemScale{0%{transform:scale(.9) translateY(8px)}100%{transform:scale(1) translateY(0)}}@keyframes rosterIn{0%{opacity:0;transform:translateY(8px)}100%{opacity:1;transform:translateY(0)}}@keyframes fadeIn{0%{opacity:0}100%{opacity:1}}@keyframes crownDrop{0%{transform:translateX(-50%) translateY(-30px) scale(.4);opacity:0}100%{transform:translateX(-50%) translateY(0) scale(1);opacity:1}}@keyframes boom{0%{transform:scale(.2);opacity:1}100%{transform:scale(4.2);opacity:0}}@keyframes koPop{0%{transform:translate(-50%,-50%) rotate(-8deg) scale(.3)}70%{transform:translate(-50%,-50%) rotate(-8deg) scale(1.25)}100%{transform:translate(-50%,-50%) rotate(-8deg) scale(1)}}@keyframes riseIn{0%{transform:translate(-50%,-50%) translateY(110px);opacity:0}100%{transform:translate(-50%,-50%) translateY(0);opacity:1}}@keyframes spinFly{0%{transform:rotate(0) translateY(0)}30%{transform:rotate(140deg) translateY(-46px)}70%{transform:rotate(260deg) translateY(-40px)}100%{transform:rotate(360deg) translateY(0)}}@keyframes arcY{0%{transform:translateY(0)}40%{transform:translateY(-52px)}100%{transform:translateY(0)}}@media (prefers-reduced-motion:reduce){*{animation-duration:1ms!important;transition-duration:1ms!important}}`}</style>
    </div>
  );
}
