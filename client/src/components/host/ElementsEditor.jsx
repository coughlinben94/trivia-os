import { useState } from 'react'
import MediaUpload from './MediaUpload.jsx'
import { DISPLAY_FONTS } from './ThemeCustomizeControls.jsx'
import { makeElement, ELEMENT_POSITION_LABELS } from '../display/SlideElements.jsx'

const POSITIONS = Object.keys(ELEMENT_POSITION_LABELS)
const SIZES = ['sm', 'md', 'lg', 'xl']

function ElementRow({ el, onChange, onDelete, onUpload }) {
  const [open, setOpen] = useState(true)

  return (
    <div className="border border-gray-200 rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <button onClick={() => setOpen(o => !o)} className="text-xs font-medium text-gray-700 flex items-center gap-1.5">
          <span>{el.type === 'text' ? '📝' : '🖼️'}</span>
          {el.type === 'text' ? (el.content?.slice(0, 24) || 'Empty text') : 'Image'}
        </button>
        <button onClick={onDelete} className="text-xs text-gray-400 hover:text-red-500">Remove</button>
      </div>

      {open && (
        <div className="space-y-2 pt-1">
          {el.type === 'text' ? (
            <>
              <textarea
                value={el.content ?? ''}
                onChange={e => onChange({ ...el, content: e.target.value })}
                placeholder="Text…"
                rows={2}
                className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-[#1a6b4a]"
              />
              <select
                value={el.font ?? 'Boogaloo'}
                onChange={e => onChange({ ...el, font: e.target.value })}
                className="text-xs border border-gray-200 rounded-md px-2 py-1"
              >
                {DISPLAY_FONTS.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </>
          ) : (
            <MediaUpload
              accept="image"
              currentUrl={el.url}
              onUpload={async file => {
                const result = await onUpload(file)
                if (result?.url) onChange({ ...el, url: result.url })
                return result
              }}
              onRemove={() => onChange({ ...el, url: null })}
            />
          )}

          <div className="flex items-center gap-2">
            <select
              value={el.position ?? 'center'}
              onChange={e => onChange({ ...el, position: e.target.value })}
              className="text-xs border border-gray-200 rounded-md px-2 py-1 flex-1"
            >
              {POSITIONS.map(p => <option key={p} value={p}>{ELEMENT_POSITION_LABELS[p]}</option>)}
            </select>
            <select
              value={el.size ?? 'md'}
              onChange={e => onChange({ ...el, size: e.target.value })}
              className="text-xs border border-gray-200 rounded-md px-2 py-1"
            >
              {SIZES.map(s => <option key={s} value={s}>{s.toUpperCase()}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

export default function ElementsEditor({ elements, onChange, onUpload }) {
  const list = elements ?? []

  function update(id, next) {
    onChange(list.map(el => el.id === id ? next : el))
  }
  function remove(id) {
    onChange(list.filter(el => el.id !== id))
  }
  function add(type) {
    onChange([...list, makeElement(type)])
  }

  return (
    <div className="space-y-2">
      {list.map(el => (
        <ElementRow key={el.id} el={el} onChange={next => update(el.id, next)} onDelete={() => remove(el.id)} onUpload={onUpload} />
      ))}
      <div className="flex gap-2">
        <button onClick={() => add('text')} className="flex-1 text-xs font-medium text-gray-600 border border-dashed border-gray-300 rounded-lg py-2 hover:border-baynes-forest hover:text-baynes-forest transition-colors">
          + Add text
        </button>
        <button onClick={() => add('image')} className="flex-1 text-xs font-medium text-gray-600 border border-dashed border-gray-300 rounded-lg py-2 hover:border-baynes-forest hover:text-baynes-forest transition-colors">
          + Add image
        </button>
      </div>
    </div>
  )
}
