import { Page, Locator } from '@playwright/test';
import { env } from '../../utils/env.helper';

export class CreateProjectPage {
  private readonly page: Page;

  private readonly nextButton: Locator;
  private readonly projectNameInput: Locator;
  private readonly streetAddressInput: Locator;
  private readonly cityInput: Locator;
  private readonly stateInput: Locator;
  private readonly postalCodeInput: Locator;
  private readonly createProjectButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.nextButton = page.getByRole('button', { name: 'Next' });
    this.projectNameInput = page.getByRole('textbox', { name: 'Project Name' });
    this.streetAddressInput = page.getByRole('textbox', { name: 'Street Address Line 1' });
    this.cityInput = page.getByRole('textbox', { name: 'City or Municipality' });
    this.stateInput = page.getByRole('textbox', { name: 'State or Province' });
    this.postalCodeInput = page.getByRole('textbox', { name: 'Postal Code' });
    this.createProjectButton = page.getByRole('button', {
      name: /^(Create project|Create permit project|Save|Save project|Finish|Submit)$/i,
    });
  }

  async completeFullFlow(): Promise<void> {
    // Wizard structure (current):
    //   Step 1 – Project Details (name + address + jurisdiction all on one page)
    //   Step 2 – Building Characteristics
    //   Step 3 – Project Contacts
    //   Step 4 – Project related documents  →  "Create project" button
    await this.page.waitForLoadState('domcontentloaded');

    // ═══════════════════════════════════════════════════════════
    // Step 1: Project Details
    // ═══════════════════════════════════════════════════════════
    await this.projectNameInput.waitFor({ state: 'visible', timeout: 30000 });
    await this.projectNameInput.fill(env.project.name);

    await this.streetAddressInput.fill(env.project.streetAddress);
    await this.cityInput.fill(env.project.city);
    await this.stateInput.fill(env.project.state);
    await this.postalCodeInput.fill(env.project.postalCode);

    // Jurisdiction is a jQuery Select2 widget. Open it via JS to avoid
    // click-interception from the sticky navigation header, then type + select.
    const hasSelect2 = await this.page.evaluate(() =>
      !!document.querySelector('#JurisdictionIdSelect'),
    );

    if (hasSelect2) {
      // Open the Select2 dropdown programmatically (avoids click-interception by sticky nav).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await this.page.evaluate(() => {
        const w = window as any;
        const sel = document.querySelector('#JurisdictionIdSelect');
        if (w.$ && sel) w.$(sel).select2('open');
      });

      // Use pressSequentially so that every keystroke fires the events
      // select2 relies on (keydown / keyup / input) to trigger its AJAX search.
      const searchInput = this.page.locator('.select2-search__field').first();
      await searchInput.waitFor({ state: 'visible', timeout: 8000 });
      await searchInput.pressSequentially(env.project.jurisdiction, { delay: 80 });
      await this.page.waitForTimeout(1500); // Allow AJAX debounce + response

      const option = this.page
        .getByRole('option', { name: new RegExp(env.project.jurisdiction, 'i') })
        .first();
      await option.waitFor({ state: 'visible', timeout: 10000 });
      await option.click();
    }

    // Advance to Step 2
    await this.clickNext();
    await this.page.waitForURL(/step=2/, { timeout: 20000 });

    // ═══════════════════════════════════════════════════════════
    // Step 2: Building Characteristics (all fields optional – skip)
    // ═══════════════════════════════════════════════════════════
    // Wait for step 2 to fully render before clicking Next.
    await this.nextButton.waitFor({ state: 'visible', timeout: 15000 });
    await this.clickNext();

    // The project is saved during the Step 2→3 transition (API call) — allow extra time.
    await this.page.waitForURL(/step=3/, { timeout: 60000 });

    // ═══════════════════════════════════════════════════════════
    // Step 3: Project Contacts (skip – no contacts required)
    // ═══════════════════════════════════════════════════════════
    await this.nextButton.waitFor({ state: 'visible', timeout: 15000 });
    await this.clickNext();
    await this.page.waitForURL(/step=4/, { timeout: 20000 });

    // ═══════════════════════════════════════════════════════════
    // Step 4: Project related documents → click "Create project"
    // ═══════════════════════════════════════════════════════════
    await this.createProjectButton.waitFor({ state: 'visible', timeout: 15000 });
    await this.createProjectButton.click();
  }

  private async clickNext(): Promise<void> {
    await this.nextButton.waitFor({ state: 'visible', timeout: 10000 });
    // Standard Playwright click — auto-scrolls and enforces actionability.
    // Falls back to JS-click only if the element is not actionable (e.g. covered by a nav).
    try {
      await this.nextButton.click({ timeout: 5000 });
    } catch {
      await this.page.evaluate(() => {
        const btn =
          (document.querySelector('[data-wizard-nav="next-js"]') as HTMLButtonElement) ||
          ([...document.querySelectorAll('button')] as HTMLButtonElement[]).find(
            (b) => b.textContent?.trim().startsWith('Next') && !b.disabled,
          );
        if (btn) btn.click();
      });
    }
  }

  getRawPage(): Page {
    return this.page;
  }
}