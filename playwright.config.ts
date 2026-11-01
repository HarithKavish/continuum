import { defineConfig, devices } from '@playwright/test';
import { DEFAULT_OVERLAYS } from './src/config/providers/layers';
import { savedOverlays } from './tests/e2e/helpers';

// End-to-end tests run against the production build served by `vite preview`, so they
// exercise exactly what is deployed. Provider requests go to the real services.
// Set PLAYWRIGHT_BASE_URL to run the same suite against a deployed site instead.
const deployed = process.env.PLAYWRIGHT_BASE_URL;
const baseURL = deployed ?? 'http://localhost:4173';
// Every test starts with the default layers except live clouds: under a software GPU the
// cloud loop's renders crowd out everything else. The clouds test turns them on.
const testPreferences = savedOverlays(
  DEFAULT_OVERLAYS.filter((id) => id !== 'geostationary-clouds'),
);
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    storageState: {
      cookies: [],
      origins: [
        {
          origin: new URL(baseURL).origin,
          localStorage: [{ name: 'continuum.preferences.v1', value: testPreferences }],
        },
      ],
    },
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
