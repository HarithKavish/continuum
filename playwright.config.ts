import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against the production build served by `vite preview`, so they
// exercise exactly what is deployed. Provider requests go to the real services.
// Set PLAYWRIGHT_BASE_URL to run the same suite against a deployed site instead.
const deployed = process.env.PLAYWRIGHT_BASE_URL;
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: deployed ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
        launchOptions: {
          args: [
            '--use-angle=swiftshader',
            '--enable-unsafe-swiftshader',
            '--ignore-gpu-blocklist',
          ],
        },
      },
    },
  ],
  webServer: deployed
    ? undefined
    : {
        command: 'pnpm preview --strictPort',
        url: 'http://localhost:4173',
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
