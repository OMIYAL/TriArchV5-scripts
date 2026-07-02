import { Page, Locator } from '@playwright/test';

/**
 * Helper class for creating more resilient selectors
 */
export class Selectors {
  /**
   * Get a link by its text content (partial match)
   */
  static linkByText(page: Page, text: string, exact: boolean = false): Locator {
    return page.getByRole('link', { name: text, exact });
  }

  /**
   * Get a button by its text content
   */
  static buttonByText(page: Page, text: string, exact: boolean = false): Locator {
    return page.getByRole('button', { name: text, exact });
  }

  /**
   * Get an input by its label
   */
  static inputByLabel(page: Page, label: string, exact: boolean = false): Locator {
    return page.getByRole('textbox', { name: label, exact });
  }

  /**
   * Get a combobox/dropdown by its label
   */
  static comboboxByLabel(page: Page, label: string, exact: boolean = false): Locator {
    return page.getByRole('combobox', { name: label, exact });
  }

  /**
   * Get an option in a dropdown
   */
  static optionByText(page: Page, text: string, exact: boolean = false): Locator {
    return page.getByRole('option', { name: text, exact });
  }

  /**
   * Get a heading by text
   */
  static headingByText(page: Page, text: string, exact: boolean = false): Locator {
    return page.getByRole('heading', { name: text, exact });
  }

  /**
   * Get element by test ID
   */
  static byTestId(page: Page, testId: string): Locator {
    return page.getByTestId(testId);
  }

  /**
   * Get element by data attribute
   */
  static byDataAttribute(page: Page, attribute: string, value: string): Locator {
    return page.locator(`[${attribute}="${value}"]`);
  }

  /**
   * Get checkbox by label
   */
  static checkboxByLabel(page: Page, label: string, exact: boolean = false): Locator {
    return page.getByRole('checkbox', { name: label, exact });
  }

  /**
   * Get region by accessible name
   */
  static regionByName(page: Page, name: string, exact: boolean = false): Locator {
    return page.getByRole('region', { name: name, exact });
  }

  /**
   * Get spinbutton by label
   */
  static spinbuttonByLabel(page: Page, label: string, exact: boolean = false): Locator {
    return page.getByRole('spinbutton', { name: label, exact });
  }

  /**
   * Get element by placeholder text
   */
  static byPlaceholder(page: Page, placeholder: string, exact: boolean = false): Locator {
    return page.getByPlaceholder(placeholder, { exact });
  }

  /**
   * Get element by label (for form elements)
   */
  static byLabel(page: Page, label: string, exact: boolean = false): Locator {
    return page.getByLabel(label, { exact });
  }
}