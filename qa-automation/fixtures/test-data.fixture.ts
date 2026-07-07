import { test as base, expect } from '@playwright/test';

// Lazy load env to avoid circular dependency
function getEnv() {
  try {
    return require('../utils/env.helper').env;
  } catch {
    return {
      defaultTenant: 'fps',
      testData: {
        projectName: 'Test Project',
        streetAddress: '123 Test Street',
        city: 'Test City',
        state: 'Test State',
        postalCode: '12345',
      },
      stripe: {
        email: 'test@example.com',
        cardNumber: '4242424242424242',
        expiration: '12/34',
        cvc: '123',
        cardholderName: 'Test User',
        zip: '12345',
      },
      credentials: {
        username: '',
        password: '',
      },
    };
  }
}

export interface TestData {
  tenant: string;
  serviceName: string;
  serviceDefinitionId: string;
  jurisdiction: string;
  project: {
    name: string;
    streetAddress: string;
    city: string;
    state: string;
    postalCode: string;
  };
  buildingOptions: {
    a1Option: string;
    a1Value: string;
    typeIAOption: string;
    typeIAValue: string;
    basementOption: string;
    basementValue: string;
  };
  contact: {
    name: string;
    company: string;
    email: string;
    phone: string;
  };
  stripe: {
    email: string;
    cardNumber: string;
    expiration: string;
    cvc: string;
    cardholderName: string;
    zip: string;
  };
}

export function getDefaultTestData(): TestData {
  const env = getEnv();
  return {
    tenant: env.defaultTenant,
    serviceName: 'SDTest1',
    serviceDefinitionId: '5ed27803-c4bd-3d5a-eb54-3a21dc1282a0',
    jurisdiction: 'Colorado',
    project: {
      name: env.testData.projectName,
      streetAddress: env.testData.streetAddress,
      city: env.testData.city,
      state: env.testData.state,
      postalCode: env.testData.postalCode,
    },
    buildingOptions: {
      a1Option: 'H5',
      a1Value: '14',
      typeIAOption: 'TypeIIA',
      typeIAValue: '3',
      basementOption: 'Partial',
      basementValue: '1',
    },
    contact: {
      name: 'Test Contact',
      company: 'Test Company LLC',
      email: 'test.contact@example.com',
      phone: '5125550000',
    },
    stripe: {
      email: env.stripe.email,
      cardNumber: (process.env.STRIPE_TEST_CARD_NUMBER || ''),
      expiration: (process.env.STRIPE_TEST_EXPIRATION || ''),
      cvc: (process.env.STRIPE_TEST_CVC || ''),
      cardholderName: (process.env.STRIPE_TEST_CARDHOLDER_NAME || ''),
      zip: (process.env.STRIPE_TEST_ZIP || ''),
    },
  };
}

export const test = base.extend<{ testData: TestData }>({
  testData: async ({}, use) => {
    await use(getDefaultTestData());
  },
});

export { expect };