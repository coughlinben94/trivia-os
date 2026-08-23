import { Component } from 'react'

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary] crash:', error, info.componentStack)
  }

  // Reset without remounting. A caller that needs "clear a tripped boundary
  // when X changes" used to do it by putting X in this component's `key`
  // (forcing React to destroy and recreate it) — but when this boundary sits
  // inside an AnimatePresence, that same remount also destroys the
  // AnimatePresence instance itself, silently killing any exit animation it
  // was supposed to run (2026-08-23, found via Opus review: a slide's own
  // crash-reset key, wrapping AnimatePresence, made every enter/exit
  // transition a no-op). `resetKey` clears `hasError` in place instead.
  componentDidUpdate(prevProps) {
    if (this.state.hasError && this.props.resetKey !== prevProps.resetKey) {
      this.setState({ hasError: false })
    }
  }

  render() {
    if (this.state.hasError) {
      // `!== undefined`, NOT truthiness (fixed 2026-08-18). `fallback={null}`
      // — "render nothing, leave the TV alone" — is the single most common
      // thing display-side callers want, and a truthiness test silently
      // routed every one of them to the desktop-styled white reload card
      // below: the exact outcome those call sites' own comments say they are
      // avoiding. ParticleBackground.jsx had already hit this and worked
      // around it locally with `fallback={<></>}`; five boundaries added in
      // 881db17 (Display.jsx) had not, so a throw in any overlay would have
      // painted a 100vh "Something went wrong in the editor" panel over a
      // live venue TV. Fixing the test here rather than at each call site
      // keeps `null` meaning "render nothing" for every future caller too.
      // Callers that pass NO fallback still get the default card.
      if (this.props.fallback !== undefined) return this.props.fallback
      return (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          height: '100vh', background: '#f9fafb',
          fontFamily: 'DM Sans, system-ui, sans-serif',
        }}>
          <div style={{
            textAlign: 'center', padding: '2rem 2.5rem',
            background: 'white', borderRadius: '12px',
            border: '1px solid #e5e7eb', maxWidth: '380px',
          }}>
            <p style={{ color: '#111827', fontWeight: 600, fontSize: '0.95rem', margin: 0 }}>
              Something went wrong in the editor
            </p>
            <p style={{ color: '#6b7280', fontSize: '0.8rem', margin: '0.5rem 0 0' }}>
              Check the console for details.
            </p>
            <button
              onClick={() => window.location.reload()}
              style={{
                marginTop: '1.25rem', padding: '0.5rem 1.25rem',
                background: '#374151', color: 'white',
                border: 'none', borderRadius: '6px',
                cursor: 'pointer', fontSize: '0.875rem', fontWeight: 500,
              }}
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
