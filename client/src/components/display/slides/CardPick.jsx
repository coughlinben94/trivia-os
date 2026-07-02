import React, { useState, useEffect, useMemo, useRef } from "react";

/**
 * Trivia OS — "CARD PICK" selection animation (SHIPPED)
 * Contract: { candidates, winnerId, theme, onDone }
 *   theme.colors { bg, bgDeep, accent, highlight } — stage lighting tracks the night.
 * Stage: fixed 1344x756 (70% of 1080p) popup.
 * Flow: face-down DECK → DEAL into auto grid → FLIP (names) → GATHER →
 *       5 SHUFFLE waves → DRAW → REVEAL. Winner predetermined (fair).
 *
 * PORT: delete DEMO_THEMES + harness switcher; pass real theme from ThemeProvider
 *       (getTheme(show.theme_id), overrides already merged).
 */

const FOREST = "#0a4d2c";   // deck identity — constant across themes
const CREAM = "#f5f0e8";
const APPLE = "#e02020";
const AREA_W = 1344, AREA_H = 756;
const CX = AREA_W / 2, CY = AREA_H / 2;
const CARD_W = 150, CARD_H = 210;
const SP = 1.15;            // global slowdown factor

const SUITS = [{ s: "\u2660", c: "#1a1a1a" }, { s: "\u2665", c: APPLE }, { s: "\u2666", c: APPLE }, { s: "\u2663", c: "#1a1a1a" }];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[(Math.random() * arr.length) | 0];
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

const SPREAD = [true, false, true, false, true];
const SDUR = 450;

function bestGrid(n, pad = 26) {
  let best = { cols: n, rows: 1, s: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const s = Math.min((AREA_W / cols - pad) / CARD_W, (AREA_H / rows - pad) / CARD_H);
    if (s > best.s) best = { cols, rows, s };
  }
  best.s = clamp(best.s, 0.5, 1.7);
  return best;
}

export default function CardPick({ candidates, winnerId, theme, onDone }) {
  const n = candidates.length;
  const C = theme.colors;
  const [stage, setStage] = useState("deck");
  const [wave, setWave] = useState(0);
  const [revealed, setRevealed] = useState(false);

  const wrapRef = useRef(null);
  const [fit, setFit] = useState(1);
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setFit(Math.min(1, el.clientWidth / AREA_W)));
    ro.observe(el); return () => ro.disconnect();
  }, []);

  const cards = useMemo(() => candidates.map((c) => ({ ...c, suit: pick(SUITS), rank: pick(RANKS) })), [candidates]);
  const grid = useMemo(() => bestGrid(n), [n]);
  const gridPos = useMemo(() => {
    const { cols, rows, s } = grid;
    const cellW = AREA_W / cols, cellH = AREA_H / rows;
    const startY = (AREA_H - rows * cellH) / 2;
    return cards.map((_, i) => {
      const r = Math.floor(i / cols);
      const inRow = r < rows - 1 ? cols : n - cols * (rows - 1);
      const startX = (AREA_W - inRow * cellW) / 2;
      const col = i - r * cols;
      return { x: startX + cellW * (col + 0.5), y: startY + cellH * (r + 0.5), scale: s };
    });
  }, [cards, grid, n]);

  const waves = useMemo(() => SPREAD.map((spread) =>
    cards.map(() => spread
      ? { x: CX + rand(-AREA_W * 0.4, AREA_W * 0.4), y: CY + rand(-AREA_H * 0.4, AREA_H * 0.4), rot: rand(-220, 220), scale: rand(0.7, 0.92) }
      : { x: CX + rand(-90, 90), y: CY + rand(-55, 55), rot: rand(-45, 45), scale: rand(0.78, 0.9) }
    )
  ), [cards]);

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  useEffect(() => {
    if (reducedMotion) {
      const t = setTimeout(() => onDone?.(), 1500);
      return () => clearTimeout(t);
    }
    const timers = [];
    const at = (t, fn) => timers.push(setTimeout(fn, t));
    let clk = 380 * SP;
    at(clk, () => setStage("deal")); clk += (n * 70 + 520 + 120) * SP;
    at(clk, () => setStage("flip")); clk += (n * 35 + 420 + 1200) * SP;
    at(clk, () => setStage("gather")); clk += 640 * SP;
    for (let w = 0; w < 5; w++) { const ww = w; at(clk, () => { setStage("shuffle"); setWave(ww); }); clk += SDUR * SP; }
    at(clk, () => setStage("draw")); clk += 820 * SP;
    at(clk, () => { setStage("reveal"); setRevealed(true); }); clk += 1150 * SP;
    at(clk, () => onDone && onDone());
    return () => timers.forEach(clearTimeout);
  }, []);

  if (reducedMotion) {
    const winner = candidates.find(c => c.id === winnerId);
    return (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: C.bgDeep }}>
        <div style={{ padding: "28px 56px", borderRadius: 20, background: C.accent, fontWeight: 900, fontSize: 52, color: C.bgDeep, textAlign: "center" }}>
          {winner?.name ?? "Winner"}
        </div>
      </div>
    );
  }

  const deck = (i) => ({ x: CX + (i - (n - 1) / 2) * 0.7, y: CY - i * 0.5, rot: i % 2 ? -1.5 : 1.5, ry: 180, scale: grid.s, z: i, dur: 480, delay: 0, op: 1 });

  const layout = (card, i) => {
    const isWin = card.id === winnerId;
    const g = gridPos[i];
    if (stage === "deck") return deck(i);
    if (stage === "deal") return { x: g.x, y: g.y, rot: 0, ry: 180, scale: g.scale, z: i, dur: 520, delay: i * 70, op: 1 };
    if (stage === "flip") return { x: g.x, y: g.y, rot: 0, ry: 0, scale: g.scale, z: i, dur: 420, delay: i * 35, op: 1 };
    if (stage === "gather") return { ...deck(i), delay: (n - i) * 20 };
    if (stage === "shuffle") { const p = waves[wave][i]; return { ...p, ry: 180, z: i, dur: SDUR - 20, delay: 0, op: 1 }; }
    const last = waves[4][i];
    if (stage === "draw") return isWin
      ? { x: CX, y: CY, rot: 0, ry: 180, scale: 1.7, z: 999, dur: 700, delay: 0, op: 1 }
      : { ...last, ry: 180, scale: 0.66, z: i, dur: 520, delay: 0, op: 0.3 };
    return isWin
      ? { x: CX, y: CY, rot: 0, ry: 0, scale: 1.85, z: 999, dur: 540, delay: 0, op: 1, glow: true }
      : { ...last, ry: 180, scale: 0.6, z: i, dur: 400, delay: 0, op: 0.15 };
  };

  const stageBg = `radial-gradient(ellipse 72% 58% at 50% 44%, ${C.accent}2b 0%, transparent 62%), radial-gradient(ellipse at center, ${C.bg} 0%, ${C.bgDeep} 82%)`;
  const corner = { position: "absolute", fontWeight: 900, fontSize: 22, lineHeight: 1 };

  return (
    <div ref={wrapRef} style={{ width: "100%", height: AREA_H * fit }}>
      <div style={{ width: AREA_W, height: AREA_H, transformOrigin: "top left", transform: `scale(${fit})` }}>
        <div style={{ width: AREA_W, height: AREA_H, position: "relative", overflow: "hidden", borderRadius: 20, border: `2px solid ${C.accent}44`, background: stageBg, animation: "popStage 420ms cubic-bezier(.2,1.2,.3,1)" }}>
          {cards.map((card, i) => {
            const L = layout(card, i);
            const glow = L.glow;
            const sc = card.suit.c;
            return (
              <div key={card.id} style={{
                position: "absolute", left: 0, top: 0, width: CARD_W, height: CARD_H,
                transform: `translate(${L.x - CARD_W / 2}px, ${L.y - CARD_H / 2}px) rotate(${L.rot}deg) scale(${L.scale})`,
                transformStyle: "preserve-3d", transition: `transform ${L.dur * SP}ms cubic-bezier(.2,.8,.25,1) ${L.delay * SP}ms, opacity ${L.dur * SP}ms ${L.delay * SP}ms`,
                opacity: L.op, zIndex: L.z,
              }}>
                <div style={{ width: "100%", height: "100%", position: "relative", transformStyle: "preserve-3d", transition: `transform ${L.dur * SP}ms cubic-bezier(.3,.9,.2,1) ${L.delay * SP}ms`, transform: `rotateY(${L.ry}deg)` }}>
                  {/* FRONT — playing card */}
                  <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", borderRadius: 14, background: CREAM, border: `4px solid ${glow ? C.highlight : "#d8cfbf"}`, boxShadow: glow ? `0 0 90px ${C.highlight}, 0 0 0 4px ${C.highlight}` : "0 12px 28px #000a" }}>
                    <span style={{ ...corner, top: 8, left: 9, color: sc }}>{card.suit.s}</span>
                    <span style={{ ...corner, top: 8, right: 9, color: sc }}>{card.rank}</span>
                    <span style={{ ...corner, bottom: 8, left: 9, color: sc, transform: "rotate(180deg)" }}>{card.rank}</span>
                    <span style={{ ...corner, bottom: 8, right: 9, color: sc, transform: "rotate(180deg)" }}>{card.suit.s}</span>
                    <div style={{ position: "absolute", inset: "30px 12px", display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center", fontWeight: 900, fontSize: 22, color: FOREST, lineHeight: 1.08 }}>{card.name}</div>
                  </div>
                  {/* BACK — Baynes card back */}
                  <div style={{ position: "absolute", inset: 0, backfaceVisibility: "hidden", transform: "rotateY(180deg)", borderRadius: 14, border: `5px solid ${CREAM}`, boxShadow: "0 12px 28px #000a", background: `repeating-linear-gradient(45deg, ${FOREST} 0 12px, #0c5a34 12px 24px)`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <div style={{ width: 66, height: 66, borderRadius: "50%", background: CREAM, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 34, boxShadow: `0 0 0 4px ${APPLE}` }}>🍎</div>
                  </div>
                </div>
              </div>
            );
          })}

          {revealed && Array.from({ length: 54 }).map((_, k) => (
            <div key={k} style={{ position: "absolute", left: CX, top: CY, width: 12, height: 18, borderRadius: 2, background: [C.highlight, C.accent, APPLE, CREAM][k % 4], animation: `conf ${1800 * SP}ms ease-out ${(k % 9) * 30}ms forwards`, ["--dx"]: `${rand(-420, 420)}px`, ["--dy"]: `${rand(-300, 60)}px`, ["--r"]: `${rand(-360, 360)}deg` }} />
          ))}
        </div>
      </div>
      <style>{`@keyframes popStage{0%{transform:scale(.9);opacity:0}100%{transform:scale(1);opacity:1}}@keyframes conf{0%{transform:translate(-50%,-50%) rotate(0);opacity:1}100%{transform:translate(calc(-50% + var(--dx)),calc(-50% + var(--dy) + 380px)) rotate(var(--r));opacity:0}}`}</style>
    </div>
  );
}
