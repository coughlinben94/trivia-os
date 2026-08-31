import { useState, useMemo, useRef, useEffect } from 'react'
import { derivePalette } from '../../lib/weightedPalette.js'
import { midnightGalaxyRing } from '../../worlds/midnightGalaxy.ring.js'
import RingAmbient from '../display/RingAmbient.jsx'

// Weighted world-palette picker (Midnight Galaxy only — one world exists;
// no multi-world abstraction until a second world does). Two rows: 2-3
// native colour swatches, one stacked weight bar with draggable dividers.
// Weights sum to 100% by construction. Below: a live isolated RingAmbient
// preview plus a read-only consequences panel.
//
// The preview instance is a throwaway clone fed a cloned worldData — never
// the show's real instance, which keeps reading the unmutated
// midnightGalaxyRing import (ring worlds are palette-fixed by design).
// RingAmbient builds its DOM world ONCE on mount and never re-runs on
// worldData change, so the preview is keyed by the derived hues and
// REMOUNTS when the committed palette changes. A remount rebuilds a
// ~5,000-element DOM world, so commits happen on drag-END (pointer-up) and
// debounced colour-input changes — never per mousemove. The cheap readouts
// (bar, station dots, advisory table) do track every drag tick.
//
// TODO(Task 4, post-show): the ring-apply exit is deliberately NOT built
// here. When it is, prefer a small node script that writes BOTH
// client/src/worlds/midnightGalaxy.ring.js's hue constants AND
// concepts/world-07-ring.html's independent station array from one
// derivePalette output — never a hand-transcribed paste block. The gate
// (npm run verify:ring) reads ONLY the HTML file; a manual transcription
// slip there means the gate silently certifies stale colors.

const SNAP = 0.05
const MIN_WEIGHT = 0.05
const COLOR_DEBOUNCE_MS = 400

const CURRENT_HUES = midnightGalaxyRing.stations.map(s => s.hue)

// Cumulative divider positions, so dragging one divider moves weight
// between exactly its two neighbours and the total is 1 by construction.
function WeightBar({ colors, weights, onChange, onCommit }) {
  const barRef = useRef(null)
  const cuts = weights.slice(0, -1).map((_, i) =>
    weights.slice(0, i + 1).reduce((a, b) => a + b, 0))

  function dragCut(index, clientX) {
    const rect = barRef.current.getBoundingClientRect()
    const raw = (clientX - rect.left) / rect.width
    const lo = (index === 0 ? 0 : cuts[index - 1]) + MIN_WEIGHT
    const hi = (index === cuts.length - 1 ? 1 : cuts[index + 1]) - MIN_WEIGHT
    const snapped = Math.round(Math.min(hi, Math.max(lo, raw)) / SNAP) * SNAP
    const next = [...cuts]
    next[index] = snapped
    const bounds = [0, ...next, 1]
    onChange(bounds.slice(1).map((v, i) => +(v - bounds[i]).toFixed(2)))
  }

  return (
    <div ref={barRef} className="relative h-12 w-full rounded-lg overflow-hidden select-none flex">
      {weights.map((w, i) => (
        <div
          key={i}
          className="h-full flex items-center justify-center text-xs font-semibold text-white"
          style={{ width: `${w * 100}%`, background: colors[i], textShadow: '0 1px 3px rgba(0,0,0,.7)' }}
        >
          {Math.round(w * 100)}%
        </div>
      ))}
      {cuts.map((c, i) => (
        <div
          key={i}
          role="separator"
          aria-label={`Weight between color ${i + 1} and color ${i + 2}`}
          onPointerDown={e => e.currentTarget.setPointerCapture(e.pointerId)}
          onPointerMove={e => {
            if (e.currentTarget.hasPointerCapture?.(e.pointerId)) dragCut(i, e.clientX)
          }}
          onPointerUp={e => {
            e.currentTarget.releasePointerCapture?.(e.pointerId)
            onCommit()
          }}
          className="absolute top-0 h-full w-3 -ml-1.5 cursor-col-resize touch-none"
          style={{ left: `${c * 100}%` }}
        >
          <div className="mx-auto h-full w-0.5 bg-white/90 shadow" />
        </div>
      ))}
    </div>
  )
}

export default function WorldPaletteEditor({ onClose, baseTheme, onApplyThemeColors }) {
  const [colors, setColors]   = useState(['#a855f7', '#3b82f6'])
  const [weights, setWeights] = useState([0.65, 0.35])
  // The palette the (expensive-to-remount) ring preview actually renders.
  // Trails the live state: synced on drag-end / debounced colour change.
  const [committed, setCommitted] = useState({ colors: ['#a855f7', '#3b82f6'], weights: [0.65, 0.35] })
  const [previewStation, setPreviewStation] = useState(0)
  const colorDebounceRef = useRef(null)

  useEffect(() => () => clearTimeout(colorDebounceRef.current), [])

  function commit(nextColors = colors, nextWeights = weights) {
    setCommitted({ colors: nextColors, weights: nextWeights })
  }

  function commitColorsDebounced(nextColors, nextWeights) {
    // <input type="color"> fires onChange continuously while dragging the
    // native picker — debounce the preview remount, not the swatch itself.
    clearTimeout(colorDebounceRef.current)
    colorDebounceRef.current = setTimeout(() => commit(nextColors, nextWeights), COLOR_DEBOUNCE_MS)
  }

  function setColor(i, value) {
    const next = colors.map((v, j) => (j === i ? value : v))
    setColors(next)
    commitColorsDebounced(next, weights)
  }

  function addThird() {
    const nextColors = [...colors, '#f97316']
    // Take the new colour's share from the largest existing weight, so the
    // bar never jumps to an unrecognisable layout on add.
    const big = weights.indexOf(Math.max(...weights))
    const nw = [...weights]
    nw[big] = +(nw[big] - 0.15).toFixed(2)
    const nextWeights = [...nw, 0.15]
    setColors(nextColors)
    setWeights(nextWeights)
    commit(nextColors, nextWeights)
  }

  function removeThird() {
    // Fold the third colour's weight into its left neighbour.
    const nextColors = colors.slice(0, 2)
    const nextWeights = [weights[0], +(weights[1] + weights[2]).toFixed(2)]
    setColors(nextColors)
    setWeights(nextWeights)
    commit(nextColors, nextWeights)
  }

  // Live derivation — cheap pure math, fine to run per drag tick for the
  // station dots, swatch row, and advisory table.
  const derived = useMemo(() => derivePalette({
    colors, weights, stationCount: CURRENT_HUES.length,
    baseTheme, currentHues: CURRENT_HUES,
  }), [colors, weights, baseTheme])

  // Committed derivation — drives the ring preview only.
  const previewDerived = useMemo(() => derivePalette({
    colors: committed.colors, weights: committed.weights,
    stationCount: CURRENT_HUES.length, baseTheme, currentHues: CURRENT_HUES,
  }), [committed, baseTheme])

  const previewWorldData = useMemo(() => ({
    ...midnightGalaxyRing,
    hueAnchors: previewDerived.hueAnchors,
    stations: midnightGalaxyRing.stations.map((st, i) => ({ ...st, hue: previewDerived.hues[i] })),
  }), [previewDerived])

  // Remount key: RingAmbient builds once on mount by design, so a new
  // palette needs a new instance. (Coexists fine with the theme modal's
  // own iframe-hosted instance — RingAmbient keeps all real state in
  // per-instance refs; only the window.__world debug handle is shared,
  // last-mounted wins, harmless.)
  const previewKey = previewDerived.hues.join(',')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-6" onClick={onClose}>
      <div
        className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 1040, maxWidth: '96vw', maxHeight: '90vh' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100 shrink-0">
          <h2 className="text-sm font-semibold text-gray-800">World palette — Midnight Galaxy</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg text-sm">✕</button>
        </div>

        <div className="px-5 py-4 border-b border-gray-100 shrink-0 space-y-3">
          <div className="flex items-center gap-3">
            {colors.map((c, i) => (
              <input
                key={i}
                type="color"
                value={c}
                aria-label={`Palette color ${i + 1}`}
                onChange={e => setColor(i, e.target.value)}
                className="w-10 h-10 border border-gray-200 rounded-lg cursor-pointer"
              />
            ))}
            {colors.length === 2
              ? <button onClick={addThird} className="text-xs font-medium text-gray-500 hover:text-gray-900 underline">+ add a third color</button>
              : <button onClick={removeThird} className="text-xs font-medium text-gray-500 hover:text-gray-900 underline">remove third color</button>}
          </div>
          <WeightBar colors={colors} weights={weights} onChange={setWeights} onCommit={() => commit()} />
        </div>

        <div className="flex flex-1 min-h-0 overflow-hidden">
          <div className="w-52 shrink-0 border-r border-gray-100 overflow-y-auto py-2">
            {midnightGalaxyRing.stations.map((st, i) => (
              <button
                key={st.key}
                onClick={() => setPreviewStation(i)}
                className={`w-full text-left px-4 py-2 text-xs capitalize flex items-center gap-2 ${
                  i === previewStation ? 'bg-gray-900 text-white font-semibold' : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ background: `hsl(${derived.hues[i]}, 72%, 62%)` }} />
                {st.key}
              </button>
            ))}
          </div>
          <div className="flex-1 bg-[#050505] flex items-center justify-center overflow-hidden">
            <div style={{ width: 640, height: 360, position: 'relative', overflow: 'hidden', borderRadius: 12 }}>
              <RingAmbient key={previewKey} worldData={previewWorldData} stationOverride={previewStation} />
            </div>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-gray-100 shrink-0 max-h-56 overflow-y-auto">
          {derived.warnings.map((w, i) => (
            <div key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mb-2">{w}</div>
          ))}
          <table className="w-full text-[11px] font-mono">
            <thead className="text-gray-400">
              <tr><th className="text-left font-normal">station</th><th className="text-right font-normal">hue</th><th className="text-right font-normal">luma now</th><th className="text-right font-normal">luma after</th><th className="text-right font-normal">Δ</th></tr>
            </thead>
            <tbody>
              {derived.advisory.map(a => (
                <tr key={a.index} className={a.delta > 25 ? 'text-amber-700' : 'text-gray-600'}>
                  <td className="text-left capitalize">{midnightGalaxyRing.stations[a.index].key}</td>
                  <td className="text-right">{a.fromHue}° → {a.toHue}°</td>
                  <td className="text-right">{a.fromLuma}</td>
                  <td className="text-right">{a.toLuma}</td>
                  <td className="text-right">{a.delta > 0 ? '+' : ''}{a.delta}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-gray-400 mt-2 font-sans">
            Luma is an advisory proxy for one flat swatch, not a prediction of the gate.
            The “luma now” column is the shipped world — if those numbers ever stop matching
            the values pinned in weightedPalette.test.js, the proxy is broken, not the palette.
            Run <code>npm run verify:ring</code> for the real answer.
          </p>
          <p className="text-[11px] text-gray-400 mt-2 font-sans">
            The hue column is a preview only. Applying these hues to the real ring is a
            separate, gated step that is not built yet — nothing on this screen writes a
            station hue.
          </p>
        </div>

        <div className="flex items-center gap-3 px-5 py-3 border-t border-gray-100 shrink-0">
          <div className="flex items-center gap-2 text-xs text-gray-500">
            Theme colors:
            {['bg', 'bgDeep', 'accent', 'highlight'].map(k => (
              <span key={k} className="flex items-center gap-1">
                <span className="w-4 h-4 rounded border border-gray-200" style={{ background: derived.themeColors[k] }} />
                <code className="text-[10px]">{derived.themeColors[k]}</code>
              </span>
            ))}
          </div>
          {/* Applies ONLY the theme half (bg/bgDeep/accent/highlight),
              through the existing ungated theme_overrides pipeline. The
              ring half is Task 4 — deferred post-show, separate gated
              mechanism, see the TODO at the top of this file. */}
          <button
            onClick={() => onApplyThemeColors(derived.themeColors)}
            className="ml-auto text-sm font-semibold px-4 py-2 rounded-lg bg-gray-900 text-white hover:bg-gray-700"
          >
            Apply to this show's theme
          </button>
        </div>
      </div>
    </div>
  )
}
