import { useState } from 'react'
import { THEMES } from '../../themes/index.js'
import ThemePickerModal from './ThemePickerModal.jsx'

export default function HostHeader({ show, onUpdateMeta, onGoLive, onExport, onOpenFormatLibrary, onOpenTicker, onOpenLibrary }) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [showThemePicker, setShowThemePicker] = useState(false)

  const joinUrl = `${window.location.origin}/join?show=${show.id}`

  function copyJoinUrl() {
    navigator.clipboard.writeText(joinUrl).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  function startEdit() {
    setTitleDraft(show.title)
    setEditingTitle(true)
  }

  function commitTitle() {
    const trimmed = titleDraft.trim()
    if (trimmed && trimmed !== show.title) onUpdateMeta({ title: trimmed })
    setEditingTitle(false)
  }

  const currentThemeName = THEMES.find(t => t.id === show.theme)?.name ?? 'Theme'

  return (
    <>
      <header className="h-16 bg-white border-b border-gray-200 flex items-center px-5 gap-4 shrink-0">
        {/* Logo mark */}
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="w-8 h-8 bg-baynes-forest rounded-lg flex items-center justify-center">
            <span className="text-white text-sm font-bold select-none">T</span>
          </div>
          <span className="text-sm font-semibold text-gray-900 hidden sm:block">Trivia OS</span>
        </div>

        {/* Divider */}
        <div className="w-px h-6 bg-gray-200 shrink-0" />

        {/* My Shows nav */}
        {onOpenLibrary && (
          <button
            onClick={onOpenLibrary}
            className="shrink-0 text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors"
          >
            My Shows
          </button>
        )}

        {/* Divider */}
        <div className="w-px h-6 bg-gray-200 shrink-0" />

        {/* Show title — inline edit */}
        <div className="flex-1 min-w-0">
          {editingTitle ? (
            <input
              autoFocus
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') setEditingTitle(false) }}
              className="w-full text-sm font-semibold text-gray-900 border-b-2 border-baynes-forest bg-transparent outline-none py-0.5"
            />
          ) : (
            <button
              onClick={startEdit}
              title="Click to edit show title"
              className="text-sm font-semibold text-gray-800 hover:text-gray-900 truncate max-w-full text-left transition-colors"
            >
              {show.title}
            </button>
          )}
        </div>

        {/* Theme picker trigger */}
        <button
          onClick={() => setShowThemePicker(true)}
          className="shrink-0 flex items-center gap-2 text-sm text-gray-700 border border-gray-200 rounded-lg px-3 py-2 bg-white hover:border-gray-300 hover:bg-gray-50 transition-colors focus:outline-none focus:ring-2 focus:ring-baynes-forest"
        >
          <span>{currentThemeName}</span>
          <span className="text-gray-400 text-xs leading-none">▾</span>
        </button>

        {/* Join URL copy */}
        <button
          onClick={copyJoinUrl}
          title="Copy join URL"
          className="shrink-0 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 transition-colors"
          style={{ color: copied ? '#1a6b4a' : '#6b7280' }}
        >
          {copied ? 'Copied!' : 'Copy Join Link'}
        </button>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          {onOpenTicker && (
            <button
              onClick={onOpenTicker}
              title="Edit pre-show ticker messages"
              className="text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors"
            >
              📺 Ticker
            </button>
          )}
          {onOpenFormatLibrary && (
            <button
              onClick={onOpenFormatLibrary}
              title="Manage shiny formats"
              className="text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors"
            >
              ✨ Formats
            </button>
          )}
          <button
            onClick={() => window.open(`/display?show=${show.id}&preview=true`, '_blank')}
            title="Preview display on current theme"
            className="text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors"
          >
            Preview
          </button>
          <button
            onClick={onExport}
            title="Export show JSON"
            className="text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-3 py-2 rounded-lg transition-colors"
          >
            Export
          </button>
          <button
            onClick={onGoLive}
            className="bg-baynes-forest text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-green-900 transition-colors ml-1"
          >
            Go Live →
          </button>
        </div>
      </header>

      {showThemePicker && (
        <ThemePickerModal
          show={show}
          onClose={() => setShowThemePicker(false)}
          onSelectTheme={themeId => onUpdateMeta({ theme: themeId })}
        />
      )}
    </>
  )
}
