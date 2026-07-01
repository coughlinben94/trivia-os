import { motion } from 'framer-motion'
import { nanoid } from 'nanoid'

// Preset positions — a 3x3 grid plus full-bleed. Values are CSS placement,
// not raw coordinates, so elements always land somewhere sane regardless
// of aspect ratio.
export const ELEMENT_POSITIONS = {
  'top-left':      { top: '8%', left: '8%' },
  'top-center':    { top: '8%', left: '50%', transform: 'translateX(-50%)' },
  'top-right':     { top: '8%', right: '8%' },
  'center-left':   { top: '50%', left: '8%', transform: 'translateY(-50%)' },
  'center':        { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' },
  'center-right':  { top: '50%', right: '8%', transform: 'translateY(-50%)' },
  'bottom-left':   { bottom: '8%', left: '8%' },
  'bottom-center': { bottom: '8%', left: '50%', transform: 'translateX(-50%)' },
  'bottom-right':  { bottom: '8%', right: '8%' },
  'full-bleed':    { inset: 0 },
}

export const ELEMENT_POSITION_LABELS = {
  'top-left': 'Top left', 'top-center': 'Top center', 'top-right': 'Top right',
  'center-left': 'Center left', 'center': 'Center', 'center-right': 'Center right',
  'bottom-left': 'Bottom left', 'bottom-center': 'Bottom center', 'bottom-right': 'Bottom right',
  'full-bleed': 'Full bleed',
}

// Image sizes are a percentage of the slide's width (height auto via object-fit).
export const IMAGE_SIZES = { sm: '18%', md: '32%', lg: '50%', xl: '72%', full: '100%' }

// Text sizes use clamp() so they scale between phone-preview and 4K TV
// consistently, matching the pattern already used across every slide component.
export const TEXT_SIZES = {
  sm: 'clamp(1.2rem, 2vw, 1.8rem)',
  md: 'clamp(1.8rem, 3.2vw, 3rem)',
  lg: 'clamp(2.8rem, 5vw, 4.5rem)',
  xl: 'clamp(4rem, 8vw, 7rem)',
}

export function makeElement(type) {
  return {
    id: `el_${nanoid(8)}`,
    type,
    position: 'center',
    size: 'md',
    ...(type === 'text' ? { content: '', font: 'Boogaloo' } : { url: null }),
  }
}

function TextElement({ el, theme }) {
  if (!el.content) return null
  return (
    <motion.p
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] } }}
      style={{
        position: 'absolute',
        ...ELEMENT_POSITIONS[el.position] ?? ELEMENT_POSITIONS.center,
        color: theme.colors.text,
        fontFamily: `'${el.font ?? 'Boogaloo'}', sans-serif`,
        fontSize: TEXT_SIZES[el.size] ?? TEXT_SIZES.md,
        textAlign: 'center',
        maxWidth: '80%',
        margin: 0,
        zIndex: 10,
      }}
    >
      {el.content}
    </motion.p>
  )
}

function ImageElement({ el }) {
  if (!el.url) return null
  return (
    <motion.img
      src={el.url}
      alt=""
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] } }}
      style={{
        position: 'absolute',
        ...ELEMENT_POSITIONS[el.position] ?? ELEMENT_POSITIONS.center,
        width: IMAGE_SIZES[el.size] ?? IMAGE_SIZES.md,
        height: 'auto',
        objectFit: 'contain',
        zIndex: 10,
      }}
    />
  )
}

export default function SlideElements({ elements, theme }) {
  if (!elements || elements.length === 0) return null
  return (
    <>
      {elements.map(el => el.type === 'text'
        ? <TextElement key={el.id} el={el} theme={theme} />
        : <ImageElement key={el.id} el={el} />
      )}
    </>
  )
}
