import { useState } from 'react'
import { supabase } from '../../lib/supabase.js'

export default function HostHeader({ show, onUpdateMeta, onGoLive, onExport, onOpenLibrary }) {
  const [editingTitle, setEditingTitle] = useState(false)
  const [titleDraft, setTitleDraft] = useState('')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

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

  async function saveResults() {
    if (saving) return
    setSaving(true)
    const [{ data: teamData }, { data: scoreData }] = await Promise.all([
      supabase.from('teams').select('id, name, color').eq('show_id', show.id),
      supabase.from('team_scores').select('team_id, round_index, score').eq('show_id', show.id),
    ])
    const teams = teamData ?? []
    const scores = scoreData ?? []
    const finalScores = teams
      .map(t => {
        const rounds = scores
          .filter(s => s.team_id === t.id)
          .sort((a, b) => a.round_index - b.round_index)
          .map(s => s.score ?? 0)
        const total = rounds.reduce((sum, n) => sum + n, 0)
        return { teamId: t.id, name: t.name, color: t.color, total, rounds }
      })
      .sort((a, b) => b.total - a.total)
    await supabase
      .from('shows')
      .update({ player_count: teams.length, final_scores: finalScores })
      .eq('id', show.id)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  return (
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

        {/* My Shows */}
        <div className="flex items-center gap-1 shrink-0">
          <a
            href="/shows"
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-3 py-2 rounded-lg host-button"
          >
            My Shows
          </a>
        </div>

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
              className="text-sm font-semibold text-gray-800 hover:text-gray-900 truncate max-w-full text-left host-button"
            >
              {show.title}
            </button>
          )}
        </div>

        {/* Join URL copy */}
        <button
          onClick={copyJoinUrl}
          title="Copy join URL"
          className="shrink-0 text-sm font-medium px-3 py-2 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 host-button"
          style={{ color: copied ? '#1a6b4a' : '#6b7280' }}
        >
          {copied ? 'Copied!' : 'Copy Join Link'}
        </button>

        {/* Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => window.open(`/display?show=${show.id}&preview=true`, '_blank')}
            title="Preview display on current theme"
            className="text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-3 py-2 rounded-lg host-button"
          >
            Preview
          </button>
          <button
            onClick={onExport}
            title="Export show JSON"
            className="text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-3 py-2 rounded-lg host-button"
          >
            Export
          </button>
          <button
            onClick={saveResults}
            disabled={saving}
            className="text-sm text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-3 py-2 rounded-lg host-button disabled:opacity-40"
            title="Snapshot player count + final scores"
          >
            {saved ? 'Saved ✓' : saving ? 'Saving…' : 'Save Results'}
          </button>
          <button
            onClick={onGoLive}
            className="bg-baynes-forest text-white text-sm font-semibold px-5 py-2 rounded-lg hover:bg-green-900 host-button ml-1"
          >
            Go Live →
          </button>
        </div>
    </header>
  )
}
