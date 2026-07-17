import BoxingRing from './BoxingRing.jsx'
import CardPick from './CardPick.jsx'
import ChestDuel from './ChestDuel.jsx'
import BattleshipDuel from './BattleshipDuel.jsx'
import WhackAMole from './WhackAMole.jsx'

export const SELECTION_ANIMATIONS = [
  { id: 'boxing',     label: 'Boxing Ring',     emoji: '🥊', Component: BoxingRing },
  { id: 'cards',      label: 'Card Draw',       emoji: '🃏', Component: CardPick  },
  { id: 'chestduel',  label: 'Chest Duel',      emoji: '🎁', Component: ChestDuel },
  { id: 'battleship', label: 'Battleship Duel', emoji: '🚢', Component: BattleshipDuel },
  { id: 'whackamole', label: 'Whack-a-Mole',    emoji: '🔨', Component: WhackAMole },
]

export const getSelectionAnimation = (id) =>
  (SELECTION_ANIMATIONS.find((a) => a.id === id) || SELECTION_ANIMATIONS[0]).Component
