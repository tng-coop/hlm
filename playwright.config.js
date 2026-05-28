import { defineConfig } from '@playwright/test';

const targetUrl = process.env.TEST_URL || 'https://localhost:5173';
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
    ignoreHTTPSErrors: true,
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
    command: 'npm run dev',
    url: 'https://localhost:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 10000,
    ignoreHTTPSErrors: true,
  },
});
