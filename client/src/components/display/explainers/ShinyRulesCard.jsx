import ShinyExampleFrame from './ShinyExampleFrame.jsx'

export default function ShinyRulesCard({ definition, children }) {
  return <ShinyExampleFrame action={definition.action} scoring={definition.scoring}>{children}</ShinyExampleFrame>
}
