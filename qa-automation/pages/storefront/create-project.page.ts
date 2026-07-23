import { Page, Locator } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { DynamicProjectData } from '../../utils/data-generator.helper';
import { clickSelect2Option, closeSelect2Dropdown } from '../../utils/select2.helper';
import { waitForMimikCapture, drainMimikCapture } from '../../utils/mimik.helper';
import { guideClick, guideType } from '../../utils/mimik-action.helper';

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class CreateProjectPage {
  private contactAdded = false;
  private createdProjectId = '';

  private readonly jurisdictionCombobox: Locator;
  private readonly projectNameInput: Locator;
  private readonly streetAddressInput: Locator;
  private readonly cityInput: Locator;
  private readonly stateInput: Locator;
  private readonly postalCodeInput: Locator;
  private readonly grossSquareFootageInput: Locator;
  private readonly heightInput: Locator;
  private readonly numberOfFloorsInput: Locator;

  constructor(private readonly page: Page) {
    this.jurisdictionCombobox = page
      .locator('span.select2-selection[aria-labelledby="select2-JurisdictionIdSelect-container"]')
      .or(page.getByRole('combobox', { name: /jurisdiction/i }))
      .first();
    this.projectNameInput = page.getByRole('textbox', { name: 'Project Name' });
    this.streetAddressInput = page.getByRole('textbox', { name: 'Street Address Line 1' });
    this.cityInput = page.getByRole('textbox', { name: 'City or Municipality' });
    this.stateInput = page.getByRole('textbox', { name: 'State or Province' });
    this.postalCodeInput = page.getByRole('textbox', { name: 'Postal Code' });
    this.grossSquareFootageInput = page.getByRole('textbox', { name: 'Gross Square Footage' });
    this.heightInput = page.getByRole('textbox', { name: 'Height' });
    this.numberOfFloorsInput = page.getByRole('spinbutton', { name: 'Number Of Floors' });
  }

  getRawPage(): Page {
    return this.page;
  }

  getCreatedProjectId(): string {
    return this.createdProjectId;
  }

  async completeFullFlow(projectData: DynamicProjectData): Promise<void> {
    await this.page.waitForURL(/PermitProjects\/Create/i, { timeout: 45000 });
    await this.page.bringToFront();

    await this.page.getByRole('heading', { name: 'Project Details' }).waitFor({ state: 'visible', timeout: 45000 });
    await this.fillProjectDetailsStep(projectData);
    await this.advanceFromProjectDetails();

    await this.waitForWizardStep(2, /Building Characteristics/i);
    await this.fillBuildingCharacteristicsStep(projectData);
    await drainMimikCapture(this.page);
    await this.advanceFromBuildingCharacteristics();
    this.captureProjectIdFromUrl();

    await this.waitForWizardStep(3, /Project Contacts/i);
    await this.addProjectContact();
    await this.advanceByNext(/Project related documents/i);

    await this.waitForWizardStep(4, /Project related documents/i);
    await this.clickCreateProject();
  }

  private async waitForWizardStep(stepNumber: number, heading: RegExp, timeout = 25000): Promise<void> {
    if (await this.page.waitForURL(new RegExp(`[?&]step=${stepNumber}(&|$)`), { timeout }).then(() => true).catch(() => false)) {
      return;
    }
    if (await this.page.locator(`[data-wizard-step="${stepNumber}"]:not(.ta-wizard-step--hidden)`).waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false)) {
      return;
    }
    if (await this.headingVisible(heading, 8000)) return;

    const validation = await this.page
      .locator('.field-validation-error:not(:empty), .validation-summary-errors li, span.text-danger:not(:empty)')
      .allTextContents()
      .then((t) => t.map((s) => s.trim()).filter(Boolean).slice(0, 8).join(' | '))
      .catch(() => '');
    throw new Error(`Wizard did not reach step ${stepNumber} (${heading}). URL: ${this.page.url()}. Validation: ${validation || '(none)'}`);
  }

  private async headingVisible(heading: RegExp, timeout: number): Promise<boolean> {
    return this.page.getByRole('heading', { name: heading }).waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  }

  /** Prefer Playwright Next; fall back to a raw DOM click (Mimik can leave the button inert). */
  private async clickNext(): Promise<void> {
    await closeSelect2Dropdown(this.page);
    const next = this.page.getByRole('button', { name: 'Next', exact: true }).and(this.page.locator(':visible')).last();
    await guideClick(this.page, next, { force: true, noWaitAfter: true });
  }

  /** Real mouse click so Mimik records the step (evaluate clicks are invisible to Mimik). */
  private async clickDomNext(): Promise<void> {
    const next = this.page.getByRole('button', { name: 'Next', exact: true }).and(this.page.locator(':visible')).last();
    const box = await next.boundingBox().catch(() => null);
    if (box) {
      await this.page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await waitForMimikCapture(this.page);
      return;
    }
    await next.click({ force: true, noWaitAfter: true }).catch(() => {});
    await waitForMimikCapture(this.page);
  }

  private async advanceByNext(nextHeading: RegExp, attempts = 3): Promise<void> {
    for (let i = 0; i < attempts; i++) {
      await this.clickNext();
      if (await this.headingVisible(nextHeading, 10000)) return;
      await this.clickDomNext();
      if (await this.headingVisible(nextHeading, 10000)) return;
    }
  }

  private async advanceFromProjectDetails(): Promise<void> {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (!(await this.isJurisdictionSelected())) {
        await this.selectJurisdictionViaLookup();
      }
      await this.clickNext();
      if (await this.headingVisible(/Building Characteristics/i, 12000)) return;
      if (await this.isJurisdictionSelected()) {
        await this.clickDomNext();
        if (await this.headingVisible(/Building Characteristics/i, 12000)) return;
      }
      console.log(`Project Details did not advance (attempt ${attempt + 1}/3). Re-picking jurisdiction…`);
      await this.selectJurisdictionViaLookup();
    }
    throw new Error(`Could not leave Project Details after 3 Next attempts. URL: ${this.page.url()}`);
  }

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

      // Fill empty step-2 Select2s — never touch JurisdictionIdSelect (GUID-only).
      await this.page.evaluate(() => {
        const $ = (window as unknown as { jQuery?: (el: Element) => any }).jQuery;
        document.querySelectorAll('select.select2-hidden-accessible').forEach((node) => {
          const sel = node as HTMLSelectElement;
          if (sel.id === 'JurisdictionIdSelect' || sel.value || sel.options.length < 2) return;
          const opt = Array.from(sel.options).find((o) => o.value && !/select|choose/i.test(o.text));
          if (!opt) return;
          sel.value = opt.value;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          $?.(sel).val(opt.value).trigger('change');
        });
      });

      console.log(`Step-2 submit attempt ${attempt + 1}/3`);
      const navigated = this.page.waitForURL(/projectId=|[?&]step=3(&|$)/i, { timeout: 45000 }).then(() => true).catch(() => false);
      const submitNext = this.page
        .locator('button[type="submit"][data-wizard-action="step-2"]:not(.d-none)')
        .or(this.page.getByRole('button', { name: 'Next', exact: true }).and(this.page.locator(':visible')).last())
        .first();
      await guideClick(this.page, submitNext, { force: true, noWaitAfter: true });
      if (await navigated) return;

      await this.clickDomNext();
      if (await this.page.waitForURL(/projectId=|[?&]step=3(&|$)/i, { timeout: 15000 }).then(() => true).catch(() => false)) {
        return;
      }
      console.log(`Building Characteristics submit did not advance (attempt ${attempt + 1}/3). URL: ${this.page.url()}`);
    }
    await this.page.waitForURL(/projectId=/i, { timeout: 10000 }).catch(() => {
      console.log('Project envelope URL not updated with projectId — continuing.');
    });
  }

  private captureProjectIdFromUrl(): void {
    const id = new URL(this.page.url()).searchParams.get('projectId') || '';
    if (id) {
      this.createdProjectId = id;
      console.log(`Captured projectId=${id}`);
    }
  }

  private async clickCreateProject(): Promise<void> {
    this.captureProjectIdFromUrl();
    const projectId = this.createdProjectId;
    const tenant = process.env.TENANT_NAME || '';

    await closeSelect2Dropdown(this.page);
    const overlay = this.page.locator('#AddContactPanel.show, .offcanvas.show, .modal.show').first();
    if (await overlay.isVisible().catch(() => false)) {
      const closeBtn = overlay.getByRole('button', { name: /Cancel|Close/i }).first();
      if (await closeBtn.isVisible().catch(() => false)) {
        await guideClick(this.page, closeBtn, { force: true }).catch(() => {});
      }
      await overlay.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    }

    const createBtn = this.page.getByRole('button', { name: /Create project/i });
    await createBtn.waitFor({ state: 'visible', timeout: 15000 });
    await guideClick(this.page, createBtn, { force: true, noWaitAfter: true });
    await this.page.waitForURL((url) => /services\/Apply|PermitProjects/i.test(url.href), { timeout: 60000 });

    if (projectId && /services\/Apply/i.test(this.page.url()) && !/projectId=/i.test(this.page.url())) {
      const next = new URL(this.page.url());
      next.searchParams.set('projectId', projectId);
      if (tenant && !next.searchParams.has('__tenant')) next.searchParams.set('__tenant', tenant);
      console.log(`Apply URL missing projectId — navigating with projectId=${projectId}`);
      await this.page.goto(next.href, { waitUntil: 'domcontentloaded' });
    }
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
    await this.ensureJurisdiction(data);
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

  private async ensureJurisdiction(data: DynamicProjectData): Promise<void> {
    await this.page.locator('#JurisdictionIdSelect').waitFor({ state: 'attached', timeout: 15000 }).catch(() => {});
    if (await this.isJurisdictionSelected()) {
      data.jurisdiction = (await this.jurisdictionDisplayText()) || data.jurisdiction;
      return;
    }
    const picked = await this.selectJurisdictionViaLookup();
    if (!picked) throw new Error('Failed to select a jurisdiction.');
    data.jurisdiction = picked;
  }

  private async isJurisdictionSelected(): Promise<boolean> {
    const value = (await this.page.locator('#JurisdictionIdSelect').inputValue().catch(() => '')).trim();
    return GUID.test(value);
  }

  private async jurisdictionDisplayText(): Promise<string> {
    const text = ((await this.jurisdictionCombobox.innerText().catch(() => '')) ?? '')
      .replace(/^[×x]\s*/i, '')
      .trim();
    if (text && !/search jurisdiction|select|choose/i.test(text)) return text;
    return this.page
      .locator('#select2-JurisdictionIdSelect-container')
      .innerText()
      .then((t) => t.replace(/^[×x]\s*/i, '').trim())
      .catch(() => '');
  }

  /**
  private async selectJurisdictionViaLookup(): Promise<string | null> {
    await closeSelect2Dropdown(this.page);
    await this.jurisdictionCombobox.scrollIntoViewIfNeeded().catch(() => {});

    if (await this.jurisdictionCombobox.isVisible().catch(() => false)) {
      await guideClick(this.page, this.jurisdictionCombobox);
      if (!(await this.page.locator('input.select2-search__field:visible').isVisible({ timeout: 1500 }).catch(() => false))) {
        await this.page.evaluate(() => {
          const $ = (window as unknown as { jQuery?: (s: string) => { select2: (c: string) => void } }).jQuery;
          $?.('#JurisdictionIdSelect')?.select2('open');
        });
      }
      const search = this.page.locator('input.select2-search__field:visible');
      if (await search.isVisible({ timeout: 2000 }).catch(() => false)) {
        await search.fill('');
        await search.pressSequentially('Colorado', { delay: 40 });
        await waitForMimikCapture(this.page);
      }
      // Real result click → Mimik records the selection AND Select2 sets the GUID.
      await clickSelect2Option(this.page, /colorado|\bco\b/i, 10000);
      await closeSelect2Dropdown(this.page);
      if (await this.isJurisdictionSelected()) {
        const label = (await this.jurisdictionDisplayText()) || 'Colorado';
        console.log(`Jurisdiction selected via dropdown: ${label}`);
        return label;
      }
    }

    const picked = await this.page.evaluate(async () => {
      const guid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const select = document.querySelector('#JurisdictionIdSelect') as HTMLSelectElement | null;
      if (!select) return null;

      const lookup = new URL(location.href);
      lookup.searchParams.set('handler', 'JurisdictionLookup');
      lookup.searchParams.set('term', 'Colorado');
      const resp = await fetch(lookup.href, {
        headers: { 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' },
        credentials: 'same-origin',
      });
      if (!resp.ok) return null;

      const payload = (await resp.json()) as { results?: Array<{ id: string; text: string }> };
      const results = (payload.results ?? []).filter((r) => r?.id && guid.test(String(r.id)));
      if (!results.length) return null;

      const item =
        results.find((r) => /colorado/i.test(r.text || '')) ??
        results.find((r) => /\bco\b/i.test(r.text || '')) ??
        results[0];

      select.innerHTML = '';
      select.appendChild(new Option(item.text || item.id, item.id, true, true));
      const $ = (window as unknown as { jQuery?: (e: Element) => any }).jQuery;
      if ($) {
        $(select).val(item.id).trigger('change');
        $(select).trigger({ type: 'select2:select', params: { data: { id: item.id, text: item.text || item.id } } });
      } else {
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
      const label = document.querySelector('#select2-JurisdictionIdSelect-container');
      if (label) label.textContent = item.text || item.id;
      return item.text || item.id;
    }).catch(() => null);

    if (!picked || !(await this.isJurisdictionSelected())) return null;
    console.log(`Jurisdiction bound via lookup: ${picked}`);
    return picked;
  }

  private async selectLabeledCombobox(labelPattern: RegExp, preferredValue?: string): Promise<void> {
    const combobox = this.page.getByRole('combobox', { name: labelPattern }).first();
    if (!(await combobox.isVisible({ timeout: 2000 }).catch(() => false))) return;

    const currentText = ((await combobox.innerText().catch(() => '')) ?? '').trim();
    if (currentText && !/select|choose|search/i.test(currentText)) return;

    await guideClick(this.page, combobox);
    if (!(await this.page.locator('.select2-container--open').isVisible({ timeout: 2000 }).catch(() => false))) {
      await combobox.evaluate((el) => (el as HTMLElement).click()).catch(() => {});
    }
    const preferred = preferredValue
      ? new RegExp(preferredValue.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i')
      : undefined;
    await clickSelect2Option(this.page, preferred, 10000);
    await closeSelect2Dropdown(this.page);
  }

  /**
   * Role is required. Prefer a real UI click (Mimik-visible); fall back to setting
   * the often-hidden `#AddContact_Role` select in the DOM.
   */
  private async selectContactRole(contactPanel: Locator): Promise<void> {
    const preferred = /owner|applicant|architect|engineer|contractor/i;

    const roleSelect = contactPanel.locator('#AddContact_Role, select[name="Input.Role"], select[name*="Role"]').first();
    const roleTrigger = contactPanel
      .locator('#AddContact_Role:visible')
      .or(contactPanel.getByText(/^Select Role$/i))
      .or(contactPanel.getByRole('combobox', { name: /Role/i }))
      .and(contactPanel.locator(':visible'))
      .first();

    if (await roleTrigger.isVisible({ timeout: 3000 }).catch(() => false)) {
      await guideClick(this.page, roleTrigger);
      const option = this.page
        .locator('[role="option"]:visible, .dropdown-item:visible, .select2-results__option:visible')
        .filter({ hasNotText: /select role|loading/i })
        .filter({ hasText: preferred })
        .first();
      if (await option.isVisible({ timeout: 3000 }).catch(() => false)) {
        await guideClick(this.page, option);
        await closeSelect2Dropdown(this.page);
      } else if (await roleSelect.count()) {
        const labels = await roleSelect.locator('option').allTextContents().catch(() => [] as string[]);
        const label =
          labels.find((t) => preferred.test(t.trim()) && !/select/i.test(t)) ??
          labels.find((t) => t.trim() && !/select/i.test(t));
        if (label) await roleSelect.selectOption({ label: label.trim() }).catch(() => {});
      }
      if (await this.contactRoleValue()) {
        console.log(`Contact Role selected (UI): ${await this.contactRoleValue()}`);
        return;
      }
    }

    const picked = await this.page.evaluate((preferredSource) => {
      const el = document.querySelector(
        '#AddContact_Role, select[name="Input.Role"], select[name*="Role"]',
      ) as HTMLSelectElement | null;
      if (!el) return null;

      const options = Array.from(el.options)
        .map((o) => ({ value: o.value, text: (o.textContent || '').trim() }))
        .filter((o) => o.value && !/select/i.test(o.text));
      if (!options.length) return null;

      const re = new RegExp(preferredSource, 'i');
      const choice = options.find((o) => re.test(o.text)) ?? options[0];
      el.value = choice.value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      if (typeof el.onchange === 'function') {
        el.onchange(new Event('change') as unknown as Event);
      }
      const $ = (window as unknown as { jQuery?: (s: Element) => { trigger: (e: string) => void } }).jQuery;
      $?.(el).trigger('change');
      return choice;
    }, preferred.source);

    if (!picked) throw new Error('Could not select mandatory Contact Role on Add contact panel.');
    await waitForMimikCapture(this.page);
    console.log(`Contact Role selected: ${picked.text} (value=${picked.value})`);
  }

  private async contactRoleValue(): Promise<string> {
    return this.page.evaluate(() => {
      const el = document.querySelector(
        '#AddContact_Role, select[name="Input.Role"], select[name*="Role"]',
      ) as HTMLSelectElement | null;
      return (el?.value || '').trim();
    });
  }

  private async addProjectContact(): Promise<void> {
    if (this.contactAdded) return;

    const addContact = this.page
      .getByRole('button', { name: /Add contact/i })
      .or(this.page.getByRole('link', { name: /Add contact/i }))
      .or(this.page.locator('#AddContactButton'))
      .and(this.page.locator(':visible'))
      .first();
    if (!(await addContact.isVisible({ timeout: 5000 }).catch(() => false))) return;

    if (await this.page.getByText(/[1-9]\d* attached/i).isVisible({ timeout: 1000 }).catch(() => false)) {
      this.contactAdded = true;
      return;
    }

    const panelReady = this.page
      .locator('#AddContactPanel.show, .offcanvas.show, .modal.show')
      .filter({ hasText: /Add contact|Select Role|Role/i })
      .or(this.page.getByRole('heading', { name: /Add contact to project/i }))
      .first();

    let opened = false;
    for (let i = 0; i < 3 && !opened; i++) {
      await addContact.scrollIntoViewIfNeeded();
      await guideClick(this.page, addContact);
      opened = await panelReady.waitFor({ state: 'visible', timeout: 8000 }).then(() => true).catch(() => false);
      if (!opened) {
        await addContact.evaluate((el) => (el as HTMLElement).click()).catch(() => {});
        opened = await panelReady.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
      }
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
    if (await fullName.isEditable().catch(() => false)) {
      await guideType(this.page, fullName, faker.person.fullName());
    }
    for (const [sel, value] of [
      ['#Input_Organisation, input[name*="Organisation" i], input[name*="Organization" i]', faker.company.name()],
      ['#Input_Email, input[name*="Email" i]', faker.internet.email()],
      ['#Input_Phone, input[name*="Phone" i]', faker.string.numeric(10)],
    ] as const) {
      const field = contactPanel.locator(sel).first();
      if (await field.isEditable().catch(() => false)) await guideType(this.page, field, value);
    }

    if (!(await this.contactRoleValue())) await this.selectContactRole(contactPanel);

    await guideClick(
      this.page,
      contactPanel.getByRole('button', { name: /^Add contact$/i }).or(contactPanel.locator('button.btn-primary').filter({ hasText: /Add contact/i })).last(),
    );

    if (await contactPanel.isVisible({ timeout: 2000 }).catch(() => false)) {
      if (await contactPanel.getByText(/^Select Role$/i).isVisible().catch(() => false)) {
        throw new Error('Add contact failed: Role is still "Select Role" after save attempt.');
      }
      const closeBtn = contactPanel.getByRole('button', { name: /Cancel|Close/i }).first();
      if (await closeBtn.isVisible().catch(() => false)) await guideClick(this.page, closeBtn).catch(() => {});
    }
    await contactPanel.waitFor({ state: 'hidden', timeout: 15000 }).catch(() => {});
    this.contactAdded = true;
    console.log('Project contact added.');
  }
}
