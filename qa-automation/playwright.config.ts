import { defineConfig } from '@playwright/test';
import { defineBddConfig } from 'playwright-bdd';
import * as dotenv from 'dotenv';
import path from 'path';

// Local .env must win over stale shell/CI leftovers (e.g. an old MIMIK_CAPTURE_DELAY_MS).
dotenv.config({ path: path.resolve(__dirname, '.env'), override: true });

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
  retries: 0,
  workers: process.env.CI ? 1 : undefined,

  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  use: {
    actionTimeout: 15000,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
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
      name: 'guide-mimik',
      // Slower Mimik capture (2000ms+) needs headroom for the full citizen flow + export.
      timeout: 900000,
      testMatch: ['**/features/storefront/**/*.feature.spec.js'],
      use: {
        headless: false,
        viewport: null,
        baseURL: process.env.STOREFRONT_BASE_URL,
        actionTimeout: 30000,
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
