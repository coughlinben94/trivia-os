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
    console.error('[ErrorBoundary] Host editor crash:', error, info.componentStack)
  }

  render() {
    if (this.state.hasError) {
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
