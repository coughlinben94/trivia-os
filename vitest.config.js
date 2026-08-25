import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Node by default — all but one of these suites are pure functions and
    // shouldn't pay for a DOM. The one that renders a component opts in with a
    // `// @vitest-environment jsdom` docblock at the top of the file.
    environment: 'node',
    include: ['client/src/**/*.test.js', 'client/src/**/*.test.jsx'],
  },
})
