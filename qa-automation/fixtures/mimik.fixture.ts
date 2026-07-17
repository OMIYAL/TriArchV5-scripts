import fs from 'fs';
import path from 'path';
import { test as base, createBdd } from 'playwright-bdd';
import { chromium, type Page } from '@playwright/test';

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

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: false,
      viewport: null,
      acceptDownloads: true,
      baseURL: projectUse.baseURL as string | undefined,
      ignoreHTTPSErrors: Boolean(projectUse.ignoreHTTPSErrors),
      args: [
        ...launchArgs,
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

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

    // Playwright intercepts downloads via CDP; without saving them explicitly the
    // file only exists in Playwright's internal temp folder (shown as a random
    // UUID-named entry in Chrome's download tray) and is never reachable on disk.
    const pendingDownloads: Promise<void>[] = [];
    function attachDownloadHandler(page: Page) {
      page.on('download', (download) => {
        pendingDownloads.push(
          (async () => {
            const dest = path.join(exportDir, download.suggestedFilename());
            try {
              await download.saveAs(dest);
              const { size } = fs.statSync(dest);
              if (size === 0) {
                console.error(
                  `\n>>> Mimik export FAILED: ${dest} saved as 0 bytes.\n`,
                );
                return;
              }
              console.log(`\n>>> Mimik export saved: ${dest} (${size} bytes)\n`);
            } catch (err) {
              console.error(
                `\n>>> Mimik export download failed to save: ${err instanceof Error ? err.message : err}\n`,
              );
            }
          })(),
        );
      });
    }
    context.pages().forEach(attachDownloadHandler);
    context.on('page', attachDownloadHandler);

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
      if (pendingDownloads.length > 0) {
        console.log(
          `\n>>> Waiting for ${pendingDownloads.length} download(s) to finish saving...\n`,
        );
        await Promise.race([
          Promise.allSettled(pendingDownloads),
          new Promise((resolve) => setTimeout(resolve, 30000)),
        ]);
      }
      await context.close();
      fs.rmSync(userDataDir, { recursive: true, force: true });
    }
  },
});

export const { Given, When, Then } = createBdd(test);
