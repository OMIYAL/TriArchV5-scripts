---
name: cucumber-gherkin-playwright-bdd
description: Enforces a clean Cucumber/Gherkin authoring style and a reusable step-definition structure for Playwright-BDD (bddgen + .features-gen). Use when adding or editing .feature files, tags, Scenario/Scenario Outline, DataTables/DocStrings, or when refactoring long step-definition files into thin steps backed by pages/flows/fixtures.
disable-model-invocation: true
---

# Cucumber-Gherkin + Playwright-BDD (TriArch QA) Skill

## Goal

Create **human-readable** `.feature` files and keep TypeScript **minimal** by:
- Writing intent-focused steps in Gherkin
- Implementing **thin** step definitions (glue only)
- Moving UI selectors/actions to **page objects**
- Moving multi-step business logic to **flows**
- Sharing objects/state via **fixtures**

This repo uses **Playwright Test runner** with **`playwright-bdd`** (generated specs under `.features-gen/`). Do not hand-edit anything under `.features-gen/`.

## Repo Structure (recommended)

Use folder names that explain purpose:

```
qa-automation/
  features/                 # Gherkin executable specs (.feature)
    <area>/
      *.feature

  steps/                    # Step definitions (thin glue only)
    support/                # Fixtures/hooks/context/helpers shared by all steps
      fixtures.ts
    <area>/                 # Domain-based step files (navigation/auth/payment/etc)
      *.steps.ts

  pages/                    # Page objects (selectors + UI actions)
    **/*.page.ts

  flows/                    # Reusable multi-step workflows (keeps steps short)
    <area>/
      *.flow.ts

  utils/                    # Env/state/config helpers (no Playwright selectors here)
    *.helper.ts
```

## Gherkin rules (from official docs)

### Keywords + syntax
- A `.feature` file contains exactly **one** `Feature:` line.
- `Feature` **must** be followed by a colon. Some keywords must not; don’t add colons where they aren’t allowed, or the test may be ignored. See [Gherkin reference](https://cucumber.io/docs/gherkin/reference/).
- Use **2-space indentation** for readability.
- Comments start with `#` and must start on a new line (no block comments). See [Gherkin reference](https://cucumber.io/docs/gherkin/reference/).

### Scenario size
- Prefer **3–5 steps per scenario** to keep expressive power. See [Gherkin reference](https://cucumber.io/docs/gherkin/reference/).

### Given/When/Then intent
- **Given**: initial context (preconditions). Avoid UI actions here.
- **When**: user/system action/event.
- **Then**: observable outcome (assertions). Avoid checking DB internals when possible.
- Hide implementation details in step definitions (imagine “it’s 1922” — no UI/tech details in the step text). See [Gherkin reference](https://cucumber.io/docs/gherkin/reference/).

### Duplicate step text rule (critical)
Cucumber does **not** use the keyword to match steps. So these are duplicates and should be avoided:

```gherkin
Given there is money in my account
Then there is money in my account
```

Use clearer domain language instead (from the docs):

```gherkin
Given my account has a balance of £430
Then my account should have a balance of £430
```

Source: [Gherkin reference](https://cucumber.io/docs/gherkin/reference/).

### Background
Use `Background:` to remove repeated incidental `Given` steps across scenarios, but keep it short (≤4 lines ideally). Source: [Gherkin reference](https://cucumber.io/docs/gherkin/reference/).

### Scenario Outline
Use `Scenario Outline` + `Examples` when the same scenario runs with different data. Prefer data tables and parameters over copy/paste. Source: [Gherkin reference](https://cucumber.io/docs/gherkin/reference/).

### Doc Strings and Data Tables
Use Doc Strings (`"""` or ``` ``` ) and Data Tables (`| ... |`) for larger inputs instead of stuffing everything into one line. Source: [Gherkin reference](https://cucumber.io/docs/gherkin/reference/).

## Step organization rules (avoid long step files)

### How to split step files
Start with one file if needed, but split into meaningful groups as you grow. Source: [Step organization](https://cucumber.io/docs/gherkin/step-organization/).

Recommended grouping: **by domain concept**, not by feature file:
- `navigation.steps.ts`
- `authentication.steps.ts`
- `payment.steps.ts`
- `application.steps.ts`

This avoids the “feature-coupled step definitions” anti-pattern. Source: [Step organization](https://cucumber.io/docs/gherkin/step-organization/).

### Only implement steps you actually use
Don’t create speculative step definitions “for future”. Source: [Step organization](https://cucumber.io/docs/gherkin/step-organization/).

### Avoid duplication with parameterized steps
If steps differ only by small details, consolidate:

```gherkin
Given I go to the {string} page
```

And route to a helper/page factory in TS. Source: [Step organization](https://cucumber.io/docs/gherkin/step-organization/).

## Playwright-BDD specifics (this repo)

### Generated tests
`bddgen` generates Playwright spec files under `.features-gen/`. Treat this as build output:
- Do not edit `.features-gen/` manually.
- Put all real logic in `steps/`, `pages/`, `flows/`, `utils/`.

### Keep step defs thin
Each step definition should ideally:
- call **1 page method**, or
- call **1 flow method**, or
- run **a small assertion** (Then step)

If a step definition exceeds ~15–25 lines, it probably belongs in `pages/` or `flows/`.

### Prefer fixtures to re-instantiating page objects
Use a `steps/support/fixtures.ts` approach so step definitions receive ready-to-use objects, instead of doing `new SomePage(page)` in every step.

## Templates

### Feature template

```gherkin
@storefront @smoke
Feature: Storefront About page

  Background:
    Given the citizen is on the Storefront home page

  Scenario: Citizen can open About page
    When the citizen navigates to the About us page
    Then the About us page should be displayed
```

### Step definition template (thin glue)

```ts
import { Given, When, Then } from '../support/fixtures';

When('the citizen navigates to the About us page', async ({ storefrontHomePage }) => {
  await storefrontHomePage.clickAboutUs();
});

Then('the About us page should be displayed', async ({ aboutPage }) => {
  await aboutPage.assertVisible();
});
```

## Quick checklist (use before finishing a feature)
- [ ] Step texts are intent-based (not UI implementation details)
- [ ] No duplicate step text across Given/When/Then
- [ ] Scenarios are short (3–5 steps), using Background/Scenario Outline when helpful
- [ ] Step defs are thin; heavy logic moved to pages/flows
- [ ] `.features-gen/` is untouched

