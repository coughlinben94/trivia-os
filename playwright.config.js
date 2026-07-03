import { defineConfig, devices } from '@playwright/test'
export default defineConfig({
  testDir: './e2e',
  timeout: 30000,
  globalSetup: './e2e/global-setup.js',
  use: {
    baseURL: 'https://trivia-os.vercel.app',
    headless: true,
    screenshot: 'only-on-failure',
    // Pre-authenticated past HostPinGate — see global-setup.js. Every spec
    // that navigates to /host starts already past the PIN prompt.
    storageState: 'e2e/.auth/host.json',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
})
