import fs from 'fs';
import path from 'path';
import type { BrowserContext, Page } from '@playwright/test';

export type MimikExportFormat = 'pdf' | 'html' | 'markdown';

/** Permanent folder for Mimik PDF/HTML/Markdown exports. */
export function getMimikExportDir(): string {
  const dir = path.resolve(
    __dirname,
    process.env.MIMIK_EXPORT_DIR?.trim() || '../mimik-exports',
  );
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function isMimikGuideMode(): boolean {
  return process.env.MIMIK_GUIDE === '1';
}

export function getMimikExportFormat(): MimikExportFormat {
  const raw = (process.env.MIMIK_EXPORT_FORMAT || 'pdf').trim().toLowerCase();
  if (raw === 'html' || raw === 'markdown' || raw === 'pdf') {
    return raw;
  }
  return 'pdf';
}

/** Pause between Playwright ops in guide mode so Mimik can screenshot (see MIMIK_CAPTURE_DELAY_MS). */
export function getMimikCaptureDelayMs(): number {
  const raw = Number(process.env.MIMIK_CAPTURE_DELAY_MS ?? 1200);
  return Number.isFinite(raw) && raw >= 0 ? raw : 1200;
}

export function getMimikExportSettleMs(): number {
  const raw = Number(process.env.MIMIK_EXPORT_SETTLE_MS ?? 8000);
  return Number.isFinite(raw) && raw >= 0 ? raw : 8000;
}

/** Wait after an action so Mimik can capture screenshot + element bounds. */
export async function waitForMimikCapture(page?: Page): Promise<void> {
  if (!isMimikGuideMode()) {
    return;
  }
  const ms = getMimikCaptureDelayMs();
  if (ms <= 0) {
    return;
  }
  if (page) {
    await page.waitForTimeout(ms).catch(() => sleep(ms));
  } else {
    await sleep(ms);
  }
}

const EXPORT_LABELS: Record<MimikExportFormat, string> = {
  pdf: 'PDF',
  html: 'HTML',
  markdown: 'Markdown',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Shared sidepanel tab — kept open while recording so Stop/Export stay reachable. */
let sidepanelPage: Page | null = null;

export class MimikHelper {
  constructor(
    private readonly context: BrowserContext,
    private readonly workflowPage: Page,
  ) {}

  async startRecording(): Promise<void> {
    if (!isMimikGuideMode()) {
      return;
    }

    const extensionId = await this.resolveExtensionId();
    const panel = await this.openSidepanel(extensionId);

    const startButton = panel.getByRole('button', { name: 'Start Capture' });
    await startButton.waitFor({ state: 'visible', timeout: 30000 });
    await startButton.click();

    await panel
      .getByRole('button', { name: 'Finish Recording' })
      .waitFor({ state: 'visible', timeout: 30000 });

    sidepanelPage = panel;
    await this.workflowPage.bringToFront();

    console.log('\n>>> Mimik recording started automatically.\n');
  }

  async stopAndExport(format: MimikExportFormat = getMimikExportFormat()): Promise<void> {
    if (!isMimikGuideMode()) {
      return;
    }

    let panel = sidepanelPage;
    if (!panel || panel.isClosed()) {
      // Recover: find any open Mimik sidepanel tab.
      panel =
        this.context.pages().find((p) => {
          if (p.isClosed()) return false;
          return /chrome-extension:\/\/.+\/sidepanel\.html/i.test(p.url());
        }) ?? null;
      sidepanelPage = panel;
    }

    if (!panel || panel.isClosed()) {
      throw new Error(
        'Mimik sidepanel is not available. Ensure "Mimik recording is started" ran before export.',
      );
    }

    console.log('>>> Stopping Mimik recording…');
    await panel.bringToFront().catch(() => {});

    const findFullviewPage = (): Page | undefined =>
      this.context.pages().find((p) => {
        if (p.isClosed()) return false;
        return /chrome-extension:\/\/.+\/fullview\.html/i.test(p.url());
      });

    const fullviewPromise = this.context
      .waitForEvent('page', {
        timeout: 20000,
        predicate: (p) => /chrome-extension:\/\/.+\/fullview\.html/i.test(p.url()),
      })
      .catch(() => null);

    // Click Finish via DOM — Playwright click/scroll often hangs on the Mimik sidepanel.
    const finishClicked = await panel
      .evaluate(() => {
        const btn = Array.from(document.querySelectorAll('button')).find((b) =>
          /Finish Recording|Stop Recording/i.test(b.textContent || ''),
        ) as HTMLButtonElement | undefined;
        if (!btn) return false;
        btn.click();
        return true;
      })
      .catch(() => false);

    if (!finishClicked) {
      const finishBtn = panel.getByRole('button', { name: /Finish Recording|Stop Recording/i });
      await finishBtn.waitFor({ state: 'visible', timeout: 15000 });
      await finishBtn.dispatchEvent('click');
    }

    let fullview = (await fullviewPromise) ?? findFullviewPage();

    for (let attempt = 0; !fullview && attempt < 20; attempt++) {
      await sleep(1000);
      fullview = findFullviewPage();
    }

    if (!fullview) {
      throw new Error('Mimik fullview did not open after stopping recording.');
    }
    console.log('>>> Mimik fullview opened — exporting…');
    await fullview.waitForLoadState('domcontentloaded');

    // Allow guide title / step list + in-flight screenshot writes to settle.
    await fullview.waitForTimeout(getMimikExportSettleMs());

    await fullview
      .locator('img[src^="blob:"]')
      .first()
      .waitFor({ state: 'visible', timeout: 60000 })
      .catch(() => {});

    await fullview.bringToFront().catch(() => {});

    const exportButton = fullview.getByRole('button', { name: 'Export' });
    await exportButton.waitFor({ state: 'visible', timeout: 60000 });

    const downloadPromise = fullview.waitForEvent('download', { timeout: 120000 });

    await exportButton.evaluate((el) => (el as HTMLElement).click()).catch(async () => {
      await exportButton.click({ force: true });
    });

    const formatBtn = fullview.getByRole('button', { name: EXPORT_LABELS[format] });
    await formatBtn.waitFor({ state: 'visible', timeout: 15000 });
    await formatBtn.evaluate((el) => (el as HTMLElement).click()).catch(async () => {
      await formatBtn.click({ force: true });
    });

    const download = await downloadPromise;

    const dest = path.join(getMimikExportDir(), download.suggestedFilename());
    await download.saveAs(dest);

    const { size } = fs.statSync(dest);
    if (size === 0) {
      throw new Error(`Mimik export failed: ${dest} is 0 bytes`);
    }

    console.log(
      `\n>>> Mimik ${format.toUpperCase()} export saved: ${dest} (${size} bytes)\n`,
    );

    await this.workflowPage.bringToFront().catch(() => {});

    if (sidepanelPage && !sidepanelPage.isClosed()) {
      await sidepanelPage.close().catch(() => {});
      sidepanelPage = null;
    }
  }

  private async openSidepanel(extensionId: string): Promise<Page> {
    if (sidepanelPage && !sidepanelPage.isClosed()) {
      await sidepanelPage.bringToFront();
      return sidepanelPage;
    }

    const panel = await this.context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    // Sidepanel waits for background port before enabling Start Capture.
    await panel
      .getByText(/connected/i)
      .waitFor({ state: 'visible', timeout: 30000 })
      .catch(async () => {
        await panel.waitForTimeout(2000);
      });

    return panel;
  }

  private async resolveExtensionId(): Promise<string> {
    const fromEnv = process.env.MIMIK_EXTENSION_ID?.trim();
    if (fromEnv) {
      return fromEnv;
    }

    let worker = this.context.serviceWorkers().find((sw) =>
      /^chrome-extension:\/\//i.test(sw.url()),
    );

    if (!worker) {
      worker = await this.context.waitForEvent('serviceworker', {
        timeout: 15000,
        predicate: (sw) => /^chrome-extension:\/\//i.test(sw.url()),
      });
    }

    const match = worker.url().match(/^chrome-extension:\/\/([^/]+)\//i);
    if (!match?.[1]) {
      throw new Error(`Could not parse Mimik extension id from service worker URL: ${worker.url()}`);
    }

    return match[1];
  }
}

/** Reset shared sidepanel reference between tests (fixture teardown). */
export function resetMimikSidepanel(): void {
  sidepanelPage = null;
}
