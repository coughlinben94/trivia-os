export default function WaveformBars({ theme, playing, barCount = 28 }) {
  return (
    <div className="flex items-end gap-1.5" style={{ height: 80 }}>
      {Array.from({ length: barCount }, (_, i) => (
        <div
          key={i}
          className="rounded-full"
          style={{
            width: 5,
            height: '100%',
            background: theme.colors.shinyAccent,
            transformOrigin: 'bottom',
            animation: playing
              ? `waveformBar 800ms ${i * 35}ms ease-in-out infinite`
              : `waveformIdle 3200ms ${i * 110}ms ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  )
}
