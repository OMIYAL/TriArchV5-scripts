import { defineConfig } from '@playwright/test';
import { defineBddProject } from 'playwright-bdd';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

const bddStorefrontUse = {
  viewport: null,
  baseURL: process.env.STOREFRONT_BASE_URL,
  launchOptions: {
    args: ['--start-maximized'],
  },
};

const bddStorefrontProject = defineBddProject({
  name: 'bdd-storefront',
  features: 'features/**/*.feature',
  steps: ['steps/**/*.ts'],
});

export default defineConfig({
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1,

  reporter: [
    ['html', { open: 'never' }],
    ['list'],
  ],

  use: {
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
    // BDD / GHERKIN (Cucumber via playwright-bdd)
    // ═══════════════════════════════════════════════════════════════
    {
      ...bddStorefrontProject,
      timeout: 180_000,
      use: bddStorefrontUse,
    },
    {
      ...bddStorefrontProject,
      name: 'storefront-chromium',
      timeout: 180_000,
      use: bddStorefrontUse,
    },
  ],
});