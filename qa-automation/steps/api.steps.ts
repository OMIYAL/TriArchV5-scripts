import fs from 'fs';
import path from 'path';
import { createBdd } from 'playwright-bdd';
import { expect, test, APIResponse } from '@playwright/test';

const { Given, When, Then } = createBdd();

const SPEC_PATH = path.resolve(__dirname, '../specs/control-room/contacts.openapi.json');

type ApiWorld = {
  baseURL: string;
  useAuth: boolean;
  method?: string;
  apiPath?: string;
  body?: Record<string, unknown>;
  response?: APIResponse;
  responseJson?: Record<string, unknown>;
};

const world: ApiWorld = {
  baseURL: '',
  useAuth: true,
};

function loadOpenApiExample(): Record<string, unknown> {
  const oaspec = JSON.parse(fs.readFileSync(SPEC_PATH, 'utf8'));
  const post = oaspec.paths?.['/api/control-room/contacts']?.post;
  const example = post?.requestBody?.content?.['application/json']?.example;
  if (!example || typeof example !== 'object') {
    throw new Error(`No request example found in ${SPEC_PATH}`);
  }
  return { ...example };
}

/** Keep Spec fields but uniquify email so re-runs do not collide on DB unique constraints. */
function withUniqueEmail(body: Record<string, unknown>): Record<string, unknown> {
  const email = String(body.email || 'qa.contact.create@example.com');
  const at = email.lastIndexOf('@');
  const local = at > 0 ? email.slice(0, at) : 'qa.contact.create';
  const domain = at > 0 ? email.slice(at + 1) : 'example.com';
  return { ...body, email: `${local}.${Date.now()}@${domain}` };
}

function buildUrl(apiPath: string): string {
  const base = world.baseURL.replace(/\/$/, '');
  const full = `${base}${apiPath.startsWith('/') ? apiPath : `/${apiPath}`}`;
  const tenant = process.env.TENANT_NAME || process.env.API_TENANT_NAME || '';
  if (!tenant) return full;
  const u = new URL(full);
  u.searchParams.set('__tenant', tenant);
  return u.toString();
}

Given('the API base URL is configured', async () => {
  world.baseURL = process.env.API_BASE_URL || 'https://localhost:44336';
  world.useAuth = true;
  world.method = undefined;
  world.apiPath = undefined;
  world.body = undefined;
  world.response = undefined;
  world.responseJson = undefined;
});

Given('a valid Authorization bearer token is configured', async () => {
  world.useAuth = true;
  const token = process.env.API_BEARER_TOKEN || '';
  if (!token) {
    test.skip(
      true,
      'Set API_BEARER_TOKEN in qa-automation/.env (paste access_token from Swagger Authorize)',
    );
  }
});

Given('no Authorization bearer token', async () => {
  world.useAuth = false;
});

Given('request body is the OpenAPI example for this operation', async () => {
  world.body = withUniqueEmail(loadOpenApiExample());
  console.log(`Prepared request body email: ${world.body.email}`);
});

Given('request body is the OpenAPI example without field {string}', async ({}, fieldName: string) => {
  const body = withUniqueEmail(loadOpenApiExample());
  delete body[fieldName];
  world.body = body;
});

When('request operation is {string}', async ({}, method: string) => {
  world.method = method.toUpperCase();
});

When('request path is {string}', async ({}, apiPath: string) => {
  world.apiPath = apiPath;
});

When('the request is sent', async ({ request }) => {
  if (!world.method || !world.apiPath) {
    throw new Error('request operation and path must be set before sending');
  }

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  };

  if (world.useAuth) {
    const token = process.env.API_BEARER_TOKEN || '';
    headers.Authorization = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
  }

  const url = buildUrl(world.apiPath);
  console.log(`API ${world.method} ${url}`);

  world.response = await request.fetch(url, {
    method: world.method,
    headers,
    data: world.body,
    failOnStatusCode: false,
    timeout: 60000,
  });

  const text = await world.response.text();
  try {
    world.responseJson = text ? JSON.parse(text) : {};
  } catch {
    world.responseJson = { raw: text };
  }

  console.log(`Response status: ${world.response.status()}`);
  if (world.responseJson && typeof world.responseJson === 'object' && 'id' in world.responseJson) {
    console.log(`Created contact id (DB lookup key): ${world.responseJson.id}`);
  }
});

Then('response status is {int}', async ({}, status: number) => {
  expect(world.response, 'response should exist').toBeTruthy();
  expect(world.response!.status()).toBe(status);
});

Then('response status is {int} or {int}', async ({}, a: number, b: number) => {
  expect(world.response, 'response should exist').toBeTruthy();
  expect([a, b]).toContain(world.response!.status());
});

Then('response status is {int} or {int} or {int}', async ({}, a: number, b: number, c: number) => {
  expect(world.response, 'response should exist').toBeTruthy();
  expect([a, b, c]).toContain(world.response!.status());
});

Then('response JSON has non-empty field {string}', async ({}, field: string) => {
  expect(world.responseJson, 'response JSON should exist').toBeTruthy();
  const value = world.responseJson![field];
  expect(value, `expected non-empty field "${field}"`).toBeTruthy();
  expect(String(value).length).toBeGreaterThan(0);
});

Then(
  'response JSON field {string} equals the prepared request field {string}',
  async ({}, responseField: string, requestField: string) => {
    expect(world.body, 'request body should exist').toBeTruthy();
    expect(world.responseJson, 'response JSON should exist').toBeTruthy();
    expect(world.responseJson![responseField]).toBe(world.body![requestField]);
  },
);
