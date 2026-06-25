import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: {
    baseURL: 'https://trivia-os.vercel.app',
    headless: true,
    screenshot: 'only-on-failure',
  },
})
