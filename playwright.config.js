import { defineConfig } from '@playwright/test';

const targetUrl = process.env.TEST_URL || 'http://localhost:5173';
const isRemoteUrl = !!process.env.TEST_URL;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  // Using multiple workers is safe because Playwright natively isolates localStorage per test context
  workers: process.env.CI ? 2 : undefined,
  retries: 0,
  use: {
    baseURL: targetUrl,
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'Desktop JP',
      use: {
        browserName: 'chromium',
        locale: 'ja-JP',
      },
    },
    {
      name: 'Desktop EN',
      use: {
        browserName: 'chromium',
        locale: 'en-US',
      },
    },
  ],
  webServer: isRemoteUrl ? undefined : {
    // Automatically boot frontend in Demo Mode securely for tests
    // Strip the E2E flag purely when we want massive rich data for manual snapshots!
    command: process.env.TAKE_SCREENSHOTS ? 'VITE_DEMO_MODE=true npm run dev:frontend' : 'VITE_IS_E2E=true VITE_DEMO_MODE=true npm run dev:frontend',
    url: 'http://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
  },
});
