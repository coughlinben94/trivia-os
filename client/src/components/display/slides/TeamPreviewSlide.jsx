import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'
import { supabase } from '../../../lib/supabase.js'
import SlideElements from '../SlideElements.jsx'

const EASE_SNAP = [0.23, 1, 0.32, 1]

export default function TeamPreviewSlide({ slide, show }) {
  const { theme } = useTheme()
  const [teams, setTeams] = useState([])

  useEffect(() => {
    if (!show?.id) return
    supabase
      .from('teams')
      .select('id, name')
      .eq('show_id', show.id)
      .order('registered_at', { ascending: true })
      .then(({ data }) => { if (data) setTeams(data) })
  }, [show?.id])

  return (
    <div
      className="w-full h-full relative flex flex-col items-center justify-center overflow-hidden"
      style={{ background: theme.colors.bg }}
    >
      {/* Ambient glow */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `radial-gradient(ellipse 80% 60% at 50% 50%, ${theme.colors.accent}30 0%, transparent 70%)`,
        }}
      />

      {/* Heading */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: EASE_SNAP }}
        style={{
          fontFamily: `'${theme.fonts.display}', sans-serif`,
          fontSize: 'clamp(2rem, 4vw, 3.5rem)',
          color: theme.colors.text,
          fontWeight: 700,
          letterSpacing: '-0.02em',
          marginBottom: '2rem',
          zIndex: 1,
        }}
      >
        Tonight's Teams
      </motion.div>

      {/* Team grid */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0.75rem',
        justifyContent: 'center',
        maxWidth: '80%',
        zIndex: 1,
      }}>
        {teams.map((team, i) => (
          <motion.div
            key={team.id}
            initial={{ opacity: 0, scale: 0.85, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ delay: i * 0.06, duration: 0.3, ease: EASE_SNAP }}
            style={{
              background: `${theme.colors.accent}18`,
              border: `1.5px solid ${theme.colors.accent}50`,
              borderRadius: '999px',
              padding: '0.55rem 1.4rem',
              fontFamily: `'${theme.fonts.display}', sans-serif`,
              fontSize: 'clamp(1rem, 2vw, 1.6rem)',
              color: theme.colors.text,
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {team.name}
          </motion.div>
        ))}

        {teams.length === 0 && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.4 }}
            transition={{ delay: 0.5, duration: 0.4, ease: EASE_SNAP }}
            style={{
              color: theme.colors.text,
              fontFamily: "'DM Sans', sans-serif",
              fontSize: '1.2rem',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            No teams yet
          </motion.p>
        )}
      </div>

      {/* Team count */}
      {teams.length > 0 && (
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 0.45 }}
          transition={{ delay: 0.4, duration: 0.4, ease: EASE_SNAP }}
          style={{
            marginTop: '2rem',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: '1rem',
            color: theme.colors.text,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            zIndex: 1,
          }}
        >
          {teams.length} {teams.length === 1 ? 'team' : 'teams'} competing tonight
        </motion.p>
      )}

      <SlideElements elements={slide.data?.elements} theme={theme} />
    </div>
  )
}
