import fs from 'fs';
import path from 'path';
import { test as base, createBdd } from 'playwright-bdd';
import { chromium } from '@playwright/test';
import {
  getMimikCaptureDelayMs,
  getMimikExportDir,
  resetMimikSidepanel,
} from '../utils/mimik.helper';

/** Chrome/Chromium flag expects forward slashes on Windows. */
function toChromiumPath(dir: string): string {
  return path.resolve(dir).replace(/\\/g, '/');
}

/**
 * Custom BDD test instance.
 * When running the `guide-mimik` project, launches Chromium with an unpacked
 * Mimik extension via launchPersistentContext (required for MV3 extensions).
 * Otherwise uses a normal browser context so smoke/CI runs stay unchanged.
 *
 * Sets MIMIK_GUIDE=1 so steps/pages that still check the env flag stay in sync
 * without needing scripts/run-guide.mjs.
 */
export const test = base.extend<object>({
  context: async ({ playwright }, use, testInfo) => {
    const isMimikGuide = testInfo.project.name === 'guide-mimik';
    if (isMimikGuide) {
      process.env.MIMIK_GUIDE = '1';
    }

    const projectUse = testInfo.project.use;
    const launchArgs =
      (projectUse.launchOptions as { args?: string[] } | undefined)?.args ?? [];

    if (!isMimikGuide) {
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

    const rawExtensionPath = process.env.MIMIK_EXTENSION_PATH?.trim();
    if (!rawExtensionPath) {
      throw new Error(
        'guide-mimik requires MIMIK_EXTENSION_PATH in .env pointing to an unpacked Mimik build (folder with manifest.json).',
      );
    }

    // Chromium --load-extension expects forward slashes on Windows.
    const extensionPath = toChromiumPath(rawExtensionPath);

    const manifestPath = path.join(extensionPath, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(
        `MIMIK_EXTENSION_PATH is missing manifest.json: ${extensionPath}`,
      );
    }

    const exportDir = getMimikExportDir();

    // Fresh profile per run so TriArch auth cookies from a prior guide run
    // do not skip login and break the BDD flow.
    const safeId = testInfo.testId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const userDataDir = path.resolve(
      __dirname,
      `../.mimik-profile/run-${safeId}-${Date.now()}`,
    );
    fs.mkdirSync(userDataDir, { recursive: true });

    const captureDelayMs = getMimikCaptureDelayMs();
    const isCi = !!process.env.CI;
    const viewport = isCi ? { width: 1920, height: 1080 } : null;
    const filteredLaunchArgs = launchArgs.filter(
      (arg) => !/--start-maximized/i.test(arg),
    );
    const ciWindowArgs = isCi
      ? ['--window-size=1920,1080', '--disable-popup-blocking']
      : [];

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: false,
      viewport,
      acceptDownloads: true,
      slowMo: captureDelayMs,
      baseURL: projectUse.baseURL as string | undefined,
      ignoreHTTPSErrors: Boolean(projectUse.ignoreHTTPSErrors),
      args: [
        ...(isCi ? filteredLaunchArgs : launchArgs),
        ...ciWindowArgs,
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    console.log(
      `\n>>> Mimik browser: CI=${isCi} viewport=${viewport ? `${viewport.width}x${viewport.height}` : 'null'}\n`,
    );

    // Mimik opens an onboarding tab on first load; that can become Playwright's
    // default `page` and break storefront steps. Close extension pages first.
    await new Promise((r) => setTimeout(r, 1500));
    for (const p of [...context.pages()]) {
      if (/^chrome-extension:\/\//i.test(p.url())) {
        await p.close().catch(() => {});
      }
    }
    if (context.pages().length === 0) {
      await context.newPage();
    }

    // Export is saved in mimik.helper.ts stopAndExport() via await download.saveAs().
    console.log(`\n>>> Mimik exports will save to: ${exportDir}\n`);
    console.log(`>>> Mimik capture delay (slowMo): ${captureDelayMs}ms\n`);

    try {
      await use(context);
    } finally {
      resetMimikSidepanel();
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  },
});

export const { Given, When, Then } = createBdd(test);
