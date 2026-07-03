import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase.js'

// Locks Build Mode / Live Mode behind a 4-digit PIN. The PIN itself is never
// checked client-side — verify-host-pin (Edge Function) hashes and compares
// it server-side, then elevates this anonymous session's app_metadata via
// the service-role key. RLS policies on shows/team_scores/scoreboard_teams/
// shiny_formats/questions check that claim (auth.jwt() -> 'app_metadata' ->>
// 'host_verified') for every write. Supabase Auth persists the resulting
// session in localStorage, so this only needs to happen once per browser
// until the session is cleared.
function isHostVerified(session) {
  return session?.user?.app_metadata?.host_verified === true
}

export default function HostPinGate({ children }) {
  const [checking, setChecking] = useState(true)
  const [verified, setVerified] = useState(false)
  const [pin, setPin] = useState('')
  const [error, setError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setVerified(isHostVerified(session))
      setChecking(false)
    })
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      setVerified(isHostVerified(session))
    })
    return () => sub.subscription.unsubscribe()
  }, [])

  async function handleSubmit(e) {
    e.preventDefault()
    if (pin.length !== 4) return
    setSubmitting(true)
    setError(null)
    try {
      let { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        const { data, error: signInError } = await supabase.auth.signInAnonymously()
        if (signInError) throw new Error('Could not start a session — try again')
        session = data.session
      }
      const { data, error: fnError } = await supabase.functions.invoke('verify-host-pin', { body: { pin } })
      if (fnError) throw new Error('Could not reach the server — try again')
      if (!data?.ok) throw new Error(data?.error || 'Incorrect PIN')

      const { data: { session: refreshed } } = await supabase.auth.refreshSession()
      if (!isHostVerified(refreshed)) throw new Error('Verification did not take — try again')
      setVerified(true)
    } catch (err) {
      setError(err.message)
      setPin('')
    } finally {
      setSubmitting(false)
    }
  }

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-sm text-gray-400">Loading…</div>
      </div>
    )
  }

  if (verified) return children

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <form
        onSubmit={handleSubmit}
        className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-xs flex flex-col gap-4"
      >
        <h1 className="text-lg font-semibold text-gray-800 text-center">Enter host PIN</h1>
        <input
          type="password"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={4}
          autoFocus
          value={pin}
          onChange={e => { setPin(e.target.value.replace(/\D/g, '').slice(0, 4)); setError(null) }}
          placeholder="••••"
          className="text-center text-2xl tracking-[0.6em] border border-gray-300 rounded-lg py-3 focus:outline-none focus:border-baynes-forest"
        />
        {error && <p className="text-red-500 text-sm text-center">{error}</p>}
        <button
          type="submit"
          disabled={pin.length !== 4 || submitting}
          className="bg-baynes-forest text-white rounded-lg py-2.5 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {submitting ? 'Checking…' : 'Unlock'}
        </button>
      </form>
    </div>
  )
}
