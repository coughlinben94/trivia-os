import { useBenPhotos } from '../../hooks/useBenPhotos.js'

// The one photo Ben pinned to the Pre-Show / "main" screen (2026-08-17) —
// the arms-up pointing cutout, aimed at the QR code. Deliberately NOT part of
// the random pool below: every other surface still gets a random Ben, this
// screen always gets this one. Lives here (rather than duplicated in both
// Pre-Show renderers) so the path has a single source of truth — a typo in
// one copy would silently show a broken image on the show's opening screen.
// Space in the filename is percent-encoded; the /api/ben-photos route emits
// it raw, but a hand-written literal is safer escaped.
export const PRESHOW_BEN_PHOTO = '/ben/Untitled%20design2.png'

export default function BenPhoto({ size = 80, className = '' }) {
  const { randomPhoto, loading } = useBenPhotos()

  if (loading || !randomPhoto) return null

  return (
    <img
      src={randomPhoto}
      alt="Ben"
      className={className}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        objectFit: 'cover',
        display: 'block',
      }}
    />
  )
}
