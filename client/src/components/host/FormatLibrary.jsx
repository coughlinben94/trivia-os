import { useState } from 'react'
import { useShinyFormats } from '../../hooks/useShinyFormats.js'

const INPUT_TYPES = ['image', 'audio', 'video', 'text', 'list']

const EMPTY_FORMAT = {
  name: '',
  description: '',
  icon: '✨',
  input_schema: { type: 'image', slots: 1, sequential: false, seriesEnabled: false, hasPoints: false, labels: [] },
}

export default function FormatLibrary({ onClose, onSelectFormat }) {
  const { formats, loading, createFormat, updateFormat, deleteFormat } = useShinyFormats()
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [draft, setDraft] = useState(EMPTY_FORMAT)

  function startCreate() {
    setDraft(EMPTY_FORMAT)
    setCreating(true)
    setEditing(null)
  }

  function startEdit(fmt) {
    setDraft({ name: fmt.name, description: fmt.description, icon: fmt.icon, input_schema: fmt.input_schema })
    setEditing(fmt.id)
    setCreating(false)
  }

  async function handleSave() {
    if (!draft.name.trim()) return
    if (editing) {
      await updateFormat(editing, draft)
      setEditing(null)
    } else {
      await createFormat(draft)
      setCreating(false)
    }
  }

  function updateSchema(key, value) {
    setDraft(d => ({ ...d, input_schema: { ...d.input_schema, [key]: value } }))
  }

  const schema = draft.input_schema

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Add Shiny</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>

        <div className="flex flex-1 min-h-0">

          {/* Format list */}
          <div className="w-64 border-r border-gray-100 overflow-y-auto p-3 flex flex-col gap-1">
            {loading ? (
              <p className="text-xs text-gray-400 p-2">Loading...</p>
            ) : formats.map(fmt => (
              <div
                key={fmt.id}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer group ${editing === fmt.id ? 'bg-gray-100' : 'hover:bg-gray-50'}`}
                onClick={() => onSelectFormat ? onSelectFormat(fmt) : startEdit(fmt)}
              >
                <span className="text-lg">{fmt.icon}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{fmt.name}</p>
                  <p className="text-xs text-gray-400 truncate">{fmt.description}</p>
                </div>
                {!onSelectFormat && (
                  <button
                    onClick={e => { e.stopPropagation(); deleteFormat(fmt.id) }}
                    className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 text-xs ml-1"
                  >✕</button>
                )}
              </div>
            ))}
            <button
              onClick={startCreate}
              className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg border border-dashed border-gray-200 text-sm text-gray-400 hover:text-gray-600 hover:border-gray-300"
            >
              <span>＋</span> New Format
            </button>
          </div>

          {/* Editor */}
          <div className="flex-1 overflow-y-auto p-6">
            {!creating && !editing ? (
              <div className="flex flex-col items-center justify-center h-full text-gray-300">
                <p className="text-sm">Select a format to edit or create a new one</p>
              </div>
            ) : (
              <div className="flex flex-col gap-5">

                {/* Name + icon */}
                <div className="flex gap-3">
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-500">Icon</label>
                    <input
                      value={draft.icon}
                      onChange={e => setDraft(d => ({ ...d, icon: e.target.value }))}
                      className="w-14 text-center text-2xl border border-gray-200 rounded-lg py-2"
                    />
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-500">Format Name</label>
                    <input
                      value={draft.name}
                      onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
                      placeholder="e.g. Not So Different"
                      className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                {/* Description */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs font-medium text-gray-500">Description</label>
                  <input
                    value={draft.description}
                    onChange={e => setDraft(d => ({ ...d, description: e.target.value }))}
                    placeholder="Brief description for your reference"
                    className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                  />
                </div>

                {/* Input type */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium text-gray-500">Input Type</label>
                  <div className="flex gap-2 flex-wrap">
                    {INPUT_TYPES.map(t => (
                      <button
                        key={t}
                        onClick={() => updateSchema('type', t)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-all ${schema.type === t ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Slots — only for image/audio/video */}
                {['image', 'audio', 'video'].includes(schema.type) && (
                  <div className="flex flex-col gap-1">
                    <label className="text-xs font-medium text-gray-500">
                      Number of {schema.type === 'image' ? 'Image' : schema.type === 'audio' ? 'Audio' : 'Video'} Slots
                    </label>
                    <div className="flex gap-2">
                      {[1,2,3,4,5,6].map(n => (
                        <button
                          key={n}
                          onClick={() => updateSchema('slots', n)}
                          className={`w-10 h-10 rounded-lg text-sm font-semibold border transition-all ${schema.slots === n ? 'bg-gray-900 text-white border-gray-900' : 'border-gray-200 text-gray-600 hover:border-gray-400'}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Sequential toggle — for multi-slot image */}
                {schema.type === 'image' && schema.slots > 1 && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Sequential reveal</p>
                      <p className="text-xs text-gray-400">Images reveal in order, one per host advance</p>
                    </div>
                    <button
                      onClick={() => updateSchema('sequential', !schema.sequential)}
                      className={`w-11 h-6 rounded-full transition-colors ${schema.sequential ? 'bg-gray-900' : 'bg-gray-200'}`}
                    >
                      <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${schema.sequential ? 'translate-x-5' : 'translate-x-0'}`}/>
                    </button>
                  </div>
                )}

                {/* Series enabled — for audio */}
                {schema.type === 'audio' && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Series enabled</p>
                      <p className="text-xs text-gray-400">Questions share a theme banner (6a, 6b, 6c)</p>
                    </div>
                    <button
                      onClick={() => updateSchema('seriesEnabled', !schema.seriesEnabled)}
                      className={`w-11 h-6 rounded-full transition-colors ${schema.seriesEnabled ? 'bg-gray-900' : 'bg-gray-200'}`}
                    >
                      <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${schema.seriesEnabled ? 'translate-x-5' : 'translate-x-0'}`}/>
                    </button>
                  </div>
                )}

                {/* Has points — for list type */}
                {schema.type === 'list' && (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-700">Point values</p>
                      <p className="text-xs text-gray-400">Each list item has a point value (Press Your Luck)</p>
                    </div>
                    <button
                      onClick={() => updateSchema('hasPoints', !schema.hasPoints)}
                      className={`w-11 h-6 rounded-full transition-colors ${schema.hasPoints ? 'bg-gray-900' : 'bg-gray-200'}`}
                    >
                      <span className={`block w-5 h-5 bg-white rounded-full shadow transition-transform mx-0.5 ${schema.hasPoints ? 'translate-x-5' : 'translate-x-0'}`}/>
                    </button>
                  </div>
                )}

                {/* Slot labels — for sequential image */}
                {schema.type === 'image' && schema.sequential && schema.slots > 1 && (
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-gray-500">Stage Labels (optional)</label>
                    {Array.from({ length: schema.slots }).map((_, i) => (
                      <input
                        key={i}
                        value={schema.labels?.[i] ?? ''}
                        onChange={e => {
                          const labels = [...(schema.labels ?? [])]
                          labels[i] = e.target.value
                          updateSchema('labels', labels)
                        }}
                        placeholder={`Stage ${i + 1} label`}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm"
                      />
                    ))}
                  </div>
                )}

                {/* Save button */}
                <button
                  onClick={handleSave}
                  disabled={!draft.name.trim()}
                  className="mt-2 bg-gray-900 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-40"
                >
                  {editing ? 'Save Changes' : 'Create Format'}
                </button>

              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
