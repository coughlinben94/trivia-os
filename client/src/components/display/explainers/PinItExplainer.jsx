import { motion, useReducedMotion } from 'framer-motion'
import UsMap, { PinMarker } from '../../shared/UsMap.jsx'
import MapLoadRetry from '../../shared/MapLoadRetry.jsx'
import { useUsMapData } from '../../../hooks/useUsMapData.js'
import { MAP_H, MAP_W, lonLatToMap } from '../../../lib/usMapGeo.js'
import { scorePinRound } from '../../../lib/pinScoring.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD } from '../../../lib/shinyGold.js'
import { useTheme } from '../../shared/ThemeProvider.jsx'

// Zoomed onto the Midwest/Southeast so the pins and tags read from across the
// room: k = 1.8 centered on map point (630, 320), which keeps every sample pin
// (Detroit target out to Dallas) inside the frame.
const ZOOM_K = 1.8
const ZOOM_CENTER = [630, 320]
export const ZOOM_VIEW = { k: ZOOM_K, tx: MAP_W / 2 - ZOOM_K * ZOOM_CENTER[0], ty: MAP_H / 2 - ZOOM_K * ZOOM_CENTER[1] }

const SAMPLE_TARGET = { lat: 42.3314, lon: -83.0458 }
const SAMPLE_GUESSES = [
  { teamId: 'sample-a', teamName: 'Guess A', pin: { lat: 41.5, lon: -81.69 } },
  { teamId: 'sample-b', teamName: 'Guess B', pin: { lat: 41.88, lon: -87.63 } },
  { teamId: 'sample-c', teamName: 'Guess C', pin: { lat: 36.16, lon: -86.78 } },
  { teamId: 'sample-d', teamName: 'Guess D', pin: { lat: 33.75, lon: -84.39 } },
  { teamId: 'sample-e', teamName: 'Guess E', pin: { lat: 32.78, lon: -96.8 } },
]
export const SAMPLE_PIN_RESULTS = scorePinRound({ entries: SAMPLE_GUESSES, correct: SAMPLE_TARGET, roomSize: SAMPLE_GUESSES.length })
const TARGET_XY = lonLatToMap(SAMPLE_TARGET.lon, SAMPLE_TARGET.lat)
const SAMPLE_SCORERS = SAMPLE_PIN_RESULTS.filter(result => result.points > 0)

const PIN_SIZE = 2.2
const LABEL_SIZE = 36
const letter = result => result.teamName.replace('Guess ', '')

export default function PinItExplainer() {
  const states = useUsMapData()
  const reduce = useReducedMotion()
  const { theme } = useTheme()
  const ink = theme.colors.text
  const bodyFont = `'${theme.fonts.body}', 'DM Sans', sans-serif`
  const enter = (delay, y = 12) => ({
    initial: reduce ? { opacity: 0 } : { opacity: 0, transform: `translateY(${y}px)` },
    animate: reduce ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px)' },
    transition: { duration: 0.4, delay: reduce ? 0 : delay, ease: EASE_OUT },
  })

  return (
    <div role="img" aria-label={`Example map: five sample guesses around a target. ${SAMPLE_SCORERS.map(r => letter(r)).join(' and ')} are closest and earn +${SAMPLE_SCORERS[0]?.points}; the others score 0.`} style={{
      width: `min(94%, calc(60vh * ${MAP_W} / ${MAP_H}))`, maxHeight: '60vh',
      aspectRatio: `${MAP_W} / ${MAP_H}`, position: 'relative', overflow: 'hidden',
      borderRadius: 14, background: 'rgba(255,255,255,0.035)',
    }}>
      <UsMap view={ZOOM_VIEW} states={states} showCities={false} ink={ink}>
        {k => (
          <>
            {SAMPLE_SCORERS.map((result, index) => {
              const [x1, y1] = lonLatToMap(result.pin.lon, result.pin.lat)
              const [x2, y2] = TARGET_XY
              return (
                <motion.line
                  key={`line-${result.teamId}`}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={SHINY_GOLD} strokeOpacity="0.85" strokeWidth="3.5" strokeDasharray="10 8"
                  vectorEffect="non-scaling-stroke"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.35, delay: reduce ? 0 : 1.7 + index * 0.08, ease: EASE_OUT }}
                />
              )
            })}
            {SAMPLE_PIN_RESULTS.map((result, index) => {
              const scored = result.points > 0
              const [x, y] = lonLatToMap(result.pin.lon, result.pin.lat)
              // Tag goes on the side away from the target so it never touches it.
              const tagX = x < TARGET_XY[0] ? -126 : 52
              return (
                <motion.g key={result.teamId} {...enter(0.6 + index * 0.06)}>
                  <g opacity={scored ? 1 : 0.6}>
                    <PinMarker
                      lon={result.pin.lon} lat={result.pin.lat} k={k} size={PIN_SIZE}
                      label={scored ? letter(result) : `${letter(result)} ✗`} labelSize={LABEL_SIZE}
                      color={scored ? '#70f0ba' : '#75a8e8'} crisp
                    />
                  </g>
                  {scored && (
                    // Gold "+10" tag beside the pin.
                    <motion.g
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }}
                      transition={{ duration: 0.3, delay: reduce ? 0 : 2.2 + index * 0.06, ease: EASE_OUT }}
                    >
                      <g transform={`translate(${x} ${y}) scale(${1 / k})`}>
                        <rect x={tagX} y="-66" width="74" height="42" rx="10" fill={SHINY_GOLD} stroke="#1a1a1a" strokeOpacity="0.6" strokeWidth="2" />
                        <text x={tagX + 37} y="-36" textAnchor="middle" fontSize="30" fontWeight="800" fill="#1a1a1a" style={{ fontFamily: bodyFont, fontVariantNumeric: 'tabular-nums' }}>
                          +{result.points}
                        </text>
                      </g>
                    </motion.g>
                  )}
                </motion.g>
              )
            })}
            <motion.g {...enter(1.3, -12)}>
              <PinMarker lon={SAMPLE_TARGET.lon} lat={SAMPLE_TARGET.lat} k={k} size={2.4} color={SHINY_GOLD} crisp />
              {/* Label centered above the target pin, clear of A to its right. */}
              <g transform={`translate(${TARGET_XY[0]} ${TARGET_XY[1]}) scale(${1 / k})`}>
                <text x="0" y="-74" textAnchor="middle" fontSize="38" fontWeight="800" fill={SHINY_GOLD} stroke="#000" strokeWidth="5" paintOrder="stroke" style={{ fontFamily: bodyFont }}>
                  Target
                </text>
              </g>
            </motion.g>
          </>
        )}
      </UsMap>
      <MapLoadRetry states={states} ink={ink} retry={false} />
    </div>
  )
}
