export default function BaynesWatermark() {
  return (
    <div className="absolute bottom-5 right-5 z-50 pointer-events-none" style={{ opacity: 0.18 }}>
      <img
        src="/baynes-logo.svg"
        alt=""
        className="h-12 object-contain"
        // brightness(0) crushes both the badge's black disc AND its white
        // interior lettering to black before invert(1) raises everything
        // back to white — the logo's detail is positive white fill, not
        // negative space, so this collapsed it into one flat gray circle
        // instead of a legible watermark. invert(1) alone reads correctly.
        style={{ filter: 'invert(1)' }}
      />
    </div>
  )
}
