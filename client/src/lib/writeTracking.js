// Wraps a Supabase write, surfacing failure via the host-visible writeError
// state (Host.jsx toasts on it) instead of letting it vanish into console.error.
export async function trackWrite(supabaseResult, setWriteError, failMessage = 'Save failed — check connection') {
  const { error } = await supabaseResult
  setWriteError(error ? { id: `we_${Date.now()}`, message: failMessage } : null)
  return !error
}
