import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase.js'
import HostPinGate from '../components/host/HostPinGate.jsx'

// Two-stage bucket. Bucket 1 = 'kept' — /fact-hunt grade tags a fact 'kept'
// when Ben says keep in prose; that's the raw accepted pool. Bucket 2 =
// 'pruned' — Ben's own curation, hit from this page, meaning "actually
// queued to write a show off of." Used in show (status='used') only applies
// to the pruned bucket — that's the shortlist this page exists for.
const TABS = [
  { id: 'pruned', label: 'Pruned' },
  { id: 'kept',   label: 'Kept' },
]

function FactCard({ row, tab, onPrune, onMarkUsed }) {
  return (
    <div className="w-full sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.667rem)] bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide truncate">{row.domain ?? 'uncategorized'}</span>
        <span className="text-sm font-bold text-gray-900 shrink-0">{row.answer}</span>
      </div>
      <p className="text-sm text-gray-700 leading-snug">{row.fact}</p>
      {row.bridges?.length > 0 && (
        <p className="text-xs text-gray-400 leading-snug">{row.bridges.join(' · ')}</p>
      )}
      {tab === 'kept' ? (
        <button
          onClick={() => onPrune(row.id)}
          className="mt-auto text-sm font-semibold text-white bg-[#1a6b4a] hover:bg-green-900 rounded-lg py-2"
        >
          Keep → Pruned
        </button>
      ) : (
        <button
          onClick={() => onMarkUsed(row.id)}
          className="mt-auto text-sm font-semibold text-white bg-[#1a6b4a] hover:bg-green-900 rounded-lg py-2"
        >
          Used in show
        </button>
      )}
    </div>
  )
}

export default function Facts() {
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tab, setTab] = useState('pruned')

  const load = useCallback(async () => {
    setLoading(true)
    const { data } = await supabase
      .from('fact_hunt_entries')
      .select('id, domain, answer, fact, bridges, tags, created_at')
      .eq('status', 'active')
      .contains('tags', ['kept'])
      .order('created_at', { ascending: false })
    setRows(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  async function prune(id) {
    const row = rows.find(r => r.id === id)
    const tags = Array.from(new Set([...(row.tags ?? []), 'pruned']))
    setRows(rs => rs.map(r => r.id === id ? { ...r, tags } : r))
    await supabase.from('fact_hunt_entries').update({ tags }).eq('id', id)
  }

  async function markUsed(id) {
    setRows(rs => rs.filter(r => r.id !== id))
    await supabase.from('fact_hunt_entries').update({ status: 'used' }).eq('id', id)
  }

  const bucketed = rows.filter(r => tab === 'pruned'
    ? (r.tags ?? []).includes('pruned')
    : !(r.tags ?? []).includes('pruned'))

  const q = search.trim().toLowerCase()
  const visible = q
    ? bucketed.filter(r => `${r.answer} ${r.fact} ${r.domain ?? ''}`.toLowerCase().includes(q))
    : bucketed

  return (
    <HostPinGate>
      <div className="min-h-screen bg-gray-50 font-sans">
        <div className="bg-white border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
            <div>
              <h1 className="text-lg font-bold text-gray-900">Pruned Facts</h1>
              <p className="text-xs text-gray-500 mt-0.5">Kept facts, curated down to what's actually queued for a show</p>
            </div>
            <a href="/host" className="text-xs text-gray-500 hover:text-gray-700">← Dashboard</a>
          </div>
        </div>

        <div className="max-w-5xl mx-auto px-6 pt-6">
          <div className="flex items-center gap-4 mb-6">
            <div className="flex gap-2">
              {TABS.map(t => (
                <button
                  key={t.id}
                  onClick={() => setTab(t.id)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-semibold border ${
                    tab === t.id
                      ? 'bg-[#1a6b4a] text-white border-[#1a6b4a]'
                      : 'bg-white text-gray-600 border-gray-200 hover:border-[#1a6b4a] hover:text-[#1a6b4a]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search answer, fact, domain…"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 outline-none focus:border-[#1a6b4a]"
            />
          </div>

          {loading ? (
            <p className="text-sm text-gray-400">Loading…</p>
          ) : visible.length === 0 ? (
            <p className="text-sm text-gray-400">
              {bucketed.length === 0 ? (tab === 'pruned' ? 'Nothing pruned yet.' : 'Nothing kept, undecided.') : 'No matches.'}
            </p>
          ) : (
            <div className="flex flex-wrap gap-3 pb-10">
              {visible.map(row => (
                <FactCard key={row.id} row={row} tab={tab} onPrune={prune} onMarkUsed={markUsed} />
              ))}
            </div>
          )}
        </div>
      </div>
    </HostPinGate>
  )
}
