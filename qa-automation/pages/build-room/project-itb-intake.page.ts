import { Page, Locator, expect } from '@playwright/test';
import { BuildRoomBasePage } from './base.page';
import { GeneralContractorPickerComponent } from './components/general-contractor-picker.component';

/**
 * New project from an ITB document (`/BuildRoom/Projects` → CreateFromItb): upload, AI extraction,
 * review and confirm. There is no plain "new project" form.
 */
export class ProjectItbIntakePage extends BuildRoomBasePage {
  private readonly newProjectButton: Locator;
  private readonly confirmAllButton: Locator;
  private readonly generalContractorPickerButton: Locator;
  private readonly bidDeadlineInput: Locator;
  private readonly confirmAndCreateButton: Locator;

  constructor(page: Page) {
    super(page);
    this.newProjectButton = page.getByRole('button', { name: 'New Project' });
    this.confirmAllButton = page.getByRole('button', { name: 'Confirm all' });
    this.generalContractorPickerButton = page.getByRole('button', { name: 'General contractor' });
    // The datepicker's visible input has a random per-load name; "Bid Deadline" is the first one.
    this.bidDeadlineInput = page.locator('input[data-datepicker="true"]').first();
    this.confirmAndCreateButton = page.getByRole('button', { name: 'Confirm & create project' });
  }

  /** Opens the project dashboard, where "New Project" lives. */
  async goto(): Promise<void> {
    await this.page.goto(`${this.baseUrl}/BuildRoom/Projects`, { waitUntil: 'domcontentloaded' });
  }

  async openNewProject(): Promise<void> {
    await this.openOffcanvasPanel(this.newProjectButton, this.page.locator('#ProjectCreateRoutePanel'));
  }

  /** Sets the file on the hidden `<input>` instead of racing a native file chooser. */
  async uploadAndExtract(pdfPath: string): Promise<void> {
    const panel = this.page.locator('#ProjectCreateRoutePanel');
    const fileInput = panel.locator('#ItbIntake_FileInput');
    await fileInput.waitFor({ state: 'attached', timeout: 15000 });
    await fileInput.setInputFiles(pdfPath);
    await panel.locator('#ItbIntake_StartButton').click();
    // Upload + AI extraction take a couple of minutes and give no response to wait on — wait for the redirect.
    await this.page.waitForURL(/CreateFromItb\?extractionId=/, { timeout: 240000 });
    await this.waitForExtractionReviewReady();
  }

  /** Waits until the review form shows extracted ITB data (city/AHJ resolve from this). */
  private async waitForExtractionReviewReady(): Promise<void> {
    const projectName = this.page.getByRole('textbox', { name: 'Project name', exact: true });
    const addressLine = this.page.getByRole('textbox', { name: 'Address Line', exact: true });
    await expect
      .poll(
        async () => {
          const name = (await projectName.inputValue()).trim();
          const address = (await addressLine.inputValue()).trim();
          return name.length > 0 || address.length > 0;
        },
        { timeout: 120000, message: 'ITB review form should show extracted project fields' }
      )
      .toBe(true);
  }

  /** Confirms every low-confidence extracted field in one click. */
  async confirmAllExtractedFields(): Promise<void> {
    if (await this.confirmAllButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.confirmAllButton.click();
    }
  }

  /** Opens the GC picker and selects the first or second listed company at random. */
  async pickRandomGeneralContractor(): Promise<void> {
    const picker = new GeneralContractorPickerComponent(this.page);
    await this.openOffcanvasPanel(this.generalContractorPickerButton, picker.panel);
    await picker.pickRandomFirstOrSecond();
  }

  /** `date` as MM/DD/YYYY, in the future. */
  async fillBidDeadline(date: string): Promise<void> {
    await this.bidDeadlineInput.fill(date);
    await this.page.getByRole('heading', { name: 'Bid & schedule' }).click(); // blur to sync
  }

  /**
   * Creates the project, then opens its detail page. The post-create redirect is `/Projects/Index`
   * and may briefly include `?highlight=<id>` before the query is stripped — capture the id from
   * that navigation, or fall back to the dashboard row for the extracted project name.
   */
  async confirmAndCreate(): Promise<string> {
    const projectName = (
      await this.page.getByRole('textbox', { name: 'Project name', exact: true }).inputValue()
    ).trim();
    await this.waitForSiteLocationFromExtraction();

    let createdId = '';
    const captureIdFromUrl = () => {
      const url = new URL(this.page.url());
      const highlight = url.searchParams.get('highlight');
      if (highlight) createdId = highlight;
      if (url.pathname.includes('/Detail')) {
        const id = url.searchParams.get('id');
        if (id) createdId = id;
      }
    };
    const onNav = () => captureIdFromUrl();
    this.page.on('framenavigated', onNav);
    try {
      await this.confirmAndCreateButton.click();
      await this.page.waitForURL(
        (url) =>
          !url.pathname.includes('CreateFromItb') &&
          (url.searchParams.has('highlight') ||
            url.pathname.includes('/Projects/Detail') ||
            /\/BuildRoom\/Projects(\/Index)?\/?$/.test(url.pathname)),
        { timeout: 120000, waitUntil: 'domcontentloaded' }
      );
      captureIdFromUrl();
    } finally {
      this.page.off('framenavigated', onNav);
    }

    await this.waitForBuildRoomLoaders();
    captureIdFromUrl();
    if (!createdId) {
      createdId = await this.findProjectIdOnDashboard(projectName);
    }

    await this.page.goto(`${this.baseUrl}/BuildRoom/Projects/Detail?id=${createdId}`, {
      waitUntil: 'domcontentloaded',
    });
    await this.waitForBuildRoomLoaders();
    return createdId;
  }

  /** Finds the new project's Detail link on the dashboard after create lands without `highlight=`. */
  private async findProjectIdOnDashboard(projectName: string): Promise<string> {
    const search = this.page.getByRole('textbox', { name: 'Search name, client or number' });
    if (projectName && (await search.isVisible().catch(() => false))) {
      await search.fill(projectName);
    }
    const link = this.page
      .locator('a[href*="/BuildRoom/Projects/Detail?id="]')
      .filter({ hasText: projectName || /./ })
      .first();
    await link.waitFor({ state: 'visible', timeout: 30000 });
    const href = (await link.getAttribute('href')) ?? '';
    const id = new URL(href, this.page.url()).searchParams.get('id');
    if (!id) {
      throw new Error(`Could not read project id from dashboard link "${href}" for "${projectName}".`);
    }
    return id;
  }

  /**
   * City and jurisdiction are filled by ITB extraction / address resolution — do not override them.
   * Wait until either City has a value or an AHJ is selected.
   */
  private async waitForSiteLocationFromExtraction(): Promise<void> {
    const cityInput = this.page.getByRole('textbox', { name: 'City', exact: true });
    await cityInput.waitFor({ state: 'visible', timeout: 20000 });
    await expect
      .poll(
        async () => {
          const city = (await cityInput.inputValue()).trim();
          const ahjSelected = await this.hasSelectedAhj();
          return city.length > 0 || ahjSelected;
        },
        { timeout: 90000, message: 'ITB extraction should populate City or Jurisdiction · AHJ' }
      )
      .toBe(true);
  }

  /** True when AHJ is chosen (e.g. combobox shows "Utah", not the empty search prompt). */
  private async hasSelectedAhj(): Promise<boolean> {
    const siteSection = this.page.locator('div').filter({
      has: this.page.getByRole('heading', { name: 'Site location & AHJ' }),
    });
    const ahjCombobox = siteSection.getByRole('combobox').last();
    const name = ((await ahjCombobox.getAttribute('aria-label')) ?? '').trim();
    const text = ((await ahjCombobox.innerText().catch(() => '')) ?? '').trim();
    const combined = `${name} ${text}`;
    return combined.length > 0 && !/Search jurisdiction by name/i.test(combined);
  }
}
