import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Single source of truth for all configuration
 * NOTHING should be hardcoded in tests or pages
 */
export const env = {
  // Environment
  environment: process.env.ENVIRONMENT || 'staging',

  // Base URLs
  urls: {
    storefront: process.env.STOREFRONT_BASE_URL || '',
    portal: process.env.PORTAL_BASE_URL || '',
    auth: process.env.AUTH_BASE_URL || '',
  },

  // Tenant
  tenant: {
    name: process.env.TENANT_NAME || '',
  },

  // Credentials
  credentials: {
    citizen: {
      username: process.env.CITIZEN_USERNAME || '',
      password: process.env.CITIZEN_PASSWORD || '',
    },
    coordinator: {
      username: process.env.COORDINATOR_USERNAME || '',
      password: process.env.COORDINATOR_PASSWORD || '',
    },
    reviewer: {
      username: process.env.REVIEWER_USERNAME || '',
      password: process.env.REVIEWER_PASSWORD || '',
    },
  },

  // Service Definition
  service: {
    definitionId: process.env.SERVICE_DEFINITION_ID || '',
    name: process.env.SERVICE_NAME || '',
  },

  // Project Data
  project: {
    name: process.env.PROJECT_NAME || '',
    jurisdiction: process.env.JURISDICTION || '',
    streetAddress: process.env.STREET_ADDRESS || '',
    city: process.env.CITY || '',
    state: process.env.STATE || '',
    postalCode: process.env.POSTAL_CODE || '',
  },

  // Building Options
  building: {
    a1Option: process.env.BUILDING_TYPE_A1 || '',
    a1Value: process.env.BUILDING_TYPE_A1_VALUE || '',
    iaOption: process.env.BUILDING_TYPE_IA || '',
    iaValue: process.env.BUILDING_TYPE_IA_VALUE || '',
    basementOption: process.env.BASEMENT_TYPE || '',
    basementValue: process.env.BASEMENT_TYPE_VALUE || '',
  },

  // Stripe
  stripe: {
    email: process.env.STRIPE_TEST_EMAIL || '',
    cardNumber: process.env.STRIPE_TEST_CARD_NUMBER || '',
    expiration: process.env.STRIPE_TEST_EXPIRATION || '',
    cvc: process.env.STRIPE_TEST_CVC || '',
    cardholderName: process.env.STRIPE_TEST_CARDHOLDER_NAME || '',
    zip: process.env.STRIPE_TEST_ZIP || '',
  },

  // Review Comments
  review: {
    approvalComment: process.env.REVIEW_APPROVAL_COMMENT || '',
    rejectionComment: process.env.REVIEW_REJECTION_COMMENT || '',
  },

  // Certificate
  certificate: {
    number: process.env.CERTIFICATE_NUMBER || '',
    type: process.env.CERTIFICATE_TYPE || '',
  },
} as const;

/**
 * Validate required env vars
 */
export function validateEnvVars(requiredVars: string[]): void {
  const missing = requiredVars.filter(varName => !process.env[varName]);
  if (missing.length > 0) {
    throw new Error(`❌ Missing required environment variables: ${missing.join(', ')}`);
  }
}