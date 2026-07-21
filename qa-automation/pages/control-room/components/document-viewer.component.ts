import { Page, Locator } from '@playwright/test';
import { BasePage } from '../../base.page';
import { faker } from '@faker-js/faker';

export class DocumentViewerComponent extends BasePage {
  private readonly commentBox: Locator;
  private readonly postButton: Locator;

  constructor(page: Page) {
    super(page);
    this.commentBox = page.locator('.e-pv-comment-textarea, textarea[placeholder*="comment" i], textarea[placeholder*="reply" i], textarea[placeholder*="Add" i]').first();
    this.postButton = page.locator('button:has-text("Post"), button:has-text("Publish"), button:has-text("Send"), .e-pv-comment-post-btn, .e-pv-comment-post').first();
  }

  async getDocumentViewer() {
    // Try multiple possible viewer container locators
    const viewer = this.page.locator('#ta-doc-review-viewer, #ta-plan-review-viewer, .e-pdfviewer, .ta-plan-review-surface__stage').first();
    return viewer;
  }

  async getSaveAndNextButton() {
    const buttons = this.page.getByRole('button', { name: /Save & Next/i });
    // Wait for at least one button to be attached to the DOM before counting
    try {
      await buttons.first().waitFor({ state: 'attached', timeout: 15000 });
    } catch {
      // It's okay if no buttons are attached
    }

    const count = await buttons.count();
    for (let i = 0; i < count; i++) {
      if (await buttons.nth(i).isVisible()) {
        return buttons.nth(i);
      }
    }
    return null;
  }

  async waitForDocumentToLoad(viewerLocator: Locator, expectedSelectorDescription: string, expectedSelectorWaiter: () => Promise<void>) {
    const loadingIndicator = this.page.getByText(/Loading document/i);
    const isLoaderVisible = await loadingIndicator.isVisible({ timeout: 5000 }).catch(() => false);

    if (isLoaderVisible) {
      console.log(`Document is loading. Waiting up to 20s for document & ${expectedSelectorDescription} to load...`);
      await Promise.all([
        loadingIndicator.waitFor({ state: 'hidden', timeout: 20000 }),
        expectedSelectorWaiter()
      ]);
      console.log(`Document & ${expectedSelectorDescription} loaded successfully!`);
    } else {
      await expectedSelectorWaiter();
    }
  }

  /**
   * Snapshots a <canvas> element's pixel content and polls until it changes (or times out).
   * Replaces "hope N ms was enough for the canvas to redraw" with an actual signal that
   * something was drawn. Used for the PDF/plan viewer's annotation canvas, which is how
   * Syncfusion's viewer (.e-pdfviewer) renders shapes/tools — there's no DOM node that
   * appears when a shape is drawn, only a canvas repaint, so this is the correct primitive
   * to wait on instead of a fixed sleep.
   */
  private async waitForCanvasChange(canvasSelector: string, timeoutMs = 5000): Promise<boolean> {
    return this.page.evaluate(
      ({ selector, timeout }) => {
        return new Promise<boolean>((resolve) => {
          const canvas = document.querySelector(selector) as HTMLCanvasElement | null;
          if (!canvas) { resolve(false); return; }
          const before = canvas.toDataURL();
          const start = Date.now();
          const poll = () => {
            if (canvas.toDataURL() !== before) { resolve(true); return; }
            if (Date.now() - start > timeout) { resolve(false); return; }
            requestAnimationFrame(poll);
          };
          poll();
        });
      },
      { selector: canvasSelector, timeout: timeoutMs }
    ).catch(() => false);
  }

  async annotateAndComment() {
    const documentViewer = await this.getDocumentViewer();
    // Check if the viewer exists in the DOM at all (to identify if this is a document/plan review step)
    const exists = await documentViewer.count().catch(() => 0) > 0;
    if (!exists) {
      // Not a document/plan review step, skip safely
      return;
    }

    console.log('Document/Plan review step detected. Waiting for viewer to become visible...');
    await documentViewer.waitFor({ state: 'visible', timeout: 60000 });
    // Wait for network to settle instead of a fixed sleep — avoids idle time on fast connections
    await this.waitForLoaders();
    console.log('Document viewer ready.');

    const circleButton = this.page.getByRole('button', { name: 'Circle' });
    await this.waitForDocumentToLoad(
      documentViewer,
      'Circle button',
      async () => { await circleButton.waitFor({ state: 'visible', timeout: 15000 }); }
    );

    await circleButton.click();
    // FIX: replaced fixed 1500ms "let tool state bind" sleep with an explicit wait for the
    // toolbar to report the tool as active. Most toolbar buttons (incl. Syncfusion's) toggle
    // aria-pressed/aria-selected or an "e-active"/"active" class when a tool is selected.
    // Falls back to a short bounded wait only if the app exposes none of these signals.
    const toolBound = await Promise.race([
      this.page.waitForFunction(
        (el) => el?.getAttribute('aria-pressed') === 'true' || el?.getAttribute('aria-selected') === 'true'
          || el?.classList.contains('e-active') || el?.classList.contains('active'),
        await circleButton.elementHandle(),
        { timeout: 3000 }
      ).then(() => true).catch(() => false),
    ]);
    if (!toolBound) {
      console.log('Warning: Circle tool active-state signal not detected — falling back to a short bounded wait.');
      await this.page.waitForTimeout(800);
    }

    // 1. Click to place the circle annotation on the document
    // NOTE: force kept here — clicking into a PDF/plan viewer canvas commonly sits under
    // floating toolbar chrome (zoom controls, page nav) that can overlap the click point
    // without actually blocking real user interaction with the canvas underneath. Unlike the
    // plain-button force removals elsewhere in this codebase, this one has a plausible reason;
    // still worth the team confirming whether a data-testid'd toolbar with proper z-index/
    // pointer-events would let this drop force too.
    await documentViewer.click({ position: { x: 300, y: 300 }, force: true });
    // FIX: replaced fixed 1500ms "wait for annotation to be drawn" sleep with a canvas-pixel
    // change detection — the annotation is drawn onto a <canvas>, not a new DOM node, so this
    // is the real completion signal rather than guessing a duration.
    const drawn = await this.waitForCanvasChange('.e-pdfviewer canvas, #ta-doc-review-viewer canvas, #ta-plan-review-viewer canvas', 4000);
    if (!drawn) {
      console.log('Warning: canvas change not detected after placing annotation — falling back to a short bounded wait.');
      await this.page.waitForTimeout(800);
    }

    // 2. Double click the exact same spot to select the shape and open the comment box
    // NOTE: force kept here for the same reason as the click above.
    await documentViewer.dblclick({ position: { x: 300, y: 300 }, force: true });

    // FIX: removed the fixed 1500ms sleep here entirely — the comment box's own explicit
    // `waitFor({ state: 'visible' })` below is the real, correct wait for this transition.
    const commentBoxVisible = await this.commentBox
      .waitFor({ state: 'visible', timeout: 10000 })
      .then(() => true)
      .catch(() => false);

    if (commentBoxVisible) {
      await this.commentBox.fill(faker.lorem.sentence());
      await this.commentBox.press('Enter');
      if (await this.postButton.isEnabled().catch(() => false)) await this.safeClick(this.postButton, 5000);
    }
  }

  async clickSaveAndNext() {
    const saveAndNextButton = await this.getSaveAndNextButton();
    if (saveAndNextButton) {
      console.log('Clicking Save & Next (Single Step)');
      await this.waitForLoaders();
      // Wait for the document loading spinner to clear — it intercepts pointer events
      await this.page.locator('#ta-doc-review-loading, .ta-stage-loading').first()
        .waitFor({ state: 'hidden', timeout: 50000 });
      await saveAndNextButton.waitFor({ state: 'visible', timeout: 30000 });
      await saveAndNextButton.click({ timeout: 30000 });
      await this.waitForLoaders();
    }
  }

  async reviewReport() {
    const editor = this.page.locator('.e-rte-content, #ta-doc-review-viewer, #ta-plan-review-viewer, .ta-plan-review-surface__stage').first();
    if (await editor.count().catch(() => 0) === 0) return;

    console.log('Report review step detected. Waiting for editor to become visible...');
    await editor.waitFor({ state: 'visible', timeout: 30000 });
    await this.waitForDocumentToLoad(
      editor,
      'RTE Editor',
      async () => { await editor.waitFor({ state: 'visible', timeout: 30000 }); }
    );

    await this.waitForLoaders();
    await this.safeHover(editor, 5000);
    await this.page.mouse.wheel(0, 1000);
  }

  async applyApprovedStamp() {
    const documentViewer = await this.getDocumentViewer();
    if (await documentViewer.count().catch(() => 0) === 0) return;

    console.log('Stamping step detected. Waiting for viewer to become visible...');
    await documentViewer.waitFor({ state: 'visible', timeout: 30000 });

    let stampTool!: Locator;
    await this.waitForDocumentToLoad(
      documentViewer,
      'Stamp tools',
      async () => {
        const primary = this.page.locator('.e-stamp').first();
        if (await primary.isVisible({ timeout: 5000 }).catch(() => false)) {
          stampTool = primary;
        } else {
          stampTool = this.page.getByRole('menuitem', { name: 'menuitem_0' }).first();
          await stampTool.waitFor({ state: 'visible', timeout: 15000 });
        }
      }
    );

    await this.waitForLoaders();
    await stampTool.click({ timeout: 10000 });

    const dynamicOption = this.page.getByText('Dynamic', { exact: true }).first()
      .or(this.page.getByRole('menuitem', { name: 'Dynamic' }).first());
    await dynamicOption.waitFor({ state: 'visible', timeout: 5000 });
    await dynamicOption.click({ timeout: 5000 });

    const approvedOption = this.page.getByText('Approved', { exact: true }).first()
      .or(this.page.getByRole('menuitem', { name: 'Approved', exact: true }).first());
    await approvedOption.waitFor({ state: 'visible', timeout: 5000 });
    await approvedOption.click({ timeout: 5000 });

    const textLayer = this.page.locator('#ta-doc-review-viewer_textLayer_0, #ta-doc-review-viewer, #ta-plan-review-viewer_textLayer_0, #ta-plan-review-viewer').first();
    // NOTE: force kept — same viewer-canvas/toolbar-overlap reasoning as the annotation
    // placement clicks above.
    await textLayer.click({ position: { x: 300, y: 300 }, force: true });
  }
}
