import { Page, Locator } from '@playwright/test';
import { BuildRoomBasePage } from '../base.page';

/** The parts of the Syncfusion viewer instance (`element.ej2_instances[0]`) used here. */
interface ViewerInstance {
  pageCount: number;
  currentPageNumber: number;
  annotation: { addAnnotation(type: string, options: object): void };
}
type ViewerHost = { ej2_instances?: ViewerInstance[] };

const VIEWER_ID = 'ta-takeoff-pdf-viewer';
const CONTAINER_ID = `${VIEWER_ID}_viewerContainer`;

/** Page-space (PDF units, not screen pixels) vertices of the fixed linear run drawn on any sheet. */
const LINEAR_RUN_VERTICES = [
  { x: 300, y: 300 },
  { x: 500, y: 300 },
];

/**
 * The Take-Off plan (a Syncfusion PDF viewer). Its text layer covers the canvas, so clicks go
 * through `page.mouse`. Points are fractions of the page's full canvas, which stay valid across
 * zoom and scroll.
 */
export class PlanViewerComponent extends BuildRoomBasePage {
  private readonly zoomInButton: Locator;
  private readonly loadingOverlay: Locator;

  constructor(page: Page) {
    super(page);
    this.zoomInButton = page.locator('#ta-takeoff-tool-zoom-in');
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

  /** Waits until a loaded page-tile image sits under every point — i.e. the sheet is painted there. */
  async waitForPaintedAt(points: { x: number; y: number }[], timeout = 60000): Promise<void> {
    await this.page
      .waitForFunction(
        (pts) =>
          pts.every((p) =>
            document
              .elementsFromPoint(p.x, p.y)
              .some((e) => e instanceof HTMLImageElement && e.id.includes('tileimg') && e.complete && e.naturalWidth > 0)
          ),
        points,
        { timeout, polling: 250 }
      )
      .catch(() => {
        throw new Error(`The plan was not painted at the target within ${timeout / 1000}s — refusing to click a blank viewer.`);
      });
  }

  async zoomIn(times: number): Promise<void> {
    for (let i = 0; i < times; i++) {
      await this.zoomInButton.click();
      await this.waitForRendered();
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

  /** Scrolls the point (a fraction of the current page's canvas) to the viewer's centre and returns its screen position. */
  async centerOnPagePoint(fx: number, fy: number): Promise<{ cx: number; cy: number }> {
    const pageNumber = await this.page.evaluate(
      (id) => (document.getElementById(id) as unknown as ViewerHost).ej2_instances![0].currentPageNumber,
      VIEWER_ID
    );
    const canvas = this.page.locator(`#${VIEWER_ID}_annotationCanvas_${pageNumber - 1}`);
    for (let pass = 0; pass < 4; pass++) {
      const box = await canvas.boundingBox();
      if (!box) throw new Error(`No annotation canvas found for page ${pageNumber}.`);
      const container = await this.page.evaluate((id) => {
        const r = document.getElementById(id)!.getBoundingClientRect();
        return { x: r.x, y: r.y, w: r.width, h: r.height };
      }, CONTAINER_ID);
      const cx = box.x + box.width * fx;
      const cy = box.y + box.height * fy;
      const dx = cx - (container.x + container.w / 2);
      const dy = cy - (container.y + container.h / 2);
      if (Math.abs(dx) < 5 && Math.abs(dy) < 5) return { cx, cy };
      await this.page.evaluate(({ id, dx, dy }) => document.getElementById(id)!.scrollBy(dx, dy), { id: CONTAINER_ID, dx, dy });
      await this.waitForRendered();
    }
    throw new Error('The viewer did not settle with the target centred after 4 scroll passes.');
  }

  /** Draws the linear run through the viewer's API (mouse drags aren't picked up). It counts for the selected device with "Place on plan" on. */
  async addLinearRun(): Promise<void> {
    await this.page.evaluate(
      ({ id, vertexPoints }) => {
        const viewer = (document.getElementById(id) as unknown as ViewerHost).ej2_instances![0];
        viewer.annotation.addAnnotation('Distance', { pageNumber: viewer.currentPageNumber, vertexPoints });
      },
      { id: VIEWER_ID, vertexPoints: LINEAR_RUN_VERTICES }
    );
  }
}
