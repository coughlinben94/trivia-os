import BoxingRing from './BoxingRing.jsx'
import CardPick from './CardPick.jsx'
import ChestDuel from './ChestDuel.jsx'

export const SELECTION_ANIMATIONS = [
  { id: 'boxing',    label: 'Boxing Ring', emoji: '🥊', Component: BoxingRing },
  { id: 'cards',     label: 'Card Draw',   emoji: '🃏', Component: CardPick  },
  { id: 'chestduel', label: 'Chest Duel',  emoji: '🎁', Component: ChestDuel },
]

export const getSelectionAnimation = (id) =>
  (SELECTION_ANIMATIONS.find((a) => a.id === id) || SELECTION_ANIMATIONS[0]).Component
