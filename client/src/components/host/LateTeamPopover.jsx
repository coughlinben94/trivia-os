import { useState, useEffect, useRef } from 'react'
import QRCode from 'qrcode'
import { supabase } from '../../lib/supabase.js'

// Two ways a late-arriving team needs help, from one button:
//   "Add a new team" — they never registered at all. Same existing action
//   the 📱 QR button always did — show the join QR on the TV.
//   "Reauth a team's phone" — they DID register, but their phone lost its
//   Supabase auth session (cleared history, iOS eviction) and can no longer
//   write to phone_answers/teams under RLS. There's no self-service fix for
//   that: the current RLS requires a session to ALREADY own a row before it
//   can update it, so a phone with a NEW session can't reclaim its OLD row
//   on its own. The host is the one who knows which team this actually is
//   (that's the whole reason this is a host-side action, not a phone one) —
//   picking a team here mints a short-lived, single-use token via a
//   SECURITY DEFINER RPC (create_reauth_token), which the struggling phone
//   redeems (redeem_reauth_token) to have its CURRENT session written onto
//   that team's row, bypassing the ownership chicken-and-egg. The token
//   never appears anywhere except this QR — it's not stored in the show
//   payload or shown to the audience.
export default function LateTeamPopover({ show, onShowJoinQr, onClose }) {
  const [mode, setMode] = useState('choose') // 'choose' | 'pick-team' | 'qr'
  const [teams, setTeams] = useState([])
  const [loadingTeams, setLoadingTeams] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState(null)
  const [error, setError] = useState(null)
  const ref = useRef(null)

  useEffect(() => {
    function onClickOutside(e) { if (ref.current && !ref.current.contains(e.target)) onClose() }
    function onKey(e) { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onClickOutside)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClickOutside)
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  async function openTeamPicker() {
    setMode('pick-team')
    setError(null)
    setLoadingTeams(true)
    const { data, error: fetchError } = await supabase
      .from('teams').select('id, name, is_connected, last_action, last_action_at').eq('show_id', show.id).order('name')
    setLoadingTeams(false)
    if (fetchError) { setError('Couldn’t load teams — check connection'); return }
    setTeams(data ?? [])
  }

  async function pickTeam(team) {
    setError(null)
    const { data: token, error: rpcError } = await supabase.rpc('create_reauth_token', { p_team_id: team.id })
    if (rpcError || !token) { setError('Couldn’t create a reauth link — try again'); return }
    const url = `${window.location.origin}/join?show=${show.id}&reauth=${encodeURIComponent(token)}`
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 260, margin: 1 })
      setQrDataUrl(dataUrl)
      setMode('qr')
    } catch {
      // Token's already minted (it'll just expire unused in 15 min) — the
      // failure is purely in rendering the QR, so stay in the picker and let
      // the host retry rather than silently losing the flow here.
      setError('Couldn’t generate the QR — try again')
    }
  }

  return (
    <div
      ref={ref}
      className="absolute top-full left-0 mt-1 z-50 bg-white rounded-xl shadow-2xl border border-gray-100 p-3"
      style={{ width: mode === 'qr' ? 300 : 260 }}
    >
      {mode === 'choose' && (
        <div className="flex flex-col gap-1">
          <button
            onClick={() => { onShowJoinQr(); onClose() }}
            className="text-left text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg px-3 py-2"
          >
            📱 Add a new team
            <span className="block text-xs text-gray-400 font-normal">Shows the join QR on the TV</span>
          </button>
          <button
            onClick={openTeamPicker}
            className="text-left text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg px-3 py-2"
          >
            🔑 Reauth a team's phone
            <span className="block text-xs text-gray-400 font-normal">Their phone lost its session</span>
          </button>
        </div>
      )}

      {mode === 'pick-team' && (
        <div className="flex flex-col gap-1 max-h-72 overflow-y-auto">
          <div className="flex items-center justify-between px-1 pb-1">
            <button onClick={() => setMode('choose')} className="text-xs text-gray-400 hover:text-gray-600">← Back</button>
            <p className="text-xs text-gray-400">Pair which team?</p>
          </div>
          {loadingTeams && <p className="text-sm text-gray-400 px-3 py-2">Loading…</p>}
          {!loadingTeams && teams.length === 0 && (
            <p className="text-sm text-gray-400 px-3 py-2">No registered teams yet</p>
          )}
          {teams.map(t => {
            // A team that's currently connected almost certainly does NOT
            // need reauth — the whole point is a phone that lost its
            // session, and a connected phone still has one. Surfacing this
            // matters because reauth has no undo: redeeming immediately
            // kicks whatever phone currently owns that team's row off both
            // writes AND reads of its own answers, so picking the wrong
            // (actually-fine) team by mistake locks out a working phone.
            const connected = !!t.is_connected
            return (
              <button
                key={t.id}
                onClick={() => pickTeam(t)}
                className="text-left text-sm text-gray-700 hover:bg-gray-100 rounded-lg px-3 py-2 flex items-center gap-2"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${connected ? 'bg-green-500' : 'bg-gray-300'}`}
                  title={connected ? 'Currently connected' : 'Not connected'}
                />
                <span className="flex-1">{t.name}</span>
                {connected && <span className="text-[10px] text-green-600 font-medium">connected</span>}
              </button>
            )
          })}
          {error && <p className="text-xs text-red-500 px-1 pt-1">{error}</p>}
        </div>
      )}

      {mode === 'qr' && (
        <div className="flex flex-col items-center gap-2 p-2">
          <p className="text-xs text-gray-500 text-center">
            Have them scan this on their own phone — pairs it to the team's existing score. Expires in 15 minutes.
          </p>
          {qrDataUrl && <img src={qrDataUrl} alt="Reauth QR" className="w-56 h-56" />}
          <button onClick={onClose} className="text-xs text-gray-400 hover:text-gray-600 mt-1">Done</button>
        </div>
      )}
    </div>
  )
}
