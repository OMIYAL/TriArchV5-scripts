# QA Automation in GitHub Actions — setup

Workflow: [`.github/workflows/qa-automation.yml`](workflows/qa-automation.yml)
Report generator: [`qa-automation/scripts/summarize-results.js`](../qa-automation/scripts/summarize-results.js)

---

## 1. One-time configuration

Everything is read from the environment, so nothing is committed. `dotenv` in
`playwright.config.ts` never overrides variables that are already set, which is
why the workflow can inject these directly without writing a `.env` file.

Create a GitHub **Environment** named `staging`
(*Settings → Environments → New environment*), then add:

### Variables (not secret) — *Settings → Environments → staging → Variables*

| Variable | Example | Required |
|---|---|---|
| `STOREFRONT_BASE_URL` | `https://storefront-staging.triarch.ai` | yes |
| `PORTAL_BASE_URL` | `https://portal-staging.triarch.ai` | yes |
| `AUTH_BASE_URL` | `https://auth-staging.triarch.ai` | yes |
| `TENANT_NAME` | `fps` | yes |
| `SERVICE_NAME` | `Fire Alarm Permit` | no — a random service is picked when unset |
| `TEST_DEFAULT_PDF` | `Human Trafficking Post - revised 070118.pdf` | no — defaults to that file |
| `TEST_DOCUMENTS_DIR` | *(leave unset)* | no — defaults to `qa-automation/fixtures/documents` |

### Secrets — *Settings → Environments → staging → Secrets*

| Secret | Used by |
|---|---|
| `CITIZEN_USERNAME` / `CITIZEN_PASSWORD` | all storefront + e2e scenarios |
| `COORDINATOR_USERNAME` / `COORDINATOR_PASSWORD` | coordinator assignment, e2e |
| `REVIEWER_USERNAME` / `REVIEWER_PASSWORD` | single-reviewer control-room scenarios |
| `REVIEWER1_USERNAME` / `REVIEWER1_PASSWORD` | dual-reviewer scenarios |
| `REVIEWER2_USERNAME` / `REVIEWER2_PASSWORD` | dual-reviewer scenarios |
| `STRIPE_TEST_CARD_NUMBER` | intake-fee payment step |
| `STRIPE_TEST_EXPIRATION` | intake-fee payment step |
| `STRIPE_TEST_CVC` | intake-fee payment step |
| `STRIPE_TEST_ZIP` | intake-fee payment step |
| `STRIPE_TEST_CARDHOLDER_NAME` | intake-fee payment step |
| `STRIPE_TEST_EMAIL` | intake-fee payment step |

Repository-level secrets/variables also work — environment values simply take
precedence. The workflow fails fast with a clear `::error::` if any of the four
URLs/tenant or the citizen credentials are missing.

> The target environment must be on **Stripe test keys**. The suite drives a
> real Stripe Checkout form with the test card above.

---

## 2. Running it

**From the UI** — *Actions → QA Automation (Playwright BDD) → Run workflow*:

| Input | Meaning |
|---|---|
| `suite` | `smoke` (9 scenarios) · `storefront` (5) · `control-room` (7) · `e2e` (1) · `all` (13) · `custom` |
| `grep` | Extra tag/title filter, e.g. `@status\|@contact`. Required when `suite=custom` |
| `retries` | `0` / `1` / `2` retries per failing scenario |
| `headed` | Headed under Xvfb (default). The suite is written for a maximised window (`viewport: null` + `--start-maximized`), so leave this on unless you are debugging |
| `environment` | Which GitHub Environment supplies the URLs/credentials |

**Nightly** — `cron: "30 20 * * *"` (20:30 UTC / 02:00 IST) runs the smoke set.
Delete the `schedule:` block to turn that off.

**From another repo, after a deploy.** `GITHUB_TOKEN` cannot dispatch a workflow
in a different repository, so create a fine-grained PAT scoped to
`OMIYAL/TriArchV5-scripts` with **Actions: read and write**, store it in
TriArchV5 as `QA_DISPATCH_TOKEN`, and add this to the end of the staging deploy
job in `azure-abp-deploy.yml`:

```yaml
  trigger-qa:
    needs: deploy
    runs-on: ubuntu-latest
    steps:
      - name: Kick off the QA suite
        env:
          GH_TOKEN: ${{ secrets.QA_DISPATCH_TOKEN }}
        run: |
          gh workflow run qa-automation.yml \
            --repo OMIYAL/TriArchV5-scripts --ref main \
            -f suite=smoke -f retries=1 -f environment=staging
```

`gh workflow run` returns as soon as the run is queued. To block on the result
instead, add `--json` polling or use `repository_dispatch` (the workflow also
accepts `event_type: qa-run` with `client_payload.suite` / `.grep` / `.retries`).

---

## 3. The report

Every run — pass or fail — publishes:

1. **Job summary** (the run page itself): headline verdict, counts, one row per
   scenario with feature, scenario name, project, tags, duration and retries,
   plus a collapsible failure detail block per failing scenario.
2. **`qa-report-<run>` artifact**: `summary.md`, `summary.json` (machine-readable,
   for a dashboard or a Slack post) and the raw Playwright `results.json`.
3. **`playwright-html-report-<run>` artifact**: the standard Playwright report —
   the only place with per-Gherkin-step timings, screenshots and traces.
4. **`playwright-failure-artifacts-<run>`**: traces/videos/screenshots, uploaded
   only when something failed, 7-day retention.

The job is marked failed if any scenario failed, but the report is always built
first, so a red run still tells you exactly which scenarios broke.

### Optional: Gherkin step-level HTML report

The Playwright HTML report shows steps but not Gherkin keywords. For a
Cucumber-shaped report, add to `playwright.config.ts`:

```ts
import { defineBddConfig, cucumberReporter } from 'playwright-bdd';

reporter: [
  ['list'],
  ['html', { open: 'never' }],
  cucumberReporter('html', { outputFile: 'cucumber-report/index.html' }),
],
```

and drop `--reporter=list,html,json` from the workflow's run step (CLI reporters
replace the config ones), keeping `PLAYWRIGHT_JSON_OUTPUT_NAME` plus a
`cucumberReporter('json', …)` for the summariser.

---

## 4. Things to know before the first run

**Runs are serialised on purpose.** `reviewer-workflow.feature` and friends pick
*whichever* Service Request is currently `UNDER REVIEW` on the tenant, and the
e2e scenario creates new ones. Two overlapping runs would fight over the same
records, so the workflow uses a `concurrency` group per environment and
`playwright.config.ts` pins `workers: 1`. Do not shard these across runners
without giving each shard its own tenant.

**Budget the time.** 13 scenarios at up to 4 minutes each (12 for e2e), retried,
run sequentially — `suite: all` can take well over an hour. `smoke` is the
sensible default for post-deploy gating; the job cap is 240 minutes.

**This repository is public.** Two consequences:
- Run logs, the job summary and *all artifacts* are downloadable by anyone.
  Traces, videos and screenshots contain live tenant data, and the summary
  contains the environment URLs. Consider making the repo private before
  enabling the schedule.
- Never add a `pull_request` trigger for this workflow. Fork PRs get no secrets
  (so the run would fail), and a PR that edits the workflow could otherwise
  exfiltrate them.

**`bddgen` must run before `playwright test`.** `testDir` points at the
generated `.features-gen/` directory, so a bare `npx playwright test` finds
nothing. The workflow runs `npx bddgen` as its own step; locally use
`npm run test:bdd`.

---

## 5. Pre-existing issues in the repo (not blocking, worth fixing)

Found while wiring this up:

- `.gitignore` ignores `.env.example`, but `README.md` step 4 says
  `cp .env.example .env` — the template can never be committed, so a new
  contributor has no list of variables. Un-ignore it and commit a filled-in
  template (section 1 above has the full list).
- `INSTRUCTIONS.md` §3 claims "`.env` and `auth-state.json` are included in the
  repository… you do not need to configure anything." Both are gitignored, so
  this is wrong and misleading.
- `README.md` §2 documents a `tests/` tree and `utils/env.helper.ts`,
  `state.helper.ts`, `selectors.helper.ts`, `fixtures/auth.setup.ts` — none of
  which exist. The suite is `features/` + `steps/` + `pages/` + `utils/`.
- `package.json` scripts reference projects that do not exist:
  `auth:setup` → `--project=setup`, `test:dev`/`test:debug` → `--project=chromium`.
  All three fail immediately.
- `npm test` (`playwright test` with no `bddgen`) discovers zero tests.
- `playwright.config.ts`: the `portal-chromium` project matches
  `**/tests/portal/**/*.spec.ts`, which does not exist — it always runs zero
  tests, and its `storageState` file is never generated because there is no
  `auth.setup.ts`. Meanwhile the control-room features are matched by the
  `portal-auth-setup` project, which is why the workflow selects that project
  name for `suite: control-room`.
