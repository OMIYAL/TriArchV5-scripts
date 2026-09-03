/**
 * LOCAL:  TEST_ENV is read from .env (default: stg).
 *         Resolves STG_X or PROD_X prefix and injects flat values.
 *
 * CI:     TEST_ENV is set by the workflow from inputs.environment (long-form:
 *         'staging' or 'production'). The ALIASES map below normalises it to
 *         'stg' or 'prod'.
 *         GitHub injects flat secrets directly; the prefix resolver skips keys
 *         that are already set so CI secrets always take precedence over .env.
 *
 * MUST be the first import in playwright.config.ts.
 */
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

// ── Alias normalisation ──────────────────────────────────────────────────────
// CI inputs.environment uses long-form names ('staging', 'production').
// .env / local usage uses short forms ('stg', 'prod').
// Both are accepted; anything else fails immediately rather than silently falling
// back to a wrong environment.
const ALIASES: Record<string, string> = {
  staging: 'stg',
  stg: 'stg',
  production: 'prod',
  prod: 'prod',
};
const raw = (process.env.TEST_ENV || 'stg').toLowerCase();
const TEST_ENV = ALIASES[raw];
if (!TEST_ENV) {
  throw new Error(
    `[env] Unknown TEST_ENV "${raw}". Expected one of: ${Object.keys(ALIASES).join(', ')}`
  );
}
const PREFIX = TEST_ENV.toUpperCase(); // 'STG' | 'PROD'

// ── Keys that are env-specific ───────────────────────────────────────────────
// Prefix resolver maps PREFIX_KEY → KEY for the active environment.
// Only include keys whose value differs between STG and PROD.
//
// Intentionally excluded (env-agnostic, random-selection behaviour):
//   SERVICE_NAME     — steps/citizen.steps.ts picks a random available service when
//                      this key is unset. This is the correct behaviour for both STG
//                      and PROD (tenant) — no pinning needed.
//   TEST_DEFAULT_PDF — utils/document.helper.ts picks a random document from the
//                      fixtures folder when unset. Same pattern on both environments.
//   TEST_DOCUMENTS_DIR — defaults to the repo fixtures folder on both environments.
// These three keys follow the same random-fallback pattern used on staging and
// there is no requirement to pin them on production.
const ENV_SPECIFIC_KEYS = [
  'STOREFRONT_BASE_URL',
  'PORTAL_BASE_URL',
  'AUTH_BASE_URL',
  'TENANT_NAME',
  'CITIZEN_USERNAME',
  'CITIZEN_PASSWORD',
  'COORDINATOR_USERNAME',
  'COORDINATOR_PASSWORD',
  'REVIEWER_USERNAME',
  'REVIEWER_PASSWORD',
  'REVIEWER1_USERNAME',
  'REVIEWER1_PASSWORD',
  'REVIEWER2_USERNAME',
  'REVIEWER2_PASSWORD',
  'STRIPE_TEST_EMAIL',
  'STRIPE_TEST_CARD_NUMBER',
  'STRIPE_TEST_EXPIRATION',
  'STRIPE_TEST_CVC',
  'STRIPE_TEST_CARDHOLDER_NAME',
  'STRIPE_TEST_ZIP',
  'STRIPE_TEST_PHONE',       // pages/stripe-checkout.page.ts:63
] as const;

// ── Blank-aware helper ───────────────────────────────────────────────────────
// GitHub Actions sets FOO: ${{ secrets.BAR }} to '' when the secret is unset.
// Treating '' as blank prevents skipping the prefix resolution for those keys.
const isBlank = (v: string | undefined): v is undefined =>
  v === undefined || v.trim() === '';

// ── Prefix resolution ────────────────────────────────────────────────────────
// For each env-specific key, attempt to resolve PREFIX_KEY from .env.
// Rules (in priority order):
//   1. If PREFIX_KEY is blank → nothing to resolve, skip.
//   2. If the flat KEY already has a non-blank value that DIFFERS from PREFIX_KEY
//      → the value was injected by CI (or left in .env intentionally); keep it
//      and warn so the developer knows about the mismatch.
//   3. If the flat KEY is blank → inject the prefixed value.
for (const key of ENV_SPECIFIC_KEYS) {
  const prefixed = process.env[`${PREFIX}_${key}`];
  if (isBlank(prefixed)) continue;

  const current = process.env[key];
  if (!isBlank(current) && current !== prefixed) {
    // Flat value exists and conflicts with the prefixed one.
    // CI-injected secrets must win, but warn so the discrepancy is visible.
    console.warn(
      `[env] ${key} is already set and differs from ${PREFIX}_${key} — ` +
      `keeping existing value. If running locally, remove the flat "${key}" entry from .env.`
    );
    continue;
  }

  if (isBlank(current)) {
    process.env[key] = prefixed;
  }
}

// ── Subdomain URL construction ────────────────────────────────────────────────
// Tenants are now routed by subdomain (e.g. fps.stg-portal.triarch.ai).
// .env stores the shared root host (stg-portal.triarch.ai) so that changing
// only TENANT_NAME is sufficient to target a different tenant — no URL edits
// elsewhere are needed.
//
// This block prepends TENANT_NAME to the hostname of STOREFRONT_BASE_URL and
// PORTAL_BASE_URL, producing the fully-qualified tenant URL at runtime.
//
// AUTH_BASE_URL is intentionally excluded — the auth service lives on the
// shared host and does NOT use a tenant subdomain.  The tenant context reaches
// auth automatically via the OIDC ReturnUrl when the browser lands on the
// tenant subdomain.
const buildSubdomainUrl = (baseUrl: string | undefined, tenant: string): string | undefined => {
  if (!baseUrl || !tenant) return baseUrl;
  try {
    const url = new URL(baseUrl);
    if (!url.hostname.startsWith(`${tenant}.`)) {
      url.hostname = `${tenant}.${url.hostname}`;
    }
    return url.origin; // callers append their own paths; strip trailing slash / any path fragment
  } catch {
    console.warn(`[env] Could not parse base URL for subdomain construction: ${baseUrl}`);
    return baseUrl;
  }
};

const resolvedTenant = process.env.TENANT_NAME || '';
if (resolvedTenant) {
  if (!isBlank(process.env.STOREFRONT_BASE_URL)) {
    process.env.STOREFRONT_BASE_URL = buildSubdomainUrl(process.env.STOREFRONT_BASE_URL, resolvedTenant);
  }
  if (!isBlank(process.env.PORTAL_BASE_URL)) {
    process.env.PORTAL_BASE_URL = buildSubdomainUrl(process.env.PORTAL_BASE_URL, resolvedTenant);
  }
} else {
  console.warn('[env] TENANT_NAME is unset — subdomain URLs will NOT be constructed. Tests will target the shared host.');
}

// ── Fail-fast validation ─────────────────────────────────────────────────────
// If the critical URL keys are still blank after resolution, fail immediately
// with a clear message rather than letting tests fail later with "relative URL"
// errors or with baseURL: undefined in playwright.config.ts.
const REQUIRED = ['STOREFRONT_BASE_URL', 'AUTH_BASE_URL', 'TENANT_NAME'] as const;
const missing = REQUIRED.filter(k => isBlank(process.env[k]));
if (missing.length) {
  throw new Error(
    `[env] TEST_ENV=${TEST_ENV} resolved no value for: ${missing.join(', ')}.\n` +
    `Set ${PREFIX}_<KEY> in .env, or the flat name as a CI secret/variable.`
  );
}

// ── Startup banner ───────────────────────────────────────────────────────────
// Confirms which environment is active before any test runs.
// Note: STOREFRONT_BASE_URL / PORTAL_BASE_URL are secrets in CI and will be
// masked as *** in the logs — the banner is informative locally only.
const isCI = !!process.env.CI;
console.log(`\n🌍 TEST ENVIRONMENT : ${TEST_ENV.toUpperCase()}${isCI ? ' (CI)' : ' (local)'}`);
console.log(`🔗 Storefront URL   : ${process.env.STOREFRONT_BASE_URL}`);
console.log(`🔗 Portal URL       : ${process.env.PORTAL_BASE_URL}\n`);
