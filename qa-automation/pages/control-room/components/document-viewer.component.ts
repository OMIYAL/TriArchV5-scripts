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
    await buttons.first().waitFor({ state: 'attached', timeout: 15000 }).catch(() => { });

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
    await this.page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => { });
    await this.waitForLoaders();
    console.log('Document viewer ready.');

    const circleButton = this.page.getByRole('button', { name: 'Circle' });
    await this.waitForDocumentToLoad(
      documentViewer,
      'Circle button',
      async () => { await circleButton.waitFor({ state: 'visible', timeout: 15000 }); }
    );

    await circleButton.click();
    await this.page.waitForTimeout(1500); // Speed trap: Let tool state bind

    // 1. Click to place the circle annotation on the document
    await documentViewer.click({ position: { x: 300, y: 300 }, force: true });
    await this.page.waitForTimeout(1500); // Wait for the annotation to be drawn

    // 2. Double click the exact same spot to select the shape and open the comment box
    await documentViewer.dblclick({ position: { x: 300, y: 300 }, force: true }).catch(() => { });
    await this.page.waitForTimeout(1500);

    if (await this.commentBox.isVisible({ timeout: 10000 }).catch(() => false)) {
      await this.commentBox.fill(faker.lorem.sentence()).catch(() => { });
      await this.commentBox.press('Enter').catch(() => { });
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
        .waitFor({ state: 'hidden', timeout: 50000 })
        .catch(() => { });
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

    let stampTool: Locator;
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
    await textLayer.click({ position: { x: 300, y: 300 }, force: true }).catch(() => { });
  }
}
