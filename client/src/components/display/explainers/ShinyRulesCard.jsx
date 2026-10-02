import { explainerCopy } from '../../../lib/shinyExplainers.js'
import ShinyExampleFrame from './ShinyExampleFrame.jsx'

export default function ShinyRulesCard({ definition, data, children }) {
  const { action, scoring } = explainerCopy(definition, data)
  return <ShinyExampleFrame action={action} scoring={scoring}>{children}</ShinyExampleFrame>
}
