import { When } from '../support/fixtures';
import { env } from '../../utils/env.helper';

When('the citizen logs in with valid credentials', async ({ page, authLoginPage }) => {
  await page.waitForURL(/auth.*Login/, { timeout: 30_000 });
  await authLoginPage.completeLoginFlow(
    env.tenant.name,
    env.credentials.citizen.username,
    env.credentials.citizen.password
  );
});

