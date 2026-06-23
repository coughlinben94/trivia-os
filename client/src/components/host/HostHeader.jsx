import { useState } from 'react'
import { THEMES } from '../../themes/index.js'

export default function HostHeader({ show, onUpdateMeta, onGoLive, onExport }) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')

  function startEdit() {
    setTitleDraft(show.title)
    setEditingTitle(true)
  }

  function commitTitle() {
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== show.title) onUpdateMeta({ title: trimmed })
    setEditingTitle(false)
  }

  function handleThemeChange(e) {
    onUpdateMeta({ theme: e.target.value })
  }

  return (
    <header className="h-14 bg-white border-b border-gray-200 flex items-center px-4 gap-4 shrink-0">
      {/* Logo mark */}
      <div className="flex items-center gap-2 shrink-0">
        <div className="w-7 h-7 bg-baynes-forest rounded flex items-center justify-center">
          <span className="text-white text-xs font-bold select-none">T</span>
        </div>
        <span className="text-sm font-semibold text-gray-900 hidden sm:block">Trivia OS</span>
      </div>

      {/* Show title — inline edit */}
      <div className="flex-1 min-w-0">
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={e => setTitleDraft(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
            className="w-full text-sm font-medium text-gray-900 border-b border-baynes-forest bg-transparent outline-none py-0.5"
          />
        ) : (
          <button
            onClick={startEdit}
            title="Click to edit show title"
            className="text-sm font-medium text-gray-700 hover:text-gray-900 truncate max-w-full text-left transition-colors"
          >
            {show.title}
          </button>
        )}
      </div>

      {/* Theme selector */}
      <div className="shrink-0">
        <select
          value={show.theme}
          onChange={handleThemeChange}
          className="text-xs border border-gray-200 rounded px-2 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-1 focus:ring-baynes-forest"
        >
          {THEMES.map(t => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={onExport}
          title="Export show JSON"
          className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1.5 rounded transition-colors"
        >
          Export
        </button>
        <button
          onClick={onGoLive}
          className="bg-baynes-forest text-white text-xs font-semibold px-4 py-2 rounded-lg hover:bg-green-900 transition-colors"
        >
          Go Live →
        </button>
      </div>
    </header>
  )
}
