import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from '../base.page';
import { CreateProjectPage } from './create-project.page';
import { DocumentUploadComponent } from './document-upload.component';
import { guideClick } from '../../utils/mimik-action.helper';
import { drainMimikCapture, isMimikGuideMode } from '../../utils/mimik.helper';

const CREATE_PROJECT_URL = /PermitProjects\/Create/i;

export class ServiceApplyPage extends BasePage {
  private readonly projectCombobox: Locator;
  private readonly payIntakeFeeButton: Locator;

  constructor(page: Page) {
    super(page, (process.env.STOREFRONT_BASE_URL || ''));

    this.projectCombobox = page
      .getByRole('combobox', { name: /No project|project/i })
      .or(page.locator('#ProjectId'))
      .first();
    this.payIntakeFeeButton = page.locator('#PayIntakeFeeButton');
  }

  /** "+ New project" link/button — label varies by service skin. */
  private createProjectControl(): Locator {
    return this.page
      .locator('a[href*="PermitProjects/Create"], a[href*="PermitProjects%2FCreate"]')
      .or(this.page.getByRole('link', { name: /Create a new project|New project/i }))
      .or(this.page.getByRole('button', { name: /New project/i }))
      .first();
  }

  private findCreateProjectPage(): Page | null {
    if (CREATE_PROJECT_URL.test(this.page.url())) {
      return this.page;
    }
    for (const p of this.page.context().pages()) {
      if (!p.isClosed() && CREATE_PROJECT_URL.test(p.url())) {
        return p;
      }
    }
    return null;
  }

  /** Poll all tabs — avoids Promise.race rejecting when popup never fires under Mimik. */
  private async waitForCreateProjectPage(timeout = 90000): Promise<{ kind: 'popup' | 'sameTab'; page: Page }> {
    const deadline = Date.now() + timeout;
    const applyPage = this.page;

    while (Date.now() < deadline) {
      const found = this.findCreateProjectPage();
      if (found) {
        if (found === applyPage) {
          return { kind: 'sameTab', page: found };
        }
        return { kind: 'popup', page: found };
      }

      // Apply tab may close when Create opens in a popup — do not call waitForTimeout on a closed page.
      await new Promise((resolve) => setTimeout(resolve, 400));
    }

    const openUrls = this.page
      .context()
      .pages()
      .filter((p) => !p.isClosed())
      .map((p) => p.url())
      .join(' | ');

    throw new Error(
      `Create project page did not open within ${timeout}ms. ` +
        `Apply tab: ${this.page.url()}. Open tabs: ${openUrls || '(none)'}`,
    );
  }

  async waitForProjectCombobox(): Promise<void> {
    await this.page
      .waitForURL(/services\/Apply|PermitProjects\/Create/i)
      .catch(() => {});
    if (CREATE_PROJECT_URL.test(this.page.url())) return;

    // Combobox can lag under Mimik; Create link alone is enough to proceed.
    await Promise.race([
      this.projectCombobox.waitFor({ state: 'visible' }),
      this.createProjectControl().waitFor({ state: 'visible' }),
    ]);
  }

  /** Build the absolute Create URL from the control's href, preserving __tenant. */
  private resolveCreateUrlFromHref(href: string): string {
    const createUrl = new URL(href, this.page.url());
    const currentTenant = new URL(this.page.url()).searchParams.get('__tenant');
    if (currentTenant && !createUrl.searchParams.has('__tenant')) {
      createUrl.searchParams.set('__tenant', currentTenant);
    }
    return createUrl.href;
  }

  async openCreateProjectPopup(): Promise<CreateProjectPage> {
    const existing = this.findCreateProjectPage();
    if (existing) {
      console.log('Already on PermitProjects/Create — filling on current page (no popup).');
      await existing.waitForLoadState('domcontentloaded').catch(() => {});
      return new CreateProjectPage(existing);
    }

    const createControl = this.createProjectControl();
    await createControl.waitFor({ state: 'visible' });
    await createControl.scrollIntoViewIfNeeded();

    // Guide mode: real click so Mimik captures (it intercepts <a> then navigates).
    // Non-guide: href goto is more reliable under CI/xvfb.
    if (isMimikGuideMode()) {
      await guideClick(this.page, createControl, { noWaitAfter: true });
      // Mimik intercepts <a>, screenshots, then navigates — wait before goto fallback.
      const sameTab = await this.page
        .waitForURL(CREATE_PROJECT_URL, { waitUntil: 'commit', timeout: 60000 })
        .then(() => true)
        .catch(() => false);
      if (sameTab) {
        await this.page.bringToFront();
        return new CreateProjectPage(this.page);
      }

      const href = await createControl.getAttribute('href').catch(() => null);
      if (href && /PermitProjects(\/|%2F)Create/i.test(href)) {
        const createUrl = this.resolveCreateUrlFromHref(href);
        console.log(`Create click did not navigate — opening: ${createUrl}`);
        await this.page.goto(createUrl, { waitUntil: 'domcontentloaded' });
        await this.page.bringToFront();
        return new CreateProjectPage(this.page);
      }

      const target = await this.waitForCreateProjectPage(60000);
      await target.page.bringToFront();
      await target.page.waitForLoadState('domcontentloaded').catch(() => {});
      return new CreateProjectPage(target.page);
    }

    const href = await createControl.getAttribute('href').catch(() => null);
    if (href && /PermitProjects(\/|%2F)Create/i.test(href)) {
      const createUrl = this.resolveCreateUrlFromHref(href);
      console.log(`Navigating directly to Create project page: ${createUrl}`);
      await this.page.goto(createUrl, { waitUntil: 'domcontentloaded' });
      if (CREATE_PROJECT_URL.test(this.page.url())) {
        await this.page.bringToFront();
        return new CreateProjectPage(this.page);
      }
    }

    await guideClick(this.page, createControl);
    const target = await this.waitForCreateProjectPage();
    await target.page.bringToFront();
    await target.page.waitForLoadState('domcontentloaded').catch(() => {});
    return new CreateProjectPage(target.page);
  }

  async selectCreatedProject(projectName: string): Promise<void> {
    const combobox = this.projectCombobox;
    await combobox.waitFor({ state: 'visible' });

    const projectIdMatch = this.page.url().match(/projectId=([^&]+)/i);
    if (projectIdMatch) {
      console.log(`Apply page already has projectId=${projectIdMatch[1]} in URL.`);
      await this.page
        .getByRole('navigation', { name: 'Service application steps' })
        .waitFor({ state: 'visible' })
        .catch(() => {});
      const currentLabel = (await combobox.innerText().catch(() => '') ?? '').trim();
      if (currentLabel.includes(projectName) || !/no project/i.test(currentLabel)) {
        console.log(`Project combobox ready with "${currentLabel}" — skipping dropdown selection.`);
        return;
      }
    }

    const currentLabel = (await combobox.innerText().catch(() => '') ?? '').trim();
    if (currentLabel.includes(projectName)) {
      console.log(`Project "${projectName}" already selected in combobox.`);
      return;
    }

    await guideClick(this.page, combobox);
    const projectOption = this.page
      .getByRole('option', { name: new RegExp(projectName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') })
      .first();
    await projectOption.waitFor({ state: 'visible' });
    await guideClick(this.page, projectOption);
    console.log(`Selected newly created project "${projectName}" from dropdown.`);

    await this.page
      .getByRole('navigation', { name: 'Service application steps' })
      .waitFor({ state: 'visible' });
  }

  async uploadSupportingDocuments(): Promise<void> {
    await new DocumentUploadComponent(this.page).uploadRequired(undefined, undefined, 'service');
  }

  /** Pay → StartPayment → GatewaySelection → Stripe (same tab). */
  async payIntakeFeeAndOpenStripe(): Promise<void> {
    const pay = this.payIntakeFeeButton;
    await pay.waitFor({ state: 'visible' });
    await expect(pay).toBeEnabled();
    await this.page.bringToFront();
    // Drain Mimik's screenshot queue so a navigating Pay control is not stuck behind backlog.
    await drainMimikCapture(this.page);

    const navigated = this.page.waitForURL(/Payment\/GatewaySelection|checkout\.stripe\.com/i, {
      waitUntil: 'commit',
      timeout: 90000,
    });

    // Real click for Mimik, then jQuery trigger if the toolbar handler ignored it.
    await guideClick(this.page, pay, { force: true });
    if (/services\/Apply/i.test(this.page.url())) {
      await this.page
        .evaluate(() => {
          const w = window as unknown as { jQuery?: (s: string) => { trigger: (e: string) => void } };
          if (w.jQuery) w.jQuery('#PayIntakeFeeButton').trigger('click');
          else document.getElementById('PayIntakeFeeButton')?.click();
        })
        .catch(() => {});
    }

    await navigated;

    if (/GatewaySelection/i.test(this.page.url())) {
      const stripeNav = this.page.waitForURL(/checkout\.stripe\.com/i, {
        waitUntil: 'commit',
        timeout: 60000,
      });
      await guideClick(this.page, this.page.locator('#btnSubmit'), { force: true });
      await stripeNav;
    }
  }
}
