import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const testDir = defineBddConfig({
  features: 'features/**/*.feature',
  steps: ['steps/**/*.ts', 'fixtures/mimik.fixture.ts'],
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
  timeout: 300000,
  fullyParallel: false,
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
      args: ['--start-maximized'],
    },
  },

  projects: [
    // ═══════════════════════════════════════════════════════════════
    // PORTAL AUTH SETUP (For portal tests only)
    // ═══════════════════════════════════════════════════════════════
    {
      name: 'portal-auth-setup',
      testMatch: '**/tests/setup/**/*.setup.ts',
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

    {
      // Run only via: npm run test:guide  (or --project=guide-mimik)
      // Excluded from default npm test / test:bdd / test:smoke scripts.
      name: 'guide-mimik',
      // Mimik capture adds per-click delay; allow longer waits than smoke.
      timeout: 600000,
      testMatch: ['**/features/storefront/**/*.feature.spec.js'],
      use: {
        headless: false,
        viewport: null,
        baseURL: process.env.STOREFRONT_BASE_URL,
        actionTimeout: 45000,
        navigationTimeout: 60000,
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
      use: {
        viewport: null,
        baseURL: process.env.STOREFRONT_BASE_URL,
      },
    },

    // ═══════════════════════════════════════════════════════════════
    // API CONTRACT (Spec → Gherkin → HTTP) — Control Room Contacts
    // ═══════════════════════════════════════════════════════════════
    {
      name: 'api-control-room',
      testMatch: ['**/features/api/**/*.feature.spec.js'],
      use: {
        baseURL: process.env.API_BASE_URL || 'https://localhost:44336',
        ignoreHTTPSErrors: true,
      },
    },
  ],
});
