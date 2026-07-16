import { Page, Locator } from '@playwright/test';
import { BasePage } from '../base.page';
import { CreateProjectPage } from './create-project.page';
import { DocumentUploadComponent } from './document-upload.component';

export class ServiceApplyPage extends BasePage {
  private readonly projectCombobox: Locator;
  private readonly createNewProjectLink: Locator;
  private readonly payIntakeFeeButton: Locator;

  constructor(page: Page) {
    super(page, (process.env.STOREFRONT_BASE_URL || ''));

    this.projectCombobox = page
      .getByRole('combobox', { name: /No project|project/i })
      .or(page.locator('#ProjectId'))
      .first();
    this.createNewProjectLink = page.getByRole('link', { name: /Create a new project/i });
    this.payIntakeFeeButton = page.locator('#PayIntakeFeeButton');
  }

  async waitForProjectCombobox(): Promise<void> {
    await this.projectCombobox.waitFor({ state: 'visible', timeout: 25000 });
  }

  async openCreateProjectPopup(): Promise<CreateProjectPage> {
    // Service click / prior step sometimes already lands on Create (same tab).
    if (/PermitProjects\/Create/i.test(this.page.url())) {
      console.log('Already on PermitProjects/Create — filling on current page (no popup).');
      await this.page.waitForLoadState('domcontentloaded');
      return new CreateProjectPage(this.page);
    }

    await this.projectCombobox.waitFor({ state: 'visible', timeout: 45000 });
    await this.createNewProjectLink.waitFor({ state: 'visible', timeout: 45000 });

    // Mimik / STG may open Create in the same tab instead of a popup window.
    const opened = Promise.race([
      this.page
        .waitForEvent('popup', { timeout: 60000 })
        .then((popup) => ({ kind: 'popup' as const, page: popup })),
      this.page
        .waitForURL(/PermitProjects\/Create/i, { timeout: 60000 })
        .then(() => ({ kind: 'sameTab' as const, page: this.page })),
    ]);

    await this.createNewProjectLink.click();

    const target = await opened;
    await target.page.waitForLoadState('domcontentloaded');
    if (target.kind === 'popup') {
      await target.page.bringToFront();
      console.log('Create project opened in a popup window.');
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
      await combobox.click({ force: true });

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
    await this.payIntakeFeeButton.click({ force: true });
  }
}
