import { Page } from '@playwright/test';
import { faker } from '@faker-js/faker';
import { DynamicProjectData } from './data-generator.helper';
import { selectFromSelect2Combobox, closeSelect2Dropdown } from './select2.helper';
import { isMimikGuideMode } from './mimik.helper';
import { guideType } from './mimik-action.helper';

const EMPTY_COMBOBOX_PATTERN = /select|choose|no project|enter jurisdiction|search jurisdiction/i;

function hasLinkedProject(page: import('@playwright/test').Page): boolean {
  return /projectId=/i.test(page.url());
}

function fakeValueForHint(hint: string, inputType: string): string {
  const h = hint.toLowerCase();
  if (h.includes('applicant name') || h.includes('your name') || (h.includes('name') && !h.includes('project name') && !h.includes('site name'))) {
    return faker.person.fullName();
  }
  if (h.includes('digital signature')) return faker.person.fullName();
  if (h.includes('applicant company') || h.includes('company') || h.includes('organization')) {
    return faker.company.name();
  }
  if (h.includes('permit type')) return 'Building Permit';
  if (/\bpermit\b/.test(h) && !h.includes('permit type') && !h.includes('project')) {
    return faker.string.alphanumeric(8).toUpperCase();
  }
  if (h.includes('email')) return faker.internet.email();
  if (h.includes('phone') || h.includes('tel')) return faker.string.numeric(10);
  if (h.includes('project name')) return `Test Project ${faker.commerce.productName()} ${faker.string.numeric(4)}`;
  if (h.includes('project address') || h.includes('street') || h.includes('address')) {
    return faker.location.streetAddress();
  }
  if (h.includes('city') || h.includes('municipality')) return faker.location.city();
  if (h.includes('state') || h.includes('province')) return faker.location.state();
  if (h.includes('zip') || h.includes('postal')) return faker.location.zipCode('#####');
  if (h.includes('scope') || h.includes('description') || h.includes('comment') || h.includes('note')) {
    return faker.lorem.paragraph({ min: 2, max: 4 });
  }
  if (inputType === 'number') return faker.number.int({ min: 1, max: 9999 }).toString();
  return faker.lorem.sentence({ min: 4, max: 10 });
}

async function getFieldHint(page: Page, input: ReturnType<Page['locator']>): Promise<string> {
  const id = await input.getAttribute('id').catch(() => '') ?? '';
  const name = await input.getAttribute('name').catch(() => '') ?? '';
  const placeholder = await input.getAttribute('placeholder').catch(() => '') ?? '';
  const ariaLabel = await input.getAttribute('aria-label').catch(() => '') ?? '';

  let labelText = '';
  if (id) {
    labelText = await page.locator(`label[for="${id}"]`).innerText().catch(() => '') ?? '';
  }

  return `${labelText} ${name} ${ariaLabel} ${placeholder}`.trim();
}

async function fillEmptyComboboxes(page: Page, projectData?: DynamicProjectData | null): Promise<void> {
  const linkedProject = hasLinkedProject(page);
  const comboboxes = page.locator('[role="combobox"]:visible');
  const count = await comboboxes.count();

  for (let i = 0; i < count; i++) {
    const combo = comboboxes.nth(i);
    const text = (await combo.innerText().catch(() => '') ?? '').trim();
    const ariaLabel = await combo.getAttribute('aria-label').catch(() => '') ?? '';
    const hint = `${text} ${ariaLabel}`;

    if (/no project/i.test(hint) && linkedProject) continue;
    if (/jurisdiction/i.test(hint) && linkedProject) continue;
    if (!EMPTY_COMBOBOX_PATTERN.test(hint)) continue;

    await selectFromSelect2Combobox(page, combo, {
      preferredName: undefined,
      skipIfFilled: EMPTY_COMBOBOX_PATTERN,
    }).catch(async () => {
      await closeSelect2Dropdown(page);
    });
    await closeSelect2Dropdown(page);
    await page.waitForTimeout(200);
  }
}

async function fillEmptyInputs(page: Page, projectData?: DynamicProjectData | null): Promise<void> {
  const fields = page.locator(
    [
      'input:visible:not([readonly]):not([type="checkbox"]):not([type="radio"]):not([type="file"]):not([type="hidden"]):not([type="submit"]):not([type="button"])',
      'textarea:visible:not([readonly])',
    ].join(', '),
  );

  const count = await fields.count();
  for (let i = 0; i < count; i++) {
    const field = fields.nth(i);
    const type = (await field.getAttribute('type').catch(() => 'text') ?? 'text').toLowerCase();
    if (['checkbox', 'radio', 'file', 'hidden', 'submit', 'button'].includes(type)) continue;

    const currentValue = (await field.inputValue().catch(() => '') ?? '').trim();
    if (currentValue) continue;

    const hint = await getFieldHint(page, field);
    let value = fakeValueForHint(hint, type);

    if (/project name/i.test(hint) && projectData?.name) value = projectData.name;
    if (/project address/i.test(hint) && projectData?.streetAddress) {
      value = `${projectData.streetAddress}, ${projectData.city}, ${projectData.state} ${projectData.postalCode}`;
    }
    if (/jurisdiction/i.test(hint) && projectData?.jurisdiction) value = projectData.jurisdiction;

    if (isMimikGuideMode()) {
      await guideType(page, field, value).catch(async () => {
        await field.click({ force: true }).catch(() => {});
        await field.pressSequentially(value, { delay: 50 }).catch(() => {});
      });
    } else {
      await field.fill(value).catch(async () => {
        await field.click({ force: true }).catch(() => {});
        await field.pressSequentially(value, { delay: 15 }).catch(() => {});
      });
    }
  }
}

async function fillEmptySelects(page: Page): Promise<void> {
  const selects = page.locator('select:visible:not([disabled])');
  const count = await selects.count();

  for (let i = 0; i < count; i++) {
    const select = selects.nth(i);
    const current = await select.inputValue().catch(() => '');
    if (current) continue;

    const options = select.locator('option:not([value=""])');
    if (await options.count() > 0) {
      await select.selectOption({ index: 1 }).catch(async () => {
        const first = options.first();
        const val = await first.getAttribute('value').catch(() => null);
        if (val) await select.selectOption(val).catch(() => {});
      });
    }
  }
}

export async function fillAllVisibleEmptyFields(
  page: Page,
  projectData?: DynamicProjectData | null,
): Promise<void> {
  await fillEmptyComboboxes(page, projectData);
  await fillEmptyInputs(page, projectData);
  await fillEmptySelects(page);
  await closeSelect2Dropdown(page);
}

export async function fillApplicantFields(
  page: Page,
  projectData?: DynamicProjectData | null,
): Promise<void> {
  const fieldLabels = [
    { label: /applicant name|your name/i, value: faker.person.fullName() },
    { label: /applicant company|company/i, value: faker.company.name() },
    {
      label: /project address/i,
      value: projectData
        ? `${projectData.streetAddress}, ${projectData.city}, ${projectData.state} ${projectData.postalCode}`
        : faker.location.streetAddress(),
    },
    { label: /project name/i, value: projectData?.name ?? `Test Project ${faker.string.alphanumeric(6)}` },
    { label: /permit type/i, value: 'Building Permit' },
    { label: /^permit$/i, value: faker.string.alphanumeric(8).toUpperCase() },
    { label: /digital signature/i, value: faker.person.fullName() },
    { label: /jurisdiction/i, value: projectData?.jurisdiction ?? faker.location.state() },
    { label: /scope/i, value: faker.lorem.paragraph({ min: 2, max: 4 }) },
  ];

  for (const { label, value } of fieldLabels) {
    const textbox = page.getByRole('textbox', { name: label });
    if (!await textbox.isVisible({ timeout: 500 }).catch(() => false)) continue;

    const current = (await textbox.inputValue().catch(() => '') ?? '').trim();
    const isJurisdiction = /jurisdiction/i.test(label.source);
    const shouldFill = !current || (isJurisdiction && projectData?.jurisdiction && current !== projectData.jurisdiction);

    if (shouldFill) {
      await textbox.fill(isJurisdiction && projectData?.jurisdiction ? projectData.jurisdiction : value);
    }
  }

  await fillAllVisibleEmptyFields(page, projectData);
}
