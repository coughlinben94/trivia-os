import { useBenPhotos } from '../../hooks/useBenPhotos.js'

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
