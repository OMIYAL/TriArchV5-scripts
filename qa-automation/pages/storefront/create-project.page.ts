import { Page, Locator, expect } from '@playwright/test';
import { DynamicProjectData, generateDynamicProjectData } from '../../utils/data-generator.helper';

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

  async completeFullFlow(projectData?: DynamicProjectData): Promise<void> {
    const data = projectData || generateDynamicProjectData();
    
    const pName = data.name;
    const pJurisdiction = data.jurisdiction;
    const pStreet = data.streetAddress;
    const pCity = data.city;
    const pState = data.state;
    const pPostal = data.postalCode;
    
    const pOccType = data.occupancyType;
    const pConstType = data.constructionType;
    const pGrossSqFt = data.grossSquareFootage;
    const pHeight = data.height;
    const pFloors = data.numberOfFloors;
    const pSprinkler = data.sprinklerCoverage;

    // ═══════════════════════════════════════════════════════════
    // Step 1: Jurisdiction
    // ═══════════════════════════════════════════════════════════
    await this.jurisdictionCombobox.waitFor({ state: 'visible', timeout: 10000 });
    await this.jurisdictionCombobox.click();
    const select2SearchInput = this.page.locator('input.select2-search__field:visible');
    await select2SearchInput.waitFor({ state: 'visible', timeout: 5000 });
    await select2SearchInput.fill(pJurisdiction);
    const jurisdictionOption = this.page.getByRole('option', { name: pJurisdiction, exact: true });
    await jurisdictionOption.waitFor({ state: 'visible', timeout: 15000 });
    await jurisdictionOption.click();
    await this.clickNext();

    // ═══════════════════════════════════════════════════════════
    // Step 2: Project Name
    // ═══════════════════════════════════════════════════════════
    await this.projectNameInput.fill(pName);
    await this.clickNext();

    // ═══════════════════════════════════════════════════════════
    // Step 3: Address
    // ═══════════════════════════════════════════════════════════
    await this.streetAddressInput.fill(pStreet);
    await this.cityInput.fill(pCity);
    await this.stateInput.fill(pState);
    await this.postalCodeInput.fill(pPostal);
    await this.clickNext();

    // ═══════════════════════════════════════════════════════════
    // Step 4: Building Details
    // ═══════════════════════════════════════════════════════════
    const occOption = this.page.getByRole('option', { name: pOccType, exact: true });
    await this.a1Combobox.click();
    await occOption.waitFor({ state: 'visible', timeout: 5000 });
    await occOption.click();

    const constOption = this.page.getByRole('option', { name: pConstType, exact: true });
    await this.typeIACombobox.click();
    await constOption.waitFor({ state: 'visible', timeout: 5000 });
    await constOption.click();

    if (pGrossSqFt) {
      await this.grossSquareFootageInput.fill(pGrossSqFt);
    } else {
      await this.grossSquareFootageInput.click();
    }

    if (pHeight) {
      await this.heightInput.fill(pHeight);
    } else {
      await this.heightInput.click();
    }

    if (pFloors) {
      await this.numberOfFloorsInput.fill(pFloors);
    } else {
      await this.numberOfFloorsInput.dblclick();
    }

    const sprinklerOption = this.page.getByRole('option', { name: pSprinkler, exact: true });
    await this.basementCombobox.click();
    await sprinklerOption.waitFor({ state: 'visible', timeout: 5000 });
    await sprinklerOption.click();
    
    await this.clickNext();

    // ═══════════════════════════════════════════════════════════
    // Step 5: Contacts
    // ═══════════════════════════════════════════════════════════
    await this.page.waitForTimeout(2000);
    
    await this.addContactButton.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    if (await this.addContactButton.isVisible()) {
      await this.addContactButton.click();
      
      const contactOverlay = this.page.locator('.offcanvas.show, .modal.show, [role="dialog"]:visible').last();
      await contactOverlay.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
      
      const overlayInputs = contactOverlay.locator('input:visible');
      const inputCount = await overlayInputs.count();
      
      for (let i = 0; i < inputCount; i++) {
        await overlayInputs.nth(i).click({ timeout: 2000, force: true }).catch(() => {});
      }

      const overlayCheckboxes = contactOverlay.locator('input[type="checkbox"]:visible');
      const checkboxCount = await overlayCheckboxes.count();
      for (let i = 0; i < checkboxCount; i++) {
        await overlayCheckboxes.nth(i).click({ timeout: 2000, force: true }).catch(() => {});
      }
      
      const closeButton = contactOverlay.locator('.btn-close, [aria-label="Close"], button:has-text("Close")').first();
      await closeButton.click({ timeout: 2000 }).catch(() => {});
      
      // Fallback: press Escape to close the modal if it's still open
      await this.page.keyboard.press('Escape');
      await contactOverlay.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {});
    }
    
    await this.clickNext();

    // ═══════════════════════════════════════════════════════════
    // Step 6: Review
    // ═══════════════════════════════════════════════════════════
    await expect(this.createProjectButton).toBeVisible({ timeout: 10000 });
    
    await this.createProjectButton.click();
  }

  private async clickNext(): Promise<void> {
    await this.nextButton.waitFor({ state: 'visible', timeout: 10000 });
    await this.nextButton.click({ force: true });
  }

  // ═══════════════════════════════════════════════════════════
  // ⭐ THIS IS THE NEW METHOD ⭐
  // ═══════════════════════════════════════════════════════════
  getRawPage(): Page {
    return this.page;
  }
}