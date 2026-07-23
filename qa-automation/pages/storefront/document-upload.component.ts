import { Page, Locator } from '@playwright/test';
import {
  getRandomDocumentTitle,
  getRandomTestPdf,
  pdfBaseName,
} from '../../utils/document.helper';
import { waitForMimikCapture } from '../../utils/mimik.helper';
import { guideClick, guideType } from '../../utils/mimik-action.helper';

export class DocumentUploadComponent {
  constructor(private readonly page: Page) {}

  private resolveUploadPanel(mode: 'service' | 'project' | 'any'): Locator {
    if (mode === 'project') return this.page.locator('#UploadDocumentPanel.show');
    return this.page
      .locator('#UploadDocumentPanel[data-mode="ServiceRequest"].show, #UploadDocumentPanel.show')
      .first();
  }

  private getUploadTrigger(mode: 'service' | 'project' | 'any'): Locator {
    if (mode === 'project') return this.page.locator('#AddDocumentButton').first();
    if (mode === 'service') {
      return this.page
        .locator('#OpenSupportingDocumentButton')
        .or(this.page.getByRole('button', { name: /Supporting documents|Upload document/i }))
        .first();
    }
    return this.page
      .locator('#OpenSupportingDocumentButton, #AddDocumentButton')
      .or(this.page.getByRole('button', { name: /Supporting documents|Upload document/i }))
      .first();
  }

  private async openUploadPanel(trigger: Locator, mode: 'service' | 'project' | 'any'): Promise<Locator> {
    const panel = this.resolveUploadPanel(mode);

    // Real click first so Mimik records "Supporting documents" / upload.
    await guideClick(this.page, trigger, { force: true });
    if (await panel.isVisible({ timeout: 5000 }).catch(() => false)) return panel;

    // Mimik may intercept the trigger and block Bootstrap — force-open as fallback.
    await this.page.evaluate(() => {
      const el = document.querySelector('#UploadDocumentPanel') as HTMLElement | null;
      if (!el) return;
      const bs = (window as unknown as {
        bootstrap?: { Offcanvas?: { getOrCreateInstance: (n: Element) => { show: () => void } } };
      }).bootstrap;
      if (bs?.Offcanvas) {
        bs.Offcanvas.getOrCreateInstance(el).show();
        return;
      }
      el.classList.add('show');
      el.style.visibility = 'visible';
      el.removeAttribute('aria-hidden');
    });

    await panel.waitFor({ state: 'visible', timeout: 15000 });
    await waitForMimikCapture(this.page);
    return panel;
  }

  private async pickDocumentTitle(panel: Locator, title?: string): Promise<string> {
    const chosenTitle = title ?? getRandomDocumentTitle();
    const titleChip = panel.getByRole('button', { name: chosenTitle, exact: true });

    if (await titleChip.isVisible().catch(() => false)) {
      await guideClick(this.page, titleChip, { force: true });
      return chosenTitle;
    }

    for (const fallbackTitle of [chosenTitle, 'Plan Set', 'Response Letter']) {
      const chip = panel.getByRole('button', { name: fallbackTitle, exact: true });
      if (await chip.isVisible().catch(() => false)) {
        await guideClick(this.page, chip, { force: true });
        return fallbackTitle;
      }
    }

    const titleInput = panel.locator('#UploadDoc_Title');
    if (await titleInput.isVisible().catch(() => false)) {
      await guideType(this.page, titleInput, chosenTitle);
    }
    return chosenTitle;
  }

  private async clickSubmitAndWait(panel: Locator, mode: 'service' | 'project' | 'any'): Promise<boolean> {
    const submitBtn = panel.locator('#UploadDoc_SubmitButton');
    const uploadResponse = this.page
      .waitForResponse((r) => r.ok() && /document|upload|file|attachment/i.test(r.url()))
      .catch(() => null);

    console.log('Clicking Add document (save) button in upload offcanvas.');
    await guideClick(this.page, submitBtn, { force: true });
    const response = await uploadResponse;

    if (mode === 'project') {
      const attached = await this.page
        .getByText(/[1-9]\d* attached/i)
        .waitFor({ state: 'visible' })
        .then(() => true)
        .catch(() => false);
      if (attached) return true;
    }

    const toastOk = await this.page
      .getByText(/Document saved|uploaded successfully|saved successfully/i)
      .first()
      .isVisible()
      .catch(() => false);
    const noDocsGone = !(await this.page.getByText('No documents uploaded').isVisible().catch(() => false));
    const panelClosed = await panel.isHidden().catch(() => false);
    const attachedOnPage = await this.page
      .getByText(/files attached|[1-9]\d* attached/i)
      .first()
      .isVisible()
      .catch(() => false);

    return Boolean(response) || toastOk || panelClosed || (noDocsGone && attachedOnPage);
  }

  private async dismissUploadPanel(panel: Locator): Promise<void> {
    if (await panel.isHidden().catch(() => true)) return;

    const cancelButton = panel.getByRole('button', { name: 'Cancel' });
    if (await cancelButton.isVisible().catch(() => false)) {
      await guideClick(this.page, cancelButton, { force: true }).catch(() => {});
    }
    await panel.waitFor({ state: 'hidden' }).catch(() => {});
  }

  async uploadIfVisible(
    filePath?: string,
    title?: string,
    mode: 'service' | 'project' | 'any' = 'any',
  ): Promise<boolean> {
    const pdfPath = filePath ?? getRandomTestPdf();
    const pdfName = pdfBaseName(pdfPath);
    const uploadTrigger = this.getUploadTrigger(mode);

    if (!(await uploadTrigger.isVisible().catch(() => false))) return false;

    if (mode === 'service') {
      const noDocsYet = await this.page.getByText('No documents uploaded').isVisible().catch(() => false);
      const hasAttachedDoc = await this.page
        .getByText(/\.pdf|files attached|[1-9]\d* attached/i)
        .first()
        .isVisible()
        .catch(() => false);
      if (!noDocsYet && hasAttachedDoc) return true;
    }

    let panel: Locator | null = null;
    try {
      panel = await this.openUploadPanel(uploadTrigger, mode);
      await panel.locator('#UploadDoc_FileInput').waitFor({ state: 'attached' });

      const selectedTitle = await this.pickDocumentTitle(panel, title);
      console.log(`Uploading "${pdfName}" with title "${selectedTitle}" (${mode} mode).`);

      await panel.locator('#UploadDoc_FileInput').setInputFiles(pdfPath);
      await waitForMimikCapture(this.page);

      const saved = await this.clickSubmitAndWait(panel, mode);
      await this.dismissUploadPanel(panel);

      if (saved) console.log(`Document "${pdfName}" saved successfully.`);
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
    if (!(await uploadTrigger.isVisible().catch(() => false))) return;

    if (mode === 'service') {
      const noDocsYet = await this.page.getByText('No documents uploaded').isVisible().catch(() => false);
      if (!noDocsYet) return;
    }

    const uploaded = await this.uploadIfVisible(filePath, title, mode);
    if (!uploaded) {
      throw new Error('Document upload button was visible but upload did not complete.');
    }
  }
}
