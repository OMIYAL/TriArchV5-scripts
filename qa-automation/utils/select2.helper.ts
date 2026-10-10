import { Locator, Page } from '@playwright/test';

const ENABLED_OPTION_SELECTOR =
  '.select2-container--open [role="option"]:not([aria-disabled="true"]):not(.loading-results)';

export function select2EnabledOptions(page: Page): Locator {
  return page.locator(ENABLED_OPTION_SELECTOR);
}

export async function closeSelect2Dropdown(page: Page): Promise<void> {
  const openContainer = page.locator('.select2-container--open');
  if (!await openContainer.isVisible({ timeout: 300 }).catch(() => false)) return;

  await page.keyboard.press('Escape');
  await openContainer.waitFor({ state: 'hidden', timeout: 15000 });
}

export async function waitForSelect2Results(page: Page, timeout = 10000): Promise<Locator> {
  const loading = page.locator('.select2-container--open .select2-results__option.loading-results');
  await loading.waitFor({ state: 'hidden', timeout: timeout + 15000 });

  const enabledOptions = select2EnabledOptions(page);
  const hasEnabled = await enabledOptions.first().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  if (hasEnabled) return enabledOptions;

  const noResults = page.locator('.select2-container--open .select2-results__option.select2-results__message');
  if (await noResults.isVisible({ timeout: 1000 }).catch(() => false)) {
    const searchInput = page.locator('input.select2-search__field:visible');
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.clear();
      await loading.waitFor({ state: 'hidden', timeout: timeout + 15000 });
      await enabledOptions.first().waitFor({ state: 'visible', timeout });
    }
  }

  return enabledOptions;
}

export async function clickSelect2Option(
  page: Page,
  preferredName?: string | RegExp,
  timeout = 10000,
): Promise<boolean> {
  const enabledOptions = await waitForSelect2Results(page, timeout);

  if (preferredName) {
    const preferred = enabledOptions.filter({ hasText: preferredName }).first();
    if (await preferred.isVisible({ timeout: 3000 }).catch(() => false)) {
      await preferred.click();
      await closeSelect2Dropdown(page);
      return true;
    }
  }

  const count = await enabledOptions.count();
  if (count === 0) {
    await closeSelect2Dropdown(page);
    return false;
  }

  await enabledOptions.first().click();
  await closeSelect2Dropdown(page);
  return true;
}

export async function selectFromSelect2Combobox(
  page: Page,
  combobox: Locator,
  options?: { searchText?: string; preferredName?: string | RegExp; skipIfFilled?: RegExp },
): Promise<boolean> {
  const skipPattern = options?.skipIfFilled ?? /select|search|choose/i;
  const currentText = (await combobox.innerText().catch(() => '') ?? '').trim();
  if (currentText && !skipPattern.test(currentText)) return true;

  await closeSelect2Dropdown(page);
  await combobox.scrollIntoViewIfNeeded();
  // FIX: removed default force — scrollIntoViewIfNeeded() just ran specifically to make this
  // actionable; forcing anyway defeats that and would hide a real problem if it's still covered.
  await combobox.click();

  const searchInput = page.locator('input.select2-search__field:visible');
  const hasSearch = await searchInput.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);

  if (hasSearch && options?.searchText) {
    // FIX: removed default force — this input was just confirmed visible above; force here
    // was redundant and bypassed the remaining actionability checks for no known reason.
    await searchInput.click();
    await searchInput.fill('');
    await searchInput.pressSequentially(options.searchText, { delay: 40 });
    await waitForSelect2Results(page, 12000);
  } else if (hasSearch) {
    // FIX: replaced fixed 800ms settle sleep with a wait for the results container itself
    // to actually be populated/loading — waitForSelect2Results already polls for the loading
    // indicator and enabled options, so the fixed pause beforehand was pure dead time.
    await page.locator('.select2-container--open .select2-results__options').first()
      .waitFor({ state: 'visible', timeout: 10000 });
    await waitForSelect2Results(page, 12000);
  } else {
    // FIX: replaced fixed 400ms sleep with a wait for the dropdown container to attach.
    await page.locator('.select2-container--open').first()
      .waitFor({ state: 'visible', timeout: 10000 });
  }

  const selected = await clickSelect2Option(page, options?.preferredName ?? options?.searchText, 12000);
  await closeSelect2Dropdown(page);
  return selected;
}
