import './utils/env.config'; // MUST be first — resolves & injects env vars before anything else reads process.env
import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import path from 'path';

const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: 'steps/**/*.ts',
});

// State file paths
const PORTAL_AUTH_STATE = path.join(__dirname, 'playwright/.auth/portal-auth-state.json');

export default defineConfig({
  testDir,
  testIgnore: [
    '**/node_modules/**',
    '**/playwright-report/**',
    '**/test-results/**',
    '**/utils/**',
    '**/pages/**',
    '**/fixtures/**',
  ],
  timeout: 240000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,

  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  use: {
    actionTimeout: 15000,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',

    // ─── Viewport & Window Size ──────────────────────────────────
    // viewport: null means Playwright will NOT impose a fixed virtual
    // canvas — the viewport size matches the actual browser window.
    // Combined with --start-maximized, the window fills your physical
    // screen and the viewport matches it exactly (no stretching).
    //
    // DO NOT set a fixed pixel size here (e.g. 1920x1080) unless your
    // screen is actually that resolution — it causes the page to render
    // wider than the window and everything gets clipped on the right.
    viewport: null,

    launchOptions: {
      args: ['--start-maximized', '--window-size=1920,1080'],
    },
  },

  projects: [
    // ═══════════════════════════════════════════════════════════════
    // PORTAL AUTH SETUP (For portal tests only)
    // ═══════════════════════════════════════════════════════════════
    {
      name: 'portal-auth-setup',
      testMatch: ['**/tests/setup/**/*.setup.ts', '**/features/control-room/**/*.feature.spec.js'],
      use: {
        headless: true, // auth setup runs invisibly — no browser window shown
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // STOREFRONT TESTS (Citizen - No auth dependency)
    // ═══════════════════════════════════════════════════════════════
    {
      name: 'storefront-chromium',
      testMatch: ['**/tests/storefront/**/*.spec.ts', '**/features/storefront/**/*.feature.spec.js'],
      use: {
        viewport: null,
        baseURL: process.env.STOREFRONT_BASE_URL,
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // PORTAL TESTS (Admin/Reviewer - Uses saved auth)
    // ═══════════════════════════════════════════════════════════════
    {
      name: 'portal-chromium',
      testMatch: '**/tests/portal/**/*.spec.ts',
      use: {
        viewport: null,
        baseURL: process.env.PORTAL_BASE_URL,
        storageState: PORTAL_AUTH_STATE,
      },
      dependencies: ['portal-auth-setup'],
    },

    // ═══════════════════════════════════════════════════════════════
    // E2E FULL FLOW (Chains all modules)
    // ═══════════════════════════════════════════════════════════════
    {
      name: 'e2e-full-flow',
      testMatch: ['**/tests/e2e/**/*.spec.ts', '**/features/e2e/**/*.feature.spec.js'],
      timeout: 720000, // 10 minutes specifically for E2E workflows
      use: {
        viewport: null,
        baseURL: process.env.STOREFRONT_BASE_URL,
      },
    },
  ],
});
