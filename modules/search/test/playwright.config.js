// Playwright configuration for the search module validation suite.
// The fixture site must be served first (see run-tests.sh / run-tests.cmd);
// FIXTURE_URL points the suite at it. ESM because the repo-root ESLint flat
// config treats .js as ESM and is protected against per-module additions.
// Port 1515 is deliberately distinct from Hugo's default 1313 and the
// sibling suites' 1414.
/* global process */
import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: process.env.FIXTURE_URL || 'http://localhost:1515',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{name: 'chromium', use: {browserName: 'chromium'}}],
});
