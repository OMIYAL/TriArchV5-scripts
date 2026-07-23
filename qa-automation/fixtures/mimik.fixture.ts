import fs from 'fs';
import path from 'path';
import { test as base, createBdd } from 'playwright-bdd';
import { chromium } from '@playwright/test';
import {
  getMimikCaptureDelayMs,
  getMimikExportDir,
  resetMimikSidepanel,
} from '../utils/mimik.helper';

function toChromiumPath(dir: string): string {
  return path.resolve(dir).replace(/\\/g, '/');
}

/**
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
        'guide-mimik requires MIMIK_EXTENSION_PATH pointing to an unpacked Mimik build (manifest.json).',
      );
    }

    const extensionPath = toChromiumPath(rawExtensionPath);
    if (!fs.existsSync(path.join(extensionPath, 'manifest.json'))) {
      throw new Error(`MIMIK_EXTENSION_PATH is missing manifest.json: ${extensionPath}`);
    }

    const exportDir = getMimikExportDir();
    const safeId = testInfo.testId.replace(/[^a-zA-Z0-9_-]/g, '_');
    const userDataDir = path.resolve(__dirname, `../.mimik-profile/run-${safeId}-${Date.now()}`);
    fs.mkdirSync(userDataDir, { recursive: true });

    const context = await chromium.launchPersistentContext(userDataDir, {
      channel: 'chromium',
      headless: false,
      viewport: null,
      acceptDownloads: true,
      // Land downloads in mimik-exports — the profile dir is deleted on teardown.
      downloadsPath: exportDir,
      baseURL: projectUse.baseURL as string | undefined,
      ignoreHTTPSErrors: Boolean(projectUse.ignoreHTTPSErrors),
      args: [
        ...launchArgs,
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
      ],
    });

    // Close Mimik onboarding tabs so the storefront page fixture stays clean.
    await new Promise((r) => setTimeout(r, 300));
    for (const p of [...context.pages()]) {
      if (/^chrome-extension:\/\//i.test(p.url())) {
        await p.close().catch(() => {});
      }
    }
    if (context.pages().length === 0) {
      await context.newPage();
    }

    console.log(`>>> Mimik exports: ${exportDir}`);
    console.log(`>>> Mimik capture delay: ${getMimikCaptureDelayMs()}ms`);

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
