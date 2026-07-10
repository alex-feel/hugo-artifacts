// Playwright configuration for the social-share module validation suite.
// The fixture site must be served first (see run-tests.sh / run-tests.cmd);
// FIXTURE_URL points the suite at it. ESM because the repo-root ESLint flat
// config treats .js as ESM and is protected against per-module additions.
/* global process */
import {defineConfig} from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  workers: 1,
  fullyParallel: false,
  use: {
    baseURL: process.env.FIXTURE_URL || 'http://localhost:1414',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{name: 'chromium', use: {browserName: 'chromium'}}],
});
