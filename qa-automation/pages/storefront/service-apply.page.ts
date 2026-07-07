import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../base.page';
import { CreateProjectPage } from './create-project.page';

/**
 * Service Apply Page Object - Handles service application flow
 */
export class ServiceApplyPage extends BasePage {
  private readonly projectCombobox: Locator;
  private readonly createNewProjectLink: Locator;
  private readonly payIntakeFeeButton: Locator;

  constructor(page: Page) {
    super(page, (process.env.STOREFRONT_BASE_URL || ''));
    
    this.projectCombobox = page.getByRole('combobox', { name: 'No project — enter' });
    this.createNewProjectLink = page.getByRole('link', { name: 'Create a new project — opens' });
    this.payIntakeFeeButton = page.locator('#PayIntakeFeeButton');
  }

  async navigate(serviceDefinitionId: string): Promise<void> {
    await this.goto('/services/Apply', { serviceDefinitionId });
    await this.projectCombobox.waitFor({ state: 'visible', timeout: 15000 });
  }

  async openCreateProjectPopup(): Promise<CreateProjectPage> {
    await this.projectCombobox.click();
    
    const [popupPage] = await Promise.all([
      this.page.waitForEvent('popup'),
      this.createNewProjectLink.click(),
    ]);
    
    return new CreateProjectPage(popupPage);
  }

  async verifyAmountDueVisible(): Promise<void> {
    await expect(this.page.getByText('Amount due')).toBeVisible();
  }

  async clickPayIntakeFee(): Promise<void> {
    await this.payIntakeFeeButton.click();
  }

  /**
   * Selects the project we just created in the main page dropdown
   */
  async selectCreatedProject(projectName: string): Promise<void> {
    // Reload the page because the frontend doesn't auto-fetch newly created projects
    await this.page.reload({ waitUntil: 'domcontentloaded' });
    await this.page.waitForTimeout(2000); // Give it a moment to fully initialize
    
    // The dropdown label changes after creation, so we target it generally by role
    const projectDropdown = this.page.locator('[role="combobox"]').first();
    await projectDropdown.waitFor({ state: 'visible', timeout: 15000 });
    await projectDropdown.click();
    
    // ⭐ FIX: Use .first() to safely handle multiple projects with the same name from previous test runs
    const projectOption = this.page.getByRole('option', { name: projectName }).first();
    await projectOption.waitFor({ state: 'visible', timeout: 10000 });
    await projectOption.click();
    
    // Wait for selection to register and dropdown to close
    await this.page.waitForTimeout(1000);
  }
  /**
   * Extract service request ID from URL after submission
   */
  extractServiceRequestId(): string | null {
    const url = this.getCurrentUrl();
    const match = url.match(/serviceRequestId=([^&]+)/);
    return match ? match[1] : null;
  }
}