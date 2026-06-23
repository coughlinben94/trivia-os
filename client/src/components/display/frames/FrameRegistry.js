function NoFrame({ children }) {
  return children
}

const registry = {
  'none': NoFrame,
}

export function getFrame(type) {
  return registry[type] ?? registry['none']
}

export default registry
