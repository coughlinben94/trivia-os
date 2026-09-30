import { motion, useReducedMotion } from 'framer-motion'
import UsMap, { PinMarker } from '../../shared/UsMap.jsx'
import MapLoadRetry from '../../shared/MapLoadRetry.jsx'
import { useUsMapData } from '../../../hooks/useUsMapData.js'
import { MAP_H, MAP_W, lonLatToMap } from '../../../lib/usMapGeo.js'
import { scorePinRound } from '../../../lib/pinScoring.js'
import { EASE_OUT } from '../../../lib/easings.js'
import { SHINY_GOLD } from '../../../lib/shinyGold.js'

const HOME = { k: 1, tx: 0, ty: 0 }
const SAMPLE_TARGET = { lat: 42.3314, lon: -83.0458 }
const SAMPLE_GUESSES = [
  { teamId: 'sample-a', teamName: 'Guess A', pin: { lat: 42.34, lon: -83.04 } },
  { teamId: 'sample-b', teamName: 'Guess B', pin: { lat: 42.36, lon: -83.04 } },
  { teamId: 'sample-c', teamName: 'Guess C', pin: { lat: 42.39, lon: -83.07 } },
  { teamId: 'sample-d', teamName: 'Guess D', pin: { lat: 42.52, lon: -83.2 } },
  { teamId: 'sample-e', teamName: 'Guess E', pin: { lat: 41.91, lon: -83.25 } },
]
const SAMPLE_RESULTS = scorePinRound({ entries: SAMPLE_GUESSES, correct: SAMPLE_TARGET, roomSize: SAMPLE_GUESSES.length })
const SAMPLE_SCORERS = SAMPLE_RESULTS.filter(result => result.points > 0)
const SAMPLE_LINE_POINTS = SAMPLE_SCORERS.map(result => [result.pin, SAMPLE_TARGET])

export default function PinItExplainer() {
  const states = useUsMapData()
  const reduce = useReducedMotion()
  const ink = '#f1f6f2'

  return (
    <div role="img" aria-label="Example US map with five sample guesses around a target; the closest guesses earn points." style={{
      width: `min(94%, calc(49vh * ${MAP_W} / ${MAP_H}))`, height: '100%', maxHeight: '49vh',
      aspectRatio: `${MAP_W} / ${MAP_H}`, position: 'relative', overflow: 'hidden',
      borderRadius: '1.2vmin', background: 'rgba(255,255,255,0.035)',
    }}>
      <UsMap view={HOME} states={states} showCities={false} ink={ink}>
        {k => (
          <>
            {SAMPLE_LINE_POINTS.map(([from, to], index) => {
              const [x1, y1] = lonLatToMap(from.lon, from.lat)
              const [x2, y2] = lonLatToMap(to.lon, to.lat)
              return (
                <motion.line
                  key={`line-${index}`}
                  x1={x1} y1={y1} x2={x2} y2={y2}
                  stroke={SHINY_GOLD} strokeOpacity="0.58" strokeWidth="2" strokeDasharray="8 8"
                  vectorEffect="non-scaling-stroke"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateY(8px)' }}
                  animate={reduce ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px)' }}
                  transition={{ duration: 0.35, delay: reduce ? 0 : 1.7 + index * 0.12, ease: EASE_OUT }}
                />
              )
            })}
            {SAMPLE_RESULTS.map((result, index) => (
              <motion.g
                key={result.teamId}
                initial={reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateY(12px)' }}
                animate={reduce ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px)' }}
                transition={{ duration: 0.4, delay: reduce ? 0 : 0.6 + index * 0.18, ease: EASE_OUT }}
              >
                <PinMarker
                  lon={result.pin.lon} lat={result.pin.lat} k={k} size={1.6}
                  label={result.teamName.replace('Guess ', '')} labelSize={23}
                  color={result.points > 0 ? '#70f0ba' : '#75a8e8'} crisp
                />
              </motion.g>
            ))}
            <motion.g
              initial={reduce ? { opacity: 0 } : { opacity: 0, transform: 'translateY(-12px)' }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, transform: 'translateY(0px)' }}
              transition={{ duration: 0.45, delay: reduce ? 0 : 2.4, ease: EASE_OUT }}
            >
              <PinMarker lon={SAMPLE_TARGET.lon} lat={SAMPLE_TARGET.lat} k={k} size={2} label="Target" labelSize={28} color={SHINY_GOLD} crisp />
            </motion.g>
          </>
        )}
      </UsMap>
      <MapLoadRetry states={states} ink={ink} retry={false} />
      <div style={{
        position: 'absolute', left: '50%', bottom: '1vmin', transform: 'translateX(-50%)',
        padding: '0.55vmin 1.3vmin', borderRadius: '999px', color: ink,
        background: 'rgba(2,10,14,0.88)', fontSize: 'clamp(1rem, 1.7vmin, 1.7rem)',
        fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap',
      }}>
        {SAMPLE_SCORERS.map(result => `${result.teamName.replace('Guess ', '')} +${result.points}`).join('  ·  ')}
      </div>
    </div>
  )
}
