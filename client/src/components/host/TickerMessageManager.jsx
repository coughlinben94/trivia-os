import { useState, useEffect, useRef } from 'react'

export default function TickerMessageManager({ messages, onSave, onClose }) {
  const [draft, setDraft] = useState(messages.join('\n'))
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const textareaRef = useRef(null)

  useEffect(() => {
    textareaRef.current?.focus()
  }, [])

  function parseMessages(raw) {
    return raw
      .split('\n')
      .map(l => l.trim())
      .filter(Boolean)
  }

  async function handleSave() {
    setSaving(true)
    await onSave(parseMessages(draft))
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const parsed = parseMessages(draft)
  const hasChanges = JSON.stringify(parsed) !== JSON.stringify(messages)

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-base font-semibold text-gray-900">📺 Pre-Show Ticker</h2>
            <p className="text-xs text-gray-400 mt-0.5">
              Scrolls on the TV until 5 teams join, then switches to team names.
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors text-lg leading-none ml-4"
          >
            ✕
          </button>
        </div>

        {/* Editor */}
        <div className="px-6 py-4 flex flex-col gap-3">
          <label className="text-xs font-medium text-gray-500">
            Messages — one per line
          </label>
          <textarea
            ref={textareaRef}
            value={draft}
            onChange={e => { setDraft(e.target.value); setSaved(false) }}
            placeholder={"Write something fun for the crowd while they're finding their seats…\nOne message per line."}
            rows={8}
            className="w-full text-sm text-gray-800 border border-gray-200 rounded-xl px-4 py-3 resize-none focus:outline-none focus:border-baynes-forest focus:ring-1 focus:ring-baynes-forest placeholder:text-gray-300 leading-relaxed"
          />

          {/* Live preview */}
          {parsed.length > 0 && (
            <div className="rounded-xl bg-gray-950 overflow-hidden">
              <div className="px-3 py-1.5 border-b border-white/5">
                <span className="text-xs font-medium text-white/30">Preview</span>
              </div>
              <div className="px-3 py-2 flex flex-col gap-1 max-h-32 overflow-y-auto">
                {parsed.map((msg, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-white/20 text-xs font-mono mt-0.5 shrink-0">{i + 1}.</span>
                    <span className="text-white/70 text-sm leading-snug">{msg}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {parsed.length === 0 && draft.trim() === '' && (
            <p className="text-xs text-amber-600 bg-amber-50 rounded-lg px-3 py-2">
              No messages — the ticker will show a default prompt to scan the QR code.
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-100 bg-gray-50">
          <span className="text-xs text-gray-400">
            {parsed.length} {parsed.length === 1 ? 'message' : 'messages'}
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="text-sm font-semibold px-5 py-2 rounded-lg transition-colors disabled:opacity-40"
              style={{ background: saved ? '#1a6b4a' : '#1a6b4a', color: '#fff' }}
            >
              {saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
