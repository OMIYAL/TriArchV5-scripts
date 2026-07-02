## Table of Contents


1. [Quick Start](#1-quick-start)
2. [Project Structure](#2-project-structure)

---

## 1. Quick Start

```bash
# 1. Clone and navigate into the project
cd qa-automation

# 2. Install dependencies
npm install

# 3. Install Playwright browsers
npx playwright install

# 4. Set up your environment
cp .env.example .env
# Open .env and fill in all values (see Section 7 for details)

# 5. Run the citizen storefront test
npx playwright test --project=storefront-chromium --headed
```

---

## 2. Project Structure

```
qa-automation/
|
+-- playwright.config.ts          # Central config: projects, viewport, reporters
+-- .env                          # Your secrets (NEVER commit this)
+-- .env.example                  # Template: copy this to create your .env
+-- package.json                  # Scripts and dependencies
|
+-- pages/                        # Page Object Models (POM)
|   +-- base.page.ts              # Base class all pages extend
|   +-- auth-login.page.ts        # Auth login: switch tenant + login flow
|   +-- stripe-checkout.page.ts   # Stripe payment form
|   +-- storefront/
|       +-- storefront-home.page.ts      # Storefront home navigation
|       +-- services-listing.page.ts     # Service browse + random selection
|       +-- service-apply.page.ts        # SR application form handler
|       +-- create-project.page.ts       # 6-step project creation wizard (popup)
|
+-- tests/
|   +-- storefront/
|   |   +-- citizen-submit-sr.spec.ts    # DONE: Full citizen SR submission
|   +-- portal/                          # TODO: Coordinator + Reviewer tests
|   +-- e2e/
|       +-- complete-citizen-flow.spec.ts # Full end-to-end chain
|
+-- utils/
|   +-- env.helper.ts             # Typed env object + validateEnvVars()
|   +-- state.helper.ts           # State chain: save/load JSON between phases
|   +-- selectors.helper.ts       # Reusable Playwright locator wrappers
|
+-- fixtures/
|   +-- auth.setup.ts             # Portal auth setup (saves session state)
|   +-- test-data.fixture.ts      # Shared test data fixtures
|
+-- playwright/
|   +-- .auth/
|       +-- .gitkeep              # Folder kept in git; auth-state.json is ignored
|
+-- test-results/                 # Auto-generated (ignored by git)
    +-- state/                    # State chain JSON files (ignored by git)
        +-- citizen-sr-state.json
        +-- assignment-state.json
        +-- review-state.json
        +-- certificate-state.json
```


