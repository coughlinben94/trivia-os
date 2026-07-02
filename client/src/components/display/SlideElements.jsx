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
    x: 50, y: 50,
    width: type === 'text' ? 60 : 40,
    rotation: 0, flipH: false, flipV: false,
    opacity: 1,
    ...(type === 'text' ? {
      content: '', font: 'Boogaloo', fontSize: 60,
      bold: false, italic: false, underline: false, strikethrough: false,
      align: 'center', textTransform: 'none', color: null,
      curve: 0, letterSpacing: 0, lineHeight: 1.2,
      shadow: false, shadowX: 2, shadowY: 2, shadowBlur: 8, shadowColor: 'rgba(0,0,0,0.8)',
      stroke: false, strokeWidth: 2, strokeColor: '#000000',
      glow: false, glowRadius: 20, glowColor: '#ffffff',
      bgFill: false, bgColor: '#000000', bgOpacity: 0.6, bgPadding: 12, bgRadius: 8,
    } : {
      url: null, borderRadius: 0, blendMode: 'normal',
      filterBrightness: 100, filterContrast: 100, filterSaturate: 100,
      filterHue: 0, filterBlur: 0, filterGrayscale: 0,
      imgGlow: false, imgGlowRadius: 20, imgGlowColor: '#3b82f6',
      imgBorder: false, imgBorderWidth: 3, imgBorderColor: '#ffffff',
    }),
  }
}

function buildTransform(el, base = 'translate(-50%, -50%)') {
  const parts = [base]
  if (el.rotation) parts.push(`rotate(${el.rotation}deg)`)
  if (el.flipH)    parts.push('scaleX(-1)')
  if (el.flipV)    parts.push('scaleY(-1)')
  return parts.join(' ')
}

function hexToRgba(hex, opacity) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${opacity})`
}

// SVG textPath curved text — curve -100 to 100, 0 = straight
function CurvedText({ text, el, color }) {
  const fontSize = el.fontSize ?? 60
  const curve    = el.curve ?? 0
  const charEst  = fontSize * 0.58
  const textW    = Math.max(text.length * charEst, 100)
  const rise     = (curve / 100) * fontSize * 3.5
  const svgW     = textW + fontSize * 2
  const svgH     = Math.abs(rise) + fontSize * 1.6
  const pathId   = `cp-${el.id}`
  const filterId = `gf-${el.id}`

  const yEdge = rise < 0 ? svgH - fontSize * 0.25 : fontSize * 0.25
  const yMid  = rise < 0 ? fontSize * 0.25         : svgH - fontSize * 0.25
  const pathD = `M ${fontSize * 0.5} ${yEdge} Q ${svgW / 2} ${yMid} ${svgW - fontSize * 0.5} ${yEdge}`

  return (
    <svg width={svgW} height={svgH} style={{ overflow: 'visible', display: 'block' }}>
      <defs>
        <path id={pathId} d={pathD} />
        {el.glow && (
          <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation={el.glowRadius ?? 20} result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        )}
      </defs>
      <text
        fontFamily={`'${el.font ?? 'Boogaloo'}', sans-serif`}
        fontSize={fontSize}
        fontWeight={el.bold ? 700 : 400}
        fontStyle={el.italic ? 'italic' : 'normal'}
        fill={color}
        textAnchor="middle"
        filter={el.glow ? `url(#${filterId})` : undefined}
      >
        <textPath href={`#${pathId}`} startOffset="50%">{text}</textPath>
      </text>
    </svg>
  )
}

function TextElement({ el, theme }) {
  if (!el.content) return null
  const hasXY = el.x !== undefined
  const curve  = el.curve ?? 0
  const posStyle = hasXY
    ? { left: `${el.x}%`, top: `${el.y}%`, transform: buildTransform(el), width: `${el.width ?? 60}%` }
    : { ...ELEMENT_POSITIONS[el.position] ?? ELEMENT_POSITIONS.center, maxWidth: '80%' }
  const fontSize = hasXY ? (el.fontSize ?? 60) : undefined
  const textColor = el.color ?? theme.colors.text

  const textDecoration = [el.underline && 'underline', el.strikethrough && 'line-through'].filter(Boolean).join(' ') || undefined

  const glowFilter = el.glow ? `drop-shadow(0 0 ${el.glowRadius ?? 20}px ${el.glowColor ?? '#ffffff'})` : ''

  const sharedStyle = {
    position: 'absolute',
    ...posStyle,
    opacity: el.opacity ?? 1,
    fontFamily: `'${el.font ?? 'Boogaloo'}', sans-serif`,
    fontWeight: el.bold ? 700 : 400,
    fontStyle: el.italic ? 'italic' : 'normal',
    filter: glowFilter || undefined,
    zIndex: 10,
    margin: 0,
  }

  if (curve !== 0 && hasXY) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] } }}
        style={sharedStyle}
      >
        <CurvedText text={el.content} el={el} color={textColor} />
      </motion.div>
    )
  }

  const bgStyle = el.bgFill ? {
    backgroundColor: hexToRgba(el.bgColor ?? '#000000', el.bgOpacity ?? 0.6),
    padding: `${el.bgPadding ?? 12}px`,
    borderRadius: `${el.bgRadius ?? 8}px`,
    display: 'inline-block',
  } : {}

  return (
    <motion.p
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] } }}
      style={{
        ...sharedStyle,
        ...bgStyle,
        color: textColor,
        fontSize: hasXY ? `${fontSize}px` : (TEXT_SIZES[el.size] ?? TEXT_SIZES.md),
        textAlign: el.align ?? 'center',
        textTransform: el.textTransform !== 'none' ? el.textTransform : undefined,
        textDecoration,
        letterSpacing: el.letterSpacing ? `${el.letterSpacing}px` : undefined,
        lineHeight: el.lineHeight ?? 1.2,
        textShadow: el.shadow
          ? `${el.shadowX ?? 2}px ${el.shadowY ?? 2}px ${el.shadowBlur ?? 8}px ${el.shadowColor ?? 'rgba(0,0,0,0.8)'}`
          : undefined,
        WebkitTextStroke: el.stroke ? `${el.strokeWidth ?? 2}px ${el.strokeColor ?? '#000000'}` : undefined,
        wordWrap: 'break-word',
      }}
    >
      {el.content}
    </motion.p>
  )
}

function ImageElement({ el }) {
  if (!el.url) return null
  const hasXY = el.x !== undefined
  const posStyle = hasXY
    ? { left: `${el.x}%`, top: `${el.y}%`, transform: buildTransform(el), width: `${el.width ?? 40}%` }
    : { ...ELEMENT_POSITIONS[el.position] ?? ELEMENT_POSITIONS.center, width: IMAGE_SIZES[el.size] ?? IMAGE_SIZES.md }

  const cssFilters = [
    (el.filterBrightness ?? 100) !== 100 && `brightness(${el.filterBrightness}%)`,
    (el.filterContrast   ?? 100) !== 100 && `contrast(${el.filterContrast}%)`,
    (el.filterSaturate   ?? 100) !== 100 && `saturate(${el.filterSaturate}%)`,
    (el.filterHue        ?? 0)   !== 0   && `hue-rotate(${el.filterHue}deg)`,
    (el.filterBlur       ?? 0)   !== 0   && `blur(${el.filterBlur}px)`,
    (el.filterGrayscale  ?? 0)   !== 0   && `grayscale(${el.filterGrayscale}%)`,
    el.imgGlow && `drop-shadow(0 0 ${el.imgGlowRadius ?? 20}px ${el.imgGlowColor ?? '#3b82f6'})`,
  ].filter(Boolean).join(' ')

  return (
    <motion.img
      src={el.url}
      alt=""
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1, transition: { duration: 0.4, ease: [0.23, 1, 0.32, 1] } }}
      style={{
        position: 'absolute',
        ...posStyle,
        height: 'auto',
        maxWidth: '100%',
        maxHeight: '100%',
        objectFit: 'contain',
        opacity: el.opacity ?? 1,
        borderRadius: el.borderRadius ? `${el.borderRadius}%` : undefined,
        filter: cssFilters || undefined,
        mixBlendMode: el.blendMode !== 'normal' ? el.blendMode : undefined,
        outline: el.imgBorder ? `${el.imgBorderWidth ?? 3}px solid ${el.imgBorderColor ?? '#ffffff'}` : undefined,
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
