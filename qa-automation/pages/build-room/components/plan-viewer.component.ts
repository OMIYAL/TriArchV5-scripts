import { Page, Locator } from '@playwright/test';
import { BuildRoomBasePage } from '../base.page';

/** The parts of the Syncfusion viewer instance (`element.ej2_instances[0]`) used here. */
interface ViewerInstance {
  pageCount: number;
}
type ViewerHost = { ej2_instances?: ViewerInstance[] };

const VIEWER_ID = 'ta-takeoff-pdf-viewer';

/**
 * The Take-Off plan (a Syncfusion PDF viewer). Its text layer covers the canvas, so clicks go
 * through `page.mouse`.
 */
export class PlanViewerComponent extends BuildRoomBasePage {
  private readonly loadingOverlay: Locator;

  constructor(page: Page) {
    super(page);
    this.loadingOverlay = page.locator('#ta-takeoff-viewer-loading');
  }

  /**
   * Waits until the "Rendering plan…" overlay (which blocks every click) is gone, then until the
   * viewer has pages and the canvas count stops changing. Large drawing sets can take minutes.
   */
  async waitForRendered(timeout = 60000, overlayTimeout = 150000): Promise<void> {
    await this.loadingOverlay.waitFor({ state: 'hidden', timeout: overlayTimeout }).catch(() => {
      throw new Error(`The plan was still rendering after ${overlayTimeout / 1000}s.`);
    });
    const start = Date.now();
    let lastCanvasCount = -1;
    let stableChecks = 0;
    while (Date.now() - start < timeout) {
      const state = await this.page.evaluate((id) => {
        const viewer = (document.getElementById(id) as unknown as ViewerHost | null)?.ej2_instances?.[0];
        return { pageCount: viewer?.pageCount ?? 0, canvasCount: document.querySelectorAll('.e-pv-page-canvas, canvas').length };
      }, VIEWER_ID);
      if (state.pageCount > 0 && state.canvasCount > 0 && state.canvasCount === lastCanvasCount) {
        if (++stableChecks >= 2) return;
      } else {
        stableChecks = 0;
      }
      lastCanvasCount = state.canvasCount;
      await this.page.waitForTimeout(500);
    }
  }

  /** Centre of the visible part of the page canvas most in view. */
  async visibleCenter(): Promise<{ x: number; y: number }> {
    const viewport = await this.page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
    let best: { x: number; y: number } | null = null;
    let bestArea = 0;
    for (const canvas of await this.page.locator('.e-pv-annotation-canvas').all()) {
      const box = await canvas.boundingBox();
      if (!box) continue;
      const left = Math.max(box.x, 0);
      const right = Math.min(box.x + box.width, viewport.width);
      const top = Math.max(box.y, 0);
      const bottom = Math.min(box.y + box.height, viewport.height);
      const area = Math.max(0, right - left) * Math.max(0, bottom - top);
      if (area > bestArea) {
        bestArea = area;
        best = { x: (left + right) / 2, y: (top + bottom) / 2 };
      }
    }
    if (!best) throw new Error('No on-screen .e-pv-annotation-canvas found.');
    return best;
  }
}
