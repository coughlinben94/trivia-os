import { useState, useEffect } from 'react'
import MediaUpload from './MediaUpload.jsx'
import { DEFAULT_DROP_TOTAL, dropChip, dropOptions } from '../../lib/dropScoring.js'

// The Drop builder: exactly 4 tiles (text, photo optional), a radio for the one
// correct tile, up/down to set the order the tiles are laid out in, and the point
// pool each team splits. Picking the correct tile writes `options` and `correctId`
// together so a pick never points at an option that hasn't been saved yet.
//
// Letters follow the phone and the TV: they are handed out over the tiles that have
// text or a photo (the same blank filter dropOptions applies there), so row 3 is
// "B" here when row 2 is empty, exactly as it is on the screens.
export default function DropBuilder({ options, correctId, total, onChangeOptions, onBatchChange, onChangeTotal, onMediaUpload }) {
  const usable = dropOptions({ options })
  const usableIds = usable.map(o => o.id)
  const letterOf = id => { const i = usableIds.indexOf(id); return i >= 0 ? String.fromCharCode(65 + i) : null }
  const correctUsable = usableIds.includes(correctId)
  const chip = dropChip(total)

  // The points box keeps its own text so it can be empty while you retype; it only
  // reports a real whole number >= 1, and falls back to the saved value on leaving.
  const [totalText, setTotalText] = useState(String(total))
  useEffect(() => { setTotalText(String(total)) }, [total])
  function typeTotal(text) {
    setTotalText(text)
    const n = Number(text)
    if (text.trim() !== '' && Number.isFinite(n) && n >= 1) onChangeTotal(Math.round(n))
  }

  function updateOption(i, patch) {
    onChangeOptions(options.map((o, idx) => idx === i ? { ...o, ...patch } : o))
  }
  function move(i, dir) {
    const j = i + dir
    if (j < 0 || j >= options.length) return
    const next = [...options]
    ;[next[i], next[j]] = [next[j], next[i]]
    onChangeOptions(next)
  }
  // SlideEditor's wrapper hands back the bare URL string (ChoiceBuilder's
  // `result?.url` read of that same string silently no-ops — not copied here).
  async function uploadImage(i, file) {
    if (!file) return
    const result = await onMediaUpload(file)
    const url = typeof result === 'string' ? result : result?.url
    if (url) updateOption(i, { image: url })
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="block text-xs font-medium text-gray-700 mb-1.5">The 4 tiles</label>
      <p className="text-xs text-gray-400 -mt-2">
        Teams split {total} points across these on their phones. They pick 1 to 5 points per tap (starting at {chip}) and can put everything on one tile. Points left on the correct tile are their score; the rest is lost.
        On the TV each Next drops one wrong tile off, in a random order, never the correct one. The ↑↓ order is just how the tiles are laid out.
      </p>
      {!correctUsable && (
        <p className="text-xs text-amber-600 -mt-1">
          ⚠️ Pick the correct tile below — Lock Answers refuses without one.
        </p>
      )}
      {options.map((opt, i) => {
        const letter = letterOf(opt.id)
        return (
          <div key={opt.id} className="flex flex-col gap-2 pb-4 mb-1 border-b border-gray-100 last:border-0 last:pb-0">
            <div className="flex gap-2 items-center">
              <input
                type="radio"
                checked={correctId === opt.id}
                disabled={!letter}
                onChange={() => onBatchChange({ options, correctId: opt.id })}
                className="shrink-0"
                aria-label={letter ? `Tile ${letter} is correct` : `Unused tile ${i + 1} cannot be correct`}
              />
              <span data-tile-letter className="w-5 shrink-0 text-center text-sm font-bold text-gray-500">{letter ?? '–'}</span>
              <input
                value={opt.label}
                onChange={e => updateOption(i, { label: e.target.value })}
                placeholder="Tile text, or add a photo below"
                className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-1 focus:ring-baynes-forest"
              />
              <button onClick={() => move(i, -1)} disabled={i === 0} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-20 shrink-0" aria-label="Move up">↑</button>
              <button onClick={() => move(i, 1)} disabled={i === options.length - 1} className="text-xs text-gray-400 hover:text-gray-700 disabled:opacity-20 shrink-0" aria-label="Move down">↓</button>
            </div>
            <div className="pl-7">
              <MediaUpload
                accept="image" label="Photo (optional)"
                currentUrl={opt.image || null} currentType={opt.image ? 'image/jpeg' : null}
                onUpload={file => uploadImage(i, file)}
                onRemove={() => updateOption(i, { image: '' })}
              />
            </div>
          </div>
        )
      })}
      <div className="flex items-center gap-2 mt-1 pt-3 border-t border-gray-100">
        <label className="text-xs font-medium text-gray-700" htmlFor="drop-total">Points each team places</label>
        <input
          id="drop-total"
          aria-label="Points each team places"
          type="text"
          inputMode="numeric"
          value={totalText}
          onChange={e => typeTotal(e.target.value)}
          onBlur={() => setTotalText(String(total))}
          className="w-16 border border-gray-200 rounded px-2 py-1.5 text-sm text-center text-gray-900 focus:outline-none focus:ring-1 focus:ring-baynes-forest"
        />
      </div>
      <p className="text-xs text-gray-400 -mt-1">
        Set this before the show. Changing it, or blanking a tile, after teams have placed points makes their saved splits invalid and they score 0.
      </p>
    </div>
  )
}
