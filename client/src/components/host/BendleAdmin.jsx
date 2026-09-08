// client/src/components/host/BendleAdmin.jsx
import { useState, useEffect } from 'react'
import { nanoid } from 'nanoid'
import { supabase } from '../../lib/supabase.js'
import BendleSongSearch from './BendleSongSearch.jsx'
import BendleOffsetScrubber, { formatOffsetTime } from './BendleOffsetScrubber.jsx'

const STEM_KEYS = ['drums', 'bass', 'other', 'vocals']

// Every refresh of the song list (initial load, after insert, after
// delete-and-retry) needs the same columns: the scrubber needs the stem
// URLs and the current offset, which the original list (id/title/
// created_at/status/artist/error_text) never selected — a song already
// `ready` at page-load time would otherwise render its scrubber with no
// audio to fetch until the next realtime UPDATE happened to arrive.
const SONG_LIST_COLUMNS = 'id, title, created_at, status, artist, error_text, drums_url, bass_url, other_url, start_offset_seconds'

function cleanSpotifyTitle(title) {
  return title
    .replace(/\s*-\s*(remaster(ed)?|mono|stereo|single|album)\b.*$/i, '')
    .replace(/\s*[\(\[](feat\.?|with|remaster|mono|stereo)[^)\]]*[\)\]]/gi, '')
    .trim()
}

export function statusLabel(status) {
  return {
    requested: '⏳ Queued',
    processing: '⚙️ Processing',
    ready: '✅ Ready',
    failed: '❌ Failed',
  }[status] ?? status
}

export default function BendleAdmin({ onClose }) {
  const [songs, setSongs] = useState([])
  const [title, setTitle] = useState('')
  const [answer, setAnswer] = useState('')
  const [aliasesText, setAliasesText] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [files, setFiles] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const [expandedId, setExpandedId] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase.from('bendle_songs').select(SONG_LIST_COLUMNS).order('created_at', { ascending: false })
      .then(({ data }) => { if (!cancelled) setSongs(data ?? []) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('bendle_songs_status')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'bendle_songs' }, payload => {
        setSongs(prev => prev.map(s => s.id === payload.new.id ? { ...s, ...payload.new } : s))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  function reset() {
    setTitle(''); setAnswer(''); setAliasesText(''); setSourceUrl(''); setFiles({}); setError(null)
  }

  async function handleDeleteFailed(id) {
    await supabase.from('bendle_songs').delete().eq('id', id)
    const { data } = await supabase.from('bendle_songs').select(SONG_LIST_COLUMNS).order('created_at', { ascending: false })
    setSongs(data ?? [])
  }

  async function handleSpotifyPick(track) {
    setError(null)
    const id = `bnd_${nanoid(8)}`
    const cleanAnswer = cleanSpotifyTitle(track.title)
    const { error: insertError } = await supabase.from('bendle_songs').insert({
      id,
      title: track.title,
      answer: cleanAnswer,
      aliases: cleanAnswer === track.title ? [] : [track.title],
      status: 'requested',
      spotify_id: track.spotifyId,
      artist: track.artist,
      artwork_url: track.artworkUrl,
      drums_url: null, bass_url: null, other_url: null, vocals_url: null,
    })
    if (insertError) { setError(insertError.message); return }
    const { data } = await supabase.from('bendle_songs').select(SONG_LIST_COLUMNS).order('created_at', { ascending: false })
    setSongs(data ?? [])
  }

  async function handleSave() {
    setError(null)
    if (!title.trim() || !answer.trim()) { setError('Title and answer are required'); return }
    const missing = STEM_KEYS.filter(k => !files[k])
    if (missing.length > 0) { setError(`Missing stem file(s): ${missing.join(', ')}`); return }

    setSaving(true)
    try {
      const id = `bnd_${nanoid(8)}`
      const urls = {}
      for (const key of STEM_KEYS) {
        const file = files[key]
        const path = `bendle/${id}/${key}.${file.name.split('.').pop()}`
        const { error: uploadError } = await supabase.storage.from('trivia-show-media').upload(path, file)
        if (uploadError) throw uploadError
        const { data: pub } = supabase.storage.from('trivia-show-media').getPublicUrl(path)
        urls[`${key}_url`] = pub.publicUrl
      }
      const aliases = aliasesText.split(',').map(a => a.trim()).filter(Boolean)
      const { error: insertError } = await supabase.from('bendle_songs').insert({
        id, title: title.trim(), answer: answer.trim(), aliases,
        source_url: sourceUrl.trim() || null, ...urls,
      })
      if (insertError) throw insertError
      const { data } = await supabase.from('bendle_songs').select(SONG_LIST_COLUMNS).order('created_at', { ascending: false })
      setSongs(data ?? [])
      reset()
    } catch (e) {
      setError(e.message ?? 'Upload failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-6" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">Bendle Songs</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">✕</button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-4">
          <div className="border-b border-gray-100 pb-4">
            <p className="text-xs font-medium text-gray-500 mb-2">Pick from Spotify (automatic)</p>
            <BendleSongSearch onPick={handleSpotifyPick} />
          </div>
          {/* Collapsed by default (2026-09-08, Ben) — Spotify search + the
              worker is the normal path now; this manual upload form is the
              fallback for a song Spotify/YouTube can't find, or if the
              worker's down. */}
          <details className="group">
            <summary className="text-xs text-gray-400 text-center cursor-pointer select-none list-none">
              — or upload stems manually below —
            </summary>
            <div className="flex flex-col gap-4 mt-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Title</label>
                <input value={title} onChange={e => setTitle(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="e.g. Hey Jude" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Answer (canonical)</label>
                <input value={answer} onChange={e => setAnswer(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="e.g. Hey Jude" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Aliases (comma-separated, optional)</label>
                <input value={aliasesText} onChange={e => setAliasesText(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="e.g. hey jude by the beatles" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">Source URL (optional, for re-processing later)</label>
                <input value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} className="w-full border border-gray-200 rounded-lg px-3 py-2.5 text-sm" placeholder="https://youtube.com/..." />
              </div>
              {STEM_KEYS.map(key => (
                <div key={key}>
                  <label className="block text-xs font-medium text-gray-500 mb-1.5 capitalize">{key} stem (.wav/.mp3)</label>
                  <input type="file" accept="audio/*" onChange={e => setFiles(f => ({ ...f, [key]: e.target.files[0] }))} className="w-full text-sm" />
                </div>
              ))}
              {error && <p className="text-xs text-red-600">{error}</p>}
              <button
                onClick={handleSave}
                disabled={saving}
                className={`w-full py-3 rounded-xl border-2 font-semibold text-sm ${saving ? 'border-gray-100 text-gray-300 cursor-not-allowed' : 'border-[#1a6b4a] text-[#1a6b4a] hover:bg-green-50'}`}
              >
                {saving ? 'Uploading…' : '+ Add Song'}
              </button>
            </div>
          </details>
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 mb-2">{songs.length} song{songs.length === 1 ? '' : 's'} prepped</p>
            <ul className="flex flex-col gap-1">
              {songs.map(s => (
                <li key={s.id} className="flex flex-col gap-1.5 text-sm text-gray-700">
                  <div className="flex items-center justify-between gap-2">
                    <span className="flex-1 min-w-0">
                      <span className="block truncate">{s.title}{s.artist ? ` — ${s.artist}` : ''}</span>
                      {s.status === 'failed' && s.error_text && (
                        <span className="block text-xs text-red-500 truncate">{s.error_text}</span>
                      )}
                      {s.status === 'ready' && s.start_offset_seconds > 0 && (
                        <span className="block text-xs text-gray-400">Starts at {formatOffsetTime(s.start_offset_seconds)}</span>
                      )}
                    </span>
                    <span className="text-xs shrink-0">{statusLabel(s.status)}</span>
                    {s.status === 'ready' && (
                      <button
                        onClick={() => setExpandedId(id => id === s.id ? null : s.id)}
                        className="text-xs text-gray-400 hover:text-gray-700 shrink-0"
                        title="Pick where the song starts"
                      >
                        {expandedId === s.id ? '▲ Scrub' : '🎚 Scrub'}
                      </button>
                    )}
                    {s.status === 'failed' && (
                      <button onClick={() => handleDeleteFailed(s.id)} className="text-xs text-gray-400 hover:text-red-500 shrink-0" title="Delete and try again">🗑</button>
                    )}
                  </div>
                  {expandedId === s.id && <BendleOffsetScrubber song={s} />}
                </li>
              ))}
            </ul>
            {songs.some(s => s.status === 'failed') && (
              <p className="text-xs text-gray-400">
                Delete a failed song above (🗑), then pick it again from Spotify search.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
