import { useState, useEffect } from 'react'
import QRCode from 'qrcode'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { useTheme } from '../shared/ThemeProvider.jsx'
import { EASE_OUT } from '../../lib/easings.js'

// A late-arriving team's join QR, as a dark overlay on top of whatever slide
// is currently live — TV and phones keep their exact position untouched.
// Replaces the old goLiveFrom(preShowIndex) jump (LiveMode.jsx, 2026-08-26)
// that navigated the WHOLE show to the pre-show slide, broadcast to every
// phone, and could get stranded there by the pre-show walkout song's own
// auto-advance (2026-09-09, Ben, live: the Late Team button "makes me go
// back to main screen" instead of just showing the QR over what was already
// playing).
export default function LateTeamQrOverlay({ show }) {
  const { theme } = useTheme()
  const reduce = useReducedMotion()
  const visible = show.late_team_qr_visible ?? show.showState?.lateTeamQrVisible ?? false
  const [qrDataUrl, setQrDataUrl] = useState(null)

  const joinUrl = `${window.location.origin}/join?show=${show.id}`
  useEffect(() => {
    if (!visible) return
    QRCode.toDataURL(joinUrl, { width: 280, margin: 2, color: { dark: '#111111', light: '#f5f0e8' } })
      .then(url => setQrDataUrl(url))
  }, [visible, joinUrl])

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="late-team-qr-overlay"
          data-late-team-qr-overlay
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: reduce ? 0.15 : 0.3, ease: EASE_OUT }}
          className="absolute inset-0 z-[60] flex flex-col items-center justify-center gap-6"
          style={{ background: 'rgba(0,0,0,0.92)' }}
        >
          <p style={{
            fontFamily: `'${theme.fonts.display}', sans-serif`,
            color: theme.colors.highlight,
            fontSize: 'clamp(1.75rem, 4vw, 3rem)',
            fontWeight: 700,
            textAlign: 'center',
          }}>
            New team? Scan to join!
          </p>
          {qrDataUrl && (
            <img src={qrDataUrl} alt="Join QR code" style={{ width: 280, height: 280, borderRadius: 16 }} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
