import { useMemo } from 'react'

export default function ParticleBackground({ theme }) {
  const particles = useMemo(() => {
    const count = theme.particles?.count ?? 30
    return Array.from({ length: count }, (_, i) => ({
      id: i,
      left:     `${Math.random() * 100}%`,
      top:      `${Math.random() * 100}%`,
      size:     Math.random() * 2.5 + 1,
      delay:    Math.random() * 10,
      duration: Math.random() * 6 + 7,
    }))
  // Re-generate when theme changes — seeded by theme id
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme.id])

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {particles.map(p => (
        <div
          key={p.id}
          className="absolute rounded-full"
          style={{
            left:      p.left,
            top:       p.top,
            width:     p.size,
            height:    p.size,
            background: theme.particles?.color ?? '#ffffff',
            animation: `particleFloat ${p.duration}s ${p.delay}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  )
}
