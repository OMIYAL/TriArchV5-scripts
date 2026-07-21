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
    await this.projectCombobox.waitFor({ state: 'visible', timeout: 15000 });
    await this.createNewProjectLink.waitFor({ state: 'visible', timeout: 15000 });

    const [popupPage] = await Promise.all([
      this.page.waitForEvent('popup'),
      this.createNewProjectLink.click(),
    ]);

    await popupPage.waitForLoadState('domcontentloaded');
    await popupPage.bringToFront();
    return new CreateProjectPage(popupPage);
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
      await combobox.click();

      const projectOption = this.page.getByRole('option', { name: new RegExp(projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') }).first();
      const found = await projectOption.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);

      if (found) {
        await projectOption.click();
        console.log(`Selected newly created project "${projectName}" from dropdown.`);
        break;
      }

      await this.page.keyboard.press('Escape');
    }

    await this.page
      .getByRole('navigation', { name: 'Service application steps' })
      .waitFor({ state: 'visible', timeout: 15000 });
  }

  async uploadSupportingDocuments(): Promise<void> {
    await new DocumentUploadComponent(this.page).uploadRequired(undefined, undefined, 'service');
  }

  async clickPayIntakeFee(): Promise<void> {
    await this.payIntakeFeeButton.click();
  }
}
