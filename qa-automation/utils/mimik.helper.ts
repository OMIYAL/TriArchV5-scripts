import fs from 'fs';
import path from 'path';
import type { BrowserContext, Download, Locator, Page } from '@playwright/test';

export type MimikExportFormat = 'pdf' | 'html' | 'markdown';

const EXPORT_LABELS: Record<MimikExportFormat, string> = {
  pdf: 'PDF',
  html: 'HTML',
  markdown: 'Markdown',
};

let sidepanelPage: Page | null = null;

export function getMimikExportDir(): string {
  const dir = path.resolve(__dirname, process.env.MIMIK_EXPORT_DIR?.trim() || '../mimik-exports');
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function isMimikGuideMode(): boolean {
  return process.env.MIMIK_GUIDE === '1';
}

export function getMimikExportFormat(): MimikExportFormat {
  const raw = (process.env.MIMIK_EXPORT_FORMAT || 'pdf').trim().toLowerCase();
  return raw === 'html' || raw === 'markdown' || raw === 'pdf' ? raw : 'pdf';
}

/**
 * Pause after guided actions so Mimik's serial screenshot queue drains before the
 * next action / navigation (queued steps are lost if the page unloads first).
 * Default 1000ms. `||` (not `??`) so a blank/`0` env — e.g. a missing CI secret —
 * falls back to the default instead of disabling capture.
 */
export function getMimikCaptureDelayMs(): number {
  const raw = Number(process.env.MIMIK_CAPTURE_DELAY_MS || 1000);
  return Number.isFinite(raw) && raw > 0 ? raw : 1000;
}

/** Extra wait before Export so guide thumbnails/annotations finish rendering. */
export function getMimikExportSettleMs(): number {
  const raw = Number(process.env.MIMIK_EXPORT_SETTLE_MS || 8000);
  return Number.isFinite(raw) && raw >= 0 ? raw : 8000;
}

export async function waitForMimikCapture(page?: Page): Promise<void> {
  if (!isMimikGuideMode()) return;
  const ms = getMimikCaptureDelayMs();
  if (ms <= 0) return;
  if (page) await page.waitForTimeout(ms);
  else await new Promise((r) => setTimeout(r, ms));
}

/** Double pause so the next action does not race an in-flight InputSession finalize. */
export async function drainMimikCapture(page?: Page): Promise<void> {
  await waitForMimikCapture(page);
  await waitForMimikCapture(page);
}

export function resetMimikSidepanel(): void {
  sidepanelPage = null;
}

/** CDP mouse click — avoids hung page.evaluate on busy Mimik RecordingView. */
async function mouseClick(page: Page, locator: Locator): Promise<void> {
  await locator.waitFor({ state: 'visible' });
  const box = await locator.boundingBox();
  if (!box) throw new Error('Element has no bounding box for click');
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

function isNonEmptyFile(filePath: string): boolean {
  try {
    return fs.existsSync(filePath) && fs.statSync(filePath).size > 0;
  } catch {
    return false;
  }
}

function findNewestPdf(dir: string, withinMs = 5 * 60 * 1000): string | null {
  if (!fs.existsSync(dir)) return null;
  const cutoff = Date.now() - withinMs;
  let bestFile: string | null = null;
  let bestMtime = 0;
  const walk = (d: string) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.pdf$/i.test(entry.name)) continue;
      const mtime = fs.statSync(full).mtimeMs;
      if (mtime >= cutoff && mtime > bestMtime) {
        bestFile = full;
        bestMtime = mtime;
      }
    }
  };
  walk(dir);
  return bestFile;
}

function stopSuccess(res: unknown): boolean {
  const payload = res as { success?: boolean; res?: { success?: boolean } } | null;
  return payload?.success === true || payload?.res?.success === true;
}

export class MimikHelper {
  constructor(
    private readonly context: BrowserContext,
    private readonly workflowPage: Page,
  ) {}

  async startRecording(): Promise<void> {
    if (!isMimikGuideMode()) return;

    const panel = await this.openSidepanel(await this.resolveExtensionId());
    await panel.getByRole('button', { name: 'Start Capture' }).click();
    await panel.getByRole('button', { name: 'Finish Recording' }).waitFor({ state: 'visible' });

    sidepanelPage = panel;
    await this.workflowPage.bringToFront();
    console.log('>>> Mimik recording started');
  }

  async stopRecording(): Promise<void> {
    if (!isMimikGuideMode()) return;

    console.log('>>> Stopping Mimik recording…');
    await drainMimikCapture(this.workflowPage);

    let stopped = false;
    const panel = await this.resolveSidepanel().catch(() => null);
    if (panel) {
      await panel.bringToFront().catch(() => {});
      const finish = panel.getByRole('button', { name: /Finish Recording|Stop Recording/i });
      if (await finish.isVisible({ timeout: 5000 }).catch(() => false)) {
        await mouseClick(panel, finish);
        // Finish triggers guide generation (screenshots/annotations). It ends on the
        // library (Start Capture) or straight in the saved guide (Export / "Guide on…").
        // Any of these means the recording finalized — wait patiently, don't tear down.
        stopped = await this.waitForPostRecordingState(panel, 90000);
      }
    }

    // Only fall back to the extension message (which closes+reopens the panel) when the
    // Finish UI never resolved — tearing down mid-generation can lose the guide.
    if (!stopped) {
      console.log('>>> Finish UI unavailable — stopping via extension message…');
      await this.stopRecordingViaExtensionMessage();
      const extensionId = await this.resolveExtensionId();
      if (sidepanelPage && !sidepanelPage.isClosed()) await sidepanelPage.close().catch(() => {});
      sidepanelPage = null;
      await this.openSidepanel(extensionId);
    }

    for (const p of this.context.pages()) {
      if (!p.isClosed() && /fullview\.html/i.test(p.url())) await p.close().catch(() => {});
    }
    console.log('>>> Mimik recording stopped');
  }

  /** Recording is finalized once the library or the saved guide view is visible. */
  private async waitForPostRecordingState(panel: Page, timeout: number): Promise<boolean> {
    const marker = panel
      .getByRole('button', { name: 'Start Capture' })
      .or(panel.getByRole('button', { name: 'Export' }))
      .or(panel.locator('p').filter({ hasText: /Guide on/i }))
      .first();
    return marker.waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  }

  async openLatestGuide(): Promise<void> {
    if (!isMimikGuideMode()) return;

    const panel = await this.resolveSidepanel();
    const recentGuide = panel.locator('p').filter({ hasText: /Guide on/i }).first();
    await recentGuide.waitFor({ state: 'visible' });

    const stepCount = await panel
      .locator('span')
      .filter({ hasText: /\d+\s+steps?/i })
      .first()
      .innerText()
      .catch(() => '');
    console.log(`>>> Mimik recorded guide steps: ${stepCount || '(unknown)'}`);

    await recentGuide.click({ noWaitAfter: true });
    await panel.getByRole('button', { name: 'Export' }).waitFor({ state: 'visible', timeout: 60000 });
  }

  async exportGuideAs(format: MimikExportFormat = getMimikExportFormat()): Promise<void> {
    if (!isMimikGuideMode()) return;

    const panel = await this.resolveSidepanel();
    const exportBtn = panel.getByRole('button', { name: 'Export' });
    await exportBtn.waitFor({ state: 'visible' });
    await panel.locator('img').first().waitFor({ state: 'visible', timeout: 60000 }).catch(() => {});

    const settleMs = getMimikExportSettleMs();
    if (settleMs > 0) {
      console.log(`>>> Waiting ${settleMs}ms for Mimik guide to settle before export…`);
      await panel.waitForTimeout(settleMs);
    }

    const exportDir = getMimikExportDir();
    const before = this.exportFingerprints(exportDir, format);

    // downloadsPath is exportDir (see fixture), so the file lands here directly.
    // Watch the download event and the folder together — finish as soon as either
    // yields a file, instead of blocking the full timeout on an event that may never fire.
    const downloadPromise = panel.waitForEvent('download', { timeout: 120000 }).catch(() => null);
    await mouseClick(panel, exportBtn);
    const formatBtn = panel.getByRole('button', { name: EXPORT_LABELS[format] });
    await formatBtn.waitFor({ state: 'visible', timeout: 15000 });
    await mouseClick(panel, formatBtn);

    let dest = await Promise.race([
      downloadPromise.then((d) => (d ? this.persistDownload(d, format) : null)),
      this.waitForNewExport(exportDir, before, format, 120000),
    ]).catch(() => null);

    if (!dest || !isNonEmptyFile(dest)) {
      dest = await this.waitForNewExport(exportDir, before, format, 15000);
    }
    if ((!dest || !isNonEmptyFile(dest)) && format === 'pdf') {
      const fromResults = findNewestPdf(path.resolve(__dirname, '../test-results'));
      if (fromResults) {
        dest = path.join(exportDir, path.basename(fromResults));
        fs.copyFileSync(fromResults, dest);
      }
    }

    if (!dest || !isNonEmptyFile(dest)) {
      throw new Error(`Mimik ${format} export did not produce a file in ${exportDir}`);
    }

    // Always keep a clearly named .pdf copy so overwrites / missing extensions don't hide the result.
    if (format === 'pdf') {
      dest = this.ensureDatedPdfCopy(dest, exportDir);
    }

    console.log(`>>> Mimik ${format.toUpperCase()} export saved: ${dest} (${fs.statSync(dest).size} bytes)`);

    if (sidepanelPage && !sidepanelPage.isClosed()) {
      await sidepanelPage.close().catch(() => {});
      sidepanelPage = null;
    }
  }

  /** Copy to `mimik-guide-<timestamp>.pdf` so every run leaves a fresh, obvious PDF. */
  private ensureDatedPdfCopy(source: string, exportDir: string): string {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const dated = path.join(exportDir, `mimik-guide-${stamp}.pdf`);
    if (path.resolve(source) !== path.resolve(dated)) {
      fs.copyFileSync(source, dated);
    }
    if (!/\.pdf$/i.test(source)) {
      const withExt = `${source}.pdf`;
      fs.copyFileSync(source, withExt);
      return dated;
    }
    return dated;
  }

  /** Snapshot name → mtime+size so an overwrite of the same Mimik filename still counts. */
  private exportFingerprints(dir: string, format: MimikExportFormat): Map<string, string> {
    const map = new Map<string, string>();
    if (!fs.existsSync(dir)) return map;
    for (const f of fs.readdirSync(dir).filter((n) => n.toLowerCase().endsWith(`.${format}`))) {
      const full = path.join(dir, f);
      try {
        const st = fs.statSync(full);
        if (st.size > 0) map.set(f, `${st.mtimeMs}:${st.size}`);
      } catch {
        /* ignore */
      }
    }
    return map;
  }

  /** Poll for a new or overwritten non-empty export file. */
  private async waitForNewExport(
    dir: string,
    before: Map<string, string>,
    format: MimikExportFormat,
    timeoutMs: number,
  ): Promise<string | null> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const now = this.exportFingerprints(dir, format);
      const changed = [...now.entries()]
        .filter(([name, fp]) => before.get(name) !== fp)
        .map(([name]) => path.join(dir, name))
        .filter(isNonEmptyFile)
        .sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
      if (changed[0]) return changed[0];
      await new Promise((r) => setTimeout(r, 1000));
    }
    return null;
  }

  private async persistDownload(download: Download, format: MimikExportFormat): Promise<string> {
    const exportDir = getMimikExportDir();
    let filename = (download.suggestedFilename() || `mimik-guide.${format}`).trim();
    if (format === 'pdf' && !/\.pdf$/i.test(filename)) filename = `${filename}.pdf`;
    const dest = path.resolve(exportDir, filename);

    await download.saveAs(dest).catch(() => {});

    if (!isNonEmptyFile(dest)) {
      const tmp = await download.path().catch(() => null);
      if (tmp && isNonEmptyFile(tmp)) fs.copyFileSync(tmp, dest);
    }

    if (!isNonEmptyFile(dest) && format === 'pdf') {
      const fromResults = findNewestPdf(path.resolve(__dirname, '../test-results'));
      if (fromResults) fs.copyFileSync(fromResults, dest);
    }

    if (!isNonEmptyFile(dest)) throw new Error(`Mimik export not persisted to ${dest}`);
    return dest;
  }

  private async stopRecordingViaExtensionMessage(): Promise<void> {
    const extensionId = await this.resolveExtensionId();
    const bridge = await this.context.newPage();
    try {
      await bridge.goto(`chrome-extension://${extensionId}/sidepanel.html`, {
        waitUntil: 'commit',
        timeout: 15000,
      });
      const res = await bridge.evaluate(async () => {
        const api = (globalThis as unknown as {
          chrome?: { runtime?: { sendMessage: (msg: unknown) => Promise<unknown> } };
        }).chrome;
        if (!api?.runtime?.sendMessage) return null;
        return api.runtime.sendMessage({
          id: crypto.randomUUID(),
          type: 'stopRecording',
          data: undefined,
          timestamp: Date.now(),
        });
      });
      if (!stopSuccess(res)) {
        throw new Error(`Mimik stopRecording message failed: ${JSON.stringify(res)}`);
      }
    } finally {
      await bridge.close().catch(() => {});
    }
  }

  private async resolveSidepanel(): Promise<Page> {
    if (sidepanelPage && !sidepanelPage.isClosed()) return sidepanelPage;

    sidepanelPage =
      this.context.pages().find((p) => !p.isClosed() && /chrome-extension:\/\/.+\/sidepanel\.html/i.test(p.url())) ??
      null;

    if (!sidepanelPage || sidepanelPage.isClosed()) {
      throw new Error('Mimik sidepanel is not available. Start recording before stop/export.');
    }
    return sidepanelPage;
  }

  private async openSidepanel(extensionId: string): Promise<Page> {
    if (sidepanelPage && !sidepanelPage.isClosed()) {
      await sidepanelPage.bringToFront();
      return sidepanelPage;
    }

    const panel = await this.context.newPage();
    await panel.goto(`chrome-extension://${extensionId}/sidepanel.html`, {
      waitUntil: 'commit',
      timeout: 30000,
    });
    await panel.getByRole('button', { name: 'Start Capture' }).waitFor({ state: 'visible' });
    sidepanelPage = panel;
    return panel;
  }

  private async resolveExtensionId(): Promise<string> {
    const fromEnv = process.env.MIMIK_EXTENSION_ID?.trim();
    if (fromEnv) return fromEnv;

    let worker = this.context.serviceWorkers().find((sw) => /^chrome-extension:\/\//i.test(sw.url()));
    if (!worker) {
      worker = await this.context.waitForEvent('serviceworker', {
        predicate: (sw) => /^chrome-extension:\/\//i.test(sw.url()),
      });
    }

    const match = worker.url().match(/^chrome-extension:\/\/([^/]+)\//i);
    if (!match?.[1]) throw new Error(`Could not parse Mimik extension id from: ${worker.url()}`);
    return match[1];
  }
}
