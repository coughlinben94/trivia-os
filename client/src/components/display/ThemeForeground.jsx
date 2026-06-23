export default function ThemeForeground({ theme }) {
  const Foreground = theme?.scene?.foreground
  if (!Foreground) return null

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 20,
        pointerEvents: 'none',
      }}
    >
      <Foreground theme={theme} />
    </div>
  )
}
