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

# 4. Ensure .env is configured with storefront credentials and URLs

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
+-- package.json                  # Scripts and dependencies
|
+-- features/                     # Gherkin feature files (BDD)
|   +-- storefront/
|       +-- citizen_submit_sr.feature
|
+-- steps/                        # Step definitions (playwright-bdd)
|   +-- citizen.steps.ts
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
|       +-- document-upload.component.ts # Document upload helper
|
+-- utils/
|   +-- env.helper.ts             # Typed env object from .env
|   +-- data-generator.helper.ts  # Dynamic test data generation
|   +-- document.helper.ts        # Test PDF selection helpers
|   +-- form-fill.helper.ts       # Applicant form field fillers
|   +-- select2.helper.ts         # Select2 dropdown helpers
|
+-- fixtures/
|   +-- documents/                # Test PDF files for upload steps
|
+-- playwright/
|   +-- .auth/
|       +-- .gitkeep              # Folder kept in git; session JSON is ignored
|
+-- test-results/                 # Auto-generated (ignored by git)
+-- playwright-report/            # Auto-generated HTML report (ignored by git)
+-- .features-gen/                # Auto-generated BDD specs (run bddgen)
```


