import { Page, Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import { CreateProjectPage } from './create-project.page';
import { DocumentUploadComponent } from './document-upload.component';
import { guideClick } from '../../utils/mimik-action.helper';
const CREATE_PROJECT_URL = /PermitProjects\/Create/i;

export class ServiceApplyPage extends BasePage {
  private readonly projectCombobox: Locator;
  private readonly payIntakeFeeButton: Locator;

  constructor(page: Page) {
    super(page, (process.env.STOREFRONT_BASE_URL || ''));

    this.projectCombobox = page
      .getByRole('combobox', { name: /No project|project/i })
      .or(page.locator('#ProjectId'))
      .first();
    this.payIntakeFeeButton = page.locator('#PayIntakeFeeButton');
  }

  /** "+ New project" link/button — label varies by service skin. */
  private createProjectControl(): Locator {
    return this.page
      .locator('a[href*="PermitProjects/Create"], a[href*="PermitProjects%2FCreate"]')
      .or(this.page.getByRole('link', { name: /Create a new project|New project/i }))
      .or(this.page.getByRole('button', { name: /New project/i }))
      .first();
  }

  private findCreateProjectPage(): Page | null {
    if (CREATE_PROJECT_URL.test(this.page.url())) {
      return this.page;
    }
    for (const p of this.page.context().pages()) {
      if (!p.isClosed() && CREATE_PROJECT_URL.test(p.url())) {
        return p;
      }
    }
    return null;
  }

  /** Poll all tabs — avoids Promise.race rejecting when popup never fires under Mimik. */
  private async waitForCreateProjectPage(timeout = 90000): Promise<{ kind: 'popup' | 'sameTab'; page: Page }> {
    const deadline = Date.now() + timeout;

    while (Date.now() < deadline) {
      const found = this.findCreateProjectPage();
      if (found) {
        const kind = found === this.page ? 'sameTab' : 'popup';
        return { kind, page: found };
      }
      await this.page.waitForTimeout(400);
    }

    const openUrls = this.page
      .context()
      .pages()
      .filter((p) => !p.isClosed())
      .map((p) => p.url())
      .join(' | ');

    throw new Error(
      `Create project page did not open within ${timeout}ms. ` +
        `Apply tab: ${this.page.url()}. Open tabs: ${openUrls || '(none)'}`,
    );
  }

  async waitForProjectCombobox(): Promise<void> {
    await this.page
      .waitForURL(/services\/Apply/i, this.urlWait(45000))
      .catch(() => {});
    await this.projectCombobox.waitFor({ state: 'visible', timeout: 45000 });
  }

  async openCreateProjectPopup(): Promise<CreateProjectPage> {
    // Service click / prior step sometimes already lands on Create (same tab).
    const existing = this.findCreateProjectPage();
    if (existing) {
      console.log('Already on PermitProjects/Create — filling on current page (no popup).');
      await existing.waitForLoadState('domcontentloaded').catch(() => {});
      return new CreateProjectPage(existing);
    }

    await this.projectCombobox.waitFor({ state: 'visible', timeout: 45000 });

    const createControl = this.createProjectControl();
    await createControl.waitFor({ state: 'visible', timeout: 45000 });
    await createControl.scrollIntoViewIfNeeded();

    await guideClick(this.page, createControl);

    const target = await this.waitForCreateProjectPage(90000);

    await target.page.bringToFront();
    await target.page.waitForLoadState('domcontentloaded').catch(() => {});

    if (target.kind === 'popup') {
      console.log('Create project opened in a popup/new tab.');
    } else {
      console.log('Create project opened in the same tab (no popup).');
    }

    return new CreateProjectPage(target.page);
  }

  async selectCreatedProject(projectName: string): Promise<void> {
    const combobox = this.projectCombobox;
    await combobox.waitFor({ state: 'visible', timeout: 15000 });

    const projectIdMatch = this.page.url().match(/projectId=([^&]+)/i);
    if (projectIdMatch) {
      console.log(`Apply page already has projectId=${projectIdMatch[1]} in URL.`);

      for (let wait = 0; wait < 8; wait++) {
        if (this.page.isClosed()) return;

        const currentLabel = (await combobox.innerText().catch(() => '') ?? '').trim();
        const formReady = await this.page
          .getByRole('navigation', { name: 'Service application steps' })
          .isVisible({ timeout: 1000 })
          .catch(() => false);

        if (formReady && (currentLabel.includes(projectName) || !/no project/i.test(currentLabel))) {
          console.log(`Project combobox ready with "${currentLabel}" — skipping dropdown selection.`);
          return;
        }

        await this.page.waitForTimeout(1000);
      }
    }

    for (let attempt = 0; attempt < 4; attempt++) {
      if (this.page.isClosed()) return;

      if (attempt > 0) {
        console.log(`Project "${projectName}" not in dropdown yet — refreshing apply page (attempt ${attempt + 1}/4).`);
        await this.page.reload({ waitUntil: 'domcontentloaded' });
        await combobox.waitFor({ state: 'visible', timeout: 15000 });
      }

      const currentLabel = (await combobox.innerText().catch(() => '') ?? '').trim();
      if (currentLabel.includes(projectName)) {
        console.log(`Project "${projectName}" already selected in combobox.`);
        break;
      }

      await combobox.scrollIntoViewIfNeeded();
      await guideClick(this.page, combobox);

      const projectOption = this.page.getByRole('option', { name: new RegExp(projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first();
      const found = await projectOption.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);

      if (found) {
        await projectOption.click();
        console.log(`Selected newly created project "${projectName}" from dropdown.`);
        break;
      }

      await this.page.keyboard.press('Escape').catch(() => {});
    }

    await this.page
      .getByRole('navigation', { name: 'Service application steps' })
      .waitFor({ state: 'visible', timeout: 15000 });
  }

  async uploadSupportingDocuments(): Promise<void> {
    await new DocumentUploadComponent(this.page).uploadRequired(undefined, undefined, 'service');
  }

  async clickPayIntakeFee(): Promise<void> {
    await guideClick(this.page, this.payIntakeFeeButton, { force: true });
  }
}
