import BoxingRing from './BoxingRing.jsx'
import CardPick from './CardPick.jsx'
import ChestDuel from './ChestDuel.jsx'
import BattleshipDuel from './BattleshipDuel.jsx'
import Abduction from './Abduction.jsx'
import LottoPicker from './LottoPicker.jsx'

export const SELECTION_ANIMATIONS = [
  { id: 'boxing',     label: 'Boxing Ring',     emoji: '🥊', Component: BoxingRing },
  { id: 'cards',      label: 'Card Draw',       emoji: '🃏', Component: CardPick  },
  { id: 'chestduel',  label: 'Chest Duel',      emoji: '🎁', Component: ChestDuel },
  { id: 'battleship', label: 'Battleship Duel', emoji: '🚢', Component: BattleshipDuel },
  { id: 'abduction',  label: 'Abduction',       emoji: '👽', Component: Abduction },
  // Last on purpose — LottoPicker rolls one of the entries ABOVE it and chains
  // into it, so it must never be the fallback getSelectionAnimation returns.
  { id: 'lotto',      label: 'Surprise Me',     emoji: '🎰', Component: LottoPicker },
]

export const getSelectionAnimation = (id) =>
  (SELECTION_ANIMATIONS.find((a) => a.id === id) || SELECTION_ANIMATIONS[0]).Component
