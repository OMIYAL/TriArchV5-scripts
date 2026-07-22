import { Page, Locator } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { DynamicProjectData } from '../../utils/data-generator.helper';
import { getRandomDocumentTitle, getRandomTestPdf } from '../../utils/document.helper';
import {
  clickSelect2Option,
  closeSelect2Dropdown,
  selectFromSelect2Combobox,
  waitForSelect2Results,
} from '../../utils/select2.helper';
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
    await this.advanceFromProjectDetails();

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

    const headingVisible = await this.page
      .getByRole('heading', { name: headingPattern })
      .waitFor({ state: 'visible', timeout: 8000 })
      .then(() => true)
      .catch(() => false);
    if (headingVisible) return;

    const validation = await this.collectValidationMessages();
    throw new Error(
      `Wizard did not reach step ${stepNumber} (${headingPattern}). ` +
        `URL: ${this.page.url()}. Validation: ${validation || '(none)'}`,
    );
  }

  /** Next from Project Details often stalls when jurisdiction select2 is only half-synced. */
  private async advanceFromProjectDetails(): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      await this.clickNext();

      const reachedStep2 = await this.page
        .waitForURL(/[?&]step=2(&|$)/, { timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (reachedStep2) return;

      const buildingVisible = await this.page
        .getByRole('heading', { name: /Building Characteristics/i })
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      if (buildingVisible) return;

      const stillOnDetails = await this.page
        .getByRole('heading', { name: 'Project Details' })
        .isVisible({ timeout: 1000 })
        .catch(() => false);
      if (!stillOnDetails) return;

      const validation = await this.collectValidationMessages();
      console.log(
        `Project Details did not advance (attempt ${attempt + 1}/3). ` +
          `Validation: ${validation || '(none)'}. Re-selecting jurisdiction…`,
      );
      await this.forceSelectJurisdiction();
      await this.page.waitForTimeout(500);
    }

    const validation = await this.collectValidationMessages();
    throw new Error(
      `Could not leave Project Details after 3 Next attempts. ` +
        `URL: ${this.page.url()}. Validation: ${validation || '(none)'}`,
    );
  }

  private async collectValidationMessages(): Promise<string> {
    return this.page
      .evaluate(() => {
        const nodes = Array.from(
          document.querySelectorAll(
            '.field-validation-error, .input-validation-error, .text-danger, [data-pj-required-message], .validation-summary-errors li',
          ),
        );
        return nodes
          .map((n) => (n.textContent || '').trim())
          .filter(Boolean)
          .slice(0, 12)
          .join(' | ');
      })
      .catch(() => '');
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
    const nativeSelect = this.page.locator('#JurisdictionIdSelect');
    await nativeSelect.waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});

    if (await this.isJurisdictionSelected()) {
      data.jurisdiction =
        (await this.jurisdictionDisplayText()) || data.jurisdiction;
      return;
    }

    await this.forceSelectJurisdiction();
    if (!(await this.isJurisdictionSelected())) {
      throw new Error('Failed to select a jurisdiction — select2 options never loaded.');
    }
    data.jurisdiction =
      (await this.jurisdictionDisplayText()) || data.jurisdiction;
  }

  private async isJurisdictionSelected(): Promise<boolean> {
    const nativeValue = await this.page
      .locator('#JurisdictionIdSelect')
      .inputValue()
      .catch(() => '');
    if (!nativeValue) return false;

    // data-pj-required / select2 UI must also show a real selection, not the placeholder.
    const display = await this.jurisdictionDisplayText();
    return Boolean(display && !/search jurisdiction|select|choose/i.test(display));
  }

  private async jurisdictionDisplayText(): Promise<string> {
    const fromCombobox = (await this.jurisdictionCombobox.innerText().catch(() => '') ?? '')
      .replace(/^[×x]\s*/i, '')
      .trim();
    if (fromCombobox) return fromCombobox;

    return this.page
      .locator('#select2-JurisdictionIdSelect-container')
      .innerText()
      .then((t) => t.replace(/^[×x]\s*/i, '').trim())
      .catch(() => '');
  }

  /**
   * Prefer real select2 UI events (works with Mimik + data-pj-required).
   * Fall back to AJAX lookup + Select2 Option API when the dropdown stays empty.
   */
  private async forceSelectJurisdiction(): Promise<void> {
    // Strategy 1: drive the AJAX select2 UI (type a letter to force results).
    for (const searchText of ['a', 'Al', '']) {
      const picked = await selectFromSelect2Combobox(this.page, this.jurisdictionCombobox, {
        searchText: searchText || undefined,
        skipIfFilled: /search jurisdiction|select|choose/i,
      });
      if (picked && (await this.isJurisdictionSelected())) {
        await closeSelect2Dropdown(this.page);
        return;
      }
      await closeSelect2Dropdown(this.page);
    }

    // Strategy 2: query JurisdictionLookup (preserve __tenant) and inject via Select2 API.
    const injectedText = await this.page
      .evaluate(async () => {
        const el = document.querySelector('#JurisdictionIdSelect') as HTMLSelectElement | null;
        if (!el) return '';

        const lookup = new URL(location.href);
        lookup.searchParams.set('handler', 'JurisdictionLookup');
        lookup.searchParams.set('term', 'a');

        const resp = await fetch(lookup.href, {
          headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
          credentials: 'same-origin',
        });
        if (!resp.ok) return '';

        const payload = (await resp.json()) as { results?: Array<{ id: string; text: string }> };
        const first = payload.results?.[0];
        if (!first?.id) return '';

        // Select2 recommended pattern for AJAX-backed selects.
        const option = new Option(first.text || first.id, first.id, true, true);
        el.innerHTML = '';
        el.appendChild(option);

        const w = window as unknown as {
          jQuery?: (
            e: Element,
          ) => {
            val: (v: string) => { trigger: (ev: string | object) => void };
            trigger: (ev: object) => void;
          };
        };
        if (w.jQuery) {
          w.jQuery(el).val(first.id).trigger('change');
          w.jQuery(el).trigger({
            type: 'select2:select',
            params: { data: { id: first.id, text: first.text || first.id } },
          });
        } else {
          el.dispatchEvent(new Event('change', { bubbles: true }));
        }
        return first.text || first.id;
      })
      .catch(() => '');

    if (injectedText) {
      await this.page.waitForTimeout(400);
      await closeSelect2Dropdown(this.page);
    }

    // Strategy 3: last-chance open + click first visible option.
    if (!(await this.isJurisdictionSelected())) {
      await closeSelect2Dropdown(this.page);
      await this.jurisdictionCombobox.scrollIntoViewIfNeeded();
      await guideClick(this.page, this.jurisdictionCombobox);
      const options = await waitForSelect2Results(this.page, 25000);
      if (await options.first().isVisible({ timeout: 3000 }).catch(() => false)) {
        await options.first().click().catch(() => {});
      }
      await closeSelect2Dropdown(this.page);
    }
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
