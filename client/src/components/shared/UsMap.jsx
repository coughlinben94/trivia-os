// client/src/components/shared/UsMap.jsx
import { lonLatToMap, MAP_W, MAP_H } from '../../lib/usMapGeo.js'
import { US_CITIES } from '../../lib/usCities.js'

// Render-only. `view` = {k, tx, ty}; children are drawn in MAP coordinates
// inside the transformed group. Strokes stay hairline at every zoom
// (non-scaling-stroke); pins/labels counter-scale by 1/k so they keep a
// constant on-screen size.
export default function UsMap({ view, states, cities = US_CITIES, showCities = false, ink = '#ffffff', cityLabelSize = 10, children }) {
  const { k, tx, ty } = view
  return (
    <svg viewBox={`0 0 ${MAP_W} ${MAP_H}`} width="100%" height="100%" style={{ display: 'block' }} aria-hidden="true">
      <g transform={`translate(${tx} ${ty}) scale(${k})`}>
        {(states ?? []).map(s => (
          <path key={s.id} d={s.d} fill={`${ink}14`} stroke={`${ink}66`} strokeWidth="1" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
        ))}
        {showCities && cities.filter(c => k >= c.minK).map(c => {
          const [x, y] = lonLatToMap(c.lon, c.lat)
          return (
            <g key={c.name} transform={`translate(${x} ${y}) scale(${1 / k})`}>
              <circle r="2.5" fill={`${ink}aa`} />
              <text x="5" y="3.5" fontSize={cityLabelSize} fill={`${ink}cc`} style={{ fontFamily: 'DM Sans, sans-serif' }}>{c.name}</text>
            </g>
          )
        })}
        {typeof children === 'function' ? children(k) : children}
      </g>
    </svg>
  )
}

// Tip of the pin sits exactly on the point (size scales about the tip).
// labelSize is the FINAL label font size in map units: the label sits inside
// the size-scaled group, so it is divided by size here.
export function PinMarker({ lon, lat, k, color = '#f5c842', label, size = 1, labelSize = 12 }) {
  const [x, y] = lonLatToMap(lon, lat)
  return (
    <g transform={`translate(${x} ${y}) scale(${size / k})`}>
      <path d="M0 0 L-6 -14 A8 8 0 1 1 6 -14 Z" fill={color} stroke="#000" strokeOpacity="0.55" strokeWidth="1" />
      <circle cy="-20" r="3" fill="#000" fillOpacity="0.55" />
      {label ? <text x="11" y="-16" fontSize={labelSize / size} fontWeight="700" fill="#fff" stroke="#000" strokeWidth="3" paintOrder="stroke" style={{ fontFamily: 'DM Sans, sans-serif' }}>{label}</text> : null}
    </g>
  )
}
