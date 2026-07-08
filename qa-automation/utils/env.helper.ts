import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../.env') });

export const env = {
  environment: process.env.ENVIRONMENT || 'staging',

  urls: {
    storefront: process.env.STOREFRONT_BASE_URL || '',
    auth: process.env.AUTH_BASE_URL || '',
  },

  tenant: {
    name: process.env.TENANT_NAME || '',
  },

  credentials: {
    citizen: {
      username: process.env.CITIZEN_USERNAME || '',
      password: process.env.CITIZEN_PASSWORD || '',
    },
  },

  service: {
    name: process.env.SERVICE_NAME || '',
  },

  stripe: {
    email: process.env.STRIPE_TEST_EMAIL || '',
    cardNumber: process.env.STRIPE_TEST_CARD_NUMBER || '',
    expiration: process.env.STRIPE_TEST_EXPIRATION || '',
    cvc: process.env.STRIPE_TEST_CVC || '',
    cardholderName: process.env.STRIPE_TEST_CARDHOLDER_NAME || '',
    zip: process.env.STRIPE_TEST_ZIP || '',
  },

  testDocuments: {
    dir: process.env.TEST_DOCUMENTS_DIR || '',
    defaultPdf: process.env.TEST_DEFAULT_PDF || 'Human Trafficking Post - revised 070118.pdf',
  },
} as const;
