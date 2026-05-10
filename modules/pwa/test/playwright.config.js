// Playwright configuration for the Hugo PWA validation matrix.
//
// The orchestrator scripts (run-matrix.sh / run-matrix.cmd) launch a Hugo dev server,
// then invoke `npx playwright test` against the FIXTURE_URL (default http://127.0.0.1:1313).
// Tests are intentionally chromium-only because the install-prompt event is Chromium-specific
// per the W3C BeforeInstallPromptEvent draft; matrix rows that test cross-browser behavior
// (manifest, SW registration) still pass on Firefox/WebKit but the install-prompt row would
// be skipped, so the matrix runs in a single-browser configuration for determinism.

const {defineConfig, devices} = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', {outputFolder: 'playwright-report', open: 'never'}],
  ],
  use: {
    baseURL: process.env.FIXTURE_URL || 'http://127.0.0.1:1313',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    serviceWorkers: 'allow',
  },
  projects: [
    {
      name: 'chromium',
      use: {...devices['Desktop Chrome']},
    },
  ],
});
