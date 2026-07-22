import { Locator, Page } from '@playwright/test';
import { guideClick } from './mimik-action.helper';
import { isMimikGuideMode } from './mimik.helper';

const ENABLED_OPTION_SELECTOR =
  '.select2-container--open [role="option"]:not([aria-disabled="true"]):not(.loading-results)';

export function select2EnabledOptions(page: Page): Locator {
  return page.locator(ENABLED_OPTION_SELECTOR);
}

export async function closeSelect2Dropdown(page: Page): Promise<void> {
  const openContainer = page.locator('.select2-container--open');
  if (!await openContainer.isVisible({ timeout: 300 }).catch(() => false)) return;

  await page.keyboard.press('Escape').catch(() => {});
  await openContainer.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
}

export async function waitForSelect2Results(page: Page, timeout = 10000): Promise<Locator> {
  const loading = page.locator('.select2-container--open .select2-results__option.loading-results');
  await loading.waitFor({ state: 'hidden', timeout }).catch(() => {});

  const enabledOptions = select2EnabledOptions(page);
  const hasEnabled = await enabledOptions.first().waitFor({ state: 'visible', timeout }).then(() => true).catch(() => false);
  if (hasEnabled) return enabledOptions;

  const noResults = page.locator('.select2-container--open .select2-results__option.select2-results__message');
  if (await noResults.isVisible({ timeout: 1000 }).catch(() => false)) {
    const searchInput = page.locator('input.select2-search__field:visible');
    if (await searchInput.isVisible().catch(() => false)) {
      await searchInput.clear();
      await loading.waitFor({ state: 'hidden', timeout }).catch(() => {});
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
  if (isMimikGuideMode()) {
    await guideClick(page, combobox);
  } else {
    await combobox.click({ force: true });
  }

  const searchInput = page.locator('input.select2-search__field:visible');
  const hasSearch = await searchInput.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);

  if (hasSearch && options?.searchText) {
    if (isMimikGuideMode()) {
      await guideClick(page, searchInput);
    } else {
      await searchInput.click({ force: true });
    }
    await searchInput.fill('');
    await searchInput.pressSequentially(options.searchText, { delay: 40 });
    await waitForSelect2Results(page, 12000);
  } else if (hasSearch) {
    await page.waitForTimeout(800);
    await waitForSelect2Results(page, 12000);
  } else {
    await page.waitForTimeout(400);
  }

  const selected = await clickSelect2Option(page, options?.preferredName ?? options?.searchText, 12000);
  await closeSelect2Dropdown(page);
  return selected;
}
