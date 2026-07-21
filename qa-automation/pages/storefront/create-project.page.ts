import { Page, Locator } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { DynamicProjectData } from '../../utils/data-generator.helper';
import { getRandomDocumentTitle, getRandomTestPdf } from '../../utils/document.helper';
import { clickSelect2Option, closeSelect2Dropdown, selectFromSelect2Combobox } from '../../utils/select2.helper';
import { guideClick, guideType } from '../../utils/mimik-action.helper';

export class CreateProjectPage {
  private readonly page: Page;
  private readonly jurisdictionCombobox: Locator;
  private readonly projectNameInput: Locator;
  private readonly streetAddressInput: Locator;
  private readonly cityInput: Locator;
  private readonly stateInput: Locator;
  private readonly postalCodeInput: Locator;
  private readonly grossSquareFootageInput: Locator;
  private readonly heightInput: Locator;
  private readonly numberOfFloorsInput: Locator;

  private contactAdded = false;

  constructor(page: Page) {
    this.page = page;
    this.jurisdictionCombobox = page.locator('span.select2-selection[aria-labelledby="select2-JurisdictionIdSelect-container"]');
    this.projectNameInput = page.getByRole('textbox', { name: 'Project Name' });
    this.streetAddressInput = page.getByRole('textbox', { name: 'Street Address Line 1' });
    this.cityInput = page.getByRole('textbox', { name: 'City or Municipality' });
    this.stateInput = page.getByRole('textbox', { name: 'State or Province' });
    this.postalCodeInput = page.getByRole('textbox', { name: 'Postal Code' });
    this.grossSquareFootageInput = page.getByRole('textbox', { name: 'Gross Square Footage' });
    this.heightInput = page.getByRole('textbox', { name: 'Height' });
    this.numberOfFloorsInput = page.getByRole('spinbutton', { name: 'Number Of Floors' });
  }

  async completeFullFlow(projectData: DynamicProjectData): Promise<void> {
    await this.page.waitForURL(/PermitProjects\/Create/i, { timeout: 45000 });
    await this.page.bringToFront();

    // Step 1: Project Details
    await this.page.getByRole('heading', { name: 'Project Details' }).waitFor({ state: 'visible', timeout: 45000 });
    await this.fillProjectDetailsStep(projectData);
    await this.clickNext();

    // Step 2: Building Characteristics
    await this.waitForWizardStep(2, /Building Characteristics/i);
    await this.fillBuildingCharacteristicsStep(projectData);
    await this.clickNext();
    await this.waitForProjectEnvelopeSaved();

    // Step 3: Project Contacts
    await this.waitForWizardStep(3, /Project Contacts/i);
    await this.addProjectContact();
    await this.clickNext();

    // Step 4: Documents
    await this.waitForWizardStep(4, /Project related documents/i);
    
    await this.clickCreateProject();
  }

  private async waitForWizardStep(stepNumber: number, headingPattern: RegExp, timeout = 25000): Promise<void> {
    const stepUrl = new RegExp(`[?&]step=${stepNumber}(&|$)`);
    const urlReached = await this.page.waitForURL(stepUrl, { timeout }).then(() => true).catch(() => false);
    if (urlReached) return;

    await this.page.getByRole('heading', { name: headingPattern }).waitFor({ state: 'visible', timeout: 8000 });
  }

  private async waitForProjectEnvelopeSaved(timeout = 30000): Promise<void> {
    await this.page.waitForURL(/projectId=/i, { timeout }).catch(() => {
      console.log('Project envelope URL not updated with projectId — continuing.');
    });
    await this.page.waitForTimeout(500);
  }

  private async clickNext(): Promise<void> {
    await closeSelect2Dropdown(this.page);
    const next = this.page.getByRole('button', { name: 'Next', exact: true }).and(this.page.locator(':visible')).last();
    await next.waitFor({ state: 'visible', timeout: 15000 });
    await next.scrollIntoViewIfNeeded();
    await this.page.waitForTimeout(300);
    await guideClick(this.page, next);
    await this.page.waitForTimeout(1500);
  }

  private async clickCreateProject(): Promise<void> {
    const createBtn = this.page.getByRole('button', { name: /Create project/i });
    await createBtn.waitFor({ state: 'visible', timeout: 15000 });
    await createBtn.scrollIntoViewIfNeeded();
    await guideClick(this.page, createBtn);

    await this.page.waitForURL(
      (url) => /services\/Apply|PermitProjects/i.test(url.href),
      { timeout: 60000 },
    );
    await this.page.waitForTimeout(1000);
  }

  private async fillProjectDetailsStep(data: DynamicProjectData): Promise<void> {
    await this.projectNameInput.waitFor({ state: 'visible', timeout: 45000 });
    await guideType(this.page, this.projectNameInput, data.name);
    await guideType(this.page, this.streetAddressInput, data.streetAddress);
    await guideType(this.page, this.cityInput, data.city);
    await guideType(this.page, this.stateInput, data.state);
    await guideType(this.page, this.postalCodeInput, data.postalCode);

    const parcelInput = this.page.getByRole('textbox', { name: /Parcel Number/i });
    if (await parcelInput.isVisible({ timeout: 500 }).catch(() => false)) {
      await guideType(this.page, parcelInput, faker.string.numeric(10));
    }

    await this.selectJurisdiction(data);
    await this.page.waitForTimeout(400);
  }

  private async fillBuildingCharacteristicsStep(data: DynamicProjectData): Promise<void> {
    await this.selectLabeledCombobox(/Occupancy Type/i, data.occupancyType);
    await this.selectLabeledCombobox(/Construction Type/i, data.constructionType);
    await this.selectLabeledCombobox(/Sprinkler Coverage/i, data.sprinklerCoverage);

    if (await this.grossSquareFootageInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await guideType(this.page, this.grossSquareFootageInput, data.grossSquareFootage);
    }
    if (await this.heightInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await guideType(this.page, this.heightInput, data.height);
    }
    if (await this.numberOfFloorsInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await guideType(this.page, this.numberOfFloorsInput, data.numberOfFloors);
    }
  }

  private async selectJurisdiction(data: DynamicProjectData): Promise<void> {
    const selectedValue = await this.page.locator('#JurisdictionIdSelect').inputValue().catch(() => '');
    if (selectedValue) return;

    // The faker-generated jurisdiction (US state names) does not necessarily match
    // any jurisdiction actually configured for this tenant — searching for
    // "California" etc. reliably returns zero results. Read the real option list
    // straight off the underlying <select> instead of guessing a search term.
    const nativeOptions = await this.page
      .locator('#JurisdictionIdSelect option')
      .evaluateAll((opts) =>
        opts
          .map((o) => ({ value: (o as HTMLOptionElement).value, text: (o.textContent ?? '').trim() }))
          .filter((o) => o.value && !/select|choose/i.test(o.text)),
      )
      .catch(() => [] as Array<{ value: string; text: string }>);

    if (nativeOptions.length > 0) {
      const choice = nativeOptions[0];
      await this.page.locator('#JurisdictionIdSelect').selectOption(choice.value);
      await this.page.waitForFunction(() => {
        const el = document.querySelector('#JurisdictionIdSelect') as HTMLSelectElement | null;
        return !!el?.value;
      }, { timeout: 10000 });
      data.jurisdiction = choice.text || data.jurisdiction;
      return;
    }

    // No pre-rendered <option>s (truly AJAX-backed) — fall back to the select2 UI.
    await closeSelect2Dropdown(this.page);

    let selected = await selectFromSelect2Combobox(this.page, this.jurisdictionCombobox, {
      searchText: data.jurisdiction,
      preferredName: data.jurisdiction,
    });

    if (!selected) {
      // The faked state name may not exist in this tenant — retry with a broad,
      // single-character query likely to match any real jurisdiction name.
      selected = await selectFromSelect2Combobox(this.page, this.jurisdictionCombobox, { searchText: 'a' });
    }

    if (!selected) {
      selected = await selectFromSelect2Combobox(this.page, this.jurisdictionCombobox, {});
    }

    if (!selected) {
      throw new Error(`Jurisdiction dropdown returned no selectable options (searched for "${data.jurisdiction}").`);
    }

    await this.page.waitForFunction(() => {
      const el = document.querySelector('#JurisdictionIdSelect') as HTMLSelectElement | null;
      return !!el?.value;
    }, { timeout: 10000 });

    const optionText = (await this.jurisdictionCombobox.innerText().catch(() => '') ?? '').trim();
    data.jurisdiction = optionText || data.jurisdiction;
  }

  private async selectLabeledCombobox(labelPattern: RegExp, preferredValue?: string): Promise<void> {
    const combobox = this.page.getByRole('combobox', { name: labelPattern }).first();
    if (!await combobox.isVisible({ timeout: 2000 }).catch(() => false)) return;

    const currentText = (await combobox.innerText().catch(() => '') ?? '').trim();
    if (currentText && !/select|choose/i.test(currentText)) return;

    await guideClick(this.page, combobox);
    const preferred = preferredValue ? new RegExp(preferredValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : undefined;
    await clickSelect2Option(this.page, preferred, 10000);
    await closeSelect2Dropdown(this.page);
  }

  private async addProjectContact(): Promise<void> {
    if (this.contactAdded) return;

    const addContact = this.page.locator('#AddContactButton');
    if (!await addContact.isVisible({ timeout: 5000 }).catch(() => false)) return;

    const alreadyAttached = await this.page.getByText(/[1-9]\d* attached/i).isVisible({ timeout: 1000 }).catch(() => false);
    if (alreadyAttached) {
      this.contactAdded = true;
      return;
    }

    try {
      await addContact.scrollIntoViewIfNeeded();
      await guideClick(this.page, addContact);

      const contactPanel = this.page.locator('#AddContactPanel.show, #AddContactPanel.offcanvas.show').last();
      await contactPanel.waitFor({ state: 'visible', timeout: 10000 });

      await guideType(this.page, contactPanel.locator('#Input_FullName'), faker.person.fullName());
      await guideType(this.page, contactPanel.locator('#Input_Organisation'), faker.company.name());
      await guideType(this.page, contactPanel.locator('#Input_Email'), faker.internet.email());
      await guideType(this.page, contactPanel.locator('#Input_Phone'), faker.string.numeric(10));

      const saveContactButton = contactPanel.locator('button.btn-primary').filter({ hasText: /Add contact/i }).last();
      await guideClick(this.page, saveContactButton);

      await contactPanel.waitFor({ state: 'hidden', timeout: 15000 }).catch(async () => {
        await this.page.keyboard.press('Escape').catch(() => { });
      });

      this.contactAdded = true;
    } catch (err) {
      await this.page.keyboard.press('Escape').catch(() => { });
    }
  }


  getRawPage(): Page {
    return this.page;
  }
}
