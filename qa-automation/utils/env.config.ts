/**
 * LOCAL:  TEST_ENV is read from .env (default: stg).
 *         Resolves STG_X or PROD_X prefix and injects flat values.
 *
 * CI:     GitHub injects the flat secrets directly via the workflow env block.
 *         dotenv.config() sees they are already set and skips .env entirely.
 * MUST be the first import in playwright.config.ts.
 */
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '..', '.env') });

const TEST_ENV = (process.env.TEST_ENV || 'stg').toLowerCase();
const PREFIX = TEST_ENV.toUpperCase(); // 'STG' | 'PROD'

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
] as const;

// Resolve prefix → inject into process.env
// Guard: never overwrite a value already set by CI (GitHub Environments)
for (const key of ENV_SPECIFIC_KEYS) {
  const prefixedValue = process.env[`${PREFIX}_${key}`];
  if (prefixedValue !== undefined && process.env[key] === undefined) {
    process.env[key] = prefixedValue;
  }
}

// Startup banner — confirms active environment before any test runs
const isCI = !!process.env.CI;
console.log(`\n🌍 TEST ENVIRONMENT : ${TEST_ENV.toUpperCase()}${isCI ? ' (CI)' : ' (local)'}`);
console.log(`🔗 Storefront URL   : ${process.env.STOREFRONT_BASE_URL}`);
console.log(`🔗 Portal URL       : ${process.env.PORTAL_BASE_URL}\n`);
