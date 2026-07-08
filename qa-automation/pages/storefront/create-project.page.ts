import { Page, Locator } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { DynamicProjectData } from '../../utils/data-generator.helper';
import { getRandomDocumentTitle, getRandomTestPdf } from '../../utils/document.helper';
import { clickSelect2Option, closeSelect2Dropdown, selectFromSelect2Combobox } from '../../utils/select2.helper';

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

  private documentsUploaded = false;
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
    await this.page.waitForURL(/PermitProjects\/Create/i, { timeout: 15000 });
    await this.page.bringToFront();
    await this.page.getByRole('heading', { name: 'Project Details' }).waitFor({ state: 'visible', timeout: 15000 });

    for (let attempt = 0; attempt < 25; attempt++) {
      const step = await this.getActiveStepHeading();

      if (step === 'Project Details') {
        await this.advanceFromProjectDetails(projectData);
        continue;
      }

      if (step === 'Building Characteristics') {
        await this.fillBuildingCharacteristicsStep(projectData);
        await this.clickVisibleWizardNext();
        await this.waitForProjectEnvelopeSaved();
        await this.waitForWizardStep(3, /Project Contacts/i);
        continue;
      }

      if (step === 'Project Contacts') {
        await this.addProjectContact();
        await this.clickVisibleWizardNext();
        await this.waitForWizardStep(4, /Project related documents/i);
        continue;
      }

      if (step === 'Project related documents') {
        await this.uploadProjectDocument();
        await this.clickCreateProject();
        return;
      }

      if (await this.visibleCreateProjectButton().isVisible({ timeout: 1000 }).catch(() => false)) {
        await this.uploadProjectDocument();
        await this.clickCreateProject();
        return;
      }

      await this.page.waitForTimeout(500);
    }

    throw new Error('Project creation wizard did not complete — Create project was never clicked.');
  }

  private async getActiveStepHeading(): Promise<string> {
    const url = this.page.url();
    const stepMatch = url.match(/[?&]step=(\d+)/i);
    const stepMap: Record<string, string> = {
      '1': 'Project Details',
      '2': 'Building Characteristics',
      '3': 'Project Contacts',
      '4': 'Project related documents',
    };
    if (stepMatch?.[1] && stepMap[stepMatch[1]]) {
      return stepMap[stepMatch[1]];
    }

    const heading = this.page.locator('.ta-wizard-step:not(.ta-wizard-step--hidden) h2').first();
    return (await heading.innerText().catch(() => '') ?? '').trim();
  }

  private async waitForWizardStep(stepNumber: number, headingPattern: RegExp, timeout = 25000): Promise<void> {
    const stepUrl = new RegExp(`[?&]step=${stepNumber}(&|$)`);
    const urlReached = await this.page.waitForURL(stepUrl, { timeout }).then(() => true).catch(() => false);
    if (urlReached) return;

    await this.page.getByRole('heading', { name: headingPattern }).waitFor({ state: 'visible', timeout: 8000 });
  }

  private async waitForActiveStep(pattern: RegExp, timeout = 20000): Promise<void> {
    await this.page
      .locator('.ta-wizard-step:not(.ta-wizard-step--hidden)')
      .filter({ has: this.page.getByRole('heading', { name: pattern }) })
      .waitFor({ state: 'visible', timeout });
  }

  private async waitForProjectEnvelopeSaved(timeout = 30000): Promise<void> {
    await this.page.waitForURL(/projectId=/i, { timeout }).catch(() => {
      console.log('Project envelope URL not updated with projectId — continuing.');
    });
    await this.page.waitForTimeout(500);
  }

  private getCurrentWizardStep(): string {
    return this.page.url().match(/[?&]step=(\d+)/i)?.[1] ?? '1';
  }

  private visibleWizardNextButton(): Locator {
    const step = this.getCurrentWizardStep();
    return this.page.locator(`button[data-wizard-action="step-${step}"]:not(.d-none)`);
  }

  private async clickWizardNextForStep(step: string): Promise<void> {
    await closeSelect2Dropdown(this.page);

    const urlBefore = this.page.url();
    const next = this.page.locator(`button[data-wizard-action="step-${step}"]:not(.d-none)`);
    await next.waitFor({ state: 'visible', timeout: 10000 });
    await next.scrollIntoViewIfNeeded();
    await this.page.waitForTimeout(300);
    await next.click();

    await this.page
      .waitForURL((url) => url.href !== urlBefore || /[?&]step=\d+/.test(url.href), { timeout: 15000 })
      .catch(() => {});
    await this.page.waitForTimeout(1000);
  }

  private async clickVisibleWizardNext(): Promise<void> {
    await this.clickWizardNextForStep(this.getCurrentWizardStep());
  }

  private visibleCreateProjectButton(): Locator {
    return this.page.getByRole('button', { name: /Create project/i });
  }

  private async clickCreateProject(): Promise<void> {
    await this.closeOpenOffcanvasPanels();

    const createBtn = this.visibleCreateProjectButton();
    await createBtn.waitFor({ state: 'visible', timeout: 15000 });
    await createBtn.scrollIntoViewIfNeeded();

    const urlBefore = this.page.url();
    console.log(`Clicking Create project button (current URL: ${urlBefore}).`);

    await createBtn.click({ force: true });

    await this.page.waitForURL(
      (url) => url.href !== urlBefore && /services\/Apply|PermitProjects/i.test(url.href),
      { timeout: 60000 },
    );

    console.log(`Create project completed — landed on ${this.page.url()}`);
    await this.page.waitForTimeout(1000);
  }

  private async closeOpenOffcanvasPanels(): Promise<void> {
    const openPanels = this.page.locator('#UploadDocumentPanel.show, #AddContactPanel.show, .offcanvas.show');
    if (!await openPanels.first().isVisible({ timeout: 300 }).catch(() => false)) return;

    await this.page.keyboard.press('Escape').catch(() => {});
    await this.page.waitForTimeout(400);

    const cancel = openPanels.getByRole('button', { name: 'Cancel' }).first();
    if (await cancel.isVisible({ timeout: 500 }).catch(() => false)) {
      await cancel.click({ force: true }).catch(() => {});
    }
  }

  private async advanceFromProjectDetails(data: DynamicProjectData): Promise<void> {
    for (let retry = 0; retry < 4; retry++) {
      if (!/PermitProjects\/Create/i.test(this.page.url())) {
        const onStep2 = await this.page.getByRole('heading', { name: /Building Characteristics/i }).isVisible({ timeout: 1000 }).catch(() => false);
        if (onStep2) return;
        throw new Error(`Project create popup navigated away unexpectedly: ${this.page.url()}`);
      }

      if ((await this.getActiveStepHeading()) !== 'Project Details') {
        return;
      }

      await this.fillProjectDetailsStep(data);
      await closeSelect2Dropdown(this.page);
      await this.page.waitForTimeout(400);

      const jurisdictionValue = await this.page.locator('#JurisdictionIdSelect').inputValue().catch(() => '');
      if (!jurisdictionValue) {
        await this.selectJurisdiction(data);
      } else {
        await this.syncJurisdictionToData(data);
      }

      await closeSelect2Dropdown(this.page);
      await this.clickWizardNextForStep('1');

      const advanced = await this.page.waitForURL(/[?&]step=2(&|$)/, { timeout: 12000 }).then(() => true).catch(() => false)
        || await this.page.getByRole('heading', { name: /Building Characteristics/i }).isVisible({ timeout: 2000 }).catch(() => false);

      if (advanced) return;

      const errors = await this.page.locator('.field-validation-error:visible, .text-danger:visible').allTextContents().catch(() => []);
      console.log(`Project Details did not advance to step 2 (retry ${retry + 1}/4). Validation: ${errors.join(' | ') || 'none'}`);
    }

    await this.waitForWizardStep(2, /Building Characteristics/i);
  }

  private async fillProjectDetailsStep(data: DynamicProjectData): Promise<void> {
    await this.projectNameInput.fill(data.name);
    await this.streetAddressInput.fill(data.streetAddress);
    await this.cityInput.fill(data.city);
    await this.stateInput.fill(data.state);
    await this.postalCodeInput.fill(data.postalCode);

    const parcelInput = this.page.getByRole('textbox', { name: /Parcel Number/i });
    if (await parcelInput.isVisible({ timeout: 500 }).catch(() => false)) {
      const parcelValue = (await parcelInput.inputValue().catch(() => '') ?? '').trim();
      if (!parcelValue) {
        await parcelInput.fill(faker.string.numeric(10));
      }
    }

    await this.selectJurisdiction(data);
    await this.page.waitForTimeout(400);
  }

  private async syncJurisdictionToData(data: DynamicProjectData): Promise<void> {
    const label = await this.getJurisdictionLabel();
    if (label.length > 2 && !/search jurisdiction/i.test(label)) {
      data.jurisdiction = label;
    }
  }

  private async fillBuildingCharacteristicsStep(data: DynamicProjectData): Promise<void> {
    await this.selectLabeledCombobox(/Occupancy Type/i, data.occupancyType);
    await this.selectLabeledCombobox(/Construction Type/i, data.constructionType);
    await this.selectLabeledCombobox(/Sprinkler Coverage/i, data.sprinklerCoverage);

    if (await this.grossSquareFootageInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await this.grossSquareFootageInput.fill(data.grossSquareFootage);
    }
    if (await this.heightInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await this.heightInput.fill(data.height);
    }
    if (await this.numberOfFloorsInput.isVisible({ timeout: 1000 }).catch(() => false)) {
      await this.numberOfFloorsInput.fill(data.numberOfFloors);
    }
  }

  private async getJurisdictionLabel(): Promise<string> {
    return (await this.page.locator('#select2-JurisdictionIdSelect-container').innerText().catch(() => '') ?? '').trim();
  }

  private async selectJurisdiction(data: DynamicProjectData): Promise<void> {
    const selectedValue = await this.page.locator('#JurisdictionIdSelect').inputValue().catch(() => '');
    if (selectedValue) {
      await this.syncJurisdictionToData(data);
      console.log(`Jurisdiction already set (id=${selectedValue}, label="${data.jurisdiction}").`);
      return;
    }

    const current = await this.getJurisdictionLabel();
    if (current.length > 2 && !/search jurisdiction/i.test(current)) {
      data.jurisdiction = current;
      console.log(`Jurisdiction already selected: "${current}"`);
      return;
    }

    console.log('Selecting first available jurisdiction from Select2 dropdown.');
    await closeSelect2Dropdown(this.page);
    await this.jurisdictionCombobox.scrollIntoViewIfNeeded();
    await this.jurisdictionCombobox.click({ force: true });

    const options = this.page.locator(
      '.select2-container--open [role="option"]:not([aria-disabled="true"]):not(.loading-results)',
    );
    await options.first().waitFor({ state: 'visible', timeout: 12000 });
    const optionText = (await options.first().innerText().catch(() => '') ?? '').trim();
    await options.first().click();

    await this.page.waitForFunction(() => {
      const el = document.querySelector('#JurisdictionIdSelect') as HTMLSelectElement | null;
      return !!el?.value;
    }, { timeout: 10000 });

    await closeSelect2Dropdown(this.page);

    const finalValue = await this.page.locator('#JurisdictionIdSelect').inputValue().catch(() => '');
    if (!finalValue) {
      throw new Error('Jurisdiction was not selected — hidden select value is still empty.');
    }

    data.jurisdiction = optionText || (await this.getJurisdictionLabel()) || data.jurisdiction;
    console.log(`Jurisdiction selected: "${data.jurisdiction}"`);
  }

  private async selectLabeledCombobox(labelPattern: RegExp, preferredValue?: string): Promise<void> {
    const combobox = this.page.getByRole('combobox', { name: labelPattern }).first();
    if (!await combobox.isVisible({ timeout: 2000 }).catch(() => false)) return;

    const currentText = (await combobox.innerText().catch(() => '') ?? '').trim();
    if (currentText && !/select|choose/i.test(currentText)) return;

    await combobox.click({ force: true });
    const preferred = preferredValue ? new RegExp(preferredValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') : undefined;
    await clickSelect2Option(this.page, preferred, 10000);
    await closeSelect2Dropdown(this.page);
  }

  private async addProjectContact(): Promise<void> {
    if (this.contactAdded) return;

    const addContact = this.page.locator('#AddContactButton');
    if (!await addContact.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('Add contact button not visible — project envelope may not be saved yet.');
      return;
    }

    const alreadyAttached = await this.page.getByText(/[1-9]\d* attached/i).isVisible({ timeout: 1000 }).catch(() => false);
    if (alreadyAttached) {
      this.contactAdded = true;
      console.log('Project already has a contact attached — skipping add contact.');
      return;
    }

    try {
      console.log('Opening Add contact offcanvas on Project Contacts step.');
      await addContact.scrollIntoViewIfNeeded();
      await addContact.click({ force: true });

      const contactPanel = this.page.locator('#AddContactPanel.show, #AddContactPanel.offcanvas.show').last();
      await contactPanel.waitFor({ state: 'visible', timeout: 10000 });

      await contactPanel.locator('#Input_FullName').fill(faker.person.fullName());
      await contactPanel.locator('#Input_Organisation').fill(faker.company.name());
      await contactPanel.locator('#Input_Email').fill(faker.internet.email());
      await contactPanel.locator('#Input_Phone').fill(faker.string.numeric(10));

      const saveContactButton = contactPanel
        .locator('button.btn-primary')
        .filter({ hasText: /Add contact/i })
        .last();
      await saveContactButton.waitFor({ state: 'visible', timeout: 8000 });
      await saveContactButton.click({ force: true });

      await contactPanel.waitFor({ state: 'hidden', timeout: 15000 }).catch(async () => {
        await this.page.keyboard.press('Escape').catch(() => {});
      });

      await this.page.getByText(/1 attached/i).waitFor({ state: 'visible', timeout: 10000 }).catch(() => {
        console.log('Contact save completed but attached count not confirmed.');
      });

      this.contactAdded = true;
      console.log('Project contact added successfully.');
    } catch (err) {
      console.log(`Contact offcanvas handling failed: ${err}`);
      await this.page.keyboard.press('Escape').catch(() => {});
    }
  }

  private async uploadProjectDocument(): Promise<void> {
    if (this.documentsUploaded) return;

    const addDocBtn = this.page.locator('#AddDocumentButton');
    console.log('Waiting for Add document button on project wizard step 4...');
    await addDocBtn.waitFor({ state: 'visible', timeout: 15000 });
    await addDocBtn.scrollIntoViewIfNeeded();
    console.log('Clicking Add document button.');
    await addDocBtn.click({ force: true });

    const panel = this.page.locator('#UploadDocumentPanel');
    await panel.waitFor({ state: 'visible', timeout: 8000 });
    await panel.locator('#UploadDoc_FileInput').waitFor({ state: 'attached', timeout: 5000 });

    const pdfPath = getRandomTestPdf();
    const title = getRandomDocumentTitle();
    console.log(`Uploading "${pdfPath}" with title "${title}".`);

    const titleChip = panel.getByRole('button', { name: title, exact: true });
    if (await titleChip.isVisible({ timeout: 1500 }).catch(() => false)) {
      await titleChip.click({ force: true });
    } else {
      const planSet = panel.getByRole('button', { name: 'Plan Set', exact: true });
      if (await planSet.isVisible({ timeout: 1000 }).catch(() => false)) {
        await planSet.click({ force: true });
      } else {
        await panel.locator('#UploadDoc_Title').fill(title);
      }
    }

    await panel.locator('#UploadDoc_FileInput').setInputFiles(pdfPath);
    await this.page.waitForTimeout(600);

    const submitBtn = panel.locator('#UploadDoc_SubmitButton');
    await submitBtn.scrollIntoViewIfNeeded();
    console.log('Clicking Add document save button (#UploadDoc_SubmitButton).');
    await submitBtn.click({ force: true });

    await this.page.getByText(/[1-9]\d* attached/i).waitFor({ state: 'visible', timeout: 12000 }).catch(() => {
      console.log('Document attach count not updated — continuing.');
    });
    await this.page.keyboard.press('Escape').catch(() => {});

    this.documentsUploaded = true;
    console.log('Project document upload step completed.');
  }

  getRawPage(): Page {
    return this.page;
  }
}
