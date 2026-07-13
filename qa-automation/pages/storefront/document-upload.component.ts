import { Page, Locator } from '@playwright/test';
import {
  getRandomDocumentTitle,
  getRandomTestPdf,
  pdfBaseName,
} from '../../utils/document.helper';

export class DocumentUploadComponent {
  constructor(private readonly page: Page) {}

  private projectUploadPanel(): Locator {
    return this.page.locator('#UploadDocumentPanel.show');
  }

  private serviceUploadPanel(): Locator {
    return this.page.locator('#UploadDocumentPanel[data-mode="ServiceRequest"].show, #UploadDocumentPanel.show').first();
  }

  private resolveUploadPanel(mode: 'service' | 'project' | 'any'): Locator {
    if (mode === 'project') return this.projectUploadPanel();
    if (mode === 'service') return this.serviceUploadPanel();
    return this.serviceUploadPanel().or(this.projectUploadPanel());
  }

  private getUploadTrigger(mode: 'service' | 'project' | 'any'): Locator {
    if (mode === 'service') {
      return this.page
        .locator('#OpenSupportingDocumentButton')
        .or(this.page.getByRole('button', { name: /Supporting documents|Upload document/i }));
    }
    if (mode === 'project') {
      return this.page.locator('#AddDocumentButton');
    }
    return this.page.locator('#OpenSupportingDocumentButton, #AddDocumentButton').first();
  }

  private async pickDocumentTitle(panel: Locator, title?: string): Promise<string> {
    const chosenTitle = title ?? getRandomDocumentTitle();
    const titleChip = panel.getByRole('button', { name: chosenTitle, exact: true });

    if (await titleChip.isVisible({ timeout: 2000 }).catch(() => false)) {
      await titleChip.click({ force: true });
      return chosenTitle;
    }

    const fallbacks = [chosenTitle, 'Plan Set', 'Response Letter'];
    for (const fallbackTitle of fallbacks) {
      const chip = panel.getByRole('button', { name: fallbackTitle, exact: true });
      if (await chip.isVisible({ timeout: 500 }).catch(() => false)) {
        await chip.click({ force: true });
        return fallbackTitle;
      }
    }

    const titleInput = panel.locator('#UploadDoc_Title');
    if (await titleInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await titleInput.fill(chosenTitle);
    }

    return chosenTitle;
  }

  private async clickSubmitAndWait(panel: Locator, pdfName: string, mode: 'service' | 'project' | 'any'): Promise<boolean> {
    const submitBtn = panel.locator('#UploadDoc_SubmitButton');
    await submitBtn.scrollIntoViewIfNeeded();
    await submitBtn.waitFor({ state: 'visible', timeout: 10000 });

    const uploadResponse = this.page
      .waitForResponse((r) => r.ok() && /document|upload|file|attachment/i.test(r.url()), { timeout: 8000 })
      .catch(() => null);

    console.log('Clicking Add document (save) button in upload offcanvas.');
    await submitBtn.click({ force: true });
    await uploadResponse;

    await this.page.waitForTimeout(1500);

    if (mode === 'project') {
      const attached = await this.page.getByText(/[1-9]\d* attached/i).waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
      if (attached) return true;
    }

    const escapedPdf = pdfName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pdfVisible = await this.page.getByText(new RegExp(escapedPdf, 'i')).first().isVisible({ timeout: 5000 }).catch(() => false);
    const panelClosed = await panel.isHidden({ timeout: 5000 }).catch(() => false);

    return pdfVisible || panelClosed;
  }

  private async dismissUploadPanel(panel: Locator): Promise<void> {
    if (await panel.isHidden({ timeout: 500 }).catch(() => true)) return;

    const cancelButton = panel.getByRole('button', { name: 'Cancel' });
    if (await cancelButton.isVisible({ timeout: 500 }).catch(() => false)) {
      await cancelButton.click({ force: true }).catch(() => {});
    }
    await this.page.keyboard.press('Escape').catch(() => {});
    await panel.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
  }

  async uploadIfVisible(
    filePath?: string,
    title?: string,
    mode: 'service' | 'project' | 'any' = 'any',
  ): Promise<boolean> {
    const pdfPath = filePath ?? getRandomTestPdf();
    const pdfName = pdfBaseName(pdfPath);
    const uploadTrigger = this.getUploadTrigger(mode);

    if (!await uploadTrigger.isVisible({ timeout: mode === 'project' ? 8000 : 2000 }).catch(() => false)) return false;

    if (mode === 'service') {
      const noDocsYet = await this.page.getByText('No documents uploaded').isVisible({ timeout: 500 }).catch(() => false);
      const hasAttachedDoc = await this.page.getByText(/\.pdf|files attached|attached/i).first().isVisible({ timeout: 500 }).catch(() => false);
      if (!noDocsYet && hasAttachedDoc) return false;
    }

    let panel: Locator | null = null;

    try {
      await uploadTrigger.scrollIntoViewIfNeeded();
      await uploadTrigger.click({ force: true });

      panel = this.resolveUploadPanel(mode);
      await panel.waitFor({ state: 'visible', timeout: 10000 });
      await panel.locator('#UploadDoc_FileInput').waitFor({ state: 'attached', timeout: 5000 });

      const selectedTitle = await this.pickDocumentTitle(panel, title);
      console.log(`Uploading "${pdfName}" with title "${selectedTitle}" (${mode} mode).`);

      await panel.locator('#UploadDoc_FileInput').setInputFiles(pdfPath);
      await this.page.waitForTimeout(1000);

      const saved = await this.clickSubmitAndWait(panel, pdfName, mode);
      await this.dismissUploadPanel(panel);

      if (mode === 'service') {
        await this.page.waitForURL(
          (url) => {
            const href = typeof url === 'string' ? url : url.href;
            return !href.includes('handler=SaveDraft') || (href.includes('serviceDefinitionId') && href.includes('projectId'));
          },
          { timeout: 12000 },
        ).catch(() => {});
      }

      if (saved) {
        console.log(`Document "${pdfName}" saved successfully.`);
      }
      return saved;
    } catch (err) {
      if (panel) await this.dismissUploadPanel(panel);
      console.log(`Document upload failed: ${err}`);
      return false;
    }
  }

  async uploadRequired(
    filePath?: string,
    title?: string,
    mode: 'service' | 'project' | 'any' = 'any',
  ): Promise<void> {
    const uploadTrigger = this.getUploadTrigger(mode);
    if (!await uploadTrigger.isVisible({ timeout: 2000 }).catch(() => false)) return;

    if (mode === 'service') {
      const noDocsYet = await this.page.getByText('No documents uploaded').isVisible({ timeout: 500 }).catch(() => false);
      if (!noDocsYet) return;
    }

    const uploaded = await this.uploadIfVisible(filePath, title, mode);
    if (!uploaded) {
      throw new Error('Document upload button was visible but upload did not complete.');
    }
  }
}
