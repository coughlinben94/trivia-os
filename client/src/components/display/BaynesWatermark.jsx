export default function BaynesWatermark() {
  return (
    <div className="absolute bottom-5 right-5 z-50 pointer-events-none" style={{ opacity: 0.18 }}>
      <img
        src="/baynes-logo.svg"
        alt=""
        className="h-12 object-contain"
        style={{ filter: 'brightness(0) invert(1)' }}
      />
    </div>
  )
}
