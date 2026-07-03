import { defineConfig, devices } from '@playwright/test'

// Loads PLAYWRIGHT_HOST_PIN (and anything else) from .env.local — gitignored,
// never commit the real PIN. No-op if the file doesn't exist (e.g. in CI,
// where the var should be set directly in the environment instead).
try { process.loadEnvFile('.env.local') } catch {}

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
