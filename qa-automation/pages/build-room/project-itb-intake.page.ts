import { Page, Locator } from '@playwright/test';
import { BuildRoomBasePage } from './base.page';

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
  }

  /** Confirms every low-confidence extracted field in one click. */
  async confirmAllExtractedFields(): Promise<void> {
    if (await this.confirmAllButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.confirmAllButton.click();
    }
  }

  /** Picks an existing GC company by name. */
  async pickGeneralContractor(name: string): Promise<void> {
    const panel = this.page.locator('#GeneralContractorPickerPanel');
    await this.openOffcanvasPanel(this.generalContractorPickerButton, panel);
    const gcLabel = panel.locator('label', { hasText: name }).first();
    await gcLabel.waitFor({ state: 'visible', timeout: 20000 });
    await gcLabel.click();
    await panel.locator('button', { hasText: 'Select' }).click();
  }

  /** `date` as MM/DD/YYYY, in the future. */
  async fillBidDeadline(date: string): Promise<void> {
    await this.bidDeadlineInput.fill(date);
    await this.page.getByRole('heading', { name: 'Bid & schedule' }).click(); // blur to sync
  }

  async confirmAndCreate(): Promise<void> {
    await this.confirmAndCreateButton.click();
    await this.page.waitForURL(/Projects\/Index\?highlight=/, { timeout: 30000 });
  }

  /** The new project's id, from the post-create redirect URL. */
  getCreatedProjectId(): string {
    const id = new URL(this.page.url()).searchParams.get('highlight');
    if (!id) {
      throw new Error(`Expected a "highlight" query param with the new project id in ${this.page.url()}`);
    }
    return id;
  }
}
