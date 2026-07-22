import { Page, Locator } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { DynamicProjectData } from '../../utils/data-generator.helper';
import { getRandomDocumentTitle, getRandomTestPdf } from '../../utils/document.helper';
import {
  clickSelect2Option,
  closeSelect2Dropdown,
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
  private createdProjectId = '';

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
    await this.advanceFromBuildingCharacteristics();
    this.captureProjectIdFromUrl();

    // Step 3: Project Contacts
    await this.waitForWizardStep(3, /Project Contacts/i);
    await this.addProjectContact();
    await this.advanceFromProjectContacts();

    // Step 4: Documents
    await this.waitForWizardStep(4, /Project related documents/i);
    
    await this.clickCreateProject();
  }

  private async waitForWizardStep(stepNumber: number, headingPattern: RegExp, timeout = 25000): Promise<void> {
    const stepUrl = new RegExp(`[?&]step=${stepNumber}(&|$)`);
    const urlReached = await this.page.waitForURL(stepUrl, { timeout }).then(() => true).catch(() => false);
    if (urlReached) return;

    const panelVisible = await this.page
      .locator(`[data-wizard-step="${stepNumber}"]:not(.ta-wizard-step--hidden)`)
      .waitFor({ state: 'visible', timeout: 5000 })
      .then(() => true)
      .catch(() => false);
    if (panelVisible) return;

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

  /** Next from Project Details is gated by wizard JS (`tt()`): required fields + JurisdictionIdSelect.val(). */
  private async advanceFromProjectDetails(): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      // Ensure jurisdiction native value is set before Next — display text alone is not enough.
      if (!(await this.isJurisdictionSelected())) {
        console.log('Jurisdiction native value missing before Next — opening dropdown to pick one.');
        await this.pickRandomJurisdictionFromDropdown();
      }

      await this.clickNext();

      const leftDetails = await this.page
        .waitForFunction(() => {
          const details = document.querySelector('[data-wizard-step="1"]');
          const step2 = document.querySelector('[data-wizard-step="2"]');
          const detailsHidden = !details || details.classList.contains('ta-wizard-step--hidden');
          const step2Visible = !!step2 && !step2.classList.contains('ta-wizard-step--hidden');
          const urlStep2 = /[?&]step=2(&|$)/.test(location.search);
          return urlStep2 || (detailsHidden && step2Visible);
        }, { timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      if (leftDetails) return;

      // Mimik sometimes swallows the Playwright click — fire the visible wizard Next directly.
      await this.page.evaluate(() => {
        const btn = document.querySelector(
          'button[data-wizard-nav="next-js"]:not(.d-none)',
        ) as HTMLButtonElement | null;
        btn?.click();
      });
      const leftAfterNative = await this.page
        .waitForFunction(() => {
          const details = document.querySelector('[data-wizard-step="1"]');
          return !details || details.classList.contains('ta-wizard-step--hidden') || /[?&]step=2(&|$)/.test(location.search);
        }, { timeout: 8000 })
        .then(() => true)
        .catch(() => false);
      if (leftAfterNative) return;

      const stillOnDetails = await this.page
        .locator('[data-wizard-step="1"]:not(.ta-wizard-step--hidden)')
        .isVisible({ timeout: 1000 })
        .catch(() => false);
      if (!stillOnDetails) return;

      const snapshot = await this.projectDetailsFieldSnapshot();
      console.log(
        `Project Details did not advance (attempt ${attempt + 1}/3). Fields: ${snapshot}. Re-picking jurisdiction…`,
      );
      await this.pickRandomJurisdictionFromDropdown();
      await this.page.waitForTimeout(500);
    }

    const snapshot = await this.projectDetailsFieldSnapshot();
    throw new Error(
      `Could not leave Project Details after 3 Next attempts. ` +
        `URL: ${this.page.url()}. Fields: ${snapshot}`,
    );
  }

  private async projectDetailsFieldSnapshot(): Promise<string> {
    return this.page
      .evaluate(() => {
        const val = (sel: string) => {
          const el = document.querySelector(sel) as HTMLInputElement | HTMLSelectElement | null;
          return (el?.value || '').trim() || '(empty)';
        };
        return [
          `name=${val('#PermitProject_ProjectName')}`,
          `street=${val('#PermitProject_StreetAddressLine1')}`,
          `city=${val('#PermitProject_CityOrMunicipality')}`,
          `state=${val('#PermitProject_StateOrProvince')}`,
          `postal=${val('#PermitProject_PostalCode')}`,
          `jurisdiction=${val('#JurisdictionIdSelect')}`,
        ].join(' | ');
      })
      .catch(() => '(snapshot failed)');
  }

  private async collectValidationMessages(): Promise<string> {
    return this.page
      .evaluate(() => {
        const nodes = Array.from(
          document.querySelectorAll(
            '.field-validation-error:not(:empty), .validation-summary-errors li, span.text-danger:not(:empty)',
          ),
        );
        return nodes
          .map((n) => (n.textContent || '').trim())
          .filter((t) => t && t.length < 120)
          .slice(0, 12)
          .join(' | ');
      })
      .catch(() => '');
  }

  /** Step-2 Next is type=submit — full post that must return projectId before step 3. */
  private async advanceFromBuildingCharacteristics(): Promise<void> {
    const tenant = process.env.TENANT_NAME || '';

    for (let attempt = 0; attempt < 3; attempt++) {
      if (tenant) {
        await this.page.evaluate((t) => {
          const u = new URL(location.href);
          if (!u.searchParams.has('__tenant')) {
            u.searchParams.set('__tenant', t);
            history.replaceState(history.state, '', u.pathname + u.search);
          }
        }, tenant);
      }

      // Re-assert jurisdiction — step-2 submit re-runs the same required-field gate.
      if (!(await this.isJurisdictionSelected())) {
        await this.pickRandomJurisdictionFromDropdown();
      }

      const snapshot = await this.page.evaluate(() => {
        const v = (sel: string) =>
          String((document.querySelector(sel) as HTMLInputElement | HTMLSelectElement | null)?.value || '').trim();
        return {
          jurisdiction: v('#JurisdictionIdSelect'),
          name: v('#PermitProject_ProjectName'),
          gross: v('#PermitProject_GrossSquareFootage'),
          height: v('#PermitProject_Height'),
          floors: v('#PermitProject_NumberOfFloors'),
          occupancy: v('#PermitProject_OccupancyType'),
          construction: v('#PermitProject_ConstructionType'),
          sprinkler: v('#PermitProject_SprinklerCoverage'),
        };
      });
      console.log(`Step-2 submit attempt ${attempt + 1}/3 fields:`, snapshot);

      const navigated = this.page
        .waitForURL(/projectId=|[?&]step=3(&|$)/i, { timeout: 45000 })
        .then(() => true)
        .catch(() => false);

      await this.page.evaluate(() => {
        const form = document.querySelector('#PermitProjectCreateForm') as HTMLFormElement | null;
        const btn = document.querySelector(
          'button[type="submit"][data-wizard-action="step-2"]:not(.d-none)',
        ) as HTMLButtonElement | null;
        if (form && btn) {
          form.requestSubmit(btn);
          return;
        }
        btn?.click();
      });

      if (await navigated) return;

      console.log(`Building Characteristics submit did not advance (attempt ${attempt + 1}/3). URL: ${this.page.url()}`);
      // Re-enable buttons if the wizard left them in a busy/disabled state.
      await this.page.evaluate(() => {
        document.querySelectorAll('button[disabled]').forEach((b) => b.removeAttribute('disabled'));
      });
      await this.page.waitForTimeout(1000);
    }

    await this.waitForProjectEnvelopeSaved(10000);
  }

  private async waitForProjectEnvelopeSaved(timeout = 30000): Promise<void> {
    await this.page.waitForURL(/projectId=/i, { timeout }).catch(() => {
      console.log('Project envelope URL not updated with projectId — continuing.');
    });
    await this.page.waitForTimeout(500);
  }

  private async clickNext(): Promise<void> {
    await closeSelect2Dropdown(this.page);
    // Step 1/3 use data-wizard-nav="next-js"; step 2 uses type=submit — match any visible Next.
    const next = this.page
      .getByRole('button', { name: 'Next', exact: true })
      .and(this.page.locator(':visible'))
      .last();
    await next.waitFor({ state: 'visible', timeout: 15000 });
    await next.scrollIntoViewIfNeeded();
    await this.page.waitForTimeout(300);
    await guideClick(this.page, next, { force: true });
    await this.page.waitForTimeout(1500);
  }

  private captureProjectIdFromUrl(): void {
    const id = new URL(this.page.url()).searchParams.get('projectId') || '';
    if (id) {
      this.createdProjectId = id;
      console.log(`Captured projectId=${id}`);
    }
  }

  getCreatedProjectId(): string {
    return this.createdProjectId;
  }

  private async clickCreateProject(): Promise<void> {
    this.captureProjectIdFromUrl();
    const projectId = this.createdProjectId;
    const tenant = process.env.TENANT_NAME || '';

    const createBtn = this.page.getByRole('button', { name: /Create project/i });
    await createBtn.waitFor({ state: 'visible', timeout: 15000 });
    await createBtn.scrollIntoViewIfNeeded();
    await guideClick(this.page, createBtn);

    await this.page.waitForURL(
      (url) => /services\/Apply|PermitProjects/i.test(url.href),
      { timeout: 60000 },
    );

    // Server returnUrl sometimes omits projectId — put it back so Apply binds the project.
    if (projectId && /services\/Apply/i.test(this.page.url()) && !/projectId=/i.test(this.page.url())) {
      const next = new URL(this.page.url());
      next.searchParams.set('projectId', projectId);
      if (tenant && !next.searchParams.has('__tenant')) {
        next.searchParams.set('__tenant', tenant);
      }
      console.log(`Apply URL missing projectId — navigating with projectId=${projectId}`);
      await this.page.goto(next.href, { waitUntil: 'domcontentloaded', timeout: 60000 });
    }

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
    await this.page.locator('#JurisdictionIdSelect').waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});

    if (await this.isJurisdictionSelected()) {
      data.jurisdiction = (await this.jurisdictionDisplayText()) || data.jurisdiction;
      return;
    }

    const picked = await this.pickRandomJurisdictionFromDropdown();
    if (!picked) {
      throw new Error('Failed to select a jurisdiction — dropdown never showed selectable options.');
    }
    data.jurisdiction = picked;
  }

  private async isJurisdictionSelected(): Promise<boolean> {
    const nativeValue = await this.page.locator('#JurisdictionIdSelect').inputValue().catch(() => '');
    return Boolean(nativeValue?.trim());
  }

  private async jurisdictionDisplayText(): Promise<string> {
    const fromCombobox = (await this.jurisdictionCombobox.innerText().catch(() => '') ?? '')
      .replace(/^[×x]\s*/i, '')
      .trim();
    if (fromCombobox && !/search jurisdiction|select|choose/i.test(fromCombobox)) {
      return fromCombobox;
    }
    return this.page
      .locator('#select2-JurisdictionIdSelect-container')
      .innerText()
      .then((t) => t.replace(/^[×x]\s*/i, '').trim())
      .catch(() => '');
  }

  /**
   * Pick a random jurisdiction via the same AJAX lookup the dropdown uses,
   * then set the native <select> value (required by the wizard Next/submit gates).
   */
  private async pickRandomJurisdictionFromDropdown(): Promise<string | null> {
    const picked = await this.page.evaluate(async () => {
      const select = document.querySelector('#JurisdictionIdSelect') as HTMLSelectElement | null;
      if (!select) return null;

      const lookup = new URL(location.href);
      lookup.searchParams.set('handler', 'JurisdictionLookup');
      lookup.searchParams.set('term', 'a');

      const resp = await fetch(lookup.href, {
        headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!resp.ok) return null;

      const payload = (await resp.json()) as { results?: Array<{ id: string; text: string }> };
      const results = payload.results?.filter((r) => r?.id) ?? [];
      if (results.length === 0) return null;

      const item = results[Math.floor(Math.random() * results.length)];
      select.innerHTML = '';
      select.appendChild(new Option(item.text || item.id, item.id, true, true));

      const w = window as unknown as {
        jQuery?: (e: Element) => {
          val: (v: string) => { trigger: (ev: string | object) => void };
          trigger: (ev: object) => void;
        };
      };
      if (w.jQuery) {
        w.jQuery(select).val(item.id).trigger('change');
        w.jQuery(select).trigger({
          type: 'select2:select',
          params: { data: { id: item.id, text: item.text || item.id } },
        });
      } else {
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      return item.text || item.id;
    }).catch(() => null);

    if (!picked) return null;

    const valueSet = await this.page
      .waitForFunction(() => {
        const el = document.querySelector('#JurisdictionIdSelect') as HTMLSelectElement | null;
        return Boolean(el?.value?.trim());
      }, { timeout: 8000 })
      .then(() => true)
      .catch(() => false);

    if (!valueSet) return null;
    console.log(`Jurisdiction selected at random: ${picked}`);
    return picked;
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

  private async advanceFromProjectContacts(): Promise<void> {
    // Close any leftover offcanvas so it doesn't block Next.
    await this.page.keyboard.press('Escape').catch(() => {});
    await closeSelect2Dropdown(this.page);
    await this.page.waitForTimeout(400);

    for (let attempt = 0; attempt < 3; attempt++) {
      await this.clickNext();

      const advanced = await this.page
        .waitForURL(/[?&]step=4(&|$)/i, { timeout: 10000 })
        .then(() => true)
        .catch(() => false);
      if (advanced) return;

      const step4Visible = await this.page
        .locator('[data-wizard-step="4"]:not(.ta-wizard-step--hidden)')
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      if (step4Visible) return;

      await this.page.evaluate(() => {
        const btn = document.querySelector(
          'button[data-wizard-nav="next-js"][data-wizard-action="step-3"]:not(.d-none)',
        ) as HTMLButtonElement | null;
        btn?.click();
      });
      await this.page.waitForTimeout(1500);

      if (/[?&]step=4(&|$)/i.test(this.page.url())) return;
    }
  }

  /** Role * is required on Add contact — `#AddContact_Role` is a LeptonX-synced form-select (often hidden). */
  private async selectContactRole(contactPanel: Locator): Promise<void> {
    const preferredText = /owner|applicant|architect|engineer|contractor/i;

    // Fast path: set the native select value in-DOM (visible UI is often a LeptonX wrapper).
    const picked = await this.page.evaluate(({ preferred }) => {
      const el = document.querySelector(
        '#AddContact_Role, select[name="Input.Role"], select[name*="Role"]',
      ) as HTMLSelectElement | null;
      if (!el) return null;

      const options = Array.from(el.options)
        .map((o) => ({ value: o.value, text: (o.textContent || '').trim() }))
        .filter((o) => o.value && !/select/i.test(o.text));
      if (!options.length) return null;

      const preferredRe = new RegExp(preferred, 'i');
      const choice = options.find((o) => preferredRe.test(o.text)) ?? options[0];
      el.value = choice.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));

      // Fire inline onchange (ProjectOwnerHint toggle) if present.
      if (typeof el.onchange === 'function') {
        el.onchange(new Event('change') as unknown as Event);
      }

      const $ = (window as unknown as { jQuery?: (sel: Element) => { trigger: (e: string) => void } }).jQuery;
      if ($) $(el).trigger('change');

      return choice;
    }, { preferred: preferredText.source });

    if (picked) {
      // Sync any visible LeptonX / custom label text if present.
      await contactPanel
        .locator('.form-select, [role="combobox"], .lpx-select')
        .filter({ hasText: /Select Role|Role/i })
        .first()
        .evaluate((node, text) => {
          if (node instanceof HTMLElement && /select role/i.test(node.innerText || '')) {
            node.innerText = text;
          }
        }, picked.text)
        .catch(() => {});

      console.log(`Contact Role selected: ${picked.text} (value=${picked.value})`);
      return;
    }

    // Visible UI fallback (select2 / custom dropdown).
    const roleCombobox = contactPanel
      .getByRole('combobox', { name: /Role|Select Role/i })
      .or(contactPanel.getByText(/^Select Role$/i))
      .first();

    if (await roleCombobox.isVisible({ timeout: 3000 }).catch(() => false)) {
      await guideClick(this.page, roleCombobox);
      const option = this.page
        .locator('[role="option"]:visible, .dropdown-item:visible, .select2-results__option:visible')
        .filter({ hasNotText: /select|loading/i })
        .first();
      if (await option.isVisible({ timeout: 5000 }).catch(() => false)) {
        const label = (await option.innerText().catch(() => '') ?? '').trim();
        await guideClick(this.page, option);
        console.log(`Contact Role selected (menu): ${label}`);
        return;
      }
      await clickSelect2Option(this.page, preferredText, 8000).catch(() => false);
      await closeSelect2Dropdown(this.page);
      return;
    }

    throw new Error('Could not select mandatory Contact Role on Add contact panel.');
  }

  private async addProjectContact(): Promise<void> {
    if (this.contactAdded) return;

    // Prefer the visible "+ Add contact" control — #AddContactButton may be hidden/stale.
    const addContact = this.page
      .getByRole('button', { name: /Add contact/i })
      .or(this.page.getByRole('link', { name: /Add contact/i }))
      .or(this.page.locator('#AddContactButton'))
      .and(this.page.locator(':visible'))
      .first();

    if (!await addContact.isVisible({ timeout: 5000 }).catch(() => false)) return;

    const alreadyAttached = await this.page.getByText(/[1-9]\d* attached/i).isVisible({ timeout: 1000 }).catch(() => false);
    if (alreadyAttached) {
      this.contactAdded = true;
      return;
    }

    // Panel may be offcanvas or modal; wait for Role UI rather than a single id.
    const panelReady = () =>
      this.page
        .locator('#AddContactPanel.show, .offcanvas.show, .modal.show')
        .filter({ hasText: /Add contact|Select Role|Role/i })
        .or(this.page.getByRole('heading', { name: /Add contact to project/i }))
        .or(this.page.getByText(/^Select Role$/i))
        .first();

    try {
      let opened = false;
      for (let openAttempt = 0; openAttempt < 3; openAttempt++) {
        await addContact.scrollIntoViewIfNeeded();
        await guideClick(this.page, addContact);

        opened = await panelReady()
          .waitFor({ state: 'visible', timeout: 8000 })
          .then(() => true)
          .catch(() => false);
        if (opened) break;

        await addContact.evaluate((el) => (el as HTMLElement).click()).catch(() => {});
        opened = await panelReady()
          .waitFor({ state: 'visible', timeout: 5000 })
          .then(() => true)
          .catch(() => false);
        if (opened) break;
      }

      if (!opened) {
        console.log('Add contact panel did not open — continuing without contact.');
        return;
      }

      const contactPanel = this.page
        .locator('#AddContactPanel.show, #AddContactPanel, .offcanvas.show, .modal.show')
        .filter({ hasText: /Add contact|Select Role/i })
        .last();

      await this.selectContactRole(contactPanel);

      const fullName = contactPanel.locator('#Input_FullName, input[name*="FullName" i]').first();
      if (await fullName.isVisible({ timeout: 2000 }).catch(() => false)) {
        if (await fullName.isEditable().catch(() => true)) {
          await guideType(this.page, fullName, faker.person.fullName());
        }
      }

      for (const [sel, value] of [
        ['#Input_Organisation, input[name*="Organisation" i], input[name*="Organization" i]', faker.company.name()],
        ['#Input_Email, input[name*="Email" i]', faker.internet.email()],
        ['#Input_Phone, input[name*="Phone" i]', faker.string.numeric(10)],
      ] as const) {
        const field = contactPanel.locator(sel).first();
        if (await field.isEditable().catch(() => false)) {
          await guideType(this.page, field, value);
        }
      }

      const saveContactButton = contactPanel
        .getByRole('button', { name: /^Add contact$/i })
        .or(contactPanel.locator('button.btn-primary').filter({ hasText: /Add contact/i }))
        .last();
      await guideClick(this.page, saveContactButton);

      const stillOpen = await contactPanel.isVisible({ timeout: 2000 }).catch(() => false);
      if (stillOpen) {
        const roleStillEmpty = await contactPanel.getByText(/^Select Role$/i).isVisible().catch(() => false);
        if (roleStillEmpty) {
          throw new Error('Add contact failed: Role is still "Select Role" after save attempt.');
        }
        await this.page.keyboard.press('Escape').catch(() => {});
      }

      await contactPanel.waitFor({ state: 'hidden', timeout: 15000 }).catch(async () => {
        await this.page.keyboard.press('Escape').catch(() => {});
      });
      await this.page.keyboard.press('Escape').catch(() => {});

      this.contactAdded = true;
      console.log('Project contact added.');
    } catch (err) {
      await this.page.keyboard.press('Escape').catch(() => {});
      throw err;
    }
  }


  getRawPage(): Page {
    return this.page;
  }
}
