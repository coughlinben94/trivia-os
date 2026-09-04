// client/src/components/host/BendleAdmin.jsx
import { useState, useEffect } from 'react'
import { nanoid } from 'nanoid'
import { supabase } from '../../lib/supabase.js'

const STEM_KEYS = ['drums', 'bass', 'other', 'vocals']

export default function BendleAdmin({ onClose }) {
  const [songs, setSongs] = useState([])
  const [title, setTitle] = useState('')
  const [answer, setAnswer] = useState('')
  const [aliasesText, setAliasesText] = useState('')
  const [sourceUrl, setSourceUrl] = useState('')
  const [files, setFiles] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false
    supabase.from('bendle_songs').select('id, title, created_at').order('created_at', { ascending: false })
      .then(({ data }) => { if (!cancelled) setSongs(data ?? []) })
    return () => { cancelled = true }
  }, [])

  function reset() {
    setTitle(''); setAnswer(''); setAliasesText(''); setSourceUrl(''); setFiles({}); setError(null)
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
      const { data } = await supabase.from('bendle_songs').select('id, title, created_at').order('created_at', { ascending: false })
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
          <div className="border-t border-gray-100 pt-4">
            <p className="text-xs font-medium text-gray-500 mb-2">{songs.length} song{songs.length === 1 ? '' : 's'} prepped</p>
            <ul className="flex flex-col gap-1">
              {songs.map(s => <li key={s.id} className="text-sm text-gray-700">{s.title}</li>)}
            </ul>
          </div>
        </div>
      </div>
    </div>
  )
}
