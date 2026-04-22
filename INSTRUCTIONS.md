# QA Automation - Setup & Usage Instructions

This document provides step-by-step instructions for setting up the QA Automation environment and running tests.

## 1. Prerequisites

Before you begin, ensure you have the following installed on your system:

-   **Node.js**: Version 18 or higher.
    -   Download: [https://nodejs.org/](https://nodejs.org/)
    -   Verify installation: `node -v`
-   **git**: Version control.
    -   Verify installation: `git --version`
-   **VS Code** (Recommended): IDE with Playwright extension support.

## 2. Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    ```

2.  Navigate to the `qa-automation` directory:
    ```bash
    cd Triarch-scripts/qa-automation
    ```

3.  Install dependencies:
    ```bash
    npm install
    ```

4.  Install Playwright browsers:
    ```bash
    npx playwright install
    ```

## 3. Environment Configuration

Good news! The `.env` file and `auth-state.json` are included in the repository for your convenience.

1.  **You do not need to configure anything.**
2.  The credentials and session state are ready to use.

## 4. Running Tests

We have defined several scripts in `package.json` for convenience.

### Run All Tests
Runs all tests in headless mode (no browser UI visible).
```bash
npm test
```

### Run in Headed Mode
Runs tests with the browser UI visible (good for debugging).
```bash
npm run test:headed
```

### Run Smoke Tests
Runs only the critical path tests tagged with `@smoke`.
```bash
npm run test:smoke
```

### View Test Report
After a test run, view the HTML report.
```bash
npm run show-report
```

### Debugging
To run tests with the Playwright Inspector:
```bash
npm run test:debug
```

## 5. Directory Structure

-   `tests/`: Contains the test specifications (`.spec.ts`).
-   `pages/`: Page Object Models (POM) representing UI pages.
-   `components/`: Reusable UI components.
-   `utils/`: Helper functions and test utilities.
-   `fixtures/`: Test fixtures for setup/teardown.
-   `playwright.config.ts`: Main Playwright configuration.

## 6. Troubleshooting

-   **"Playwright not found"**: Ensure you ran `npm install` inside the `qa-automation` folder, not the root.
-   **Browser launch errors**: Ensure you ran `npx playwright install` to download the browser binaries.
