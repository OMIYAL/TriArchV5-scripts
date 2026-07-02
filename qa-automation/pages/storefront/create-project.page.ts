import { Page, Locator, expect } from '@playwright/test';
import { env } from '../../utils/env.helper';

export class CreateProjectPage {
  private readonly page: Page;
  
  private readonly jurisdictionCombobox: Locator;
  private readonly nextButton: Locator;
  private readonly projectNameInput: Locator;
  private readonly streetAddressInput: Locator;
  private readonly cityInput: Locator;
  private readonly stateInput: Locator;
  private readonly postalCodeInput: Locator;
  private readonly a1Combobox: Locator;
  private readonly typeIACombobox: Locator;
  private readonly grossSquareFootageInput: Locator;
  private readonly heightInput: Locator;
  private readonly numberOfFloorsInput: Locator;
  private readonly basementCombobox: Locator;
  private readonly addContactButton: Locator;
  private readonly makePrimaryCheckbox: Locator;
  private readonly transferOwnershipCheckbox: Locator;
  private readonly contactCloseButton: Locator;
  private readonly createProjectButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nextButton = page.getByRole('button', { name: 'Next' });

    this.jurisdictionCombobox = page.getByRole('combobox', { name: 'Search jurisdiction by name' });
    this.projectNameInput = page.getByRole('textbox', { name: 'Project Name' });
    this.streetAddressInput = page.getByRole('textbox', { name: 'Street Address Line 1' });
    this.cityInput = page.getByRole('textbox', { name: 'City or Municipality' });
    this.stateInput = page.getByRole('textbox', { name: 'State or Province' });
    this.postalCodeInput = page.getByRole('textbox', { name: 'Postal Code' });
    this.a1Combobox = page.getByRole('combobox', { name: 'A1' });
    this.typeIACombobox = page.getByRole('combobox', { name: 'TypeIA' });
    this.grossSquareFootageInput = page.getByRole('textbox', { name: 'Gross Square Footage' });
    this.heightInput = page.getByRole('textbox', { name: 'Height' });
    this.numberOfFloorsInput = page.getByRole('spinbutton', { name: 'Number Of Floors' });
    this.basementCombobox = page.getByRole('combobox', { name: 'None' });
    
    this.addContactButton = page.getByRole('button', { name: 'Add contact' });
    this.makePrimaryCheckbox = page.getByLabel('Make primary for this role');
    this.transferOwnershipCheckbox = page.getByLabel('Transfer Ownership');
    this.contactCloseButton = page.getByLabel('Close');
    
    this.createProjectButton = page.getByRole('button', { name: 'Create project' });
  }

  async completeFullFlow(): Promise<void> {
    // ═══════════════════════════════════════════════════════════
    // Step 1: Jurisdiction
    // ═══════════════════════════════════════════════════════════
    await this.jurisdictionCombobox.waitFor({ state: 'visible', timeout: 10000 });
    await this.jurisdictionCombobox.click();
    const select2SearchInput = this.page.locator('input.select2-search__field:visible');
    await select2SearchInput.waitFor({ state: 'visible', timeout: 5000 });
    await select2SearchInput.fill(env.project.jurisdiction);
    const jurisdictionOption = this.page.getByRole('option', { name: env.project.jurisdiction, exact: true });
    await jurisdictionOption.waitFor({ state: 'visible', timeout: 15000 });
    await jurisdictionOption.click();
    await this.clickNext();

    // ═══════════════════════════════════════════════════════════
    // Step 2: Project Name
    // ═══════════════════════════════════════════════════════════
    await this.projectNameInput.fill(env.project.name);
    await this.clickNext();

    // ═══════════════════════════════════════════════════════════
    // Step 3: Address
    // ═══════════════════════════════════════════════════════════
    await this.streetAddressInput.fill(env.project.streetAddress);
    await this.cityInput.fill(env.project.city);
    await this.stateInput.fill(env.project.state);
    await this.postalCodeInput.fill(env.project.postalCode);
    await this.clickNext();

    // ═══════════════════════════════════════════════════════════
    // Step 4: Building Details
    // ═══════════════════════════════════════════════════════════
    const a1Option = this.page.getByRole('option', { name: env.building.a1Option });
    await this.a1Combobox.click();
    await a1Option.waitFor({ state: 'visible', timeout: 5000 });
    await a1Option.click();

    const typeIaOption = this.page.getByRole('option', { name: env.building.iaOption });
    await this.typeIACombobox.click();
    await typeIaOption.waitFor({ state: 'visible', timeout: 5000 });
    await typeIaOption.click();

    await this.grossSquareFootageInput.click();
    await this.heightInput.click();
    await this.numberOfFloorsInput.dblclick();

    const basementOption = this.page.getByRole('option', { name: env.building.basementOption });
    await this.basementCombobox.click();
    await basementOption.waitFor({ state: 'visible', timeout: 5000 });
    await basementOption.click();
    await this.clickNext();

    // ═══════════════════════════════════════════════════════════
    // Step 5: Contacts
    // ═══════════════════════════════════════════════════════════
    await this.clickNext();
    await this.page.waitForTimeout(2000);
    
    await this.addContactButton.waitFor({ state: 'visible', timeout: 10000 });
    await this.addContactButton.click();
    
    const contactOverlay = this.page.locator('.offcanvas.show, .modal.show, [role="dialog"]:visible').last();
    await contactOverlay.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
    
    const overlayInputs = contactOverlay.locator('input:visible');
    const inputCount = await overlayInputs.count();
    
    for (let i = 0; i < inputCount; i++) {
      await overlayInputs.nth(i).click().catch(() => {});
    }

    const overlayCheckboxes = contactOverlay.locator('input[type="checkbox"]:visible');
    const checkboxCount = await overlayCheckboxes.count();
    for (let i = 0; i < checkboxCount; i++) {
      await overlayCheckboxes.nth(i).click().catch(() => {});
    }
    
    const closeButton = contactOverlay.locator('.btn-close, [aria-label="Close"], button:has-text("Close")').first();
    await closeButton.click().catch(() => {});
    
    await this.clickNext();

    // ═══════════════════════════════════════════════════════════
    // Step 6: Review
    // ═══════════════════════════════════════════════════════════
    await expect(
      this.page.locator('div:nth-child(4) > .ta-form-section > .card-body')
    ).toBeVisible();
    
    await this.createProjectButton.click();
  }

  private async clickNext(): Promise<void> {
    await this.nextButton.waitFor({ state: 'visible', timeout: 10000 });
    await this.nextButton.click();
  }

  // ═══════════════════════════════════════════════════════════
  // ⭐ THIS IS THE NEW METHOD ⭐
  // ═══════════════════════════════════════════════════════════
  getRawPage(): Page {
    return this.page;
  }
}