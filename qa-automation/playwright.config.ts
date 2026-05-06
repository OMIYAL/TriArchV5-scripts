import { defineConfig, devices } from '@playwright/test';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

/**
 * Authenticated session file produced by fixtures/auth.setup.ts.
 * All browser projects reuse this — login runs only ONCE per test run.
 */
const AUTH_STATE_FILE = path.join(__dirname, 'playwright/.auth/auth-state.json');

export default defineConfig({
  testDir: '.',                   // search from project root so fixtures/ is in scope
  testIgnore: ['**/node_modules/**', '**/playwright-report/**', '**/test-results/**'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['html'],
    ['list'],
  ],

  use: {
    baseURL: process.env.BASE_URL || 'https://stg-portal.triarch.ai/',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // ── 1. SETUP PROJECT ────────────────────────────────────────────────────
    // Runs auth.setup.ts once; saves session to playwright/.auth/auth-state.json
    {
      name: 'setup',
      testMatch: /auth\.setup\.ts/,
    },

    // ── 2. BROWSER TEST PROJECTS ────────────────────────────────────────────
    // Each depends on 'setup' and starts with the saved authenticated session.
    {
      name: 'chromium',
      testMatch: '**/tests/**/*.spec.ts',
      use: {
        ...devices['Desktop Chrome'],
        storageState: AUTH_STATE_FILE,
      },
      dependencies: ['setup'],
    },
    {
      name: 'firefox',
      testMatch: '**/tests/**/*.spec.ts',
      use: {
        ...devices['Desktop Firefox'],
        storageState: AUTH_STATE_FILE,
      },
      dependencies: ['setup'],
    },
    {
      name: 'webkit',
      testMatch: '**/tests/**/*.spec.ts',
      use: {
        ...devices['Desktop Safari'],
        storageState: AUTH_STATE_FILE,
      },
      dependencies: ['setup'],
    },
  ],
});