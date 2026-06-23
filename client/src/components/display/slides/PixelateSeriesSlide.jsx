import { motion, AnimatePresence } from 'framer-motion'
import { useTheme } from '../../shared/ThemeProvider.jsx'

const EASE_SNAP = [0.23, 1, 0.32, 1]

export default function PixelateSeriesSlide({ slide, show }) {
  const { theme } = useTheme()
  const { data } = slide

  const stages = data.stages ?? []
  // currentStage updated by host in Live Mode (step 6) — stored in slide.data
  const activeStage = Math.min(data.currentStage ?? 0, stages.length - 1)
  const stageData = stages[activeStage]

  const totalStages = stages.length
  const stageLabel = `${activeStage + 1} / ${totalStages}`

  return (
    <div
      className="w-full h-full relative overflow-hidden"
      style={{ background: theme.colors.bgDeep }}
    >
      {/* Image — AnimatePresence to animate between stages */}
      <AnimatePresence mode="wait">
        {stageData?.mediaUrl && (
          <motion.img
            key={`stage-${activeStage}`}
            src={stageData.mediaUrl}
            alt=""
            className="absolute inset-0 w-full h-full object-contain"
            initial={{ opacity: 0, scale: 1.06 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: EASE_SNAP }}
            style={{ background: theme.colors.bgDeep }}
          />
        )}
      </AnimatePresence>

      {/* Gradient scrim — bottom */}
      <div
        className="absolute bottom-0 left-0 right-0 pointer-events-none"
        style={{
          background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 50%)',
          paddingBottom: 56,
          paddingTop: 100,
        }}
      />

      {/* Question text + stage indicator — bottom overlay */}
      <div className="absolute bottom-0 left-0 right-0 pb-14 px-16 z-10">
        <div className="flex items-end justify-between gap-6">
          <p
            className="leading-snug flex-1"
            style={{
              color: '#f5f0e8',
              fontFamily: `'${theme.fonts.body}', 'Inter', sans-serif`,
              fontSize: 'clamp(1.75rem, 3.5vw, 3.5rem)',
              fontWeight: 500,
            }}
          >
            {data.text}
          </p>

          {/* Stage badge */}
          <div className="shrink-0 flex flex-col items-center gap-1">
            <span
              style={{
                color: theme.colors.textMuted,
                fontSize: '0.75rem',
                fontWeight: 700,
                letterSpacing: '0.15em',
                textTransform: 'uppercase',
              }}
            >
              Pixelate
            </span>
            <div className="flex gap-1.5">
              {stages.map((_, i) => (
                <div
                  key={i}
                  className="rounded-full transition-all duration-300"
                  style={{
                    width: 10,
                    height: 10,
                    background: i <= activeStage ? theme.colors.shinyAccent : `${theme.colors.accent}55`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Question number badge */}
      <div
        className="absolute top-6 left-10 z-20 flex items-center justify-center rounded-full"
        style={{ width: 72, height: 72, background: theme.colors.accent }}
      >
        <span
          style={{
            fontFamily: `'Boogaloo', sans-serif`,
            color: theme.colors.highlight,
            fontSize: '1.75rem',
            fontWeight: 700,
          }}
        >
          {data.questionNumber}
        </span>
      </div>
    </div>
  )
}
