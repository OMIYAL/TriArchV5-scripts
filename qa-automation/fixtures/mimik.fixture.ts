import fs from 'fs';
import path from 'path';
import { test as base, createBdd } from 'playwright-bdd';
import { chromium } from '@playwright/test';

/** Chrome/Chromium flag expects forward slashes on Windows. */
function toChromiumPath(dir: string): string {
  return path.resolve(dir).replace(/\\/g, '/');
}

/**
 * Custom BDD test instance.
 * When MIMIK_GUIDE=1, launches Chromium with an unpacked Mimik extension
 * via launchPersistentContext (required for MV3 extensions).
 * Otherwise uses a normal browser context so smoke/CI runs stay unchanged.
 */
export const test = base.extend<object>({
  context: async ({ playwright }, use, testInfo) => {
    const projectUse = testInfo.project.use;
    const launchArgs =
      (projectUse.launchOptions as { args?: string[] } | undefined)?.args ?? [];

    if (process.env.MIMIK_GUIDE !== '1') {
      const browser = await playwright.chromium.launch({
        headless: projectUse.headless ?? true,
        args: launchArgs,
      });
      const context = await browser.newContext({
        baseURL: projectUse.baseURL,
        viewport: projectUse.viewport ?? null,
        ignoreHTTPSErrors: projectUse.ignoreHTTPSErrors,
        storageState: projectUse.storageState as string | undefined,
      });
      await use(context);
      await context.close();
      await browser.close();
      return;
    }

    const extensionPath = process.env.MIMIK_EXTENSION_PATH?.trim();
    if (!extensionPath) {
      throw new Error(
        'MIMIK_GUIDE=1 requires MIMIK_EXTENSION_PATH pointing to an unpacked Mimik build (folder with manifest.json).',
      );
    }

    const manifestPath = path.join(extensionPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(
        `MIMIK_EXTENSION_PATH is missing manifest.json: ${extensionPath}`,
      );
    }

    const exportDir = path.resolve(
      __dirname,
      process.env.MIMIK_EXPORT_DIR?.trim() || '../mimik-exports',
    );
    fs.mkdirSync(exportDir, { recursive: true });

    // Fresh profile per run so TriArch auth cookies from a prior guide run
    // do not skip login and break the BDD flow.
    const safeId = testInfo.testId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const userDataDir = path.resolve(
      __dirname,
      `../.mimik-profile/run-${safeId}-${Date.now()}`,
    );
    fs.mkdirSync(userDataDir, { recursive: true });

    const chromiumExportDir = toChromiumPath(exportDir);

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: false,
      viewport: null,
      baseURL: projectUse.baseURL as string | undefined,
      ignoreHTTPSErrors: Boolean(projectUse.ignoreHTTPSErrors),
      args: [
        ...launchArgs,
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        `--download-default-directory=${chromiumExportDir}`,
      ],
    });

    console.log(`\n>>> Mimik exports will save to: ${exportDir}\n`);

    try {
      await use(context);

      const page =
        context.pages().find((p) => !p.isClosed()) ?? context.pages()[0];
      if (page && !page.isClosed()) {
        console.log(
          '\n>>> Guide run complete. In Mimik: Stop Capture → Export (PDF/HTML/Markdown).',
        );
        console.log(`>>> Files save to: ${exportDir}`);
        console.log(
          '>>> Click Resume in Playwright Inspector when export is done.\n',
        );
        await page.pause();
      }
    } finally {
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  },
});

export const { Given, When, Then } = createBdd(test);
